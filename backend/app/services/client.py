import uuid
from datetime import UTC, datetime
from math import ceil
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.client import Client, ClientContact
from app.schemas.client import (
    ClientCreate,
    ClientDetailResponse,
    ClientResponse,
    ClientUpdate,
    ContactCreate,
    ContactResponse,
    ContactUpdate,
)
from app.schemas.common import PaginatedData, PaginationMeta
from app.services.organization import record_audit_log


def _to_list(result: Any) -> list[Any]:
    if hasattr(result, "all"):
        return list(result.all())
    return list(result)


def _build_client_response(client: Client) -> ClientResponse:
    contacts = list(client.contacts) if hasattr(client, "contacts") and client.contacts is not None else []
    primary = next((c for c in contacts if c.is_primary), None)
    if primary is None and contacts:
        primary = contacts[0]

    return ClientResponse(
        id=client.id,
        organization_id=client.organization_id,
        client_code=client.client_code,
        name=client.name,
        legal_name=client.legal_name,
        client_type=client.client_type,
        email=client.email,
        phone=client.phone,
        website=client.website,
        address=client.address,
        city=client.city,
        state=client.state,
        postal_code=client.postal_code,
        country=client.country,
        tax_id=client.tax_id,
        status=client.status,
        notes=client.notes,
        created_at=client.created_at,
        updated_at=client.updated_at,
        primary_contact=ContactResponse.model_validate(primary) if primary else None,
        contacts_count=len(contacts),
    )


def _build_client_detail_response(client: Client) -> ClientDetailResponse:
    base = _build_client_response(client)
    contacts = list(client.contacts) if hasattr(client, "contacts") and client.contacts is not None else []
    sorted_contacts = sorted(contacts, key=lambda c: (not c.is_primary, c.name.lower()))

    return ClientDetailResponse(
        **base.model_dump(),
        contacts=[ContactResponse.model_validate(c) for c in sorted_contacts],
    )


# ==========================================
# Client Services
# ==========================================
async def list_clients(
    session: AsyncSession,
    organization_id: UUID,
    search: str | None = None,
    status_filter: str | None = None,
    client_type: str | None = None,
    page: int = 1,
    page_size: int = 50,
    sort_by: str = "created_at",
    sort_order: str = "desc",
) -> PaginatedData[ClientResponse]:
    page = max(1, page)
    page_size = max(1, min(page_size, 100))

    base_query = select(Client).where(Client.organization_id == organization_id)

    if status_filter:
        base_query = base_query.where(Client.status == status_filter)

    if client_type:
        base_query = base_query.where(Client.client_type == client_type)

    if search:
        search_term = f"%{search.strip()}%"
        base_query = base_query.where(
            or_(
                Client.name.ilike(search_term),
                Client.client_code.ilike(search_term),
                Client.email.ilike(search_term),
                Client.tax_id.ilike(search_term),
                Client.phone.ilike(search_term),
                Client.city.ilike(search_term),
            )
        )

    count_query = select(func.count()).select_from(base_query.subquery())
    total = (await session.execute(count_query)).scalar() or 0
    total_pages = ceil(total / page_size) if total > 0 else 0

    sort_column_map = {
        "name": Client.name,
        "client_code": Client.client_code,
        "created_at": Client.created_at,
        "updated_at": Client.updated_at,
        "status": Client.status,
        "client_type": Client.client_type,
    }
    col = sort_column_map.get(sort_by, Client.created_at)
    order_clause = col.desc() if sort_order.lower() == "desc" else col.asc()

    query = (
        base_query.options(selectinload(Client.contacts))
        .order_by(order_clause, Client.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    result = await session.scalars(query)
    clients = _to_list(result)

    items = [_build_client_response(c) for c in clients]

    return PaginatedData(
        items=items,
        meta=PaginationMeta(
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        ),
    )


async def get_client(
    session: AsyncSession,
    organization_id: UUID,
    client_id: UUID,
) -> ClientDetailResponse:
    query = (
        select(Client)
        .options(selectinload(Client.contacts))
        .where(
            Client.id == client_id,
            Client.organization_id == organization_id,
        )
    )
    client = await session.scalar(query)
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found",
        )

    return _build_client_detail_response(client)


async def create_client(
    session: AsyncSession,
    organization_id: UUID,
    data: ClientCreate,
    actor_id: UUID | None = None,
    ip_address: str | None = None,
) -> ClientDetailResponse:
    normalized_code = data.client_code.strip().upper()

    existing = await session.scalar(
        select(Client).where(
            Client.organization_id == organization_id,
            Client.client_code == normalized_code,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Client with code '{normalized_code}' already exists in this organization",
        )

    now = datetime.now(UTC)
    client = Client(
        id=uuid.uuid4(),
        organization_id=organization_id,
        client_code=normalized_code,
        name=data.name.strip(),
        legal_name=data.legal_name.strip() if data.legal_name else None,
        client_type=data.client_type,
        email=data.email,
        phone=data.phone,
        website=data.website,
        address=data.address,
        city=data.city,
        state=data.state,
        postal_code=data.postal_code,
        country=data.country,
        tax_id=data.tax_id,
        status=data.status,
        notes=data.notes,
        created_at=now,
        updated_at=now,
    )
    session.add(client)

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_id,
        action="client.create",
        entity_type="client",
        entity_id=client.id,
        details={
            "client_code": client.client_code,
            "name": client.name,
            "status": client.status,
            "client_type": client.client_type,
        },
        ip_address=ip_address,
    )

    await session.flush()
    # Explicitly attach empty contacts for response construction
    client.contacts = []
    return _build_client_detail_response(client)


async def update_client(
    session: AsyncSession,
    organization_id: UUID,
    client_id: UUID,
    data: ClientUpdate,
    actor_id: UUID | None = None,
    ip_address: str | None = None,
) -> ClientDetailResponse:
    query = (
        select(Client)
        .options(selectinload(Client.contacts))
        .where(
            Client.id == client_id,
            Client.organization_id == organization_id,
        )
    )
    client = await session.scalar(query)
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found",
        )

    changes: dict[str, Any] = {}

    if data.client_code is not None:
        normalized_code = data.client_code.strip().upper()
        if normalized_code != client.client_code:
            existing = await session.scalar(
                select(Client).where(
                    Client.organization_id == organization_id,
                    Client.client_code == normalized_code,
                    Client.id != client_id,
                )
            )
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Client with code '{normalized_code}' already exists in this organization",
                )
            changes["client_code"] = {"old": client.client_code, "new": normalized_code}
            client.client_code = normalized_code

    updatable_fields = [
        "name",
        "legal_name",
        "client_type",
        "email",
        "phone",
        "website",
        "address",
        "city",
        "state",
        "postal_code",
        "country",
        "tax_id",
        "status",
        "notes",
    ]
    for field in updatable_fields:
        val = getattr(data, field)
        if val is not None:
            old_val = getattr(client, field)
            if old_val != val:
                changes[field] = {"old": old_val, "new": val}
                setattr(client, field, val)

    if changes:
        client.updated_at = datetime.now(UTC)
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_id,
            action="client.update",
            entity_type="client",
            entity_id=client.id,
            details={"changes": changes},
            ip_address=ip_address,
        )

    await session.flush()
    return _build_client_detail_response(client)


async def archive_client(
    session: AsyncSession,
    organization_id: UUID,
    client_id: UUID,
    actor_id: UUID | None = None,
    ip_address: str | None = None,
) -> ClientDetailResponse:
    query = (
        select(Client)
        .options(selectinload(Client.contacts))
        .where(
            Client.id == client_id,
            Client.organization_id == organization_id,
        )
    )
    client = await session.scalar(query)
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found",
        )

    client.status = "archived"
    client.updated_at = datetime.now(UTC)

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_id,
        action="client.archive",
        entity_type="client",
        entity_id=client.id,
        details={
            "client_code": client.client_code,
            "name": client.name,
            "status": "archived",
        },
        ip_address=ip_address,
    )

    await session.flush()
    return _build_client_detail_response(client)


# ==========================================
# Client Contacts Services
# ==========================================
async def list_contacts(
    session: AsyncSession,
    organization_id: UUID,
    client_id: UUID,
) -> list[ContactResponse]:
    # Ensure client exists in current organization
    client_exists = await session.scalar(
        select(Client.id).where(
            Client.id == client_id,
            Client.organization_id == organization_id,
        )
    )
    if not client_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found",
        )

    query = (
        select(ClientContact)
        .where(
            ClientContact.client_id == client_id,
            ClientContact.organization_id == organization_id,
        )
        .order_by(ClientContact.is_primary.desc(), ClientContact.name.asc())
    )
    contacts = _to_list(await session.scalars(query))
    return [ContactResponse.model_validate(c) for c in contacts]


async def get_contact(
    session: AsyncSession,
    organization_id: UUID,
    client_id: UUID,
    contact_id: UUID,
) -> ContactResponse:
    query = select(ClientContact).where(
        ClientContact.id == contact_id,
        ClientContact.client_id == client_id,
        ClientContact.organization_id == organization_id,
    )
    contact = await session.scalar(query)
    if contact is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found",
        )

    return ContactResponse.model_validate(contact)


async def create_contact(
    session: AsyncSession,
    organization_id: UUID,
    client_id: UUID,
    data: ContactCreate,
    actor_id: UUID | None = None,
    ip_address: str | None = None,
) -> ContactResponse:
    # Ensure client exists in current organization
    client = await session.scalar(
        select(Client).where(
            Client.id == client_id,
            Client.organization_id == organization_id,
        )
    )
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found",
        )

    existing_count = await session.scalar(
        select(func.count(ClientContact.id)).where(
            ClientContact.client_id == client_id,
            ClientContact.organization_id == organization_id,
        )
    ) or 0

    # Primary contact consistency
    is_primary = data.is_primary
    if is_primary:
        # Unset primary flag from siblings
        await session.execute(
            update(ClientContact)
            .where(
                ClientContact.client_id == client_id,
                ClientContact.organization_id == organization_id,
            )
            .values(is_primary=False)
        )
    elif existing_count == 0:
        # Default first contact to primary
        is_primary = True

    now = datetime.now(UTC)
    contact = ClientContact(
        id=uuid.uuid4(),
        organization_id=organization_id,
        client_id=client_id,
        name=data.name.strip(),
        designation=data.designation.strip() if data.designation else None,
        email=data.email,
        phone=data.phone,
        is_primary=is_primary,
        notes=data.notes,
        created_at=now,
        updated_at=now,
    )
    session.add(contact)

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_id,
        action="client_contact.create",
        entity_type="client_contact",
        entity_id=contact.id,
        details={
            "client_id": str(client_id),
            "name": contact.name,
            "designation": contact.designation,
            "is_primary": contact.is_primary,
        },
        ip_address=ip_address,
    )

    await session.flush()
    return ContactResponse.model_validate(contact)


async def update_contact(
    session: AsyncSession,
    organization_id: UUID,
    client_id: UUID,
    contact_id: UUID,
    data: ContactUpdate,
    actor_id: UUID | None = None,
    ip_address: str | None = None,
) -> ContactResponse:
    query = select(ClientContact).where(
        ClientContact.id == contact_id,
        ClientContact.client_id == client_id,
        ClientContact.organization_id == organization_id,
    )
    contact = await session.scalar(query)
    if contact is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found",
        )

    changes: dict[str, Any] = {}

    if data.is_primary is True and not contact.is_primary:
        # Promote to primary, demote siblings
        await session.execute(
            update(ClientContact)
            .where(
                ClientContact.client_id == client_id,
                ClientContact.organization_id == organization_id,
                ClientContact.id != contact_id,
            )
            .values(is_primary=False)
        )
        changes["is_primary"] = {"old": False, "new": True}
        contact.is_primary = True
    elif data.is_primary is False and contact.is_primary:
        changes["is_primary"] = {"old": True, "new": False}
        contact.is_primary = False

    for field in ["name", "designation", "email", "phone", "notes"]:
        val = getattr(data, field)
        if val is not None:
            old_val = getattr(contact, field)
            if old_val != val:
                changes[field] = {"old": old_val, "new": val}
                setattr(contact, field, val)

    if changes:
        contact.updated_at = datetime.now(UTC)
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_id,
            action="client_contact.update",
            entity_type="client_contact",
            entity_id=contact.id,
            details={"changes": changes},
            ip_address=ip_address,
        )

    await session.flush()
    return ContactResponse.model_validate(contact)


async def delete_contact(
    session: AsyncSession,
    organization_id: UUID,
    client_id: UUID,
    contact_id: UUID,
    actor_id: UUID | None = None,
    ip_address: str | None = None,
) -> None:
    query = select(ClientContact).where(
        ClientContact.id == contact_id,
        ClientContact.client_id == client_id,
        ClientContact.organization_id == organization_id,
    )
    contact = await session.scalar(query)
    if contact is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found",
        )

    was_primary = contact.is_primary
    contact_name = contact.name

    await session.delete(contact)

    # If deleted contact was primary, appoint next sibling if any exists
    if was_primary:
        next_sibling = await session.scalar(
            select(ClientContact)
            .where(
                ClientContact.client_id == client_id,
                ClientContact.organization_id == organization_id,
                ClientContact.id != contact_id,
            )
            .order_by(ClientContact.created_at.asc())
        )
        if next_sibling:
            next_sibling.is_primary = True

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_id,
        action="client_contact.delete",
        entity_type="client_contact",
        entity_id=contact_id,
        details={"client_id": str(client_id), "name": contact_name},
        ip_address=ip_address,
    )

    await session.flush()
