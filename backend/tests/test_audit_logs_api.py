"""Unit tests for Audit Logs Management API endpoints and service methods.

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
from app.models.audit import AuditLog
from app.models.identity import Profile
from app.schemas.audit import (
    ActorSummary,
    AuditLogResponse,
    sanitize_sensitive_data,
)
from app.schemas.common import PaginatedData, PaginationMeta
from app.services.audit import AuditLogService


def _make_profile(**overrides):
    p = Profile()
    p.id = overrides.get("id", uuid4())
    p.auth_user_id = overrides.get("auth_user_id", uuid4())
    p.email = overrides.get("email", "admin@example.com")
    p.first_name = overrides.get("first_name", "Alice")
    p.last_name = overrides.get("last_name", "Smith")
    return p


def _make_audit_log(**overrides):
    log = AuditLog()
    log.id = overrides.get("id", uuid4())
    log.organization_id = overrides.get("organization_id", uuid4())
    log.actor_id = overrides.get("actor_id", uuid4())
    log.action = overrides.get("action", "documents.create")
    log.entity_type = overrides.get("entity_type", "document")
    log.entity_id = overrides.get("entity_id", uuid4())
    log.details = overrides.get("details", {"title": "Test Doc", "version": 1})
    log.ip_address = overrides.get("ip_address", "192.168.1.100")
    log.created_at = overrides.get("created_at", datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC))
    log.actor = overrides.get("actor", _make_profile(id=log.actor_id))
    return log


def _make_audit_log_response(**overrides):
    log = _make_audit_log(**overrides)
    actor_summary = None
    if log.actor:
        actor_summary = ActorSummary(
            id=log.actor.id,
            email=log.actor.email,
            first_name=log.actor.first_name,
            last_name=log.actor.last_name,
        )
    return AuditLogResponse(
        id=log.id,
        organization_id=log.organization_id,
        actor_id=log.actor_id,
        actor=actor_summary,
        action=log.action,
        entity_type=log.entity_type,
        entity_id=log.entity_id,
        details=log.details or {},
        ip_address=log.ip_address,
        created_at=log.created_at,
    )


# ---------------------------------------------------------------------------
# Unit tests for Sensitive Data Sanitizer
# ---------------------------------------------------------------------------


def test_sensitive_data_sanitization():
    raw = {
        "user_email": "test@example.com",
        "password": "SuperSecretPassword123!",
        "api_key": "sk-1234567890",
        "nested": {
            "token": "bearer-token-val",
            "safe_field": 42,
            "secret_key": "private_secret",
        },
        "items": [
            {"jwt": "header.payload.signature"},
            {"safe_item": "ok"},
        ],
    }

    sanitized = sanitize_sensitive_data(raw)

    assert sanitized["user_email"] == "test@example.com"
    assert sanitized["password"] == "***REDACTED***"
    assert sanitized["api_key"] == "***REDACTED***"
    assert sanitized["nested"]["token"] == "***REDACTED***"
    assert sanitized["nested"]["safe_field"] == 42
    assert sanitized["nested"]["secret_key"] == "***REDACTED***"
    assert sanitized["items"][0]["jwt"] == "***REDACTED***"
    assert sanitized["items"][1]["safe_item"] == "ok"


# ---------------------------------------------------------------------------
# Service Unit Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_record_audit_log_write_helper():
    session = AsyncMock()
    org_id = uuid4()
    actor_id = uuid4()
    entity_id = uuid4()

    log_entry = await AuditLogService.record_audit_log(
        session=session,
        organization_id=org_id,
        actor_id=actor_id,
        action="employees.create",
        entity_type="employee",
        entity_id=entity_id,
        details={"code": "EMP-001", "password": "temp_secret_password"},
        ip_address="10.0.0.1",
    )

    assert log_entry.organization_id == org_id
    assert log_entry.actor_id == actor_id
    assert log_entry.action == "employees.create"
    assert log_entry.entity_type == "employee"
    assert log_entry.entity_id == entity_id
    # Ensure sensitive data is sanitized upon write
    assert log_entry.details["password"] == "***REDACTED***"
    assert log_entry.details["code"] == "EMP-001"
    assert log_entry.ip_address == "10.0.0.1"
    session.add.assert_called_once_with(log_entry)


@pytest.mark.asyncio
async def test_list_audit_logs_service():
    session = AsyncMock()
    org_id = uuid4()
    log1 = _make_audit_log(organization_id=org_id)
    log2 = _make_audit_log(organization_id=org_id)

    # Mock count scalar
    session.scalar.return_value = 2

    # Mock items scalars
    mock_scalars = MagicMock()
    mock_scalars.all.return_value = [log1, log2]
    session.scalars.return_value = mock_scalars

    res = await AuditLogService.list_audit_logs(
        session=session,
        organization_id=org_id,
        page=1,
        page_size=20,
    )

    assert isinstance(res, PaginatedData)
    assert len(res.items) == 2
    assert res.meta.total == 2
    assert res.meta.page == 1
    assert res.meta.page_size == 20
    assert res.meta.total_pages == 1
    assert res.items[0].id == log1.id


@pytest.mark.asyncio
async def test_get_audit_log_service_success():
    session = AsyncMock()
    org_id = uuid4()
    log = _make_audit_log(organization_id=org_id)

    session.scalar.return_value = log

    res = await AuditLogService.get_audit_log(
        session=session,
        organization_id=org_id,
        log_id=log.id,
    )

    assert res.id == log.id
    assert res.organization_id == org_id
    assert res.action == log.action


@pytest.mark.asyncio
async def test_get_audit_log_service_not_found():
    session = AsyncMock()
    org_id = uuid4()
    log_id = uuid4()

    session.scalar.return_value = None

    with pytest.raises(HTTPException) as exc_info:
        await AuditLogService.get_audit_log(
            session=session,
            organization_id=org_id,
            log_id=log_id,
        )

    assert exc_info.value.status_code == 404
    assert f"'{log_id}' not found" in exc_info.value.detail


# ---------------------------------------------------------------------------
# API Route Tests (FastAPI TestClient with overridden dependencies)
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=str(uuid4()),
        email="auditor@example.com",
        claims={},
    )


@pytest.fixture
def org_id() -> UUID:
    return uuid4()


@pytest.mark.asyncio
async def test_api_list_audit_logs_authorized(mock_user: AuthenticatedUser, org_id: UUID):
    log1 = _make_audit_log_response(organization_id=org_id)
    mock_paginated = PaginatedData(
        items=[log1],
        meta=PaginationMeta(total=1, page=1, page_size=20, total_pages=1),
    )

    dummy_session = AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["audit_logs.view"])),
            patch.object(AuditLogService, "list_audit_logs", new=AsyncMock(return_value=mock_paginated)) as mock_list,
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get(
                    "/api/v1/audit-logs",
                    headers={"X-Organization-Id": str(org_id)},
                    params={"page": 1, "page_size": 20},
                )

            assert res.status_code == 200
            body = res.json()
            assert body["success"] is True
            assert len(body["data"]["items"]) == 1
            assert body["data"]["items"][0]["id"] == str(log1.id)
            mock_list.assert_called_once()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_list_audit_logs_forbidden_without_permission(
    mock_user: AuthenticatedUser, org_id: UUID
):
    dummy_session = AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=[])):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get(
                    "/api/v1/audit-logs",
                    headers={"X-Organization-Id": str(org_id)},
                )

            assert res.status_code == 403
            err_msg = res.json().get("detail") or res.json().get("error", {}).get("message", "")
            assert "audit_logs.view" in err_msg
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_get_audit_log_detail_authorized(mock_user: AuthenticatedUser, org_id: UUID):
    log = _make_audit_log_response(organization_id=org_id)
    dummy_session = AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["audit_logs.view"])),
            patch.object(AuditLogService, "get_audit_log", new=AsyncMock(return_value=log)) as mock_get,
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get(
                    f"/api/v1/audit-logs/{log.id}",
                    headers={"X-Organization-Id": str(org_id)},
                )

            assert res.status_code == 200
            body = res.json()
            assert body["success"] is True
            assert body["data"]["id"] == str(log.id)
            assert body["data"]["action"] == log.action
            mock_get.assert_called_once()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_get_audit_log_not_found(mock_user: AuthenticatedUser, org_id: UUID):
    dummy_session = AsyncMock()
    missing_id = uuid4()

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["audit_logs.view"])),
            patch.object(
                AuditLogService,
                "get_audit_log",
                new=AsyncMock(
                    side_effect=HTTPException(
                        status_code=404, detail=f"Audit log entry '{missing_id}' not found"
                    )
                ),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get(
                    f"/api/v1/audit-logs/{missing_id}",
                    headers={"X-Organization-Id": str(org_id)},
                )

            assert res.status_code == 404
            err_msg = res.json().get("detail") or res.json().get("error", {}).get("message", "")
            assert f"'{missing_id}' not found" in err_msg
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_invalid_organization_header(mock_user: AuthenticatedUser):
    dummy_session = AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["audit_logs.view"])):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get(
                    "/api/v1/audit-logs",
                    headers={"X-Organization-Id": "not-a-valid-uuid"},
                )

            assert res.status_code == 400
            err_msg = res.json().get("detail") or res.json().get("error", {}).get("message", "")
            assert "Invalid organization id" in err_msg
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_immutability_no_write_endpoints_exist(
    mock_user: AuthenticatedUser, org_id: UUID
):
    dummy_session = AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["audit_logs.view"])):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                # POST should not exist
                post_res = await client.post(
                    "/api/v1/audit-logs",
                    headers={"X-Organization-Id": str(org_id)},
                    json={"action": "fake.action"},
                )
                assert post_res.status_code in (404, 405)

                # PUT should not exist
                put_res = await client.put(
                    f"/api/v1/audit-logs/{uuid4()}",
                    headers={"X-Organization-Id": str(org_id)},
                    json={"action": "fake.action"},
                )
                assert put_res.status_code in (404, 405)

                # PATCH should not exist
                patch_res = await client.patch(
                    f"/api/v1/audit-logs/{uuid4()}",
                    headers={"X-Organization-Id": str(org_id)},
                    json={"action": "fake.action"},
                )
                assert patch_res.status_code in (404, 405)

                # DELETE should not exist
                del_res = await client.delete(
                    f"/api/v1/audit-logs/{uuid4()}",
                    headers={"X-Organization-Id": str(org_id)},
                )
                assert del_res.status_code in (404, 405)
    finally:
        app.dependency_overrides.clear()

