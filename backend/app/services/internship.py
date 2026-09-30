import uuid
from datetime import UTC, datetime
from math import ceil
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.employee import Employee
from app.models.internship import Internship, InternshipReview, InternshipSupervisor
from app.schemas.common import PaginatedData, PaginationMeta
from app.schemas.internship import (
    EmployeeSummary,
    InternshipAction,
    InternshipCreate,
    InternshipDetail,
    InternshipExtend,
    InternshipResponse,
    InternshipReviewCreate,
    InternshipReviewResponse,
    InternshipReviewUpdate,
    InternshipSummary,
    InternshipSupervisorCreate,
    InternshipSupervisorResponse,
    InternshipUpdate,
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


def _build_internship_summary(internship: Internship | None) -> InternshipSummary | None:
    if internship is None:
        return None
    return InternshipSummary(
        id=internship.id,
        title=internship.title,
        code=internship.code,
        intern_name=internship.intern_name,
        status=internship.status,
        start_date=internship.start_date,
        end_date=internship.end_date,
    )


def _build_internship_response(
    internship: Internship,
    supervisors_count: int = 0,
    reviews_count: int = 0,
) -> InternshipResponse:
    return InternshipResponse(
        id=internship.id,
        organization_id=internship.organization_id,
        employee_id=internship.employee_id,
        department_id=internship.department_id,
        supervisor_id=internship.supervisor_id,
        title=internship.title,
        code=internship.code,
        intern_name=internship.intern_name,
        intern_email=internship.intern_email,
        institution=internship.institution,
        start_date=internship.start_date,
        end_date=internship.end_date,
        status=internship.status,
        stipend=internship.stipend or 0,
        description=internship.description,
        notes=internship.notes,
        created_at=internship.created_at,
        updated_at=internship.updated_at,
        supervisor=_build_employee_summary(internship.supervisor) if hasattr(internship, "supervisor") else None,
        supervisors_count=supervisors_count,
        reviews_count=reviews_count,
    )


def _build_supervisor_response(sup: InternshipSupervisor) -> InternshipSupervisorResponse:
    return InternshipSupervisorResponse(
        id=sup.id,
        organization_id=sup.organization_id,
        internship_id=sup.internship_id,
        employee_id=sup.employee_id,
        role=sup.role,
        created_at=sup.created_at,
        employee=_build_employee_summary(sup.employee) if hasattr(sup, "employee") else None,
    )


def _build_review_response(review: InternshipReview) -> InternshipReviewResponse:
    return InternshipReviewResponse(
        id=review.id,
        organization_id=review.organization_id,
        internship_id=review.internship_id,
        reviewer_id=review.reviewer_id,
        review_date=review.review_date,
        rating=review.rating,
        feedback=review.feedback,
        status=review.status,
        created_at=review.created_at,
        updated_at=review.updated_at,
        reviewer=_build_employee_summary(review.reviewer) if hasattr(review, "reviewer") else None,
        internship=_build_internship_summary(review.internship) if hasattr(review, "internship") else None,
    )


class InternshipService:
    # =========================================================================
    # Internships
    # =========================================================================

    @staticmethod
    async def create_internship(
        session: AsyncSession,
        organization_id: UUID,
        actor_user_id: UUID,
        payload: InternshipCreate,
    ) -> InternshipResponse:
        # Check duplicate code
        existing_stmt = select(Internship).where(
            Internship.organization_id == organization_id,
            Internship.code == payload.code.strip(),
        )
        existing_res = await session.execute(existing_stmt)
        if existing_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Internship code '{payload.code.strip()}' already exists.",
            )

        if payload.end_date < payload.start_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="End date cannot be earlier than start date.",
            )

        internship = Internship(
            id=uuid.uuid4(),
            organization_id=organization_id,
            employee_id=payload.employee_id,
            department_id=payload.department_id,
            supervisor_id=payload.supervisor_id,
            title=payload.title.strip(),
            code=payload.code.strip(),
            intern_name=payload.intern_name.strip(),
            intern_email=payload.intern_email,
            institution=payload.institution,
            start_date=payload.start_date,
            end_date=payload.end_date,
            status=payload.status,
            stipend=payload.stipend,
            description=payload.description,
            notes=payload.notes,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(internship)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="internship.create",
            entity_type="internship",
            entity_id=internship.id,
            details={
                "code": internship.code,
                "title": internship.title,
                "intern_name": internship.intern_name,
                "status": internship.status,
            },
        )

        return _build_internship_response(internship)

    @staticmethod
    async def list_internships(
        session: AsyncSession,
        organization_id: UUID,
        search: str | None = None,
        status_filter: str | None = None,
        department_id: UUID | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> PaginatedData[InternshipResponse]:
        stmt = (
            select(Internship)
            .where(Internship.organization_id == organization_id)
            .options(selectinload(Internship.supervisor))
        )

        if status_filter and status_filter != "all":
            stmt = stmt.where(Internship.status == status_filter)
        if department_id:
            stmt = stmt.where(Internship.department_id == department_id)
        if search and search.strip():
            term = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    Internship.title.ilike(term),
                    Internship.code.ilike(term),
                    Internship.intern_name.ilike(term),
                    Internship.institution.ilike(term),
                )
            )

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_res = await session.execute(count_stmt)
        total = total_res.scalar() or 0

        total_pages = ceil(total / page_size) if total > 0 else 1
        offset = (page - 1) * page_size

        stmt = stmt.order_by(Internship.start_date.desc()).offset(offset).limit(page_size)
        res = await session.execute(stmt)
        internships = _to_list(res.scalars())

        items: list[InternshipResponse] = []
        for i in internships:
            sup_count_stmt = select(func.count(InternshipSupervisor.id)).where(
                InternshipSupervisor.internship_id == i.id
            )
            sup_count_res = await session.execute(sup_count_stmt)
            sup_count = sup_count_res.scalar() or 0

            rev_count_stmt = select(func.count(InternshipReview.id)).where(
                InternshipReview.internship_id == i.id
            )
            rev_count_res = await session.execute(rev_count_stmt)
            rev_count = rev_count_res.scalar() or 0

            items.append(_build_internship_response(i, supervisors_count=sup_count, reviews_count=rev_count))

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
    async def get_internship(
        session: AsyncSession,
        organization_id: UUID,
        internship_id: UUID,
    ) -> InternshipDetail:
        stmt = (
            select(Internship)
            .where(
                Internship.organization_id == organization_id,
                Internship.id == internship_id,
            )
            .options(
                selectinload(Internship.supervisor),
                selectinload(Internship.supervisors).selectinload(InternshipSupervisor.employee),
                selectinload(Internship.reviews).selectinload(InternshipReview.reviewer),
            )
        )
        res = await session.execute(stmt)
        internship = res.scalar_one_or_none()
        if not internship:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Internship not found.",
            )

        supervisor_responses = [_build_supervisor_response(s) for s in internship.supervisors]
        review_responses = [_build_review_response(r) for r in internship.reviews]

        resp = _build_internship_response(
            internship,
            supervisors_count=len(internship.supervisors),
            reviews_count=len(internship.reviews),
        )
        return InternshipDetail(
            **resp.model_dump(),
            supervisors=supervisor_responses,
            reviews=review_responses,
        )

    @staticmethod
    async def update_internship(
        session: AsyncSession,
        organization_id: UUID,
        internship_id: UUID,
        actor_user_id: UUID,
        payload: InternshipUpdate,
    ) -> InternshipResponse:
        stmt = (
            select(Internship)
            .where(
                Internship.organization_id == organization_id,
                Internship.id == internship_id,
            )
            .options(selectinload(Internship.supervisor))
        )
        res = await session.execute(stmt)
        internship = res.scalar_one_or_none()
        if not internship:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Internship not found.",
            )

        if payload.code is not None and payload.code.strip() != internship.code:
            code_clean = payload.code.strip()
            existing_stmt = select(Internship).where(
                Internship.organization_id == organization_id,
                Internship.code == code_clean,
                Internship.id != internship_id,
            )
            existing_res = await session.execute(existing_stmt)
            if existing_res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Internship code '{code_clean}' already in use.",
                )
            internship.code = code_clean

        if payload.title is not None:
            internship.title = payload.title.strip()
        if payload.intern_name is not None:
            internship.intern_name = payload.intern_name.strip()
        if payload.intern_email is not None:
            internship.intern_email = payload.intern_email
        if payload.institution is not None:
            internship.institution = payload.institution
        if payload.department_id is not None:
            internship.department_id = payload.department_id
        if payload.supervisor_id is not None:
            internship.supervisor_id = payload.supervisor_id
        if payload.employee_id is not None:
            internship.employee_id = payload.employee_id
        if payload.start_date is not None:
            internship.start_date = payload.start_date
        if payload.end_date is not None:
            internship.end_date = payload.end_date
        if payload.status is not None:
            internship.status = payload.status
        if payload.stipend is not None:
            internship.stipend = payload.stipend
        if payload.description is not None:
            internship.description = payload.description
        if payload.notes is not None:
            internship.notes = payload.notes

        if internship.end_date < internship.start_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="End date cannot be earlier than start date.",
            )

        internship.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="internship.update",
            entity_type="internship",
            entity_id=internship.id,
            details={"updated_fields": list(payload.model_dump(exclude_unset=True).keys())},
        )

        return _build_internship_response(internship)

    @staticmethod
    async def delete_internship(
        session: AsyncSession,
        organization_id: UUID,
        internship_id: UUID,
        actor_user_id: UUID,
    ) -> None:
        stmt = select(Internship).where(
            Internship.organization_id == organization_id,
            Internship.id == internship_id,
        )
        res = await session.execute(stmt)
        internship = res.scalar_one_or_none()
        if not internship:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Internship not found.",
            )

        if internship.status == "active":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete an active internship. Terminate or complete it first.",
            )

        await session.delete(internship)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="internship.delete",
            entity_type="internship",
            entity_id=internship_id,
            details={"code": internship.code, "title": internship.title},
        )

    @staticmethod
    async def _get_internship_or_404(
        session: AsyncSession, organization_id: UUID, internship_id: UUID
    ) -> Internship:
        stmt = select(Internship).where(
            Internship.organization_id == organization_id,
            Internship.id == internship_id,
        )
        res = await session.execute(stmt)
        internship = res.scalar_one_or_none()
        if not internship:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Internship not found.")
        return internship

    @staticmethod
    async def start_internship(
        session: AsyncSession,
        organization_id: UUID,
        internship_id: UUID,
        actor_user_id: UUID,
    ) -> InternshipResponse:
        internship = await InternshipService._get_internship_or_404(session, organization_id, internship_id)

        if internship.status not in ("planned",):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot start internship with status '{internship.status}'. Must be 'planned'.",
            )

        internship.status = "active"
        internship.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="internship.start",
            entity_type="internship",
            entity_id=internship.id,
            details={"status": "active"},
        )
        return _build_internship_response(internship)

    @staticmethod
    async def complete_internship(
        session: AsyncSession,
        organization_id: UUID,
        internship_id: UUID,
        actor_user_id: UUID,
    ) -> InternshipResponse:
        internship = await InternshipService._get_internship_or_404(session, organization_id, internship_id)

        if internship.status not in ("active", "extended"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot complete internship with status '{internship.status}'. Must be 'active' or 'extended'.",
            )

        internship.status = "completed"
        internship.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="internship.complete",
            entity_type="internship",
            entity_id=internship.id,
            details={"status": "completed"},
        )
        return _build_internship_response(internship)

    @staticmethod
    async def extend_internship(
        session: AsyncSession,
        organization_id: UUID,
        internship_id: UUID,
        actor_user_id: UUID,
        payload: InternshipExtend,
    ) -> InternshipResponse:
        internship = await InternshipService._get_internship_or_404(session, organization_id, internship_id)

        if internship.status not in ("active", "planned"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot extend internship with status '{internship.status}'.",
            )

        if payload.new_end_date <= internship.end_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New end date must be after the current end date.",
            )

        old_end_date = internship.end_date
        internship.end_date = payload.new_end_date
        internship.status = "extended"
        if payload.notes:
            internship.notes = payload.notes
        internship.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="internship.extend",
            entity_type="internship",
            entity_id=internship.id,
            details={
                "old_end_date": str(old_end_date),
                "new_end_date": str(payload.new_end_date),
                "status": "extended",
            },
        )
        return _build_internship_response(internship)

    @staticmethod
    async def terminate_internship(
        session: AsyncSession,
        organization_id: UUID,
        internship_id: UUID,
        actor_user_id: UUID,
        payload: InternshipAction,
    ) -> InternshipResponse:
        internship = await InternshipService._get_internship_or_404(session, organization_id, internship_id)

        if internship.status in ("completed", "terminated", "cancelled"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot terminate internship with status '{internship.status}'.",
            )

        internship.status = "terminated"
        if payload.notes:
            internship.notes = payload.notes
        internship.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="internship.terminate",
            entity_type="internship",
            entity_id=internship.id,
            details={"status": "terminated"},
        )
        return _build_internship_response(internship)

    # =========================================================================
    # Supervisors
    # =========================================================================

    @staticmethod
    async def list_supervisors(
        session: AsyncSession,
        organization_id: UUID,
        internship_id: UUID,
    ) -> list[InternshipSupervisorResponse]:
        # Verify internship exists
        await InternshipService._get_internship_or_404(session, organization_id, internship_id)

        stmt = (
            select(InternshipSupervisor)
            .where(
                InternshipSupervisor.organization_id == organization_id,
                InternshipSupervisor.internship_id == internship_id,
            )
            .options(selectinload(InternshipSupervisor.employee))
        )
        res = await session.execute(stmt)
        supervisors = _to_list(res.scalars())
        return [_build_supervisor_response(s) for s in supervisors]

    @staticmethod
    async def add_supervisor(
        session: AsyncSession,
        organization_id: UUID,
        internship_id: UUID,
        actor_user_id: UUID,
        payload: InternshipSupervisorCreate,
    ) -> InternshipSupervisorResponse:
        # Verify internship exists in org
        await InternshipService._get_internship_or_404(session, organization_id, internship_id)

        # Verify employee exists in org
        emp_stmt = select(Employee).where(
            Employee.organization_id == organization_id,
            Employee.id == payload.employee_id,
        )
        emp_res = await session.execute(emp_stmt)
        employee = emp_res.scalar_one_or_none()
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found in organization.",
            )

        # Check duplicate
        dup_stmt = select(InternshipSupervisor).where(
            InternshipSupervisor.organization_id == organization_id,
            InternshipSupervisor.internship_id == internship_id,
            InternshipSupervisor.employee_id == payload.employee_id,
        )
        dup_res = await session.execute(dup_stmt)
        if dup_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Employee is already a supervisor for this internship.",
            )

        supervisor = InternshipSupervisor(
            id=uuid.uuid4(),
            organization_id=organization_id,
            internship_id=internship_id,
            employee_id=payload.employee_id,
            role=payload.role,
            created_at=datetime.now(UTC),
        )
        session.add(supervisor)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="internship.add_supervisor",
            entity_type="internship_supervisor",
            entity_id=supervisor.id,
            details={
                "internship_id": str(internship_id),
                "employee_id": str(payload.employee_id),
                "role": payload.role,
            },
        )

        supervisor.employee = employee
        return _build_supervisor_response(supervisor)

    @staticmethod
    async def remove_supervisor(
        session: AsyncSession,
        organization_id: UUID,
        internship_id: UUID,
        supervisor_id: UUID,
        actor_user_id: UUID,
    ) -> None:
        stmt = select(InternshipSupervisor).where(
            InternshipSupervisor.organization_id == organization_id,
            InternshipSupervisor.internship_id == internship_id,
            InternshipSupervisor.id == supervisor_id,
        )
        res = await session.execute(stmt)
        supervisor = res.scalar_one_or_none()
        if not supervisor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Supervisor not found for this internship.",
            )

        await session.delete(supervisor)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="internship.remove_supervisor",
            entity_type="internship_supervisor",
            entity_id=supervisor_id,
            details={"internship_id": str(internship_id)},
        )

    # =========================================================================
    # Reviews
    # =========================================================================

    @staticmethod
    async def list_reviews(
        session: AsyncSession,
        organization_id: UUID,
        internship_id: UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> PaginatedData[InternshipReviewResponse]:
        # Verify internship exists
        await InternshipService._get_internship_or_404(session, organization_id, internship_id)

        stmt = (
            select(InternshipReview)
            .where(
                InternshipReview.organization_id == organization_id,
                InternshipReview.internship_id == internship_id,
            )
            .options(selectinload(InternshipReview.reviewer))
        )

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_res = await session.execute(count_stmt)
        total = total_res.scalar() or 0

        total_pages = ceil(total / page_size) if total > 0 else 1
        offset = (page - 1) * page_size

        stmt = stmt.order_by(InternshipReview.review_date.desc()).offset(offset).limit(page_size)
        res = await session.execute(stmt)
        reviews = _to_list(res.scalars())

        return PaginatedData(
            items=[_build_review_response(r) for r in reviews],
            meta=PaginationMeta(
                total=total,
                page=page,
                page_size=page_size,
                total_pages=total_pages,
            ),
        )

    @staticmethod
    async def create_review(
        session: AsyncSession,
        organization_id: UUID,
        internship_id: UUID,
        actor_user_id: UUID,
        payload: InternshipReviewCreate,
    ) -> InternshipReviewResponse:
        # Verify internship exists
        await InternshipService._get_internship_or_404(session, organization_id, internship_id)

        # Verify reviewer if provided
        reviewer = None
        if payload.reviewer_id:
            reviewer_stmt = select(Employee).where(
                Employee.organization_id == organization_id,
                Employee.id == payload.reviewer_id,
            )
            reviewer_res = await session.execute(reviewer_stmt)
            reviewer = reviewer_res.scalar_one_or_none()
            if not reviewer:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Reviewer employee not found in organization.",
                )

        review = InternshipReview(
            id=uuid.uuid4(),
            organization_id=organization_id,
            internship_id=internship_id,
            reviewer_id=payload.reviewer_id,
            review_date=payload.review_date,
            rating=payload.rating,
            feedback=payload.feedback,
            status=payload.status,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(review)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="internship.create_review",
            entity_type="internship_review",
            entity_id=review.id,
            details={
                "internship_id": str(internship_id),
                "review_date": str(payload.review_date),
                "status": payload.status,
            },
        )

        if reviewer:
            review.reviewer = reviewer
        return _build_review_response(review)

    @staticmethod
    async def get_review(
        session: AsyncSession,
        organization_id: UUID,
        internship_id: UUID,
        review_id: UUID,
    ) -> InternshipReviewResponse:
        stmt = (
            select(InternshipReview)
            .where(
                InternshipReview.organization_id == organization_id,
                InternshipReview.internship_id == internship_id,
                InternshipReview.id == review_id,
            )
            .options(
                selectinload(InternshipReview.reviewer),
                selectinload(InternshipReview.internship),
            )
        )
        res = await session.execute(stmt)
        review = res.scalar_one_or_none()
        if not review:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Review not found for this internship.",
            )
        return _build_review_response(review)

    @staticmethod
    async def update_review(
        session: AsyncSession,
        organization_id: UUID,
        internship_id: UUID,
        review_id: UUID,
        actor_user_id: UUID,
        payload: InternshipReviewUpdate,
    ) -> InternshipReviewResponse:
        stmt = (
            select(InternshipReview)
            .where(
                InternshipReview.organization_id == organization_id,
                InternshipReview.internship_id == internship_id,
                InternshipReview.id == review_id,
            )
            .options(selectinload(InternshipReview.reviewer))
        )
        res = await session.execute(stmt)
        review = res.scalar_one_or_none()
        if not review:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Review not found for this internship.",
            )

        if payload.review_date is not None:
            review.review_date = payload.review_date
        if payload.rating is not None:
            review.rating = payload.rating
        if payload.feedback is not None:
            review.feedback = payload.feedback
        if payload.reviewer_id is not None:
            review.reviewer_id = payload.reviewer_id
        if payload.status is not None:
            review.status = payload.status

        review.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="internship.update_review",
            entity_type="internship_review",
            entity_id=review.id,
            details={"updated_fields": list(payload.model_dump(exclude_unset=True).keys())},
        )

        return _build_review_response(review)

    @staticmethod
    async def delete_review(
        session: AsyncSession,
        organization_id: UUID,
        internship_id: UUID,
        review_id: UUID,
        actor_user_id: UUID,
    ) -> None:
        stmt = select(InternshipReview).where(
            InternshipReview.organization_id == organization_id,
            InternshipReview.internship_id == internship_id,
            InternshipReview.id == review_id,
        )
        res = await session.execute(stmt)
        review = res.scalar_one_or_none()
        if not review:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Review not found for this internship.",
            )

        await session.delete(review)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="internship.delete_review",
            entity_type="internship_review",
            entity_id=review_id,
            details={"internship_id": str(internship_id)},
        )
