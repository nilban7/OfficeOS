from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session, require_permission
from app.schemas.common import ApiSuccess, PaginatedData
from app.schemas.procurement import (
    PurchaseRequestCreate,
    PurchaseRequestResponse,
    PurchaseRequestReview,
    PurchaseRequestUpdate,
)
from app.services.attendance import resolve_employee_for_user
from app.services.identity import get_user_permissions
from app.services.procurement import (
    approve_purchase_request,
    cancel_purchase_request,
    create_purchase_request,
    get_purchase_request,
    list_purchase_requests,
    reject_purchase_request,
    submit_purchase_request,
    update_purchase_request,
)

router = APIRouter(prefix="/purchase-requests", tags=["Purchase Requests"])


@router.get(
    "",
    response_model=ApiSuccess[PaginatedData[PurchaseRequestResponse]],
    summary="List purchase requests",
)
async def list_requests_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    status: Annotated[str | None, Query(description="Filter by request status")] = None,
    priority: Annotated[str | None, Query(description="Filter by priority")] = None,
    department_id: Annotated[UUID | None, Query(description="Filter by department ID")] = None,
    requester_id: Annotated[
        UUID | None, Query(description="Filter by requester employee ID")
    ] = None,
    search: Annotated[str | None, Query(description="Search term (number, purpose)")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Page size")] = 20,
) -> ApiSuccess[PaginatedData[PurchaseRequestResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    emp = await resolve_employee_for_user(session, org_id, user_id)
    emp_id = emp.id if emp else None

    permissions = await get_user_permissions(session, current_user)
    has_org_view = bool(
        {
            "procurement.view",
            "procurement.approve",
            "purchase_orders.manage",
            "purchase_orders.view",
        }
        & set(permissions)
    )

    res = await list_purchase_requests(
        session=session,
        organization_id=org_id,
        current_user_id=user_id,
        current_employee_id=emp_id,
        has_org_view_permission=has_org_view,
        page=page,
        page_size=page_size,
        status_filter=status,
        priority_filter=priority,
        department_id=department_id,
        requester_id=requester_id,
        search=search,
    )

    return ApiSuccess(
        data=PaginatedData(
            items=res.items,
            meta=res.meta,
        )
    )


@router.post(
    "",
    response_model=ApiSuccess[PurchaseRequestResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a purchase request",
)
async def create_request_endpoint(
    payload: PurchaseRequestCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[PurchaseRequestResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    emp = await resolve_employee_for_user(session, org_id, user_id)
    emp_id = emp.id if emp else None

    item = await create_purchase_request(
        session=session,
        organization_id=org_id,
        payload=payload,
        current_employee_id=emp_id,
        current_user_id=user_id,
    )
    return ApiSuccess(data=item, message="Purchase request created successfully")


@router.get(
    "/{request_id}",
    response_model=ApiSuccess[PurchaseRequestResponse],
    summary="Get purchase request details",
)
async def get_request_endpoint(
    request_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[PurchaseRequestResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    emp = await resolve_employee_for_user(session, org_id, user_id)
    emp_id = emp.id if emp else None

    permissions = await get_user_permissions(session, current_user)
    has_org_view = bool(
        {
            "procurement.view",
            "procurement.approve",
            "purchase_orders.manage",
            "purchase_orders.view",
        }
        & set(permissions)
    )

    item = await get_purchase_request(
        session=session,
        organization_id=org_id,
        request_id=request_id,
        current_employee_id=emp_id,
        has_org_view_permission=has_org_view,
    )
    return ApiSuccess(data=item)


@router.patch(
    "/{request_id}",
    response_model=ApiSuccess[PurchaseRequestResponse],
    summary="Update a draft purchase request",
)
async def update_request_endpoint(
    request_id: UUID,
    payload: PurchaseRequestUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[PurchaseRequestResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    emp = await resolve_employee_for_user(session, org_id, user_id)
    emp_id = emp.id if emp else None

    permissions = await get_user_permissions(session, current_user)
    has_manage = bool({"procurement.update", "procurement.approve"} & set(permissions))

    item = await update_purchase_request(
        session=session,
        organization_id=org_id,
        request_id=request_id,
        payload=payload,
        current_employee_id=emp_id,
        current_user_id=user_id,
        has_org_manage_permission=has_manage,
    )
    return ApiSuccess(data=item, message="Purchase request updated successfully")


@router.post(
    "/{request_id}/submit",
    response_model=ApiSuccess[PurchaseRequestResponse],
    summary="Submit a purchase request for approval",
)
async def submit_request_endpoint(
    request_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[PurchaseRequestResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    emp = await resolve_employee_for_user(session, org_id, user_id)
    emp_id = emp.id if emp else None

    permissions = await get_user_permissions(session, current_user)
    has_manage = bool({"procurement.update", "procurement.approve"} & set(permissions))

    item = await submit_purchase_request(
        session=session,
        organization_id=org_id,
        request_id=request_id,
        current_employee_id=emp_id,
        current_user_id=user_id,
        has_org_manage_permission=has_manage,
    )
    return ApiSuccess(data=item, message="Purchase request submitted for approval")


@router.post(
    "/{request_id}/approve",
    response_model=ApiSuccess[PurchaseRequestResponse],
    summary="Approve a submitted purchase request",
)
async def approve_request_endpoint(
    request_id: UUID,
    payload: PurchaseRequestReview,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("procurement.approve"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[PurchaseRequestResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    emp = await resolve_employee_for_user(session, org_id, user_id)
    reviewer_emp_id = emp.id if emp else None

    item = await approve_purchase_request(
        session=session,
        organization_id=org_id,
        request_id=request_id,
        reviewer_comment=payload.reviewer_comment,
        reviewer_employee_id=reviewer_emp_id,
        current_user_id=user_id,
    )
    return ApiSuccess(data=item, message="Purchase request approved successfully")


@router.post(
    "/{request_id}/reject",
    response_model=ApiSuccess[PurchaseRequestResponse],
    summary="Reject a submitted purchase request",
)
async def reject_request_endpoint(
    request_id: UUID,
    payload: PurchaseRequestReview,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("procurement.approve"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[PurchaseRequestResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    emp = await resolve_employee_for_user(session, org_id, user_id)
    reviewer_emp_id = emp.id if emp else None

    item = await reject_purchase_request(
        session=session,
        organization_id=org_id,
        request_id=request_id,
        reviewer_comment=payload.reviewer_comment,
        reviewer_employee_id=reviewer_emp_id,
        current_user_id=user_id,
    )
    return ApiSuccess(data=item, message="Purchase request rejected")


@router.post(
    "/{request_id}/cancel",
    response_model=ApiSuccess[PurchaseRequestResponse],
    summary="Cancel a purchase request",
)
async def cancel_request_endpoint(
    request_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[PurchaseRequestResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    emp = await resolve_employee_for_user(session, org_id, user_id)
    emp_id = emp.id if emp else None

    permissions = await get_user_permissions(session, current_user)
    has_manage = bool({"procurement.delete", "procurement.approve"} & set(permissions))

    item = await cancel_purchase_request(
        session=session,
        organization_id=org_id,
        request_id=request_id,
        current_employee_id=emp_id,
        current_user_id=user_id,
        has_org_manage_permission=has_manage,
    )
    return ApiSuccess(data=item, message="Purchase request cancelled successfully")
