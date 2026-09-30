from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

DocumentStatus = Literal["draft", "active", "archived", "deleted"]
GranteeType = Literal["employee", "department", "role"]
PermissionLevel = Literal["view", "edit", "manage"]


class EmployeeSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_code: str
    first_name: str
    last_name: str
    designation: str | None = None


class ClientSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str


class ProjectSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str


class VendorSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str


class BranchSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str


# ---------------------------------------------------------------------------
# Document Versions
# ---------------------------------------------------------------------------


class DocumentVersionCreate(BaseModel):
    storage_path: str = Field(..., min_length=3, max_length=500)
    original_filename: str = Field(..., min_length=1, max_length=255)
    mime_type: str = Field(..., min_length=1, max_length=100)
    file_size: int = Field(..., ge=0)
    checksum: str | None = Field(None, max_length=64)
    notes: str | None = None


class DocumentVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    document_id: UUID
    version_number: int
    storage_path: str
    original_filename: str
    mime_type: str
    file_size: int
    checksum: str | None = None
    uploaded_by_id: UUID
    notes: str | None = None
    created_at: datetime

    uploaded_by: EmployeeSummary | None = None


# ---------------------------------------------------------------------------
# Document Permissions
# ---------------------------------------------------------------------------


class DocumentPermissionCreate(BaseModel):
    grantee_type: GranteeType
    grantee_id: UUID
    permission_level: PermissionLevel = "view"


class DocumentPermissionUpdate(BaseModel):
    permission_level: PermissionLevel


class DocumentPermissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    document_id: UUID
    grantee_type: GranteeType
    grantee_id: UUID
    permission_level: PermissionLevel
    created_at: datetime


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------


class DocumentCreate(BaseModel):
    document_number: str = Field(..., min_length=2, max_length=50)
    title: str = Field(..., min_length=2, max_length=255)
    description: str | None = None
    category: str = Field(..., min_length=2, max_length=100)
    document_type: str = Field(..., min_length=2, max_length=100)
    owner_id: UUID
    client_id: UUID | None = None
    project_id: UUID | None = None
    vendor_id: UUID | None = None
    branch_id: UUID | None = None
    status: DocumentStatus = "active"
    storage_path: str = Field(..., min_length=3, max_length=500)
    original_filename: str = Field(..., min_length=1, max_length=255)
    mime_type: str = Field(..., min_length=1, max_length=100)
    file_size: int = Field(..., ge=0)
    notes: str | None = None


class DocumentUpdate(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=255)
    description: str | None = None
    category: str | None = Field(None, min_length=2, max_length=100)
    document_type: str | None = Field(None, min_length=2, max_length=100)
    client_id: UUID | None = None
    project_id: UUID | None = None
    vendor_id: UUID | None = None
    branch_id: UUID | None = None
    status: DocumentStatus | None = None


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    document_number: str
    title: str
    description: str | None = None
    category: str
    document_type: str
    owner_id: UUID
    client_id: UUID | None = None
    project_id: UUID | None = None
    vendor_id: UUID | None = None
    branch_id: UUID | None = None
    status: DocumentStatus
    storage_path: str
    original_filename: str
    mime_type: str
    file_size: int
    current_version: int
    created_at: datetime
    updated_at: datetime

    owner: EmployeeSummary | None = None
    client: ClientSummary | None = None
    project: ProjectSummary | None = None
    vendor: VendorSummary | None = None
    branch: BranchSummary | None = None
    versions_count: int = 1


class DocumentDetail(DocumentResponse):
    versions: list[DocumentVersionResponse] = []
    permissions: list[DocumentPermissionResponse] = []


# ---------------------------------------------------------------------------
# Storage Signed URLs
# ---------------------------------------------------------------------------


class DocumentDownloadRequest(BaseModel):
    version_id: UUID | None = None


class DocumentDownloadResponse(BaseModel):
    download_url: str
    expires_in: int = 300
    filename: str
    mime_type: str
    file_size: int


class DocumentUploadUrlRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)
    mime_type: str = Field(..., min_length=1, max_length=100)
    file_size: int = Field(..., ge=0)


class DocumentUploadUrlResponse(BaseModel):
    upload_url: str
    storage_path: str
    expires_in: int = 900
