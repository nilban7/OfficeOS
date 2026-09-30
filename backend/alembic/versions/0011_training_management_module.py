"""Create training_programs, training_sessions, and training_enrollments tables with RLS and canonical permissions.

Revision ID: 0011_training_management_module
Revises: 0010_maintenance_module
Create Date: 2026-09-29
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0011_training_management_module"
down_revision = "0010_maintenance_module"
branch_labels = None
depends_on = None

CANONICAL_PERMISSIONS = [
    ("training.view", "View organization training programs, sessions, and enrollments"),
    ("training.create", "Create training programs and sessions"),
    ("training.update", "Edit training programs and sessions"),
    ("training.delete", "Delete or cancel training programs and sessions"),
    ("training.enroll", "Enroll employees in training programs and sessions"),
    ("training.manage", "Manage training operations, schedules, and attendance"),
    ("training.complete", "Mark training enrollments as completed and record certificates"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [
        "training.view",
        "training.create",
        "training.update",
        "training.delete",
        "training.enroll",
        "training.manage",
        "training.complete",
    ],
    "organization_owner": [
        "training.view",
        "training.create",
        "training.update",
        "training.delete",
        "training.enroll",
        "training.manage",
        "training.complete",
    ],
    "organization_admin": [
        "training.view",
        "training.create",
        "training.update",
        "training.delete",
        "training.enroll",
        "training.manage",
        "training.complete",
    ],
    "hr_manager": [
        "training.view",
        "training.create",
        "training.update",
        "training.delete",
        "training.enroll",
        "training.manage",
        "training.complete",
    ],
    "department_manager": [
        "training.view",
        "training.enroll",
        "training.manage",
        "training.complete",
    ],
    "project_manager": [
        "training.view",
        "training.enroll",
    ],
    "employee": [
        "training.view",
        "training.enroll",
    ],
}


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    # 1. Create training_programs table
    op.create_table(
        "training_programs",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("provider", sa.String(200), nullable=True),
        sa.Column("trainer", sa.String(200), nullable=True),
        sa.Column(
            "delivery_mode",
            sa.String(50),
            nullable=False,
            server_default="in_person",
        ),
        sa.Column("duration_hours", sa.Numeric(6, 2), nullable=False, server_default="0.00"),
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column(
            "status",
            sa.String(30),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "code", name="uq_training_programs_org_code"),
        sa.UniqueConstraint("organization_id", "id", name="uq_training_programs_org_id"),
        sa.CheckConstraint(
            "delivery_mode IN ('in_person', 'online', 'hybrid', 'self_paced')",
            name="ck_training_programs_delivery_mode",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'published', 'completed', 'cancelled')",
            name="ck_training_programs_status",
        ),
        sa.CheckConstraint(
            "duration_hours >= 0",
            name="ck_training_programs_duration",
        ),
        sa.CheckConstraint(
            "capacity >= 0",
            name="ck_training_programs_capacity",
        ),
        sa.CheckConstraint(
            "cost >= 0",
            name="ck_training_programs_cost",
        ),
        sa.CheckConstraint(
            "end_date IS NULL OR start_date IS NULL OR end_date >= start_date",
            name="ck_training_programs_dates",
        ),
    )
    op.execute("CREATE INDEX ix_training_programs_organization_id ON training_programs (organization_id)")
    op.execute("CREATE INDEX ix_training_programs_code ON training_programs (code)")
    op.execute("CREATE INDEX ix_training_programs_status ON training_programs (status)")
    op.execute("CREATE INDEX ix_training_programs_category ON training_programs (category)")
    op.execute("CREATE INDEX ix_training_programs_org_status ON training_programs (organization_id, status)")

    # 2. Create training_sessions table
    op.create_table(
        "training_sessions",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "training_program_id",
            uuid,
            sa.ForeignKey("training_programs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("session_number", sa.String(50), nullable=False),
        sa.Column("title", sa.String(200), nullable=True),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.String(20), nullable=True),
        sa.Column("end_time", sa.String(20), nullable=True),
        sa.Column("location", sa.String(255), nullable=True),
        sa.Column("trainer", sa.String(200), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(30),
            nullable=False,
            server_default="scheduled",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "session_number", name="uq_training_sessions_org_number"),
        sa.UniqueConstraint("organization_id", "id", name="uq_training_sessions_org_id"),
        sa.ForeignKeyConstraint(
            ["organization_id", "training_program_id"],
            ["training_programs.organization_id", "training_programs.id"],
            ondelete="CASCADE",
            name="fk_training_sessions_program_org",
        ),
        sa.CheckConstraint(
            "status IN ('scheduled', 'in_progress', 'completed', 'cancelled')",
            name="ck_training_sessions_status",
        ),
        sa.CheckConstraint(
            "capacity >= 0",
            name="ck_training_sessions_capacity",
        ),
    )
    op.execute("CREATE INDEX ix_training_sessions_organization_id ON training_sessions (organization_id)")
    op.execute("CREATE INDEX ix_training_sessions_program_id ON training_sessions (training_program_id)")
    op.execute("CREATE INDEX ix_training_sessions_session_number ON training_sessions (session_number)")
    op.execute("CREATE INDEX ix_training_sessions_session_date ON training_sessions (session_date)")
    op.execute("CREATE INDEX ix_training_sessions_status ON training_sessions (status)")
    op.execute("CREATE INDEX ix_training_sessions_org_status ON training_sessions (organization_id, status)")
    op.execute("CREATE INDEX ix_training_sessions_org_program ON training_sessions (organization_id, training_program_id)")

    # 3. Create training_enrollments table
    op.create_table(
        "training_enrollments",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "training_program_id",
            uuid,
            sa.ForeignKey("training_programs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "training_session_id",
            uuid,
            sa.ForeignKey("training_sessions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "employee_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("enrollment_date", sa.Date(), nullable=False),
        sa.Column(
            "status",
            sa.String(30),
            nullable=False,
            server_default="enrolled",
        ),
        sa.Column("completion_date", sa.Date(), nullable=True),
        sa.Column("score", sa.Numeric(5, 2), nullable=True),
        sa.Column("result", sa.String(30), nullable=True),
        sa.Column("certificate_number", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "id", name="uq_training_enrollments_org_id"),
        sa.ForeignKeyConstraint(
            ["organization_id", "training_program_id"],
            ["training_programs.organization_id", "training_programs.id"],
            ondelete="CASCADE",
            name="fk_training_enrollments_program_org",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id", "training_session_id"],
            ["training_sessions.organization_id", "training_sessions.id"],
            ondelete="SET NULL",
            name="fk_training_enrollments_session_org",
        ),
        sa.CheckConstraint(
            "status IN ('enrolled', 'attended', 'completed', 'cancelled', 'no_show')",
            name="ck_training_enrollments_status",
        ),
        sa.CheckConstraint(
            "result IS NULL OR result IN ('passed', 'failed', 'attended')",
            name="ck_training_enrollments_result",
        ),
        sa.CheckConstraint(
            "score IS NULL OR (score >= 0 AND score <= 100)",
            name="ck_training_enrollments_score",
        ),
    )
    op.execute("CREATE INDEX ix_training_enrollments_organization_id ON training_enrollments (organization_id)")
    op.execute("CREATE INDEX ix_training_enrollments_program_id ON training_enrollments (training_program_id)")
    op.execute("CREATE INDEX ix_training_enrollments_session_id ON training_enrollments (training_session_id)")
    op.execute("CREATE INDEX ix_training_enrollments_employee_id ON training_enrollments (employee_id)")
    op.execute("CREATE INDEX ix_training_enrollments_status ON training_enrollments (status)")
    op.execute("CREATE INDEX ix_training_enrollments_org_status ON training_enrollments (organization_id, status)")
    op.execute("CREATE INDEX ix_training_enrollments_org_employee ON training_enrollments (organization_id, employee_id)")
    op.execute(
        "CREATE UNIQUE INDEX uq_training_enrollment_active_emp_prog "
        "ON training_enrollments (organization_id, training_program_id, employee_id) "
        "WHERE status <> 'cancelled'"
    )

    # 4. Enable and FORCE Row Level Security on all 3 tables
    training_tables = ("training_programs", "training_sessions", "training_enrollments")
    for table in training_tables:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    org_setting_uuid = "(NULLIF(current_setting('app.organization_id', true), ''))::uuid"
    user_setting_uuid = "(NULLIF(current_setting('app.user_id', true), ''))::uuid"

    for table in training_tables:
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
    training_tables = ("training_enrollments", "training_sessions", "training_programs")
    for table in training_tables:
        op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table}")

    # 4. Drop tables in reverse order
    for table in training_tables:
        op.drop_table(table)
