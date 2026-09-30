export type MaintenanceRequestStatus =
  | "submitted"
  | "approved"
  | "rejected"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

export type MaintenanceRequestPriority = "low" | "medium" | "high" | "urgent";

export type MaintenanceRecordStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

export type MaintenanceType =
  | "corrective"
  | "preventive"
  | "inspection"
  | "upgrade";

export interface AssetSummary {
  id: string;
  asset_code: string;
  name: string;
  status: string;
  condition: string;
}

export interface EmployeeSummary {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  designation?: string | null;
}

export interface VendorSummary {
  id: string;
  vendor_code: string;
  name: string;
}

export interface BranchSummary {
  id: string;
  name: string;
  code: string;
}

export interface MaintenanceRequest {
  id: string;
  organization_id: string;
  request_number: string;
  asset_id: string;
  requester_id: string;
  branch_id?: string | null;
  issue_title: string;
  issue_description?: string | null;
  priority: MaintenanceRequestPriority;
  requested_date: string;
  status: MaintenanceRequestStatus;
  rejection_reason?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  asset?: AssetSummary | null;
  requester?: EmployeeSummary | null;
  branch?: BranchSummary | null;
}

export interface MaintenanceRecord {
  id: string;
  organization_id: string;
  record_number: string;
  maintenance_request_id?: string | null;
  asset_id: string;
  technician_id?: string | null;
  vendor_id?: string | null;
  maintenance_type: MaintenanceType;
  start_date: string;
  completion_date?: string | null;
  status: MaintenanceRecordStatus;
  description?: string | null;
  parts_description?: string | null;
  labor_cost: number;
  parts_cost: number;
  other_cost: number;
  total_cost: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  asset?: AssetSummary | null;
  technician?: EmployeeSummary | null;
  vendor?: VendorSummary | null;
}

export interface MaintenanceRequestDetail extends MaintenanceRequest {
  records: MaintenanceRecord[];
}

export interface MaintenanceRecordDetail extends MaintenanceRecord {
  maintenance_request?: MaintenanceRequest | null;
}

export interface MaintenanceRequestCreatePayload {
  asset_id: string;
  requester_id?: string;
  branch_id?: string;
  issue_title: string;
  issue_description?: string;
  priority?: MaintenanceRequestPriority;
  requested_date?: string;
  notes?: string;
}

export interface MaintenanceRequestUpdatePayload {
  issue_title?: string;
  issue_description?: string;
  priority?: MaintenanceRequestPriority;
  branch_id?: string;
  notes?: string;
}

export interface MaintenanceRequestRejectPayload {
  rejection_reason: string;
}

export interface MaintenanceRecordCreatePayload {
  maintenance_request_id?: string;
  asset_id: string;
  technician_id?: string;
  vendor_id?: string;
  maintenance_type?: MaintenanceType;
  start_date?: string;
  completion_date?: string;
  description?: string;
  parts_description?: string;
  labor_cost?: number;
  parts_cost?: number;
  other_cost?: number;
  notes?: string;
}

export interface MaintenanceRecordUpdatePayload {
  technician_id?: string;
  vendor_id?: string;
  maintenance_type?: MaintenanceType;
  start_date?: string;
  completion_date?: string;
  description?: string;
  parts_description?: string;
  labor_cost?: number;
  parts_cost?: number;
  other_cost?: number;
  notes?: string;
}

export interface MaintenanceRecordStartPayload {
  start_date?: string;
  technician_id?: string;
  vendor_id?: string;
  notes?: string;
}

export interface MaintenanceRecordCompletePayload {
  completion_date?: string;
  labor_cost?: number;
  parts_cost?: number;
  other_cost?: number;
  description?: string;
  parts_description?: string;
  notes?: string;
}

export interface MaintenanceActionPayload {
  notes?: string;
}
