from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session, require_permission
from app.models.employee import Employee
from app.schemas.common import ApiSuccess, PaginatedData
from app.schemas.reimbursement import (
    ReimbursementClaimCreate,
    ReimbursementClaimResponse,
    ReimbursementClaimUpdate,
    ReimbursementPayAction,
    ReimbursementReviewAction,
    ReimbursementSummaryKPI,
)
from app.services.attendance import resolve_employee_for_user
from app.services.identity import get_user_permissions
from app.services.reimbursement import ReimbursementService

router = APIRouter(prefix="/reimbursements", tags=["Reimbursements"])

FULL_REIMBURSEMENT_PERMISSIONS = {
    "reimbursements.manage",
    "reimbursements.approve",
    "reimbursements.pay",
    "admin.full",
}


async def _resolve_employee(
    session: AsyncSession, organization_id: UUID, auth_user_id: UUID
) -> Employee | None:
    return await resolve_employee_for_user(session, organization_id, auth_user_id)


@router.get(
    "/summary",
    response_model=ApiSuccess[ReimbursementSummaryKPI],
    summary="Get reimbursement metrics overview",
)
async def get_summary_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ReimbursementSummaryKPI]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if not ({"reimbursements.view", "reimbursements.create", "reimbursements:read"}.intersection(perms)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing reimbursements.view permission",
        )

    data = await ReimbursementService.get_summary_kpi(session, org_id)
    return ApiSuccess(data=data)


@router.get(
    "",
    response_model=ApiSuccess[PaginatedData[ReimbursementClaimResponse]],
    summary="List reimbursement claims",
)
async def list_claims_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    search: Annotated[str | None, Query(description="Search claim number, title, or description")] = None,
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by status")] = None,
    category: Annotated[str | None, Query(description="Filter by category")] = None,
    employee_id: Annotated[UUID | None, Query(description="Filter by employee")] = None,
    start_date: Annotated[date | None, Query(description="Filter by start date")] = None,
    end_date: Annotated[date | None, Query(description="Filter by end date")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Page size")] = 20,
) -> ApiSuccess[PaginatedData[ReimbursementClaimResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if not ({"reimbursements.view", "reimbursements.create", "reimbursements:read"}.intersection(perms)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing reimbursements.view permission",
        )

    is_employee_restricted = not bool(FULL_REIMBURSEMENT_PERMISSIONS.intersection(perms))
    actor_employee = None
    if is_employee_restricted:
        actor_employee = await _resolve_employee(session, org_id, user_id)

    data = await ReimbursementService.list_claims(
        session=session,
        organization_id=org_id,
        search=search,
        status_filter=status_filter,
        category=category,
        employee_id=employee_id,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
        actor_employee_id=actor_employee.id if actor_employee else None,
        is_employee_restricted=is_employee_restricted,
    )
    return ApiSuccess(data=data)


@router.post(
    "",
    response_model=ApiSuccess[ReimbursementClaimResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new reimbursement claim",
    dependencies=[Depends(require_permission("reimbursements.create"))],
)
async def create_claim_endpoint(
    payload: ReimbursementClaimCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ReimbursementClaimResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    actor_employee = await _resolve_employee(session, org_id, user_id)

    data = await ReimbursementService.create_claim(
        session=session,
        organization_id=org_id,
        actor_employee_id=actor_employee.id if actor_employee else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.get(
    "/{claim_id}",
    response_model=ApiSuccess[ReimbursementClaimResponse],
    summary="Get reimbursement claim details",
)
async def get_claim_endpoint(
    claim_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ReimbursementClaimResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if not ({"reimbursements.view", "reimbursements.create", "reimbursements:read"}.intersection(perms)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing reimbursements.view permission",
        )

    data = await ReimbursementService.get_claim(session, org_id, claim_id)

    # Scoping check if employee-restricted
    is_employee_restricted = not bool(FULL_REIMBURSEMENT_PERMISSIONS.intersection(perms))
    if is_employee_restricted:
        actor_employee = await _resolve_employee(session, org_id, user_id)
        if not actor_employee or data.employee_id != actor_employee.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view your own reimbursement claims",
            )

    return ApiSuccess(data=data)


@router.patch(
    "/{claim_id}",
    response_model=ApiSuccess[ReimbursementClaimResponse],
    summary="Update reimbursement claim",
    dependencies=[Depends(require_permission("reimbursements.update"))],
)
async def update_claim_endpoint(
    claim_id: UUID,
    payload: ReimbursementClaimUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ReimbursementClaimResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    is_employee_restricted = not bool(FULL_REIMBURSEMENT_PERMISSIONS.intersection(perms))
    actor_employee = await _resolve_employee(session, org_id, user_id)

    data = await ReimbursementService.update_claim(
        session=session,
        organization_id=org_id,
        claim_id=claim_id,
        payload=payload,
        actor_employee_id=actor_employee.id if actor_employee else None,
        is_employee_restricted=is_employee_restricted,
    )
    return ApiSuccess(data=data)


@router.delete(
    "/{claim_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete draft reimbursement claim",
    dependencies=[Depends(require_permission("reimbursements.delete"))],
)
async def delete_claim_endpoint(
    claim_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> None:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    is_employee_restricted = not bool(FULL_REIMBURSEMENT_PERMISSIONS.intersection(perms))
    actor_employee = await _resolve_employee(session, org_id, user_id)

    await ReimbursementService.delete_claim(
        session=session,
        organization_id=org_id,
        claim_id=claim_id,
        actor_employee_id=actor_employee.id if actor_employee else None,
        is_employee_restricted=is_employee_restricted,
    )


@router.post(
    "/{claim_id}/submit",
    response_model=ApiSuccess[ReimbursementClaimResponse],
    summary="Submit draft reimbursement claim",
    dependencies=[Depends(require_permission("reimbursements.create"))],
)
async def submit_claim_endpoint(
    claim_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ReimbursementClaimResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    is_employee_restricted = not bool(FULL_REIMBURSEMENT_PERMISSIONS.intersection(perms))
    actor_employee = await _resolve_employee(session, org_id, user_id)

    data = await ReimbursementService.submit_claim(
        session=session,
        organization_id=org_id,
        claim_id=claim_id,
        actor_employee_id=actor_employee.id if actor_employee else None,
        is_employee_restricted=is_employee_restricted,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{claim_id}/approve",
    response_model=ApiSuccess[ReimbursementClaimResponse],
    summary="Approve submitted claim",
    dependencies=[Depends(require_permission("reimbursements.approve"))],
)
async def approve_claim_endpoint(
    claim_id: UUID,
    payload: ReimbursementReviewAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ReimbursementClaimResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    reviewer_employee = await _resolve_employee(session, org_id, user_id)

    data = await ReimbursementService.approve_claim(
        session=session,
        organization_id=org_id,
        claim_id=claim_id,
        reviewer_employee_id=reviewer_employee.id if reviewer_employee else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{claim_id}/reject",
    response_model=ApiSuccess[ReimbursementClaimResponse],
    summary="Reject submitted claim",
    dependencies=[Depends(require_permission("reimbursements.approve"))],
)
async def reject_claim_endpoint(
    claim_id: UUID,
    payload: ReimbursementReviewAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ReimbursementClaimResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    reviewer_employee = await _resolve_employee(session, org_id, user_id)

    data = await ReimbursementService.reject_claim(
        session=session,
        organization_id=org_id,
        claim_id=claim_id,
        reviewer_employee_id=reviewer_employee.id if reviewer_employee else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{claim_id}/pay",
    response_model=ApiSuccess[ReimbursementClaimResponse],
    summary="Mark approved claim as paid / disbursed",
    dependencies=[Depends(require_permission("reimbursements.pay"))],
)
async def pay_claim_endpoint(
    claim_id: UUID,
    payload: ReimbursementPayAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ReimbursementClaimResponse]:
    org_id = UUID(organization_header)

    data = await ReimbursementService.pay_claim(
        session=session,
        organization_id=org_id,
        claim_id=claim_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{claim_id}/cancel",
    response_model=ApiSuccess[ReimbursementClaimResponse],
    summary="Cancel claim",
    dependencies=[Depends(require_permission("reimbursements.create"))],
)
async def cancel_claim_endpoint(
    claim_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ReimbursementClaimResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    is_employee_restricted = not bool(FULL_REIMBURSEMENT_PERMISSIONS.intersection(perms))
    actor_employee = await _resolve_employee(session, org_id, user_id)

    data = await ReimbursementService.cancel_claim(
        session=session,
        organization_id=org_id,
        claim_id=claim_id,
        actor_employee_id=actor_employee.id if actor_employee else None,
        is_employee_restricted=is_employee_restricted,
    )
    return ApiSuccess(data=data)
