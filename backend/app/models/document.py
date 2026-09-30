import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.client import Client
    from app.models.employee import Employee
    from app.models.identity import Branch, Organization
    from app.models.procurement import Vendor
    from app.models.project import Project


class Document(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "documents"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    document_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    document_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vendors.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(30), server_default="active", default="active", nullable=False, index=True
    )
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    current_version: Mapped[int] = mapped_column(
        Integer, server_default="1", default=1, nullable=False
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    owner: Mapped["Employee"] = relationship("Employee", foreign_keys=[owner_id])
    client: Mapped["Client | None"] = relationship("Client", foreign_keys=[client_id])
    project: Mapped["Project | None"] = relationship("Project", foreign_keys=[project_id])
    vendor: Mapped["Vendor | None"] = relationship("Vendor", foreign_keys=[vendor_id])
    branch: Mapped["Branch | None"] = relationship("Branch", foreign_keys=[branch_id])

    versions: Mapped[list["DocumentVersion"]] = relationship(
        "DocumentVersion",
        back_populates="document",
        cascade="all, delete-orphan",
        foreign_keys="[DocumentVersion.document_id]",
        order_by="DocumentVersion.version_number.desc()",
    )
    permissions: Mapped[list["DocumentPermission"]] = relationship(
        "DocumentPermission",
        back_populates="document",
        cascade="all, delete-orphan",
        foreign_keys="[DocumentPermission.document_id]",
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "document_number", name="uq_documents_org_number"),
        UniqueConstraint("organization_id", "id", name="uq_documents_org_id"),
        CheckConstraint("file_size >= 0", name="ck_documents_file_size_non_negative"),
        CheckConstraint("current_version >= 1", name="ck_documents_current_version_positive"),
        CheckConstraint(
            "status IN ('draft', 'active', 'archived', 'deleted')",
            name="ck_documents_status",
        ),
    )


class DocumentVersion(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "document_versions"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        index=True,
        nullable=False,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    uploaded_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    document: Mapped["Document"] = relationship(
        "Document", foreign_keys=[document_id], back_populates="versions"
    )
    uploaded_by: Mapped["Employee"] = relationship(
        "Employee", foreign_keys=[uploaded_by_id]
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_document_versions_org_id"),
        UniqueConstraint(
            "organization_id",
            "document_id",
            "version_number",
            name="uq_document_versions_org_doc_version",
        ),
        ForeignKeyConstraint(
            ["organization_id", "document_id"],
            ["documents.organization_id", "documents.id"],
            ondelete="CASCADE",
            name="fk_document_versions_doc_org",
        ),
        CheckConstraint("version_number >= 1", name="ck_document_versions_version_positive"),
        CheckConstraint("file_size >= 0", name="ck_document_versions_file_size_non_negative"),
    )


class DocumentPermission(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "document_permissions"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        index=True,
        nullable=False,
    )
    grantee_type: Mapped[str] = mapped_column(String(20), nullable=False)
    grantee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    permission_level: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    document: Mapped["Document"] = relationship(
        "Document", foreign_keys=[document_id], back_populates="permissions"
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_document_permissions_org_id"),
        UniqueConstraint(
            "organization_id",
            "document_id",
            "grantee_type",
            "grantee_id",
            name="uq_document_permissions_org_doc_grantee",
        ),
        ForeignKeyConstraint(
            ["organization_id", "document_id"],
            ["documents.organization_id", "documents.id"],
            ondelete="CASCADE",
            name="fk_document_permissions_doc_org",
        ),
        CheckConstraint(
            "grantee_type IN ('employee', 'department', 'role')",
            name="ck_document_permissions_grantee_type",
        ),
        CheckConstraint(
            "permission_level IN ('view', 'edit', 'manage')",
            name="ck_document_permissions_level",
        ),
    )
