import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.dependencies.tenant import get_tenant_session
from app.main import app
from app.models.employee import Department
from app.models.identity import Profile
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
        email="hr@example.com",
        first_name="HR",
        last_name="Manager",
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


@pytest.mark.asyncio
async def test_list_departments_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()

    dept1 = Department(
        id=uuid.uuid4(),
        organization_id=org_id,
        name="Engineering",
        code="ENG",
        description="Core tech team",
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    dept2 = Department(
        id=uuid.uuid4(),
        organization_id=org_id,
        name="Human Resources",
        code="HR",
        description="People ops",
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    # 1. require_permission -> departments.view
    mock_session.scalars.return_value = ["departments.view"]
    # 2. list_departments query execution
    mock_session.execute.return_value = [
        (dept1, "John", "Doe"),
        (dept2, None, None),
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/departments", headers=auth_context["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert len(body["data"]) == 2
        assert body["data"][0]["name"] == "Engineering"
        assert body["data"][0]["code"] == "ENG"
        assert body["data"][0]["manager_name"] == "John Doe"
        assert body["data"][1]["name"] == "Human Resources"
        assert body["data"][1]["manager_name"] is None
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_department_success(auth_context) -> None:
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.scalars.return_value = ["departments.manage"]

    # 1. get_actor_profile_id -> auth_context profile
    # 2. duplicate code check -> None
    mock_session.scalar.side_effect = [
        auth_context["profile"],
        None,
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/v1/departments",
                headers=auth_context["headers"],
                json={"name": "Finance & Accounting", "code": "fin-acc", "description": "Money management"},
            )
        assert res.status_code == 201
        body = res.json()
        assert body["success"] is True
        assert body["data"]["name"] == "Finance & Accounting"
        assert body["data"]["code"] == "FIN-ACC"
        assert body["data"]["is_active"] is True
        assert mock_session.add.called
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_department_conflict(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.scalars.return_value = ["departments.manage"]

    existing_dept = Department(
        id=uuid.uuid4(),
        organization_id=org_id,
        name="Existing Dept",
        code="ENG",
        is_active=True,
    )

    # 1. get_actor_profile_id -> profile
    # 2. duplicate code check -> existing_dept
    mock_session.scalar.side_effect = [
        auth_context["profile"],
        existing_dept,
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/v1/departments",
                headers=auth_context["headers"],
                json={"name": "New Engineering", "code": "eng"},
            )
        assert res.status_code == 409
        body = res.json()
        assert body["success"] is False
        assert body["error"]["code"] == "CONFLICT"
        assert "already exists in this organization" in body["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_get_department_details(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    dept_id = uuid.uuid4()
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.scalars.return_value = ["departments.view"]

    dept = Department(
        id=dept_id,
        organization_id=org_id,
        name="Operations",
        code="OPS",
        description="Daily operations",
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_res = MagicMock()
    mock_res.first.return_value = (dept, "Alice", "Smith")
    mock_session.execute.return_value = mock_res

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get(f"/api/v1/departments/{dept_id}", headers=auth_context["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["name"] == "Operations"
        assert body["data"]["manager_name"] == "Alice Smith"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_update_department_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    dept_id = uuid.uuid4()
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.scalars.return_value = ["departments.manage"]

    dept = Department(
        id=dept_id,
        organization_id=org_id,
        name="Old Name",
        code="OLD",
        description="Old description",
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    # 1. get_actor_profile_id -> profile
    # 2. get_department -> dept
    # 3. duplicate code check -> None
    mock_session.scalar.side_effect = [
        auth_context["profile"],
        dept,
        None,
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.patch(
                f"/api/v1/departments/{dept_id}",
                headers=auth_context["headers"],
                json={"name": "Updated Name", "code": "NEW_CODE"},
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["name"] == "Updated Name"
        assert body["data"]["code"] == "NEW_CODE"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_deactivate_department_soft_delete(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    dept_id = uuid.uuid4()
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.scalars.return_value = ["departments.manage"]

    dept = Department(
        id=dept_id,
        organization_id=org_id,
        name="Department to Deactivate",
        code="DEAD",
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    # 1. get_actor_profile_id -> profile
    # 2. get_department -> dept
    mock_session.scalar.side_effect = [
        auth_context["profile"],
        dept,
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.delete(
                f"/api/v1/departments/{dept_id}",
                headers=auth_context["headers"],
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["is_active"] is False
        assert dept.is_active is False
        assert "deactivated successfully" in body["message"]
        assert not mock_session.delete.called
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_department_endpoints_require_permissions(auth_context) -> None:
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    # User lacks departments.view and departments.manage
    mock_session.scalars.return_value = ["employees.view"]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # GET /departments -> 403
            res_get = await client.get("/api/v1/departments", headers=auth_context["headers"])
            assert res_get.status_code == 403
            assert "Permission 'departments.view' is required" in res_get.json()["error"]["message"]

            # POST /departments -> 403
            res_post = await client.post(
                "/api/v1/departments",
                headers=auth_context["headers"],
                json={"name": "Test", "code": "TST"},
            )
            assert res_post.status_code == 403
            assert "Permission 'departments.manage' is required" in res_post.json()["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)
