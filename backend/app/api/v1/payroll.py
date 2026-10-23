from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session
from app.schemas.common import ApiSuccess
from app.schemas.payroll import (
    BonusAllocationResponse,
    BonusAllocationUpdate,
    BonusCreate,
    BonusPreviewRequest,
    BonusPreviewResponse,
    BonusRejectRequest,
    BonusResponse,
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


@router.delete(
    "/runs/{payroll_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a draft payroll run",
)
async def delete_run_endpoint(
    payroll_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> None:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.delete" not in perms and "payroll.manage" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll.delete or payroll.manage permission",
        )

    await PayrollService.delete_payroll_run(session, org_id, payroll_id)


@router.post(
    "/runs/{payroll_id}/sync",
    response_model=ApiSuccess[PayrollResponse],
    summary="Synchronize and recalculate an unpaid payroll run with latest salary structures, bonuses, and leaves",
)
async def sync_run_endpoint(
    payroll_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[PayrollResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.create" not in perms and "payroll.manage" not in perms and "payroll.approve" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll management permission",
        )

    run = await PayrollService.sync_payroll_run(session, org_id, payroll_id)
    return ApiSuccess(data=run, message="Payroll run synchronized successfully")


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


# ---------------------------------------------------------------------------
# Bonuses & Allocations
# ---------------------------------------------------------------------------


@router.post(
    "/bonuses/preview",
    response_model=ApiSuccess[BonusPreviewResponse],
    summary="Preview employee bonus calculations and total estimated cost",
)
async def preview_bonus_endpoint(
    data: BonusPreviewRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[BonusPreviewResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.view" not in perms and "payroll.create" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll.view or payroll.create permission",
        )

    preview = await PayrollService.preview_bonus(session, org_id, data)
    return ApiSuccess(data=preview)


@router.get(
    "/bonuses",
    response_model=ApiSuccess[list[BonusResponse]],
    summary="List bonus campaigns and allocations",
)
async def list_bonuses_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    period_year: Annotated[int | None, Query()] = None,
    period_month: Annotated[int | None, Query()] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> ApiSuccess[list[BonusResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll.view permission",
        )

    bonuses = await PayrollService.list_bonuses(
        session,
        org_id,
        status=status_filter,
        period_year=period_year,
        period_month=period_month,
        skip=skip,
        limit=limit,
    )
    return ApiSuccess(data=bonuses)


@router.post(
    "/bonuses",
    response_model=ApiSuccess[BonusResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new company-wide bulk or individual/project bonus",
)
async def create_bonus_endpoint(
    data: BonusCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[BonusResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.create" not in perms and "payroll.manage" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll.create or payroll.manage permission",
        )

    bonus = await PayrollService.create_bonus(session, org_id, user_id, data)
    return ApiSuccess(data=bonus, message="Bonus campaign created successfully")


@router.get(
    "/bonuses/{bonus_id}",
    response_model=ApiSuccess[BonusResponse],
    summary="Get details of a specific bonus campaign",
)
async def get_bonus_endpoint(
    bonus_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[BonusResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll.view permission",
        )

    bonus = await PayrollService.get_bonus(session, org_id, bonus_id)
    return ApiSuccess(data=bonus)


@router.post(
    "/bonuses/{bonus_id}/submit",
    response_model=ApiSuccess[BonusResponse],
    summary="Submit draft bonus campaign for approval",
)
async def submit_bonus_endpoint(
    bonus_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[BonusResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.create" not in perms and "payroll.manage" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll.create permission",
        )

    bonus = await PayrollService.submit_bonus_for_approval(session, org_id, bonus_id, user_id)
    return ApiSuccess(data=bonus, message="Bonus submitted for approval")


@router.post(
    "/bonuses/{bonus_id}/approve",
    response_model=ApiSuccess[BonusResponse],
    summary="Approve a bonus campaign for inclusion in payroll",
)
async def approve_bonus_endpoint(
    bonus_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[BonusResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.approve" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll.approve permission",
        )

    bonus = await PayrollService.approve_bonus(session, org_id, bonus_id, user_id)
    return ApiSuccess(data=bonus, message="Bonus approved successfully")


@router.post(
    "/bonuses/{bonus_id}/reject",
    response_model=ApiSuccess[BonusResponse],
    summary="Reject a bonus campaign with mandatory reason",
)
async def reject_bonus_endpoint(
    bonus_id: UUID,
    data: BonusRejectRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[BonusResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.approve" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll.approve permission",
        )

    bonus = await PayrollService.reject_bonus(session, org_id, bonus_id, user_id, data)
    return ApiSuccess(data=bonus, message="Bonus campaign rejected")


@router.post(
    "/bonuses/{bonus_id}/cancel",
    response_model=ApiSuccess[BonusResponse],
    summary="Cancel a bonus campaign",
)
async def cancel_bonus_endpoint(
    bonus_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[BonusResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.manage" not in perms and "payroll.approve" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll.manage or payroll.approve permission",
        )

    bonus = await PayrollService.cancel_bonus(session, org_id, bonus_id, user_id)
    return ApiSuccess(data=bonus, message="Bonus campaign cancelled")


@router.delete(
    "/bonuses/{bonus_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a draft, rejected, or cancelled bonus campaign",
)
async def delete_bonus_endpoint(
    bonus_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> None:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.delete" not in perms and "payroll.manage" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll.delete or payroll.manage permission",
        )

    await PayrollService.delete_bonus(session, org_id, bonus_id)


@router.get(
    "/bonus-allocations",
    response_model=ApiSuccess[list[BonusAllocationResponse]],
    summary="List itemized bonus allocations",
)
async def list_bonus_allocations_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    employee_id: Annotated[UUID | None, Query()] = None,
    bonus_id: Annotated[UUID | None, Query()] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> ApiSuccess[list[BonusAllocationResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)

    # Permission check: payroll.view allows org-wide, otherwise allow own allocations if payslips.view_own
    if "payroll.view" not in perms and "payslips.view" not in perms and "payslips.view_own" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll.view or payslips.view permission",
        )

    allocs = await PayrollService.list_bonus_allocations(
        session,
        organization_id=org_id,
        employee_id=employee_id,
        bonus_id=bonus_id,
        status=status_filter,
        skip=skip,
        limit=limit,
    )
    return ApiSuccess(data=allocs)


@router.patch(
    "/bonus-allocations/{allocation_id}",
    response_model=ApiSuccess[BonusAllocationResponse],
    summary="Update a bonus allocation amount or notes before final payroll payment",
)
async def update_bonus_allocation_endpoint(
    allocation_id: UUID,
    data: BonusAllocationUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[BonusAllocationResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    perms = await get_user_permissions(session, user_id, org_id)
    if "payroll.manage" not in perms and "payroll.create" not in perms and "payroll.approve" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing payroll management permission",
        )

    updated_alloc = await PayrollService.update_bonus_allocation(
        session, org_id, allocation_id, data
    )
    return ApiSuccess(data=updated_alloc, message="Bonus allocation updated and synced successfully")

