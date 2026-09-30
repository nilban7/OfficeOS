from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

TaskPriority = Literal["low", "medium", "high", "urgent"]
TaskStatus = Literal["open", "assigned", "in_progress", "blocked", "completed", "cancelled"]


class EmployeeSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_code: str
    first_name: str
    last_name: str
    designation: str | None = None


class DepartmentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str


class BranchSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str


class ProjectSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str


class ClientSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str


class AssetSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    asset_tag: str


# ---------------------------------------------------------------------------
# Task Assignees
# ---------------------------------------------------------------------------


class OperationTaskAssigneeCreate(BaseModel):
    employee_id: UUID
    role: str = Field(default="assignee", max_length=100)


class OperationTaskAssigneeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    task_id: UUID
    employee_id: UUID
    role: str
    assigned_at: datetime
    employee: EmployeeSummary | None = None


# ---------------------------------------------------------------------------
# Checklists
# ---------------------------------------------------------------------------


class OperationChecklistCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    sequence_order: int = Field(default=0, ge=0)
    is_required: bool = False
    notes: str | None = None


class OperationChecklistUpdate(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=200)
    sequence_order: int | None = Field(None, ge=0)
    is_required: bool | None = None
    is_completed: bool | None = None
    notes: str | None = None


class OperationChecklistResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    task_id: UUID
    title: str
    sequence_order: int
    is_required: bool
    is_completed: bool
    completed_by_id: UUID | None = None
    completed_at: datetime | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime
    completed_by: EmployeeSummary | None = None


# ---------------------------------------------------------------------------
# Operation Tasks
# ---------------------------------------------------------------------------


class OperationTaskCreate(BaseModel):
    task_number: str = Field(..., min_length=2, max_length=50)
    title: str = Field(..., min_length=2, max_length=200)
    description: str | None = None
    category: str | None = Field(None, max_length=100)
    priority: TaskPriority = "medium"
    requester_id: UUID | None = None
    assigned_to_id: UUID | None = None
    department_id: UUID | None = None
    branch_id: UUID | None = None
    project_id: UUID | None = None
    client_id: UUID | None = None
    asset_id: UUID | None = None
    due_date: date | None = None
    notes: str | None = None


class OperationTaskUpdate(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=200)
    description: str | None = None
    category: str | None = Field(None, max_length=100)
    priority: TaskPriority | None = None
    status: TaskStatus | None = None
    assigned_to_id: UUID | None = None
    department_id: UUID | None = None
    branch_id: UUID | None = None
    project_id: UUID | None = None
    client_id: UUID | None = None
    asset_id: UUID | None = None
    due_date: date | None = None
    notes: str | None = None


class OperationTaskAssign(BaseModel):
    assigned_to_id: UUID
    notes: str | None = None


class OperationTaskStatusAction(BaseModel):
    notes: str | None = None


class OperationTaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    task_number: str
    title: str
    description: str | None = None
    category: str | None = None
    priority: TaskPriority
    status: TaskStatus
    requester_id: UUID | None = None
    assigned_to_id: UUID | None = None
    department_id: UUID | None = None
    branch_id: UUID | None = None
    project_id: UUID | None = None
    client_id: UUID | None = None
    asset_id: UUID | None = None
    due_date: date | None = None
    completed_at: datetime | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    requester: EmployeeSummary | None = None
    assigned_to: EmployeeSummary | None = None
    department: DepartmentSummary | None = None
    branch: BranchSummary | None = None
    project: ProjectSummary | None = None
    client: ClientSummary | None = None
    asset: AssetSummary | None = None

    checklists_count: int = 0
    completed_checklists_count: int = 0
    assignees_count: int = 0


class OperationTaskDetail(OperationTaskResponse):
    checklists: list[OperationChecklistResponse] = []
    assignees: list[OperationTaskAssigneeResponse] = []


class OperationTaskListResponse(BaseModel):
    items: list[OperationTaskResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
