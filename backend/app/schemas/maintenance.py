from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AssetSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    asset_code: str
    name: str
    status: str
    condition: str


class EmployeeSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_code: str
    first_name: str
    last_name: str
    designation: str


class VendorSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    vendor_code: str
    name: str


class BranchSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str


# ---------------------------------------------------------------------------
# Maintenance Requests
# ---------------------------------------------------------------------------

class MaintenanceRequestCreate(BaseModel):
    asset_id: UUID
    requester_id: UUID | None = None
    branch_id: UUID | None = None
    issue_title: str = Field(..., min_length=2, max_length=200)
    issue_description: str | None = None
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    requested_date: date | None = None
    notes: str | None = None


class MaintenanceRequestUpdate(BaseModel):
    issue_title: str | None = Field(None, min_length=2, max_length=200)
    issue_description: str | None = None
    priority: Literal["low", "medium", "high", "urgent"] | None = None
    branch_id: UUID | None = None
    notes: str | None = None


class MaintenanceRequestReject(BaseModel):
    rejection_reason: str = Field(..., min_length=1, max_length=500)


class MaintenanceRequestAction(BaseModel):
    notes: str | None = None


class MaintenanceRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    request_number: str
    asset_id: UUID
    requester_id: UUID
    branch_id: UUID | None = None
    issue_title: str
    issue_description: str | None = None
    priority: str
    requested_date: date
    status: str
    rejection_reason: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    asset: AssetSummary | None = None
    requester: EmployeeSummary | None = None
    branch: BranchSummary | None = None


# ---------------------------------------------------------------------------
# Maintenance Records
# ---------------------------------------------------------------------------

class MaintenanceRecordCreate(BaseModel):
    maintenance_request_id: UUID | None = None
    asset_id: UUID
    technician_id: UUID | None = None
    vendor_id: UUID | None = None
    maintenance_type: Literal["corrective", "preventive", "inspection", "upgrade"] = "corrective"
    start_date: date | None = None
    completion_date: date | None = None
    description: str | None = None
    parts_description: str | None = None
    labor_cost: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    parts_cost: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    other_cost: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    notes: str | None = None


class MaintenanceRecordUpdate(BaseModel):
    technician_id: UUID | None = None
    vendor_id: UUID | None = None
    maintenance_type: Literal["corrective", "preventive", "inspection", "upgrade"] | None = None
    start_date: date | None = None
    completion_date: date | None = None
    description: str | None = None
    parts_description: str | None = None
    labor_cost: Decimal | None = Field(None, ge=Decimal("0.00"))
    parts_cost: Decimal | None = Field(None, ge=Decimal("0.00"))
    other_cost: Decimal | None = Field(None, ge=Decimal("0.00"))
    notes: str | None = None


class MaintenanceRecordStart(BaseModel):
    start_date: date | None = None
    technician_id: UUID | None = None
    vendor_id: UUID | None = None
    notes: str | None = None


class MaintenanceRecordComplete(BaseModel):
    completion_date: date | None = None
    labor_cost: Decimal | None = Field(None, ge=Decimal("0.00"))
    parts_cost: Decimal | None = Field(None, ge=Decimal("0.00"))
    other_cost: Decimal | None = Field(None, ge=Decimal("0.00"))
    description: str | None = None
    parts_description: str | None = None
    notes: str | None = None


class MaintenanceRecordAction(BaseModel):
    notes: str | None = None


class MaintenanceRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    record_number: str
    maintenance_request_id: UUID | None = None
    asset_id: UUID
    technician_id: UUID | None = None
    vendor_id: UUID | None = None
    maintenance_type: str
    start_date: date
    completion_date: date | None = None
    status: str
    description: str | None = None
    parts_description: str | None = None
    labor_cost: Decimal
    parts_cost: Decimal
    other_cost: Decimal
    total_cost: Decimal
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    asset: AssetSummary | None = None
    technician: EmployeeSummary | None = None
    vendor: VendorSummary | None = None


class MaintenanceRequestDetailResponse(MaintenanceRequestResponse):
    records: list[MaintenanceRecordResponse] = []


class MaintenanceRecordDetailResponse(MaintenanceRecordResponse):
    maintenance_request: MaintenanceRequestResponse | None = None
