"""travel management module

Revision ID: 0027_travel_management_module
Revises: 0026_attendance_location_bio
Create Date: 2026-10-27
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision: str = "0027_travel_management_module"
down_revision: Union[str, None] = "0026_attendance_location_bio"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CANONICAL_PERMISSIONS = [
    ("travel.view", "View travel trips, itineraries, expenses, and travel reports"),
    ("travel.create", "Create planned travel requests, register past travel, and submit expenses"),
    ("travel.update", "Update draft travel requests, itineraries, and draft expenses"),
    ("travel.delete", "Delete draft travel requests and draft expenses"),
    ("travel.approve", "Approve or reject planned travel requests and travel expense claims"),
    ("travel.settle", "Process travel advances, reimbursements, and final financial settlements"),
    ("travel.manage", "Full administrative management of the travel module"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_owner": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "hr_manager": [
        "travel.view",
        "travel.create",
        "travel.update",
        "travel.delete",
        "travel.approve",
        "travel.manage",
    ],
    "finance_manager": [
        "travel.view",
        "travel.approve",
        "travel.settle",
    ],
    "department_manager": [
        "travel.view",
        "travel.create",
        "travel.update",
        "travel.approve",
    ],
    "project_manager": [
        "travel.view",
        "travel.create",
        "travel.update",
    ],
    "employee": [
        "travel.view",
        "travel.create",
        "travel.update",
        "travel.delete",
    ],
}


def upgrade() -> None:
    # 1. travel_trips
    op.create_table(
        "travel_trips",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("trip_number", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("business_purpose", sa.Text(), nullable=False),
        sa.Column("registration_type", sa.String(30), nullable=False, server_default="planned"),
        sa.Column("status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column("settlement_status", sa.String(30), nullable=False, server_default="unsettled"),
        sa.Column(
            "requester_id",
            UUID(as_uuid=True),
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "department_id",
            UUID(as_uuid=True),
            sa.ForeignKey("departments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "client_id",
            UUID(as_uuid=True),
            sa.ForeignKey("clients.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "project_id",
            UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("origin", sa.String(255), nullable=False),
        sa.Column("destination", sa.String(255), nullable=False),
        sa.Column("planned_start_date", sa.Date(), nullable=True),
        sa.Column("planned_end_date", sa.Date(), nullable=True),
        sa.Column("actual_start_date", sa.Date(), nullable=True),
        sa.Column("actual_end_date", sa.Date(), nullable=True),
        sa.Column("preferred_transport_mode", sa.String(50), nullable=True),
        sa.Column("actual_transport_mode", sa.String(50), nullable=True),
        sa.Column("estimated_budget", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("currency", sa.String(10), nullable=False, server_default="USD"),
        sa.Column("advance_requested", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("advance_approved", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("advance_paid", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("advance_status", sa.String(30), nullable=False, server_default="none"),
        sa.Column("advance_payment_reference", sa.String(100), nullable=True),
        sa.Column("advance_paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accommodation_notes", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("missing_info_explanation", sa.Text(), nullable=True),
        sa.Column(
            "approver_id",
            UUID(as_uuid=True),
            sa.ForeignKey("employees.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approver_comment", sa.Text(), nullable=True),
        sa.Column(
            "created_by_profile_id",
            UUID(as_uuid=True),
            sa.ForeignKey("profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "id", name="uq_travel_trips_org_id"),
        sa.UniqueConstraint("organization_id", "trip_number", name="uq_travel_trips_org_trip_num"),
        sa.CheckConstraint(
            "registration_type IN ('planned', 'past')",
            name="ck_travel_trips_reg_type",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'pending_approval', 'approved', 'rejected', 'booked', 'ongoing', 'completed', 'cancelled')",
            name="ck_travel_trips_status",
        ),
        sa.CheckConstraint(
            "settlement_status IN ('unsettled', 'pending', 'partially_settled', 'settled')",
            name="ck_travel_trips_settlement_status",
        ),
        sa.CheckConstraint(
            "advance_status IN ('none', 'requested', 'approved', 'rejected', 'paid')",
            name="ck_travel_trips_advance_status",
        ),
    )
    op.execute("CREATE INDEX ix_travel_trips_org_id ON travel_trips (organization_id)")
    op.execute("CREATE INDEX ix_travel_trips_trip_number ON travel_trips (trip_number)")
    op.execute("CREATE INDEX ix_travel_trips_requester_id ON travel_trips (requester_id)")
    op.execute("CREATE INDEX ix_travel_trips_status ON travel_trips (status)")
    op.execute("CREATE INDEX ix_travel_trips_settlement_status ON travel_trips (settlement_status)")
    op.execute("CREATE INDEX ix_travel_trips_reg_type ON travel_trips (registration_type)")

    # 2. travel_members
    op.create_table(
        "travel_members",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "trip_id",
            UUID(as_uuid=True),
            sa.ForeignKey("travel_trips.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "employee_id",
            UUID(as_uuid=True),
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("trip_role", sa.String(50), nullable=False, server_default="participant"),
        sa.Column("participation_status", sa.String(30), nullable=False, server_default="confirmed"),
        sa.Column("individual_departure_date", sa.Date(), nullable=True),
        sa.Column("individual_return_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("trip_id", "employee_id", name="uq_travel_members_trip_emp"),
        sa.UniqueConstraint("organization_id", "id", name="uq_travel_members_org_id"),
    )
    op.execute("CREATE INDEX ix_travel_members_trip_id ON travel_members (trip_id)")
    op.execute("CREATE INDEX ix_travel_members_employee_id ON travel_members (employee_id)")
    op.execute("CREATE INDEX ix_travel_members_org_id ON travel_members (organization_id)")

    # 3. travel_itineraries
    op.create_table(
        "travel_itineraries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "trip_id",
            UUID(as_uuid=True),
            sa.ForeignKey("travel_trips.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "member_id",
            UUID(as_uuid=True),
            sa.ForeignKey("travel_members.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("type", sa.String(50), nullable=False, server_default="flight"),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("departure_location", sa.String(255), nullable=True),
        sa.Column("arrival_location", sa.String(255), nullable=True),
        sa.Column("departure_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("arrival_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("booking_reference", sa.String(100), nullable=True),
        sa.Column("provider_name", sa.String(150), nullable=True),
        sa.Column("booking_status", sa.String(30), nullable=False, server_default="confirmed"),
        sa.Column("estimated_cost", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("attachment_url", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "id", name="uq_travel_itineraries_org_id"),
    )
    op.execute("CREATE INDEX ix_travel_itineraries_trip_id ON travel_itineraries (trip_id)")
    op.execute("CREATE INDEX ix_travel_itineraries_org_id ON travel_itineraries (organization_id)")

    # 4. travel_expenses
    op.create_table(
        "travel_expenses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "trip_id",
            UUID(as_uuid=True),
            sa.ForeignKey("travel_trips.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "employee_id",
            UUID(as_uuid=True),
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("category", sa.String(50), nullable=False, server_default="miscellaneous"),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("currency", sa.String(10), nullable=False, server_default="USD"),
        sa.Column("receipt_url", sa.String(500), nullable=True),
        sa.Column("receipt_file_name", sa.String(255), nullable=True),
        sa.Column("payment_method", sa.String(50), nullable=False, server_default="employee_paid"),
        sa.Column("is_reimbursable", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column(
            "reviewer_id",
            UUID(as_uuid=True),
            sa.ForeignKey("employees.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewer_comment", sa.Text(), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payment_reference", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "id", name="uq_travel_expenses_org_id"),
        sa.CheckConstraint("amount >= 0", name="ck_travel_expenses_amount_non_negative"),
        sa.CheckConstraint(
            "status IN ('draft', 'submitted', 'approved', 'rejected', 'paid', 'cancelled')",
            name="ck_travel_expenses_status",
        ),
    )
    op.execute("CREATE INDEX ix_travel_expenses_trip_id ON travel_expenses (trip_id)")
    op.execute("CREATE INDEX ix_travel_expenses_employee_id ON travel_expenses (employee_id)")
    op.execute("CREATE INDEX ix_travel_expenses_status ON travel_expenses (status)")
    op.execute("CREATE INDEX ix_travel_expenses_org_id ON travel_expenses (organization_id)")

    # 5. travel_settlements
    op.create_table(
        "travel_settlements",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "trip_id",
            UUID(as_uuid=True),
            sa.ForeignKey("travel_trips.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "employee_id",
            UUID(as_uuid=True),
            sa.ForeignKey("employees.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("settlement_type", sa.String(50), nullable=False, server_default="final_balance"),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("currency", sa.String(10), nullable=False, server_default="USD"),
        sa.Column("status", sa.String(30), nullable=False, server_default="completed"),
        sa.Column("payment_date", sa.Date(), nullable=True),
        sa.Column("payment_reference", sa.String(100), nullable=True),
        sa.Column("payment_method", sa.String(50), nullable=True),
        sa.Column(
            "settled_by_profile_id",
            UUID(as_uuid=True),
            sa.ForeignKey("profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "id", name="uq_travel_settlements_org_id"),
        sa.CheckConstraint(
            "status IN ('pending', 'completed', 'cancelled')",
            name="ck_travel_settlements_status",
        ),
    )
    op.execute("CREATE INDEX ix_travel_settlements_trip_id ON travel_settlements (trip_id)")
    op.execute("CREATE INDEX ix_travel_settlements_org_id ON travel_settlements (organization_id)")

    # 6. travel_activity_logs
    op.create_table(
        "travel_activity_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "trip_id",
            UUID(as_uuid=True),
            sa.ForeignKey("travel_trips.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "actor_id",
            UUID(as_uuid=True),
            sa.ForeignKey("profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("details", JSONB, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "id", name="uq_travel_activity_logs_org_id"),
    )
    op.execute("CREATE INDEX ix_travel_activity_logs_trip_id ON travel_activity_logs (trip_id)")
    op.execute("CREATE INDEX ix_travel_activity_logs_org_id ON travel_activity_logs (organization_id)")

    # 7. Enable RLS on all travel tables
    travel_tables = [
        "travel_trips",
        "travel_members",
        "travel_itineraries",
        "travel_expenses",
        "travel_settlements",
        "travel_activity_logs",
    ]

    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    org_setting_uuid = "(NULLIF(current_setting('app.organization_id', true), ''))::uuid"
    user_setting_uuid = "(NULLIF(current_setting('app.user_id', true), ''))::uuid"

    for table in travel_tables:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY {table}_member ON {table} FOR ALL USING ("
            f"{user_context} AND {org_context} "
            f"AND organization_id = {org_setting_uuid} "
            f"AND public.is_org_member(organization_id, {user_setting_uuid}))"
        )

    # 8. Seed permissions
    for code, description in CANONICAL_PERMISSIONS:
        escaped_desc = description.replace("'", "''")
        op.execute(
            f"INSERT INTO permissions (id, code, description) "
            f"VALUES (gen_random_uuid(), '{code}', '{escaped_desc}') "
            f"ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description"
        )

    # 9. Map permissions to roles
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

    travel_tables = [
        "travel_activity_logs",
        "travel_settlements",
        "travel_expenses",
        "travel_itineraries",
        "travel_members",
        "travel_trips",
    ]

    for table in travel_tables:
        op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table}")
        op.drop_table(table)
