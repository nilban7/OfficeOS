"""Create documents, document_versions, and document_permissions tables with RLS and canonical permissions.

Revision ID: 0015_documents_module
Revises: 0014_finance_module
Create Date: 2026-09-29
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0015_documents_module"
down_revision: Union[str, None] = "0014_finance_module"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CANONICAL_PERMISSIONS = [
    ("documents.view", "View documents and metadata within the organization"),
    ("documents.create", "Create and upload new documents"),
    ("documents.update", "Edit document metadata and upload new versions"),
    ("documents.delete", "Delete or archive documents"),
    ("documents.download", "Generate secure download signed URLs for documents"),
    ("documents.manage", "Manage explicit document permissions and security settings"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_owner": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "finance_manager": [
        "documents.view",
        "documents.create",
        "documents.update",
        "documents.download",
    ],
    "hr_manager": [
        "documents.view",
        "documents.create",
        "documents.update",
        "documents.download",
    ],
    "department_manager": [
        "documents.view",
        "documents.create",
        "documents.update",
        "documents.download",
    ],
    "project_manager": [
        "documents.view",
        "documents.create",
        "documents.update",
        "documents.download",
    ],
    "employee": [
        "documents.view",
        "documents.create",
        "documents.download",
    ],
}


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    # 1. Create documents table
    op.create_table(
        "documents",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("document_number", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("document_type", sa.String(100), nullable=False),
        sa.Column(
            "owner_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "client_id",
            uuid,
            sa.ForeignKey("clients.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "project_id",
            uuid,
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "vendor_id",
            uuid,
            sa.ForeignKey("vendors.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "branch_id",
            uuid,
            sa.ForeignKey("branches.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.String(30),
            nullable=False,
            server_default="active",
        ),
        sa.Column("storage_path", sa.String(500), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("current_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("organization_id", "document_number", name="uq_documents_org_number"),
        sa.UniqueConstraint("organization_id", "id", name="uq_documents_org_id"),
        sa.CheckConstraint("file_size >= 0", name="ck_documents_file_size_non_negative"),
        sa.CheckConstraint("current_version >= 1", name="ck_documents_current_version_positive"),
        sa.CheckConstraint(
            "status IN ('draft', 'active', 'archived', 'deleted')",
            name="ck_documents_status",
        ),
    )
    op.execute("CREATE INDEX ix_documents_organization_id ON documents (organization_id)")
    op.execute("CREATE INDEX ix_documents_document_number ON documents (document_number)")
    op.execute("CREATE INDEX ix_documents_owner_id ON documents (owner_id)")
    op.execute("CREATE INDEX ix_documents_category ON documents (category)")
    op.execute("CREATE INDEX ix_documents_document_type ON documents (document_type)")
    op.execute("CREATE INDEX ix_documents_status ON documents (status)")
    op.execute("CREATE INDEX ix_documents_client_id ON documents (client_id)")
    op.execute("CREATE INDEX ix_documents_project_id ON documents (project_id)")
    op.execute("CREATE INDEX ix_documents_vendor_id ON documents (vendor_id)")
    op.execute("CREATE INDEX ix_documents_branch_id ON documents (branch_id)")

    # 2. Create document_versions table
    op.create_table(
        "document_versions",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("document_id", uuid, nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("storage_path", sa.String(500), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("checksum", sa.String(64), nullable=True),
        sa.Column(
            "uploaded_by_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("organization_id", "id", name="uq_document_versions_org_id"),
        sa.UniqueConstraint(
            "organization_id",
            "document_id",
            "version_number",
            name="uq_document_versions_org_doc_version",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id", "document_id"],
            ["documents.organization_id", "documents.id"],
            ondelete="CASCADE",
            name="fk_document_versions_doc_org",
        ),
        sa.CheckConstraint("version_number >= 1", name="ck_document_versions_version_positive"),
        sa.CheckConstraint("file_size >= 0", name="ck_document_versions_file_size_non_negative"),
    )
    op.execute("CREATE INDEX ix_document_versions_organization_id ON document_versions (organization_id)")
    op.execute("CREATE INDEX ix_document_versions_document_id ON document_versions (document_id)")
    op.execute("CREATE INDEX ix_document_versions_uploaded_by_id ON document_versions (uploaded_by_id)")

    # 3. Create document_permissions table
    op.create_table(
        "document_permissions",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("document_id", uuid, nullable=False),
        sa.Column("grantee_type", sa.String(20), nullable=False),
        sa.Column("grantee_id", uuid, nullable=False),
        sa.Column("permission_level", sa.String(20), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("organization_id", "id", name="uq_document_permissions_org_id"),
        sa.UniqueConstraint(
            "organization_id",
            "document_id",
            "grantee_type",
            "grantee_id",
            name="uq_document_permissions_org_doc_grantee",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id", "document_id"],
            ["documents.organization_id", "documents.id"],
            ondelete="CASCADE",
            name="fk_document_permissions_doc_org",
        ),
        sa.CheckConstraint(
            "grantee_type IN ('employee', 'department', 'role')",
            name="ck_document_permissions_grantee_type",
        ),
        sa.CheckConstraint(
            "permission_level IN ('view', 'edit', 'manage')",
            name="ck_document_permissions_level",
        ),
    )
    op.execute("CREATE INDEX ix_document_permissions_organization_id ON document_permissions (organization_id)")
    op.execute("CREATE INDEX ix_document_permissions_document_id ON document_permissions (document_id)")
    op.execute("CREATE INDEX ix_document_permissions_grantee ON document_permissions (grantee_type, grantee_id)")

    # 4. Enable and FORCE RLS on all 3 tables
    tables = ("documents", "document_versions", "document_permissions")
    for table in tables:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    org_setting_uuid = "(NULLIF(current_setting('app.organization_id', true), ''))::uuid"
    user_setting_uuid = "(NULLIF(current_setting('app.user_id', true), ''))::uuid"

    for table in tables:
        op.execute(
            f"CREATE POLICY {table}_member ON {table} FOR ALL USING ("
            f"{user_context} AND {org_context} "
            f"AND organization_id = {org_setting_uuid} "
            f"AND public.is_org_member(organization_id, {user_setting_uuid}))"
        )

    # 5. Seed Canonical Permissions
    for code, description in CANONICAL_PERMISSIONS:
        escaped_desc = description.replace("'", "''")
        op.execute(
            f"INSERT INTO permissions (id, code, description) "
            f"VALUES (gen_random_uuid(), '{code}', '{escaped_desc}') "
            f"ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description"
        )

    # 6. Map permissions to roles
    for role_name, perm_codes in ROLE_PERMISSIONS_MAPPING.items():
        for perm_code in perm_codes:
            op.execute(
                f"INSERT INTO role_permissions (role_id, permission_id) "
                f"SELECT r.id, p.id "
                f"FROM roles r, permissions p "
                f"WHERE r.name = '{role_name}' AND r.is_system = true AND p.code = '{perm_code}' "
                f"ON CONFLICT (role_id, permission_id) DO NOTHING"
            )


def downgrade() -> None:
    perm_codes_str = ", ".join(f"'{code}'" for code, _ in CANONICAL_PERMISSIONS)
    op.execute(
        f"DELETE FROM role_permissions WHERE permission_id IN ("
        f"SELECT id FROM permissions WHERE code IN ({perm_codes_str}))"
    )
    op.execute(f"DELETE FROM permissions WHERE code IN ({perm_codes_str})")

    tables = ("document_permissions", "document_versions", "documents")
    for table in tables:
        op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table}")
        op.drop_table(table)
