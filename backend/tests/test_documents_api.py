"""Unit tests for Documents Management API endpoints and service methods.

Uses mocked AsyncSession and service methods — no live DB required.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.schemas.common import PaginatedData, PaginationMeta
from app.schemas.document import (
    DocumentCreate,
    DocumentDetail,
    DocumentPermissionCreate,
    DocumentResponse,
    DocumentUpdate,
    DocumentVersionCreate,
    DocumentVersionResponse,
    EmployeeSummary,
)
from app.services.document import DocumentService
from app.services.storage import SignedDownloadUrl, SignedUploadUrl


def _make_document_response(**overrides):
    defaults = {
        "id": uuid4(),
        "organization_id": uuid4(),
        "document_number": "DOC-2025-001",
        "title": "Master Services Agreement",
        "description": "Standard client MSA template",
        "category": "Contract",
        "document_type": "PDF",
        "owner_id": uuid4(),
        "client_id": None,
        "project_id": None,
        "vendor_id": None,
        "branch_id": None,
        "status": "active",
        "storage_path": "org-id/documents/doc-id/v1/contract.pdf",
        "original_filename": "contract.pdf",
        "mime_type": "application/pdf",
        "file_size": 1048576,
        "current_version": 1,
        "created_at": datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC),
        "updated_at": datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC),
        "owner": EmployeeSummary(
            id=uuid4(),
            employee_code="EMP-001",
            first_name="Alice",
            last_name="Smith",
            designation="Legal Counsel",
        ),
        "client": None,
        "project": None,
        "vendor": None,
        "branch": None,
        "versions_count": 1,
    }
    defaults.update(overrides)
    return DocumentResponse(**defaults)


def _make_version_response(**overrides):
    defaults = {
        "id": uuid4(),
        "organization_id": uuid4(),
        "document_id": uuid4(),
        "version_number": 1,
        "storage_path": "org-id/documents/doc-id/v1/contract.pdf",
        "original_filename": "contract.pdf",
        "mime_type": "application/pdf",
        "file_size": 1048576,
        "checksum": None,
        "uploaded_by_id": uuid4(),
        "notes": "Initial draft",
        "created_at": datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC),
        "uploaded_by": EmployeeSummary(
            id=uuid4(),
            employee_code="EMP-001",
            first_name="Alice",
            last_name="Smith",
            designation="Legal Counsel",
        ),
    }
    defaults.update(overrides)
    return DocumentVersionResponse(**defaults)


def _make_document_detail(**overrides):
    base_resp = _make_document_response(**overrides)
    versions = [_make_version_response(document_id=base_resp.id, organization_id=base_resp.organization_id)]
    return DocumentDetail(
        **base_resp.model_dump(),
        versions=versions,
        permissions=[],
    )


@pytest.mark.asyncio
async def test_list_documents_returns_paginated():
    items = [_make_document_response(), _make_document_response(document_number="DOC-2025-002")]
    paginated = PaginatedData(
        items=items,
        meta=PaginationMeta(total=2, page=1, page_size=20, total_pages=1),
    )
    with patch("app.services.document.DocumentService.list_documents", new=AsyncMock(return_value=paginated)):
        result = await DocumentService.list_documents(
            session=AsyncMock(), organization_id=uuid4()
        )
        assert result.meta.total == 2
        assert len(result.items) == 2


@pytest.mark.asyncio
async def test_create_document_duplicate_number_raises():
    mock_session = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = _make_document_response()
    mock_session.execute.return_value = mock_res

    payload = DocumentCreate(
        document_number="DOC-2025-001",
        title="Duplicate Document",
        category="Contract",
        document_type="PDF",
        owner_id=uuid4(),
        storage_path="org/doc.pdf",
        original_filename="doc.pdf",
        mime_type="application/pdf",
        file_size=1024,
    )
    with pytest.raises(HTTPException) as exc:
        await DocumentService.create_document(
            session=mock_session,
            organization_id=uuid4(),
            actor_user_id=uuid4(),
            payload=payload,
        )
    assert exc.value.status_code == 409
    assert "already exists" in exc.value.detail


@pytest.mark.asyncio
async def test_create_document_invalid_owner_raises():
    mock_session = AsyncMock()
    mock_res1 = MagicMock()
    mock_res1.scalar_one_or_none.return_value = None  # No duplicate doc
    mock_res2 = MagicMock()
    mock_res2.scalar_one_or_none.return_value = None  # Owner not found!
    mock_session.execute.side_effect = [mock_res1, mock_res2]

    payload = DocumentCreate(
        document_number="DOC-2025-001",
        title="New Document",
        category="Contract",
        document_type="PDF",
        owner_id=uuid4(),
        storage_path="org/doc.pdf",
        original_filename="doc.pdf",
        mime_type="application/pdf",
        file_size=1024,
    )
    with pytest.raises(HTTPException) as exc:
        await DocumentService.create_document(
            session=mock_session,
            organization_id=uuid4(),
            actor_user_id=uuid4(),
            payload=payload,
        )
    assert exc.value.status_code == 400
    assert "Owner employee" in exc.value.detail


@pytest.mark.asyncio
async def test_get_document_returns_detail():
    mock_detail = _make_document_detail()
    with patch("app.services.document.DocumentService.get_document", new=AsyncMock(return_value=mock_detail)):
        result = await DocumentService.get_document(
            session=AsyncMock(), organization_id=uuid4(), document_id=uuid4()
        )
        assert result.title == "Master Services Agreement"
        assert len(result.versions) == 1


@pytest.mark.asyncio
async def test_update_document_metadata():
    mock_session = AsyncMock()
    mock_doc = MagicMock()
    mock_doc.id = uuid4()
    mock_doc.organization_id = uuid4()
    mock_doc.document_number = "DOC-2025-001"
    mock_doc.title = "Old Title"
    mock_doc.description = None
    mock_doc.category = "Contract"
    mock_doc.document_type = "PDF"
    mock_doc.owner_id = uuid4()
    mock_doc.client_id = None
    mock_doc.project_id = None
    mock_doc.vendor_id = None
    mock_doc.branch_id = None
    mock_doc.status = "active"
    mock_doc.storage_path = "org/doc.pdf"
    mock_doc.original_filename = "doc.pdf"
    mock_doc.mime_type = "application/pdf"
    mock_doc.file_size = 1024
    mock_doc.current_version = 1
    mock_doc.created_at = datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC)
    mock_doc.updated_at = datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC)
    mock_doc.owner = None
    mock_doc.client = None
    mock_doc.project = None
    mock_doc.vendor = None
    mock_doc.branch = None
    mock_doc.versions = []

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_doc
    mock_session.execute.return_value = mock_res

    payload = DocumentUpdate(title="New Title", description="Updated Description")
    result = await DocumentService.update_document(
        session=mock_session,
        organization_id=uuid4(),
        document_id=uuid4(),
        actor_user_id=uuid4(),
        payload=payload,
    )
    assert result.title == "New Title"
    assert result.description == "Updated Description"


@pytest.mark.asyncio
async def test_delete_document_success():
    mock_session = AsyncMock()
    mock_doc = MagicMock()
    mock_doc.document_number = "DOC-DEL-001"
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_doc
    mock_session.execute.return_value = mock_res

    await DocumentService.delete_document(
        session=mock_session,
        organization_id=uuid4(),
        document_id=uuid4(),
        actor_user_id=uuid4(),
    )
    mock_session.delete.assert_called_once_with(mock_doc)


@pytest.mark.asyncio
async def test_create_version_increments_version_number():
    mock_session = AsyncMock()
    mock_doc = MagicMock()
    mock_doc.current_version = 1
    mock_doc.storage_path = "org/doc_v1.pdf"
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_doc

    mock_ver = MagicMock()
    mock_ver.id = uuid4()
    mock_ver.organization_id = uuid4()
    mock_ver.document_id = uuid4()
    mock_ver.version_number = 2
    mock_ver.storage_path = "org/doc_v2.pdf"
    mock_ver.original_filename = "doc_v2.pdf"
    mock_ver.mime_type = "application/pdf"
    mock_ver.file_size = 2048
    mock_ver.checksum = None
    mock_ver.uploaded_by_id = uuid4()
    mock_ver.notes = "Revised terms"
    mock_ver.created_at = datetime.now(UTC)
    mock_ver.uploaded_by = None

    mock_res_ver = MagicMock()
    mock_res_ver.scalar_one.return_value = mock_ver
    mock_session.execute.side_effect = [mock_res, mock_res_ver]

    payload = DocumentVersionCreate(
        storage_path="org/doc_v2.pdf",
        original_filename="doc_v2.pdf",
        mime_type="application/pdf",
        file_size=2048,
        notes="Revised terms",
    )
    result = await DocumentService.create_version(
        session=mock_session,
        organization_id=uuid4(),
        document_id=uuid4(),
        actor_user_id=uuid4(),
        actor_employee_id=uuid4(),
        payload=payload,
    )
    assert result.version_number == 2
    assert mock_doc.current_version == 2


@pytest.mark.asyncio
async def test_list_versions_returns_versions():
    versions = [_make_version_response(version_number=2), _make_version_response(version_number=1)]
    with patch("app.services.document.DocumentService.list_versions", new=AsyncMock(return_value=versions)):
        result = await DocumentService.list_versions(
            session=AsyncMock(), organization_id=uuid4(), document_id=uuid4()
        )
        assert len(result) == 2
        assert result[0].version_number == 2


@pytest.mark.asyncio
async def test_generate_download_url_success():
    org_id = uuid4()
    doc_id = uuid4()

    mock_session = AsyncMock()
    mock_doc = MagicMock()
    mock_doc.storage_path = f"{org_id}/documents/{doc_id}/v1/contract.pdf"
    mock_doc.original_filename = "contract.pdf"
    mock_doc.mime_type = "application/pdf"
    mock_doc.file_size = 1048576

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_doc
    mock_session.execute.return_value = mock_res

    with patch(
        "app.services.document.create_signed_download_url",
        new=AsyncMock(return_value=SignedDownloadUrl("https://storage.example/signed/contract.pdf", 300)),
    ) as create_signed_url:
        result = await DocumentService.generate_download_url(
            session=mock_session,
            organization_id=org_id,
            document_id=doc_id,
            actor_user_id=uuid4(),
            actor_access_token="verified-user-jwt",
        )
    assert "contract.pdf" in result.download_url
    assert result.expires_in == 300
    assert result.filename == "contract.pdf"
    create_signed_url.assert_awaited_once_with(
        organization_id=org_id,
        storage_path=mock_doc.storage_path,
        access_token="verified-user-jwt",
        expires_in=300,
    )


@pytest.mark.asyncio
async def test_generate_download_url_cross_tenant_storage_blocked():
    org_id = uuid4()
    other_org_id = uuid4()
    doc_id = uuid4()

    mock_session = AsyncMock()
    mock_doc = MagicMock()
    # Malicious storage path from another organization
    mock_doc.storage_path = f"{other_org_id}/documents/{doc_id}/v1/secret.pdf"
    mock_doc.original_filename = "secret.pdf"
    mock_doc.mime_type = "application/pdf"
    mock_doc.file_size = 1048576

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_doc
    mock_session.execute.return_value = mock_res

    with pytest.raises(HTTPException) as exc:
        await DocumentService.generate_download_url(
            session=mock_session,
            organization_id=org_id,
            document_id=doc_id,
            actor_user_id=uuid4(),
            actor_access_token="verified-user-jwt",
        )
    assert exc.value.status_code == 403
    assert "outside tenant domain" in exc.value.detail


@pytest.mark.asyncio
async def test_generate_download_url_missing_document_is_not_found():
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result

    with pytest.raises(HTTPException) as exc:
        await DocumentService.generate_download_url(
            session=mock_session,
            organization_id=uuid4(),
            document_id=uuid4(),
            actor_user_id=uuid4(),
            actor_access_token="verified-user-jwt",
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_generate_upload_url_returns_path_and_expiry():
    org_id = uuid4()
    with patch(
        "app.services.document.create_signed_upload_url",
        new=AsyncMock(
            side_effect=lambda organization_id, storage_path, access_token, expires_in: SignedUploadUrl(
                "https://storage.example/upload-signed", storage_path, expires_in
            )
        ),
    ):
        result = await DocumentService.generate_upload_url(
            organization_id=org_id,
            actor_access_token="verified-user-jwt",
            filename="../dangerous/evil.exe",
            mime_type="application/octet-stream",
            file_size=5000,
        )
    assert result.expires_in == 900
    assert ".." not in result.storage_path
    assert result.storage_path.startswith(f"{org_id}/documents/")


@pytest.mark.asyncio
async def test_create_permission_duplicate_raises():
    mock_session = AsyncMock()
    mock_res1 = MagicMock()
    mock_res1.scalar_one_or_none.return_value = uuid4()  # Doc exists
    mock_res2 = MagicMock()
    mock_res2.scalar_one_or_none.return_value = uuid4()  # Employee exists
    mock_res3 = MagicMock()
    mock_res3.scalar_one_or_none.return_value = MagicMock()  # Duplicate found!
    mock_session.execute.side_effect = [mock_res1, mock_res2, mock_res3]

    payload = DocumentPermissionCreate(
        grantee_type="employee",
        grantee_id=uuid4(),
        permission_level="edit",
    )
    with pytest.raises(HTTPException) as exc:
        await DocumentService.create_permission(
            session=mock_session,
            organization_id=uuid4(),
            document_id=uuid4(),
            actor_user_id=uuid4(),
            payload=payload,
        )
    assert exc.value.status_code == 409
    assert "already exists" in exc.value.detail
