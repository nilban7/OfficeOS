from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class OrganizationProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class OrganizationProfileUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=160)


class OrganizationSettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    timezone: str
    currency: str
    created_at: datetime
    updated_at: datetime


class OrganizationSettingsUpdate(BaseModel):
    timezone: str | None = Field(None, min_length=1, max_length=64)
    currency: str | None = Field(None, min_length=3, max_length=3)


class BranchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    code: str
    address: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class BranchCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=160)
    code: str = Field(..., min_length=1, max_length=32)
    address: str | None = Field(None, max_length=500)
    is_active: bool = True


class BranchUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=160)
    code: str | None = Field(None, min_length=1, max_length=32)
    address: str | None = Field(None, max_length=500)
    is_active: bool | None = None


class RoleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID | None = None
    name: str
    description: str | None = None
    is_system: bool


class MemberProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None


class MemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    profile_id: UUID
    status: str
    profile: MemberProfile
    roles: list[RoleResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class MemberAddRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    role_ids: list[UUID] = Field(default_factory=list)
    status: str = Field("active", pattern="^(active|invited|suspended)$")


class MemberUpdateRequest(BaseModel):
    role_ids: list[UUID] | None = None
    status: str | None = Field(None, pattern="^(active|invited|suspended)$")


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    actor_id: UUID | None = None
    actor_email: str | None = None
    action: str
    entity_type: str
    entity_id: UUID | None = None
    details: dict[str, Any] | None = None
    ip_address: str | None = None
    created_at: datetime
