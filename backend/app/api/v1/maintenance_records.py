from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session, require_permission
from app.schemas.common import ApiSuccess, PaginatedData
from app.schemas.maintenance import (
    MaintenanceRecordAction,
    MaintenanceRecordComplete,
    MaintenanceRecordCreate,
    MaintenanceRecordDetailResponse,
    MaintenanceRecordResponse,
    MaintenanceRecordStart,
    MaintenanceRecordUpdate,
)
from app.services.attendance import resolve_employee_for_user
from app.services.identity import get_user_permissions
from app.services.maintenance import (
    cancel_maintenance_record,
    complete_maintenance_record,
    create_maintenance_record,
    get_maintenance_record,
    list_maintenance_records,
    start_maintenance_record,
    update_maintenance_record,
)

router = APIRouter(prefix="/maintenance-records", tags=["Maintenance Records"])


@router.get(
    "",
    response_model=ApiSuccess[PaginatedData[MaintenanceRecordResponse]],
    summary="List maintenance records",
)
async def list_maintenance_records_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    search: Annotated[str | None, Query(description="Search record number, description, parts")] = None,
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by status")] = None,
    maintenance_type: Annotated[str | None, Query(description="Filter by maintenance type")] = None,
    asset_id: Annotated[UUID | None, Query(description="Filter by asset ID")] = None,
    technician_id: Annotated[UUID | None, Query(description="Filter by technician employee ID")] = None,
    vendor_id: Annotated[UUID | None, Query(description="Filter by vendor ID")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Page size")] = 20,
) -> ApiSuccess[PaginatedData[MaintenanceRecordResponse]]:
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

    data = await list_maintenance_records(
        session=session,
        organization_id=org_id,
        current_user_id=user_id,
        current_employee_id=emp_id,
        has_org_view_permission=has_org_view,
        search=search,
        status_filter=status_filter,
        maintenance_type=maintenance_type,
        asset_id=asset_id,
        technician_id=technician_id,
        vendor_id=vendor_id,
        page=page,
        page_size=page_size,
    )
    return ApiSuccess(data=data)


@router.post(
    "",
    response_model=ApiSuccess[MaintenanceRecordResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create maintenance record",
    dependencies=[Depends(require_permission("maintenance.create"))],
)
async def create_maintenance_record_endpoint(
    payload: MaintenanceRecordCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[MaintenanceRecordResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await create_maintenance_record(
        session=session,
        organization_id=org_id,
        payload=payload,
        current_user_id=user_id,
    )
    return ApiSuccess(data=data)


@router.get(
    "/{id}",
    response_model=ApiSuccess[MaintenanceRecordDetailResponse],
    summary="Get maintenance record details",
)
async def get_maintenance_record_endpoint(
    id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[MaintenanceRecordDetailResponse]:
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

    data = await get_maintenance_record(
        session=session,
        organization_id=org_id,
        record_id=id,
        current_user_id=user_id,
        current_employee_id=emp_id,
        has_org_view_permission=has_org_view,
    )
    return ApiSuccess(data=data)


@router.patch(
    "/{id}",
    response_model=ApiSuccess[MaintenanceRecordResponse],
    summary="Update maintenance record",
    dependencies=[Depends(require_permission("maintenance.update"))],
)
async def update_maintenance_record_endpoint(
    id: UUID,
    payload: MaintenanceRecordUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[MaintenanceRecordResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await update_maintenance_record(
        session=session,
        organization_id=org_id,
        record_id=id,
        payload=payload,
        current_user_id=user_id,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{id}/start",
    response_model=ApiSuccess[MaintenanceRecordResponse],
    summary="Start maintenance work",
    dependencies=[Depends(require_permission("maintenance.update"))],
)
async def start_maintenance_record_endpoint(
    id: UUID,
    payload: MaintenanceRecordStart,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[MaintenanceRecordResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await start_maintenance_record(
        session=session,
        organization_id=org_id,
        record_id=id,
        payload=payload,
        current_user_id=user_id,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{id}/complete",
    response_model=ApiSuccess[MaintenanceRecordResponse],
    summary="Complete maintenance work",
    dependencies=[Depends(require_permission("maintenance.complete"))],
)
async def complete_maintenance_record_endpoint(
    id: UUID,
    payload: MaintenanceRecordComplete,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[MaintenanceRecordResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await complete_maintenance_record(
        session=session,
        organization_id=org_id,
        record_id=id,
        payload=payload,
        current_user_id=user_id,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{id}/cancel",
    response_model=ApiSuccess[MaintenanceRecordResponse],
    summary="Cancel maintenance record",
    dependencies=[Depends(require_permission("maintenance.delete"))],
)
async def cancel_maintenance_record_endpoint(
    id: UUID,
    payload: MaintenanceRecordAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[MaintenanceRecordResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await cancel_maintenance_record(
        session=session,
        organization_id=org_id,
        record_id=id,
        payload=payload,
        current_user_id=user_id,
    )
    return ApiSuccess(data=data)
