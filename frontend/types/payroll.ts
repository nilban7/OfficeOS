export interface SalaryStructure {
  id: string;
  organization_id: string;
  employee_id: string;
  employee_name?: string | null;
  employee_code?: string | null;
  currency: string;
  base_salary: number | string;
  hra: number | string;
  allowances: Record<string, number>;
  deductions: Record<string, number>;
  payment_frequency: string;
  effective_from: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SalaryStructureCreate {
  employee_id: string;
  currency?: string;
  base_salary: number;
  hra?: number;
  allowances?: Record<string, number>;
  deductions?: Record<string, number>;
  payment_frequency?: string;
  effective_from: string;
  is_active?: boolean;
}

export type PayrollStatus = "draft" | "processing" | "approved" | "paid" | "cancelled";

export interface PayrollRun {
  id: string;
  organization_id: string;
  title: string;
  period_month: number;
  period_year: number;
  status: PayrollStatus;
  total_gross_pay: number | string;
  total_deductions: number | string;
  total_net_pay: number | string;
  total_bonus_pay?: number | string;
  employee_count: number;
  processed_by?: string | null;
  approved_by?: string | null;
  payment_date?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollRunCreate {
  period_month: number;
  period_year: number;
  title?: string;
  notes?: string;
}

export type PayslipStatus = "draft" | "pending" | "paid" | "cancelled";

export interface Payslip {
  id: string;
  organization_id: string;
  payroll_id: string;
  employee_id: string;
  employee_name?: string | null;
  employee_code?: string | null;
  department_name?: string | null;
  payslip_number: string;
  base_salary: number | string;
  bonus_amount?: number | string;
  gross_pay: number | string;
  total_deductions: number | string;
  net_pay: number | string;
  paid_days: number;
  unpaid_days: number;
  earnings_breakdown: Record<string, number>;
  deductions_breakdown: Record<string, number>;
  status: PayslipStatus;
  payment_method: string;
  payment_reference?: string | null;
  disbursement_date?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayslipDisburseRequest {
  payment_method: string;
  payment_reference?: string;
  disbursement_date?: string;
}

export interface PayrollSummaryKPI {
  monthly_payroll_total: number | string;
  pending_approvals_count: number;
  total_disbursed_ytd: number | string;
  active_employees_count: number;
  currency: string;
}

export type BonusType = "bulk" | "individual" | "project";
export type BonusCalculationType = "fixed" | "percentage";
export type BonusCalculationBase = "base_salary" | "project_budget" | "custom";
export type BonusStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "included_in_payroll"
  | "paid"
  | "rejected"
  | "cancelled";

export interface BonusAllocation {
  id: string;
  organization_id: string;
  bonus_id: string;
  employee_id: string;
  employee_name?: string | null;
  employee_code?: string | null;
  department_name?: string | null;
  amount: number | string;
  percentage_rate?: number | string | null;
  calculation_base_amount?: number | string | null;
  currency: string;
  status: BonusStatus;
  payroll_id?: string | null;
  payslip_id?: string | null;
  period_month: number;
  period_year: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Bonus {
  id: string;
  organization_id: string;
  name: string;
  description?: string | null;
  bonus_type: BonusType;
  calculation_type: BonusCalculationType;
  calculation_base?: BonusCalculationBase | string | null;
  rate_or_amount: number | string;
  currency: string;
  period_month: number;
  period_year: number;
  status: BonusStatus;
  total_amount: number | string;
  employee_count: number;
  project_id?: string | null;
  project_reference?: string | null;
  target_department_id?: string | null;
  rejection_reason?: string | null;
  notes?: string | null;
  created_by?: string | null;
  approved_by?: string | null;
  rejected_by?: string | null;
  cancelled_by?: string | null;
  created_at: string;
  updated_at: string;
  allocations?: BonusAllocation[];
}

export interface BonusCreate {
  name: string;
  description?: string;
  bonus_type: BonusType;
  calculation_type: BonusCalculationType;
  calculation_base?: BonusCalculationBase | string;
  rate_or_amount: number;
  currency: string;
  period_month: number;
  period_year: number;
  project_id?: string;
  project_reference?: string;
  target_department_id?: string;
  notes?: string;
  employee_ids?: string[];
  allocations?: Array<{
    employee_id: string;
    amount: number;
    percentage_rate?: number;
    calculation_base_amount?: number;
    notes?: string;
  }>;
}

export interface BonusPreviewRequest {
  bonus_type: BonusType;
  calculation_type: BonusCalculationType;
  calculation_base?: BonusCalculationBase | string;
  rate_or_amount: number;
  currency: string;
  period_month: number;
  period_year: number;
  project_id?: string;
  target_department_id?: string;
  employee_ids?: string[];
}

export interface BonusPreviewItem {
  employee_id: string;
  employee_name: string;
  employee_code?: string | null;
  department_name?: string | null;
  base_salary: number | string;
  bonus_amount: number | string;
  percentage_rate?: number | string | null;
}

export interface BonusPreviewResponse {
  currency: string;
  total_estimated_amount: number | string;
  employee_count: number;
  items: BonusPreviewItem[];
}

