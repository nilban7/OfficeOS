from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.models.identity import (
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
        user_email = str(getattr(user, "email")).strip().lower()
        conditions.append(func.lower(Profile.email) == user_email)

    if not conditions:
        return []

    stmt = (
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
    if organization_id is not None:
        stmt = stmt.where(OrganizationMembership.organization_id == UUID(str(organization_id)))
    result = await session.scalars(stmt.distinct().order_by(Permission.code))
    return list(result)