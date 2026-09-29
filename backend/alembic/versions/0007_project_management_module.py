"""Create projects and project_members tables with RLS and canonical permissions.

Revision ID: 0007_project_management_module
Revises: 0006_client_management_module
Create Date: 2026-09-29
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0007_project_management_module"
down_revision = "0006_client_management_module"
branch_labels = None
depends_on = None

CANONICAL_PERMISSIONS = [
    ("projects.view", "View organization projects and project directory"),
    ("projects.create", "Create new projects"),
    ("projects.update", "Update project details, status, and budget"),
    ("projects.delete", "Archive or delete projects"),
    ("project_members.view", "View project members and allocations"),
    ("project_members.manage", "Add, update, and remove project members"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [
        "projects.view",
        "projects.create",
        "projects.update",
        "projects.delete",
        "project_members.view",
        "project_members.manage",
    ],
    "organization_owner": [
        "projects.view",
        "projects.create",
        "projects.update",
        "projects.delete",
        "project_members.view",
        "project_members.manage",
    ],
    "organization_admin": [
        "projects.view",
        "projects.create",
        "projects.update",
        "projects.delete",
        "project_members.view",
        "project_members.manage",
    ],
    "project_manager": [
        "projects.view",
        "projects.create",
        "projects.update",
        "projects.delete",
        "project_members.view",
        "project_members.manage",
    ],
    "hr_manager": [
        "projects.view",
        "project_members.view",
    ],
    "finance_manager": [
        "projects.view",
        "project_members.view",
    ],
    "department_manager": [
        "projects.view",
        "project_members.view",
    ],
    "employee": [
        "projects.view",
        "project_members.view",
    ],
}


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    # 1. Create projects table
    op.create_table(
        "projects",
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
            sa.ForeignKey("clients.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("project_code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="planned"),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("budget", sa.Numeric(14, 2), nullable=True),
        sa.Column(
            "project_manager_employee_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "project_code", name="uq_projects_organization_code"),
        sa.UniqueConstraint("organization_id", "id", name="uq_projects_org_id"),
        sa.ForeignKeyConstraint(
            ["organization_id", "client_id"],
            ["clients.organization_id", "clients.id"],
            ondelete="SET NULL",
            name="fk_projects_clients_org",
        ),
        sa.CheckConstraint(
            "status IN ('planned', 'active', 'on_hold', 'completed', 'cancelled')",
            name="ck_projects_status",
        ),
        sa.CheckConstraint(
            "end_date IS NULL OR start_date IS NULL OR end_date >= start_date",
            name="ck_projects_dates",
        ),
        sa.CheckConstraint(
            "budget IS NULL OR budget >= 0",
            name="ck_projects_budget",
        ),
    )
    op.execute("CREATE INDEX ix_projects_organization_id ON projects (organization_id)")
    op.execute("CREATE INDEX ix_projects_client_id ON projects (client_id)")
    op.execute("CREATE INDEX ix_projects_pm_id ON projects (project_manager_employee_id)")
    op.execute("CREATE INDEX ix_projects_status ON projects (status)")
    op.execute("CREATE INDEX ix_projects_name ON projects (name)")
    op.execute("CREATE INDEX ix_projects_org_status ON projects (organization_id, status)")

    # 2. Create project_members table
    op.create_table(
        "project_members",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "project_id",
            uuid,
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "employee_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(100), nullable=True),
        sa.Column("allocation_percentage", sa.Numeric(5, 2), nullable=True, server_default="100.00"),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "employee_id", name="uq_project_members_project_employee"),
        sa.ForeignKeyConstraint(
            ["organization_id", "project_id"],
            ["projects.organization_id", "projects.id"],
            ondelete="CASCADE",
            name="fk_project_members_projects_org",
        ),
        sa.CheckConstraint(
            "allocation_percentage IS NULL OR (allocation_percentage >= 0 AND allocation_percentage <= 100)",
            name="ck_project_members_allocation",
        ),
        sa.CheckConstraint(
            "end_date IS NULL OR start_date IS NULL OR end_date >= start_date",
            name="ck_project_members_dates",
        ),
    )
    op.execute("CREATE INDEX ix_project_members_organization_id ON project_members (organization_id)")
    op.execute("CREATE INDEX ix_project_members_project_id ON project_members (project_id)")
    op.execute("CREATE INDEX ix_project_members_employee_id ON project_members (employee_id)")
    op.execute("CREATE INDEX ix_project_members_org_proj ON project_members (organization_id, project_id)")

    # 3. Enable and FORCE Row Level Security on both tables
    for table in ("projects", "project_members"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    org_setting_uuid = "(NULLIF(current_setting('app.organization_id', true), ''))::uuid"
    user_setting_uuid = "(NULLIF(current_setting('app.user_id', true), ''))::uuid"

    for table in ("projects", "project_members"):
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
    for table in ("project_members", "projects"):
        op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table}")

    # 4. Drop tables
    op.drop_table("project_members")
    op.drop_table("projects")
