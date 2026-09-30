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


class TrainingProgramSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    code: str
    category: str | None = None
    delivery_mode: str
    status: str


class TrainingSessionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    session_number: str
    title: str | None = None
    session_date: date
    status: str


# ---------------------------------------------------------------------------
# Training Programs
# ---------------------------------------------------------------------------

class TrainingProgramCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    code: str = Field(..., min_length=2, max_length=50)
    description: str | None = None
    category: str | None = Field(None, max_length=100)
    provider: str | None = Field(None, max_length=200)
    trainer: str | None = Field(None, max_length=200)
    delivery_mode: Literal["in_person", "online", "hybrid", "self_paced"] = "in_person"
    duration_hours: Decimal = Field(default=Decimal("0.00"), ge=0)
    capacity: int = Field(default=0, ge=0)
    cost: Decimal = Field(default=Decimal("0.00"), ge=0)
    start_date: date | None = None
    end_date: date | None = None
    status: Literal["draft", "published", "completed", "cancelled"] = "draft"


class TrainingProgramUpdate(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=200)
    code: str | None = Field(None, min_length=2, max_length=50)
    description: str | None = None
    category: str | None = Field(None, max_length=100)
    provider: str | None = Field(None, max_length=200)
    trainer: str | None = Field(None, max_length=200)
    delivery_mode: Literal["in_person", "online", "hybrid", "self_paced"] | None = None
    duration_hours: Decimal | None = Field(None, ge=0)
    capacity: int | None = Field(None, ge=0)
    cost: Decimal | None = Field(None, ge=0)
    start_date: date | None = None
    end_date: date | None = None
    status: Literal["draft", "published", "completed", "cancelled"] | None = None


class TrainingProgramAction(BaseModel):
    notes: str | None = None


class TrainingProgramResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    title: str
    code: str
    description: str | None = None
    category: str | None = None
    provider: str | None = None
    trainer: str | None = None
    delivery_mode: str
    duration_hours: Decimal
    capacity: int
    cost: Decimal
    start_date: date | None = None
    end_date: date | None = None
    status: str
    created_at: datetime
    updated_at: datetime

    enrolled_count: int = 0
    sessions_count: int = 0


# ---------------------------------------------------------------------------
# Training Sessions
# ---------------------------------------------------------------------------

class TrainingSessionCreate(BaseModel):
    training_program_id: UUID
    session_number: str = Field(..., min_length=2, max_length=50)
    title: str | None = Field(None, max_length=200)
    session_date: date
    start_time: str | None = Field(None, max_length=20)
    end_time: str | None = Field(None, max_length=20)
    location: str | None = Field(None, max_length=255)
    trainer: str | None = Field(None, max_length=200)
    capacity: int = Field(default=0, ge=0)
    notes: str | None = None
    status: Literal["scheduled", "in_progress", "completed", "cancelled"] = "scheduled"


class TrainingSessionUpdate(BaseModel):
    session_number: str | None = Field(None, min_length=2, max_length=50)
    title: str | None = Field(None, max_length=200)
    session_date: date | None = None
    start_time: str | None = Field(None, max_length=20)
    end_time: str | None = Field(None, max_length=20)
    location: str | None = Field(None, max_length=255)
    trainer: str | None = Field(None, max_length=200)
    capacity: int | None = Field(None, ge=0)
    notes: str | None = None
    status: Literal["scheduled", "in_progress", "completed", "cancelled"] | None = None


class TrainingSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    training_program_id: UUID
    session_number: str
    title: str | None = None
    session_date: date
    start_time: str | None = None
    end_time: str | None = None
    location: str | None = None
    trainer: str | None = None
    capacity: int
    notes: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime

    training_program: TrainingProgramSummary | None = None
    enrolled_count: int = 0


# ---------------------------------------------------------------------------
# Training Enrollments
# ---------------------------------------------------------------------------

class TrainingEnrollmentCreate(BaseModel):
    training_program_id: UUID
    training_session_id: UUID | None = None
    employee_id: UUID | None = None
    enrollment_date: date | None = None
    notes: str | None = None


class TrainingEnrollmentUpdate(BaseModel):
    training_session_id: UUID | None = None
    status: Literal["enrolled", "attended", "completed", "cancelled", "no_show"] | None = None
    completion_date: date | None = None
    score: Decimal | None = Field(None, ge=0, le=100)
    result: Literal["passed", "failed", "attended"] | None = None
    certificate_number: str | None = Field(None, max_length=100)
    notes: str | None = None


class TrainingEnrollmentAttend(BaseModel):
    status: Literal["attended", "no_show"] = "attended"
    notes: str | None = None


class TrainingEnrollmentComplete(BaseModel):
    completion_date: date | None = None
    score: Decimal | None = Field(None, ge=0, le=100)
    result: Literal["passed", "failed", "attended"] = "passed"
    certificate_number: str | None = Field(None, max_length=100)
    notes: str | None = None


class TrainingEnrollmentAction(BaseModel):
    notes: str | None = None


class TrainingEnrollmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    training_program_id: UUID
    training_session_id: UUID | None = None
    employee_id: UUID
    enrollment_date: date
    status: str
    completion_date: date | None = None
    score: Decimal | None = None
    result: str | None = None
    certificate_number: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    training_program: TrainingProgramSummary | None = None
    training_session: TrainingSessionSummary | None = None
    employee: EmployeeSummary | None = None


# ---------------------------------------------------------------------------
# Detail Schemas
# ---------------------------------------------------------------------------

class TrainingProgramDetail(TrainingProgramResponse):
    sessions: list[TrainingSessionResponse] = []
    enrollments: list[TrainingEnrollmentResponse] = []


class TrainingSessionDetail(TrainingSessionResponse):
    enrollments: list[TrainingEnrollmentResponse] = []


class TrainingEnrollmentDetail(TrainingEnrollmentResponse):
    pass


# ---------------------------------------------------------------------------
# Paginated Responses
# ---------------------------------------------------------------------------

class TrainingProgramListResponse(BaseModel):
    items: list[TrainingProgramResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class TrainingSessionListResponse(BaseModel):
    items: list[TrainingSessionResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class TrainingEnrollmentListResponse(BaseModel):
    items: list[TrainingEnrollmentResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
