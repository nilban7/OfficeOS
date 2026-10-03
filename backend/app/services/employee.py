import uuid
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.employee import Department, Employee
from app.models.identity import Branch, OrganizationMembership, Profile
from app.schemas.common import PaginatedData, PaginationMeta
from app.schemas.employee import (
    BranchBrief,
    DepartmentBrief,
    DepartmentCreate,
    DepartmentResponse,
    DepartmentUpdate,
    EmployeeCreate,
    EmployeeDetailResponse,
    EmployeeListItemResponse,
    EmployeeUpdate,
    ManagerBrief,
    ManagerOptionResponse,
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


# --- Department Service ---


async def list_departments(
    session: AsyncSession,
    organization_id: UUID,
    include_inactive: bool = False,
) -> list[DepartmentResponse]:
    query = (
        select(Department, Employee.first_name, Employee.last_name)
        .outerjoin(Employee, Employee.id == Department.manager_id)
        .where(Department.organization_id == organization_id)
    )
    if not include_inactive:
        query = query.where(Department.is_active.is_(True))
    query = query.order_by(Department.name)

    result = await session.execute(query)
    rows = _to_list(result)

    departments: list[DepartmentResponse] = []
    for dept, mgr_first, mgr_last in rows:
        manager_name = f"{mgr_first} {mgr_last}".strip() if mgr_first or mgr_last else None
        departments.append(
            DepartmentResponse(
                id=dept.id,
                organization_id=dept.organization_id,
                name=dept.name,
                code=dept.code,
                description=dept.description,
                manager_id=dept.manager_id,
                manager_name=manager_name,
                is_active=dept.is_active,
                created_at=dept.created_at,
                updated_at=dept.updated_at,
            )
        )
    return departments


async def get_department(
    session: AsyncSession,
    organization_id: UUID,
    department_id: UUID,
) -> DepartmentResponse:
    query = (
        select(Department, Employee.first_name, Employee.last_name)
        .outerjoin(Employee, Employee.id == Department.manager_id)
        .where(Department.id == department_id, Department.organization_id == organization_id)
    )
    result = await session.execute(query)
    row = result.first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Department '{department_id}' not found in this organization",
        )
    dept, mgr_first, mgr_last = row
    manager_name = f"{mgr_first} {mgr_last}".strip() if mgr_first or mgr_last else None
    return DepartmentResponse(
        id=dept.id,
        organization_id=dept.organization_id,
        name=dept.name,
        code=dept.code,
        description=dept.description,
        manager_id=dept.manager_id,
        manager_name=manager_name,
        is_active=dept.is_active,
        created_at=dept.created_at,
        updated_at=dept.updated_at,
    )


async def create_department(
    session: AsyncSession,
    organization_id: UUID,
    data: DepartmentCreate,
    actor_id: UUID | None,
    ip_address: str | None = None,
) -> DepartmentResponse:
    code_upper = data.code.strip().upper()
    existing = await session.scalar(
        select(Department).where(
            Department.organization_id == organization_id,
            Department.code == code_upper,
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Department with code '{code_upper}' already exists in this organization",
        )

    mgr_name: str | None = None
    if data.manager_id is not None:
        manager = await session.scalar(
            select(Employee).where(
                Employee.id == data.manager_id,
                Employee.organization_id == organization_id,
            )
        )
        if manager is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assigned department manager does not exist in this organization",
            )
        if not manager.is_active or manager.status == "terminated":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assigned department manager is not an active employee",
            )
        mgr_name = f"{manager.first_name} {manager.last_name}".strip()

    now = datetime.now(UTC)
    dept = Department(
        id=uuid.uuid4(),
        organization_id=organization_id,
        name=data.name.strip(),
        code=code_upper,
        description=data.description.strip() if data.description else None,
        manager_id=data.manager_id,
        is_active=data.is_active,
        created_at=now,
        updated_at=now,
    )
    session.add(dept)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_id,
        action="departments.create",
        entity_type="department",
        entity_id=dept.id,
        details={"name": dept.name, "code": dept.code, "manager_id": str(dept.manager_id) if dept.manager_id else None},
        ip_address=ip_address,
    )

    return DepartmentResponse(
        id=dept.id,
        organization_id=dept.organization_id,
        name=dept.name,
        code=dept.code,
        description=dept.description,
        manager_id=dept.manager_id,
        manager_name=mgr_name,
        is_active=dept.is_active,
        created_at=dept.created_at,
        updated_at=dept.updated_at,
    )


async def update_department(
    session: AsyncSession,
    organization_id: UUID,
    department_id: UUID,
    data: DepartmentUpdate,
    actor_id: UUID | None,
    ip_address: str | None = None,
) -> DepartmentResponse:
    dept = await session.scalar(
        select(Department).where(Department.id == department_id, Department.organization_id == organization_id)
    )
    if dept is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Department '{department_id}' not found in this organization",
        )

    changes: dict[str, Any] = {}

    if data.code is not None:
        code_upper = data.code.strip().upper()
        if code_upper != dept.code:
            conflict = await session.scalar(
                select(Department).where(
                    Department.organization_id == organization_id,
                    Department.code == code_upper,
                    Department.id != department_id,
                )
            )
            if conflict is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Department with code '{code_upper}' already exists in this organization",
                )
            changes["code"] = {"from": dept.code, "to": code_upper}
            dept.code = code_upper

    if data.name is not None and data.name.strip() != dept.name:
        changes["name"] = {"from": dept.name, "to": data.name.strip()}
        dept.name = data.name.strip()

    if data.description is not None:
        desc_val = data.description.strip() if data.description else None
        if desc_val != dept.description:
            changes["description"] = {"from": dept.description, "to": desc_val}
            dept.description = desc_val

    if data.manager_id is not None:
        if data.manager_id != dept.manager_id:
            manager = await session.scalar(
                select(Employee).where(
                    Employee.id == data.manager_id,
                    Employee.organization_id == organization_id,
                )
            )
            if manager is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Assigned department manager does not exist in this organization",
                )
            if not manager.is_active or manager.status == "terminated":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Assigned department manager is not an active employee",
                )
            changes["manager_id"] = {
                "from": str(dept.manager_id) if dept.manager_id else None,
                "to": str(data.manager_id),
            }
            dept.manager_id = data.manager_id
    elif "manager_id" in data.model_fields_set and data.manager_id is None and dept.manager_id is not None:
        changes["manager_id"] = {"from": str(dept.manager_id), "to": None}
        dept.manager_id = None

    if data.is_active is not None and data.is_active != dept.is_active:
        changes["is_active"] = {"from": dept.is_active, "to": data.is_active}
        dept.is_active = data.is_active

    dept.updated_at = datetime.now(UTC)

    if changes:
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_id,
            action="departments.update",
            entity_type="department",
            entity_id=dept.id,
            details=changes,
            ip_address=ip_address,
        )

    mgr_name: str | None = None
    if dept.manager_id:
        mgr = await session.scalar(select(Employee).where(Employee.id == dept.manager_id))
        if mgr:
            mgr_name = f"{mgr.first_name} {mgr.last_name}".strip()

    return DepartmentResponse(
        id=dept.id,
        organization_id=dept.organization_id,
        name=dept.name,
        code=dept.code,
        description=dept.description,
        manager_id=dept.manager_id,
        manager_name=mgr_name,
        is_active=dept.is_active,
        created_at=dept.created_at,
        updated_at=dept.updated_at,
    )


async def deactivate_department(
    session: AsyncSession,
    organization_id: UUID,
    department_id: UUID,
    actor_id: UUID | None,
    ip_address: str | None = None,
) -> DepartmentResponse:
    dept = await session.scalar(
        select(Department).where(Department.id == department_id, Department.organization_id == organization_id)
    )
    if dept is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Department '{department_id}' not found in this organization",
        )

    if dept.is_active:
        dept.is_active = False
        dept.updated_at = datetime.now(UTC)
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_id,
            action="departments.deactivate",
            entity_type="department",
            entity_id=dept.id,
            details={"is_active": False},
            ip_address=ip_address,
        )

    mgr_name: str | None = None
    if dept.manager_id:
        mgr = await session.scalar(select(Employee).where(Employee.id == dept.manager_id))
        if mgr:
            mgr_name = f"{mgr.first_name} {mgr.last_name}".strip()

    return DepartmentResponse(
        id=dept.id,
        organization_id=dept.organization_id,
        name=dept.name,
        code=dept.code,
        description=dept.description,
        manager_id=dept.manager_id,
        manager_name=mgr_name,
        is_active=dept.is_active,
        created_at=dept.created_at,
        updated_at=dept.updated_at,
    )


# --- Employee Service ---


async def _check_manager_hierarchy(
    session: AsyncSession,
    organization_id: UUID,
    employee_id: UUID | None,
    manager_id: UUID,
) -> None:
    if employee_id is not None and manager_id == employee_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An employee cannot report to themselves",
        )

    manager = await session.scalar(
        select(Employee).where(
            Employee.id == manager_id,
            Employee.organization_id == organization_id,
        )
    )
    if manager is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assigned reporting manager does not exist in this organization",
        )

    if not manager.is_active or manager.status == "terminated":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assigned reporting manager is not an active employee",
        )

    if employee_id is not None:
        curr: Employee | None = manager
        depth = 0
        seen = {employee_id}
        while curr and curr.reporting_manager_id and depth < 50:
            depth += 1
            if curr.reporting_manager_id in seen:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Circular reporting hierarchy detected",
                )
            curr = await session.scalar(
                select(Employee).where(
                    Employee.id == curr.reporting_manager_id,
                    Employee.organization_id == organization_id,
                )
            )


async def _validate_related_entities(
    session: AsyncSession,
    organization_id: UUID,
    department_id: UUID | None,
    branch_id: UUID | None,
    profile_id: UUID | None,
    membership_id: UUID | None,
) -> None:
    if department_id is not None:
        dept = await session.scalar(
            select(Department).where(
                Department.id == department_id,
                Department.organization_id == organization_id,
            )
        )
        if dept is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Department not found in this organization",
            )

    if branch_id is not None:
        branch = await session.scalar(
            select(Branch).where(
                Branch.id == branch_id,
                Branch.organization_id == organization_id,
            )
        )
        if branch is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Branch not found in this organization",
            )

    if profile_id is not None:
        profile = await session.scalar(select(Profile).where(Profile.id == profile_id))
        if profile is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User profile not found",
            )

    if membership_id is not None:
        membership = await session.scalar(
            select(OrganizationMembership).where(
                OrganizationMembership.id == membership_id,
                OrganizationMembership.organization_id == organization_id,
            )
        )
        if membership is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Organization membership not found in this organization",
            )


def _to_list_item(emp: Employee) -> EmployeeListItemResponse:
    dept_brief = (
        DepartmentBrief(id=emp.department.id, name=emp.department.name, code=emp.department.code)
        if emp.department
        else None
    )
    branch_brief = (
        BranchBrief(id=emp.branch.id, name=emp.branch.name, code=emp.branch.code)
        if emp.branch
        else None
    )
    mgr_brief = (
        ManagerBrief(
            id=emp.reporting_manager.id,
            employee_code=emp.reporting_manager.employee_code,
            first_name=emp.reporting_manager.first_name,
            last_name=emp.reporting_manager.last_name,
            designation=emp.reporting_manager.designation,
        )
        if emp.reporting_manager
        else None
    )

    return EmployeeListItemResponse(
        id=emp.id,
        organization_id=emp.organization_id,
        employee_code=emp.employee_code,
        first_name=emp.first_name,
        last_name=emp.last_name,
        designation=emp.designation,
        employment_type=emp.employment_type,
        status=emp.status,
        date_of_joining=emp.date_of_joining,
        date_of_exit=emp.date_of_exit,
        department_id=emp.department_id,
        department=dept_brief,
        branch_id=emp.branch_id,
        branch=branch_brief,
        reporting_manager_id=emp.reporting_manager_id,
        reporting_manager=mgr_brief,
        work_email=emp.work_email,
        phone_number=emp.phone_number,
        is_active=emp.is_active,
        created_at=emp.created_at,
        updated_at=emp.updated_at,
    )


async def list_employees(
    session: AsyncSession,
    organization_id: UUID,
    search: str | None = None,
    department_id: UUID | None = None,
    branch_id: UUID | None = None,
    status_filter: str | None = None,
    employment_type: str | None = None,
    include_inactive: bool = False,
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "name",
    sort_order: str = "asc",
) -> PaginatedData[EmployeeListItemResponse]:
    page = max(1, page)
    if page_size not in (10, 20, 50, 100):
        page_size = 20

    base_filter = [Employee.organization_id == organization_id]

    if not include_inactive:
        base_filter.append(Employee.is_active.is_(True))

    if department_id:
        base_filter.append(Employee.department_id == department_id)

    if branch_id:
        base_filter.append(Employee.branch_id == branch_id)

    if status_filter:
        base_filter.append(Employee.status == status_filter)

    if employment_type:
        base_filter.append(Employee.employment_type == employment_type)

    if search:
        search_pattern = f"%{search.strip()}%"
        base_filter.append(
            or_(
                Employee.first_name.ilike(search_pattern),
                Employee.last_name.ilike(search_pattern),
                Employee.employee_code.ilike(search_pattern),
                Employee.work_email.ilike(search_pattern),
                Employee.designation.ilike(search_pattern),
            )
        )

    # Count total
    count_query = select(func.count(Employee.id)).where(*base_filter)
    total_count = await session.scalar(count_query) or 0

    # Sorting
    sort_desc = sort_order.lower() == "desc"
    if sort_by == "employee_code":
        order_expr = [Employee.employee_code.desc() if sort_desc else Employee.employee_code.asc()]
    elif sort_by == "date_of_joining":
        order_expr = [Employee.date_of_joining.desc() if sort_desc else Employee.date_of_joining.asc()]
    elif sort_by == "created_at":
        order_expr = [Employee.created_at.desc() if sort_desc else Employee.created_at.asc()]
    else:  # name
        order_expr = (
            [Employee.first_name.desc(), Employee.last_name.desc()]
            if sort_desc
            else [Employee.first_name.asc(), Employee.last_name.asc()]
        )

    offset = (page - 1) * page_size
    query = (
        select(Employee)
        .options(
            selectinload(Employee.department),
            selectinload(Employee.branch),
            selectinload(Employee.reporting_manager),
        )
        .where(*base_filter)
        .order_by(*order_expr)
        .offset(offset)
        .limit(page_size)
    )

    result = await session.scalars(query)
    employees = _to_list(result)

    total_pages = max(1, (total_count + page_size - 1) // page_size) if total_count > 0 else 1

    return PaginatedData(
        items=[_to_list_item(e) for e in employees],
        meta=PaginationMeta(
            total=total_count,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        ),
    )


async def get_employee(
    session: AsyncSession,
    organization_id: UUID,
    employee_id: UUID,
) -> EmployeeDetailResponse:
    query = (
        select(Employee)
        .options(
            selectinload(Employee.department),
            selectinload(Employee.branch),
            selectinload(Employee.reporting_manager),
        )
        .where(Employee.id == employee_id, Employee.organization_id == organization_id)
    )
    emp = await session.scalar(query)
    if emp is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee '{employee_id}' not found in this organization",
        )

    reports_query = (
        select(Employee)
        .where(
            Employee.reporting_manager_id == employee_id,
            Employee.organization_id == organization_id,
            Employee.is_active.is_(True),
        )
        .order_by(Employee.first_name, Employee.last_name)
    )
    direct_reports_res = await session.scalars(reports_query)
    reports = _to_list(direct_reports_res)

    base_item = _to_list_item(emp)

    return EmployeeDetailResponse(
        id=base_item.id,
        organization_id=base_item.organization_id,
        employee_code=base_item.employee_code,
        first_name=base_item.first_name,
        last_name=base_item.last_name,
        designation=base_item.designation,
        employment_type=base_item.employment_type,
        status=base_item.status,
        date_of_joining=base_item.date_of_joining,
        date_of_exit=base_item.date_of_exit,
        department_id=base_item.department_id,
        department=base_item.department,
        branch_id=base_item.branch_id,
        branch=base_item.branch,
        reporting_manager_id=base_item.reporting_manager_id,
        reporting_manager=base_item.reporting_manager,
        work_email=base_item.work_email,
        phone_number=base_item.phone_number,
        is_active=base_item.is_active,
        created_at=base_item.created_at,
        updated_at=base_item.updated_at,
        personal_email=emp.personal_email,
        current_address=emp.current_address,
        emergency_contact_name=emp.emergency_contact_name,
        emergency_contact_relationship=emp.emergency_contact_relationship,
        emergency_contact_phone=emp.emergency_contact_phone,
        profile_id=emp.profile_id,
        membership_id=emp.membership_id,
        direct_reports=[
            ManagerBrief(
                id=r.id,
                employee_code=r.employee_code,
                first_name=r.first_name,
                last_name=r.last_name,
                designation=r.designation,
            )
            for r in reports
        ],
    )


async def create_employee(
    session: AsyncSession,
    organization_id: UUID,
    data: EmployeeCreate,
    actor_id: UUID | None,
    ip_address: str | None = None,
) -> EmployeeDetailResponse:
    code_upper = data.employee_code.strip().upper()
    existing = await session.scalar(
        select(Employee).where(
            Employee.organization_id == organization_id,
            Employee.employee_code == code_upper,
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Employee with code '{code_upper}' already exists in this organization",
        )

    await _validate_related_entities(
        session=session,
        organization_id=organization_id,
        department_id=data.department_id,
        branch_id=data.branch_id,
        profile_id=data.profile_id,
        membership_id=data.membership_id,
    )

    if data.reporting_manager_id is not None:
        await _check_manager_hierarchy(
            session=session,
            organization_id=organization_id,
            employee_id=None,
            manager_id=data.reporting_manager_id,
        )

    is_active = data.is_active
    if data.status == "terminated":
        is_active = False

    now = datetime.now(UTC)
    emp = Employee(
        id=uuid.uuid4(),
        organization_id=organization_id,
        employee_code=code_upper,
        first_name=data.first_name.strip(),
        last_name=data.last_name.strip(),
        designation=data.designation.strip(),
        employment_type=data.employment_type,
        status=data.status,
        date_of_joining=data.date_of_joining,
        date_of_exit=data.date_of_exit,
        department_id=data.department_id,
        branch_id=data.branch_id,
        reporting_manager_id=data.reporting_manager_id,
        profile_id=data.profile_id,
        membership_id=data.membership_id,
        work_email=data.work_email.strip().lower() if data.work_email else None,
        personal_email=data.personal_email.strip().lower() if data.personal_email else None,
        phone_number=data.phone_number.strip() if data.phone_number else None,
        current_address=data.current_address.strip() if data.current_address else None,
        emergency_contact_name=data.emergency_contact_name.strip() if data.emergency_contact_name else None,
        emergency_contact_relationship=data.emergency_contact_relationship.strip()
        if data.emergency_contact_relationship
        else None,
        emergency_contact_phone=data.emergency_contact_phone.strip() if data.emergency_contact_phone else None,
        is_active=is_active,
        created_at=now,
        updated_at=now,
    )
    session.add(emp)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=organization_id,
        actor_id=actor_id,
        action="employees.create",
        entity_type="employee",
        entity_id=emp.id,
        details={
            "employee_code": emp.employee_code,
            "name": f"{emp.first_name} {emp.last_name}",
            "designation": emp.designation,
            "department_id": str(emp.department_id) if emp.department_id else None,
            "branch_id": str(emp.branch_id) if emp.branch_id else None,
            "status": emp.status,
        },
        ip_address=ip_address,
    )

    return await get_employee(session, organization_id, emp.id)


async def update_employee(
    session: AsyncSession,
    organization_id: UUID,
    employee_id: UUID,
    data: EmployeeUpdate,
    actor_id: UUID | None,
    ip_address: str | None = None,
) -> EmployeeDetailResponse:
    emp = await session.scalar(
        select(Employee).where(Employee.id == employee_id, Employee.organization_id == organization_id)
    )
    if emp is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee '{employee_id}' not found in this organization",
        )

    changes: dict[str, Any] = {}

    if data.employee_code is not None:
        code_upper = data.employee_code.strip().upper()
        if code_upper != emp.employee_code:
            conflict = await session.scalar(
                select(Employee).where(
                    Employee.organization_id == organization_id,
                    Employee.employee_code == code_upper,
                    Employee.id != employee_id,
                )
            )
            if conflict is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Employee with code '{code_upper}' already exists in this organization",
                )
            changes["employee_code"] = {"from": emp.employee_code, "to": code_upper}
            emp.employee_code = code_upper

    if data.first_name is not None and data.first_name.strip() != emp.first_name:
        changes["first_name"] = {"from": emp.first_name, "to": data.first_name.strip()}
        emp.first_name = data.first_name.strip()

    if data.last_name is not None and data.last_name.strip() != emp.last_name:
        changes["last_name"] = {"from": emp.last_name, "to": data.last_name.strip()}
        emp.last_name = data.last_name.strip()

    if data.designation is not None and data.designation.strip() != emp.designation:
        changes["designation"] = {"from": emp.designation, "to": data.designation.strip()}
        emp.designation = data.designation.strip()

    if data.employment_type is not None and data.employment_type != emp.employment_type:
        changes["employment_type"] = {"from": emp.employment_type, "to": data.employment_type}
        emp.employment_type = data.employment_type

    status_changed = False
    if data.status is not None and data.status != emp.status:
        changes["status"] = {"from": emp.status, "to": data.status}
        emp.status = data.status
        status_changed = True
        if data.status == "terminated":
            emp.is_active = False

    if data.date_of_joining is not None and data.date_of_joining != emp.date_of_joining:
        changes["date_of_joining"] = {"from": str(emp.date_of_joining), "to": str(data.date_of_joining)}
        emp.date_of_joining = data.date_of_joining

    if data.date_of_exit is not None and data.date_of_exit != emp.date_of_exit:
        changes["date_of_exit"] = {
            "from": str(emp.date_of_exit) if emp.date_of_exit else None,
            "to": str(data.date_of_exit),
        }
        emp.date_of_exit = data.date_of_exit

    effective_joining = data.date_of_joining or emp.date_of_joining
    effective_exit = data.date_of_exit if data.date_of_exit is not None else emp.date_of_exit
    if effective_exit is not None and effective_joining is not None and effective_exit < effective_joining:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="date_of_exit cannot precede date_of_joining",
        )

    await _validate_related_entities(
        session=session,
        organization_id=organization_id,
        department_id=data.department_id if "department_id" in data.model_fields_set else None,
        branch_id=data.branch_id if "branch_id" in data.model_fields_set else None,
        profile_id=data.profile_id if "profile_id" in data.model_fields_set else None,
        membership_id=data.membership_id if "membership_id" in data.model_fields_set else None,
    )

    if "department_id" in data.model_fields_set and data.department_id != emp.department_id:
        changes["department_id"] = {
            "from": str(emp.department_id) if emp.department_id else None,
            "to": str(data.department_id) if data.department_id else None,
        }
        emp.department_id = data.department_id

    if "branch_id" in data.model_fields_set and data.branch_id != emp.branch_id:
        changes["branch_id"] = {
            "from": str(emp.branch_id) if emp.branch_id else None,
            "to": str(data.branch_id) if data.branch_id else None,
        }
        emp.branch_id = data.branch_id

    if "reporting_manager_id" in data.model_fields_set and data.reporting_manager_id != emp.reporting_manager_id:
        if data.reporting_manager_id is not None:
            await _check_manager_hierarchy(
                session=session,
                organization_id=organization_id,
                employee_id=employee_id,
                manager_id=data.reporting_manager_id,
            )
        changes["reporting_manager_id"] = {
            "from": str(emp.reporting_manager_id) if emp.reporting_manager_id else None,
            "to": str(data.reporting_manager_id) if data.reporting_manager_id else None,
        }
        emp.reporting_manager_id = data.reporting_manager_id

    if "profile_id" in data.model_fields_set and data.profile_id != emp.profile_id:
        changes["profile_id"] = {
            "from": str(emp.profile_id) if emp.profile_id else None,
            "to": str(data.profile_id) if data.profile_id else None,
        }
        emp.profile_id = data.profile_id

    if "membership_id" in data.model_fields_set and data.membership_id != emp.membership_id:
        changes["membership_id"] = {
            "from": str(emp.membership_id) if emp.membership_id else None,
            "to": str(data.membership_id) if data.membership_id else None,
        }
        emp.membership_id = data.membership_id

    if "work_email" in data.model_fields_set:
        val = data.work_email.strip().lower() if data.work_email else None
        if val != emp.work_email:
            changes["work_email"] = {"from": emp.work_email, "to": val}
            emp.work_email = val

    if "personal_email" in data.model_fields_set:
        val = data.personal_email.strip().lower() if data.personal_email else None
        if val != emp.personal_email:
            changes["personal_email"] = {"from": emp.personal_email, "to": val}
            emp.personal_email = val

    if "phone_number" in data.model_fields_set:
        val = data.phone_number.strip() if data.phone_number else None
        if val != emp.phone_number:
            changes["phone_number"] = {"from": emp.phone_number, "to": val}
            emp.phone_number = val

    if "current_address" in data.model_fields_set:
        val = data.current_address.strip() if data.current_address else None
        if val != emp.current_address:
            changes["current_address"] = {"from": emp.current_address, "to": val}
            emp.current_address = val

    if "emergency_contact_name" in data.model_fields_set:
        val = data.emergency_contact_name.strip() if data.emergency_contact_name else None
        if val != emp.emergency_contact_name:
            changes["emergency_contact_name"] = {"from": emp.emergency_contact_name, "to": val}
            emp.emergency_contact_name = val

    if "emergency_contact_relationship" in data.model_fields_set:
        val = data.emergency_contact_relationship.strip() if data.emergency_contact_relationship else None
        if val != emp.emergency_contact_relationship:
            changes["emergency_contact_relationship"] = {"from": emp.emergency_contact_relationship, "to": val}
            emp.emergency_contact_relationship = val

    if "emergency_contact_phone" in data.model_fields_set:
        val = data.emergency_contact_phone.strip() if data.emergency_contact_phone else None
        if val != emp.emergency_contact_phone:
            changes["emergency_contact_phone"] = {"from": emp.emergency_contact_phone, "to": val}
            emp.emergency_contact_phone = val

    if data.is_active is not None and data.is_active != emp.is_active:
        changes["is_active"] = {"from": emp.is_active, "to": data.is_active}
        emp.is_active = data.is_active

    emp.updated_at = datetime.now(UTC)

    if status_changed:
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_id,
            action="employees.status_change",
            entity_type="employee",
            entity_id=emp.id,
            details=changes.get("status", {}),
            ip_address=ip_address,
        )

    if changes:
        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_id,
            action="employees.update",
            entity_type="employee",
            entity_id=emp.id,
            details=changes,
            ip_address=ip_address,
        )

    return await get_employee(session, organization_id, emp.id)


async def deactivate_employee(
    session: AsyncSession,
    organization_id: UUID,
    employee_id: UUID,
    actor_id: UUID | None,
    ip_address: str | None = None,
) -> EmployeeDetailResponse:
    emp = await session.scalar(
        select(Employee).where(Employee.id == employee_id, Employee.organization_id == organization_id)
    )
    if emp is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee '{employee_id}' not found in this organization",
        )

    if emp.is_active or emp.status != "terminated":
        emp.status = "terminated"
        emp.is_active = False
        if not emp.date_of_exit:
            emp.date_of_exit = datetime.now(UTC).date()
        emp.updated_at = datetime.now(UTC)

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_id,
            action="employees.deactivate",
            entity_type="employee",
            entity_id=emp.id,
            details={"status": "terminated", "is_active": False, "date_of_exit": str(emp.date_of_exit)},
            ip_address=ip_address,
        )

    return await get_employee(session, organization_id, emp.id)


async def list_manager_options(
    session: AsyncSession,
    organization_id: UUID,
) -> list[ManagerOptionResponse]:
    query = (
        select(
            Employee.id,
            Employee.employee_code,
            Employee.first_name,
            Employee.last_name,
            Employee.designation,
            Department.name.label("department_name"),
            Branch.name.label("branch_name"),
        )
        .outerjoin(Department, Department.id == Employee.department_id)
        .outerjoin(Branch, Branch.id == Employee.branch_id)
        .where(
            Employee.organization_id == organization_id,
            Employee.is_active.is_(True),
            Employee.status != "terminated",
        )
        .order_by(Employee.first_name, Employee.last_name)
    )

    result = await session.execute(query)
    rows = _to_list(result)

    return [
        ManagerOptionResponse(
            id=r.id,
            employee_code=r.employee_code,
            first_name=r.first_name,
            last_name=r.last_name,
            designation=r.designation,
            department_name=r.department_name,
            branch_name=r.branch_name,
        )
        for r in rows
    ]
