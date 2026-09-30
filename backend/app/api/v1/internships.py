from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session, require_permission
from app.schemas.common import ApiSuccess, PaginatedData
from app.schemas.internship import (
    InternshipAction,
    InternshipCreate,
    InternshipDetail,
    InternshipExtend,
    InternshipResponse,
    InternshipReviewCreate,
    InternshipReviewResponse,
    InternshipReviewUpdate,
    InternshipSupervisorCreate,
    InternshipSupervisorResponse,
    InternshipUpdate,
)
from app.services.identity import get_user_permissions
from app.services.internship import InternshipService

router = APIRouter(prefix="/internships", tags=["Internships"])


# ---------------------------------------------------------------------------
# Internships CRUD
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=ApiSuccess[PaginatedData[InternshipResponse]],
    summary="List internships",
)
async def list_internships_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    search: Annotated[str | None, Query(description="Search title, code, intern name, institution")] = None,
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by status")] = None,
    department_id: Annotated[UUID | None, Query(description="Filter by department")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Page size")] = 20,
) -> ApiSuccess[PaginatedData[InternshipResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "internships.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing internships.view permission",
        )

    data = await InternshipService.list_internships(
        session=session,
        organization_id=org_id,
        search=search,
        status_filter=status_filter,
        department_id=department_id,
        page=page,
        page_size=page_size,
    )
    return ApiSuccess(data=data)


@router.post(
    "",
    response_model=ApiSuccess[InternshipResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create internship",
    dependencies=[Depends(require_permission("internships.create"))],
)
async def create_internship_endpoint(
    payload: InternshipCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[InternshipResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await InternshipService.create_internship(
        session=session,
        organization_id=org_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.get(
    "/{internship_id}",
    response_model=ApiSuccess[InternshipDetail],
    summary="Get internship details",
)
async def get_internship_endpoint(
    internship_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[InternshipDetail]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "internships.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing internships.view permission",
        )

    data = await InternshipService.get_internship(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
    )
    return ApiSuccess(data=data)


@router.patch(
    "/{internship_id}",
    response_model=ApiSuccess[InternshipResponse],
    summary="Update internship",
    dependencies=[Depends(require_permission("internships.update"))],
)
async def update_internship_endpoint(
    internship_id: UUID,
    payload: InternshipUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[InternshipResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await InternshipService.update_internship(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.delete(
    "/{internship_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete internship",
    dependencies=[Depends(require_permission("internships.delete"))],
)
async def delete_internship_endpoint(
    internship_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> None:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    await InternshipService.delete_internship(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
        actor_user_id=user_id,
    )


# ---------------------------------------------------------------------------
# Lifecycle Actions
# ---------------------------------------------------------------------------


@router.post(
    "/{internship_id}/start",
    response_model=ApiSuccess[InternshipResponse],
    summary="Start internship (planned → active)",
    dependencies=[Depends(require_permission("internships.manage"))],
)
async def start_internship_endpoint(
    internship_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[InternshipResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await InternshipService.start_internship(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
        actor_user_id=user_id,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{internship_id}/complete",
    response_model=ApiSuccess[InternshipResponse],
    summary="Complete internship",
    dependencies=[Depends(require_permission("internships.manage"))],
)
async def complete_internship_endpoint(
    internship_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[InternshipResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await InternshipService.complete_internship(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
        actor_user_id=user_id,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{internship_id}/extend",
    response_model=ApiSuccess[InternshipResponse],
    summary="Extend internship end date",
    dependencies=[Depends(require_permission("internships.manage"))],
)
async def extend_internship_endpoint(
    internship_id: UUID,
    payload: InternshipExtend,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[InternshipResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await InternshipService.extend_internship(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{internship_id}/terminate",
    response_model=ApiSuccess[InternshipResponse],
    summary="Terminate internship",
    dependencies=[Depends(require_permission("internships.manage"))],
)
async def terminate_internship_endpoint(
    internship_id: UUID,
    payload: InternshipAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[InternshipResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await InternshipService.terminate_internship(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


# ---------------------------------------------------------------------------
# Supervisors
# ---------------------------------------------------------------------------


@router.get(
    "/{internship_id}/supervisors",
    response_model=ApiSuccess[list[InternshipSupervisorResponse]],
    summary="List supervisors for an internship",
)
async def list_supervisors_endpoint(
    internship_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[list[InternshipSupervisorResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "internships.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing internships.view permission",
        )

    data = await InternshipService.list_supervisors(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{internship_id}/supervisors",
    response_model=ApiSuccess[InternshipSupervisorResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Add supervisor to internship",
    dependencies=[Depends(require_permission("internships.manage"))],
)
async def add_supervisor_endpoint(
    internship_id: UUID,
    payload: InternshipSupervisorCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[InternshipSupervisorResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await InternshipService.add_supervisor(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.delete(
    "/{internship_id}/supervisors/{supervisor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove supervisor from internship",
    dependencies=[Depends(require_permission("internships.manage"))],
)
async def remove_supervisor_endpoint(
    internship_id: UUID,
    supervisor_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> None:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    await InternshipService.remove_supervisor(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
        supervisor_id=supervisor_id,
        actor_user_id=user_id,
    )


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------


@router.get(
    "/{internship_id}/reviews",
    response_model=ApiSuccess[PaginatedData[InternshipReviewResponse]],
    summary="List reviews for an internship",
)
async def list_reviews_endpoint(
    internship_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ApiSuccess[PaginatedData[InternshipReviewResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "internships.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing internships.view permission",
        )

    data = await InternshipService.list_reviews(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
        page=page,
        page_size=page_size,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{internship_id}/reviews",
    response_model=ApiSuccess[InternshipReviewResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create review for internship",
    dependencies=[Depends(require_permission("internships.review"))],
)
async def create_review_endpoint(
    internship_id: UUID,
    payload: InternshipReviewCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[InternshipReviewResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await InternshipService.create_review(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.get(
    "/{internship_id}/reviews/{review_id}",
    response_model=ApiSuccess[InternshipReviewResponse],
    summary="Get internship review",
)
async def get_review_endpoint(
    internship_id: UUID,
    review_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[InternshipReviewResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "internships.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing internships.view permission",
        )

    data = await InternshipService.get_review(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
        review_id=review_id,
    )
    return ApiSuccess(data=data)


@router.patch(
    "/{internship_id}/reviews/{review_id}",
    response_model=ApiSuccess[InternshipReviewResponse],
    summary="Update internship review",
    dependencies=[Depends(require_permission("internships.review"))],
)
async def update_review_endpoint(
    internship_id: UUID,
    review_id: UUID,
    payload: InternshipReviewUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[InternshipReviewResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await InternshipService.update_review(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
        review_id=review_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.delete(
    "/{internship_id}/reviews/{review_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete internship review",
    dependencies=[Depends(require_permission("internships.review"))],
)
async def delete_review_endpoint(
    internship_id: UUID,
    review_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> None:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    await InternshipService.delete_review(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
        review_id=review_id,
        actor_user_id=user_id,
    )
