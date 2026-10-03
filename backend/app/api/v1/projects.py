from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import require_permission
from app.schemas.common import ApiSuccess, PaginatedData
from app.schemas.project import (
    ProjectCreate,
    ProjectDetailResponse,
    ProjectMemberCreate,
    ProjectMemberResponse,
    ProjectMemberUpdate,
    ProjectResponse,
    ProjectUpdate,
)
from app.services.identity import get_profile
from app.services.project import (
    add_project_member,
    archive_project,
    create_project,
    delete_project_member,
    get_project,
    list_project_members,
    list_projects,
    update_project,
    update_project_member,
)

router = APIRouter(prefix="/projects", tags=["projects"])


def get_ip_address(request: Request) -> str | None:
    return request.client.host if request.client else None


async def get_actor_profile_id(session: AsyncSession, user: AuthenticatedUser) -> UUID | None:
    profile = await get_profile(session, user)
    return profile.id if profile else None


# ==========================================
# Project Endpoints
# ==========================================
@router.get(
    "",
    response_model=ApiSuccess[PaginatedData[ProjectResponse]],
    summary="List organization projects",
)
async def list_org_projects(
    session: Annotated[AsyncSession, Depends(require_permission("projects.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    search: Annotated[str | None, Query(description="Search term (code, name, description)")] = None,
    status: Annotated[str | None, Query(description="Filter by project status")] = None,
    client_id: Annotated[UUID | None, Query(description="Filter by client ID")] = None,
    project_manager_id: Annotated[UUID | None, Query(description="Filter by project manager employee ID")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Page size")] = 50,
    sort_by: Annotated[str, Query(description="Field to sort by")] = "created_at",
    sort_order: Annotated[str, Query(description="asc or desc")] = "desc",
) -> ApiSuccess[PaginatedData[ProjectResponse]]:
    org_id = UUID(organization_header)
    data = await list_projects(
        session=session,
        organization_id=org_id,
        search=search,
        status_filter=status,
        client_id=client_id,
        project_manager_id=project_manager_id,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return ApiSuccess(data=data)


@router.post(
    "",
    response_model=ApiSuccess[ProjectDetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new project",
)
async def create_org_project(
    data: ProjectCreate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("projects.create"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ProjectDetailResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    project = await create_project(
        session=session,
        organization_id=org_id,
        data=data,
        actor_id=actor_id,
        ip_address=ip,
    )
    return ApiSuccess(data=project)


@router.get(
    "/{project_id}",
    response_model=ApiSuccess[ProjectDetailResponse],
    summary="Get single project details with members",
)
async def get_org_project(
    project_id: UUID,
    session: Annotated[AsyncSession, Depends(require_permission("projects.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ProjectDetailResponse]:
    org_id = UUID(organization_header)
    project = await get_project(session=session, organization_id=org_id, project_id=project_id)
    return ApiSuccess(data=project)


@router.patch(
    "/{project_id}",
    response_model=ApiSuccess[ProjectDetailResponse],
    summary="Update project details",
)
async def update_org_project(
    project_id: UUID,
    data: ProjectUpdate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("projects.update"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ProjectDetailResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    project = await update_project(
        session=session,
        organization_id=org_id,
        project_id=project_id,
        data=data,
        actor_id=actor_id,
        ip_address=ip,
    )
    return ApiSuccess(data=project)


@router.delete(
    "/{project_id}",
    response_model=ApiSuccess[ProjectDetailResponse],
    summary="Archive/Cancel project",
)
async def archive_org_project(
    project_id: UUID,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("projects.delete"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ProjectDetailResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    project = await archive_project(
        session=session,
        organization_id=org_id,
        project_id=project_id,
        actor_id=actor_id,
        ip_address=ip,
    )
    return ApiSuccess(data=project, message="Project cancelled successfully")


# ==========================================
# Project Members Endpoints
# ==========================================
@router.get(
    "/{project_id}/members",
    response_model=ApiSuccess[list[ProjectMemberResponse]],
    summary="List members allocated to a project",
)
async def list_org_project_members(
    project_id: UUID,
    session: Annotated[AsyncSession, Depends(require_permission("project_members.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[list[ProjectMemberResponse]]:
    org_id = UUID(organization_header)
    members = await list_project_members(
        session=session,
        organization_id=org_id,
        project_id=project_id,
    )
    return ApiSuccess(data=members)


@router.post(
    "/{project_id}/members",
    response_model=ApiSuccess[ProjectMemberResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Add an employee member to a project",
)
async def add_org_project_member(
    project_id: UUID,
    data: ProjectMemberCreate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("project_members.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ProjectMemberResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    member = await add_project_member(
        session=session,
        organization_id=org_id,
        project_id=project_id,
        data=data,
        actor_id=actor_id,
        ip_address=ip,
    )
    return ApiSuccess(data=member)


@router.patch(
    "/{project_id}/members/{member_id}",
    response_model=ApiSuccess[ProjectMemberResponse],
    summary="Update project member allocation or role",
)
async def update_org_project_member(
    project_id: UUID,
    member_id: UUID,
    data: ProjectMemberUpdate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("project_members.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ProjectMemberResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    member = await update_project_member(
        session=session,
        organization_id=org_id,
        project_id=project_id,
        member_id=member_id,
        data=data,
        actor_id=actor_id,
        ip_address=ip,
    )
    return ApiSuccess(data=member)


@router.delete(
    "/{project_id}/members/{member_id}",
    response_model=ApiSuccess[dict[str, bool]],
    summary="Remove a member from a project",
)
async def remove_org_project_member(
    project_id: UUID,
    member_id: UUID,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("project_members.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[dict[str, bool]]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    await delete_project_member(
        session=session,
        organization_id=org_id,
        project_id=project_id,
        member_id=member_id,
        actor_id=actor_id,
        ip_address=ip,
    )
    return ApiSuccess(data={"deleted": True}, message="Project member removed successfully")
