import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.dependencies.tenant import get_tenant_session
from app.main import app
from app.models.employee import Employee
from app.models.identity import Profile
from app.models.training import TrainingEnrollment, TrainingProgram, TrainingSession
from tests.auth_helpers import create_test_token

ALL_PERMISSIONS = [
    "training.view",
    "training.create",
    "training.update",
    "training.delete",
    "training.enroll",
    "training.manage",
    "training.complete",
]


@pytest.fixture
def auth_context():
    user_id = str(uuid.uuid4())
    org_id = str(uuid.uuid4())
    token = create_test_token(user_id=user_id)
    profile_id = uuid.uuid4()
    profile = Profile(
        id=profile_id,
        auth_user_id=uuid.UUID(user_id),
        email="training_admin@example.com",
        first_name="Alice",
        last_name="Trainer",
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


def _create_mock_program(
    org_id: uuid.UUID,
    program_id: uuid.UUID | None = None,
    code: str = "TRN-001",
    status: str = "published",
    capacity: int = 20,
) -> TrainingProgram:
    return TrainingProgram(
        id=program_id or uuid.uuid4(),
        organization_id=org_id,
        code=code,
        title="Security & Compliance Workshop",
        description="Annual mandatory security training",
        category="security",
        provider="Internal SecOps",
        trainer="Sarah Connor",
        delivery_mode="in_person",
        duration_hours=Decimal("8.0"),
        capacity=capacity,
        cost=Decimal("150.00"),
        start_date=date(2025, 3, 1),
        end_date=date(2025, 3, 2),
        status=status,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def _create_mock_session(
    org_id: uuid.UUID,
    program_id: uuid.UUID,
    session_id: uuid.UUID | None = None,
    session_number: str = "SES-001",
    status: str = "scheduled",
    capacity: int = 10,
) -> TrainingSession:
    return TrainingSession(
        id=session_id or uuid.uuid4(),
        organization_id=org_id,
        training_program_id=program_id,
        session_number=session_number,
        title="Session 1 - Fundamentals",
        session_date=date(2025, 3, 1),
        start_time="09:00",
        end_time="17:00",
        location="Room 401",
        trainer="Sarah Connor",
        capacity=capacity,
        status=status,
        notes=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def _create_mock_employee(
    org_id: uuid.UUID,
    emp_id: uuid.UUID | None = None,
    profile_id: uuid.UUID | None = None,
    code: str = "EMP-001",
) -> Employee:
    return Employee(
        id=emp_id or uuid.uuid4(),
        organization_id=org_id,
        profile_id=profile_id,
        employee_code=code,
        first_name="Alice",
        last_name="Employee",
        work_email="alice.emp@example.com",
        status="active",
        employment_type="full_time",
        date_of_joining=date(2024, 1, 1),
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def _create_mock_enrollment(
    org_id: uuid.UUID,
    program_id: uuid.UUID,
    employee_id: uuid.UUID,
    session_id: uuid.UUID | None = None,
    enrollment_id: uuid.UUID | None = None,
    status: str = "enrolled",
) -> TrainingEnrollment:
    return TrainingEnrollment(
        id=enrollment_id or uuid.uuid4(),
        organization_id=org_id,
        training_program_id=program_id,
        training_session_id=session_id,
        employee_id=employee_id,
        enrollment_date=datetime.now(UTC).date(),
        status=status,
        completion_date=None,
        score=None,
        result=None,
        certificate_number=None,
        notes=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


# ==========================================
# 1. Training Programs Tests
# ==========================================


@pytest.mark.asyncio
async def test_list_training_programs(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    prog = _create_mock_program(org_id)

    mock_session = AsyncMock()

    # Mock execute count and rows
    mock_count_result = MagicMock()
    mock_count_result.scalar.return_value = 1

    mock_data_result = MagicMock()
    mock_data_result.scalars.return_value = [prog]

    mock_enroll_count = MagicMock()
    mock_enroll_count.scalar.return_value = 5

    mock_sess_count = MagicMock()
    mock_sess_count.scalar.return_value = 2

    mock_session.execute.side_effect = [mock_count_result, mock_data_result, mock_enroll_count, mock_sess_count]

    async def get_mock_session():
        yield mock_session

    app.dependency_overrides[get_tenant_session] = get_mock_session

    try:
        with patch("app.api.v1.training_programs.get_user_permissions", new_callable=AsyncMock) as mock_perms:
            mock_perms.return_value = set(ALL_PERMISSIONS)

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.get("/api/v1/training-programs", headers=auth_context["headers"])

                assert res.status_code == 200
                data = res.json()["data"]
                assert data["meta"]["total"] == 1
                assert len(data["items"]) == 1
                assert data["items"][0]["code"] == "TRN-001"
                assert data["items"][0]["enrolled_count"] == 5
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_training_program(auth_context):
    mock_session = AsyncMock()

    # check program code unique
    mock_code_check = MagicMock()
    mock_code_check.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_code_check

    async def get_mock_session():
        yield mock_session

    app.dependency_overrides[get_tenant_session] = get_mock_session

    payload = {
        "code": "SEC-101",
        "title": "Data Security Essentials",
        "description": "Critical security baseline",
        "category": "security",
        "provider": "SecAcademy",
        "trainer": "Bob Smith",
        "delivery_mode": "online",
        "duration_hours": 4.5,
        "capacity": 50,
        "cost": 99.00,
        "start_date": "2025-04-01",
        "end_date": "2025-04-01",
        "status": "draft",
    }

    try:
        with patch("app.dependencies.tenant.get_user_permissions", new_callable=AsyncMock) as mock_perms, \
             patch("app.api.v1.training_programs.get_user_permissions", new_callable=AsyncMock) as mock_perms2:
            mock_perms.return_value = set(ALL_PERMISSIONS)
            mock_perms2.return_value = set(ALL_PERMISSIONS)

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post("/api/v1/training-programs", json=payload, headers=auth_context["headers"])

                assert res.status_code == 201
                data = res.json()["data"]
                assert data["code"] == "SEC-101"
                assert data["title"] == "Data Security Essentials"
                assert data["status"] == "draft"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_publish_and_complete_training_program(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    program_id = uuid.uuid4()
    prog = _create_mock_program(org_id, program_id=program_id, status="draft")

    mock_session = AsyncMock()

    # get program
    mock_prog_result = MagicMock()
    mock_prog_result.scalar_one_or_none.return_value = prog
    mock_session.execute.return_value = mock_prog_result

    async def get_mock_session():
        yield mock_session

    app.dependency_overrides[get_tenant_session] = get_mock_session

    try:
        with patch("app.dependencies.tenant.get_user_permissions", new_callable=AsyncMock) as mock_perms:
            mock_perms.return_value = set(ALL_PERMISSIONS)

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                # 1. Publish
                res_pub = await ac.post(f"/api/v1/training-programs/{program_id}/publish", headers=auth_context["headers"])
                assert res_pub.status_code == 200
                assert res_pub.json()["data"]["status"] == "published"

                # 2. Complete
                res_comp = await ac.post(f"/api/v1/training-programs/{program_id}/complete", headers=auth_context["headers"])
                assert res_comp.status_code == 200
                assert res_comp.json()["data"]["status"] == "completed"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


# ==========================================
# 2. Training Sessions Tests
# ==========================================


@pytest.mark.asyncio
async def test_create_and_list_training_sessions(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    program_id = uuid.uuid4()
    prog = _create_mock_program(org_id, program_id=program_id, capacity=30)

    mock_session = AsyncMock()

    # program exists check + session number uniqueness check
    mock_prog_res = MagicMock()
    mock_prog_res.scalar_one_or_none.return_value = prog

    mock_code_check = MagicMock()
    mock_code_check.scalar_one_or_none.return_value = None

    mock_session.execute.side_effect = [mock_prog_res, mock_code_check]

    async def get_mock_session():
        yield mock_session

    app.dependency_overrides[get_tenant_session] = get_mock_session

    payload = {
        "training_program_id": str(program_id),
        "session_number": "SES-001",
        "title": "Module 1",
        "session_date": "2025-03-01",
        "start_time": "09:00",
        "end_time": "12:00",
        "location": "Room A",
        "trainer": "Sarah Connor",
        "capacity": 25,
    }

    try:
        with patch("app.dependencies.tenant.get_user_permissions", new_callable=AsyncMock) as mock_perms, \
             patch("app.api.v1.training_sessions.get_user_permissions", new_callable=AsyncMock) as mock_perms2:
            mock_perms.return_value = set(ALL_PERMISSIONS)
            mock_perms2.return_value = set(ALL_PERMISSIONS)

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post("/api/v1/training-sessions", json=payload, headers=auth_context["headers"])
                assert res.status_code == 201
                assert res.json()["data"]["session_number"] == "SES-001"
                assert res.json()["data"]["capacity"] == 25
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


# ==========================================
# 3. Training Enrollments Tests
# ==========================================


@pytest.mark.asyncio
async def test_enroll_employee_success(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    emp_id = uuid.uuid4()
    program_id = uuid.uuid4()

    prog = _create_mock_program(org_id, program_id=program_id, status="published", capacity=20)
    emp = _create_mock_employee(org_id, emp_id=emp_id)

    mock_session = AsyncMock()

    # 1. get emp
    mock_emp_res = MagicMock()
    mock_emp_res.scalar_one_or_none.return_value = emp

    # 2. get program
    mock_prog_res = MagicMock()
    mock_prog_res.scalar_one_or_none.return_value = prog

    # 3. duplicate enrollment check -> None
    mock_dup_res = MagicMock()
    mock_dup_res.scalar_one_or_none.return_value = None

    # 4. active enrollments count -> 2
    mock_count_res = MagicMock()
    mock_count_res.scalar.return_value = 2

    mock_session.execute.side_effect = [mock_emp_res, mock_prog_res, mock_dup_res, mock_count_res]

    async def get_mock_session():
        yield mock_session

    app.dependency_overrides[get_tenant_session] = get_mock_session

    payload = {
        "training_program_id": str(program_id),
        "employee_id": str(emp_id),
        "notes": "Mandatory security onboarding",
    }

    try:
        with patch("app.api.v1.training_enrollments.get_user_permissions", new_callable=AsyncMock) as mock_perms, \
             patch("app.api.v1.training_enrollments.resolve_employee_for_user", new_callable=AsyncMock) as mock_resolve:
            mock_perms.return_value = set(ALL_PERMISSIONS)
            mock_resolve.return_value = emp

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post("/api/v1/training-enrollments", json=payload, headers=auth_context["headers"])
                assert res.status_code == 201
                data = res.json()["data"]
                assert data["training_program_id"] == str(program_id)
                assert data["employee_id"] == str(emp_id)
                assert data["status"] == "enrolled"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_enroll_employee_duplicate_conflict(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    emp_id = uuid.uuid4()
    program_id = uuid.uuid4()

    prog = _create_mock_program(org_id, program_id=program_id, status="published", capacity=20)
    emp = _create_mock_employee(org_id, emp_id=emp_id)
    existing_enrollment = _create_mock_enrollment(org_id, program_id, emp_id, status="enrolled")

    mock_session = AsyncMock()

    # 1. get emp
    mock_emp_res = MagicMock()
    mock_emp_res.scalar_one_or_none.return_value = emp

    # 2. get program
    mock_prog_res = MagicMock()
    mock_prog_res.scalar_one_or_none.return_value = prog

    # 3. duplicate enrollment check -> exists!
    mock_dup_res = MagicMock()
    mock_dup_res.scalar_one_or_none.return_value = existing_enrollment

    mock_session.execute.side_effect = [mock_emp_res, mock_prog_res, mock_dup_res]

    async def get_mock_session():
        yield mock_session

    app.dependency_overrides[get_tenant_session] = get_mock_session

    payload = {
        "training_program_id": str(program_id),
        "employee_id": str(emp_id),
    }

    try:
        with patch("app.api.v1.training_enrollments.get_user_permissions", new_callable=AsyncMock) as mock_perms, \
             patch("app.api.v1.training_enrollments.resolve_employee_for_user", new_callable=AsyncMock) as mock_resolve:
            mock_perms.return_value = set(ALL_PERMISSIONS)
            mock_resolve.return_value = emp

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post("/api/v1/training-enrollments", json=payload, headers=auth_context["headers"])
                assert res.status_code == 409
                assert "already enrolled" in res.json()["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_enroll_employee_capacity_exceeded(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    emp_id = uuid.uuid4()
    program_id = uuid.uuid4()

    prog = _create_mock_program(org_id, program_id=program_id, status="published", capacity=5)
    emp = _create_mock_employee(org_id, emp_id=emp_id)

    mock_session = AsyncMock()

    # 1. get emp
    mock_emp_res = MagicMock()
    mock_emp_res.scalar_one_or_none.return_value = emp

    # 2. get prog
    mock_prog_res = MagicMock()
    mock_prog_res.scalar_one_or_none.return_value = prog

    # 3. dup check -> None
    mock_dup_res = MagicMock()
    mock_dup_res.scalar_one_or_none.return_value = None

    # Capacity is 5, active enrollments is 5
    mock_count_res = MagicMock()
    mock_count_res.scalar.return_value = 5

    mock_session.execute.side_effect = [mock_emp_res, mock_prog_res, mock_dup_res, mock_count_res]

    async def get_mock_session():
        yield mock_session

    app.dependency_overrides[get_tenant_session] = get_mock_session

    payload = {
        "training_program_id": str(program_id),
        "employee_id": str(emp_id),
    }

    try:
        with patch("app.api.v1.training_enrollments.get_user_permissions", new_callable=AsyncMock) as mock_perms, \
             patch("app.api.v1.training_enrollments.resolve_employee_for_user", new_callable=AsyncMock) as mock_resolve:
            mock_perms.return_value = set(ALL_PERMISSIONS)
            mock_resolve.return_value = emp

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post("/api/v1/training-enrollments", json=payload, headers=auth_context["headers"])
                assert res.status_code == 400
                assert "maximum capacity" in res.json()["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_attend_and_complete_enrollment(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    emp_id = uuid.uuid4()
    program_id = uuid.uuid4()
    enrollment_id = uuid.uuid4()

    enrollment = _create_mock_enrollment(org_id, program_id, emp_id, enrollment_id=enrollment_id, status="enrolled")

    mock_session = AsyncMock()

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = enrollment
    mock_session.execute.return_value = mock_res

    async def get_mock_session():
        yield mock_session

    app.dependency_overrides[get_tenant_session] = get_mock_session

    try:
        with patch("app.dependencies.tenant.get_user_permissions", new_callable=AsyncMock) as mock_perms:
            mock_perms.return_value = set(ALL_PERMISSIONS)

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                # 1. Attend
                res_attend = await ac.post(
                    f"/api/v1/training-enrollments/{enrollment_id}/attend",
                    json={"status": "attended", "notes": "Attended all sessions on time"},
                    headers=auth_context["headers"],
                )
                assert res_attend.status_code == 200
                assert res_attend.json()["data"]["status"] == "attended"

                # 2. Complete
                res_complete = await ac.post(
                    f"/api/v1/training-enrollments/{enrollment_id}/complete",
                    json={
                        "score": 95.5,
                        "result": "passed",
                        "certificate_number": "CERT-2025-001",
                        "notes": "Excellent performance",
                    },
                    headers=auth_context["headers"],
                )
                assert res_complete.status_code == 200
                data = res_complete.json()["data"]
                assert data["status"] == "completed"
                assert float(data["score"]) == 95.5
                assert data["result"] == "passed"
                assert data["certificate_number"] == "CERT-2025-001"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_cancel_enrollment(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    emp_id = uuid.uuid4()
    program_id = uuid.uuid4()
    enrollment_id = uuid.uuid4()

    enrollment = _create_mock_enrollment(org_id, program_id, emp_id, enrollment_id=enrollment_id, status="enrolled")
    emp = _create_mock_employee(org_id, emp_id=emp_id)

    mock_session = AsyncMock()

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = enrollment
    mock_session.execute.return_value = mock_res

    async def get_mock_session():
        yield mock_session

    app.dependency_overrides[get_tenant_session] = get_mock_session

    try:
        with patch("app.api.v1.training_enrollments.get_user_permissions", new_callable=AsyncMock) as mock_perms, \
             patch("app.api.v1.training_enrollments.resolve_employee_for_user", new_callable=AsyncMock) as mock_resolve:
            mock_perms.return_value = set(ALL_PERMISSIONS)
            mock_resolve.return_value = emp

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    f"/api/v1/training-enrollments/{enrollment_id}/cancel",
                    headers=auth_context["headers"],
                )
                assert res.status_code == 200
                assert res.json()["data"]["status"] == "cancelled"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_forbidden_access_without_permissions(auth_context):
    mock_session = AsyncMock()

    async def get_mock_session():
        yield mock_session

    app.dependency_overrides[get_tenant_session] = get_mock_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            with patch("app.api.v1.training_programs.get_user_permissions", new_callable=AsyncMock) as mock_perms:
                mock_perms.return_value = set()  # No permissions
                res = await ac.get("/api/v1/training-programs", headers=auth_context["headers"])
                assert res.status_code == 403
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)
