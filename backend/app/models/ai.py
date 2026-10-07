import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.identity import Organization, Profile


class AIConfiguration(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "ai_configurations"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    is_enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    provider: Mapped[str] = mapped_column(String(50), default="system_gemini", nullable=False)
    model_name: Mapped[str] = mapped_column(String(100), default="gemini-1.5-flash", nullable=False)
    api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    temperature: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=Decimal("0.70"), nullable=False)
    max_tokens_per_response: Mapped[int] = mapped_column(Integer, default=2048, nullable=False)
    allowed_capabilities: Mapped[list[str]] = mapped_column(
        JSONB,
        default=lambda: [
            "workforce",
            "attendance",
            "leave",
            "projects",
            "procurement",
            "assets",
            "maintenance",
            "training",
            "internships",
            "operations",
            "documents",
        ],
        nullable=False,
    )
    daily_request_limit: Mapped[int] = mapped_column(Integer, default=1000, nullable=False)

    organization: Mapped[Organization] = relationship()


class AIConversation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "ai_conversations"
    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_ai_conversations_org_id"),
        ForeignKeyConstraint(
            ["organization_id", "user_id"],
            ["organization_memberships.organization_id", "organization_memberships.profile_id"],
            ondelete="CASCADE",
            name="fk_ai_conversations_org_user",
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), default="New Conversation", nullable=False)
    is_archived: Mapped[bool] = mapped_column(default=False, nullable=False)

    user: Mapped[Profile] = relationship(foreign_keys=[user_id])
    messages: Mapped[list["AIMessage"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="AIMessage.created_at",
        foreign_keys="[AIMessage.conversation_id]",
    )


class AIMessage(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "ai_messages"
    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "conversation_id"],
            ["ai_conversations.organization_id", "ai_conversations.id"],
            ondelete="CASCADE",
            name="fk_ai_messages_org_conv",
        ),
        CheckConstraint("sender_role IN ('user', 'assistant', 'system')", name="ck_ai_messages_sender_role"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False
    )
    sender_role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    capability_used: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, default=dict, nullable=False, server_default="{}"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    conversation: Mapped[AIConversation] = relationship(
        back_populates="messages", foreign_keys=[conversation_id]
    )
