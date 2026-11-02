"""client engagement chat messages for project members and clients

Revision ID: 0031_engagement_chat_messages
Revises: 0030_leave_cancellation_request
Create Date: 2026-11-02
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0031_engagement_chat_messages"
down_revision: Union[str, None] = "0030_leave_cancellation_request"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    jsonb = postgresql.JSONB(astext_type=sa.Text())

    op.create_table(
        "engagement_chat_messages",
        sa.Column("id", uuid, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("engagement_id", uuid, sa.ForeignKey("client_engagements.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("project_id", uuid, sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("sender_profile_id", uuid, sa.ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("sender_name", sa.String(255), nullable=False),
        sa.Column("sender_role", sa.String(100), nullable=False),
        sa.Column("sender_type", sa.String(32), server_default="member", nullable=False),
        sa.Column("channel", sa.String(50), server_default="general", nullable=False, index=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("attachments", jsonb, nullable=True),
        sa.Column("proposal_id", uuid, sa.ForeignKey("engagement_proposals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("issue_id", uuid, sa.ForeignKey("engagement_issues.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # Enable RLS
    table = "engagement_chat_messages"
    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    org_setting_uuid = "(NULLIF(current_setting('app.organization_id', true), ''))::uuid"
    user_setting_uuid = "(NULLIF(current_setting('app.user_id', true), ''))::uuid"

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
    table = "engagement_chat_messages"
    op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table}")
    op.drop_table("engagement_chat_messages")

