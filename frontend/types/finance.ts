export type ExpenseStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "cancelled"
  | "paid";

export type TransactionStatus = "pending" | "posted" | "void";

export interface EmployeeSummary {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  designation?: string | null;
}

export interface CategorySummary {
  id: string;
  name: string;
  code: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  code: string;
}

export interface ClientSummary {
  id: string;
  name: string;
}

export interface VendorSummary {
  id: string;
  name: string;
  code: string;
}

export interface BranchSummary {
  id: string;
  name: string;
  code: string;
}

export interface ExpenseCategory {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCategoryCreate {
  name: string;
  code: string;
  description?: string | null;
  is_active?: boolean;
}

export interface ExpenseCategoryUpdate {
  name?: string;
  description?: string | null;
  is_active?: boolean;
}

export interface ExpenseItem {
  id: string;
  organization_id: string;
  expense_id: string;
  description: string;
  quantity: string | number;
  unit_price: string | number;
  tax_amount: string | number;
  line_total: string | number;
  created_at: string;
}

export interface ExpenseItemCreate {
  description: string;
  quantity: number | string;
  unit_price: number | string;
  tax_amount?: number | string;
}

export interface Expense {
  id: string;
  organization_id: string;
  expense_number: string;
  employee_id: string;
  category_id: string;
  project_id?: string | null;
  client_id?: string | null;
  branch_id?: string | null;
  expense_date: string;
  description?: string | null;
  amount: string | number;
  tax_amount: string | number;
  total_amount: string | number;
  currency: string;
  status: ExpenseStatus;
  submitted_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  paid_at?: string | null;
  reviewer_id?: string | null;
  reviewer_comment?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  employee?: EmployeeSummary | null;
  category?: CategorySummary | null;
  project?: ProjectSummary | null;
  client?: ClientSummary | null;
  branch?: BranchSummary | null;
  reviewer?: EmployeeSummary | null;
  items_count?: number;
}

export interface ExpenseDetail extends Expense {
  items: ExpenseItem[];
}

export interface ExpenseCreate {
  expense_number: string;
  employee_id: string;
  category_id: string;
  project_id?: string | null;
  client_id?: string | null;
  branch_id?: string | null;
  expense_date: string;
  description?: string | null;
  amount: number | string;
  tax_amount?: number | string;
  currency?: string;
  notes?: string | null;
  items?: ExpenseItemCreate[];
}

export interface ExpenseUpdate {
  category_id?: string;
  project_id?: string | null;
  client_id?: string | null;
  branch_id?: string | null;
  expense_date?: string;
  description?: string | null;
  amount?: number | string;
  tax_amount?: number | string;
  currency?: string;
  notes?: string | null;
  items?: ExpenseItemCreate[];
}

export interface ExpenseAction {
  notes?: string | null;
}

export interface ExpenseReviewAction {
  comment?: string | null;
}

export interface ExpensePayAction {
  notes?: string | null;
}

export interface FinancialTransaction {
  id: string;
  organization_id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: string;
  reference_type?: string | null;
  reference_id?: string | null;
  description: string;
  debit: string | number;
  credit: string | number;
  currency: string;
  project_id?: string | null;
  client_id?: string | null;
  vendor_id?: string | null;
  employee_id?: string | null;
  status: TransactionStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  project?: ProjectSummary | null;
  client?: ClientSummary | null;
  vendor?: VendorSummary | null;
  employee?: EmployeeSummary | null;
}

export interface FinancialTransactionCreate {
  transaction_number: string;
  transaction_date: string;
  transaction_type: string;
  reference_type?: string | null;
  reference_id?: string | null;
  description: string;
  debit?: number | string;
  credit?: number | string;
  currency?: string;
  project_id?: string | null;
  client_id?: string | null;
  vendor_id?: string | null;
  employee_id?: string | null;
  notes?: string | null;
}

export interface FinancialTransactionUpdate {
  description?: string;
  status?: TransactionStatus;
  notes?: string | null;
}

export interface FinancialOverview {
  total_expenses: string | number;
  pending_approvals_count: number;
  approved_expenses_count: number;
  paid_expenses_count: number;
  total_debits: string | number;
  total_credits: string | number;
}
