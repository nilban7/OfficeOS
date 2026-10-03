from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session, require_permission
from app.schemas.common import ApiSuccess, PaginatedData
from app.schemas.training import (
    TrainingSessionCreate,
    TrainingSessionDetail,
    TrainingSessionResponse,
    TrainingSessionUpdate,
)
from app.services.identity import get_user_permissions
from app.services.training import TrainingService

router = APIRouter(prefix="/training-sessions", tags=["Training Sessions"])


@router.get(
    "",
    response_model=ApiSuccess[PaginatedData[TrainingSessionResponse]],
    summary="List training sessions",
)
async def list_training_sessions_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    program_id: Annotated[UUID | None, Query(alias="training_program_id", description="Filter by program ID")] = None,
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by status")] = None,
    search: Annotated[str | None, Query(description="Search session number, title, location, trainer")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Page size")] = 20,
) -> ApiSuccess[PaginatedData[TrainingSessionResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "training.view" not in perms and "training.enroll" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing training permission",
        )

    data = await TrainingService.list_sessions(
        session=session,
        organization_id=org_id,
        program_id=program_id,
        status_filter=status_filter,
        search=search,
        page=page,
        page_size=page_size,
    )
    return ApiSuccess(data=data)


@router.post(
    "",
    response_model=ApiSuccess[TrainingSessionResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create training session",
    dependencies=[Depends(require_permission("training.create"))],
)
async def create_training_session_endpoint(
    payload: TrainingSessionCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TrainingSessionResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await TrainingService.create_session(
        session=session,
        organization_id=org_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.get(
    "/{session_id}",
    response_model=ApiSuccess[TrainingSessionDetail],
    summary="Get training session details",
)
async def get_training_session_endpoint(
    session_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TrainingSessionDetail]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "training.view" not in perms and "training.enroll" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing training permission",
        )

    data = await TrainingService.get_session(
        session=session,
        organization_id=org_id,
        session_id=session_id,
    )
    return ApiSuccess(data=data)


@router.patch(
    "/{session_id}",
    response_model=ApiSuccess[TrainingSessionResponse],
    summary="Update training session",
    dependencies=[Depends(require_permission("training.update"))],
)
async def update_training_session_endpoint(
    session_id: UUID,
    payload: TrainingSessionUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TrainingSessionResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await TrainingService.update_session(
        session=session,
        organization_id=org_id,
        session_id=session_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.delete(
    "/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete training session",
    dependencies=[Depends(require_permission("training.delete"))],
)
async def delete_training_session_endpoint(
    session_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> None:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    await TrainingService.delete_session(
        session=session,
        organization_id=org_id,
        session_id=session_id,
        actor_user_id=user_id,
    )
