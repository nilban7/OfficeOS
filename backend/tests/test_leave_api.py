import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.dependencies.tenant import get_tenant_session
from app.main import app
from app.models.employee import Department, Employee
from app.models.identity import Branch, Profile
from app.models.leave import Holiday, LeaveRequest, LeaveType
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


def _create_mock_leave_type(org_id: uuid.UUID, lt_id: uuid.UUID | None = None) -> LeaveType:
    return LeaveType(
        id=lt_id or uuid.uuid4(),
        organization_id=org_id,
        name="Annual Leave",
        code="AL",
        description="Paid annual vacation",
        annual_allocation=Decimal("20.00"),
        is_paid=True,
        requires_approval=True,
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


# ==========================================
# Leave Types Tests
# ==========================================
@pytest.mark.asyncio
async def test_list_leave_types_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    lt = _create_mock_leave_type(org_id)
    mock_session.scalars.side_effect = [
        ["leave.view"],  # require_permission
        [lt],
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/leave-types", headers=auth_context["headers"])
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert len(body["data"]) == 1
        assert body["data"][0]["code"] == "AL"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_leave_type_success(auth_context) -> None:
    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()

    mock_session.scalars.return_value = ["leave_types.manage"]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        None,  # duplicate check
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/v1/leave-types",
                headers=auth_context["headers"],
                json={
                    "name": "Sick Leave",
                    "code": "SL",
                    "description": "Paid sick leave",
                    "annual_allocation": 10.0,
                    "is_paid": True,
                    "requires_approval": True,
                },
            )
        assert res.status_code == 201
        body = res.json()
        assert body["success"] is True
        assert body["data"]["code"] == "SL"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_leave_type_conflict(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    lt = _create_mock_leave_type(org_id)
    mock_session.scalars.return_value = ["leave_types.manage"]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        lt,  # existing conflict
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/v1/leave-types",
                headers=auth_context["headers"],
                json={
                    "name": "Annual Leave",
                    "code": "AL",
                    "annual_allocation": 20.0,
                },
            )
        assert res.status_code == 409
        body = res.json()
        assert "already exists" in body["error"]["message"].lower()
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


# ==========================================
# Leave Requests Tests
# ==========================================
@pytest.mark.asyncio
async def test_employee_submit_leave_request_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()

    emp = _create_mock_employee(org_id)
    lt = _create_mock_leave_type(org_id)
    req_id = uuid.uuid4()
    req_created = LeaveRequest(
        id=req_id,
        organization_id=org_id,
        employee_id=emp.id,
        employee=emp,
        leave_type_id=lt.id,
        leave_type=lt,
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 3),
        total_days=Decimal("3.00"),
        reason="Family vacation",
        status="pending",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_session.scalars.side_effect = [
        ["leave.request"],  # require_permission
        ["leave.request"],  # check_is_admin_or_manager -> False
    ]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        emp,  # resolve_employee_for_user
        lt,  # verify leave type
        None,  # overlap check
        req_created,  # get_leave_request
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/v1/leave-requests",
                headers=auth_context["headers"],
                json={
                    "leave_type_id": str(lt.id),
                    "start_date": "2026-10-01",
                    "end_date": "2026-10-03",
                    "reason": "Family vacation",
                },
            )
        assert res.status_code == 201
        body = res.json()
        assert body["success"] is True
        assert body["data"]["total_days"] == "3.00" or body["data"]["total_days"] == 3.0
        assert body["data"]["status"] == "pending"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_employee_cannot_submit_leave_for_another_employee(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    other_emp_id = uuid.uuid4()
    mock_session = AsyncMock()

    emp = _create_mock_employee(org_id)
    lt = _create_mock_leave_type(org_id)

    mock_session.scalars.side_effect = [
        ["leave.request"],  # require_permission
        ["leave.request"],  # check_is_admin_or_manager -> False
    ]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        emp,  # resolve_employee_for_user -> ID differs from other_emp_id
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/v1/leave-requests",
                headers=auth_context["headers"],
                json={
                    "employee_id": str(other_emp_id),
                    "leave_type_id": str(lt.id),
                    "start_date": "2026-10-01",
                    "end_date": "2026-10-03",
                },
            )
        assert res.status_code == 403
        body = res.json()
        assert "not authorized" in body["error"]["message"].lower()
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_leave_request_overlap_conflict(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    emp = _create_mock_employee(org_id)
    lt = _create_mock_leave_type(org_id)
    existing_req = LeaveRequest(
        id=uuid.uuid4(),
        organization_id=org_id,
        employee_id=emp.id,
        leave_type_id=lt.id,
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 5),
        total_days=Decimal("5.00"),
        status="pending",
    )

    mock_session.scalars.side_effect = [
        ["leave.request"],  # require_permission
        ["leave.request"],  # check_is_admin_or_manager
    ]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        emp,  # resolve_employee_for_user
        lt,  # verify leave type
        existing_req,  # overlap exists!
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/v1/leave-requests",
                headers=auth_context["headers"],
                json={
                    "leave_type_id": str(lt.id),
                    "start_date": "2026-10-03",
                    "end_date": "2026-10-07",
                },
            )
        assert res.status_code == 409
        body = res.json()
        assert "overlaps" in body["error"]["message"].lower()
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_manager_approve_leave_request_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    emp = _create_mock_employee(org_id)
    lt = _create_mock_leave_type(org_id)
    req_id = uuid.uuid4()
    rec = LeaveRequest(
        id=req_id,
        organization_id=org_id,
        employee_id=emp.id,
        employee=emp,
        leave_type_id=lt.id,
        leave_type=lt,
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 3),
        total_days=Decimal("3.00"),
        status="pending",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_session.scalars.return_value = ["leave.approve"]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        rec,  # load record
        rec,  # get_leave_request
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/leave-requests/{req_id}/approve",
                headers=auth_context["headers"],
                json={"reviewer_comment": "Approved! Have fun."},
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_employee_cancel_own_leave_request_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    emp = _create_mock_employee(org_id)
    lt = _create_mock_leave_type(org_id)
    req_id = uuid.uuid4()
    rec = LeaveRequest(
        id=req_id,
        organization_id=org_id,
        employee_id=emp.id,
        employee=emp,
        leave_type_id=lt.id,
        leave_type=lt,
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 3),
        total_days=Decimal("3.00"),
        status="pending",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_session.scalars.side_effect = [
        ["leave.cancel"],  # require_permission
        ["leave.cancel"],  # check_is_admin_or_manager -> False
    ]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        rec,  # load record
        emp,  # resolve_employee_for_user -> matches rec.employee_id
        rec,  # get_leave_request
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/leave-requests/{req_id}/cancel",
                headers=auth_context["headers"],
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_employee_cancel_approved_leave_request_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    emp = _create_mock_employee(org_id)
    lt = _create_mock_leave_type(org_id)
    req_id = uuid.uuid4()
    # Upcoming approved leave
    rec = LeaveRequest(
        id=req_id,
        organization_id=org_id,
        employee_id=emp.id,
        employee=emp,
        leave_type_id=lt.id,
        leave_type=lt,
        start_date=date(2027, 11, 1),
        end_date=date(2027, 11, 5),
        total_days=Decimal("5.00"),
        status="approved",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_session.scalars.side_effect = [
        ["leave.cancel"],  # require_permission
        ["leave.cancel"],  # check_is_admin_or_manager -> False
    ]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        rec,  # load record
        emp,  # resolve_employee_for_user -> matches rec.employee_id
        rec,  # get_leave_request
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/leave-requests/{req_id}/cancel",
                headers=auth_context["headers"],
                json={"reason": "Plans changed, mood change, staying to complete sprint"},
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert rec.status == "cancelled"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_employee_cannot_cancel_past_approved_leave(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    emp = _create_mock_employee(org_id)
    lt = _create_mock_leave_type(org_id)
    req_id = uuid.uuid4()
    # Past leave in 2020
    rec = LeaveRequest(
        id=req_id,
        organization_id=org_id,
        employee_id=emp.id,
        employee=emp,
        leave_type_id=lt.id,
        leave_type=lt,
        start_date=date(2020, 1, 1),
        end_date=date(2020, 1, 3),
        total_days=Decimal("3.00"),
        status="approved",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_session.scalars.side_effect = [
        ["leave.cancel"],  # require_permission
        ["leave.cancel"],  # check_is_admin_or_manager -> False
    ]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        rec,  # load record
        emp,  # resolve_employee_for_user -> matches rec.employee_id
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/leave-requests/{req_id}/cancel",
                headers=auth_context["headers"],
                json={"reason": "Trying to cancel past leave"},
            )
        assert res.status_code == 400
        body = res.json()
        assert "concluded" in body["error"]["message"].lower()
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_employee_cannot_approve_leave_request(auth_context) -> None:
    mock_session = AsyncMock()
    req_id = uuid.uuid4()

    # User lacks leave.approve permission
    mock_session.scalars.return_value = ["leave.view", "leave.request"]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/leave-requests/{req_id}/approve",
                headers=auth_context["headers"],
                json={"reviewer_comment": "Trying to self-approve"},
            )
        assert res.status_code == 403
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


# ==========================================
# Holidays Tests
# ==========================================
@pytest.mark.asyncio
async def test_list_and_create_holidays_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()

    h_id = uuid.uuid4()
    holiday_created = Holiday(
        id=h_id,
        organization_id=org_id,
        name="New Year's Day",
        holiday_date=date(2027, 1, 1),
        description="Public holiday",
        is_optional=False,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_session.scalars.side_effect = [
        ["holidays.view"],  # list
        [holiday_created],
        ["holidays.manage"],  # create
    ]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        holiday_created,  # get_holiday
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. List
            res_list = await client.get("/api/v1/holidays", headers=auth_context["headers"])
            assert res_list.status_code == 200
            assert len(res_list.json()["data"]) == 1

            # 2. Create
            res_create = await client.post(
                "/api/v1/holidays",
                headers=auth_context["headers"],
                json={
                    "name": "New Year's Day",
                    "holiday_date": "2027-01-01",
                    "description": "Public holiday",
                    "is_optional": False,
                },
            )
            assert res_create.status_code == 201
            assert res_create.json()["data"]["name"] == "New Year's Day"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


# ==========================================
# Leave Cancellation Request & Approval Tests
# ==========================================
@pytest.mark.asyncio
async def test_employee_request_cancellation_approved_leave_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    emp = _create_mock_employee(org_id)
    lt = _create_mock_leave_type(org_id)
    req_id = uuid.uuid4()
    rec = LeaveRequest(
        id=req_id,
        organization_id=org_id,
        employee_id=emp.id,
        employee=emp,
        leave_type_id=lt.id,
        leave_type=lt,
        start_date=date(2026, 11, 10),
        end_date=date(2026, 11, 12),
        total_days=Decimal("3.00"),
        status="approved",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_session.scalars.side_effect = [
        ["leave.cancel"],  # require_permission
        ["leave.cancel"],  # check_is_admin_or_manager -> False
    ]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        rec,  # load record
        emp,  # resolve_employee_for_user -> matches rec.employee_id
        rec,  # get_leave_request
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/leave-requests/{req_id}/request-cancellation",
                headers=auth_context["headers"],
                json={"reason": "Trip cancelled due to weather"},
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert rec.status == "cancellation_requested"
        assert rec.cancellation_reason == "Trip cancelled due to weather"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_manager_approve_leave_cancellation_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    emp = _create_mock_employee(org_id)
    lt = _create_mock_leave_type(org_id)
    req_id = uuid.uuid4()
    rec = LeaveRequest(
        id=req_id,
        organization_id=org_id,
        employee_id=emp.id,
        employee=emp,
        leave_type_id=lt.id,
        leave_type=lt,
        start_date=date(2026, 11, 10),
        end_date=date(2026, 11, 12),
        total_days=Decimal("3.00"),
        status="cancellation_requested",
        cancellation_reason="Trip cancelled",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_session.scalars.side_effect = [
        ["leave.approve"],  # require_permission
    ]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        rec,  # load record
        rec,  # get_leave_request
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/leave-requests/{req_id}/approve-cancellation",
                headers=auth_context["headers"],
                json={"reviewer_comment": "Cancellation approved, leave credited back"},
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert rec.status == "cancelled"
        assert rec.cancellation_reviewer_comment == "Cancellation approved, leave credited back"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_manager_reject_leave_cancellation_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    emp = _create_mock_employee(org_id)
    lt = _create_mock_leave_type(org_id)
    req_id = uuid.uuid4()
    rec = LeaveRequest(
        id=req_id,
        organization_id=org_id,
        employee_id=emp.id,
        employee=emp,
        leave_type_id=lt.id,
        leave_type=lt,
        start_date=date(2026, 11, 10),
        end_date=date(2026, 11, 12),
        total_days=Decimal("3.00"),
        status="cancellation_requested",
        cancellation_reason="Trip cancelled",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_session.scalars.side_effect = [
        ["leave.approve"],  # require_permission
    ]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        rec,  # load record
        rec,  # get_leave_request
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/leave-requests/{req_id}/reject-cancellation",
                headers=auth_context["headers"],
                json={"reviewer_comment": "Cannot cancel on short notice"},
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert rec.status == "approved"
        assert rec.cancellation_reviewer_comment == "Cannot cancel on short notice"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_leave_summary_increases_available_days_after_cancellation(auth_context) -> None:
    from app.services.leave import get_leave_summary

    org_id = uuid.UUID(auth_context["org_id"])
    emp = _create_mock_employee(org_id)
    lt = _create_mock_leave_type(org_id)  # 20 days annual allocation

    # Case 1: leave is approved -> used_days = 3, available = 17
    mock_session_approved = AsyncMock()
    req_approved = LeaveRequest(
        id=uuid.uuid4(),
        organization_id=org_id,
        employee_id=emp.id,
        leave_type_id=lt.id,
        start_date=date(datetime.now(UTC).year, 6, 1),
        end_date=date(datetime.now(UTC).year, 6, 3),
        total_days=Decimal("3.00"),
        status="approved",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    mock_session_approved.scalars.side_effect = [
        [lt],  # active leave types
        [req_approved],  # requests
    ]
    summary_before = await get_leave_summary(mock_session_approved, org_id, emp.id)
    assert summary_before.total_used_days == Decimal("3.00")
    assert summary_before.total_available_days == Decimal("17.00")

    # Case 2: leave is cancelled -> used_days = 0, available = 20 (automatically restored)
    mock_session_cancelled = AsyncMock()
    mock_session_cancelled.scalars.side_effect = [
        [lt],  # active leave types
        [],  # no active approved/pending requests
    ]
    summary_after = await get_leave_summary(mock_session_cancelled, org_id, emp.id)
    assert summary_after.total_used_days == Decimal("0.00")
    assert summary_after.total_available_days == Decimal("20.00")


@pytest.mark.asyncio
async def test_leave_summary_does_not_decrease_available_days_when_pending(auth_context) -> None:
    from app.services.leave import get_leave_summary

    org_id = uuid.UUID(auth_context["org_id"])
    emp = _create_mock_employee(org_id)
    lt = _create_mock_leave_type(org_id)  # 20 days annual allocation

    mock_session = AsyncMock()
    req_pending = LeaveRequest(
        id=uuid.uuid4(),
        organization_id=org_id,
        employee_id=emp.id,
        leave_type_id=lt.id,
        start_date=date(datetime.now(UTC).year, 10, 30),
        end_date=date(datetime.now(UTC).year, 10, 30),
        total_days=Decimal("1.00"),
        status="pending",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    mock_session.scalars.side_effect = [
        [lt],  # active leave types
        [req_pending],  # pending requests
    ]
    summary = await get_leave_summary(mock_session, org_id, emp.id)
    assert summary.total_pending_days == Decimal("1.00")
    assert summary.total_used_days == Decimal("0.00")
    assert summary.total_available_days == Decimal("20.00")
    assert summary.balances_by_type[0].available_days == Decimal("20.00")


