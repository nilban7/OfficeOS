from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import require_permission
from app.schemas.automation import (
    AutomationCreate,
    AutomationExecuteRequest,
    AutomationExecutionResponse,
    AutomationResponse,
    AutomationUpdate,
)
from app.schemas.common import ApiSuccess
from app.services.automation import AutomationService

router = APIRouter(prefix="/automations", tags=["Automations"])


class ToggleRequest(BaseModel):
    is_active: bool


@router.get("", response_model=ApiSuccess[list[AutomationResponse]])
async def list_automations(
    session: Annotated[AsyncSession, Depends(require_permission("automations.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[list[AutomationResponse]]:
    """List organization automation workflows."""
    try:
        org_id = UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id") from exc

    automations = await AutomationService.list_automations(session, org_id)
    return ApiSuccess(data=automations)


@router.post("", response_model=ApiSuccess[AutomationResponse], status_code=status.HTTP_201_CREATED)
async def create_automation(
    data: AutomationCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("automations.create"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    request: Request,
) -> ApiSuccess[AutomationResponse]:
    """Create a new automation workflow rule."""
    try:
        org_id = UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id") from exc

    ip_address = request.client.host if request.client else None
    created = await AutomationService.create_automation(
        session=session,
        organization_id=org_id,
        auth_user_id=UUID(current_user.id),
        data=data,
        ip_address=ip_address,
    )
    return ApiSuccess(data=created, message="Automation workflow created successfully")


@router.get("/{automation_id}", response_model=ApiSuccess[AutomationResponse])
async def get_automation(
    automation_id: UUID,
    session: Annotated[AsyncSession, Depends(require_permission("automations.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[AutomationResponse]:
    """Retrieve details of a specific automation workflow."""
    try:
        org_id = UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id") from exc

    automation = await AutomationService.get_automation(session, org_id, automation_id)
    return ApiSuccess(data=automation)


@router.put("/{automation_id}", response_model=ApiSuccess[AutomationResponse])
async def update_automation(
    automation_id: UUID,
    data: AutomationUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("automations.update"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    request: Request,
) -> ApiSuccess[AutomationResponse]:
    """Update an automation workflow definition."""
    try:
        org_id = UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id") from exc

    ip_address = request.client.host if request.client else None
    updated = await AutomationService.update_automation(
        session=session,
        organization_id=org_id,
        automation_id=automation_id,
        auth_user_id=UUID(current_user.id),
        data=data,
        ip_address=ip_address,
    )
    return ApiSuccess(data=updated, message="Automation workflow updated successfully")


@router.delete("/{automation_id}", response_model=ApiSuccess[None])
async def delete_automation(
    automation_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("automations.delete"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    request: Request,
) -> ApiSuccess[None]:
    """Delete an automation workflow rule."""
    try:
        org_id = UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id") from exc

    ip_address = request.client.host if request.client else None
    await AutomationService.delete_automation(
        session=session,
        organization_id=org_id,
        automation_id=automation_id,
        auth_user_id=UUID(current_user.id),
        ip_address=ip_address,
    )
    return ApiSuccess(data=None, message="Automation workflow deleted successfully")


@router.post("/{automation_id}/toggle", response_model=ApiSuccess[AutomationResponse])
async def toggle_automation(
    automation_id: UUID,
    data: ToggleRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("automations.update"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    request: Request,
) -> ApiSuccess[AutomationResponse]:
    """Enable or disable an automation workflow."""
    try:
        org_id = UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id") from exc

    ip_address = request.client.host if request.client else None
    updated = await AutomationService.toggle_automation(
        session=session,
        organization_id=org_id,
        automation_id=automation_id,
        auth_user_id=UUID(current_user.id),
        is_active=data.is_active,
        ip_address=ip_address,
    )
    return ApiSuccess(
        data=updated,
        message=f"Automation {'enabled' if data.is_active else 'disabled'} successfully",
    )


@router.post("/{automation_id}/execute", response_model=ApiSuccess[AutomationExecutionResponse])
async def execute_automation(
    automation_id: UUID,
    data: AutomationExecuteRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("automations.execute"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    request: Request,
) -> ApiSuccess[AutomationExecutionResponse]:
    """Trigger manual execution of an automation rule."""
    try:
        org_id = UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id") from exc

    ip_address = request.client.host if request.client else None
    exec_result = await AutomationService.execute_automation(
        session=session,
        organization_id=org_id,
        automation_id=automation_id,
        auth_user_id=UUID(current_user.id),
        trigger_source="manual",
        input_payload=data.input_payload,
        ip_address=ip_address,
    )
    return ApiSuccess(data=exec_result, message="Automation executed successfully")


@router.get("/{automation_id}/executions", response_model=ApiSuccess[list[AutomationExecutionResponse]])
async def list_automation_executions(
    automation_id: UUID,
    session: Annotated[AsyncSession, Depends(require_permission("automations.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ApiSuccess[list[AutomationExecutionResponse]]:
    """Retrieve execution history for an automation workflow."""
    try:
        org_id = UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id") from exc

    history = await AutomationService.list_executions(
        session=session,
        organization_id=org_id,
        automation_id=automation_id,
        limit=limit,
        offset=offset,
    )
    return ApiSuccess(data=history)
