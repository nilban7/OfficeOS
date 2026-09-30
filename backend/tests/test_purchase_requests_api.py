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
from app.models.procurement import PurchaseRequest
from tests.auth_helpers import create_test_token

ALL_PERMISSIONS = [
    "procurement.view",
    "procurement.create",
    "procurement.update",
    "procurement.delete",
    "procurement.approve",
    "purchase_orders.view",
    "purchase_orders.manage",
    "vendors.view",
    "vendors.manage",
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
        email="emp@example.com",
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


def _create_mock_employee(
    org_id: uuid.UUID, emp_id: uuid.UUID | None = None, code: str = "EMP-001"
) -> Employee:
    return Employee(
        id=emp_id or uuid.uuid4(),
        organization_id=org_id,
        employee_code=code,
        first_name="Jane",
        last_name="Doe",
        designation="Operations Lead",
        employment_type="full_time",
        status="active",
        date_of_joining=date(2025, 1, 1),
        is_active=True,
    )


def _create_mock_pr(
    org_id: uuid.UUID,
    requester: Employee,
    pr_id: uuid.UUID | None = None,
    status: str = "draft",
    request_number: str = "PR-202609-0001",
) -> PurchaseRequest:
    return PurchaseRequest(
        id=pr_id or uuid.uuid4(),
        organization_id=org_id,
        request_number=request_number,
        requester_id=requester.id,
        department_id=None,
        required_date=date(2026, 10, 1),
        priority="medium",
        purpose="Procurement of server hardware",
        estimated_amount=Decimal("4500.00"),
        currency="USD",
        status=status,
        reviewer_id=None,
        reviewed_at=None,
        reviewer_comment=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_list_purchase_requests(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    emp = _create_mock_employee(org_id)
    pr1 = _create_mock_pr(org_id, emp, status="draft", request_number="PR-202609-0001")
    pr2 = _create_mock_pr(org_id, emp, status="approved", request_number="PR-202609-0002")
    pr1.requester = emp
    pr2.requester = emp

    mock_session = AsyncMock()
    mock_session.scalar.return_value = emp
    mock_session.scalars.return_value = ALL_PERMISSIONS

    # Mock count and list execution
    count_res = MagicMock()
    count_res.scalar.return_value = 2

    list_res = MagicMock()
    list_res.scalars.return_value.all.return_value = [pr1, pr2]

    mock_session.execute.side_effect = [count_res, list_res]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/api/v1/purchase-requests", headers=auth_context["headers"])
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]["items"]) == 2
        assert data["data"]["meta"]["total"] == 2
        assert data["data"]["items"][0]["request_number"] == "PR-202609-0001"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_purchase_request_success(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    emp = _create_mock_employee(org_id)

    mock_session = AsyncMock()
    mock_session.scalar.return_value = emp
    mock_session.scalars.return_value = ALL_PERMISSIONS
    mock_session.flush = AsyncMock()
    mock_session.add = MagicMock()

    # Number generation query returns None (first number)
    num_res = MagicMock()
    num_res.scalar_one_or_none.return_value = None

    # get_purchase_request fetch query returns the PR
    get_res = MagicMock()
    created_pr = _create_mock_pr(org_id, emp)
    created_pr.requester = emp
    get_res.scalar_one_or_none.return_value = created_pr

    mock_session.execute.side_effect = [num_res, get_res]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    payload = {
        "purpose": "Procure ergonomic desk chairs",
        "estimated_amount": 1200.50,
        "priority": "high",
        "currency": "USD",
    }

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post(
                "/api/v1/purchase-requests",
                json=payload,
                headers=auth_context["headers"],
            )
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert data["data"]["purpose"] == "Procurement of server hardware"
        assert data["data"]["status"] == "draft"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_purchase_request_fails_if_user_has_no_employee_profile(auth_context):
    mock_session = AsyncMock()
    mock_session.scalar.return_value = None  # No employee profile
    mock_session.scalars.return_value = ALL_PERMISSIONS

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    payload = {
        "purpose": "Procure test monitors",
        "estimated_amount": 500.00,
    }

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post(
                "/api/v1/purchase-requests",
                json=payload,
                headers=auth_context["headers"],
            )
        assert response.status_code == 400
        assert "active employee profile" in response.json()["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_update_purchase_request_draft_success(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    emp = _create_mock_employee(org_id)
    pr = _create_mock_pr(org_id, emp, status="draft")
    pr.requester = emp

    mock_session = AsyncMock()
    mock_session.scalar.return_value = emp
    mock_session.scalars.return_value = ALL_PERMISSIONS
    mock_session.flush = AsyncMock()

    fetch_res = MagicMock()
    fetch_res.scalar_one_or_none.return_value = pr
    mock_session.execute.return_value = fetch_res

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    payload = {
        "purpose": "Updated purpose: enterprise server upgrade",
        "estimated_amount": 6000.00,
        "priority": "urgent",
    }

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.patch(
                f"/api/v1/purchase-requests/{pr.id}",
                json=payload,
                headers=auth_context["headers"],
            )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert pr.purpose == "Updated purpose: enterprise server upgrade"
        assert pr.priority == "urgent"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_update_purchase_request_fails_if_not_draft(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    emp = _create_mock_employee(org_id)
    pr = _create_mock_pr(org_id, emp, status="submitted")
    pr.requester = emp

    mock_session = AsyncMock()
    mock_session.scalar.return_value = emp
    mock_session.scalars.return_value = ALL_PERMISSIONS

    fetch_res = MagicMock()
    fetch_res.scalar_one_or_none.return_value = pr
    mock_session.execute.return_value = fetch_res

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    payload = {"purpose": "Attempted update on submitted request"}

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.patch(
                f"/api/v1/purchase-requests/{pr.id}",
                json=payload,
                headers=auth_context["headers"],
            )
        assert response.status_code == 400
        assert "Only draft purchase requests can be modified" in response.json()["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_submit_purchase_request_success(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    emp = _create_mock_employee(org_id)
    pr = _create_mock_pr(org_id, emp, status="draft")
    pr.requester = emp

    mock_session = AsyncMock()
    mock_session.scalar.return_value = emp
    mock_session.scalars.return_value = ALL_PERMISSIONS
    mock_session.flush = AsyncMock()

    fetch_res = MagicMock()
    fetch_res.scalar_one_or_none.return_value = pr
    mock_session.execute.return_value = fetch_res

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post(
                f"/api/v1/purchase-requests/{pr.id}/submit",
                headers=auth_context["headers"],
            )
        assert response.status_code == 200
        assert pr.status == "submitted"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_approve_purchase_request_success(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    requester = _create_mock_employee(org_id, emp_id=uuid.uuid4(), code="EMP-REQ")
    reviewer = _create_mock_employee(org_id, emp_id=uuid.uuid4(), code="EMP-MGR")
    pr = _create_mock_pr(org_id, requester, status="submitted")
    pr.requester = requester

    mock_session = AsyncMock()
    mock_session.scalar.return_value = reviewer
    mock_session.scalars.return_value = ALL_PERMISSIONS
    mock_session.flush = AsyncMock()

    fetch_res = MagicMock()
    fetch_res.scalar_one_or_none.return_value = pr
    mock_session.execute.return_value = fetch_res

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    payload = {"reviewer_comment": "Approved for Q4 hardware budget"}

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post(
                f"/api/v1/purchase-requests/{pr.id}/approve",
                json=payload,
                headers=auth_context["headers"],
            )
        assert response.status_code == 200
        assert pr.status == "approved"
        assert pr.reviewer_id == reviewer.id
        assert pr.reviewer_comment == "Approved for Q4 hardware budget"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_approve_purchase_request_prevents_self_approval(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    same_emp = _create_mock_employee(org_id)
    pr = _create_mock_pr(org_id, same_emp, status="submitted")
    pr.requester = same_emp

    mock_session = AsyncMock()
    mock_session.scalar.return_value = same_emp
    mock_session.scalars.return_value = ALL_PERMISSIONS

    fetch_res = MagicMock()
    fetch_res.scalar_one_or_none.return_value = pr
    mock_session.execute.return_value = fetch_res

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    payload = {"reviewer_comment": "Attempting self approval"}

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post(
                f"/api/v1/purchase-requests/{pr.id}/approve",
                json=payload,
                headers=auth_context["headers"],
            )
        assert response.status_code == 400
        assert (
            "Requesters cannot review or approve their own purchase requests"
            in response.json()["error"]["message"]
        )
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_cancel_purchase_request_success(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    emp = _create_mock_employee(org_id)
    pr = _create_mock_pr(org_id, emp, status="submitted")
    pr.requester = emp

    mock_session = AsyncMock()
    mock_session.scalar.return_value = emp
    mock_session.scalars.return_value = ALL_PERMISSIONS
    mock_session.flush = AsyncMock()

    fetch_res = MagicMock()
    fetch_res.scalar_one_or_none.return_value = pr
    mock_session.execute.return_value = fetch_res

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post(
                f"/api/v1/purchase-requests/{pr.id}/cancel",
                headers=auth_context["headers"],
            )
        assert response.status_code == 200
        assert pr.status == "cancelled"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)
