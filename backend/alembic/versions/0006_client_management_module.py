"""Create clients and client_contacts tables with RLS and canonical permissions.

Revision ID: 0006_client_management_module
Revises: 0005_leave_and_holidays_module
Create Date: 2026-09-28
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0006_client_management_module"
down_revision = "0005_leave_and_holidays_module"
branch_labels = None
depends_on = None

CANONICAL_PERMISSIONS = [
    ("clients.view", "View organization clients and directory"),
    ("clients.create", "Create new client profiles"),
    ("clients.update", "Update client profiles and statuses"),
    ("clients.delete", "Archive or delete client profiles"),
    ("client_contacts.view", "View client contacts"),
    ("client_contacts.manage", "Create, update, and delete client contacts"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [
        "clients.view",
        "clients.create",
        "clients.update",
        "clients.delete",
        "client_contacts.view",
        "client_contacts.manage",
    ],
    "organization_owner": [
        "clients.view",
        "clients.create",
        "clients.update",
        "clients.delete",
        "client_contacts.view",
        "client_contacts.manage",
    ],
    "organization_admin": [
        "clients.view",
        "clients.create",
        "clients.update",
        "clients.delete",
        "client_contacts.view",
        "client_contacts.manage",
    ],
    "hr_manager": [
        "clients.view",
        "clients.create",
        "clients.update",
        "clients.delete",
        "client_contacts.view",
        "client_contacts.manage",
    ],
    "project_manager": [
        "clients.view",
        "clients.create",
        "clients.update",
        "clients.delete",
        "client_contacts.view",
        "client_contacts.manage",
    ],
    "finance_manager": [
        "clients.view",
        "client_contacts.view",
    ],
    "department_manager": [
        "clients.view",
        "client_contacts.view",
    ],
}


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    # 1. Create clients table
    op.create_table(
        "clients",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("client_code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("legal_name", sa.String(255), nullable=True),
        sa.Column("client_type", sa.String(50), nullable=True),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("website", sa.String(255), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("state", sa.String(100), nullable=True),
        sa.Column("postal_code", sa.String(32), nullable=True),
        sa.Column("country", sa.String(100), nullable=True),
        sa.Column("tax_id", sa.String(64), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "client_code", name="uq_clients_organization_code"),
        sa.UniqueConstraint("organization_id", "id", name="uq_clients_org_id"),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'archived')",
            name="ck_clients_status",
        ),
    )
    op.execute("CREATE INDEX ix_clients_organization_id ON clients (organization_id)")
    op.execute("CREATE INDEX ix_clients_status ON clients (status)")
    op.execute("CREATE INDEX ix_clients_name ON clients (name)")
    op.execute("CREATE INDEX ix_clients_org_status ON clients (organization_id, status)")

    # 2. Create client_contacts table
    op.create_table(
        "client_contacts",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "client_id",
            uuid,
            sa.ForeignKey("clients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("designation", sa.String(100), nullable=True),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["organization_id", "client_id"],
            ["clients.organization_id", "clients.id"],
            ondelete="CASCADE",
            name="fk_client_contacts_clients_org",
        ),
    )
    op.execute("CREATE INDEX ix_client_contacts_organization_id ON client_contacts (organization_id)")
    op.execute("CREATE INDEX ix_client_contacts_client_id ON client_contacts (client_id)")
    op.execute("CREATE INDEX ix_client_contacts_is_primary ON client_contacts (is_primary)")
    op.execute("CREATE INDEX ix_client_contacts_org_client ON client_contacts (organization_id, client_id)")

    # 3. Enable and FORCE Row Level Security on both tables
    for table in ("clients", "client_contacts"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    org_setting_uuid = "(NULLIF(current_setting('app.organization_id', true), ''))::uuid"
    user_setting_uuid = "(NULLIF(current_setting('app.user_id', true), ''))::uuid"

    for table in ("clients", "client_contacts"):
        op.execute(
            f"CREATE POLICY {table}_member ON {table} FOR ALL USING ("
            f"{user_context} AND {org_context} "
            f"AND organization_id = {org_setting_uuid} "
            f"AND public.is_org_member(organization_id, {user_setting_uuid}))"
        )

    # 4. Seed Canonical Permissions
    for code, description in CANONICAL_PERMISSIONS:
        escaped_desc = description.replace("'", "''")
        op.execute(
            f"INSERT INTO permissions (id, code, description) "
            f"VALUES (gen_random_uuid(), '{code}', '{escaped_desc}') "
            f"ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description"
        )

    # 5. Map permissions to roles
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
    # 1. Remove role_permissions for newly seeded permissions
    perm_codes_str = ", ".join(f"'{code}'" for code, _ in CANONICAL_PERMISSIONS)
    op.execute(
        f"DELETE FROM role_permissions WHERE permission_id IN ("
        f"SELECT id FROM permissions WHERE code IN ({perm_codes_str}))"
    )

    # 2. Delete seeded permissions
    op.execute(f"DELETE FROM permissions WHERE code IN ({perm_codes_str})")

    # 3. Drop RLS policies
    for table in ("client_contacts", "clients"):
        op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table}")

    # 4. Drop tables
    op.drop_table("client_contacts")
    op.drop_table("clients")
