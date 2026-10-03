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
