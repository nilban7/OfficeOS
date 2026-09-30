"""Create operation_tasks, operation_checklists, and operation_task_assignees tables with RLS and canonical permissions.

Revision ID: 0013_operations_module
Revises: 0012_internship_module
Create Date: 2026-09-29
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0013_operations_module"
down_revision: Union[str, None] = "0012_internship_module"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CANONICAL_PERMISSIONS = [
    ("operations.view", "View operation tasks and checklists"),
    ("operations.create", "Create operation tasks and checklists"),
    ("operations.update", "Edit operation tasks and checklists"),
    ("operations.delete", "Delete operation tasks and checklists"),
    ("operations.assign", "Assign employees to operation tasks"),
    ("operations.complete", "Complete operation tasks and checklist items"),
    ("operations.manage", "Manage operations lifecycle and configuration"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_owner": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "hr_manager": [
        "operations.view",
        "operations.create",
        "operations.update",
        "operations.assign",
        "operations.complete",
    ],
    "department_manager": [
        "operations.view",
        "operations.create",
        "operations.update",
        "operations.assign",
        "operations.complete",
    ],
    "project_manager": [
        "operations.view",
        "operations.create",
        "operations.update",
        "operations.assign",
        "operations.complete",
    ],
    "employee": [
        "operations.view",
        "operations.complete",
    ],
}


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    # 1. Create operation_tasks table
    op.create_table(
        "operation_tasks",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("task_number", sa.String(50), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column(
            "priority",
            sa.String(30),
            nullable=False,
            server_default="medium",
        ),
        sa.Column(
            "status",
            sa.String(30),
            nullable=False,
            server_default="open",
        ),
        sa.Column(
            "requester_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "assigned_to_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="SET NULL"),
            nullable=True,
        ),
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
            "project_id",
            uuid,
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "client_id",
            uuid,
            sa.ForeignKey("clients.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "asset_id",
            uuid,
            sa.ForeignKey("assets.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
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
        sa.UniqueConstraint("organization_id", "task_number", name="uq_operation_tasks_org_number"),
        sa.UniqueConstraint("organization_id", "id", name="uq_operation_tasks_org_id"),
        sa.CheckConstraint(
            "priority IN ('low', 'medium', 'high', 'urgent')",
            name="ck_operation_tasks_priority",
        ),
        sa.CheckConstraint(
            "status IN ('open', 'assigned', 'in_progress', 'blocked', 'completed', 'cancelled')",
            name="ck_operation_tasks_status",
        ),
    )
    op.execute("CREATE INDEX ix_operation_tasks_organization_id ON operation_tasks (organization_id)")
    op.execute("CREATE INDEX ix_operation_tasks_task_number ON operation_tasks (task_number)")
    op.execute("CREATE INDEX ix_operation_tasks_status ON operation_tasks (status)")
    op.execute("CREATE INDEX ix_operation_tasks_priority ON operation_tasks (priority)")
    op.execute("CREATE INDEX ix_operation_tasks_category ON operation_tasks (category)")
    op.execute("CREATE INDEX ix_operation_tasks_assigned_to_id ON operation_tasks (assigned_to_id)")
    op.execute("CREATE INDEX ix_operation_tasks_requester_id ON operation_tasks (requester_id)")
    op.execute("CREATE INDEX ix_operation_tasks_department_id ON operation_tasks (department_id)")
    op.execute("CREATE INDEX ix_operation_tasks_branch_id ON operation_tasks (branch_id)")
    op.execute("CREATE INDEX ix_operation_tasks_project_id ON operation_tasks (project_id)")
    op.execute("CREATE INDEX ix_operation_tasks_client_id ON operation_tasks (client_id)")
    op.execute("CREATE INDEX ix_operation_tasks_asset_id ON operation_tasks (asset_id)")
    op.execute("CREATE INDEX ix_operation_tasks_org_status ON operation_tasks (organization_id, status)")

    # 2. Create operation_checklists table
    op.create_table(
        "operation_checklists",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("task_id", uuid, nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("sequence_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_completed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "completed_by_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
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
        sa.UniqueConstraint("organization_id", "id", name="uq_operation_checklists_org_id"),
        sa.ForeignKeyConstraint(
            ["organization_id", "task_id"],
            ["operation_tasks.organization_id", "operation_tasks.id"],
            ondelete="CASCADE",
            name="fk_operation_checklists_task_org",
        ),
    )
    op.execute("CREATE INDEX ix_operation_checklists_organization_id ON operation_checklists (organization_id)")
    op.execute("CREATE INDEX ix_operation_checklists_task_id ON operation_checklists (task_id)")

    # 3. Create operation_task_assignees table
    op.create_table(
        "operation_task_assignees",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("task_id", uuid, nullable=False),
        sa.Column(
            "employee_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(100), nullable=False, server_default="assignee"),
        sa.Column(
            "assigned_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("organization_id", "id", name="uq_operation_task_assignees_org_id"),
        sa.UniqueConstraint(
            "organization_id", "task_id", "employee_id",
            name="uq_operation_task_assignee",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id", "task_id"],
            ["operation_tasks.organization_id", "operation_tasks.id"],
            ondelete="CASCADE",
            name="fk_operation_task_assignees_task_org",
        ),
    )
    op.execute("CREATE INDEX ix_operation_task_assignees_organization_id ON operation_task_assignees (organization_id)")
    op.execute("CREATE INDEX ix_operation_task_assignees_task_id ON operation_task_assignees (task_id)")
    op.execute("CREATE INDEX ix_operation_task_assignees_employee_id ON operation_task_assignees (employee_id)")

    # 4. Enable and FORCE Row Level Security on all 3 tables
    tables = ("operation_tasks", "operation_checklists", "operation_task_assignees")
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

    tables = ("operation_task_assignees", "operation_checklists", "operation_tasks")
    for table in tables:
        op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table}")
        op.drop_table(table)
