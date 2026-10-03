from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import PaginationMeta


class VendorSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    vendor_code: str
    name: str


class EmployeeSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_code: str
    first_name: str
    last_name: str
    designation: str | None = None


class BranchSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str


class POSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    po_number: str


class AssetBase(BaseModel):
    asset_code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    category: str = Field(..., min_length=1, max_length=50)
    description: str | None = None
    serial_number: str | None = Field(None, max_length=100)
    model: str | None = Field(None, max_length=100)
    manufacturer: str | None = Field(None, max_length=100)
    vendor_id: UUID | None = None
    purchase_order_id: UUID | None = None
    purchase_date: date | None = None
    purchase_cost: Decimal | None = Field(None, ge=0)
    currency: str = Field("USD", min_length=3, max_length=3)
    warranty_start_date: date | None = None
    warranty_end_date: date | None = None
    branch_id: UUID | None = None
    status: str = Field("available", max_length=30)
    condition: str = Field("good", max_length=30)
    location: str | None = Field(None, max_length=200)
    notes: str | None = None


class AssetCreate(AssetBase):
    current_custodian_id: UUID | None = None


class AssetUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    category: str | None = Field(None, min_length=1, max_length=50)
    description: str | None = None
    serial_number: str | None = Field(None, max_length=100)
    model: str | None = Field(None, max_length=100)
    manufacturer: str | None = Field(None, max_length=100)
    vendor_id: UUID | None = None
    purchase_order_id: UUID | None = None
    purchase_date: date | None = None
    purchase_cost: Decimal | None = Field(None, ge=0)
    currency: str | None = Field(None, min_length=3, max_length=3)
    warranty_start_date: date | None = None
    warranty_end_date: date | None = None
    branch_id: UUID | None = None
    status: str | None = Field(None, max_length=30)
    condition: str | None = Field(None, max_length=30)
    location: str | None = Field(None, max_length=200)
    notes: str | None = None


class AssetAssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    asset_id: UUID
    employee_id: UUID
    branch_id: UUID | None = None
    assigned_date: date
    returned_date: date | None = None
    assignment_notes: str | None = None
    return_notes: str | None = None
    assigned_by_id: UUID | None = None
    returned_by_id: UUID | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    employee: EmployeeSummary | None = None
    branch: BranchSummary | None = None
    assigned_by: EmployeeSummary | None = None
    returned_by: EmployeeSummary | None = None


class AssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    asset_code: str
    name: str
    category: str
    description: str | None = None
    serial_number: str | None = None
    model: str | None = None
    manufacturer: str | None = None
    vendor_id: UUID | None = None
    purchase_order_id: UUID | None = None
    purchase_date: date | None = None
    purchase_cost: Decimal | None = None
    currency: str
    warranty_start_date: date | None = None
    warranty_end_date: date | None = None
    branch_id: UUID | None = None
    current_custodian_id: UUID | None = None
    status: str
    condition: str
    location: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime
    vendor: VendorSummary | None = None
    branch: BranchSummary | None = None
    current_custodian: EmployeeSummary | None = None


class AssetDetailResponse(AssetResponse):
    active_assignment: AssetAssignmentResponse | None = None
    purchase_order: POSummary | None = None


class AssetListResponse(BaseModel):
    items: list[AssetResponse]
    meta: PaginationMeta


class AssetAssignmentCreate(BaseModel):
    employee_id: UUID
    branch_id: UUID | None = None
    assigned_date: date | None = None
    assignment_notes: str | None = None


class AssetReturnCreate(BaseModel):
    returned_date: date | None = None
    return_notes: str | None = None
    condition: str | None = Field(None, max_length=30)
    status: str | None = Field("available", max_length=30)


class AssetAssignmentListResponse(BaseModel):
    items: list[AssetAssignmentResponse]
    total: int
