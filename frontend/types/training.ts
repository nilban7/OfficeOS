export type TrainingProgramStatus =
  | "draft"
  | "published"
  | "completed"
  | "cancelled";

export type TrainingDeliveryMode =
  | "in_person"
  | "online"
  | "hybrid"
  | "self_paced";

export type TrainingSessionStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

export type TrainingEnrollmentStatus =
  | "enrolled"
  | "attended"
  | "completed"
  | "cancelled"
  | "no_show";

export type TrainingEnrollmentResult =
  | "passed"
  | "failed"
  | "attended";

export interface EmployeeSummary {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  designation?: string | null;
}

export interface TrainingProgramSummary {
  id: string;
  title: string;
  code: string;
  category?: string | null;
  delivery_mode: TrainingDeliveryMode;
  status: TrainingProgramStatus;
}

export interface TrainingSessionSummary {
  id: string;
  session_number: string;
  title?: string | null;
  session_date: string;
  status: TrainingSessionStatus;
}

export interface TrainingProgram {
  id: string;
  organization_id: string;
  title: string;
  code: string;
  description?: string | null;
  category?: string | null;
  provider?: string | null;
  trainer?: string | null;
  delivery_mode: TrainingDeliveryMode;
  duration_hours: number;
  capacity: number;
  cost: number;
  start_date?: string | null;
  end_date?: string | null;
  status: TrainingProgramStatus;
  created_at: string;
  updated_at: string;
  enrolled_count?: number;
  sessions_count?: number;
}

export interface TrainingSession {
  id: string;
  organization_id: string;
  training_program_id: string;
  session_number: string;
  title?: string | null;
  session_date: string;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  trainer?: string | null;
  capacity: number;
  notes?: string | null;
  status: TrainingSessionStatus;
  created_at: string;
  updated_at: string;
  training_program?: TrainingProgramSummary | null;
  enrolled_count?: number;
}

export interface TrainingEnrollment {
  id: string;
  organization_id: string;
  training_program_id: string;
  training_session_id?: string | null;
  employee_id: string;
  enrollment_date: string;
  status: TrainingEnrollmentStatus;
  completion_date?: string | null;
  score?: number | null;
  result?: TrainingEnrollmentResult | null;
  certificate_number?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  training_program?: TrainingProgramSummary | null;
  training_session?: TrainingSessionSummary | null;
  employee?: EmployeeSummary | null;
}

export interface TrainingProgramDetail extends TrainingProgram {
  sessions: TrainingSession[];
  enrollments: TrainingEnrollment[];
}

export interface TrainingSessionDetail extends TrainingSession {
  enrollments: TrainingEnrollment[];
}

export interface TrainingEnrollmentDetail extends TrainingEnrollment {}

export interface TrainingProgramCreatePayload {
  title: string;
  code: string;
  description?: string | null;
  category?: string | null;
  provider?: string | null;
  trainer?: string | null;
  delivery_mode?: TrainingDeliveryMode;
  duration_hours?: number;
  capacity?: number;
  cost?: number;
  start_date?: string | null;
  end_date?: string | null;
  status?: TrainingProgramStatus;
}

export interface TrainingProgramUpdatePayload {
  title?: string;
  code?: string;
  description?: string | null;
  category?: string | null;
  provider?: string | null;
  trainer?: string | null;
  delivery_mode?: TrainingDeliveryMode;
  duration_hours?: number;
  capacity?: number;
  cost?: number;
  start_date?: string | null;
  end_date?: string | null;
  status?: TrainingProgramStatus;
}

export interface TrainingSessionCreatePayload {
  training_program_id: string;
  session_number: string;
  title?: string | null;
  session_date: string;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  trainer?: string | null;
  capacity?: number;
  notes?: string | null;
  status?: TrainingSessionStatus;
}

export interface TrainingSessionUpdatePayload {
  session_number?: string;
  title?: string | null;
  session_date?: string;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  trainer?: string | null;
  capacity?: number;
  notes?: string | null;
  status?: TrainingSessionStatus;
}

export interface TrainingEnrollmentCreatePayload {
  training_program_id: string;
  training_session_id?: string | null;
  employee_id?: string | null;
  enrollment_date?: string | null;
  notes?: string | null;
}

export interface TrainingEnrollmentUpdatePayload {
  training_session_id?: string | null;
  status?: TrainingEnrollmentStatus;
  completion_date?: string | null;
  score?: number | null;
  result?: TrainingEnrollmentResult | null;
  certificate_number?: string | null;
  notes?: string | null;
}

export interface TrainingEnrollmentAttendPayload {
  status?: "attended" | "no_show";
  notes?: string | null;
}

export interface TrainingEnrollmentCompletePayload {
  completion_date?: string | null;
  score?: number | null;
  result?: TrainingEnrollmentResult;
  certificate_number?: string | null;
  notes?: string | null;
}
