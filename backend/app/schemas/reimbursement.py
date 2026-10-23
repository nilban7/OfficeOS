import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ReimbursementClaimItem(BaseModel):
    description: str = Field(..., min_length=1, max_length=255)
    amount: Decimal = Field(..., ge=Decimal("0.00"))
    category: str = Field(default="other")
    expense_date: date | None = None
    receipt_url: str | None = None


class ReimbursementClaimCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    category: str = Field(default="travel")
    claim_date: date = Field(default_factory=date.today)
    amount: Decimal = Field(..., ge=Decimal("0.00"))
    currency: str = Field(default="USD", max_length=10)
    description: str | None = None
    receipt_url: str | None = None
    items: list[ReimbursementClaimItem] = Field(default_factory=list)
    employee_id: uuid.UUID | None = None
    submit_immediately: bool = False


class ReimbursementClaimUpdate(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=255)
    category: str | None = None
    claim_date: date | None = None
    amount: Decimal | None = Field(None, ge=Decimal("0.00"))
    currency: str | None = Field(None, max_length=10)
    description: str | None = None
    receipt_url: str | None = None
    items: list[ReimbursementClaimItem] | None = None


class ReimbursementReviewAction(BaseModel):
    reviewer_comment: str | None = None


class ReimbursementPayAction(BaseModel):
    payment_reference: str | None = None
    notes: str | None = None


class ReimbursementClaimResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    employee_id: uuid.UUID
    employee_name: str | None = None
    employee_code: str | None = None
    claim_number: str
    title: str
    category: str
    claim_date: date
    amount: Decimal
    currency: str
    status: str
    receipt_url: str | None = None
    description: str | None = None
    items: list[dict[str, Any]] = Field(default_factory=list)
    submitted_at: datetime | None = None
    reviewer_id: uuid.UUID | None = None
    reviewer_name: str | None = None
    reviewed_at: datetime | None = None
    reviewer_comment: str | None = None
    paid_at: datetime | None = None
    payment_reference: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReimbursementSummaryKPI(BaseModel):
    total_claims_count: int = 0
    pending_approval_count: int = 0
    approved_unpaid_count: int = 0
    paid_claims_count: int = 0
    total_claimed_amount: Decimal = Decimal("0.00")
    pending_approval_amount: Decimal = Decimal("0.00")
    total_reimbursed_amount: Decimal = Decimal("0.00")
    currency: str = "USD"
