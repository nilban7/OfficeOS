"""Create vendors, purchase_requests, purchase_orders, and purchase_order_items tables with RLS and canonical permissions.

Revision ID: 0008_procurement_module
Revises: 0007_project_management_module
Create Date: 2026-09-29
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0008_procurement_module"
down_revision = "0007_project_management_module"
branch_labels = None
depends_on = None

CANONICAL_PERMISSIONS = [
    ("procurement.view", "View organization purchase requests and procurement records"),
    ("procurement.create", "Create purchase requests"),
    ("procurement.update", "Update draft purchase requests"),
    ("procurement.delete", "Delete or cancel draft purchase requests"),
    ("procurement.approve", "Review, approve, or reject purchase requests"),
    ("purchase_orders.view", "View purchase orders"),
    ("purchase_orders.manage", "Create, update, cancel, and close purchase orders"),
    ("vendors.view", "View vendor master records"),
    ("vendors.manage", "Create and update vendor records"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [
        "procurement.view",
        "procurement.create",
        "procurement.update",
        "procurement.delete",
        "procurement.approve",
        "purchase_orders.view",
        "purchase_orders.manage",
        "vendors.view",
        "vendors.manage",
    ],
    "organization_owner": [
        "procurement.view",
        "procurement.create",
        "procurement.update",
        "procurement.delete",
        "procurement.approve",
        "purchase_orders.view",
        "purchase_orders.manage",
        "vendors.view",
        "vendors.manage",
    ],
    "organization_admin": [
        "procurement.view",
        "procurement.create",
        "procurement.update",
        "procurement.delete",
        "procurement.approve",
        "purchase_orders.view",
        "purchase_orders.manage",
        "vendors.view",
        "vendors.manage",
    ],
    "finance_manager": [
        "procurement.view",
        "procurement.create",
        "procurement.update",
        "procurement.delete",
        "procurement.approve",
        "purchase_orders.view",
        "purchase_orders.manage",
        "vendors.view",
        "vendors.manage",
    ],
    "project_manager": [
        "procurement.view",
        "procurement.create",
        "procurement.update",
        "procurement.delete",
        "procurement.approve",
        "purchase_orders.view",
        "vendors.view",
    ],
    "department_manager": [
        "procurement.view",
        "procurement.create",
        "procurement.update",
        "procurement.delete",
        "procurement.approve",
        "purchase_orders.view",
        "vendors.view",
    ],
    "hr_manager": [
        "procurement.view",
        "procurement.create",
        "procurement.update",
        "procurement.delete",
        "procurement.approve",
        "purchase_orders.view",
        "vendors.view",
    ],
    "employee": [
        "procurement.create",
        "procurement.update",
        "procurement.delete",
    ],
}


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    # 1. Create vendors table
    op.create_table(
        "vendors",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("vendor_code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("contact_person", sa.String(100), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("tax_id", sa.String(50), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "vendor_code", name="uq_vendors_organization_code"),
        sa.UniqueConstraint("organization_id", "id", name="uq_vendors_org_id"),
    )
    op.execute("CREATE INDEX ix_vendors_organization_id ON vendors (organization_id)")
    op.execute("CREATE INDEX ix_vendors_vendor_code ON vendors (vendor_code)")
    op.execute("CREATE INDEX ix_vendors_name ON vendors (name)")
    op.execute("CREATE INDEX ix_vendors_is_active ON vendors (is_active)")

    # 2. Create purchase_requests table
    op.create_table(
        "purchase_requests",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("request_number", sa.String(32), nullable=False),
        sa.Column(
            "requester_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "department_id",
            uuid,
            sa.ForeignKey("departments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("required_date", sa.Date(), nullable=True),
        sa.Column("priority", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("purpose", sa.Text(), nullable=False),
        sa.Column("estimated_amount", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column(
            "reviewer_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewer_comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "request_number", name="uq_purchase_requests_org_number"),
        sa.UniqueConstraint("organization_id", "id", name="uq_purchase_requests_org_id"),
        sa.CheckConstraint(
            "priority IN ('low', 'medium', 'high', 'urgent')",
            name="ck_purchase_requests_priority",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled')",
            name="ck_purchase_requests_status",
        ),
        sa.CheckConstraint(
            "estimated_amount >= 0",
            name="ck_purchase_requests_amount",
        ),
    )
    op.execute("CREATE INDEX ix_purchase_requests_organization_id ON purchase_requests (organization_id)")
    op.execute("CREATE INDEX ix_purchase_requests_requester_id ON purchase_requests (requester_id)")
    op.execute("CREATE INDEX ix_purchase_requests_department_id ON purchase_requests (department_id)")
    op.execute("CREATE INDEX ix_purchase_requests_status ON purchase_requests (status)")
    op.execute("CREATE INDEX ix_purchase_requests_priority ON purchase_requests (priority)")
    op.execute("CREATE INDEX ix_purchase_requests_org_status ON purchase_requests (organization_id, status)")
    op.execute("CREATE INDEX ix_purchase_requests_org_requester ON purchase_requests (organization_id, requester_id)")

    # 3. Create purchase_orders table
    op.create_table(
        "purchase_orders",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("po_number", sa.String(32), nullable=False),
        sa.Column(
            "vendor_id",
            uuid,
            sa.ForeignKey("vendors.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "purchase_request_id",
            uuid,
            sa.ForeignKey("purchase_requests.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("order_date", sa.Date(), nullable=False),
        sa.Column("expected_delivery_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("subtotal", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("tax_amount", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("total_amount", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_by_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "po_number", name="uq_purchase_orders_org_number"),
        sa.UniqueConstraint("organization_id", "id", name="uq_purchase_orders_org_id"),
        sa.ForeignKeyConstraint(
            ["organization_id", "vendor_id"],
            ["vendors.organization_id", "vendors.id"],
            ondelete="RESTRICT",
            name="fk_po_org_vendor",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id", "purchase_request_id"],
            ["purchase_requests.organization_id", "purchase_requests.id"],
            ondelete="SET NULL",
            name="fk_po_org_pr",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'issued', 'partially_received', 'received', 'cancelled', 'closed')",
            name="ck_purchase_orders_status",
        ),
        sa.CheckConstraint("subtotal >= 0", name="ck_purchase_orders_subtotal"),
        sa.CheckConstraint("tax_amount >= 0", name="ck_purchase_orders_tax"),
        sa.CheckConstraint("total_amount >= 0", name="ck_purchase_orders_total"),
        sa.CheckConstraint(
            "expected_delivery_date IS NULL OR expected_delivery_date >= order_date",
            name="ck_purchase_orders_dates",
        ),
    )
    op.execute("CREATE INDEX ix_purchase_orders_organization_id ON purchase_orders (organization_id)")
    op.execute("CREATE INDEX ix_purchase_orders_vendor_id ON purchase_orders (vendor_id)")
    op.execute("CREATE INDEX ix_purchase_orders_pr_id ON purchase_orders (purchase_request_id)")
    op.execute("CREATE INDEX ix_purchase_orders_status ON purchase_orders (status)")
    op.execute("CREATE INDEX ix_purchase_orders_org_status ON purchase_orders (organization_id, status)")

    # 4. Create purchase_order_items table
    op.create_table(
        "purchase_order_items",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "purchase_order_id",
            uuid,
            sa.ForeignKey("purchase_orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("item_description", sa.Text(), nullable=False),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=False),
        sa.Column("unit", sa.String(20), nullable=False, server_default="pcs"),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False),
        sa.Column("tax_rate", sa.Numeric(5, 2), nullable=False, server_default="0.00"),
        sa.Column("tax_amount", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("line_total", sa.Numeric(14, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "id", name="uq_purchase_order_items_org_id"),
        sa.ForeignKeyConstraint(
            ["organization_id", "purchase_order_id"],
            ["purchase_orders.organization_id", "purchase_orders.id"],
            ondelete="CASCADE",
            name="fk_po_items_org_po",
        ),
        sa.CheckConstraint("quantity > 0", name="ck_po_items_quantity"),
        sa.CheckConstraint("unit_price >= 0", name="ck_po_items_unit_price"),
        sa.CheckConstraint("tax_rate >= 0", name="ck_po_items_tax_rate"),
        sa.CheckConstraint("tax_amount >= 0", name="ck_po_items_tax_amount"),
        sa.CheckConstraint("line_total >= 0", name="ck_po_items_line_total"),
    )
    op.execute("CREATE INDEX ix_po_items_organization_id ON purchase_order_items (organization_id)")
    op.execute("CREATE INDEX ix_po_items_po_id ON purchase_order_items (purchase_order_id)")
    op.execute("CREATE INDEX ix_po_items_org_po ON purchase_order_items (organization_id, purchase_order_id)")

    # 5. Enable and FORCE Row Level Security on all 4 tables
    procurement_tables = ("vendors", "purchase_requests", "purchase_orders", "purchase_order_items")
    for table in procurement_tables:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    org_setting_uuid = "(NULLIF(current_setting('app.organization_id', true), ''))::uuid"
    user_setting_uuid = "(NULLIF(current_setting('app.user_id', true), ''))::uuid"

    for table in procurement_tables:
        op.execute(
            f"CREATE POLICY {table}_member ON {table} FOR ALL USING ("
            f"{user_context} AND {org_context} "
            f"AND organization_id = {org_setting_uuid} "
            f"AND public.is_org_member(organization_id, {user_setting_uuid}))"
        )

    # 6. Seed Canonical Permissions
    for code, description in CANONICAL_PERMISSIONS:
        escaped_desc = description.replace("'", "''")
        op.execute(
            f"INSERT INTO permissions (id, code, description) "
            f"VALUES (gen_random_uuid(), '{code}', '{escaped_desc}') "
            f"ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description"
        )

    # 7. Map permissions to roles
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
    procurement_tables = ("purchase_order_items", "purchase_orders", "purchase_requests", "vendors")
    for table in procurement_tables:
        op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table}")

    # 4. Drop tables in reverse order of foreign key dependencies
    for table in procurement_tables:
        op.drop_table(table)
