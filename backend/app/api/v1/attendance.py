from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import require_permission
from app.schemas.attendance import (
    AttendanceCheckInRequest,
    AttendanceCheckOutRequest,
    AttendanceCreate,
    AttendanceDetailResponse,
    AttendanceListItemResponse,
    AttendanceSummaryResponse,
    AttendanceUpdate,
)
from app.schemas.common import ApiSuccess, PaginatedData, PaginationMeta
from app.services.attendance import (
    check_in_employee,
    check_out_employee,
    create_attendance,
    delete_attendance,
    get_attendance,
    get_today_summary,
    get_user_today_attendance,
    list_attendance,
    resolve_employee_for_user,
    update_attendance,
)
from app.services.identity import get_profile, get_user_permissions

router = APIRouter(prefix="/attendance", tags=["attendance"])

ADMIN_AND_MANAGER_PERMISSIONS = {
    "attendance.delete",
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


@router.get(
    "",
    response_model=ApiSuccess[PaginatedData[AttendanceListItemResponse]],
    summary="List organization attendance records",
)
async def list_org_attendance(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("attendance.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    employee_id: Annotated[UUID | None, Query(description="Filter by employee ID")] = None,
    department_id: Annotated[UUID | None, Query(description="Filter by department ID")] = None,
    branch_id: Annotated[UUID | None, Query(description="Filter by branch ID")] = None,
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by attendance status")] = None,
    start_date: Annotated[date | None, Query(description="Filter start date")] = None,
    end_date: Annotated[date | None, Query(description="Filter end date")] = None,
    search: Annotated[str | None, Query(description="Search by employee name or code")] = None,
    page: Annotated[int, Query(ge=1, description="Page number (1-indexed)")] = 1,
    page_size: Annotated[int, Query(description="Items per page (10, 20, 50, 100)")] = 20,
    sort_by: Annotated[str, Query(description="Sort field: work_date, employee_name, created_at")] = "work_date",
    sort_order: Annotated[str, Query(description="Sort direction: asc or desc")] = "desc",
) -> ApiSuccess[PaginatedData[AttendanceListItemResponse]]:
    org_id = UUID(organization_header)
    is_admin_or_mgr = await check_is_admin_or_manager(session, current_user)

    target_employee_id = employee_id
    if not is_admin_or_mgr:
        user_emp = await resolve_employee_for_user(session, org_id, UUID(current_user.id))
        if user_emp is None:
            return ApiSuccess(
                data=PaginatedData(
                    items=[],
                    pagination=PaginationMeta(
                        page=page,
                        page_size=page_size,
                        total_items=0,
                        total_pages=1,
                        has_next=False,
                        has_previous=False,
                    ),
                )
            )
        if employee_id is not None and employee_id != user_emp.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to view another employee's attendance records",
            )
        target_employee_id = user_emp.id

    data = await list_attendance(
        session=session,
        organization_id=org_id,
        employee_id=target_employee_id,
        department_id=department_id,
        branch_id=branch_id,
        status_filter=status_filter,
        start_date=start_date,
        end_date=end_date,
        search=search,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return ApiSuccess(data=data)


@router.get(
    "/today",
    response_model=ApiSuccess[AttendanceDetailResponse | None],
    summary="Get current user's today attendance status",
)
async def get_my_today_attendance(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("attendance.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    work_date: Annotated[date | None, Query(description="Specific target date")] = None,
) -> ApiSuccess[AttendanceDetailResponse | None]:
    org_id = UUID(organization_header)
    record = await get_user_today_attendance(
        session=session,
        organization_id=org_id,
        auth_user_id=UUID(current_user.id),
        target_date=work_date,
    )
    return ApiSuccess(data=record)


@router.get(
    "/summary",
    response_model=ApiSuccess[AttendanceSummaryResponse],
    summary="Get today attendance summary statistics for the organization",
)
async def get_org_attendance_summary(
    session: Annotated[AsyncSession, Depends(require_permission("attendance.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    target_date: Annotated[date | None, Query(description="Specific target date")] = None,
) -> ApiSuccess[AttendanceSummaryResponse]:
    org_id = UUID(organization_header)
    summary = await get_today_summary(
        session=session,
        organization_id=org_id,
        target_date=target_date,
    )
    return ApiSuccess(data=summary)


@router.post(
    "/check-in",
    response_model=ApiSuccess[AttendanceDetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Clock-in / check-in for attendance",
)
async def clock_in_attendance(
    data: AttendanceCheckInRequest,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("attendance.create"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[AttendanceDetailResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    is_admin_or_mgr = await check_is_admin_or_manager(session, current_user)
    ip = get_ip_address(request)

    record = await check_in_employee(
        session=session,
        organization_id=org_id,
        data=data,
        actor_auth_user_id=UUID(current_user.id),
        actor_profile_id=actor_id,
        is_admin_or_manager=is_admin_or_mgr,
        ip_address=ip,
    )
    return ApiSuccess(data=record, message="Clock-in recorded successfully")


@router.post(
    "/{attendance_id}/check-out",
    response_model=ApiSuccess[AttendanceDetailResponse],
    summary="Clock-out / check-out for attendance",
)
async def clock_out_attendance(
    attendance_id: UUID,
    data: AttendanceCheckOutRequest,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("attendance.update"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[AttendanceDetailResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    is_admin_or_mgr = await check_is_admin_or_manager(session, current_user)
    ip = get_ip_address(request)

    record = await check_out_employee(
        session=session,
        organization_id=org_id,
        attendance_id=attendance_id,
        data=data,
        actor_auth_user_id=UUID(current_user.id),
        actor_profile_id=actor_id,
        is_admin_or_manager=is_admin_or_mgr,
        ip_address=ip,
    )
    return ApiSuccess(data=record, message="Clock-out recorded successfully")


@router.get(
    "/{attendance_id}",
    response_model=ApiSuccess[AttendanceDetailResponse],
    summary="Get single attendance record details",
)
async def get_org_attendance_record(
    attendance_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("attendance.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[AttendanceDetailResponse]:
    org_id = UUID(organization_header)
    is_admin_or_mgr = await check_is_admin_or_manager(session, current_user)
    record = await get_attendance(session, org_id, attendance_id)

    if not is_admin_or_mgr:
        user_emp = await resolve_employee_for_user(session, org_id, UUID(current_user.id))
        if user_emp is None or record.employee_id != user_emp.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to view this attendance record",
            )

    return ApiSuccess(data=record)


@router.post(
    "",
    response_model=ApiSuccess[AttendanceDetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create manual attendance record (Admin/Manager)",
)
async def create_org_attendance(
    data: AttendanceCreate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("attendance.create"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[AttendanceDetailResponse]:
    org_id = UUID(organization_header)
    is_admin_or_mgr = await check_is_admin_or_manager(session, current_user)
    if not is_admin_or_mgr:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to manually create attendance records for other employees",
        )

    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)

    record = await create_attendance(
        session=session,
        organization_id=org_id,
        data=data,
        actor_profile_id=actor_id,
        ip_address=ip,
    )
    return ApiSuccess(data=record, message="Attendance record created successfully")


@router.patch(
    "/{attendance_id}",
    response_model=ApiSuccess[AttendanceDetailResponse],
    summary="Update attendance record (Admin/Manager)",
)
async def update_org_attendance(
    attendance_id: UUID,
    data: AttendanceUpdate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("attendance.update"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[AttendanceDetailResponse]:
    org_id = UUID(organization_header)
    is_admin_or_mgr = await check_is_admin_or_manager(session, current_user)
    if not is_admin_or_mgr:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to manually modify attendance records",
        )

    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)

    record = await update_attendance(
        session=session,
        organization_id=org_id,
        attendance_id=attendance_id,
        data=data,
        actor_profile_id=actor_id,
        ip_address=ip,
    )
    return ApiSuccess(data=record, message="Attendance record updated successfully")


@router.delete(
    "/{attendance_id}",
    response_model=ApiSuccess[dict[str, str]],
    summary="Delete attendance record (Admin/Manager)",
)
async def delete_org_attendance(
    attendance_id: UUID,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("attendance.delete"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[dict[str, str]]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)

    await delete_attendance(
        session=session,
        organization_id=org_id,
        attendance_id=attendance_id,
        actor_profile_id=actor_id,
        ip_address=ip,
    )
    return ApiSuccess(
        data={"id": str(attendance_id)},
        message="Attendance record deleted successfully",
    )
