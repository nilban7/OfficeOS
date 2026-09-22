from uuid import UUID

from sqlalchemy import select
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
    return await session.scalar(select(Profile).where(Profile.auth_user_id == UUID(user.id)))


async def get_user_organizations(session: AsyncSession, user: AuthenticatedUser) -> list[Organization]:
    result = await session.scalars(
        select(Organization)
        .join(OrganizationMembership, OrganizationMembership.organization_id == Organization.id)
        .join(Profile, Profile.id == OrganizationMembership.profile_id)
        .where(Profile.auth_user_id == UUID(user.id), OrganizationMembership.status == "active")
        .order_by(Organization.name)
    )
    return list(result)


async def get_user_permissions(session: AsyncSession, user: AuthenticatedUser) -> list[str]:
    result = await session.scalars(
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .join(MembershipRole, MembershipRole.role_id == Role.id)
        .join(OrganizationMembership, OrganizationMembership.id == MembershipRole.membership_id)
        .join(Profile, Profile.id == OrganizationMembership.profile_id)
        .where(
            Profile.auth_user_id == UUID(user.id),
            OrganizationMembership.status == "active",
        )
        .distinct()
        .order_by(Permission.code)
    )
    return list(result)