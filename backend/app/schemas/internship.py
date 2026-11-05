from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EmployeeSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_code: str
    first_name: str
    last_name: str
    designation: str | None = None


class InternshipSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    code: str
    intern_name: str
    status: str
    start_date: date
    end_date: date


# ---------------------------------------------------------------------------
# Internship
# ---------------------------------------------------------------------------


class InternshipCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    code: str = Field(..., min_length=2, max_length=50)
    intern_name: str = Field(..., min_length=2, max_length=200)
    intern_email: str | None = Field(None, max_length=255)
    institution: str | None = Field(None, max_length=255)
    department_id: UUID | None = None
    supervisor_id: UUID | None = None
    employee_id: UUID | None = None
    start_date: date
    end_date: date
    status: Literal["planned", "active", "completed", "extended", "terminated", "cancelled"] = "planned"
    stipend: Decimal = Field(default=Decimal("0.00"), ge=0)
    description: str | None = None
    notes: str | None = None


class InternshipUpdate(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=200)
    code: str | None = Field(None, min_length=2, max_length=50)
    intern_name: str | None = Field(None, min_length=2, max_length=200)
    intern_email: str | None = Field(None, max_length=255)
    institution: str | None = Field(None, max_length=255)
    department_id: UUID | None = None
    supervisor_id: UUID | None = None
    employee_id: UUID | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: Literal["planned", "active", "completed", "extended", "terminated", "cancelled"] | None = None
    stipend: Decimal | None = Field(None, ge=0)
    description: str | None = None
    notes: str | None = None


class InternshipExtend(BaseModel):
    new_end_date: date
    notes: str | None = None


class InternshipAction(BaseModel):
    notes: str | None = None


class InternshipResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    employee_id: UUID | None = None
    department_id: UUID | None = None
    supervisor_id: UUID | None = None
    title: str
    code: str
    intern_name: str
    intern_email: str | None = None
    institution: str | None = None
    start_date: date
    end_date: date
    status: str
    stipend: Decimal
    description: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    supervisor: EmployeeSummary | None = None
    supervisors_count: int = 0
    reviews_count: int = 0


# ---------------------------------------------------------------------------
# Internship Supervisor
# ---------------------------------------------------------------------------


class InternshipSupervisorCreate(BaseModel):
    employee_id: UUID
    role: str = Field(default="supervisor", max_length=100)


class InternshipSupervisorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    internship_id: UUID
    employee_id: UUID
    role: str
    created_at: datetime

    employee: EmployeeSummary | None = None


# ---------------------------------------------------------------------------
# Internship Review
# ---------------------------------------------------------------------------


class InternshipReviewCreate(BaseModel):
    review_date: date
    rating: int | None = Field(None, ge=1, le=5)
    feedback: str | None = None
    reviewer_id: UUID | None = None
    status: Literal["draft", "submitted", "acknowledged"] = "draft"


class InternshipReviewUpdate(BaseModel):
    review_date: date | None = None
    rating: int | None = Field(None, ge=1, le=5)
    feedback: str | None = None
    reviewer_id: UUID | None = None
    status: Literal["draft", "submitted", "acknowledged"] | None = None


class InternshipReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    internship_id: UUID
    reviewer_id: UUID | None = None
    review_date: date
    rating: int | None = None
    feedback: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime

    reviewer: EmployeeSummary | None = None
    internship: InternshipSummary | None = None


# ---------------------------------------------------------------------------
# Internship Student / Enrolled Interns
# ---------------------------------------------------------------------------


class InternshipStudentCreate(BaseModel):
    student_name: str = Field(..., min_length=2, max_length=200)
    student_email: str | None = Field(None, max_length=255)
    institution: str | None = Field(None, max_length=255)
    stipend: Decimal = Field(default=Decimal("0.00"), ge=0)
    status: Literal["planned", "active", "completed", "terminated"] = "active"
    notes: str | None = None


class InternshipStudentUpdate(BaseModel):
    student_name: str | None = Field(None, min_length=2, max_length=200)
    student_email: str | None = Field(None, max_length=255)
    institution: str | None = Field(None, max_length=255)
    stipend: Decimal | None = Field(None, ge=0)
    status: Literal["planned", "active", "completed", "terminated"] | None = None
    notes: str | None = None


class InternshipStudentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    internship_id: UUID
    student_name: str
    student_email: str | None = None
    institution: str | None = None
    stipend: Decimal
    status: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Internship Documents
# ---------------------------------------------------------------------------


class InternshipDocumentCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    document_type: Literal[
        "offer_letter",
        "agreement_nda",
        "id_proof",
        "college_noc",
        "completion_certificate",
        "evaluation_report",
        "other",
    ] = "other"
    intern_name: str | None = Field(None, max_length=200)
    file_name: str = Field(..., min_length=1, max_length=255)
    file_size: int = Field(default=0, ge=0)
    mime_type: str = Field(default="application/pdf", max_length=100)
    file_url: str | None = None
    notes: str | None = None


class InternshipDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    internship_id: UUID
    title: str
    document_type: str
    intern_name: str | None = None
    file_name: str
    file_size: int
    mime_type: str
    file_url: str | None = None
    notes: str | None = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Stipend Disbursements
# ---------------------------------------------------------------------------


class StipendDisbursementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    payroll_id: UUID | None = None
    internship_id: UUID
    intern_name: str
    period_month: int
    period_year: int
    stipend_amount: Decimal
    status: str
    payment_method: str
    payment_reference: str | None = None
    disbursed_at: datetime | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    internship_title: str | None = None
    internship_code: str | None = None


class StipendDisburseRequest(BaseModel):
    payment_method: str = Field(default="bank_transfer", max_length=50)
    payment_reference: str | None = Field(None, max_length=100)
    notes: str | None = None


class StipendCreateDisburseRequest(BaseModel):
    internship_id: UUID
    intern_name: str = Field(..., min_length=2, max_length=200)
    period_month: int = Field(..., ge=1, le=12)
    period_year: int = Field(..., ge=2020)
    stipend_amount: Decimal = Field(..., ge=0)
    payroll_id: UUID | None = None
    payment_method: str = Field(default="bank_transfer", max_length=50)
    payment_reference: str | None = Field(None, max_length=100)
    notes: str | None = None



# ---------------------------------------------------------------------------
# Detail schemas
# ---------------------------------------------------------------------------


class InternshipDetail(InternshipResponse):
    supervisors: list[InternshipSupervisorResponse] = []
    reviews: list[InternshipReviewResponse] = []
    students: list[InternshipStudentResponse] = []
    documents: list[InternshipDocumentResponse] = []


# ---------------------------------------------------------------------------
# Paginated responses
# ---------------------------------------------------------------------------


class InternshipListResponse(BaseModel):
    items: list[InternshipResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class InternshipSupervisorListResponse(BaseModel):
    items: list[InternshipSupervisorResponse]
    total: int


class InternshipReviewListResponse(BaseModel):
    items: list[InternshipReviewResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
