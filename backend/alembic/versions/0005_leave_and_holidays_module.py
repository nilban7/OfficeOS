"""Create leave_types, leave_requests, and holidays tables with RLS and canonical permissions.

Revision ID: 0005_leave_and_holidays_module
Revises: 0004_attendance_module
Create Date: 2026-09-28
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0005_leave_and_holidays_module"
down_revision = "0004_attendance_module"
branch_labels = None
depends_on = None

CANONICAL_PERMISSIONS = [
    ("leave.view", "View leave requests and summary metrics"),
    ("leave.request", "Submit leave request for self"),
    ("leave.manage", "Manage leave requests on behalf of employees"),
    ("leave.approve", "Approve or reject leave requests"),
    ("leave.cancel", "Cancel own pending leave requests"),
    ("leave_types.manage", "Create, update, and manage leave types"),
    ("holidays.view", "View organization and branch holidays"),
    ("holidays.manage", "Create, update, and delete holidays"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [
        "leave.view",
        "leave.request",
        "leave.manage",
        "leave.approve",
        "leave.cancel",
        "leave_types.manage",
        "holidays.view",
        "holidays.manage",
    ],
    "organization_owner": [
        "leave.view",
        "leave.request",
        "leave.manage",
        "leave.approve",
        "leave.cancel",
        "leave_types.manage",
        "holidays.view",
        "holidays.manage",
    ],
    "organization_admin": [
        "leave.view",
        "leave.request",
        "leave.manage",
        "leave.approve",
        "leave.cancel",
        "leave_types.manage",
        "holidays.view",
        "holidays.manage",
    ],
    "hr_manager": [
        "leave.view",
        "leave.request",
        "leave.manage",
        "leave.approve",
        "leave.cancel",
        "leave_types.manage",
        "holidays.view",
        "holidays.manage",
    ],
    "department_manager": [
        "leave.view",
        "leave.request",
        "leave.approve",
        "leave.cancel",
        "holidays.view",
    ],
    "project_manager": [
        "leave.view",
        "leave.request",
        "leave.cancel",
        "holidays.view",
    ],
    "finance_manager": [
        "leave.view",
        "leave.request",
        "leave.cancel",
        "holidays.view",
    ],
    "employee": [
        "leave.view",
        "leave.request",
        "leave.cancel",
        "holidays.view",
    ],
}


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    # 1. Create leave_types table
    op.create_table(
        "leave_types",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("annual_allocation", sa.Numeric(5, 2), nullable=False, server_default="0.00"),
        sa.Column("is_paid", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("requires_approval", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "code", name="uq_leave_types_org_code"),
        sa.CheckConstraint("annual_allocation >= 0", name="ck_leave_types_annual_allocation"),
    )
    op.execute("CREATE INDEX ix_leave_types_organization_id ON leave_types (organization_id)")
    op.execute("CREATE INDEX ix_leave_types_is_active ON leave_types (is_active)")

    # 2. Create leave_requests table
    op.create_table(
        "leave_requests",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "employee_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "leave_type_id",
            uuid,
            sa.ForeignKey("leave_types.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("total_days", sa.Numeric(5, 2), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column(
            "reviewed_by",
            uuid,
            sa.ForeignKey("profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewer_comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("end_date >= start_date", name="ck_leave_requests_date_order"),
        sa.CheckConstraint("total_days > 0", name="ck_leave_requests_total_days"),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'cancelled')",
            name="ck_leave_requests_status",
        ),
    )
    op.execute("CREATE INDEX ix_leave_requests_organization_id ON leave_requests (organization_id)")
    op.execute("CREATE INDEX ix_leave_requests_employee_id ON leave_requests (employee_id)")
    op.execute("CREATE INDEX ix_leave_requests_leave_type_id ON leave_requests (leave_type_id)")
    op.execute("CREATE INDEX ix_leave_requests_status ON leave_requests (status)")
    op.execute("CREATE INDEX ix_leave_requests_dates ON leave_requests (start_date, end_date)")
    op.execute("CREATE INDEX ix_leave_requests_org_emp ON leave_requests (organization_id, employee_id)")

    # 3. Create holidays table
    op.create_table(
        "holidays",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "branch_id",
            uuid,
            sa.ForeignKey("branches.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("holiday_date", sa.Date(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_optional", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.execute("CREATE INDEX ix_holidays_organization_id ON holidays (organization_id)")
    op.execute("CREATE INDEX ix_holidays_branch_id ON holidays (branch_id)")
    op.execute("CREATE INDEX ix_holidays_holiday_date ON holidays (holiday_date)")
    op.execute("CREATE INDEX ix_holidays_org_date ON holidays (organization_id, holiday_date)")

    # 4. Enable and FORCE RLS on new tables
    for table in ("leave_types", "leave_requests", "holidays"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    org_setting_uuid = "(NULLIF(current_setting('app.organization_id', true), ''))::uuid"
    user_setting_uuid = "(NULLIF(current_setting('app.user_id', true), ''))::uuid"

    for table in ("leave_types", "leave_requests", "holidays"):
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
    # 1. Remove role_permissions for newly seeded permissions
    perm_codes_str = ", ".join(f"'{code}'" for code, _ in CANONICAL_PERMISSIONS)
    op.execute(
        f"DELETE FROM role_permissions WHERE permission_id IN ("
        f"SELECT id FROM permissions WHERE code IN ({perm_codes_str}))"
    )

    # 2. Delete seeded permissions
    op.execute(f"DELETE FROM permissions WHERE code IN ({perm_codes_str})")

    # 3. Drop RLS policies
    for table in ("holidays", "leave_requests", "leave_types"):
        op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table}")

    # 4. Drop tables
    op.drop_table("holidays")
    op.drop_table("leave_requests")
    op.drop_table("leave_types")
