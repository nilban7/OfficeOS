from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ==========================================
# Project Members
# ==========================================
class ProjectMemberBase(BaseModel):
    employee_id: UUID
    role: Annotated[str | None, Field(default=None, max_length=100, description="Role within project (e.g. Lead Developer)")] = None
    allocation_percentage: Annotated[
        Decimal | None, Field(default=Decimal("100.00"), ge=0, le=100, description="Allocation % (0-100)")
    ] = Decimal("100.00")
    start_date: Annotated[date | None, Field(default=None, description="Member start date on project")] = None
    end_date: Annotated[date | None, Field(default=None, description="Member end date on project")] = None

    @model_validator(mode="after")
    def validate_dates(self) -> "ProjectMemberBase":
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("Member end_date cannot be earlier than start_date")
        return self


class ProjectMemberCreate(ProjectMemberBase):
    pass


class ProjectMemberUpdate(BaseModel):
    role: Annotated[str | None, Field(default=None, max_length=100)] = None
    allocation_percentage: Annotated[Decimal | None, Field(default=None, ge=0, le=100)] = None
    start_date: Annotated[date | None, Field(default=None)] = None
    end_date: Annotated[date | None, Field(default=None)] = None

    @model_validator(mode="after")
    def validate_dates(self) -> "ProjectMemberUpdate":
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("Member end_date cannot be earlier than start_date")
        return self


class ProjectMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    project_id: UUID
    employee_id: UUID
    role: str | None = None
    allocation_percentage: Decimal | None = None
    start_date: date | None = None
    end_date: date | None = None
    created_at: datetime
    updated_at: datetime
    employee_name: str | None = None
    employee_code: str | None = None
    employee_email: str | None = None
    employee_designation: str | None = None


# ==========================================
# Projects
# ==========================================
ProjectStatusType = Literal["planned", "active", "on_hold", "completed", "cancelled"]


class ProjectBase(BaseModel):
    project_code: Annotated[str, Field(min_length=1, max_length=32, description="Unique project code (e.g. PRJ-001)")]
    name: Annotated[str, Field(min_length=1, max_length=200, description="Project name")]
    description: Annotated[str | None, Field(default=None, description="Detailed project description")] = None
    client_id: Annotated[UUID | None, Field(default=None, description="Associated client ID")] = None
    status: Annotated[ProjectStatusType, Field(default="planned", description="Project status")] = "planned"
    start_date: Annotated[date | None, Field(default=None, description="Planned or actual start date")] = None
    end_date: Annotated[date | None, Field(default=None, description="Target or actual completion date")] = None
    budget: Annotated[Decimal | None, Field(default=None, ge=0, description="Project budget amount")] = None
    project_manager_employee_id: Annotated[UUID | None, Field(default=None, description="Project Manager employee ID")] = None

    @field_validator("project_code")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        cleaned = v.strip().upper()
        if not cleaned:
            raise ValueError("Project code cannot be empty")
        return cleaned

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Project name cannot be blank")
        return cleaned

    @model_validator(mode="after")
    def validate_dates(self) -> "ProjectBase":
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("Project end_date cannot be earlier than start_date")
        return self


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    project_code: Annotated[str | None, Field(default=None, min_length=1, max_length=32)] = None
    name: Annotated[str | None, Field(default=None, min_length=1, max_length=200)] = None
    description: Annotated[str | None, Field(default=None)] = None
    client_id: Annotated[UUID | None, Field(default=None)] = None
    status: Annotated[ProjectStatusType | None, Field(default=None)] = None
    start_date: Annotated[date | None, Field(default=None)] = None
    end_date: Annotated[date | None, Field(default=None)] = None
    budget: Annotated[Decimal | None, Field(default=None, ge=0)] = None
    project_manager_employee_id: Annotated[UUID | None, Field(default=None)] = None

    @field_validator("project_code")
    @classmethod
    def normalize_code(cls, v: str | None) -> str | None:
        if v is not None:
            cleaned = v.strip().upper()
            if not cleaned:
                raise ValueError("Project code cannot be empty")
            return cleaned
        return None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is not None:
            cleaned = v.strip()
            if not cleaned:
                raise ValueError("Project name cannot be blank")
            return cleaned
        return None

    @model_validator(mode="after")
    def validate_dates(self) -> "ProjectUpdate":
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("Project end_date cannot be earlier than start_date")
        return self


class ProjectResponse(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    created_at: datetime
    updated_at: datetime
    client_name: str | None = None
    client_code: str | None = None
    project_manager_name: str | None = None
    project_manager_code: str | None = None
    members_count: int = 0


class ProjectDetailResponse(ProjectResponse):
    members: list[ProjectMemberResponse] = []
