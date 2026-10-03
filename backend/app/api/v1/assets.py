from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session, require_permission
from app.schemas.asset import (
    AssetAssignmentCreate,
    AssetAssignmentListResponse,
    AssetAssignmentResponse,
    AssetCreate,
    AssetDetailResponse,
    AssetResponse,
    AssetReturnCreate,
    AssetUpdate,
)
from app.schemas.common import ApiSuccess, PaginatedData
from app.services.asset import (
    assign_asset,
    create_asset,
    delete_asset,
    get_asset,
    list_asset_assignments,
    list_assets,
    return_asset,
    update_asset,
)
from app.services.attendance import resolve_employee_for_user
from app.services.identity import get_user_permissions

router = APIRouter(prefix="/assets", tags=["Assets"])


@router.get(
    "",
    response_model=ApiSuccess[PaginatedData[AssetResponse]],
    summary="List assets",
)
async def list_assets_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    search: Annotated[str | None, Query(description="Search asset code, name, model, serial")] = None,
    category: Annotated[str | None, Query(description="Filter by category")] = None,
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by status")] = None,
    condition: Annotated[str | None, Query(description="Filter by condition")] = None,
    branch_id: Annotated[UUID | None, Query(description="Filter by branch ID")] = None,
    custodian_id: Annotated[UUID | None, Query(description="Filter by custodian employee ID")] = None,
    vendor_id: Annotated[UUID | None, Query(description="Filter by vendor ID")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Page size")] = 20,
) -> ApiSuccess[PaginatedData[AssetResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    emp = await resolve_employee_for_user(session, org_id, user_id)
    emp_id = emp.id if emp else None

    permissions = await get_user_permissions(session, current_user)
    has_org_view = bool(
        {
            "assets.view",
            "assets.create",
            "assets.update",
            "assets.delete",
            "assets.assign",
            "assets.return",
        }.intersection(permissions)
    )

    if not has_org_view and not emp:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied. You do not have access to view organization assets.",
        )

    items, meta = await list_assets(
        session=session,
        organization_id=org_id,
        search=search,
        category=category,
        status_filter=status_filter,
        condition=condition,
        branch_id=branch_id,
        custodian_id=custodian_id,
        vendor_id=vendor_id,
        page=page,
        page_size=page_size,
        requester_employee_id=emp_id,
        has_org_view=has_org_view,
    )

    return ApiSuccess(data=PaginatedData(items=items, meta=meta))


@router.post(
    "",
    response_model=ApiSuccess[AssetResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create asset",
)
async def create_asset_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("assets.create"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    payload: AssetCreate,
) -> ApiSuccess[AssetResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    emp = await resolve_employee_for_user(session, org_id, user_id)
    actor_emp_id = emp.id if emp else None

    asset = await create_asset(
        session=session,
        organization_id=org_id,
        actor_id=user_id,
        payload=payload,
        actor_employee_id=actor_emp_id,
    )
    return ApiSuccess(data=asset)


@router.get(
    "/{asset_id}",
    response_model=ApiSuccess[AssetDetailResponse],
    summary="Get asset details",
)
async def get_asset_endpoint(
    asset_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[AssetDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    emp = await resolve_employee_for_user(session, org_id, user_id)
    emp_id = emp.id if emp else None

    permissions = await get_user_permissions(session, current_user)
    has_org_view = bool(
        {
            "assets.view",
            "assets.create",
            "assets.update",
            "assets.delete",
            "assets.assign",
            "assets.return",
        }.intersection(permissions)
    )

    asset = await get_asset(session=session, organization_id=org_id, asset_id=asset_id)

    if not has_org_view and (not emp_id or asset.current_custodian_id != emp_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied. You can only view details of assets assigned to you.",
        )

    return ApiSuccess(data=asset)


@router.patch(
    "/{asset_id}",
    response_model=ApiSuccess[AssetResponse],
    summary="Update asset details",
)
async def update_asset_endpoint(
    asset_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("assets.update"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    payload: AssetUpdate,
) -> ApiSuccess[AssetResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    asset = await update_asset(
        session=session,
        organization_id=org_id,
        actor_id=user_id,
        asset_id=asset_id,
        payload=payload,
    )
    return ApiSuccess(data=asset)


@router.delete(
    "/{asset_id}",
    response_model=ApiSuccess[dict[str, str]],
    summary="Delete asset",
)
async def delete_asset_endpoint(
    asset_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("assets.delete"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[dict[str, str]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    await delete_asset(
        session=session,
        organization_id=org_id,
        actor_id=user_id,
        asset_id=asset_id,
    )
    return ApiSuccess(data={"message": "Asset deleted successfully"})


@router.get(
    "/{asset_id}/assignments",
    response_model=ApiSuccess[AssetAssignmentListResponse],
    summary="List asset assignment history",
)
async def list_asset_assignments_endpoint(
    asset_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[AssetAssignmentListResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    emp = await resolve_employee_for_user(session, org_id, user_id)
    emp_id = emp.id if emp else None

    permissions = await get_user_permissions(session, current_user)
    has_view = bool(
        {
            "assets.view",
            "assets.assign",
            "assets.return",
        }.intersection(permissions)
    )

    if not has_view and not emp_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied to view assignment history.",
        )

    items, total = await list_asset_assignments(
        session=session, organization_id=org_id, asset_id=asset_id
    )

    if not has_view and emp_id:
        # Filter assignments for employee
        items = [a for a in items if a.employee_id == emp_id]
        total = len(items)

    return ApiSuccess(data=AssetAssignmentListResponse(items=items, total=total))


@router.post(
    "/{asset_id}/assign",
    response_model=ApiSuccess[AssetAssignmentResponse],
    summary="Assign asset to an employee",
)
async def assign_asset_endpoint(
    asset_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("assets.assign"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    payload: AssetAssignmentCreate,
) -> ApiSuccess[AssetAssignmentResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    emp = await resolve_employee_for_user(session, org_id, user_id)
    actor_emp_id = emp.id if emp else None

    assignment = await assign_asset(
        session=session,
        organization_id=org_id,
        actor_id=user_id,
        asset_id=asset_id,
        payload=payload,
        actor_employee_id=actor_emp_id,
    )
    return ApiSuccess(data=assignment)


@router.post(
    "/{asset_id}/return",
    response_model=ApiSuccess[AssetAssignmentResponse],
    summary="Process asset return",
)
async def return_asset_endpoint(
    asset_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("assets.return"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    payload: AssetReturnCreate,
) -> ApiSuccess[AssetAssignmentResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    emp = await resolve_employee_for_user(session, org_id, user_id)
    actor_emp_id = emp.id if emp else None

    assignment = await return_asset(
        session=session,
        organization_id=org_id,
        actor_id=user_id,
        asset_id=asset_id,
        payload=payload,
        actor_employee_id=actor_emp_id,
    )
    return ApiSuccess(data=assignment)
