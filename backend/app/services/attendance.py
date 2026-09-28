import uuid
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.attendance import AttendanceRecord
from app.models.employee import Employee
from app.models.identity import Branch, OrganizationMembership, Profile
from app.schemas.attendance import (
    AttendanceCheckInRequest,
    AttendanceCheckOutRequest,
    AttendanceCreate,
    AttendanceDetailResponse,
    AttendanceListItemResponse,
    AttendanceSummaryResponse,
    AttendanceUpdate,
    BranchBrief,
    EmployeeBrief,
)
from app.schemas.common import PaginatedData, PaginationMeta
from app.services.organization import record_audit_log


def _to_list(result: Any) -> list[Any]:
    if result is None:
        return []
    if isinstance(result, list):
        return result
    if hasattr(result, "all"):
        return list(result.all())
    return list(result)


async def resolve_employee_for_user(
    session: AsyncSession,
    organization_id: UUID,
    auth_user_id: UUID,
) -> Employee | None:
    query = (
        select(Employee)
        .join(Profile, Profile.id == Employee.profile_id)
        .where(
            Profile.auth_user_id == auth_user_id,
            Employee.organization_id == organization_id,
        )
    )
    emp = await session.scalar(query)
    if emp is not None:
        return emp

    # Fallback: check membership link
    fallback_query = (
        select(Employee)
        .join(OrganizationMembership, OrganizationMembership.id == Employee.membership_id)
        .join(Profile, Profile.id == OrganizationMembership.profile_id)
        .where(
            Profile.auth_user_id == auth_user_id,
            Employee.organization_id == organization_id,
        )
    )
    return await session.scalar(fallback_query)


def _to_detail_response(rec: AttendanceRecord) -> AttendanceDetailResponse:
    emp_brief = None
    if rec.employee:
        dept_name = rec.employee.department.name if rec.employee.department else None
        branch_name = rec.employee.branch.name if rec.employee.branch else None
        emp_brief = EmployeeBrief(
            id=rec.employee.id,
            employee_code=rec.employee.employee_code,
            first_name=rec.employee.first_name,
            last_name=rec.employee.last_name,
            designation=rec.employee.designation,
            department_name=dept_name,
            branch_name=branch_name,
        )

    branch_brief = None
    if rec.branch:
        branch_brief = BranchBrief(
            id=rec.branch.id,
            name=rec.branch.name,
            code=rec.branch.code,
        )

    return AttendanceDetailResponse(
        id=rec.id,
        organization_id=rec.organization_id,
        employee_id=rec.employee_id,
        employee=emp_brief,
        branch_id=rec.branch_id,
        branch=branch_brief,
        work_date=rec.work_date,
        check_in_at=rec.check_in_at,
        check_out_at=rec.check_out_at,
        status=rec.status,
        notes=rec.notes,
        created_at=rec.created_at,
        updated_at=rec.updated_at,
    )


async def list_attendance(
    session: AsyncSession,
    organization_id: UUID,
    employee_id: UUID | None = None,
    department_id: UUID | None = None,
    branch_id: UUID | None = None,
    status_filter: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "work_date",
    sort_order: str = "desc",
) -> PaginatedData[AttendanceListItemResponse]:
    page = max(1, page)
    if page_size not in (10, 20, 50, 100):
        page_size = 20

    base_filter = [AttendanceRecord.organization_id == organization_id]

    if employee_id is not None:
        base_filter.append(AttendanceRecord.employee_id == employee_id)

    if branch_id is not None:
        base_filter.append(AttendanceRecord.branch_id == branch_id)

    if status_filter:
        base_filter.append(AttendanceRecord.status == status_filter)

    if start_date is not None:
        base_filter.append(AttendanceRecord.work_date >= start_date)

    if end_date is not None:
        base_filter.append(AttendanceRecord.work_date <= end_date)

    # If department_id or search is requested, we need to join Employee
    needs_emp_join = department_id is not None or bool(search)

    count_query = select(func.count(AttendanceRecord.id))
    if needs_emp_join:
        count_query = count_query.join(Employee, Employee.id == AttendanceRecord.employee_id)
        if department_id is not None:
            base_filter.append(Employee.department_id == department_id)
        if search:
            search_pattern = f"%{search.strip()}%"
            base_filter.append(
                or_(
                    Employee.first_name.ilike(search_pattern),
                    Employee.last_name.ilike(search_pattern),
                    Employee.employee_code.ilike(search_pattern),
                    AttendanceRecord.notes.ilike(search_pattern),
                )
            )

    count_query = count_query.where(*base_filter)
    total_count = await session.scalar(count_query) or 0

    # Sorting
    sort_desc = sort_order.lower() == "desc"
    if sort_by == "employee_name":
        order_expr = (
            [Employee.first_name.desc(), Employee.last_name.desc()]
            if sort_desc
            else [Employee.first_name.asc(), Employee.last_name.asc()]
        )
    elif sort_by == "created_at":
        order_expr = [AttendanceRecord.created_at.desc() if sort_desc else AttendanceRecord.created_at.asc()]
    else:  # work_date
        order_expr = (
            [AttendanceRecord.work_date.desc(), AttendanceRecord.created_at.desc()]
            if sort_desc
            else [AttendanceRecord.work_date.asc(), AttendanceRecord.created_at.asc()]
        )

    offset = (page - 1) * page_size
    query = (
        select(AttendanceRecord)
        .options(
            selectinload(AttendanceRecord.employee).selectinload(Employee.department),
            selectinload(AttendanceRecord.employee).selectinload(Employee.branch),
            selectinload(AttendanceRecord.branch),
        )
    )
    if sort_by == "employee_name" or needs_emp_join:
        query = query.join(Employee, Employee.id == AttendanceRecord.employee_id)

    query = query.where(*base_filter).order_by(*order_expr).offset(offset).limit(page_size)

    result = await session.scalars(query)
    records = _to_list(result)

    total_pages = max(1, (total_count + page_size - 1) // page_size) if total_count > 0 else 1

    return PaginatedData(
        items=[_to_detail_response(r) for r in records],
        meta=PaginationMeta(
            total=total_count,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        ),
    )


async def get_attendance(
    session: AsyncSession,
    organization_id: UUID,
    attendance_id: UUID,
) -> AttendanceDetailResponse:
    query = (
        select(AttendanceRecord)
        .options(
            selectinload(AttendanceRecord.employee).selectinload(Employee.department),
            selectinload(AttendanceRecord.employee).selectinload(Employee.branch),
            selectinload(AttendanceRecord.branch),
        )
        .where(
            AttendanceRecord.id == attendance_id,
            AttendanceRecord.organization_id == organization_id,
        )
    )
    rec = await session.scalar(query)
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attendance record '{attendance_id}' not found in this organization",
        )
    return _to_detail_response(rec)


async def get_today_summary(
    session: AsyncSession,
    organization_id: UUID,
    target_date: date | None = None,
) -> AttendanceSummaryResponse:
    calc_date = target_date or datetime.now(UTC).date()

    # Total active employees
    active_emp_count = (
        await session.scalar(
            select(func.count(Employee.id)).where(
                Employee.organization_id == organization_id,
                Employee.is_active.is_(True),
                Employee.status != "terminated",
            )
        )
        or 0
    )

    # Attendance counts for target date
    status_query = (
        select(AttendanceRecord.status, func.count(AttendanceRecord.id))
        .where(
            AttendanceRecord.organization_id == organization_id,
            AttendanceRecord.work_date == calc_date,
        )
        .group_by(AttendanceRecord.status)
    )
    res = await session.execute(status_query)
    status_counts = dict(_to_list(res))

    present_count = status_counts.get("present", 0)
    late_count = status_counts.get("late", 0)
    half_day_count = status_counts.get("half_day", 0)
    absent_count = status_counts.get("absent", 0)
    on_leave_count = status_counts.get("on_leave", 0)
    marked_count = sum(status_counts.values())

    return AttendanceSummaryResponse(
        date=calc_date,
        total_active_employees=active_emp_count,
        present_count=present_count,
        late_count=late_count,
        half_day_count=half_day_count,
        absent_count=absent_count,
        on_leave_count=on_leave_count,
        marked_count=marked_count,
    )


async def get_user_today_attendance(
    session: AsyncSession,
    organization_id: UUID,
    auth_user_id: UUID,
    target_date: date | None = None,
) -> AttendanceDetailResponse | None:
    calc_date = target_date or datetime.now(UTC).date()
    emp = await resolve_employee_for_user(session, organization_id, auth_user_id)
    if emp is None:
        return None

    query = (
        select(AttendanceRecord)
        .options(
            selectinload(AttendanceRecord.employee).selectinload(Employee.department),
            selectinload(AttendanceRecord.employee).selectinload(Employee.branch),
            selectinload(AttendanceRecord.branch),
        )
        .where(
            AttendanceRecord.organization_id == organization_id,
            AttendanceRecord.employee_id == emp.id,
            AttendanceRecord.work_date == calc_date,
        )
    )
    rec = await session.scalar(query)
    if rec is None:
        return None
    return _to_detail_response(rec)


async def check_in_employee(
    session: AsyncSession,
    organization_id: UUID,
    data: AttendanceCheckInRequest,
    actor_auth_user_id: UUID,
    actor_profile_id: UUID | None,
    is_admin_or_manager: bool,
    ip_address: str | None = None,
) -> AttendanceDetailResponse:
    calc_date = data.work_date or datetime.now(UTC).date()

    target_emp: Employee | None = None
    if data.employee_id is not None:
        target_emp = await session.scalar(
            select(Employee)
            .options(
                selectinload(Employee.department),
                selectinload(Employee.branch),
            )
            .where(
                Employee.id == data.employee_id,
                Employee.organization_id == organization_id,
            )
        )
        if target_emp is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Employee not found in this organization",
            )
        # If user is not admin/manager, verify they are checking in for themselves
        if not is_admin_or_manager:
            user_emp = await resolve_employee_for_user(session, organization_id, actor_auth_user_id)
            if user_emp is None or user_emp.id != data.employee_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not authorized to check in on behalf of another employee",
                )
    else:
        # Resolve user's linked employee
        target_emp = await resolve_employee_for_user(session, organization_id, actor_auth_user_id)
        if target_emp is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No employee record is linked to your user account in this organization",
            )

    if not target_emp.is_active or target_emp.status == "terminated":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot record attendance for an inactive or terminated employee",
        )

    # Check duplicate
    existing = await session.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.organization_id == organization_id,
            AttendanceRecord.employee_id == target_emp.id,
            AttendanceRecord.work_date == calc_date,
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Attendance record already exists for {target_emp.first_name} {target_emp.last_name} on {calc_date}",
        )

    # Validate branch
    branch_id = data.branch_id or target_emp.branch_id
    if branch_id is not None:
        branch_exists = await session.scalar(
            select(Branch).where(Branch.id == branch_id, Branch.organization_id == organization_id)
        )
        if branch_exists is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Branch not found in this organization",
            )

    check_in_time = data.check_in_at or datetime.now(UTC)
    now = datetime.now(UTC)

    rec = AttendanceRecord(
        id=uuid.uuid4(),
        organization_id=organization_id,
        employee_id=target_emp.id,
        branch_id=branch_id,
        work_date=calc_date,
        check_in_at=check_in_time,
        check_out_at=None,
        status="present",
        notes=data.notes.strip() if data.notes else None,
        created_at=now,
        updated_at=now,
    )
    session.add(rec)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_profile_id,
        action="attendance.check_in",
        entity_type="attendance",
        entity_id=rec.id,
        details={
            "employee_id": str(target_emp.id),
            "employee_code": target_emp.employee_code,
            "work_date": str(calc_date),
            "check_in_at": rec.check_in_at.isoformat() if rec.check_in_at else None,
            "status": rec.status,
        },
        ip_address=ip_address,
    )

    return await get_attendance(session, organization_id, rec.id)


async def check_out_employee(
    session: AsyncSession,
    organization_id: UUID,
    attendance_id: UUID,
    data: AttendanceCheckOutRequest,
    actor_auth_user_id: UUID,
    actor_profile_id: UUID | None,
    is_admin_or_manager: bool,
    ip_address: str | None = None,
) -> AttendanceDetailResponse:
    rec = await session.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.id == attendance_id,
            AttendanceRecord.organization_id == organization_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attendance record '{attendance_id}' not found in this organization",
        )

    if not is_admin_or_manager:
        user_emp = await resolve_employee_for_user(session, organization_id, actor_auth_user_id)
        if user_emp is None or user_emp.id != rec.employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to check out for another employee",
            )

    check_out_time = data.check_out_at or datetime.now(UTC)
    if rec.check_in_at and check_out_time < rec.check_in_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="check_out_at cannot be earlier than check_in_at",
        )

    rec.check_out_at = check_out_time
    if data.notes:
        if rec.notes:
            rec.notes = f"{rec.notes}\n{data.notes.strip()}"
        else:
            rec.notes = data.notes.strip()
    rec.updated_at = datetime.now(UTC)

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_profile_id,
        action="attendance.check_out",
        entity_type="attendance",
        entity_id=rec.id,
        details={
            "employee_id": str(rec.employee_id),
            "work_date": str(rec.work_date),
            "check_out_at": rec.check_out_at.isoformat() if rec.check_out_at else None,
        },
        ip_address=ip_address,
    )

    return await get_attendance(session, organization_id, rec.id)


async def create_attendance(
    session: AsyncSession,
    organization_id: UUID,
    data: AttendanceCreate,
    actor_profile_id: UUID | None,
    ip_address: str | None = None,
) -> AttendanceDetailResponse:
    target_emp = await session.scalar(
        select(Employee).where(
            Employee.id == data.employee_id,
            Employee.organization_id == organization_id,
        )
    )
    if target_emp is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Employee not found in this organization",
        )

    if not target_emp.is_active or target_emp.status == "terminated":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot record attendance for an inactive or terminated employee",
        )

    # Check duplicate
    existing = await session.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.organization_id == organization_id,
            AttendanceRecord.employee_id == data.employee_id,
            AttendanceRecord.work_date == data.work_date,
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Attendance record already exists for {target_emp.first_name} {target_emp.last_name} on {data.work_date}",
        )

    # Validate branch
    branch_id = data.branch_id or target_emp.branch_id
    if branch_id is not None:
        branch_exists = await session.scalar(
            select(Branch).where(Branch.id == branch_id, Branch.organization_id == organization_id)
        )
        if branch_exists is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Branch not found in this organization",
            )

    now = datetime.now(UTC)
    rec = AttendanceRecord(
        id=uuid.uuid4(),
        organization_id=organization_id,
        employee_id=data.employee_id,
        branch_id=branch_id,
        work_date=data.work_date,
        check_in_at=data.check_in_at,
        check_out_at=data.check_out_at,
        status=data.status,
        notes=data.notes.strip() if data.notes else None,
        created_at=now,
        updated_at=now,
    )
    session.add(rec)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_profile_id,
        action="attendance.create",
        entity_type="attendance",
        entity_id=rec.id,
        details={
            "employee_id": str(target_emp.id),
            "employee_code": target_emp.employee_code,
            "work_date": str(data.work_date),
            "status": rec.status,
            "check_in_at": rec.check_in_at.isoformat() if rec.check_in_at else None,
            "check_out_at": rec.check_out_at.isoformat() if rec.check_out_at else None,
        },
        ip_address=ip_address,
    )

    return await get_attendance(session, organization_id, rec.id)


async def update_attendance(
    session: AsyncSession,
    organization_id: UUID,
    attendance_id: UUID,
    data: AttendanceUpdate,
    actor_profile_id: UUID | None,
    ip_address: str | None = None,
) -> AttendanceDetailResponse:
    rec = await session.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.id == attendance_id,
            AttendanceRecord.organization_id == organization_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attendance record '{attendance_id}' not found in this organization",
        )

    changes: dict[str, Any] = {}

    if data.work_date is not None and data.work_date != rec.work_date:
        conflict = await session.scalar(
            select(AttendanceRecord).where(
                AttendanceRecord.organization_id == organization_id,
                AttendanceRecord.employee_id == rec.employee_id,
                AttendanceRecord.work_date == data.work_date,
                AttendanceRecord.id != attendance_id,
            )
        )
        if conflict is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Another attendance record already exists for this employee on {data.work_date}",
            )
        changes["work_date"] = {"from": str(rec.work_date), "to": str(data.work_date)}
        rec.work_date = data.work_date

    if data.status is not None and data.status != rec.status:
        changes["status"] = {"from": rec.status, "to": data.status}
        rec.status = data.status

    if "check_in_at" in data.model_fields_set and data.check_in_at != rec.check_in_at:
        changes["check_in_at"] = {
            "from": rec.check_in_at.isoformat() if rec.check_in_at else None,
            "to": data.check_in_at.isoformat() if data.check_in_at else None,
        }
        rec.check_in_at = data.check_in_at

    if "check_out_at" in data.model_fields_set and data.check_out_at != rec.check_out_at:
        changes["check_out_at"] = {
            "from": rec.check_out_at.isoformat() if rec.check_out_at else None,
            "to": data.check_out_at.isoformat() if data.check_out_at else None,
        }
        rec.check_out_at = data.check_out_at

    if rec.check_in_at and rec.check_out_at and rec.check_out_at < rec.check_in_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="check_out_at cannot be earlier than check_in_at",
        )

    if "branch_id" in data.model_fields_set and data.branch_id != rec.branch_id:
        if data.branch_id is not None:
            branch_exists = await session.scalar(
                select(Branch).where(Branch.id == data.branch_id, Branch.organization_id == organization_id)
            )
            if branch_exists is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Branch not found in this organization",
                )
        changes["branch_id"] = {
            "from": str(rec.branch_id) if rec.branch_id else None,
            "to": str(data.branch_id) if data.branch_id else None,
        }
        rec.branch_id = data.branch_id

    if "notes" in data.model_fields_set and data.notes != rec.notes:
        changes["notes"] = {"from": rec.notes, "to": data.notes}
        rec.notes = data.notes

    rec.updated_at = datetime.now(UTC)

    if changes:
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_profile_id,
            action="attendance.update",
            entity_type="attendance",
            entity_id=rec.id,
            details=changes,
            ip_address=ip_address,
        )

    return await get_attendance(session, organization_id, rec.id)


async def delete_attendance(
    session: AsyncSession,
    organization_id: UUID,
    attendance_id: UUID,
    actor_profile_id: UUID | None,
    ip_address: str | None = None,
) -> None:
    rec = await session.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.id == attendance_id,
            AttendanceRecord.organization_id == organization_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attendance record '{attendance_id}' not found in this organization",
        )

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_profile_id,
        action="attendance.delete",
        entity_type="attendance",
        entity_id=rec.id,
        details={
            "employee_id": str(rec.employee_id),
            "work_date": str(rec.work_date),
            "status": rec.status,
        },
        ip_address=ip_address,
    )

    await session.delete(rec)
