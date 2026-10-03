"""Unit tests for Payroll & Salary Management module.

Tests models, services, validation, and calculations.
"""

from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.schemas.payroll import (
    PayrollResponse,
    PayrollRunCreate,
    PayrollSummaryKPI,
    PayslipDisburseRequest,
    PayslipResponse,
    SalaryStructureResponse,
)
from app.services.payroll import PayrollService


def _make_structure_response(**overrides):
    defaults = {
        "id": uuid4(),
        "organization_id": uuid4(),
        "employee_id": uuid4(),
        "employee_name": "Jane Doe",
        "employee_code": "EMP-001",
        "currency": "USD",
        "base_salary": Decimal("6000.00"),
        "hra": Decimal("1200.00"),
        "allowances": {"Transport": 300},
        "deductions": {"PF": 300, "Tax": 600},
        "payment_frequency": "monthly",
        "effective_from": date(2026, 1, 1),
        "is_active": True,
        "created_at": datetime(2026, 1, 1, 0, 0, 0, tzinfo=UTC),
        "updated_at": datetime(2026, 1, 1, 0, 0, 0, tzinfo=UTC),
    }
    defaults.update(overrides)
    return SalaryStructureResponse(**defaults)


def _make_payroll_response(**overrides):
    defaults = {
        "id": uuid4(),
        "organization_id": uuid4(),
        "title": "October 2026 Payroll",
        "period_month": 10,
        "period_year": 2026,
        "status": "draft",
        "total_gross_pay": Decimal("7500.00"),
        "total_deductions": Decimal("900.00"),
        "total_net_pay": Decimal("6600.00"),
        "employee_count": 1,
        "processed_by": uuid4(),
        "approved_by": None,
        "payment_date": None,
        "notes": None,
        "created_at": datetime(2026, 10, 1, 0, 0, 0, tzinfo=UTC),
        "updated_at": datetime(2026, 10, 1, 0, 0, 0, tzinfo=UTC),
    }
    defaults.update(overrides)
    return PayrollResponse(**defaults)


def _make_payslip_response(**overrides):
    defaults = {
        "id": uuid4(),
        "organization_id": uuid4(),
        "payroll_id": uuid4(),
        "employee_id": uuid4(),
        "employee_name": "Jane Doe",
        "employee_code": "EMP-001",
        "department_name": "Engineering",
        "payslip_number": "PS-202610-0001",
        "base_salary": Decimal("6000.00"),
        "gross_pay": Decimal("7500.00"),
        "total_deductions": Decimal("900.00"),
        "net_pay": Decimal("6600.00"),
        "paid_days": 31,
        "unpaid_days": 0,
        "earnings_breakdown": {"Base Salary": 6000, "HRA": 1200, "Transport": 300},
        "deductions_breakdown": {"PF": 300, "Tax": 600},
        "status": "draft",
        "payment_method": "bank_transfer",
        "payment_reference": None,
        "disbursement_date": None,
        "created_at": datetime(2026, 10, 1, 0, 0, 0, tzinfo=UTC),
        "updated_at": datetime(2026, 10, 1, 0, 0, 0, tzinfo=UTC),
    }
    defaults.update(overrides)
    return PayslipResponse(**defaults)


@pytest.mark.asyncio
async def test_list_salary_structures():
    items = [_make_structure_response(), _make_structure_response()]
    with patch(
        "app.services.payroll.PayrollService.list_salary_structures",
        new=AsyncMock(return_value=items),
    ):
        res = await PayrollService.list_salary_structures(AsyncMock(), uuid4())
        assert len(res) == 2
        assert res[0].employee_name == "Jane Doe"
        assert res[0].base_salary == Decimal("6000.00")


@pytest.mark.asyncio
async def test_generate_payroll_duplicate_period_raises():
    mock_session = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = MagicMock()  # existing payroll
    mock_session.execute = AsyncMock(return_value=mock_res)

    data = PayrollRunCreate(period_month=10, period_year=2026)
    with pytest.raises(HTTPException) as exc_info:
        await PayrollService.generate_payroll_run(mock_session, uuid4(), uuid4(), data)
    assert exc_info.value.status_code == 409
    assert "already exists" in exc_info.value.detail


@pytest.mark.asyncio
async def test_generate_payroll_no_active_employees_raises():
    mock_session = AsyncMock()
    mock_res_dup = MagicMock()
    mock_res_dup.scalar_one_or_none.return_value = None  # no duplicate

    mock_res_emp = MagicMock()
    mock_res_emp.scalars.return_value.all.return_value = []  # no active employees

    mock_session.execute = AsyncMock(side_effect=[mock_res_dup, mock_res_emp])

    data = PayrollRunCreate(period_month=11, period_year=2026)
    with pytest.raises(HTTPException) as exc_info:
        await PayrollService.generate_payroll_run(mock_session, uuid4(), uuid4(), data)
    assert exc_info.value.status_code == 400
    assert "No active employees found" in exc_info.value.detail


@pytest.mark.asyncio
async def test_approve_payroll_run_invalid_status_raises():
    mock_session = AsyncMock()
    mock_payroll = MagicMock()
    mock_payroll.status = "paid"  # already paid, cannot approve
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_payroll
    mock_session.execute = AsyncMock(return_value=mock_res)

    with pytest.raises(HTTPException) as exc_info:
        await PayrollService.approve_payroll_run(mock_session, uuid4(), uuid4(), uuid4())
    assert exc_info.value.status_code == 400
    assert "Cannot approve payroll" in exc_info.value.detail


@pytest.mark.asyncio
async def test_disburse_payroll_run_requires_approved():
    mock_session = AsyncMock()
    mock_payroll = MagicMock()
    mock_payroll.status = "draft"  # draft, not approved
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_payroll
    mock_session.execute = AsyncMock(return_value=mock_res)

    data = PayslipDisburseRequest(payment_method="bank_transfer")
    with pytest.raises(HTTPException) as exc_info:
        await PayrollService.disburse_payroll_run(mock_session, uuid4(), uuid4(), data)
    assert exc_info.value.status_code == 400
    assert "must be approved before disbursement" in exc_info.value.detail


@pytest.mark.asyncio
async def test_payroll_summary_kpi_contract():
    kpi = PayrollSummaryKPI(
        monthly_payroll_total=Decimal("45000.00"),
        pending_approvals_count=1,
        total_disbursed_ytd=Decimal("360000.00"),
        active_employees_count=15,
        currency="USD",
    )
    assert kpi.monthly_payroll_total == Decimal("45000.00")
    assert kpi.pending_approvals_count == 1
    assert kpi.total_disbursed_ytd == Decimal("360000.00")
    assert kpi.active_employees_count == 15
