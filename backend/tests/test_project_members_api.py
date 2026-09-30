import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.dependencies.tenant import get_tenant_session
from app.main import app
from app.models.employee import Employee
from app.models.identity import Profile
from app.models.project import Project, ProjectMember
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
        email="pm@example.com",
        first_name="Jane",
        last_name="Doe",
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


def _create_mock_employee(org_id: uuid.UUID, emp_id: uuid.UUID | None = None) -> Employee:
    return Employee(
        id=emp_id or uuid.uuid4(),
        organization_id=org_id,
        employee_code="EMP-001",
        first_name="John",
        last_name="Smith",
        designation="Software Engineer",
        employment_type="full_time",
        status="active",
        date_of_joining=date(2025, 1, 1),
        work_email="john@example.com",
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def _create_mock_member(
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    emp: Employee,
    member_id: uuid.UUID | None = None,
    role: str = "Developer",
    allocation: Decimal = Decimal("100.00"),
) -> ProjectMember:
    m = ProjectMember(
        id=member_id or uuid.uuid4(),
        organization_id=org_id,
        project_id=project_id,
        employee_id=emp.id,
        role=role,
        allocation_percentage=allocation,
        start_date=date(2026, 1, 1),
        end_date=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    m.employee = emp
    return m


@pytest.mark.asyncio
async def test_list_project_members_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    project_id = uuid.uuid4()
    emp = _create_mock_employee(org_id)
    member = _create_mock_member(org_id, project_id, emp)

    mock_session = AsyncMock()
    mock_session.scalars.side_effect = [
        ["project_members.view"],  # permissions
        [member],  # members query
    ]
    mock_session.scalar.return_value = project_id  # project existence check

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get(f"/api/v1/projects/{project_id}/members", headers=auth_context["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert len(body["data"]) == 1
        assert body["data"][0]["employee_name"] == "John Smith"
        assert body["data"][0]["role"] == "Developer"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_add_project_member_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    project_id = uuid.uuid4()
    emp = _create_mock_employee(org_id)
    mock_proj = Project(id=project_id, organization_id=org_id, project_code="PRJ-001", name="Project 1")

    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()
    mock_session.add = MagicMock()

    mock_session.scalars.return_value = ["project_members.manage"]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        mock_proj,  # project lookup
        emp,  # employee lookup
        None,  # duplicate check
    ]

    payload = {
        "employee_id": str(emp.id),
        "role": "Frontend Lead",
        "allocation_percentage": 50.00,
        "start_date": "2026-02-01",
    }

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/projects/{project_id}/members",
                headers=auth_context["headers"],
                json=payload,
            )
        assert res.status_code == 201
        body = res.json()
        assert body["success"] is True
        assert body["data"]["role"] == "Frontend Lead"
        assert body["data"]["employee_name"] == "John Smith"
        mock_session.add.assert_called()
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_add_duplicate_project_member_conflict(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    project_id = uuid.uuid4()
    emp = _create_mock_employee(org_id)
    mock_proj = Project(id=project_id, organization_id=org_id, project_code="PRJ-001", name="Project 1")
    existing_member = _create_mock_member(org_id, project_id, emp)

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ["project_members.manage"]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        mock_proj,  # project lookup
        emp,  # employee lookup
        existing_member,  # duplicate check
    ]

    payload = {
        "employee_id": str(emp.id),
        "role": "Frontend Lead",
    }

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/projects/{project_id}/members",
                headers=auth_context["headers"],
                json=payload,
            )
        assert res.status_code == 409
        body = res.json()
        assert body["success"] is False
        assert "already a member" in body["error"]["message"]
        assert body["error"]["code"] == "CONFLICT"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_update_project_member_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    project_id = uuid.uuid4()
    emp = _create_mock_employee(org_id)
    member_id = uuid.uuid4()
    member = _create_mock_member(org_id, project_id, emp, member_id=member_id)

    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()

    mock_session.scalars.return_value = ["project_members.manage"]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        member,  # member lookup
    ]

    payload = {
        "role": "Tech Lead",
        "allocation_percentage": 75.00,
    }

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.patch(
                f"/api/v1/projects/{project_id}/members/{member_id}",
                headers=auth_context["headers"],
                json=payload,
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert member.role == "Tech Lead"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_delete_project_member_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    project_id = uuid.uuid4()
    emp = _create_mock_employee(org_id)
    member_id = uuid.uuid4()
    member = _create_mock_member(org_id, project_id, emp, member_id=member_id)

    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()
    mock_session.delete = AsyncMock()

    mock_session.scalars.return_value = ["project_members.manage"]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        member,  # member lookup
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.delete(
                f"/api/v1/projects/{project_id}/members/{member_id}",
                headers=auth_context["headers"],
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["deleted"] is True
        mock_session.delete.assert_called()
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)
