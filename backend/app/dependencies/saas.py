from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session, set_user_context
from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.models.identity import MembershipRole, OrganizationMembership, Profile, Role


async def is_system_admin_user(session: AsyncSession, current_user: AuthenticatedUser) -> bool:
    """Check if the user has an active membership associated with the system_admin canonical role."""
    try:
        user_uuid = UUID(current_user.id)
    except (ValueError, TypeError):
        return False

    stmt = (
        select(1)
        .select_from(MembershipRole)
        .join(OrganizationMembership, OrganizationMembership.id == MembershipRole.membership_id)
        .join(Profile, Profile.id == OrganizationMembership.profile_id)
        .join(Role, Role.id == MembershipRole.role_id)
        .where(
            Profile.auth_user_id == user_uuid,
            OrganizationMembership.status == "active",
            Role.name == "system_admin",
        )
    )
    result = await session.scalar(stmt)
    return result is not None


async def require_system_admin(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AuthenticatedUser:
    """Enforce that the caller holds the canonical system_admin role."""
    await set_user_context(session, current_user.id)
    is_admin = await is_system_admin_user(session, current_user)
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System administrator authorization required",
        )
    return current_user


async def get_saas_admin_session(
    current_user: Annotated[AuthenticatedUser, Depends(require_system_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AsyncSession:
    """Return an authenticated database session configured with system_admin user context."""
    await set_user_context(session, current_user.id)
    return session
