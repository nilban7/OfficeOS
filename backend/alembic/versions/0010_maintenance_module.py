"""Create maintenance_requests and maintenance_records tables with RLS and canonical permissions.

Revision ID: 0010_maintenance_module
Revises: 0009_asset_management_module
Create Date: 2026-09-29
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0010_maintenance_module"
down_revision = "0009_asset_management_module"
branch_labels = None
depends_on = None

CANONICAL_PERMISSIONS = [
    ("maintenance.view", "View organization maintenance requests and records"),
    ("maintenance.create", "Submit maintenance requests and register records"),
    ("maintenance.update", "Edit maintenance requests and records"),
    ("maintenance.delete", "Delete or cancel maintenance requests and records"),
    ("maintenance.assign", "Assign technicians or vendors to maintenance"),
    ("maintenance.complete", "Mark maintenance as completed and finalize costs"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [
        "maintenance.view",
        "maintenance.create",
        "maintenance.update",
        "maintenance.delete",
        "maintenance.assign",
        "maintenance.complete",
    ],
    "organization_owner": [
        "maintenance.view",
        "maintenance.create",
        "maintenance.update",
        "maintenance.delete",
        "maintenance.assign",
        "maintenance.complete",
    ],
    "organization_admin": [
        "maintenance.view",
        "maintenance.create",
        "maintenance.update",
        "maintenance.delete",
        "maintenance.assign",
        "maintenance.complete",
    ],
    "finance_manager": [
        "maintenance.view",
        "maintenance.update",
        "maintenance.complete",
    ],
    "hr_manager": [
        "maintenance.view",
        "maintenance.create",
    ],
    "department_manager": [
        "maintenance.view",
        "maintenance.create",
        "maintenance.update",
        "maintenance.assign",
        "maintenance.complete",
    ],
    "project_manager": [
        "maintenance.view",
        "maintenance.create",
    ],
    "employee": [
        "maintenance.view",
        "maintenance.create",
    ],
}


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    # 1. Create maintenance_requests table
    op.create_table(
        "maintenance_requests",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("request_number", sa.String(50), nullable=False),
        sa.Column(
            "asset_id",
            uuid,
            sa.ForeignKey("assets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "requester_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "branch_id",
            uuid,
            sa.ForeignKey("branches.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("issue_title", sa.String(200), nullable=False),
        sa.Column("issue_description", sa.Text(), nullable=True),
        sa.Column(
            "priority",
            sa.String(20),
            nullable=False,
            server_default="medium",
        ),
        sa.Column("requested_date", sa.Date(), nullable=False),
        sa.Column(
            "status",
            sa.String(30),
            nullable=False,
            server_default="submitted",
        ),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "request_number", name="uq_maintenance_requests_org_number"),
        sa.UniqueConstraint("organization_id", "id", name="uq_maintenance_requests_org_id"),
        sa.ForeignKeyConstraint(
            ["organization_id", "asset_id"],
            ["assets.organization_id", "assets.id"],
            ondelete="CASCADE",
            name="fk_maintenance_requests_asset_org",
        ),
        sa.CheckConstraint(
            "priority IN ('low', 'medium', 'high', 'urgent')",
            name="ck_maintenance_requests_priority",
        ),
        sa.CheckConstraint(
            "status IN ('submitted', 'approved', 'rejected', 'scheduled', 'in_progress', 'completed', 'cancelled')",
            name="ck_maintenance_requests_status",
        ),
    )
    op.execute("CREATE INDEX ix_maintenance_requests_organization_id ON maintenance_requests (organization_id)")
    op.execute("CREATE INDEX ix_maintenance_requests_request_number ON maintenance_requests (request_number)")
    op.execute("CREATE INDEX ix_maintenance_requests_asset_id ON maintenance_requests (asset_id)")
    op.execute("CREATE INDEX ix_maintenance_requests_requester_id ON maintenance_requests (requester_id)")
    op.execute("CREATE INDEX ix_maintenance_requests_branch_id ON maintenance_requests (branch_id)")
    op.execute("CREATE INDEX ix_maintenance_requests_priority ON maintenance_requests (priority)")
    op.execute("CREATE INDEX ix_maintenance_requests_status ON maintenance_requests (status)")
    op.execute("CREATE INDEX ix_maintenance_requests_org_status ON maintenance_requests (organization_id, status)")
    op.execute("CREATE INDEX ix_maintenance_requests_org_asset ON maintenance_requests (organization_id, asset_id)")

    # 2. Create maintenance_records table
    op.create_table(
        "maintenance_records",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("record_number", sa.String(50), nullable=False),
        sa.Column(
            "maintenance_request_id",
            uuid,
            sa.ForeignKey("maintenance_requests.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "asset_id",
            uuid,
            sa.ForeignKey("assets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "technician_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "vendor_id",
            uuid,
            sa.ForeignKey("vendors.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "maintenance_type",
            sa.String(50),
            nullable=False,
            server_default="corrective",
        ),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("completion_date", sa.Date(), nullable=True),
        sa.Column(
            "status",
            sa.String(30),
            nullable=False,
            server_default="scheduled",
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("parts_description", sa.Text(), nullable=True),
        sa.Column("labor_cost", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("parts_cost", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("other_cost", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("total_cost", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "record_number", name="uq_maintenance_records_org_number"),
        sa.UniqueConstraint("organization_id", "id", name="uq_maintenance_records_org_id"),
        sa.ForeignKeyConstraint(
            ["organization_id", "asset_id"],
            ["assets.organization_id", "assets.id"],
            ondelete="CASCADE",
            name="fk_maintenance_records_asset_org",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id", "maintenance_request_id"],
            ["maintenance_requests.organization_id", "maintenance_requests.id"],
            ondelete="SET NULL",
            name="fk_maintenance_records_request_org",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id", "vendor_id"],
            ["vendors.organization_id", "vendors.id"],
            ondelete="SET NULL",
            name="fk_maintenance_records_vendor_org",
        ),
        sa.CheckConstraint(
            "maintenance_type IN ('corrective', 'preventive', 'inspection', 'upgrade')",
            name="ck_maintenance_records_type",
        ),
        sa.CheckConstraint(
            "status IN ('scheduled', 'in_progress', 'completed', 'cancelled')",
            name="ck_maintenance_records_status",
        ),
        sa.CheckConstraint(
            "labor_cost >= 0",
            name="ck_maintenance_records_labor_cost",
        ),
        sa.CheckConstraint(
            "parts_cost >= 0",
            name="ck_maintenance_records_parts_cost",
        ),
        sa.CheckConstraint(
            "other_cost >= 0",
            name="ck_maintenance_records_other_cost",
        ),
        sa.CheckConstraint(
            "total_cost >= 0",
            name="ck_maintenance_records_total_cost",
        ),
        sa.CheckConstraint(
            "completion_date IS NULL OR completion_date >= start_date",
            name="ck_maintenance_records_dates",
        ),
    )
    op.execute("CREATE INDEX ix_maintenance_records_organization_id ON maintenance_records (organization_id)")
    op.execute("CREATE INDEX ix_maintenance_records_record_number ON maintenance_records (record_number)")
    op.execute("CREATE INDEX ix_maintenance_records_asset_id ON maintenance_records (asset_id)")
    op.execute("CREATE INDEX ix_maintenance_records_request_id ON maintenance_records (maintenance_request_id)")
    op.execute("CREATE INDEX ix_maintenance_records_technician_id ON maintenance_records (technician_id)")
    op.execute("CREATE INDEX ix_maintenance_records_vendor_id ON maintenance_records (vendor_id)")
    op.execute("CREATE INDEX ix_maintenance_records_status ON maintenance_records (status)")
    op.execute("CREATE INDEX ix_maintenance_records_type ON maintenance_records (maintenance_type)")
    op.execute("CREATE INDEX ix_maintenance_records_org_status ON maintenance_records (organization_id, status)")
    op.execute("CREATE INDEX ix_maintenance_records_org_asset ON maintenance_records (organization_id, asset_id)")

    # 3. Enable and FORCE Row Level Security on both tables
    maintenance_tables = ("maintenance_requests", "maintenance_records")
    for table in maintenance_tables:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    org_setting_uuid = "(NULLIF(current_setting('app.organization_id', true), ''))::uuid"
    user_setting_uuid = "(NULLIF(current_setting('app.user_id', true), ''))::uuid"

    for table in maintenance_tables:
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
    maintenance_tables = ("maintenance_records", "maintenance_requests")
    for table in maintenance_tables:
        op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table}")

    # 4. Drop tables in reverse order
    for table in maintenance_tables:
        op.drop_table(table)
