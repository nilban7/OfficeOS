"""email outbox table for reliable asynchronous notifications

Revision ID: 0035_email_outbox
Revises: 0034_internship_docs_stipends
Create Date: 2026-11-05
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0035_email_outbox"
down_revision: Union[str, None] = "0034_internship_docs_stipends"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS email_outbox (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            recipient_email VARCHAR(320) NOT NULL,
            recipient_name VARCHAR(255),
            subject VARCHAR(255) NOT NULL,
            body_text TEXT,
            body_html TEXT NOT NULL,
            email_type VARCHAR(64) NOT NULL,
            related_entity_type VARCHAR(64),
            related_entity_id UUID,
            status VARCHAR(32) DEFAULT 'PENDING' NOT NULL,
            retry_count INT DEFAULT 0 NOT NULL,
            max_retries INT DEFAULT 3 NOT NULL,
            error_details TEXT,
            sent_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
            CONSTRAINT uq_email_outbox_org_id UNIQUE (organization_id, id),
            CONSTRAINT ck_email_outbox_status CHECK (status IN ('PENDING', 'SENT', 'FAILED'))
        )
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_email_outbox_org_status ON email_outbox (organization_id, status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_email_outbox_recipient ON email_outbox (recipient_email)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_email_outbox_related_entity ON email_outbox (related_entity_type, related_entity_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_email_outbox_email_type ON email_outbox (email_type)")

    # Enable Row Level Security and add tenant isolation policy
    op.execute("ALTER TABLE email_outbox ENABLE ROW LEVEL SECURITY")
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies WHERE tablename = 'email_outbox' AND policyname = 'email_outbox_tenant_isolation'
            ) THEN
                CREATE POLICY email_outbox_tenant_isolation ON email_outbox
                    USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
            END IF;
        END
        $$;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS email_outbox CASCADE")
