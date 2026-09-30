export type AssetStatus =
  | "available"
  | "assigned"
  | "under_maintenance"
  | "lost"
  | "retired"
  | "disposed";

export type AssetCondition = "new" | "good" | "fair" | "poor" | "damaged";

export interface VendorSummary {
  id: string;
  vendor_code: string;
  name: string;
}

export interface EmployeeSummary {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  designation?: string | null;
}

export interface BranchSummary {
  id: string;
  name: string;
  code: string;
}

export interface POSummary {
  id: string;
  po_number: string;
}

export interface Asset {
  id: string;
  organization_id: string;
  asset_code: string;
  name: string;
  category: string;
  description?: string | null;
  serial_number?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  vendor_id?: string | null;
  purchase_order_id?: string | null;
  purchase_date?: string | null;
  purchase_cost?: number | null;
  currency: string;
  warranty_start_date?: string | null;
  warranty_end_date?: string | null;
  branch_id?: string | null;
  current_custodian_id?: string | null;
  status: AssetStatus;
  condition: AssetCondition;
  location?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  vendor?: VendorSummary | null;
  branch?: BranchSummary | null;
  current_custodian?: EmployeeSummary | null;
}

export interface AssetAssignment {
  id: string;
  organization_id: string;
  asset_id: string;
  employee_id: string;
  branch_id?: string | null;
  assigned_date: string;
  returned_date?: string | null;
  assignment_notes?: string | null;
  return_notes?: string | null;
  assigned_by_id?: string | null;
  returned_by_id?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  employee?: EmployeeSummary | null;
  branch?: BranchSummary | null;
  assigned_by?: EmployeeSummary | null;
  returned_by?: EmployeeSummary | null;
}

export interface AssetDetail extends Asset {
  active_assignment?: AssetAssignment | null;
  purchase_order?: POSummary | null;
}

export interface AssetCreatePayload {
  asset_code: string;
  name: string;
  category: string;
  description?: string;
  serial_number?: string;
  model?: string;
  manufacturer?: string;
  vendor_id?: string;
  purchase_order_id?: string;
  purchase_date?: string;
  purchase_cost?: number;
  currency?: string;
  warranty_start_date?: string;
  warranty_end_date?: string;
  branch_id?: string;
  current_custodian_id?: string;
  status?: AssetStatus;
  condition?: AssetCondition;
  location?: string;
  notes?: string;
}

export interface AssetUpdatePayload {
  name?: string;
  category?: string;
  description?: string;
  serial_number?: string;
  model?: string;
  manufacturer?: string;
  vendor_id?: string;
  purchase_order_id?: string;
  purchase_date?: string;
  purchase_cost?: number;
  currency?: string;
  warranty_start_date?: string;
  warranty_end_date?: string;
  branch_id?: string;
  status?: AssetStatus;
  condition?: AssetCondition;
  location?: string;
  notes?: string;
}

export interface AssetAssignPayload {
  employee_id: string;
  branch_id?: string;
  assigned_date?: string;
  assignment_notes?: string;
}

export interface AssetReturnPayload {
  returned_date?: string;
  return_notes?: string;
  condition?: AssetCondition;
  status?: AssetStatus;
}
