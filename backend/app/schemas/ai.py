from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AIConfigurationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    is_enabled: bool
    provider: str
    model_name: str
    temperature: Decimal
    max_tokens_per_response: int
    allowed_capabilities: list[str]
    daily_request_limit: int
    api_key: str | None = None
    created_at: datetime
    updated_at: datetime


class AIConfigurationUpdate(BaseModel):
    is_enabled: bool | None = None
    provider: str | None = Field(None, max_length=50)
    model_name: str | None = Field(None, max_length=100)
    api_key: str | None = Field(None, max_length=256)
    temperature: Decimal | None = Field(None, ge=Decimal("0.0"), le=Decimal("2.0"))
    max_tokens_per_response: int | None = Field(None, ge=128, le=8192)
    allowed_capabilities: list[str] | None = None
    daily_request_limit: int | None = Field(None, ge=10, le=100000)


class AIMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    conversation_id: UUID
    sender_role: str
    content: str
    capability_used: str | None = None
    tokens_used: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict, alias="metadata_json")
    created_at: datetime


class AIConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    user_id: UUID
    title: str
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    last_message: str | None = None


class AIConversationDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    user_id: UUID
    title: str
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    messages: list[AIMessageResponse] = []


class AIConversationCreate(BaseModel):
    title: str = Field(default="New Conversation", min_length=1, max_length=255)
    initial_message: str | None = Field(default=None, max_length=4000)


class AIMessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)


class AIQueryRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)
    capability: str | None = Field(default=None, max_length=50)


class AIQueryResponse(BaseModel):
    response: str
    capability_used: str | None = None
    tokens_used: int = 0
    data_context_summary: dict[str, Any] | None = None
