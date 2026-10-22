"""Client Engagements RLS Policies

Revision ID: 0023_client_engagements_rls
Revises: 0022_client_engagements_module
Create Date: 2026-10-22
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0023_client_engagements_rls"
down_revision: str | None = "0022_client_engagements_module"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

TABLES = (
    "client_engagements",
    "engagement_proposals",
    "engagement_agreements",
    "agreement_signatures",
    "engagement_weekly_reports",
    "engagement_uat_sessions",
    "engagement_uat_test_cases",
    "engagement_issues",
    "engagement_change_requests",
    "engagement_handovers",
)


def upgrade() -> None:
    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    org_setting_uuid = "(NULLIF(current_setting('app.organization_id', true), ''))::uuid"
    user_setting_uuid = "(NULLIF(current_setting('app.user_id', true), ''))::uuid"

    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table}")
        op.execute(
            f"CREATE POLICY {table}_member ON {table} FOR ALL USING ("
            f"{user_context} AND {org_context} "
            f"AND organization_id = {org_setting_uuid} "
            f"AND public.is_org_member(organization_id, {user_setting_uuid}))"
        )


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table}")
