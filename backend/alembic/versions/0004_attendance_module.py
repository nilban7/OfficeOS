"""Create attendance_records table, tenant RLS policies, and seed attendance permissions."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0004_attendance_module"
down_revision = "0003_employee_hr_module"
branch_labels = None
depends_on = None

CANONICAL_PERMISSIONS = [
    ("attendance.view", "View organization and personal attendance records"),
    ("attendance.create", "Create attendance records and clock-in entries"),
    ("attendance.update", "Update attendance records, clock-out entries, and statuses"),
    ("attendance.delete", "Delete or void attendance records"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [
        "attendance.view",
        "attendance.create",
        "attendance.update",
        "attendance.delete",
    ],
    "organization_owner": [
        "attendance.view",
        "attendance.create",
        "attendance.update",
        "attendance.delete",
    ],
    "organization_admin": [
        "attendance.view",
        "attendance.create",
        "attendance.update",
        "attendance.delete",
    ],
    "hr_manager": [
        "attendance.view",
        "attendance.create",
        "attendance.update",
        "attendance.delete",
    ],
    "department_manager": [
        "attendance.view",
        "attendance.create",
        "attendance.update",
    ],
    "project_manager": [
        "attendance.view",
        "attendance.create",
        "attendance.update",
    ],
    "finance_manager": [
        "attendance.view",
    ],
    "employee": [
        "attendance.view",
        "attendance.create",
        "attendance.update",
    ],
}


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    # 1. Create attendance_records table
    op.create_table(
        "attendance_records",
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
            "branch_id",
            uuid,
            sa.ForeignKey("branches.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("check_in_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("check_out_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="present"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "employee_id", "work_date", name="uq_attendance_employee_date"),
        sa.CheckConstraint(
            "status IN ('present', 'absent', 'late', 'half_day', 'on_leave')",
            name="ck_attendance_status",
        ),
        sa.CheckConstraint(
            "check_out_at IS NULL OR check_in_at IS NULL OR check_out_at >= check_in_at",
            name="ck_attendance_check_times",
        ),
    )

    op.execute("CREATE INDEX ix_attendance_records_organization_id ON attendance_records (organization_id)")
    op.execute("CREATE INDEX ix_attendance_records_employee_id ON attendance_records (employee_id)")
    op.execute("CREATE INDEX ix_attendance_records_branch_id ON attendance_records (branch_id)")
    op.execute("CREATE INDEX ix_attendance_records_work_date ON attendance_records (work_date)")
    op.execute("CREATE INDEX ix_attendance_records_status ON attendance_records (status)")
    op.execute("CREATE INDEX ix_attendance_records_org_work_date ON attendance_records (organization_id, work_date)")
    op.execute("CREATE INDEX ix_attendance_records_emp_work_date ON attendance_records (employee_id, work_date)")

    # 2. Enable and FORCE RLS on attendance_records
    op.execute("ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE attendance_records FORCE ROW LEVEL SECURITY")

    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    org_setting_uuid = "(NULLIF(current_setting('app.organization_id', true), ''))::uuid"
    user_setting_uuid = "(NULLIF(current_setting('app.user_id', true), ''))::uuid"

    op.execute(
        f"CREATE POLICY attendance_records_member ON attendance_records FOR ALL USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}))"
    )

    # 3. Seed Canonical Permissions
    for code, description in CANONICAL_PERMISSIONS:
        escaped_desc = description.replace("'", "''")
        op.execute(
            f"INSERT INTO permissions (id, code, description) "
            f"VALUES (gen_random_uuid(), '{code}', '{escaped_desc}') "
            f"ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description"
        )

    # 4. Map permissions to roles
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

    # 2. Delete attendance permissions
    op.execute(f"DELETE FROM permissions WHERE code IN ({perm_codes_str})")

    # 3. Drop RLS policy
    op.execute("DROP POLICY IF EXISTS attendance_records_member ON attendance_records")

    # 4. Drop attendance_records table
    op.drop_table("attendance_records")
