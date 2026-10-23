"""Unit tests for Reimbursement Management module.

Tests models, schemas, service methods, state transitions, and validation.
"""

from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.schemas.common import PaginatedData, PaginationMeta
from app.schemas.reimbursement import (
    ReimbursementClaimCreate,
    ReimbursementClaimItem,
    ReimbursementClaimResponse,
    ReimbursementClaimUpdate,
    ReimbursementPayAction,
    ReimbursementReviewAction,
    ReimbursementSummaryKPI,
)
from app.services.reimbursement import ReimbursementService


def _make_claim_response(**overrides):
    defaults = {
        "id": uuid4(),
        "organization_id": uuid4(),
        "employee_id": uuid4(),
        "employee_name": "Jane Doe",
        "employee_code": "EMP-001",
        "claim_number": "CLM-202610-0001",
        "title": "Client Onsite Flight & Cab",
        "category": "travel",
        "claim_date": date(2026, 10, 15),
        "amount": Decimal("450.00"),
        "currency": "USD",
        "status": "draft",
        "receipt_url": "https://example.com/receipt.pdf",
        "description": "Travel to customer HQ",
        "items": [
            {
                "description": "Flight ticket",
                "amount": "380.00",
                "category": "travel",
                "expense_date": "2026-10-15",
                "receipt_url": None,
            },
            {
                "description": "Airport Taxi",
                "amount": "70.00",
                "category": "travel",
                "expense_date": "2026-10-15",
                "receipt_url": None,
            },
        ],
        "submitted_at": None,
        "reviewer_id": None,
        "reviewer_name": None,
        "reviewed_at": None,
        "reviewer_comment": None,
        "paid_at": None,
        "payment_reference": None,
        "created_at": datetime(2026, 10, 15, 0, 0, 0, tzinfo=UTC),
        "updated_at": datetime(2026, 10, 15, 0, 0, 0, tzinfo=UTC),
    }
    defaults.update(overrides)
    return ReimbursementClaimResponse(**defaults)


@pytest.mark.asyncio
async def test_get_summary_kpi():
    mock_session = AsyncMock()
    # 4 scalar calls for counts, 3 for sums
    mock_session.scalar = AsyncMock(
        side_effect=[
            10,  # total claims
            3,   # pending
            2,   # approved
            4,   # paid
            Decimal("5000.00"),  # total amount
            Decimal("1200.00"),  # pending amount
            Decimal("2800.00"),  # paid amount
        ]
    )

    kpi = await ReimbursementService.get_summary_kpi(mock_session, uuid4())
    assert kpi.total_claims_count == 10
    assert kpi.pending_approval_count == 3
    assert kpi.approved_unpaid_count == 2
    assert kpi.paid_claims_count == 4
    assert kpi.total_claimed_amount == Decimal("5000.00")
    assert kpi.pending_approval_amount == Decimal("1200.00")
    assert kpi.total_reimbursed_amount == Decimal("2800.00")


@pytest.mark.asyncio
async def test_list_claims_returns_paginated():
    claims = [_make_claim_response(), _make_claim_response(claim_number="CLM-202610-0002")]
    mock_paginated = PaginatedData(
        items=claims,
        meta=PaginationMeta(total=2, page=1, page_size=20, total_pages=1),
    )
    with patch(
        "app.services.reimbursement.ReimbursementService.list_claims",
        new=AsyncMock(return_value=mock_paginated),
    ):
        res = await ReimbursementService.list_claims(
            AsyncMock(), uuid4(), search=None, status_filter=None
        )
        assert len(res.items) == 2
        assert res.meta.total == 2
        assert res.items[0].claim_number == "CLM-202610-0001"


@pytest.mark.asyncio
async def test_create_claim_without_employee_raises():
    mock_session = AsyncMock()
    payload = ReimbursementClaimCreate(
        title="Dinner with client",
        amount=Decimal("120.00"),
        category="meals",
        employee_id=None,
    )
    with pytest.raises(HTTPException) as exc_info:
        await ReimbursementService.create_claim(mock_session, uuid4(), None, payload)
    assert exc_info.value.status_code == 400
    assert "Employee profile must be associated" in exc_info.value.detail


@pytest.mark.asyncio
async def test_submit_claim_state_transition():
    mock_session = AsyncMock()
    claim_id = uuid4()
    org_id = uuid4()
    emp_id = uuid4()

    mock_claim = MagicMock()
    mock_claim.id = claim_id
    mock_claim.organization_id = org_id
    mock_claim.employee_id = emp_id
    mock_claim.status = "draft"
    mock_claim.employee = MagicMock(first_name="Jane", last_name="Doe", employee_code="EMP-001")
    mock_claim.reviewer = None
    mock_claim.claim_number = "CLM-202610-0001"
    mock_claim.title = "Conference Pass"
    mock_claim.category = "training"
    mock_claim.claim_date = date(2026, 10, 1)
    mock_claim.amount = Decimal("300.00")
    mock_claim.currency = "USD"
    mock_claim.receipt_url = None
    mock_claim.description = None
    mock_claim.items = []
    mock_claim.reviewer_id = None
    mock_claim.submitted_at = None
    mock_claim.reviewed_at = None
    mock_claim.reviewer_comment = None
    mock_claim.paid_at = None
    mock_claim.payment_reference = None
    mock_claim.created_at = datetime.now(UTC)
    mock_claim.updated_at = datetime.now(UTC)

    mock_session.scalar = AsyncMock(return_value=mock_claim)
    mock_session.flush = AsyncMock()
    mock_session.refresh = AsyncMock()

    res = await ReimbursementService.submit_claim(
        mock_session, org_id, claim_id, actor_employee_id=emp_id, is_employee_restricted=True
    )
    assert mock_claim.status == "submitted"
    assert mock_claim.submitted_at is not None


@pytest.mark.asyncio
async def test_approve_claim_validates_status():
    mock_session = AsyncMock()
    claim_id = uuid4()
    org_id = uuid4()
    reviewer_id = uuid4()

    # Draft claim cannot be directly approved
    mock_claim = MagicMock()
    mock_claim.id = claim_id
    mock_claim.status = "draft"

    mock_session.scalar = AsyncMock(return_value=mock_claim)

    with pytest.raises(HTTPException) as exc_info:
        await ReimbursementService.approve_claim(
            mock_session, org_id, claim_id, reviewer_id, ReimbursementReviewAction(reviewer_comment="Approved")
        )
    assert exc_info.value.status_code == 400
    assert "Only submitted claims can be approved" in exc_info.value.detail


@pytest.mark.asyncio
async def test_pay_claim_updates_status():
    mock_session = AsyncMock()
    claim_id = uuid4()
    org_id = uuid4()

    mock_claim = MagicMock()
    mock_claim.id = claim_id
    mock_claim.organization_id = org_id
    mock_claim.employee_id = uuid4()
    mock_claim.status = "approved"
    mock_claim.employee = MagicMock(first_name="Jane", last_name="Doe", employee_code="EMP-001")
    mock_claim.reviewer = MagicMock(first_name="Bob", last_name="Smith")
    mock_claim.claim_number = "CLM-202610-0001"
    mock_claim.title = "Hardware"
    mock_claim.category = "tech_hardware"
    mock_claim.claim_date = date(2026, 10, 1)
    mock_claim.amount = Decimal("150.00")
    mock_claim.currency = "USD"
    mock_claim.receipt_url = None
    mock_claim.description = None
    mock_claim.items = []
    mock_claim.submitted_at = datetime.now(UTC)
    mock_claim.reviewer_id = uuid4()
    mock_claim.reviewed_at = datetime.now(UTC)
    mock_claim.reviewer_comment = "Looks good"
    mock_claim.paid_at = None
    mock_claim.payment_reference = None
    mock_claim.created_at = datetime.now(UTC)
    mock_claim.updated_at = datetime.now(UTC)

    mock_session.scalar = AsyncMock(return_value=mock_claim)
    mock_session.flush = AsyncMock()
    mock_session.refresh = AsyncMock()

    res = await ReimbursementService.pay_claim(
        mock_session, org_id, claim_id, ReimbursementPayAction(payment_reference="WIRE-998811")
    )
    assert mock_claim.status == "paid"
    assert mock_claim.payment_reference == "WIRE-998811"
    assert mock_claim.paid_at is not None
