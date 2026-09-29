import uuid
from datetime import UTC, datetime
from math import ceil
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.client import Client
from app.models.employee import Employee
from app.models.project import Project, ProjectMember
from app.schemas.common import PaginatedData, PaginationMeta
from app.schemas.project import (
    ProjectCreate,
    ProjectDetailResponse,
    ProjectMemberCreate,
    ProjectMemberResponse,
    ProjectMemberUpdate,
    ProjectResponse,
    ProjectUpdate,
)
from app.services.organization import record_audit_log


def _to_list(result: Any) -> list[Any]:
    if hasattr(result, "all"):
        return list(result.all())
    return list(result)


def _build_project_member_response(member: ProjectMember) -> ProjectMemberResponse:
    emp = member.employee if hasattr(member, "employee") and member.employee is not None else None
    emp_name = f"{emp.first_name} {emp.last_name}".strip() if emp else None
    return ProjectMemberResponse(
        id=member.id,
        organization_id=member.organization_id,
        project_id=member.project_id,
        employee_id=member.employee_id,
        role=member.role,
        allocation_percentage=member.allocation_percentage,
        start_date=member.start_date,
        end_date=member.end_date,
        created_at=member.created_at,
        updated_at=member.updated_at,
        employee_name=emp_name,
        employee_code=emp.employee_code if emp else None,
        employee_email=emp.work_email or emp.personal_email if emp else None,
        employee_designation=emp.designation if emp else None,
    )


def _build_project_response(project: Project) -> ProjectResponse:
    members = list(project.members) if hasattr(project, "members") and project.members is not None else []
    client = project.client if hasattr(project, "client") and project.client is not None else None
    pm = project.project_manager if hasattr(project, "project_manager") and project.project_manager is not None else None
    pm_name = f"{pm.first_name} {pm.last_name}".strip() if pm else None

    return ProjectResponse(
        id=project.id,
        organization_id=project.organization_id,
        project_code=project.project_code,
        name=project.name,
        description=project.description,
        client_id=project.client_id,
        status=project.status,
        start_date=project.start_date,
        end_date=project.end_date,
        budget=project.budget,
        project_manager_employee_id=project.project_manager_employee_id,
        created_at=project.created_at,
        updated_at=project.updated_at,
        client_name=client.name if client else None,
        client_code=client.client_code if client else None,
        project_manager_name=pm_name,
        project_manager_code=pm.employee_code if pm else None,
        members_count=len(members),
    )


def _build_project_detail_response(project: Project) -> ProjectDetailResponse:
    base = _build_project_response(project)
    members = list(project.members) if hasattr(project, "members") and project.members is not None else []
    sorted_members = sorted(members, key=lambda m: (m.role or "", m.created_at), reverse=True)

    return ProjectDetailResponse(
        **base.model_dump(),
        members=[_build_project_member_response(m) for m in sorted_members],
    )


# ==========================================
# Project Services
# ==========================================
async def list_projects(
    session: AsyncSession,
    organization_id: UUID,
    search: str | None = None,
    status_filter: str | None = None,
    client_id: UUID | None = None,
    project_manager_id: UUID | None = None,
    page: int = 1,
    page_size: int = 50,
    sort_by: str = "created_at",
    sort_order: str = "desc",
) -> PaginatedData[ProjectResponse]:
    page = max(1, page)
    page_size = max(1, min(page_size, 100))

    base_query = select(Project).where(Project.organization_id == organization_id)

    if status_filter:
        base_query = base_query.where(Project.status == status_filter)

    if client_id:
        base_query = base_query.where(Project.client_id == client_id)

    if project_manager_id:
        base_query = base_query.where(Project.project_manager_employee_id == project_manager_id)

    if search:
        search_term = f"%{search.strip()}%"
        base_query = base_query.where(
            or_(
                Project.name.ilike(search_term),
                Project.project_code.ilike(search_term),
                Project.description.ilike(search_term),
            )
        )

    count_query = select(func.count()).select_from(base_query.subquery())
    total = (await session.execute(count_query)).scalar() or 0
    total_pages = ceil(total / page_size) if total > 0 else 0

    sort_column_map = {
        "name": Project.name,
        "project_code": Project.project_code,
        "created_at": Project.created_at,
        "updated_at": Project.updated_at,
        "status": Project.status,
        "start_date": Project.start_date,
        "end_date": Project.end_date,
        "budget": Project.budget,
    }
    col = sort_column_map.get(sort_by, Project.created_at)
    order_clause = col.desc() if sort_order.lower() == "desc" else col.asc()

    query = (
        base_query.options(
            selectinload(Project.client),
            selectinload(Project.project_manager),
            selectinload(Project.members),
        )
        .order_by(order_clause, Project.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    result = await session.scalars(query)
    projects = _to_list(result)

    items = [_build_project_response(p) for p in projects]

    return PaginatedData(
        items=items,
        meta=PaginationMeta(
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        ),
    )


async def get_project(
    session: AsyncSession,
    organization_id: UUID,
    project_id: UUID,
) -> ProjectDetailResponse:
    query = (
        select(Project)
        .options(
            selectinload(Project.client),
            selectinload(Project.project_manager),
            selectinload(Project.members).selectinload(ProjectMember.employee),
        )
        .where(
            Project.id == project_id,
            Project.organization_id == organization_id,
        )
    )
    project = await session.scalar(query)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    return _build_project_detail_response(project)


async def create_project(
    session: AsyncSession,
    organization_id: UUID,
    data: ProjectCreate,
    actor_id: UUID | None = None,
    ip_address: str | None = None,
) -> ProjectDetailResponse:
    normalized_code = data.project_code.strip().upper()

    # Check project code uniqueness in organization
    existing = await session.scalar(
        select(Project).where(
            Project.organization_id == organization_id,
            Project.project_code == normalized_code,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Project with code '{normalized_code}' already exists in this organization",
        )

    # Validate client ownership
    if data.client_id:
        client_exists = await session.scalar(
            select(Client.id).where(
                Client.id == data.client_id,
                Client.organization_id == organization_id,
            )
        )
        if not client_exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Referenced client does not exist in this organization",
            )

    # Validate project manager ownership
    if data.project_manager_employee_id:
        pm_exists = await session.scalar(
            select(Employee.id).where(
                Employee.id == data.project_manager_employee_id,
                Employee.organization_id == organization_id,
            )
        )
        if not pm_exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Referenced project manager does not exist in this organization",
            )

    now = datetime.now(UTC)
    project = Project(
        id=uuid.uuid4(),
        organization_id=organization_id,
        client_id=data.client_id,
        project_code=normalized_code,
        name=data.name.strip(),
        description=data.description.strip() if data.description else None,
        status=data.status,
        start_date=data.start_date,
        end_date=data.end_date,
        budget=data.budget,
        project_manager_employee_id=data.project_manager_employee_id,
        created_at=now,
        updated_at=now,
    )
    session.add(project)

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_id,
        action="project.create",
        entity_type="project",
        entity_id=project.id,
        details={
            "project_code": project.project_code,
            "name": project.name,
            "status": project.status,
            "client_id": str(project.client_id) if project.client_id else None,
            "project_manager_employee_id": (
                str(project.project_manager_employee_id) if project.project_manager_employee_id else None
            ),
        },
        ip_address=ip_address,
    )

    await session.flush()
    project.members = []
    return await get_project(session=session, organization_id=organization_id, project_id=project.id)


async def update_project(
    session: AsyncSession,
    organization_id: UUID,
    project_id: UUID,
    data: ProjectUpdate,
    actor_id: UUID | None = None,
    ip_address: str | None = None,
) -> ProjectDetailResponse:
    query = (
        select(Project)
        .options(
            selectinload(Project.client),
            selectinload(Project.project_manager),
            selectinload(Project.members).selectinload(ProjectMember.employee),
        )
        .where(
            Project.id == project_id,
            Project.organization_id == organization_id,
        )
    )
    project = await session.scalar(query)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    changes: dict[str, Any] = {}

    if data.project_code is not None:
        normalized_code = data.project_code.strip().upper()
        if normalized_code != project.project_code:
            existing = await session.scalar(
                select(Project).where(
                    Project.organization_id == organization_id,
                    Project.project_code == normalized_code,
                    Project.id != project_id,
                )
            )
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Project with code '{normalized_code}' already exists in this organization",
                )
            changes["project_code"] = {"old": project.project_code, "new": normalized_code}
            project.project_code = normalized_code

    if data.client_id is not None and data.client_id != project.client_id:
        client_exists = await session.scalar(
            select(Client.id).where(
                Client.id == data.client_id,
                Client.organization_id == organization_id,
            )
        )
        if not client_exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Referenced client does not exist in this organization",
            )
        changes["client_id"] = {"old": str(project.client_id) if project.client_id else None, "new": str(data.client_id)}
        project.client_id = data.client_id

    if data.project_manager_employee_id is not None and data.project_manager_employee_id != project.project_manager_employee_id:
        pm_exists = await session.scalar(
            select(Employee.id).where(
                Employee.id == data.project_manager_employee_id,
                Employee.organization_id == organization_id,
            )
        )
        if not pm_exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Referenced project manager does not exist in this organization",
            )
        changes["project_manager_employee_id"] = {
            "old": str(project.project_manager_employee_id) if project.project_manager_employee_id else None,
            "new": str(data.project_manager_employee_id),
        }
        project.project_manager_employee_id = data.project_manager_employee_id

    updatable_fields = ["name", "description", "status", "start_date", "end_date", "budget"]
    for field in updatable_fields:
        val = getattr(data, field)
        if val is not None:
            old_val = getattr(project, field)
            if old_val != val:
                changes[field] = {"old": str(old_val) if old_val is not None else None, "new": str(val)}
                setattr(project, field, val)

    # Date integrity check after updates
    effective_start = project.start_date
    effective_end = project.end_date
    if effective_start and effective_end and effective_end < effective_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Project end_date cannot be earlier than start_date",
        )

    if changes:
        project.updated_at = datetime.now(UTC)
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_id,
            action="project.update",
            entity_type="project",
            entity_id=project.id,
            details={"changes": changes},
            ip_address=ip_address,
        )

    await session.flush()
    return await get_project(session=session, organization_id=organization_id, project_id=project.id)


async def archive_project(
    session: AsyncSession,
    organization_id: UUID,
    project_id: UUID,
    actor_id: UUID | None = None,
    ip_address: str | None = None,
) -> ProjectDetailResponse:
    query = (
        select(Project)
        .options(
            selectinload(Project.client),
            selectinload(Project.project_manager),
            selectinload(Project.members).selectinload(ProjectMember.employee),
        )
        .where(
            Project.id == project_id,
            Project.organization_id == organization_id,
        )
    )
    project = await session.scalar(query)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    project.status = "cancelled"
    project.updated_at = datetime.now(UTC)

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_id,
        action="project.archive",
        entity_type="project",
        entity_id=project.id,
        details={
            "project_code": project.project_code,
            "name": project.name,
            "status": "cancelled",
        },
        ip_address=ip_address,
    )

    await session.flush()
    return await get_project(session=session, organization_id=organization_id, project_id=project.id)


# ==========================================
# Project Member Services
# ==========================================
async def list_project_members(
    session: AsyncSession,
    organization_id: UUID,
    project_id: UUID,
) -> list[ProjectMemberResponse]:
    # Ensure project exists in current organization
    project_exists = await session.scalar(
        select(Project.id).where(
            Project.id == project_id,
            Project.organization_id == organization_id,
        )
    )
    if not project_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    query = (
        select(ProjectMember)
        .options(selectinload(ProjectMember.employee))
        .where(
            ProjectMember.project_id == project_id,
            ProjectMember.organization_id == organization_id,
        )
        .order_by(ProjectMember.created_at.desc())
    )
    members = _to_list(await session.scalars(query))
    return [_build_project_member_response(m) for m in members]


async def add_project_member(
    session: AsyncSession,
    organization_id: UUID,
    project_id: UUID,
    data: ProjectMemberCreate,
    actor_id: UUID | None = None,
    ip_address: str | None = None,
) -> ProjectMemberResponse:
    # Ensure project exists in current organization
    project = await session.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.organization_id == organization_id,
        )
    )
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # Ensure employee exists in current organization
    emp = await session.scalar(
        select(Employee).where(
            Employee.id == data.employee_id,
            Employee.organization_id == organization_id,
        )
    )
    if emp is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found in this organization",
        )

    # Check for duplicate membership
    existing = await session.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.employee_id == data.employee_id,
            ProjectMember.organization_id == organization_id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Employee '{emp.first_name} {emp.last_name}' is already a member of this project",
        )

    now = datetime.now(UTC)
    member = ProjectMember(
        id=uuid.uuid4(),
        organization_id=organization_id,
        project_id=project_id,
        employee_id=data.employee_id,
        role=data.role.strip() if data.role else None,
        allocation_percentage=data.allocation_percentage,
        start_date=data.start_date,
        end_date=data.end_date,
        created_at=now,
        updated_at=now,
    )
    session.add(member)

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_id,
        action="project_member.create",
        entity_type="project_member",
        entity_id=member.id,
        details={
            "project_id": str(project_id),
            "employee_id": str(data.employee_id),
            "role": member.role,
            "allocation_percentage": float(member.allocation_percentage) if member.allocation_percentage else None,
        },
        ip_address=ip_address,
    )

    await session.flush()
    member.employee = emp
    return _build_project_member_response(member)


async def update_project_member(
    session: AsyncSession,
    organization_id: UUID,
    project_id: UUID,
    member_id: UUID,
    data: ProjectMemberUpdate,
    actor_id: UUID | None = None,
    ip_address: str | None = None,
) -> ProjectMemberResponse:
    query = (
        select(ProjectMember)
        .options(selectinload(ProjectMember.employee))
        .where(
            ProjectMember.id == member_id,
            ProjectMember.project_id == project_id,
            ProjectMember.organization_id == organization_id,
        )
    )
    member = await session.scalar(query)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project member not found",
        )

    changes: dict[str, Any] = {}

    for field in ["role", "allocation_percentage", "start_date", "end_date"]:
        val = getattr(data, field)
        if val is not None:
            old_val = getattr(member, field)
            if old_val != val:
                changes[field] = {"old": str(old_val) if old_val is not None else None, "new": str(val)}
                setattr(member, field, val)

    # Date validity check
    if member.start_date and member.end_date and member.end_date < member.start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Member end_date cannot be earlier than start_date",
        )

    if changes:
        member.updated_at = datetime.now(UTC)
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_id,
            action="project_member.update",
            entity_type="project_member",
            entity_id=member.id,
            details={"changes": changes},
            ip_address=ip_address,
        )

    await session.flush()
    return _build_project_member_response(member)


async def delete_project_member(
    session: AsyncSession,
    organization_id: UUID,
    project_id: UUID,
    member_id: UUID,
    actor_id: UUID | None = None,
    ip_address: str | None = None,
) -> None:
    query = select(ProjectMember).where(
        ProjectMember.id == member_id,
        ProjectMember.project_id == project_id,
        ProjectMember.organization_id == organization_id,
    )
    member = await session.scalar(query)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project member not found",
        )

    emp_id = member.employee_id
    await session.delete(member)

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_id,
        action="project_member.delete",
        entity_type="project_member",
        entity_id=member_id,
        details={"project_id": str(project_id), "employee_id": str(emp_id)},
        ip_address=ip_address,
    )

    await session.flush()
