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
    InternshipDocumentCreate,
    InternshipDocumentResponse,
    InternshipExtend,
    InternshipResponse,
    InternshipReviewCreate,
    InternshipReviewResponse,
    InternshipReviewUpdate,
    InternshipStudentCreate,
    InternshipStudentResponse,
    InternshipStudentUpdate,
    InternshipSupervisorCreate,
    InternshipSupervisorResponse,
    InternshipUpdate,
    StipendCreateDisburseRequest,
    StipendDisbursementResponse,
    StipendDisburseRequest,
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


# ---------------------------------------------------------------------------
# Students / Enrolled Cohort Interns
# ---------------------------------------------------------------------------


@router.get(
    "/{internship_id}/students",
    response_model=ApiSuccess[list[InternshipStudentResponse]],
    summary="List enrolled students/interns in internship",
)
async def list_students_endpoint(
    internship_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[list[InternshipStudentResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "internships.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing internships.view permission",
        )

    data = await InternshipService.list_students(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{internship_id}/students",
    response_model=ApiSuccess[InternshipStudentResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Enroll student in internship",
    dependencies=[Depends(require_permission("internships.edit"))],
)
async def create_student_endpoint(
    internship_id: UUID,
    payload: InternshipStudentCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[InternshipStudentResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await InternshipService.create_student(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.patch(
    "/{internship_id}/students/{student_id}",
    response_model=ApiSuccess[InternshipStudentResponse],
    summary="Update enrolled student details",
    dependencies=[Depends(require_permission("internships.edit"))],
)
async def update_student_endpoint(
    internship_id: UUID,
    student_id: UUID,
    payload: InternshipStudentUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[InternshipStudentResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await InternshipService.update_student(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
        student_id=student_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.delete(
    "/{internship_id}/students/{student_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove student from internship",
    dependencies=[Depends(require_permission("internships.edit"))],
)
async def delete_student_endpoint(
    internship_id: UUID,
    student_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> None:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    await InternshipService.delete_student(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
        student_id=student_id,
        actor_user_id=user_id,
    )


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------


@router.get(
    "/{internship_id}/documents",
    response_model=ApiSuccess[list[InternshipDocumentResponse]],
    summary="List internship documents",
)
async def list_documents_endpoint(
    internship_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[list[InternshipDocumentResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "internships.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing internships.view permission",
        )

    data = await InternshipService.list_documents(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
    )
    return ApiSuccess(data=data)


@router.post(
    "/{internship_id}/documents",
    response_model=ApiSuccess[InternshipDocumentResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Upload / add internship document record",
    dependencies=[Depends(require_permission("internships.edit"))],
)
async def create_document_endpoint(
    internship_id: UUID,
    payload: InternshipDocumentCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[InternshipDocumentResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await InternshipService.create_document(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.delete(
    "/{internship_id}/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete internship document",
    dependencies=[Depends(require_permission("internships.edit"))],
)
async def delete_document_endpoint(
    internship_id: UUID,
    document_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> None:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    await InternshipService.delete_document(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
        document_id=document_id,
        actor_user_id=user_id,
    )


# ---------------------------------------------------------------------------
# Stipend Disbursements
# ---------------------------------------------------------------------------


@router.get(
    "/stipends/disbursements",
    response_model=ApiSuccess[list[StipendDisbursementResponse]],
    summary="List internship stipend disbursements",
)
async def list_stipend_disbursements_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    internship_id: Annotated[UUID | None, Query(description="Filter by internship")] = None,
    payroll_id: Annotated[UUID | None, Query(description="Filter by payroll run")] = None,
    period_month: Annotated[int | None, Query(ge=1, le=12, description="Filter by month")] = None,
    period_year: Annotated[int | None, Query(ge=2020, description="Filter by year")] = None,
) -> ApiSuccess[list[StipendDisbursementResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "internships.view" not in perms and "payroll.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing internships.view or payroll.view permission",
        )

    data = await InternshipService.list_stipend_disbursements(
        session=session,
        organization_id=org_id,
        internship_id=internship_id,
        payroll_id=payroll_id,
        period_month=period_month,
        period_year=period_year,
    )
    return ApiSuccess(data=data)


@router.post(
    "/stipends/disburse",
    response_model=ApiSuccess[StipendDisbursementResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create and record stipend disbursement",
)
async def create_and_disburse_stipend_endpoint(
    payload: StipendCreateDisburseRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[StipendDisbursementResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "internships.edit" not in perms and "payroll.process" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing internships.edit or payroll.process permission",
        )

    data = await InternshipService.create_and_disburse_stipend(
        session=session,
        organization_id=org_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/stipends/{disbursement_id}/disburse",
    response_model=ApiSuccess[StipendDisbursementResponse],
    summary="Mark existing stipend disbursement as paid",
)
async def disburse_existing_stipend_endpoint(
    disbursement_id: UUID,
    payload: StipendDisburseRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[StipendDisbursementResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "internships.edit" not in perms and "payroll.process" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing internships.edit or payroll.process permission",
        )

    data = await InternshipService.disburse_existing_stipend(
        session=session,
        organization_id=org_id,
        disbursement_id=disbursement_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)

