export type EngagementStage =
  | "proposal"
  | "agreement"
  | "kickoff"
  | "delivery"
  | "weekly_reporting"
  | "uat"
  | "issues_triage"
  | "acceptance_handover"
  | "maintenance_support";

export type DeliveryHealth = "on_track" | "at_risk" | "blocked" | "completed";

export interface EngagementOverview {
  active_engagements_count: number;
  proposals_pending_count: number;
  agreements_pending_signatures_count: number;
  kickoff_ready_count: number;
  active_delivery_count: number;
  open_critical_issues_count: number;
  uat_active_count: number;
  total_pipeline_value: number | string;
  total_collected_value: number | string;
}

export interface ClientEngagementSummary {
  id: string;
  engagement_code: string;
  title: string;
  client_id: string;
  client_name?: string | null;
  project_id?: string | null;
  current_stage: EngagementStage;
  delivery_health: DeliveryHealth;
  progress_percentage: number;
  contract_value?: number | string | null;
  currency: string;
  target_completion_date?: string | null;
  created_at: string;
}

export interface ProposalItem {
  id: string;
  organization_id: string;
  engagement_id: string;
  proposal_number: string;
  title: string;
  version: number;
  status: "draft" | "in_review" | "sent" | "accepted" | "declined" | "expired";
  total_amount: number | string;
  currency: string;
  valid_until?: string | null;
  scope_of_work?: string | null;
  deliverables_json?: any;
  line_items_json?: any;
  payment_terms?: string | null;
  sent_at?: string | null;
  accepted_at?: string | null;
  created_at: string;
}

export interface SignatureItem {
  id: string;
  signer_name: string;
  signer_email: string;
  signer_role: "internal" | "client";
  signer_title?: string | null;
  status: "pending" | "signed" | "declined";
  signed_at?: string | null;
  signature_checksum?: string | null;
}

export interface AgreementItem {
  id: string;
  organization_id: string;
  engagement_id: string;
  agreement_number: string;
  title: string;
  agreement_type: "sow" | "msa" | "nda" | "sla" | "amendment";
  status: "draft" | "under_review" | "pending_signatures" | "partially_signed" | "active" | "terminated" | "expired";
  contract_value: number | string;
  currency: string;
  effective_date?: string | null;
  expiry_date?: string | null;
  document_sha256?: string | null;
  created_at: string;
  signatures: SignatureItem[];
}

export interface WeeklyReportItem {
  id: string;
  engagement_id: string;
  report_number: string;
  week_start_date: string;
  week_end_date: string;
  executive_summary: string;
  accomplishments?: string[] | null;
  next_week_plans?: string[] | null;
  risks_and_blockers?: string[] | null;
  delivery_health: DeliveryHealth;
  client_action_items?: string | null;
  is_published: boolean;
  published_at?: string | null;
  created_at: string;
}

export interface UatTestCaseItem {
  id: string;
  session_id: string;
  title: string;
  instructions: string;
  expected_outcome: string;
  status: "pending" | "pass" | "fail" | "blocked";
  actual_outcome?: string | null;
  tested_by_name?: string | null;
  tested_at?: string | null;
}

export interface UatSessionItem {
  id: string;
  engagement_id: string;
  session_title: string;
  build_version: string;
  staging_url?: string | null;
  status: "draft" | "active" | "completed" | "approved" | "rejected";
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
  test_cases: UatTestCaseItem[];
}

export interface ClientIssueItem {
  id: string;
  engagement_id: string;
  issue_number: string;
  title: string;
  description: string;
  issue_type: "clarification" | "bug" | "enhancement" | "access" | "scope_change";
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "closed";
  reported_by_name: string;
  assigned_employee_id?: string | null;
  resolution_notes?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

export interface ChangeRequestItem {
  id: string;
  engagement_id: string;
  cr_number: string;
  title: string;
  justification: string;
  scope_delta: string;
  additional_cost: number | string;
  additional_days: number;
  status: "draft" | "under_review" | "approved" | "rejected";
  created_at: string;
}

export interface HandoverItem {
  id: string;
  engagement_id: string;
  handover_number: string;
  deliverables_accepted: boolean;
  documentation_provided: boolean;
  client_signoff_name?: string | null;
  client_signoff_at?: string | null;
  warranty_start_date?: string | null;
  warranty_end_date?: string | null;
  sla_tier?: string | null;
  notes?: string | null;
}

export interface ClientEngagementDetail extends ClientEngagementSummary {
  description?: string | null;
  invoiced_amount: number | string;
  collected_amount: number | string;
  actual_completion_date?: string | null;
  engagement_lead_id?: string | null;
  proposals: ProposalItem[];
  agreements: AgreementItem[];
  weekly_reports: WeeklyReportItem[];
  uat_sessions: UatSessionItem[];
  issues: ClientIssueItem[];
  change_requests: ChangeRequestItem[];
  handover?: HandoverItem | null;
}
