export type InternshipStatus =
  | "planned"
  | "active"
  | "completed"
  | "extended"
  | "terminated"
  | "cancelled";

export type InternshipReviewStatus = "draft" | "submitted" | "acknowledged";

export interface EmployeeSummary {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  designation?: string | null;
}

export interface InternshipSummary {
  id: string;
  title: string;
  code: string;
  intern_name: string;
  status: InternshipStatus;
  start_date: string;
  end_date: string;
}

// ---------------------------------------------------------------------------
// Internship
// ---------------------------------------------------------------------------

export interface Internship {
  id: string;
  organization_id: string;
  employee_id?: string | null;
  department_id?: string | null;
  supervisor_id?: string | null;
  title: string;
  code: string;
  intern_name: string;
  intern_email?: string | null;
  institution?: string | null;
  start_date: string;
  end_date: string;
  status: InternshipStatus;
  stipend: string;
  description?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  supervisor?: EmployeeSummary | null;
  supervisors_count: number;
  reviews_count: number;
}

export interface InternshipDetail extends Internship {
  supervisors: InternshipSupervisor[];
  reviews: InternshipReview[];
  students?: InternshipStudent[];
  documents?: InternshipDocument[];
}

export interface InternshipCreate {
  title: string;
  code: string;
  intern_name: string;
  intern_email?: string | null;
  institution?: string | null;
  department_id?: string | null;
  supervisor_id?: string | null;
  employee_id?: string | null;
  start_date: string;
  end_date: string;
  status?: InternshipStatus;
  stipend?: string;
  description?: string | null;
  notes?: string | null;
}

export interface InternshipUpdate {
  title?: string;
  code?: string;
  intern_name?: string;
  intern_email?: string | null;
  institution?: string | null;
  department_id?: string | null;
  supervisor_id?: string | null;
  employee_id?: string | null;
  start_date?: string;
  end_date?: string;
  status?: InternshipStatus;
  stipend?: string;
  description?: string | null;
  notes?: string | null;
}

export interface InternshipExtend {
  new_end_date: string;
  notes?: string | null;
}

export interface InternshipAction {
  notes?: string | null;
}

export interface InternshipListResponse {
  items: Internship[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ---------------------------------------------------------------------------
// Supervisor
// ---------------------------------------------------------------------------

export interface InternshipSupervisor {
  id: string;
  organization_id: string;
  internship_id: string;
  employee_id: string;
  role: string;
  created_at: string;
  employee?: EmployeeSummary | null;
}

export interface InternshipSupervisorCreate {
  employee_id: string;
  role?: string;
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export interface InternshipReview {
  id: string;
  organization_id: string;
  internship_id: string;
  reviewer_id?: string | null;
  review_date: string;
  rating?: number | null;
  feedback?: string | null;
  status: InternshipReviewStatus;
  created_at: string;
  updated_at: string;
  reviewer?: EmployeeSummary | null;
  internship?: InternshipSummary | null;
}

export interface InternshipReviewCreate {
  review_date: string;
  rating?: number | null;
  feedback?: string | null;
  reviewer_id?: string | null;
  status?: InternshipReviewStatus;
}

export interface InternshipReviewUpdate {
  review_date?: string;
  rating?: number | null;
  feedback?: string | null;
  reviewer_id?: string | null;
  status?: InternshipReviewStatus;
}

export interface InternshipReviewListResponse {
  items: InternshipReview[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ---------------------------------------------------------------------------
// Student / Cohort Enrolled Interns
// ---------------------------------------------------------------------------

export interface InternshipStudent {
  id: string;
  organization_id: string;
  internship_id: string;
  student_name: string;
  student_email?: string | null;
  institution?: string | null;
  stipend: string | number;
  status: "planned" | "active" | "completed" | "terminated";
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InternshipStudentCreate {
  student_name: string;
  student_email?: string | null;
  institution?: string | null;
  stipend?: number | string;
  status?: "planned" | "active" | "completed" | "terminated";
  notes?: string | null;
}

export interface InternshipStudentUpdate {
  student_name?: string;
  student_email?: string | null;
  institution?: string | null;
  stipend?: number | string;
  status?: "planned" | "active" | "completed" | "terminated";
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export type InternshipDocumentType =
  | "offer_letter"
  | "agreement_nda"
  | "id_proof"
  | "college_noc"
  | "completion_certificate"
  | "evaluation_report"
  | "other";

export interface InternshipDocument {
  id: string;
  organization_id: string;
  internship_id: string;
  title: string;
  document_type: InternshipDocumentType;
  intern_name?: string | null;
  file_name: string;
  file_size: number;
  mime_type: string;
  file_url?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface InternshipDocumentCreate {
  title: string;
  document_type: InternshipDocumentType;
  intern_name?: string | null;
  file_name: string;
  file_size?: number;
  mime_type?: string;
  file_url?: string | null;
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Stipend Disbursements
// ---------------------------------------------------------------------------

export interface StipendDisbursement {
  id: string;
  organization_id: string;
  payroll_id?: string | null;
  internship_id: string;
  intern_name: string;
  period_month: number;
  period_year: number;
  stipend_amount: string | number;
  status: "pending" | "approved" | "paid" | "cancelled";
  payment_method: string;
  payment_reference?: string | null;
  disbursed_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  internship_title?: string | null;
  internship_code?: string | null;
}

export interface StipendDisburseRequest {
  payment_method?: string;
  payment_reference?: string | null;
  notes?: string | null;
}

export interface StipendCreateDisburseRequest {
  internship_id: string;
  intern_name: string;
  period_month: number;
  period_year: number;
  stipend_amount: number | string;
  payroll_id?: string | null;
  payment_method?: string;
  payment_reference?: string | null;
  notes?: string | null;
}

