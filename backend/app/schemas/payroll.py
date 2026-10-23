import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class SalaryStructureBase(BaseModel):
    currency: str = Field(default="USD", max_length=3)
    base_salary: Decimal = Field(default=Decimal("0.00"), ge=0)
    hra: Decimal = Field(default=Decimal("0.00"), ge=0)
    allowances: dict[str, Any] = Field(default_factory=dict)
    deductions: dict[str, Any] = Field(default_factory=dict)
    payment_frequency: str = Field(default="monthly")
    effective_from: date
    is_active: bool = True


class SalaryStructureCreate(SalaryStructureBase):
    employee_id: uuid.UUID


class SalaryStructureUpdate(BaseModel):
    currency: str | None = Field(default=None, max_length=3)
    base_salary: Decimal | None = Field(default=None, ge=0)
    hra: Decimal | None = Field(default=None, ge=0)
    allowances: dict[str, Any] | None = None
    deductions: dict[str, Any] | None = None
    payment_frequency: str | None = None
    effective_from: date | None = None
    is_active: bool | None = None


class SalaryStructureResponse(SalaryStructureBase):
    id: uuid.UUID
    organization_id: uuid.UUID
    employee_id: uuid.UUID
    employee_name: str | None = None
    employee_code: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PayrollRunCreate(BaseModel):
    period_month: int = Field(..., ge=1, le=12)
    period_year: int = Field(..., ge=2020)
    title: str | None = None
    notes: str | None = None


class PayrollResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    title: str
    period_month: int
    period_year: int
    status: str
    total_gross_pay: Decimal
    total_deductions: Decimal
    total_net_pay: Decimal
    total_bonus_pay: Decimal = Decimal("0.00")
    employee_count: int
    processed_by: uuid.UUID | None = None
    approved_by: uuid.UUID | None = None
    payment_date: date | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PayslipResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    payroll_id: uuid.UUID
    employee_id: uuid.UUID
    employee_name: str | None = None
    employee_code: str | None = None
    department_name: str | None = None
    payslip_number: str
    base_salary: Decimal
    bonus_amount: Decimal = Decimal("0.00")
    gross_pay: Decimal
    total_deductions: Decimal
    net_pay: Decimal
    paid_days: int
    unpaid_days: int
    earnings_breakdown: dict[str, Any]
    deductions_breakdown: dict[str, Any]
    status: str
    payment_method: str
    payment_reference: str | None = None
    disbursement_date: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PayslipDisburseRequest(BaseModel):
    payment_method: str = Field(default="bank_transfer")
    payment_reference: str | None = None
    disbursement_date: datetime | None = None


class PayrollSummaryKPI(BaseModel):
    monthly_payroll_total: Decimal
    pending_approvals_count: int
    total_disbursed_ytd: Decimal
    active_employees_count: int
    currency: str = "USD"


# ---------------------------------------------------------------------------
# Bonus Schemas
# ---------------------------------------------------------------------------


class BonusAllocationCreate(BaseModel):
    employee_id: uuid.UUID
    amount: Decimal = Field(..., ge=0)
    percentage_rate: Decimal | None = None
    calculation_base_amount: Decimal | None = None
    notes: str | None = None


class BonusAllocationUpdate(BaseModel):
    amount: Decimal = Field(..., ge=0)
    notes: str | None = None



class BonusCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    description: str | None = None
    bonus_type: str = Field(default="bulk")  # "bulk" | "individual" | "project"
    calculation_type: str = Field(default="fixed")  # "fixed" | "percentage"
    calculation_base: str | None = Field(default="base_salary")  # "base_salary" | "project_budget" | "custom"
    rate_or_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    currency: str = Field(default="USD", max_length=3)
    period_month: int = Field(..., ge=1, le=12)
    period_year: int = Field(..., ge=2020)
    project_id: uuid.UUID | None = None
    project_reference: str | None = None
    target_department_id: uuid.UUID | None = None
    notes: str | None = None
    employee_ids: list[uuid.UUID] | None = None
    allocations: list[BonusAllocationCreate] | None = None


class BonusAllocationResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    bonus_id: uuid.UUID
    employee_id: uuid.UUID
    employee_name: str | None = None
    employee_code: str | None = None
    department_name: str | None = None
    amount: Decimal
    percentage_rate: Decimal | None = None
    calculation_base_amount: Decimal | None = None
    currency: str
    status: str
    payroll_id: uuid.UUID | None = None
    payslip_id: uuid.UUID | None = None
    period_month: int
    period_year: int
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BonusResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    description: str | None = None
    bonus_type: str
    calculation_type: str
    calculation_base: str | None = None
    rate_or_amount: Decimal
    currency: str
    period_month: int
    period_year: int
    status: str
    total_amount: Decimal
    employee_count: int
    project_id: uuid.UUID | None = None
    project_reference: str | None = None
    target_department_id: uuid.UUID | None = None
    rejection_reason: str | None = None
    notes: str | None = None
    created_by: uuid.UUID | None = None
    approved_by: uuid.UUID | None = None
    rejected_by: uuid.UUID | None = None
    cancelled_by: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
    allocations: list[BonusAllocationResponse] = []

    model_config = ConfigDict(from_attributes=True)


class BonusRejectRequest(BaseModel):
    rejection_reason: str = Field(..., min_length=3, description="Mandatory reason for rejection")


class BonusPreviewRequest(BaseModel):
    bonus_type: str = "bulk"
    calculation_type: str = "fixed"
    calculation_base: str | None = "base_salary"
    rate_or_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    currency: str = "USD"
    period_month: int = Field(..., ge=1, le=12)
    period_year: int = Field(..., ge=2020)
    project_id: uuid.UUID | None = None
    target_department_id: uuid.UUID | None = None
    employee_ids: list[uuid.UUID] | None = None


class BonusPreviewItem(BaseModel):
    employee_id: uuid.UUID
    employee_name: str
    employee_code: str | None = None
    department_name: str | None = None
    base_salary: Decimal
    bonus_amount: Decimal
    percentage_rate: Decimal | None = None


class BonusPreviewResponse(BaseModel):
    currency: str
    total_estimated_amount: Decimal
    employee_count: int
    items: list[BonusPreviewItem]

