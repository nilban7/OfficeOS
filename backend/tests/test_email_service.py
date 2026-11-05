import smtplib
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.dependencies.tenant import get_tenant_session
from app.main import app
from app.models.email import EmailOutbox
from app.models.employee import Department, Employee
from app.models.identity import Profile
from app.models.leave import LeaveRequest, LeaveType
from app.services.email_service import EmailService
from app.services.notification_service import LeaveNotificationService
from tests.auth_helpers import create_test_token

# =========================================================================
# 1. Configuration & Validation Tests
# =========================================================================

def test_smtp_configuration_loading():
    settings = Settings(
        smtp_host="smtp.gmail.com",
        smtp_port=587,
        smtp_username="test@example.com",
        smtp_password="app-password-123",
        email_from_name="OfficeOS HR",
        email_from_address="hr@example.com",
        email_enabled=True,
        frontend_base_url="http://localhost:3000",
        database_url="postgresql+asyncpg://user:pass@localhost:5432/db",
    )
    assert settings.smtp_host == "smtp.gmail.com"
    assert settings.smtp_port == 587
    assert settings.smtp_username == "test@example.com"
    assert settings.smtp_password == "app-password-123"
    assert settings.email_from_name == "OfficeOS HR"
    assert settings.email_from_address == "hr@example.com"
    assert settings.email_enabled is True
    assert settings.is_smtp_configured is True
    assert settings.sender_email == "hr@example.com"


def test_missing_smtp_credentials_validation():
    with patch("app.services.email_service.get_settings") as mock_get_settings:
        mock_settings = MagicMock()
        mock_get_settings.return_value = mock_settings

        # Case 1: Disabled
        mock_settings.email_enabled = False
        mock_settings.smtp_host = "smtp.gmail.com"
        mock_settings.smtp_username = "test@example.com"
        mock_settings.smtp_password = "password"
        is_valid, err = EmailService.validate_configuration()
        assert is_valid is False
        assert "disabled" in err.lower()

        # Case 2: Missing Host
        mock_settings.email_enabled = True
        mock_settings.smtp_host = None
        is_valid, err = EmailService.validate_configuration()
        assert is_valid is False
        assert "smtp_host" in err.lower()

        # Case 3: Missing Username
        mock_settings.smtp_host = "smtp.gmail.com"
        mock_settings.smtp_username = None
        is_valid, err = EmailService.validate_configuration()
        assert is_valid is False
        assert "smtp_username" in err.lower()

        # Case 4: Missing Password
        mock_settings.smtp_username = "user@gmail.com"
        mock_settings.smtp_password = None
        is_valid, err = EmailService.validate_configuration()
        assert is_valid is False
        assert "smtp_password" in err.lower()

        # Case 5: Fully Configured
        mock_settings.smtp_password = "valid-app-password"
        is_valid, err = EmailService.validate_configuration()
        assert is_valid is True
        assert err is None


# =========================================================================
# 2. Template Rendering Tests
# =========================================================================

def test_template_rendering_html():
    service = EmailService()

    # Leave Request
    html_req = service.render_template(
        "leave_request.html",
        employee_name="John Doe",
        employee_code="EMP-101",
        department_name="Engineering",
        leave_type="Annual Leave",
        start_date="2026-12-01",
        end_date="2026-12-05",
        total_days="5.00",
        reason="Family vacation",
        approval_url="http://localhost:3000/leave?tab=approvals&request_id=123",
    )
    assert "John Doe" in html_req
    assert "EMP-101" in html_req
    assert "Annual Leave" in html_req
    assert "Family vacation" in html_req
    assert "http://localhost:3000/leave?tab=approvals" in html_req
    assert "request_id=123" in html_req
    assert "Review Leave Request" in html_req

    # Leave Approved
    html_approved = service.render_template(
        "leave_approved.html",
        employee_name="John Doe",
        leave_type="Annual Leave",
        start_date="2026-12-01",
        end_date="2026-12-05",
        total_days="5.00",
        reviewer_name="Jane Smith",
        reviewer_comment="Have a great break!",
        leave_url="http://localhost:3000/leave",
    )
    assert "Your leave request has been approved" in html_approved
    assert "Jane Smith" in html_approved
    assert "Have a great break!" in html_approved

    # Leave Rejected
    html_rejected = service.render_template(
        "leave_rejected.html",
        employee_name="John Doe",
        leave_type="Annual Leave",
        start_date="2026-12-01",
        end_date="2026-12-05",
        total_days="5.00",
        reviewer_name="Jane Smith",
        reviewer_comment="Quarter-end deployment deadline",
        leave_url="http://localhost:3000/leave",
    )
    assert "could not be approved at this time" in html_rejected
    assert "Quarter-end deployment deadline" in html_rejected


# =========================================================================
# 3. SMTP Sending Tests (Mocked smtplib)
# =========================================================================

def test_send_smtp_email_success():
    with patch("app.services.email_service.get_settings") as mock_get_settings, \
         patch("smtplib.SMTP") as mock_smtp_cls:
        mock_settings = MagicMock()
        mock_settings.email_enabled = True
        mock_settings.smtp_host = "smtp.gmail.com"
        mock_settings.smtp_port = 587
        mock_settings.smtp_username = "test@example.com"
        mock_settings.smtp_password = "secret-password"
        mock_settings.email_from_name = "OfficeOS"
        mock_settings.sender_email = "test@example.com"
        mock_get_settings.return_value = mock_settings

        mock_server = MagicMock()
        mock_smtp_cls.return_value.__enter__.return_value = mock_server

        success, err = EmailService.send_smtp_email(
            recipient_email="recipient@example.com",
            subject="Test Subject",
            html_content="<p>HTML body</p>",
            text_content="Plain text body",
        )

        assert success is True
        assert err is None
        mock_server.starttls.assert_called_once()
        mock_server.login.assert_called_once_with("test@example.com", "secret-password")
        mock_server.send_message.assert_called_once()


def test_send_smtp_email_auth_failure():
    with patch("app.services.email_service.get_settings") as mock_get_settings, \
         patch("smtplib.SMTP") as mock_smtp_cls:
        mock_settings = MagicMock()
        mock_settings.email_enabled = True
        mock_settings.smtp_host = "smtp.gmail.com"
        mock_settings.smtp_port = 587
        mock_settings.smtp_username = "test@example.com"
        mock_settings.smtp_password = "bad-password"
        mock_settings.email_from_name = "OfficeOS"
        mock_settings.sender_email = "test@example.com"
        mock_get_settings.return_value = mock_settings

        mock_server = MagicMock()
        mock_server.login.side_effect = smtplib.SMTPAuthenticationError(535, b"Authentication failed")
        mock_smtp_cls.return_value.__enter__.return_value = mock_server

        success, err = EmailService.send_smtp_email(
            recipient_email="recipient@example.com",
            subject="Test Subject",
            html_content="<p>HTML body</p>",
        )

        assert success is False
        assert "authentication" in err.lower()
        # Credentials must not leak in error message
        assert "bad-password" not in err


def test_send_smtp_email_connection_failure():
    with patch("app.services.email_service.get_settings") as mock_get_settings, \
         patch("smtplib.SMTP") as mock_smtp_cls:
        mock_settings = MagicMock()
        mock_settings.email_enabled = True
        mock_settings.smtp_host = "smtp.gmail.com"
        mock_settings.smtp_port = 587
        mock_settings.smtp_username = "test@example.com"
        mock_settings.smtp_password = "secret-password"
        mock_settings.email_from_name = "OfficeOS"
        mock_settings.sender_email = "test@example.com"
        mock_get_settings.return_value = mock_settings

        mock_smtp_cls.side_effect = smtplib.SMTPConnectError(421, b"Connection refused")

        success, err = EmailService.send_smtp_email(
            recipient_email="recipient@example.com",
            subject="Test Subject",
            html_content="<p>HTML body</p>",
        )

        assert success is False
        assert "connection" in err.lower()


# =========================================================================
# 4. Outbox Enqueue & Processing Tests
# =========================================================================

@pytest.mark.asyncio
async def test_enqueue_email():
    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()
    org_id = uuid.uuid4()
    req_id = uuid.uuid4()

    item = await EmailService.enqueue_email(
        session=mock_session,
        organization_id=org_id,
        recipient_email="manager@company.com",
        subject="Leave Application",
        html_content="<p>Review</p>",
        text_content="Review",
        email_type="leave_request",
        related_entity_type="leave_request",
        related_entity_id=req_id,
    )

    assert item.recipient_email == "manager@company.com"
    assert item.status == "PENDING"
    assert item.organization_id == org_id
    assert item.related_entity_id == req_id
    mock_session.add.assert_called_once_with(item)
    mock_session.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_process_outbox_item_success():
    item_id = uuid.uuid4()
    mock_item = EmailOutbox(
        id=item_id,
        organization_id=uuid.uuid4(),
        recipient_email="target@example.com",
        subject="Hello",
        body_html="<p>Hello</p>",
        body_text="Hello",
        status="PENDING",
        retry_count=0,
        max_retries=3,
    )

    mock_session = AsyncMock()
    mock_session.scalar.return_value = mock_item

    mock_cm = AsyncMock()
    mock_cm.__aenter__.return_value = mock_session
    mock_cm.__aexit__.return_value = None

    with patch("app.services.email_service.session_factory", return_value=mock_cm), \
         patch.object(EmailService, "send_smtp_email", return_value=(True, None)) as mock_send:

        await EmailService.process_outbox_item(item_id)

        assert mock_item.status == "SENT"
        assert mock_item.sent_at is not None
        mock_send.assert_called_once_with(
            recipient_email="target@example.com",
            subject="Hello",
            html_content="<p>Hello</p>",
            text_content="Hello",
            recipient_name=None,
        )


@pytest.mark.asyncio
async def test_process_outbox_item_failure_and_retry():
    item_id = uuid.uuid4()
    mock_item = EmailOutbox(
        id=item_id,
        organization_id=uuid.uuid4(),
        recipient_email="target@example.com",
        subject="Hello",
        body_html="<p>Hello</p>",
        body_text="Hello",
        status="PENDING",
        retry_count=0,
        max_retries=3,
    )

    mock_session = AsyncMock()
    mock_session.scalar.return_value = mock_item

    mock_cm = AsyncMock()
    mock_cm.__aenter__.return_value = mock_session
    mock_cm.__aexit__.return_value = None

    with patch("app.services.email_service.session_factory", return_value=mock_cm), \
         patch.object(EmailService, "send_smtp_email", return_value=(False, "Connection timed out")):

        await EmailService.process_outbox_item(item_id)

        # First failure increments retry count and keeps status PENDING for retry
        assert mock_item.status == "PENDING"
        assert mock_item.retry_count == 1
        assert "Connection timed out" in mock_item.error_details

        # When at max retries, it becomes FAILED
        mock_item.retry_count = 3
        await EmailService.process_outbox_item(item_id)
        assert mock_item.status == "FAILED"


# =========================================================================
# 5. Leave Notification Service Unit Tests
# =========================================================================

@pytest.mark.asyncio
async def test_leave_notification_service_resolution():
    org_id = uuid.uuid4()
    mgr_id = uuid.uuid4()

    manager = Employee(
        id=mgr_id,
        organization_id=org_id,
        first_name="Manager",
        last_name="One",
        work_email="manager@company.com",
    )

    employee = Employee(
        id=uuid.uuid4(),
        organization_id=org_id,
        first_name="Jane",
        last_name="Doe",
        reporting_manager_id=mgr_id,
        work_email="jane@company.com",
    )

    mock_session = AsyncMock()
    mock_session.scalar.return_value = manager

    email, name = await LeaveNotificationService.resolve_manager_email(mock_session, org_id, employee)
    assert email == "manager@company.com"
    assert "Manager" in name

    emp_email, emp_name = await LeaveNotificationService.resolve_employee_email(mock_session, employee)
    assert emp_email == "jane@company.com"
    assert emp_name == "Jane Doe"

    req_id = uuid.uuid4()
    with patch("app.services.notification_service.get_settings") as mock_settings_fn:
        mock_settings = MagicMock()
        mock_settings.frontend_base_url = "http://localhost:3000"
        mock_settings_fn.return_value = mock_settings

        outbox_entry = await LeaveNotificationService.send_leave_requested_notification(
            session=mock_session,
            organization_id=org_id,
            leave_request=LeaveRequest(
                id=req_id,
                organization_id=org_id,
                employee_id=employee.id,
                leave_type_id=uuid.uuid4(),
                start_date=date(2026, 11, 1),
                end_date=date(2026, 11, 2),
                total_days=Decimal("2.00"),
                reason="Rest",
            ),
            employee=employee,
            leave_type=LeaveType(
                id=uuid.uuid4(),
                organization_id=org_id,
                name="Casual Leave",
                code="CL",
            ),
        )
        assert outbox_entry is not None
        assert outbox_entry.recipient_email == "manager@company.com"
        assert "Review" in outbox_entry.subject
        assert "http://localhost:3000/leave?tab=approvals" in outbox_entry.body_html


# =========================================================================
# 6. End-to-End Leave Workflow & Outbox Resilience Tests
# =========================================================================

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
        work_email="jane@example.com",
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
        ),
    )


@pytest.mark.asyncio
async def test_email_failure_does_not_break_leave_request(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    emp = _create_mock_employee(org_id)
    emp.profile_id = auth_context["profile_id"]

    lt = LeaveType(
        id=uuid.uuid4(),
        organization_id=org_id,
        name="Sick Leave",
        code="SL",
        annual_allocation=Decimal(10),
        is_paid=True,
        requires_approval=True,
        is_active=True,
    )

    req_id = uuid.uuid4()
    req_created = LeaveRequest(
        id=req_id,
        organization_id=org_id,
        employee_id=emp.id,
        employee=emp,
        leave_type_id=lt.id,
        leave_type=lt,
        start_date=date(2026, 12, 10),
        end_date=date(2026, 12, 11),
        total_days=Decimal("2.00"),
        reason="Doctor appointment",
        status="pending",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_session = AsyncMock()
    mock_session.flush = AsyncMock()

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

    payload = {
        "leave_type_id": str(lt.id),
        "start_date": "2026-12-10",
        "end_date": "2026-12-11",
        "reason": "Doctor appointment",
    }

    # Simulate email service throwing an error during notification
    with patch.object(LeaveNotificationService, "send_leave_requested_notification", side_effect=Exception("SMTP Down")):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers=auth_context["headers"],
        ) as client:
            resp = await client.post(
                "/api/v1/leave-requests",
                json=payload,
            )

            # Leave request creation MUST succeed despite email notification error
            assert resp.status_code == 201
            assert resp.json()["success"] is True

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_unauthorized_user_cannot_approve_request(auth_context):
    mock_session = AsyncMock()

    # User lacks leave.approve or leave.manage
    mock_session.scalars.return_value = ["leave.view"]
    mock_session.scalar.return_value = auth_context["profile"]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    req_id = uuid.uuid4()
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers=auth_context["headers"],
    ) as client:
        resp = await client.post(
            f"/api/v1/leave-requests/{req_id}/approve",
            json={"reviewer_comment": "Approved"},
        )
        assert resp.status_code == 403

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_duplicate_approval_prevention(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    mock_session = AsyncMock()

    emp = _create_mock_employee(org_id)
    lt = LeaveType(
        id=uuid.uuid4(),
        organization_id=org_id,
        name="Annual Leave",
        code="AL",
    )
    req_id = uuid.uuid4()
    # Already approved record
    already_approved = LeaveRequest(
        id=req_id,
        organization_id=org_id,
        employee_id=emp.id,
        employee=emp,
        leave_type_id=lt.id,
        leave_type=lt,
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 3),
        total_days=Decimal("3.00"),
        status="approved",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    mock_session.scalars.return_value = ["leave.approve"]
    mock_session.scalar.side_effect = [
        auth_context["profile"],  # get_actor_profile_id
        already_approved,         # load record
    ]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers=auth_context["headers"],
    ) as client:
        resp = await client.post(
            f"/api/v1/leave-requests/{req_id}/approve",
            json={"reviewer_comment": "Re-approving"},
        )
        # Cannot approve an already approved request -> 400 Bad Request
        assert resp.status_code == 400
        assert "only pending requests can be approved" in resp.text.lower()

    app.dependency_overrides.clear()
