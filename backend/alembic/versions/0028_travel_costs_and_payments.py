"""travel costs and payments enhancement

Revision ID: 0028_travel_costs_and_payments
Revises: 0027_travel_management_module
Create Date: 2026-10-27
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "0028_travel_costs_and_payments"
down_revision: Union[str, None] = "0027_travel_management_module"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add cost breakdown & payer columns to travel_trips
    op.add_column(
        "travel_trips",
        sa.Column("est_travel_transport", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
    )
    op.add_column(
        "travel_trips",
        sa.Column("act_travel_transport", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
    )
    op.add_column(
        "travel_trips",
        sa.Column("est_hotel_accommodation", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
    )
    op.add_column(
        "travel_trips",
        sa.Column("act_hotel_accommodation", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
    )
    op.add_column(
        "travel_trips",
        sa.Column("est_food_meals", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
    )
    op.add_column(
        "travel_trips",
        sa.Column("act_food_meals", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
    )
    op.add_column(
        "travel_trips",
        sa.Column("est_local_transport", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
    )
    op.add_column(
        "travel_trips",
        sa.Column("act_local_transport", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
    )
    op.add_column(
        "travel_trips",
        sa.Column("est_other_expenses", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
    )
    op.add_column(
        "travel_trips",
        sa.Column("act_other_expenses", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
    )
    op.add_column(
        "travel_trips",
        sa.Column("estimated_total", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
    )
    op.add_column(
        "travel_trips",
        sa.Column("actual_total", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
    )
    op.add_column(
        "travel_trips",
        sa.Column("cost_difference", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
    )
    op.add_column(
        "travel_trips",
        sa.Column("payer_type", sa.String(30), nullable=False, server_default="company"),
    )
    op.add_column(
        "travel_trips",
        sa.Column("company_paid_amount", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
    )
    op.add_column(
        "travel_trips",
        sa.Column("employee_paid_amount", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
    )

    # 2. Create travel_payments table for multiple payment entries
    op.create_table(
        "travel_payments",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "trip_id",
            UUID(as_uuid=True),
            sa.ForeignKey("travel_trips.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("payer_type", sa.String(30), nullable=False, server_default="company"),
        sa.Column("payer_name", sa.String(150), nullable=True),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("currency", sa.String(10), nullable=False, server_default="USD"),
        sa.Column("payment_method", sa.String(50), nullable=False, server_default="corporate_card"),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column("transaction_reference", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("organization_id", "id", name="uq_travel_payments_org_id"),
    )

    # Enable and force Row Level Security
    op.execute("ALTER TABLE travel_payments ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE travel_payments FORCE ROW LEVEL SECURITY;")

    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies
                WHERE tablename = 'travel_payments' AND policyname = 'travel_payments_tenant_isolation'
            ) THEN
                CREATE POLICY travel_payments_tenant_isolation ON travel_payments
                AS RESTRICTIVE
                USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
                WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS travel_payments_tenant_isolation ON travel_payments;")
    op.drop_table("travel_payments")

    op.drop_column("travel_trips", "employee_paid_amount")
    op.drop_column("travel_trips", "company_paid_amount")
    op.drop_column("travel_trips", "payer_type")
    op.drop_column("travel_trips", "cost_difference")
    op.drop_column("travel_trips", "actual_total")
    op.drop_column("travel_trips", "estimated_total")
    op.drop_column("travel_trips", "act_other_expenses")
    op.drop_column("travel_trips", "est_other_expenses")
    op.drop_column("travel_trips", "act_local_transport")
    op.drop_column("travel_trips", "est_local_transport")
    op.drop_column("travel_trips", "act_food_meals")
    op.drop_column("travel_trips", "est_food_meals")
    op.drop_column("travel_trips", "act_hotel_accommodation")
    op.drop_column("travel_trips", "est_hotel_accommodation")
    op.drop_column("travel_trips", "act_travel_transport")
    op.drop_column("travel_trips", "est_travel_transport")
