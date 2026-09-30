from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ExpenseStatus = Literal["draft", "submitted", "approved", "rejected", "cancelled", "paid"]
TransactionStatus = Literal["pending", "posted", "void"]


class EmployeeSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_code: str
    first_name: str
    last_name: str
    designation: str | None = None


class CategorySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str


class ProjectSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str


class ClientSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str


class VendorSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str


class BranchSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str


# ---------------------------------------------------------------------------
# Expense Categories
# ---------------------------------------------------------------------------


class ExpenseCategoryCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    code: str = Field(..., min_length=2, max_length=50)
    description: str | None = None
    is_active: bool = True


class ExpenseCategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    description: str | None = None
    is_active: bool | None = None


class ExpenseCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    code: str
    description: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Expense Items
# ---------------------------------------------------------------------------


class ExpenseItemCreate(BaseModel):
    description: str = Field(..., min_length=1, max_length=255)
    quantity: Decimal = Field(default=Decimal("1.00"), gt=Decimal("0.00"))
    unit_price: Decimal = Field(..., ge=Decimal("0.00"))
    tax_amount: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))


class ExpenseItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    expense_id: UUID
    description: str
    quantity: Decimal
    unit_price: Decimal
    tax_amount: Decimal
    line_total: Decimal
    created_at: datetime


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------


class ExpenseCreate(BaseModel):
    expense_number: str = Field(..., min_length=2, max_length=50)
    employee_id: UUID
    category_id: UUID
    project_id: UUID | None = None
    client_id: UUID | None = None
    branch_id: UUID | None = None
    expense_date: date
    description: str | None = None
    amount: Decimal = Field(..., ge=Decimal("0.00"))
    tax_amount: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    currency: str = Field(default="USD", min_length=3, max_length=10)
    notes: str | None = None
    items: list[ExpenseItemCreate] | None = None


class ExpenseUpdate(BaseModel):
    category_id: UUID | None = None
    project_id: UUID | None = None
    client_id: UUID | None = None
    branch_id: UUID | None = None
    expense_date: date | None = None
    description: str | None = None
    amount: Decimal | None = Field(None, ge=Decimal("0.00"))
    tax_amount: Decimal | None = Field(None, ge=Decimal("0.00"))
    currency: str | None = Field(None, min_length=3, max_length=10)
    notes: str | None = None
    items: list[ExpenseItemCreate] | None = None


class ExpenseAction(BaseModel):
    notes: str | None = None


class ExpenseReviewAction(BaseModel):
    comment: str | None = None


class ExpensePayAction(BaseModel):
    notes: str | None = None


class ExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    expense_number: str
    employee_id: UUID
    category_id: UUID
    project_id: UUID | None = None
    client_id: UUID | None = None
    branch_id: UUID | None = None
    expense_date: date
    description: str | None = None
    amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    currency: str
    status: ExpenseStatus
    submitted_at: datetime | None = None
    approved_at: datetime | None = None
    rejected_at: datetime | None = None
    paid_at: datetime | None = None
    reviewer_id: UUID | None = None
    reviewer_comment: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    employee: EmployeeSummary | None = None
    category: CategorySummary | None = None
    project: ProjectSummary | None = None
    client: ClientSummary | None = None
    branch: BranchSummary | None = None
    reviewer: EmployeeSummary | None = None
    items_count: int = 0


class ExpenseDetail(ExpenseResponse):
    items: list[ExpenseItemResponse] = []


# ---------------------------------------------------------------------------
# Financial Transactions
# ---------------------------------------------------------------------------


class FinancialTransactionCreate(BaseModel):
    transaction_number: str = Field(..., min_length=2, max_length=50)
    transaction_date: date
    transaction_type: str = Field(..., min_length=2, max_length=50)
    reference_type: str | None = None
    reference_id: UUID | None = None
    description: str = Field(..., min_length=2)
    debit: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    credit: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    currency: str = Field(default="USD", min_length=3, max_length=10)
    project_id: UUID | None = None
    client_id: UUID | None = None
    vendor_id: UUID | None = None
    employee_id: UUID | None = None
    notes: str | None = None


class FinancialTransactionUpdate(BaseModel):
    description: str | None = None
    status: TransactionStatus | None = None
    notes: str | None = None


class FinancialTransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    transaction_number: str
    transaction_date: date
    transaction_type: str
    reference_type: str | None = None
    reference_id: UUID | None = None
    description: str
    debit: Decimal
    credit: Decimal
    currency: str
    project_id: UUID | None = None
    client_id: UUID | None = None
    vendor_id: UUID | None = None
    employee_id: UUID | None = None
    status: TransactionStatus
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    project: ProjectSummary | None = None
    client: ClientSummary | None = None
    vendor: VendorSummary | None = None
    employee: EmployeeSummary | None = None


class FinancialOverview(BaseModel):
    total_expenses: Decimal
    pending_approvals_count: int
    approved_expenses_count: int
    paid_expenses_count: int
    total_debits: Decimal
    total_credits: Decimal
