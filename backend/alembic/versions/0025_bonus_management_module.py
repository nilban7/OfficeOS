import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision: str = "0025_bonus_management_module"
down_revision: Union[str, None] = "0024_reimbursement_module"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create bonuses table
    op.create_table(
        "bonuses",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("bonus_type", sa.String(30), nullable=False, server_default="bulk"),
        sa.Column("calculation_type", sa.String(30), nullable=False, server_default="fixed"),
        sa.Column("calculation_base", sa.String(50), nullable=True, server_default="base_salary"),
        sa.Column("rate_or_amount", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("period_month", sa.Integer(), nullable=False),
        sa.Column("period_year", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column("total_amount", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("employee_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "project_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("project_reference", sa.String(100), nullable=True),
        sa.Column(
            "target_department_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("departments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_by",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "approved_by",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "rejected_by",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "cancelled_by",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "id", name="uq_bonuses_org_id"),
        sa.CheckConstraint("rate_or_amount >= 0", name="ck_bonuses_rate_or_amount"),
        sa.CheckConstraint("total_amount >= 0", name="ck_bonuses_total_amount"),
        sa.CheckConstraint("period_month BETWEEN 1 AND 12", name="ck_bonuses_period_month"),
        sa.CheckConstraint("period_year >= 2020", name="ck_bonuses_period_year"),
        sa.CheckConstraint(
            "status IN ('draft', 'pending_approval', 'approved', 'included_in_payroll', 'paid', 'rejected', 'cancelled')",
            name="ck_bonuses_status",
        ),
    )
    op.execute("CREATE INDEX ix_bonuses_organization_id ON bonuses (organization_id)")
    op.execute("CREATE INDEX ix_bonuses_period ON bonuses (period_year, period_month)")
    op.execute("CREATE INDEX ix_bonuses_project_id ON bonuses (project_id)")

    # 2. Create bonus_allocations table
    op.create_table(
        "bonus_allocations",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "bonus_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("bonuses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "employee_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("percentage_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("calculation_base_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column(
            "payroll_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("payrolls.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "payslip_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("payslips.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("period_month", sa.Integer(), nullable=False),
        sa.Column("period_year", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "id", name="uq_bonus_allocations_org_id"),
        sa.UniqueConstraint("organization_id", "bonus_id", "employee_id", name="uq_bonus_allocations_org_bonus_emp"),
        sa.CheckConstraint("amount >= 0", name="ck_bonus_allocations_amount"),
        sa.CheckConstraint(
            "status IN ('draft', 'pending_approval', 'approved', 'included_in_payroll', 'paid', 'rejected', 'cancelled')",
            name="ck_bonus_allocations_status",
        ),
    )
    op.execute("CREATE INDEX ix_bonus_allocations_organization_id ON bonus_allocations (organization_id)")
    op.execute("CREATE INDEX ix_bonus_allocations_bonus_id ON bonus_allocations (bonus_id)")
    op.execute("CREATE INDEX ix_bonus_allocations_employee_id ON bonus_allocations (employee_id)")
    op.execute("CREATE INDEX ix_bonus_allocations_payroll_id ON bonus_allocations (payroll_id)")

    # 3. Enable Row Level Security (RLS)
    tables = ("bonuses", "bonus_allocations")
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


def downgrade() -> None:
    tables = ("bonus_allocations", "bonuses")
    for table in tables:
        op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table}")
        op.drop_table(table)
