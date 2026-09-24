"""Create departments and employees tables, tenant RLS policies, and seed HR permissions."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0003_employee_hr_module"
down_revision = "0002_organization_audit_logs"
branch_labels = None
depends_on = None

CANONICAL_PERMISSIONS = [
    ("departments.view", "View organization departments"),
    ("departments.manage", "Create, update, and deactivate organization departments"),
    ("employees.view", "View employee directory and public profiles"),
    ("employees.create", "Create new employee records"),
    ("employees.update", "Update employee information and status"),
    ("employees.delete", "Soft-deactivate or terminate employee records"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [
        "departments.view",
        "departments.manage",
        "employees.view",
        "employees.create",
        "employees.update",
        "employees.delete",
    ],
    "organization_owner": [
        "departments.view",
        "departments.manage",
        "employees.view",
        "employees.create",
        "employees.update",
        "employees.delete",
    ],
    "organization_admin": [
        "departments.view",
        "departments.manage",
        "employees.view",
        "employees.create",
        "employees.update",
        "employees.delete",
    ],
    "hr_manager": [
        "departments.view",
        "departments.manage",
        "employees.view",
        "employees.create",
        "employees.update",
        "employees.delete",
    ],
    "department_manager": [
        "departments.view",
        "employees.view",
    ],
    "project_manager": [
        "departments.view",
        "employees.view",
    ],
    "finance_manager": [
        "departments.view",
        "employees.view",
    ],
    "employee": [
        "departments.view",
        "employees.view",
    ],
}


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    # 1. Create departments table (manager_id FK added after employees table exists)
    op.create_table(
        "departments",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("manager_id", uuid, nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "code", name="uq_departments_organization_code"),
    )
    op.execute("CREATE INDEX ix_departments_organization_id ON departments (organization_id)")
    op.execute("CREATE INDEX ix_departments_manager_id ON departments (manager_id)")
    op.execute("CREATE INDEX ix_departments_is_active ON departments (is_active)")

    # 2. Create employees table
    op.create_table(
        "employees",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("employee_code", sa.String(32), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("designation", sa.String(120), nullable=False),
        sa.Column("employment_type", sa.String(32), nullable=False, server_default="full_time"),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("date_of_joining", sa.Date(), nullable=False),
        sa.Column("date_of_exit", sa.Date(), nullable=True),
        sa.Column(
            "department_id",
            uuid,
            sa.ForeignKey("departments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "branch_id",
            uuid,
            sa.ForeignKey("branches.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "reporting_manager_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "profile_id",
            uuid,
            sa.ForeignKey("profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "membership_id",
            uuid,
            sa.ForeignKey("organization_memberships.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("work_email", sa.String(320), nullable=True),
        sa.Column("personal_email", sa.String(320), nullable=True),
        sa.Column("phone_number", sa.String(32), nullable=True),
        sa.Column("current_address", sa.Text(), nullable=True),
        sa.Column("emergency_contact_name", sa.String(100), nullable=True),
        sa.Column("emergency_contact_relationship", sa.String(50), nullable=True),
        sa.Column("emergency_contact_phone", sa.String(32), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "employee_code", name="uq_employees_organization_code"),
        sa.CheckConstraint("date_of_exit IS NULL OR date_of_exit >= date_of_joining", name="ck_employees_dates"),
        sa.CheckConstraint(
            "employment_type IN ('full_time', 'part_time', 'contract', 'intern')",
            name="ck_employees_employment_type",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'probation', 'notice_period', 'on_leave', 'suspended', 'terminated')",
            name="ck_employees_status",
        ),
    )
    op.execute("CREATE INDEX ix_employees_organization_id ON employees (organization_id)")
    op.execute("CREATE INDEX ix_employees_department_id ON employees (department_id)")
    op.execute("CREATE INDEX ix_employees_branch_id ON employees (branch_id)")
    op.execute("CREATE INDEX ix_employees_reporting_manager_id ON employees (reporting_manager_id)")
    op.execute("CREATE INDEX ix_employees_profile_id ON employees (profile_id)")
    op.execute("CREATE INDEX ix_employees_membership_id ON employees (membership_id)")
    op.execute("CREATE INDEX ix_employees_status ON employees (status)")
    op.execute("CREATE INDEX ix_employees_is_active ON employees (is_active)")

    # 3. Add foreign key for departments.manager_id -> employees.id
    op.create_foreign_key(
        "fk_departments_manager_id_employees",
        "departments",
        "employees",
        ["manager_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # 4. Enable and FORCE RLS on departments and employees
    for table in ("departments", "employees"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    org_setting_uuid = "(NULLIF(current_setting('app.organization_id', true), ''))::uuid"
    user_setting_uuid = "(NULLIF(current_setting('app.user_id', true), ''))::uuid"

    op.execute(
        f"CREATE POLICY departments_member ON departments FOR ALL USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}))"
    )

    op.execute(
        f"CREATE POLICY employees_member ON employees FOR ALL USING ("
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

    # 2. Delete department permissions (pre-existing employee permissions are preserved)
    op.execute("DELETE FROM permissions WHERE code IN ('departments.view', 'departments.manage')")

    # 3. Drop RLS policies
    op.execute("DROP POLICY IF EXISTS employees_member ON employees")
    op.execute("DROP POLICY IF EXISTS departments_member ON departments")

    # 4. Drop foreign key and tables
    op.drop_constraint("fk_departments_manager_id_employees", "departments", type_="foreignkey")
    op.drop_table("employees")
    op.drop_table("departments")
