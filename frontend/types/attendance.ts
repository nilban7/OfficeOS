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

export type AttendanceApprovalStatus =
  | "not_required"
  | "pending_hr"
  | "pending_org_head"
  | "approved"
  | "rejected";

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
  latitude?: number | null;
  longitude?: number | null;
  location_name?: string | null;
  location_accuracy?: number | null;
  verification_method?: "web" | "geolocation" | "fingerprint" | "biometric" | "manual" | string;
  check_out_latitude?: number | null;
  check_out_longitude?: number | null;
  check_out_location_name?: string | null;
  device_info?: string | null;
  is_offsite?: boolean;
  offsite_reason?: string | null;
  offsite_location?: string | null;
  client_name?: string | null;
  approval_status?: AttendanceApprovalStatus | string;
  hr_approved_at?: string | null;
  hr_approved_by_id?: string | null;
  hr_rejection_reason?: string | null;
  org_head_approved_at?: string | null;
  org_head_approved_by_id?: string | null;
  org_head_rejection_reason?: string | null;
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
  latitude?: number | null;
  longitude?: number | null;
  location_name?: string | null;
  location_accuracy?: number | null;
  verification_method?: "web" | "geolocation" | "fingerprint" | "biometric" | "manual" | string;
  device_info?: string | null;
  is_offsite?: boolean;
  offsite_reason?: string | null;
  offsite_location?: string | null;
  client_name?: string | null;
}

export interface AttendanceHRReviewAction {
  action: "approve" | "reject";
  rejection_reason?: string | null;
}

export interface AttendanceOrgHeadReviewAction {
  action: "confirm_reject" | "override_approve";
  reason?: string | null;
}


export interface AttendanceCheckOutRequest {
  check_out_at?: string;
  notes?: string;
  latitude?: number | null;
  longitude?: number | null;
  location_name?: string | null;
  location_accuracy?: number | null;
}

export interface AttendanceCreate {
  employee_id: string;
  work_date: string;
  status: AttendanceStatus | string;
  check_in_at?: string | null;
  check_out_at?: string | null;
  branch_id?: string | null;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_name?: string | null;
  location_accuracy?: number | null;
  verification_method?: "web" | "geolocation" | "fingerprint" | "biometric" | "manual" | string;
  check_out_latitude?: number | null;
  check_out_longitude?: number | null;
  check_out_location_name?: string | null;
  device_info?: string | null;
  is_offsite?: boolean;
  offsite_reason?: string | null;
  offsite_location?: string | null;
  client_name?: string | null;
}

export interface AttendanceUpdate {
  status?: AttendanceStatus | string;
  work_date?: string;
  check_in_at?: string | null;
  check_out_at?: string | null;
  branch_id?: string | null;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_name?: string | null;
  location_accuracy?: number | null;
  verification_method?: "web" | "geolocation" | "fingerprint" | "biometric" | "manual" | string;
  check_out_latitude?: number | null;
  check_out_longitude?: number | null;
  check_out_location_name?: string | null;
  device_info?: string | null;
  is_offsite?: boolean;
  offsite_reason?: string | null;
  offsite_location?: string | null;
  client_name?: string | null;
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
