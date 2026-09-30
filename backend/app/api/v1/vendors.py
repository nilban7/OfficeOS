from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import require_permission
from app.schemas.common import ApiSuccess, PaginatedData
from app.schemas.procurement import (
    VendorCreate,
    VendorResponse,
    VendorUpdate,
)
from app.services.procurement import (
    create_vendor,
    get_vendor,
    list_vendors,
    update_vendor,
)

router = APIRouter(prefix="/vendors", tags=["Vendors"])


@router.get(
    "",
    response_model=ApiSuccess[PaginatedData[VendorResponse]],
    summary="List vendors",
)
async def list_vendors_endpoint(
    session: Annotated[AsyncSession, Depends(require_permission("vendors.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    search: Annotated[
        str | None, Query(description="Search term (code, name, contact, email)")
    ] = None,
    is_active: Annotated[bool | None, Query(description="Filter by active status")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Page size")] = 20,
) -> ApiSuccess[PaginatedData[VendorResponse]]:
    org_id = UUID(organization_header)

    res = await list_vendors(
        session=session,
        organization_id=org_id,
        page=page,
        page_size=page_size,
        search=search,
        is_active=is_active,
    )

    return ApiSuccess(
        data=PaginatedData(
            items=res.items,
            meta=res.meta,
        )
    )


@router.post(
    "",
    response_model=ApiSuccess[VendorResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new vendor record",
)
async def create_vendor_endpoint(
    payload: VendorCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("vendors.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[VendorResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    item = await create_vendor(
        session=session,
        organization_id=org_id,
        payload=payload,
        current_user_id=user_id,
    )
    return ApiSuccess(data=item, message="Vendor created successfully")


@router.get(
    "/{vendor_id}",
    response_model=ApiSuccess[VendorResponse],
    summary="Get vendor details",
)
async def get_vendor_endpoint(
    vendor_id: UUID,
    session: Annotated[AsyncSession, Depends(require_permission("vendors.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[VendorResponse]:
    org_id = UUID(organization_header)

    item = await get_vendor(session=session, organization_id=org_id, vendor_id=vendor_id)
    return ApiSuccess(data=item)


@router.patch(
    "/{vendor_id}",
    response_model=ApiSuccess[VendorResponse],
    summary="Update vendor details",
)
async def update_vendor_endpoint(
    vendor_id: UUID,
    payload: VendorUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("vendors.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[VendorResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    item = await update_vendor(
        session=session,
        organization_id=org_id,
        vendor_id=vendor_id,
        payload=payload,
        current_user_id=user_id,
    )
    return ApiSuccess(data=item, message="Vendor updated successfully")
