from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

NotificationType = Literal[
    "system",
    "task",
    "project",
    "document",
    "leave",
    "attendance",
    "finance",
    "maintenance",
    "training",
    "general",
]


class NotificationCreate(BaseModel):
    recipient_id: UUID
    notification_type: NotificationType = "general"
    title: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1)
    action_url: str | None = Field(None, max_length=500)
    metadata: dict[str, Any] | None = None

    @field_validator("action_url")
    @classmethod
    def validate_action_url(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        if not v.startswith("/") or v.startswith("//") or "\\" in v or ":" in v:
            raise ValueError("action_url must be a relative path starting with a single '/'")
        return v


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    recipient_id: UUID
    notification_type: str
    title: str
    message: str
    action_url: str | None = None
    metadata_json: dict[str, Any] | None = Field(default=None, serialization_alias="metadata")
    read_at: datetime | None = None
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class UnreadCountResponse(BaseModel):
    unread_count: int


class MarkAllReadResponse(BaseModel):
    marked_count: int


class NotificationPreferenceItem(BaseModel):
    notification_type: NotificationType
    in_app_enabled: bool = True
    email_enabled: bool = True


class NotificationPreferenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    recipient_id: UUID
    notification_type: str
    in_app_enabled: bool
    email_enabled: bool
    created_at: datetime
    updated_at: datetime


class NotificationPreferencesUpdate(BaseModel):
    preferences: list[NotificationPreferenceItem]
