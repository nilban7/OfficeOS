from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import require_permission
from app.schemas.common import ApiSuccess, PaginatedData
from app.schemas.employee import (
    EmployeeCreate,
    EmployeeDetailResponse,
    EmployeeListItemResponse,
    EmployeeUpdate,
    ManagerOptionResponse,
)
from app.services.employee import (
    create_employee,
    deactivate_employee,
    get_employee,
    list_employees,
    list_manager_options,
    update_employee,
)
from app.services.identity import get_profile

router = APIRouter(prefix="/employees", tags=["employees"])


def get_ip_address(request: Request) -> str | None:
    return request.client.host if request.client else None


async def get_actor_profile_id(session: AsyncSession, user: AuthenticatedUser) -> UUID | None:
    profile = await get_profile(session, user)
    return profile.id if profile else None


@router.get(
    "",
    response_model=ApiSuccess[PaginatedData[EmployeeListItemResponse]],
    summary="List organization employees",
)
async def list_org_employees(
    session: Annotated[AsyncSession, Depends(require_permission("employees.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    search: Annotated[str | None, Query(description="Search by name, employee code, or email")] = None,
    department_id: Annotated[UUID | None, Query(description="Filter by department ID")] = None,
    branch_id: Annotated[UUID | None, Query(description="Filter by branch ID")] = None,
    status: Annotated[str | None, Query(description="Filter by employee lifecycle status")] = None,
    employment_type: Annotated[str | None, Query(description="Filter by employment type")] = None,
    include_inactive: Annotated[bool, Query(description="Include inactive/terminated employees")] = False,
    page: Annotated[int, Query(ge=1, description="Page number (1-indexed)")] = 1,
    page_size: Annotated[int, Query(description="Items per page (10, 20, 50, 100)")] = 20,
    sort_by: Annotated[str, Query(description="Sort field: name, employee_code, date_of_joining, created_at")] = "name",
    sort_order: Annotated[str, Query(description="Sort direction: asc or desc")] = "asc",
) -> ApiSuccess[PaginatedData[EmployeeListItemResponse]]:
    org_id = UUID(organization_header)
    data = await list_employees(
        session=session,
        organization_id=org_id,
        search=search,
        department_id=department_id,
        branch_id=branch_id,
        status_filter=status,
        employment_type=employment_type,
        include_inactive=include_inactive,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return ApiSuccess(data=data)


@router.post(
    "",
    response_model=ApiSuccess[EmployeeDetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new employee",
)
async def create_org_employee(
    data: EmployeeCreate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("employees.create"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[EmployeeDetailResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    emp = await create_employee(session, org_id, data, actor_id, ip)
    return ApiSuccess(data=emp)


@router.get(
    "/managers",
    response_model=ApiSuccess[list[ManagerOptionResponse]],
    summary="List eligible reporting managers",
)
async def list_eligible_managers(
    session: Annotated[AsyncSession, Depends(require_permission("employees.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[list[ManagerOptionResponse]]:
    org_id = UUID(organization_header)
    managers = await list_manager_options(session, org_id)
    return ApiSuccess(data=managers)


@router.get(
    "/{employee_id}",
    response_model=ApiSuccess[EmployeeDetailResponse],
    summary="Get employee details",
)
async def get_org_employee(
    employee_id: UUID,
    session: Annotated[AsyncSession, Depends(require_permission("employees.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[EmployeeDetailResponse]:
    org_id = UUID(organization_header)
    emp = await get_employee(session, org_id, employee_id)
    return ApiSuccess(data=emp)


@router.patch(
    "/{employee_id}",
    response_model=ApiSuccess[EmployeeDetailResponse],
    summary="Update employee details",
)
async def update_org_employee(
    employee_id: UUID,
    data: EmployeeUpdate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("employees.update"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[EmployeeDetailResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    emp = await update_employee(session, org_id, employee_id, data, actor_id, ip)
    return ApiSuccess(data=emp)


@router.delete(
    "/{employee_id}",
    response_model=ApiSuccess[EmployeeDetailResponse],
    summary="Deactivate employee (soft delete / terminate)",
)
async def delete_org_employee(
    employee_id: UUID,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("employees.delete"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[EmployeeDetailResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    emp = await deactivate_employee(session, org_id, employee_id, actor_id, ip)
    return ApiSuccess(
        data=emp,
        message="Employee deactivated successfully",
    )
