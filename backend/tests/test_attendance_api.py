import uuid
from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.dependencies.tenant import get_tenant_session
from app.main import app
from app.models.attendance import AttendanceRecord
from app.models.employee import Department, Employee
from app.models.identity import Branch, Profile
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
        email="employee@example.com",
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
        first_name="Jane",
        last_name="Doe",
        designation="Software Engineer",
        employment_type="full_time",
        status="active",
        date_of_joining=date(2024, 1, 1),
        is_active=True,
        department=Department(
            id=uuid.uuid4(),
            organization_id=org_id,
            name="Engineering",
            code="ENG",
            is_active=True,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ),
        branch=Branch(
            id=uuid.uuid4(),
            organization_id=org_id,
            name="HQ",
            code="HQ",
            is_active=True,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ),
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_list_attendance_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    emp = _create_mock_employee(org_id)
    rec1 = AttendanceRecord(
        id=uuid.uuid4(),
        organization_id=org_id,
        employee_id=emp.id,
        employee=emp,
        branch_id=emp.branch.id if emp.branch else None,
        branch=emp.branch,
        work_date=datetime.now(UTC).date(),
        check_in_at=datetime.now(UTC),
        check_out_at=None,
        status="present",
        notes="On time",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_session.scalars.side_effect = [
        ["attendance.view"],
        [rec1],
    ]
    mock_session.scalar.return_value = 1

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/attendance", headers=auth_context["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert len(body["data"]["items"]) == 1
        item = body["data"]["items"][0]
        assert item["status"] == "present"
        assert item["employee"]["first_name"] == "Jane"
        assert item["notes"] == "On time"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_get_today_summary_success(auth_context) -> None:
    mock_session = AsyncMock()

    mock_session.scalars.return_value = ["attendance.view"]
    mock_session.scalar.return_value = 10  # total active employees
    mock_session.execute.return_value = [("present", 7), ("late", 2), ("on_leave", 1)]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/attendance/summary", headers=auth_context["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["total_active_employees"] == 10
        assert body["data"]["present_count"] == 7
        assert body["data"]["late_count"] == 2
        assert body["data"]["on_leave_count"] == 1
        assert body["data"]["marked_count"] == 10
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_get_my_today_attendance_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    emp = _create_mock_employee(org_id)
    rec = AttendanceRecord(
        id=uuid.uuid4(),
        organization_id=org_id,
        employee_id=emp.id,
        employee=emp,
        branch_id=None,
        branch=None,
        work_date=datetime.now(UTC).date(),
        check_in_at=datetime.now(UTC),
        check_out_at=None,
        status="present",
        notes=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_session.scalars.return_value = ["attendance.view"]
    mock_session.scalar.side_effect = [
        emp,  # resolve_employee_for_user
        rec,  # get record
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/attendance/today", headers=auth_context["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"] is not None
        assert body["data"]["status"] == "present"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_clock_in_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()

    emp = _create_mock_employee(org_id)
    rec_created = AttendanceRecord(
        id=uuid.uuid4(),
        organization_id=org_id,
        employee_id=emp.id,
        employee=emp,
        branch_id=emp.branch.id if emp.branch else None,
        branch=emp.branch,
        work_date=datetime.now(UTC).date(),
        check_in_at=datetime.now(UTC),
        check_out_at=None,
        status="present",
        notes="Morning check-in",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_session.scalars.side_effect = [
        ["attendance.create"],  # require_permission
        ["attendance.create"],  # check_is_admin_or_manager
    ]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        emp,  # resolve_employee_for_user
        None,  # duplicate check
        rec_created,  # get_attendance
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/v1/attendance/check-in",
                headers=auth_context["headers"],
                json={"notes": "Morning check-in"},
            )
        assert res.status_code == 201
        body = res.json()
        assert body["success"] is True
        assert body["data"]["status"] == "present"
        assert body["data"]["notes"] == "Morning check-in"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_clock_in_duplicate_conflict(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    emp = _create_mock_employee(org_id)
    existing_rec = AttendanceRecord(
        id=uuid.uuid4(),
        organization_id=org_id,
        employee_id=emp.id,
        work_date=datetime.now(UTC).date(),
        status="present",
    )

    mock_session.scalars.side_effect = [
        ["attendance.create"],  # require_permission
        ["attendance.create"],  # check_is_admin_or_manager
    ]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        emp,  # resolve_employee_for_user
        existing_rec,  # existing check
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/v1/attendance/check-in",
                headers=auth_context["headers"],
                json={},
            )
        assert res.status_code == 409
        body = res.json()
        assert "already exists" in body["error"]["message"].lower()
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_clock_out_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    emp = _create_mock_employee(org_id)
    att_id = uuid.uuid4()
    rec = AttendanceRecord(
        id=att_id,
        organization_id=org_id,
        employee_id=emp.id,
        employee=emp,
        branch_id=None,
        branch=None,
        work_date=datetime.now(UTC).date(),
        check_in_at=datetime.now(UTC) - timedelta(hours=4),
        check_out_at=None,
        status="present",
        notes=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_session.scalars.side_effect = [
        ["attendance.update"],  # require_permission
        ["attendance.update"],  # check_is_admin_or_manager
    ]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        rec,  # load record
        emp,  # resolve_employee_for_user
        rec,  # get_attendance
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/attendance/{att_id}/check-out",
                headers=auth_context["headers"],
                json={"notes": "Leaving for the day"},
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_clock_out_invalid_time_before_check_in(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    emp = _create_mock_employee(org_id)
    att_id = uuid.uuid4()
    rec = AttendanceRecord(
        id=att_id,
        organization_id=org_id,
        employee_id=emp.id,
        work_date=datetime.now(UTC).date(),
        check_in_at=datetime(2026, 9, 28, 10, 0, 0, tzinfo=UTC),
        check_out_at=None,
        status="present",
    )

    mock_session.scalars.side_effect = [
        ["attendance.update"],
        ["attendance.update"],
    ]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        rec,  # load record
        emp,  # resolve_employee_for_user
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/attendance/{att_id}/check-out",
                headers=auth_context["headers"],
                json={"check_out_at": "2026-09-28T09:00:00Z"},
            )
        assert res.status_code == 400
        body = res.json()
        assert "cannot be earlier" in body["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_attendance_manual_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()

    emp = _create_mock_employee(org_id)
    att_id = uuid.uuid4()
    rec_created = AttendanceRecord(
        id=att_id,
        organization_id=org_id,
        employee_id=emp.id,
        employee=emp,
        branch_id=None,
        branch=None,
        work_date=date(2026, 9, 25),
        status="half_day",
        notes="Approved half-day",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_session.scalars.side_effect = [
        ["attendance.create"],
    ]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        emp,  # target emp exists
        None,  # duplicate check
        rec_created,  # get_attendance
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/v1/attendance",
                headers=auth_context["headers"],
                json={
                    "employee_id": str(emp.id),
                    "work_date": "2026-09-25",
                    "status": "half_day",
                    "notes": "Approved half-day",
                },
            )
        assert res.status_code == 201
        body = res.json()
        assert body["success"] is True
        assert body["data"]["status"] == "half_day"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_update_attendance_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    emp = _create_mock_employee(org_id)
    att_id = uuid.uuid4()
    rec = AttendanceRecord(
        id=att_id,
        organization_id=org_id,
        employee_id=emp.id,
        employee=emp,
        work_date=date(2026, 9, 25),
        status="present",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_session.scalars.side_effect = [
        ["attendance.update"],
    ]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        rec,  # load record
        rec,  # get_attendance
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.patch(
                f"/api/v1/attendance/{att_id}",
                headers=auth_context["headers"],
                json={"status": "late", "notes": "Updated to late"},
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_delete_attendance_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()
    mock_session.delete = AsyncMock()

    emp = _create_mock_employee(org_id)
    att_id = uuid.uuid4()
    rec = AttendanceRecord(
        id=att_id,
        organization_id=org_id,
        employee_id=emp.id,
        work_date=date(2026, 9, 25),
        status="present",
    )

    mock_session.scalars.side_effect = [
        ["attendance.delete"],
    ]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        rec,  # load record
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.delete(
                f"/api/v1/attendance/{att_id}",
                headers=auth_context["headers"],
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["id"] == str(att_id)
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)
