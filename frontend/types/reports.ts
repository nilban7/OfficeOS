/**
 * TypeScript interface definitions for Reports & Dashboards API responses.
 * Strictly mirrors the backend Pydantic models in app/schemas/reports.py.
 */

export interface ExecutiveOverviewReport {
  active_employees_count: number;
  attendance_today_count: number;
  attendance_rate_today: string | number;
  pending_leaves_count: number;
  active_projects_count: number;
  active_clients_count: number;
  pending_purchase_requests_count: number;
  open_maintenance_requests_count: number;
  open_operations_tasks_count: number;
  upcoming_training_sessions_count: number;
  active_internships_count: number;
  documents_count: number;
  unread_notifications_count: number;
  finance_metrics_included: boolean;
  total_expenses_mtd: string | null;
  pending_expenses_count: number | null;
}

export interface DepartmentDistribution {
  department_id: string | null;
  department_name: string;
  count: number;
}

export interface BranchDistribution {
  branch_id: string | null;
  branch_name: string;
  count: number;
}

export interface WorkforceReport {
  total_employees: number;
  active_employees: number;
  probation_employees: number;
  notice_period_employees: number;
  on_leave_employees: number;
  suspended_employees: number;
  terminated_employees: number;
  departments: DepartmentDistribution[];
  branches: BranchDistribution[];
}

export interface AttendanceDayTrend {
  date: string;
  present_count: number;
  absent_count: number;
  late_count: number;
  half_day_count: number;
  on_leave_count: number;
  total_records: number;
  attendance_rate: string | number;
}

export interface AttendanceReport {
  date_from: string;
  date_to: string;
  total_records: number;
  present_count: number;
  absent_count: number;
  late_count: number;
  half_day_count: number;
  on_leave_count: number;
  attendance_rate: string | number;
  daily_trends: AttendanceDayTrend[];
}

export interface LeaveTypeDistribution {
  leave_type_id: string;
  leave_type_name: string;
  request_count: number;
  total_days: string | number;
}

export interface LeaveReport {
  date_from: string;
  date_to: string;
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  cancelled_count: number;
  total_requests: number;
  total_approved_days: string | number;
  leave_types: LeaveTypeDistribution[];
}

export interface ProjectStatusDistribution {
  status: string;
  count: number;
}

export interface ClientProjectCount {
  client_id: string | null;
  client_name: string;
  project_count: number;
}

export interface ProjectReport {
  total_projects: number;
  active_projects: number;
  completed_projects: number;
  on_hold_projects: number;
  cancelled_projects: number;
  total_budget: string | number;
  status_distribution: ProjectStatusDistribution[];
  client_distribution: ClientProjectCount[];
}

export interface ProcurementReport {
  total_purchase_requests: number;
  pending_purchase_requests: number;
  approved_purchase_requests: number;
  rejected_purchase_requests: number;
  total_purchase_orders: number;
  open_purchase_orders: number;
  closed_purchase_orders: number;
  total_vendors_count: number;
  total_estimated_requests_amount: string | number;
}

export interface AssetCategoryDistribution {
  category: string;
  count: number;
}

export interface AssetReport {
  total_assets: number;
  available_assets: number;
  assigned_assets: number;
  under_maintenance_assets: number;
  retired_assets: number;
  total_purchase_cost: string | number;
  category_distribution: AssetCategoryDistribution[];
}

export interface MaintenanceReport {
  open_requests_count: number;
  in_progress_requests_count: number;
  completed_requests_count: number;
  total_requests_count: number;
  total_records_count: number;
  total_maintenance_cost: string | number;
  total_labor_cost: string | number;
  total_parts_cost: string | number;
}

export interface TrainingReport {
  total_programs: number;
  active_programs: number;
  upcoming_sessions: number;
  completed_sessions: number;
  total_enrollments: number;
  completed_enrollments: number;
  cancelled_enrollments: number;
  completion_rate: string | number;
}

export interface InternshipReport {
  total_internships: number;
  active_internships: number;
  planned_internships: number;
  completed_internships: number;
  terminated_internships: number;
  total_stipend_committed: string | number;
}

export interface TaskStatusDistribution {
  status: string;
  count: number;
}

export interface OperationsReport {
  total_tasks: number;
  open_tasks: number;
  in_progress_tasks: number;
  completed_tasks: number;
  cancelled_tasks: number;
  overdue_tasks: number;
  status_distribution: TaskStatusDistribution[];
}

export interface ExpenseCategoryBreakdown {
  category_id: string;
  category_name: string;
  total_amount: string | number;
  expense_count: number;
}

export interface FinanceReport {
  date_from: string;
  date_to: string;
  total_expenses: string | number;
  submitted_expenses_total: string | number;
  approved_expenses_total: string | number;
  paid_expenses_total: string | number;
  total_debits: string | number;
  total_credits: string | number;
  expenses_by_category: ExpenseCategoryBreakdown[];
}

export interface DocumentCategoryDistribution {
  category: string;
  count: number;
}

export interface DocumentsReport {
  total_documents: number;
  total_versions: number;
  categories: DocumentCategoryDistribution[];
}

export interface AuditEntityDistribution {
  entity_type: string;
  count: number;
}

export interface AuditActionDistribution {
  action: string;
  count: number;
}

export interface AuditDayActivity {
  date: string;
  count: number;
}

export interface AuditActivityReport {
  date_from: string;
  date_to: string;
  total_events: number;
  events_by_entity: AuditEntityDistribution[];
  events_by_action: AuditActionDistribution[];
  daily_trend: AuditDayActivity[];
}
