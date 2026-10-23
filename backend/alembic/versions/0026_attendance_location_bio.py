"""attendance location and biometrics

Revision ID: 0026_attendance_location_bio
Revises: 0025_bonus_management_module
Create Date: 2026-10-23
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic. (max 32 chars)
revision: str = "0026_attendance_location_bio"
down_revision: Union[str, None] = "0025_bonus_management_module"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("attendance_records", sa.Column("latitude", sa.Numeric(10, 7), nullable=True))
    op.add_column("attendance_records", sa.Column("longitude", sa.Numeric(10, 7), nullable=True))
    op.add_column("attendance_records", sa.Column("location_name", sa.String(255), nullable=True))
    op.add_column("attendance_records", sa.Column("location_accuracy", sa.Numeric(8, 2), nullable=True))
    op.add_column(
        "attendance_records",
        sa.Column(
            "verification_method",
            sa.String(32),
            nullable=False,
            server_default="web",
        ),
    )
    op.add_column("attendance_records", sa.Column("check_out_latitude", sa.Numeric(10, 7), nullable=True))
    op.add_column("attendance_records", sa.Column("check_out_longitude", sa.Numeric(10, 7), nullable=True))
    op.add_column("attendance_records", sa.Column("check_out_location_name", sa.String(255), nullable=True))
    op.add_column("attendance_records", sa.Column("device_info", sa.String(255), nullable=True))

    op.create_index(
        "ix_attendance_records_verification_method",
        "attendance_records",
        ["verification_method"],
    )


def downgrade() -> None:
    op.drop_index("ix_attendance_records_verification_method", table_name="attendance_records")
    op.drop_column("attendance_records", "device_info")
    op.drop_column("attendance_records", "check_out_location_name")
    op.drop_column("attendance_records", "check_out_longitude")
    op.drop_column("attendance_records", "check_out_latitude")
    op.drop_column("attendance_records", "verification_method")
    op.drop_column("attendance_records", "location_accuracy")
    op.drop_column("attendance_records", "location_name")
    op.drop_column("attendance_records", "longitude")
    op.drop_column("attendance_records", "latitude")
