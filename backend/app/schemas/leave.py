from datetime import date, datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ==========================================
# Leave Types
# ==========================================
class LeaveTypeBase(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=100, description="Leave type name, e.g. Annual Leave")]
    code: Annotated[str, Field(min_length=1, max_length=32, description="Unique code, e.g. AL, SL")]
    description: Annotated[str | None, Field(default=None, description="Optional description")] = None
    annual_allocation: Annotated[Decimal, Field(ge=0, description="Allocated annual days count")] = Decimal("0.00")
    is_paid: Annotated[bool, Field(default=True, description="Whether this leave is paid")] = True
    requires_approval: Annotated[bool, Field(default=True, description="Whether manager approval is required")] = True
    is_active: Annotated[bool, Field(default=True, description="Active status")] = True


class LeaveTypeCreate(LeaveTypeBase):
    pass


class LeaveTypeUpdate(BaseModel):
    name: Annotated[str | None, Field(default=None, min_length=1, max_length=100)] = None
    code: Annotated[str | None, Field(default=None, min_length=1, max_length=32)] = None
    description: Annotated[str | None, Field(default=None)] = None
    annual_allocation: Annotated[Decimal | None, Field(default=None, ge=0)] = None
    is_paid: Annotated[bool | None, Field(default=None)] = None
    requires_approval: Annotated[bool | None, Field(default=None)] = None
    is_active: Annotated[bool | None, Field(default=None)] = None


class LeaveTypeResponse(LeaveTypeBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    created_at: datetime
    updated_at: datetime


# ==========================================
# Leave Requests
# ==========================================
class EmployeeBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_code: str
    first_name: str
    last_name: str
    designation: str
    department_name: str | None = None


class LeaveTypeBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str
    is_paid: bool


class ReviewerBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    first_name: str
    last_name: str
    email: str


class LeaveRequestCreate(BaseModel):
    leave_type_id: Annotated[UUID, Field(description="Target Leave Type ID")]
    start_date: Annotated[date, Field(description="Start date (inclusive)")]
    end_date: Annotated[date, Field(description="End date (inclusive)")]
    reason: Annotated[str | None, Field(default=None, description="Reason for leave request")] = None
    employee_id: Annotated[
        UUID | None, Field(default=None, description="Optional employee ID when submitted by admin/manager")
    ] = None


class LeaveRequestUpdate(BaseModel):
    leave_type_id: Annotated[UUID | None, Field(default=None)] = None
    start_date: Annotated[date | None, Field(default=None)] = None
    end_date: Annotated[date | None, Field(default=None)] = None
    reason: Annotated[str | None, Field(default=None)] = None


class LeaveRequestApprovalAction(BaseModel):
    reviewer_comment: Annotated[str | None, Field(default=None, description="Optional comment from reviewer")] = None


class LeaveRequestRejectAction(BaseModel):
    reviewer_comment: Annotated[str | None, Field(default=None, description="Reason / comment for rejection")] = None


class LeaveRequestCancelAction(BaseModel):
    reason: Annotated[str | None, Field(default=None, description="Reason for cancellation")] = None


class LeaveRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    employee_id: UUID
    employee: EmployeeBrief | None = None
    leave_type_id: UUID
    leave_type: LeaveTypeBrief | None = None
    start_date: date
    end_date: date
    total_days: Decimal
    reason: str | None
    status: str
    reviewed_by: UUID | None
    reviewer: ReviewerBrief | None = None
    reviewed_at: datetime | None
    reviewer_comment: str | None
    created_at: datetime
    updated_at: datetime


class LeaveTypeBalance(BaseModel):
    leave_type_id: UUID
    leave_type_name: str
    leave_type_code: str
    annual_allocation: Decimal
    used_days: Decimal
    pending_days: Decimal
    available_days: Decimal


class LeaveSummaryResponse(BaseModel):
    total_allocated_days: Decimal
    total_used_days: Decimal
    total_pending_days: Decimal
    total_available_days: Decimal
    balances_by_type: list[LeaveTypeBalance]


# ==========================================
# Holidays
# ==========================================
class BranchBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str


class HolidayBase(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=160, description="Holiday name")]
    holiday_date: Annotated[date, Field(description="Calendar date of the holiday")]
    branch_id: Annotated[UUID | None, Field(default=None, description="Branch ID if branch-specific, else organization-wide")] = None
    description: Annotated[str | None, Field(default=None, description="Description or note")] = None
    is_optional: Annotated[bool, Field(default=False, description="Whether this is an optional/restricted holiday")] = False


class HolidayCreate(HolidayBase):
    pass


class HolidayUpdate(BaseModel):
    name: Annotated[str | None, Field(default=None, min_length=1, max_length=160)] = None
    holiday_date: Annotated[date | None, Field(default=None)] = None
    branch_id: Annotated[UUID | None, Field(default=None)] = None
    description: Annotated[str | None, Field(default=None)] = None
    is_optional: Annotated[bool | None, Field(default=None)] = None


class HolidayResponse(HolidayBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    branch: BranchBrief | None = None
    created_at: datetime
    updated_at: datetime
