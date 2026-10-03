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

from app.models.employee import Department
from app.models.procurement import PurchaseOrder, PurchaseOrderItem, PurchaseRequest, Vendor
from app.schemas.common import PaginationMeta
from app.schemas.procurement import (
    PurchaseOrderCreate,
    PurchaseOrderDetailResponse,
    PurchaseOrderItemResponse,
    PurchaseOrderListResponse,
    PurchaseOrderResponse,
    PurchaseOrderUpdate,
    PurchaseRequestCreate,
    PurchaseRequestListResponse,
    PurchaseRequestResponse,
    PurchaseRequestUpdate,
    VendorCreate,
    VendorListResponse,
    VendorResponse,
    VendorUpdate,
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


def _build_vendor_response(vendor: Vendor) -> VendorResponse:
    return VendorResponse(
        id=vendor.id,
        organization_id=vendor.organization_id,
        vendor_code=vendor.vendor_code,
        name=vendor.name,
        contact_person=vendor.contact_person,
        email=vendor.email,
        phone=vendor.phone,
        address=vendor.address,
        tax_id=vendor.tax_id,
        is_active=vendor.is_active,
        created_at=vendor.created_at,
        updated_at=vendor.updated_at,
    )


def _build_purchase_request_response(pr: PurchaseRequest) -> PurchaseRequestResponse:
    requester = pr.requester if hasattr(pr, "requester") and pr.requester is not None else None
    req_name = f"{requester.first_name} {requester.last_name}".strip() if requester else None
    dept = pr.department if hasattr(pr, "department") and pr.department is not None else None
    reviewer = pr.reviewer if hasattr(pr, "reviewer") and pr.reviewer is not None else None
    rev_name = f"{reviewer.first_name} {reviewer.last_name}".strip() if reviewer else None

    return PurchaseRequestResponse(
        id=pr.id,
        organization_id=pr.organization_id,
        request_number=pr.request_number,
        requester_id=pr.requester_id,
        department_id=pr.department_id,
        required_date=pr.required_date,
        priority=pr.priority,
        purpose=pr.purpose,
        estimated_amount=pr.estimated_amount,
        currency=pr.currency,
        status=pr.status,
        reviewer_id=pr.reviewer_id,
        reviewed_at=pr.reviewed_at,
        reviewer_comment=pr.reviewer_comment,
        created_at=pr.created_at,
        updated_at=pr.updated_at,
        requester_name=req_name,
        requester_code=requester.employee_code if requester else None,
        department_name=dept.name if dept else None,
        department_code=dept.code if dept else None,
        reviewer_name=rev_name,
        reviewer_code=reviewer.employee_code if reviewer else None,
    )


def _build_po_item_response(item: PurchaseOrderItem) -> PurchaseOrderItemResponse:
    return PurchaseOrderItemResponse(
        id=item.id,
        organization_id=item.organization_id,
        purchase_order_id=item.purchase_order_id,
        item_description=item.item_description,
        quantity=item.quantity,
        unit=item.unit,
        unit_price=item.unit_price,
        tax_rate=item.tax_rate,
        tax_amount=item.tax_amount,
        line_total=item.line_total,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _build_purchase_order_response(
    po: PurchaseOrder, include_items: bool = False
) -> PurchaseOrderResponse | PurchaseOrderDetailResponse:
    vendor = po.vendor if hasattr(po, "vendor") and po.vendor is not None else None
    pr = (
        po.purchase_request
        if hasattr(po, "purchase_request") and po.purchase_request is not None
        else None
    )
    creator = po.created_by if hasattr(po, "created_by") and po.created_by is not None else None
    creator_name = f"{creator.first_name} {creator.last_name}".strip() if creator else None
    items_list = list(po.items) if hasattr(po, "items") and po.items is not None else []

    base_dict = {
        "id": po.id,
        "organization_id": po.organization_id,
        "po_number": po.po_number,
        "vendor_id": po.vendor_id,
        "purchase_request_id": po.purchase_request_id,
        "order_date": po.order_date,
        "expected_delivery_date": po.expected_delivery_date,
        "status": po.status,
        "subtotal": po.subtotal,
        "tax_amount": po.tax_amount,
        "total_amount": po.total_amount,
        "currency": po.currency,
        "notes": po.notes,
        "created_by_id": po.created_by_id,
        "created_at": po.created_at,
        "updated_at": po.updated_at,
        "vendor_name": vendor.name if vendor else None,
        "vendor_code": vendor.vendor_code if vendor else None,
        "request_number": pr.request_number if pr else None,
        "created_by_name": creator_name,
        "items_count": len(items_list),
    }

    if include_items:
        return PurchaseOrderDetailResponse(
            **base_dict,
            items=[_build_po_item_response(item) for item in items_list],
        )
    return PurchaseOrderResponse(**base_dict)


# ==========================================
# 1. Vendor Service Methods
# ==========================================
async def list_vendors(
    session: AsyncSession,
    organization_id: UUID,
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    is_active: bool | None = None,
) -> VendorListResponse:
    query = select(Vendor).where(Vendor.organization_id == organization_id)

    if is_active is not None:
        query = query.where(Vendor.is_active == is_active)

    if search:
        term = f"%{search.strip()}%"
        query = query.where(
            or_(
                Vendor.vendor_code.ilike(term),
                Vendor.name.ilike(term),
                Vendor.contact_person.ilike(term),
                Vendor.email.ilike(term),
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    total_res = await session.execute(count_query)
    total = total_res.scalar() or 0

    query = query.order_by(Vendor.name.asc()).offset((page - 1) * page_size).limit(page_size)
    result = await session.execute(query)
    vendors = _to_list(result.scalars())

    total_pages = ceil(total / page_size) if total > 0 else 1

    return VendorListResponse(
        items=[_build_vendor_response(v) for v in vendors],
        meta=PaginationMeta(total=total, page=page, page_size=page_size, total_pages=total_pages),
    )


async def get_vendor(
    session: AsyncSession, organization_id: UUID, vendor_id: UUID
) -> VendorResponse:
    query = select(Vendor).where(Vendor.organization_id == organization_id, Vendor.id == vendor_id)
    res = await session.execute(query)
    vendor = res.scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    return _build_vendor_response(vendor)


async def create_vendor(
    session: AsyncSession, organization_id: UUID, payload: VendorCreate, current_user_id: UUID
) -> VendorResponse:
    dup_query = select(Vendor).where(
        Vendor.organization_id == organization_id,
        func.upper(Vendor.vendor_code) == payload.vendor_code.upper(),
    )
    dup_res = await session.execute(dup_query)
    if dup_res.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Vendor with code '{payload.vendor_code}' already exists in this organization",
        )

    now = datetime.now(UTC)
    vendor = Vendor(
        id=uuid.uuid4(),
        organization_id=organization_id,
        vendor_code=payload.vendor_code,
        name=payload.name,
        contact_person=payload.contact_person,
        email=payload.email,
        phone=payload.phone,
        address=payload.address,
        tax_id=payload.tax_id,
        is_active=payload.is_active,
        created_at=now,
        updated_at=now,
    )
    session.add(vendor)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=current_user_id,
        action="vendor.create",
        entity_type="vendor",
        entity_id=vendor.id,
        details={
            "vendor_code": vendor.vendor_code,
            "name": vendor.name,
            "is_active": vendor.is_active,
        },
    )

    return _build_vendor_response(vendor)


async def update_vendor(
    session: AsyncSession,
    organization_id: UUID,
    vendor_id: UUID,
    payload: VendorUpdate,
    current_user_id: UUID,
) -> VendorResponse:
    query = select(Vendor).where(Vendor.organization_id == organization_id, Vendor.id == vendor_id)
    res = await session.execute(query)
    vendor = res.scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    changes: dict[str, Any] = {}
    if payload.name is not None and payload.name != vendor.name:
        changes["name"] = {"old": vendor.name, "new": payload.name}
        vendor.name = payload.name
    if payload.contact_person is not None and payload.contact_person != vendor.contact_person:
        changes["contact_person"] = {"old": vendor.contact_person, "new": payload.contact_person}
        vendor.contact_person = payload.contact_person
    if payload.email is not None and payload.email != vendor.email:
        changes["email"] = {"old": vendor.email, "new": payload.email}
        vendor.email = payload.email
    if payload.phone is not None and payload.phone != vendor.phone:
        changes["phone"] = {"old": vendor.phone, "new": payload.phone}
        vendor.phone = payload.phone
    if payload.address is not None and payload.address != vendor.address:
        changes["address"] = {"old": vendor.address, "new": payload.address}
        vendor.address = payload.address
    if payload.tax_id is not None and payload.tax_id != vendor.tax_id:
        changes["tax_id"] = {"old": vendor.tax_id, "new": payload.tax_id}
        vendor.tax_id = payload.tax_id
    if payload.is_active is not None and payload.is_active != vendor.is_active:
        changes["is_active"] = {"old": vendor.is_active, "new": payload.is_active}
        vendor.is_active = payload.is_active

    if changes:
        vendor.updated_at = datetime.now(UTC)
        await session.flush()
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=current_user_id,
            action="vendor.update",
            entity_type="vendor",
            entity_id=vendor.id,
            details=changes,
        )

    return _build_vendor_response(vendor)


# ==========================================
# 2. Purchase Request Service Methods
# ==========================================
async def _generate_pr_number(session: AsyncSession, organization_id: UUID) -> str:
    now = datetime.now(UTC)
    prefix = f"PR-{now.strftime('%Y%m')}-"
    query = (
        select(PurchaseRequest.request_number)
        .where(
            PurchaseRequest.organization_id == organization_id,
            PurchaseRequest.request_number.like(f"{prefix}%"),
        )
        .order_by(PurchaseRequest.request_number.desc())
        .limit(1)
    )
    res = await session.execute(query)
    last_number = res.scalar_one_or_none()
    if last_number:
        try:
            seq = int(last_number.split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


async def list_purchase_requests(
    session: AsyncSession,
    organization_id: UUID,
    current_user_id: UUID,
    current_employee_id: UUID | None,
    has_org_view_permission: bool,
    page: int = 1,
    page_size: int = 20,
    status_filter: str | None = None,
    priority_filter: str | None = None,
    department_id: UUID | None = None,
    requester_id: UUID | None = None,
    search: str | None = None,
) -> PurchaseRequestListResponse:
    query = (
        select(PurchaseRequest)
        .options(
            selectinload(PurchaseRequest.requester),
            selectinload(PurchaseRequest.department),
            selectinload(PurchaseRequest.reviewer),
        )
        .where(PurchaseRequest.organization_id == organization_id)
    )

    # Scoping: if user lacks organization-wide view permission, force filter to their own requests
    if not has_org_view_permission:
        if current_employee_id is None:
            return PurchaseRequestListResponse(
                items=[],
                meta=PaginationMeta(total=0, page=page, page_size=page_size, total_pages=1),
            )
        query = query.where(PurchaseRequest.requester_id == current_employee_id)
    elif requester_id is not None:
        query = query.where(PurchaseRequest.requester_id == requester_id)

    if status_filter:
        query = query.where(PurchaseRequest.status == status_filter)
    if priority_filter:
        query = query.where(PurchaseRequest.priority == priority_filter)
    if department_id:
        query = query.where(PurchaseRequest.department_id == department_id)

    if search:
        term = f"%{search.strip()}%"
        query = query.where(
            or_(
                PurchaseRequest.request_number.ilike(term),
                PurchaseRequest.purpose.ilike(term),
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    total_res = await session.execute(count_query)
    total = total_res.scalar() or 0

    query = (
        query.order_by(PurchaseRequest.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await session.execute(query)
    requests = _to_list(result.scalars())

    total_pages = ceil(total / page_size) if total > 0 else 1

    return PurchaseRequestListResponse(
        items=[_build_purchase_request_response(pr) for pr in requests],
        meta=PaginationMeta(total=total, page=page, page_size=page_size, total_pages=total_pages),
    )


async def get_purchase_request(
    session: AsyncSession,
    organization_id: UUID,
    request_id: UUID,
    current_employee_id: UUID | None,
    has_org_view_permission: bool,
) -> PurchaseRequestResponse:
    query = (
        select(PurchaseRequest)
        .options(
            selectinload(PurchaseRequest.requester),
            selectinload(PurchaseRequest.department),
            selectinload(PurchaseRequest.reviewer),
        )
        .where(
            PurchaseRequest.organization_id == organization_id,
            PurchaseRequest.id == request_id,
        )
    )
    res = await session.execute(query)
    pr = res.scalar_one_or_none()
    if not pr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Purchase request not found"
        )

    if not has_org_view_permission and (
        current_employee_id is None or pr.requester_id != current_employee_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this purchase request"
        )

    return _build_purchase_request_response(pr)


async def create_purchase_request(
    session: AsyncSession,
    organization_id: UUID,
    payload: PurchaseRequestCreate,
    current_employee_id: UUID | None,
    current_user_id: UUID,
) -> PurchaseRequestResponse:
    if current_employee_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Authenticated user must have an active employee profile to create a purchase request",
        )

    # Validate department if provided
    if payload.department_id:
        dept_query = select(Department).where(
            Department.organization_id == organization_id,
            Department.id == payload.department_id,
        )
        dept_res = await session.execute(dept_query)
        if dept_res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Department not found or belongs to another organization",
            )

    request_number = await _generate_pr_number(session, organization_id)
    now = datetime.now(UTC)

    pr = PurchaseRequest(
        id=uuid.uuid4(),
        organization_id=organization_id,
        request_number=request_number,
        requester_id=current_employee_id,
        department_id=payload.department_id,
        required_date=payload.required_date,
        priority=payload.priority,
        purpose=payload.purpose,
        estimated_amount=payload.estimated_amount,
        currency=payload.currency,
        status="draft",
        reviewer_id=None,
        reviewed_at=None,
        reviewer_comment=None,
        created_at=now,
        updated_at=now,
    )
    session.add(pr)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=current_user_id,
        action="purchase_request.create",
        entity_type="purchase_request",
        entity_id=pr.id,
        details={
            "request_number": pr.request_number,
            "purpose": pr.purpose,
            "estimated_amount": str(pr.estimated_amount),
            "priority": pr.priority,
            "status": pr.status,
        },
    )

    return await get_purchase_request(
        session, organization_id, pr.id, current_employee_id, has_org_view_permission=True
    )


async def update_purchase_request(
    session: AsyncSession,
    organization_id: UUID,
    request_id: UUID,
    payload: PurchaseRequestUpdate,
    current_employee_id: UUID | None,
    current_user_id: UUID,
    has_org_manage_permission: bool,
) -> PurchaseRequestResponse:
    query = (
        select(PurchaseRequest)
        .options(
            selectinload(PurchaseRequest.requester),
            selectinload(PurchaseRequest.department),
            selectinload(PurchaseRequest.reviewer),
        )
        .where(
            PurchaseRequest.organization_id == organization_id,
            PurchaseRequest.id == request_id,
        )
    )
    res = await session.execute(query)
    pr = res.scalar_one_or_none()
    if not pr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Purchase request not found"
        )

    if not has_org_manage_permission and (
        current_employee_id is None or pr.requester_id != current_employee_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to modify this purchase request",
        )

    if pr.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only draft purchase requests can be modified (current status: {pr.status})",
        )

    if payload.department_id is not None:
        dept_query = select(Department).where(
            Department.organization_id == organization_id,
            Department.id == payload.department_id,
        )
        dept_res = await session.execute(dept_query)
        if dept_res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Department not found or belongs to another organization",
            )

    changes: dict[str, Any] = {}
    if payload.department_id is not None and payload.department_id != pr.department_id:
        changes["department_id"] = {
            "old": str(pr.department_id) if pr.department_id else None,
            "new": str(payload.department_id),
        }
        pr.department_id = payload.department_id
    if payload.required_date is not None and payload.required_date != pr.required_date:
        changes["required_date"] = {
            "old": str(pr.required_date) if pr.required_date else None,
            "new": str(payload.required_date),
        }
        pr.required_date = payload.required_date
    if payload.priority is not None and payload.priority != pr.priority:
        changes["priority"] = {"old": pr.priority, "new": payload.priority}
        pr.priority = payload.priority
    if payload.purpose is not None and payload.purpose != pr.purpose:
        changes["purpose"] = {"old": pr.purpose, "new": payload.purpose}
        pr.purpose = payload.purpose
    if payload.estimated_amount is not None and payload.estimated_amount != pr.estimated_amount:
        changes["estimated_amount"] = {
            "old": str(pr.estimated_amount),
            "new": str(payload.estimated_amount),
        }
        pr.estimated_amount = payload.estimated_amount
    if payload.currency is not None and payload.currency != pr.currency:
        changes["currency"] = {"old": pr.currency, "new": payload.currency}
        pr.currency = payload.currency

    if changes:
        pr.updated_at = datetime.now(UTC)
        await session.flush()
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=current_user_id,
            action="purchase_request.update",
            entity_type="purchase_request",
            entity_id=pr.id,
            details=changes,
        )

    return _build_purchase_request_response(pr)


async def submit_purchase_request(
    session: AsyncSession,
    organization_id: UUID,
    request_id: UUID,
    current_employee_id: UUID | None,
    current_user_id: UUID,
    has_org_manage_permission: bool,
) -> PurchaseRequestResponse:
    query = (
        select(PurchaseRequest)
        .options(
            selectinload(PurchaseRequest.requester),
            selectinload(PurchaseRequest.department),
            selectinload(PurchaseRequest.reviewer),
        )
        .where(
            PurchaseRequest.organization_id == organization_id,
            PurchaseRequest.id == request_id,
        )
    )
    res = await session.execute(query)
    pr = res.scalar_one_or_none()
    if not pr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Purchase request not found"
        )

    if not has_org_manage_permission and (
        current_employee_id is None or pr.requester_id != current_employee_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to submit this purchase request",
        )

    if pr.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only draft purchase requests can be submitted (current status: {pr.status})",
        )

    pr.status = "submitted"
    pr.updated_at = datetime.now(UTC)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=current_user_id,
        action="purchase_request.submit",
        entity_type="purchase_request",
        entity_id=pr.id,
        details={"status": {"old": "draft", "new": "submitted"}},
    )

    return _build_purchase_request_response(pr)


async def approve_purchase_request(
    session: AsyncSession,
    organization_id: UUID,
    request_id: UUID,
    reviewer_comment: str | None,
    reviewer_employee_id: UUID | None,
    current_user_id: UUID,
) -> PurchaseRequestResponse:
    query = (
        select(PurchaseRequest)
        .options(
            selectinload(PurchaseRequest.requester),
            selectinload(PurchaseRequest.department),
            selectinload(PurchaseRequest.reviewer),
        )
        .where(
            PurchaseRequest.organization_id == organization_id,
            PurchaseRequest.id == request_id,
        )
    )
    res = await session.execute(query)
    pr = res.scalar_one_or_none()
    if not pr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Purchase request not found"
        )

    if pr.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only submitted purchase requests can be approved (current status: {pr.status})",
        )

    # Separation of duties: requester cannot approve their own request
    if reviewer_employee_id is not None and pr.requester_id == reviewer_employee_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Requesters cannot review or approve their own purchase requests",
        )

    now = datetime.now(UTC)
    pr.status = "approved"
    pr.reviewer_id = reviewer_employee_id
    pr.reviewed_at = now
    pr.reviewer_comment = reviewer_comment
    pr.updated_at = now
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=current_user_id,
        action="purchase_request.approve",
        entity_type="purchase_request",
        entity_id=pr.id,
        details={
            "status": {"old": "submitted", "new": "approved"},
            "reviewer_comment": reviewer_comment,
        },
    )

    return _build_purchase_request_response(pr)


async def reject_purchase_request(
    session: AsyncSession,
    organization_id: UUID,
    request_id: UUID,
    reviewer_comment: str | None,
    reviewer_employee_id: UUID | None,
    current_user_id: UUID,
) -> PurchaseRequestResponse:
    query = (
        select(PurchaseRequest)
        .options(
            selectinload(PurchaseRequest.requester),
            selectinload(PurchaseRequest.department),
            selectinload(PurchaseRequest.reviewer),
        )
        .where(
            PurchaseRequest.organization_id == organization_id,
            PurchaseRequest.id == request_id,
        )
    )
    res = await session.execute(query)
    pr = res.scalar_one_or_none()
    if not pr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Purchase request not found"
        )

    if pr.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only submitted purchase requests can be rejected (current status: {pr.status})",
        )

    # Separation of duties: requester cannot reject their own request (they should cancel instead)
    if reviewer_employee_id is not None and pr.requester_id == reviewer_employee_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Requesters cannot review or reject their own purchase requests (use cancel instead)",
        )

    now = datetime.now(UTC)
    pr.status = "rejected"
    pr.reviewer_id = reviewer_employee_id
    pr.reviewed_at = now
    pr.reviewer_comment = reviewer_comment
    pr.updated_at = now
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=current_user_id,
        action="purchase_request.reject",
        entity_type="purchase_request",
        entity_id=pr.id,
        details={
            "status": {"old": "submitted", "new": "rejected"},
            "reviewer_comment": reviewer_comment,
        },
    )

    return _build_purchase_request_response(pr)


async def cancel_purchase_request(
    session: AsyncSession,
    organization_id: UUID,
    request_id: UUID,
    current_employee_id: UUID | None,
    current_user_id: UUID,
    has_org_manage_permission: bool,
) -> PurchaseRequestResponse:
    query = (
        select(PurchaseRequest)
        .options(
            selectinload(PurchaseRequest.requester),
            selectinload(PurchaseRequest.department),
            selectinload(PurchaseRequest.reviewer),
        )
        .where(
            PurchaseRequest.organization_id == organization_id,
            PurchaseRequest.id == request_id,
        )
    )
    res = await session.execute(query)
    pr = res.scalar_one_or_none()
    if not pr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Purchase request not found"
        )

    if not has_org_manage_permission and (
        current_employee_id is None or pr.requester_id != current_employee_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to cancel this purchase request",
        )

    if pr.status in ("approved", "rejected", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel a purchase request that is already {pr.status}",
        )

    old_status = pr.status
    pr.status = "cancelled"
    pr.updated_at = datetime.now(UTC)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=current_user_id,
        action="purchase_request.cancel",
        entity_type="purchase_request",
        entity_id=pr.id,
        details={"status": {"old": old_status, "new": "cancelled"}},
    )

    return _build_purchase_request_response(pr)


# ==========================================
# 3. Purchase Order Service Methods
# ==========================================
async def _generate_po_number(session: AsyncSession, organization_id: UUID) -> str:
    now = datetime.now(UTC)
    prefix = f"PO-{now.strftime('%Y%m')}-"
    query = (
        select(PurchaseOrder.po_number)
        .where(
            PurchaseOrder.organization_id == organization_id,
            PurchaseOrder.po_number.like(f"{prefix}%"),
        )
        .order_by(PurchaseOrder.po_number.desc())
        .limit(1)
    )
    res = await session.execute(query)
    last_number = res.scalar_one_or_none()
    if last_number:
        try:
            seq = int(last_number.split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


async def list_purchase_orders(
    session: AsyncSession,
    organization_id: UUID,
    page: int = 1,
    page_size: int = 20,
    status_filter: str | None = None,
    vendor_id: UUID | None = None,
    search: str | None = None,
) -> PurchaseOrderListResponse:
    query = (
        select(PurchaseOrder)
        .options(
            selectinload(PurchaseOrder.vendor),
            selectinload(PurchaseOrder.purchase_request),
            selectinload(PurchaseOrder.created_by),
            selectinload(PurchaseOrder.items),
        )
        .where(PurchaseOrder.organization_id == organization_id)
    )

    if status_filter:
        query = query.where(PurchaseOrder.status == status_filter)
    if vendor_id:
        query = query.where(PurchaseOrder.vendor_id == vendor_id)

    if search:
        term = f"%{search.strip()}%"
        query = query.where(
            or_(
                PurchaseOrder.po_number.ilike(term),
                PurchaseOrder.notes.ilike(term),
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    total_res = await session.execute(count_query)
    total = total_res.scalar() or 0

    query = (
        query.order_by(PurchaseOrder.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await session.execute(query)
    orders = _to_list(result.scalars())

    total_pages = ceil(total / page_size) if total > 0 else 1

    return PurchaseOrderListResponse(
        items=[_build_purchase_order_response(po, include_items=False) for po in orders],
        meta=PaginationMeta(total=total, page=page, page_size=page_size, total_pages=total_pages),
    )


async def get_purchase_order(
    session: AsyncSession, organization_id: UUID, po_id: UUID
) -> PurchaseOrderDetailResponse:
    query = (
        select(PurchaseOrder)
        .options(
            selectinload(PurchaseOrder.vendor),
            selectinload(PurchaseOrder.purchase_request),
            selectinload(PurchaseOrder.created_by),
            selectinload(PurchaseOrder.items),
        )
        .where(
            PurchaseOrder.organization_id == organization_id,
            PurchaseOrder.id == po_id,
        )
    )
    res = await session.execute(query)
    po = res.scalar_one_or_none()
    if not po:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found"
        )

    return _build_purchase_order_response(po, include_items=True)


async def create_purchase_order(
    session: AsyncSession,
    organization_id: UUID,
    payload: PurchaseOrderCreate,
    current_employee_id: UUID | None,
    current_user_id: UUID,
) -> PurchaseOrderDetailResponse:
    # 1. Verify vendor belongs to organization
    vendor_query = select(Vendor).where(
        Vendor.organization_id == organization_id,
        Vendor.id == payload.vendor_id,
    )
    vendor_res = await session.execute(vendor_query)
    vendor = vendor_res.scalar_one_or_none()
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vendor not found or belongs to another organization",
        )

    # 2. Verify PR if provided
    if payload.purchase_request_id:
        pr_query = select(PurchaseRequest).where(
            PurchaseRequest.organization_id == organization_id,
            PurchaseRequest.id == payload.purchase_request_id,
        )
        pr_res = await session.execute(pr_query)
        pr = pr_res.scalar_one_or_none()
        if not pr:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Purchase request not found or belongs to another organization",
            )

    po_number = await _generate_po_number(session, organization_id)
    now = datetime.now(UTC)
    po_id = uuid.uuid4()

    # 3. Calculate financial totals server-side
    subtotal = Decimal("0.00")
    total_tax = Decimal("0.00")
    order_items: list[PurchaseOrderItem] = []

    for item_data in payload.items:
        line_sub = (item_data.quantity * item_data.unit_price).quantize(Decimal("0.01"))
        tax = (line_sub * (item_data.tax_rate / Decimal(100))).quantize(Decimal("0.01"))
        line_tot = line_sub + tax

        subtotal += line_sub
        total_tax += tax

        item = PurchaseOrderItem(
            id=uuid.uuid4(),
            organization_id=organization_id,
            purchase_order_id=po_id,
            item_description=item_data.item_description,
            quantity=item_data.quantity,
            unit=item_data.unit,
            unit_price=item_data.unit_price,
            tax_rate=item_data.tax_rate,
            tax_amount=tax,
            line_total=line_tot,
            created_at=now,
            updated_at=now,
        )
        order_items.append(item)

    total_amount = subtotal + total_tax

    po = PurchaseOrder(
        id=po_id,
        organization_id=organization_id,
        po_number=po_number,
        vendor_id=payload.vendor_id,
        purchase_request_id=payload.purchase_request_id,
        order_date=payload.order_date,
        expected_delivery_date=payload.expected_delivery_date,
        status="draft",
        subtotal=subtotal,
        tax_amount=total_tax,
        total_amount=total_amount,
        currency=payload.currency,
        notes=payload.notes,
        created_by_id=current_employee_id,
        created_at=now,
        updated_at=now,
    )
    session.add(po)
    for item in order_items:
        session.add(item)

    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=current_user_id,
        action="purchase_order.create",
        entity_type="purchase_order",
        entity_id=po.id,
        details={
            "po_number": po.po_number,
            "vendor_id": str(po.vendor_id),
            "total_amount": str(po.total_amount),
            "status": po.status,
            "items_count": len(order_items),
        },
    )

    return await get_purchase_order(session, organization_id, po.id)


async def update_purchase_order(
    session: AsyncSession,
    organization_id: UUID,
    po_id: UUID,
    payload: PurchaseOrderUpdate,
    current_user_id: UUID,
) -> PurchaseOrderDetailResponse:
    query = (
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .where(
            PurchaseOrder.organization_id == organization_id,
            PurchaseOrder.id == po_id,
        )
    )
    res = await session.execute(query)
    po = res.scalar_one_or_none()
    if not po:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found"
        )

    if po.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only draft purchase orders can be modified (current status: {po.status})",
        )

    changes: dict[str, Any] = {}

    if payload.vendor_id is not None and payload.vendor_id != po.vendor_id:
        vendor_query = select(Vendor).where(
            Vendor.organization_id == organization_id,
            Vendor.id == payload.vendor_id,
        )
        vendor_res = await session.execute(vendor_query)
        if vendor_res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vendor not found or belongs to another organization",
            )
        changes["vendor_id"] = {"old": str(po.vendor_id), "new": str(payload.vendor_id)}
        po.vendor_id = payload.vendor_id

    if (
        payload.expected_delivery_date is not None
        and payload.expected_delivery_date != po.expected_delivery_date
    ):
        if payload.expected_delivery_date < po.order_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Expected delivery date cannot be earlier than order date",
            )
        changes["expected_delivery_date"] = {
            "old": str(po.expected_delivery_date) if po.expected_delivery_date else None,
            "new": str(payload.expected_delivery_date),
        }
        po.expected_delivery_date = payload.expected_delivery_date

    if payload.notes is not None and payload.notes != po.notes:
        changes["notes"] = {"old": po.notes, "new": payload.notes}
        po.notes = payload.notes

    # Recreate items if provided
    if payload.items is not None:
        # Remove existing items
        for existing in list(po.items):
            await session.delete(existing)

        now = datetime.now(UTC)
        subtotal = Decimal("0.00")
        total_tax = Decimal("0.00")

        for item_data in payload.items:
            line_sub = (item_data.quantity * item_data.unit_price).quantize(Decimal("0.01"))
            tax = (line_sub * (item_data.tax_rate / Decimal(100))).quantize(Decimal("0.01"))
            line_tot = line_sub + tax

            subtotal += line_sub
            total_tax += tax

            item = PurchaseOrderItem(
                id=uuid.uuid4(),
                organization_id=organization_id,
                purchase_order_id=po.id,
                item_description=item_data.item_description,
                quantity=item_data.quantity,
                unit=item_data.unit,
                unit_price=item_data.unit_price,
                tax_rate=item_data.tax_rate,
                tax_amount=tax,
                line_total=line_tot,
                created_at=now,
                updated_at=now,
            )
            session.add(item)

        changes["subtotal"] = {"old": str(po.subtotal), "new": str(subtotal)}
        changes["total_amount"] = {"old": str(po.total_amount), "new": str(subtotal + total_tax)}
        po.subtotal = subtotal
        po.tax_amount = total_tax
        po.total_amount = subtotal + total_tax

    if changes:
        po.updated_at = datetime.now(UTC)
        await session.flush()
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=current_user_id,
            action="purchase_order.update",
            entity_type="purchase_order",
            entity_id=po.id,
            details=changes,
        )

    return await get_purchase_order(session, organization_id, po.id)


async def cancel_purchase_order(
    session: AsyncSession, organization_id: UUID, po_id: UUID, current_user_id: UUID
) -> PurchaseOrderDetailResponse:
    query = select(PurchaseOrder).where(
        PurchaseOrder.organization_id == organization_id,
        PurchaseOrder.id == po_id,
    )
    res = await session.execute(query)
    po = res.scalar_one_or_none()
    if not po:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found"
        )

    if po.status in ("cancelled", "closed", "received"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel a purchase order that is already {po.status}",
        )

    old_status = po.status
    po.status = "cancelled"
    po.updated_at = datetime.now(UTC)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=current_user_id,
        action="purchase_order.cancel",
        entity_type="purchase_order",
        entity_id=po.id,
        details={"status": {"old": old_status, "new": "cancelled"}},
    )

    return await get_purchase_order(session, organization_id, po.id)


async def close_purchase_order(
    session: AsyncSession, organization_id: UUID, po_id: UUID, current_user_id: UUID
) -> PurchaseOrderDetailResponse:
    query = select(PurchaseOrder).where(
        PurchaseOrder.organization_id == organization_id,
        PurchaseOrder.id == po_id,
    )
    res = await session.execute(query)
    po = res.scalar_one_or_none()
    if not po:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found"
        )

    if po.status in ("draft", "cancelled", "closed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot close a purchase order in status '{po.status}' (must be issued or received)",
        )

    old_status = po.status
    po.status = "closed"
    po.updated_at = datetime.now(UTC)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=current_user_id,
        action="purchase_order.close",
        entity_type="purchase_order",
        entity_id=po.id,
        details={"status": {"old": old_status, "new": "closed"}},
    )

    return await get_purchase_order(session, organization_id, po.id)
