export type ReimbursementStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "paid"
  | "cancelled";

export type ReimbursementCategory =
  | "travel"
  | "meals"
  | "office_supplies"
  | "tech_hardware"
  | "software_subscriptions"
  | "medical"
  | "telecom"
  | "professional_development"
  | "other";

export interface ReimbursementClaimItem {
  description: string;
  amount: number | string;
  category?: string;
  expense_date?: string;
  receipt_url?: string;
}

export interface ReimbursementClaim {
  id: string;
  organization_id: string;
  employee_id: string;
  employee_name?: string | null;
  employee_code?: string | null;
  claim_number: string;
  title: string;
  category: string;
  claim_date: string;
  amount: number | string;
  currency: string;
  status: ReimbursementStatus;
  receipt_url?: string | null;
  description?: string | null;
  items: ReimbursementClaimItem[];
  submitted_at?: string | null;
  reviewer_id?: string | null;
  reviewer_name?: string | null;
  reviewed_at?: string | null;
  reviewer_comment?: string | null;
  paid_at?: string | null;
  payment_reference?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReimbursementClaimCreate {
  title: string;
  category: string;
  claim_date: string;
  amount: number;
  currency?: string;
  description?: string;
  receipt_url?: string;
  items: ReimbursementClaimItem[];
  employee_id?: string;
  submit_immediately?: boolean;
}

export interface ReimbursementClaimUpdate {
  title?: string;
  category?: string;
  claim_date?: string;
  amount?: number;
  currency?: string;
  description?: string;
  receipt_url?: string;
  items?: ReimbursementClaimItem[];
}

export interface ReimbursementReviewAction {
  reviewer_comment?: string;
}

export interface ReimbursementPayAction {
  payment_reference?: string;
  notes?: string;
}

export interface ReimbursementSummaryKPI {
  total_claims_count: number;
  pending_approval_count: number;
  approved_unpaid_count: number;
  paid_claims_count: number;
  total_claimed_amount: number | string;
  pending_approval_amount: number | string;
  total_reimbursed_amount: number | string;
  currency: string;
}
