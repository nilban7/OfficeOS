import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.dependencies.tenant import get_tenant_session
from app.main import app
from app.models.identity import (
    Branch,
    Organization,
    OrganizationMembership,
    OrganizationSetting,
    Profile,
    Role,
)
from tests.auth_helpers import create_test_token


@pytest.fixture
def auth_context():
    user_id = str(uuid.uuid4())
    org_id = str(uuid.uuid4())
    token = create_test_token(user_id=user_id)
    profile_id = uuid.uuid4()
    profile = Profile(
        id=profile_id,
        auth_user_id=uuid.UUID(user_id),
        email="admin@example.com",
        first_name="Admin",
        last_name="User",
    )
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Organization-Id": org_id,
    }
    return {
        "user_id": user_id,
        "org_id": org_id,
        "profile_id": profile_id,
        "profile": profile,
        "token": token,
        "headers": headers,
    }


# --- Organization Profile Tests ---


@pytest.mark.asyncio
async def test_get_organization_profile_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()

    mock_session.scalars.return_value = ["organizations.view"]
    mock_session.scalar.return_value = Organization(
        id=org_id,
        name="Acme Corp",
        slug="acme-corp",
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/organizations/current", headers=auth_context["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["id"] == str(org_id)
        assert body["data"]["name"] == "Acme Corp"
        assert body["data"]["slug"] == "acme-corp"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_get_organization_profile_forbidden_without_permission(auth_context) -> None:
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    # Missing organizations.view permission
    mock_session.scalars.return_value = ["branches.view"]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/organizations/current", headers=auth_context["headers"])
        assert res.status_code == 403
        body = res.json()
        assert body["success"] is False
        assert body["error"]["code"] == "FORBIDDEN"
        assert "Permission 'organizations.view' is required" in body["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_update_organization_profile_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.scalars.return_value = ["organizations.update"]

    org = Organization(
        id=org_id,
        name="Old Name",
        slug="acme-corp",
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    # 1. get_actor_profile_id -> auth profile
    # 2. get_organization_profile -> org
    mock_session.scalar.side_effect = [
        auth_context["profile"],
        org,
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.patch(
                "/api/v1/organizations/current",
                headers=auth_context["headers"],
                json={"name": "New Awesome Corp"},
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["name"] == "New Awesome Corp"
        assert mock_session.add.called
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


# --- Organization Settings Tests ---


@pytest.mark.asyncio
async def test_get_and_update_organization_settings(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.scalars.return_value = ["organizations.settings_manage"]

    settings = OrganizationSetting(
        id=uuid.uuid4(),
        organization_id=org_id,
        timezone="America/New_York",
        currency="USD",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    # 1. get_current_settings -> settings
    # 2. get_actor_profile_id -> auth_context profile
    # 3. update_current_settings -> settings
    mock_session.scalar.side_effect = [
        settings,
        auth_context["profile"],
        settings,
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # GET settings
            res_get = await client.get("/api/v1/organizations/current/settings", headers=auth_context["headers"])
            assert res_get.status_code == 200
            assert res_get.json()["data"]["timezone"] == "America/New_York"
            assert res_get.json()["data"]["currency"] == "USD"

            # PATCH settings
            res_patch = await client.patch(
                "/api/v1/organizations/current/settings",
                headers=auth_context["headers"],
                json={"timezone": "Europe/London", "currency": "GBP"},
            )
            assert res_patch.status_code == 200
            assert res_patch.json()["data"]["timezone"] == "Europe/London"
            assert res_patch.json()["data"]["currency"] == "GBP"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


# --- Branch Tests ---


@pytest.mark.asyncio
async def test_list_branches(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()

    branches = [
        Branch(
            id=uuid.uuid4(),
            organization_id=org_id,
            name="HQ",
            code="HQ01",
            address="123 Main St",
            is_active=True,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ),
        Branch(
            id=uuid.uuid4(),
            organization_id=org_id,
            name="Branch West",
            code="BW01",
            address="456 West St",
            is_active=True,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ),
    ]

    # First call to scalars is permission check, second is branch list
    mock_session.scalars.side_effect = [
        ["branches.view"],
        branches,
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/organizations/current/branches", headers=auth_context["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert len(body["data"]) == 2
        assert body["data"][0]["name"] == "HQ"
        assert body["data"][1]["name"] == "Branch West"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_branch_conflict(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.scalars.return_value = ["branches.manage"]

    # 1. get_actor_profile_id -> auth_context profile
    # 2. check duplicate code -> existing branch
    mock_session.scalar.side_effect = [
        auth_context["profile"],
        Branch(
            id=uuid.uuid4(),
            organization_id=org_id,
            name="Existing Branch",
            code="HQ01",
            is_active=True,
        ),
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/v1/organizations/current/branches",
                headers=auth_context["headers"],
                json={"name": "Duplicate HQ", "code": "HQ01", "address": "123 St"},
            )
        assert res.status_code == 409
        body = res.json()
        assert body["success"] is False
        assert body["error"]["code"] == "CONFLICT"
        assert "already exists in this organization" in body["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_branch_success(auth_context) -> None:
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.scalars.return_value = ["branches.manage"]

    # 1. get_actor_profile_id -> auth_context profile
    # 2. check duplicate code -> None
    mock_session.scalar.side_effect = [
        auth_context["profile"],
        None,
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/v1/organizations/current/branches",
                headers=auth_context["headers"],
                json={"name": "North Branch", "code": "NB01", "address": "789 North Ave"},
            )
        assert res.status_code == 201
        body = res.json()
        assert body["success"] is True
        assert body["data"]["name"] == "North Branch"
        assert body["data"]["code"] == "NB01"
        assert body["data"]["is_active"] is True
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_deactivate_branch_soft_delete(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    branch_id = uuid.uuid4()
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.scalars.return_value = ["branches.manage"]

    branch = Branch(
        id=branch_id,
        organization_id=org_id,
        name="Branch To Deactivate",
        code="BD01",
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    # 1. get_actor_profile_id -> auth_context profile
    # 2. get_branch -> branch
    mock_session.scalar.side_effect = [
        auth_context["profile"],
        branch,
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.delete(
                f"/api/v1/organizations/current/branches/{branch_id}",
                headers=auth_context["headers"],
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["is_active"] is False
        assert branch.is_active is False
        assert "deactivated successfully" in body["message"]
        assert not mock_session.delete.called
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


# --- Roles & Members Tests ---


@pytest.mark.asyncio
async def test_list_roles(auth_context) -> None:
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()

    roles = [
        Role(id=uuid.uuid4(), name="organization_owner", is_system=True),
        Role(id=uuid.uuid4(), name="employee", is_system=True),
    ]

    mock_session.scalars.side_effect = [
        ["roles.view"],
        roles,
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/organizations/current/roles", headers=auth_context["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert len(body["data"]) == 2
        assert body["data"][0]["name"] == "organization_owner"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_add_member_fails_when_user_not_registered(auth_context) -> None:
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.scalars.return_value = ["members.manage"]

    # 1. get_actor_profile_id -> auth_context profile
    # 2. lookup profile by email -> None
    mock_session.scalar.side_effect = [
        auth_context["profile"],
        None,
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/v1/organizations/current/members",
                headers=auth_context["headers"],
                json={"email": "nonexistent@example.com"},
            )
        assert res.status_code == 404
        body = res.json()
        assert body["success"] is False
        assert body["error"]["code"] == "NOT_FOUND"
        assert "has not registered in OfficeOS" in body["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_add_member_fails_when_already_member(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.scalars.return_value = ["members.manage"]

    profile = Profile(
        id=uuid.uuid4(),
        auth_user_id=uuid.uuid4(),
        email="existing@example.com",
    )
    existing_membership = OrganizationMembership(
        id=uuid.uuid4(),
        organization_id=org_id,
        profile_id=profile.id,
        status="active",
    )

    # 1. get_actor_profile_id -> auth_context profile
    # 2. Profile lookup -> profile
    # 3. Membership lookup -> existing_membership
    mock_session.scalar.side_effect = [
        auth_context["profile"],
        profile,
        existing_membership,
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/v1/organizations/current/members",
                headers=auth_context["headers"],
                json={"email": "existing@example.com"},
            )
        assert res.status_code == 409
        body = res.json()
        assert body["success"] is False
        assert body["error"]["code"] == "CONFLICT"
        assert "already a member" in body["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_add_member_success(auth_context) -> None:
    role_id = uuid.uuid4()
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()

    profile = Profile(
        id=uuid.uuid4(),
        auth_user_id=uuid.uuid4(),
        email="newuser@example.com",
        first_name="Jane",
        last_name="Doe",
    )
    role = Role(id=role_id, name="employee", is_system=True)

    # 1st scalars: permissions -> members.manage
    # 2nd scalars: role lookup -> role
    mock_session.scalars.side_effect = [
        ["members.manage"],
        [role],
    ]
    # 1st scalar: get_actor_profile_id -> auth_context profile
    # 2nd scalar: profile lookup -> profile
    # 3rd scalar: existing membership check -> None
    mock_session.scalar.side_effect = [
        auth_context["profile"],
        profile,
        None,
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/v1/organizations/current/members",
                headers=auth_context["headers"],
                json={"email": "newuser@example.com", "role_ids": [str(role_id)]},
            )
        assert res.status_code == 201
        body = res.json()
        assert body["success"] is True
        assert body["data"]["profile"]["email"] == "newuser@example.com"
        assert body["data"]["profile"]["first_name"] == "Jane"
        assert len(body["data"]["roles"]) == 1
        assert body["data"]["roles"][0]["name"] == "employee"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


# --- Sole Admin Protection Tests ---


@pytest.mark.asyncio
async def test_remove_sole_admin_rejected(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    membership_id = uuid.uuid4()
    admin_role_id = uuid.uuid4()

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()

    # Permissions
    mock_session.scalars.side_effect = [
        ["members.manage"],  # permission check
        [Role(id=admin_role_id, name="organization_owner", is_system=True)],  # admin roles lookup
        [admin_role_id],  # current member's roles -> is an admin!
    ]

    # Membership lookup returns active membership
    membership = OrganizationMembership(
        id=membership_id,
        organization_id=org_id,
        profile_id=uuid.uuid4(),
        status="active",
    )
    # scalar side effect:
    # 1. get_actor_profile_id -> auth_context profile
    # 2. get membership in remove_member
    # 3. current membership in _check_sole_admin_protection
    # 4. count of other active admins -> 0 !
    mock_session.scalar.side_effect = [
        auth_context["profile"],
        membership,
        membership,
        0,  # 0 other active admins
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.delete(
                f"/api/v1/organizations/current/members/{membership_id}",
                headers=auth_context["headers"],
            )
        assert res.status_code == 400
        body = res.json()
        assert body["success"] is False
        assert body["error"]["code"] == "BAD_REQUEST"
        assert "sole active organization administrator" in body["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


# --- Permission Enforcement Tests ---


@pytest.mark.asyncio
async def test_roles_endpoint_requires_roles_view_permission(auth_context) -> None:
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    # Has members.view but missing roles.view
    mock_session.scalars.return_value = ["members.view"]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/organizations/current/roles", headers=auth_context["headers"])
        assert res.status_code == 403
        body = res.json()
        assert body["success"] is False
        assert body["error"]["code"] == "FORBIDDEN"
        assert "Permission 'roles.view' is required" in body["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_settings_endpoint_requires_settings_manage_permission(auth_context) -> None:
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    # Has organizations.view but missing organizations.settings_manage
    mock_session.scalars.return_value = ["organizations.view"]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/organizations/current/settings", headers=auth_context["headers"])
        assert res.status_code == 403
        body = res.json()
        assert body["success"] is False
        assert body["error"]["code"] == "FORBIDDEN"
        assert "Permission 'organizations.settings_manage' is required" in body["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_branches_manage_endpoint_requires_branches_manage_permission(auth_context) -> None:
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    # Has branches.view but missing branches.manage
    mock_session.scalars.return_value = ["branches.view"]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/v1/organizations/current/branches",
                headers=auth_context["headers"],
                json={"name": "New Branch", "code": "NB02"},
            )
        assert res.status_code == 403
        body = res.json()
        assert body["success"] is False
        assert body["error"]["code"] == "FORBIDDEN"
        assert "Permission 'branches.manage' is required" in body["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_members_view_endpoint_requires_members_view_permission(auth_context) -> None:
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    # Has organizations.view but missing members.view
    mock_session.scalars.return_value = ["organizations.view"]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/organizations/current/members", headers=auth_context["headers"])
        assert res.status_code == 403
        body = res.json()
        assert body["success"] is False
        assert body["error"]["code"] == "FORBIDDEN"
        assert "Permission 'members.view' is required" in body["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_system_roles_listing_contains_canonical_roles(auth_context) -> None:
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()

    canonical_role_names = [
        "system_admin",
        "organization_owner",
        "organization_admin",
        "hr_manager",
        "finance_manager",
        "project_manager",
        "department_manager",
        "employee",
    ]
    roles = [Role(id=uuid.uuid4(), name=r_name, is_system=True) for r_name in canonical_role_names]

    mock_session.scalars.side_effect = [
        ["roles.view"],
        roles,
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/organizations/current/roles", headers=auth_context["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        returned_names = [r["name"] for r in body["data"]]
        for role_name in canonical_role_names:
            assert role_name in returned_names
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)
