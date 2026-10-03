from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PlatformConfigurationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    platform_name: str
    support_email: str | None = None
    maintenance_mode: bool
    allowed_signup_domains: list[str]
    max_organizations: int
    created_at: datetime
    updated_at: datetime


class PlatformConfigurationUpdate(BaseModel):
    platform_name: str | None = Field(default=None, max_length=100)
    support_email: str | None = Field(default=None, max_length=255)
    maintenance_mode: bool | None = None
    allowed_signup_domains: list[str] | None = None
    max_organizations: int | None = Field(default=None, ge=1, le=100000)


class PlatformAnnouncementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    content: str
    severity: str
    is_active: bool
    target_type: str
    target_org_ids: list[str]
    created_by_id: UUID | None = None
    starts_at: datetime
    ends_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class PlatformAnnouncementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1)
    severity: str = Field(default="info", pattern="^(info|warning|critical)$")
    is_active: bool = True
    target_type: str = Field(default="all", pattern="^(all|specific_orgs)$")
    target_org_ids: list[str] = Field(default_factory=list)
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class PlatformAnnouncementUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = Field(default=None, min_length=1)
    severity: str | None = Field(default=None, pattern="^(info|warning|critical)$")
    is_active: bool | None = None
    target_type: str | None = Field(default=None, pattern="^(all|specific_orgs)$")
    target_org_ids: list[str] | None = None
    ends_at: datetime | None = None


class OrganizationDirectoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    status: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    branch_count: int = 0
    member_count: int = 0
    employee_count: int = 0
    suspension_reason: str | None = None
    suspended_at: datetime | None = None


class OrganizationDirectoryResponse(BaseModel):
    items: list[OrganizationDirectoryItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class OrganizationDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    status: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    suspension_reason: str | None = None
    suspended_at: datetime | None = None
    timezone: str = "UTC"
    currency: str = "USD"
    branch_count: int = 0
    member_count: int = 0
    employee_count: int = 0
    project_count: int = 0


class OrganizationSuspendRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class PlatformMemberItem(BaseModel):
    membership_id: UUID
    profile_id: UUID
    auth_user_id: UUID
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    organization_id: UUID
    organization_name: str
    status: str
    roles: list[str] = Field(default_factory=list)
    created_at: datetime


class PlatformMembersResponse(BaseModel):
    items: list[PlatformMemberItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class PlatformUsageResponse(BaseModel):
    total_organizations: int
    active_organizations: int
    suspended_organizations: int
    total_members: int
    total_employees: int
    total_projects: int
    total_clients: int
    total_assets: int
    total_documents: int
    organization_breakdown: list[dict[str, Any]] = Field(default_factory=list)


class PlatformHealthResponse(BaseModel):
    status: str
    database_connected: bool
    database_latency_ms: float
    migration_head: str
    app_version: str
    environment: str = "production"
    active_organizations: int


class PlatformOverviewResponse(BaseModel):
    total_organizations: int
    active_organizations: int
    suspended_organizations: int
    total_users: int
    total_employees: int
    recent_organizations: list[OrganizationDirectoryItem] = Field(default_factory=list)
    system_status: str = "healthy"
