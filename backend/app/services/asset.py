import uuid
from datetime import UTC, datetime
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
from app.models.procurement import PurchaseOrder, Vendor
from app.schemas.asset import (
    AssetAssignmentCreate,
    AssetAssignmentResponse,
    AssetCreate,
    AssetDetailResponse,
    AssetResponse,
    AssetReturnCreate,
    AssetUpdate,
    BranchSummary,
    EmployeeSummary,
    POSummary,
    VendorSummary,
)
from app.schemas.common import PaginationMeta
from app.services.organization import record_audit_log


def _to_list(result: Any) -> list[Any]:
    if result is None:
        return []
    if isinstance(result, list):
        return result
    if hasattr(result, "all"):
        return list(result.all())
    return list(result)


def _build_vendor_summary(vendor: Vendor | None) -> VendorSummary | None:
    if vendor is None:
        return None
    return VendorSummary(id=vendor.id, vendor_code=vendor.vendor_code, name=vendor.name)


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


def _build_branch_summary(branch: Branch | None) -> BranchSummary | None:
    if branch is None:
        return None
    return BranchSummary(id=branch.id, name=branch.name, code=branch.code)


def _build_po_summary(po: PurchaseOrder | None) -> POSummary | None:
    if po is None:
        return None
    return POSummary(id=po.id, po_number=po.po_number)


def _build_assignment_response(assignment: AssetAssignment) -> AssetAssignmentResponse:
    return AssetAssignmentResponse(
        id=assignment.id,
        organization_id=assignment.organization_id,
        asset_id=assignment.asset_id,
        employee_id=assignment.employee_id,
        branch_id=assignment.branch_id,
        assigned_date=assignment.assigned_date,
        returned_date=assignment.returned_date,
        assignment_notes=assignment.assignment_notes,
        return_notes=assignment.return_notes,
        assigned_by_id=assignment.assigned_by_id,
        returned_by_id=assignment.returned_by_id,
        is_active=assignment.is_active,
        created_at=assignment.created_at,
        updated_at=assignment.updated_at,
        employee=_build_employee_summary(assignment.employee),
        branch=_build_branch_summary(assignment.branch),
        assigned_by=_build_employee_summary(assignment.assigned_by),
        returned_by=_build_employee_summary(assignment.returned_by),
    )


def _build_asset_response(asset: Asset) -> AssetResponse:
    return AssetResponse(
        id=asset.id,
        organization_id=asset.organization_id,
        asset_code=asset.asset_code,
        name=asset.name,
        category=asset.category,
        description=asset.description,
        serial_number=asset.serial_number,
        model=asset.model,
        manufacturer=asset.manufacturer,
        vendor_id=asset.vendor_id,
        purchase_order_id=asset.purchase_order_id,
        purchase_date=asset.purchase_date,
        purchase_cost=asset.purchase_cost,
        currency=asset.currency,
        warranty_start_date=asset.warranty_start_date,
        warranty_end_date=asset.warranty_end_date,
        branch_id=asset.branch_id,
        current_custodian_id=asset.current_custodian_id,
        status=asset.status,
        condition=asset.condition,
        location=asset.location,
        notes=asset.notes,
        created_at=asset.created_at,
        updated_at=asset.updated_at,
        vendor=_build_vendor_summary(asset.vendor),
        branch=_build_branch_summary(asset.branch),
        current_custodian=_build_employee_summary(asset.current_custodian),
    )


def _build_asset_detail_response(
    asset: Asset, active_assignment: AssetAssignment | None = None
) -> AssetDetailResponse:
    return AssetDetailResponse(
        id=asset.id,
        organization_id=asset.organization_id,
        asset_code=asset.asset_code,
        name=asset.name,
        category=asset.category,
        description=asset.description,
        serial_number=asset.serial_number,
        model=asset.model,
        manufacturer=asset.manufacturer,
        vendor_id=asset.vendor_id,
        purchase_order_id=asset.purchase_order_id,
        purchase_date=asset.purchase_date,
        purchase_cost=asset.purchase_cost,
        currency=asset.currency,
        warranty_start_date=asset.warranty_start_date,
        warranty_end_date=asset.warranty_end_date,
        branch_id=asset.branch_id,
        current_custodian_id=asset.current_custodian_id,
        status=asset.status,
        condition=asset.condition,
        location=asset.location,
        notes=asset.notes,
        created_at=asset.created_at,
        updated_at=asset.updated_at,
        vendor=_build_vendor_summary(asset.vendor),
        branch=_build_branch_summary(asset.branch),
        current_custodian=_build_employee_summary(asset.current_custodian),
        active_assignment=(
            _build_assignment_response(active_assignment) if active_assignment else None
        ),
        purchase_order=_build_po_summary(asset.purchase_order),
    )


async def list_assets(
    session: AsyncSession,
    organization_id: UUID,
    search: str | None = None,
    category: str | None = None,
    status_filter: str | None = None,
    condition: str | None = None,
    branch_id: UUID | None = None,
    custodian_id: UUID | None = None,
    vendor_id: UUID | None = None,
    page: int = 1,
    page_size: int = 20,
    requester_employee_id: UUID | None = None,
    has_org_view: bool = True,
) -> tuple[list[AssetResponse], PaginationMeta]:
    query = select(Asset).where(Asset.organization_id == organization_id)

    if not has_org_view:
        if requester_employee_id is not None:
            query = query.where(Asset.current_custodian_id == requester_employee_id)
        else:
            return [], PaginationMeta(total=0, page=page, page_size=page_size, total_pages=0)

    if search:
        search_term = f"%{search.strip()}%"
        query = query.where(
            or_(
                Asset.asset_code.ilike(search_term),
                Asset.name.ilike(search_term),
                Asset.model.ilike(search_term),
                Asset.serial_number.ilike(search_term),
                Asset.manufacturer.ilike(search_term),
            )
        )

    if category:
        query = query.where(Asset.category == category)
    if status_filter:
        query = query.where(Asset.status == status_filter)
    if condition:
        query = query.where(Asset.condition == condition)
    if branch_id:
        query = query.where(Asset.branch_id == branch_id)
    if custodian_id:
        query = query.where(Asset.current_custodian_id == custodian_id)
    if vendor_id:
        query = query.where(Asset.vendor_id == vendor_id)

    count_query = select(func.count()).select_from(query.subquery())
    total_count = await session.scalar(count_query) or 0

    query = (
        query.options(
            selectinload(Asset.vendor),
            selectinload(Asset.branch),
            selectinload(Asset.current_custodian),
        )
        .order_by(Asset.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    result = await session.execute(query)
    assets = _to_list(result.scalars())

    total_pages = ceil(total_count / page_size) if total_count > 0 else 0
    meta = PaginationMeta(
        total=total_count, page=page, page_size=page_size, total_pages=total_pages
    )

    return [_build_asset_response(a) for a in assets], meta


async def get_asset(
    session: AsyncSession,
    organization_id: UUID,
    asset_id: UUID,
) -> AssetDetailResponse:
    query = (
        select(Asset)
        .where(Asset.organization_id == organization_id, Asset.id == asset_id)
        .options(
            selectinload(Asset.vendor),
            selectinload(Asset.branch),
            selectinload(Asset.current_custodian),
            selectinload(Asset.purchase_order),
        )
    )
    asset = await session.scalar(query)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    active_assignment_query = (
        select(AssetAssignment)
        .where(
            AssetAssignment.organization_id == organization_id,
            AssetAssignment.asset_id == asset_id,
            AssetAssignment.is_active.is_(True),
            AssetAssignment.returned_date.is_(None),
        )
        .options(
            selectinload(AssetAssignment.employee),
            selectinload(AssetAssignment.branch),
            selectinload(AssetAssignment.assigned_by),
            selectinload(AssetAssignment.returned_by),
        )
    )
    active_assignment = await session.scalar(active_assignment_query)

    return _build_asset_detail_response(asset, active_assignment)


async def create_asset(
    session: AsyncSession,
    organization_id: UUID,
    actor_id: UUID | None,
    payload: AssetCreate,
    actor_employee_id: UUID | None = None,
) -> AssetResponse:
    # Check duplicate asset code within organization
    existing_code = await session.scalar(
        select(Asset).where(
            Asset.organization_id == organization_id,
            Asset.asset_code == payload.asset_code.strip(),
        )
    )
    if existing_code:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Asset with code '{payload.asset_code}' already exists in this organization",
        )

    # Validate foreign keys
    if payload.vendor_id:
        vendor = await session.scalar(
            select(Vendor).where(
                Vendor.id == payload.vendor_id, Vendor.organization_id == organization_id
            )
        )
        if not vendor:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Referenced vendor not found in this organization",
            )

    if payload.purchase_order_id:
        po = await session.scalar(
            select(PurchaseOrder).where(
                PurchaseOrder.id == payload.purchase_order_id,
                PurchaseOrder.organization_id == organization_id,
            )
        )
        if not po:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Referenced purchase order not found in this organization",
            )

    if payload.branch_id:
        branch = await session.scalar(
            select(Branch).where(
                Branch.id == payload.branch_id, Branch.organization_id == organization_id
            )
        )
        if not branch:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Referenced branch not found in this organization",
            )

    if payload.current_custodian_id:
        custodian = await session.scalar(
            select(Employee).where(
                Employee.id == payload.current_custodian_id,
                Employee.organization_id == organization_id,
            )
        )
        if not custodian:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Referenced custodian employee not found in this organization",
            )

    # Validate warranty dates
    if (
        payload.warranty_start_date
        and payload.warranty_end_date
        and payload.warranty_end_date < payload.warranty_start_date
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Warranty end date cannot precede warranty start date",
        )

    asset_id = uuid.uuid4()
    initial_status = payload.status
    if payload.current_custodian_id and initial_status == "available":
        initial_status = "assigned"

    asset = Asset(
        id=asset_id,
        organization_id=organization_id,
        asset_code=payload.asset_code.strip(),
        name=payload.name.strip(),
        category=payload.category.strip(),
        description=payload.description,
        serial_number=payload.serial_number.strip() if payload.serial_number else None,
        model=payload.model.strip() if payload.model else None,
        manufacturer=payload.manufacturer.strip() if payload.manufacturer else None,
        vendor_id=payload.vendor_id,
        purchase_order_id=payload.purchase_order_id,
        purchase_date=payload.purchase_date,
        purchase_cost=payload.purchase_cost,
        currency=payload.currency,
        warranty_start_date=payload.warranty_start_date,
        warranty_end_date=payload.warranty_end_date,
        branch_id=payload.branch_id,
        current_custodian_id=payload.current_custodian_id,
        status=initial_status,
        condition=payload.condition,
        location=payload.location,
        notes=payload.notes,
    )
    session.add(asset)

    if payload.current_custodian_id:
        assignment = AssetAssignment(
            id=uuid.uuid4(),
            organization_id=organization_id,
            asset_id=asset_id,
            employee_id=payload.current_custodian_id,
            branch_id=payload.branch_id,
            assigned_date=datetime.now(UTC).date(),
            assignment_notes="Initial assignment at asset registration",
            assigned_by_id=actor_employee_id,
            is_active=True,
        )
        session.add(assignment)

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_id,
        action="asset.create",
        entity_type="asset",
        entity_id=asset_id,
        details={
            "asset_code": asset.asset_code,
            "name": asset.name,
            "category": asset.category,
            "status": asset.status,
            "condition": asset.condition,
        },
    )

    await session.commit()

    # Re-fetch for clean relationships
    query = (
        select(Asset)
        .where(Asset.id == asset_id)
        .options(
            selectinload(Asset.vendor),
            selectinload(Asset.branch),
            selectinload(Asset.current_custodian),
        )
    )
    created_asset = await session.scalar(query)
    return _build_asset_response(created_asset or asset)


async def update_asset(
    session: AsyncSession,
    organization_id: UUID,
    actor_id: UUID | None,
    asset_id: UUID,
    payload: AssetUpdate,
) -> AssetResponse:
    query = (
        select(Asset)
        .where(Asset.organization_id == organization_id, Asset.id == asset_id)
        .options(
            selectinload(Asset.vendor),
            selectinload(Asset.branch),
            selectinload(Asset.current_custodian),
        )
    )
    asset = await session.scalar(query)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    update_data = payload.model_dump(exclude_unset=True)

    if "vendor_id" in update_data and update_data["vendor_id"] is not None:
        vendor = await session.scalar(
            select(Vendor).where(
                Vendor.id == update_data["vendor_id"], Vendor.organization_id == organization_id
            )
        )
        if not vendor:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Referenced vendor not found in this organization",
            )

    if "purchase_order_id" in update_data and update_data["purchase_order_id"] is not None:
        po = await session.scalar(
            select(PurchaseOrder).where(
                PurchaseOrder.id == update_data["purchase_order_id"],
                PurchaseOrder.organization_id == organization_id,
            )
        )
        if not po:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Referenced purchase order not found in this organization",
            )

    if "branch_id" in update_data and update_data["branch_id"] is not None:
        branch = await session.scalar(
            select(Branch).where(
                Branch.id == update_data["branch_id"], Branch.organization_id == organization_id
            )
        )
        if not branch:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Referenced branch not found in this organization",
            )

    # Check status transitions
    if "status" in update_data and update_data["status"] is not None:
        new_status = update_data["status"]
        if new_status in ("retired", "disposed") and asset.status == "assigned":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot retire or dispose an actively assigned asset. Please process the return first.",
            )
        if new_status == "available" and asset.status == "assigned":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot directly set status to 'available' for an assigned asset. Please process asset return.",
            )

    # Validate warranty dates
    w_start = update_data.get("warranty_start_date", asset.warranty_start_date)
    w_end = update_data.get("warranty_end_date", asset.warranty_end_date)
    if w_start and w_end and w_end < w_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Warranty end date cannot precede warranty start date",
        )

    for field, value in update_data.items():
        setattr(asset, field, value)

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_id,
        action="asset.update",
        entity_type="asset",
        entity_id=asset.id,
        details=update_data,
    )

    await session.commit()
    await session.refresh(asset)
    return _build_asset_response(asset)


async def delete_asset(
    session: AsyncSession,
    organization_id: UUID,
    actor_id: UUID | None,
    asset_id: UUID,
) -> None:
    asset = await session.scalar(
        select(Asset).where(Asset.organization_id == organization_id, Asset.id == asset_id)
    )
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    if asset.status == "assigned" or asset.current_custodian_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete an actively assigned asset. Please return it before deleting.",
        )

    active_assignment = await session.scalar(
        select(AssetAssignment).where(
            AssetAssignment.organization_id == organization_id,
            AssetAssignment.asset_id == asset_id,
            AssetAssignment.is_active.is_(True),
        )
    )
    if active_assignment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete asset with active assignment",
        )

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_id,
        action="asset.delete",
        entity_type="asset",
        entity_id=asset.id,
        details={"asset_code": asset.asset_code, "name": asset.name},
    )

    await session.delete(asset)
    await session.commit()


async def list_asset_assignments(
    session: AsyncSession,
    organization_id: UUID,
    asset_id: UUID,
) -> tuple[list[AssetAssignmentResponse], int]:
    asset = await session.scalar(
        select(Asset).where(Asset.organization_id == organization_id, Asset.id == asset_id)
    )
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    query = (
        select(AssetAssignment)
        .where(
            AssetAssignment.organization_id == organization_id,
            AssetAssignment.asset_id == asset_id,
        )
        .options(
            selectinload(AssetAssignment.employee),
            selectinload(AssetAssignment.branch),
            selectinload(AssetAssignment.assigned_by),
            selectinload(AssetAssignment.returned_by),
        )
        .order_by(AssetAssignment.assigned_date.desc(), AssetAssignment.created_at.desc())
    )
    result = await session.execute(query)
    assignments = _to_list(result.scalars())
    return [_build_assignment_response(a) for a in assignments], len(assignments)


async def assign_asset(
    session: AsyncSession,
    organization_id: UUID,
    actor_id: UUID | None,
    asset_id: UUID,
    payload: AssetAssignmentCreate,
    actor_employee_id: UUID | None = None,
) -> AssetAssignmentResponse:
    asset = await session.scalar(
        select(Asset).where(Asset.organization_id == organization_id, Asset.id == asset_id)
    )
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    if asset.status == "assigned":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Asset is already assigned. Return the asset before reassigning.",
        )
    if asset.status in ("under_maintenance", "lost", "retired", "disposed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot assign asset with status '{asset.status}'",
        )

    # Check employee exists in same organization
    employee = await session.scalar(
        select(Employee).where(
            Employee.id == payload.employee_id, Employee.organization_id == organization_id
        )
    )
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Referenced employee not found in this organization",
        )
    if employee.status == "terminated":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot assign asset to a terminated employee",
        )

    # Check branch if provided
    if payload.branch_id:
        branch = await session.scalar(
            select(Branch).where(
                Branch.id == payload.branch_id, Branch.organization_id == organization_id
            )
        )
        if not branch:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Referenced branch not found in this organization",
            )

    # Check active assignment duplicate
    active_assignment = await session.scalar(
        select(AssetAssignment).where(
            AssetAssignment.organization_id == organization_id,
            AssetAssignment.asset_id == asset_id,
            AssetAssignment.is_active.is_(True),
            AssetAssignment.returned_date.is_(None),
        )
    )
    if active_assignment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Asset already has an active assignment",
        )

    assigned_date = payload.assigned_date or datetime.now(UTC).date()
    assignment_id = uuid.uuid4()
    assignment = AssetAssignment(
        id=assignment_id,
        organization_id=organization_id,
        asset_id=asset.id,
        employee_id=payload.employee_id,
        branch_id=payload.branch_id or asset.branch_id,
        assigned_date=assigned_date,
        assignment_notes=payload.assignment_notes,
        assigned_by_id=actor_employee_id,
        is_active=True,
    )
    session.add(assignment)

    asset.status = "assigned"
    asset.current_custodian_id = payload.employee_id
    if payload.branch_id:
        asset.branch_id = payload.branch_id

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_id,
        action="asset.assign",
        entity_type="asset",
        entity_id=asset.id,
        details={
            "assignment_id": str(assignment_id),
            "employee_id": str(payload.employee_id),
            "assigned_date": str(assigned_date),
            "branch_id": str(payload.branch_id) if payload.branch_id else None,
        },
    )

    await session.commit()

    query = (
        select(AssetAssignment)
        .where(AssetAssignment.id == assignment_id)
        .options(
            selectinload(AssetAssignment.employee),
            selectinload(AssetAssignment.branch),
            selectinload(AssetAssignment.assigned_by),
            selectinload(AssetAssignment.returned_by),
        )
    )
    saved_assignment = await session.scalar(query)
    return _build_assignment_response(saved_assignment or assignment)


async def return_asset(
    session: AsyncSession,
    organization_id: UUID,
    actor_id: UUID | None,
    asset_id: UUID,
    payload: AssetReturnCreate,
    actor_employee_id: UUID | None = None,
) -> AssetAssignmentResponse:
    asset = await session.scalar(
        select(Asset).where(Asset.organization_id == organization_id, Asset.id == asset_id)
    )
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    active_assignment = await session.scalar(
        select(AssetAssignment)
        .where(
            AssetAssignment.organization_id == organization_id,
            AssetAssignment.asset_id == asset_id,
            AssetAssignment.is_active.is_(True),
            AssetAssignment.returned_date.is_(None),
        )
        .options(
            selectinload(AssetAssignment.employee),
            selectinload(AssetAssignment.branch),
            selectinload(AssetAssignment.assigned_by),
            selectinload(AssetAssignment.returned_by),
        )
    )
    if not active_assignment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Asset is not currently assigned or has no active assignment to return",
        )

    return_date = payload.returned_date or datetime.now(UTC).date()
    if return_date < active_assignment.assigned_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Return date cannot precede assignment date",
        )

    active_assignment.returned_date = return_date
    active_assignment.return_notes = payload.return_notes
    active_assignment.returned_by_id = actor_employee_id
    active_assignment.is_active = False

    new_status = payload.status or "available"
    if new_status not in ("available", "under_maintenance", "retired", "disposed", "lost"):
        new_status = "available"

    asset.status = new_status
    asset.current_custodian_id = None
    if payload.condition:
        asset.condition = payload.condition

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_id,
        action="asset.return",
        entity_type="asset",
        entity_id=asset.id,
        details={
            "assignment_id": str(active_assignment.id),
            "returned_date": str(return_date),
            "new_status": asset.status,
            "new_condition": asset.condition,
        },
    )

    await session.commit()
    await session.refresh(active_assignment)
    return _build_assignment_response(active_assignment)
