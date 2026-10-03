import re
import uuid
from datetime import UTC, datetime
from math import ceil
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.models.client import Client
from app.models.document import Document, DocumentPermission, DocumentVersion
from app.models.employee import Department, Employee
from app.models.identity import Branch
from app.models.procurement import Vendor
from app.models.project import Project
from app.schemas.common import PaginatedData, PaginationMeta
from app.schemas.document import (
    BranchSummary,
    ClientSummary,
    DocumentCreate,
    DocumentDetail,
    DocumentDownloadResponse,
    DocumentPermissionCreate,
    DocumentPermissionResponse,
    DocumentPermissionUpdate,
    DocumentResponse,
    DocumentUpdate,
    DocumentUploadUrlResponse,
    DocumentVersionCreate,
    DocumentVersionResponse,
    EmployeeSummary,
    ProjectSummary,
    VendorSummary,
)
from app.services.organization import record_audit_log
from app.services.storage import create_signed_download_url, create_signed_upload_url


def _to_list(result: Any) -> list[Any]:
    if result is None:
        return []
    if isinstance(result, list):
        return result
    if hasattr(result, "all"):
        return list(result.all())
    return list(result)


def _sanitize_filename(filename: str) -> str:
    cleaned = re.sub(r"[^\w\.\-\_]", "_", filename.strip())
    # Prevent traversal
    cleaned = cleaned.replace("..", "_").lstrip("/\\")
    return cleaned or "document"


def _build_employee_summary(employee: Employee | None) -> EmployeeSummary | None:
    if employee is None:
        return None
    return EmployeeSummary(
        id=employee.id,
        employee_code=employee.employee_code,
        first_name=employee.first_name,
        last_name=employee.last_name,
        designation=employee.designation,
    )


def _build_client_summary(client: Client | None) -> ClientSummary | None:
    if client is None:
        return None
    return ClientSummary(
        id=client.id,
        name=client.name,
    )


def _build_project_summary(project: Project | None) -> ProjectSummary | None:
    if project is None:
        return None
    return ProjectSummary(
        id=project.id,
        name=project.name,
        code=project.code,
    )


def _build_vendor_summary(vendor: Vendor | None) -> VendorSummary | None:
    if vendor is None:
        return None
    return VendorSummary(
        id=vendor.id,
        name=vendor.name,
        code=vendor.code,
    )


def _build_branch_summary(branch: Branch | None) -> BranchSummary | None:
    if branch is None:
        return None
    return BranchSummary(
        id=branch.id,
        name=branch.name,
        code=branch.code,
    )


def _build_version_response(version: DocumentVersion) -> DocumentVersionResponse:
    return DocumentVersionResponse(
        id=version.id,
        organization_id=version.organization_id,
        document_id=version.document_id,
        version_number=version.version_number,
        storage_path=version.storage_path,
        original_filename=version.original_filename,
        mime_type=version.mime_type,
        file_size=version.file_size,
        checksum=version.checksum,
        uploaded_by_id=version.uploaded_by_id,
        notes=version.notes,
        created_at=version.created_at,
        uploaded_by=_build_employee_summary(version.uploaded_by),
    )


def _build_permission_response(perm: DocumentPermission) -> DocumentPermissionResponse:
    return DocumentPermissionResponse(
        id=perm.id,
        organization_id=perm.organization_id,
        document_id=perm.document_id,
        grantee_type=perm.grantee_type,
        grantee_id=perm.grantee_id,
        permission_level=perm.permission_level,
        created_at=perm.created_at,
    )


def _build_document_response(doc: Document, versions_count: int | None = None) -> DocumentResponse:
    count = versions_count if versions_count is not None else (len(doc.versions) if hasattr(doc, "versions") and doc.versions is not None else 1)
    return DocumentResponse(
        id=doc.id,
        organization_id=doc.organization_id,
        document_number=doc.document_number,
        title=doc.title,
        description=doc.description,
        category=doc.category,
        document_type=doc.document_type,
        owner_id=doc.owner_id,
        client_id=doc.client_id,
        project_id=doc.project_id,
        vendor_id=doc.vendor_id,
        branch_id=doc.branch_id,
        status=doc.status,
        storage_path=doc.storage_path,
        original_filename=doc.original_filename,
        mime_type=doc.mime_type,
        file_size=doc.file_size,
        current_version=doc.current_version,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        owner=_build_employee_summary(doc.owner),
        client=_build_client_summary(doc.client),
        project=_build_project_summary(doc.project),
        vendor=_build_vendor_summary(doc.vendor),
        branch=_build_branch_summary(doc.branch),
        versions_count=count,
    )


class DocumentService:
    @staticmethod
    async def _validate_linked_entities(
        session: AsyncSession,
        organization_id: UUID,
        owner_id: UUID | None = None,
        client_id: UUID | None = None,
        project_id: UUID | None = None,
        vendor_id: UUID | None = None,
        branch_id: UUID | None = None,
    ) -> None:
        if owner_id:
            stmt = select(Employee).where(
                Employee.organization_id == organization_id,
                Employee.id == owner_id,
            )
            res = await session.execute(stmt)
            if not res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Owner employee {owner_id} not found in this organization.",
                )

        if client_id:
            stmt = select(Client).where(
                Client.organization_id == organization_id,
                Client.id == client_id,
            )
            res = await session.execute(stmt)
            if not res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Client {client_id} not found in this organization.",
                )

        if project_id:
            stmt = select(Project).where(
                Project.organization_id == organization_id,
                Project.id == project_id,
            )
            res = await session.execute(stmt)
            if not res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Project {project_id} not found in this organization.",
                )

        if vendor_id:
            stmt = select(Vendor).where(
                Vendor.organization_id == organization_id,
                Vendor.id == vendor_id,
            )
            res = await session.execute(stmt)
            if not res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Vendor {vendor_id} not found in this organization.",
                )

        if branch_id:
            stmt = select(Branch).where(
                Branch.organization_id == organization_id,
                Branch.id == branch_id,
            )
            res = await session.execute(stmt)
            if not res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Branch {branch_id} not found in this organization.",
                )

    # -----------------------------------------------------------------------
    # Document CRUD
    # -----------------------------------------------------------------------

    @staticmethod
    async def create_document(
        session: AsyncSession,
        organization_id: UUID,
        actor_user_id: UUID,
        payload: DocumentCreate,
    ) -> DocumentResponse:
        # Check duplicate document number
        dup_stmt = select(Document).where(
            Document.organization_id == organization_id,
            Document.document_number == payload.document_number,
        )
        existing = await session.execute(dup_stmt)
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Document with number '{payload.document_number}' already exists.",
            )

        # Validate linked references
        await DocumentService._validate_linked_entities(
            session=session,
            organization_id=organization_id,
            owner_id=payload.owner_id,
            client_id=payload.client_id,
            project_id=payload.project_id,
            vendor_id=payload.vendor_id,
            branch_id=payload.branch_id,
        )

        safe_filename = _sanitize_filename(payload.original_filename)
        doc_id = uuid.uuid4()

        # Enforce tenant storage path prefix
        storage_path = payload.storage_path.strip()
        org_prefix = f"{organization_id}/"
        if not storage_path.startswith(org_prefix):
            storage_path = f"{organization_id}/documents/{doc_id}/v1/{safe_filename}"

        now = datetime.now(UTC)
        doc = Document(
            id=doc_id,
            organization_id=organization_id,
            document_number=payload.document_number.strip(),
            title=payload.title.strip(),
            description=payload.description.strip() if payload.description else None,
            category=payload.category.strip(),
            document_type=payload.document_type.strip(),
            owner_id=payload.owner_id,
            client_id=payload.client_id,
            project_id=payload.project_id,
            vendor_id=payload.vendor_id,
            branch_id=payload.branch_id,
            status=payload.status,
            storage_path=storage_path,
            original_filename=safe_filename,
            mime_type=payload.mime_type.strip(),
            file_size=payload.file_size,
            current_version=1,
            created_at=now,
            updated_at=now,
        )
        session.add(doc)

        # Create version 1 record
        initial_version = DocumentVersion(
            id=uuid.uuid4(),
            organization_id=organization_id,
            document_id=doc_id,
            version_number=1,
            storage_path=storage_path,
            original_filename=safe_filename,
            mime_type=payload.mime_type.strip(),
            file_size=payload.file_size,
            checksum=None,
            uploaded_by_id=payload.owner_id,
            notes=payload.notes,
            created_at=now,
        )
        session.add(initial_version)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="document.create",
            entity_type="document",
            entity_id=doc.id,
            details={"document_number": doc.document_number, "title": doc.title},
        )

        return await DocumentService.get_document(session, organization_id, doc.id)

    @staticmethod
    async def get_document(
        session: AsyncSession,
        organization_id: UUID,
        document_id: UUID,
    ) -> DocumentDetail:
        stmt = (
            select(Document)
            .where(
                Document.organization_id == organization_id,
                Document.id == document_id,
            )
            .options(
                selectinload(Document.owner),
                selectinload(Document.client),
                selectinload(Document.project),
                selectinload(Document.vendor),
                selectinload(Document.branch),
                selectinload(Document.versions).selectinload(DocumentVersion.uploaded_by),
                selectinload(Document.permissions),
            )
        )
        res = await session.execute(stmt)
        doc = res.scalar_one_or_none()
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found.",
            )

        base_resp = _build_document_response(doc, versions_count=len(doc.versions))
        versions = [_build_version_response(v) for v in sorted(doc.versions, key=lambda x: x.version_number, reverse=True)]
        permissions = [_build_permission_response(p) for p in doc.permissions]

        return DocumentDetail(
            **base_resp.model_dump(),
            versions=versions,
            permissions=permissions,
        )

    @staticmethod
    async def list_documents(
        session: AsyncSession,
        organization_id: UUID,
        search: str | None = None,
        category: str | None = None,
        document_type: str | None = None,
        status_filter: str | None = None,
        owner_id: UUID | None = None,
        client_id: UUID | None = None,
        project_id: UUID | None = None,
        vendor_id: UUID | None = None,
        branch_id: UUID | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> PaginatedData[DocumentResponse]:
        stmt = (
            select(Document)
            .where(Document.organization_id == organization_id)
            .options(
                selectinload(Document.owner),
                selectinload(Document.client),
                selectinload(Document.project),
                selectinload(Document.vendor),
                selectinload(Document.branch),
            )
        )

        if category and category != "all":
            stmt = stmt.where(Document.category == category)
        if document_type and document_type != "all":
            stmt = stmt.where(Document.document_type == document_type)
        if status_filter and status_filter != "all":
            stmt = stmt.where(Document.status == status_filter)
        if owner_id:
            stmt = stmt.where(Document.owner_id == owner_id)
        if client_id:
            stmt = stmt.where(Document.client_id == client_id)
        if project_id:
            stmt = stmt.where(Document.project_id == project_id)
        if vendor_id:
            stmt = stmt.where(Document.vendor_id == vendor_id)
        if branch_id:
            stmt = stmt.where(Document.branch_id == branch_id)

        if search and search.strip():
            term = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    Document.document_number.ilike(term),
                    Document.title.ilike(term),
                    Document.description.ilike(term),
                )
            )

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_res = await session.execute(count_stmt)
        total = total_res.scalar() or 0

        total_pages = ceil(total / page_size) if total > 0 else 1
        offset = (page - 1) * page_size

        stmt = stmt.order_by(Document.created_at.desc()).offset(offset).limit(page_size)
        res = await session.execute(stmt)
        docs = _to_list(res.scalars())

        items: list[DocumentResponse] = []
        for d in docs:
            cnt_stmt = select(func.count(DocumentVersion.id)).where(DocumentVersion.document_id == d.id)
            cnt_res = await session.execute(cnt_stmt)
            cnt = cnt_res.scalar() or 1
            items.append(_build_document_response(d, versions_count=cnt))

        return PaginatedData(
            items=items,
            meta=PaginationMeta(
                total=total,
                page=page,
                page_size=page_size,
                total_pages=total_pages,
            ),
        )

    @staticmethod
    async def update_document(
        session: AsyncSession,
        organization_id: UUID,
        document_id: UUID,
        actor_user_id: UUID,
        payload: DocumentUpdate,
    ) -> DocumentResponse:
        stmt = (
            select(Document)
            .where(
                Document.organization_id == organization_id,
                Document.id == document_id,
            )
            .options(
                selectinload(Document.owner),
                selectinload(Document.client),
                selectinload(Document.project),
                selectinload(Document.vendor),
                selectinload(Document.branch),
            )
        )
        res = await session.execute(stmt)
        doc = res.scalar_one_or_none()
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found.",
            )

        # Validate linked entities
        await DocumentService._validate_linked_entities(
            session=session,
            organization_id=organization_id,
            client_id=payload.client_id,
            project_id=payload.project_id,
            vendor_id=payload.vendor_id,
            branch_id=payload.branch_id,
        )

        now = datetime.now(UTC)
        if payload.title is not None:
            doc.title = payload.title.strip()
        if payload.description is not None:
            doc.description = payload.description.strip()
        if payload.category is not None:
            doc.category = payload.category.strip()
        if payload.document_type is not None:
            doc.document_type = payload.document_type.strip()
        if payload.client_id is not None:
            doc.client_id = payload.client_id
        if payload.project_id is not None:
            doc.project_id = payload.project_id
        if payload.vendor_id is not None:
            doc.vendor_id = payload.vendor_id
        if payload.branch_id is not None:
            doc.branch_id = payload.branch_id
        if payload.status is not None:
            doc.status = payload.status

        doc.updated_at = now
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="document.update",
            entity_type="document",
            entity_id=doc.id,
            details={"updated_fields": list(payload.model_dump(exclude_unset=True).keys())},
        )

        return _build_document_response(doc)

    @staticmethod
    async def delete_document(
        session: AsyncSession,
        organization_id: UUID,
        document_id: UUID,
        actor_user_id: UUID,
    ) -> None:
        stmt = select(Document).where(
            Document.organization_id == organization_id,
            Document.id == document_id,
        )
        res = await session.execute(stmt)
        doc = res.scalar_one_or_none()
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found.",
            )

        await session.delete(doc)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="document.delete",
            entity_type="document",
            entity_id=document_id,
            details={"document_number": doc.document_number},
        )

    # -----------------------------------------------------------------------
    # Document Versions
    # -----------------------------------------------------------------------

    @staticmethod
    async def create_version(
        session: AsyncSession,
        organization_id: UUID,
        document_id: UUID,
        actor_user_id: UUID,
        actor_employee_id: UUID,
        payload: DocumentVersionCreate,
    ) -> DocumentVersionResponse:
        stmt = select(Document).where(
            Document.organization_id == organization_id,
            Document.id == document_id,
        )
        res = await session.execute(stmt)
        doc = res.scalar_one_or_none()
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found.",
            )

        safe_filename = _sanitize_filename(payload.original_filename)
        next_version = doc.current_version + 1

        # Enforce tenant storage path prefix
        storage_path = payload.storage_path.strip()
        org_prefix = f"{organization_id}/"
        if not storage_path.startswith(org_prefix):
            storage_path = f"{organization_id}/documents/{document_id}/v{next_version}/{safe_filename}"

        now = datetime.now(UTC)
        version = DocumentVersion(
            id=uuid.uuid4(),
            organization_id=organization_id,
            document_id=document_id,
            version_number=next_version,
            storage_path=storage_path,
            original_filename=safe_filename,
            mime_type=payload.mime_type.strip(),
            file_size=payload.file_size,
            checksum=payload.checksum,
            uploaded_by_id=actor_employee_id,
            notes=payload.notes,
            created_at=now,
        )
        session.add(version)

        # Update document head version metadata
        doc.current_version = next_version
        doc.storage_path = storage_path
        doc.original_filename = safe_filename
        doc.mime_type = payload.mime_type.strip()
        doc.file_size = payload.file_size
        doc.updated_at = now
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="document.version_create",
            entity_type="document_version",
            entity_id=version.id,
            details={"document_id": str(document_id), "version_number": next_version},
        )

        # Reload with uploaded_by relation
        ver_stmt = (
            select(DocumentVersion)
            .where(DocumentVersion.id == version.id)
            .options(selectinload(DocumentVersion.uploaded_by))
        )
        ver_res = await session.execute(ver_stmt)
        loaded_version = ver_res.scalar_one()

        return _build_version_response(loaded_version)

    @staticmethod
    async def list_versions(
        session: AsyncSession,
        organization_id: UUID,
        document_id: UUID,
    ) -> list[DocumentVersionResponse]:
        doc_stmt = select(Document.id).where(
            Document.organization_id == organization_id,
            Document.id == document_id,
        )
        doc_res = await session.execute(doc_stmt)
        if not doc_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found.",
            )

        stmt = (
            select(DocumentVersion)
            .where(
                DocumentVersion.organization_id == organization_id,
                DocumentVersion.document_id == document_id,
            )
            .options(selectinload(DocumentVersion.uploaded_by))
            .order_by(DocumentVersion.version_number.desc())
        )
        res = await session.execute(stmt)
        versions = _to_list(res.scalars())
        return [_build_version_response(v) for v in versions]

    @staticmethod
    async def get_version(
        session: AsyncSession,
        organization_id: UUID,
        document_id: UUID,
        version_id: UUID,
    ) -> DocumentVersionResponse:
        stmt = (
            select(DocumentVersion)
            .where(
                DocumentVersion.organization_id == organization_id,
                DocumentVersion.document_id == document_id,
                DocumentVersion.id == version_id,
            )
            .options(selectinload(DocumentVersion.uploaded_by))
        )
        res = await session.execute(stmt)
        version = res.scalar_one_or_none()
        if not version:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document version not found.",
            )
        return _build_version_response(version)

    # -----------------------------------------------------------------------
    # Document Permissions
    # -----------------------------------------------------------------------

    @staticmethod
    async def create_permission(
        session: AsyncSession,
        organization_id: UUID,
        document_id: UUID,
        actor_user_id: UUID,
        payload: DocumentPermissionCreate,
    ) -> DocumentPermissionResponse:
        doc_stmt = select(Document.id).where(
            Document.organization_id == organization_id,
            Document.id == document_id,
        )
        doc_res = await session.execute(doc_stmt)
        if not doc_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found.",
            )

        # Validate grantee in organization
        if payload.grantee_type == "employee":
            emp_stmt = select(Employee.id).where(
                Employee.organization_id == organization_id,
                Employee.id == payload.grantee_id,
            )
            emp_res = await session.execute(emp_stmt)
            if not emp_res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Grantee employee {payload.grantee_id} not found in this organization.",
                )
        elif payload.grantee_type == "department":
            dept_stmt = select(Department.id).where(
                Department.organization_id == organization_id,
                Department.id == payload.grantee_id,
            )
            dept_res = await session.execute(dept_stmt)
            if not dept_res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Grantee department {payload.grantee_id} not found in this organization.",
                )

        # Check duplicate permission
        dup_stmt = select(DocumentPermission).where(
            DocumentPermission.organization_id == organization_id,
            DocumentPermission.document_id == document_id,
            DocumentPermission.grantee_type == payload.grantee_type,
            DocumentPermission.grantee_id == payload.grantee_id,
        )
        existing = await session.execute(dup_stmt)
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Permission for this grantee on this document already exists.",
            )

        now = datetime.now(UTC)
        perm = DocumentPermission(
            id=uuid.uuid4(),
            organization_id=organization_id,
            document_id=document_id,
            grantee_type=payload.grantee_type,
            grantee_id=payload.grantee_id,
            permission_level=payload.permission_level,
            created_at=now,
        )
        session.add(perm)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="document.permission_create",
            entity_type="document_permission",
            entity_id=perm.id,
            details={
                "document_id": str(document_id),
                "grantee_type": payload.grantee_type,
                "grantee_id": str(payload.grantee_id),
                "level": payload.permission_level,
            },
        )

        return _build_permission_response(perm)

    @staticmethod
    async def list_permissions(
        session: AsyncSession,
        organization_id: UUID,
        document_id: UUID,
    ) -> list[DocumentPermissionResponse]:
        doc_stmt = select(Document.id).where(
            Document.organization_id == organization_id,
            Document.id == document_id,
        )
        doc_res = await session.execute(doc_stmt)
        if not doc_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found.",
            )

        stmt = select(DocumentPermission).where(
            DocumentPermission.organization_id == organization_id,
            DocumentPermission.document_id == document_id,
        )
        res = await session.execute(stmt)
        perms = _to_list(res.scalars())
        return [_build_permission_response(p) for p in perms]

    @staticmethod
    async def update_permission(
        session: AsyncSession,
        organization_id: UUID,
        document_id: UUID,
        permission_id: UUID,
        actor_user_id: UUID,
        payload: DocumentPermissionUpdate,
    ) -> DocumentPermissionResponse:
        stmt = select(DocumentPermission).where(
            DocumentPermission.organization_id == organization_id,
            DocumentPermission.document_id == document_id,
            DocumentPermission.id == permission_id,
        )
        res = await session.execute(stmt)
        perm = res.scalar_one_or_none()
        if not perm:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document permission not found.",
            )

        perm.permission_level = payload.permission_level
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="document.permission_update",
            entity_type="document_permission",
            entity_id=perm.id,
            details={"new_level": payload.permission_level},
        )

        return _build_permission_response(perm)

    @staticmethod
    async def delete_permission(
        session: AsyncSession,
        organization_id: UUID,
        document_id: UUID,
        permission_id: UUID,
        actor_user_id: UUID,
    ) -> None:
        stmt = select(DocumentPermission).where(
            DocumentPermission.organization_id == organization_id,
            DocumentPermission.document_id == document_id,
            DocumentPermission.id == permission_id,
        )
        res = await session.execute(stmt)
        perm = res.scalar_one_or_none()
        if not perm:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document permission not found.",
            )

        await session.delete(perm)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="document.permission_delete",
            entity_type="document_permission",
            entity_id=permission_id,
            details={"document_id": str(document_id)},
        )

    # -----------------------------------------------------------------------
    # Secure Download and Upload URLs
    # -----------------------------------------------------------------------

    @staticmethod
    async def generate_download_url(
        session: AsyncSession,
        organization_id: UUID,
        document_id: UUID,
        actor_user_id: UUID,
        actor_access_token: str,
        version_id: UUID | None = None,
    ) -> DocumentDownloadResponse:
        # 1. Fetch document
        doc_stmt = select(Document).where(
            Document.organization_id == organization_id,
            Document.id == document_id,
        )
        doc_res = await session.execute(doc_stmt)
        doc = doc_res.scalar_one_or_none()
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found.",
            )

        storage_path = doc.storage_path
        filename = doc.original_filename
        mime_type = doc.mime_type
        file_size = doc.file_size

        # 2. If specific version requested, fetch version
        if version_id:
            ver_stmt = select(DocumentVersion).where(
                DocumentVersion.organization_id == organization_id,
                DocumentVersion.document_id == document_id,
                DocumentVersion.id == version_id,
            )
            ver_res = await session.execute(ver_stmt)
            ver = ver_res.scalar_one_or_none()
            if not ver:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Requested document version not found.",
                )
            storage_path = ver.storage_path
            filename = ver.original_filename
            mime_type = ver.mime_type
            file_size = ver.file_size

        # 3. Verify storage path belongs to tenant
        if not storage_path.startswith(f"{organization_id}/"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to storage path outside tenant domain.",
            )

        # 4. Mint a real Supabase Storage signed URL with explicit expiry.
        # Tenant ownership already enforced by the org-scoped query above plus
        # the storage-path prefix check below; authorization (documents.download)
        # is enforced at the API boundary via require_permission.
        settings = get_settings()
        signed = await create_signed_download_url(
            organization_id=organization_id,
            storage_path=storage_path,
            access_token=actor_access_token,
            expires_in=settings.document_download_expires_in,
        )

        # 5. Record audit log without sensitive tokens/urls
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="document.download",
            entity_type="document",
            entity_id=document_id,
            details={"filename": filename, "version_id": str(version_id) if version_id else "current"},
        )

        return DocumentDownloadResponse(
            download_url=signed.signed_url,
            expires_in=signed.expires_in,
            filename=filename,
            mime_type=mime_type,
            file_size=file_size,
        )

    @staticmethod
    async def generate_upload_url(
        organization_id: UUID,
        actor_access_token: str,
        filename: str,
        mime_type: str,
        file_size: int,
    ) -> DocumentUploadUrlResponse:
        safe_name = _sanitize_filename(filename)
        object_id = uuid.uuid4()
        storage_path = f"{organization_id}/documents/{object_id}/{safe_name}"

        settings = get_settings()
        signed = await create_signed_upload_url(
            organization_id=organization_id,
            storage_path=storage_path,
            access_token=actor_access_token,
            expires_in=settings.document_upload_expires_in,
        )

        return DocumentUploadUrlResponse(
            upload_url=signed.signed_url,
            storage_path=signed.storage_path,
            expires_in=signed.expires_in,
        )
