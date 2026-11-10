"""employee biometrics storage for multi-device kiosk sync

Revision ID: 0037_employee_biometrics
Revises: 0036_email_outbox
Create Date: 2026-11-10
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0037_employee_biometrics"
down_revision: Union[str, None] = "0036_email_outbox"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS employee_biometrics (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
            employee_code VARCHAR(32) NOT NULL,
            credential_id TEXT NOT NULL,
            raw_id_base64 TEXT,
            finger_label VARCHAR(64) DEFAULT 'Biometric',
            device_model VARCHAR(150),
            enrolled_at TIMESTAMPTZ DEFAULT now() NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
            CONSTRAINT uq_employee_biometrics_org_id UNIQUE (organization_id, id),
            CONSTRAINT uq_employee_biometrics_code UNIQUE (organization_id, employee_code)
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_employee_biometrics_org ON employee_biometrics (organization_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_employee_biometrics_code ON employee_biometrics (organization_id, employee_code);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_employee_biometrics_emp ON employee_biometrics (employee_id);")

    # RLS & Tenant Isolation
    user_context = "current_setting('app.current_user_id', true) IS NOT NULL"
    org_context = "current_setting('app.current_organization_id', true) IS NOT NULL"
    user_setting_uuid = "NULLIF(current_setting('app.current_user_id', true), '')::uuid"
    org_setting_uuid = "NULLIF(current_setting('app.current_organization_id', true), '')::uuid"

    op.execute("ALTER TABLE employee_biometrics ENABLE ROW LEVEL SECURITY;")
    op.execute("DROP POLICY IF EXISTS employee_biometrics_member ON employee_biometrics;")
    op.execute(
        f"CREATE POLICY employee_biometrics_member ON employee_biometrics FOR ALL USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}));"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS employee_biometrics_member ON employee_biometrics;")
    op.execute("DROP TABLE IF EXISTS employee_biometrics CASCADE;")
