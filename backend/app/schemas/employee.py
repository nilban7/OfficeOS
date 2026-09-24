from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

# --- Department Schemas ---


class DepartmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    code: str
    description: str | None = None
    manager_id: UUID | None = None
    manager_name: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class DepartmentCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=160)
    code: str = Field(..., min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    description: str | None = Field(None, max_length=1000)
    manager_id: UUID | None = None
    is_active: bool = True

    @model_validator(mode="after")
    def uppercase_code(self) -> "DepartmentCreate":
        if self.code:
            self.code = self.code.upper()
        return self


class DepartmentUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=160)
    code: str | None = Field(None, min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    description: str | None = Field(None, max_length=1000)
    manager_id: UUID | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def uppercase_code(self) -> "DepartmentUpdate":
        if self.code:
            self.code = self.code.upper()
        return self


# --- Helper Reference Schemas ---


class DepartmentBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str


class BranchBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str


class ManagerBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_code: str
    first_name: str
    last_name: str
    designation: str


class ManagerOptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_code: str
    first_name: str
    last_name: str
    designation: str
    department_name: str | None = None
    branch_name: str | None = None


# --- Employee Schemas ---


class EmployeeListItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    employee_code: str
    first_name: str
    last_name: str
    designation: str
    employment_type: str
    status: str
    date_of_joining: date
    date_of_exit: date | None = None
    department_id: UUID | None = None
    department: DepartmentBrief | None = None
    branch_id: UUID | None = None
    branch: BranchBrief | None = None
    reporting_manager_id: UUID | None = None
    reporting_manager: ManagerBrief | None = None
    work_email: str | None = None
    phone_number: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class EmployeeDetailResponse(EmployeeListItemResponse):
    personal_email: str | None = None
    current_address: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_relationship: str | None = None
    emergency_contact_phone: str | None = None
    profile_id: UUID | None = None
    membership_id: UUID | None = None
    direct_reports: list[ManagerBrief] = Field(default_factory=list)


class EmployeeCreate(BaseModel):
    employee_code: str = Field(..., min_length=2, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    designation: str = Field(..., min_length=1, max_length=120)
    employment_type: str = Field("full_time", pattern=r"^(full_time|part_time|contract|intern)$")
    status: str = Field("active", pattern=r"^(active|probation|notice_period|on_leave|suspended|terminated)$")
    date_of_joining: date
    date_of_exit: date | None = None
    department_id: UUID | None = None
    branch_id: UUID | None = None
    reporting_manager_id: UUID | None = None
    profile_id: UUID | None = None
    membership_id: UUID | None = None
    work_email: str | None = Field(None, max_length=320)
    personal_email: str | None = Field(None, max_length=320)
    phone_number: str | None = Field(None, max_length=32)
    current_address: str | None = Field(None, max_length=1000)
    emergency_contact_name: str | None = Field(None, max_length=100)
    emergency_contact_relationship: str | None = Field(None, max_length=50)
    emergency_contact_phone: str | None = Field(None, max_length=32)
    is_active: bool = True

    @model_validator(mode="after")
    def validate_dates_and_code(self) -> "EmployeeCreate":
        if self.employee_code:
            self.employee_code = self.employee_code.upper()
        if (
            self.date_of_exit is not None
            and self.date_of_joining is not None
            and self.date_of_exit < self.date_of_joining
        ):
            raise ValueError("date_of_exit cannot precede date_of_joining")
        return self


class EmployeeUpdate(BaseModel):
    employee_code: str | None = Field(None, min_length=2, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    first_name: str | None = Field(None, min_length=1, max_length=100)
    last_name: str | None = Field(None, min_length=1, max_length=100)
    designation: str | None = Field(None, min_length=1, max_length=120)
    employment_type: str | None = Field(None, pattern=r"^(full_time|part_time|contract|intern)$")
    status: str | None = Field(None, pattern=r"^(active|probation|notice_period|on_leave|suspended|terminated)$")
    date_of_joining: date | None = None
    date_of_exit: date | None = None
    department_id: UUID | None = None
    branch_id: UUID | None = None
    reporting_manager_id: UUID | None = None
    profile_id: UUID | None = None
    membership_id: UUID | None = None
    work_email: str | None = Field(None, max_length=320)
    personal_email: str | None = Field(None, max_length=320)
    phone_number: str | None = Field(None, max_length=32)
    current_address: str | None = Field(None, max_length=1000)
    emergency_contact_name: str | None = Field(None, max_length=100)
    emergency_contact_relationship: str | None = Field(None, max_length=50)
    emergency_contact_phone: str | None = Field(None, max_length=32)
    is_active: bool | None = None

    @model_validator(mode="after")
    def validate_dates_and_code(self) -> "EmployeeUpdate":
        if self.employee_code:
            self.employee_code = self.employee_code.upper()
        if (
            self.date_of_exit is not None
            and self.date_of_joining is not None
            and self.date_of_exit < self.date_of_joining
        ):
            raise ValueError("date_of_exit cannot precede date_of_joining")
        return self
