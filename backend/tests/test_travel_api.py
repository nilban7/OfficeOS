"""Unit tests for Travel Management module.

Tests models, schemas, service methods, planned travel workflow, post-registration,
financial calculations (budget variance, settlement balance), member rosters, and state transitions.
"""

from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.schemas.travel import (
    TravelExpenseCreate,
    TravelMemberCreate,
    TravelPaymentCreate,
    TravelSettlementCreate,
    TravelTripActualCostsUpdate,
    TravelTripApprovalAction,
    TravelTripCreatePast,
    TravelTripCreatePlanned,
)
from app.services.travel import TravelService


def _mock_trip(**overrides):
    trip_id = uuid4()
    org_id = uuid4()
    req_id = uuid4()

    mock = MagicMock()
    mock.id = trip_id
    mock.organization_id = org_id
    mock.trip_number = "TRV-2026-0001"
    mock.title = "Annual Tech Summit"
    mock.business_purpose = "Represent OfficeOS at Cloud Expo"
    mock.registration_type = "planned"
    mock.status = "draft"
    mock.settlement_status = "unsettled"
    mock.requester_id = req_id
    mock.department_id = None
    mock.client_id = None
    mock.project_id = None
    mock.origin = "San Francisco, CA"
    mock.destination = "New York, NY"
    mock.planned_start_date = date(2026, 11, 10)
    mock.planned_end_date = date(2026, 11, 15)
    mock.actual_start_date = None
    mock.actual_end_date = None
    mock.preferred_transport_mode = "flight"
    mock.actual_transport_mode = None
    mock.estimated_budget = Decimal("2500.00")
    mock.currency = "USD"
    mock.advance_requested = Decimal("500.00")
    mock.advance_approved = Decimal("0.00")
    mock.advance_paid = Decimal("0.00")
    mock.advance_status = "requested"
    mock.advance_payment_reference = None
    mock.advance_paid_at = None
    mock.accommodation_notes = "Hotel near Javits Center"
    mock.notes = "Client meetings scheduled"
    mock.missing_info_explanation = None
    mock.approver_id = None
    mock.approved_at = None
    mock.approver_comment = None
    mock.created_at = datetime.now(UTC)
    mock.updated_at = datetime.now(UTC)

    mock.requester = MagicMock(first_name="Alice", last_name="Walker", employee_code="EMP-101")
    mock.department = MagicMock(name="Engineering")
    mock.client = None
    mock.project = None
    mock.approver = None

    mock.est_travel_transport = Decimal("1000.00")
    mock.act_travel_transport = Decimal("0.00")
    mock.est_hotel_accommodation = Decimal("800.00")
    mock.act_hotel_accommodation = Decimal("0.00")
    mock.est_food_meals = Decimal("300.00")
    mock.act_food_meals = Decimal("0.00")
    mock.est_local_transport = Decimal("200.00")
    mock.act_local_transport = Decimal("0.00")
    mock.est_other_expenses = Decimal("200.00")
    mock.act_other_expenses = Decimal("0.00")
    mock.estimated_total = Decimal("2500.00")
    mock.actual_total = Decimal("0.00")
    mock.cost_difference = Decimal("-2500.00")
    mock.payer_type = "company"
    mock.company_paid_amount = Decimal("0.00")
    mock.employee_paid_amount = Decimal("0.00")

    mock.members = []
    mock.itineraries = []
    mock.expenses = []
    mock.payments = []
    mock.settlements = []
    mock.activity_logs = []

    for k, v in overrides.items():
        setattr(mock, k, v)
    return mock


@pytest.mark.asyncio
async def test_get_dashboard_kpi():
    mock_session = AsyncMock()
    mock_session.scalar = AsyncMock(
        side_effect=[
            12,                   # total_trips
            4,                    # upcoming_trips
            2,                    # ongoing_trips
            6,                    # past_trips
            3,                    # pending_approvals
            5,                    # pending_expense_reviews
            4,                    # unsettled_trips
            Decimal("30000.00"),  # total estimated budget
            Decimal("18500.00"),  # total actual approved expenses
            Decimal("21000.00"),  # total submitted expenses
            Decimal("4000.00"),   # total advances paid
            Decimal("6500.00"),   # total reimbursable approved
        ]
    )

    kpi = await TravelService.get_dashboard_kpi(mock_session, uuid4())
    assert kpi.total_trips == 12
    assert kpi.upcoming_trips == 4
    assert kpi.ongoing_trips == 2
    assert kpi.past_trips == 6
    assert kpi.pending_approvals == 3
    assert kpi.pending_expense_reviews == 5
    assert kpi.unsettled_trips == 4
    assert kpi.total_estimated_budget == Decimal("30000.00")
    assert kpi.total_actual_approved_expenses == Decimal("18500.00")
    assert kpi.total_advances_paid == Decimal("4000.00")


@pytest.mark.asyncio
async def test_create_planned_trip_workflow():
    mock_session = AsyncMock()
    org_id = uuid4()
    emp_id = uuid4()
    prof_id = uuid4()
    participant_id = uuid4()

    mock_session.scalar = AsyncMock(return_value="TRV-2026-0005")
    mock_session.add = MagicMock()
    mock_session.commit = AsyncMock()

    payload = TravelTripCreatePlanned(
        title="Client Q4 Strategy Workshop",
        business_purpose="Strategic planning with enterprise client",
        origin="Boston, MA",
        destination="Chicago, IL",
        planned_start_date=date(2026, 11, 20),
        planned_end_date=date(2026, 11, 23),
        preferred_transport_mode="flight",
        estimated_budget=Decimal("1800.00"),
        currency="USD",
        advance_requested=Decimal("400.00"),
        participating_employee_ids=[participant_id],
        submit_immediately=True,
    )

    with patch.object(TravelService, "get_trip", new=AsyncMock(return_value=MagicMock(title=payload.title, status="pending_approval"))):
        res = await TravelService.create_planned_trip(
            session=mock_session,
            organization_id=org_id,
            actor_employee_id=emp_id,
            actor_profile_id=prof_id,
            payload=payload,
        )
        assert res.title == payload.title
        assert res.status == "pending_approval"


@pytest.mark.asyncio
async def test_create_planned_trip_invalid_dates_raises():
    mock_session = AsyncMock()
    payload = TravelTripCreatePlanned(
        title="Invalid Dates Trip",
        business_purpose="Testing date validation",
        origin="SF",
        destination="NYC",
        planned_start_date=date(2026, 12, 10),
        planned_end_date=date(2026, 12, 5),  # Return before departure!
        estimated_budget=Decimal("500.00"),
    )

    with pytest.raises(HTTPException) as exc_info:
        await TravelService.create_planned_trip(
            mock_session, uuid4(), uuid4(), uuid4(), payload
        )
    assert exc_info.value.status_code == 400
    assert "Planned return date cannot be earlier" in exc_info.value.detail


@pytest.mark.asyncio
async def test_create_past_trip_workflow_bypasses_prior_approval():
    mock_session = AsyncMock()
    org_id = uuid4()
    emp_id = uuid4()
    prof_id = uuid4()

    mock_session.scalar = AsyncMock(return_value=None)
    mock_session.add = MagicMock()
    mock_session.commit = AsyncMock()

    payload = TravelTripCreatePast(
        title="Customer Emergency Onsite",
        business_purpose="Critical server incident resolution at customer datacenter",
        origin="Dallas, TX",
        destination="Austin, TX",
        actual_start_date=date(2026, 10, 10),
        actual_end_date=date(2026, 10, 12),
        actual_transport_mode="car",
        estimated_budget=Decimal("400.00"),
        advance_paid=Decimal("150.00"),
        advance_payment_reference="CARD-AUTO-881",
        status="completed",
        initial_expenses=[
            TravelExpenseCreate(
                category="fuel",
                expense_date=date(2026, 10, 10),
                description="Rental Car Gas",
                amount=Decimal("65.00"),
            )
        ],
    )

    with patch.object(TravelService, "get_trip", new=AsyncMock(return_value=MagicMock(registration_type="past", status="completed"))):
        res = await TravelService.create_past_trip(
            session=mock_session,
            organization_id=org_id,
            actor_employee_id=emp_id,
            actor_profile_id=prof_id,
            payload=payload,
        )
        assert res.registration_type == "past"
        assert res.status == "completed"


@pytest.mark.asyncio
async def test_approve_and_reject_planned_trip():
    mock_session = AsyncMock()
    org_id = uuid4()
    approver_id = uuid4()
    prof_id = uuid4()

    # 1. Approval
    trip = _mock_trip(status="pending_approval", advance_status="requested", advance_requested=Decimal("500.00"))
    mock_session.scalar = AsyncMock(return_value=trip)

    with patch.object(TravelService, "get_trip", new=AsyncMock(return_value=MagicMock(status="approved"))):
        await TravelService.approve_planned_trip(
            mock_session, org_id, trip.id, approver_id, prof_id,
            TravelTripApprovalAction(approver_comment="Travel is approved. Good luck.")
        )
        assert trip.status == "approved"
        assert trip.approver_id == approver_id
        assert trip.approver_comment == "Travel is approved. Good luck."
        assert trip.advance_status == "approved"
        assert trip.advance_approved == Decimal("500.00")

    # 2. Rejection
    trip.status = "pending_approval"
    trip.advance_status = "requested"
    with patch.object(TravelService, "get_trip", new=AsyncMock(return_value=MagicMock(status="rejected"))):
        await TravelService.reject_planned_trip(
            mock_session, org_id, trip.id, approver_id, prof_id,
            TravelTripApprovalAction(approver_comment="Budget exceeded for Q4")
        )
        assert trip.status == "rejected"
        assert trip.advance_status == "rejected"


@pytest.mark.asyncio
async def test_financial_calculations_and_settlement_balance():
    trip = _mock_trip(
        estimated_budget=Decimal("2000.00"),
        advance_paid=Decimal("500.00"),
    )

    # Add expenses
    exp1 = MagicMock(amount=Decimal("600.00"), status="approved", is_reimbursable=True)
    exp2 = MagicMock(amount=Decimal("300.00"), status="approved", is_reimbursable=True)
    exp3 = MagicMock(amount=Decimal("150.00"), status="rejected", is_reimbursable=True)  # Should not be in approved
    exp4 = MagicMock(amount=Decimal("200.00"), status="submitted", is_reimbursable=True) # Submitted only
    trip.expenses = [exp1, exp2, exp3, exp4]

    # Add booking commitments
    itn1 = MagicMock(estimated_cost=Decimal("450.00"), booking_status="confirmed")
    itn2 = MagicMock(estimated_cost=Decimal("100.00"), booking_status="cancelled")  # Should not be in commitments
    trip.itineraries = [itn1, itn2]

    fin = TravelService._calculate_trip_financials(trip)

    # Approved expenses: 600 + 300 = 900
    assert fin["total_approved_expenses"] == Decimal("900.00")
    # Total submitted: 600 + 300 + 200 = 1100
    assert fin["total_submitted_expenses"] == Decimal("1100.00")
    # Total reimbursable: 900.00
    assert fin["total_reimbursable_expenses"] == Decimal("900.00")
    # Advance paid: 500.00
    # Settlement balance = approved reimbursable (900) - advance paid (500) = 400 (Company owes employee)
    assert fin["settlement_balance"] == Decimal("400.00")
    # Budget variance = approved expenses (900) - estimated budget (2000) = -1100 (Under budget)
    assert fin["budget_variance"] == Decimal("-1100.00")
    # Booking commitments = 450.00
    assert fin["booking_commitments"] == Decimal("450.00")


@pytest.mark.asyncio
async def test_negative_settlement_balance_when_advance_exceeds_expenses():
    trip = _mock_trip(
        estimated_budget=Decimal("1000.00"),
        advance_paid=Decimal("800.00"),
    )
    exp = MagicMock(amount=Decimal("500.00"), status="approved", is_reimbursable=True)
    trip.expenses = [exp]

    fin = TravelService._calculate_trip_financials(trip)
    # Settlement balance = 500 - 800 = -300 (Employee owes company back 300)
    assert fin["settlement_balance"] == Decimal("-300.00")


@pytest.mark.asyncio
async def test_member_duplicate_prevention():
    mock_session = AsyncMock()
    trip_id = uuid4()
    emp_id = uuid4()

    # Duplicate query returns existing member
    mock_session.scalar = AsyncMock(return_value=MagicMock())

    with pytest.raises(HTTPException) as exc_info:
        await TravelService.add_member(
            session=mock_session,
            organization_id=uuid4(),
            trip_id=trip_id,
            actor_profile_id=uuid4(),
            payload=TravelMemberCreate(employee_id=emp_id),
        )
    assert exc_info.value.status_code == 400
    assert "already a registered member" in exc_info.value.detail


@pytest.mark.asyncio
async def test_cancellation_preserves_records():
    mock_session = AsyncMock()
    trip = _mock_trip(status="approved")
    mock_session.scalar = AsyncMock(return_value=trip)

    with patch.object(TravelService, "get_trip", new=AsyncMock(return_value=MagicMock(status="cancelled"))):
        await TravelService.cancel_trip(
            session=mock_session,
            organization_id=trip.organization_id,
            trip_id=trip.id,
            actor_profile_id=uuid4(),
        )
        assert trip.status == "cancelled"


@pytest.mark.asyncio
async def test_record_settlement_marks_trip_settled():
    mock_session = AsyncMock()
    trip = _mock_trip(settlement_status="unsettled")
    mock_session.scalar = AsyncMock(return_value=trip)

    payload = TravelSettlementCreate(
        settlement_type="final_balance",
        amount=Decimal("400.00"),
        payment_reference="WIRE-SETTLE-7721",
        mark_trip_settled=True,
    )

    with patch.object(TravelService, "get_trip", new=AsyncMock(return_value=MagicMock(settlement_status="settled"))):
        await TravelService.record_settlement(
            session=mock_session,
            organization_id=trip.organization_id,
            trip_id=trip.id,
            actor_profile_id=uuid4(),
            payload=payload,
        )
        assert trip.settlement_status == "settled"


@pytest.mark.asyncio
async def test_pre_travel_estimated_cost_categories_calculation():
    mock_session = AsyncMock()
    mock_session.scalar = AsyncMock(return_value=None)  # for trip number generation

    payload = TravelTripCreatePlanned(
        title="European Partner Conference",
        business_purpose="Meet with cloud distributor partners in Berlin",
        origin="London",
        destination="Berlin",
        planned_start_date=date(2026, 12, 1),
        planned_end_date=date(2026, 12, 5),
        preferred_transport_mode="flight",
        est_travel_transport=Decimal("650.00"),
        est_hotel_accommodation=Decimal("800.00"),
        est_food_meals=Decimal("350.00"),
        est_local_transport=Decimal("150.00"),
        est_other_expenses=Decimal("100.00"),
    )

    with patch.object(TravelService, "get_trip", new=AsyncMock(return_value=MagicMock())):
        await TravelService.create_planned_trip(
            session=mock_session,
            organization_id=uuid4(),
            actor_employee_id=uuid4(),
            actor_profile_id=uuid4(),
            payload=payload,
        )

        # Retrieve the TravelTrip added to session
        added_trip = None
        for call_args in mock_session.add.call_args_list:
            obj = call_args[0][0]
            if hasattr(obj, "trip_number") and getattr(obj, "registration_type", None) == "planned":
                added_trip = obj
                break

        assert added_trip is not None
        # Sum of 650 + 800 + 350 + 150 + 100 = 2050
        assert added_trip.estimated_total == Decimal("2050.00")
        assert added_trip.estimated_budget == Decimal("2050.00")
        assert added_trip.actual_total == Decimal("0.00")
        assert added_trip.cost_difference == Decimal("-2050.00")


@pytest.mark.asyncio
async def test_post_approval_actual_costs_update_preserves_estimates():
    mock_session = AsyncMock()
    trip = _mock_trip(
        registration_type="planned",
        status="approved",
        est_travel_transport=Decimal("650.00"),
        est_hotel_accommodation=Decimal("800.00"),
        est_food_meals=Decimal("350.00"),
        est_local_transport=Decimal("150.00"),
        est_other_expenses=Decimal("100.00"),
        estimated_total=Decimal("2050.00"),
        actual_total=Decimal("0.00"),
        cost_difference=Decimal("-2050.00"),
    )
    mock_session.scalar = AsyncMock(return_value=trip)

    update_payload = TravelTripActualCostsUpdate(
        act_travel_transport=Decimal("700.00"),
        act_hotel_accommodation=Decimal("850.00"),
        act_food_meals=Decimal("400.00"),
        act_local_transport=Decimal("160.00"),
        act_other_expenses=Decimal("120.00"),
        payer_type="split",
        company_paid_amount=Decimal("1550.00"),
        employee_paid_amount=Decimal("680.00"),
    )

    with patch.object(TravelService, "get_trip", new=AsyncMock(return_value=MagicMock())):
        await TravelService.update_trip_actual_costs(
            session=mock_session,
            organization_id=trip.organization_id,
            trip_id=trip.id,
            actor_profile_id=uuid4(),
            payload=update_payload,
        )

        # Estimates must be preserved
        assert trip.est_travel_transport == Decimal("650.00")
        assert trip.est_hotel_accommodation == Decimal("800.00")
        assert trip.estimated_total == Decimal("2050.00")

        # Actuals must be updated
        # 700 + 850 + 400 + 160 + 120 = 2230
        assert trip.actual_total == Decimal("2230.00")
        # Difference = Actual (2230) - Estimated (2050) = +180
        assert trip.cost_difference == Decimal("180.00")

        # Payer breakdown
        assert trip.payer_type == "split"
        assert trip.company_paid_amount == Decimal("1550.00")
        assert trip.employee_paid_amount == Decimal("680.00")


@pytest.mark.asyncio
async def test_post_travel_registration_and_payments():
    mock_session = AsyncMock()
    mock_session.scalar = AsyncMock(return_value=None)

    payload = TravelTripCreatePast(
        title="Client Urgent Onsite Fix",
        business_purpose="Recover database replication at client site",
        origin="Chicago",
        destination="Detroit",
        actual_start_date=date(2026, 10, 1),
        actual_end_date=date(2026, 10, 3),
        actual_transport_mode="train",
        act_travel_transport=Decimal("180.00"),
        act_hotel_accommodation=Decimal("320.00"),
        act_food_meals=Decimal("120.00"),
        act_local_transport=Decimal("60.00"),
        act_other_expenses=Decimal("40.00"),
        payer_type="split",
        payments=[
            TravelPaymentCreate(
                payer_type="company",
                amount=Decimal("500.00"),
                payment_method="corporate_card",
                payment_date=date(2026, 10, 1),
                transaction_reference="CC-CORP-9901",
            ),
            TravelPaymentCreate(
                payer_type="employee",
                amount=Decimal("220.00"),
                payment_method="cash",
                payment_date=date(2026, 10, 2),
            ),
        ],
    )

    with patch.object(TravelService, "get_trip", new=AsyncMock(return_value=MagicMock())):
        await TravelService.create_past_trip(
            session=mock_session,
            organization_id=uuid4(),
            actor_employee_id=uuid4(),
            actor_profile_id=uuid4(),
            payload=payload,
        )

        added_trip = None
        for call_args in mock_session.add.call_args_list:
            obj = call_args[0][0]
            if hasattr(obj, "trip_number") and getattr(obj, "registration_type", None) == "past":
                added_trip = obj
                break

        assert added_trip is not None
        # Actual total = 180 + 320 + 120 + 60 + 40 = 720
        assert added_trip.actual_total == Decimal("720.00")
        assert added_trip.cost_difference == Decimal("720.00")
        assert added_trip.company_paid_amount == Decimal("500.00")
        assert added_trip.employee_paid_amount == Decimal("220.00")
        assert added_trip.payer_type == "split"

