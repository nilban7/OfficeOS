from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import require_permission
from app.schemas.common import ApiSuccess, PaginatedData
from app.schemas.procurement import (
    PurchaseOrderCreate,
    PurchaseOrderDetailResponse,
    PurchaseOrderResponse,
    PurchaseOrderUpdate,
)
from app.services.attendance import resolve_employee_for_user
from app.services.procurement import (
    cancel_purchase_order,
    close_purchase_order,
    create_purchase_order,
    get_purchase_order,
    list_purchase_orders,
    update_purchase_order,
)

router = APIRouter(prefix="/purchase-orders", tags=["Purchase Orders"])


@router.get(
    "",
    response_model=ApiSuccess[PaginatedData[PurchaseOrderResponse]],
    summary="List purchase orders",
)
async def list_orders_endpoint(
    session: Annotated[AsyncSession, Depends(require_permission("purchase_orders.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    status: Annotated[str | None, Query(description="Filter by order status")] = None,
    vendor_id: Annotated[UUID | None, Query(description="Filter by vendor ID")] = None,
    search: Annotated[str | None, Query(description="Search term (PO number, notes)")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Page size")] = 20,
) -> ApiSuccess[PaginatedData[PurchaseOrderResponse]]:
    org_id = UUID(organization_header)

    res = await list_purchase_orders(
        session=session,
        organization_id=org_id,
        page=page,
        page_size=page_size,
        status_filter=status,
        vendor_id=vendor_id,
        search=search,
    )

    return ApiSuccess(
        data=PaginatedData(
            items=res.items,
            meta=res.meta,
        )
    )


@router.post(
    "",
    response_model=ApiSuccess[PurchaseOrderDetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a purchase order with items",
)
async def create_order_endpoint(
    payload: PurchaseOrderCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("purchase_orders.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[PurchaseOrderDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)
    emp = await resolve_employee_for_user(session, org_id, user_id)
    emp_id = emp.id if emp else None

    item = await create_purchase_order(
        session=session,
        organization_id=org_id,
        payload=payload,
        current_employee_id=emp_id,
        current_user_id=user_id,
    )
    return ApiSuccess(data=item, message="Purchase order created successfully")


@router.get(
    "/{order_id}",
    response_model=ApiSuccess[PurchaseOrderDetailResponse],
    summary="Get purchase order details including line items",
)
async def get_order_endpoint(
    order_id: UUID,
    session: Annotated[AsyncSession, Depends(require_permission("purchase_orders.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[PurchaseOrderDetailResponse]:
    org_id = UUID(organization_header)

    item = await get_purchase_order(session=session, organization_id=org_id, po_id=order_id)
    return ApiSuccess(data=item)


@router.patch(
    "/{order_id}",
    response_model=ApiSuccess[PurchaseOrderDetailResponse],
    summary="Update a draft purchase order",
)
async def update_order_endpoint(
    order_id: UUID,
    payload: PurchaseOrderUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("purchase_orders.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[PurchaseOrderDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    item = await update_purchase_order(
        session=session,
        organization_id=org_id,
        po_id=order_id,
        payload=payload,
        current_user_id=user_id,
    )
    return ApiSuccess(data=item, message="Purchase order updated successfully")


@router.post(
    "/{order_id}/cancel",
    response_model=ApiSuccess[PurchaseOrderDetailResponse],
    summary="Cancel a purchase order",
)
async def cancel_order_endpoint(
    order_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("purchase_orders.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[PurchaseOrderDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    item = await cancel_purchase_order(
        session=session,
        organization_id=org_id,
        po_id=order_id,
        current_user_id=user_id,
    )
    return ApiSuccess(data=item, message="Purchase order cancelled successfully")


@router.post(
    "/{order_id}/close",
    response_model=ApiSuccess[PurchaseOrderDetailResponse],
    summary="Close an issued/received purchase order",
)
async def close_order_endpoint(
    order_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("purchase_orders.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[PurchaseOrderDetailResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    item = await close_purchase_order(
        session=session,
        organization_id=org_id,
        po_id=order_id,
        current_user_id=user_id,
    )
    return ApiSuccess(data=item, message="Purchase order closed successfully")
