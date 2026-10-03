import uuid
from datetime import UTC, datetime
from decimal import Decimal
from math import ceil
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.asset import Asset, AssetAssignment
from app.models.employee import Employee
from app.models.identity import Branch
from app.models.maintenance import MaintenanceRecord, MaintenanceRequest
from app.models.procurement import Vendor
from app.schemas.common import PaginatedData, PaginationMeta
from app.schemas.maintenance import (
    AssetSummary,
    BranchSummary,
    EmployeeSummary,
    MaintenanceRecordAction,
    MaintenanceRecordComplete,
    MaintenanceRecordCreate,
    MaintenanceRecordDetailResponse,
    MaintenanceRecordResponse,
    MaintenanceRecordStart,
    MaintenanceRecordUpdate,
    MaintenanceRequestCreate,
    MaintenanceRequestDetailResponse,
    MaintenanceRequestReject,
    MaintenanceRequestResponse,
    MaintenanceRequestUpdate,
    VendorSummary,
)
from app.services.organization import record_audit_log


def _to_list(result: Any) -> list[Any]:
    if result is None:
        return []
    if isinstance(result, list):
        return result
    if hasattr(result, "all"):
        return list(result.all())
    return list(result)


def _build_asset_summary(asset: Asset | None) -> AssetSummary | None:
    if asset is None:
        return None
    return AssetSummary(
        id=asset.id,
        asset_code=asset.asset_code,
        name=asset.name,
        status=asset.status,
        condition=asset.condition,
    )


def _build_employee_summary(employee: Employee | None) -> EmployeeSummary | None:
    if employee is None:
        return None
    return EmployeeSummary(
        id=employee.id,
        employee_code=employee.employee_code,
        first_name=employee.first_name,
        last_name=employee.last_name,
        designation=employee.designation,
    )


def _build_vendor_summary(vendor: Vendor | None) -> VendorSummary | None:
    if vendor is None:
        return None
    return VendorSummary(
        id=vendor.id,
        vendor_code=vendor.vendor_code,
        name=vendor.name,
    )


def _build_branch_summary(branch: Branch | None) -> BranchSummary | None:
    if branch is None:
        return None
    return BranchSummary(
        id=branch.id,
        name=branch.name,
        code=branch.code,
    )


def _build_maintenance_request_response(mr: MaintenanceRequest) -> MaintenanceRequestResponse:
    return MaintenanceRequestResponse(
        id=mr.id,
        organization_id=mr.organization_id,
        request_number=mr.request_number,
        asset_id=mr.asset_id,
        requester_id=mr.requester_id,
        branch_id=mr.branch_id,
        issue_title=mr.issue_title,
        issue_description=mr.issue_description,
        priority=mr.priority,
        requested_date=mr.requested_date,
        status=mr.status,
        rejection_reason=mr.rejection_reason,
        notes=mr.notes,
        created_at=mr.created_at,
        updated_at=mr.updated_at,
        asset=_build_asset_summary(mr.asset),
        requester=_build_employee_summary(mr.requester),
        branch=_build_branch_summary(mr.branch),
    )


def _build_maintenance_record_response(rec: MaintenanceRecord) -> MaintenanceRecordResponse:
    return MaintenanceRecordResponse(
        id=rec.id,
        organization_id=rec.organization_id,
        record_number=rec.record_number,
        maintenance_request_id=rec.maintenance_request_id,
        asset_id=rec.asset_id,
        technician_id=rec.technician_id,
        vendor_id=rec.vendor_id,
        maintenance_type=rec.maintenance_type,
        start_date=rec.start_date,
        completion_date=rec.completion_date,
        status=rec.status,
        description=rec.description,
        parts_description=rec.parts_description,
        labor_cost=rec.labor_cost,
        parts_cost=rec.parts_cost,
        other_cost=rec.other_cost,
        total_cost=rec.total_cost,
        notes=rec.notes,
        created_at=rec.created_at,
        updated_at=rec.updated_at,
        asset=_build_asset_summary(rec.asset),
        technician=_build_employee_summary(rec.technician),
        vendor=_build_vendor_summary(rec.vendor),
    )


async def _generate_mr_number(session: AsyncSession, organization_id: UUID) -> str:
    now = datetime.now(UTC)
    prefix = f"MR-{now.year}{now.month:02d}-"
    res = await session.execute(
        select(func.count(MaintenanceRequest.id)).where(
            MaintenanceRequest.organization_id == organization_id,
            MaintenanceRequest.request_number.like(f"{prefix}%"),
        )
    )
    count = res.scalar() or 0
    return f"{prefix}{count + 1:04d}"


async def _generate_mrec_number(session: AsyncSession, organization_id: UUID) -> str:
    now = datetime.now(UTC)
    prefix = f"MREC-{now.year}{now.month:02d}-"
    res = await session.execute(
        select(func.count(MaintenanceRecord.id)).where(
            MaintenanceRecord.organization_id == organization_id,
            MaintenanceRecord.record_number.like(f"{prefix}%"),
        )
    )
    count = res.scalar() or 0
    return f"{prefix}{count + 1:04d}"


# ---------------------------------------------------------------------------
# Maintenance Requests Service
# ---------------------------------------------------------------------------

async def list_maintenance_requests(
    session: AsyncSession,
    organization_id: UUID,
    current_user_id: UUID,
    current_employee_id: UUID | None,
    has_org_view_permission: bool,
    search: str | None = None,
    status_filter: str | None = None,
    priority_filter: str | None = None,
    asset_id: UUID | None = None,
    branch_id: UUID | None = None,
    requester_id: UUID | None = None,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedData[MaintenanceRequestResponse]:
    query = (
        select(MaintenanceRequest)
        .options(
            selectinload(MaintenanceRequest.asset),
            selectinload(MaintenanceRequest.requester),
            selectinload(MaintenanceRequest.branch),
        )
        .where(MaintenanceRequest.organization_id == organization_id)
    )

    if not has_org_view_permission:
        if current_employee_id is None:
            return PaginatedData(
                items=[],
                meta=PaginationMeta(total=0, page=page, page_size=page_size, total_pages=1),
            )
        query = query.where(MaintenanceRequest.requester_id == current_employee_id)
    elif requester_id:
        query = query.where(MaintenanceRequest.requester_id == requester_id)

    if status_filter:
        query = query.where(MaintenanceRequest.status == status_filter)
    if priority_filter:
        query = query.where(MaintenanceRequest.priority == priority_filter)
    if asset_id:
        query = query.where(MaintenanceRequest.asset_id == asset_id)
    if branch_id:
        query = query.where(MaintenanceRequest.branch_id == branch_id)

    if search:
        search_pat = f"%{search.strip()}%"
        query = query.where(
            or_(
                MaintenanceRequest.request_number.ilike(search_pat),
                MaintenanceRequest.issue_title.ilike(search_pat),
                MaintenanceRequest.issue_description.ilike(search_pat),
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await session.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(MaintenanceRequest.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await session.execute(query)
    requests = _to_list(result.scalars().all())

    items = [_build_maintenance_request_response(mr) for mr in requests]
    total_pages = ceil(total / page_size) if total > 0 else 1

    return PaginatedData(
        items=items,
        meta=PaginationMeta(total=total, page=page, page_size=page_size, total_pages=total_pages),
    )


async def get_maintenance_request(
    session: AsyncSession,
    organization_id: UUID,
    request_id: UUID,
    current_user_id: UUID,
    current_employee_id: UUID | None,
    has_org_view_permission: bool,
) -> MaintenanceRequestDetailResponse:
    query = (
        select(MaintenanceRequest)
        .options(
            selectinload(MaintenanceRequest.asset),
            selectinload(MaintenanceRequest.requester),
            selectinload(MaintenanceRequest.branch),
            selectinload(MaintenanceRequest.maintenance_records).selectinload(MaintenanceRecord.asset),
            selectinload(MaintenanceRequest.maintenance_records).selectinload(MaintenanceRecord.technician),
            selectinload(MaintenanceRequest.maintenance_records).selectinload(MaintenanceRecord.vendor),
        )
        .where(
            MaintenanceRequest.organization_id == organization_id,
            MaintenanceRequest.id == request_id,
        )
    )
    res = await session.execute(query)
    mr = res.scalar_one_or_none()
    if not mr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance request not found",
        )

    if not has_org_view_permission and (
        current_employee_id is None or mr.requester_id != current_employee_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this maintenance request",
        )

    rec_items = [_build_maintenance_record_response(r) for r in mr.maintenance_records]

    return MaintenanceRequestDetailResponse(
        id=mr.id,
        organization_id=mr.organization_id,
        request_number=mr.request_number,
        asset_id=mr.asset_id,
        requester_id=mr.requester_id,
        branch_id=mr.branch_id,
        issue_title=mr.issue_title,
        issue_description=mr.issue_description,
        priority=mr.priority,
        requested_date=mr.requested_date,
        status=mr.status,
        rejection_reason=mr.rejection_reason,
        notes=mr.notes,
        created_at=mr.created_at,
        updated_at=mr.updated_at,
        asset=_build_asset_summary(mr.asset),
        requester=_build_employee_summary(mr.requester),
        branch=_build_branch_summary(mr.branch),
        records=rec_items,
    )


async def create_maintenance_request(
    session: AsyncSession,
    organization_id: UUID,
    payload: MaintenanceRequestCreate,
    current_employee_id: UUID | None,
    current_user_id: UUID,
    can_manage: bool = False,
) -> MaintenanceRequestResponse:
    # Determine requester
    requester_id = current_employee_id
    if can_manage and payload.requester_id is not None:
        requester_id = payload.requester_id

    if requester_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Requester employee could not be resolved for authenticated user",
        )

    # Validate requester exists in org
    req_query = select(Employee).where(
        Employee.organization_id == organization_id,
        Employee.id == requester_id,
    )
    req_res = await session.execute(req_query)
    requester_emp = req_res.scalar_one_or_none()
    if not requester_emp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Requester employee does not belong to this organization",
        )

    # Validate asset exists in org
    asset_query = select(Asset).where(
        Asset.organization_id == organization_id,
        Asset.id == payload.asset_id,
    )
    asset_res = await session.execute(asset_query)
    asset = asset_res.scalar_one_or_none()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Asset not found or belongs to another organization",
        )

    # Validate branch if provided
    branch_id = payload.branch_id or asset.branch_id
    if branch_id:
        branch_query = select(Branch).where(
            Branch.organization_id == organization_id,
            Branch.id == branch_id,
        )
        b_res = await session.execute(branch_query)
        if b_res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Branch not found or belongs to another organization",
            )

    req_date = payload.requested_date or datetime.now(UTC).date()
    request_number = await _generate_mr_number(session, organization_id)
    now = datetime.now(UTC)

    mr = MaintenanceRequest(
        id=uuid.uuid4(),
        organization_id=organization_id,
        request_number=request_number,
        asset_id=payload.asset_id,
        requester_id=requester_id,
        branch_id=branch_id,
        issue_title=payload.issue_title,
        issue_description=payload.issue_description,
        priority=payload.priority,
        requested_date=req_date,
        status="submitted",
        rejection_reason=None,
        notes=payload.notes,
        created_at=now,
        updated_at=now,
    )
    session.add(mr)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=current_user_id,
        action="maintenance_request.create",
        entity_type="maintenance_request",
        entity_id=mr.id,
        details={
            "request_number": mr.request_number,
            "asset_id": str(mr.asset_id),
            "requester_id": str(mr.requester_id),
            "priority": mr.priority,
            "issue_title": mr.issue_title,
        },
    )

    return await get_maintenance_request(
        session=session,
        organization_id=organization_id,
        request_id=mr.id,
        current_user_id=current_user_id,
        current_employee_id=current_employee_id,
        has_org_view_permission=True,
    )


async def update_maintenance_request(
    session: AsyncSession,
    organization_id: UUID,
    request_id: UUID,
    payload: MaintenanceRequestUpdate,
    current_user_id: UUID,
    current_employee_id: UUID | None,
    can_manage: bool,
) -> MaintenanceRequestResponse:
    query = select(MaintenanceRequest).where(
        MaintenanceRequest.organization_id == organization_id,
        MaintenanceRequest.id == request_id,
    )
    res = await session.execute(query)
    mr = res.scalar_one_or_none()
    if not mr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance request not found",
        )

    if mr.status in ("completed", "cancelled", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot update maintenance request with terminal status '{mr.status}'",
        )

    if not can_manage:
        if current_employee_id is None or mr.requester_id != current_employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to update this maintenance request",
            )
        if mr.status != "submitted":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Requester can only update maintenance request when status is 'submitted'",
            )

    if payload.branch_id is not None:
        branch_query = select(Branch).where(
            Branch.organization_id == organization_id,
            Branch.id == payload.branch_id,
        )
        b_res = await session.execute(branch_query)
        if b_res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Branch not found or belongs to another organization",
            )
        mr.branch_id = payload.branch_id

    if payload.issue_title is not None:
        mr.issue_title = payload.issue_title
    if payload.issue_description is not None:
        mr.issue_description = payload.issue_description
    if payload.priority is not None:
        mr.priority = payload.priority
    if payload.notes is not None:
        mr.notes = payload.notes

    mr.updated_at = datetime.now(UTC)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=current_user_id,
        action="maintenance_request.update",
        entity_type="maintenance_request",
        entity_id=mr.id,
        details={
            "request_number": mr.request_number,
            "status": mr.status,
            "priority": mr.priority,
        },
    )

    return await get_maintenance_request(
        session=session,
        organization_id=organization_id,
        request_id=mr.id,
        current_user_id=current_user_id,
        current_employee_id=current_employee_id,
        has_org_view_permission=True,
    )


async def approve_maintenance_request(
    session: AsyncSession,
    organization_id: UUID,
    request_id: UUID,
    notes: str | None,
    current_user_id: UUID,
) -> MaintenanceRequestResponse:
    query = select(MaintenanceRequest).where(
        MaintenanceRequest.organization_id == organization_id,
        MaintenanceRequest.id == request_id,
    )
    res = await session.execute(query)
    mr = res.scalar_one_or_none()
    if not mr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance request not found",
        )

    if mr.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only submitted requests can be approved. Current status: '{mr.status}'",
        )

    mr.status = "approved"
    if notes:
        mr.notes = f"{mr.notes}\nApproval Note: {notes}" if mr.notes else f"Approval Note: {notes}"
    mr.updated_at = datetime.now(UTC)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=current_user_id,
        action="maintenance_request.approve",
        entity_type="maintenance_request",
        entity_id=mr.id,
        details={"request_number": mr.request_number, "status": mr.status},
    )

    return await get_maintenance_request(
        session=session,
        organization_id=organization_id,
        request_id=mr.id,
        current_user_id=current_user_id,
        current_employee_id=None,
        has_org_view_permission=True,
    )


async def reject_maintenance_request(
    session: AsyncSession,
    organization_id: UUID,
    request_id: UUID,
    payload: MaintenanceRequestReject,
    current_user_id: UUID,
) -> MaintenanceRequestResponse:
    query = select(MaintenanceRequest).where(
        MaintenanceRequest.organization_id == organization_id,
        MaintenanceRequest.id == request_id,
    )
    res = await session.execute(query)
    mr = res.scalar_one_or_none()
    if not mr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance request not found",
        )

    if mr.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only submitted requests can be rejected. Current status: '{mr.status}'",
        )

    mr.status = "rejected"
    mr.rejection_reason = payload.rejection_reason
    mr.updated_at = datetime.now(UTC)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=current_user_id,
        action="maintenance_request.reject",
        entity_type="maintenance_request",
        entity_id=mr.id,
        details={
            "request_number": mr.request_number,
            "status": mr.status,
            "rejection_reason": mr.rejection_reason,
        },
    )

    return await get_maintenance_request(
        session=session,
        organization_id=organization_id,
        request_id=mr.id,
        current_user_id=current_user_id,
        current_employee_id=None,
        has_org_view_permission=True,
    )


async def schedule_maintenance_request(
    session: AsyncSession,
    organization_id: UUID,
    request_id: UUID,
    notes: str | None,
    current_user_id: UUID,
) -> MaintenanceRequestResponse:
    query = select(MaintenanceRequest).where(
        MaintenanceRequest.organization_id == organization_id,
        MaintenanceRequest.id == request_id,
    )
    res = await session.execute(query)
    mr = res.scalar_one_or_none()
    if not mr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance request not found",
        )

    if mr.status not in ("approved", "submitted"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot schedule request with status '{mr.status}'. Must be 'approved' or 'submitted'.",
        )

    mr.status = "scheduled"
    if notes:
        mr.notes = f"{mr.notes}\nSchedule Note: {notes}" if mr.notes else f"Schedule Note: {notes}"
    mr.updated_at = datetime.now(UTC)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=current_user_id,
        action="maintenance_request.schedule",
        entity_type="maintenance_request",
        entity_id=mr.id,
        details={"request_number": mr.request_number, "status": mr.status},
    )

    return await get_maintenance_request(
        session=session,
        organization_id=organization_id,
        request_id=mr.id,
        current_user_id=current_user_id,
        current_employee_id=None,
        has_org_view_permission=True,
    )


async def cancel_maintenance_request(
    session: AsyncSession,
    organization_id: UUID,
    request_id: UUID,
    notes: str | None,
    current_user_id: UUID,
    current_employee_id: UUID | None,
    can_manage: bool,
) -> MaintenanceRequestResponse:
    query = select(MaintenanceRequest).where(
        MaintenanceRequest.organization_id == organization_id,
        MaintenanceRequest.id == request_id,
    )
    res = await session.execute(query)
    mr = res.scalar_one_or_none()
    if not mr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance request not found",
        )

    if mr.status in ("completed", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel request with status '{mr.status}'",
        )

    if not can_manage:
        if current_employee_id is None or mr.requester_id != current_employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to cancel this maintenance request",
            )
        if mr.status not in ("submitted", "approved"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Requester can only cancel request before work starts",
            )

    mr.status = "cancelled"
    if notes:
        mr.notes = f"{mr.notes}\nCancel Note: {notes}" if mr.notes else f"Cancel Note: {notes}"
    mr.updated_at = datetime.now(UTC)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=current_user_id,
        action="maintenance_request.cancel",
        entity_type="maintenance_request",
        entity_id=mr.id,
        details={"request_number": mr.request_number, "status": mr.status},
    )

    return await get_maintenance_request(
        session=session,
        organization_id=organization_id,
        request_id=mr.id,
        current_user_id=current_user_id,
        current_employee_id=current_employee_id,
        has_org_view_permission=True,
    )


# ---------------------------------------------------------------------------
# Maintenance Records Service
# ---------------------------------------------------------------------------

async def list_maintenance_records(
    session: AsyncSession,
    organization_id: UUID,
    current_user_id: UUID,
    current_employee_id: UUID | None,
    has_org_view_permission: bool,
    search: str | None = None,
    status_filter: str | None = None,
    maintenance_type: str | None = None,
    asset_id: UUID | None = None,
    technician_id: UUID | None = None,
    vendor_id: UUID | None = None,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedData[MaintenanceRecordResponse]:
    query = (
        select(MaintenanceRecord)
        .options(
            selectinload(MaintenanceRecord.asset),
            selectinload(MaintenanceRecord.technician),
            selectinload(MaintenanceRecord.vendor),
            selectinload(MaintenanceRecord.maintenance_request),
        )
        .where(MaintenanceRecord.organization_id == organization_id)
    )

    if not has_org_view_permission:
        if current_employee_id is None:
            return PaginatedData(
                items=[],
                meta=PaginationMeta(total=0, page=page, page_size=page_size, total_pages=1),
            )
        # Normal employees only see records where they are the technician or linked request requester
        query = query.outerjoin(MaintenanceRequest, MaintenanceRecord.maintenance_request_id == MaintenanceRequest.id)
        query = query.where(
            or_(
                MaintenanceRecord.technician_id == current_employee_id,
                MaintenanceRequest.requester_id == current_employee_id,
            )
        )
    elif technician_id:
        query = query.where(MaintenanceRecord.technician_id == technician_id)

    if status_filter:
        query = query.where(MaintenanceRecord.status == status_filter)
    if maintenance_type:
        query = query.where(MaintenanceRecord.maintenance_type == maintenance_type)
    if asset_id:
        query = query.where(MaintenanceRecord.asset_id == asset_id)
    if vendor_id:
        query = query.where(MaintenanceRecord.vendor_id == vendor_id)

    if search:
        search_pat = f"%{search.strip()}%"
        query = query.where(
            or_(
                MaintenanceRecord.record_number.ilike(search_pat),
                MaintenanceRecord.description.ilike(search_pat),
                MaintenanceRecord.parts_description.ilike(search_pat),
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await session.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(MaintenanceRecord.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await session.execute(query)
    records = _to_list(result.scalars().all())

    items = [_build_maintenance_record_response(r) for r in records]
    total_pages = ceil(total / page_size) if total > 0 else 1

    return PaginatedData(
        items=items,
        meta=PaginationMeta(total=total, page=page, page_size=page_size, total_pages=total_pages),
    )


async def get_maintenance_record(
    session: AsyncSession,
    organization_id: UUID,
    record_id: UUID,
    current_user_id: UUID,
    current_employee_id: UUID | None,
    has_org_view_permission: bool,
) -> MaintenanceRecordDetailResponse:
    query = (
        select(MaintenanceRecord)
        .options(
            selectinload(MaintenanceRecord.asset),
            selectinload(MaintenanceRecord.technician),
            selectinload(MaintenanceRecord.vendor),
            selectinload(MaintenanceRecord.maintenance_request).selectinload(MaintenanceRequest.asset),
            selectinload(MaintenanceRecord.maintenance_request).selectinload(MaintenanceRequest.requester),
            selectinload(MaintenanceRecord.maintenance_request).selectinload(MaintenanceRequest.branch),
        )
        .where(
            MaintenanceRecord.organization_id == organization_id,
            MaintenanceRecord.id == record_id,
        )
    )
    res = await session.execute(query)
    rec = res.scalar_one_or_none()
    if not rec:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance record not found",
        )

    if not has_org_view_permission:
        is_technician = current_employee_id is not None and rec.technician_id == current_employee_id
        is_requester = (
            current_employee_id is not None
            and rec.maintenance_request is not None
            and rec.maintenance_request.requester_id == current_employee_id
        )
        if not is_technician and not is_requester:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this maintenance record",
            )

    req_summary = (
        _build_maintenance_request_response(rec.maintenance_request)
        if rec.maintenance_request
        else None
    )

    return MaintenanceRecordDetailResponse(
        id=rec.id,
        organization_id=rec.organization_id,
        record_number=rec.record_number,
        maintenance_request_id=rec.maintenance_request_id,
        asset_id=rec.asset_id,
        technician_id=rec.technician_id,
        vendor_id=rec.vendor_id,
        maintenance_type=rec.maintenance_type,
        start_date=rec.start_date,
        completion_date=rec.completion_date,
        status=rec.status,
        description=rec.description,
        parts_description=rec.parts_description,
        labor_cost=rec.labor_cost,
        parts_cost=rec.parts_cost,
        other_cost=rec.other_cost,
        total_cost=rec.total_cost,
        notes=rec.notes,
        created_at=rec.created_at,
        updated_at=rec.updated_at,
        asset=_build_asset_summary(rec.asset),
        technician=_build_employee_summary(rec.technician),
        vendor=_build_vendor_summary(rec.vendor),
        maintenance_request=req_summary,
    )


async def create_maintenance_record(
    session: AsyncSession,
    organization_id: UUID,
    payload: MaintenanceRecordCreate,
    current_user_id: UUID,
) -> MaintenanceRecordResponse:
    # 1. Validate asset exists in org
    asset_query = select(Asset).where(
        Asset.organization_id == organization_id,
        Asset.id == payload.asset_id,
    )
    asset_res = await session.execute(asset_query)
    asset = asset_res.scalar_one_or_none()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Asset not found or belongs to another organization",
        )

    # 2. Validate vendor if provided
    if payload.vendor_id:
        vendor_query = select(Vendor).where(
            Vendor.organization_id == organization_id,
            Vendor.id == payload.vendor_id,
        )
        v_res = await session.execute(vendor_query)
        if v_res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vendor not found or belongs to another organization",
            )

    # 3. Validate technician if provided
    if payload.technician_id:
        tech_query = select(Employee).where(
            Employee.organization_id == organization_id,
            Employee.id == payload.technician_id,
        )
        t_res = await session.execute(tech_query)
        if t_res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Technician employee not found or belongs to another organization",
            )

    # 4. Validate request if provided
    if payload.maintenance_request_id:
        mr_query = select(MaintenanceRequest).where(
            MaintenanceRequest.organization_id == organization_id,
            MaintenanceRequest.id == payload.maintenance_request_id,
        )
        mr_res = await session.execute(mr_query)
        mr = mr_res.scalar_one_or_none()
        if not mr:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Maintenance request not found or belongs to another organization",
            )
        if mr.asset_id != payload.asset_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Maintenance request asset does not match the record asset",
            )
        if mr.status in ("approved", "submitted"):
            mr.status = "scheduled"
            mr.updated_at = datetime.now(UTC)

    # 5. Validate dates
    start_date = payload.start_date or datetime.now(UTC).date()
    if payload.completion_date and payload.completion_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Completion date cannot be before start date",
        )

    # 6. Costs calculation (server-side total computation)
    labor = payload.labor_cost if payload.labor_cost is not None else Decimal("0.00")
    parts = payload.parts_cost if payload.parts_cost is not None else Decimal("0.00")
    other = payload.other_cost if payload.other_cost is not None else Decimal("0.00")

    if labor < Decimal("0.00") or parts < Decimal("0.00") or other < Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Costs cannot be negative",
        )

    total = labor + parts + other
    record_number = await _generate_mrec_number(session, organization_id)
    now = datetime.now(UTC)

    rec = MaintenanceRecord(
        id=uuid.uuid4(),
        organization_id=organization_id,
        record_number=record_number,
        maintenance_request_id=payload.maintenance_request_id,
        asset_id=payload.asset_id,
        technician_id=payload.technician_id,
        vendor_id=payload.vendor_id,
        maintenance_type=payload.maintenance_type,
        start_date=start_date,
        completion_date=payload.completion_date,
        status="scheduled",
        description=payload.description,
        parts_description=payload.parts_description,
        labor_cost=labor,
        parts_cost=parts,
        other_cost=other,
        total_cost=total,
        notes=payload.notes,
        created_at=now,
        updated_at=now,
    )
    session.add(rec)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=current_user_id,
        action="maintenance.create",
        entity_type="maintenance_record",
        entity_id=rec.id,
        details={
            "record_number": rec.record_number,
            "asset_id": str(rec.asset_id),
            "maintenance_type": rec.maintenance_type,
            "total_cost": str(rec.total_cost),
        },
    )

    return await get_maintenance_record(
        session=session,
        organization_id=organization_id,
        record_id=rec.id,
        current_user_id=current_user_id,
        current_employee_id=None,
        has_org_view_permission=True,
    )


async def update_maintenance_record(
    session: AsyncSession,
    organization_id: UUID,
    record_id: UUID,
    payload: MaintenanceRecordUpdate,
    current_user_id: UUID,
) -> MaintenanceRecordResponse:
    query = select(MaintenanceRecord).where(
        MaintenanceRecord.organization_id == organization_id,
        MaintenanceRecord.id == record_id,
    )
    res = await session.execute(query)
    rec = res.scalar_one_or_none()
    if not rec:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance record not found",
        )

    if rec.status in ("completed", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot edit maintenance record in terminal status '{rec.status}'",
        )

    if payload.technician_id is not None:
        tech_query = select(Employee).where(
            Employee.organization_id == organization_id,
            Employee.id == payload.technician_id,
        )
        t_res = await session.execute(tech_query)
        if t_res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Technician employee not found or belongs to another organization",
            )
        rec.technician_id = payload.technician_id

    if payload.vendor_id is not None:
        vendor_query = select(Vendor).where(
            Vendor.organization_id == organization_id,
            Vendor.id == payload.vendor_id,
        )
        v_res = await session.execute(vendor_query)
        if v_res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vendor not found or belongs to another organization",
            )
        rec.vendor_id = payload.vendor_id

    if payload.start_date is not None:
        rec.start_date = payload.start_date
    if payload.completion_date is not None:
        if payload.completion_date < rec.start_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Completion date cannot be before start date",
            )
        rec.completion_date = payload.completion_date

    if payload.maintenance_type is not None:
        rec.maintenance_type = payload.maintenance_type
    if payload.description is not None:
        rec.description = payload.description
    if payload.parts_description is not None:
        rec.parts_description = payload.parts_description
    if payload.notes is not None:
        rec.notes = payload.notes

    if payload.labor_cost is not None:
        if payload.labor_cost < Decimal("0.00"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Labor cost cannot be negative")
        rec.labor_cost = payload.labor_cost
    if payload.parts_cost is not None:
        if payload.parts_cost < Decimal("0.00"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Parts cost cannot be negative")
        rec.parts_cost = payload.parts_cost
    if payload.other_cost is not None:
        if payload.other_cost < Decimal("0.00"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Other cost cannot be negative")
        rec.other_cost = payload.other_cost

    rec.total_cost = rec.labor_cost + rec.parts_cost + rec.other_cost
    rec.updated_at = datetime.now(UTC)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=current_user_id,
        action="maintenance.update",
        entity_type="maintenance_record",
        entity_id=rec.id,
        details={
            "record_number": rec.record_number,
            "status": rec.status,
            "total_cost": str(rec.total_cost),
        },
    )

    return await get_maintenance_record(
        session=session,
        organization_id=organization_id,
        record_id=rec.id,
        current_user_id=current_user_id,
        current_employee_id=None,
        has_org_view_permission=True,
    )


async def start_maintenance_record(
    session: AsyncSession,
    organization_id: UUID,
    record_id: UUID,
    payload: MaintenanceRecordStart,
    current_user_id: UUID,
) -> MaintenanceRecordResponse:
    query = select(MaintenanceRecord).where(
        MaintenanceRecord.organization_id == organization_id,
        MaintenanceRecord.id == record_id,
    )
    res = await session.execute(query)
    rec = res.scalar_one_or_none()
    if not rec:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance record not found",
        )

    if rec.status != "scheduled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only scheduled maintenance can be started. Current status: '{rec.status}'",
        )

    if payload.technician_id is not None:
        tech_query = select(Employee).where(
            Employee.organization_id == organization_id,
            Employee.id == payload.technician_id,
        )
        t_res = await session.execute(tech_query)
        if t_res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Technician employee not found or belongs to another organization",
            )
        rec.technician_id = payload.technician_id

    if payload.vendor_id is not None:
        vendor_query = select(Vendor).where(
            Vendor.organization_id == organization_id,
            Vendor.id == payload.vendor_id,
        )
        v_res = await session.execute(vendor_query)
        if v_res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vendor not found or belongs to another organization",
            )
        rec.vendor_id = payload.vendor_id

    if payload.start_date:
        rec.start_date = payload.start_date
    if payload.notes:
        rec.notes = f"{rec.notes}\nStart Note: {payload.notes}" if rec.notes else f"Start Note: {payload.notes}"

    rec.status = "in_progress"
    rec.updated_at = datetime.now(UTC)

    # Asset integration: set asset status to under_maintenance
    asset_query = select(Asset).where(
        Asset.organization_id == organization_id,
        Asset.id == rec.asset_id,
    )
    a_res = await session.execute(asset_query)
    asset = a_res.scalar_one_or_none()
    if asset and asset.status in ("available", "assigned"):
        asset.status = "under_maintenance"
        asset.updated_at = datetime.now(UTC)

    # Linked request integration: move to in_progress
    if rec.maintenance_request_id:
        mr_query = select(MaintenanceRequest).where(
            MaintenanceRequest.organization_id == organization_id,
            MaintenanceRequest.id == rec.maintenance_request_id,
        )
        mr_res = await session.execute(mr_query)
        mr = mr_res.scalar_one_or_none()
        if mr and mr.status in ("submitted", "approved", "scheduled"):
            mr.status = "in_progress"
            mr.updated_at = datetime.now(UTC)

    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=current_user_id,
        action="maintenance.start",
        entity_type="maintenance_record",
        entity_id=rec.id,
        details={"record_number": rec.record_number, "status": rec.status},
    )

    return await get_maintenance_record(
        session=session,
        organization_id=organization_id,
        record_id=rec.id,
        current_user_id=current_user_id,
        current_employee_id=None,
        has_org_view_permission=True,
    )


async def complete_maintenance_record(
    session: AsyncSession,
    organization_id: UUID,
    record_id: UUID,
    payload: MaintenanceRecordComplete,
    current_user_id: UUID,
) -> MaintenanceRecordResponse:
    query = select(MaintenanceRecord).where(
        MaintenanceRecord.organization_id == organization_id,
        MaintenanceRecord.id == record_id,
    )
    res = await session.execute(query)
    rec = res.scalar_one_or_none()
    if not rec:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance record not found",
        )

    if rec.status not in ("in_progress", "scheduled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only active or scheduled maintenance can be completed. Current status: '{rec.status}'",
        )

    comp_date = payload.completion_date or datetime.now(UTC).date()
    if comp_date < rec.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Completion date cannot be before start date",
        )
    rec.completion_date = comp_date

    if payload.labor_cost is not None:
        if payload.labor_cost < Decimal("0.00"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Labor cost cannot be negative")
        rec.labor_cost = payload.labor_cost
    if payload.parts_cost is not None:
        if payload.parts_cost < Decimal("0.00"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Parts cost cannot be negative")
        rec.parts_cost = payload.parts_cost
    if payload.other_cost is not None:
        if payload.other_cost < Decimal("0.00"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Other cost cannot be negative")
        rec.other_cost = payload.other_cost

    rec.total_cost = rec.labor_cost + rec.parts_cost + rec.other_cost

    if payload.description is not None:
        rec.description = payload.description
    if payload.parts_description is not None:
        rec.parts_description = payload.parts_description
    if payload.notes is not None:
        rec.notes = f"{rec.notes}\nCompletion Note: {payload.notes}" if rec.notes else f"Completion Note: {payload.notes}"

    rec.status = "completed"
    rec.updated_at = datetime.now(UTC)

    # Asset integration: restore asset state
    asset_query = select(Asset).where(
        Asset.organization_id == organization_id,
        Asset.id == rec.asset_id,
    )
    a_res = await session.execute(asset_query)
    asset = a_res.scalar_one_or_none()
    if asset:
        # Check if asset has active custodian assignment
        assign_query = select(AssetAssignment).where(
            AssetAssignment.organization_id == organization_id,
            AssetAssignment.asset_id == asset.id,
            AssetAssignment.is_active.is_(True),
            AssetAssignment.returned_date.is_(None),
        )
        assign_res = await session.execute(assign_query)
        active_assignment = assign_res.scalar_one_or_none()
        if active_assignment:
            asset.status = "assigned"
            asset.current_custodian_id = active_assignment.employee_id
        else:
            asset.status = "available"
        asset.updated_at = datetime.now(UTC)

    # Linked request integration: move to completed
    if rec.maintenance_request_id:
        mr_query = select(MaintenanceRequest).where(
            MaintenanceRequest.organization_id == organization_id,
            MaintenanceRequest.id == rec.maintenance_request_id,
        )
        mr_res = await session.execute(mr_query)
        mr = mr_res.scalar_one_or_none()
        if mr and mr.status in ("in_progress", "scheduled", "approved"):
            mr.status = "completed"
            mr.updated_at = datetime.now(UTC)

    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=current_user_id,
        action="maintenance.complete",
        entity_type="maintenance_record",
        entity_id=rec.id,
        details={
            "record_number": rec.record_number,
            "status": rec.status,
            "total_cost": str(rec.total_cost),
        },
    )

    return await get_maintenance_record(
        session=session,
        organization_id=organization_id,
        record_id=rec.id,
        current_user_id=current_user_id,
        current_employee_id=None,
        has_org_view_permission=True,
    )


async def cancel_maintenance_record(
    session: AsyncSession,
    organization_id: UUID,
    record_id: UUID,
    payload: MaintenanceRecordAction,
    current_user_id: UUID,
) -> MaintenanceRecordResponse:
    query = select(MaintenanceRecord).where(
        MaintenanceRecord.organization_id == organization_id,
        MaintenanceRecord.id == record_id,
    )
    res = await session.execute(query)
    rec = res.scalar_one_or_none()
    if not rec:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance record not found",
        )

    if rec.status in ("completed", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel maintenance record with status '{rec.status}'",
        )

    rec.status = "cancelled"
    if payload.notes:
        rec.notes = f"{rec.notes}\nCancel Note: {payload.notes}" if rec.notes else f"Cancel Note: {payload.notes}"
    rec.updated_at = datetime.now(UTC)

    # Check if other in_progress records exist for this asset
    active_mrec_query = select(func.count(MaintenanceRecord.id)).where(
        MaintenanceRecord.organization_id == organization_id,
        MaintenanceRecord.asset_id == rec.asset_id,
        MaintenanceRecord.id != rec.id,
        MaintenanceRecord.status == "in_progress",
    )
    mrec_res = await session.execute(active_mrec_query)
    other_active = (mrec_res.scalar() or 0) > 0

    if not other_active:
        asset_query = select(Asset).where(
            Asset.organization_id == organization_id,
            Asset.id == rec.asset_id,
        )
        a_res = await session.execute(asset_query)
        asset = a_res.scalar_one_or_none()
        if asset and asset.status == "under_maintenance":
            assign_query = select(AssetAssignment).where(
                AssetAssignment.organization_id == organization_id,
                AssetAssignment.asset_id == asset.id,
                AssetAssignment.is_active.is_(True),
                AssetAssignment.returned_date.is_(None),
            )
            assign_res = await session.execute(assign_query)
            active_assignment = assign_res.scalar_one_or_none()
            if active_assignment:
                asset.status = "assigned"
            else:
                asset.status = "available"
            asset.updated_at = datetime.now(UTC)

    # Linked request handling
    if rec.maintenance_request_id:
        mr_query = select(MaintenanceRequest).where(
            MaintenanceRequest.organization_id == organization_id,
            MaintenanceRequest.id == rec.maintenance_request_id,
        )
        mr_res = await session.execute(mr_query)
        mr = mr_res.scalar_one_or_none()
        if mr and mr.status in ("in_progress", "scheduled") and not other_active:
            mr.status = "approved"
            mr.updated_at = datetime.now(UTC)

    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=current_user_id,
        action="maintenance.cancel",
        entity_type="maintenance_record",
        entity_id=rec.id,
        details={"record_number": rec.record_number, "status": rec.status},
    )

    return await get_maintenance_record(
        session=session,
        organization_id=organization_id,
        record_id=rec.id,
        current_user_id=current_user_id,
        current_employee_id=None,
        has_org_view_permission=True,
    )
