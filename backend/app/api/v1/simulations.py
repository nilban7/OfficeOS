from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import require_permission
from app.schemas.common import ApiSuccess
from app.schemas.simulation import (
    SimulationPreset,
    SimulationRunRequest,
    SimulationRunResponse,
)
from app.services.identity import get_user_permissions
from app.services.simulation import SimulationService

router = APIRouter(prefix="/simulations", tags=["What If Simulations"])


@router.get("/presets", response_model=ApiSuccess[list[SimulationPreset]])
async def get_simulation_presets(
    session: Annotated[AsyncSession, Depends(require_permission("ai.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[list[SimulationPreset]]:
    """Retrieve predefined simulation scenario presets."""
    try:
        UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id") from exc

    presets = SimulationService.get_presets()
    return ApiSuccess(data=presets)


@router.post("/run", response_model=ApiSuccess[SimulationRunResponse])
async def run_simulation(
    data: SimulationRunRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("ai.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[SimulationRunResponse]:
    """Execute a what-if business simulation against real tenant data."""
    try:
        org_id = UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id") from exc

    user_perms = await get_user_permissions(session, current_user)
    result = await SimulationService.run_simulation(
        session=session,
        organization_id=org_id,
        user_permissions=user_perms,
        request=data,
    )
    return ApiSuccess(data=result)
