from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import require_permission
from app.schemas.common import ApiSuccess, PaginatedData
from app.schemas.notification import (
    MarkAllReadResponse,
    NotificationCreate,
    NotificationPreferenceResponse,
    NotificationPreferencesUpdate,
    NotificationResponse,
    UnreadCountResponse,
)
from app.services.identity import get_profile
from app.services.notification import NotificationService

router = APIRouter(prefix="/notifications", tags=["Notifications"])
preferences_router = APIRouter(prefix="/notification-preferences", tags=["Notification Preferences"])


async def _resolve_profile_id(session: AsyncSession, current_user: AuthenticatedUser) -> UUID:
    profile = await get_profile(session, current_user)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found",
        )
    return profile.id


# ---------------------------------------------------------------------------
# Notifications Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=ApiSuccess[PaginatedData[NotificationResponse]])
async def list_notifications(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("notifications.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
    status_filter: str = Query("active", alias="status"),
    notification_type: str | None = Query(None),
) -> ApiSuccess[PaginatedData[NotificationResponse]]:
    """List notifications for the authenticated user in the current tenant."""
    org_id = UUID(organization_header)
    recipient_id = await _resolve_profile_id(session, current_user)

    data = await NotificationService.list_notifications(
        session=session,
        organization_id=org_id,
        recipient_id=recipient_id,
        page=page,
        page_size=page_size,
        unread_only=unread_only,
        status_filter=status_filter,
        notification_type=notification_type,
    )
    return ApiSuccess(data=data)


@router.get("/unread-count", response_model=ApiSuccess[UnreadCountResponse])
async def get_unread_count(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("notifications.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[UnreadCountResponse]:
    """Get the unread notification count for the authenticated user in the current tenant."""
    org_id = UUID(organization_header)
    recipient_id = await _resolve_profile_id(session, current_user)

    count = await NotificationService.get_unread_count(session, org_id, recipient_id)
    return ApiSuccess(data=UnreadCountResponse(unread_count=count))


@router.get("/{notification_id}", response_model=ApiSuccess[NotificationResponse])
async def get_notification(
    notification_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("notifications.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[NotificationResponse]:
    """Retrieve details for a specific notification owned by the user."""
    org_id = UUID(organization_header)
    recipient_id = await _resolve_profile_id(session, current_user)

    item = await NotificationService.get_notification(
        session, org_id, recipient_id, notification_id
    )
    return ApiSuccess(data=NotificationResponse.model_validate(item))


@router.patch("/{notification_id}/read", response_model=ApiSuccess[NotificationResponse])
async def mark_as_read(
    notification_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("notifications.mark_read"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[NotificationResponse]:
    """Mark a notification as read."""
    org_id = UUID(organization_header)
    recipient_id = await _resolve_profile_id(session, current_user)

    item = await NotificationService.mark_as_read(
        session, org_id, recipient_id, notification_id
    )
    await session.commit()
    return ApiSuccess(data=NotificationResponse.model_validate(item))


@router.patch("/{notification_id}/unread", response_model=ApiSuccess[NotificationResponse])
async def mark_as_unread(
    notification_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("notifications.mark_read"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[NotificationResponse]:
    """Mark a notification as unread."""
    org_id = UUID(organization_header)
    recipient_id = await _resolve_profile_id(session, current_user)

    item = await NotificationService.mark_as_unread(
        session, org_id, recipient_id, notification_id
    )
    await session.commit()
    return ApiSuccess(data=NotificationResponse.model_validate(item))


@router.post("/mark-all-read", response_model=ApiSuccess[MarkAllReadResponse])
async def mark_all_as_read(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("notifications.mark_read"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[MarkAllReadResponse]:
    """Mark all unread notifications as read for the authenticated user in the current tenant."""
    org_id = UUID(organization_header)
    recipient_id = await _resolve_profile_id(session, current_user)

    count = await NotificationService.mark_all_as_read(session, org_id, recipient_id)
    await session.commit()
    return ApiSuccess(data=MarkAllReadResponse(marked_count=count))


@router.delete("/{notification_id}", response_model=ApiSuccess[NotificationResponse])
async def delete_notification(
    notification_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("notifications.mark_read"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[NotificationResponse]:
    """Archive (soft-delete) a notification owned by the user."""
    org_id = UUID(organization_header)
    recipient_id = await _resolve_profile_id(session, current_user)

    item = await NotificationService.archive_notification(
        session, org_id, recipient_id, notification_id
    )
    await session.commit()
    return ApiSuccess(data=NotificationResponse.model_validate(item))


@router.post("", response_model=ApiSuccess[NotificationResponse | None], status_code=status.HTTP_201_CREATED)
async def create_notification(
    payload: NotificationCreate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("notifications.create"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[NotificationResponse | None]:
    """Administratively or manually create a notification for an active member in this organization."""
    org_id = UUID(organization_header)
    actor_id = await _resolve_profile_id(session, current_user)
    ip_address = request.client.host if request.client else None

    item = await NotificationService.create_notification(
        session=session,
        organization_id=org_id,
        recipient_id=payload.recipient_id,
        notification_type=payload.notification_type,
        title=payload.title,
        message=payload.message,
        action_url=payload.action_url,
        metadata=payload.metadata,
        actor_id=actor_id,
        ip_address=ip_address,
    )
    await session.commit()
    return ApiSuccess(
        data=NotificationResponse.model_validate(item) if item is not None else None
    )


# ---------------------------------------------------------------------------
# Notification Preferences Endpoints
# ---------------------------------------------------------------------------


@preferences_router.get("", response_model=ApiSuccess[list[NotificationPreferenceResponse]])
async def get_preferences(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("notifications.preferences"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[list[NotificationPreferenceResponse]]:
    """Retrieve notification preferences for the authenticated user in the current tenant."""
    org_id = UUID(organization_header)
    recipient_id = await _resolve_profile_id(session, current_user)

    prefs = await NotificationService.get_preferences(session, org_id, recipient_id)
    return ApiSuccess(data=prefs)


@preferences_router.patch("", response_model=ApiSuccess[list[NotificationPreferenceResponse]])
async def update_preferences(
    payload: NotificationPreferencesUpdate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("notifications.preferences"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[list[NotificationPreferenceResponse]]:
    """Update notification preferences for the authenticated user in the current tenant."""
    org_id = UUID(organization_header)
    recipient_id = await _resolve_profile_id(session, current_user)
    ip_address = request.client.host if request.client else None

    prefs = await NotificationService.update_preferences(
        session=session,
        organization_id=org_id,
        recipient_id=recipient_id,
        items=payload.preferences,
        actor_id=recipient_id,
        ip_address=ip_address,
    )
    await session.commit()
    return ApiSuccess(data=prefs)
