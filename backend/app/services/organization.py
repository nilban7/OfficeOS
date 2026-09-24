import uuid
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.identity import (
    Branch,
    MembershipRole,
    Organization,
    OrganizationMembership,
    OrganizationSetting,
    Profile,
    Role,
)
from app.schemas.organization import (
    BranchCreate,
    BranchUpdate,
    MemberAddRequest,
    MemberUpdateRequest,
    OrganizationProfileUpdate,
    OrganizationSettingsUpdate,
)


def _to_list(result: Any) -> list[Any]:
    if result is None:
        return []
    if isinstance(result, list):
        return result
    if hasattr(result, "all"):
        return list(result.all())
    return list(result)


async def record_audit_log(
    session: AsyncSession,
    organization_id: UUID,
    actor_id: UUID | None,
    action: str,
    entity_type: str,
    entity_id: UUID | None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    log_entry = AuditLog(
        id=uuid.uuid4(),
        organization_id=organization_id,
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details or {},
        ip_address=ip_address,
        created_at=datetime.now(UTC),
    )
    session.add(log_entry)
    return log_entry


# --- Organization Profile & Settings ---


async def get_organization_profile(session: AsyncSession, organization_id: UUID) -> Organization:
    org = await session.scalar(select(Organization).where(Organization.id == organization_id))
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return org


async def update_organization_profile(
    session: AsyncSession,
    organization_id: UUID,
    data: OrganizationProfileUpdate,
    actor_id: UUID | None,
    ip_address: str | None = None,
) -> Organization:
    org = await get_organization_profile(session, organization_id)
    changes: dict[str, Any] = {}

    if data.name is not None and data.name != org.name:
        changes["name"] = {"from": org.name, "to": data.name}
        org.name = data.name

    if changes:
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_id,
            action="organizations.update",
            entity_type="organization",
            entity_id=org.id,
            details=changes,
            ip_address=ip_address,
        )

    return org


async def get_organization_settings(session: AsyncSession, organization_id: UUID) -> OrganizationSetting:
    settings = await session.scalar(
        select(OrganizationSetting).where(OrganizationSetting.organization_id == organization_id)
    )
    if settings is None:
        now = datetime.now(UTC)
        settings = OrganizationSetting(
            id=uuid.uuid4(),
            organization_id=organization_id,
            timezone="UTC",
            currency="USD",
            created_at=now,
            updated_at=now,
        )
        session.add(settings)
        await session.flush()
    return settings


async def update_organization_settings(
    session: AsyncSession,
    organization_id: UUID,
    data: OrganizationSettingsUpdate,
    actor_id: UUID | None,
    ip_address: str | None = None,
) -> OrganizationSetting:
    settings = await get_organization_settings(session, organization_id)
    changes: dict[str, Any] = {}

    if data.timezone is not None and data.timezone != settings.timezone:
        changes["timezone"] = {"from": settings.timezone, "to": data.timezone}
        settings.timezone = data.timezone

    if data.currency is not None and data.currency != settings.currency:
        changes["currency"] = {"from": settings.currency, "to": data.currency}
        settings.currency = data.currency

    if changes:
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_id,
            action="organizations.settings_update",
            entity_type="organization_settings",
            entity_id=settings.id,
            details=changes,
            ip_address=ip_address,
        )

    return settings


# --- Branches ---


async def list_branches(
    session: AsyncSession,
    organization_id: UUID,
    include_inactive: bool = False,
) -> list[Branch]:
    query = select(Branch).where(Branch.organization_id == organization_id)
    if not include_inactive:
        query = query.where(Branch.is_active.is_(True))
    query = query.order_by(Branch.name)
    result = await session.scalars(query)
    return _to_list(result)


async def get_branch(session: AsyncSession, organization_id: UUID, branch_id: UUID) -> Branch:
    branch = await session.scalar(
        select(Branch).where(Branch.id == branch_id, Branch.organization_id == organization_id)
    )
    if branch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Branch '{branch_id}' not found in this organization",
        )
    return branch


async def create_branch(
    session: AsyncSession,
    organization_id: UUID,
    data: BranchCreate,
    actor_id: UUID | None,
    ip_address: str | None = None,
) -> Branch:
    existing = await session.scalar(
        select(Branch).where(Branch.organization_id == organization_id, Branch.code == data.code)
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Branch with code '{data.code}' already exists in this organization",
        )

    now = datetime.now(UTC)
    branch = Branch(
        id=uuid.uuid4(),
        organization_id=organization_id,
        name=data.name,
        code=data.code,
        address=data.address,
        is_active=data.is_active,
        created_at=now,
        updated_at=now,
    )
    session.add(branch)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_id,
        action="branches.create",
        entity_type="branch",
        entity_id=branch.id,
        details={"name": branch.name, "code": branch.code, "is_active": branch.is_active},
        ip_address=ip_address,
    )
    return branch


async def update_branch(
    session: AsyncSession,
    organization_id: UUID,
    branch_id: UUID,
    data: BranchUpdate,
    actor_id: UUID | None,
    ip_address: str | None = None,
) -> Branch:
    branch = await get_branch(session, organization_id, branch_id)
    changes: dict[str, Any] = {}

    if data.code is not None and data.code != branch.code:
        conflict = await session.scalar(
            select(Branch).where(
                Branch.organization_id == organization_id,
                Branch.code == data.code,
                Branch.id != branch_id,
            )
        )
        if conflict is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Branch with code '{data.code}' already exists in this organization",
            )
        changes["code"] = {"from": branch.code, "to": data.code}
        branch.code = data.code

    if data.name is not None and data.name != branch.name:
        changes["name"] = {"from": branch.name, "to": data.name}
        branch.name = data.name

    if data.address is not None and data.address != branch.address:
        changes["address"] = {"from": branch.address, "to": data.address}
        branch.address = data.address

    if data.is_active is not None and data.is_active != branch.is_active:
        changes["is_active"] = {"from": branch.is_active, "to": data.is_active}
        branch.is_active = data.is_active

    if changes:
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_id,
            action="branches.update",
            entity_type="branch",
            entity_id=branch.id,
            details=changes,
            ip_address=ip_address,
        )

    return branch


async def deactivate_branch(
    session: AsyncSession,
    organization_id: UUID,
    branch_id: UUID,
    actor_id: UUID | None,
    ip_address: str | None = None,
) -> Branch:
    branch = await get_branch(session, organization_id, branch_id)
    if branch.is_active:
        branch.is_active = False
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_id,
            action="branches.deactivate",
            entity_type="branch",
            entity_id=branch.id,
            details={"is_active": False},
            ip_address=ip_address,
        )
    return branch


# --- Roles ---


async def list_roles(session: AsyncSession, organization_id: UUID) -> list[Role]:
    query = (
        select(Role)
        .where(
            or_(
                Role.organization_id == organization_id,
                Role.is_system.is_(True),
                Role.organization_id.is_(None),
            )
        )
        .order_by(Role.name)
    )
    result = await session.scalars(query)
    return _to_list(result)


# --- Members ---


async def _check_sole_admin_protection(
    session: AsyncSession,
    organization_id: UUID,
    membership_id: UUID,
    is_deactivating: bool = False,
    new_role_ids: list[UUID] | None = None,
) -> None:
    admin_roles = _to_list(
        await session.scalars(
            select(Role).where(Role.name.in_(["organization_owner", "organization_admin"]))
        )
    )
    admin_role_ids = {r.id for r in admin_roles}

    current_membership = await session.scalar(
        select(OrganizationMembership).where(OrganizationMembership.id == membership_id)
    )
    if current_membership is None or current_membership.status != "active":
        return

    current_roles = _to_list(
        await session.scalars(
            select(Role.id)
            .join(MembershipRole, MembershipRole.role_id == Role.id)
            .where(MembershipRole.membership_id == membership_id)
        )
    )
    is_admin = any(r_id in admin_role_ids for r_id in current_roles)
    if not is_admin:
        return

    # Count other active admins in this tenant
    other_admins_count = await session.scalar(
        select(func.count(distinct(OrganizationMembership.id)))
        .join(MembershipRole, MembershipRole.membership_id == OrganizationMembership.id)
        .where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.id != membership_id,
            OrganizationMembership.status == "active",
            MembershipRole.role_id.in_(admin_role_ids),
        )
    )
    other_admins_count = other_admins_count or 0

    if other_admins_count == 0:
        if is_deactivating:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate or remove the sole active organization administrator",
            )
        if new_role_ids is not None:
            will_remain_admin = any(r_id in admin_role_ids for r_id in new_role_ids)
            if not will_remain_admin:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot revoke administrator privileges from the sole active organization administrator",
                )


async def list_members(session: AsyncSession, organization_id: UUID) -> list[dict[str, Any]]:
    memberships = _to_list(
        await session.scalars(
            select(OrganizationMembership)
            .where(OrganizationMembership.organization_id == organization_id)
            .order_by(OrganizationMembership.created_at)
        )
    )

    if not memberships:
        return []

    membership_ids = [m.id for m in memberships]
    profile_ids = [m.profile_id for m in memberships]

    profiles = _to_list(
        await session.scalars(select(Profile).where(Profile.id.in_(profile_ids)))
    )
    profile_by_id = {p.id: p for p in profiles}

    roles_rows = _to_list(
        await session.execute(
            select(MembershipRole.membership_id, Role)
            .join(Role, Role.id == MembershipRole.role_id)
            .where(MembershipRole.membership_id.in_(membership_ids))
        )
    )

    roles_by_membership: dict[UUID, list[Role]] = {m_id: [] for m_id in membership_ids}
    for m_id, role in roles_rows:
        roles_by_membership[m_id].append(role)

    response_list: list[dict[str, Any]] = []
    for m in memberships:
        prof = profile_by_id.get(m.profile_id)
        response_list.append(
            {
                "id": m.id,
                "organization_id": m.organization_id,
                "profile_id": m.profile_id,
                "status": m.status,
                "profile": {
                    "id": prof.id if prof else m.profile_id,
                    "email": prof.email if prof else None,
                    "first_name": prof.first_name if prof else None,
                    "last_name": prof.last_name if prof else None,
                },
                "roles": roles_by_membership.get(m.id, []),
                "created_at": m.created_at,
                "updated_at": m.updated_at,
            }
        )
    return response_list


async def add_member_by_email(
    session: AsyncSession,
    organization_id: UUID,
    data: MemberAddRequest,
    actor_id: UUID | None,
    ip_address: str | None = None,
) -> dict[str, Any]:
    email_clean = data.email.strip().lower()
    profile = await session.scalar(
        select(Profile).where(func.lower(Profile.email) == email_clean)
    )
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with email '{data.email}' has not registered in OfficeOS",
        )

    existing = await session.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.profile_id == profile.id,
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"User '{data.email}' is already a member of this organization",
        )

    assigned_roles: list[Role] = []
    if data.role_ids:
        assigned_roles = _to_list(
            await session.scalars(
                select(Role).where(
                    Role.id.in_(data.role_ids),
                    or_(
                        Role.organization_id == organization_id,
                        Role.is_system.is_(True),
                        Role.organization_id.is_(None),
                    ),
                )
            )
        )
        if len(assigned_roles) != len(set(data.role_ids)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more selected role IDs are invalid",
            )

    now = datetime.now(UTC)
    membership = OrganizationMembership(
        id=uuid.uuid4(),
        organization_id=organization_id,
        profile_id=profile.id,
        status=data.status,
        created_at=now,
        updated_at=now,
    )
    session.add(membership)
    await session.flush()

    for role in assigned_roles:
        session.add(MembershipRole(membership_id=membership.id, role_id=role.id))
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_id,
        action="members.add",
        entity_type="membership",
        entity_id=membership.id,
        details={
            "email": profile.email,
            "profile_id": str(profile.id),
            "status": data.status,
            "role_ids": [str(r.id) for r in assigned_roles],
        },
        ip_address=ip_address,
    )

    return {
        "id": membership.id,
        "organization_id": membership.organization_id,
        "profile_id": membership.profile_id,
        "status": membership.status,
        "profile": {
            "id": profile.id,
            "email": profile.email,
            "first_name": profile.first_name,
            "last_name": profile.last_name,
        },
        "roles": assigned_roles,
        "created_at": membership.created_at,
        "updated_at": membership.updated_at,
    }


async def update_member(
    session: AsyncSession,
    organization_id: UUID,
    membership_id: UUID,
    data: MemberUpdateRequest,
    actor_id: UUID | None,
    ip_address: str | None = None,
) -> dict[str, Any]:
    membership = await session.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.id == membership_id,
            OrganizationMembership.organization_id == organization_id,
        )
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member '{membership_id}' not found in this organization",
        )

    is_deactivating = data.status is not None and data.status != "active"
    await _check_sole_admin_protection(
        session=session,
        organization_id=organization_id,
        membership_id=membership_id,
        is_deactivating=is_deactivating,
        new_role_ids=data.role_ids,
    )

    changes: dict[str, Any] = {}

    if data.status is not None and data.status != membership.status:
        changes["status"] = {"from": membership.status, "to": data.status}
        membership.status = data.status

    if data.role_ids is not None:
        assigned_roles = _to_list(
            await session.scalars(
                select(Role).where(
                    Role.id.in_(data.role_ids),
                    or_(
                        Role.organization_id == organization_id,
                        Role.is_system.is_(True),
                        Role.organization_id.is_(None),
                    ),
                )
            )
        )
        if len(assigned_roles) != len(set(data.role_ids)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more selected role IDs are invalid",
            )

        await session.execute(
            delete(MembershipRole).where(MembershipRole.membership_id == membership_id)
        )
        for role in assigned_roles:
            session.add(MembershipRole(membership_id=membership_id, role_id=role.id))
        changes["roles"] = [str(r.id) for r in assigned_roles]

    if changes:
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_id,
            action="members.update",
            entity_type="membership",
            entity_id=membership.id,
            details=changes,
            ip_address=ip_address,
        )

    profile = await session.scalar(select(Profile).where(Profile.id == membership.profile_id))
    current_roles = _to_list(
        await session.scalars(
            select(Role)
            .join(MembershipRole, MembershipRole.role_id == Role.id)
            .where(MembershipRole.membership_id == membership_id)
        )
    )

    return {
        "id": membership.id,
        "organization_id": membership.organization_id,
        "profile_id": membership.profile_id,
        "status": membership.status,
        "profile": {
            "id": profile.id if profile else membership.profile_id,
            "email": profile.email if profile else None,
            "first_name": profile.first_name if profile else None,
            "last_name": profile.last_name if profile else None,
        },
        "roles": current_roles,
        "created_at": membership.created_at,
        "updated_at": membership.updated_at,
    }


async def remove_member(
    session: AsyncSession,
    organization_id: UUID,
    membership_id: UUID,
    actor_id: UUID | None,
    ip_address: str | None = None,
) -> None:
    membership = await session.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.id == membership_id,
            OrganizationMembership.organization_id == organization_id,
        )
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member '{membership_id}' not found in this organization",
        )

    await _check_sole_admin_protection(
        session=session,
        organization_id=organization_id,
        membership_id=membership_id,
        is_deactivating=True,
    )

    profile_id = membership.profile_id
    await session.delete(membership)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_id,
        action="members.remove",
        entity_type="membership",
        entity_id=membership_id,
        details={"profile_id": str(profile_id)},
        ip_address=ip_address,
    )


# --- Audit Logs ---


async def list_audit_logs(
    session: AsyncSession,
    organization_id: UUID,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    query = (
        select(AuditLog, Profile.email)
        .outerjoin(Profile, Profile.id == AuditLog.actor_id)
        .where(AuditLog.organization_id == organization_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(query)
    rows = _to_list(result)

    return [
        {
            "id": log.id,
            "organization_id": log.organization_id,
            "actor_id": log.actor_id,
            "actor_email": email,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "details": log.details,
            "ip_address": log.ip_address,
            "created_at": log.created_at,
        }
        for log, email in rows
    ]
