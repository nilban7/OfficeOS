from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import Date, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import Asset
from app.models.attendance import AttendanceRecord
from app.models.audit import AuditLog
from app.models.client import Client
from app.models.document import Document, DocumentVersion
from app.models.employee import Department, Employee
from app.models.finance import Expense, ExpenseCategory, FinancialTransaction
from app.models.identity import Branch
from app.models.internship import Internship
from app.models.leave import LeaveRequest, LeaveType
from app.models.maintenance import MaintenanceRecord, MaintenanceRequest
from app.models.notification import Notification
from app.models.operation import OperationTask
from app.models.procurement import PurchaseOrder, PurchaseRequest, Vendor
from app.models.project import Project
from app.models.training import TrainingEnrollment, TrainingProgram, TrainingSession
from app.schemas.reports import (
    AssetCategoryDistribution,
    AssetReport,
    AttendanceDayTrend,
    AttendanceReport,
    AuditActionDistribution,
    AuditActivityReport,
    AuditDayActivity,
    AuditEntityDistribution,
    BranchDistribution,
    ClientProjectCount,
    DepartmentDistribution,
    DocumentCategoryDistribution,
    DocumentsReport,
    ExecutiveOverviewReport,
    ExpenseCategoryBreakdown,
    FinanceReport,
    InternshipReport,
    LeaveReport,
    LeaveTypeDistribution,
    MaintenanceReport,
    OperationsReport,
    ProcurementReport,
    ProjectReport,
    ProjectStatusDistribution,
    TaskStatusDistribution,
    TrainingReport,
    WorkforceReport,
)

TWO_PLACES = Decimal("0.01")
ONE_PLACE = Decimal("0.1")


def _round_currency(val: Decimal | None) -> Decimal:
    if val is None:
        return Decimal("0.00")
    return Decimal(val).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def _round_rate(val: Decimal | None) -> Decimal:
    if val is None:
        return Decimal("0.0")
    return Decimal(val).quantize(ONE_PLACE, rounding=ROUND_HALF_UP)


class ReportsService:
    @staticmethod
    def validate_date_range(
        date_from: date | None,
        date_to: date | None,
        max_days: int = 365,
        default_days: int = 30,
    ) -> tuple[date, date]:
        today = datetime.now(UTC).date()
        if date_to is None:
            resolved_to = today
        else:
            resolved_to = date_to

        if date_from is None:
            resolved_from = resolved_to - timedelta(days=default_days)
        else:
            resolved_from = date_from

        if resolved_from > resolved_to:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date range: date_from must be less than or equal to date_to",
            )

        if (resolved_to - resolved_from).days > max_days:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Requested date range exceeds maximum allowed range of {max_days} days",
            )

        return resolved_from, resolved_to

    # ---------------------------------------------------------------------------
    # 1. Executive Overview
    # ---------------------------------------------------------------------------

    @staticmethod
    async def get_overview(
        session: AsyncSession,
        organization_id: UUID,
        auth_profile_id: UUID | None,
        can_view_finance: bool = False,
    ) -> ExecutiveOverviewReport:
        today = datetime.now(UTC).date()

        stmt = select(
            select(func.count(Employee.id)).where(Employee.organization_id == organization_id, Employee.status == "active").scalar_subquery().label("active_emp_count"),
            select(func.count(AttendanceRecord.id)).where(AttendanceRecord.organization_id == organization_id, AttendanceRecord.work_date == today).scalar_subquery().label("total_att_records_today"),
            select(func.count(AttendanceRecord.id)).where(AttendanceRecord.organization_id == organization_id, AttendanceRecord.work_date == today, AttendanceRecord.status == "present").scalar_subquery().label("att_today_count"),
            select(func.count(LeaveRequest.id)).where(LeaveRequest.organization_id == organization_id, LeaveRequest.status == "pending").scalar_subquery().label("pending_leaves"),
            select(func.count(Project.id)).where(Project.organization_id == organization_id, Project.status.in_(["active", "in_progress"])).scalar_subquery().label("active_projects"),
            select(func.count(Client.id)).where(Client.organization_id == organization_id, Client.status == "active").scalar_subquery().label("active_clients"),
            select(func.count(PurchaseRequest.id)).where(PurchaseRequest.organization_id == organization_id, PurchaseRequest.status.in_(["submitted", "pending"])).scalar_subquery().label("pending_purchases"),
            select(func.count(MaintenanceRequest.id)).where(MaintenanceRequest.organization_id == organization_id, MaintenanceRequest.status.in_(["submitted", "in_progress", "scheduled"])).scalar_subquery().label("open_maintenance"),
            select(func.count(OperationTask.id)).where(OperationTask.organization_id == organization_id, OperationTask.status.in_(["open", "in_progress"])).scalar_subquery().label("open_ops_tasks"),
            select(func.count(TrainingSession.id)).where(TrainingSession.organization_id == organization_id, TrainingSession.session_date >= today, TrainingSession.status.in_(["scheduled", "open"])).scalar_subquery().label("upcoming_trainings"),
            select(func.count(Internship.id)).where(Internship.organization_id == organization_id, Internship.status == "active").scalar_subquery().label("active_internships"),
            select(func.count(Document.id)).where(Document.organization_id == organization_id).scalar_subquery().label("doc_count"),
        )
        row = (await session.execute(stmt)).first()

        active_emp_count = row[0] if row and row[0] is not None else 0
        total_att_records_today = row[1] if row and row[1] is not None else 0
        att_today_count = row[2] if row and row[2] is not None else 0
        pending_leaves = row[3] if row and row[3] is not None else 0
        active_projects = row[4] if row and row[4] is not None else 0
        active_clients = row[5] if row and row[5] is not None else 0
        pending_purchases = row[6] if row and row[6] is not None else 0
        open_maintenance = row[7] if row and row[7] is not None else 0
        open_ops_tasks = row[8] if row and row[8] is not None else 0
        upcoming_trainings = row[9] if row and row[9] is not None else 0
        active_internships = row[10] if row and row[10] is not None else 0
        doc_count = row[11] if row and row[11] is not None else 0

        att_rate = Decimal("0.0")
        if active_emp_count > 0:
            att_rate = _round_rate((Decimal(att_today_count) / Decimal(active_emp_count)) * Decimal(100))
        elif total_att_records_today > 0:
            att_rate = _round_rate((Decimal(att_today_count) / Decimal(total_att_records_today)) * Decimal(100))

        # Unread notifications count for current profile
        unread_notifications = 0
        if auth_profile_id is not None:
            unread_notifications = await session.scalar(
                select(func.count(Notification.id)).where(
                    Notification.organization_id == organization_id,
                    Notification.recipient_id == auth_profile_id,
                    Notification.read_at.is_(None),
                )
            ) or 0

        # Finance totals (if authorized)
        total_expenses_mtd: Decimal | None = None
        pending_expenses_count: int | None = None
        if can_view_finance:
            first_of_month = today.replace(day=1)
            fin_row = (
                await session.execute(
                    select(
                        func.coalesce(func.sum(Expense.total_amount), Decimal("0.00")),
                        func.count(Expense.id).filter(Expense.status == "submitted"),
                    ).where(
                        Expense.organization_id == organization_id,
                        Expense.expense_date >= first_of_month,
                    )
                )
            ).first()
            if fin_row:
                total_expenses_mtd = _round_currency(fin_row[0])
                pending_expenses_count = fin_row[1]

        return ExecutiveOverviewReport(
            active_employees_count=active_emp_count,
            attendance_today_count=att_today_count,
            attendance_rate_today=att_rate,
            pending_leaves_count=pending_leaves,
            active_projects_count=active_projects,
            active_clients_count=active_clients,
            pending_purchase_requests_count=pending_purchases,
            open_maintenance_requests_count=open_maintenance,
            open_operations_tasks_count=open_ops_tasks,
            upcoming_training_sessions_count=upcoming_trainings,
            active_internships_count=active_internships,
            documents_count=doc_count,
            unread_notifications_count=unread_notifications,
            finance_metrics_included=can_view_finance,
            total_expenses_mtd=total_expenses_mtd,
            pending_expenses_count=pending_expenses_count,
        )

    # ---------------------------------------------------------------------------
    # 2. Workforce Report
    # ---------------------------------------------------------------------------

    @staticmethod
    async def get_workforce_report(session: AsyncSession, organization_id: UUID) -> WorkforceReport:
        status_stmt = select(
            func.count(Employee.id),
            func.count(Employee.id).filter(Employee.status == "active"),
            func.count(Employee.id).filter(Employee.status == "probation"),
            func.count(Employee.id).filter(Employee.status == "notice_period"),
            func.count(Employee.id).filter(Employee.status == "on_leave"),
            func.count(Employee.id).filter(Employee.status == "suspended"),
            func.count(Employee.id).filter(Employee.status == "terminated"),
        ).where(Employee.organization_id == organization_id)

        status_row = (await session.execute(status_stmt)).first()
        total = status_row[0] if status_row else 0
        active = status_row[1] if status_row else 0
        probation = status_row[2] if status_row else 0
        notice = status_row[3] if status_row else 0
        on_leave = status_row[4] if status_row else 0
        suspended = status_row[5] if status_row else 0
        terminated = status_row[6] if status_row else 0

        # Department distribution
        dept_stmt = (
            select(
                Department.id,
                func.coalesce(Department.name, "Unassigned"),
                func.count(Employee.id),
            )
            .outerjoin(Department, Department.id == Employee.department_id)
            .where(Employee.organization_id == organization_id)
            .group_by(Department.id, Department.name)
            .order_by(func.count(Employee.id).desc())
        )
        dept_rows = (await session.execute(dept_stmt)).all()
        departments = [
            DepartmentDistribution(
                department_id=row[0],
                department_name=row[1],
                count=row[2],
            )
            for row in dept_rows
        ]

        # Branch distribution
        branch_stmt = (
            select(
                Branch.id,
                func.coalesce(Branch.name, "Headquarters"),
                func.count(Employee.id),
            )
            .outerjoin(Branch, Branch.id == Employee.branch_id)
            .where(Employee.organization_id == organization_id)
            .group_by(Branch.id, Branch.name)
            .order_by(func.count(Employee.id).desc())
        )
        branch_rows = (await session.execute(branch_stmt)).all()
        branches = [
            BranchDistribution(
                branch_id=row[0],
                branch_name=row[1],
                count=row[2],
            )
            for row in branch_rows
        ]

        return WorkforceReport(
            total_employees=total,
            active_employees=active,
            probation_employees=probation,
            notice_period_employees=notice,
            on_leave_employees=on_leave,
            suspended_employees=suspended,
            terminated_employees=terminated,
            departments=departments,
            branches=branches,
        )

    # ---------------------------------------------------------------------------
    # 3. Attendance Report
    # ---------------------------------------------------------------------------

    @staticmethod
    async def get_attendance_report(
        session: AsyncSession,
        organization_id: UUID,
        date_from: date,
        date_to: date,
        branch_id: UUID | None = None,
        department_id: UUID | None = None,
    ) -> AttendanceReport:
        base_query = select(AttendanceRecord).where(
            AttendanceRecord.organization_id == organization_id,
            AttendanceRecord.work_date >= date_from,
            AttendanceRecord.work_date <= date_to,
        )

        if branch_id is not None:
            base_query = base_query.where(AttendanceRecord.branch_id == branch_id)

        if department_id is not None:
            base_query = base_query.join(Employee, Employee.id == AttendanceRecord.employee_id).where(
                Employee.department_id == department_id
            )

        # Overall summary
        summary_stmt = select(
            func.count(AttendanceRecord.id),
            func.count(AttendanceRecord.id).filter(AttendanceRecord.status == "present"),
            func.count(AttendanceRecord.id).filter(AttendanceRecord.status == "absent"),
            func.count(AttendanceRecord.id).filter(AttendanceRecord.status == "late"),
            func.count(AttendanceRecord.id).filter(AttendanceRecord.status == "half_day"),
            func.count(AttendanceRecord.id).filter(AttendanceRecord.status == "on_leave"),
        ).select_from(base_query.subquery())

        summary_row = (await session.execute(summary_stmt)).first()
        total = summary_row[0] if summary_row else 0
        present = summary_row[1] if summary_row else 0
        absent = summary_row[2] if summary_row else 0
        late = summary_row[3] if summary_row else 0
        half_day = summary_row[4] if summary_row else 0
        on_leave = summary_row[5] if summary_row else 0

        rate = Decimal("0.0")
        if total > 0:
            rate = _round_rate((Decimal(present + late + half_day) / Decimal(total)) * Decimal(100))

        # Daily trends
        daily_stmt = (
            select(
                AttendanceRecord.work_date,
                func.count(AttendanceRecord.id).filter(AttendanceRecord.status == "present"),
                func.count(AttendanceRecord.id).filter(AttendanceRecord.status == "absent"),
                func.count(AttendanceRecord.id).filter(AttendanceRecord.status == "late"),
                func.count(AttendanceRecord.id).filter(AttendanceRecord.status == "half_day"),
                func.count(AttendanceRecord.id).filter(AttendanceRecord.status == "on_leave"),
                func.count(AttendanceRecord.id),
            )
            .where(
                AttendanceRecord.organization_id == organization_id,
                AttendanceRecord.work_date >= date_from,
                AttendanceRecord.work_date <= date_to,
            )
            .group_by(AttendanceRecord.work_date)
            .order_by(AttendanceRecord.work_date.asc())
        )
        if branch_id is not None:
            daily_stmt = daily_stmt.where(AttendanceRecord.branch_id == branch_id)

        daily_rows = (await session.execute(daily_stmt)).all()
        trends = []
        for r in daily_rows:
            d_total = r[6]
            d_present = r[1]
            d_late = r[3]
            d_half = r[4]
            d_rate = Decimal("0.0")
            if d_total > 0:
                d_rate = _round_rate((Decimal(d_present + d_late + d_half) / Decimal(d_total)) * Decimal(100))

            trends.append(
                AttendanceDayTrend(
                    date=r[0],
                    present_count=r[1],
                    absent_count=r[2],
                    late_count=r[3],
                    half_day_count=r[4],
                    on_leave_count=r[5],
                    total_records=d_total,
                    attendance_rate=d_rate,
                )
            )

        return AttendanceReport(
            date_from=date_from,
            date_to=date_to,
            total_records=total,
            present_count=present,
            absent_count=absent,
            late_count=late,
            half_day_count=half_day,
            on_leave_count=on_leave,
            attendance_rate=rate,
            daily_trends=trends,
        )

    # ---------------------------------------------------------------------------
    # 4. Leave Report
    # ---------------------------------------------------------------------------

    @staticmethod
    async def get_leave_report(
        session: AsyncSession,
        organization_id: UUID,
        date_from: date,
        date_to: date,
        department_id: UUID | None = None,
    ) -> LeaveReport:
        base_query = (
            select(
                func.count(LeaveRequest.id),
                func.count(LeaveRequest.id).filter(LeaveRequest.status == "pending"),
                func.count(LeaveRequest.id).filter(LeaveRequest.status == "approved"),
                func.count(LeaveRequest.id).filter(LeaveRequest.status == "rejected"),
                func.count(LeaveRequest.id).filter(LeaveRequest.status == "cancelled"),
                func.coalesce(
                    func.sum(
                        case(
                            (LeaveRequest.status == "approved", LeaveRequest.total_days),
                            else_=Decimal("0.00"),
                        )
                    ),
                    Decimal("0.00"),
                ),
            )
            .where(
                LeaveRequest.organization_id == organization_id,
                LeaveRequest.start_date <= date_to,
                LeaveRequest.end_date >= date_from,
            )
        )
        if department_id is not None:
            base_query = base_query.join(Employee, Employee.id == LeaveRequest.employee_id).where(
                Employee.department_id == department_id
            )

        row = (await session.execute(base_query)).first()
        total_reqs = row[0] if row else 0
        pending = row[1] if row else 0
        approved = row[2] if row else 0
        rejected = row[3] if row else 0
        cancelled = row[4] if row else 0
        approved_days = _round_currency(row[5] if row else Decimal("0.00"))

        # Breakdown by leave type
        type_stmt = (
            select(
                LeaveType.id,
                LeaveType.name,
                func.count(LeaveRequest.id),
                func.coalesce(func.sum(LeaveRequest.total_days), Decimal("0.00")),
            )
            .join(LeaveType, LeaveType.id == LeaveRequest.leave_type_id)
            .where(
                LeaveRequest.organization_id == organization_id,
                LeaveRequest.start_date <= date_to,
                LeaveRequest.end_date >= date_from,
            )
            .group_by(LeaveType.id, LeaveType.name)
            .order_by(func.count(LeaveRequest.id).desc())
        )
        type_rows = (await session.execute(type_stmt)).all()
        types = [
            LeaveTypeDistribution(
                leave_type_id=r[0],
                leave_type_name=r[1],
                request_count=r[2],
                total_days=_round_currency(r[3]),
            )
            for r in type_rows
        ]

        return LeaveReport(
            date_from=date_from,
            date_to=date_to,
            pending_count=pending,
            approved_count=approved,
            rejected_count=rejected,
            cancelled_count=cancelled,
            total_requests=total_reqs,
            total_approved_days=approved_days,
            leave_types=types,
        )

    # ---------------------------------------------------------------------------
    # 5. Project Report
    # ---------------------------------------------------------------------------

    @staticmethod
    async def get_project_report(session: AsyncSession, organization_id: UUID) -> ProjectReport:
        status_stmt = select(
            func.count(Project.id),
            func.count(Project.id).filter(Project.status.in_(["active", "in_progress"])),
            func.count(Project.id).filter(Project.status == "completed"),
            func.count(Project.id).filter(Project.status == "on_hold"),
            func.count(Project.id).filter(Project.status == "cancelled"),
            func.coalesce(func.sum(Project.budget), Decimal("0.00")),
        ).where(Project.organization_id == organization_id)

        row = (await session.execute(status_stmt)).first()
        total = row[0] if row else 0
        active = row[1] if row else 0
        completed = row[2] if row else 0
        on_hold = row[3] if row else 0
        cancelled = row[4] if row else 0
        total_budget = _round_currency(row[5] if row else Decimal("0.00"))

        # Status distribution
        dist_stmt = (
            select(Project.status, func.count(Project.id))
            .where(Project.organization_id == organization_id)
            .group_by(Project.status)
            .order_by(func.count(Project.id).desc())
        )
        dist_rows = (await session.execute(dist_stmt)).all()
        status_dist = [
            ProjectStatusDistribution(status=r[0], count=r[1])
            for r in dist_rows
        ]

        # Client distribution
        client_stmt = (
            select(
                Client.id,
                func.coalesce(Client.name, "Internal / None"),
                func.count(Project.id),
            )
            .outerjoin(Client, Client.id == Project.client_id)
            .where(Project.organization_id == organization_id)
            .group_by(Client.id, Client.name)
            .order_by(func.count(Project.id).desc())
            .limit(10)
        )
        client_rows = (await session.execute(client_stmt)).all()
        client_dist = [
            ClientProjectCount(
                client_id=r[0],
                client_name=r[1],
                project_count=r[2],
            )
            for r in client_rows
        ]

        return ProjectReport(
            total_projects=total,
            active_projects=active,
            completed_projects=completed,
            on_hold_projects=on_hold,
            cancelled_projects=cancelled,
            total_budget=total_budget,
            status_distribution=status_dist,
            client_distribution=client_dist,
        )

    # ---------------------------------------------------------------------------
    # 6. Procurement Report
    # ---------------------------------------------------------------------------

    @staticmethod
    async def get_procurement_report(session: AsyncSession, organization_id: UUID) -> ProcurementReport:
        pr_stmt = select(
            func.count(PurchaseRequest.id),
            func.count(PurchaseRequest.id).filter(PurchaseRequest.status.in_(["draft", "submitted", "pending"])),
            func.count(PurchaseRequest.id).filter(PurchaseRequest.status == "approved"),
            func.count(PurchaseRequest.id).filter(PurchaseRequest.status == "rejected"),
            func.coalesce(func.sum(PurchaseRequest.estimated_amount), Decimal("0.00")),
        ).where(PurchaseRequest.organization_id == organization_id)

        pr_row = (await session.execute(pr_stmt)).first()
        total_pr = pr_row[0] if pr_row else 0
        pending_pr = pr_row[1] if pr_row else 0
        approved_pr = pr_row[2] if pr_row else 0
        rejected_pr = pr_row[3] if pr_row else 0
        total_est = _round_currency(pr_row[4] if pr_row else Decimal("0.00"))

        po_stmt = select(
            func.count(PurchaseOrder.id),
            func.count(PurchaseOrder.id).filter(PurchaseOrder.status.in_(["draft", "issued", "partially_received", "pending"])),
            func.count(PurchaseOrder.id).filter(PurchaseOrder.status.in_(["closed", "completed", "received"])),
        ).where(PurchaseOrder.organization_id == organization_id)

        po_row = (await session.execute(po_stmt)).first()
        total_po = po_row[0] if po_row else 0
        open_po = po_row[1] if po_row else 0
        closed_po = po_row[2] if po_row else 0

        vendor_count = await session.scalar(
            select(func.count(Vendor.id)).where(Vendor.organization_id == organization_id)
        ) or 0

        return ProcurementReport(
            total_purchase_requests=total_pr,
            pending_purchase_requests=pending_pr,
            approved_purchase_requests=approved_pr,
            rejected_purchase_requests=rejected_pr,
            total_purchase_orders=total_po,
            open_purchase_orders=open_po,
            closed_purchase_orders=closed_po,
            total_vendors_count=vendor_count,
            total_estimated_requests_amount=total_est,
        )

    # ---------------------------------------------------------------------------
    # 7. Asset Report
    # ---------------------------------------------------------------------------

    @staticmethod
    async def get_asset_report(session: AsyncSession, organization_id: UUID) -> AssetReport:
        stmt = select(
            func.count(Asset.id),
            func.count(Asset.id).filter(Asset.status == "available"),
            func.count(Asset.id).filter(Asset.status == "assigned"),
            func.count(Asset.id).filter(Asset.status == "maintenance"),
            func.count(Asset.id).filter(Asset.status == "retired"),
            func.coalesce(func.sum(Asset.purchase_cost), Decimal("0.00")),
        ).where(Asset.organization_id == organization_id)

        row = (await session.execute(stmt)).first()
        total = row[0] if row else 0
        available = row[1] if row else 0
        assigned = row[2] if row else 0
        maint = row[3] if row else 0
        retired = row[4] if row else 0
        cost = _round_currency(row[5] if row else Decimal("0.00"))

        cat_stmt = (
            select(Asset.category, func.count(Asset.id))
            .where(Asset.organization_id == organization_id)
            .group_by(Asset.category)
            .order_by(func.count(Asset.id).desc())
        )
        cat_rows = (await session.execute(cat_stmt)).all()
        categories = [
            AssetCategoryDistribution(category=r[0], count=r[1])
            for r in cat_rows
        ]

        return AssetReport(
            total_assets=total,
            available_assets=available,
            assigned_assets=assigned,
            under_maintenance_assets=maint,
            retired_assets=retired,
            total_purchase_cost=cost,
            category_distribution=categories,
        )

    # ---------------------------------------------------------------------------
    # 8. Maintenance Report
    # ---------------------------------------------------------------------------

    @staticmethod
    async def get_maintenance_report(session: AsyncSession, organization_id: UUID) -> MaintenanceReport:
        req_stmt = select(
            func.count(MaintenanceRequest.id),
            func.count(MaintenanceRequest.id).filter(MaintenanceRequest.status.in_(["submitted", "pending", "scheduled"])),
            func.count(MaintenanceRequest.id).filter(MaintenanceRequest.status == "in_progress"),
            func.count(MaintenanceRequest.id).filter(MaintenanceRequest.status == "completed"),
        ).where(MaintenanceRequest.organization_id == organization_id)

        req_row = (await session.execute(req_stmt)).first()
        total_reqs = req_row[0] if req_row else 0
        open_reqs = req_row[1] if req_row else 0
        in_progress = req_row[2] if req_row else 0
        completed = req_row[3] if req_row else 0

        rec_stmt = select(
            func.count(MaintenanceRecord.id),
            func.coalesce(func.sum(MaintenanceRecord.total_cost), Decimal("0.00")),
            func.coalesce(func.sum(MaintenanceRecord.labor_cost), Decimal("0.00")),
            func.coalesce(func.sum(MaintenanceRecord.parts_cost), Decimal("0.00")),
        ).where(MaintenanceRecord.organization_id == organization_id)

        rec_row = (await session.execute(rec_stmt)).first()
        total_recs = rec_row[0] if rec_row else 0
        tot_cost = _round_currency(rec_row[1] if rec_row else Decimal("0.00"))
        labor_cost = _round_currency(rec_row[2] if rec_row else Decimal("0.00"))
        parts_cost = _round_currency(rec_row[3] if rec_row else Decimal("0.00"))

        return MaintenanceReport(
            open_requests_count=open_reqs,
            in_progress_requests_count=in_progress,
            completed_requests_count=completed,
            total_requests_count=total_reqs,
            total_records_count=total_recs,
            total_maintenance_cost=tot_cost,
            total_labor_cost=labor_cost,
            total_parts_cost=parts_cost,
        )

    # ---------------------------------------------------------------------------
    # 9. Training Report
    # ---------------------------------------------------------------------------

    @staticmethod
    async def get_training_report(session: AsyncSession, organization_id: UUID) -> TrainingReport:
        today = datetime.now(UTC).date()

        prog_stmt = select(
            func.count(TrainingProgram.id),
            func.count(TrainingProgram.id).filter(TrainingProgram.status == "published"),
        ).where(TrainingProgram.organization_id == organization_id)
        prog_row = (await session.execute(prog_stmt)).first()
        total_progs = prog_row[0] if prog_row else 0
        active_progs = prog_row[1] if prog_row else 0

        sess_stmt = select(
            func.count(TrainingSession.id).filter(TrainingSession.session_date >= today),
            func.count(TrainingSession.id).filter(TrainingSession.session_date < today),
        ).where(TrainingSession.organization_id == organization_id)
        sess_row = (await session.execute(sess_stmt)).first()
        upcoming_sess = sess_row[0] if sess_row else 0
        completed_sess = sess_row[1] if sess_row else 0

        enroll_stmt = select(
            func.count(TrainingEnrollment.id),
            func.count(TrainingEnrollment.id).filter(TrainingEnrollment.status == "completed"),
            func.count(TrainingEnrollment.id).filter(TrainingEnrollment.status == "cancelled"),
        ).where(TrainingEnrollment.organization_id == organization_id)
        enroll_row = (await session.execute(enroll_stmt)).first()
        total_enroll = enroll_row[0] if enroll_row else 0
        completed_enroll = enroll_row[1] if enroll_row else 0
        cancelled_enroll = enroll_row[2] if enroll_row else 0

        comp_rate = Decimal("0.0")
        if total_enroll > 0:
            comp_rate = _round_rate((Decimal(completed_enroll) / Decimal(total_enroll)) * Decimal(100))

        return TrainingReport(
            total_programs=total_progs,
            active_programs=active_progs,
            upcoming_sessions=upcoming_sess,
            completed_sessions=completed_sess,
            total_enrollments=total_enroll,
            completed_enrollments=completed_enroll,
            cancelled_enrollments=cancelled_enroll,
            completion_rate=comp_rate,
        )

    # ---------------------------------------------------------------------------
    # 10. Internship Report
    # ---------------------------------------------------------------------------

    @staticmethod
    async def get_internship_report(session: AsyncSession, organization_id: UUID) -> InternshipReport:
        stmt = select(
            func.count(Internship.id),
            func.count(Internship.id).filter(Internship.status == "active"),
            func.count(Internship.id).filter(Internship.status == "planned"),
            func.count(Internship.id).filter(Internship.status == "completed"),
            func.count(Internship.id).filter(Internship.status == "terminated"),
            func.coalesce(func.sum(Internship.stipend), Decimal("0.00")),
        ).where(Internship.organization_id == organization_id)

        row = (await session.execute(stmt)).first()
        total = row[0] if row else 0
        active = row[1] if row else 0
        planned = row[2] if row else 0
        completed = row[3] if row else 0
        terminated = row[4] if row else 0
        stipend = _round_currency(row[5] if row else Decimal("0.00"))

        return InternshipReport(
            total_internships=total,
            active_internships=active,
            planned_internships=planned,
            completed_internships=completed,
            terminated_internships=terminated,
            total_stipend_committed=stipend,
        )

    # ---------------------------------------------------------------------------
    # 11. Operations Report
    # ---------------------------------------------------------------------------

    @staticmethod
    async def get_operations_report(session: AsyncSession, organization_id: UUID) -> OperationsReport:
        stmt = select(
            func.count(OperationTask.id),
            func.count(OperationTask.id).filter(OperationTask.status == "open"),
            func.count(OperationTask.id).filter(OperationTask.status == "in_progress"),
            func.count(OperationTask.id).filter(OperationTask.status == "completed"),
            func.count(OperationTask.id).filter(OperationTask.status == "cancelled"),
        ).where(OperationTask.organization_id == organization_id)

        row = (await session.execute(stmt)).first()
        total = row[0] if row else 0
        open_tasks = row[1] if row else 0
        in_progress = row[2] if row else 0
        completed = row[3] if row else 0
        cancelled = row[4] if row else 0

        # Status distribution
        dist_stmt = (
            select(OperationTask.status, func.count(OperationTask.id))
            .where(OperationTask.organization_id == organization_id)
            .group_by(OperationTask.status)
            .order_by(func.count(OperationTask.id).desc())
        )
        dist_rows = (await session.execute(dist_stmt)).all()
        status_dist = [
            TaskStatusDistribution(status=r[0], count=r[1])
            for r in dist_rows
        ]

        return OperationsReport(
            total_tasks=total,
            open_tasks=open_tasks,
            in_progress_tasks=in_progress,
            completed_tasks=completed,
            cancelled_tasks=cancelled,
            overdue_tasks=0,
            status_distribution=status_dist,
        )

    # ---------------------------------------------------------------------------
    # 12. Finance Report (Exact Decimals)
    # ---------------------------------------------------------------------------

    @staticmethod
    async def get_finance_report(
        session: AsyncSession,
        organization_id: UUID,
        date_from: date,
        date_to: date,
    ) -> FinanceReport:
        # Expenses overall within date range
        exp_stmt = select(
            func.coalesce(func.sum(Expense.total_amount), Decimal("0.00")),
            func.coalesce(
                func.sum(
                    case(
                        (Expense.status == "submitted", Expense.total_amount),
                        else_=Decimal("0.00"),
                    )
                ),
                Decimal("0.00"),
            ),
            func.coalesce(
                func.sum(
                    case(
                        (Expense.status == "approved", Expense.total_amount),
                        else_=Decimal("0.00"),
                    )
                ),
                Decimal("0.00"),
            ),
            func.coalesce(
                func.sum(
                    case(
                        (Expense.status == "paid", Expense.total_amount),
                        else_=Decimal("0.00"),
                    )
                ),
                Decimal("0.00"),
            ),
        ).where(
            Expense.organization_id == organization_id,
            Expense.expense_date >= date_from,
            Expense.expense_date <= date_to,
        )
        exp_row = (await session.execute(exp_stmt)).first()
        total_exp = _round_currency(exp_row[0] if exp_row else Decimal("0.00"))
        submitted_exp = _round_currency(exp_row[1] if exp_row else Decimal("0.00"))
        approved_exp = _round_currency(exp_row[2] if exp_row else Decimal("0.00"))
        paid_exp = _round_currency(exp_row[3] if exp_row else Decimal("0.00"))

        # Transactions debit/credit
        tx_stmt = select(
            func.coalesce(func.sum(FinancialTransaction.debit), Decimal("0.00")),
            func.coalesce(func.sum(FinancialTransaction.credit), Decimal("0.00")),
        ).where(
            FinancialTransaction.organization_id == organization_id,
            FinancialTransaction.transaction_date >= date_from,
            FinancialTransaction.transaction_date <= date_to,
            FinancialTransaction.status == "posted",
        )
        tx_row = (await session.execute(tx_stmt)).first()
        total_debits = _round_currency(tx_row[0] if tx_row else Decimal("0.00"))
        total_credits = _round_currency(tx_row[1] if tx_row else Decimal("0.00"))

        # Category breakdown
        cat_stmt = (
            select(
                ExpenseCategory.id,
                ExpenseCategory.name,
                func.coalesce(func.sum(Expense.total_amount), Decimal("0.00")),
                func.count(Expense.id),
            )
            .join(ExpenseCategory, ExpenseCategory.id == Expense.category_id)
            .where(
                Expense.organization_id == organization_id,
                Expense.expense_date >= date_from,
                Expense.expense_date <= date_to,
            )
            .group_by(ExpenseCategory.id, ExpenseCategory.name)
            .order_by(func.sum(Expense.total_amount).desc())
        )
        cat_rows = (await session.execute(cat_stmt)).all()
        categories = [
            ExpenseCategoryBreakdown(
                category_id=r[0],
                category_name=r[1],
                total_amount=_round_currency(r[2]),
                expense_count=r[3],
            )
            for r in cat_rows
        ]

        return FinanceReport(
            date_from=date_from,
            date_to=date_to,
            total_expenses=total_exp,
            submitted_expenses_total=submitted_exp,
            approved_expenses_total=approved_exp,
            paid_expenses_total=paid_exp,
            total_debits=total_debits,
            total_credits=total_credits,
            expenses_by_category=categories,
        )

    # ---------------------------------------------------------------------------
    # 13. Documents Report
    # ---------------------------------------------------------------------------

    @staticmethod
    async def get_documents_report(session: AsyncSession, organization_id: UUID) -> DocumentsReport:
        doc_count = await session.scalar(
            select(func.count(Document.id)).where(Document.organization_id == organization_id)
        ) or 0

        ver_count = await session.scalar(
            select(func.count(DocumentVersion.id)).where(DocumentVersion.organization_id == organization_id)
        ) or 0

        cat_stmt = (
            select(Document.category, func.count(Document.id))
            .where(Document.organization_id == organization_id)
            .group_by(Document.category)
            .order_by(func.count(Document.id).desc())
        )
        cat_rows = (await session.execute(cat_stmt)).all()
        categories = [
            DocumentCategoryDistribution(category=r[0], count=r[1])
            for r in cat_rows
        ]

        return DocumentsReport(
            total_documents=doc_count,
            total_versions=ver_count,
            categories=categories,
        )

    # ---------------------------------------------------------------------------
    # 14. Audit Activity Report
    # ---------------------------------------------------------------------------

    @staticmethod
    async def get_audit_activity_report(
        session: AsyncSession,
        organization_id: UUID,
        date_from: date,
        date_to: date,
    ) -> AuditActivityReport:
        dt_start = datetime.combine(date_from, datetime.min.time(), tzinfo=UTC)
        dt_end = datetime.combine(date_to, datetime.max.time(), tzinfo=UTC)

        total_events = await session.scalar(
            select(func.count(AuditLog.id)).where(
                AuditLog.organization_id == organization_id,
                AuditLog.created_at >= dt_start,
                AuditLog.created_at <= dt_end,
            )
        ) or 0

        # By entity
        entity_stmt = (
            select(AuditLog.entity_type, func.count(AuditLog.id))
            .where(
                AuditLog.organization_id == organization_id,
                AuditLog.created_at >= dt_start,
                AuditLog.created_at <= dt_end,
            )
            .group_by(AuditLog.entity_type)
            .order_by(func.count(AuditLog.id).desc())
            .limit(10)
        )
        entity_rows = (await session.execute(entity_stmt)).all()
        entities = [
            AuditEntityDistribution(entity_type=r[0], count=r[1])
            for r in entity_rows
        ]

        # By action
        action_stmt = (
            select(AuditLog.action, func.count(AuditLog.id))
            .where(
                AuditLog.organization_id == organization_id,
                AuditLog.created_at >= dt_start,
                AuditLog.created_at <= dt_end,
            )
            .group_by(AuditLog.action)
            .order_by(func.count(AuditLog.id).desc())
            .limit(10)
        )
        action_rows = (await session.execute(action_stmt)).all()
        actions = [
            AuditActionDistribution(action=r[0], count=r[1])
            for r in action_rows
        ]

        # Daily trend
        day_col = cast(AuditLog.created_at, Date)
        daily_stmt = (
            select(day_col, func.count(AuditLog.id))
            .where(
                AuditLog.organization_id == organization_id,
                AuditLog.created_at >= dt_start,
                AuditLog.created_at <= dt_end,
            )
            .group_by(day_col)
            .order_by(day_col.asc())
        )
        daily_rows = (await session.execute(daily_stmt)).all()
        daily = [
            AuditDayActivity(date=r[0], count=r[1])
            for r in daily_rows
        ]

        return AuditActivityReport(
            date_from=date_from,
            date_to=date_to,
            total_events=total_events,
            events_by_entity=entities,
            events_by_action=actions,
            daily_trend=daily,
        )
