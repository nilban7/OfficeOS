from collections.abc import Callable
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session, set_transaction_context, set_user_context
from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.models.identity import OrganizationMembership, Profile
from app.services.identity import get_user_permissions


async def get_tenant_session(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    organization_header: Annotated[str | None, Header(alias="X-Organization-Id")] = None,
) -> AsyncSession:
    if not organization_header:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization context is required")
    try:
        organization_id = UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id") from exc

    # Set transaction-local user context first so RLS permits reading the user's own memberships
    await set_user_context(session, current_user.id)

    membership = await session.scalar(
        select(OrganizationMembership)
        .join(Profile, Profile.id == OrganizationMembership.profile_id)
        .where(
            Profile.auth_user_id == UUID(current_user.id),
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.status == "active",
        )
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Organization access denied")

    await set_transaction_context(session, current_user.id, str(organization_id))
    return session


async def get_identity_session(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AsyncSession:
    await set_user_context(session, current_user.id)
    return session


def require_permission(permission_code: str) -> Callable[..., AsyncSession]:
    async def permission_dependency(
        current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
        session: Annotated[AsyncSession, Depends(get_tenant_session)],
    ) -> AsyncSession:
        user_permissions = await get_user_permissions(session, current_user)
        if permission_code not in user_permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{permission_code}' is required for this operation",
            )
        return session

    return permission_dependency