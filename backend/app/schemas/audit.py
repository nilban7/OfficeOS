from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

SENSITIVE_FIELD_NAMES = {
    "password",
    "password_hash",
    "access_token",
    "refresh_token",
    "token",
    "secret",
    "api_key",
    "jwt",
    "authorization",
    "service_role",
    "credentials",
    "private_key",
}


def sanitize_sensitive_data(val: Any) -> Any:
    """Recursively sanitize sensitive values in dictionaries and lists."""
    if isinstance(val, dict):
        sanitized = {}
        for k, v in val.items():
            if any(sensitive in k.lower() for sensitive in SENSITIVE_FIELD_NAMES):
                sanitized[k] = "***REDACTED***"
            else:
                sanitized[k] = sanitize_sensitive_data(v)
        return sanitized
    if isinstance(val, list):
        return [sanitize_sensitive_data(item) for item in val]
    return val


class ActorSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    actor_id: UUID | None = None
    actor: ActorSummary | None = None
    actor_email: str | None = None
    action: str
    entity_type: str
    entity_id: UUID | None = None
    details: dict[str, Any] | None = Field(default_factory=dict)
    ip_address: str | None = None
    created_at: datetime


class AuditLogDetail(AuditLogResponse):
    pass
