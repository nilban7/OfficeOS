import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

RegistrationType = Literal["planned", "past"]
TravelStatus = Literal[
    "draft",
    "pending_approval",
    "approved",
    "rejected",
    "booked",
    "ongoing",
    "completed",
    "cancelled",
]
SettlementStatus = Literal["unsettled", "pending", "partially_settled", "settled"]
AdvanceStatus = Literal["none", "requested", "approved", "rejected", "paid"]
ExpenseStatus = Literal["draft", "submitted", "approved", "rejected", "paid", "cancelled"]


# ---------------- Member Schemas ----------------
class TravelMemberCreate(BaseModel):
    employee_id: uuid.UUID
    trip_role: str = Field(default="participant", max_length=50)
    participation_status: str = Field(default="confirmed", max_length=30)
    individual_departure_date: date | None = None
    individual_return_date: date | None = None
    notes: str | None = None


class TravelMemberUpdate(BaseModel):
    trip_role: str | None = None
    participation_status: str | None = None
    individual_departure_date: date | None = None
    individual_return_date: date | None = None
    notes: str | None = None


class TravelMemberResponse(BaseModel):
    id: uuid.UUID
    trip_id: uuid.UUID
    employee_id: uuid.UUID
    employee_name: str | None = None
    employee_code: str | None = None
    department_name: str | None = None
    trip_role: str
    participation_status: str
    individual_departure_date: date | None = None
    individual_return_date: date | None = None
    notes: str | None = None
    total_expenses: Decimal = Decimal("0.00")
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------- Itinerary & Booking Schemas ----------------
class TravelItineraryCreate(BaseModel):
    member_id: uuid.UUID | None = None
    type: str = Field(default="flight", max_length=50)
    title: str = Field(..., min_length=2, max_length=255)
    departure_location: str | None = Field(None, max_length=255)
    arrival_location: str | None = Field(None, max_length=255)
    departure_time: datetime | None = None
    arrival_time: datetime | None = None
    booking_reference: str | None = Field(None, max_length=100)
    provider_name: str | None = Field(None, max_length=150)
    booking_status: str = Field(default="confirmed", max_length=30)
    estimated_cost: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    notes: str | None = None
    attachment_url: str | None = Field(None, max_length=500)


class TravelItineraryUpdate(BaseModel):
    member_id: uuid.UUID | None = None
    type: str | None = None
    title: str | None = None
    departure_location: str | None = None
    arrival_location: str | None = None
    departure_time: datetime | None = None
    arrival_time: datetime | None = None
    booking_reference: str | None = None
    provider_name: str | None = None
    booking_status: str | None = None
    estimated_cost: Decimal | None = Field(None, ge=Decimal("0.00"))
    notes: str | None = None
    attachment_url: str | None = None


class TravelItineraryResponse(BaseModel):
    id: uuid.UUID
    trip_id: uuid.UUID
    member_id: uuid.UUID | None = None
    member_name: str | None = None
    type: str
    title: str
    departure_location: str | None = None
    arrival_location: str | None = None
    departure_time: datetime | None = None
    arrival_time: datetime | None = None
    booking_reference: str | None = None
    provider_name: str | None = None
    booking_status: str
    estimated_cost: Decimal
    notes: str | None = None
    attachment_url: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------- Expense Schemas ----------------
class TravelExpenseCreate(BaseModel):
    employee_id: uuid.UUID | None = None  # If not provided, defaults to requester/current user
    category: str = Field(default="miscellaneous", max_length=50)
    expense_date: date = Field(default_factory=date.today)
    description: str = Field(..., min_length=2, max_length=255)
    amount: Decimal = Field(..., ge=Decimal("0.00"))
    currency: str = Field(default="USD", max_length=10)
    receipt_url: str | None = Field(None, max_length=500)
    receipt_file_name: str | None = Field(None, max_length=255)
    payment_method: str = Field(default="employee_paid", max_length=50)
    is_reimbursable: bool = True
    submit_immediately: bool = True


class TravelExpenseUpdate(BaseModel):
    category: str | None = None
    expense_date: date | None = None
    description: str | None = None
    amount: Decimal | None = Field(None, ge=Decimal("0.00"))
    currency: str | None = None
    receipt_url: str | None = None
    receipt_file_name: str | None = None
    payment_method: str | None = None
    is_reimbursable: bool | None = None


class TravelExpenseReviewAction(BaseModel):
    action: Literal["approve", "reject"]
    reviewer_comment: str | None = None


class TravelExpensePayAction(BaseModel):
    payment_reference: str | None = None


class TravelExpenseResponse(BaseModel):
    id: uuid.UUID
    trip_id: uuid.UUID
    employee_id: uuid.UUID
    employee_name: str | None = None
    employee_code: str | None = None
    category: str
    expense_date: date
    description: str
    amount: Decimal
    currency: str
    receipt_url: str | None = None
    receipt_file_name: str | None = None
    payment_method: str
    is_reimbursable: bool
    status: str
    reviewer_id: uuid.UUID | None = None
    reviewer_name: str | None = None
    reviewed_at: datetime | None = None
    reviewer_comment: str | None = None
    paid_at: datetime | None = None
    payment_reference: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------- Advances & Settlement Schemas ----------------
class TravelAdvanceRequest(BaseModel):
    amount: Decimal = Field(..., gt=Decimal("0.00"))
    notes: str | None = None


class TravelAdvanceReviewAction(BaseModel):
    action: Literal["approve", "reject"]
    approved_amount: Decimal | None = None
    reviewer_comment: str | None = None


class TravelAdvancePayAction(BaseModel):
    payment_reference: str = Field(..., min_length=1, max_length=100)
    amount_paid: Decimal | None = None


class TravelSettlementCreate(BaseModel):
    employee_id: uuid.UUID | None = None
    settlement_type: str = Field(default="final_balance", max_length=50)  # reimbursement | recovery | final_balance
    amount: Decimal = Field(..., ge=Decimal("0.00"))
    currency: str = Field(default="USD", max_length=10)
    payment_date: date = Field(default_factory=date.today)
    payment_reference: str = Field(..., min_length=1, max_length=100)
    payment_method: str = Field(default="bank_transfer", max_length=50)
    notes: str | None = None
    mark_trip_settled: bool = True


class TravelSettlementResponse(BaseModel):
    id: uuid.UUID
    trip_id: uuid.UUID
    employee_id: uuid.UUID | None = None
    employee_name: str | None = None
    settlement_type: str
    amount: Decimal
    currency: str
    status: str
    payment_date: date | None = None
    payment_reference: str | None = None
    payment_method: str | None = None
    settled_by_profile_id: uuid.UUID | None = None
    settler_name: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------- Payment Entry Schemas ----------------
class TravelPaymentCreate(BaseModel):
    payer_type: Literal["company", "employee"] = "company"
    payer_name: str | None = Field(None, max_length=150)
    amount: Decimal = Field(..., ge=Decimal("0.00"))
    currency: str = Field(default="USD", max_length=10)
    payment_method: str = Field(default="corporate_card", max_length=50)
    payment_date: date = Field(default_factory=date.today)
    transaction_reference: str | None = Field(None, max_length=100)
    notes: str | None = None


class TravelPaymentResponse(BaseModel):
    id: uuid.UUID
    trip_id: uuid.UUID
    payer_type: str
    payer_name: str | None = None
    amount: Decimal
    currency: str
    payment_method: str
    payment_date: date
    transaction_reference: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------- Trip Schemas ----------------
class TravelTripCreatePlanned(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    business_purpose: str = Field(..., min_length=5)
    origin: str = Field(..., min_length=2, max_length=255)
    destination: str = Field(..., min_length=2, max_length=255)
    planned_start_date: date
    planned_end_date: date
    preferred_transport_mode: str | None = Field(default="flight", max_length=50)
    estimated_budget: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    currency: str = Field(default="USD", max_length=10)

    # 5 Expense Categories (Estimated)
    est_travel_transport: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    est_hotel_accommodation: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    est_food_meals: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    est_local_transport: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    est_other_expenses: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))

    advance_requested: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    department_id: uuid.UUID | None = None
    client_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    accommodation_notes: str | None = None
    notes: str | None = None
    participating_employee_ids: list[uuid.UUID] = Field(default_factory=list)
    itineraries: list[TravelItineraryCreate] = Field(default_factory=list)
    initial_expenses: list[TravelExpenseCreate] = Field(default_factory=list)
    submit_immediately: bool = False


class TravelTripCreatePast(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    business_purpose: str = Field(..., min_length=5)
    origin: str = Field(..., min_length=2, max_length=255)
    destination: str = Field(..., min_length=2, max_length=255)
    actual_start_date: date
    actual_end_date: date
    actual_transport_mode: str | None = Field(default="flight", max_length=50)
    estimated_budget: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    currency: str = Field(default="USD", max_length=10)

    # 5 Expense Categories (Actual costs only for post-travel)
    act_travel_transport: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    act_hotel_accommodation: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    act_food_meals: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    act_local_transport: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    act_other_expenses: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))

    # Payer details
    payer_type: Literal["company", "employee", "split"] = "company"
    company_paid_amount: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    employee_paid_amount: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    payments: list[TravelPaymentCreate] = Field(default_factory=list)

    advance_paid: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    advance_payment_reference: str | None = None
    department_id: uuid.UUID | None = None
    client_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    missing_info_explanation: str | None = None
    notes: str | None = None
    status: Literal["completed", "ongoing", "draft"] = "completed"
    participating_employee_ids: list[uuid.UUID] = Field(default_factory=list)
    initial_expenses: list[TravelExpenseCreate] = Field(default_factory=list)


class TravelTripUpdate(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=255)
    business_purpose: str | None = None
    origin: str | None = None
    destination: str | None = None
    planned_start_date: date | None = None
    planned_end_date: date | None = None
    actual_start_date: date | None = None
    actual_end_date: date | None = None
    preferred_transport_mode: str | None = None
    actual_transport_mode: str | None = None
    estimated_budget: Decimal | None = Field(None, ge=Decimal("0.00"))
    currency: str | None = None

    # Categories
    est_travel_transport: Decimal | None = Field(None, ge=Decimal("0.00"))
    act_travel_transport: Decimal | None = Field(None, ge=Decimal("0.00"))
    est_hotel_accommodation: Decimal | None = Field(None, ge=Decimal("0.00"))
    act_hotel_accommodation: Decimal | None = Field(None, ge=Decimal("0.00"))
    est_food_meals: Decimal | None = Field(None, ge=Decimal("0.00"))
    act_food_meals: Decimal | None = Field(None, ge=Decimal("0.00"))
    est_local_transport: Decimal | None = Field(None, ge=Decimal("0.00"))
    act_local_transport: Decimal | None = Field(None, ge=Decimal("0.00"))
    est_other_expenses: Decimal | None = Field(None, ge=Decimal("0.00"))
    act_other_expenses: Decimal | None = Field(None, ge=Decimal("0.00"))

    payer_type: Literal["company", "employee", "split"] | None = None
    company_paid_amount: Decimal | None = Field(None, ge=Decimal("0.00"))
    employee_paid_amount: Decimal | None = Field(None, ge=Decimal("0.00"))

    department_id: uuid.UUID | None = None
    client_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    accommodation_notes: str | None = None
    notes: str | None = None
    missing_info_explanation: str | None = None


class TravelTripActualCostsUpdate(BaseModel):
    act_travel_transport: Decimal | None = Field(None, ge=Decimal("0.00"))
    act_hotel_accommodation: Decimal | None = Field(None, ge=Decimal("0.00"))
    act_food_meals: Decimal | None = Field(None, ge=Decimal("0.00"))
    act_local_transport: Decimal | None = Field(None, ge=Decimal("0.00"))
    act_other_expenses: Decimal | None = Field(None, ge=Decimal("0.00"))
    payer_type: Literal["company", "employee", "split"] | None = None
    company_paid_amount: Decimal | None = Field(None, ge=Decimal("0.00"))
    employee_paid_amount: Decimal | None = Field(None, ge=Decimal("0.00"))


class TravelTripApprovalAction(BaseModel):
    approver_comment: str | None = None


class TravelActivityLogResponse(BaseModel):
    id: uuid.UUID
    trip_id: uuid.UUID
    actor_id: uuid.UUID | None = None
    actor_name: str | None = None
    action: str
    description: str
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TravelTripResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    trip_number: str
    title: str
    business_purpose: str
    registration_type: RegistrationType
    status: TravelStatus
    settlement_status: SettlementStatus

    requester_id: uuid.UUID
    requester_name: str | None = None
    requester_code: str | None = None
    department_id: uuid.UUID | None = None
    department_name: str | None = None
    client_id: uuid.UUID | None = None
    client_name: str | None = None
    project_id: uuid.UUID | None = None
    project_name: str | None = None

    origin: str
    destination: str

    planned_start_date: date | None = None
    planned_end_date: date | None = None
    actual_start_date: date | None = None
    actual_end_date: date | None = None

    preferred_transport_mode: str | None = None
    actual_transport_mode: str | None = None

    estimated_budget: Decimal
    currency: str

    # 5 Expense Categories (Estimated & Actual)
    est_travel_transport: Decimal = Decimal("0.00")
    act_travel_transport: Decimal = Decimal("0.00")
    est_hotel_accommodation: Decimal = Decimal("0.00")
    act_hotel_accommodation: Decimal = Decimal("0.00")
    est_food_meals: Decimal = Decimal("0.00")
    act_food_meals: Decimal = Decimal("0.00")
    est_local_transport: Decimal = Decimal("0.00")
    act_local_transport: Decimal = Decimal("0.00")
    est_other_expenses: Decimal = Decimal("0.00")
    act_other_expenses: Decimal = Decimal("0.00")

    estimated_total: Decimal = Decimal("0.00")
    actual_total: Decimal = Decimal("0.00")
    cost_difference: Decimal = Decimal("0.00")

    # Payer details
    payer_type: str = "company"
    company_paid_amount: Decimal = Decimal("0.00")
    employee_paid_amount: Decimal = Decimal("0.00")

    advance_requested: Decimal
    advance_approved: Decimal
    advance_paid: Decimal
    advance_status: AdvanceStatus

    total_submitted_expenses: Decimal = Decimal("0.00")
    total_approved_expenses: Decimal = Decimal("0.00")
    total_reimbursable_expenses: Decimal = Decimal("0.00")
    total_settled_amount: Decimal = Decimal("0.00")
    settlement_balance: Decimal = Decimal("0.00")  # approved_reimbursable - advance_paid
    budget_variance: Decimal = Decimal("0.00")  # actual approved - estimated budget

    member_count: int = 1
    approver_id: uuid.UUID | None = None
    approver_name: str | None = None
    approved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TravelTripDetailResponse(TravelTripResponse):
    accommodation_notes: str | None = None
    notes: str | None = None
    missing_info_explanation: str | None = None
    advance_payment_reference: str | None = None
    advance_paid_at: datetime | None = None
    approver_comment: str | None = None
    booking_commitments: Decimal = Decimal("0.00")

    members: list[TravelMemberResponse] = Field(default_factory=list)
    itineraries: list[TravelItineraryResponse] = Field(default_factory=list)
    expenses: list[TravelExpenseResponse] = Field(default_factory=list)
    payments: list[TravelPaymentResponse] = Field(default_factory=list)
    settlements: list[TravelSettlementResponse] = Field(default_factory=list)
    activity_logs: list[TravelActivityLogResponse] = Field(default_factory=list)


# ---------------- Dashboard & Reporting Schemas ----------------
class TravelSummaryKPI(BaseModel):
    total_trips: int = 0
    upcoming_trips: int = 0
    ongoing_trips: int = 0
    past_trips: int = 0
    pending_approvals: int = 0
    pending_expense_reviews: int = 0
    unsettled_trips: int = 0

    total_estimated_budget: Decimal = Decimal("0.00")
    total_actual_approved_expenses: Decimal = Decimal("0.00")
    total_submitted_expenses: Decimal = Decimal("0.00")
    total_advances_paid: Decimal = Decimal("0.00")
    total_reimbursements_pending: Decimal = Decimal("0.00")
    currency: str = "USD"


class TravelMonthlyCost(BaseModel):
    month: str  # YYYY-MM
    trip_count: int = 0
    estimated_budget: Decimal = Decimal("0.00")
    approved_expenses: Decimal = Decimal("0.00")


class TravelDepartmentCost(BaseModel):
    department_name: str
    trip_count: int = 0
    total_cost: Decimal = Decimal("0.00")


class TravelModeCost(BaseModel):
    mode: str
    count: int = 0
    total_cost: Decimal = Decimal("0.00")


class TravelReportMetrics(BaseModel):
    summary: TravelSummaryKPI
    monthly_trend: list[TravelMonthlyCost] = Field(default_factory=list)
    by_department: list[TravelDepartmentCost] = Field(default_factory=list)
    by_transport_mode: list[TravelModeCost] = Field(default_factory=list)
    planned_vs_past: dict[str, int] = Field(default_factory=dict)
    status_counts: dict[str, int] = Field(default_factory=dict)
