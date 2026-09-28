/**
 * Attendance Types for OfficeOS Frontend
 * Matches FastAPI backend schemas in app.schemas.attendance
 */

export type AttendanceStatus =
  | "present"
  | "absent"
  | "late"
  | "half_day"
  | "on_leave";

export interface EmployeeBrief {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  designation: string;
  department_name?: string | null;
  branch_name?: string | null;
}

export interface BranchBrief {
  id: string;
  name: string;
  code: string;
}

export interface AttendanceRecord {
  id: string;
  organization_id: string;
  employee_id: string;
  employee?: EmployeeBrief | null;
  branch_id?: string | null;
  branch?: BranchBrief | null;
  work_date: string;
  check_in_at?: string | null;
  check_out_at?: string | null;
  status: AttendanceStatus | string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type AttendanceDetailResponse = AttendanceRecord;

export interface AttendanceCheckInRequest {
  employee_id?: string;
  branch_id?: string;
  work_date?: string;
  check_in_at?: string;
  notes?: string;
}

export interface AttendanceCheckOutRequest {
  check_out_at?: string;
  notes?: string;
}

export interface AttendanceCreate {
  employee_id: string;
  work_date: string;
  status: AttendanceStatus | string;
  check_in_at?: string | null;
  check_out_at?: string | null;
  branch_id?: string | null;
  notes?: string | null;
}

export interface AttendanceUpdate {
  status?: AttendanceStatus | string;
  work_date?: string;
  check_in_at?: string | null;
  check_out_at?: string | null;
  branch_id?: string | null;
  notes?: string | null;
}

export interface AttendanceSummary {
  date: string;
  total_active_employees: number;
  present_count: number;
  late_count: number;
  half_day_count: number;
  absent_count: number;
  on_leave_count: number;
  marked_count: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PaginatedAttendance {
  items: AttendanceRecord[];
  meta: PaginationMeta;
}
