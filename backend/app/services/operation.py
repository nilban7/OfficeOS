import uuid
from datetime import UTC, datetime
from math import ceil
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.asset import Asset
from app.models.client import Client
from app.models.employee import Department, Employee
from app.models.identity import Branch
from app.models.operation import OperationChecklist, OperationTask, OperationTaskAssignee
from app.models.project import Project
from app.schemas.common import PaginatedData, PaginationMeta
from app.schemas.operation import (
    AssetSummary,
    BranchSummary,
    ClientSummary,
    DepartmentSummary,
    EmployeeSummary,
    OperationChecklistCreate,
    OperationChecklistResponse,
    OperationChecklistUpdate,
    OperationTaskAssign,
    OperationTaskAssigneeResponse,
    OperationTaskCreate,
    OperationTaskDetail,
    OperationTaskResponse,
    OperationTaskStatusAction,
    OperationTaskUpdate,
    ProjectSummary,
)
from app.services.organization import record_audit_log


def _to_list(result: Any) -> list[Any]:
    if result is None:
        return []
    if isinstance(result, list):
        return result
    if hasattr(result, "all"):
        return list(result.all())
    return list(result)


def _build_employee_summary(employee: Employee | None) -> EmployeeSummary | None:
    if employee is None:
        return None
    return EmployeeSummary(
        id=employee.id,
        employee_code=employee.employee_code,
        first_name=employee.first_name,
        last_name=employee.last_name,
        designation=employee.designation,
    )


def _build_department_summary(department: Department | None) -> DepartmentSummary | None:
    if department is None:
        return None
    return DepartmentSummary(
        id=department.id,
        name=department.name,
        code=department.code,
    )


def _build_branch_summary(branch: Branch | None) -> BranchSummary | None:
    if branch is None:
        return None
    return BranchSummary(
        id=branch.id,
        name=branch.name,
        code=branch.code,
    )


def _build_project_summary(project: Project | None) -> ProjectSummary | None:
    if project is None:
        return None
    return ProjectSummary(
        id=project.id,
        name=project.name,
        code=project.code,
    )


def _build_client_summary(client: Client | None) -> ClientSummary | None:
    if client is None:
        return None
    return ClientSummary(
        id=client.id,
        name=client.name,
    )


def _build_asset_summary(asset: Asset | None) -> AssetSummary | None:
    if asset is None:
        return None
    return AssetSummary(
        id=asset.id,
        name=asset.name,
        asset_tag=asset.asset_tag,
    )


def _build_task_response(
    task: OperationTask,
    checklists_count: int = 0,
    completed_checklists_count: int = 0,
    assignees_count: int = 0,
) -> OperationTaskResponse:
    return OperationTaskResponse(
        id=task.id,
        organization_id=task.organization_id,
        task_number=task.task_number,
        title=task.title,
        description=task.description,
        category=task.category,
        priority=task.priority,
        status=task.status,
        requester_id=task.requester_id,
        assigned_to_id=task.assigned_to_id,
        department_id=task.department_id,
        branch_id=task.branch_id,
        project_id=task.project_id,
        client_id=task.client_id,
        asset_id=task.asset_id,
        due_date=task.due_date,
        completed_at=task.completed_at,
        notes=task.notes,
        created_at=task.created_at,
        updated_at=task.updated_at,
        requester=_build_employee_summary(task.requester) if hasattr(task, "requester") else None,
        assigned_to=_build_employee_summary(task.assigned_to) if hasattr(task, "assigned_to") else None,
        department=_build_department_summary(task.department) if hasattr(task, "department") else None,
        branch=_build_branch_summary(task.branch) if hasattr(task, "branch") else None,
        project=_build_project_summary(task.project) if hasattr(task, "project") else None,
        client=_build_client_summary(task.client) if hasattr(task, "client") else None,
        asset=_build_asset_summary(task.asset) if hasattr(task, "asset") else None,
        checklists_count=checklists_count,
        completed_checklists_count=completed_checklists_count,
        assignees_count=assignees_count,
    )


def _build_checklist_response(item: OperationChecklist) -> OperationChecklistResponse:
    return OperationChecklistResponse(
        id=item.id,
        organization_id=item.organization_id,
        task_id=item.task_id,
        title=item.title,
        sequence_order=item.sequence_order,
        is_required=item.is_required,
        is_completed=item.is_completed,
        completed_by_id=item.completed_by_id,
        completed_at=item.completed_at,
        notes=item.notes,
        created_at=item.created_at,
        updated_at=item.updated_at,
        completed_by=_build_employee_summary(item.completed_by) if hasattr(item, "completed_by") else None,
    )


def _build_assignee_response(assignee: OperationTaskAssignee) -> OperationTaskAssigneeResponse:
    return OperationTaskAssigneeResponse(
        id=assignee.id,
        organization_id=assignee.organization_id,
        task_id=assignee.task_id,
        employee_id=assignee.employee_id,
        role=assignee.role,
        assigned_at=assignee.assigned_at,
        employee=_build_employee_summary(assignee.employee) if hasattr(assignee, "employee") else None,
    )


class OperationService:
    @staticmethod
    async def _validate_linked_entities(
        session: AsyncSession,
        organization_id: UUID,
        requester_id: UUID | None = None,
        assigned_to_id: UUID | None = None,
        department_id: UUID | None = None,
        branch_id: UUID | None = None,
        project_id: UUID | None = None,
        client_id: UUID | None = None,
        asset_id: UUID | None = None,
    ) -> None:
        if requester_id:
            res = await session.execute(
                select(Employee).where(Employee.organization_id == organization_id, Employee.id == requester_id)
            )
            if not res.scalar_one_or_none():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requester employee not found in organization.")

        if assigned_to_id:
            res = await session.execute(
                select(Employee).where(Employee.organization_id == organization_id, Employee.id == assigned_to_id)
            )
            if not res.scalar_one_or_none():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned employee not found in organization.")

        if department_id:
            res = await session.execute(
                select(Department).where(Department.organization_id == organization_id, Department.id == department_id)
            )
            if not res.scalar_one_or_none():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found in organization.")

        if branch_id:
            res = await session.execute(
                select(Branch).where(Branch.organization_id == organization_id, Branch.id == branch_id)
            )
            if not res.scalar_one_or_none():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found in organization.")

        if project_id:
            res = await session.execute(
                select(Project).where(Project.organization_id == organization_id, Project.id == project_id)
            )
            if not res.scalar_one_or_none():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found in organization.")

        if client_id:
            res = await session.execute(
                select(Client).where(Client.organization_id == organization_id, Client.id == client_id)
            )
            if not res.scalar_one_or_none():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found in organization.")

        if asset_id:
            res = await session.execute(
                select(Asset).where(Asset.organization_id == organization_id, Asset.id == asset_id)
            )
            if not res.scalar_one_or_none():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found in organization.")

    # =========================================================================
    # Operation Tasks
    # =========================================================================

    @staticmethod
    async def create_task(
        session: AsyncSession,
        organization_id: UUID,
        actor_user_id: UUID,
        payload: OperationTaskCreate,
    ) -> OperationTaskResponse:
        # Check duplicate task_number in organization
        existing_res = await session.execute(
            select(OperationTask).where(
                OperationTask.organization_id == organization_id,
                OperationTask.task_number == payload.task_number.strip(),
            )
        )
        if existing_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Task number '{payload.task_number.strip()}' already exists.",
            )

        # Validate linked entities
        await OperationService._validate_linked_entities(
            session=session,
            organization_id=organization_id,
            requester_id=payload.requester_id,
            assigned_to_id=payload.assigned_to_id,
            department_id=payload.department_id,
            branch_id=payload.branch_id,
            project_id=payload.project_id,
            client_id=payload.client_id,
            asset_id=payload.asset_id,
        )

        initial_status = "assigned" if payload.assigned_to_id else "open"

        task = OperationTask(
            id=uuid.uuid4(),
            organization_id=organization_id,
            task_number=payload.task_number.strip(),
            title=payload.title.strip(),
            description=payload.description,
            category=payload.category,
            priority=payload.priority,
            status=initial_status,
            requester_id=payload.requester_id,
            assigned_to_id=payload.assigned_to_id,
            department_id=payload.department_id,
            branch_id=payload.branch_id,
            project_id=payload.project_id,
            client_id=payload.client_id,
            asset_id=payload.asset_id,
            due_date=payload.due_date,
            notes=payload.notes,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(task)
        await session.flush()

        # If assigned_to_id is provided, also insert into operation_task_assignees
        if payload.assigned_to_id:
            assignee = OperationTaskAssignee(
                id=uuid.uuid4(),
                organization_id=organization_id,
                task_id=task.id,
                employee_id=payload.assigned_to_id,
                role="primary_assignee",
                assigned_at=datetime.now(UTC),
            )
            session.add(assignee)
            await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="operation.create",
            entity_type="operation_task",
            entity_id=task.id,
            details={
                "task_number": task.task_number,
                "title": task.title,
                "priority": task.priority,
                "status": task.status,
            },
        )

        return _build_task_response(task, assignees_count=1 if payload.assigned_to_id else 0)

    @staticmethod
    async def list_tasks(
        session: AsyncSession,
        organization_id: UUID,
        search: str | None = None,
        status_filter: str | None = None,
        priority: str | None = None,
        category: str | None = None,
        department_id: UUID | None = None,
        assignee_id: UUID | None = None,
        page: int = 1,
        page_size: int = 20,
        actor_employee_id: UUID | None = None,
        is_employee_restricted: bool = False,
    ) -> PaginatedData[OperationTaskResponse]:
        stmt = (
            select(OperationTask)
            .where(OperationTask.organization_id == organization_id)
            .options(
                selectinload(OperationTask.requester),
                selectinload(OperationTask.assigned_to),
                selectinload(OperationTask.department),
                selectinload(OperationTask.branch),
                selectinload(OperationTask.project),
                selectinload(OperationTask.client),
                selectinload(OperationTask.asset),
            )
        )

        if is_employee_restricted and actor_employee_id:
            stmt = stmt.where(
                or_(
                    OperationTask.assigned_to_id == actor_employee_id,
                    OperationTask.requester_id == actor_employee_id,
                )
            )

        if status_filter and status_filter != "all":
            stmt = stmt.where(OperationTask.status == status_filter)
        if priority and priority != "all":
            stmt = stmt.where(OperationTask.priority == priority)
        if category and category != "all":
            stmt = stmt.where(OperationTask.category == category)
        if department_id:
            stmt = stmt.where(OperationTask.department_id == department_id)
        if assignee_id:
            stmt = stmt.where(OperationTask.assigned_to_id == assignee_id)

        if search and search.strip():
            term = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    OperationTask.title.ilike(term),
                    OperationTask.task_number.ilike(term),
                    OperationTask.description.ilike(term),
                    OperationTask.category.ilike(term),
                )
            )

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_res = await session.execute(count_stmt)
        total = total_res.scalar() or 0

        total_pages = ceil(total / page_size) if total > 0 else 1
        offset = (page - 1) * page_size

        stmt = stmt.order_by(OperationTask.created_at.desc()).offset(offset).limit(page_size)
        res = await session.execute(stmt)
        tasks = _to_list(res.scalars())

        items: list[OperationTaskResponse] = []
        for t in tasks:
            chk_stmt = select(
                func.count(OperationChecklist.id),
                func.count(OperationChecklist.id).filter(OperationChecklist.is_completed == True),
            ).where(OperationChecklist.task_id == t.id)
            chk_res = await session.execute(chk_stmt)
            chk_row = chk_res.first()
            checklists_count = chk_row[0] if chk_row else 0
            completed_checklists_count = chk_row[1] if chk_row else 0

            asg_stmt = select(func.count(OperationTaskAssignee.id)).where(OperationTaskAssignee.task_id == t.id)
            asg_res = await session.execute(asg_stmt)
            assignees_count = asg_res.scalar() or 0

            items.append(
                _build_task_response(
                    t,
                    checklists_count=checklists_count,
                    completed_checklists_count=completed_checklists_count,
                    assignees_count=assignees_count,
                )
            )

        return PaginatedData(
            items=items,
            meta=PaginationMeta(
                total=total,
                page=page,
                page_size=page_size,
                total_pages=total_pages,
            ),
        )

    @staticmethod
    async def get_task(
        session: AsyncSession,
        organization_id: UUID,
        task_id: UUID,
    ) -> OperationTaskDetail:
        stmt = (
            select(OperationTask)
            .where(OperationTask.organization_id == organization_id, OperationTask.id == task_id)
            .options(
                selectinload(OperationTask.requester),
                selectinload(OperationTask.assigned_to),
                selectinload(OperationTask.department),
                selectinload(OperationTask.branch),
                selectinload(OperationTask.project),
                selectinload(OperationTask.client),
                selectinload(OperationTask.asset),
                selectinload(OperationTask.checklists).selectinload(OperationChecklist.completed_by),
                selectinload(OperationTask.assignees).selectinload(OperationTaskAssignee.employee),
            )
        )
        res = await session.execute(stmt)
        task = res.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Operation task not found.")

        checklists = sorted(task.checklists, key=lambda c: c.sequence_order)
        checklist_responses = [_build_checklist_response(c) for c in checklists]
        completed_count = sum(1 for c in checklists if c.is_completed)

        assignee_responses = [_build_assignee_response(a) for a in task.assignees]

        resp = _build_task_response(
            task,
            checklists_count=len(checklists),
            completed_checklists_count=completed_count,
            assignees_count=len(assignee_responses),
        )
        return OperationTaskDetail(
            **resp.model_dump(),
            checklists=checklist_responses,
            assignees=assignee_responses,
        )

    @staticmethod
    async def update_task(
        session: AsyncSession,
        organization_id: UUID,
        task_id: UUID,
        actor_user_id: UUID,
        payload: OperationTaskUpdate,
    ) -> OperationTaskResponse:
        stmt = (
            select(OperationTask)
            .where(OperationTask.organization_id == organization_id, OperationTask.id == task_id)
            .options(
                selectinload(OperationTask.requester),
                selectinload(OperationTask.assigned_to),
                selectinload(OperationTask.department),
                selectinload(OperationTask.branch),
                selectinload(OperationTask.project),
                selectinload(OperationTask.client),
                selectinload(OperationTask.asset),
            )
        )
        res = await session.execute(stmt)
        task = res.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Operation task not found.")

        if task.status in ("completed", "cancelled"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot update a task with status '{task.status}'.",
            )

        # Validate linked entities if changed
        await OperationService._validate_linked_entities(
            session=session,
            organization_id=organization_id,
            assigned_to_id=payload.assigned_to_id,
            department_id=payload.department_id,
            branch_id=payload.branch_id,
            project_id=payload.project_id,
            client_id=payload.client_id,
            asset_id=payload.asset_id,
        )

        if payload.title is not None:
            task.title = payload.title.strip()
        if payload.description is not None:
            task.description = payload.description
        if payload.category is not None:
            task.category = payload.category
        if payload.priority is not None:
            task.priority = payload.priority
        if payload.status is not None:
            task.status = payload.status
        if payload.department_id is not None:
            task.department_id = payload.department_id
        if payload.branch_id is not None:
            task.branch_id = payload.branch_id
        if payload.project_id is not None:
            task.project_id = payload.project_id
        if payload.client_id is not None:
            task.client_id = payload.client_id
        if payload.asset_id is not None:
            task.asset_id = payload.asset_id
        if payload.due_date is not None:
            task.due_date = payload.due_date
        if payload.notes is not None:
            task.notes = payload.notes

        if payload.assigned_to_id is not None and payload.assigned_to_id != task.assigned_to_id:
            task.assigned_to_id = payload.assigned_to_id
            if task.status == "open":
                task.status = "assigned"

            # Check if assignee mapping exists
            asg_check = await session.execute(
                select(OperationTaskAssignee).where(
                    OperationTaskAssignee.organization_id == organization_id,
                    OperationTaskAssignee.task_id == task_id,
                    OperationTaskAssignee.employee_id == payload.assigned_to_id,
                )
            )
            if not asg_check.scalar_one_or_none():
                new_asg = OperationTaskAssignee(
                    id=uuid.uuid4(),
                    organization_id=organization_id,
                    task_id=task_id,
                    employee_id=payload.assigned_to_id,
                    role="primary_assignee",
                    assigned_at=datetime.now(UTC),
                )
                session.add(new_asg)

        task.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="operation.update",
            entity_type="operation_task",
            entity_id=task.id,
            details={"updated_fields": list(payload.model_dump(exclude_unset=True).keys())},
        )

        return _build_task_response(task)

    @staticmethod
    async def delete_task(
        session: AsyncSession,
        organization_id: UUID,
        task_id: UUID,
        actor_user_id: UUID,
    ) -> None:
        stmt = select(OperationTask).where(
            OperationTask.organization_id == organization_id,
            OperationTask.id == task_id,
        )
        res = await session.execute(stmt)
        task = res.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Operation task not found.")

        if task.status == "in_progress":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete a task currently in progress. Cancel it first.",
            )

        await session.delete(task)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="operation.delete",
            entity_type="operation_task",
            entity_id=task_id,
            details={"task_number": task.task_number, "title": task.title},
        )

    @staticmethod
    async def assign_task(
        session: AsyncSession,
        organization_id: UUID,
        task_id: UUID,
        actor_user_id: UUID,
        payload: OperationTaskAssign,
    ) -> OperationTaskResponse:
        stmt = (
            select(OperationTask)
            .where(OperationTask.organization_id == organization_id, OperationTask.id == task_id)
            .options(
                selectinload(OperationTask.requester),
                selectinload(OperationTask.assigned_to),
            )
        )
        res = await session.execute(stmt)
        task = res.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Operation task not found.")

        if task.status in ("completed", "cancelled"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot assign a task with status '{task.status}'.",
            )

        # Validate employee
        emp_res = await session.execute(
            select(Employee).where(
                Employee.organization_id == organization_id,
                Employee.id == payload.assigned_to_id,
            )
        )
        employee = emp_res.scalar_one_or_none()
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found in organization.",
            )

        task.assigned_to_id = payload.assigned_to_id
        if task.status == "open":
            task.status = "assigned"
        if payload.notes:
            task.notes = f"{task.notes}\n{payload.notes}" if task.notes else payload.notes
        task.updated_at = datetime.now(UTC)

        # Check if already in assignees
        asg_check = await session.execute(
            select(OperationTaskAssignee).where(
                OperationTaskAssignee.organization_id == organization_id,
                OperationTaskAssignee.task_id == task_id,
                OperationTaskAssignee.employee_id == payload.assigned_to_id,
            )
        )
        if not asg_check.scalar_one_or_none():
            new_asg = OperationTaskAssignee(
                id=uuid.uuid4(),
                organization_id=organization_id,
                task_id=task_id,
                employee_id=payload.assigned_to_id,
                role="primary_assignee",
                assigned_at=datetime.now(UTC),
            )
            session.add(new_asg)

        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="operation.assign",
            entity_type="operation_task",
            entity_id=task.id,
            details={"assigned_to_id": str(payload.assigned_to_id)},
        )

        task.assigned_to = employee
        return _build_task_response(task)

    @staticmethod
    async def start_task(
        session: AsyncSession,
        organization_id: UUID,
        task_id: UUID,
        actor_user_id: UUID,
        payload: OperationTaskStatusAction,
    ) -> OperationTaskResponse:
        stmt = select(OperationTask).where(
            OperationTask.organization_id == organization_id,
            OperationTask.id == task_id,
        )
        res = await session.execute(stmt)
        task = res.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Operation task not found.")

        if task.status not in ("open", "assigned", "blocked"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot start task with status '{task.status}'.",
            )

        task.status = "in_progress"
        if payload.notes:
            task.notes = f"{task.notes}\n{payload.notes}" if task.notes else payload.notes
        task.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="operation.start",
            entity_type="operation_task",
            entity_id=task.id,
            details={"status": "in_progress"},
        )
        return _build_task_response(task)

    @staticmethod
    async def complete_task(
        session: AsyncSession,
        organization_id: UUID,
        task_id: UUID,
        actor_user_id: UUID,
        payload: OperationTaskStatusAction,
    ) -> OperationTaskResponse:
        stmt = select(OperationTask).where(
            OperationTask.organization_id == organization_id,
            OperationTask.id == task_id,
        )
        res = await session.execute(stmt)
        task = res.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Operation task not found.")

        if task.status in ("completed", "cancelled"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot complete a task with status '{task.status}'.",
            )

        # Check required incomplete checklists
        chk_stmt = select(func.count(OperationChecklist.id)).where(
            OperationChecklist.organization_id == organization_id,
            OperationChecklist.task_id == task_id,
            OperationChecklist.is_required == True,
            OperationChecklist.is_completed == False,
        )
        chk_res = await session.execute(chk_stmt)
        incomplete_required = chk_res.scalar() or 0
        if incomplete_required > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot complete task: {incomplete_required} required checklist item(s) are incomplete.",
            )

        task.status = "completed"
        task.completed_at = datetime.now(UTC)
        if payload.notes:
            task.notes = f"{task.notes}\n{payload.notes}" if task.notes else payload.notes
        task.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="operation.complete",
            entity_type="operation_task",
            entity_id=task.id,
            details={"status": "completed"},
        )
        return _build_task_response(task)

    @staticmethod
    async def cancel_task(
        session: AsyncSession,
        organization_id: UUID,
        task_id: UUID,
        actor_user_id: UUID,
        payload: OperationTaskStatusAction,
    ) -> OperationTaskResponse:
        stmt = select(OperationTask).where(
            OperationTask.organization_id == organization_id,
            OperationTask.id == task_id,
        )
        res = await session.execute(stmt)
        task = res.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Operation task not found.")

        if task.status == "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot cancel a completed task.",
            )

        task.status = "cancelled"
        if payload.notes:
            task.notes = f"{task.notes}\n{payload.notes}" if task.notes else payload.notes
        task.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="operation.cancel",
            entity_type="operation_task",
            entity_id=task.id,
            details={"status": "cancelled"},
        )
        return _build_task_response(task)

    # =========================================================================
    # Checklists
    # =========================================================================

    @staticmethod
    async def list_checklists(
        session: AsyncSession,
        organization_id: UUID,
        task_id: UUID,
    ) -> list[OperationChecklistResponse]:
        # Validate task exists
        task_res = await session.execute(
            select(OperationTask).where(
                OperationTask.organization_id == organization_id,
                OperationTask.id == task_id,
            )
        )
        if not task_res.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Operation task not found.")

        stmt = (
            select(OperationChecklist)
            .where(
                OperationChecklist.organization_id == organization_id,
                OperationChecklist.task_id == task_id,
            )
            .options(selectinload(OperationChecklist.completed_by))
            .order_by(OperationChecklist.sequence_order.asc(), OperationChecklist.created_at.asc())
        )
        res = await session.execute(stmt)
        items = _to_list(res.scalars())
        return [_build_checklist_response(item) for item in items]

    @staticmethod
    async def create_checklist(
        session: AsyncSession,
        organization_id: UUID,
        task_id: UUID,
        actor_user_id: UUID,
        payload: OperationChecklistCreate,
    ) -> OperationChecklistResponse:
        # Validate task
        task_res = await session.execute(
            select(OperationTask).where(
                OperationTask.organization_id == organization_id,
                OperationTask.id == task_id,
            )
        )
        task = task_res.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Operation task not found.")

        if task.status in ("completed", "cancelled"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot add checklist item to a {task.status} task.",
            )

        checklist = OperationChecklist(
            id=uuid.uuid4(),
            organization_id=organization_id,
            task_id=task_id,
            title=payload.title.strip(),
            sequence_order=payload.sequence_order,
            is_required=payload.is_required,
            is_completed=False,
            notes=payload.notes,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(checklist)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="operation_checklist.create",
            entity_type="operation_checklist",
            entity_id=checklist.id,
            details={"task_id": str(task_id), "title": checklist.title},
        )
        return _build_checklist_response(checklist)

    @staticmethod
    async def update_checklist(
        session: AsyncSession,
        organization_id: UUID,
        task_id: UUID,
        item_id: UUID,
        actor_user_id: UUID,
        payload: OperationChecklistUpdate,
        actor_employee_id: UUID | None = None,
    ) -> OperationChecklistResponse:
        stmt = (
            select(OperationChecklist)
            .where(
                OperationChecklist.organization_id == organization_id,
                OperationChecklist.task_id == task_id,
                OperationChecklist.id == item_id,
            )
            .options(selectinload(OperationChecklist.completed_by))
        )
        res = await session.execute(stmt)
        item = res.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found.")

        if payload.title is not None:
            item.title = payload.title.strip()
        if payload.sequence_order is not None:
            item.sequence_order = payload.sequence_order
        if payload.is_required is not None:
            item.is_required = payload.is_required
        if payload.notes is not None:
            item.notes = payload.notes

        if payload.is_completed is not None:
            item.is_completed = payload.is_completed
            if payload.is_completed:
                item.completed_at = datetime.now(UTC)
                item.completed_by_id = actor_employee_id
            else:
                item.completed_at = None
                item.completed_by_id = None

        item.updated_at = datetime.now(UTC)
        await session.flush()

        action = "operation_checklist.complete" if payload.is_completed else "operation_checklist.update"
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action=action,
            entity_type="operation_checklist",
            entity_id=item.id,
            details={"task_id": str(task_id), "is_completed": item.is_completed},
        )
        return _build_checklist_response(item)

    @staticmethod
    async def delete_checklist(
        session: AsyncSession,
        organization_id: UUID,
        task_id: UUID,
        item_id: UUID,
        actor_user_id: UUID,
    ) -> None:
        stmt = select(OperationChecklist).where(
            OperationChecklist.organization_id == organization_id,
            OperationChecklist.task_id == task_id,
            OperationChecklist.id == item_id,
        )
        res = await session.execute(stmt)
        item = res.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found.")

        await session.delete(item)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="operation_checklist.delete",
            entity_type="operation_checklist",
            entity_id=item_id,
            details={"task_id": str(task_id)},
        )
