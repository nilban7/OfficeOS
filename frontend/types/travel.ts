export type RegistrationType = "planned" | "past";

export type TravelStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "booked"
  | "ongoing"
  | "completed"
  | "cancelled";

export type SettlementStatus = "unsettled" | "pending" | "partially_settled" | "settled";

export type AdvanceStatus = "none" | "requested" | "approved" | "rejected" | "paid";

export type ExpenseStatus = "draft" | "submitted" | "approved" | "rejected" | "paid" | "cancelled";

export type TransportMode =
  | "flight"
  | "train"
  | "bus"
  | "car"
  | "local_transport"
  | "other";

export type TravelExpenseCategory =
  | "flight"
  | "train"
  | "bus"
  | "car_rental"
  | "local_transport"
  | "accommodation"
  | "meals"
  | "per_diem"
  | "client_entertainment"
  | "miscellaneous"
  | "travel_transport"
  | "hotel_accommodation"
  | "food_meals"
  | "other_expenses";

export interface TravelMember {
  id: string;
  trip_id: string;
  employee_id: string;
  employee_name?: string | null;
  employee_code?: string | null;
  department_name?: string | null;
  trip_role: string;
  participation_status: string;
  individual_departure_date?: string | null;
  individual_return_date?: string | null;
  notes?: string | null;
  total_expenses: number | string;
  created_at: string;
  updated_at: string;
}

export interface TravelItinerary {
  id: string;
  trip_id: string;
  member_id?: string | null;
  member_name?: string | null;
  type: string;
  title: string;
  departure_location?: string | null;
  arrival_location?: string | null;
  departure_time?: string | null;
  arrival_time?: string | null;
  booking_reference?: string | null;
  provider_name?: string | null;
  booking_status: string;
  estimated_cost: number | string;
  notes?: string | null;
  attachment_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TravelExpense {
  id: string;
  trip_id: string;
  employee_id: string;
  employee_name?: string | null;
  employee_code?: string | null;
  category: string;
  expense_date: string;
  description: string;
  amount: number | string;
  currency: string;
  receipt_url?: string | null;
  receipt_file_name?: string | null;
  payment_method: string;
  is_reimbursable: boolean;
  status: ExpenseStatus;
  reviewer_id?: string | null;
  reviewer_name?: string | null;
  reviewed_at?: string | null;
  reviewer_comment?: string | null;
  paid_at?: string | null;
  payment_reference?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TravelSettlement {
  id: string;
  trip_id: string;
  employee_id?: string | null;
  employee_name?: string | null;
  settlement_type: string;
  amount: number | string;
  currency: string;
  status: string;
  payment_date?: string | null;
  payment_reference?: string | null;
  payment_method?: string | null;
  settled_by_profile_id?: string | null;
  settler_name?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TravelActivityLog {
  id: string;
  trip_id: string;
  actor_id?: string | null;
  actor_name?: string | null;
  action: string;
  description: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface TravelPayment {
  id: string;
  trip_id: string;
  payer_type: "company" | "employee";
  payer_name?: string | null;
  amount: number | string;
  currency: string;
  payment_method: string;
  payment_date: string;
  transaction_reference?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TravelPaymentCreate {
  payer_type: "company" | "employee";
  payer_name?: string;
  amount: number;
  currency?: string;
  payment_method: string;
  payment_date: string;
  transaction_reference?: string;
  notes?: string;
}

export interface TravelTripActualCostsUpdate {
  act_travel_transport?: number;
  act_hotel_accommodation?: number;
  act_food_meals?: number;
  act_local_transport?: number;
  act_other_expenses?: number;
  payer_type?: "company" | "employee" | "split";
  company_paid_amount?: number;
  employee_paid_amount?: number;
}

export interface TravelTrip {
  id: string;
  organization_id: string;
  trip_number: string;
  title: string;
  business_purpose: string;
  registration_type: RegistrationType;
  status: TravelStatus;
  settlement_status: SettlementStatus;

  requester_id: string;
  requester_name?: string | null;
  requester_code?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  project_id?: string | null;
  project_name?: string | null;

  origin: string;
  destination: string;

  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;

  preferred_transport_mode?: string | null;
  actual_transport_mode?: string | null;

  estimated_budget: number | string;
  currency: string;

  // 5 Cost Categories (Estimated & Actual)
  est_travel_transport?: number | string;
  act_travel_transport?: number | string;
  est_hotel_accommodation?: number | string;
  act_hotel_accommodation?: number | string;
  est_food_meals?: number | string;
  act_food_meals?: number | string;
  est_local_transport?: number | string;
  act_local_transport?: number | string;
  est_other_expenses?: number | string;
  act_other_expenses?: number | string;

  estimated_total?: number | string;
  actual_total?: number | string;
  cost_difference?: number | string;

  // Payer details
  payer_type?: "company" | "employee" | "split";
  company_paid_amount?: number | string;
  employee_paid_amount?: number | string;

  advance_requested: number | string;
  advance_approved: number | string;
  advance_paid: number | string;
  advance_status: AdvanceStatus;

  total_submitted_expenses: number | string;
  total_approved_expenses: number | string;
  total_reimbursable_expenses: number | string;
  total_settled_amount: number | string;
  settlement_balance: number | string;
  budget_variance: number | string;

  member_count: number;
  approver_id?: string | null;
  approver_name?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TravelTripDetail extends TravelTrip {
  accommodation_notes?: string | null;
  notes?: string | null;
  missing_info_explanation?: string | null;
  advance_payment_reference?: string | null;
  advance_paid_at?: string | null;
  approver_comment?: string | null;
  booking_commitments: number | string;

  members: TravelMember[];
  itineraries: TravelItinerary[];
  expenses: TravelExpense[];
  payments: TravelPayment[];
  settlements: TravelSettlement[];
  activity_logs: TravelActivityLog[];
}

export interface TravelSummaryKPI {
  total_trips: number;
  upcoming_trips: number;
  ongoing_trips: number;
  past_trips: number;
  pending_approvals: number;
  pending_expense_reviews: number;
  unsettled_trips: number;

  total_estimated_budget: number | string;
  total_actual_approved_expenses: number | string;
  total_submitted_expenses: number | string;
  total_advances_paid: number | string;
  total_reimbursements_pending: number | string;
  currency: string;
}

export interface TravelMonthlyCost {
  month: string;
  trip_count: number;
  estimated_budget: number | string;
  approved_expenses: number | string;
}

export interface TravelDepartmentCost {
  department_name: string;
  trip_count: number;
  total_cost: number | string;
}

export interface TravelModeCost {
  mode: string;
  count: number;
  total_cost: number | string;
}

export interface TravelReportMetrics {
  summary: TravelSummaryKPI;
  monthly_trend: TravelMonthlyCost[];
  by_department: TravelDepartmentCost[];
  by_transport_mode: TravelModeCost[];
  planned_vs_past: Record<string, number>;
  status_counts: Record<string, number>;
}

export interface TravelTripCreatePlanned {
  title: string;
  business_purpose: string;
  origin: string;
  destination: string;
  planned_start_date: string;
  planned_end_date: string;
  preferred_transport_mode?: string;
  estimated_budget?: number;
  currency?: string;

  // 5 Estimated Expense Categories
  est_travel_transport?: number;
  est_hotel_accommodation?: number;
  est_food_meals?: number;
  est_local_transport?: number;
  est_other_expenses?: number;

  advance_requested?: number;
  department_id?: string;
  client_id?: string;
  project_id?: string;
  accommodation_notes?: string;
  notes?: string;
  participating_employee_ids?: string[];
  initial_expenses?: TravelExpenseCreate[];
  submit_immediately?: boolean;
}

export interface TravelTripCreatePast {
  title: string;
  business_purpose: string;
  origin: string;
  destination: string;
  actual_start_date: string;
  actual_end_date: string;
  actual_transport_mode?: string;
  estimated_budget?: number;
  currency?: string;

  // 5 Actual Expense Categories (Post-Travel has only actuals)
  act_travel_transport?: number;
  act_hotel_accommodation?: number;
  act_food_meals?: number;
  act_local_transport?: number;
  act_other_expenses?: number;

  // Payer details
  payer_type?: "company" | "employee" | "split";
  company_paid_amount?: number;
  employee_paid_amount?: number;
  payments?: TravelPaymentCreate[];

  advance_paid?: number;
  advance_payment_reference?: string;
  department_id?: string;
  client_id?: string;
  project_id?: string;
  missing_info_explanation?: string;
  notes?: string;
  status?: "completed" | "ongoing" | "draft";
  participating_employee_ids?: string[];
  initial_expenses?: TravelExpenseCreate[];
}

export interface TravelMemberCreate {
  employee_id: string;
  trip_role?: string;
  participation_status?: string;
  individual_departure_date?: string;
  individual_return_date?: string;
  notes?: string;
}

export interface TravelItineraryCreate {
  member_id?: string;
  type: string;
  title: string;
  departure_location?: string;
  arrival_location?: string;
  departure_time?: string;
  arrival_time?: string;
  booking_reference?: string;
  provider_name?: string;
  booking_status?: string;
  estimated_cost?: number;
  notes?: string;
  attachment_url?: string;
}

export interface TravelExpenseCreate {
  employee_id?: string;
  category: string;
  expense_date: string;
  description: string;
  amount: number;
  currency?: string;
  receipt_url?: string;
  receipt_file_name?: string;
  payment_method?: string;
  is_reimbursable?: boolean;
  submit_immediately?: boolean;
}

export interface TravelExpenseReviewAction {
  action: "approve" | "reject";
  reviewer_comment?: string;
}

export interface TravelSettlementCreate {
  employee_id?: string;
  settlement_type: string;
  amount: number;
  currency?: string;
  payment_date?: string;
  payment_reference: string;
  payment_method?: string;
  notes?: string;
  mark_trip_settled?: boolean;
}

export interface TravelTripApprovalAction {
  approver_comment?: string;
}
