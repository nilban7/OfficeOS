/**
 * Leave & Holidays Types for OfficeOS Frontend
 * Matches FastAPI backend schemas in app.schemas.leave
 */

export interface LeaveType {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  description?: string | null;
  annual_allocation: number;
  is_paid: boolean;
  requires_approval: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeaveTypeCreateInput {
  name: string;
  code: string;
  description?: string | null;
  annual_allocation: number;
  is_paid?: boolean;
  requires_approval?: boolean;
  is_active?: boolean;
}

export interface LeaveTypeUpdateInput {
  name?: string;
  code?: string;
  description?: string | null;
  annual_allocation?: number;
  is_paid?: boolean;
  requires_approval?: boolean;
  is_active?: boolean;
}

export interface LeaveTypeBrief {
  id: string;
  name: string;
  code: string;
  is_paid: boolean;
}

export interface EmployeeBrief {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  designation: string;
  department_name?: string | null;
}

export interface ReviewerBrief {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface LeaveRequest {
  id: string;
  organization_id: string;
  employee_id: string;
  employee?: EmployeeBrief | null;
  leave_type_id: string;
  leave_type?: LeaveTypeBrief | null;
  start_date: string;
  end_date: string;
  total_days: number;
  reason?: string | null;
  status: LeaveStatus | string;
  reviewed_by?: string | null;
  reviewer?: ReviewerBrief | null;
  reviewed_at?: string | null;
  reviewer_comment?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaveRequestCreateInput {
  leave_type_id: string;
  start_date: string;
  end_date: string;
  reason?: string | null;
  employee_id?: string | null;
}

export interface LeaveTypeBalance {
  leave_type_id: string;
  leave_type_name: string;
  leave_type_code: string;
  annual_allocation: number;
  used_days: number;
  pending_days: number;
  available_days: number;
}

export interface LeaveSummary {
  total_allocated_days: number;
  total_used_days: number;
  total_pending_days: number;
  total_available_days: number;
  balances_by_type: LeaveTypeBalance[];
}

export interface BranchBrief {
  id: string;
  name: string;
  code: string;
}

export interface Holiday {
  id: string;
  organization_id: string;
  name: string;
  holiday_date: string;
  branch_id?: string | null;
  branch?: BranchBrief | null;
  description?: string | null;
  is_optional: boolean;
  created_at: string;
  updated_at: string;
}

export interface HolidayCreateInput {
  name: string;
  holiday_date: string;
  branch_id?: string | null;
  description?: string | null;
  is_optional?: boolean;
}

export interface HolidayUpdateInput {
  name?: string;
  holiday_date?: string;
  branch_id?: string | null;
  description?: string | null;
  is_optional?: boolean;
}

export interface PaginatedLeaveRequests {
  items: LeaveRequest[];
  meta: {
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
  };
}
