from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AutomationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    description: str | None = None
    is_active: bool
    trigger_type: str
    trigger_config: dict[str, Any]
    action_type: str
    action_config: dict[str, Any]
    created_by_id: UUID
    last_run_at: datetime | None = None
    last_run_status: str | None = None
    next_run_at: datetime | None = None
    run_count: int = 0
    created_at: datetime
    updated_at: datetime


class AutomationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    trigger_type: str = Field(..., pattern="^(event|schedule|manual)$")
    trigger_config: dict[str, Any] = Field(default_factory=dict)
    action_type: str = Field(..., pattern="^(notification|audit_log|task_create)$")
    action_config: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True


class AutomationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    trigger_type: str | None = Field(default=None, pattern="^(event|schedule|manual)$")
    trigger_config: dict[str, Any] | None = None
    action_type: str | None = Field(default=None, pattern="^(notification|audit_log|task_create)$")
    action_config: dict[str, Any] | None = None
    is_active: bool | None = None


class AutomationExecutionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    automation_id: UUID
    triggered_by_id: UUID | None = None
    trigger_source: str
    status: str
    execution_payload: dict[str, Any]
    result_summary: str | None = None
    error_message: str | None = None
    duration_ms: int = 0
    created_at: datetime


class AutomationExecuteRequest(BaseModel):
    input_payload: dict[str, Any] = Field(default_factory=dict)
