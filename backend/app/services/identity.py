from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.models.identity import (
    MembershipPermission,
    MembershipRole,
    Organization,
    OrganizationMembership,
    Permission,
    Profile,
    Role,
    RolePermission,
)


async def get_profile(session: AsyncSession, user: AuthenticatedUser) -> Profile | None:
    conditions = []
    user_uuid: UUID | None = None
    try:
        user_uuid = UUID(user.id)
        conditions.append(Profile.auth_user_id == user_uuid)
    except (ValueError, TypeError):
        pass

    if user.email:
        conditions.append(func.lower(Profile.email) == user.email.strip().lower())

    if not conditions:
        return None

    profile = await session.scalar(select(Profile).where(or_(*conditions)))
    if profile and user_uuid and profile.auth_user_id != user_uuid:
        profile.auth_user_id = user_uuid
        add_fn = getattr(session, "add", None)
        if callable(add_fn):
            res = add_fn(profile)
            if hasattr(res, "__await__"):
                await res
    return profile


async def get_user_organizations(session: AsyncSession, user: AuthenticatedUser) -> list[Organization]:
    conditions = []
    try:
        user_uuid = UUID(user.id)
        conditions.append(Profile.auth_user_id == user_uuid)
    except (ValueError, TypeError):
        pass

    if user.email:
        conditions.append(func.lower(Profile.email) == user.email.strip().lower())

    if not conditions:
        return []

    result = await session.scalars(
        select(Organization)
        .join(OrganizationMembership, OrganizationMembership.organization_id == Organization.id)
        .join(Profile, Profile.id == OrganizationMembership.profile_id)
        .where(or_(*conditions), OrganizationMembership.status == "active")
        .order_by(Organization.name)
    )
    return list(result)


async def get_user_permissions(
    session: AsyncSession,
    user: AuthenticatedUser | UUID | str,
    organization_id: UUID | str | None = None,
) -> list[str]:
    conditions = []
    user_id_str = str(user.id if hasattr(user, "id") else user)
    try:
        auth_id = UUID(user_id_str)
        conditions.append(Profile.auth_user_id == auth_id)
    except (ValueError, TypeError):
        pass

    if hasattr(user, "email") and getattr(user, "email", None):
        user_email = str(user.email).strip().lower()
        conditions.append(func.lower(Profile.email) == user_email)

    if not conditions:
        return []

    stmt_roles = (
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .join(MembershipRole, MembershipRole.role_id == Role.id)
        .join(OrganizationMembership, OrganizationMembership.id == MembershipRole.membership_id)
        .join(Profile, Profile.id == OrganizationMembership.profile_id)
        .where(
            or_(*conditions),
            OrganizationMembership.status == "active",
        )
    )
    stmt_direct = (
        select(Permission.code)
        .join(MembershipPermission, MembershipPermission.permission_id == Permission.id)
        .join(OrganizationMembership, OrganizationMembership.id == MembershipPermission.membership_id)
        .join(Profile, Profile.id == OrganizationMembership.profile_id)
        .where(
            or_(*conditions),
            OrganizationMembership.status == "active",
        )
    )
    if organization_id is not None:
        org_uuid = UUID(str(organization_id))
        stmt_roles = stmt_roles.where(OrganizationMembership.organization_id == org_uuid)
        stmt_direct = stmt_direct.where(OrganizationMembership.organization_id == org_uuid)

    union_query = stmt_roles.union(stmt_direct).subquery()
    result = await session.scalars(select(union_query.c.code).order_by(union_query.c.code))
    return list(result)


async def get_user_roles(
    session: AsyncSession,
    user: AuthenticatedUser | UUID | str,
    organization_id: UUID | str | None = None,
) -> list[str]:
    conditions = []
    user_id_str = str(user.id if hasattr(user, "id") else user)
    try:
        auth_id = UUID(user_id_str)
        conditions.append(Profile.auth_user_id == auth_id)
    except (ValueError, TypeError):
        pass

    if hasattr(user, "email") and getattr(user, "email", None):
        user_email = str(user.email).strip().lower()
        conditions.append(func.lower(Profile.email) == user_email)

    if not conditions:
        return []

    stmt = (
        select(Role.name)
        .join(MembershipRole, MembershipRole.role_id == Role.id)
        .join(OrganizationMembership, OrganizationMembership.id == MembershipRole.membership_id)
        .join(Profile, Profile.id == OrganizationMembership.profile_id)
        .where(
            or_(*conditions),
            OrganizationMembership.status == "active",
        )
    )
    if organization_id is not None:
        stmt = stmt.where(OrganizationMembership.organization_id == UUID(str(organization_id)))
    result = await session.scalars(stmt.distinct().order_by(Role.name))
    if hasattr(result, "all"):
        return list(result.all())
    return list(result)

