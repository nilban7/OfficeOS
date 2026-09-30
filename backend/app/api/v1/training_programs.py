from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session, require_permission
from app.schemas.common import ApiSuccess, PaginatedData
from app.schemas.training import (
    TrainingProgramCreate,
    TrainingProgramDetail,
    TrainingProgramResponse,
    TrainingProgramUpdate,
)
from app.services.identity import get_user_permissions
from app.services.training import TrainingService

router = APIRouter(prefix="/training-programs", tags=["Training Programs"])


@router.get(
    "",
    response_model=ApiSuccess[PaginatedData[TrainingProgramResponse]],
    summary="List training programs",
)
async def list_training_programs_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    search: Annotated[str | None, Query(description="Search title, code, provider, trainer")] = None,
    category: Annotated[str | None, Query(description="Filter by category")] = None,
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by status")] = None,
    delivery_mode: Annotated[str | None, Query(description="Filter by delivery mode")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Page size")] = 20,
) -> ApiSuccess[PaginatedData[TrainingProgramResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "training.view" not in perms and "training.enroll" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing training permission",
        )

    data = await TrainingService.list_programs(
        session=session,
        organization_id=org_id,
        search=search,
        category=category,
        status_filter=status_filter,
        delivery_mode=delivery_mode,
        page=page,
        page_size=page_size,
    )
    return ApiSuccess(data=data)


@router.post(
    "",
    response_model=ApiSuccess[TrainingProgramResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create training program",
    dependencies=[Depends(require_permission("training.create"))],
)
async def create_training_program_endpoint(
    payload: TrainingProgramCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TrainingProgramResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await TrainingService.create_program(
        session=session,
        organization_id=org_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.get(
    "/{program_id}",
    response_model=ApiSuccess[TrainingProgramDetail],
    summary="Get training program details",
)
async def get_training_program_endpoint(
    program_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TrainingProgramDetail]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "training.view" not in perms and "training.enroll" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing training permission",
        )

    data = await TrainingService.get_program(
        session=session,
        organization_id=org_id,
        program_id=program_id,
    )
    return ApiSuccess(data=data)


@router.patch(
    "/{program_id}",
    response_model=ApiSuccess[TrainingProgramResponse],
    summary="Update training program",
    dependencies=[Depends(require_permission("training.update"))],
)
async def update_training_program_endpoint(
    program_id: UUID,
    payload: TrainingProgramUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TrainingProgramResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await TrainingService.update_program(
        session=session,
        organization_id=org_id,
        program_id=program_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.delete(
    "/{program_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete training program",
    dependencies=[Depends(require_permission("training.delete"))],
)
async def delete_training_program_endpoint(
    program_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> None:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    await TrainingService.delete_program(
        session=session,
        organization_id=org_id,
        program_id=program_id,
        actor_user_id=user_id,
    )


@router.post(
    "/{program_id}/publish",
    response_model=ApiSuccess[TrainingProgramResponse],
    summary="Publish training program",
    dependencies=[Depends(require_permission("training.update"))],
)
async def publish_training_program_endpoint(
    program_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TrainingProgramResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await TrainingService.publish_program(
        session=session,
        organization_id=org_id,
        program_id=program_id,
        actor_user_id=user_id,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{program_id}/cancel",
    response_model=ApiSuccess[TrainingProgramResponse],
    summary="Cancel training program",
    dependencies=[Depends(require_permission("training.delete"))],
)
async def cancel_training_program_endpoint(
    program_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TrainingProgramResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await TrainingService.cancel_program(
        session=session,
        organization_id=org_id,
        program_id=program_id,
        actor_user_id=user_id,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{program_id}/complete",
    response_model=ApiSuccess[TrainingProgramResponse],
    summary="Complete training program",
    dependencies=[Depends(require_permission("training.complete"))],
)
async def complete_training_program_endpoint(
    program_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TrainingProgramResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await TrainingService.complete_program(
        session=session,
        organization_id=org_id,
        program_id=program_id,
        actor_user_id=user_id,
    )
    return ApiSuccess(data=data)
