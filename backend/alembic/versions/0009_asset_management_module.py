"""Create assets and asset_assignments tables with RLS and canonical permissions.

Revision ID: 0009_asset_management_module
Revises: 0008_procurement_module
Create Date: 2026-09-29
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0009_asset_management_module"
down_revision = "0008_procurement_module"
branch_labels = None
depends_on = None

CANONICAL_PERMISSIONS = [
    ("assets.view", "View organization assets and assignment history"),
    ("assets.create", "Register and create new assets"),
    ("assets.update", "Edit asset details and status"),
    ("assets.delete", "Delete or retire assets"),
    ("assets.assign", "Assign assets to employees or branches"),
    ("assets.return", "Process asset returns and status changes"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [
        "assets.view",
        "assets.create",
        "assets.update",
        "assets.delete",
        "assets.assign",
        "assets.return",
    ],
    "organization_owner": [
        "assets.view",
        "assets.create",
        "assets.update",
        "assets.delete",
        "assets.assign",
        "assets.return",
    ],
    "organization_admin": [
        "assets.view",
        "assets.create",
        "assets.update",
        "assets.delete",
        "assets.assign",
        "assets.return",
    ],
    "finance_manager": [
        "assets.view",
        "assets.create",
        "assets.update",
        "assets.assign",
        "assets.return",
    ],
    "hr_manager": [
        "assets.view",
        "assets.assign",
        "assets.return",
    ],
    "department_manager": [
        "assets.view",
    ],
    "project_manager": [
        "assets.view",
    ],
}


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    # 1. Create assets table
    op.create_table(
        "assets",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("asset_code", sa.String(50), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("serial_number", sa.String(100), nullable=True),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("manufacturer", sa.String(100), nullable=True),
        sa.Column(
            "vendor_id",
            uuid,
            sa.ForeignKey("vendors.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "purchase_order_id",
            uuid,
            sa.ForeignKey("purchase_orders.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("purchase_date", sa.Date(), nullable=True),
        sa.Column("purchase_cost", sa.Numeric(14, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("warranty_start_date", sa.Date(), nullable=True),
        sa.Column("warranty_end_date", sa.Date(), nullable=True),
        sa.Column(
            "branch_id",
            uuid,
            sa.ForeignKey("branches.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "current_custodian_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("status", sa.String(30), nullable=False, server_default="available"),
        sa.Column("condition", sa.String(30), nullable=False, server_default="good"),
        sa.Column("location", sa.String(200), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "asset_code", name="uq_assets_organization_code"),
        sa.UniqueConstraint("organization_id", "id", name="uq_assets_org_id"),
        sa.ForeignKeyConstraint(
            ["organization_id", "vendor_id"],
            ["vendors.organization_id", "vendors.id"],
            ondelete="SET NULL",
            name="fk_assets_vendor_org",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id", "purchase_order_id"],
            ["purchase_orders.organization_id", "purchase_orders.id"],
            ondelete="SET NULL",
            name="fk_assets_po_org",
        ),
        sa.CheckConstraint(
            "status IN ('available', 'assigned', 'under_maintenance', 'lost', 'retired', 'disposed')",
            name="ck_assets_status",
        ),
        sa.CheckConstraint(
            "condition IN ('new', 'good', 'fair', 'poor', 'damaged')",
            name="ck_assets_condition",
        ),
        sa.CheckConstraint(
            "purchase_cost IS NULL OR purchase_cost >= 0",
            name="ck_assets_purchase_cost",
        ),
        sa.CheckConstraint(
            "warranty_end_date IS NULL OR warranty_start_date IS NULL OR warranty_end_date >= warranty_start_date",
            name="ck_assets_warranty_dates",
        ),
    )
    op.execute("CREATE INDEX ix_assets_organization_id ON assets (organization_id)")
    op.execute("CREATE INDEX ix_assets_asset_code ON assets (asset_code)")
    op.execute("CREATE INDEX ix_assets_category ON assets (category)")
    op.execute("CREATE INDEX ix_assets_status ON assets (status)")
    op.execute("CREATE INDEX ix_assets_condition ON assets (condition)")
    op.execute("CREATE INDEX ix_assets_branch_id ON assets (branch_id)")
    op.execute("CREATE INDEX ix_assets_custodian_id ON assets (current_custodian_id)")
    op.execute("CREATE INDEX ix_assets_vendor_id ON assets (vendor_id)")
    op.execute("CREATE INDEX ix_assets_org_status ON assets (organization_id, status)")
    op.execute("CREATE INDEX ix_assets_org_category ON assets (organization_id, category)")

    # 2. Create asset_assignments table
    op.create_table(
        "asset_assignments",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "asset_id",
            uuid,
            sa.ForeignKey("assets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "employee_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "branch_id",
            uuid,
            sa.ForeignKey("branches.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("assigned_date", sa.Date(), nullable=False),
        sa.Column("returned_date", sa.Date(), nullable=True),
        sa.Column("assignment_notes", sa.Text(), nullable=True),
        sa.Column("return_notes", sa.Text(), nullable=True),
        sa.Column(
            "assigned_by_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "returned_by_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "id", name="uq_asset_assignments_org_id"),
        sa.ForeignKeyConstraint(
            ["organization_id", "asset_id"],
            ["assets.organization_id", "assets.id"],
            ondelete="CASCADE",
            name="fk_asset_assignments_asset_org",
        ),
        sa.CheckConstraint(
            "returned_date IS NULL OR returned_date >= assigned_date",
            name="ck_asset_assignments_dates",
        ),
    )
    op.execute("CREATE INDEX ix_asset_assignments_organization_id ON asset_assignments (organization_id)")
    op.execute("CREATE INDEX ix_asset_assignments_asset_id ON asset_assignments (asset_id)")
    op.execute("CREATE INDEX ix_asset_assignments_employee_id ON asset_assignments (employee_id)")
    op.execute("CREATE INDEX ix_asset_assignments_is_active ON asset_assignments (is_active)")
    op.execute("CREATE INDEX ix_asset_assignments_org_asset ON asset_assignments (organization_id, asset_id)")
    op.execute("CREATE INDEX ix_asset_assignments_org_employee ON asset_assignments (organization_id, employee_id)")
    op.execute(
        "CREATE UNIQUE INDEX uq_asset_active_assignment ON asset_assignments (organization_id, asset_id) "
        "WHERE is_active = true AND returned_date IS NULL"
    )

    # 3. Enable and FORCE Row Level Security on both tables
    asset_tables = ("assets", "asset_assignments")
    for table in asset_tables:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    org_setting_uuid = "(NULLIF(current_setting('app.organization_id', true), ''))::uuid"
    user_setting_uuid = "(NULLIF(current_setting('app.user_id', true), ''))::uuid"

    for table in asset_tables:
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
    asset_tables = ("asset_assignments", "assets")
    for table in asset_tables:
        op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table}")

    # 4. Drop tables in reverse order
    for table in asset_tables:
        op.drop_table(table)
