from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session
from app.schemas.common import ApiSuccess
from app.schemas.payroll import (
    PayrollResponse,
    PayrollRunCreate,
    PayrollSummaryKPI,
    PayslipDisburseRequest,
    PayslipResponse,
    SalaryStructureCreate,
    SalaryStructureResponse,
)
from app.services.identity import get_user_permissions
from app.services.payroll import PayrollService

router = APIRouter(prefix="/payroll", tags=["Payroll"])


# ---------------------------------------------------------------------------
# Summary KPI
# ---------------------------------------------------------------------------


@router.get(
    "/summary",
    response_model=ApiSuccess[PayrollSummaryKPI],
    summary="Get payroll overview KPIs",
)
async def get_summary_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[PayrollSummaryKPI]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll.view permission",
        )

    kpi = await PayrollService.get_summary_kpi(session, org_id)
    return ApiSuccess(data=kpi)


# ---------------------------------------------------------------------------
# Salary Structures
# ---------------------------------------------------------------------------


@router.get(
    "/structures",
    response_model=ApiSuccess[list[SalaryStructureResponse]],
    summary="List employee salary structures",
)
async def list_structures_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> ApiSuccess[list[SalaryStructureResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll.view permission",
        )

    data = await PayrollService.list_salary_structures(session, org_id, skip=skip, limit=limit)
    return ApiSuccess(data=data)


@router.post(
    "/structures",
    response_model=ApiSuccess[SalaryStructureResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create or update employee salary structure",
)
async def create_structure_endpoint(
    data: SalaryStructureCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[SalaryStructureResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.create" not in perms and "payroll.manage" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll.create permission",
        )

    result = await PayrollService.upsert_salary_structure(session, org_id, data)
    return ApiSuccess(data=result, message="Salary structure saved successfully")


@router.get(
    "/structures/{employee_id}",
    response_model=ApiSuccess[SalaryStructureResponse],
    summary="Get salary structure for specific employee",
)
async def get_structure_endpoint(
    employee_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[SalaryStructureResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll.view permission",
        )

    result = await PayrollService.get_salary_structure_by_employee(session, org_id, employee_id)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Salary structure not found"
        )
    return ApiSuccess(data=result)


# ---------------------------------------------------------------------------
# Payroll Runs
# ---------------------------------------------------------------------------


@router.get(
    "/runs",
    response_model=ApiSuccess[list[PayrollResponse]],
    summary="List payroll runs",
)
async def list_runs_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=50)] = 50,
) -> ApiSuccess[list[PayrollResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll.view permission",
        )

    runs = await PayrollService.list_payroll_runs(session, org_id, skip=skip, limit=limit)
    return ApiSuccess(data=runs)


@router.post(
    "/runs",
    response_model=ApiSuccess[PayrollResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Generate a new monthly payroll run",
)
async def create_run_endpoint(
    data: PayrollRunCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[PayrollResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.create" not in perms and "payroll.manage" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll.create or payroll.manage permission",
        )

    run = await PayrollService.generate_payroll_run(session, org_id, user_id, data)
    return ApiSuccess(data=run, message="Payroll run generated successfully")


@router.get(
    "/runs/{payroll_id}",
    response_model=ApiSuccess[PayrollResponse],
    summary="Get details of a payroll run",
)
async def get_run_endpoint(
    payroll_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[PayrollResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll.view permission",
        )

    run = await PayrollService.get_payroll_run(session, org_id, payroll_id)
    return ApiSuccess(data=run)


@router.post(
    "/runs/{payroll_id}/approve",
    response_model=ApiSuccess[PayrollResponse],
    summary="Approve a draft payroll run",
)
async def approve_run_endpoint(
    payroll_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[PayrollResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.approve" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll.approve permission",
        )

    run = await PayrollService.approve_payroll_run(session, org_id, payroll_id, user_id)
    return ApiSuccess(data=run, message="Payroll run approved successfully")


@router.post(
    "/runs/{payroll_id}/disburse",
    response_model=ApiSuccess[PayrollResponse],
    summary="Disburse and mark payroll run as paid",
)
async def disburse_run_endpoint(
    payroll_id: UUID,
    data: PayslipDisburseRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[PayrollResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.pay" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll.pay permission",
        )

    run = await PayrollService.disburse_payroll_run(session, org_id, payroll_id, data)
    return ApiSuccess(data=run, message="Payroll disbursed and marked as paid")


# ---------------------------------------------------------------------------
# Payslips
# ---------------------------------------------------------------------------


@router.get(
    "/payslips",
    response_model=ApiSuccess[list[PayslipResponse]],
    summary="List employee payslips",
)
async def list_payslips_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    payroll_id: Annotated[UUID | None, Query()] = None,
    employee_id: Annotated[UUID | None, Query()] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> ApiSuccess[list[PayslipResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)

    # If user doesn't have org-wide payslips.view, restrict to own payslips if payslips.view_own
    if "payslips.view" not in perms and "payroll.view" not in perms and "payslips.view_own" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payslips.view permission",
        )

    slips = await PayrollService.list_payslips(
        session,
        organization_id=org_id,
        payroll_id=payroll_id,
        employee_id=employee_id,
        skip=skip,
        limit=limit,
    )
    return ApiSuccess(data=slips)


@router.get(
    "/payslips/{payslip_id}",
    response_model=ApiSuccess[PayslipResponse],
    summary="Get detailed payslip",
)
async def get_payslip_endpoint(
    payslip_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[PayslipResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if (
        "payslips.view" not in perms
        and "payroll.view" not in perms
        and "payslips.view_own" not in perms
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payslips.view permission",
        )

    slip = await PayrollService.get_payslip(session, org_id, payslip_id)
    return ApiSuccess(data=slip)
