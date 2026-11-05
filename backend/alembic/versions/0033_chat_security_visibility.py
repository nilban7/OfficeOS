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
revision: str = "0033_chat_security_visibility"
down_revision: Union[str, None] = "0032_engagement_chat_realtime"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add client_msg_id for idempotency and duplicate prevention during retries
    op.execute(
        sa.text("ALTER TABLE engagement_chat_messages ADD COLUMN IF NOT EXISTS client_msg_id UUID;")
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_engagement_chat_messages_client_msg_id ON engagement_chat_messages (client_msg_id);"
        )
    )

    # Add visibility for backend-enforced internal vs client message separation
    op.execute(
        sa.text(
            "ALTER TABLE engagement_chat_messages ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'client' NOT NULL;"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_engagement_chat_messages_visibility ON engagement_chat_messages (visibility);"
        )
    )

    # Add compound performance index for full-history queries ordered by created_at
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_engagement_chat_messages_org_eng_created ON engagement_chat_messages (organization_id, engagement_id, created_at);"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_engagement_chat_messages_org_eng_created;"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_engagement_chat_messages_visibility;"))
    op.execute(sa.text("ALTER TABLE engagement_chat_messages DROP COLUMN IF EXISTS visibility;"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_engagement_chat_messages_client_msg_id;"))
    op.execute(sa.text("ALTER TABLE engagement_chat_messages DROP COLUMN IF EXISTS client_msg_id;"))
