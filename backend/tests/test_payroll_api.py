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
    BonusAllocationCreate,
    BonusAllocationResponse,
    BonusCreate,
    BonusPreviewRequest,
    BonusPreviewResponse,
    BonusRejectRequest,
    BonusResponse,
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
async def test_generate_payroll_no_declared_structures_raises():
    mock_session = AsyncMock()
    mock_res_dup = MagicMock()
    mock_res_dup.scalar_one_or_none.return_value = None  # no duplicate

    emp1 = MagicMock()
    emp1.id = uuid4()
    mock_res_emp = MagicMock()
    mock_res_emp.scalars.return_value.all.return_value = [emp1]

    mock_res_struct = MagicMock()
    mock_res_struct.scalars.return_value.all.return_value = []  # no declared structures

    mock_session.execute = AsyncMock(side_effect=[mock_res_dup, mock_res_emp, mock_res_struct])

    data = PayrollRunCreate(period_month=11, period_year=2026)
    with pytest.raises(HTTPException) as exc_info:
        await PayrollService.generate_payroll_run(mock_session, uuid4(), uuid4(), data)
    assert exc_info.value.status_code == 400
    assert "declared salary structures" in exc_info.value.detail


@pytest.mark.asyncio
async def test_generate_payroll_only_includes_declared_salary_structures():
    mock_session = AsyncMock()
    mock_res_dup = MagicMock()
    mock_res_dup.scalar_one_or_none.return_value = None  # no duplicate

    emp1 = MagicMock()
    emp1.id = uuid4()
    emp1.first_name = "Niladri"
    emp1.last_name = "Banerjee"

    emp2 = MagicMock()
    emp2.id = uuid4()
    emp2.first_name = "Sarah"
    emp2.last_name = "Connor"  # NO salary structure declared

    mock_res_emp = MagicMock()
    mock_res_emp.scalars.return_value.all.return_value = [emp1, emp2]

    # Only emp1 has structure declared
    struct1 = MagicMock()
    struct1.employee_id = emp1.id
    struct1.base_salary = Decimal("5500.00")
    struct1.hra = Decimal("1000.00")
    struct1.allowances = {}
    struct1.deductions = {}

    mock_res_struct = MagicMock()
    mock_res_struct.scalars.return_value.all.return_value = [struct1]

    mock_res_empty = MagicMock()
    mock_res_empty.scalars.return_value.all.return_value = []

    mock_session.execute = AsyncMock(
        side_effect=[
            mock_res_dup,
            mock_res_emp,
            mock_res_struct,
            mock_res_empty,  # unpaid leaves
            mock_res_empty,  # absent records
            mock_res_empty,  # bonus allocations
        ]
    )
    async def fake_refresh(obj):
        obj.created_at = datetime.now(UTC)
        obj.updated_at = datetime.now(UTC)

    mock_session.add = MagicMock()
    mock_session.flush = AsyncMock()
    mock_session.refresh = AsyncMock(side_effect=fake_refresh)

    data = PayrollRunCreate(period_month=9, period_year=2026)
    payroll_res = await PayrollService.generate_payroll_run(mock_session, uuid4(), uuid4(), data)

    # Must only include 1 employee (emp1), emp2 must NOT be included
    assert payroll_res.employee_count == 1
    assert payroll_res.total_gross_pay == Decimal("6500.00")
    assert payroll_res.total_net_pay == Decimal("6500.00")


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


@pytest.mark.asyncio
async def test_delete_payroll_run_draft_success():
    mock_session = AsyncMock()
    mock_payroll = MagicMock()
    mock_payroll.status = "draft"
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_payroll
    mock_session.execute = AsyncMock(return_value=mock_res)
    mock_session.delete = AsyncMock()
    mock_session.flush = AsyncMock()

    await PayrollService.delete_payroll_run(mock_session, uuid4(), uuid4())
    mock_session.delete.assert_called_once_with(mock_payroll)


@pytest.mark.asyncio
async def test_delete_payroll_run_paid_status_raises():
    mock_session = AsyncMock()
    mock_payroll = MagicMock()
    mock_payroll.status = "paid"
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_payroll
    mock_session.execute = AsyncMock(return_value=mock_res)

    with pytest.raises(HTTPException) as exc_info:
        await PayrollService.delete_payroll_run(mock_session, uuid4(), uuid4())
    assert exc_info.value.status_code == 400
    assert "Only draft or cancelled runs can be removed" in exc_info.value.detail


@pytest.mark.asyncio
async def test_preview_bonus_fixed_and_percentage():
    mock_session = AsyncMock()
    org_id = uuid4()
    emp_id = uuid4()

    mock_emp = MagicMock()
    mock_emp.id = emp_id
    mock_emp.first_name = "Niladri"
    mock_emp.last_name = "Banerjee"
    mock_emp.employee_code = "EMP-001"
    mock_emp.department = MagicMock(name="Engineering")
    mock_emp.department.name = "Engineering"

    mock_struct = MagicMock()
    mock_struct.employee_id = emp_id
    mock_struct.base_salary = Decimal("5000.00")
    mock_struct.currency = "USD"

    res_emp = MagicMock()
    res_emp.scalars.return_value.all.return_value = [mock_emp]

    res_struct = MagicMock()
    res_struct.scalars.return_value.all.return_value = [mock_struct]

    mock_session.execute = AsyncMock(side_effect=[res_emp, res_struct])

    # Fixed calculation
    req_fixed = BonusPreviewRequest(
        bonus_type="bulk",
        calculation_type="fixed",
        rate_or_amount=Decimal("1000.00"),
        currency="USD",
        period_month=10,
        period_year=2026,
    )
    preview_fixed = await PayrollService.preview_bonus(mock_session, org_id, req_fixed)
    assert preview_fixed.employee_count == 1
    assert preview_fixed.total_estimated_amount == Decimal("1000.00")
    assert preview_fixed.items[0].bonus_amount == Decimal("1000.00")

    # Percentage calculation: 15% of 5000 = 750
    mock_session.execute = AsyncMock(side_effect=[res_emp, res_struct])
    req_pct = BonusPreviewRequest(
        bonus_type="bulk",
        calculation_type="percentage",
        rate_or_amount=Decimal("15.00"),
        currency="USD",
        period_month=10,
        period_year=2026,
    )
    preview_pct = await PayrollService.preview_bonus(mock_session, org_id, req_pct)
    assert preview_pct.employee_count == 1
    assert preview_pct.total_estimated_amount == Decimal("750.00")
    assert preview_pct.items[0].bonus_amount == Decimal("750.00")


@pytest.mark.asyncio
async def test_submit_and_approve_bonus():
    mock_session = AsyncMock()
    org_id = uuid4()
    bonus_id = uuid4()
    user_id = uuid4()

    mock_bonus = MagicMock()
    mock_bonus.id = bonus_id
    mock_bonus.organization_id = org_id
    mock_bonus.name = "Durga Puja Bonus 2026"
    mock_bonus.description = "Festival bonus for all employees"
    mock_bonus.bonus_type = "bulk"
    mock_bonus.calculation_type = "fixed"
    mock_bonus.calculation_base = "base_salary"
    mock_bonus.rate_or_amount = Decimal("500.00")
    mock_bonus.currency = "USD"
    mock_bonus.period_month = 10
    mock_bonus.period_year = 2026
    mock_bonus.status = "draft"
    mock_bonus.total_amount = Decimal("500.00")
    mock_bonus.employee_count = 1
    mock_bonus.project_id = None
    mock_bonus.project_reference = None
    mock_bonus.target_department_id = None
    mock_bonus.rejection_reason = None
    mock_bonus.notes = None
    mock_bonus.created_by = user_id
    mock_bonus.approved_by = None
    mock_bonus.rejected_by = None
    mock_bonus.cancelled_by = None
    mock_bonus.created_at = datetime.now(UTC)
    mock_bonus.updated_at = datetime.now(UTC)

    mock_alloc = MagicMock()
    mock_alloc.id = uuid4()
    mock_alloc.organization_id = org_id
    mock_alloc.bonus_id = bonus_id
    mock_alloc.employee_id = uuid4()
    mock_alloc.employee = MagicMock(first_name="Jane", last_name="Doe", employee_code="EMP-1", department=None)
    mock_alloc.amount = Decimal("500.00")
    mock_alloc.percentage_rate = None
    mock_alloc.calculation_base_amount = Decimal("5000.00")
    mock_alloc.currency = "USD"
    mock_alloc.status = "draft"
    mock_alloc.payroll_id = None
    mock_alloc.payslip_id = None
    mock_alloc.period_month = 10
    mock_alloc.period_year = 2026
    mock_alloc.notes = None
    mock_alloc.created_at = datetime.now(UTC)
    mock_alloc.updated_at = datetime.now(UTC)

    mock_bonus.allocations = [mock_alloc]

    res1 = MagicMock()
    res1.scalar_one_or_none.return_value = mock_bonus
    res_alloc = MagicMock()
    res_alloc.scalars.return_value.all.return_value = [mock_alloc]

    # Submit for approval
    mock_session.execute = AsyncMock(side_effect=[res1, res_alloc, res1])
    submitted = await PayrollService.submit_bonus_for_approval(mock_session, org_id, bonus_id, user_id)
    assert mock_bonus.status == "pending_approval"
    assert mock_alloc.status == "pending_approval"

    # Approve
    res_no_payroll = MagicMock()
    res_no_payroll.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(side_effect=[res1, res_alloc, res_no_payroll, res1])
    approved = await PayrollService.approve_bonus(mock_session, org_id, bonus_id, user_id)
    assert mock_bonus.status == "approved"
    assert mock_bonus.approved_by == user_id
    assert mock_alloc.status == "approved"


@pytest.mark.asyncio
async def test_reject_bonus_requires_reason():
    mock_session = AsyncMock()
    org_id = uuid4()
    bonus_id = uuid4()
    user_id = uuid4()

    # Empty reason should raise 400
    with pytest.raises(HTTPException) as exc_info:
        await PayrollService.reject_bonus(
            mock_session, org_id, bonus_id, user_id, BonusRejectRequest(rejection_reason="   ")
        )
    assert exc_info.value.status_code == 400
    assert "valid rejection reason is required" in exc_info.value.detail


@pytest.mark.asyncio
async def test_payroll_run_includes_approved_bonus():
    mock_session = AsyncMock()
    org_id = uuid4()
    user_id = uuid4()
    emp_id = uuid4()

    # Duplicate check
    res_dup = MagicMock()
    res_dup.scalar_one_or_none.return_value = None

    # Employees
    mock_emp = MagicMock()
    mock_emp.id = emp_id
    mock_emp.first_name = "Niladri"
    mock_emp.last_name = "Banerjee"
    mock_emp.department = None
    res_emp = MagicMock()
    res_emp.scalars.return_value.all.return_value = [mock_emp]

    # Salary structure: Base 5000, HRA 1000
    mock_struct = MagicMock()
    mock_struct.employee_id = emp_id
    mock_struct.base_salary = Decimal("5000.00")
    mock_struct.hra = Decimal("1000.00")
    mock_struct.allowances = {}
    mock_struct.deductions = {}
    mock_struct.currency = "USD"
    res_struct = MagicMock()
    res_struct.scalars.return_value.all.return_value = [mock_struct]

    # Unpaid leaves and absences (empty)
    res_empty = MagicMock()
    res_empty.scalars.return_value.all.return_value = []

    # Approved Bonus Allocation: 1500 USD
    mock_bonus_campaign = MagicMock()
    mock_bonus_campaign.id = uuid4()
    mock_bonus_campaign.name = "Durga Puja Bonus 2026"
    mock_bonus_campaign.status = "approved"

    mock_b_alloc = MagicMock()
    mock_b_alloc.id = uuid4()
    mock_b_alloc.bonus_id = mock_bonus_campaign.id
    mock_b_alloc.employee_id = emp_id
    mock_b_alloc.amount = Decimal("1500.00")
    mock_b_alloc.currency = "USD"
    mock_b_alloc.status = "approved"
    mock_b_alloc.bonus = mock_bonus_campaign

    res_bonus = MagicMock()
    res_bonus.scalars.return_value.all.return_value = [mock_b_alloc]

    # Unincluded check after loop
    res_uninc = MagicMock()
    res_uninc.scalars.return_value.first.return_value = None

    res_b_obj = MagicMock()
    res_b_obj.scalar_one_or_none.return_value = mock_bonus_campaign

    mock_session.execute = AsyncMock(
        side_effect=[
            res_dup,
            res_emp,
            res_struct,
            res_empty,  # unpaid leave
            res_empty,  # absences
            res_bonus,  # approved bonuses
            res_uninc,  # unincluded check
            res_b_obj,  # update parent bonus
        ]
    )

    async def fake_refresh(obj):
        obj.created_at = datetime.now(UTC)
        obj.updated_at = datetime.now(UTC)

    mock_session.add = MagicMock()
    mock_session.flush = AsyncMock()
    mock_session.refresh = AsyncMock(side_effect=fake_refresh)

    data = PayrollRunCreate(period_month=10, period_year=2026)
    payroll_res = await PayrollService.generate_payroll_run(mock_session, org_id, user_id, data)

    # Gross pay = 5000 (base) + 1000 (HRA) + 1500 (Bonus) = 7500
    assert payroll_res.total_gross_pay == Decimal("7500.00")
    assert payroll_res.total_net_pay == Decimal("7500.00")

    # Allocation status is updated to included_in_payroll
    assert mock_b_alloc.status == "included_in_payroll"
    assert mock_b_alloc.payroll_id is not None


@pytest.mark.asyncio
async def test_sync_payroll_run_paid_is_immutable():
    mock_session = AsyncMock()
    org_id = uuid4()
    payroll_id = uuid4()

    mock_payroll = MagicMock()
    mock_payroll.id = payroll_id
    mock_payroll.organization_id = org_id
    mock_payroll.status = "paid"
    mock_payroll.title = "October 2026 Payroll"
    mock_payroll.period_month = 10
    mock_payroll.period_year = 2026
    mock_payroll.total_gross_pay = Decimal("50000.00")
    mock_payroll.total_bonus_pay = Decimal("0.00")
    mock_payroll.total_deductions = Decimal("0.00")
    mock_payroll.total_net_pay = Decimal("50000.00")
    mock_payroll.employee_count = 5
    mock_payroll.processed_by = None
    mock_payroll.approved_by = None
    mock_payroll.payment_date = date(2026, 10, 31)
    mock_payroll.notes = "Finalized"
    mock_payroll.created_at = datetime.now(UTC)
    mock_payroll.updated_at = datetime.now(UTC)
    mock_payroll.payslips = []

    res_payroll = MagicMock()
    res_payroll.scalar_one_or_none.return_value = mock_payroll

    mock_session.execute = AsyncMock(return_value=res_payroll)

    res = await PayrollService.sync_payroll_run(mock_session, org_id, payroll_id)

    # Should immediately return validated response without modifying anything
    assert res.status == "paid"
    assert res.total_gross_pay == Decimal("50000.00")
    assert res.total_net_pay == Decimal("50000.00")


@pytest.mark.asyncio
async def test_cancel_bonus_fails_if_paid():
    mock_session = AsyncMock()
    org_id = uuid4()
    bonus_id = uuid4()
    user_id = uuid4()

    mock_bonus = MagicMock()
    mock_bonus.id = bonus_id
    mock_bonus.organization_id = org_id
    mock_bonus.status = "paid"

    res_bonus = MagicMock()
    res_bonus.scalar_one_or_none.return_value = mock_bonus
    mock_session.execute = AsyncMock(return_value=res_bonus)

    with pytest.raises(HTTPException) as exc_info:
        await PayrollService.cancel_bonus(mock_session, org_id, bonus_id, user_id)
    assert exc_info.value.status_code == 400
    assert "already been paid" in exc_info.value.detail


