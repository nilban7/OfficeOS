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
