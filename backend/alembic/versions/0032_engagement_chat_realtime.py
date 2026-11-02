"""enable supabase realtime replication on engagement_chat_messages

Revision ID: 0032_engagement_chat_realtime
Revises: 0031_engagement_chat_messages
Create Date: 2026-11-02
"""

from typing import Sequence, Union
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0032_engagement_chat_realtime"
down_revision: Union[str, None] = "0031_engagement_chat_messages"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Safely add table to supabase_realtime publication if the publication exists
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_publication_tables 
                    WHERE pubname = 'supabase_realtime' AND tablename = 'engagement_chat_messages'
                ) THEN
                    ALTER PUBLICATION supabase_realtime ADD TABLE engagement_chat_messages;
                END IF;
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
                IF EXISTS (
                    SELECT 1 FROM pg_publication_tables 
                    WHERE pubname = 'supabase_realtime' AND tablename = 'engagement_chat_messages'
                ) THEN
                    ALTER PUBLICATION supabase_realtime DROP TABLE engagement_chat_messages;
                END IF;
            END IF;
        END
        $$;
        """
    )
