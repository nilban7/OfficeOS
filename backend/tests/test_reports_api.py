"""Unit and integration tests for Reports & Dashboards API and service aggregation."""

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session
from app.main import app
from app.schemas.reports import (
    AssetCategoryDistribution,
    AssetReport,
    AttendanceDayTrend,
    AttendanceReport,
    AuditActionDistribution,
    AuditActivityReport,
    AuditDayActivity,
    AuditEntityDistribution,
    BranchDistribution,
    ClientProjectCount,
    DepartmentDistribution,
    DocumentCategoryDistribution,
    DocumentsReport,
    ExecutiveOverviewReport,
    ExpenseCategoryBreakdown,
    FinanceReport,
    InternshipReport,
    LeaveReport,
    LeaveTypeDistribution,
    MaintenanceReport,
    OperationsReport,
    ProcurementReport,
    ProjectReport,
    ProjectStatusDistribution,
    TaskStatusDistribution,
    TrainingReport,
    WorkforceReport,
)
from app.services.reports import ReportsService


@pytest.fixture
def mock_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=str(uuid4()),
        email="analyst@example.com",
        claims={},
    )


@pytest.fixture
def org_id():
    return uuid4()


# ---------------------------------------------------------------------------
# Unit tests for ReportsService date range validation & precision
# ---------------------------------------------------------------------------


def test_validate_date_range_defaults():
    from_date, to_date = ReportsService.validate_date_range(None, None, default_days=30)
    assert to_date >= from_date
    assert (to_date - from_date).days == 30


def test_validate_date_range_custom_valid():
    start = date(2026, 1, 1)
    end = date(2026, 1, 31)
    from_date, to_date = ReportsService.validate_date_range(start, end)
    assert from_date == start
    assert to_date == end


def test_validate_date_range_invalid_order_raises():
    start = date(2026, 2, 1)
    end = date(2026, 1, 1)
    with pytest.raises(Exception) as exc_info:
        ReportsService.validate_date_range(start, end)
    assert "date_from must be less than or equal to date_to" in str(exc_info.value.detail)


def test_validate_date_range_exceeds_max_days_raises():
    start = date(2025, 1, 1)
    end = date(2026, 6, 1)
    with pytest.raises(Exception) as exc_info:
        ReportsService.validate_date_range(start, end, max_days=365)
    assert "exceeds maximum allowed range" in str(exc_info.value.detail)


# ---------------------------------------------------------------------------
# API Route Tests (FastAPI with overridden dependencies)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_api_overview_authorized_with_finance(mock_user: AuthenticatedUser, org_id):
    mock_report = ExecutiveOverviewReport(
        active_employees_count=42,
        attendance_today_count=38,
        attendance_rate_today=Decimal("90.5"),
        pending_leaves_count=3,
        active_projects_count=7,
        active_clients_count=12,
        pending_purchase_requests_count=2,
        open_maintenance_requests_count=1,
        open_operations_tasks_count=5,
        upcoming_training_sessions_count=3,
        active_internships_count=4,
        documents_count=15,
        unread_notifications_count=2,
        finance_metrics_included=True,
        total_expenses_mtd=Decimal("15420.50"),
        pending_expenses_count=2,
    )

    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.api.v1.reports.get_user_permissions", new=AsyncMock(return_value=["reports.view", "reports.finance"])),
            patch("app.api.v1.reports.get_profile", new=AsyncMock(return_value=None)),
            patch.object(ReportsService, "get_overview", new=AsyncMock(return_value=mock_report)) as mock_svc,
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get("/api/v1/reports/overview", headers={"X-Organization-Id": str(org_id)})

            assert res.status_code == 200
            body = res.json()
            assert body["success"] is True
            assert body["data"]["active_employees_count"] == 42
            assert body["data"]["finance_metrics_included"] is True
            assert body["data"]["total_expenses_mtd"] == "15420.50"
            mock_svc.assert_called_once()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_overview_forbidden_without_reports_view(mock_user: AuthenticatedUser, org_id):
    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with patch("app.api.v1.reports.get_user_permissions", new=AsyncMock(return_value=["some.other.permission"])):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get("/api/v1/reports/overview", headers={"X-Organization-Id": str(org_id)})

            assert res.status_code == 403
            assert "One of the following permissions is required" in res.json()["error"]["message"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_workforce_report_success(mock_user: AuthenticatedUser, org_id):
    mock_report = WorkforceReport(
        total_employees=50,
        active_employees=45,
        probation_employees=3,
        notice_period_employees=1,
        on_leave_employees=1,
        suspended_employees=0,
        terminated_employees=2,
        departments=[DepartmentDistribution(department_id=uuid4(), department_name="Engineering", count=25)],
        branches=[BranchDistribution(branch_id=uuid4(), branch_name="Main", count=50)],
    )

    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.api.v1.reports.get_user_permissions", new=AsyncMock(return_value=["reports.workforce"])),
            patch.object(ReportsService, "get_workforce_report", new=AsyncMock(return_value=mock_report)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get("/api/v1/reports/workforce", headers={"X-Organization-Id": str(org_id)})

            assert res.status_code == 200
            data = res.json()["data"]
            assert data["total_employees"] == 50
            assert data["active_employees"] == 45
            assert len(data["departments"]) == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_attendance_report_success(mock_user: AuthenticatedUser, org_id):
    today = date(2026, 9, 30)
    mock_report = AttendanceReport(
        date_from=today - timedelta(days=7),
        date_to=today,
        total_records=280,
        present_count=260,
        absent_count=10,
        late_count=8,
        half_day_count=2,
        on_leave_count=0,
        attendance_rate=Decimal("96.4"),
        daily_trends=[
            AttendanceDayTrend(
                date=today,
                present_count=38,
                absent_count=2,
                late_count=1,
                half_day_count=1,
                on_leave_count=0,
                total_records=42,
                attendance_rate=Decimal("95.2"),
            )
        ],
    )

    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.api.v1.reports.get_user_permissions", new=AsyncMock(return_value=["reports.attendance"])),
            patch.object(ReportsService, "get_attendance_report", new=AsyncMock(return_value=mock_report)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get("/api/v1/reports/attendance", headers={"X-Organization-Id": str(org_id)})

            assert res.status_code == 200
            data = res.json()["data"]
            assert data["attendance_rate"] == "96.4"
            assert len(data["daily_trends"]) == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_leave_report_success(mock_user: AuthenticatedUser, org_id):
    today = date(2026, 9, 30)
    mock_report = LeaveReport(
        date_from=today - timedelta(days=30),
        date_to=today,
        pending_count=4,
        approved_count=12,
        rejected_count=1,
        cancelled_count=2,
        total_requests=19,
        total_approved_days=Decimal("34.50"),
        leave_types=[
            LeaveTypeDistribution(
                leave_type_id=uuid4(),
                leave_type_name="Annual Leave",
                request_count=10,
                total_days=Decimal("25.00"),
            )
        ],
    )

    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.api.v1.reports.get_user_permissions", new=AsyncMock(return_value=["reports.leave"])),
            patch.object(ReportsService, "get_leave_report", new=AsyncMock(return_value=mock_report)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get("/api/v1/reports/leave", headers={"X-Organization-Id": str(org_id)})

            assert res.status_code == 200
            data = res.json()["data"]
            assert data["approved_count"] == 12
            assert data["total_approved_days"] == "34.50"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_finance_report_strict_decimal_precision(mock_user: AuthenticatedUser, org_id):
    today = date(2026, 9, 30)
    mock_report = FinanceReport(
        date_from=today - timedelta(days=30),
        date_to=today,
        total_expenses=Decimal("12345.67"),
        submitted_expenses_total=Decimal("2345.67"),
        approved_expenses_total=Decimal("5000.00"),
        paid_expenses_total=Decimal("5000.00"),
        total_debits=Decimal("25000.00"),
        total_credits=Decimal("18500.50"),
        expenses_by_category=[
            ExpenseCategoryBreakdown(
                category_id=uuid4(),
                category_name="Cloud Infrastructure",
                total_amount=Decimal("12345.67"),
                expense_count=4,
            )
        ],
    )

    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.api.v1.reports.get_user_permissions", new=AsyncMock(return_value=["reports.finance"])),
            patch.object(ReportsService, "get_finance_report", new=AsyncMock(return_value=mock_report)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get("/api/v1/reports/finance", headers={"X-Organization-Id": str(org_id)})

            assert res.status_code == 200
            data = res.json()["data"]
            # Verify exact Decimal string representation in JSON, no float loss
            assert data["total_expenses"] == "12345.67"
            assert data["total_credits"] == "18500.50"
            assert data["expenses_by_category"][0]["total_amount"] == "12345.67"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_finance_report_forbidden_for_ordinary_employee(mock_user: AuthenticatedUser, org_id):
    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with patch("app.api.v1.reports.get_user_permissions", new=AsyncMock(return_value=["reports.view"])):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get("/api/v1/reports/finance", headers={"X-Organization-Id": str(org_id)})

            assert res.status_code == 403
            assert "finance.view" in res.json()["error"]["message"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_projects_report_success(mock_user: AuthenticatedUser, org_id):
    mock_report = ProjectReport(
        total_projects=10,
        active_projects=6,
        completed_projects=3,
        on_hold_projects=1,
        cancelled_projects=0,
        total_budget=Decimal("150000.00"),
        status_distribution=[ProjectStatusDistribution(status="active", count=6)],
        client_distribution=[ClientProjectCount(client_id=uuid4(), client_name="Acme Corp", project_count=4)],
    )

    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.api.v1.reports.get_user_permissions", new=AsyncMock(return_value=["reports.view"])),
            patch.object(ReportsService, "get_project_report", new=AsyncMock(return_value=mock_report)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get("/api/v1/reports/projects", headers={"X-Organization-Id": str(org_id)})

            assert res.status_code == 200
            data = res.json()["data"]
            assert data["total_projects"] == 10
            assert data["total_budget"] == "150000.00"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_procurement_report_success(mock_user: AuthenticatedUser, org_id):
    mock_report = ProcurementReport(
        total_purchase_requests=15,
        pending_purchase_requests=3,
        approved_purchase_requests=10,
        rejected_purchase_requests=2,
        total_purchase_orders=8,
        open_purchase_orders=2,
        closed_purchase_orders=6,
        total_vendors_count=5,
        total_estimated_requests_amount=Decimal("45000.00"),
    )

    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.api.v1.reports.get_user_permissions", new=AsyncMock(return_value=["reports.procurement"])),
            patch.object(ReportsService, "get_procurement_report", new=AsyncMock(return_value=mock_report)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get("/api/v1/reports/procurement", headers={"X-Organization-Id": str(org_id)})

            assert res.status_code == 200
            data = res.json()["data"]
            assert data["total_purchase_requests"] == 15
            assert data["total_vendors_count"] == 5
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_asset_report_success(mock_user: AuthenticatedUser, org_id):
    mock_report = AssetReport(
        total_assets=60,
        available_assets=20,
        assigned_assets=35,
        under_maintenance_assets=3,
        retired_assets=2,
        total_purchase_cost=Decimal("78000.00"),
        category_distribution=[AssetCategoryDistribution(category="Laptops", count=40)],
    )

    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.api.v1.reports.get_user_permissions", new=AsyncMock(return_value=["reports.view"])),
            patch.object(ReportsService, "get_asset_report", new=AsyncMock(return_value=mock_report)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get("/api/v1/reports/assets", headers={"X-Organization-Id": str(org_id)})

            assert res.status_code == 200
            data = res.json()["data"]
            assert data["total_assets"] == 60
            assert data["total_purchase_cost"] == "78000.00"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_maintenance_report_success(mock_user: AuthenticatedUser, org_id):
    mock_report = MaintenanceReport(
        open_requests_count=2,
        in_progress_requests_count=1,
        completed_requests_count=8,
        total_requests_count=11,
        total_records_count=8,
        total_maintenance_cost=Decimal("3450.00"),
        total_labor_cost=Decimal("2000.00"),
        total_parts_cost=Decimal("1450.00"),
    )

    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.api.v1.reports.get_user_permissions", new=AsyncMock(return_value=["reports.maintenance"])),
            patch.object(ReportsService, "get_maintenance_report", new=AsyncMock(return_value=mock_report)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get("/api/v1/reports/maintenance", headers={"X-Organization-Id": str(org_id)})

            assert res.status_code == 200
            data = res.json()["data"]
            assert data["total_maintenance_cost"] == "3450.00"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_training_report_success(mock_user: AuthenticatedUser, org_id):
    mock_report = TrainingReport(
        total_programs=5,
        active_programs=4,
        upcoming_sessions=3,
        completed_sessions=10,
        total_enrollments=50,
        completed_enrollments=45,
        cancelled_enrollments=5,
        completion_rate=Decimal("90.0"),
    )

    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.api.v1.reports.get_user_permissions", new=AsyncMock(return_value=["reports.view"])),
            patch.object(ReportsService, "get_training_report", new=AsyncMock(return_value=mock_report)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get("/api/v1/reports/training", headers={"X-Organization-Id": str(org_id)})

            assert res.status_code == 200
            data = res.json()["data"]
            assert data["completion_rate"] == "90.0"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_internship_report_success(mock_user: AuthenticatedUser, org_id):
    mock_report = InternshipReport(
        total_internships=8,
        active_internships=5,
        planned_internships=1,
        completed_internships=2,
        terminated_internships=0,
        total_stipend_committed=Decimal("12000.00"),
    )

    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.api.v1.reports.get_user_permissions", new=AsyncMock(return_value=["reports.view"])),
            patch.object(ReportsService, "get_internship_report", new=AsyncMock(return_value=mock_report)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get("/api/v1/reports/internships", headers={"X-Organization-Id": str(org_id)})

            assert res.status_code == 200
            data = res.json()["data"]
            assert data["active_internships"] == 5
            assert data["total_stipend_committed"] == "12000.00"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_operations_report_success(mock_user: AuthenticatedUser, org_id):
    mock_report = OperationsReport(
        total_tasks=25,
        open_tasks=10,
        in_progress_tasks=5,
        completed_tasks=9,
        cancelled_tasks=1,
        overdue_tasks=0,
        status_distribution=[TaskStatusDistribution(status="open", count=10)],
    )

    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.api.v1.reports.get_user_permissions", new=AsyncMock(return_value=["reports.view"])),
            patch.object(ReportsService, "get_operations_report", new=AsyncMock(return_value=mock_report)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get("/api/v1/reports/operations", headers={"X-Organization-Id": str(org_id)})

            assert res.status_code == 200
            data = res.json()["data"]
            assert data["total_tasks"] == 25
            assert data["open_tasks"] == 10
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_documents_report_success(mock_user: AuthenticatedUser, org_id):
    mock_report = DocumentsReport(
        total_documents=18,
        total_versions=32,
        categories=[DocumentCategoryDistribution(category="Policies", count=10)],
    )

    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.api.v1.reports.get_user_permissions", new=AsyncMock(return_value=["reports.view"])),
            patch.object(ReportsService, "get_documents_report", new=AsyncMock(return_value=mock_report)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get("/api/v1/reports/documents", headers={"X-Organization-Id": str(org_id)})

            assert res.status_code == 200
            data = res.json()["data"]
            assert data["total_documents"] == 18
            assert data["total_versions"] == 32
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_audit_activity_report_success(mock_user: AuthenticatedUser, org_id):
    today = date(2026, 9, 30)
    mock_report = AuditActivityReport(
        date_from=today - timedelta(days=7),
        date_to=today,
        total_events=120,
        events_by_entity=[AuditEntityDistribution(entity_type="employee", count=50)],
        events_by_action=[AuditActionDistribution(action="employees.create", count=20)],
        daily_trend=[AuditDayActivity(date=today, count=15)],
    )

    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.api.v1.reports.get_user_permissions", new=AsyncMock(return_value=["reports.audit"])),
            patch.object(ReportsService, "get_audit_activity_report", new=AsyncMock(return_value=mock_report)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get("/api/v1/reports/audit-activity", headers={"X-Organization-Id": str(org_id)})

            assert res.status_code == 200
            data = res.json()["data"]
            assert data["total_events"] == 120
            assert len(data["events_by_entity"]) == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_audit_activity_report_forbidden_without_permission(mock_user: AuthenticatedUser, org_id):
    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with patch("app.api.v1.reports.get_user_permissions", new=AsyncMock(return_value=["reports.view"])):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get("/api/v1/reports/audit-activity", headers={"X-Organization-Id": str(org_id)})

            assert res.status_code == 403
            assert "audit_logs.view" in res.json()["error"]["message"]
    finally:
        app.dependency_overrides.clear()
