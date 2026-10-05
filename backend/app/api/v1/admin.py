from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.saas import get_saas_admin_session, require_system_admin
from app.schemas.audit import AuditLogResponse
from app.schemas.common import ApiSuccess
from app.schemas.saas import (
    OrganizationCreateRequest,
    OrganizationDetailResponse,
    OrganizationDirectoryResponse,
    OrganizationSuspendRequest,
    OrganizationUpdateRequest,
    PlatformAnnouncementCreate,
    PlatformAnnouncementResponse,
    PlatformAnnouncementUpdate,
    PlatformConfigurationResponse,
    PlatformConfigurationUpdate,
    PlatformHealthResponse,
    PlatformMembersResponse,
    PlatformOverviewResponse,
    PlatformUsageResponse,
)
from app.services.identity import get_profile
from app.services.saas import SaaSAdminService

router = APIRouter(prefix="/admin", tags=["saas-admin"])


def get_ip_address(request: Request) -> str | None:
    return request.client.host if request.client else None


# --- Overview ---


@router.get(
    "/overview",
    response_model=ApiSuccess[PlatformOverviewResponse],
    summary="Get platform administration overview metrics",
)
async def get_platform_overview(
    session: Annotated[AsyncSession, Depends(get_saas_admin_session)],
) -> ApiSuccess[PlatformOverviewResponse]:
    data = await SaaSAdminService.get_overview(session)
    return ApiSuccess(data=data)


# --- Organization Directory & Lifecycle ---


@router.get(
    "/organizations",
    response_model=ApiSuccess[OrganizationDirectoryResponse],
    summary="List organizations across the SaaS platform",
)
async def list_organizations(
    session: Annotated[AsyncSession, Depends(get_saas_admin_session)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    search: Annotated[str | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
) -> ApiSuccess[OrganizationDirectoryResponse]:
    data = await SaaSAdminService.list_organizations(
        session=session,
        page=page,
        page_size=page_size,
        search=search,
        status_filter=status,
    )
    return ApiSuccess(data=data)


@router.post(
    "/organizations",
    response_model=ApiSuccess[OrganizationDetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new organization in the SaaS platform",
)
async def create_organization(
    data: OrganizationCreateRequest,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(require_system_admin)],
    session: Annotated[AsyncSession, Depends(get_saas_admin_session)],
) -> ApiSuccess[OrganizationDetailResponse]:
    actor = await get_profile(session, current_user)
    result = await SaaSAdminService.create_organization(
        session=session,
        name=data.name,
        slug=data.slug,
        timezone=data.timezone,
        currency=data.currency,
        actor_id=actor.id if actor else None,
        ip_address=get_ip_address(request),
    )
    return ApiSuccess(data=result, message="Organization created successfully")


@router.patch(
    "/organizations/{organization_id}",
    response_model=ApiSuccess[OrganizationDetailResponse],
    summary="Update organization details",
)
async def update_organization(
    organization_id: UUID,
    data: OrganizationUpdateRequest,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(require_system_admin)],
    session: Annotated[AsyncSession, Depends(get_saas_admin_session)],
) -> ApiSuccess[OrganizationDetailResponse]:
    actor = await get_profile(session, current_user)
    result = await SaaSAdminService.update_organization(
        session=session,
        org_id=organization_id,
        name=data.name,
        slug=data.slug,
        is_active=data.is_active,
        actor_id=actor.id if actor else None,
        ip_address=get_ip_address(request),
    )
    return ApiSuccess(data=result, message="Organization updated successfully")


@router.delete(
    "/organizations/{organization_id}",
    response_model=ApiSuccess[None],
    summary="Delete an organization",
)
async def delete_organization(
    organization_id: UUID,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(require_system_admin)],
    session: Annotated[AsyncSession, Depends(get_saas_admin_session)],
) -> ApiSuccess[None]:
    actor = await get_profile(session, current_user)
    await SaaSAdminService.delete_organization(
        session=session,
        org_id=organization_id,
        actor_id=actor.id if actor else None,
        ip_address=get_ip_address(request),
    )
    return ApiSuccess(data=None, message="Organization removed successfully")


@router.get(
    "/organizations/{organization_id}",
    response_model=ApiSuccess[OrganizationDetailResponse],
    summary="Get detailed information for a specific organization",
)
async def get_organization_detail(
    organization_id: UUID,
    session: Annotated[AsyncSession, Depends(get_saas_admin_session)],
) -> ApiSuccess[OrganizationDetailResponse]:
    data = await SaaSAdminService.get_organization_detail(session, organization_id)
    return ApiSuccess(data=data)


@router.post(
    "/organizations/{organization_id}/suspend",
    response_model=ApiSuccess[OrganizationDetailResponse],
    summary="Suspend an organization preventing normal tenant operations",
)
async def suspend_organization(
    organization_id: UUID,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(require_system_admin)],
    session: Annotated[AsyncSession, Depends(get_saas_admin_session)],
    body: OrganizationSuspendRequest | None = None,
) -> ApiSuccess[OrganizationDetailResponse]:
    actor = await get_profile(session, current_user)
    reason = body.reason if body else None
    data = await SaaSAdminService.suspend_organization(
        session=session,
        org_id=organization_id,
        reason=reason,
        actor_id=actor.id if actor else None,
        ip_address=get_ip_address(request),
    )
    return ApiSuccess(data=data, message="Organization suspended successfully")


@router.post(
    "/organizations/{organization_id}/activate",
    response_model=ApiSuccess[OrganizationDetailResponse],
    summary="Activate an organization",
)
async def activate_organization(
    organization_id: UUID,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(require_system_admin)],
    session: Annotated[AsyncSession, Depends(get_saas_admin_session)],
) -> ApiSuccess[OrganizationDetailResponse]:
    actor = await get_profile(session, current_user)
    data = await SaaSAdminService.activate_organization(
        session=session,
        org_id=organization_id,
        actor_id=actor.id if actor else None,
        ip_address=get_ip_address(request),
    )
    return ApiSuccess(data=data, message="Organization activated successfully")


@router.post(
    "/organizations/{organization_id}/restore",
    response_model=ApiSuccess[OrganizationDetailResponse],
    summary="Restore a suspended organization to active status",
)
async def restore_organization(
    organization_id: UUID,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(require_system_admin)],
    session: Annotated[AsyncSession, Depends(get_saas_admin_session)],
) -> ApiSuccess[OrganizationDetailResponse]:
    actor = await get_profile(session, current_user)
    data = await SaaSAdminService.restore_organization(
        session=session,
        org_id=organization_id,
        actor_id=actor.id if actor else None,
        ip_address=get_ip_address(request),
    )
    return ApiSuccess(data=data, message="Organization restored successfully")


# --- Platform Members ---


@router.get(
    "/members",
    response_model=ApiSuccess[PlatformMembersResponse],
    summary="List all memberships across the platform",
)
async def list_platform_members(
    session: Annotated[AsyncSession, Depends(get_saas_admin_session)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    search: Annotated[str | None, Query()] = None,
    organization_id: Annotated[UUID | None, Query()] = None,
) -> ApiSuccess[PlatformMembersResponse]:
    data = await SaaSAdminService.list_members(
        session=session,
        page=page,
        page_size=page_size,
        search=search,
        org_id=organization_id,
    )
    return ApiSuccess(data=data)


# --- Usage & Health ---


@router.get(
    "/usage",
    response_model=ApiSuccess[PlatformUsageResponse],
    summary="Get aggregated platform usage metrics across modules",
)
async def get_platform_usage(
    session: Annotated[AsyncSession, Depends(get_saas_admin_session)],
) -> ApiSuccess[PlatformUsageResponse]:
    data = await SaaSAdminService.get_usage_metrics(session)
    return ApiSuccess(data=data)


@router.get(
    "/health",
    response_model=ApiSuccess[PlatformHealthResponse],
    summary="Get platform health and infrastructure telemetry",
)
async def get_platform_health(
    session: Annotated[AsyncSession, Depends(get_saas_admin_session)],
) -> ApiSuccess[PlatformHealthResponse]:
    data = await SaaSAdminService.get_platform_health(session)
    return ApiSuccess(data=data)


# --- Platform Audit Logs ---


@router.get(
    "/audit-logs",
    response_model=ApiSuccess[AuditLogResponse],
    summary="Inspect cross-tenant audit activity across all organizations",
)
async def list_platform_audit_logs(
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(require_system_admin)],
    session: Annotated[AsyncSession, Depends(get_saas_admin_session)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    organization_id: Annotated[UUID | None, Query()] = None,
    action: Annotated[str | None, Query()] = None,
    actor_id: Annotated[UUID | None, Query()] = None,
    date_from: Annotated[datetime | None, Query()] = None,
    date_to: Annotated[datetime | None, Query()] = None,
) -> ApiSuccess[AuditLogResponse]:
    data = await SaaSAdminService.list_audit_logs(
        session=session,
        page=page,
        page_size=page_size,
        org_id=organization_id,
        action=action,
        actor_id=actor_id,
        date_from=date_from,
        date_to=date_to,
        actor_user=current_user,
        ip_address=get_ip_address(request),
    )
    return ApiSuccess(data=data)


# --- Platform Configuration ---


@router.get(
    "/config",
    response_model=ApiSuccess[PlatformConfigurationResponse],
    summary="Get platform configuration parameters",
)
async def get_platform_config(
    session: Annotated[AsyncSession, Depends(get_saas_admin_session)],
) -> ApiSuccess[PlatformConfigurationResponse]:
    data = await SaaSAdminService.get_platform_config(session)
    return ApiSuccess(data=data)


@router.patch(
    "/config",
    response_model=ApiSuccess[PlatformConfigurationResponse],
    summary="Update platform configuration parameters",
)
async def update_platform_config(
    body: PlatformConfigurationUpdate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(require_system_admin)],
    session: Annotated[AsyncSession, Depends(get_saas_admin_session)],
) -> ApiSuccess[PlatformConfigurationResponse]:
    actor = await get_profile(session, current_user)
    data = await SaaSAdminService.update_platform_config(
        session=session,
        data=body,
        actor_id=actor.id if actor else None,
        ip_address=get_ip_address(request),
    )
    return ApiSuccess(data=data, message="Platform configuration updated successfully")


# --- Platform Announcements ---


@router.get(
    "/announcements",
    response_model=ApiSuccess[list[PlatformAnnouncementResponse]],
    summary="List all platform announcements",
)
async def list_announcements(
    session: Annotated[AsyncSession, Depends(get_saas_admin_session)],
) -> ApiSuccess[list[PlatformAnnouncementResponse]]:
    data = await SaaSAdminService.list_announcements(session)
    return ApiSuccess(data=data)


@router.post(
    "/announcements",
    response_model=ApiSuccess[PlatformAnnouncementResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new platform announcement",
)
async def create_announcement(
    body: PlatformAnnouncementCreate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(require_system_admin)],
    session: Annotated[AsyncSession, Depends(get_saas_admin_session)],
) -> ApiSuccess[PlatformAnnouncementResponse]:
    actor = await get_profile(session, current_user)
    data = await SaaSAdminService.create_announcement(
        session=session,
        data=body,
        creator_profile_id=actor.id if actor else None,
        actor_id=actor.id if actor else None,
        ip_address=get_ip_address(request),
    )
    return ApiSuccess(data=data, message="Platform announcement created successfully")


@router.patch(
    "/announcements/{announcement_id}",
    response_model=ApiSuccess[PlatformAnnouncementResponse],
    summary="Update an existing platform announcement",
)
async def update_announcement(
    announcement_id: UUID,
    body: PlatformAnnouncementUpdate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(require_system_admin)],
    session: Annotated[AsyncSession, Depends(get_saas_admin_session)],
) -> ApiSuccess[PlatformAnnouncementResponse]:
    actor = await get_profile(session, current_user)
    data = await SaaSAdminService.update_announcement(
        session=session,
        announcement_id=announcement_id,
        data=body,
        actor_id=actor.id if actor else None,
        ip_address=get_ip_address(request),
    )
    return ApiSuccess(data=data, message="Platform announcement updated successfully")


@router.delete(
    "/announcements/{announcement_id}",
    response_model=ApiSuccess[dict[str, str]],
    summary="Delete a platform announcement",
)
async def delete_announcement(
    announcement_id: UUID,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(require_system_admin)],
    session: Annotated[AsyncSession, Depends(get_saas_admin_session)],
) -> ApiSuccess[dict[str, str]]:
    actor = await get_profile(session, current_user)
    await SaaSAdminService.delete_announcement(
        session=session,
        announcement_id=announcement_id,
        actor_id=actor.id if actor else None,
        ip_address=get_ip_address(request),
    )
    return ApiSuccess(data={"status": "deleted"}, message="Announcement deleted successfully")
