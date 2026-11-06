"""kiosk attendance module with device pairing, secret activation codes, and multi-modal punch telemetry

Revision ID: 0035_kiosk_attendance_module
Revises: 0034_internship_docs_stipends
Create Date: 2026-11-06
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0035_kiosk_attendance_module"
down_revision: Union[str, None] = "0034_internship_docs_stipends"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. kiosk_devices table
    op.execute("""
        CREATE TABLE IF NOT EXISTS kiosk_devices (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
            device_name VARCHAR(150) NOT NULL,
            device_identifier VARCHAR(255) NOT NULL,
            is_activated BOOLEAN NOT NULL DEFAULT FALSE,
            activated_at TIMESTAMPTZ,
            device_token_hash VARCHAR(255),
            exit_pin_hash VARCHAR(255),
            allowed_ip_range VARCHAR(255),
            verification_modes JSONB NOT NULL DEFAULT '{"face_camera": true, "fingerprint": true, "pin": true, "qr_badge": true}',
            ip_tracking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            last_known_ip VARCHAR(64),
            battery_level INTEGER,
            app_version VARCHAR(32),
            last_heartbeat_at TIMESTAMPTZ,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
            CONSTRAINT uq_kiosk_device_org_id UNIQUE (organization_id, id),
            CONSTRAINT uq_kiosk_device_identifier UNIQUE (organization_id, device_identifier)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_kiosk_devices_org ON kiosk_devices (organization_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_kiosk_devices_branch ON kiosk_devices (branch_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_kiosk_devices_status ON kiosk_devices (is_active, is_activated)")

    # 2. kiosk_activation_codes table
    op.execute("""
        CREATE TABLE IF NOT EXISTS kiosk_activation_codes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
            code_hash VARCHAR(255) NOT NULL,
            code_preview VARCHAR(32) NOT NULL,
            created_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            is_used BOOLEAN NOT NULL DEFAULT FALSE,
            used_at TIMESTAMPTZ,
            used_by_device_id UUID REFERENCES kiosk_devices(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
            CONSTRAINT uq_kiosk_activation_codes_org_id UNIQUE (organization_id, id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_kiosk_codes_org ON kiosk_activation_codes (organization_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_kiosk_codes_hash ON kiosk_activation_codes (code_hash)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_kiosk_codes_status ON kiosk_activation_codes (is_used, expires_at)")

    # 3. Add kiosk and biometric snapshot columns to attendance_records
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance_records' AND column_name='kiosk_device_id') THEN
                ALTER TABLE attendance_records ADD COLUMN kiosk_device_id UUID REFERENCES kiosk_devices(id) ON DELETE SET NULL;
                CREATE INDEX ix_attendance_records_kiosk_device ON attendance_records (kiosk_device_id);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance_records' AND column_name='face_snapshot_url') THEN
                ALTER TABLE attendance_records ADD COLUMN face_snapshot_url TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance_records' AND column_name='client_ip') THEN
                ALTER TABLE attendance_records ADD COLUMN client_ip VARCHAR(64);
            END IF;
        END $$;
    """)

    # 4. RLS & Tenant Isolation
    tables = ("kiosk_devices", "kiosk_activation_codes")
    user_context = "current_setting('app.current_user_id', true) IS NOT NULL"
    org_context = "current_setting('app.current_organization_id', true) IS NOT NULL"
    user_setting_uuid = "NULLIF(current_setting('app.current_user_id', true), '')::uuid"
    org_setting_uuid = "NULLIF(current_setting('app.current_organization_id', true), '')::uuid"

    for table in tables:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table};")
        op.execute(
            f"CREATE POLICY {table}_member ON {table} FOR ALL USING ("
            f"{user_context} AND {org_context} "
            f"AND organization_id = {org_setting_uuid} "
            f"AND public.is_org_member(organization_id, {user_setting_uuid}));"
        )


def downgrade() -> None:
    tables = ("kiosk_activation_codes", "kiosk_devices")
    for table in tables:
        op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table};")
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE;")

    op.execute("ALTER TABLE attendance_records DROP COLUMN IF EXISTS client_ip;")
    op.execute("ALTER TABLE attendance_records DROP COLUMN IF EXISTS face_snapshot_url;")
    op.execute("ALTER TABLE attendance_records DROP COLUMN IF EXISTS kiosk_device_id;")
