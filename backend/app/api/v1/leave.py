from datetime import date
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import require_permission
from app.schemas.common import ApiSuccess, PaginatedData, PaginationMeta
from app.schemas.leave import (
    HolidayCreate,
    HolidayResponse,
    HolidayUpdate,
    LeaveRequestApprovalAction,
    LeaveRequestCreate,
    LeaveRequestRejectAction,
    LeaveRequestResponse,
    LeaveRequestUpdate,
    LeaveSummaryResponse,
    LeaveTypeCreate,
    LeaveTypeResponse,
    LeaveTypeUpdate,
)
from app.services.attendance import resolve_employee_for_user
from app.services.identity import get_profile, get_user_permissions
from app.services.leave import (
    approve_leave_request,
    cancel_leave_request,
    create_holiday,
    create_leave_request,
    create_leave_type,
    delete_holiday,
    delete_leave_type,
    get_holiday,
    get_leave_request,
    get_leave_summary,
    get_leave_type,
    list_holidays,
    list_leave_requests,
    list_leave_types,
    reject_leave_request,
    update_holiday,
    update_leave_request,
    update_leave_type,
)

router = APIRouter(tags=["leave-and-holidays"])

ADMIN_AND_MANAGER_PERMISSIONS = {
    "leave.manage",
    "leave.approve",
    "leave_types.manage",
    "employees.create",
    "employees.update",
    "employees.delete",
}


def get_ip_address(request: Request) -> str | None:
    return request.client.host if request.client else None


async def get_actor_profile_id(session: AsyncSession, user: AuthenticatedUser) -> UUID | None:
    profile = await get_profile(session, user)
    return profile.id if profile else None


async def check_is_admin_or_manager(session: AsyncSession, user: AuthenticatedUser) -> bool:
    permissions = await get_user_permissions(session, user)
    return bool(ADMIN_AND_MANAGER_PERMISSIONS.intersection(permissions))


# ==========================================
# Leave Types Endpoints
# ==========================================
@router.get(
    "/leave-types",
    response_model=ApiSuccess[list[LeaveTypeResponse]],
    summary="List organization leave types",
)
async def list_org_leave_types(
    session: Annotated[AsyncSession, Depends(require_permission("leave.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    include_inactive: Annotated[bool, Query(description="Include inactive leave types")] = False,
) -> ApiSuccess[list[LeaveTypeResponse]]:
    org_id = UUID(organization_header)
    data = await list_leave_types(session, org_id, include_inactive=include_inactive)
    return ApiSuccess(data=data)


@router.get(
    "/leave-types/{leave_type_id}",
    response_model=ApiSuccess[LeaveTypeResponse],
    summary="Get single leave type details",
)
async def get_org_leave_type(
    leave_type_id: UUID,
    session: Annotated[AsyncSession, Depends(require_permission("leave.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[LeaveTypeResponse]:
    org_id = UUID(organization_header)
    data = await get_leave_type(session, org_id, leave_type_id)
    return ApiSuccess(data=data)


@router.post(
    "/leave-types",
    response_model=ApiSuccess[LeaveTypeResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new leave type",
)
async def create_org_leave_type(
    data: LeaveTypeCreate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("leave_types.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[LeaveTypeResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    rec = await create_leave_type(session, org_id, data, actor_id, ip)
    return ApiSuccess(data=rec, message="Leave type created successfully")


@router.patch(
    "/leave-types/{leave_type_id}",
    response_model=ApiSuccess[LeaveTypeResponse],
    summary="Update leave type",
)
async def update_org_leave_type(
    leave_type_id: UUID,
    data: LeaveTypeUpdate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("leave_types.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[LeaveTypeResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    rec = await update_leave_type(session, org_id, leave_type_id, data, actor_id, ip)
    return ApiSuccess(data=rec, message="Leave type updated successfully")


@router.delete(
    "/leave-types/{leave_type_id}",
    response_model=ApiSuccess[dict[str, str]],
    summary="Delete / deactivate leave type",
)
async def delete_org_leave_type(
    leave_type_id: UUID,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("leave_types.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[dict[str, str]]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    await delete_leave_type(session, org_id, leave_type_id, actor_id, ip)
    return ApiSuccess(data={"id": str(leave_type_id)}, message="Leave type deleted successfully")


# ==========================================
# Leave Requests Endpoints
# ==========================================
@router.get(
    "/leave-requests",
    response_model=ApiSuccess[PaginatedData[LeaveRequestResponse]],
    summary="List leave requests",
)
async def list_org_leave_requests(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("leave.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    employee_id: Annotated[UUID | None, Query(description="Filter by employee ID")] = None,
    leave_type_id: Annotated[UUID | None, Query(description="Filter by leave type ID")] = None,
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by request status")] = None,
    start_date: Annotated[date | None, Query(description="Filter start date")] = None,
    end_date: Annotated[date | None, Query(description="Filter end date")] = None,
    page: Annotated[int, Query(ge=1, description="Page number (1-indexed)")] = 1,
    page_size: Annotated[int, Query(description="Items per page (10, 20, 50, 100)")] = 20,
) -> ApiSuccess[PaginatedData[LeaveRequestResponse]]:
    org_id = UUID(organization_header)
    is_admin_or_mgr = await check_is_admin_or_manager(session, current_user)

    target_employee_id = employee_id
    if not is_admin_or_mgr:
        user_emp = await resolve_employee_for_user(session, org_id, UUID(current_user.id))
        if user_emp is None:
            return ApiSuccess(
                data=PaginatedData(
                    items=[],
                    meta=PaginationMeta(
                        page=page,
                        page_size=page_size,
                        total=0,
                        total_pages=1,
                    ),
                )
            )
        if employee_id is not None and employee_id != user_emp.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to view another employee's leave requests",
            )
        target_employee_id = user_emp.id

    data = await list_leave_requests(
        session=session,
        organization_id=org_id,
        employee_id=target_employee_id,
        leave_type_id=leave_type_id,
        status_filter=status_filter,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
    )
    return ApiSuccess(data=data)


@router.get(
    "/leave-requests/summary",
    response_model=ApiSuccess[LeaveSummaryResponse],
    summary="Get employee leave balance and summary",
)
async def get_org_leave_summary(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("leave.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    employee_id: Annotated[UUID | None, Query(description="Target employee ID (optional for self)")] = None,
) -> ApiSuccess[LeaveSummaryResponse]:
    org_id = UUID(organization_header)
    is_admin_or_mgr = await check_is_admin_or_manager(session, current_user)

    target_emp_id = employee_id
    if target_emp_id is None or not is_admin_or_mgr:
        user_emp = await resolve_employee_for_user(session, org_id, UUID(current_user.id))
        if user_emp is None:
            return ApiSuccess(
                data=LeaveSummaryResponse(
                    total_allocated_days=Decimal("0.00"),
                    total_used_days=Decimal("0.00"),
                    total_pending_days=Decimal("0.00"),
                    total_available_days=Decimal("0.00"),
                    balances_by_type=[],
                )
            )
        if target_emp_id is not None and target_emp_id != user_emp.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to view another employee's leave balance",
            )
        target_emp_id = user_emp.id

    data = await get_leave_summary(session, org_id, target_emp_id)
    return ApiSuccess(data=data)


@router.get(
    "/leave-requests/{request_id}",
    response_model=ApiSuccess[LeaveRequestResponse],
    summary="Get single leave request details",
)
async def get_org_leave_request(
    request_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("leave.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[LeaveRequestResponse]:
    org_id = UUID(organization_header)
    is_admin_or_mgr = await check_is_admin_or_manager(session, current_user)
    rec = await get_leave_request(session, org_id, request_id)

    if not is_admin_or_mgr:
        user_emp = await resolve_employee_for_user(session, org_id, UUID(current_user.id))
        if user_emp is None or rec.employee_id != user_emp.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to view this leave request",
            )

    return ApiSuccess(data=rec)


@router.post(
    "/leave-requests",
    response_model=ApiSuccess[LeaveRequestResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Submit a new leave request",
)
async def create_org_leave_request(
    data: LeaveRequestCreate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("leave.request"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[LeaveRequestResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    is_admin_or_mgr = await check_is_admin_or_manager(session, current_user)
    ip = get_ip_address(request)

    rec = await create_leave_request(
        session=session,
        organization_id=org_id,
        data=data,
        actor_auth_user_id=UUID(current_user.id),
        actor_profile_id=actor_id,
        is_admin_or_manager=is_admin_or_mgr,
        ip_address=ip,
    )
    return ApiSuccess(data=rec, message="Leave request submitted successfully")


@router.patch(
    "/leave-requests/{request_id}",
    response_model=ApiSuccess[LeaveRequestResponse],
    summary="Update pending leave request",
)
async def update_org_leave_request(
    request_id: UUID,
    data: LeaveRequestUpdate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("leave.request"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[LeaveRequestResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    is_admin_or_mgr = await check_is_admin_or_manager(session, current_user)
    ip = get_ip_address(request)

    rec = await update_leave_request(
        session=session,
        organization_id=org_id,
        request_id=request_id,
        data=data,
        actor_auth_user_id=UUID(current_user.id),
        actor_profile_id=actor_id,
        is_admin_or_manager=is_admin_or_mgr,
        ip_address=ip,
    )
    return ApiSuccess(data=rec, message="Leave request updated successfully")


@router.post(
    "/leave-requests/{request_id}/approve",
    response_model=ApiSuccess[LeaveRequestResponse],
    summary="Approve leave request (Manager/Admin)",
)
async def approve_org_leave_request(
    request_id: UUID,
    data: LeaveRequestApprovalAction,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("leave.approve"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[LeaveRequestResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)

    rec = await approve_leave_request(
        session=session,
        organization_id=org_id,
        request_id=request_id,
        data=data,
        actor_profile_id=actor_id,
        ip_address=ip,
    )
    return ApiSuccess(data=rec, message="Leave request approved successfully")


@router.post(
    "/leave-requests/{request_id}/reject",
    response_model=ApiSuccess[LeaveRequestResponse],
    summary="Reject leave request (Manager/Admin)",
)
async def reject_org_leave_request(
    request_id: UUID,
    data: LeaveRequestRejectAction,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("leave.approve"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[LeaveRequestResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)

    rec = await reject_leave_request(
        session=session,
        organization_id=org_id,
        request_id=request_id,
        data=data,
        actor_profile_id=actor_id,
        ip_address=ip,
    )
    return ApiSuccess(data=rec, message="Leave request rejected successfully")


@router.post(
    "/leave-requests/{request_id}/cancel",
    response_model=ApiSuccess[LeaveRequestResponse],
    summary="Cancel own pending leave request",
)
async def cancel_org_leave_request(
    request_id: UUID,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("leave.cancel"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[LeaveRequestResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    is_admin_or_mgr = await check_is_admin_or_manager(session, current_user)
    ip = get_ip_address(request)

    rec = await cancel_leave_request(
        session=session,
        organization_id=org_id,
        request_id=request_id,
        actor_auth_user_id=UUID(current_user.id),
        actor_profile_id=actor_id,
        is_admin_or_manager=is_admin_or_mgr,
        ip_address=ip,
    )
    return ApiSuccess(data=rec, message="Leave request cancelled successfully")


# ==========================================
# Holidays Endpoints
# ==========================================
@router.get(
    "/holidays",
    response_model=ApiSuccess[list[HolidayResponse]],
    summary="List organization and branch holidays",
)
async def list_org_holidays(
    session: Annotated[AsyncSession, Depends(require_permission("holidays.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    branch_id: Annotated[UUID | None, Query(description="Filter by specific branch ID")] = None,
    year: Annotated[int | None, Query(description="Filter by year")] = None,
) -> ApiSuccess[list[HolidayResponse]]:
    org_id = UUID(organization_header)
    data = await list_holidays(session, org_id, branch_id=branch_id, year=year)
    return ApiSuccess(data=data)


@router.get(
    "/holidays/{holiday_id}",
    response_model=ApiSuccess[HolidayResponse],
    summary="Get single holiday details",
)
async def get_org_holiday(
    holiday_id: UUID,
    session: Annotated[AsyncSession, Depends(require_permission("holidays.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[HolidayResponse]:
    org_id = UUID(organization_header)
    data = await get_holiday(session, org_id, holiday_id)
    return ApiSuccess(data=data)


@router.post(
    "/holidays",
    response_model=ApiSuccess[HolidayResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new holiday",
)
async def create_org_holiday(
    data: HolidayCreate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("holidays.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[HolidayResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    rec = await create_holiday(session, org_id, data, actor_id, ip)
    return ApiSuccess(data=rec, message="Holiday created successfully")


@router.patch(
    "/holidays/{holiday_id}",
    response_model=ApiSuccess[HolidayResponse],
    summary="Update holiday",
)
async def update_org_holiday(
    holiday_id: UUID,
    data: HolidayUpdate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("holidays.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[HolidayResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    rec = await update_holiday(session, org_id, holiday_id, data, actor_id, ip)
    return ApiSuccess(data=rec, message="Holiday updated successfully")


@router.delete(
    "/holidays/{holiday_id}",
    response_model=ApiSuccess[dict[str, str]],
    summary="Delete holiday",
)
async def delete_org_holiday(
    holiday_id: UUID,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("holidays.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[dict[str, str]]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    await delete_holiday(session, org_id, holiday_id, actor_id, ip)
    return ApiSuccess(data={"id": str(holiday_id)}, message="Holiday deleted successfully")
