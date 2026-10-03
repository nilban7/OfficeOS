from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.tenant import get_tenant_session
from app.schemas.common import ApiSuccess
from app.schemas.saas import PlatformAnnouncementResponse
from app.services.saas import SaaSAdminService

router = APIRouter(prefix="/announcements", tags=["announcements"])


@router.get(
    "/active",
    response_model=ApiSuccess[list[PlatformAnnouncementResponse]],
    summary="Get active platform announcements relevant to the current tenant",
)
async def get_active_announcements(
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[list[PlatformAnnouncementResponse]]:
    org_id_str = str(UUID(organization_header))
    all_active = await SaaSAdminService.list_announcements(session, is_active_only=True)
    # Filter to announcements targeted at 'all' or specifically including this tenant
    targeted = [
        a
        for a in all_active
        if a.target_type == "all" or (a.target_org_ids and org_id_str in a.target_org_ids)
    ]
    return ApiSuccess(data=targeted)
