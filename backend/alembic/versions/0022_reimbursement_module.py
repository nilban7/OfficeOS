import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision: str = "0022_reimbursement_module"
down_revision: Union[str, None] = "0021_payroll_and_salary_module"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CANONICAL_PERMISSIONS = [
    ("reimbursements.view", "View employee reimbursement claims"),
    ("reimbursements.create", "Submit reimbursement claims"),
    ("reimbursements.update", "Update draft reimbursement claims"),
    ("reimbursements.delete", "Delete draft reimbursement claims"),
    ("reimbursements.approve", "Approve or reject submitted reimbursement claims"),
    ("reimbursements.pay", "Mark approved reimbursement claims as paid"),
    ("reimbursements.manage", "Full administrative management of reimbursements"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_owner": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "hr_manager": [
        "reimbursements.view",
        "reimbursements.create",
        "reimbursements.update",
        "reimbursements.approve",
        "reimbursements.manage",
    ],
    "finance_manager": [
        "reimbursements.view",
        "reimbursements.approve",
        "reimbursements.pay",
    ],
    "department_manager": [
        "reimbursements.view",
        "reimbursements.create",
        "reimbursements.approve",
    ],
    "project_manager": [
        "reimbursements.view",
        "reimbursements.create",
    ],
    "employee": [
        "reimbursements.view",
        "reimbursements.create",
        "reimbursements.update",
        "reimbursements.delete",
    ],
}


def upgrade() -> None:
    # 1. Create reimbursement_claims table
    op.create_table(
        "reimbursement_claims",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "employee_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("claim_number", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("category", sa.String(50), nullable=False, server_default="other"),
        sa.Column("claim_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("currency", sa.String(10), nullable=False, server_default="USD"),
        sa.Column("status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column("receipt_url", sa.String(500), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("items", JSONB, nullable=False, server_default="[]"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "reviewer_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("employees.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewer_comment", sa.Text(), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payment_reference", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "id", name="uq_reimbursement_claims_org_id"),
        sa.UniqueConstraint("organization_id", "claim_number", name="uq_reimbursement_claims_org_num"),
        sa.CheckConstraint("amount >= 0", name="ck_reimbursement_claims_amount_non_negative"),
        sa.CheckConstraint(
            "status IN ('draft', 'submitted', 'approved', 'rejected', 'paid', 'cancelled')",
            name="ck_reimbursement_claims_status",
        ),
    )
    op.execute("CREATE INDEX ix_reimbursement_claims_organization_id ON reimbursement_claims (organization_id)")
    op.execute("CREATE INDEX ix_reimbursement_claims_employee_id ON reimbursement_claims (employee_id)")
    op.execute("CREATE INDEX ix_reimbursement_claims_status ON reimbursement_claims (status)")
    op.execute("CREATE INDEX ix_reimbursement_claims_claim_date ON reimbursement_claims (claim_date)")
    op.execute("CREATE INDEX ix_reimbursement_claims_category ON reimbursement_claims (category)")

    # 2. Enable Row Level Security (RLS)
    table = "reimbursement_claims"
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    org_setting_uuid = "(NULLIF(current_setting('app.organization_id', true), ''))::uuid"
    user_setting_uuid = "(NULLIF(current_setting('app.user_id', true), ''))::uuid"

    op.execute(
        f"CREATE POLICY {table}_member ON {table} FOR ALL USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}))"
    )

    # 3. Seed Permissions
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
    perm_codes_str = ", ".join(f"'{code}'" for code, _ in CANONICAL_PERMISSIONS)
    op.execute(
        f"DELETE FROM role_permissions WHERE permission_id IN ("
        f"SELECT id FROM permissions WHERE code IN ({perm_codes_str}))"
    )
    op.execute(f"DELETE FROM permissions WHERE code IN ({perm_codes_str})")

    table = "reimbursement_claims"
    op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table}")
    op.drop_table(table)
