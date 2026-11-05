"""engagement chat security, visibility, idempotency, and compound indexes

Revision ID: 0033_engagement_chat_security_visibility
Revises: 0032_engagement_chat_realtime
Create Date: 2026-11-03
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0033_engagement_chat_security_visibility"
down_revision: Union[str, None] = "0032_engagement_chat_realtime"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    # Add client_msg_id for idempotency and duplicate prevention during retries
    op.add_column(
        "engagement_chat_messages",
        sa.Column("client_msg_id", uuid, nullable=True),
    )
    op.create_index(
        "ix_engagement_chat_messages_client_msg_id",
        "engagement_chat_messages",
        ["client_msg_id"],
        unique=False,
    )

    # Add visibility for backend-enforced internal vs client message separation
    op.add_column(
        "engagement_chat_messages",
        sa.Column("visibility", sa.String(20), server_default="client", nullable=False),
    )
    op.create_index(
        "ix_engagement_chat_messages_visibility",
        "engagement_chat_messages",
        ["visibility"],
        unique=False,
    )

    # Add compound performance index for full-history queries ordered by created_at
    op.create_index(
        "ix_engagement_chat_messages_org_eng_created",
        "engagement_chat_messages",
        ["organization_id", "engagement_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_engagement_chat_messages_org_eng_created", table_name="engagement_chat_messages")
    op.drop_index("ix_engagement_chat_messages_visibility", table_name="engagement_chat_messages")
    op.drop_column("engagement_chat_messages", "visibility")
    op.drop_index("ix_engagement_chat_messages_client_msg_id", table_name="engagement_chat_messages")
    op.drop_column("engagement_chat_messages", "client_msg_id")
