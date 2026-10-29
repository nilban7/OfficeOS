"""leave cancellation request support

Revision ID: 0030_leave_cancellation_request
Revises: 0029_offsite_attendance_approval
Create Date: 2026-10-29
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0030_leave_cancellation_request"
down_revision: Union[str, None] = "0029_offsite_attendance_approval"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    # 1. Add cancellation tracking columns to leave_requests
    op.add_column("leave_requests", sa.Column("cancellation_reason", sa.Text(), nullable=True))
    op.add_column("leave_requests", sa.Column("cancellation_requested_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "leave_requests",
        sa.Column(
            "cancellation_reviewed_by",
            uuid,
            sa.ForeignKey("profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("leave_requests", sa.Column("cancellation_reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("leave_requests", sa.Column("cancellation_reviewer_comment", sa.Text(), nullable=True))

    # 2. Update status check constraint to include 'cancellation_requested'
    op.drop_constraint("ck_leave_requests_status", "leave_requests", type_="check")
    op.create_check_constraint(
        "ck_leave_requests_status",
        "leave_requests",
        "status IN ('pending', 'approved', 'rejected', 'cancelled', 'cancellation_requested')",
    )


def downgrade() -> None:
    # 1. Revert check constraint
    op.drop_constraint("ck_leave_requests_status", "leave_requests", type_="check")
    op.create_check_constraint(
        "ck_leave_requests_status",
        "leave_requests",
        "status IN ('pending', 'approved', 'rejected', 'cancelled')",
    )

    # 2. Drop columns
    op.drop_column("leave_requests", "cancellation_reviewer_comment")
    op.drop_column("leave_requests", "cancellation_reviewed_at")
    op.drop_column("leave_requests", "cancellation_reviewed_by")
    op.drop_column("leave_requests", "cancellation_requested_at")
    op.drop_column("leave_requests", "cancellation_reason")

