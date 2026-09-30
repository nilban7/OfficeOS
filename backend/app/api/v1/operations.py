from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session, require_permission
from app.models.employee import Employee
from app.models.identity import OrganizationMembership, Profile
from app.schemas.common import ApiSuccess, PaginatedData
from app.schemas.operation import (
    OperationChecklistCreate,
    OperationChecklistResponse,
    OperationChecklistUpdate,
    OperationTaskAssign,
    OperationTaskCreate,
    OperationTaskDetail,
    OperationTaskResponse,
    OperationTaskStatusAction,
    OperationTaskUpdate,
)
from app.services.identity import get_user_permissions
from app.services.operation import OperationService

router = APIRouter(prefix="/operations", tags=["Operations"])

FULL_VIEW_PERMISSIONS = {"operations.manage", "operations.create", "operations.assign"}


async def _resolve_employee(
    session: AsyncSession, organization_id: UUID, auth_user_id: UUID
) -> Employee | None:
    query = (
        select(Employee)
        .join(Profile, Profile.id == Employee.profile_id)
        .where(
            Profile.auth_user_id == auth_user_id,
            Employee.organization_id == organization_id,
        )
    )
    emp = await session.scalar(query)
    if emp is not None:
        return emp

    fallback_query = (
        select(Employee)
        .join(OrganizationMembership, OrganizationMembership.id == Employee.membership_id)
        .join(Profile, Profile.id == OrganizationMembership.profile_id)
        .where(
            Profile.auth_user_id == auth_user_id,
            OrganizationMembership.organization_id == organization_id,
        )
    )
    return await session.scalar(fallback_query)


# ---------------------------------------------------------------------------
# Operation Tasks CRUD & Lifecycle
# ---------------------------------------------------------------------------


@router.get(
    "/tasks",
    response_model=ApiSuccess[PaginatedData[OperationTaskResponse]],
    summary="List operation tasks",
)
async def list_operation_tasks_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    search: Annotated[str | None, Query(description="Search title, task number, description, category")] = None,
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by status")] = None,
    priority: Annotated[str | None, Query(description="Filter by priority")] = None,
    category: Annotated[str | None, Query(description="Filter by category")] = None,
    department_id: Annotated[UUID | None, Query(description="Filter by department")] = None,
    assignee_id: Annotated[UUID | None, Query(description="Filter by assignee")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Page size")] = 20,
) -> ApiSuccess[PaginatedData[OperationTaskResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "operations.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing operations.view permission",
        )

    # Scoping check: if user does not have manager/create perms, restrict to self-service
    is_employee_restricted = not bool(FULL_VIEW_PERMISSIONS.intersection(perms))
    actor_employee = None
    if is_employee_restricted:
        actor_employee = await _resolve_employee(session, org_id, user_id)

    data = await OperationService.list_tasks(
        session=session,
        organization_id=org_id,
        search=search,
        status_filter=status_filter,
        priority=priority,
        category=category,
        department_id=department_id,
        assignee_id=assignee_id,
        page=page,
        page_size=page_size,
        actor_employee_id=actor_employee.id if actor_employee else None,
        is_employee_restricted=is_employee_restricted,
    )
    return ApiSuccess(data=data)


@router.post(
    "/tasks",
    response_model=ApiSuccess[OperationTaskResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create operation task",
    dependencies=[Depends(require_permission("operations.create"))],
)
async def create_operation_task_endpoint(
    payload: OperationTaskCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[OperationTaskResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await OperationService.create_task(
        session=session,
        organization_id=org_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.get(
    "/tasks/{task_id}",
    response_model=ApiSuccess[OperationTaskDetail],
    summary="Get operation task details",
)
async def get_operation_task_endpoint(
    task_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[OperationTaskDetail]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "operations.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing operations.view permission",
        )

    data = await OperationService.get_task(
        session=session,
        organization_id=org_id,
        task_id=task_id,
    )
    return ApiSuccess(data=data)


@router.patch(
    "/tasks/{task_id}",
    response_model=ApiSuccess[OperationTaskResponse],
    summary="Update operation task",
    dependencies=[Depends(require_permission("operations.update"))],
)
async def update_operation_task_endpoint(
    task_id: UUID,
    payload: OperationTaskUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[OperationTaskResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await OperationService.update_task(
        session=session,
        organization_id=org_id,
        task_id=task_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.delete(
    "/tasks/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete operation task",
    dependencies=[Depends(require_permission("operations.delete"))],
)
async def delete_operation_task_endpoint(
    task_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> None:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    await OperationService.delete_task(
        session=session,
        organization_id=org_id,
        task_id=task_id,
        actor_user_id=user_id,
    )


@router.post(
    "/tasks/{task_id}/assign",
    response_model=ApiSuccess[OperationTaskResponse],
    summary="Assign operation task to employee",
    dependencies=[Depends(require_permission("operations.assign"))],
)
async def assign_operation_task_endpoint(
    task_id: UUID,
    payload: OperationTaskAssign,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[OperationTaskResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await OperationService.assign_task(
        session=session,
        organization_id=org_id,
        task_id=task_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/tasks/{task_id}/start",
    response_model=ApiSuccess[OperationTaskResponse],
    summary="Start operation task (set status to in_progress)",
    dependencies=[Depends(require_permission("operations.update"))],
)
async def start_operation_task_endpoint(
    task_id: UUID,
    payload: OperationTaskStatusAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[OperationTaskResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await OperationService.start_task(
        session=session,
        organization_id=org_id,
        task_id=task_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/tasks/{task_id}/complete",
    response_model=ApiSuccess[OperationTaskResponse],
    summary="Complete operation task",
    dependencies=[Depends(require_permission("operations.complete"))],
)
async def complete_operation_task_endpoint(
    task_id: UUID,
    payload: OperationTaskStatusAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[OperationTaskResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await OperationService.complete_task(
        session=session,
        organization_id=org_id,
        task_id=task_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/tasks/{task_id}/cancel",
    response_model=ApiSuccess[OperationTaskResponse],
    summary="Cancel operation task",
    dependencies=[Depends(require_permission("operations.update"))],
)
async def cancel_operation_task_endpoint(
    task_id: UUID,
    payload: OperationTaskStatusAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[OperationTaskResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await OperationService.cancel_task(
        session=session,
        organization_id=org_id,
        task_id=task_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


# ---------------------------------------------------------------------------
# Checklists
# ---------------------------------------------------------------------------


@router.get(
    "/tasks/{task_id}/checklist",
    response_model=ApiSuccess[list[OperationChecklistResponse]],
    summary="List checklist items for task",
)
async def list_checklists_endpoint(
    task_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[list[OperationChecklistResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "operations.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing operations.view permission",
        )

    data = await OperationService.list_checklists(
        session=session,
        organization_id=org_id,
        task_id=task_id,
    )
    return ApiSuccess(data=data)


@router.post(
    "/tasks/{task_id}/checklist",
    response_model=ApiSuccess[OperationChecklistResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create checklist item for task",
    dependencies=[Depends(require_permission("operations.update"))],
)
async def create_checklist_endpoint(
    task_id: UUID,
    payload: OperationChecklistCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[OperationChecklistResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await OperationService.create_checklist(
        session=session,
        organization_id=org_id,
        task_id=task_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.patch(
    "/tasks/{task_id}/checklist/{item_id}",
    response_model=ApiSuccess[OperationChecklistResponse],
    summary="Update or toggle checklist item",
)
async def update_checklist_endpoint(
    task_id: UUID,
    item_id: UUID,
    payload: OperationChecklistUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[OperationChecklistResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "operations.complete" not in perms and "operations.update" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing operations.complete or operations.update permission",
        )

    actor_employee = await _resolve_employee(session, org_id, user_id)

    data = await OperationService.update_checklist(
        session=session,
        organization_id=org_id,
        task_id=task_id,
        item_id=item_id,
        actor_user_id=user_id,
        payload=payload,
        actor_employee_id=actor_employee.id if actor_employee else None,
    )
    return ApiSuccess(data=data)


@router.delete(
    "/tasks/{task_id}/checklist/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete checklist item",
    dependencies=[Depends(require_permission("operations.update"))],
)
async def delete_checklist_endpoint(
    task_id: UUID,
    item_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> None:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    await OperationService.delete_checklist(
        session=session,
        organization_id=org_id,
        task_id=task_id,
        item_id=item_id,
        actor_user_id=user_id,
    )
