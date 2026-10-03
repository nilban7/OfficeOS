from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import require_permission
from app.schemas.common import ApiSuccess
from app.schemas.organization import (
    BranchCreate,
    BranchResponse,
    BranchUpdate,
    MemberAddRequest,
    MemberResponse,
    MemberUpdateRequest,
    OrganizationProfileResponse,
    OrganizationProfileUpdate,
    OrganizationSettingsResponse,
    OrganizationSettingsUpdate,
    RoleResponse,
)
from app.services.identity import get_profile
from app.services.organization import (
    add_member_by_email,
    create_branch,
    deactivate_branch,
    get_branch,
    get_organization_profile,
    get_organization_settings,
    list_branches,
    list_members,
    list_roles,
    remove_member,
    update_branch,
    update_member,
    update_organization_profile,
    update_organization_settings,
)

router = APIRouter(prefix="/organizations", tags=["organizations"])


def get_ip_address(request: Request) -> str | None:
    return request.client.host if request.client else None


async def get_actor_profile_id(session: AsyncSession, user: AuthenticatedUser) -> UUID | None:
    profile = await get_profile(session, user)
    return profile.id if profile else None


# --- Organization Profile & Settings ---


@router.get(
    "/current",
    response_model=ApiSuccess[OrganizationProfileResponse],
    summary="Get current organization profile",
)
async def get_current_organization(
    session: Annotated[AsyncSession, Depends(require_permission("organizations.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[OrganizationProfileResponse]:
    org_id = UUID(organization_header)
    org = await get_organization_profile(session, org_id)
    return ApiSuccess(data=OrganizationProfileResponse.model_validate(org))


@router.patch(
    "/current",
    response_model=ApiSuccess[OrganizationProfileResponse],
    summary="Update current organization profile",
)
async def update_current_organization(
    data: OrganizationProfileUpdate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("organizations.update"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[OrganizationProfileResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    org = await update_organization_profile(session, org_id, data, actor_id, ip)
    return ApiSuccess(data=OrganizationProfileResponse.model_validate(org))


@router.get(
    "/current/settings",
    response_model=ApiSuccess[OrganizationSettingsResponse],
    summary="Get current organization settings",
)
async def get_current_settings(
    session: Annotated[AsyncSession, Depends(require_permission("organizations.settings_manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[OrganizationSettingsResponse]:
    org_id = UUID(organization_header)
    settings = await get_organization_settings(session, org_id)
    return ApiSuccess(data=OrganizationSettingsResponse.model_validate(settings))


@router.patch(
    "/current/settings",
    response_model=ApiSuccess[OrganizationSettingsResponse],
    summary="Update current organization settings",
)
async def update_current_settings(
    data: OrganizationSettingsUpdate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("organizations.settings_manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[OrganizationSettingsResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    settings = await update_organization_settings(session, org_id, data, actor_id, ip)
    return ApiSuccess(data=OrganizationSettingsResponse.model_validate(settings))


# --- Branches ---


@router.get(
    "/current/branches",
    response_model=ApiSuccess[list[BranchResponse]],
    summary="List organization branches",
)
async def list_organization_branches(
    session: Annotated[AsyncSession, Depends(require_permission("branches.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    include_inactive: bool = Query(False, description="Include inactive branches"),
) -> ApiSuccess[list[BranchResponse]]:
    org_id = UUID(organization_header)
    branches = await list_branches(session, org_id, include_inactive=include_inactive)
    return ApiSuccess(data=[BranchResponse.model_validate(b) for b in branches])


@router.post(
    "/current/branches",
    response_model=ApiSuccess[BranchResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new branch",
)
async def create_organization_branch(
    data: BranchCreate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("branches.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[BranchResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    branch = await create_branch(session, org_id, data, actor_id, ip)
    return ApiSuccess(data=BranchResponse.model_validate(branch))


@router.get(
    "/current/branches/{branch_id}",
    response_model=ApiSuccess[BranchResponse],
    summary="Get branch details",
)
async def get_organization_branch(
    branch_id: UUID,
    session: Annotated[AsyncSession, Depends(require_permission("branches.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[BranchResponse]:
    org_id = UUID(organization_header)
    branch = await get_branch(session, org_id, branch_id)
    return ApiSuccess(data=BranchResponse.model_validate(branch))


@router.patch(
    "/current/branches/{branch_id}",
    response_model=ApiSuccess[BranchResponse],
    summary="Update branch details",
)
async def update_organization_branch(
    branch_id: UUID,
    data: BranchUpdate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("branches.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[BranchResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    branch = await update_branch(session, org_id, branch_id, data, actor_id, ip)
    return ApiSuccess(data=BranchResponse.model_validate(branch))


@router.delete(
    "/current/branches/{branch_id}",
    response_model=ApiSuccess[BranchResponse],
    summary="Deactivate branch (soft delete)",
)
async def delete_organization_branch(
    branch_id: UUID,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("branches.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[BranchResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    branch = await deactivate_branch(session, org_id, branch_id, actor_id, ip)
    return ApiSuccess(
        data=BranchResponse.model_validate(branch),
        message="Branch deactivated successfully",
    )


# --- Roles ---


@router.get(
    "/current/roles",
    response_model=ApiSuccess[list[RoleResponse]],
    summary="List available organization roles",
)
async def list_organization_roles(
    session: Annotated[AsyncSession, Depends(require_permission("roles.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[list[RoleResponse]]:
    org_id = UUID(organization_header)
    roles = await list_roles(session, org_id)
    return ApiSuccess(data=[RoleResponse.model_validate(r) for r in roles])


# --- Members ---


@router.get(
    "/current/members",
    response_model=ApiSuccess[list[MemberResponse]],
    summary="List organization members",
)
async def list_organization_members(
    session: Annotated[AsyncSession, Depends(require_permission("members.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[list[MemberResponse]]:
    org_id = UUID(organization_header)
    members = await list_members(session, org_id)
    return ApiSuccess(data=[MemberResponse.model_validate(m) for m in members])


@router.post(
    "/current/members",
    response_model=ApiSuccess[MemberResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Add member by registered email",
)
async def add_organization_member(
    data: MemberAddRequest,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("members.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[MemberResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    member = await add_member_by_email(session, org_id, data, actor_id, ip)
    return ApiSuccess(data=MemberResponse.model_validate(member))


@router.patch(
    "/current/members/{membership_id}",
    response_model=ApiSuccess[MemberResponse],
    summary="Update member roles or status",
)
async def update_organization_member(
    membership_id: UUID,
    data: MemberUpdateRequest,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("members.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[MemberResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    member = await update_member(session, org_id, membership_id, data, actor_id, ip)
    return ApiSuccess(data=MemberResponse.model_validate(member))


@router.delete(
    "/current/members/{membership_id}",
    response_model=ApiSuccess[dict[str, Any]],
    summary="Remove member from organization",
)
async def delete_organization_member(
    membership_id: UUID,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("members.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[dict[str, Any]]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    await remove_member(session, org_id, membership_id, actor_id, ip)
    return ApiSuccess(
        data={"membership_id": str(membership_id)},
        message="Member removed successfully",
    )


