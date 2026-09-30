from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.common import PaginationMeta


# ==========================================
# Vendor Schemas
# ==========================================
class VendorBase(BaseModel):
    vendor_code: Annotated[
        str, Field(min_length=2, max_length=32, description="Unique vendor code")
    ]
    name: Annotated[
        str, Field(min_length=1, max_length=200, description="Vendor company or business name")
    ]
    contact_person: Annotated[str | None, Field(default=None, max_length=100)] = None
    email: Annotated[str | None, Field(default=None, max_length=255)] = None
    phone: Annotated[str | None, Field(default=None, max_length=50)] = None
    address: Annotated[str | None, Field(default=None)] = None
    tax_id: Annotated[str | None, Field(default=None, max_length=50)] = None
    is_active: bool = True

    @field_validator("vendor_code")
    @classmethod
    def normalize_vendor_code(cls, v: str) -> str:
        code = v.strip().upper()
        if not code:
            raise ValueError("Vendor code cannot be blank")
        return code

    @field_validator("name")
    @classmethod
    def normalize_name(cls, v: str) -> str:
        name = v.strip()
        if not name:
            raise ValueError("Vendor name cannot be blank")
        return name


class VendorCreate(VendorBase):
    pass


class VendorUpdate(BaseModel):
    name: Annotated[str | None, Field(default=None, min_length=1, max_length=200)] = None
    contact_person: Annotated[str | None, Field(default=None, max_length=100)] = None
    email: Annotated[str | None, Field(default=None, max_length=255)] = None
    phone: Annotated[str | None, Field(default=None, max_length=50)] = None
    address: Annotated[str | None, Field(default=None)] = None
    tax_id: Annotated[str | None, Field(default=None, max_length=50)] = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, v: str | None) -> str | None:
        if v is not None:
            name = v.strip()
            if not name:
                raise ValueError("Vendor name cannot be blank")
            return name
        return v


class VendorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    vendor_code: str
    name: str
    contact_person: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    tax_id: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class VendorListResponse(BaseModel):
    items: list[VendorResponse]
    meta: PaginationMeta


# ==========================================
# Purchase Request Schemas
# ==========================================
PurchaseRequestPriority = Literal["low", "medium", "high", "urgent"]
PurchaseRequestStatus = Literal["draft", "submitted", "approved", "rejected", "cancelled"]


class PurchaseRequestBase(BaseModel):
    department_id: Annotated[
        UUID | None, Field(default=None, description="Department for purchase request")
    ] = None
    required_date: Annotated[
        date | None, Field(default=None, description="Date by when items are required")
    ] = None
    priority: Annotated[PurchaseRequestPriority, Field(default="medium")] = "medium"
    purpose: Annotated[
        str, Field(min_length=3, description="Detailed explanation of purchase need")
    ]
    estimated_amount: Annotated[
        Decimal, Field(default=Decimal("0.00"), ge=0, description="Estimated purchase amount")
    ] = Decimal("0.00")
    currency: Annotated[str, Field(default="USD", min_length=3, max_length=3)] = "USD"

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("purpose")
    @classmethod
    def normalize_purpose(cls, v: str) -> str:
        purpose = v.strip()
        if len(purpose) < 3:
            raise ValueError("Purpose must be at least 3 characters")
        return purpose


class PurchaseRequestCreate(PurchaseRequestBase):
    pass


class PurchaseRequestUpdate(BaseModel):
    department_id: Annotated[UUID | None, Field(default=None)] = None
    required_date: Annotated[date | None, Field(default=None)] = None
    priority: Annotated[PurchaseRequestPriority | None, Field(default=None)] = None
    purpose: Annotated[str | None, Field(default=None, min_length=3)] = None
    estimated_amount: Annotated[Decimal | None, Field(default=None, ge=0)] = None
    currency: Annotated[str | None, Field(default=None, min_length=3, max_length=3)] = None

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, v: str | None) -> str | None:
        if v is not None:
            return v.strip().upper()
        return v

    @field_validator("purpose")
    @classmethod
    def normalize_purpose(cls, v: str | None) -> str | None:
        if v is not None:
            purpose = v.strip()
            if len(purpose) < 3:
                raise ValueError("Purpose must be at least 3 characters")
            return purpose
        return v


class PurchaseRequestReview(BaseModel):
    reviewer_comment: Annotated[
        str | None, Field(default=None, max_length=1000, description="Reviewer feedback or notes")
    ] = None


class PurchaseRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    request_number: str
    requester_id: UUID
    department_id: UUID | None = None
    required_date: date | None = None
    priority: str
    purpose: str
    estimated_amount: Decimal
    currency: str
    status: str
    reviewer_id: UUID | None = None
    reviewed_at: datetime | None = None
    reviewer_comment: str | None = None
    created_at: datetime
    updated_at: datetime

    # Display projections
    requester_name: str | None = None
    requester_code: str | None = None
    department_name: str | None = None
    department_code: str | None = None
    reviewer_name: str | None = None
    reviewer_code: str | None = None


class PurchaseRequestListResponse(BaseModel):
    items: list[PurchaseRequestResponse]
    meta: PaginationMeta


# ==========================================
# Purchase Order Item Schemas
# ==========================================
class PurchaseOrderItemBase(BaseModel):
    item_description: Annotated[
        str, Field(min_length=1, max_length=500, description="Description of goods or services")
    ]
    quantity: Annotated[Decimal, Field(gt=0, description="Quantity ordered (must be > 0)")]
    unit: Annotated[
        str, Field(default="pcs", min_length=1, max_length=20, description="Unit of measurement")
    ] = "pcs"
    unit_price: Annotated[Decimal, Field(ge=0, description="Price per unit before tax")]
    tax_rate: Annotated[
        Decimal, Field(default=Decimal("0.00"), ge=0, le=100, description="Tax percentage (0-100)")
    ] = Decimal("0.00")

    @field_validator("item_description")
    @classmethod
    def normalize_desc(cls, v: str) -> str:
        desc = v.strip()
        if not desc:
            raise ValueError("Item description cannot be blank")
        return desc


class PurchaseOrderItemCreate(PurchaseOrderItemBase):
    pass


class PurchaseOrderItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    purchase_order_id: UUID
    item_description: str
    quantity: Decimal
    unit: str
    unit_price: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    line_total: Decimal
    created_at: datetime
    updated_at: datetime


# ==========================================
# Purchase Order Schemas
# ==========================================
PurchaseOrderStatus = Literal[
    "draft", "issued", "partially_received", "received", "cancelled", "closed"
]


class PurchaseOrderCreate(BaseModel):
    vendor_id: Annotated[UUID, Field(description="Selected vendor")]
    purchase_request_id: Annotated[
        UUID | None, Field(default=None, description="Optional associated purchase request")
    ] = None
    order_date: Annotated[
        date, Field(default_factory=date.today, description="Order issuance date")
    ]
    expected_delivery_date: Annotated[
        date | None, Field(default=None, description="Expected delivery date")
    ] = None
    currency: Annotated[str, Field(default="USD", min_length=3, max_length=3)] = "USD"
    notes: Annotated[str | None, Field(default=None, description="Order terms and notes")] = None
    items: Annotated[
        list[PurchaseOrderItemCreate],
        Field(min_length=1, description="Purchase order line items (at least 1 required)"),
    ]

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, v: str) -> str:
        return v.strip().upper()

    @model_validator(mode="after")
    def validate_dates(self) -> "PurchaseOrderCreate":
        if self.expected_delivery_date and self.expected_delivery_date < self.order_date:
            raise ValueError("Expected delivery date cannot be earlier than order date")
        return self


class PurchaseOrderUpdate(BaseModel):
    vendor_id: Annotated[UUID | None, Field(default=None)] = None
    expected_delivery_date: Annotated[date | None, Field(default=None)] = None
    notes: Annotated[str | None, Field(default=None)] = None
    items: Annotated[list[PurchaseOrderItemCreate] | None, Field(default=None, min_length=1)] = None


class PurchaseOrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    po_number: str
    vendor_id: UUID
    purchase_request_id: UUID | None = None
    order_date: date
    expected_delivery_date: date | None = None
    status: str
    subtotal: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    currency: str
    notes: str | None = None
    created_by_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    # Display projections
    vendor_name: str | None = None
    vendor_code: str | None = None
    request_number: str | None = None
    created_by_name: str | None = None
    items_count: int = 0


class PurchaseOrderDetailResponse(PurchaseOrderResponse):
    items: list[PurchaseOrderItemResponse] = []


class PurchaseOrderListResponse(BaseModel):
    items: list[PurchaseOrderResponse]
    meta: PaginationMeta
