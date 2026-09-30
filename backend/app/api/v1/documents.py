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
from app.schemas.document import (
    DocumentCreate,
    DocumentDetail,
    DocumentDownloadRequest,
    DocumentDownloadResponse,
    DocumentPermissionCreate,
    DocumentPermissionResponse,
    DocumentPermissionUpdate,
    DocumentResponse,
    DocumentUpdate,
    DocumentUploadUrlRequest,
    DocumentUploadUrlResponse,
    DocumentVersionCreate,
    DocumentVersionResponse,
)
from app.services.document import DocumentService
from app.services.identity import get_user_permissions

router = APIRouter(prefix="/documents", tags=["Documents"])


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
# Upload URL intent
# ---------------------------------------------------------------------------


@router.post(
    "/upload-url",
    response_model=ApiSuccess[DocumentUploadUrlResponse],
    summary="Generate signed upload URL for document file",
    dependencies=[Depends(require_permission("documents.create"))],
)
async def generate_upload_url_endpoint(
    payload: DocumentUploadUrlRequest,
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[DocumentUploadUrlResponse]:
    org_id = UUID(organization_header)
    data = await DocumentService.generate_upload_url(
        organization_id=org_id,
        filename=payload.filename,
        mime_type=payload.mime_type,
        file_size=payload.file_size,
    )
    return ApiSuccess(data=data)


# ---------------------------------------------------------------------------
# Documents CRUD
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=ApiSuccess[PaginatedData[DocumentResponse]],
    summary="List documents",
)
async def list_documents_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    search: Annotated[str | None, Query(description="Search document number, title, description")] = None,
    category: Annotated[str | None, Query(description="Filter by category")] = None,
    document_type: Annotated[str | None, Query(description="Filter by document type")] = None,
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by status")] = None,
    owner_id: Annotated[UUID | None, Query(description="Filter by owner")] = None,
    client_id: Annotated[UUID | None, Query(description="Filter by client")] = None,
    project_id: Annotated[UUID | None, Query(description="Filter by project")] = None,
    vendor_id: Annotated[UUID | None, Query(description="Filter by vendor")] = None,
    branch_id: Annotated[UUID | None, Query(description="Filter by branch")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Page size")] = 20,
) -> ApiSuccess[PaginatedData[DocumentResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "documents.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing documents.view permission",
        )

    data = await DocumentService.list_documents(
        session=session,
        organization_id=org_id,
        search=search,
        category=category,
        document_type=document_type,
        status_filter=status_filter,
        owner_id=owner_id,
        client_id=client_id,
        project_id=project_id,
        vendor_id=vendor_id,
        branch_id=branch_id,
        page=page,
        page_size=page_size,
    )
    return ApiSuccess(data=data)


@router.post(
    "",
    response_model=ApiSuccess[DocumentResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create document record",
    dependencies=[Depends(require_permission("documents.create"))],
)
async def create_document_endpoint(
    payload: DocumentCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[DocumentResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await DocumentService.create_document(
        session=session,
        organization_id=org_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.get(
    "/{document_id}",
    response_model=ApiSuccess[DocumentDetail],
    summary="Get document details with versions and permissions",
)
async def get_document_endpoint(
    document_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[DocumentDetail]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "documents.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing documents.view permission",
        )

    data = await DocumentService.get_document(session, org_id, document_id)
    return ApiSuccess(data=data)


@router.patch(
    "/{document_id}",
    response_model=ApiSuccess[DocumentResponse],
    summary="Update document metadata",
    dependencies=[Depends(require_permission("documents.update"))],
)
async def update_document_endpoint(
    document_id: UUID,
    payload: DocumentUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[DocumentResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await DocumentService.update_document(
        session=session,
        organization_id=org_id,
        document_id=document_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete document",
    dependencies=[Depends(require_permission("documents.delete"))],
)
async def delete_document_endpoint(
    document_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> None:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    await DocumentService.delete_document(
        session=session,
        organization_id=org_id,
        document_id=document_id,
        actor_user_id=user_id,
    )


# ---------------------------------------------------------------------------
# Versions
# ---------------------------------------------------------------------------


@router.get(
    "/{document_id}/versions",
    response_model=ApiSuccess[list[DocumentVersionResponse]],
    summary="List document versions",
)
async def list_versions_endpoint(
    document_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[list[DocumentVersionResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "documents.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing documents.view permission",
        )

    data = await DocumentService.list_versions(session, org_id, document_id)
    return ApiSuccess(data=data)


@router.post(
    "/{document_id}/versions",
    response_model=ApiSuccess[DocumentVersionResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create new document version",
    dependencies=[Depends(require_permission("documents.update"))],
)
async def create_version_endpoint(
    document_id: UUID,
    payload: DocumentVersionCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[DocumentVersionResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    actor_employee = await _resolve_employee(session, org_id, user_id)
    if not actor_employee:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current user is not associated with an employee profile in this organization.",
        )

    data = await DocumentService.create_version(
        session=session,
        organization_id=org_id,
        document_id=document_id,
        actor_user_id=user_id,
        actor_employee_id=actor_employee.id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.get(
    "/{document_id}/versions/{version_id}",
    response_model=ApiSuccess[DocumentVersionResponse],
    summary="Get document version details",
)
async def get_version_endpoint(
    document_id: UUID,
    version_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[DocumentVersionResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "documents.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing documents.view permission",
        )

    data = await DocumentService.get_version(session, org_id, document_id, version_id)
    return ApiSuccess(data=data)


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------


@router.post(
    "/{document_id}/download",
    response_model=ApiSuccess[DocumentDownloadResponse],
    summary="Generate secure short-lived download URL",
    dependencies=[Depends(require_permission("documents.download"))],
)
async def download_document_endpoint(
    document_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    payload: DocumentDownloadRequest | None = None,
) -> ApiSuccess[DocumentDownloadResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    version_id = payload.version_id if payload else None
    data = await DocumentService.generate_download_url(
        session=session,
        organization_id=org_id,
        document_id=document_id,
        actor_user_id=user_id,
        version_id=version_id,
    )
    return ApiSuccess(data=data)


# ---------------------------------------------------------------------------
# Permissions Management
# ---------------------------------------------------------------------------


@router.get(
    "/{document_id}/permissions",
    response_model=ApiSuccess[list[DocumentPermissionResponse]],
    summary="List document permissions",
)
async def list_document_permissions_endpoint(
    document_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[list[DocumentPermissionResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "documents.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing documents.view permission",
        )

    data = await DocumentService.list_permissions(session, org_id, document_id)
    return ApiSuccess(data=data)


@router.post(
    "/{document_id}/permissions",
    response_model=ApiSuccess[DocumentPermissionResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create document permission",
    dependencies=[Depends(require_permission("documents.manage"))],
)
async def create_document_permission_endpoint(
    document_id: UUID,
    payload: DocumentPermissionCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[DocumentPermissionResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await DocumentService.create_permission(
        session=session,
        organization_id=org_id,
        document_id=document_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.patch(
    "/{document_id}/permissions/{permission_id}",
    response_model=ApiSuccess[DocumentPermissionResponse],
    summary="Update document permission",
    dependencies=[Depends(require_permission("documents.manage"))],
)
async def update_document_permission_endpoint(
    document_id: UUID,
    permission_id: UUID,
    payload: DocumentPermissionUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[DocumentPermissionResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await DocumentService.update_permission(
        session=session,
        organization_id=org_id,
        document_id=document_id,
        permission_id=permission_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.delete(
    "/{document_id}/permissions/{permission_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete document permission",
    dependencies=[Depends(require_permission("documents.manage"))],
)
async def delete_document_permission_endpoint(
    document_id: UUID,
    permission_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> None:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    await DocumentService.delete_permission(
        session=session,
        organization_id=org_id,
        document_id=document_id,
        permission_id=permission_id,
        actor_user_id=user_id,
    )
