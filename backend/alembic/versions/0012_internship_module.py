import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = '0012_internship_module'
down_revision: Union[str, None] = '0011_training_management_module'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CANONICAL_PERMISSIONS = [
    ("internships.view", "View internships"),
    ("internships.create", "Create internships"),
    ("internships.update", "Update internships"),
    ("internships.delete", "Delete internships"),
    ("internships.manage", "Manage internship statuses and supervisors"),
    ("internships.review", "Review and evaluate interns"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_owner": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "hr_manager": [p[0] for p in CANONICAL_PERMISSIONS],
    "department_manager": ["internships.view", "internships.manage", "internships.review"],
    "project_manager": ["internships.view"],
    "employee": ["internships.view"],
}

def upgrade() -> None:
    # 1. Create internships table
    op.create_table(
        "internships",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", sa.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", sa.UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("department_id", sa.UUID(as_uuid=True), sa.ForeignKey("departments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("supervisor_id", sa.UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="SET NULL"), nullable=True),
        sa.Column("intern_name", sa.String(200), nullable=False),
        sa.Column("intern_email", sa.String(255), nullable=True),
        sa.Column("institution", sa.String(255), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="planned"),
        sa.Column("stipend", sa.Numeric(14, 2), nullable=True, server_default="0.00"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "code", name="uq_internships_org_code"),
        sa.UniqueConstraint("organization_id", "id", name="uq_internships_org_id"),
        sa.CheckConstraint("status IN ('planned','active','completed','extended','terminated','cancelled')", name="ck_internships_status"),
        sa.CheckConstraint("end_date >= start_date", name="ck_internships_dates")
    )
    op.execute("CREATE INDEX ix_internships_organization_id ON internships (organization_id)")

    # 2. Create internship_supervisors table
    op.create_table(
        "internship_supervisors",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", sa.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("internship_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_id", sa.UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(100), nullable=True, server_default="supervisor"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "id", name="uq_internship_supervisors_org_id"),
        sa.UniqueConstraint("organization_id", "internship_id", "employee_id", name="uq_internship_supervisor"),
        sa.ForeignKeyConstraint(
            ["organization_id", "internship_id"],
            ["internships.organization_id", "internships.id"],
            ondelete="CASCADE",
            name="fk_internship_supervisors_internship_org",
        )
    )
    op.execute("CREATE INDEX ix_internship_supervisors_organization_id ON internship_supervisors (organization_id)")

    # 3. Create internship_reviews table
    op.create_table(
        "internship_reviews",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", sa.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("internship_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("reviewer_id", sa.UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="SET NULL"), nullable=True),
        sa.Column("review_date", sa.Date(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "id", name="uq_internship_reviews_org_id"),
        sa.ForeignKeyConstraint(
            ["organization_id", "internship_id"],
            ["internships.organization_id", "internships.id"],
            ondelete="CASCADE",
            name="fk_internship_reviews_internship_org",
        ),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_internship_reviews_rating"),
        sa.CheckConstraint("status IN ('draft','submitted','acknowledged')", name="ck_internship_reviews_status")
    )
    op.execute("CREATE INDEX ix_internship_reviews_organization_id ON internship_reviews (organization_id)")

    # 4. RLS
    tables = ("internships", "internship_supervisors", "internship_reviews")
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

    # 5. Permissions
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

    tables = ("internship_reviews", "internship_supervisors", "internships")
    for table in tables:
        op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table}")
        op.drop_table(table)
