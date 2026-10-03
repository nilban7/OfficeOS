from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session, require_permission
from app.schemas.common import ApiSuccess, PaginatedData
from app.schemas.maintenance import (
    MaintenanceRequestAction,
    MaintenanceRequestCreate,
    MaintenanceRequestDetailResponse,
    MaintenanceRequestReject,
    MaintenanceRequestResponse,
    MaintenanceRequestUpdate,
)
from app.services.attendance import resolve_employee_for_user
from app.services.identity import get_user_permissions
from app.services.maintenance import (
    approve_maintenance_request,
    cancel_maintenance_request,
    create_maintenance_request,
    get_maintenance_request,
    list_maintenance_requests,
    reject_maintenance_request,
    schedule_maintenance_request,
    update_maintenance_request,
)

router = APIRouter(prefix="/maintenance-requests", tags=["Maintenance Requests"])


@router.get(
    "",
    response_model=ApiSuccess[PaginatedData[MaintenanceRequestResponse]],
    summary="List maintenance requests",
)
async def list_maintenance_requests_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    search: Annotated[str | None, Query(description="Search request number, title, description")] = None,
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by status")] = None,
    priority: Annotated[str | None, Query(description="Filter by priority")] = None,
    asset_id: Annotated[UUID | None, Query(description="Filter by asset ID")] = None,
    branch_id: Annotated[UUID | None, Query(description="Filter by branch ID")] = None,
    requester_id: Annotated[UUID | None, Query(description="Filter by requester employee ID")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Page size")] = 20,
) -> ApiSuccess[PaginatedData[MaintenanceRequestResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    emp = await resolve_employee_for_user(session, org_id, user_id)
    emp_id = emp.id if emp else None

    perms = await get_user_permissions(session, user_id, org_id)
    can_view = "maintenance.view" in perms
    can_create = "maintenance.create" in perms

    if not can_view and not can_create:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing maintenance permission",
        )

    has_org_view = can_view and "maintenance.update" in perms

    data = await list_maintenance_requests(
        session=session,
        organization_id=org_id,
        current_user_id=user_id,
        current_employee_id=emp_id,
        has_org_view_permission=has_org_view,
        search=search,
        status_filter=status_filter,
        priority_filter=priority,
        asset_id=asset_id,
        branch_id=branch_id,
        requester_id=requester_id,
        page=page,
        page_size=page_size,
    )
    return ApiSuccess(data=data)


@router.post(
    "",
    response_model=ApiSuccess[MaintenanceRequestResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create maintenance request",
    dependencies=[Depends(require_permission("maintenance.create"))],
)
async def create_maintenance_request_endpoint(
    payload: MaintenanceRequestCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[MaintenanceRequestResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    emp = await resolve_employee_for_user(session, org_id, user_id)
    emp_id = emp.id if emp else None

    perms = await get_user_permissions(session, user_id, org_id)
    can_manage = "maintenance.update" in perms

    data = await create_maintenance_request(
        session=session,
        organization_id=org_id,
        payload=payload,
        current_employee_id=emp_id,
        current_user_id=user_id,
        can_manage=can_manage,
    )
    return ApiSuccess(data=data)


@router.get(
    "/{id}",
    response_model=ApiSuccess[MaintenanceRequestDetailResponse],
    summary="Get maintenance request details",
)
async def get_maintenance_request_endpoint(
    id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[MaintenanceRequestDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    emp = await resolve_employee_for_user(session, org_id, user_id)
    emp_id = emp.id if emp else None

    perms = await get_user_permissions(session, user_id, org_id)
    can_view = "maintenance.view" in perms
    can_create = "maintenance.create" in perms

    if not can_view and not can_create:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing maintenance permission",
        )

    has_org_view = can_view and "maintenance.update" in perms

    data = await get_maintenance_request(
        session=session,
        organization_id=org_id,
        request_id=id,
        current_user_id=user_id,
        current_employee_id=emp_id,
        has_org_view_permission=has_org_view,
    )
    return ApiSuccess(data=data)


@router.patch(
    "/{id}",
    response_model=ApiSuccess[MaintenanceRequestResponse],
    summary="Update maintenance request",
)
async def update_maintenance_request_endpoint(
    id: UUID,
    payload: MaintenanceRequestUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[MaintenanceRequestResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    emp = await resolve_employee_for_user(session, org_id, user_id)
    emp_id = emp.id if emp else None

    perms = await get_user_permissions(session, user_id, org_id)
    can_manage = "maintenance.update" in perms
    can_create = "maintenance.create" in perms

    if not can_manage and not can_create:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing maintenance permission",
        )

    data = await update_maintenance_request(
        session=session,
        organization_id=org_id,
        request_id=id,
        payload=payload,
        current_user_id=user_id,
        current_employee_id=emp_id,
        can_manage=can_manage,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{id}/approve",
    response_model=ApiSuccess[MaintenanceRequestResponse],
    summary="Approve maintenance request",
    dependencies=[Depends(require_permission("maintenance.update"))],
)
async def approve_maintenance_request_endpoint(
    id: UUID,
    payload: MaintenanceRequestAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[MaintenanceRequestResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await approve_maintenance_request(
        session=session,
        organization_id=org_id,
        request_id=id,
        notes=payload.notes,
        current_user_id=user_id,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{id}/reject",
    response_model=ApiSuccess[MaintenanceRequestResponse],
    summary="Reject maintenance request",
    dependencies=[Depends(require_permission("maintenance.update"))],
)
async def reject_maintenance_request_endpoint(
    id: UUID,
    payload: MaintenanceRequestReject,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[MaintenanceRequestResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await reject_maintenance_request(
        session=session,
        organization_id=org_id,
        request_id=id,
        payload=payload,
        current_user_id=user_id,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{id}/schedule",
    response_model=ApiSuccess[MaintenanceRequestResponse],
    summary="Schedule maintenance request",
    dependencies=[Depends(require_permission("maintenance.update"))],
)
async def schedule_maintenance_request_endpoint(
    id: UUID,
    payload: MaintenanceRequestAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[MaintenanceRequestResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await schedule_maintenance_request(
        session=session,
        organization_id=org_id,
        request_id=id,
        notes=payload.notes,
        current_user_id=user_id,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{id}/cancel",
    response_model=ApiSuccess[MaintenanceRequestResponse],
    summary="Cancel maintenance request",
)
async def cancel_maintenance_request_endpoint(
    id: UUID,
    payload: MaintenanceRequestAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[MaintenanceRequestResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    emp = await resolve_employee_for_user(session, org_id, user_id)
    emp_id = emp.id if emp else None

    perms = await get_user_permissions(session, user_id, org_id)
    can_manage = "maintenance.delete" in perms or "maintenance.update" in perms
    can_create = "maintenance.create" in perms

    if not can_manage and not can_create:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing maintenance permission",
        )

    data = await cancel_maintenance_request(
        session=session,
        organization_id=org_id,
        request_id=id,
        notes=payload.notes,
        current_user_id=user_id,
        current_employee_id=emp_id,
        can_manage=can_manage,
    )
    return ApiSuccess(data=data)
