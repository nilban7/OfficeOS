from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class EmployeeBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_code: str
    first_name: str
    last_name: str
    designation: str
    department_name: str | None = None
    branch_name: str | None = None


class BranchBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str


class AttendanceListItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    employee_id: UUID
    employee: EmployeeBrief | None = None
    branch_id: UUID | None = None
    branch: BranchBrief | None = None
    work_date: date
    check_in_at: datetime | None = None
    check_out_at: datetime | None = None
    status: str
    notes: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    location_name: str | None = None
    location_accuracy: Decimal | None = None
    verification_method: str = "web"
    check_out_latitude: Decimal | None = None
    check_out_longitude: Decimal | None = None
    check_out_location_name: str | None = None
    device_info: str | None = None
    is_offsite: bool = False
    offsite_reason: str | None = None
    offsite_location: str | None = None
    client_name: str | None = None
    approval_status: str = "not_required"
    hr_approved_at: datetime | None = None
    hr_approved_by_id: UUID | None = None
    hr_rejection_reason: str | None = None
    org_head_approved_at: datetime | None = None
    org_head_approved_by_id: UUID | None = None
    org_head_rejection_reason: str | None = None
    created_at: datetime
    updated_at: datetime


class AttendanceDetailResponse(AttendanceListItemResponse):
    pass


class AttendanceCheckInRequest(BaseModel):
    employee_id: UUID | None = None
    branch_id: UUID | None = None
    work_date: date | None = None
    check_in_at: datetime | None = None
    notes: str | None = Field(None, max_length=1000)
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    location_name: str | None = Field(None, max_length=255)
    location_accuracy: Decimal | None = None
    verification_method: str = Field("web", max_length=32)
    device_info: str | None = Field(None, max_length=255)
    is_offsite: bool = False
    offsite_reason: str | None = Field(None, max_length=100)
    offsite_location: str | None = Field(None, max_length=255)
    client_name: str | None = Field(None, max_length=160)



class AttendanceCheckOutRequest(BaseModel):
    check_out_at: datetime | None = None
    notes: str | None = Field(None, max_length=1000)
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    location_name: str | None = Field(None, max_length=255)
    location_accuracy: Decimal | None = None


class AttendanceCreate(BaseModel):
    employee_id: UUID
    work_date: date
    status: str = Field("present", pattern=r"^(present|absent|late|half_day|on_leave)$")
    check_in_at: datetime | None = None
    check_out_at: datetime | None = None
    branch_id: UUID | None = None
    notes: str | None = Field(None, max_length=1000)
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    location_name: str | None = Field(None, max_length=255)
    location_accuracy: Decimal | None = None
    verification_method: str = Field("manual", max_length=32)
    check_out_latitude: Decimal | None = None
    check_out_longitude: Decimal | None = None
    check_out_location_name: str | None = Field(None, max_length=255)
    device_info: str | None = Field(None, max_length=255)
    is_offsite: bool = False
    offsite_reason: str | None = Field(None, max_length=100)
    offsite_location: str | None = Field(None, max_length=255)
    client_name: str | None = Field(None, max_length=160)
    approval_status: str = Field("not_required", pattern=r"^(not_required|pending_hr|pending_org_head|approved|rejected)$")

    @model_validator(mode="after")
    def validate_times(self) -> "AttendanceCreate":
        if self.check_in_at and self.check_out_at and self.check_out_at < self.check_in_at:
            raise ValueError("check_out_at cannot be earlier than check_in_at")
        return self


class AttendanceUpdate(BaseModel):
    status: str | None = Field(None, pattern=r"^(present|absent|late|half_day|on_leave)$")
    work_date: date | None = None
    check_in_at: datetime | None = None
    check_out_at: datetime | None = None
    branch_id: UUID | None = None
    notes: str | None = Field(None, max_length=1000)
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    location_name: str | None = Field(None, max_length=255)
    location_accuracy: Decimal | None = None
    verification_method: str | None = Field(None, max_length=32)
    check_out_latitude: Decimal | None = None
    check_out_longitude: Decimal | None = None
    check_out_location_name: str | None = Field(None, max_length=255)
    device_info: str | None = Field(None, max_length=255)
    is_offsite: bool | None = None
    offsite_reason: str | None = Field(None, max_length=100)
    offsite_location: str | None = Field(None, max_length=255)
    client_name: str | None = Field(None, max_length=160)
    approval_status: str | None = Field(None, pattern=r"^(not_required|pending_hr|pending_org_head|approved|rejected)$")

    @model_validator(mode="after")
    def validate_times(self) -> "AttendanceUpdate":
        if self.check_in_at and self.check_out_at and self.check_out_at < self.check_in_at:
            raise ValueError("check_out_at cannot be earlier than check_in_at")
        return self


class AttendanceSummaryResponse(BaseModel):
    date: date
    total_active_employees: int
    present_count: int
    late_count: int
    half_day_count: int
    absent_count: int
    on_leave_count: int
    marked_count: int


class AttendanceHRReviewAction(BaseModel):
    action: str = Field(..., pattern=r"^(approve|reject)$")
    rejection_reason: str | None = Field(None, max_length=1000)


class AttendanceOrgHeadReviewAction(BaseModel):
    action: str = Field(..., pattern=r"^(confirm_reject|override_approve)$")
    reason: str | None = Field(None, max_length=1000)

