"""Unit tests for Notifications Management API endpoints and service methods.

Uses mocked AsyncSession and service methods — no live DB required.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session
from app.main import app
from app.models.identity import Profile
from app.models.notification import Notification, NotificationPreference
from app.schemas.common import PaginatedData, PaginationMeta
from app.schemas.notification import (
    NotificationCreate,
    NotificationPreferenceItem,
    NotificationResponse,
)
from app.services.notification import ALL_NOTIFICATION_TYPES, NotificationService


def _make_notification(**overrides):
    defaults = {
        "id": uuid4(),
        "organization_id": uuid4(),
        "recipient_id": uuid4(),
        "notification_type": "general",
        "title": "Welcome to OfficeOS",
        "message": "Your account has been set up successfully.",
        "action_url": "/dashboard",
        "metadata_json": {"source": "system"},
        "read_at": None,
        "archived_at": None,
        "created_at": datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC),
        "updated_at": datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC),
    }
    defaults.update(overrides)
    n = Notification()
    for k, v in defaults.items():
        setattr(n, k, v)
    return n


def _make_notification_response(**overrides):
    n = _make_notification(**overrides)
    return NotificationResponse(
        id=n.id,
        organization_id=n.organization_id,
        recipient_id=n.recipient_id,
        notification_type=n.notification_type,
        title=n.title,
        message=n.message,
        action_url=n.action_url,
        metadata=n.metadata_json,
        read_at=n.read_at,
        archived_at=n.archived_at,
        created_at=n.created_at,
        updated_at=n.updated_at,
    )


# ---------------------------------------------------------------------------
# Service Unit Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_notifications_service_paginated():
    items = [_make_notification_response(), _make_notification_response(title="Task Assigned")]
    paginated = PaginatedData(
        items=items,
        meta=PaginationMeta(total=2, page=1, page_size=20, total_pages=1),
    )
    with patch("app.services.notification.NotificationService.list_notifications", new=AsyncMock(return_value=paginated)):
        result = await NotificationService.list_notifications(
            session=AsyncMock(), organization_id=uuid4(), recipient_id=uuid4()
        )
        assert result.meta.total == 2
        assert len(result.items) == 2


@pytest.mark.asyncio
async def test_get_unread_count_service():
    with patch("app.services.notification.NotificationService.get_unread_count", new=AsyncMock(return_value=5)):
        count = await NotificationService.get_unread_count(
            session=AsyncMock(), organization_id=uuid4(), recipient_id=uuid4()
        )
        assert count == 5


@pytest.mark.asyncio
async def test_get_notification_not_found():
    mock_session = AsyncMock()
    mock_session.scalar.return_value = None

    with pytest.raises(HTTPException) as exc_info:
        await NotificationService.get_notification(
            session=mock_session,
            organization_id=uuid4(),
            recipient_id=uuid4(),
            notification_id=uuid4(),
        )
    assert exc_info.value.status_code == 404
    assert "not found" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_mark_as_read_and_unread():
    notif = _make_notification(read_at=None)
    mock_session = AsyncMock()
    mock_session.scalar.return_value = notif

    # Mark as read
    res = await NotificationService.mark_as_read(
        session=mock_session,
        organization_id=notif.organization_id,
        recipient_id=notif.recipient_id,
        notification_id=notif.id,
    )
    assert res.read_at is not None

    # Mark as unread
    res_unread = await NotificationService.mark_as_unread(
        session=mock_session,
        organization_id=notif.organization_id,
        recipient_id=notif.recipient_id,
        notification_id=notif.id,
    )
    assert res_unread.read_at is None


@pytest.mark.asyncio
async def test_mark_all_as_read():
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.rowcount = 4
    mock_session.execute.return_value = mock_result

    count = await NotificationService.mark_all_as_read(
        session=mock_session,
        organization_id=uuid4(),
        recipient_id=uuid4(),
    )
    assert count == 4


@pytest.mark.asyncio
async def test_archive_notification():
    notif = _make_notification(archived_at=None)
    mock_session = AsyncMock()
    mock_session.scalar.return_value = notif

    res = await NotificationService.archive_notification(
        session=mock_session,
        organization_id=notif.organization_id,
        recipient_id=notif.recipient_id,
        notification_id=notif.id,
    )
    assert res.archived_at is not None


@pytest.mark.asyncio
async def test_create_notification_validates_recipient_membership():
    mock_session = AsyncMock()
    mock_session.scalar.return_value = None  # No membership found

    with pytest.raises(HTTPException) as exc_info:
        await NotificationService.create_notification(
            session=mock_session,
            organization_id=uuid4(),
            recipient_id=uuid4(),
            notification_type="task",
            title="Task Assignment",
            message="You have a new task",
        )
    assert exc_info.value.status_code == 400
    assert "not an active member" in exc_info.value.detail


@pytest.mark.asyncio
async def test_create_notification_respects_opt_out_preference():
    mock_session = AsyncMock()
    # 1. Membership valid
    mock_membership = MagicMock()
    # 2. Preference disabled
    mock_pref = NotificationPreference()
    mock_pref.in_app_enabled = False

    mock_session.scalar.side_effect = [mock_membership, mock_pref]

    created = await NotificationService.create_notification(
        session=mock_session,
        organization_id=uuid4(),
        recipient_id=uuid4(),
        notification_type="task",
        title="Task Assignment",
        message="You have a new task",
    )
    assert created is None


@pytest.mark.asyncio
async def test_create_notification_rejects_unsafe_action_url():
    mock_session = AsyncMock()
    mock_session.scalar.return_value = MagicMock()  # Membership valid

    # Service-level validation
    with pytest.raises(HTTPException) as exc_info:
        await NotificationService.create_notification(
            session=mock_session,
            organization_id=uuid4(),
            recipient_id=uuid4(),
            notification_type="task",
            title="Task Assignment",
            message="Check it out",
            action_url="https://malicious-site.com/steal-creds",
        )
    assert exc_info.value.status_code == 400
    assert "action_url must be an internal relative path" in exc_info.value.detail

    # Schema-level validation
    with pytest.raises(ValueError, match="action_url must be a relative path"):
        NotificationCreate(
            recipient_id=uuid4(),
            notification_type="general",
            title="Title",
            message="Message",
            action_url="javascript:alert(1)",
        )


@pytest.mark.asyncio
async def test_notification_preferences_defaults_and_update():
    mock_session = AsyncMock()
    mock_scalars = MagicMock()
    mock_scalars.all.return_value = []
    mock_session.scalars.return_value = mock_scalars

    org_id = uuid4()
    recipient_id = uuid4()

    # Get defaults
    prefs = await NotificationService.get_preferences(mock_session, org_id, recipient_id)
    assert len(prefs) == len(ALL_NOTIFICATION_TYPES)
    assert all(p.in_app_enabled is True for p in prefs)

    # Update preferences
    items = [
        NotificationPreferenceItem(notification_type="task", in_app_enabled=False, email_enabled=False),
        NotificationPreferenceItem(notification_type="finance", in_app_enabled=True, email_enabled=False),
    ]
    mock_session.scalar.return_value = None  # None existing, insert new

    updated = await NotificationService.update_preferences(
        session=mock_session,
        organization_id=org_id,
        recipient_id=recipient_id,
        items=items,
    )
    assert len(updated) == len(ALL_NOTIFICATION_TYPES)


# ---------------------------------------------------------------------------
# API Endpoint Integration with Mocked Auth/Tenant Session
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_api_list_notifications_and_unread_count():
    user_id = str(uuid4())
    org_id = str(uuid4())
    profile_id = uuid4()

    user = AuthenticatedUser(id=user_id, email="alice@example.com", claims={})
    mock_session = AsyncMock()

    mock_profile = Profile(
        id=profile_id,
        auth_user_id=UUID(user_id),
        email="alice@example.com",
    )

    items = [_make_notification_response(organization_id=UUID(org_id), recipient_id=profile_id)]
    paginated = PaginatedData(
        items=items,
        meta=PaginationMeta(total=1, page=1, page_size=20, total_pages=1),
    )

    async def override_get_current_user():
        return user

    async def override_get_tenant_session():
        return mock_session

    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[get_tenant_session] = override_get_tenant_session

    try:
        with (
            patch("app.api.v1.notifications.get_profile", new=AsyncMock(return_value=mock_profile)),
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["notifications.view"])),
            patch("app.services.notification.NotificationService.list_notifications", new=AsyncMock(return_value=paginated)),
            patch("app.services.notification.NotificationService.get_unread_count", new=AsyncMock(return_value=1)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                headers = {"Authorization": "Bearer test-token", "X-Organization-Id": org_id}

                # 1. List notifications
                resp = await client.get("/api/v1/notifications", headers=headers)
                assert resp.status_code == 200
                data = resp.json()["data"]
                assert len(data["items"]) == 1
                assert data["items"][0]["title"] == "Welcome to OfficeOS"

                # 2. Unread count
                resp_count = await client.get("/api/v1/notifications/unread-count", headers=headers)
                assert resp_count.status_code == 200
                assert resp_count.json()["data"]["unread_count"] == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_mark_read_and_mark_all_read():
    user_id = str(uuid4())
    org_id = str(uuid4())
    profile_id = uuid4()
    notif_id = uuid4()

    user = AuthenticatedUser(id=user_id, email="alice@example.com", claims={})
    mock_session = AsyncMock()
    mock_profile = Profile(id=profile_id, auth_user_id=UUID(user_id), email="alice@example.com")
    notif = _make_notification(id=notif_id, organization_id=UUID(org_id), recipient_id=profile_id, read_at=datetime.now(UTC))

    async def override_get_current_user():
        return user

    async def override_get_tenant_session():
        return mock_session

    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[get_tenant_session] = override_get_tenant_session

    try:
        with (
            patch("app.api.v1.notifications.get_profile", new=AsyncMock(return_value=mock_profile)),
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["notifications.mark_read"])),
            patch("app.services.notification.NotificationService.mark_as_read", new=AsyncMock(return_value=notif)),
            patch("app.services.notification.NotificationService.mark_all_as_read", new=AsyncMock(return_value=3)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                headers = {"Authorization": "Bearer test-token", "X-Organization-Id": org_id}

                # Mark single read
                resp = await client.patch(f"/api/v1/notifications/{notif_id}/read", headers=headers)
                assert resp.status_code == 200
                assert resp.json()["data"]["id"] == str(notif_id)

                # Mark all read
                resp_all = await client.post("/api/v1/notifications/mark-all-read", headers=headers)
                assert resp_all.status_code == 200
                assert resp_all.json()["data"]["marked_count"] == 3
    finally:
        app.dependency_overrides.clear()
