import math
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.employee import Department, Employee
from app.models.identity import Profile
from app.models.travel import (
    TravelActivityLog,
    TravelExpense,
    TravelItinerary,
    TravelMember,
    TravelPayment,
    TravelSettlement,
    TravelTrip,
)
from app.schemas.common import PaginatedData, PaginationMeta
from app.schemas.travel import (
    TravelActivityLogResponse,
    TravelAdvancePayAction,
    TravelAdvanceRequest,
    TravelAdvanceReviewAction,
    TravelDepartmentCost,
    TravelExpenseCreate,
    TravelExpensePayAction,
    TravelExpenseResponse,
    TravelExpenseReviewAction,
    TravelExpenseUpdate,
    TravelItineraryCreate,
    TravelItineraryResponse,
    TravelItineraryUpdate,
    TravelMemberCreate,
    TravelMemberResponse,
    TravelMemberUpdate,
    TravelModeCost,
    TravelMonthlyCost,
    TravelPaymentCreate,
    TravelPaymentResponse,
    TravelReportMetrics,
    TravelSettlementCreate,
    TravelSettlementResponse,
    TravelSummaryKPI,
    TravelTripActualCostsUpdate,
    TravelTripApprovalAction,
    TravelTripCreatePast,
    TravelTripCreatePlanned,
    TravelTripDetailResponse,
    TravelTripResponse,
    TravelTripUpdate,
)


class TravelService:
    @staticmethod
    def _calculate_trip_financials(trip: TravelTrip) -> dict[str, Decimal]:
        total_submitted = Decimal("0.00")
        total_approved = Decimal("0.00")
        total_reimbursable = Decimal("0.00")
        total_settled = Decimal("0.00")
        booking_commitments = Decimal("0.00")

        # Sum expenses
        for exp in trip.expenses:
            if exp.status in ("submitted", "approved", "paid"):
                total_submitted += exp.amount
            if exp.status in ("approved", "paid"):
                total_approved += exp.amount
                if exp.is_reimbursable:
                    total_reimbursable += exp.amount

        # Sum bookings/itineraries for commitments
        for itn in trip.itineraries:
            if itn.booking_status in ("reserved", "confirmed"):
                booking_commitments += itn.estimated_cost

        # Sum settlements
        for stl in trip.settlements:
            if stl.status == "completed":
                total_settled += stl.amount

        advance_paid = trip.advance_paid or Decimal("0.00")
        settlement_balance = total_reimbursable - advance_paid
        budget_variance = total_approved - trip.estimated_budget

        return {
            "total_submitted_expenses": total_submitted,
            "total_approved_expenses": total_approved,
            "total_reimbursable_expenses": total_reimbursable,
            "total_settled_amount": total_settled,
            "settlement_balance": settlement_balance,
            "budget_variance": budget_variance,
            "booking_commitments": booking_commitments,
        }

    @classmethod
    def _map_trip_response(cls, trip: TravelTrip) -> TravelTripResponse:
        req = trip.requester
        req_name = f"{req.first_name} {req.last_name}" if req else None
        req_code = req.employee_code if req else None

        dept_name = trip.department.name if trip.department else None
        client_name = trip.client.name if trip.client else None
        project_name = trip.project.name if trip.project else None

        appr = trip.approver
        appr_name = f"{appr.first_name} {appr.last_name}" if appr else None

        fin = cls._calculate_trip_financials(trip)

        return TravelTripResponse(
            id=trip.id,
            organization_id=trip.organization_id,
            trip_number=trip.trip_number,
            title=trip.title,
            business_purpose=trip.business_purpose,
            registration_type=trip.registration_type,  # type: ignore[arg-type]
            status=trip.status,  # type: ignore[arg-type]
            settlement_status=trip.settlement_status,  # type: ignore[arg-type]
            requester_id=trip.requester_id,
            requester_name=req_name,
            requester_code=req_code,
            department_id=trip.department_id,
            department_name=dept_name,
            client_id=trip.client_id,
            client_name=client_name,
            project_id=trip.project_id,
            project_name=project_name,
            origin=trip.origin,
            destination=trip.destination,
            planned_start_date=trip.planned_start_date,
            planned_end_date=trip.planned_end_date,
            actual_start_date=trip.actual_start_date,
            actual_end_date=trip.actual_end_date,
            preferred_transport_mode=trip.preferred_transport_mode,
            actual_transport_mode=trip.actual_transport_mode,
            estimated_budget=trip.estimated_budget,
            currency=trip.currency,
            est_travel_transport=trip.est_travel_transport or Decimal("0.00"),
            act_travel_transport=trip.act_travel_transport or Decimal("0.00"),
            est_hotel_accommodation=trip.est_hotel_accommodation or Decimal("0.00"),
            act_hotel_accommodation=trip.act_hotel_accommodation or Decimal("0.00"),
            est_food_meals=trip.est_food_meals or Decimal("0.00"),
            act_food_meals=trip.act_food_meals or Decimal("0.00"),
            est_local_transport=trip.est_local_transport or Decimal("0.00"),
            act_local_transport=trip.act_local_transport or Decimal("0.00"),
            est_other_expenses=trip.est_other_expenses or Decimal("0.00"),
            act_other_expenses=trip.act_other_expenses or Decimal("0.00"),
            estimated_total=trip.estimated_total or Decimal("0.00"),
            actual_total=trip.actual_total or Decimal("0.00"),
            cost_difference=trip.cost_difference or Decimal("0.00"),
            payer_type=trip.payer_type or "company",
            company_paid_amount=trip.company_paid_amount or Decimal("0.00"),
            employee_paid_amount=trip.employee_paid_amount or Decimal("0.00"),
            advance_requested=trip.advance_requested,
            advance_approved=trip.advance_approved,
            advance_paid=trip.advance_paid,
            advance_status=trip.advance_status,  # type: ignore[arg-type]
            total_submitted_expenses=fin["total_submitted_expenses"],
            total_approved_expenses=fin["total_approved_expenses"],
            total_reimbursable_expenses=fin["total_reimbursable_expenses"],
            total_settled_amount=fin["total_settled_amount"],
            settlement_balance=fin["settlement_balance"],
            budget_variance=fin["budget_variance"],
            member_count=len(trip.members) if trip.members else 1,
            approver_id=trip.approver_id,
            approver_name=appr_name,
            approved_at=trip.approved_at,
            created_at=trip.created_at,
            updated_at=trip.updated_at,
        )

    @classmethod
    def _map_trip_detail_response(cls, trip: TravelTrip) -> TravelTripDetailResponse:
        base = cls._map_trip_response(trip)
        fin = cls._calculate_trip_financials(trip)

        # Calculate per-member expenses
        member_expense_sums: dict[uuid.UUID, Decimal] = {}
        for exp in trip.expenses:
            if exp.status != "cancelled":
                member_expense_sums[exp.employee_id] = (
                    member_expense_sums.get(exp.employee_id, Decimal("0.00")) + exp.amount
                )

        # Map members
        members_res: list[TravelMemberResponse] = []
        for m in trip.members:
            m_emp = m.employee
            m_emp_name = f"{m_emp.first_name} {m_emp.last_name}" if m_emp else None
            m_emp_code = m_emp.employee_code if m_emp else None
            m_dept_name = m_emp.department.name if m_emp and m_emp.department else None

            members_res.append(
                TravelMemberResponse(
                    id=m.id,
                    trip_id=m.trip_id,
                    employee_id=m.employee_id,
                    employee_name=m_emp_name,
                    employee_code=m_emp_code,
                    department_name=m_dept_name,
                    trip_role=m.trip_role,
                    participation_status=m.participation_status,
                    individual_departure_date=m.individual_departure_date,
                    individual_return_date=m.individual_return_date,
                    notes=m.notes,
                    total_expenses=member_expense_sums.get(m.employee_id, Decimal("0.00")),
                    created_at=m.created_at,
                    updated_at=m.updated_at,
                )
            )

        # Map itineraries
        itineraries_res: list[TravelItineraryResponse] = []
        for itn in trip.itineraries:
            itn_m_name = None
            if itn.member and itn.member.employee:
                itn_m_name = f"{itn.member.employee.first_name} {itn.member.employee.last_name}"

            itineraries_res.append(
                TravelItineraryResponse(
                    id=itn.id,
                    trip_id=itn.trip_id,
                    member_id=itn.member_id,
                    member_name=itn_m_name,
                    type=itn.type,
                    title=itn.title,
                    departure_location=itn.departure_location,
                    arrival_location=itn.arrival_location,
                    departure_time=itn.departure_time,
                    arrival_time=itn.arrival_time,
                    booking_reference=itn.booking_reference,
                    provider_name=itn.provider_name,
                    booking_status=itn.booking_status,
                    estimated_cost=itn.estimated_cost,
                    notes=itn.notes,
                    attachment_url=itn.attachment_url,
                    created_at=itn.created_at,
                    updated_at=itn.updated_at,
                )
            )

        # Map expenses
        expenses_res: list[TravelExpenseResponse] = []
        for exp in trip.expenses:
            e_emp = exp.employee
            e_name = f"{e_emp.first_name} {e_emp.last_name}" if e_emp else None
            e_code = e_emp.employee_code if e_emp else None
            r_emp = exp.reviewer
            r_name = f"{r_emp.first_name} {r_emp.last_name}" if r_emp else None

            expenses_res.append(
                TravelExpenseResponse(
                    id=exp.id,
                    trip_id=exp.trip_id,
                    employee_id=exp.employee_id,
                    employee_name=e_name,
                    employee_code=e_code,
                    category=exp.category,
                    expense_date=exp.expense_date,
                    description=exp.description,
                    amount=exp.amount,
                    currency=exp.currency,
                    receipt_url=exp.receipt_url,
                    receipt_file_name=exp.receipt_file_name,
                    payment_method=exp.payment_method,
                    is_reimbursable=exp.is_reimbursable,
                    status=exp.status,
                    reviewer_id=exp.reviewer_id,
                    reviewer_name=r_name,
                    reviewed_at=exp.reviewed_at,
                    reviewer_comment=exp.reviewer_comment,
                    paid_at=exp.paid_at,
                    payment_reference=exp.payment_reference,
                    created_at=exp.created_at,
                    updated_at=exp.updated_at,
                )
            )

        # Map settlements
        settlements_res: list[TravelSettlementResponse] = []
        for stl in trip.settlements:
            s_emp = stl.employee
            s_emp_name = f"{s_emp.first_name} {s_emp.last_name}" if s_emp else None
            settler_name = None
            if stl.settled_by:
                settler_name = f"{stl.settled_by.first_name} {stl.settled_by.last_name}".strip()

            settlements_res.append(
                TravelSettlementResponse(
                    id=stl.id,
                    trip_id=stl.trip_id,
                    employee_id=stl.employee_id,
                    employee_name=s_emp_name,
                    settlement_type=stl.settlement_type,
                    amount=stl.amount,
                    currency=stl.currency,
                    status=stl.status,
                    payment_date=stl.payment_date,
                    payment_reference=stl.payment_reference,
                    payment_method=stl.payment_method,
                    settled_by_profile_id=stl.settled_by_profile_id,
                    settler_name=settler_name,
                    notes=stl.notes,
                    created_at=stl.created_at,
                    updated_at=stl.updated_at,
                )
            )

        # Map activity logs
        logs_res: list[TravelActivityLogResponse] = []
        for log in sorted(trip.activity_logs, key=lambda l: l.created_at, reverse=True):
            actor_name = None
            if log.actor:
                actor_name = f"{log.actor.first_name} {log.actor.last_name}".strip()
            logs_res.append(
                TravelActivityLogResponse(
                    id=log.id,
                    trip_id=log.trip_id,
                    actor_id=log.actor_id,
                    actor_name=actor_name,
                    action=log.action,
                    description=log.description,
                    details=log.details or {},
                    created_at=log.created_at,
                )
            )

        # Map payments
        payments_res: list[TravelPaymentResponse] = []
        for pmt in getattr(trip, "payments", []) or []:
            payments_res.append(
                TravelPaymentResponse(
                    id=pmt.id,
                    trip_id=pmt.trip_id,
                    payer_type=pmt.payer_type,
                    payer_name=pmt.payer_name,
                    amount=pmt.amount,
                    currency=pmt.currency,
                    payment_method=pmt.payment_method,
                    payment_date=pmt.payment_date,
                    transaction_reference=pmt.transaction_reference,
                    notes=pmt.notes,
                    created_at=pmt.created_at,
                    updated_at=pmt.updated_at,
                )
            )

        return TravelTripDetailResponse(
            **base.model_dump(),
            accommodation_notes=trip.accommodation_notes,
            notes=trip.notes,
            missing_info_explanation=trip.missing_info_explanation,
            advance_payment_reference=trip.advance_payment_reference,
            advance_paid_at=trip.advance_paid_at,
            approver_comment=trip.approver_comment,
            booking_commitments=fin["booking_commitments"],
            members=members_res,
            itineraries=itineraries_res,
            expenses=expenses_res,
            payments=payments_res,
            settlements=settlements_res,
            activity_logs=logs_res,
        )

    @staticmethod
    async def _log_activity(
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        action: str,
        description: str,
        actor_profile_id: uuid.UUID | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        log = TravelActivityLog(
            id=uuid.uuid4(),
            organization_id=organization_id,
            trip_id=trip_id,
            actor_id=actor_profile_id,
            action=action,
            description=description,
            details=details or {},
            created_at=datetime.now(UTC),
        )
        session.add(log)

    @staticmethod
    async def _generate_trip_number(session: AsyncSession, organization_id: uuid.UUID) -> str:
        current_year = datetime.now(UTC).strftime("%Y")
        prefix = f"TRV-{current_year}"

        stmt = (
            select(TravelTrip.trip_number)
            .where(
                TravelTrip.organization_id == organization_id,
                TravelTrip.trip_number.like(f"{prefix}-%"),
            )
            .order_by(TravelTrip.trip_number.desc())
            .limit(1)
        )
        last_number = await session.scalar(stmt)
        if last_number:
            try:
                seq = int(last_number.split("-")[-1]) + 1
            except (ValueError, IndexError):
                seq = 1
        else:
            seq = 1

        return f"{prefix}-{seq:04d}"

    # ---------------- Dashboard & KPIs ----------------
    @classmethod
    async def get_dashboard_kpi(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
    ) -> TravelSummaryKPI:
        today = datetime.now(UTC).date()
        base_filter = TravelTrip.organization_id == organization_id

        # Total trips
        total_stmt = select(func.count(TravelTrip.id)).where(base_filter)
        total_trips = await session.scalar(total_stmt) or 0

        # Upcoming trips
        upcoming_stmt = select(func.count(TravelTrip.id)).where(
            base_filter,
            TravelTrip.status.in_(["approved", "booked"]),
            or_(
                TravelTrip.planned_start_date > today,
                TravelTrip.actual_start_date > today,
            ),
        )
        upcoming_trips = await session.scalar(upcoming_stmt) or 0

        # Ongoing trips
        ongoing_stmt = select(func.count(TravelTrip.id)).where(
            base_filter,
            TravelTrip.status == "ongoing",
        )
        ongoing_trips = await session.scalar(ongoing_stmt) or 0

        # Past trips
        past_stmt = select(func.count(TravelTrip.id)).where(
            base_filter,
            or_(
                TravelTrip.registration_type == "past",
                (TravelTrip.status == "completed"),
            ),
        )
        past_trips = await session.scalar(past_stmt) or 0

        # Pending approvals
        pending_appr_stmt = select(func.count(TravelTrip.id)).where(
            base_filter,
            TravelTrip.status == "pending_approval",
        )
        pending_approvals = await session.scalar(pending_appr_stmt) or 0

        # Pending expense reviews
        pending_exp_stmt = select(func.count(TravelExpense.id)).where(
            TravelExpense.organization_id == organization_id,
            TravelExpense.status == "submitted",
        )
        pending_expense_reviews = await session.scalar(pending_exp_stmt) or 0

        # Unsettled trips
        unsettled_stmt = select(func.count(TravelTrip.id)).where(
            base_filter,
            TravelTrip.settlement_status.in_(["unsettled", "pending", "partially_settled"]),
        )
        unsettled_trips = await session.scalar(unsettled_stmt) or 0

        # Budgets and expenses
        budget_stmt = select(func.coalesce(func.sum(TravelTrip.estimated_budget), 0)).where(base_filter)
        total_budget = await session.scalar(budget_stmt) or Decimal("0.00")

        # Actual approved expenses
        approved_exp_stmt = select(func.coalesce(func.sum(TravelExpense.amount), 0)).where(
            TravelExpense.organization_id == organization_id,
            TravelExpense.status.in_(["approved", "paid"]),
        )
        total_approved_expenses = await session.scalar(approved_exp_stmt) or Decimal("0.00")

        # Submitted expenses
        submitted_exp_stmt = select(func.coalesce(func.sum(TravelExpense.amount), 0)).where(
            TravelExpense.organization_id == organization_id,
            TravelExpense.status.in_(["submitted", "approved", "paid"]),
        )
        total_submitted_expenses = await session.scalar(submitted_exp_stmt) or Decimal("0.00")

        # Advances paid
        advances_stmt = select(func.coalesce(func.sum(TravelTrip.advance_paid), 0)).where(base_filter)
        total_advances_paid = await session.scalar(advances_stmt) or Decimal("0.00")

        # Reimbursements pending: approved reimbursable expenses minus advance paid for unsettled trips
        reimbursable_approved_stmt = select(func.coalesce(func.sum(TravelExpense.amount), 0)).where(
            TravelExpense.organization_id == organization_id,
            TravelExpense.status == "approved",
            TravelExpense.is_reimbursable == True,
        )
        total_reimbursable_approved = await session.scalar(reimbursable_approved_stmt) or Decimal("0.00")

        return TravelSummaryKPI(
            total_trips=total_trips,
            upcoming_trips=upcoming_trips,
            ongoing_trips=ongoing_trips,
            past_trips=past_trips,
            pending_approvals=pending_approvals,
            pending_expense_reviews=pending_expense_reviews,
            unsettled_trips=unsettled_trips,
            total_estimated_budget=total_budget,
            total_actual_approved_expenses=total_approved_expenses,
            total_submitted_expenses=total_submitted_expenses,
            total_advances_paid=total_advances_paid,
            total_reimbursements_pending=max(Decimal("0.00"), total_reimbursable_approved),
            currency="USD",
        )

    # ---------------- Reports ----------------
    @classmethod
    async def get_reports_metrics(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
    ) -> TravelReportMetrics:
        kpi = await cls.get_dashboard_kpi(session, organization_id)

        # Monthly trend (last 6 months)
        trips_stmt = (
            select(TravelTrip)
            .where(TravelTrip.organization_id == organization_id)
            .options(
                selectinload(TravelTrip.expenses),
                selectinload(TravelTrip.itineraries),
                selectinload(TravelTrip.settlements),
                selectinload(TravelTrip.members),
            )
        )
        trips = (await session.execute(trips_stmt)).scalars().all()

        monthly_map: dict[str, dict[str, Any]] = {}
        dept_map: dict[str, dict[str, Any]] = {}
        mode_map: dict[str, dict[str, Any]] = {}
        status_counts: dict[str, int] = {}
        planned_vs_past = {"planned": 0, "past": 0}

        for t in trips:
            # Registration type
            reg = t.registration_type or "planned"
            planned_vs_past[reg] = planned_vs_past.get(reg, 0) + 1

            # Status counts
            st = t.status or "draft"
            status_counts[st] = status_counts.get(st, 0) + 1

            # Financials
            fin = cls._calculate_trip_financials(t)

            # Monthly trend
            start_date = t.actual_start_date or t.planned_start_date or t.created_at.date()
            month_key = start_date.strftime("%Y-%m")
            if month_key not in monthly_map:
                monthly_map[month_key] = {
                    "count": 0,
                    "estimated": Decimal("0.00"),
                    "approved": Decimal("0.00"),
                }
            monthly_map[month_key]["count"] += 1
            monthly_map[month_key]["estimated"] += t.estimated_budget
            monthly_map[month_key]["approved"] += fin["total_approved_expenses"]

            # Department breakdown
            dept_name = t.department.name if t.department else "General / Unassigned"
            if dept_name not in dept_map:
                dept_map[dept_name] = {"count": 0, "total": Decimal("0.00")}
            dept_map[dept_name]["count"] += 1
            dept_map[dept_name]["total"] += fin["total_approved_expenses"]

            # Mode breakdown
            mode = t.actual_transport_mode or t.preferred_transport_mode or "Other"
            mode = mode.replace("_", " ").title()
            if mode not in mode_map:
                mode_map[mode] = {"count": 0, "total": Decimal("0.00")}
            mode_map[mode]["count"] += 1
            mode_map[mode]["total"] += fin["total_approved_expenses"]

        monthly_trend = [
            TravelMonthlyCost(
                month=m,
                trip_count=data["count"],
                estimated_budget=data["estimated"],
                approved_expenses=data["approved"],
            )
            for m, data in sorted(monthly_map.items())
        ]

        by_department = [
            TravelDepartmentCost(
                department_name=d,
                trip_count=data["count"],
                total_cost=data["total"],
            )
            for d, data in sorted(dept_map.items(), key=lambda x: x[1]["total"], reverse=True)
        ]

        by_transport_mode = [
            TravelModeCost(
                mode=m,
                count=data["count"],
                total_cost=data["total"],
            )
            for m, data in sorted(mode_map.items(), key=lambda x: x[1]["total"], reverse=True)
        ]

        return TravelReportMetrics(
            summary=kpi,
            monthly_trend=monthly_trend,
            by_department=by_department,
            by_transport_mode=by_transport_mode,
            planned_vs_past=planned_vs_past,
            status_counts=status_counts,
        )

    # ---------------- Trips CRUD ----------------
    @classmethod
    async def list_trips(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        search: str | None = None,
        registration_type: str | None = None,
        status_filter: str | None = None,
        settlement_status: str | None = None,
        employee_id: uuid.UUID | None = None,
        department_id: uuid.UUID | None = None,
        project_id: uuid.UUID | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        page: int = 1,
        page_size: int = 20,
        actor_employee_id: uuid.UUID | None = None,
        is_employee_restricted: bool = False,
    ) -> PaginatedData[TravelTripResponse]:
        query = (
            select(TravelTrip)
            .where(TravelTrip.organization_id == organization_id)
            .options(
                selectinload(TravelTrip.requester),
                selectinload(TravelTrip.department),
                selectinload(TravelTrip.client),
                selectinload(TravelTrip.project),
                selectinload(TravelTrip.approver),
                selectinload(TravelTrip.members),
                selectinload(TravelTrip.expenses),
                selectinload(TravelTrip.itineraries),
                selectinload(TravelTrip.settlements),
            )
        )

        if is_employee_restricted and actor_employee_id:
            # Employee can see trips where they are requester or a member
            member_trip_subquery = (
                select(TravelMember.trip_id)
                .where(
                    TravelMember.organization_id == organization_id,
                    TravelMember.employee_id == actor_employee_id,
                )
                .scalar_subquery()
            )
            query = query.where(
                or_(
                    TravelTrip.requester_id == actor_employee_id,
                    TravelTrip.id.in_(member_trip_subquery),
                )
            )

        if search:
            search_pattern = f"%{search}%"
            query = query.where(
                or_(
                    TravelTrip.trip_number.ilike(search_pattern),
                    TravelTrip.title.ilike(search_pattern),
                    TravelTrip.destination.ilike(search_pattern),
                    TravelTrip.origin.ilike(search_pattern),
                    TravelTrip.business_purpose.ilike(search_pattern),
                )
            )

        if registration_type and registration_type != "all":
            query = query.where(TravelTrip.registration_type == registration_type)

        if status_filter and status_filter != "all":
            query = query.where(TravelTrip.status == status_filter)

        if settlement_status and settlement_status != "all":
            query = query.where(TravelTrip.settlement_status == settlement_status)

        if employee_id:
            member_sub = (
                select(TravelMember.trip_id)
                .where(
                    TravelMember.organization_id == organization_id,
                    TravelMember.employee_id == employee_id,
                )
                .scalar_subquery()
            )
            query = query.where(
                or_(
                    TravelTrip.requester_id == employee_id,
                    TravelTrip.id.in_(member_sub),
                )
            )

        if department_id:
            query = query.where(TravelTrip.department_id == department_id)

        if project_id:
            query = query.where(TravelTrip.project_id == project_id)

        if start_date:
            query = query.where(
                or_(
                    TravelTrip.planned_start_date >= start_date,
                    TravelTrip.actual_start_date >= start_date,
                )
            )

        if end_date:
            query = query.where(
                or_(
                    TravelTrip.planned_end_date <= end_date,
                    TravelTrip.actual_end_date <= end_date,
                )
            )

        # Count total
        count_stmt = select(func.count()).select_from(query.order_by(None).subquery())
        total_items = await session.scalar(count_stmt) or 0

        # Paginate
        offset = (page - 1) * page_size
        items_stmt = query.order_by(TravelTrip.created_at.desc()).offset(offset).limit(page_size)
        trips = (await session.execute(items_stmt)).scalars().all()

        total_pages = math.ceil(total_items / page_size) if total_items > 0 else 1
        items = [cls._map_trip_response(t) for t in trips]

        return PaginatedData(
            items=items,
            meta=PaginationMeta(
                total=total_items,
                page=page,
                page_size=page_size,
                total_pages=total_pages,
            ),
        )

    @classmethod
    async def get_trip(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        actor_employee_id: uuid.UUID | None = None,
        is_employee_restricted: bool = False,
    ) -> TravelTripDetailResponse:
        stmt = (
            select(TravelTrip)
            .where(
                TravelTrip.id == trip_id,
                TravelTrip.organization_id == organization_id,
            )
            .options(
                selectinload(TravelTrip.requester),
                selectinload(TravelTrip.department),
                selectinload(TravelTrip.client),
                selectinload(TravelTrip.project),
                selectinload(TravelTrip.approver),
                selectinload(TravelTrip.members).selectinload(TravelMember.employee).selectinload(Employee.department),
                selectinload(TravelTrip.expenses).selectinload(TravelExpense.employee),
                selectinload(TravelTrip.expenses).selectinload(TravelExpense.reviewer),
                selectinload(TravelTrip.itineraries).selectinload(TravelItinerary.member).selectinload(TravelMember.employee),
                selectinload(TravelTrip.settlements).selectinload(TravelSettlement.employee),
                selectinload(TravelTrip.settlements).selectinload(TravelSettlement.settled_by),
                selectinload(TravelTrip.activity_logs).selectinload(TravelActivityLog.actor),
                selectinload(TravelTrip.payments),
            )
        )
        trip = await session.scalar(stmt)
        if not trip:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Travel trip not found",
            )

        if is_employee_restricted and actor_employee_id:
            member_ids = {m.employee_id for m in trip.members}
            if trip.requester_id != actor_employee_id and actor_employee_id not in member_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only access travel trips where you are a requester or participant",
                )

        return cls._map_trip_detail_response(trip)

    @classmethod
    async def create_planned_trip(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        actor_employee_id: uuid.UUID | None,
        actor_profile_id: uuid.UUID | None,
        payload: TravelTripCreatePlanned,
    ) -> TravelTripDetailResponse:
        if not actor_employee_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An employee profile must be associated with the user to request travel",
            )

        if payload.planned_end_date < payload.planned_start_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Planned return date cannot be earlier than planned departure date",
            )

        trip_number = await cls._generate_trip_number(session, organization_id)
        initial_status = "pending_approval" if payload.submit_immediately else "draft"
        advance_status = "requested" if payload.advance_requested > Decimal("0.00") else "none"

        est_transport = payload.est_travel_transport or Decimal("0.00")
        est_hotel = payload.est_hotel_accommodation or Decimal("0.00")
        est_food = payload.est_food_meals or Decimal("0.00")
        est_local = payload.est_local_transport or Decimal("0.00")
        est_other = payload.est_other_expenses or Decimal("0.00")

        if payload.initial_expenses and (est_transport + est_hotel + est_food + est_local + est_other == Decimal("0.00")):
            for exp in payload.initial_expenses:
                cat = (exp.category or "").lower()
                amt = Decimal(str(exp.amount or 0))
                if "hotel" in cat or "lodging" in cat or "accommodation" in cat:
                    est_hotel += amt
                elif "food" in cat or "meal" in cat:
                    est_food += amt
                elif "local" in cat:
                    est_local += amt
                elif "travel" in cat or "transport" in cat or "flight" in cat:
                    est_transport += amt
                else:
                    est_other += amt

        estimated_total = est_transport + est_hotel + est_food + est_local + est_other

        if estimated_total == Decimal("0.00") and payload.estimated_budget > Decimal("0.00"):
            estimated_total = payload.estimated_budget
            est_other = payload.estimated_budget

        effective_budget = estimated_total if estimated_total > Decimal("0.00") else payload.estimated_budget

        trip = TravelTrip(
            id=uuid.uuid4(),
            organization_id=organization_id,
            trip_number=trip_number,
            title=payload.title,
            business_purpose=payload.business_purpose,
            registration_type="planned",
            status=initial_status,
            settlement_status="unsettled",
            requester_id=actor_employee_id,
            department_id=payload.department_id,
            client_id=payload.client_id,
            project_id=payload.project_id,
            origin=payload.origin,
            destination=payload.destination,
            planned_start_date=payload.planned_start_date,
            planned_end_date=payload.planned_end_date,
            preferred_transport_mode=payload.preferred_transport_mode,
            estimated_budget=effective_budget,
            currency=payload.currency,
            est_travel_transport=est_transport,
            est_hotel_accommodation=est_hotel,
            est_food_meals=est_food,
            est_local_transport=est_local,
            est_other_expenses=est_other,
            act_travel_transport=Decimal("0.00"),
            act_hotel_accommodation=Decimal("0.00"),
            act_food_meals=Decimal("0.00"),
            act_local_transport=Decimal("0.00"),
            act_other_expenses=Decimal("0.00"),
            estimated_total=estimated_total,
            actual_total=Decimal("0.00"),
            cost_difference=-estimated_total,
            payer_type="company",
            company_paid_amount=Decimal("0.00"),
            employee_paid_amount=Decimal("0.00"),
            advance_requested=payload.advance_requested,
            advance_approved=Decimal("0.00"),
            advance_paid=Decimal("0.00"),
            advance_status=advance_status,
            accommodation_notes=payload.accommodation_notes,
            notes=payload.notes,
            created_by_profile_id=actor_profile_id,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(trip)

        # Add requester as lead member automatically
        lead_member = TravelMember(
            id=uuid.uuid4(),
            organization_id=organization_id,
            trip_id=trip.id,
            employee_id=actor_employee_id,
            trip_role="lead",
            participation_status="confirmed",
            individual_departure_date=payload.planned_start_date,
            individual_return_date=payload.planned_end_date,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(lead_member)

        # Add participating employees
        for emp_id in payload.participating_employee_ids:
            if emp_id != actor_employee_id:
                member = TravelMember(
                    id=uuid.uuid4(),
                    organization_id=organization_id,
                    trip_id=trip.id,
                    employee_id=emp_id,
                    trip_role="participant",
                    participation_status="confirmed",
                    individual_departure_date=payload.planned_start_date,
                    individual_return_date=payload.planned_end_date,
                    created_at=datetime.now(UTC),
                    updated_at=datetime.now(UTC),
                )
                session.add(member)

        # Add initial itineraries if any
        for itn_in in payload.itineraries:
            itn = TravelItinerary(
                id=uuid.uuid4(),
                organization_id=organization_id,
                trip_id=trip.id,
                member_id=itn_in.member_id,
                type=itn_in.type,
                title=itn_in.title,
                departure_location=itn_in.departure_location,
                arrival_location=itn_in.arrival_location,
                departure_time=itn_in.departure_time,
                arrival_time=itn_in.arrival_time,
                booking_reference=itn_in.booking_reference,
                provider_name=itn_in.provider_name,
                booking_status=itn_in.booking_status,
                estimated_cost=itn_in.estimated_cost,
                notes=itn_in.notes,
                attachment_url=itn_in.attachment_url,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
            session.add(itn)

        # Add initial expenses if provided
        for exp_in in payload.initial_expenses:
            target_emp_id = exp_in.employee_id or actor_employee_id
            exp = TravelExpense(
                id=uuid.uuid4(),
                organization_id=organization_id,
                trip_id=trip.id,
                employee_id=target_emp_id,
                category=exp_in.category,
                expense_date=exp_in.expense_date or payload.planned_start_date,
                description=exp_in.description,
                amount=exp_in.amount,
                currency=exp_in.currency or payload.currency,
                receipt_url=exp_in.receipt_url,
                receipt_file_name=exp_in.receipt_file_name,
                payment_method=exp_in.payment_method,
                is_reimbursable=exp_in.is_reimbursable,
                status="draft",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
            session.add(exp)

        # Log activity
        action_msg = "Submitted planned travel request" if payload.submit_immediately else "Created draft planned travel request"
        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip.id,
            action="created",
            description=action_msg,
            actor_profile_id=actor_profile_id,
            details={"registration_type": "planned", "trip_number": trip_number},
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip.id)

    @classmethod
    async def create_past_trip(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        actor_employee_id: uuid.UUID | None,
        actor_profile_id: uuid.UUID | None,
        payload: TravelTripCreatePast,
    ) -> TravelTripDetailResponse:
        if not actor_employee_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An employee profile must be associated with the user to register past travel",
            )

        if payload.actual_end_date < payload.actual_start_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Actual return date cannot be earlier than actual departure date",
            )

        trip_number = await cls._generate_trip_number(session, organization_id)
        advance_paid = payload.advance_paid or Decimal("0.00")
        advance_status = "paid" if advance_paid > Decimal("0.00") else "none"

        act_transport = payload.act_travel_transport or Decimal("0.00")
        act_hotel = payload.act_hotel_accommodation or Decimal("0.00")
        act_food = payload.act_food_meals or Decimal("0.00")
        act_local = payload.act_local_transport or Decimal("0.00")
        act_other = payload.act_other_expenses or Decimal("0.00")

        if payload.initial_expenses and (act_transport + act_hotel + act_food + act_local + act_other == Decimal("0.00")):
            for exp in payload.initial_expenses:
                cat = (exp.category or "").lower()
                amt = Decimal(str(exp.amount or 0))
                if "hotel" in cat or "lodging" in cat or "accommodation" in cat:
                    act_hotel += amt
                elif "food" in cat or "meal" in cat:
                    act_food += amt
                elif "local" in cat:
                    act_local += amt
                elif "travel" in cat or "transport" in cat or "flight" in cat:
                    act_transport += amt
                else:
                    act_other += amt

        actual_total = act_transport + act_hotel + act_food + act_local + act_other

        if actual_total == Decimal("0.00") and payload.estimated_budget > Decimal("0.00"):
            actual_total = payload.estimated_budget
            act_other = payload.estimated_budget

        payer_type = payload.payer_type or "company"
        company_paid = payload.company_paid_amount or Decimal("0.00")
        employee_paid = payload.employee_paid_amount or Decimal("0.00")

        if payload.payments:
            comp_sum = sum((p.amount for p in payload.payments if p.payer_type == "company"), Decimal("0.00"))
            emp_sum = sum((p.amount for p in payload.payments if p.payer_type == "employee"), Decimal("0.00"))
            company_paid = comp_sum
            employee_paid = emp_sum
            if comp_sum > Decimal("0.00") and emp_sum > Decimal("0.00"):
                payer_type = "split"
            elif comp_sum > Decimal("0.00"):
                payer_type = "company"
            elif emp_sum > Decimal("0.00"):
                payer_type = "employee"
        elif company_paid == Decimal("0.00") and employee_paid == Decimal("0.00"):
            if payer_type == "company":
                company_paid = actual_total
            elif payer_type == "employee":
                employee_paid = actual_total
            elif payer_type == "split":
                company_paid = actual_total / Decimal("2.00")
                employee_paid = actual_total - company_paid

        cost_difference = actual_total

        trip = TravelTrip(
            id=uuid.uuid4(),
            organization_id=organization_id,
            trip_number=trip_number,
            title=payload.title,
            business_purpose=payload.business_purpose,
            registration_type="past",  # Post-registered
            status=payload.status,  # completed or ongoing or draft
            settlement_status="unsettled",
            requester_id=actor_employee_id,
            department_id=payload.department_id,
            client_id=payload.client_id,
            project_id=payload.project_id,
            origin=payload.origin,
            destination=payload.destination,
            actual_start_date=payload.actual_start_date,
            actual_end_date=payload.actual_end_date,
            planned_start_date=payload.actual_start_date,  # mirrors actual if not planned
            planned_end_date=payload.actual_end_date,
            actual_transport_mode=payload.actual_transport_mode,
            preferred_transport_mode=payload.actual_transport_mode,
            estimated_budget=actual_total,
            currency=payload.currency,
            est_travel_transport=Decimal("0.00"),
            est_hotel_accommodation=Decimal("0.00"),
            est_food_meals=Decimal("0.00"),
            est_local_transport=Decimal("0.00"),
            est_other_expenses=Decimal("0.00"),
            act_travel_transport=act_transport,
            act_hotel_accommodation=act_hotel,
            act_food_meals=act_food,
            act_local_transport=act_local,
            act_other_expenses=act_other,
            estimated_total=Decimal("0.00"),
            actual_total=actual_total,
            cost_difference=cost_difference,
            payer_type=payer_type,
            company_paid_amount=company_paid,
            employee_paid_amount=employee_paid,
            advance_requested=advance_paid,
            advance_approved=advance_paid,
            advance_paid=advance_paid,
            advance_status=advance_status,
            advance_payment_reference=payload.advance_payment_reference,
            advance_paid_at=datetime.now(UTC) if advance_paid > Decimal("0.00") else None,
            missing_info_explanation=payload.missing_info_explanation,
            notes=payload.notes,
            created_by_profile_id=actor_profile_id,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(trip)

        # Add payment entries if provided
        for pmt_in in payload.payments:
            pmt = TravelPayment(
                id=uuid.uuid4(),
                organization_id=organization_id,
                trip_id=trip.id,
                payer_type=pmt_in.payer_type,
                payer_name=pmt_in.payer_name,
                amount=pmt_in.amount,
                currency=pmt_in.currency or payload.currency,
                payment_method=pmt_in.payment_method,
                payment_date=pmt_in.payment_date,
                transaction_reference=pmt_in.transaction_reference,
                notes=pmt_in.notes,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
            session.add(pmt)

        # Add traveler / lead member
        lead_member = TravelMember(
            id=uuid.uuid4(),
            organization_id=organization_id,
            trip_id=trip.id,
            employee_id=actor_employee_id,
            trip_role="lead",
            participation_status="confirmed",
            individual_departure_date=payload.actual_start_date,
            individual_return_date=payload.actual_end_date,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(lead_member)

        # Add participating employees
        for emp_id in payload.participating_employee_ids:
            if emp_id != actor_employee_id:
                member = TravelMember(
                    id=uuid.uuid4(),
                    organization_id=organization_id,
                    trip_id=trip.id,
                    employee_id=emp_id,
                    trip_role="participant",
                    participation_status="confirmed",
                    individual_departure_date=payload.actual_start_date,
                    individual_return_date=payload.actual_end_date,
                    created_at=datetime.now(UTC),
                    updated_at=datetime.now(UTC),
                )
                session.add(member)

        # Add initial expenses if provided (all enter as submitted for review)
        for exp_in in payload.initial_expenses:
            target_emp_id = exp_in.employee_id or actor_employee_id
            exp = TravelExpense(
                id=uuid.uuid4(),
                organization_id=organization_id,
                trip_id=trip.id,
                employee_id=target_emp_id,
                category=exp_in.category,
                expense_date=exp_in.expense_date,
                description=exp_in.description,
                amount=exp_in.amount,
                currency=exp_in.currency,
                receipt_url=exp_in.receipt_url,
                receipt_file_name=exp_in.receipt_file_name,
                payment_method=exp_in.payment_method,
                is_reimbursable=exp_in.is_reimbursable,
                status="submitted",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
            session.add(exp)

        # Log activity
        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip.id,
            action="registered_past_travel",
            description="Registered past travel post-completion. Prior travel approval bypassed; expense review remains required.",
            actor_profile_id=actor_profile_id,
            details={
                "registration_type": "past",
                "trip_number": trip_number,
                "status": payload.status,
            },
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip.id)

    @classmethod
    async def update_trip(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        actor_profile_id: uuid.UUID | None,
        payload: TravelTripUpdate,
    ) -> TravelTripDetailResponse:
        stmt = select(TravelTrip).where(
            TravelTrip.id == trip_id,
            TravelTrip.organization_id == organization_id,
        )
        trip = await session.scalar(stmt)
        if not trip:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Travel trip not found")

        # Validate date consistency if provided
        planned_start = payload.planned_start_date or trip.planned_start_date
        planned_end = payload.planned_end_date or trip.planned_end_date
        if planned_start and planned_end and planned_end < planned_start:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Planned return date cannot be earlier than departure date",
            )

        actual_start = payload.actual_start_date or trip.actual_start_date
        actual_end = payload.actual_end_date or trip.actual_end_date
        if actual_start and actual_end and actual_end < actual_start:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Actual return date cannot be earlier than departure date",
            )

        update_data = payload.model_dump(exclude_unset=True)

        # Preserve approved estimated values for planned trips
        if trip.registration_type == "planned" and trip.status in ("approved", "booked", "ongoing", "completed"):
            for est_key in (
                "est_travel_transport",
                "est_hotel_accommodation",
                "est_food_meals",
                "est_local_transport",
                "est_other_expenses",
            ):
                update_data.pop(est_key, None)

        for key, value in update_data.items():
            setattr(trip, key, value)

        # Recalculate totals and difference
        est_transport = trip.est_travel_transport or Decimal("0.00")
        est_hotel = trip.est_hotel_accommodation or Decimal("0.00")
        est_food = trip.est_food_meals or Decimal("0.00")
        est_local = trip.est_local_transport or Decimal("0.00")
        est_other = trip.est_other_expenses or Decimal("0.00")
        trip.estimated_total = est_transport + est_hotel + est_food + est_local + est_other

        act_transport = trip.act_travel_transport or Decimal("0.00")
        act_hotel = trip.act_hotel_accommodation or Decimal("0.00")
        act_food = trip.act_food_meals or Decimal("0.00")
        act_local = trip.act_local_transport or Decimal("0.00")
        act_other = trip.act_other_expenses or Decimal("0.00")
        trip.actual_total = act_transport + act_hotel + act_food + act_local + act_other

        trip.cost_difference = trip.actual_total - trip.estimated_total
        trip.updated_at = datetime.now(UTC)

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip.id,
            action="updated",
            description="Updated trip details",
            actor_profile_id=actor_profile_id,
            details=update_data,
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip.id)

    @classmethod
    async def update_trip_actual_costs(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        actor_profile_id: uuid.UUID | None,
        payload: TravelTripActualCostsUpdate,
    ) -> TravelTripDetailResponse:
        stmt = (
            select(TravelTrip)
            .where(
                TravelTrip.id == trip_id,
                TravelTrip.organization_id == organization_id,
            )
            .options(
                selectinload(TravelTrip.payments),
            )
        )
        trip = await session.scalar(stmt)
        if not trip:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Travel trip not found")

        # Update actual category values
        if payload.act_travel_transport is not None:
            trip.act_travel_transport = payload.act_travel_transport
        if payload.act_hotel_accommodation is not None:
            trip.act_hotel_accommodation = payload.act_hotel_accommodation
        if payload.act_food_meals is not None:
            trip.act_food_meals = payload.act_food_meals
        if payload.act_local_transport is not None:
            trip.act_local_transport = payload.act_local_transport
        if payload.act_other_expenses is not None:
            trip.act_other_expenses = payload.act_other_expenses

        # Recompute actual total
        act_transport = trip.act_travel_transport or Decimal("0.00")
        act_hotel = trip.act_hotel_accommodation or Decimal("0.00")
        act_food = trip.act_food_meals or Decimal("0.00")
        act_local = trip.act_local_transport or Decimal("0.00")
        act_other = trip.act_other_expenses or Decimal("0.00")
        trip.actual_total = act_transport + act_hotel + act_food + act_local + act_other

        # Difference = Actual Total - Estimated Total (preserving approved estimates)
        est_total = trip.estimated_total or Decimal("0.00")
        trip.cost_difference = trip.actual_total - est_total

        # Payer details
        if payload.payer_type is not None:
            trip.payer_type = payload.payer_type
        if payload.company_paid_amount is not None:
            trip.company_paid_amount = payload.company_paid_amount
        if payload.employee_paid_amount is not None:
            trip.employee_paid_amount = payload.employee_paid_amount

        # If amounts were not explicitly supplied, configure based on payer_type
        if payload.company_paid_amount is None and payload.employee_paid_amount is None:
            if trip.payer_type == "company":
                trip.company_paid_amount = trip.actual_total
                trip.employee_paid_amount = Decimal("0.00")
            elif trip.payer_type == "employee":
                trip.company_paid_amount = Decimal("0.00")
                trip.employee_paid_amount = trip.actual_total
            elif trip.payer_type == "split":
                half = trip.actual_total / Decimal("2.00")
                trip.company_paid_amount = half
                trip.employee_paid_amount = trip.actual_total - half

        trip.updated_at = datetime.now(UTC)

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip.id,
            action="actual_costs_updated",
            description=f"Updated actual trip costs: Total = {trip.actual_total} (Difference = {trip.cost_difference})",
            actor_profile_id=actor_profile_id,
            details={
                "actual_total": str(trip.actual_total),
                "cost_difference": str(trip.cost_difference),
                "payer_type": trip.payer_type,
                "company_paid_amount": str(trip.company_paid_amount),
                "employee_paid_amount": str(trip.employee_paid_amount),
            },
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip.id)

    @classmethod
    async def add_trip_payment(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        actor_profile_id: uuid.UUID | None,
        payload: TravelPaymentCreate,
    ) -> TravelPaymentResponse:
        trip = await session.scalar(
            select(TravelTrip).where(
                TravelTrip.id == trip_id,
                TravelTrip.organization_id == organization_id,
            )
        )
        if not trip:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Travel trip not found")

        pmt = TravelPayment(
            id=uuid.uuid4(),
            organization_id=organization_id,
            trip_id=trip_id,
            payer_type=payload.payer_type,
            payer_name=payload.payer_name,
            amount=payload.amount,
            currency=payload.currency,
            payment_method=payload.payment_method,
            payment_date=payload.payment_date,
            transaction_reference=payload.transaction_reference,
            notes=payload.notes,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(pmt)

        # Update trip company / employee paid totals
        if payload.payer_type == "company":
            trip.company_paid_amount = (trip.company_paid_amount or Decimal("0.00")) + payload.amount
        else:
            trip.employee_paid_amount = (trip.employee_paid_amount or Decimal("0.00")) + payload.amount

        if (trip.company_paid_amount or Decimal("0.00")) > Decimal("0.00") and (trip.employee_paid_amount or Decimal("0.00")) > Decimal("0.00"):
            trip.payer_type = "split"
        elif (trip.company_paid_amount or Decimal("0.00")) > Decimal("0.00"):
            trip.payer_type = "company"
        elif (trip.employee_paid_amount or Decimal("0.00")) > Decimal("0.00"):
            trip.payer_type = "employee"

        trip.updated_at = datetime.now(UTC)

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip_id,
            action="payment_recorded",
            description=f"Recorded payment of {payload.amount} {payload.currency} paid by {payload.payer_type} ({payload.payment_method})",
            actor_profile_id=actor_profile_id,
            details={"payer_type": payload.payer_type, "payer_name": payload.payer_name, "amount": str(payload.amount), "method": payload.payment_method},
        )

        await session.commit()
        await session.refresh(pmt)
        return TravelPaymentResponse.model_validate(pmt)

    @classmethod
    async def delete_trip_payment(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        payment_id: uuid.UUID,
        actor_profile_id: uuid.UUID | None,
    ) -> None:
        pmt = await session.scalar(
            select(TravelPayment).where(
                TravelPayment.id == payment_id,
                TravelPayment.trip_id == trip_id,
                TravelPayment.organization_id == organization_id,
            )
        )
        if not pmt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment entry not found")

        trip = await session.scalar(
            select(TravelTrip).where(
                TravelTrip.id == trip_id,
                TravelTrip.organization_id == organization_id,
            )
        )

        if trip:
            if pmt.payer_type == "company":
                trip.company_paid_amount = max(Decimal("0.00"), (trip.company_paid_amount or Decimal("0.00")) - pmt.amount)
            else:
                trip.employee_paid_amount = max(Decimal("0.00"), (trip.employee_paid_amount or Decimal("0.00")) - pmt.amount)

            if (trip.company_paid_amount or Decimal("0.00")) > Decimal("0.00") and (trip.employee_paid_amount or Decimal("0.00")) > Decimal("0.00"):
                trip.payer_type = "split"
            elif (trip.company_paid_amount or Decimal("0.00")) > Decimal("0.00"):
                trip.payer_type = "company"
            elif (trip.employee_paid_amount or Decimal("0.00")) > Decimal("0.00"):
                trip.payer_type = "employee"

            trip.updated_at = datetime.now(UTC)

        await session.delete(pmt)

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip_id,
            action="payment_deleted",
            description=f"Deleted payment of {pmt.amount} {pmt.currency}",
            actor_profile_id=actor_profile_id,
        )

        await session.commit()

    @classmethod
    async def list_trip_payments(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
    ) -> list[TravelPaymentResponse]:
        stmt = (
            select(TravelPayment)
            .where(
                TravelPayment.trip_id == trip_id,
                TravelPayment.organization_id == organization_id,
            )
            .order_by(TravelPayment.payment_date.desc(), TravelPayment.created_at.desc())
        )
        payments = (await session.execute(stmt)).scalars().all()
        return [TravelPaymentResponse.model_validate(p) for p in payments]

    @classmethod
    async def submit_planned_trip(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        actor_profile_id: uuid.UUID | None,
    ) -> TravelTripDetailResponse:
        stmt = select(TravelTrip).where(
            TravelTrip.id == trip_id,
            TravelTrip.organization_id == organization_id,
        )
        trip = await session.scalar(stmt)
        if not trip:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Travel trip not found")

        if trip.registration_type != "planned":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only planned travel requests use prior travel approval submission",
            )

        if trip.status not in ("draft", "rejected"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot submit trip currently in '{trip.status}' status",
            )

        trip.status = "pending_approval"
        trip.updated_at = datetime.now(UTC)

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip.id,
            action="submitted_for_approval",
            description="Submitted travel request for manager/HR approval",
            actor_profile_id=actor_profile_id,
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip.id)

    @classmethod
    async def approve_planned_trip(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        approver_employee_id: uuid.UUID | None,
        actor_profile_id: uuid.UUID | None,
        payload: TravelTripApprovalAction,
    ) -> TravelTripDetailResponse:
        stmt = select(TravelTrip).where(
            TravelTrip.id == trip_id,
            TravelTrip.organization_id == organization_id,
        )
        trip = await session.scalar(stmt)
        if not trip:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Travel trip not found")

        if trip.status != "pending_approval":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot approve travel request in status '{trip.status}'",
            )

        trip.status = "approved"
        trip.approver_id = approver_employee_id
        trip.approved_at = datetime.now(UTC)
        trip.approver_comment = payload.approver_comment
        trip.updated_at = datetime.now(UTC)

        # If advance was requested, auto-approve the advance as part of trip approval
        if trip.advance_status == "requested":
            trip.advance_status = "approved"
            trip.advance_approved = trip.advance_requested

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip.id,
            action="approved",
            description=f"Approved travel request. Comments: {payload.approver_comment or 'None'}",
            actor_profile_id=actor_profile_id,
            details={"comment": payload.approver_comment},
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip.id)

    @classmethod
    async def reject_planned_trip(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        approver_employee_id: uuid.UUID | None,
        actor_profile_id: uuid.UUID | None,
        payload: TravelTripApprovalAction,
    ) -> TravelTripDetailResponse:
        stmt = select(TravelTrip).where(
            TravelTrip.id == trip_id,
            TravelTrip.organization_id == organization_id,
        )
        trip = await session.scalar(stmt)
        if not trip:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Travel trip not found")

        if trip.status != "pending_approval":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot reject travel request in status '{trip.status}'",
            )

        trip.status = "rejected"
        trip.approver_id = approver_employee_id
        trip.approved_at = datetime.now(UTC)
        trip.approver_comment = payload.approver_comment
        trip.updated_at = datetime.now(UTC)

        if trip.advance_status == "requested":
            trip.advance_status = "rejected"

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip.id,
            action="rejected",
            description=f"Rejected travel request. Reason: {payload.approver_comment or 'Not specified'}",
            actor_profile_id=actor_profile_id,
            details={"reason": payload.approver_comment},
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip.id)

    @classmethod
    async def cancel_trip(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        actor_profile_id: uuid.UUID | None,
    ) -> TravelTripDetailResponse:
        stmt = select(TravelTrip).where(
            TravelTrip.id == trip_id,
            TravelTrip.organization_id == organization_id,
        )
        trip = await session.scalar(stmt)
        if not trip:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Travel trip not found")

        if trip.status == "cancelled":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Trip is already cancelled")

        # Cancellation preserves all existing expenses, receipts and payments
        trip.status = "cancelled"
        trip.updated_at = datetime.now(UTC)

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip.id,
            action="cancelled",
            description="Trip cancelled. Historical expense and payment records preserved.",
            actor_profile_id=actor_profile_id,
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip.id)

    # ---------------- Member Operations ----------------
    @classmethod
    async def add_member(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        actor_profile_id: uuid.UUID | None,
        payload: TravelMemberCreate,
    ) -> TravelTripDetailResponse:
        # Check duplicate
        dup_stmt = select(TravelMember).where(
            TravelMember.trip_id == trip_id,
            TravelMember.employee_id == payload.employee_id,
        )
        existing = await session.scalar(dup_stmt)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Employee is already a registered member of this trip",
            )

        # Check employee belongs to org
        emp_stmt = select(Employee).where(
            Employee.id == payload.employee_id,
            Employee.organization_id == organization_id,
        )
        emp = await session.scalar(emp_stmt)
        if not emp:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

        member = TravelMember(
            id=uuid.uuid4(),
            organization_id=organization_id,
            trip_id=trip_id,
            employee_id=payload.employee_id,
            trip_role=payload.trip_role,
            participation_status=payload.participation_status,
            individual_departure_date=payload.individual_departure_date,
            individual_return_date=payload.individual_return_date,
            notes=payload.notes,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(member)

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip_id,
            action="member_added",
            description=f"Added employee {emp.first_name} {emp.last_name} ({payload.trip_role}) to trip",
            actor_profile_id=actor_profile_id,
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip_id)

    @classmethod
    async def remove_member(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        member_id: uuid.UUID,
        actor_profile_id: uuid.UUID | None,
    ) -> TravelTripDetailResponse:
        stmt = (
            select(TravelMember)
            .where(
                TravelMember.id == member_id,
                TravelMember.trip_id == trip_id,
                TravelMember.organization_id == organization_id,
            )
            .options(selectinload(TravelMember.employee))
        )
        member = await session.scalar(stmt)
        if not member:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip member not found")

        # Prevent removing trip requester
        trip_stmt = select(TravelTrip).where(TravelTrip.id == trip_id)
        trip = await session.scalar(trip_stmt)
        if trip and trip.requester_id == member.employee_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove the trip requester from trip members",
            )

        emp_name = f"{member.employee.first_name} {member.employee.last_name}" if member.employee else "member"
        await session.delete(member)

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip_id,
            action="member_removed",
            description=f"Removed {emp_name} from trip",
            actor_profile_id=actor_profile_id,
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip_id)

    # ---------------- Itinerary Operations ----------------
    @classmethod
    async def add_itinerary(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        actor_profile_id: uuid.UUID | None,
        payload: TravelItineraryCreate,
    ) -> TravelTripDetailResponse:
        itn = TravelItinerary(
            id=uuid.uuid4(),
            organization_id=organization_id,
            trip_id=trip_id,
            member_id=payload.member_id,
            type=payload.type,
            title=payload.title,
            departure_location=payload.departure_location,
            arrival_location=payload.arrival_location,
            departure_time=payload.departure_time,
            arrival_time=payload.arrival_time,
            booking_reference=payload.booking_reference,
            provider_name=payload.provider_name,
            booking_status=payload.booking_status,
            estimated_cost=payload.estimated_cost,
            notes=payload.notes,
            attachment_url=payload.attachment_url,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(itn)

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip_id,
            action="itinerary_added",
            description=f"Added {payload.type.title()}: {payload.title}",
            actor_profile_id=actor_profile_id,
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip_id)

    @classmethod
    async def update_itinerary(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        itinerary_id: uuid.UUID,
        actor_profile_id: uuid.UUID | None,
        payload: TravelItineraryUpdate,
    ) -> TravelTripDetailResponse:
        stmt = select(TravelItinerary).where(
            TravelItinerary.id == itinerary_id,
            TravelItinerary.trip_id == trip_id,
            TravelItinerary.organization_id == organization_id,
        )
        itn = await session.scalar(stmt)
        if not itn:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Itinerary record not found")

        update_data = payload.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(itn, key, value)

        itn.updated_at = datetime.now(UTC)

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip_id,
            action="itinerary_updated",
            description=f"Updated booking: {itn.title}",
            actor_profile_id=actor_profile_id,
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip_id)

    @classmethod
    async def delete_itinerary(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        itinerary_id: uuid.UUID,
        actor_profile_id: uuid.UUID | None,
    ) -> TravelTripDetailResponse:
        stmt = select(TravelItinerary).where(
            TravelItinerary.id == itinerary_id,
            TravelItinerary.trip_id == trip_id,
            TravelItinerary.organization_id == organization_id,
        )
        itn = await session.scalar(stmt)
        if not itn:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Itinerary record not found")

        title = itn.title
        await session.delete(itn)

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip_id,
            action="itinerary_deleted",
            description=f"Removed booking: {title}",
            actor_profile_id=actor_profile_id,
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip_id)

    # ---------------- Expense Operations ----------------
    @classmethod
    async def add_expense(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        actor_employee_id: uuid.UUID | None,
        actor_profile_id: uuid.UUID | None,
        payload: TravelExpenseCreate,
    ) -> TravelTripDetailResponse:
        # Resolve target employee
        target_emp_id = payload.employee_id or actor_employee_id
        if not target_emp_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Employee profile must be associated to record travel expense",
            )

        initial_status = "submitted" if payload.submit_immediately else "draft"

        exp = TravelExpense(
            id=uuid.uuid4(),
            organization_id=organization_id,
            trip_id=trip_id,
            employee_id=target_emp_id,
            category=payload.category,
            expense_date=payload.expense_date,
            description=payload.description,
            amount=payload.amount,
            currency=payload.currency,
            receipt_url=payload.receipt_url,
            receipt_file_name=payload.receipt_file_name,
            payment_method=payload.payment_method,
            is_reimbursable=payload.is_reimbursable,
            status=initial_status,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(exp)

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip_id,
            action="expense_added",
            description=f"Recorded expense {payload.currency} {payload.amount:.2f} ({payload.category}): {payload.description}",
            actor_profile_id=actor_profile_id,
            details={"amount": str(payload.amount), "category": payload.category},
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip_id)

    @classmethod
    async def update_expense(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        expense_id: uuid.UUID,
        actor_profile_id: uuid.UUID | None,
        payload: TravelExpenseUpdate,
    ) -> TravelTripDetailResponse:
        stmt = select(TravelExpense).where(
            TravelExpense.id == expense_id,
            TravelExpense.trip_id == trip_id,
            TravelExpense.organization_id == organization_id,
        )
        exp = await session.scalar(stmt)
        if not exp:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Travel expense not found")

        if exp.status in ("approved", "paid"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot edit expense that is already '{exp.status}'",
            )

        update_data = payload.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(exp, key, value)

        exp.updated_at = datetime.now(UTC)

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip_id,
            action="expense_updated",
            description=f"Updated expense: {exp.description}",
            actor_profile_id=actor_profile_id,
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip_id)

    @classmethod
    async def delete_expense(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        expense_id: uuid.UUID,
        actor_profile_id: uuid.UUID | None,
    ) -> TravelTripDetailResponse:
        stmt = select(TravelExpense).where(
            TravelExpense.id == expense_id,
            TravelExpense.trip_id == trip_id,
            TravelExpense.organization_id == organization_id,
        )
        exp = await session.scalar(stmt)
        if not exp:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Travel expense not found")

        if exp.status in ("approved", "paid"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete an approved or paid expense",
            )

        desc = exp.description
        await session.delete(exp)

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip_id,
            action="expense_deleted",
            description=f"Deleted draft expense: {desc}",
            actor_profile_id=actor_profile_id,
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip_id)

    @classmethod
    async def review_expense(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        expense_id: uuid.UUID,
        reviewer_employee_id: uuid.UUID | None,
        actor_profile_id: uuid.UUID | None,
        payload: TravelExpenseReviewAction,
    ) -> TravelTripDetailResponse:
        stmt = select(TravelExpense).where(
            TravelExpense.id == expense_id,
            TravelExpense.trip_id == trip_id,
            TravelExpense.organization_id == organization_id,
        )
        exp = await session.scalar(stmt)
        if not exp:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Travel expense not found")

        if payload.action == "approve":
            exp.status = "approved"
        else:
            exp.status = "rejected"

        exp.reviewer_id = reviewer_employee_id
        exp.reviewed_at = datetime.now(UTC)
        exp.reviewer_comment = payload.reviewer_comment
        exp.updated_at = datetime.now(UTC)

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip_id,
            action=f"expense_{payload.action}d",
            description=f"{payload.action.capitalize()}d expense of {exp.currency} {exp.amount:.2f} ({exp.description}). Note: {payload.reviewer_comment or 'None'}",
            actor_profile_id=actor_profile_id,
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip_id)

    # ---------------- Advance Operations ----------------
    @classmethod
    async def request_advance(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        actor_profile_id: uuid.UUID | None,
        payload: TravelAdvanceRequest,
    ) -> TravelTripDetailResponse:
        stmt = select(TravelTrip).where(
            TravelTrip.id == trip_id,
            TravelTrip.organization_id == organization_id,
        )
        trip = await session.scalar(stmt)
        if not trip:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Travel trip not found")

        trip.advance_requested = payload.amount
        trip.advance_status = "requested"
        trip.updated_at = datetime.now(UTC)

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip_id,
            action="advance_requested",
            description=f"Requested travel advance of {trip.currency} {payload.amount:.2f}. Notes: {payload.notes or 'None'}",
            actor_profile_id=actor_profile_id,
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip_id)

    @classmethod
    async def review_advance(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        actor_profile_id: uuid.UUID | None,
        payload: TravelAdvanceReviewAction,
    ) -> TravelTripDetailResponse:
        stmt = select(TravelTrip).where(
            TravelTrip.id == trip_id,
            TravelTrip.organization_id == organization_id,
        )
        trip = await session.scalar(stmt)
        if not trip:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Travel trip not found")

        if payload.action == "approve":
            trip.advance_status = "approved"
            trip.advance_approved = payload.approved_amount or trip.advance_requested
            msg = f"Approved travel advance of {trip.currency} {trip.advance_approved:.2f}"
        else:
            trip.advance_status = "rejected"
            trip.advance_approved = Decimal("0.00")
            msg = f"Rejected travel advance request. Note: {payload.reviewer_comment or 'None'}"

        trip.updated_at = datetime.now(UTC)

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip_id,
            action=f"advance_{payload.action}d",
            description=msg,
            actor_profile_id=actor_profile_id,
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip_id)

    @classmethod
    async def pay_advance(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        actor_profile_id: uuid.UUID | None,
        payload: TravelAdvancePayAction,
    ) -> TravelTripDetailResponse:
        stmt = select(TravelTrip).where(
            TravelTrip.id == trip_id,
            TravelTrip.organization_id == organization_id,
        )
        trip = await session.scalar(stmt)
        if not trip:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Travel trip not found")

        amount_to_pay = payload.amount_paid or trip.advance_approved or trip.advance_requested
        trip.advance_paid = amount_to_pay
        trip.advance_payment_reference = payload.payment_reference
        trip.advance_paid_at = datetime.now(UTC)
        trip.advance_status = "paid"
        trip.updated_at = datetime.now(UTC)

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip_id,
            action="advance_disbursed",
            description=f"Disbursed advance payment of {trip.currency} {amount_to_pay:.2f}. Ref: {payload.payment_reference}",
            actor_profile_id=actor_profile_id,
            details={"amount": str(amount_to_pay), "reference": payload.payment_reference},
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip_id)

    # ---------------- Settlement Operations ----------------
    @classmethod
    async def record_settlement(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        trip_id: uuid.UUID,
        actor_profile_id: uuid.UUID | None,
        payload: TravelSettlementCreate,
    ) -> TravelTripDetailResponse:
        stmt = select(TravelTrip).where(
            TravelTrip.id == trip_id,
            TravelTrip.organization_id == organization_id,
        )
        trip = await session.scalar(stmt)
        if not trip:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Travel trip not found")

        stl = TravelSettlement(
            id=uuid.uuid4(),
            organization_id=organization_id,
            trip_id=trip_id,
            employee_id=payload.employee_id or trip.requester_id,
            settlement_type=payload.settlement_type,
            amount=payload.amount,
            currency=payload.currency,
            status="completed",
            payment_date=payload.payment_date,
            payment_reference=payload.payment_reference,
            payment_method=payload.payment_method,
            settled_by_profile_id=actor_profile_id,
            notes=payload.notes,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(stl)

        if payload.mark_trip_settled:
            trip.settlement_status = "settled"
        else:
            trip.settlement_status = "partially_settled"

        trip.updated_at = datetime.now(UTC)

        await cls._log_activity(
            session=session,
            organization_id=organization_id,
            trip_id=trip_id,
            action="settlement_recorded",
            description=f"Recorded financial settlement of {payload.currency} {payload.amount:.2f} ({payload.settlement_type}). Ref: {payload.payment_reference}. Status: {trip.settlement_status}",
            actor_profile_id=actor_profile_id,
            details={
                "amount": str(payload.amount),
                "type": payload.settlement_type,
                "reference": payload.payment_reference,
            },
        )

        await session.commit()
        return await cls.get_trip(session, organization_id, trip_id)
