"""Leave Management and OfficeOS Email Notification Orchestration Service.

Connects the domain workflows (Leave submission, approval, rejection) with the
underlying EmailService outbox queue and Jinja2 email templates.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.models.employee import Department, Employee
from app.models.identity import Profile
from app.models.leave import LeaveRequest, LeaveType
from app.services.email_service import EmailService

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.models.email import EmailOutbox

logger = logging.getLogger("officeos.notifications")


class LeaveNotificationService:
    """Orchestrates Leave Management email notifications and recipient resolution."""

    @staticmethod
    async def resolve_manager_email(
        session: AsyncSession,
        organization_id: UUID,
        employee: Employee,
    ) -> tuple[str | None, str | None]:
        """Resolve reporting manager email and full name using employee and department relationships.

        Returns (manager_email: str | None, manager_name: str | None).
        """
        manager: Employee | None = None

        # 1. Check direct reporting manager
        if employee.reporting_manager_id:
            manager = await session.scalar(
                select(Employee)
                .options(selectinload(Employee.profile))
                .where(
                    Employee.id == employee.reporting_manager_id,
                    Employee.organization_id == organization_id,
                )
            )

        # 2. Fallback to department manager if direct reporting manager is not set
        if manager is None and employee.department_id:
            dept = await session.scalar(
                select(Department).where(
                    Department.id == employee.department_id,
                    Department.organization_id == organization_id,
                )
            )
            if dept and dept.manager_id and dept.manager_id != employee.id:
                manager = await session.scalar(
                    select(Employee)
                    .options(selectinload(Employee.profile))
                    .where(
                        Employee.id == dept.manager_id,
                        Employee.organization_id == organization_id,
                    )
                )

        if not manager:
            logger.info("No reporting manager or department manager found for employee %s", employee.id)
            return None, None

        manager_name = f"{manager.first_name} {manager.last_name}".strip()

        # Resolve email address: prioritize work_email, then linked profile email, then personal_email
        if manager.work_email and manager.work_email.strip():
            return manager.work_email.strip(), manager_name

        if manager.profile and manager.profile.email and manager.profile.email.strip():
            return manager.profile.email.strip(), manager_name

        if manager.profile_id:
            prof = await session.scalar(select(Profile).where(Profile.id == manager.profile_id))
            if prof and prof.email and prof.email.strip():
                return prof.email.strip(), manager_name

        if manager.personal_email and manager.personal_email.strip():
            return manager.personal_email.strip(), manager_name

        logger.warning("Manager %s identified but no valid email address is registered", manager.id)
        return None, manager_name

    @staticmethod
    async def resolve_employee_email(
        session: AsyncSession,
        employee: Employee,
    ) -> tuple[str | None, str]:
        """Resolve employee email and full name.

        Returns (employee_email: str | None, employee_name: str).
        """
        emp_name = f"{employee.first_name} {employee.last_name}".strip()

        if employee.work_email and employee.work_email.strip():
            return employee.work_email.strip(), emp_name

        if hasattr(employee, "profile") and employee.profile and employee.profile.email:
            return employee.profile.email.strip(), emp_name

        if employee.profile_id:
            prof = await session.scalar(select(Profile).where(Profile.id == employee.profile_id))
            if prof and prof.email and prof.email.strip():
                return prof.email.strip(), emp_name

        if employee.personal_email and employee.personal_email.strip():
            return employee.personal_email.strip(), emp_name

        return None, emp_name

    @staticmethod
    async def send_leave_requested_notification(
        session: AsyncSession,
        organization_id: UUID,
        leave_request: LeaveRequest,
        employee: Employee,
        leave_type: LeaveType,
    ) -> EmailOutbox | None:
        """Enqueue an approval notification email to the reporting manager."""
        try:
            manager_email, manager_name = await LeaveNotificationService.resolve_manager_email(
                session, organization_id, employee
            )
            if not manager_email:
                logger.info(
                    "Skipping leave request notification email for request %s: no manager email resolved.",
                    leave_request.id,
                )
                return None

            settings = get_settings()
            base_url = settings.frontend_base_url.rstrip("/")
            approval_url = f"{base_url}/leave?tab=approvals&request_id={leave_request.id}"

            # Retrieve organization name for branding
            org_name = "OfficeOS Workspace"

            # Retrieve department name if linked
            dept_name = None
            if hasattr(employee, "department") and employee.department:
                dept_name = employee.department.name

            emp_name = f"{employee.first_name} {employee.last_name}".strip()
            subject = f"[OfficeOS] Leave Request Review: {emp_name} ({leave_type.name})"

            context = {
                "subject": subject,
                "organization_name": org_name,
                "manager_name": manager_name or "Manager",
                "employee_name": emp_name,
                "employee_code": employee.employee_code,
                "department_name": dept_name,
                "leave_type": leave_type.name,
                "start_date": str(leave_request.start_date),
                "end_date": str(leave_request.end_date),
                "total_days": str(leave_request.total_days),
                "reason": leave_request.reason,
                "request_id": str(leave_request.id),
                "approval_url": approval_url,
            }

            html_body = EmailService.render_template("leave_request.html", context)
            plain_body = (
                f"Hello {manager_name or 'Manager'},\n\n"
                f"{emp_name} ({employee.employee_code}) has submitted a leave request for {leave_type.name}.\n"
                f"Period: {leave_request.start_date} to {leave_request.end_date} ({leave_request.total_days} days)\n"
                f"Reason: {leave_request.reason or 'Not specified'}\n\n"
                f"Please review and take action in OfficeOS: {approval_url}\n"
            )

            outbox_entry = await EmailService.enqueue_email(
                session=session,
                organization_id=organization_id,
                recipient_email=manager_email,
                recipient_name=manager_name,
                subject=subject,
                html_content=html_body,
                text_content=plain_body,
                email_type="leave_request",
                related_entity_type="leave_request",
                related_entity_id=leave_request.id,
            )
            return outbox_entry

        except Exception:
            logger.exception("Failed to prepare leave request notification email for %s", leave_request.id)
            return None

    @staticmethod
    async def send_leave_approved_notification(
        session: AsyncSession,
        organization_id: UUID,
        leave_request: LeaveRequest,
        employee: Employee,
        leave_type: LeaveType,
        reviewer_name: str | None = None,
    ) -> EmailOutbox | None:
        """Enqueue an approval confirmation email to the employee."""
        try:
            emp_email, emp_name = await LeaveNotificationService.resolve_employee_email(session, employee)
            if not emp_email:
                logger.info("Skipping approval notification email for request %s: employee email not found.", leave_request.id)
                return None

            settings = get_settings()
            base_url = settings.frontend_base_url.rstrip("/")
            leave_url = f"{base_url}/leave"

            org_name = "OfficeOS Workspace"

            subject = f"[OfficeOS] Leave Request Approved: {leave_type.name} ({leave_request.start_date} to {leave_request.end_date})"

            context = {
                "subject": subject,
                "organization_name": org_name,
                "employee_name": emp_name,
                "leave_type": leave_type.name,
                "start_date": str(leave_request.start_date),
                "end_date": str(leave_request.end_date),
                "total_days": str(leave_request.total_days),
                "reviewer_name": reviewer_name,
                "reviewer_comment": leave_request.reviewer_comment,
                "request_id": str(leave_request.id),
                "leave_url": leave_url,
            }

            html_body = EmailService.render_template("leave_approved.html", context)
            plain_body = (
                f"Hello {emp_name},\n\n"
                f"Your leave request for {leave_type.name} ({leave_request.start_date} to {leave_request.end_date}, "
                f"{leave_request.total_days} days) has been APPROVED by {reviewer_name or 'your manager'}.\n\n"
                f"Manager Remarks: {leave_request.reviewer_comment or 'None'}\n"
                f"View your leave portal: {leave_url}\n"
            )

            outbox_entry = await EmailService.enqueue_email(
                session=session,
                organization_id=organization_id,
                recipient_email=emp_email,
                recipient_name=emp_name,
                subject=subject,
                html_content=html_body,
                text_content=plain_body,
                email_type="leave_approved",
                related_entity_type="leave_request",
                related_entity_id=leave_request.id,
            )
            return outbox_entry

        except Exception:
            logger.exception("Failed to prepare leave approval email for %s", leave_request.id)
            return None

    @staticmethod
    async def send_leave_rejected_notification(
        session: AsyncSession,
        organization_id: UUID,
        leave_request: LeaveRequest,
        employee: Employee,
        leave_type: LeaveType,
        reviewer_name: str | None = None,
    ) -> EmailOutbox | None:
        """Enqueue a rejection notification email to the employee."""
        try:
            emp_email, emp_name = await LeaveNotificationService.resolve_employee_email(session, employee)
            if not emp_email:
                logger.info("Skipping rejection notification email for request %s: employee email not found.", leave_request.id)
                return None

            settings = get_settings()
            base_url = settings.frontend_base_url.rstrip("/")
            leave_url = f"{base_url}/leave"

            org_name = "OfficeOS Workspace"

            subject = f"[OfficeOS] Leave Request Update: {leave_type.name} ({leave_request.start_date} to {leave_request.end_date})"

            context = {
                "subject": subject,
                "organization_name": org_name,
                "employee_name": emp_name,
                "leave_type": leave_type.name,
                "start_date": str(leave_request.start_date),
                "end_date": str(leave_request.end_date),
                "total_days": str(leave_request.total_days),
                "reviewer_name": reviewer_name,
                "reviewer_comment": leave_request.reviewer_comment,
                "request_id": str(leave_request.id),
                "leave_url": leave_url,
            }

            html_body = EmailService.render_template("leave_rejected.html", context)
            plain_body = (
                f"Hello {emp_name},\n\n"
                f"Your leave request for {leave_type.name} ({leave_request.start_date} to {leave_request.end_date}) "
                f"could not be approved by {reviewer_name or 'your manager'}.\n\n"
                f"Remarks: {leave_request.reviewer_comment or 'None provided'}\n"
                f"View your leave portal: {leave_url}\n"
            )

            outbox_entry = await EmailService.enqueue_email(
                session=session,
                organization_id=organization_id,
                recipient_email=emp_email,
                recipient_name=emp_name,
                subject=subject,
                html_content=html_body,
                text_content=plain_body,
                email_type="leave_rejected",
                related_entity_type="leave_request",
                related_entity_id=leave_request.id,
            )
            return outbox_entry

        except Exception:
            logger.exception("Failed to prepare leave rejection email for %s", leave_request.id)
            return None
