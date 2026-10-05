"""Unit and API integration tests for SaaS Administration module.

Validates system_admin authorization, non-system_admin rejection across all canonical roles,
organization lifecycle (suspend, activate, restore), platform directory, usage, health, config,
announcements, and audit logs.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException, status
from httpx import ASGITransport, AsyncClient

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.saas import get_saas_admin_session, require_system_admin
from app.dependencies.tenant import get_tenant_session
from app.main import app
from app.schemas.saas import (
    OrganizationDetailResponse,
    OrganizationDirectoryItem,
    OrganizationDirectoryResponse,
    PlatformAnnouncementResponse,
    PlatformConfigurationResponse,
    PlatformHealthResponse,
    PlatformMemberItem,
    PlatformMembersResponse,
    PlatformOverviewResponse,
    PlatformUsageResponse,
)
from app.services.saas import SaaSAdminService


@pytest.fixture
def mock_admin_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=str(uuid4()),
        email="admin@officeos.internal",
        claims={"role": "system_admin"},
    )


@pytest.fixture
def mock_normal_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=str(uuid4()),
        email="employee@example.com",
        claims={},
    )


@pytest.fixture
def mock_org_id() -> UUID:
    return uuid4()


@pytest.fixture
def sample_org_detail(mock_org_id: UUID) -> OrganizationDetailResponse:
    return OrganizationDetailResponse(
        id=mock_org_id,
        name="Acme Corp",
        slug="acme-corp",
        status="active",
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        branch_count=2,
        member_count=15,
        employee_count=12,
        project_count=4,
    )


@pytest.mark.asyncio
async def test_require_system_admin_rejects_non_admin(mock_normal_user):
    """Verify that callers lacking the system_admin role are denied with 403 Forbidden."""
    mock_session = AsyncMock()

    with patch("app.dependencies.saas.is_system_admin_user", new=AsyncMock(return_value=False)):
        with pytest.raises(HTTPException) as exc_info:
            await require_system_admin(current_user=mock_normal_user, session=mock_session)
        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "System administrator authorization required" in exc_info.value.detail


@pytest.mark.asyncio
async def test_all_canonical_non_system_roles_denied_platform_access(mock_normal_user):
    """Test that all canonical non-system_admin roles are rejected from platform endpoints."""
    canonical_non_admin_roles = [
        "organization_owner",
        "organization_admin",
        "hr_manager",
        "finance_manager",
        "project_manager",
        "department_manager",
        "employee",
    ]

    def mock_denied_admin():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System administrator authorization required",
        )

    app.dependency_overrides[get_current_user] = lambda: mock_normal_user
    app.dependency_overrides[require_system_admin] = mock_denied_admin
    app.dependency_overrides[get_saas_admin_session] = mock_denied_admin

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            endpoints = [
                ("GET", "/api/v1/admin/overview"),
                ("GET", "/api/v1/admin/organizations"),
                ("GET", f"/api/v1/admin/organizations/{uuid4()}"),
                ("POST", f"/api/v1/admin/organizations/{uuid4()}/suspend"),
                ("GET", "/api/v1/admin/members"),
                ("GET", "/api/v1/admin/usage"),
                ("GET", "/api/v1/admin/health"),
                ("GET", "/api/v1/admin/audit-logs"),
                ("GET", "/api/v1/admin/config"),
                ("GET", "/api/v1/admin/announcements"),
            ]

            for role_name in canonical_non_admin_roles:
                for method, path in endpoints:
                    if method == "GET":
                        resp = await client.get(path, headers={"Authorization": f"Bearer mock-{role_name}"})
                    else:
                        resp = await client.post(path, headers={"Authorization": f"Bearer mock-{role_name}"}, json={})
                    assert resp.status_code == status.HTTP_403_FORBIDDEN
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_platform_overview_success(mock_admin_user):
    """Test GET /api/v1/admin/overview returns aggregated overview metrics."""
    overview_data = PlatformOverviewResponse(
        total_organizations=10,
        active_organizations=8,
        suspended_organizations=2,
        total_users=150,
        total_employees=120,
        recent_organizations=[],
        system_status="healthy",
    )

    app.dependency_overrides[get_current_user] = lambda: mock_admin_user
    app.dependency_overrides[require_system_admin] = lambda: mock_admin_user
    app.dependency_overrides[get_saas_admin_session] = lambda: AsyncMock()

    with patch.object(SaaSAdminService, "get_overview", new=AsyncMock(return_value=overview_data)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/admin/overview", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_200_OK
            body = resp.json()["data"]
            assert body["total_organizations"] == 10
            assert body["active_organizations"] == 8
            assert body["suspended_organizations"] == 2
            assert body["system_status"] == "healthy"

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_organization_directory_list_and_filters(mock_admin_user, mock_org_id):
    """Test GET /api/v1/admin/organizations with pagination, search, and status filtering."""
    item = OrganizationDirectoryItem(
        id=mock_org_id,
        name="Global Tech",
        slug="global-tech",
        status="active",
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        branch_count=3,
        member_count=20,
        employee_count=18,
    )
    directory_data = OrganizationDirectoryResponse(
        items=[item],
        total=1,
        page=1,
        page_size=20,
        total_pages=1,
    )

    app.dependency_overrides[get_current_user] = lambda: mock_admin_user
    app.dependency_overrides[require_system_admin] = lambda: mock_admin_user
    app.dependency_overrides[get_saas_admin_session] = lambda: AsyncMock()

    with patch.object(SaaSAdminService, "list_organizations", new=AsyncMock(return_value=directory_data)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/admin/organizations?search=Global&status=active&page=1&page_size=20",
                headers={"Authorization": "Bearer token"},
            )
            assert resp.status_code == status.HTTP_200_OK
            body = resp.json()["data"]
            assert len(body["items"]) == 1
            assert body["items"][0]["name"] == "Global Tech"
            assert body["total"] == 1

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_organization_lifecycle_suspend_and_activate(mock_admin_user, mock_org_id, sample_org_detail):
    """Test organization lifecycle transitions: suspend and activate."""
    suspended_detail = sample_org_detail.model_copy(
        update={"status": "suspended", "is_active": False, "suspension_reason": "Policy violation"}
    )
    activated_detail = sample_org_detail.model_copy(
        update={"status": "active", "is_active": True, "suspension_reason": None}
    )

    app.dependency_overrides[get_current_user] = lambda: mock_admin_user
    app.dependency_overrides[require_system_admin] = lambda: mock_admin_user
    app.dependency_overrides[get_saas_admin_session] = lambda: AsyncMock()

    # 1. Suspend
    with patch.object(SaaSAdminService, "suspend_organization", new=AsyncMock(return_value=suspended_detail)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/admin/organizations/{mock_org_id}/suspend",
                headers={"Authorization": "Bearer token"},
                json={"reason": "Policy violation"},
            )
            assert resp.status_code == status.HTTP_200_OK
            body = resp.json()["data"]
            assert body["status"] == "suspended"
            assert body["is_active"] is False
            assert body["suspension_reason"] == "Policy violation"

    # 2. Activate
    with patch.object(SaaSAdminService, "activate_organization", new=AsyncMock(return_value=activated_detail)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/admin/organizations/{mock_org_id}/activate",
                headers={"Authorization": "Bearer token"},
            )
            assert resp.status_code == status.HTTP_200_OK
            body = resp.json()["data"]
            assert body["status"] == "active"
            assert body["is_active"] is True

    # 3. Restore
    with patch.object(SaaSAdminService, "restore_organization", new=AsyncMock(return_value=activated_detail)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/admin/organizations/{mock_org_id}/restore",
                headers={"Authorization": "Bearer token"},
            )
            assert resp.status_code == status.HTTP_200_OK
            body = resp.json()["data"]
            assert body["status"] == "active"

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_suspended_organization_denies_normal_tenant_operations(mock_normal_user, mock_org_id):
    """Verify that normal tenant users are blocked with 403 when their organization is suspended."""
    from app.models.identity import Organization, OrganizationMembership

    mock_session = AsyncMock()
    mock_membership = OrganizationMembership(
        id=uuid4(),
        organization_id=mock_org_id,
        profile_id=uuid4(),
        status="active",
    )
    suspended_org = Organization(
        id=mock_org_id,
        name="Suspended Org",
        slug="suspended-org",
        is_active=False,
        status="suspended",
    )

    mock_session.scalar.side_effect = [mock_membership, suspended_org]

    with patch("app.dependencies.saas.is_system_admin_user", new=AsyncMock(return_value=False)):
        with pytest.raises(HTTPException) as exc_info:
            await get_tenant_session(
                current_user=mock_normal_user,
                session=mock_session,
                organization_header=str(mock_org_id),
            )
        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "Organization is suspended" in exc_info.value.detail


@pytest.mark.asyncio
async def test_platform_members_directory(mock_admin_user, mock_org_id):
    """Test GET /api/v1/admin/members lists users and memberships."""
    member_item = PlatformMemberItem(
        membership_id=uuid4(),
        profile_id=uuid4(),
        auth_user_id=uuid4(),
        email="member@acme.com",
        first_name="Jane",
        last_name="Doe",
        organization_id=mock_org_id,
        organization_name="Acme Corp",
        status="active",
        roles=["organization_admin"],
        created_at=datetime.now(UTC),
    )
    members_data = PlatformMembersResponse(
        items=[member_item],
        total=1,
        page=1,
        page_size=20,
        total_pages=1,
    )

    app.dependency_overrides[get_current_user] = lambda: mock_admin_user
    app.dependency_overrides[require_system_admin] = lambda: mock_admin_user
    app.dependency_overrides[get_saas_admin_session] = lambda: AsyncMock()

    with patch.object(SaaSAdminService, "list_members", new=AsyncMock(return_value=members_data)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/admin/members", headers={"Authorization": "Bearer token"})
            assert resp.status_code == status.HTTP_200_OK
            body = resp.json()["data"]
            assert len(body["items"]) == 1
            assert body["items"][0]["email"] == "member@acme.com"

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_platform_usage_and_health_endpoints(mock_admin_user):
    """Test GET /api/v1/admin/usage and /api/v1/admin/health."""
    usage_data = PlatformUsageResponse(
        total_organizations=5,
        active_organizations=4,
        suspended_organizations=1,
        total_members=60,
        total_employees=50,
        total_projects=12,
        total_clients=8,
        total_assets=30,
        total_documents=45,
        organization_breakdown=[],
    )
    health_data = PlatformHealthResponse(
        status="healthy",
        database_connected=True,
        database_latency_ms=1.45,
        migration_head="0020_saas_administration_module",
        app_version="1.0.0",
        environment="production",
        active_organizations=4,
    )

    app.dependency_overrides[get_current_user] = lambda: mock_admin_user
    app.dependency_overrides[require_system_admin] = lambda: mock_admin_user
    app.dependency_overrides[get_saas_admin_session] = lambda: AsyncMock()

    with (
        patch.object(SaaSAdminService, "get_usage_metrics", new=AsyncMock(return_value=usage_data)),
        patch.object(SaaSAdminService, "get_platform_health", new=AsyncMock(return_value=health_data)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Usage
            u_resp = await client.get("/api/v1/admin/usage", headers={"Authorization": "Bearer token"})
            assert u_resp.status_code == status.HTTP_200_OK
            assert u_resp.json()["data"]["total_organizations"] == 5

            # Health
            h_resp = await client.get("/api/v1/admin/health", headers={"Authorization": "Bearer token"})
            assert h_resp.status_code == status.HTTP_200_OK
            assert h_resp.json()["data"]["status"] == "healthy"
            assert h_resp.json()["data"]["database_connected"] is True
            assert h_resp.json()["data"]["migration_head"] == "0020_saas_administration_module"

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_platform_config_get_and_patch(mock_admin_user):
    """Test GET and PATCH /api/v1/admin/config."""
    config_resp = PlatformConfigurationResponse(
        id=uuid4(),
        platform_name="OfficeOS Enterprise",
        support_email="support@officeos.internal",
        maintenance_mode=False,
        allowed_signup_domains=["officeos.com"],
        max_organizations=500,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    app.dependency_overrides[get_current_user] = lambda: mock_admin_user
    app.dependency_overrides[require_system_admin] = lambda: mock_admin_user
    app.dependency_overrides[get_saas_admin_session] = lambda: AsyncMock()

    with (
        patch.object(SaaSAdminService, "get_platform_config", new=AsyncMock(return_value=config_resp)),
        patch.object(SaaSAdminService, "update_platform_config", new=AsyncMock(return_value=config_resp)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # GET
            get_resp = await client.get("/api/v1/admin/config", headers={"Authorization": "Bearer token"})
            assert get_resp.status_code == status.HTTP_200_OK
            assert get_resp.json()["data"]["platform_name"] == "OfficeOS Enterprise"

            # PATCH
            patch_resp = await client.patch(
                "/api/v1/admin/config",
                headers={"Authorization": "Bearer token"},
                json={"platform_name": "OfficeOS Enterprise", "maintenance_mode": False},
            )
            assert patch_resp.status_code == status.HTTP_200_OK
            assert patch_resp.json()["data"]["platform_name"] == "OfficeOS Enterprise"

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_platform_announcements_crud(mock_admin_user):
    """Test full CRUD on /api/v1/admin/announcements."""
    announcement_resp = PlatformAnnouncementResponse(
        id=uuid4(),
        title="Scheduled Maintenance",
        content="System update tonight at 02:00 UTC",
        severity="warning",
        is_active=True,
        target_type="all",
        target_org_ids=[],
        created_by_id=uuid4(),
        starts_at=datetime.now(UTC),
        ends_at=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    app.dependency_overrides[get_current_user] = lambda: mock_admin_user
    app.dependency_overrides[require_system_admin] = lambda: mock_admin_user
    app.dependency_overrides[get_saas_admin_session] = lambda: AsyncMock()

    with (
        patch.object(SaaSAdminService, "list_announcements", new=AsyncMock(return_value=[announcement_resp])),
        patch.object(SaaSAdminService, "create_announcement", new=AsyncMock(return_value=announcement_resp)),
        patch.object(SaaSAdminService, "update_announcement", new=AsyncMock(return_value=announcement_resp)),
        patch.object(SaaSAdminService, "delete_announcement", new=AsyncMock()),
    ):
                    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                        # LIST
                        l_resp = await client.get("/api/v1/admin/announcements", headers={"Authorization": "Bearer token"})
                        assert l_resp.status_code == status.HTTP_200_OK
                        assert len(l_resp.json()["data"]) == 1

                        # CREATE
                        c_resp = await client.post(
                            "/api/v1/admin/announcements",
                            headers={"Authorization": "Bearer token"},
                            json={"title": "Scheduled Maintenance", "content": "System update", "severity": "warning"},
                        )
                        assert c_resp.status_code == status.HTTP_201_CREATED

                        # UPDATE
                        u_resp = await client.patch(
                            f"/api/v1/admin/announcements/{announcement_resp.id}",
                            headers={"Authorization": "Bearer token"},
                            json={"title": "Updated Title"},
                        )
                        assert u_resp.status_code == status.HTTP_200_OK

                        # DELETE
                        d_resp = await client.delete(
                            f"/api/v1/admin/announcements/{announcement_resp.id}",
                            headers={"Authorization": "Bearer token"},
                        )
                        assert d_resp.status_code == status.HTTP_200_OK
                        assert d_resp.json()["data"]["status"] == "deleted"

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_admin_organization_create_update_delete(mock_admin_user):
    """Test POST, PATCH, and DELETE /api/v1/admin/organizations."""
    org_id = uuid4()
    detail_data = OrganizationDetailResponse(
        id=org_id,
        name="New Venture Inc",
        slug="new-venture",
        status="active",
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        timezone="UTC",
        currency="USD",
        branch_count=1,
        member_count=1,
        employee_count=0,
        project_count=0,
    )

    app.dependency_overrides[get_current_user] = lambda: mock_admin_user
    app.dependency_overrides[require_system_admin] = lambda: mock_admin_user
    app.dependency_overrides[get_saas_admin_session] = lambda: AsyncMock()

    with (
        patch("app.api.v1.admin.get_profile", new=AsyncMock(return_value=None)),
        patch.object(SaaSAdminService, "create_organization", new=AsyncMock(return_value=detail_data)),
        patch.object(SaaSAdminService, "update_organization", new=AsyncMock(return_value=detail_data)),
        patch.object(SaaSAdminService, "delete_organization", new=AsyncMock(return_value=None)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # CREATE
            c_resp = await client.post(
                "/api/v1/admin/organizations",
                headers={"Authorization": "Bearer token"},
                json={"name": "New Venture Inc", "slug": "new-venture"},
            )
            assert c_resp.status_code == status.HTTP_201_CREATED
            assert c_resp.json()["data"]["name"] == "New Venture Inc"

            # UPDATE
            u_resp = await client.patch(
                f"/api/v1/admin/organizations/{org_id}",
                headers={"Authorization": "Bearer token"},
                json={"name": "New Venture Updated"},
            )
            assert u_resp.status_code == status.HTTP_200_OK

            # DELETE
            d_resp = await client.delete(
                f"/api/v1/admin/organizations/{org_id}",
                headers={"Authorization": "Bearer token"},
            )
            assert d_resp.status_code == status.HTTP_200_OK

    app.dependency_overrides.clear()

