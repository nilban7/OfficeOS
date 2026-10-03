import uuid
from datetime import UTC, date, datetime
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.dependencies.tenant import get_tenant_session
from app.main import app
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
        email="hr@example.com",
        first_name="HR",
        last_name="Officer",
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
async def test_list_employees_pagination_and_filters(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()

    emp = Employee(
        id=uuid.uuid4(),
        organization_id=org_id,
        employee_code="EMP-001",
        first_name="John",
        last_name="Doe",
        designation="Lead Engineer",
        employment_type="full_time",
        status="active",
        date_of_joining=date(2023, 1, 15),
        work_email="john.doe@example.com",
        phone_number="+1234567890",
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    emp.department = Department(id=uuid.uuid4(), organization_id=org_id, name="Engineering", code="ENG")
    emp.branch = Branch(id=uuid.uuid4(), organization_id=org_id, name="Main HQ", code="HQ01")
    emp.reporting_manager = None

    # 1. require_permission -> employees.view
    # 2. count scalar -> 1
    # 3. scalars list -> [emp]
    mock_session.scalars.side_effect = [
        ["employees.view"],
        [emp],
    ]
    mock_session.scalar.return_value = 1

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get(
                "/api/v1/employees?search=John&page=1&page_size=20",
                headers=auth_context["headers"],
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["meta"]["total"] == 1
        assert body["data"]["meta"]["page"] == 1
        assert len(body["data"]["items"]) == 1
        item = body["data"]["items"][0]
        assert item["employee_code"] == "EMP-001"
        assert item["first_name"] == "John"
        assert item["department"]["name"] == "Engineering"
        assert item["branch"]["name"] == "Main HQ"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_employee_success(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.scalars.return_value = ["employees.create"]

    dept_id = uuid.uuid4()
    branch_id = uuid.uuid4()

    created_emp = Employee(
        id=uuid.uuid4(),
        organization_id=org_id,
        employee_code="EMP-100",
        first_name="Alice",
        last_name="Walker",
        designation="Product Designer",
        employment_type="full_time",
        status="active",
        date_of_joining=date(2024, 3, 1),
        department_id=dept_id,
        branch_id=branch_id,
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    created_emp.department = Department(id=dept_id, organization_id=org_id, name="Design", code="DSG")
    created_emp.branch = Branch(id=branch_id, organization_id=org_id, name="NYC", code="NYC01")
    created_emp.reporting_manager = None

    # Side effects:
    # 1. get_actor_profile_id -> auth_context profile
    # 2. duplicate employee_code check -> None
    # 3. validate department_id -> dept
    # 4. validate branch_id -> branch
    # 5. get_employee query -> created_emp
    mock_session.scalar.side_effect = [
        auth_context["profile"],
        None,
        Department(id=dept_id, organization_id=org_id, name="Design", code="DSG"),
        Branch(id=branch_id, organization_id=org_id, name="NYC", code="NYC01"),
        created_emp,
    ]

    # for direct reports in get_employee
    mock_reports = AsyncMock()
    mock_reports.all.return_value = []
    mock_session.scalars.side_effect = [
        ["employees.create"],
        [],
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/v1/employees",
                headers=auth_context["headers"],
                json={
                    "employee_code": "emp-100",
                    "first_name": "Alice",
                    "last_name": "Walker",
                    "designation": "Product Designer",
                    "employment_type": "full_time",
                    "status": "active",
                    "date_of_joining": "2024-03-01",
                    "department_id": str(dept_id),
                    "branch_id": str(branch_id),
                    "work_email": "alice@example.com",
                },
            )
        assert res.status_code == 201
        body = res.json()
        assert body["success"] is True
        assert body["data"]["employee_code"] == "EMP-100"
        assert body["data"]["first_name"] == "Alice"
        assert body["data"]["designation"] == "Product Designer"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_employee_conflict(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.scalars.return_value = ["employees.create"]

    existing = Employee(
        id=uuid.uuid4(),
        organization_id=org_id,
        employee_code="EMP-001",
        first_name="Existing",
        last_name="User",
        designation="Dev",
        date_of_joining=date(2023, 1, 1),
    )

    # 1. get_actor_profile_id -> profile
    # 2. duplicate check -> existing
    mock_session.scalar.side_effect = [
        auth_context["profile"],
        existing,
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/v1/employees",
                headers=auth_context["headers"],
                json={
                    "employee_code": "EMP-001",
                    "first_name": "Duplicate",
                    "last_name": "Employee",
                    "designation": "Staff",
                    "date_of_joining": "2024-01-01",
                },
            )
        assert res.status_code == 409
        body = res.json()
        assert body["success"] is False
        assert body["error"]["code"] == "CONFLICT"
        assert "already exists in this organization" in body["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_update_employee_and_status_change(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    emp_id = uuid.uuid4()
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()

    emp = Employee(
        id=emp_id,
        organization_id=org_id,
        employee_code="EMP-050",
        first_name="Robert",
        last_name="Taylor",
        designation="Junior Analyst",
        employment_type="full_time",
        status="probation",
        date_of_joining=date(2024, 1, 1),
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    emp.department = None
    emp.branch = None
    emp.reporting_manager = None

    # Side effects:
    # 1. get_actor_profile_id -> profile
    # 2. update_employee lookup -> emp
    # 3. get_employee lookup -> emp
    mock_session.scalar.side_effect = [
        auth_context["profile"],
        emp,
        emp,
    ]
    mock_session.scalars.side_effect = [
        ["employees.update"],
        [],  # direct reports
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.patch(
                f"/api/v1/employees/{emp_id}",
                headers=auth_context["headers"],
                json={
                    "designation": "Senior Analyst",
                    "status": "active",
                },
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["designation"] == "Senior Analyst"
        assert body["data"]["status"] == "active"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_deactivate_employee_soft_delete(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    emp_id = uuid.uuid4()
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()

    emp = Employee(
        id=emp_id,
        organization_id=org_id,
        employee_code="EMP-099",
        first_name="Departing",
        last_name="Staff",
        designation="Consultant",
        employment_type="contract",
        status="notice_period",
        date_of_joining=date(2023, 5, 1),
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    emp.department = None
    emp.branch = None
    emp.reporting_manager = None

    # Side effects:
    # 1. get_actor_profile_id -> profile
    # 2. deactivate lookup -> emp
    # 3. get_employee lookup -> emp
    mock_session.scalar.side_effect = [
        auth_context["profile"],
        emp,
        emp,
    ]
    mock_session.scalars.side_effect = [
        ["employees.delete"],
        [],  # direct reports
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.delete(
                f"/api/v1/employees/{emp_id}",
                headers=auth_context["headers"],
            )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["status"] == "terminated"
        assert body["data"]["is_active"] is False
        assert "deactivated successfully" in body["message"]
        assert not mock_session.delete.called
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_self_report_prevention(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    emp_id = uuid.uuid4()
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.scalars.return_value = ["employees.update"]

    emp = Employee(
        id=emp_id,
        organization_id=org_id,
        employee_code="EMP-010",
        first_name="Self",
        last_name="Manager",
        designation="Engineer",
        date_of_joining=date(2024, 1, 1),
        is_active=True,
    )

    # 1. get_actor_profile_id -> profile
    # 2. update_employee lookup -> emp
    mock_session.scalar.side_effect = [
        auth_context["profile"],
        emp,
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.patch(
                f"/api/v1/employees/{emp_id}",
                headers=auth_context["headers"],
                json={"reporting_manager_id": str(emp_id)},
            )
        assert res.status_code == 400
        body = res.json()
        assert body["success"] is False
        assert body["error"]["code"] == "BAD_REQUEST"
        assert "cannot report to themselves" in body["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_circular_hierarchy_prevention(auth_context) -> None:
    org_id = uuid.UUID(auth_context["org_id"])
    emp_a_id = uuid.uuid4()
    emp_b_id = uuid.uuid4()

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.scalars.return_value = ["employees.update"]

    # Emp A currently reports to nothing
    emp_a = Employee(
        id=emp_a_id,
        organization_id=org_id,
        employee_code="EMP-A",
        first_name="Emp",
        last_name="A",
        designation="Team Lead",
        date_of_joining=date(2024, 1, 1),
        is_active=True,
    )
    # Emp B currently reports to Emp A
    emp_b = Employee(
        id=emp_b_id,
        organization_id=org_id,
        employee_code="EMP-B",
        first_name="Emp",
        last_name="B",
        designation="Manager",
        date_of_joining=date(2024, 1, 1),
        reporting_manager_id=emp_a_id,
        is_active=True,
    )

    # Setting Emp A to report to Emp B -> Circular hierarchy!
    # 1. get_actor_profile_id -> profile
    # 2. lookup emp_a in update_employee -> emp_a
    # 3. lookup manager emp_b in _check_manager_hierarchy -> emp_b
    mock_session.scalar.side_effect = [
        auth_context["profile"],
        emp_a,
        emp_b,
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.patch(
                f"/api/v1/employees/{emp_a_id}",
                headers=auth_context["headers"],
                json={"reporting_manager_id": str(emp_b_id)},
            )
        assert res.status_code == 400
        body = res.json()
        assert body["success"] is False
        assert body["error"]["code"] == "BAD_REQUEST"
        assert "Circular reporting hierarchy detected" in body["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_cross_tenant_references_rejected(auth_context) -> None:
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_session.scalars.return_value = ["employees.create"]

    other_org_dept_id = uuid.uuid4()

    # 1. get_actor_profile_id -> profile
    # 2. duplicate code check -> None
    # 3. department lookup in other org -> None (not found in current org)
    mock_session.scalar.side_effect = [
        auth_context["profile"],
        None,
        None,
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/v1/employees",
                headers=auth_context["headers"],
                json={
                    "employee_code": "EMP-999",
                    "first_name": "Test",
                    "last_name": "User",
                    "designation": "Dev",
                    "date_of_joining": "2024-01-01",
                    "department_id": str(other_org_dept_id),
                },
            )
        assert res.status_code == 400
        body = res.json()
        assert body["success"] is False
        assert body["error"]["code"] == "BAD_REQUEST"
        assert "Department not found in this organization" in body["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_employee_endpoints_require_permissions(auth_context) -> None:
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock()
    # Missing all employee permissions
    mock_session.scalars.return_value = ["organizations.view"]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # GET /employees -> 403
            res_get = await client.get("/api/v1/employees", headers=auth_context["headers"])
            assert res_get.status_code == 403
            assert "Permission 'employees.view' is required" in res_get.json()["error"]["message"]

            # POST /employees -> 403
            res_post = await client.post(
                "/api/v1/employees",
                headers=auth_context["headers"],
                json={"employee_code": "EMP-X", "first_name": "T", "last_name": "U", "designation": "D", "date_of_joining": "2024-01-01"},
            )
            assert res_post.status_code == 403
            assert "Permission 'employees.create' is required" in res_post.json()["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)
