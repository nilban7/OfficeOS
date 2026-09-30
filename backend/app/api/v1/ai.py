from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import require_permission
from app.schemas.ai import (
    AIConfigurationResponse,
    AIConfigurationUpdate,
    AIConversationCreate,
    AIConversationDetailResponse,
    AIConversationResponse,
    AIMessageCreate,
    AIQueryRequest,
    AIQueryResponse,
)
from app.schemas.common import ApiSuccess
from app.services.ai import AIService
from app.services.identity import get_user_permissions

router = APIRouter(prefix="/ai", tags=["AI Assistant"])


@router.get("/configuration", response_model=ApiSuccess[AIConfigurationResponse])
async def get_ai_configuration(
    session: Annotated[AsyncSession, Depends(require_permission("ai.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[AIConfigurationResponse]:
    """Retrieve tenant AI configuration and enabled status."""
    try:
        org_id = UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id") from exc

    config = await AIService.get_or_create_configuration(session, org_id)
    return ApiSuccess(data=config)


@router.patch("/configuration", response_model=ApiSuccess[AIConfigurationResponse])
async def update_ai_configuration(
    data: AIConfigurationUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("ai.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    request: Request,
) -> ApiSuccess[AIConfigurationResponse]:
    """Update tenant AI configuration (admin only)."""
    try:
        org_id = UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id") from exc

    ip_address = request.client.host if request.client else None
    updated = await AIService.update_configuration(
        session=session,
        organization_id=org_id,
        update_data=data,
        actor_id=UUID(current_user.id),
        ip_address=ip_address,
    )
    return ApiSuccess(data=updated, message="AI configuration updated successfully")


@router.get("/conversations", response_model=ApiSuccess[list[AIConversationResponse]])
async def list_conversations(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("ai.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[list[AIConversationResponse]]:
    """List active user conversations within the organization."""
    try:
        org_id = UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id") from exc

    conversations = await AIService.list_conversations(
        session=session,
        organization_id=org_id,
        auth_user_id=UUID(current_user.id),
    )
    return ApiSuccess(data=conversations)


@router.post("/conversations", response_model=ApiSuccess[AIConversationDetailResponse], status_code=status.HTTP_201_CREATED)
async def create_conversation(
    data: AIConversationCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("ai.use"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    request: Request,
) -> ApiSuccess[AIConversationDetailResponse]:
    """Start a new AI conversation session."""
    try:
        org_id = UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id") from exc

    user_perms = await get_user_permissions(session, current_user)
    ip_address = request.client.host if request.client else None

    detail = await AIService.create_conversation(
        session=session,
        organization_id=org_id,
        auth_user_id=UUID(current_user.id),
        user_permissions=user_perms,
        data=data,
        ip_address=ip_address,
    )
    return ApiSuccess(data=detail, message="Conversation started successfully")


@router.get("/conversations/{conversation_id}", response_model=ApiSuccess[AIConversationDetailResponse])
async def get_conversation(
    conversation_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("ai.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[AIConversationDetailResponse]:
    """Retrieve conversation details and messages."""
    try:
        org_id = UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id") from exc

    detail = await AIService.get_conversation(
        session=session,
        organization_id=org_id,
        auth_user_id=UUID(current_user.id),
        conversation_id=conversation_id,
    )
    return ApiSuccess(data=detail)


@router.delete("/conversations/{conversation_id}", response_model=ApiSuccess[None])
async def delete_conversation(
    conversation_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("ai.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    request: Request,
) -> ApiSuccess[None]:
    """Delete / archive an AI conversation."""
    try:
        org_id = UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id") from exc

    ip_address = request.client.host if request.client else None
    await AIService.delete_conversation(
        session=session,
        organization_id=org_id,
        auth_user_id=UUID(current_user.id),
        conversation_id=conversation_id,
        ip_address=ip_address,
    )
    return ApiSuccess(data=None, message="Conversation deleted successfully")


@router.post("/conversations/{conversation_id}/messages", response_model=ApiSuccess[AIConversationDetailResponse])
async def send_message(
    conversation_id: UUID,
    data: AIMessageCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("ai.use"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[AIConversationDetailResponse]:
    """Send a user message in a conversation and receive an AI assistant response."""
    try:
        org_id = UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id") from exc

    user_perms = await get_user_permissions(session, current_user)
    updated_conv = await AIService.send_message(
        session=session,
        organization_id=org_id,
        auth_user_id=UUID(current_user.id),
        user_permissions=user_perms,
        conversation_id=conversation_id,
        content=data.content,
    )
    return ApiSuccess(data=updated_conv)


@router.post("/query", response_model=ApiSuccess[AIQueryResponse])
async def direct_query(
    data: AIQueryRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("ai.use"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[AIQueryResponse]:
    """Execute a single-turn authorized AI query with organizational context."""
    try:
        org_id = UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id") from exc

    user_perms = await get_user_permissions(session, current_user)
    result = await AIService.direct_query(
        session=session,
        organization_id=org_id,
        auth_user_id=UUID(current_user.id),
        user_permissions=user_perms,
        prompt=data.prompt,
        capability=data.capability,
    )
    return ApiSuccess(data=result)
