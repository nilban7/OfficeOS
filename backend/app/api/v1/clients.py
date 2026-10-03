from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import require_permission
from app.schemas.client import (
    ClientCreate,
    ClientDetailResponse,
    ClientResponse,
    ClientUpdate,
    ContactCreate,
    ContactResponse,
    ContactUpdate,
)
from app.schemas.common import ApiSuccess, PaginatedData
from app.services.client import (
    archive_client,
    create_client,
    create_contact,
    delete_contact,
    get_client,
    get_contact,
    list_clients,
    list_contacts,
    update_client,
    update_contact,
)
from app.services.identity import get_profile

router = APIRouter(prefix="/clients", tags=["clients"])


def get_ip_address(request: Request) -> str | None:
    return request.client.host if request.client else None


async def get_actor_profile_id(session: AsyncSession, user: AuthenticatedUser) -> UUID | None:
    profile = await get_profile(session, user)
    return profile.id if profile else None


# ==========================================
# Client Endpoints
# ==========================================
@router.get(
    "",
    response_model=ApiSuccess[PaginatedData[ClientResponse]],
    summary="List organization clients",
)
async def list_org_clients(
    session: Annotated[AsyncSession, Depends(require_permission("clients.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    search: Annotated[str | None, Query(description="Search term (code, name, email, tax id)")] = None,
    status: Annotated[str | None, Query(description="Filter by client status")] = None,
    client_type: Annotated[str | None, Query(description="Filter by client type")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Page size")] = 50,
    sort_by: Annotated[str, Query(description="Field to sort by")] = "created_at",
    sort_order: Annotated[str, Query(description="asc or desc")] = "desc",
) -> ApiSuccess[PaginatedData[ClientResponse]]:
    org_id = UUID(organization_header)
    data = await list_clients(
        session=session,
        organization_id=org_id,
        search=search,
        status_filter=status,
        client_type=client_type,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return ApiSuccess(data=data)


@router.post(
    "",
    response_model=ApiSuccess[ClientDetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new client",
)
async def create_org_client(
    data: ClientCreate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("clients.create"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ClientDetailResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    client = await create_client(
        session=session,
        organization_id=org_id,
        data=data,
        actor_id=actor_id,
        ip_address=ip,
    )
    return ApiSuccess(data=client)


@router.get(
    "/{client_id}",
    response_model=ApiSuccess[ClientDetailResponse],
    summary="Get single client details with contacts",
)
async def get_org_client(
    client_id: UUID,
    session: Annotated[AsyncSession, Depends(require_permission("clients.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ClientDetailResponse]:
    org_id = UUID(organization_header)
    client = await get_client(session=session, organization_id=org_id, client_id=client_id)
    return ApiSuccess(data=client)


@router.patch(
    "/{client_id}",
    response_model=ApiSuccess[ClientDetailResponse],
    summary="Update client details",
)
async def update_org_client(
    client_id: UUID,
    data: ClientUpdate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("clients.update"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ClientDetailResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    client = await update_client(
        session=session,
        organization_id=org_id,
        client_id=client_id,
        data=data,
        actor_id=actor_id,
        ip_address=ip,
    )
    return ApiSuccess(data=client)


@router.delete(
    "/{client_id}",
    response_model=ApiSuccess[ClientDetailResponse],
    summary="Archive client",
)
async def archive_org_client(
    client_id: UUID,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("clients.delete"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ClientDetailResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    client = await archive_client(
        session=session,
        organization_id=org_id,
        client_id=client_id,
        actor_id=actor_id,
        ip_address=ip,
    )
    return ApiSuccess(data=client, message="Client archived successfully")


# ==========================================
# Client Contacts Endpoints
# ==========================================
@router.get(
    "/{client_id}/contacts",
    response_model=ApiSuccess[list[ContactResponse]],
    summary="List contacts for a client",
)
async def list_org_client_contacts(
    client_id: UUID,
    session: Annotated[AsyncSession, Depends(require_permission("client_contacts.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[list[ContactResponse]]:
    org_id = UUID(organization_header)
    contacts = await list_contacts(
        session=session,
        organization_id=org_id,
        client_id=client_id,
    )
    return ApiSuccess(data=contacts)


@router.post(
    "/{client_id}/contacts",
    response_model=ApiSuccess[ContactResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new contact for a client",
)
async def create_org_client_contact(
    client_id: UUID,
    data: ContactCreate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("client_contacts.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ContactResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    contact = await create_contact(
        session=session,
        organization_id=org_id,
        client_id=client_id,
        data=data,
        actor_id=actor_id,
        ip_address=ip,
    )
    return ApiSuccess(data=contact)


@router.get(
    "/{client_id}/contacts/{contact_id}",
    response_model=ApiSuccess[ContactResponse],
    summary="Get single contact details",
)
async def get_org_client_contact(
    client_id: UUID,
    contact_id: UUID,
    session: Annotated[AsyncSession, Depends(require_permission("client_contacts.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ContactResponse]:
    org_id = UUID(organization_header)
    contact = await get_contact(
        session=session,
        organization_id=org_id,
        client_id=client_id,
        contact_id=contact_id,
    )
    return ApiSuccess(data=contact)


@router.patch(
    "/{client_id}/contacts/{contact_id}",
    response_model=ApiSuccess[ContactResponse],
    summary="Update contact details",
)
async def update_org_client_contact(
    client_id: UUID,
    contact_id: UUID,
    data: ContactUpdate,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("client_contacts.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ContactResponse]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    contact = await update_contact(
        session=session,
        organization_id=org_id,
        client_id=client_id,
        contact_id=contact_id,
        data=data,
        actor_id=actor_id,
        ip_address=ip,
    )
    return ApiSuccess(data=contact)


@router.delete(
    "/{client_id}/contacts/{contact_id}",
    response_model=ApiSuccess[dict[str, bool]],
    summary="Delete a contact",
)
async def delete_org_client_contact(
    client_id: UUID,
    contact_id: UUID,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("client_contacts.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[dict[str, bool]]:
    org_id = UUID(organization_header)
    actor_id = await get_actor_profile_id(session, current_user)
    ip = get_ip_address(request)
    await delete_contact(
        session=session,
        organization_id=org_id,
        client_id=client_id,
        contact_id=contact_id,
        actor_id=actor_id,
        ip_address=ip,
    )
    return ApiSuccess(data={"deleted": True}, message="Contact deleted successfully")
