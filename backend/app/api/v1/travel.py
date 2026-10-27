from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session, require_permission
from app.models.employee import Employee
from app.models.identity import Profile
from app.schemas.common import ApiSuccess, PaginatedData
from app.schemas.travel import (
    TravelAdvancePayAction,
    TravelAdvanceRequest,
    TravelAdvanceReviewAction,
    TravelExpenseCreate,
    TravelExpenseReviewAction,
    TravelExpenseUpdate,
    TravelItineraryCreate,
    TravelItineraryUpdate,
    TravelMemberCreate,
    TravelPaymentCreate,
    TravelPaymentResponse,
    TravelReportMetrics,
    TravelSettlementCreate,
    TravelSummaryKPI,
    TravelTripActualCostsUpdate,
    TravelTripApprovalAction,
    TravelTripCreatePast,
    TravelTripCreatePlanned,
    TravelTripDetailResponse,
    TravelTripResponse,
    TravelTripUpdate,
)
from app.services.attendance import resolve_employee_for_user
from app.services.identity import get_user_permissions
from app.services.travel import TravelService

router = APIRouter(prefix="/travel", tags=["Travel Management"])

FULL_TRAVEL_PERMISSIONS = {
    "travel.manage",
    "travel.approve",
    "travel.settle",
    "admin.full",
}


async def _resolve_profile_and_employee(
    session: AsyncSession, organization_id: UUID, auth_user_id: UUID
) -> tuple[Profile | None, Employee | None]:
    prof = await session.scalar(select(Profile).where(Profile.auth_user_id == auth_user_id))
    emp = await resolve_employee_for_user(session, organization_id, auth_user_id)
    return prof, emp


# ---------------- Dashboard & Analytics ----------------
@router.get(
    "/dashboard",
    response_model=ApiSuccess[TravelSummaryKPI],
    summary="Get travel dashboard metrics overview",
)
async def get_dashboard_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelSummaryKPI]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if not ({"travel.view", "travel.create", "org:read"}.intersection(perms)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing travel.view permission",
        )

    data = await TravelService.get_dashboard_kpi(session, org_id)
    return ApiSuccess(data=data)


@router.get(
    "/reports",
    response_model=ApiSuccess[TravelReportMetrics],
    summary="Get travel reports and cost analytics",
)
async def get_reports_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelReportMetrics]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if not ({"travel.view", "travel.manage", "reports.view"}.intersection(perms)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing travel.view or reports.view permission",
        )

    data = await TravelService.get_reports_metrics(session, org_id)
    return ApiSuccess(data=data)


# ---------------- Trips Registry & CRUD ----------------
@router.get(
    "",
    response_model=ApiSuccess[PaginatedData[TravelTripResponse]],
    summary="List travel trips",
)
async def list_trips_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    search: Annotated[str | None, Query(description="Search trips by ref, title, destination")] = None,
    registration_type: Annotated[str | None, Query(description="Filter by planned or past")] = None,
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by status")] = None,
    settlement_status: Annotated[str | None, Query(description="Filter by settlement status")] = None,
    employee_id: Annotated[UUID | None, Query(description="Filter by employee")] = None,
    department_id: Annotated[UUID | None, Query(description="Filter by department")] = None,
    project_id: Annotated[UUID | None, Query(description="Filter by project")] = None,
    start_date: Annotated[date | None, Query(description="Filter by start date")] = None,
    end_date: Annotated[date | None, Query(description="Filter by end date")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Page size")] = 20,
) -> ApiSuccess[PaginatedData[TravelTripResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if not ({"travel.view", "travel.create"}.intersection(perms)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing travel.view permission",
        )

    is_employee_restricted = not bool(FULL_TRAVEL_PERMISSIONS.intersection(perms))
    _, actor_emp = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.list_trips(
        session=session,
        organization_id=org_id,
        search=search,
        registration_type=registration_type,
        status_filter=status_filter,
        settlement_status=settlement_status,
        employee_id=employee_id,
        department_id=department_id,
        project_id=project_id,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
        actor_employee_id=actor_emp.id if actor_emp else None,
        is_employee_restricted=is_employee_restricted,
    )
    return ApiSuccess(data=data)


@router.post(
    "/planned",
    response_model=ApiSuccess[TravelTripDetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create planned travel request (Pre-Registration)",
    dependencies=[Depends(require_permission("travel.create"))],
)
async def create_planned_trip_endpoint(
    payload: TravelTripCreatePlanned,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, emp = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.create_planned_trip(
        session=session,
        organization_id=org_id,
        actor_employee_id=emp.id if emp else None,
        actor_profile_id=prof.id if prof else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/past",
    response_model=ApiSuccess[TravelTripDetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Register past travel (Post-Registration, bypasses prior travel approval)",
    dependencies=[Depends(require_permission("travel.create"))],
)
async def create_past_trip_endpoint(
    payload: TravelTripCreatePast,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, emp = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.create_past_trip(
        session=session,
        organization_id=org_id,
        actor_employee_id=emp.id if emp else None,
        actor_profile_id=prof.id if prof else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.get(
    "/{trip_id}",
    response_model=ApiSuccess[TravelTripDetailResponse],
    summary="Get travel trip details including members, bookings, expenses, settlements, and activity logs",
)
async def get_trip_endpoint(
    trip_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if not ({"travel.view", "travel.create"}.intersection(perms)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing travel.view permission",
        )

    is_employee_restricted = not bool(FULL_TRAVEL_PERMISSIONS.intersection(perms))
    _, actor_emp = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.get_trip(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        actor_employee_id=actor_emp.id if actor_emp else None,
        is_employee_restricted=is_employee_restricted,
    )
    return ApiSuccess(data=data)


@router.patch(
    "/{trip_id}",
    response_model=ApiSuccess[TravelTripDetailResponse],
    summary="Update travel trip details",
    dependencies=[Depends(require_permission("travel.update"))],
)
async def update_trip_endpoint(
    trip_id: UUID,
    payload: TravelTripUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, _ = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.update_trip(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        actor_profile_id=prof.id if prof else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.patch(
    "/{trip_id}/actual-costs",
    response_model=ApiSuccess[TravelTripDetailResponse],
    summary="Update actual travel costs and payer details after travel",
    dependencies=[Depends(require_permission("travel.create"))],
)
async def update_trip_actual_costs_endpoint(
    trip_id: UUID,
    payload: TravelTripActualCostsUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, _ = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.update_trip_actual_costs(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        actor_profile_id=prof.id if prof else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.get(
    "/{trip_id}/payments",
    response_model=ApiSuccess[list[TravelPaymentResponse]],
    summary="List payment entries for a trip",
    dependencies=[Depends(require_permission("travel.view"))],
)
async def list_trip_payments_endpoint(
    trip_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[list[TravelPaymentResponse]]:
    org_id = UUID(organization_header)
    data = await TravelService.list_trip_payments(session=session, organization_id=org_id, trip_id=trip_id)
    return ApiSuccess(data=data)


@router.post(
    "/{trip_id}/payments",
    response_model=ApiSuccess[TravelPaymentResponse],
    summary="Add a payment entry to a trip",
    dependencies=[Depends(require_permission("travel.create"))],
)
async def add_trip_payment_endpoint(
    trip_id: UUID,
    payload: TravelPaymentCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelPaymentResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, _ = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.add_trip_payment(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        actor_profile_id=prof.id if prof else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.delete(
    "/{trip_id}/payments/{payment_id}",
    response_model=ApiSuccess[dict[str, str]],
    summary="Delete a payment entry from a trip",
    dependencies=[Depends(require_permission("travel.create"))],
)
async def delete_trip_payment_endpoint(
    trip_id: UUID,
    payment_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[dict[str, str]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, _ = await _resolve_profile_and_employee(session, org_id, user_id)

    await TravelService.delete_trip_payment(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        payment_id=payment_id,
        actor_profile_id=prof.id if prof else None,
    )
    return ApiSuccess(data={"status": "deleted", "payment_id": str(payment_id)})


@router.post(
    "/{trip_id}/submit",
    response_model=ApiSuccess[TravelTripDetailResponse],
    summary="Submit draft planned travel request for approval",
    dependencies=[Depends(require_permission("travel.create"))],
)
async def submit_trip_endpoint(
    trip_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, _ = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.submit_planned_trip(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        actor_profile_id=prof.id if prof else None,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{trip_id}/approve",
    response_model=ApiSuccess[TravelTripDetailResponse],
    summary="Approve planned travel request",
    dependencies=[Depends(require_permission("travel.approve"))],
)
async def approve_trip_endpoint(
    trip_id: UUID,
    payload: TravelTripApprovalAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, emp = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.approve_planned_trip(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        approver_employee_id=emp.id if emp else None,
        actor_profile_id=prof.id if prof else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{trip_id}/reject",
    response_model=ApiSuccess[TravelTripDetailResponse],
    summary="Reject planned travel request",
    dependencies=[Depends(require_permission("travel.approve"))],
)
async def reject_trip_endpoint(
    trip_id: UUID,
    payload: TravelTripApprovalAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, emp = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.reject_planned_trip(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        approver_employee_id=emp.id if emp else None,
        actor_profile_id=prof.id if prof else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{trip_id}/cancel",
    response_model=ApiSuccess[TravelTripDetailResponse],
    summary="Cancel travel trip (preserves historical expenses and payments)",
    dependencies=[Depends(require_permission("travel.delete"))],
)
async def cancel_trip_endpoint(
    trip_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, _ = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.cancel_trip(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        actor_profile_id=prof.id if prof else None,
    )
    return ApiSuccess(data=data)


# ---------------- Member Operations ----------------
@router.post(
    "/{trip_id}/members",
    response_model=ApiSuccess[TravelTripDetailResponse],
    summary="Add participating employee to trip",
    dependencies=[Depends(require_permission("travel.update"))],
)
async def add_member_endpoint(
    trip_id: UUID,
    payload: TravelMemberCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, _ = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.add_member(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        actor_profile_id=prof.id if prof else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.delete(
    "/{trip_id}/members/{member_id}",
    response_model=ApiSuccess[TravelTripDetailResponse],
    summary="Remove participating employee from trip",
    dependencies=[Depends(require_permission("travel.update"))],
)
async def remove_member_endpoint(
    trip_id: UUID,
    member_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, _ = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.remove_member(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        member_id=member_id,
        actor_profile_id=prof.id if prof else None,
    )
    return ApiSuccess(data=data)


# ---------------- Itinerary Operations ----------------
@router.post(
    "/{trip_id}/itineraries",
    response_model=ApiSuccess[TravelTripDetailResponse],
    summary="Add transport, accommodation, or activity booking",
    dependencies=[Depends(require_permission("travel.update"))],
)
async def add_itinerary_endpoint(
    trip_id: UUID,
    payload: TravelItineraryCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, _ = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.add_itinerary(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        actor_profile_id=prof.id if prof else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.patch(
    "/{trip_id}/itineraries/{itinerary_id}",
    response_model=ApiSuccess[TravelTripDetailResponse],
    summary="Update booking details",
    dependencies=[Depends(require_permission("travel.update"))],
)
async def update_itinerary_endpoint(
    trip_id: UUID,
    itinerary_id: UUID,
    payload: TravelItineraryUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, _ = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.update_itinerary(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        itinerary_id=itinerary_id,
        actor_profile_id=prof.id if prof else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.delete(
    "/{trip_id}/itineraries/{itinerary_id}",
    response_model=ApiSuccess[TravelTripDetailResponse],
    summary="Delete booking",
    dependencies=[Depends(require_permission("travel.update"))],
)
async def delete_itinerary_endpoint(
    trip_id: UUID,
    itinerary_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, _ = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.delete_itinerary(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        itinerary_id=itinerary_id,
        actor_profile_id=prof.id if prof else None,
    )
    return ApiSuccess(data=data)


# ---------------- Expense Operations ----------------
@router.post(
    "/{trip_id}/expenses",
    response_model=ApiSuccess[TravelTripDetailResponse],
    summary="Record travel expense against trip",
    dependencies=[Depends(require_permission("travel.create"))],
)
async def add_expense_endpoint(
    trip_id: UUID,
    payload: TravelExpenseCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, emp = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.add_expense(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        actor_employee_id=emp.id if emp else None,
        actor_profile_id=prof.id if prof else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.patch(
    "/{trip_id}/expenses/{expense_id}",
    response_model=ApiSuccess[TravelTripDetailResponse],
    summary="Update travel expense",
    dependencies=[Depends(require_permission("travel.update"))],
)
async def update_expense_endpoint(
    trip_id: UUID,
    expense_id: UUID,
    payload: TravelExpenseUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, _ = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.update_expense(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        expense_id=expense_id,
        actor_profile_id=prof.id if prof else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.delete(
    "/{trip_id}/expenses/{expense_id}",
    response_model=ApiSuccess[TravelTripDetailResponse],
    summary="Delete draft travel expense",
    dependencies=[Depends(require_permission("travel.delete"))],
)
async def delete_expense_endpoint(
    trip_id: UUID,
    expense_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, _ = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.delete_expense(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        expense_id=expense_id,
        actor_profile_id=prof.id if prof else None,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{trip_id}/expenses/{expense_id}/review",
    response_model=ApiSuccess[TravelTripDetailResponse],
    summary="Approve or reject travel expense claim",
    dependencies=[Depends(require_permission("travel.approve"))],
)
async def review_expense_endpoint(
    trip_id: UUID,
    expense_id: UUID,
    payload: TravelExpenseReviewAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, emp = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.review_expense(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        expense_id=expense_id,
        reviewer_employee_id=emp.id if emp else None,
        actor_profile_id=prof.id if prof else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


# ---------------- Advance & Settlement Operations ----------------
@router.post(
    "/{trip_id}/advance/request",
    response_model=ApiSuccess[TravelTripDetailResponse],
    summary="Request a cash advance for travel",
    dependencies=[Depends(require_permission("travel.create"))],
)
async def request_advance_endpoint(
    trip_id: UUID,
    payload: TravelAdvanceRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, _ = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.request_advance(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        actor_profile_id=prof.id if prof else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{trip_id}/advance/review",
    response_model=ApiSuccess[TravelTripDetailResponse],
    summary="Approve or reject travel advance request",
    dependencies=[Depends(require_permission("travel.approve"))],
)
async def review_advance_endpoint(
    trip_id: UUID,
    payload: TravelAdvanceReviewAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, _ = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.review_advance(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        actor_profile_id=prof.id if prof else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{trip_id}/advance/pay",
    response_model=ApiSuccess[TravelTripDetailResponse],
    summary="Record advance disbursement / payment by Finance",
    dependencies=[Depends(require_permission("travel.settle"))],
)
async def pay_advance_endpoint(
    trip_id: UUID,
    payload: TravelAdvancePayAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, _ = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.pay_advance(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        actor_profile_id=prof.id if prof else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{trip_id}/settlements",
    response_model=ApiSuccess[TravelTripDetailResponse],
    summary="Record final settlement / reimbursement / employee recovery",
    dependencies=[Depends(require_permission("travel.settle"))],
)
async def record_settlement_endpoint(
    trip_id: UUID,
    payload: TravelSettlementCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TravelTripDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    prof, _ = await _resolve_profile_and_employee(session, org_id, user_id)

    data = await TravelService.record_settlement(
        session=session,
        organization_id=org_id,
        trip_id=trip_id,
        actor_profile_id=prof.id if prof else None,
        payload=payload,
    )
    return ApiSuccess(data=data)
