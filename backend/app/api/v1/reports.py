from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session
from app.schemas.common import ApiSuccess
from app.schemas.reports import (
    AssetReport,
    AttendanceReport,
    AuditActivityReport,
    DocumentsReport,
    ExecutiveOverviewReport,
    FinanceReport,
    InternshipReport,
    LeaveReport,
    MaintenanceReport,
    OperationsReport,
    ProcurementReport,
    ProjectReport,
    TrainingReport,
    WorkforceReport,
)
from app.services.identity import get_profile, get_user_permissions
from app.services.reports import ReportsService

router = APIRouter(prefix="/reports", tags=["Reports & Dashboards"])


async def _check_any_permission(
    session: AsyncSession,
    user: AuthenticatedUser,
    required_permissions: list[str],
) -> list[str]:
    user_perms = await get_user_permissions(session, user)
    has_any = any(perm in user_perms for perm in required_permissions)
    if not has_any:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"One of the following permissions is required: {', '.join(required_permissions)}",
        )
    return user_perms


# ---------------------------------------------------------------------------
# 1. Executive Overview
# ---------------------------------------------------------------------------


@router.get(
    "/overview",
    response_model=ApiSuccess[ExecutiveOverviewReport],
    summary="Executive overview metrics and operational summary",
)
async def get_overview_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ExecutiveOverviewReport]:
    org_id = UUID(organization_header)
    user_perms = await _check_any_permission(
        session, current_user, ["reports.view", "organizations.view", "org:read"]
    )
    can_view_finance = "reports.finance" in user_perms or "finance.view" in user_perms or "finance:read" in user_perms

    profile = await get_profile(session, current_user)
    profile_id = profile.id if profile else None

    report = await ReportsService.get_overview(
        session=session,
        organization_id=org_id,
        auth_profile_id=profile_id,
        can_view_finance=can_view_finance,
    )
    return ApiSuccess(data=report)


# ---------------------------------------------------------------------------
# 2. Workforce Report
# ---------------------------------------------------------------------------


@router.get(
    "/workforce",
    response_model=ApiSuccess[WorkforceReport],
    summary="Workforce demographics, headcount, and department distribution",
)
async def get_workforce_report_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[WorkforceReport]:
    org_id = UUID(organization_header)
    await _check_any_permission(
        session, current_user, ["reports.workforce", "employees.view", "employee:read"]
    )

    report = await ReportsService.get_workforce_report(session=session, organization_id=org_id)
    return ApiSuccess(data=report)


# ---------------------------------------------------------------------------
# 3. Attendance Report
# ---------------------------------------------------------------------------


@router.get(
    "/attendance",
    response_model=ApiSuccess[AttendanceReport],
    summary="Attendance rates, daily trends, and breakdown",
)
async def get_attendance_report_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    branch_id: Annotated[UUID | None, Query()] = None,
    department_id: Annotated[UUID | None, Query()] = None,
) -> ApiSuccess[AttendanceReport]:
    org_id = UUID(organization_header)
    await _check_any_permission(
        session, current_user, ["reports.attendance", "attendance.view", "attendance:read"]
    )

    valid_from, valid_to = ReportsService.validate_date_range(date_from, date_to)
    report = await ReportsService.get_attendance_report(
        session=session,
        organization_id=org_id,
        date_from=valid_from,
        date_to=valid_to,
        branch_id=branch_id,
        department_id=department_id,
    )
    return ApiSuccess(data=report)


# ---------------------------------------------------------------------------
# 4. Leave Report
# ---------------------------------------------------------------------------


@router.get(
    "/leave",
    response_model=ApiSuccess[LeaveReport],
    summary="Leave request volume, statuses, and type distribution",
)
async def get_leave_report_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    department_id: Annotated[UUID | None, Query()] = None,
) -> ApiSuccess[LeaveReport]:
    org_id = UUID(organization_header)
    await _check_any_permission(
        session, current_user, ["reports.leave", "leave.view", "leave:read"]
    )

    valid_from, valid_to = ReportsService.validate_date_range(date_from, date_to)
    report = await ReportsService.get_leave_report(
        session=session,
        organization_id=org_id,
        date_from=valid_from,
        date_to=valid_to,
        department_id=department_id,
    )
    return ApiSuccess(data=report)


# ---------------------------------------------------------------------------
# 5. Project Report
# ---------------------------------------------------------------------------


@router.get(
    "/projects",
    response_model=ApiSuccess[ProjectReport],
    summary="Project pipeline, status counts, and client distribution",
)
async def get_project_report_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ProjectReport]:
    org_id = UUID(organization_header)
    await _check_any_permission(
        session, current_user, ["reports.view", "projects.view", "project:read"]
    )

    report = await ReportsService.get_project_report(session=session, organization_id=org_id)
    return ApiSuccess(data=report)


# ---------------------------------------------------------------------------
# 6. Procurement Report
# ---------------------------------------------------------------------------


@router.get(
    "/procurement",
    response_model=ApiSuccess[ProcurementReport],
    summary="Purchase requests, purchase orders, and vendor counts",
)
async def get_procurement_report_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ProcurementReport]:
    org_id = UUID(organization_header)
    await _check_any_permission(
        session, current_user, ["reports.procurement", "procurement.view", "purchase_orders.view"]
    )

    report = await ReportsService.get_procurement_report(session=session, organization_id=org_id)
    return ApiSuccess(data=report)


# ---------------------------------------------------------------------------
# 7. Asset Report
# ---------------------------------------------------------------------------


@router.get(
    "/assets",
    response_model=ApiSuccess[AssetReport],
    summary="Asset allocation, category distribution, and total asset value",
)
async def get_asset_report_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[AssetReport]:
    org_id = UUID(organization_header)
    await _check_any_permission(
        session, current_user, ["reports.view", "assets.view"]
    )

    report = await ReportsService.get_asset_report(session=session, organization_id=org_id)
    return ApiSuccess(data=report)


# ---------------------------------------------------------------------------
# 8. Maintenance Report
# ---------------------------------------------------------------------------


@router.get(
    "/maintenance",
    response_model=ApiSuccess[MaintenanceReport],
    summary="Maintenance request volume, completed records, and repair costs",
)
async def get_maintenance_report_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[MaintenanceReport]:
    org_id = UUID(organization_header)
    await _check_any_permission(
        session, current_user, ["reports.maintenance", "maintenance.view"]
    )

    report = await ReportsService.get_maintenance_report(session=session, organization_id=org_id)
    return ApiSuccess(data=report)


# ---------------------------------------------------------------------------
# 9. Training Report
# ---------------------------------------------------------------------------


@router.get(
    "/training",
    response_model=ApiSuccess[TrainingReport],
    summary="Training program counts, sessions, and employee enrollments",
)
async def get_training_report_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TrainingReport]:
    org_id = UUID(organization_header)
    await _check_any_permission(
        session, current_user, ["reports.view", "training.view"]
    )

    report = await ReportsService.get_training_report(session=session, organization_id=org_id)
    return ApiSuccess(data=report)


# ---------------------------------------------------------------------------
# 10. Internship Report
# ---------------------------------------------------------------------------


@router.get(
    "/internships",
    response_model=ApiSuccess[InternshipReport],
    summary="Internship status counts and committed stipends",
)
async def get_internship_report_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[InternshipReport]:
    org_id = UUID(organization_header)
    await _check_any_permission(
        session, current_user, ["reports.view", "internships.view"]
    )

    report = await ReportsService.get_internship_report(session=session, organization_id=org_id)
    return ApiSuccess(data=report)


# ---------------------------------------------------------------------------
# 11. Operations Report
# ---------------------------------------------------------------------------


@router.get(
    "/operations",
    response_model=ApiSuccess[OperationsReport],
    summary="Operations task status distribution and completion metrics",
)
async def get_operations_report_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[OperationsReport]:
    org_id = UUID(organization_header)
    await _check_any_permission(
        session, current_user, ["reports.view", "operations.view"]
    )

    report = await ReportsService.get_operations_report(session=session, organization_id=org_id)
    return ApiSuccess(data=report)


# ---------------------------------------------------------------------------
# 12. Finance Report
# ---------------------------------------------------------------------------


@router.get(
    "/finance",
    response_model=ApiSuccess[FinanceReport],
    summary="Financial summary, expense statuses, debits/credits, and category breakdown",
)
async def get_finance_report_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
) -> ApiSuccess[FinanceReport]:
    org_id = UUID(organization_header)
    await _check_any_permission(
        session, current_user, ["reports.finance", "finance.view", "finance:read"]
    )

    valid_from, valid_to = ReportsService.validate_date_range(date_from, date_to)
    report = await ReportsService.get_finance_report(
        session=session,
        organization_id=org_id,
        date_from=valid_from,
        date_to=valid_to,
    )
    return ApiSuccess(data=report)


# ---------------------------------------------------------------------------
# 13. Documents Report
# ---------------------------------------------------------------------------


@router.get(
    "/documents",
    response_model=ApiSuccess[DocumentsReport],
    summary="Document counts, version metrics, and category distribution",
)
async def get_documents_report_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[DocumentsReport]:
    org_id = UUID(organization_header)
    await _check_any_permission(
        session, current_user, ["reports.view", "documents.view"]
    )

    report = await ReportsService.get_documents_report(session=session, organization_id=org_id)
    return ApiSuccess(data=report)


# ---------------------------------------------------------------------------
# 14. Audit Activity Report
# ---------------------------------------------------------------------------


@router.get(
    "/audit-activity",
    response_model=ApiSuccess[AuditActivityReport],
    summary="Audit event volume, entity distributions, and activity trends",
)
async def get_audit_activity_report_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
) -> ApiSuccess[AuditActivityReport]:
    org_id = UUID(organization_header)
    await _check_any_permission(
        session, current_user, ["reports.audit", "audit_logs.view"]
    )

    valid_from, valid_to = ReportsService.validate_date_range(date_from, date_to)
    report = await ReportsService.get_audit_activity_report(
        session=session,
        organization_id=org_id,
        date_from=valid_from,
        date_to=valid_to,
    )
    return ApiSuccess(data=report)
