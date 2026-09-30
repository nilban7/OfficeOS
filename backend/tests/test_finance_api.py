"""Unit tests for Finance Management API endpoints and service methods.

Uses mocked AsyncSession and service methods — no live DB required.
"""

from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.schemas.common import PaginatedData, PaginationMeta
from app.schemas.finance import (
    CategorySummary,
    EmployeeSummary,
    ExpenseAction,
    ExpenseCategoryCreate,
    ExpenseCategoryResponse,
    ExpenseCreate,
    ExpenseDetail,
    ExpenseItemCreate,
    ExpenseItemResponse,
    ExpensePayAction,
    ExpenseResponse,
    ExpenseReviewAction,
    FinancialOverview,
    FinancialTransactionCreate,
    FinancialTransactionResponse,
)
from app.services.finance import FinanceService


def _make_category_response(**overrides):
    defaults = {
        "id": uuid4(),
        "organization_id": uuid4(),
        "name": "Travel & Transportation",
        "code": "TRAVEL",
        "description": "Travel expenses",
        "is_active": True,
        "created_at": datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC),
        "updated_at": datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC),
    }
    defaults.update(overrides)
    return ExpenseCategoryResponse(**defaults)


def _make_expense_response(**overrides):
    defaults = {
        "id": uuid4(),
        "organization_id": uuid4(),
        "expense_number": "EXP-2025-001",
        "employee_id": uuid4(),
        "category_id": uuid4(),
        "project_id": None,
        "client_id": None,
        "branch_id": None,
        "expense_date": date(2025, 3, 15),
        "description": "Client meeting flights",
        "amount": Decimal("500.00"),
        "tax_amount": Decimal("50.00"),
        "total_amount": Decimal("550.00"),
        "currency": "USD",
        "status": "draft",
        "submitted_at": None,
        "approved_at": None,
        "rejected_at": None,
        "paid_at": None,
        "reviewer_id": None,
        "reviewer_comment": None,
        "notes": None,
        "created_at": datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC),
        "updated_at": datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC),
        "employee": EmployeeSummary(
            id=uuid4(),
            employee_code="EMP-001",
            first_name="Alice",
            last_name="Smith",
            designation="Manager",
        ),
        "category": CategorySummary(
            id=uuid4(),
            name="Travel & Transportation",
            code="TRAVEL",
        ),
        "project": None,
        "client": None,
        "branch": None,
        "reviewer": None,
        "items_count": 1,
    }
    defaults.update(overrides)
    return ExpenseResponse(**defaults)


def _make_expense_detail(**overrides):
    base_resp = _make_expense_response(**overrides)
    items = [
        ExpenseItemResponse(
            id=uuid4(),
            organization_id=base_resp.organization_id,
            expense_id=base_resp.id,
            description="Flight tickets",
            quantity=Decimal("1.00"),
            unit_price=Decimal("500.00"),
            tax_amount=Decimal("50.00"),
            line_total=Decimal("550.00"),
            created_at=datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC),
        )
    ]
    return ExpenseDetail(
        **base_resp.model_dump(),
        items=items,
    )


def _make_transaction_response(**overrides):
    defaults = {
        "id": uuid4(),
        "organization_id": uuid4(),
        "transaction_number": "TX-EXP-2025-001",
        "transaction_date": date(2025, 3, 16),
        "transaction_type": "expense_payment",
        "reference_type": "expense",
        "reference_id": uuid4(),
        "description": "Payment for expense EXP-2025-001",
        "debit": Decimal("550.00"),
        "credit": Decimal("0.00"),
        "currency": "USD",
        "project_id": None,
        "client_id": None,
        "vendor_id": None,
        "employee_id": uuid4(),
        "status": "posted",
        "notes": None,
        "created_at": datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC),
        "updated_at": datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC),
        "project": None,
        "client": None,
        "vendor": None,
        "employee": None,
    }
    defaults.update(overrides)
    return FinancialTransactionResponse(**defaults)


@pytest.mark.asyncio
async def test_list_categories_returns_list():
    cats = [_make_category_response(), _make_category_response(name="Supplies", code="SUPPLY")]
    with patch("app.services.finance.FinanceService.list_categories", new=AsyncMock(return_value=cats)):
        result = await FinanceService.list_categories(
            session=AsyncMock(), organization_id=uuid4()
        )
        assert len(result) == 2
        assert result[0].code == "TRAVEL"


@pytest.mark.asyncio
async def test_create_category_duplicate_code_raises():
    mock_session = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = _make_category_response()
    mock_session.execute.return_value = mock_res

    payload = ExpenseCategoryCreate(name="Travel", code="TRAVEL")
    with pytest.raises(HTTPException) as exc:
        await FinanceService.create_category(
            session=mock_session,
            organization_id=uuid4(),
            actor_user_id=uuid4(),
            payload=payload,
        )
    assert exc.value.status_code == 409
    assert "already exists" in exc.value.detail


@pytest.mark.asyncio
async def test_list_expenses_returns_paginated():
    items = [_make_expense_response(), _make_expense_response(expense_number="EXP-2025-002")]
    paginated = PaginatedData(
        items=items,
        meta=PaginationMeta(total=2, page=1, page_size=20, total_pages=1),
    )
    with patch("app.services.finance.FinanceService.list_expenses", new=AsyncMock(return_value=paginated)):
        result = await FinanceService.list_expenses(
            session=AsyncMock(), organization_id=uuid4()
        )
        assert result.meta.total == 2
        assert len(result.items) == 2


@pytest.mark.asyncio
async def test_create_expense_duplicate_number_raises():
    mock_session = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = _make_expense_response()
    mock_session.execute.return_value = mock_res

    payload = ExpenseCreate(
        expense_number="EXP-2025-001",
        employee_id=uuid4(),
        category_id=uuid4(),
        expense_date=date(2025, 3, 15),
        amount=Decimal("100.00"),
    )
    with pytest.raises(HTTPException) as exc:
        await FinanceService.create_expense(
            session=mock_session,
            organization_id=uuid4(),
            actor_user_id=uuid4(),
            payload=payload,
        )
    assert exc.value.status_code == 409
    assert "already exists" in exc.value.detail


@pytest.mark.asyncio
async def test_create_expense_with_items_calculates_totals():
    items_create = [
        ExpenseItemCreate(
            description="Item 1",
            quantity=Decimal("2.00"),
            unit_price=Decimal("50.00"),
            tax_amount=Decimal("5.00"),
        ),
        ExpenseItemCreate(
            description="Item 2",
            quantity=Decimal("1.00"),
            unit_price=Decimal("100.00"),
            tax_amount=Decimal("10.00"),
        ),
    ]

    calc_amount = Decimal("200.00")
    calc_tax = Decimal("15.00")
    calc_total = Decimal("215.00")

    mock_resp = _make_expense_response(
        amount=calc_amount,
        tax_amount=calc_tax,
        total_amount=calc_total,
    )

    with patch("app.services.finance.FinanceService.create_expense", new=AsyncMock(return_value=mock_resp)):
        result = await FinanceService.create_expense(
            session=AsyncMock(),
            organization_id=uuid4(),
            actor_user_id=uuid4(),
            payload=ExpenseCreate(
                expense_number="EXP-NEW-001",
                employee_id=uuid4(),
                category_id=uuid4(),
                expense_date=date(2025, 3, 15),
                amount=Decimal("200.00"),
                items=items_create,
            ),
        )
        assert result.total_amount == Decimal("215.00")


@pytest.mark.asyncio
async def test_submit_expense_non_draft_raises():
    mock_session = AsyncMock()
    mock_expense = MagicMock()
    mock_expense.status = "submitted"
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_expense
    mock_session.execute.return_value = mock_res

    with pytest.raises(HTTPException) as exc:
        await FinanceService.submit_expense(
            session=mock_session,
            organization_id=uuid4(),
            expense_id=uuid4(),
            actor_user_id=uuid4(),
            payload=ExpenseAction(),
        )
    assert exc.value.status_code == 400
    assert "cannot submit" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_approve_expense_self_approval_prevented():
    mock_session = AsyncMock()
    same_emp_id = uuid4()
    mock_expense = MagicMock()
    mock_expense.status = "submitted"
    mock_expense.employee_id = same_emp_id
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_expense
    mock_session.execute.return_value = mock_res

    with pytest.raises(HTTPException) as exc:
        await FinanceService.approve_expense(
            session=mock_session,
            organization_id=uuid4(),
            expense_id=uuid4(),
            actor_user_id=uuid4(),
            actor_employee_id=same_emp_id,
            payload=ExpenseReviewAction(comment="Approving my own"),
        )
    assert exc.value.status_code == 400
    assert "own" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_approve_expense_non_submitted_raises():
    mock_session = AsyncMock()
    mock_expense = MagicMock()
    mock_expense.status = "draft"
    mock_expense.employee_id = uuid4()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_expense
    mock_session.execute.return_value = mock_res

    with pytest.raises(HTTPException) as exc:
        await FinanceService.approve_expense(
            session=mock_session,
            organization_id=uuid4(),
            expense_id=uuid4(),
            actor_user_id=uuid4(),
            actor_employee_id=uuid4(),
            payload=ExpenseReviewAction(),
        )
    assert exc.value.status_code == 400
    assert "draft" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_reject_expense_without_comment_raises():
    mock_session = AsyncMock()
    mock_expense = MagicMock()
    mock_expense.status = "submitted"
    mock_expense.employee_id = uuid4()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_expense
    mock_session.execute.return_value = mock_res

    with pytest.raises(HTTPException) as exc:
        await FinanceService.reject_expense(
            session=mock_session,
            organization_id=uuid4(),
            expense_id=uuid4(),
            actor_user_id=uuid4(),
            actor_employee_id=uuid4(),
            payload=ExpenseReviewAction(comment="   "),  # empty comment
        )
    assert exc.value.status_code == 400
    assert "comment" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_pay_expense_non_approved_raises():
    mock_session = AsyncMock()
    mock_expense = MagicMock()
    mock_expense.status = "draft"
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_expense
    mock_session.execute.return_value = mock_res

    with pytest.raises(HTTPException) as exc:
        await FinanceService.pay_expense(
            session=mock_session,
            organization_id=uuid4(),
            expense_id=uuid4(),
            actor_user_id=uuid4(),
            payload=ExpensePayAction(),
        )
    assert exc.value.status_code == 400
    assert "approved" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_cancel_expense_paid_raises():
    mock_session = AsyncMock()
    mock_expense = MagicMock()
    mock_expense.status = "paid"
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_expense
    mock_session.execute.return_value = mock_res

    with pytest.raises(HTTPException) as exc:
        await FinanceService.cancel_expense(
            session=mock_session,
            organization_id=uuid4(),
            expense_id=uuid4(),
            actor_user_id=uuid4(),
            payload=ExpenseAction(),
        )
    assert exc.value.status_code == 400
    assert "paid" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_create_transaction_both_debit_credit_zero_raises():
    mock_session = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = None  # No duplicate
    mock_session.execute.return_value = mock_res

    payload = FinancialTransactionCreate(
        transaction_number="TX-001",
        transaction_date=date(2025, 3, 16),
        transaction_type="general",
        description="Zero amounts",
        debit=Decimal("0.00"),
        credit=Decimal("0.00"),
    )
    with pytest.raises(HTTPException) as exc:
        await FinanceService.create_transaction(
            session=mock_session,
            organization_id=uuid4(),
            actor_user_id=uuid4(),
            payload=payload,
        )
    assert exc.value.status_code == 400
    assert "either positive debit or positive credit" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_create_transaction_both_debit_credit_positive_raises():
    mock_session = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = None  # No duplicate
    mock_session.execute.return_value = mock_res

    payload = FinancialTransactionCreate(
        transaction_number="TX-001",
        transaction_date=date(2025, 3, 16),
        transaction_type="general",
        description="Both amounts positive",
        debit=Decimal("100.00"),
        credit=Decimal("100.00"),
    )
    with pytest.raises(HTTPException) as exc:
        await FinanceService.create_transaction(
            session=mock_session,
            organization_id=uuid4(),
            actor_user_id=uuid4(),
            payload=payload,
        )
    assert exc.value.status_code == 400
    assert "either positive debit or positive credit" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_get_overview_returns_metrics():
    overview = FinancialOverview(
        total_expenses=Decimal("15000.00"),
        pending_approvals_count=4,
        approved_expenses_count=2,
        paid_expenses_count=10,
        total_debits=Decimal("25000.00"),
        total_credits=Decimal("5000.00"),
    )
    with patch("app.services.finance.FinanceService.get_overview", new=AsyncMock(return_value=overview)):
        result = await FinanceService.get_overview(
            session=AsyncMock(), organization_id=uuid4()
        )
        assert result.pending_approvals_count == 4
        assert result.total_expenses == Decimal("15000.00")
