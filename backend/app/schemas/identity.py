from uuid import UUID

from pydantic import BaseModel, ConfigDict


class MeData(BaseModel):
    id: UUID
    email: str | None
    first_name: str | None = None
    last_name: str | None = None


class OrganizationData(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str


class PermissionData(BaseModel):
    code: str


class MembershipOrganizationRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str