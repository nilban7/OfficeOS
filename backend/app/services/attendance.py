import logging
import uuid
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.attendance import AttendanceRecord
from app.models.employee import Employee
from app.models.identity import Branch, MembershipRole, OrganizationMembership, Profile, Role
from app.models.notification import Notification
from app.schemas.attendance import (
    AttendanceCheckInRequest,
    AttendanceCheckOutRequest,
    AttendanceCreate,
    AttendanceDetailResponse,
    AttendanceListItemResponse,
    AttendanceSummaryResponse,
    AttendanceUpdate,
    BranchBrief,
    EmployeeBrief,
)
from app.schemas.common import PaginatedData, PaginationMeta
from app.services.organization import record_audit_log

logger = logging.getLogger(__name__)


async def _notify_profiles(
    session: AsyncSession,
    organization_id: UUID,
    recipient_profile_ids: list[UUID],
    title: str,
    message: str,
    action_url: str = "/attendance",
    metadata: dict[str, Any] | None = None,
) -> None:
    now = datetime.now(UTC)
    for profile_id in set(recipient_profile_ids):
        try:
            notif = Notification(
                id=uuid.uuid4(),
                organization_id=organization_id,
                recipient_id=profile_id,
                notification_type="attendance",
                title=title,
                message=message,
                action_url=action_url,
                metadata_json=metadata or {},
                created_at=now,
                updated_at=now,
            )
            session.add(notif)
        except Exception as e:  # noqa: BLE001
            logger.warning("Failed to dispatch attendance notification to %s: %s", profile_id, e)




def _to_list(result: Any) -> list[Any]:
    if result is None:
        return []
    if isinstance(result, list):
        return result
    if hasattr(result, "all"):
        return list(result.all())
    return list(result)


async def _get_profile_ids_by_roles(
    session: AsyncSession,
    organization_id: UUID,
    role_names: list[str],
) -> list[UUID]:
    query = (
        select(OrganizationMembership.profile_id)
        .join(MembershipRole, MembershipRole.membership_id == OrganizationMembership.id)
        .join(Role, Role.id == MembershipRole.role_id)
        .where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.status == "active",
            Role.name.in_(role_names),
        )
        .distinct()
    )
    res = await session.scalars(query)
    return _to_list(res)



async def resolve_employee_for_user(
    session: AsyncSession,
    organization_id: UUID,
    auth_user_id: UUID,
) -> Employee | None:
    query = (
        select(Employee)
        .join(Profile, Profile.id == Employee.profile_id)
        .where(
            Profile.auth_user_id == auth_user_id,
            Employee.organization_id == organization_id,
        )
    )
    emp = await session.scalar(query)
    if emp is not None:
        return emp

    # Fallback: check membership link
    fallback_query = (
        select(Employee)
        .join(OrganizationMembership, OrganizationMembership.id == Employee.membership_id)
        .join(Profile, Profile.id == OrganizationMembership.profile_id)
        .where(
            Profile.auth_user_id == auth_user_id,
            Employee.organization_id == organization_id,
        )
    )
    emp = await session.scalar(fallback_query)
    if emp is not None:
        return emp

    # Fallback 2: match by email with active user Profile
    user_profile = await session.scalar(select(Profile).where(Profile.auth_user_id == auth_user_id))
    if user_profile and user_profile.email:
        clean_email = user_profile.email.strip().lower()
        email_query = (
            select(Employee)
            .where(
                Employee.organization_id == organization_id,
                or_(
                    func.lower(Employee.work_email) == clean_email,
                    func.lower(Employee.personal_email) == clean_email,
                ),
            )
        )
        email_emp = await session.scalar(email_query)
        if email_emp is not None:
            if email_emp.profile_id is None:
                email_emp.profile_id = user_profile.id
                await session.flush()
            return email_emp

    return None


def _to_detail_response(rec: AttendanceRecord) -> AttendanceDetailResponse:
    emp_brief = None
    if rec.employee:
        dept_name = rec.employee.department.name if rec.employee.department else None
        branch_name = rec.employee.branch.name if rec.employee.branch else None
        emp_brief = EmployeeBrief(
            id=rec.employee.id,
            employee_code=rec.employee.employee_code,
            first_name=rec.employee.first_name,
            last_name=rec.employee.last_name,
            designation=rec.employee.designation,
            department_name=dept_name,
            branch_name=branch_name,
        )

    branch_brief = None
    if rec.branch:
        branch_brief = BranchBrief(
            id=rec.branch.id,
            name=rec.branch.name,
            code=rec.branch.code,
        )

    return AttendanceDetailResponse(
        id=rec.id,
        organization_id=rec.organization_id,
        employee_id=rec.employee_id,
        employee=emp_brief,
        branch_id=rec.branch_id,
        branch=branch_brief,
        work_date=rec.work_date,
        check_in_at=rec.check_in_at,
        check_out_at=rec.check_out_at,
        status=rec.status,
        notes=rec.notes,
        latitude=rec.latitude,
        longitude=rec.longitude,
        location_name=rec.location_name,
        location_accuracy=rec.location_accuracy,
        verification_method=rec.verification_method or "web",
        check_out_latitude=rec.check_out_latitude,
        check_out_longitude=rec.check_out_longitude,
        check_out_location_name=rec.check_out_location_name,
        device_info=rec.device_info,
        is_offsite=rec.is_offsite if rec.is_offsite is not None else False,
        offsite_reason=rec.offsite_reason,
        offsite_location=rec.offsite_location,
        client_name=rec.client_name,
        approval_status=rec.approval_status or "not_required",
        hr_approved_at=rec.hr_approved_at,
        hr_approved_by_id=rec.hr_approved_by_id,
        hr_rejection_reason=rec.hr_rejection_reason,
        org_head_approved_at=rec.org_head_approved_at,
        org_head_approved_by_id=rec.org_head_approved_by_id,
        org_head_rejection_reason=rec.org_head_rejection_reason,
        created_at=rec.created_at or datetime.now(UTC),
        updated_at=rec.updated_at or datetime.now(UTC),
    )



async def list_attendance(
    session: AsyncSession,
    organization_id: UUID,
    employee_id: UUID | None = None,
    department_id: UUID | None = None,
    branch_id: UUID | None = None,
    status_filter: str | None = None,
    verification_method: str | None = None,
    is_offsite: bool | None = None,
    approval_status: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "work_date",
    sort_order: str = "desc",
) -> PaginatedData[AttendanceListItemResponse]:
    page = max(1, page)
    if page_size not in (10, 20, 50, 100):
        page_size = 20

    base_filter = [AttendanceRecord.organization_id == organization_id]

    if employee_id is not None:
        base_filter.append(AttendanceRecord.employee_id == employee_id)

    if branch_id is not None:
        base_filter.append(AttendanceRecord.branch_id == branch_id)

    if status_filter:
        base_filter.append(AttendanceRecord.status == status_filter)

    if verification_method:
        base_filter.append(AttendanceRecord.verification_method == verification_method)

    if is_offsite is not None:
        base_filter.append(AttendanceRecord.is_offsite == is_offsite)

    if approval_status is not None:
        base_filter.append(AttendanceRecord.approval_status == approval_status)


    if start_date is not None:
        base_filter.append(AttendanceRecord.work_date >= start_date)

    if end_date is not None:
        base_filter.append(AttendanceRecord.work_date <= end_date)

    # If department_id or search is requested, we need to join Employee
    needs_emp_join = department_id is not None or bool(search)

    count_query = select(func.count(AttendanceRecord.id))
    if needs_emp_join:
        count_query = count_query.join(Employee, Employee.id == AttendanceRecord.employee_id)
        if department_id is not None:
            base_filter.append(Employee.department_id == department_id)
        if search:
            search_pattern = f"%{search.strip()}%"
            base_filter.append(
                or_(
                    Employee.first_name.ilike(search_pattern),
                    Employee.last_name.ilike(search_pattern),
                    Employee.employee_code.ilike(search_pattern),
                    AttendanceRecord.notes.ilike(search_pattern),
                )
            )

    count_query = count_query.where(*base_filter)
    total_count = await session.scalar(count_query) or 0

    # Sorting
    sort_desc = sort_order.lower() == "desc"
    if sort_by == "employee_name":
        order_expr = (
            [Employee.first_name.desc(), Employee.last_name.desc()]
            if sort_desc
            else [Employee.first_name.asc(), Employee.last_name.asc()]
        )
    elif sort_by == "created_at":
        order_expr = [AttendanceRecord.created_at.desc() if sort_desc else AttendanceRecord.created_at.asc()]
    else:  # work_date
        order_expr = (
            [AttendanceRecord.work_date.desc(), AttendanceRecord.created_at.desc()]
            if sort_desc
            else [AttendanceRecord.work_date.asc(), AttendanceRecord.created_at.asc()]
        )

    offset = (page - 1) * page_size
    query = (
        select(AttendanceRecord)
        .options(
            selectinload(AttendanceRecord.employee).selectinload(Employee.department),
            selectinload(AttendanceRecord.employee).selectinload(Employee.branch),
            selectinload(AttendanceRecord.branch),
        )
    )
    if sort_by == "employee_name" or needs_emp_join:
        query = query.join(Employee, Employee.id == AttendanceRecord.employee_id)

    query = query.where(*base_filter).order_by(*order_expr).offset(offset).limit(page_size)

    result = await session.scalars(query)
    records = _to_list(result)

    total_pages = max(1, (total_count + page_size - 1) // page_size) if total_count > 0 else 1

    return PaginatedData(
        items=[_to_detail_response(r) for r in records],
        meta=PaginationMeta(
            total=total_count,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        ),
    )


async def get_attendance(
    session: AsyncSession,
    organization_id: UUID,
    attendance_id: UUID,
) -> AttendanceDetailResponse:
    query = (
        select(AttendanceRecord)
        .options(
            selectinload(AttendanceRecord.employee).selectinload(Employee.department),
            selectinload(AttendanceRecord.employee).selectinload(Employee.branch),
            selectinload(AttendanceRecord.branch),
        )
        .where(
            AttendanceRecord.id == attendance_id,
            AttendanceRecord.organization_id == organization_id,
        )
    )
    rec = await session.scalar(query)
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attendance record '{attendance_id}' not found in this organization",
        )
    return _to_detail_response(rec)


async def get_today_summary(
    session: AsyncSession,
    organization_id: UUID,
    target_date: date | None = None,
) -> AttendanceSummaryResponse:
    calc_date = target_date or datetime.now(UTC).date()

    # Total active employees
    active_emp_count = (
        await session.scalar(
            select(func.count(Employee.id)).where(
                Employee.organization_id == organization_id,
                Employee.is_active.is_(True),
                Employee.status != "terminated",
            )
        )
        or 0
    )

    # Attendance counts for target date
    status_query = (
        select(AttendanceRecord.status, func.count(AttendanceRecord.id))
        .where(
            AttendanceRecord.organization_id == organization_id,
            AttendanceRecord.work_date == calc_date,
        )
        .group_by(AttendanceRecord.status)
    )
    res = await session.execute(status_query)
    status_counts = dict(_to_list(res))

    present_count = status_counts.get("present", 0)
    late_count = status_counts.get("late", 0)
    half_day_count = status_counts.get("half_day", 0)
    absent_count = status_counts.get("absent", 0)
    on_leave_count = status_counts.get("on_leave", 0)
    marked_count = sum(status_counts.values())

    return AttendanceSummaryResponse(
        date=calc_date,
        total_active_employees=active_emp_count,
        present_count=present_count,
        late_count=late_count,
        half_day_count=half_day_count,
        absent_count=absent_count,
        on_leave_count=on_leave_count,
        marked_count=marked_count,
    )


async def get_user_today_attendance(
    session: AsyncSession,
    organization_id: UUID,
    auth_user_id: UUID,
    target_date: date | None = None,
) -> AttendanceDetailResponse | None:
    calc_date = target_date or datetime.now(UTC).date()
    emp = await resolve_employee_for_user(session, organization_id, auth_user_id)
    if emp is None:
        return None

    query = (
        select(AttendanceRecord)
        .options(
            selectinload(AttendanceRecord.employee).selectinload(Employee.department),
            selectinload(AttendanceRecord.employee).selectinload(Employee.branch),
            selectinload(AttendanceRecord.branch),
        )
        .where(
            AttendanceRecord.organization_id == organization_id,
            AttendanceRecord.employee_id == emp.id,
            AttendanceRecord.work_date == calc_date,
        )
    )
    rec = await session.scalar(query)
    if rec is None:
        return None
    return _to_detail_response(rec)


async def check_in_employee(
    session: AsyncSession,
    organization_id: UUID,
    data: AttendanceCheckInRequest,
    actor_auth_user_id: UUID,
    actor_profile_id: UUID | None,
    is_admin_or_manager: bool,
    ip_address: str | None = None,
) -> AttendanceDetailResponse:
    calc_date = data.work_date or datetime.now(UTC).date()

    target_emp: Employee | None = None
    if data.employee_id is not None:
        target_emp = await session.scalar(
            select(Employee)
            .options(
                selectinload(Employee.department),
                selectinload(Employee.branch),
            )
            .where(
                Employee.id == data.employee_id,
                Employee.organization_id == organization_id,
            )
        )
        if target_emp is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Employee not found in this organization",
            )
        # If user is not admin/manager, verify they are checking in for themselves
        if not is_admin_or_manager:
            user_emp = await resolve_employee_for_user(session, organization_id, actor_auth_user_id)
            if user_emp is None or user_emp.id != data.employee_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not authorized to check in on behalf of another employee",
                )
    else:
        # Resolve user's linked employee
        target_emp = await resolve_employee_for_user(session, organization_id, actor_auth_user_id)
        if target_emp is None:
            if is_admin_or_manager:
                user_profile = await session.scalar(select(Profile).where(Profile.auth_user_id == actor_auth_user_id))
                if user_profile:
                    first_name = user_profile.first_name or "Admin"
                    last_name = user_profile.last_name or "User"
                    emp_code = f"EMP-{uuid.uuid4().hex[:6].upper()}"
                    new_emp = Employee(
                        id=uuid.uuid4(),
                        organization_id=organization_id,
                        profile_id=user_profile.id,
                        employee_code=emp_code,
                        first_name=first_name,
                        last_name=last_name,
                        designation="Administrator",
                        employment_type="full_time",
                        status="active",
                        date_of_joining=datetime.now(UTC).date(),
                        work_email=user_profile.email,
                        is_active=True,
                    )
                    session.add(new_emp)
                    await session.flush()
                    target_emp = new_emp

            if target_emp is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No employee record is linked to your user account in this organization. Please ask HR or an administrator to link an employee record for your account.",
                )

    if not target_emp.is_active or target_emp.status == "terminated":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot record attendance for an inactive or terminated employee",
        )

    # Check duplicate
    existing = await session.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.organization_id == organization_id,
            AttendanceRecord.employee_id == target_emp.id,
            AttendanceRecord.work_date == calc_date,
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Attendance record already exists for {target_emp.first_name} {target_emp.last_name} on {calc_date}",
        )

    # Validate branch
    branch_id = data.branch_id or target_emp.branch_id
    if branch_id is not None:
        branch_exists = await session.scalar(
            select(Branch).where(Branch.id == branch_id, Branch.organization_id == organization_id)
        )
        if branch_exists is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Branch not found in this organization",
            )

    check_in_time = data.check_in_at or datetime.now(UTC)
    now = datetime.now(UTC)

    is_offsite = bool(data.is_offsite)
    approval_status = "pending_hr" if is_offsite else "not_required"

    rec = AttendanceRecord(
        id=uuid.uuid4(),
        organization_id=organization_id,
        employee_id=target_emp.id,
        branch_id=branch_id,
        work_date=calc_date,
        check_in_at=check_in_time,
        check_out_at=None,
        status="present",
        notes=data.notes.strip() if data.notes else None,
        latitude=data.latitude,
        longitude=data.longitude,
        location_name=data.location_name.strip() if data.location_name else None,
        location_accuracy=data.location_accuracy,
        verification_method=data.verification_method or "web",
        device_info=data.device_info.strip() if data.device_info else None,
        is_offsite=is_offsite,
        offsite_reason=data.offsite_reason.strip() if data.offsite_reason else None,
        offsite_location=data.offsite_location.strip() if data.offsite_location else None,
        client_name=data.client_name.strip() if data.client_name else None,
        approval_status=approval_status,
        created_at=now,
        updated_at=now,
    )
    session.add(rec)
    await session.flush()

    if is_offsite:
        hr_recipients = await _get_profile_ids_by_roles(session, organization_id, ["hr_manager"])
        if not hr_recipients:
            hr_recipients = await _get_profile_ids_by_roles(
                session, organization_id, ["organization_owner", "organization_admin"]
            )
        if hr_recipients:
            emp_name = f"{target_emp.first_name} {target_emp.last_name}".strip()
            loc_label = data.offsite_location or data.location_name or "External Location"
            purpose_label = data.offsite_reason or (f"Meeting with {data.client_name}" if data.client_name else "Client Visit / Field Work")
            await _notify_profiles(
                session=session,
                organization_id=organization_id,
                recipient_profile_ids=hr_recipients,
                title=f"Offsite Attendance: {emp_name}",
                message=f"{emp_name} checked in offsite at {loc_label} for {purpose_label}. HR approval required.",
                action_url="/attendance",
                metadata={"attendance_id": str(rec.id), "employee_id": str(target_emp.id)},
            )

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_profile_id,
        action="attendance.check_in",
        entity_type="attendance",
        entity_id=rec.id,
        details={
            "employee_id": str(target_emp.id),
            "employee_code": target_emp.employee_code,
            "work_date": str(calc_date),
            "check_in_at": rec.check_in_at.isoformat() if rec.check_in_at else None,
            "status": rec.status,
            "verification_method": rec.verification_method,
            "location_name": rec.location_name,
            "is_offsite": rec.is_offsite,
            "offsite_reason": rec.offsite_reason,
            "offsite_location": rec.offsite_location,
            "client_name": rec.client_name,
            "approval_status": rec.approval_status,
        },
        ip_address=ip_address,
    )

    return await get_attendance(session, organization_id, rec.id)



async def check_out_employee(
    session: AsyncSession,
    organization_id: UUID,
    attendance_id: UUID,
    data: AttendanceCheckOutRequest,
    actor_auth_user_id: UUID,
    actor_profile_id: UUID | None,
    is_admin_or_manager: bool,
    ip_address: str | None = None,
) -> AttendanceDetailResponse:
    rec = await session.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.id == attendance_id,
            AttendanceRecord.organization_id == organization_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attendance record '{attendance_id}' not found in this organization",
        )

    if not is_admin_or_manager:
        user_emp = await resolve_employee_for_user(session, organization_id, actor_auth_user_id)
        if user_emp is None or user_emp.id != rec.employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to check out for another employee",
            )

    check_out_time = data.check_out_at or datetime.now(UTC)
    if rec.check_in_at and check_out_time < rec.check_in_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="check_out_at cannot be earlier than check_in_at",
        )

    rec.check_out_at = check_out_time
    if data.latitude is not None:
        rec.check_out_latitude = data.latitude
    if data.longitude is not None:
        rec.check_out_longitude = data.longitude
    if data.location_name:
        rec.check_out_location_name = data.location_name.strip()
    if data.notes:
        if rec.notes:
            rec.notes = f"{rec.notes}\n{data.notes.strip()}"
        else:
            rec.notes = data.notes.strip()
    rec.updated_at = datetime.now(UTC)

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_profile_id,
        action="attendance.check_out",
        entity_type="attendance",
        entity_id=rec.id,
        details={
            "employee_id": str(rec.employee_id),
            "work_date": str(rec.work_date),
            "check_out_at": rec.check_out_at.isoformat() if rec.check_out_at else None,
            "check_out_location_name": rec.check_out_location_name,
        },
        ip_address=ip_address,
    )

    return await get_attendance(session, organization_id, rec.id)


async def create_attendance(
    session: AsyncSession,
    organization_id: UUID,
    data: AttendanceCreate,
    actor_profile_id: UUID | None,
    ip_address: str | None = None,
) -> AttendanceDetailResponse:
    target_emp = await session.scalar(
        select(Employee).where(
            Employee.id == data.employee_id,
            Employee.organization_id == organization_id,
        )
    )
    if target_emp is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Employee not found in this organization",
        )

    if not target_emp.is_active or target_emp.status == "terminated":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot record attendance for an inactive or terminated employee",
        )

    # Check duplicate
    existing = await session.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.organization_id == organization_id,
            AttendanceRecord.employee_id == data.employee_id,
            AttendanceRecord.work_date == data.work_date,
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Attendance record already exists for {target_emp.first_name} {target_emp.last_name} on {data.work_date}",
        )

    # Validate branch
    branch_id = data.branch_id or target_emp.branch_id
    if branch_id is not None:
        branch_exists = await session.scalar(
            select(Branch).where(Branch.id == branch_id, Branch.organization_id == organization_id)
        )
        if branch_exists is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Branch not found in this organization",
            )

    now = datetime.now(UTC)
    is_offsite = bool(data.is_offsite)
    approval_status = data.approval_status if data.approval_status != "not_required" else ("pending_hr" if is_offsite else "not_required")

    rec = AttendanceRecord(
        id=uuid.uuid4(),
        organization_id=organization_id,
        employee_id=data.employee_id,
        branch_id=branch_id,
        work_date=data.work_date,
        check_in_at=data.check_in_at,
        check_out_at=data.check_out_at,
        status=data.status,
        notes=data.notes.strip() if data.notes else None,
        latitude=data.latitude,
        longitude=data.longitude,
        location_name=data.location_name.strip() if data.location_name else None,
        location_accuracy=data.location_accuracy,
        verification_method=data.verification_method or "manual",
        check_out_latitude=data.check_out_latitude,
        check_out_longitude=data.check_out_longitude,
        check_out_location_name=data.check_out_location_name.strip() if data.check_out_location_name else None,
        device_info=data.device_info.strip() if data.device_info else None,
        is_offsite=is_offsite,
        offsite_reason=data.offsite_reason.strip() if data.offsite_reason else None,
        offsite_location=data.offsite_location.strip() if data.offsite_location else None,
        client_name=data.client_name.strip() if data.client_name else None,
        approval_status=approval_status,
        created_at=now,
        updated_at=now,
    )
    session.add(rec)
    await session.flush()


    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_profile_id,
        action="attendance.create",
        entity_type="attendance",
        entity_id=rec.id,
        details={
            "employee_id": str(target_emp.id),
            "employee_code": target_emp.employee_code,
            "work_date": str(data.work_date),
            "status": rec.status,
            "check_in_at": rec.check_in_at.isoformat() if rec.check_in_at else None,
            "check_out_at": rec.check_out_at.isoformat() if rec.check_out_at else None,
        },
        ip_address=ip_address,
    )

    return await get_attendance(session, organization_id, rec.id)


async def update_attendance(
    session: AsyncSession,
    organization_id: UUID,
    attendance_id: UUID,
    data: AttendanceUpdate,
    actor_profile_id: UUID | None,
    ip_address: str | None = None,
) -> AttendanceDetailResponse:
    rec = await session.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.id == attendance_id,
            AttendanceRecord.organization_id == organization_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attendance record '{attendance_id}' not found in this organization",
        )

    changes: dict[str, Any] = {}

    if data.work_date is not None and data.work_date != rec.work_date:
        conflict = await session.scalar(
            select(AttendanceRecord).where(
                AttendanceRecord.organization_id == organization_id,
                AttendanceRecord.employee_id == rec.employee_id,
                AttendanceRecord.work_date == data.work_date,
                AttendanceRecord.id != attendance_id,
            )
        )
        if conflict is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Another attendance record already exists for this employee on {data.work_date}",
            )
        changes["work_date"] = {"from": str(rec.work_date), "to": str(data.work_date)}
        rec.work_date = data.work_date

    if data.status is not None and data.status != rec.status:
        changes["status"] = {"from": rec.status, "to": data.status}
        rec.status = data.status

    if "check_in_at" in data.model_fields_set and data.check_in_at != rec.check_in_at:
        changes["check_in_at"] = {
            "from": rec.check_in_at.isoformat() if rec.check_in_at else None,
            "to": data.check_in_at.isoformat() if data.check_in_at else None,
        }
        rec.check_in_at = data.check_in_at

    if "check_out_at" in data.model_fields_set and data.check_out_at != rec.check_out_at:
        changes["check_out_at"] = {
            "from": rec.check_out_at.isoformat() if rec.check_out_at else None,
            "to": data.check_out_at.isoformat() if data.check_out_at else None,
        }
        rec.check_out_at = data.check_out_at

    if rec.check_in_at and rec.check_out_at and rec.check_out_at < rec.check_in_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="check_out_at cannot be earlier than check_in_at",
        )

    if "branch_id" in data.model_fields_set and data.branch_id != rec.branch_id:
        if data.branch_id is not None:
            branch_exists = await session.scalar(
                select(Branch).where(Branch.id == data.branch_id, Branch.organization_id == organization_id)
            )
            if branch_exists is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Branch not found in this organization",
                )
        changes["branch_id"] = {
            "from": str(rec.branch_id) if rec.branch_id else None,
            "to": str(data.branch_id) if data.branch_id else None,
        }
        rec.branch_id = data.branch_id

    if "notes" in data.model_fields_set and data.notes != rec.notes:
        changes["notes"] = {"from": rec.notes, "to": data.notes}
        rec.notes = data.notes

    if "latitude" in data.model_fields_set and data.latitude != rec.latitude:
        rec.latitude = data.latitude
    if "longitude" in data.model_fields_set and data.longitude != rec.longitude:
        rec.longitude = data.longitude
    if "location_name" in data.model_fields_set and data.location_name != rec.location_name:
        rec.location_name = data.location_name
    if "location_accuracy" in data.model_fields_set and data.location_accuracy != rec.location_accuracy:
        rec.location_accuracy = data.location_accuracy
    if "verification_method" in data.model_fields_set and data.verification_method != rec.verification_method:
        rec.verification_method = data.verification_method or rec.verification_method
    if "check_out_latitude" in data.model_fields_set and data.check_out_latitude != rec.check_out_latitude:
        rec.check_out_latitude = data.check_out_latitude
    if "check_out_longitude" in data.model_fields_set and data.check_out_longitude != rec.check_out_longitude:
        rec.check_out_longitude = data.check_out_longitude
    if "check_out_location_name" in data.model_fields_set and data.check_out_location_name != rec.check_out_location_name:
        rec.check_out_location_name = data.check_out_location_name
    if "device_info" in data.model_fields_set and data.device_info != rec.device_info:
        rec.device_info = data.device_info
    if "is_offsite" in data.model_fields_set and data.is_offsite is not None:
        rec.is_offsite = data.is_offsite
    if "offsite_reason" in data.model_fields_set:
        rec.offsite_reason = data.offsite_reason
    if "offsite_location" in data.model_fields_set:
        rec.offsite_location = data.offsite_location
    if "client_name" in data.model_fields_set:
        rec.client_name = data.client_name
    if "approval_status" in data.model_fields_set and data.approval_status is not None:
        rec.approval_status = data.approval_status

    rec.updated_at = datetime.now(UTC)

    if changes:
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_profile_id,
            action="attendance.update",
            entity_type="attendance",
            entity_id=rec.id,
            details=changes,
            ip_address=ip_address,
        )

    return await get_attendance(session, organization_id, rec.id)


async def delete_attendance(
    session: AsyncSession,
    organization_id: UUID,
    attendance_id: UUID,
    actor_profile_id: UUID | None,
    ip_address: str | None = None,
) -> None:
    rec = await session.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.id == attendance_id,
            AttendanceRecord.organization_id == organization_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attendance record '{attendance_id}' not found in this organization",
        )

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_profile_id,
        action="attendance.delete",
        entity_type="attendance",
        entity_id=rec.id,
        details={
            "employee_id": str(rec.employee_id),
            "work_date": str(rec.work_date),
            "status": rec.status,
        },
        ip_address=ip_address,
    )

    await session.delete(rec)


async def hr_review_attendance(
    session: AsyncSession,
    organization_id: UUID,
    attendance_id: UUID,
    action: str,  # "approve" | "reject"
    rejection_reason: str | None,
    actor_profile_id: UUID | None,
    ip_address: str | None = None,
) -> AttendanceDetailResponse:
    rec = await session.scalar(
        select(AttendanceRecord)
        .options(
            selectinload(AttendanceRecord.employee).selectinload(Employee.department),
            selectinload(AttendanceRecord.employee).selectinload(Employee.branch),
            selectinload(AttendanceRecord.branch),
        )
        .where(
            AttendanceRecord.id == attendance_id,
            AttendanceRecord.organization_id == organization_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attendance record '{attendance_id}' not found in this organization",
        )

    if not rec.is_offsite:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only offsite attendance records require approval review",
        )

    if rec.approval_status != "pending_hr":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Attendance record cannot be reviewed by HR because its status is '{rec.approval_status}'",
        )

    now = datetime.now(UTC)
    emp_name = f"{rec.employee.first_name} {rec.employee.last_name}".strip() if rec.employee else "Employee"
    emp_profile_id = rec.employee.profile_id if rec.employee else None

    if action == "approve":
        rec.approval_status = "approved"
        rec.hr_approved_at = now
        rec.hr_approved_by_id = actor_profile_id
        rec.updated_at = now
        await session.flush()

        if emp_profile_id:
            await _notify_profiles(
                session=session,
                organization_id=organization_id,
                recipient_profile_ids=[emp_profile_id],
                title="Offsite Attendance Approved",
                message=f"Your offsite attendance check-in for {rec.work_date} has been approved by HR.",
                action_url="/attendance",
                metadata={"attendance_id": str(rec.id), "status": "approved"},
            )

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_profile_id,
            action="attendance.hr_approved",
            entity_type="attendance",
            entity_id=rec.id,
            details={"action": "approve", "work_date": str(rec.work_date)},
            ip_address=ip_address,
        )

    elif action == "reject":
        reason_text = (rejection_reason or "").strip() or "Rejected by HR, pending Organization Head review"
        rec.approval_status = "pending_org_head"
        rec.hr_rejection_reason = reason_text
        rec.hr_approved_at = now
        rec.hr_approved_by_id = actor_profile_id
        rec.updated_at = now
        await session.flush()

        # Notify Org Head / Owner / Admin
        org_heads = await _get_profile_ids_by_roles(
            session, organization_id, ["organization_owner", "organization_admin", "system_admin"]
        )
        if org_heads:
            await _notify_profiles(
                session=session,
                organization_id=organization_id,
                recipient_profile_ids=org_heads,
                title=f"Review Required: HR Rejected Offsite Attendance ({emp_name})",
                message=f"HR rejected offsite attendance for {emp_name} on {rec.work_date}. Reason: {reason_text}. Organization Head final review required.",
                action_url="/attendance",
                metadata={"attendance_id": str(rec.id), "status": "pending_org_head", "reason": reason_text},
            )

        if emp_profile_id:
            await _notify_profiles(
                session=session,
                organization_id=organization_id,
                recipient_profile_ids=[emp_profile_id],
                title="Offsite Attendance Escalated to Org Head",
                message=f"Your offsite attendance check-in for {rec.work_date} was rejected by HR and escalated to Organization Head for review.",
                action_url="/attendance",
                metadata={"attendance_id": str(rec.id), "status": "pending_org_head"},
            )

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_profile_id,
            action="attendance.hr_rejected_escalated",
            entity_type="attendance",
            entity_id=rec.id,
            details={"action": "reject", "rejection_reason": reason_text, "work_date": str(rec.work_date)},
            ip_address=ip_address,
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid action. Must be 'approve' or 'reject'.",
        )

    return await get_attendance(session, organization_id, rec.id)


async def org_head_review_attendance(
    session: AsyncSession,
    organization_id: UUID,
    attendance_id: UUID,
    action: str,  # "confirm_reject" | "override_approve"
    reason: str | None,
    actor_profile_id: UUID | None,
    ip_address: str | None = None,
) -> AttendanceDetailResponse:
    rec = await session.scalar(
        select(AttendanceRecord)
        .options(
            selectinload(AttendanceRecord.employee).selectinload(Employee.department),
            selectinload(AttendanceRecord.employee).selectinload(Employee.branch),
            selectinload(AttendanceRecord.branch),
        )
        .where(
            AttendanceRecord.id == attendance_id,
            AttendanceRecord.organization_id == organization_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attendance record '{attendance_id}' not found in this organization",
        )

    if not rec.is_offsite:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only offsite attendance records require approval review",
        )

    if rec.approval_status != "pending_org_head":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Attendance record is not awaiting Organization Head review (current status: '{rec.approval_status}')",
        )

    now = datetime.now(UTC)
    emp_profile_id = rec.employee.profile_id if rec.employee else None
    reason_text = (reason or "").strip() or None

    if action == "confirm_reject":
        rec.approval_status = "rejected"
        rec.org_head_rejection_reason = reason_text or "Confirmed by Organization Head"
        rec.org_head_approved_at = now
        rec.org_head_approved_by_id = actor_profile_id
        rec.updated_at = now
        await session.flush()

        if emp_profile_id:
            await _notify_profiles(
                session=session,
                organization_id=organization_id,
                recipient_profile_ids=[emp_profile_id],
                title="Offsite Attendance Rejected",
                message=f"Your offsite attendance check-in for {rec.work_date} was rejected following Organization Head review.",
                action_url="/attendance",
                metadata={"attendance_id": str(rec.id), "status": "rejected"},
            )

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_profile_id,
            action="attendance.org_head_rejected",
            entity_type="attendance",
            entity_id=rec.id,
            details={"action": "confirm_reject", "reason": reason_text, "work_date": str(rec.work_date)},
            ip_address=ip_address,
        )

    elif action == "override_approve":
        rec.approval_status = "approved"
        rec.org_head_approved_at = now
        rec.org_head_approved_by_id = actor_profile_id
        rec.updated_at = now
        await session.flush()

        if emp_profile_id:
            await _notify_profiles(
                session=session,
                organization_id=organization_id,
                recipient_profile_ids=[emp_profile_id],
                title="Offsite Attendance Approved (Org Head Override)",
                message=f"Your offsite attendance check-in for {rec.work_date} was approved by Organization Head.",
                action_url="/attendance",
                metadata={"attendance_id": str(rec.id), "status": "approved"},
            )

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_profile_id,
            action="attendance.org_head_override_approved",
            entity_type="attendance",
            entity_id=rec.id,
            details={"action": "override_approve", "reason": reason_text, "work_date": str(rec.work_date)},
            ip_address=ip_address,
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid action. Must be 'confirm_reject' or 'override_approve'.",
        )

    return await get_attendance(session, organization_id, rec.id)

