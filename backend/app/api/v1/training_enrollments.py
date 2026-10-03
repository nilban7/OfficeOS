from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session, require_permission
from app.schemas.common import ApiSuccess, PaginatedData
from app.schemas.training import (
    TrainingEnrollmentAttend,
    TrainingEnrollmentComplete,
    TrainingEnrollmentCreate,
    TrainingEnrollmentDetail,
    TrainingEnrollmentResponse,
    TrainingEnrollmentUpdate,
)
from app.services.attendance import resolve_employee_for_user
from app.services.identity import get_user_permissions
from app.services.training import TrainingService

router = APIRouter(prefix="/training-enrollments", tags=["Training Enrollments"])


@router.get(
    "",
    response_model=ApiSuccess[PaginatedData[TrainingEnrollmentResponse]],
    summary="List training enrollments",
)
async def list_training_enrollments_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    program_id: Annotated[UUID | None, Query(alias="training_program_id", description="Filter by program ID")] = None,
    session_id: Annotated[UUID | None, Query(alias="training_session_id", description="Filter by session ID")] = None,
    employee_id: Annotated[UUID | None, Query(description="Filter by employee ID")] = None,
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by status")] = None,
    search: Annotated[str | None, Query(description="Search employee name/code, certificate")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Page size")] = 20,
) -> ApiSuccess[PaginatedData[TrainingEnrollmentResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    can_manage = any(p in perms for p in ["training.manage", "training.create", "training.update", "training.complete"])
    can_view = "training.view" in perms
    can_enroll = "training.enroll" in perms

    if not can_view and not can_enroll and not can_manage:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing training permission",
        )

    emp = await resolve_employee_for_user(session, org_id, user_id)
    target_emp_id = employee_id

    # If actor has only basic self-enroll/view permission without manage rights, scope to own employee_id
    if not can_manage and not (can_view and "organization_admin" in perms or "hr_manager" in perms):
        if not emp:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Employee profile not linked for current user.",
            )
        target_emp_id = emp.id

    data = await TrainingService.list_enrollments(
        session=session,
        organization_id=org_id,
        program_id=program_id,
        session_id=session_id,
        employee_id=target_emp_id,
        status_filter=status_filter,
        search=search,
        page=page,
        page_size=page_size,
    )
    return ApiSuccess(data=data)


@router.post(
    "",
    response_model=ApiSuccess[TrainingEnrollmentResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Enroll employee in training program or session",
)
async def enroll_employee_endpoint(
    payload: TrainingEnrollmentCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TrainingEnrollmentResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "training.enroll" not in perms and "training.manage" not in perms and "training.create" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing training.enroll permission",
        )

    can_manage = any(p in perms for p in ["training.manage", "training.create", "training.update"])
    emp = await resolve_employee_for_user(session, org_id, user_id)
    emp_id = emp.id if emp else None

    data = await TrainingService.enroll_employee(
        session=session,
        organization_id=org_id,
        actor_user_id=user_id,
        payload=payload,
        actor_employee_id=emp_id,
        can_manage=can_manage,
    )
    return ApiSuccess(data=data)


@router.get(
    "/{enrollment_id}",
    response_model=ApiSuccess[TrainingEnrollmentDetail],
    summary="Get training enrollment details",
)
async def get_training_enrollment_endpoint(
    enrollment_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TrainingEnrollmentDetail]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "training.view" not in perms and "training.enroll" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing training permission",
        )

    can_manage = any(p in perms for p in ["training.manage", "training.create", "training.update"])
    emp = await resolve_employee_for_user(session, org_id, user_id)
    emp_id = emp.id if emp else None

    data = await TrainingService.get_enrollment(
        session=session,
        organization_id=org_id,
        enrollment_id=enrollment_id,
        actor_employee_id=emp_id,
        can_manage=can_manage,
    )
    return ApiSuccess(data=data)


@router.patch(
    "/{enrollment_id}",
    response_model=ApiSuccess[TrainingEnrollmentResponse],
    summary="Update training enrollment details",
    dependencies=[Depends(require_permission("training.manage"))],
)
async def update_training_enrollment_endpoint(
    enrollment_id: UUID,
    payload: TrainingEnrollmentUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TrainingEnrollmentResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await TrainingService.update_enrollment(
        session=session,
        organization_id=org_id,
        enrollment_id=enrollment_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{enrollment_id}/attend",
    response_model=ApiSuccess[TrainingEnrollmentResponse],
    summary="Record attendance for training enrollment",
    dependencies=[Depends(require_permission("training.manage"))],
)
async def attend_training_enrollment_endpoint(
    enrollment_id: UUID,
    payload: TrainingEnrollmentAttend,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TrainingEnrollmentResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await TrainingService.attend_enrollment(
        session=session,
        organization_id=org_id,
        enrollment_id=enrollment_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{enrollment_id}/complete",
    response_model=ApiSuccess[TrainingEnrollmentResponse],
    summary="Complete training enrollment and issue certificate/score",
    dependencies=[Depends(require_permission("training.complete"))],
)
async def complete_training_enrollment_endpoint(
    enrollment_id: UUID,
    payload: TrainingEnrollmentComplete,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TrainingEnrollmentResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await TrainingService.complete_enrollment(
        session=session,
        organization_id=org_id,
        enrollment_id=enrollment_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{enrollment_id}/cancel",
    response_model=ApiSuccess[TrainingEnrollmentResponse],
    summary="Cancel training enrollment",
)
async def cancel_training_enrollment_endpoint(
    enrollment_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[TrainingEnrollmentResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    can_manage = any(p in perms for p in ["training.manage", "training.delete", "training.update"])
    emp = await resolve_employee_for_user(session, org_id, user_id)
    emp_id = emp.id if emp else None

    data = await TrainingService.cancel_enrollment(
        session=session,
        organization_id=org_id,
        enrollment_id=enrollment_id,
        actor_user_id=user_id,
        actor_employee_id=emp_id,
        can_manage=can_manage,
    )
    return ApiSuccess(data=data)
