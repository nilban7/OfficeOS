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
