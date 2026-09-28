import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.employee import Employee
from app.models.identity import Branch
from app.models.leave import Holiday, LeaveRequest, LeaveType
from app.schemas.common import PaginatedData, PaginationMeta
from app.schemas.leave import (
    BranchBrief,
    EmployeeBrief,
    HolidayCreate,
    HolidayResponse,
    HolidayUpdate,
    LeaveRequestApprovalAction,
    LeaveRequestCreate,
    LeaveRequestRejectAction,
    LeaveRequestResponse,
    LeaveRequestUpdate,
    LeaveSummaryResponse,
    LeaveTypeBalance,
    LeaveTypeBrief,
    LeaveTypeCreate,
    LeaveTypeResponse,
    LeaveTypeUpdate,
    ReviewerBrief,
)
from app.services.attendance import resolve_employee_for_user
from app.services.organization import record_audit_log


def _to_list(result: Any) -> list[Any]:
    if result is None:
        return []
    if isinstance(result, list):
        return result
    if hasattr(result, "all"):
        return list(result.all())
    return list(result)


def calculate_leave_days(start_date: date, end_date: date) -> Decimal:
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date cannot be earlier than start_date",
        )
    diff = (end_date - start_date).days + 1
    return Decimal(diff)


# ==========================================
# Leave Types Services
# ==========================================
async def list_leave_types(
    session: AsyncSession,
    organization_id: UUID,
    include_inactive: bool = False,
) -> list[LeaveTypeResponse]:
    query = select(LeaveType).where(LeaveType.organization_id == organization_id)
    if not include_inactive:
        query = query.where(LeaveType.is_active.is_(True))
    query = query.order_by(LeaveType.name.asc())

    res = await session.scalars(query)
    items = _to_list(res)
    return [LeaveTypeResponse.model_validate(item) for item in items]


async def get_leave_type(
    session: AsyncSession,
    organization_id: UUID,
    leave_type_id: UUID,
) -> LeaveTypeResponse:
    rec = await session.scalar(
        select(LeaveType).where(
            LeaveType.id == leave_type_id,
            LeaveType.organization_id == organization_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Leave type '{leave_type_id}' not found in this organization",
        )
    return LeaveTypeResponse.model_validate(rec)


async def create_leave_type(
    session: AsyncSession,
    organization_id: UUID,
    data: LeaveTypeCreate,
    actor_profile_id: UUID | None,
    ip_address: str | None = None,
) -> LeaveTypeResponse:
    existing = await session.scalar(
        select(LeaveType).where(
            LeaveType.organization_id == organization_id,
            func.lower(LeaveType.code) == data.code.strip().lower(),
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Leave type with code '{data.code}' already exists in this organization",
        )

    now = datetime.now(UTC)
    rec = LeaveType(
        id=uuid.uuid4(),
        organization_id=organization_id,
        name=data.name.strip(),
        code=data.code.strip().upper(),
        description=data.description.strip() if data.description else None,
        annual_allocation=data.annual_allocation,
        is_paid=data.is_paid,
        requires_approval=data.requires_approval,
        is_active=data.is_active,
        created_at=now,
        updated_at=now,
    )
    session.add(rec)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_profile_id,
        action="leave_type.create",
        entity_type="leave_type",
        entity_id=rec.id,
        details={"name": rec.name, "code": rec.code, "annual_allocation": str(rec.annual_allocation)},
        ip_address=ip_address,
    )

    return LeaveTypeResponse.model_validate(rec)


async def update_leave_type(
    session: AsyncSession,
    organization_id: UUID,
    leave_type_id: UUID,
    data: LeaveTypeUpdate,
    actor_profile_id: UUID | None,
    ip_address: str | None = None,
) -> LeaveTypeResponse:
    rec = await session.scalar(
        select(LeaveType).where(
            LeaveType.id == leave_type_id,
            LeaveType.organization_id == organization_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Leave type '{leave_type_id}' not found in this organization",
        )

    changes: dict[str, Any] = {}

    if data.name is not None and data.name.strip() != rec.name:
        changes["name"] = {"from": rec.name, "to": data.name.strip()}
        rec.name = data.name.strip()

    if data.code is not None and data.code.strip().upper() != rec.code:
        conflict = await session.scalar(
            select(LeaveType).where(
                LeaveType.organization_id == organization_id,
                func.lower(LeaveType.code) == data.code.strip().lower(),
                LeaveType.id != leave_type_id,
            )
        )
        if conflict is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Another leave type with code '{data.code}' already exists",
            )
        changes["code"] = {"from": rec.code, "to": data.code.strip().upper()}
        rec.code = data.code.strip().upper()

    if data.description is not None:
        desc = data.description.strip() if data.description else None
        if desc != rec.description:
            changes["description"] = {"from": rec.description, "to": desc}
            rec.description = desc

    if data.annual_allocation is not None and data.annual_allocation != rec.annual_allocation:
        changes["annual_allocation"] = {"from": str(rec.annual_allocation), "to": str(data.annual_allocation)}
        rec.annual_allocation = data.annual_allocation

    if data.is_paid is not None and data.is_paid != rec.is_paid:
        changes["is_paid"] = {"from": rec.is_paid, "to": data.is_paid}
        rec.is_paid = data.is_paid

    if data.requires_approval is not None and data.requires_approval != rec.requires_approval:
        changes["requires_approval"] = {"from": rec.requires_approval, "to": data.requires_approval}
        rec.requires_approval = data.requires_approval

    if data.is_active is not None and data.is_active != rec.is_active:
        changes["is_active"] = {"from": rec.is_active, "to": data.is_active}
        rec.is_active = data.is_active

    rec.updated_at = datetime.now(UTC)

    if changes:
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_profile_id,
            action="leave_type.update",
            entity_type="leave_type",
            entity_id=rec.id,
            details=changes,
            ip_address=ip_address,
        )

    return LeaveTypeResponse.model_validate(rec)


async def delete_leave_type(
    session: AsyncSession,
    organization_id: UUID,
    leave_type_id: UUID,
    actor_profile_id: UUID | None,
    ip_address: str | None = None,
) -> None:
    rec = await session.scalar(
        select(LeaveType).where(
            LeaveType.id == leave_type_id,
            LeaveType.organization_id == organization_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Leave type '{leave_type_id}' not found in this organization",
        )

    # Check if requests are associated
    req_count = await session.scalar(
        select(func.count(LeaveRequest.id)).where(LeaveRequest.leave_type_id == leave_type_id)
    )
    if req_count and req_count > 0:
        # Soft deactivate instead of hard delete
        rec.is_active = False
        rec.updated_at = datetime.now(UTC)
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_profile_id,
            action="leave_type.deactivate",
            entity_type="leave_type",
            entity_id=rec.id,
            details={"reason": "Has existing leave requests; soft-deactivated"},
            ip_address=ip_address,
        )
        return

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_profile_id,
        action="leave_type.delete",
        entity_type="leave_type",
        entity_id=rec.id,
        details={"name": rec.name, "code": rec.code},
        ip_address=ip_address,
    )
    await session.delete(rec)


# ==========================================
# Leave Requests Services
# ==========================================
def _to_request_response(rec: LeaveRequest) -> LeaveRequestResponse:
    emp_brief = None
    if rec.employee:
        dept_name = rec.employee.department.name if rec.employee.department else None
        emp_brief = EmployeeBrief(
            id=rec.employee.id,
            employee_code=rec.employee.employee_code,
            first_name=rec.employee.first_name,
            last_name=rec.employee.last_name,
            designation=rec.employee.designation,
            department_name=dept_name,
        )

    lt_brief = None
    if rec.leave_type:
        lt_brief = LeaveTypeBrief(
            id=rec.leave_type.id,
            name=rec.leave_type.name,
            code=rec.leave_type.code,
            is_paid=rec.leave_type.is_paid,
        )

    rev_brief = None
    if rec.reviewer:
        rev_brief = ReviewerBrief(
            id=rec.reviewer.id,
            first_name=rec.reviewer.first_name,
            last_name=rec.reviewer.last_name,
            email=rec.reviewer.email,
        )

    return LeaveRequestResponse(
        id=rec.id,
        organization_id=rec.organization_id,
        employee_id=rec.employee_id,
        employee=emp_brief,
        leave_type_id=rec.leave_type_id,
        leave_type=lt_brief,
        start_date=rec.start_date,
        end_date=rec.end_date,
        total_days=rec.total_days,
        reason=rec.reason,
        status=rec.status,
        reviewed_by=rec.reviewed_by,
        reviewer=rev_brief,
        reviewed_at=rec.reviewed_at,
        reviewer_comment=rec.reviewer_comment,
        created_at=rec.created_at,
        updated_at=rec.updated_at,
    )


async def list_leave_requests(
    session: AsyncSession,
    organization_id: UUID,
    employee_id: UUID | None = None,
    leave_type_id: UUID | None = None,
    status_filter: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedData[LeaveRequestResponse]:
    page = max(1, page)
    if page_size not in (10, 20, 50, 100):
        page_size = 20

    base_filter = [LeaveRequest.organization_id == organization_id]

    if employee_id is not None:
        base_filter.append(LeaveRequest.employee_id == employee_id)
    if leave_type_id is not None:
        base_filter.append(LeaveRequest.leave_type_id == leave_type_id)
    if status_filter:
        base_filter.append(LeaveRequest.status == status_filter)
    if start_date is not None:
        base_filter.append(LeaveRequest.end_date >= start_date)
    if end_date is not None:
        base_filter.append(LeaveRequest.start_date <= end_date)

    count_query = select(func.count(LeaveRequest.id)).where(*base_filter)
    total_items = (await session.scalar(count_query)) or 0

    total_pages = max(1, (total_items + page_size - 1) // page_size) if total_items > 0 else 1

    query = (
        select(LeaveRequest)
        .options(
            selectinload(LeaveRequest.employee).selectinload(Employee.department),
            selectinload(LeaveRequest.leave_type),
            selectinload(LeaveRequest.reviewer),
        )
        .where(*base_filter)
        .order_by(LeaveRequest.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    res = await session.scalars(query)
    items = [_to_request_response(r) for r in _to_list(res)]

    return PaginatedData(
        items=items,
        pagination=PaginationMeta(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_previous=page > 1,
        ),
    )


async def get_leave_request(
    session: AsyncSession,
    organization_id: UUID,
    request_id: UUID,
) -> LeaveRequestResponse:
    query = (
        select(LeaveRequest)
        .options(
            selectinload(LeaveRequest.employee).selectinload(Employee.department),
            selectinload(LeaveRequest.leave_type),
            selectinload(LeaveRequest.reviewer),
        )
        .where(
            LeaveRequest.id == request_id,
            LeaveRequest.organization_id == organization_id,
        )
    )
    rec = await session.scalar(query)
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Leave request '{request_id}' not found in this organization",
        )
    return _to_request_response(rec)


async def get_leave_summary(
    session: AsyncSession,
    organization_id: UUID,
    employee_id: UUID,
) -> LeaveSummaryResponse:
    # 1. Fetch active leave types
    types_res = await session.scalars(
        select(LeaveType).where(
            LeaveType.organization_id == organization_id,
            LeaveType.is_active.is_(True),
        ).order_by(LeaveType.name.asc())
    )
    leave_types = _to_list(types_res)

    # 2. Fetch employee's approved and pending requests for current calendar year
    current_year = datetime.now(UTC).year
    year_start = date(current_year, 1, 1)
    year_end = date(current_year, 12, 31)

    req_query = select(LeaveRequest).where(
        LeaveRequest.organization_id == organization_id,
        LeaveRequest.employee_id == employee_id,
        LeaveRequest.status.in_(["approved", "pending"]),
        LeaveRequest.start_date <= year_end,
        LeaveRequest.end_date >= year_start,
    )
    reqs_res = await session.scalars(req_query)
    requests = _to_list(reqs_res)

    used_by_type: dict[UUID, Decimal] = {}
    pending_by_type: dict[UUID, Decimal] = {}

    for r in requests:
        if r.status == "approved":
            used_by_type[r.leave_type_id] = used_by_type.get(r.leave_type_id, Decimal("0.00")) + r.total_days
        elif r.status == "pending":
            pending_by_type[r.leave_type_id] = pending_by_type.get(r.leave_type_id, Decimal("0.00")) + r.total_days

    balances: list[LeaveTypeBalance] = []
    total_alloc = Decimal("0.00")
    total_used = Decimal("0.00")
    total_pending = Decimal("0.00")
    total_avail = Decimal("0.00")

    for lt in leave_types:
        used = used_by_type.get(lt.id, Decimal("0.00"))
        pend = pending_by_type.get(lt.id, Decimal("0.00"))
        avail = max(Decimal("0.00"), lt.annual_allocation - used - pend)

        total_alloc += lt.annual_allocation
        total_used += used
        total_pending += pend
        total_avail += avail

        balances.append(
            LeaveTypeBalance(
                leave_type_id=lt.id,
                leave_type_name=lt.name,
                leave_type_code=lt.code,
                annual_allocation=lt.annual_allocation,
                used_days=used,
                pending_days=pend,
                available_days=avail,
            )
        )

    return LeaveSummaryResponse(
        total_allocated_days=total_alloc,
        total_used_days=total_used,
        total_pending_days=total_pending,
        total_available_days=total_avail,
        balances_by_type=balances,
    )


async def create_leave_request(
    session: AsyncSession,
    organization_id: UUID,
    data: LeaveRequestCreate,
    actor_auth_user_id: UUID,
    actor_profile_id: UUID | None,
    is_admin_or_manager: bool,
    ip_address: str | None = None,
) -> LeaveRequestResponse:
    # 1. Resolve target employee
    target_emp: Employee | None = None
    if data.employee_id is not None:
        if not is_admin_or_manager:
            user_emp = await resolve_employee_for_user(session, organization_id, actor_auth_user_id)
            if user_emp is None or user_emp.id != data.employee_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not authorized to submit leave requests on behalf of another employee",
                )
            target_emp = user_emp
        else:
            target_emp = await session.scalar(
                select(Employee).where(
                    Employee.id == data.employee_id,
                    Employee.organization_id == organization_id,
                )
            )
            if target_emp is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Target employee not found in this organization",
                )
    else:
        target_emp = await resolve_employee_for_user(session, organization_id, actor_auth_user_id)
        if target_emp is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No employee record is linked to your account in this organization",
            )

    if not target_emp.is_active or target_emp.status == "terminated":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot request leave for an inactive or terminated employee",
        )

    # 2. Verify leave type
    lt = await session.scalar(
        select(LeaveType).where(
            LeaveType.id == data.leave_type_id,
            LeaveType.organization_id == organization_id,
        )
    )
    if lt is None or not lt.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Leave type not found or is currently inactive",
        )

    # 3. Calculate total days server-side
    total_days = calculate_leave_days(data.start_date, data.end_date)

    # 4. Check overlapping active requests (pending or approved)
    overlap = await session.scalar(
        select(LeaveRequest).where(
            LeaveRequest.organization_id == organization_id,
            LeaveRequest.employee_id == target_emp.id,
            LeaveRequest.status.in_(["pending", "approved"]),
            LeaveRequest.start_date <= data.end_date,
            LeaveRequest.end_date >= data.start_date,
        )
    )
    if overlap is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An active leave request ({overlap.status}) already overlaps with the requested period ({overlap.start_date} to {overlap.end_date})",
        )

    now = datetime.now(UTC)
    req = LeaveRequest(
        id=uuid.uuid4(),
        organization_id=organization_id,
        employee_id=target_emp.id,
        leave_type_id=lt.id,
        start_date=data.start_date,
        end_date=data.end_date,
        total_days=total_days,
        reason=data.reason.strip() if data.reason else None,
        status="pending",
        created_at=now,
        updated_at=now,
    )
    session.add(req)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_profile_id,
        action="leave_request.create",
        entity_type="leave_request",
        entity_id=req.id,
        details={
            "employee_id": str(target_emp.id),
            "leave_type_id": str(lt.id),
            "start_date": str(req.start_date),
            "end_date": str(req.end_date),
            "total_days": str(req.total_days),
        },
        ip_address=ip_address,
    )

    return await get_leave_request(session, organization_id, req.id)


async def update_leave_request(
    session: AsyncSession,
    organization_id: UUID,
    request_id: UUID,
    data: LeaveRequestUpdate,
    actor_auth_user_id: UUID,
    actor_profile_id: UUID | None,
    is_admin_or_manager: bool,
    ip_address: str | None = None,
) -> LeaveRequestResponse:
    rec = await session.scalar(
        select(LeaveRequest).where(
            LeaveRequest.id == request_id,
            LeaveRequest.organization_id == organization_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Leave request '{request_id}' not found in this organization",
        )

    if rec.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only pending leave requests can be updated (current status: '{rec.status}')",
        )

    # Scoping check: if caller is not admin/manager, must be owner
    if not is_admin_or_manager:
        user_emp = await resolve_employee_for_user(session, organization_id, actor_auth_user_id)
        if user_emp is None or user_emp.id != rec.employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to modify another employee's leave request",
            )

    changes: dict[str, Any] = {}
    new_start = data.start_date or rec.start_date
    new_end = data.end_date or rec.end_date

    if data.start_date is not None or data.end_date is not None:
        new_days = calculate_leave_days(new_start, new_end)
        # Check overlap excluding self
        overlap = await session.scalar(
            select(LeaveRequest).where(
                LeaveRequest.organization_id == organization_id,
                LeaveRequest.employee_id == rec.employee_id,
                LeaveRequest.status.in_(["pending", "approved"]),
                LeaveRequest.start_date <= new_end,
                LeaveRequest.end_date >= new_start,
                LeaveRequest.id != rec.id,
            )
        )
        if overlap is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Updated dates overlap with another active leave request ({overlap.start_date} to {overlap.end_date})",
            )

        if new_start != rec.start_date:
            changes["start_date"] = {"from": str(rec.start_date), "to": str(new_start)}
            rec.start_date = new_start
        if new_end != rec.end_date:
            changes["end_date"] = {"from": str(rec.end_date), "to": str(new_end)}
            rec.end_date = new_end
        if new_days != rec.total_days:
            changes["total_days"] = {"from": str(rec.total_days), "to": str(new_days)}
            rec.total_days = new_days

    if data.leave_type_id is not None and data.leave_type_id != rec.leave_type_id:
        lt = await session.scalar(
            select(LeaveType).where(
                LeaveType.id == data.leave_type_id,
                LeaveType.organization_id == organization_id,
                LeaveType.is_active.is_(True),
            )
        )
        if lt is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Target leave type not found or inactive",
            )
        changes["leave_type_id"] = {"from": str(rec.leave_type_id), "to": str(data.leave_type_id)}
        rec.leave_type_id = data.leave_type_id

    if data.reason is not None and data.reason != rec.reason:
        changes["reason"] = {"from": rec.reason, "to": data.reason}
        rec.reason = data.reason.strip() if data.reason else None

    rec.updated_at = datetime.now(UTC)

    if changes:
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_profile_id,
            action="leave_request.update",
            entity_type="leave_request",
            entity_id=rec.id,
            details=changes,
            ip_address=ip_address,
        )

    return await get_leave_request(session, organization_id, rec.id)


async def approve_leave_request(
    session: AsyncSession,
    organization_id: UUID,
    request_id: UUID,
    data: LeaveRequestApprovalAction,
    actor_profile_id: UUID | None,
    ip_address: str | None = None,
) -> LeaveRequestResponse:
    rec = await session.scalar(
        select(LeaveRequest).where(
            LeaveRequest.id == request_id,
            LeaveRequest.organization_id == organization_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Leave request '{request_id}' not found in this organization",
        )

    if rec.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot approve a leave request with status '{rec.status}'. Only pending requests can be approved.",
        )

    now = datetime.now(UTC)
    rec.status = "approved"
    rec.reviewed_by = actor_profile_id
    rec.reviewed_at = now
    rec.reviewer_comment = data.reviewer_comment.strip() if data.reviewer_comment else None
    rec.updated_at = now

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_profile_id,
        action="leave_request.approve",
        entity_type="leave_request",
        entity_id=rec.id,
        details={
            "employee_id": str(rec.employee_id),
            "start_date": str(rec.start_date),
            "end_date": str(rec.end_date),
            "total_days": str(rec.total_days),
            "reviewer_comment": rec.reviewer_comment,
        },
        ip_address=ip_address,
    )

    return await get_leave_request(session, organization_id, rec.id)


async def reject_leave_request(
    session: AsyncSession,
    organization_id: UUID,
    request_id: UUID,
    data: LeaveRequestRejectAction,
    actor_profile_id: UUID | None,
    ip_address: str | None = None,
) -> LeaveRequestResponse:
    rec = await session.scalar(
        select(LeaveRequest).where(
            LeaveRequest.id == request_id,
            LeaveRequest.organization_id == organization_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Leave request '{request_id}' not found in this organization",
        )

    if rec.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reject a leave request with status '{rec.status}'. Only pending requests can be rejected.",
        )

    now = datetime.now(UTC)
    rec.status = "rejected"
    rec.reviewed_by = actor_profile_id
    rec.reviewed_at = now
    rec.reviewer_comment = data.reviewer_comment.strip() if data.reviewer_comment else None
    rec.updated_at = now

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_profile_id,
        action="leave_request.reject",
        entity_type="leave_request",
        entity_id=rec.id,
        details={
            "employee_id": str(rec.employee_id),
            "reviewer_comment": rec.reviewer_comment,
        },
        ip_address=ip_address,
    )

    return await get_leave_request(session, organization_id, rec.id)


async def cancel_leave_request(
    session: AsyncSession,
    organization_id: UUID,
    request_id: UUID,
    actor_auth_user_id: UUID,
    actor_profile_id: UUID | None,
    is_admin_or_manager: bool,
    ip_address: str | None = None,
) -> LeaveRequestResponse:
    rec = await session.scalar(
        select(LeaveRequest).where(
            LeaveRequest.id == request_id,
            LeaveRequest.organization_id == organization_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Leave request '{request_id}' not found in this organization",
        )

    if rec.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel a leave request with status '{rec.status}'. Only pending requests can be cancelled.",
        )

    # Scoping check: if not admin/manager, must be owner
    if not is_admin_or_manager:
        user_emp = await resolve_employee_for_user(session, organization_id, actor_auth_user_id)
        if user_emp is None or user_emp.id != rec.employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to cancel another employee's leave request",
            )

    now = datetime.now(UTC)
    rec.status = "cancelled"
    rec.updated_at = now

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_profile_id,
        action="leave_request.cancel",
        entity_type="leave_request",
        entity_id=rec.id,
        details={"employee_id": str(rec.employee_id), "status": "cancelled"},
        ip_address=ip_address,
    )

    return await get_leave_request(session, organization_id, rec.id)


# ==========================================
# Holidays Services
# ==========================================
async def list_holidays(
    session: AsyncSession,
    organization_id: UUID,
    branch_id: UUID | None = None,
    year: int | None = None,
) -> list[HolidayResponse]:
    query = (
        select(Holiday)
        .options(selectinload(Holiday.branch))
        .where(Holiday.organization_id == organization_id)
    )

    if branch_id is not None:
        # Organization-wide holidays OR specific branch holidays
        query = query.where(or_(Holiday.branch_id.is_(None), Holiday.branch_id == branch_id))

    if year is not None:
        start_y = date(year, 1, 1)
        end_y = date(year, 12, 31)
        query = query.where(Holiday.holiday_date >= start_y, Holiday.holiday_date <= end_y)

    query = query.order_by(Holiday.holiday_date.asc())
    res = await session.scalars(query)
    items = _to_list(res)

    out: list[HolidayResponse] = []
    for h in items:
        br_brief = None
        if h.branch:
            br_brief = BranchBrief(id=h.branch.id, name=h.branch.name, code=h.branch.code)
        out.append(
            HolidayResponse(
                id=h.id,
                organization_id=h.organization_id,
                name=h.name,
                holiday_date=h.holiday_date,
                branch_id=h.branch_id,
                branch=br_brief,
                description=h.description,
                is_optional=h.is_optional,
                created_at=h.created_at,
                updated_at=h.updated_at,
            )
        )
    return out


async def get_holiday(
    session: AsyncSession,
    organization_id: UUID,
    holiday_id: UUID,
) -> HolidayResponse:
    query = (
        select(Holiday)
        .options(selectinload(Holiday.branch))
        .where(Holiday.id == holiday_id, Holiday.organization_id == organization_id)
    )
    h = await session.scalar(query)
    if h is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Holiday '{holiday_id}' not found in this organization",
        )
    br_brief = None
    if h.branch:
        br_brief = BranchBrief(id=h.branch.id, name=h.branch.name, code=h.branch.code)
    return HolidayResponse(
        id=h.id,
        organization_id=h.organization_id,
        name=h.name,
        holiday_date=h.holiday_date,
        branch_id=h.branch_id,
        branch=br_brief,
        description=h.description,
        is_optional=h.is_optional,
        created_at=h.created_at,
        updated_at=h.updated_at,
    )


async def create_holiday(
    session: AsyncSession,
    organization_id: UUID,
    data: HolidayCreate,
    actor_profile_id: UUID | None,
    ip_address: str | None = None,
) -> HolidayResponse:
    if data.branch_id is not None:
        branch = await session.scalar(
            select(Branch).where(Branch.id == data.branch_id, Branch.organization_id == organization_id)
        )
        if branch is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Branch not found in this organization",
            )

    now = datetime.now(UTC)
    h = Holiday(
        id=uuid.uuid4(),
        organization_id=organization_id,
        branch_id=data.branch_id,
        name=data.name.strip(),
        holiday_date=data.holiday_date,
        description=data.description.strip() if data.description else None,
        is_optional=data.is_optional,
        created_at=now,
        updated_at=now,
    )
    session.add(h)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_profile_id,
        action="holiday.create",
        entity_type="holiday",
        entity_id=h.id,
        details={"name": h.name, "holiday_date": str(h.holiday_date), "branch_id": str(h.branch_id) if h.branch_id else None},
        ip_address=ip_address,
    )

    return await get_holiday(session, organization_id, h.id)


async def update_holiday(
    session: AsyncSession,
    organization_id: UUID,
    holiday_id: UUID,
    data: HolidayUpdate,
    actor_profile_id: UUID | None,
    ip_address: str | None = None,
) -> HolidayResponse:
    h = await session.scalar(
        select(Holiday).where(Holiday.id == holiday_id, Holiday.organization_id == organization_id)
    )
    if h is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Holiday '{holiday_id}' not found in this organization",
        )

    changes: dict[str, Any] = {}

    if data.name is not None and data.name.strip() != h.name:
        changes["name"] = {"from": h.name, "to": data.name.strip()}
        h.name = data.name.strip()

    if data.holiday_date is not None and data.holiday_date != h.holiday_date:
        changes["holiday_date"] = {"from": str(h.holiday_date), "to": str(data.holiday_date)}
        h.holiday_date = data.holiday_date

    if "branch_id" in data.model_fields_set and data.branch_id != h.branch_id:
        if data.branch_id is not None:
            branch = await session.scalar(
                select(Branch).where(Branch.id == data.branch_id, Branch.organization_id == organization_id)
            )
            if branch is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Branch not found in this organization",
                )
        changes["branch_id"] = {"from": str(h.branch_id) if h.branch_id else None, "to": str(data.branch_id) if data.branch_id else None}
        h.branch_id = data.branch_id

    if "description" in data.model_fields_set and data.description != h.description:
        desc = data.description.strip() if data.description else None
        changes["description"] = {"from": h.description, "to": desc}
        h.description = desc

    if data.is_optional is not None and data.is_optional != h.is_optional:
        changes["is_optional"] = {"from": h.is_optional, "to": data.is_optional}
        h.is_optional = data.is_optional

    h.updated_at = datetime.now(UTC)

    if changes:
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_profile_id,
            action="holiday.update",
            entity_type="holiday",
            entity_id=h.id,
            details=changes,
            ip_address=ip_address,
        )

    return await get_holiday(session, organization_id, h.id)


async def delete_holiday(
    session: AsyncSession,
    organization_id: UUID,
    holiday_id: UUID,
    actor_profile_id: UUID | None,
    ip_address: str | None = None,
) -> None:
    h = await session.scalar(
        select(Holiday).where(Holiday.id == holiday_id, Holiday.organization_id == organization_id)
    )
    if h is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Holiday '{holiday_id}' not found in this organization",
        )

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_profile_id,
        action="holiday.delete",
        entity_type="holiday",
        entity_id=h.id,
        details={"name": h.name, "holiday_date": str(h.holiday_date)},
        ip_address=ip_address,
    )
    await session.delete(h)
