from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_identity_session, get_tenant_session
from app.schemas.common import ApiSuccess
from app.schemas.identity import MeData, OrganizationData, PermissionData
from app.services.identity import get_profile, get_user_organizations, get_user_permissions

router = APIRouter(prefix="/me", tags=["identity"])


@router.get("", response_model=ApiSuccess[MeData], summary="Get the authenticated user")
async def me(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_identity_session)],
) -> ApiSuccess[MeData]:
    profile = await get_profile(session, current_user)
    return ApiSuccess(
        data=MeData(
            id=current_user.id,
            email=profile.email if profile else current_user.email,
            first_name=profile.first_name if profile else None,
            last_name=profile.last_name if profile else None,
        )
    )


@router.get("/organizations", response_model=ApiSuccess[list[OrganizationData]], summary="List user organizations")
async def organizations(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_identity_session)],
) -> ApiSuccess[list[OrganizationData]]:
    organizations = await get_user_organizations(session, current_user)
    return ApiSuccess(data=[OrganizationData.model_validate(item) for item in organizations])


@router.get("/permissions", response_model=ApiSuccess[list[PermissionData]], summary="List user permissions")
async def permissions(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
) -> ApiSuccess[list[PermissionData]]:
    codes = await get_user_permissions(session, current_user)
    return ApiSuccess(data=[PermissionData(code=code) for code in codes])