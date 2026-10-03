from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class DateRangeParams(BaseModel):
    date_from: date | None = None
    date_to: date | None = None


# ---------------------------------------------------------------------------
# Overview / Executive Dashboard Schemas
# ---------------------------------------------------------------------------


class MetricCard(BaseModel):
    label: str
    value: int | str
    change: str | None = None
    is_positive: bool | None = None
    description: str | None = None


class ExecutiveOverviewReport(BaseModel):
    # Core KPIs
    active_employees_count: int = 0
    attendance_today_count: int = 0
    attendance_rate_today: Decimal = Field(default=Decimal("0.0"))
    pending_leaves_count: int = 0
    active_projects_count: int = 0
    active_clients_count: int = 0
    pending_purchase_requests_count: int = 0
    open_maintenance_requests_count: int = 0
    open_operations_tasks_count: int = 0
    upcoming_training_sessions_count: int = 0
    active_internships_count: int = 0
    documents_count: int = 0
    unread_notifications_count: int = 0

    # Conditionally populated finance totals if authorized
    finance_metrics_included: bool = False
    total_expenses_mtd: Decimal | None = None
    pending_expenses_count: int | None = None


# ---------------------------------------------------------------------------
# Workforce Report Schemas
# ---------------------------------------------------------------------------


class DepartmentDistribution(BaseModel):
    department_id: UUID | None
    department_name: str
    count: int


class BranchDistribution(BaseModel):
    branch_id: UUID | None
    branch_name: str
    count: int


class WorkforceReport(BaseModel):
    total_employees: int
    active_employees: int
    probation_employees: int
    notice_period_employees: int
    on_leave_employees: int
    suspended_employees: int
    terminated_employees: int
    departments: list[DepartmentDistribution]
    branches: list[BranchDistribution]


# ---------------------------------------------------------------------------
# Attendance Report Schemas
# ---------------------------------------------------------------------------


class AttendanceDayTrend(BaseModel):
    date: date
    present_count: int
    absent_count: int
    late_count: int
    half_day_count: int
    on_leave_count: int
    total_records: int
    attendance_rate: Decimal


class AttendanceReport(BaseModel):
    date_from: date
    date_to: date
    total_records: int
    present_count: int
    absent_count: int
    late_count: int
    half_day_count: int
    on_leave_count: int
    attendance_rate: Decimal
    daily_trends: list[AttendanceDayTrend]


# ---------------------------------------------------------------------------
# Leave Report Schemas
# ---------------------------------------------------------------------------


class LeaveTypeDistribution(BaseModel):
    leave_type_id: UUID
    leave_type_name: str
    request_count: int
    total_days: Decimal


class LeaveReport(BaseModel):
    date_from: date
    date_to: date
    pending_count: int
    approved_count: int
    rejected_count: int
    cancelled_count: int
    total_requests: int
    total_approved_days: Decimal
    leave_types: list[LeaveTypeDistribution]


# ---------------------------------------------------------------------------
# Project Report Schemas
# ---------------------------------------------------------------------------


class ProjectStatusDistribution(BaseModel):
    status: str
    count: int


class ClientProjectCount(BaseModel):
    client_id: UUID | None
    client_name: str
    project_count: int


class ProjectReport(BaseModel):
    total_projects: int
    active_projects: int
    completed_projects: int
    on_hold_projects: int
    cancelled_projects: int
    total_budget: Decimal
    status_distribution: list[ProjectStatusDistribution]
    client_distribution: list[ClientProjectCount]


# ---------------------------------------------------------------------------
# Procurement Report Schemas
# ---------------------------------------------------------------------------


class ProcurementReport(BaseModel):
    total_purchase_requests: int
    pending_purchase_requests: int
    approved_purchase_requests: int
    rejected_purchase_requests: int
    total_purchase_orders: int
    open_purchase_orders: int
    closed_purchase_orders: int
    total_vendors_count: int
    total_estimated_requests_amount: Decimal


# ---------------------------------------------------------------------------
# Asset Report Schemas
# ---------------------------------------------------------------------------


class AssetCategoryDistribution(BaseModel):
    category: str
    count: int


class AssetReport(BaseModel):
    total_assets: int
    available_assets: int
    assigned_assets: int
    under_maintenance_assets: int
    retired_assets: int
    total_purchase_cost: Decimal
    category_distribution: list[AssetCategoryDistribution]


# ---------------------------------------------------------------------------
# Maintenance Report Schemas
# ---------------------------------------------------------------------------


class MaintenanceReport(BaseModel):
    open_requests_count: int
    in_progress_requests_count: int
    completed_requests_count: int
    total_requests_count: int
    total_records_count: int
    total_maintenance_cost: Decimal
    total_labor_cost: Decimal
    total_parts_cost: Decimal


# ---------------------------------------------------------------------------
# Training Report Schemas
# ---------------------------------------------------------------------------


class TrainingReport(BaseModel):
    total_programs: int
    active_programs: int
    upcoming_sessions: int
    completed_sessions: int
    total_enrollments: int
    completed_enrollments: int
    cancelled_enrollments: int
    completion_rate: Decimal


# ---------------------------------------------------------------------------
# Internship Report Schemas
# ---------------------------------------------------------------------------


class InternshipReport(BaseModel):
    total_internships: int
    active_internships: int
    planned_internships: int
    completed_internships: int
    terminated_internships: int
    total_stipend_committed: Decimal


# ---------------------------------------------------------------------------
# Operations Report Schemas
# ---------------------------------------------------------------------------


class TaskStatusDistribution(BaseModel):
    status: str
    count: int


class OperationsReport(BaseModel):
    total_tasks: int
    open_tasks: int
    in_progress_tasks: int
    completed_tasks: int
    cancelled_tasks: int
    overdue_tasks: int
    status_distribution: list[TaskStatusDistribution]


# ---------------------------------------------------------------------------
# Finance Report Schemas
# ---------------------------------------------------------------------------


class ExpenseCategoryBreakdown(BaseModel):
    category_id: UUID
    category_name: str
    total_amount: Decimal
    expense_count: int


class FinanceReport(BaseModel):
    date_from: date
    date_to: date
    total_expenses: Decimal
    submitted_expenses_total: Decimal
    approved_expenses_total: Decimal
    paid_expenses_total: Decimal
    total_debits: Decimal
    total_credits: Decimal
    expenses_by_category: list[ExpenseCategoryBreakdown]


# ---------------------------------------------------------------------------
# Documents Report Schemas
# ---------------------------------------------------------------------------


class DocumentCategoryDistribution(BaseModel):
    category: str
    count: int


class DocumentsReport(BaseModel):
    total_documents: int
    total_versions: int
    categories: list[DocumentCategoryDistribution]


# ---------------------------------------------------------------------------
# Audit Activity Report Schemas
# ---------------------------------------------------------------------------


class AuditEntityDistribution(BaseModel):
    entity_type: str
    count: int


class AuditActionDistribution(BaseModel):
    action: str
    count: int


class AuditDayActivity(BaseModel):
    date: date
    count: int


class AuditActivityReport(BaseModel):
    date_from: date
    date_to: date
    total_events: int
    events_by_entity: list[AuditEntityDistribution]
    events_by_action: list[AuditActionDistribution]
    daily_trend: list[AuditDayActivity]
