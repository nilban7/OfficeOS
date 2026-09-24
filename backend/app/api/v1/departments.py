from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import require_permission
from app.schemas.common import ApiSuccess
from app.schemas.employee import DepartmentCreate, DepartmentResponse, DepartmentUpdate
from app.services.employee import (
    create_department,
    deactivate_department,
    get_department,
    list_departments,
    update_department,
)
from app.services.identity import get_profile

router = APIRouter(prefix="/departments", tags=["departments"])


def get_ip_address(request: Request) -> str | None:
    return request.client.host if request.client else None


async def get_actor_profile_id(session: AsyncSession, user: AuthenticatedUser) -> UUID | None:
    profile = await get_profile(session, user)
    return profile.id if profile else None


@router.get(
    "",
    response_model=ApiSuccess[list[DepartmentResponse]],
    summary="List organization departments",
)
async def list_org_departments(
    session: Annotated[AsyncSession, Depends(require_permission("departments.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    include_inactive: Annotated[bool, Query(description="Include inactive departments")] = False,
) -> ApiSuccess[list[DepartmentResponse]]:
    org_id = UUID(organization_header)
    departments = await list_departments(session, org_id, include_inactive=include_inactive)
    return ApiSuccess(data=departments)


@router.post(
    "",
    response_model=ApiSuccess[DepartmentResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new department",
)
async def create_org_department(
    data: DepartmentCreate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("departments.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[DepartmentResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    dept = await create_department(session, org_id, data, actor_id, ip)
    return ApiSuccess(data=dept)


@router.get(
    "/{department_id}",
    response_model=ApiSuccess[DepartmentResponse],
    summary="Get department details",
)
async def get_org_department(
    department_id: UUID,
    session: Annotated[AsyncSession, Depends(require_permission("departments.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[DepartmentResponse]:
    org_id = UUID(organization_header)
    dept = await get_department(session, org_id, department_id)
    return ApiSuccess(data=dept)


@router.patch(
    "/{department_id}",
    response_model=ApiSuccess[DepartmentResponse],
    summary="Update department details",
)
async def update_org_department(
    department_id: UUID,
    data: DepartmentUpdate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("departments.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[DepartmentResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    dept = await update_department(session, org_id, department_id, data, actor_id, ip)
    return ApiSuccess(data=dept)


@router.delete(
    "/{department_id}",
    response_model=ApiSuccess[DepartmentResponse],
    summary="Deactivate department (soft delete)",
)
async def delete_org_department(
    department_id: UUID,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("departments.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[DepartmentResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    dept = await deactivate_department(session, org_id, department_id, actor_id, ip)
    return ApiSuccess(
        data=dept,
        message="Department deactivated successfully",
    )
