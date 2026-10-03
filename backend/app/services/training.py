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
from app.models.training import TrainingEnrollment, TrainingProgram, TrainingSession
from app.schemas.common import PaginatedData, PaginationMeta
from app.schemas.training import (
    EmployeeSummary,
    TrainingEnrollmentAttend,
    TrainingEnrollmentComplete,
    TrainingEnrollmentCreate,
    TrainingEnrollmentDetail,
    TrainingEnrollmentResponse,
    TrainingEnrollmentUpdate,
    TrainingProgramCreate,
    TrainingProgramDetail,
    TrainingProgramResponse,
    TrainingProgramSummary,
    TrainingProgramUpdate,
    TrainingSessionCreate,
    TrainingSessionDetail,
    TrainingSessionResponse,
    TrainingSessionSummary,
    TrainingSessionUpdate,
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


def _build_program_summary(program: TrainingProgram | None) -> TrainingProgramSummary | None:
    if program is None:
        return None
    return TrainingProgramSummary(
        id=program.id,
        title=program.title,
        code=program.code,
        category=program.category,
        delivery_mode=program.delivery_mode,
        status=program.status,
    )


def _build_session_summary(session: TrainingSession | None) -> TrainingSessionSummary | None:
    if session is None:
        return None
    return TrainingSessionSummary(
        id=session.id,
        session_number=session.session_number,
        title=session.title,
        session_date=session.session_date,
        status=session.status,
    )


def _build_program_response(
    tp: TrainingProgram, enrolled_count: int = 0, sessions_count: int = 0
) -> TrainingProgramResponse:
    return TrainingProgramResponse(
        id=tp.id,
        organization_id=tp.organization_id,
        title=tp.title,
        code=tp.code,
        description=tp.description,
        category=tp.category,
        provider=tp.provider,
        trainer=tp.trainer,
        delivery_mode=tp.delivery_mode,
        duration_hours=tp.duration_hours,
        capacity=tp.capacity,
        cost=tp.cost,
        start_date=tp.start_date,
        end_date=tp.end_date,
        status=tp.status,
        created_at=tp.created_at,
        updated_at=tp.updated_at,
        enrolled_count=enrolled_count,
        sessions_count=sessions_count,
    )


def _build_session_response(
    ts: TrainingSession, enrolled_count: int = 0
) -> TrainingSessionResponse:
    return TrainingSessionResponse(
        id=ts.id,
        organization_id=ts.organization_id,
        training_program_id=ts.training_program_id,
        session_number=ts.session_number,
        title=ts.title,
        session_date=ts.session_date,
        start_time=ts.start_time,
        end_time=ts.end_time,
        location=ts.location,
        trainer=ts.trainer,
        capacity=ts.capacity,
        notes=ts.notes,
        status=ts.status,
        created_at=ts.created_at,
        updated_at=ts.updated_at,
        training_program=_build_program_summary(ts.training_program) if hasattr(ts, "training_program") else None,
        enrolled_count=enrolled_count,
    )


def _build_enrollment_response(te: TrainingEnrollment) -> TrainingEnrollmentResponse:
    return TrainingEnrollmentResponse(
        id=te.id,
        organization_id=te.organization_id,
        training_program_id=te.training_program_id,
        training_session_id=te.training_session_id,
        employee_id=te.employee_id,
        enrollment_date=te.enrollment_date,
        status=te.status,
        completion_date=te.completion_date,
        score=te.score,
        result=te.result,
        certificate_number=te.certificate_number,
        notes=te.notes,
        created_at=te.created_at,
        updated_at=te.updated_at,
        training_program=_build_program_summary(te.training_program) if hasattr(te, "training_program") else None,
        training_session=_build_session_summary(te.training_session) if hasattr(te, "training_session") else None,
        employee=_build_employee_summary(te.employee) if hasattr(te, "employee") else None,
    )


class TrainingService:
    # =========================================================================
    # Training Programs
    # =========================================================================

    @staticmethod
    async def create_program(
        session: AsyncSession,
        organization_id: UUID,
        actor_user_id: UUID,
        payload: TrainingProgramCreate,
    ) -> TrainingProgramResponse:
        # Check duplicate code
        existing_stmt = select(TrainingProgram).where(
            TrainingProgram.organization_id == organization_id,
            TrainingProgram.code == payload.code.strip(),
        )
        existing_res = await session.execute(existing_stmt)
        if existing_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Training program code '{payload.code.strip()}' already exists.",
            )

        if payload.start_date and payload.end_date and payload.end_date < payload.start_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="End date cannot be earlier than start date.",
            )

        program = TrainingProgram(
            id=uuid.uuid4(),
            organization_id=organization_id,
            title=payload.title.strip(),
            code=payload.code.strip(),
            description=payload.description,
            category=payload.category,
            provider=payload.provider,
            trainer=payload.trainer,
            delivery_mode=payload.delivery_mode,
            duration_hours=payload.duration_hours,
            capacity=payload.capacity,
            cost=payload.cost,
            start_date=payload.start_date,
            end_date=payload.end_date,
            status=payload.status,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(program)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="training_program.create",
            entity_type="training_program",
            entity_id=program.id,
            details={
                "code": program.code,
                "title": program.title,
                "delivery_mode": program.delivery_mode,
                "status": program.status,
            },
        )

        return _build_program_response(program)

    @staticmethod
    async def list_programs(
        session: AsyncSession,
        organization_id: UUID,
        search: str | None = None,
        category: str | None = None,
        status_filter: str | None = None,
        delivery_mode: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> PaginatedData[TrainingProgramResponse]:
        stmt = select(TrainingProgram).where(TrainingProgram.organization_id == organization_id)

        if status_filter and status_filter != "all":
            stmt = stmt.where(TrainingProgram.status == status_filter)
        if category and category != "all":
            stmt = stmt.where(TrainingProgram.category == category)
        if delivery_mode and delivery_mode != "all":
            stmt = stmt.where(TrainingProgram.delivery_mode == delivery_mode)
        if search and search.strip():
            term = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    TrainingProgram.title.ilike(term),
                    TrainingProgram.code.ilike(term),
                    TrainingProgram.provider.ilike(term),
                    TrainingProgram.trainer.ilike(term),
                )
            )

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_res = await session.execute(count_stmt)
        total = total_res.scalar() or 0

        total_pages = ceil(total / page_size) if total > 0 else 1
        offset = (page - 1) * page_size

        stmt = stmt.order_by(TrainingProgram.created_at.desc()).offset(offset).limit(page_size)
        res = await session.execute(stmt)
        programs = _to_list(res.scalars())

        items: list[TrainingProgramResponse] = []
        for p in programs:
            enr_stmt = select(func.count(TrainingEnrollment.id)).where(
                TrainingEnrollment.training_program_id == p.id,
                TrainingEnrollment.status != "cancelled",
            )
            enr_res = await session.execute(enr_stmt)
            enrolled_count = enr_res.scalar() or 0

            sess_stmt = select(func.count(TrainingSession.id)).where(
                TrainingSession.training_program_id == p.id
            )
            sess_res = await session.execute(sess_stmt)
            sessions_count = sess_res.scalar() or 0

            items.append(_build_program_response(p, enrolled_count=enrolled_count, sessions_count=sessions_count))

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
    async def get_program(
        session: AsyncSession,
        organization_id: UUID,
        program_id: UUID,
    ) -> TrainingProgramDetail:
        stmt = (
            select(TrainingProgram)
            .where(
                TrainingProgram.organization_id == organization_id,
                TrainingProgram.id == program_id,
            )
            .options(
                selectinload(TrainingProgram.sessions),
                selectinload(TrainingProgram.enrollments).selectinload(TrainingEnrollment.employee),
            )
        )
        res = await session.execute(stmt)
        program = res.scalar_one_or_none()
        if not program:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Training program not found.",
            )

        # Build session responses
        session_responses: list[TrainingSessionResponse] = []
        for s in program.sessions:
            enr_s_stmt = select(func.count(TrainingEnrollment.id)).where(
                TrainingEnrollment.training_session_id == s.id,
                TrainingEnrollment.status != "cancelled",
            )
            enr_s_res = await session.execute(enr_s_stmt)
            enr_s_count = enr_s_res.scalar() or 0
            session_responses.append(_build_session_response(s, enrolled_count=enr_s_count))

        # Build enrollment responses
        enrollment_responses: list[TrainingEnrollmentResponse] = [
            _build_enrollment_response(e) for e in program.enrollments
        ]

        active_enrolled = len([e for e in program.enrollments if e.status != "cancelled"])

        resp = _build_program_response(
            program, enrolled_count=active_enrolled, sessions_count=len(program.sessions)
        )
        return TrainingProgramDetail(
            **resp.model_dump(),
            sessions=session_responses,
            enrollments=enrollment_responses,
        )

    @staticmethod
    async def update_program(
        session: AsyncSession,
        organization_id: UUID,
        program_id: UUID,
        actor_user_id: UUID,
        payload: TrainingProgramUpdate,
    ) -> TrainingProgramResponse:
        stmt = select(TrainingProgram).where(
            TrainingProgram.organization_id == organization_id,
            TrainingProgram.id == program_id,
        )
        res = await session.execute(stmt)
        program = res.scalar_one_or_none()
        if not program:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Training program not found.",
            )

        if payload.code is not None and payload.code.strip() != program.code:
            code_clean = payload.code.strip()
            existing_stmt = select(TrainingProgram).where(
                TrainingProgram.organization_id == organization_id,
                TrainingProgram.code == code_clean,
                TrainingProgram.id != program_id,
            )
            existing_res = await session.execute(existing_stmt)
            if existing_res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Training program code '{code_clean}' already in use.",
                )
            program.code = code_clean

        if payload.title is not None:
            program.title = payload.title.strip()
        if payload.description is not None:
            program.description = payload.description
        if payload.category is not None:
            program.category = payload.category
        if payload.provider is not None:
            program.provider = payload.provider
        if payload.trainer is not None:
            program.trainer = payload.trainer
        if payload.delivery_mode is not None:
            program.delivery_mode = payload.delivery_mode
        if payload.duration_hours is not None:
            program.duration_hours = payload.duration_hours
        if payload.capacity is not None:
            program.capacity = payload.capacity
        if payload.cost is not None:
            program.cost = payload.cost
        if payload.start_date is not None:
            program.start_date = payload.start_date
        if payload.end_date is not None:
            program.end_date = payload.end_date
        if payload.status is not None:
            program.status = payload.status

        if program.start_date and program.end_date and program.end_date < program.start_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="End date cannot be earlier than start date.",
            )

        program.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="training_program.update",
            entity_type="training_program",
            entity_id=program.id,
            details={"updated_fields": list(payload.model_dump(exclude_unset=True).keys())},
        )

        return _build_program_response(program)

    @staticmethod
    async def publish_program(
        session: AsyncSession,
        organization_id: UUID,
        program_id: UUID,
        actor_user_id: UUID,
    ) -> TrainingProgramResponse:
        stmt = select(TrainingProgram).where(
            TrainingProgram.organization_id == organization_id,
            TrainingProgram.id == program_id,
        )
        res = await session.execute(stmt)
        program = res.scalar_one_or_none()
        if not program:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Training program not found.",
            )

        if program.status == "published":
            return _build_program_response(program)

        program.status = "published"
        program.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="training_program.publish",
            entity_type="training_program",
            entity_id=program.id,
            details={"status": "published"},
        )
        return _build_program_response(program)

    @staticmethod
    async def cancel_program(
        session: AsyncSession,
        organization_id: UUID,
        program_id: UUID,
        actor_user_id: UUID,
    ) -> TrainingProgramResponse:
        stmt = select(TrainingProgram).where(
            TrainingProgram.organization_id == organization_id,
            TrainingProgram.id == program_id,
        )
        res = await session.execute(stmt)
        program = res.scalar_one_or_none()
        if not program:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Training program not found.",
            )

        if program.status == "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot cancel a completed training program.",
            )

        program.status = "cancelled"
        program.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="training_program.cancel",
            entity_type="training_program",
            entity_id=program.id,
            details={"status": "cancelled"},
        )
        return _build_program_response(program)

    @staticmethod
    async def complete_program(
        session: AsyncSession,
        organization_id: UUID,
        program_id: UUID,
        actor_user_id: UUID,
    ) -> TrainingProgramResponse:
        stmt = select(TrainingProgram).where(
            TrainingProgram.organization_id == organization_id,
            TrainingProgram.id == program_id,
        )
        res = await session.execute(stmt)
        program = res.scalar_one_or_none()
        if not program:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Training program not found.",
            )

        if program.status == "cancelled":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot complete a cancelled training program.",
            )

        program.status = "completed"
        program.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="training_program.complete",
            entity_type="training_program",
            entity_id=program.id,
            details={"status": "completed"},
        )
        return _build_program_response(program)

    @staticmethod
    async def delete_program(
        session: AsyncSession,
        organization_id: UUID,
        program_id: UUID,
        actor_user_id: UUID,
    ) -> None:
        stmt = select(TrainingProgram).where(
            TrainingProgram.organization_id == organization_id,
            TrainingProgram.id == program_id,
        )
        res = await session.execute(stmt)
        program = res.scalar_one_or_none()
        if not program:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Training program not found.",
            )

        # Check if enrollments exist
        enr_stmt = select(func.count(TrainingEnrollment.id)).where(
            TrainingEnrollment.training_program_id == program_id
        )
        enr_res = await session.execute(enr_stmt)
        if (enr_res.scalar() or 0) > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete program with existing enrollments. Cancel program instead.",
            )

        await session.delete(program)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="training_program.delete",
            entity_type="training_program",
            entity_id=program_id,
            details={"code": program.code, "title": program.title},
        )

    # =========================================================================
    # Training Sessions
    # =========================================================================

    @staticmethod
    async def create_session(
        session: AsyncSession,
        organization_id: UUID,
        actor_user_id: UUID,
        payload: TrainingSessionCreate,
    ) -> TrainingSessionResponse:
        # Validate parent program
        prog_stmt = select(TrainingProgram).where(
            TrainingProgram.organization_id == organization_id,
            TrainingProgram.id == payload.training_program_id,
        )
        prog_res = await session.execute(prog_stmt)
        program = prog_res.scalar_one_or_none()
        if not program:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Training program not found in organization.",
            )

        if program.status == "cancelled":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot schedule sessions for a cancelled training program.",
            )

        # Check duplicate session_number in org
        existing_stmt = select(TrainingSession).where(
            TrainingSession.organization_id == organization_id,
            TrainingSession.session_number == payload.session_number.strip(),
        )
        existing_res = await session.execute(existing_stmt)
        if existing_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Session number '{payload.session_number.strip()}' already exists.",
            )

        sess_capacity = payload.capacity if payload.capacity > 0 else program.capacity

        training_session = TrainingSession(
            id=uuid.uuid4(),
            organization_id=organization_id,
            training_program_id=payload.training_program_id,
            session_number=payload.session_number.strip(),
            title=payload.title,
            session_date=payload.session_date,
            start_time=payload.start_time,
            end_time=payload.end_time,
            location=payload.location,
            trainer=payload.trainer or program.trainer,
            capacity=sess_capacity,
            notes=payload.notes,
            status=payload.status,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(training_session)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="training_session.create",
            entity_type="training_session",
            entity_id=training_session.id,
            details={
                "session_number": training_session.session_number,
                "training_program_id": str(training_session.training_program_id),
                "session_date": str(training_session.session_date),
            },
        )

        training_session.training_program = program
        return _build_session_response(training_session)

    @staticmethod
    async def list_sessions(
        session: AsyncSession,
        organization_id: UUID,
        program_id: UUID | None = None,
        status_filter: str | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> PaginatedData[TrainingSessionResponse]:
        stmt = (
            select(TrainingSession)
            .where(TrainingSession.organization_id == organization_id)
            .options(selectinload(TrainingSession.training_program))
        )

        if program_id:
            stmt = stmt.where(TrainingSession.training_program_id == program_id)
        if status_filter and status_filter != "all":
            stmt = stmt.where(TrainingSession.status == status_filter)
        if search and search.strip():
            term = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    TrainingSession.session_number.ilike(term),
                    TrainingSession.title.ilike(term),
                    TrainingSession.location.ilike(term),
                    TrainingSession.trainer.ilike(term),
                )
            )

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_res = await session.execute(count_stmt)
        total = total_res.scalar() or 0

        total_pages = ceil(total / page_size) if total > 0 else 1
        offset = (page - 1) * page_size

        stmt = stmt.order_by(TrainingSession.session_date.asc()).offset(offset).limit(page_size)
        res = await session.execute(stmt)
        sessions = _to_list(res.scalars())

        items: list[TrainingSessionResponse] = []
        for s in sessions:
            enr_stmt = select(func.count(TrainingEnrollment.id)).where(
                TrainingEnrollment.training_session_id == s.id,
                TrainingEnrollment.status != "cancelled",
            )
            enr_res = await session.execute(enr_stmt)
            enrolled_count = enr_res.scalar() or 0
            items.append(_build_session_response(s, enrolled_count=enrolled_count))

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
    async def get_session(
        session: AsyncSession,
        organization_id: UUID,
        session_id: UUID,
    ) -> TrainingSessionDetail:
        stmt = (
            select(TrainingSession)
            .where(
                TrainingSession.organization_id == organization_id,
                TrainingSession.id == session_id,
            )
            .options(
                selectinload(TrainingSession.training_program),
                selectinload(TrainingSession.enrollments).selectinload(TrainingEnrollment.employee),
            )
        )
        res = await session.execute(stmt)
        ts = res.scalar_one_or_none()
        if not ts:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Training session not found.",
            )

        enrollment_responses: list[TrainingEnrollmentResponse] = [
            _build_enrollment_response(e) for e in ts.enrollments
        ]
        active_count = len([e for e in ts.enrollments if e.status != "cancelled"])

        resp = _build_session_response(ts, enrolled_count=active_count)
        return TrainingSessionDetail(
            **resp.model_dump(),
            enrollments=enrollment_responses,
        )

    @staticmethod
    async def update_session(
        session: AsyncSession,
        organization_id: UUID,
        session_id: UUID,
        actor_user_id: UUID,
        payload: TrainingSessionUpdate,
    ) -> TrainingSessionResponse:
        stmt = (
            select(TrainingSession)
            .where(
                TrainingSession.organization_id == organization_id,
                TrainingSession.id == session_id,
            )
            .options(selectinload(TrainingSession.training_program))
        )
        res = await session.execute(stmt)
        ts = res.scalar_one_or_none()
        if not ts:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Training session not found.",
            )

        if payload.session_number is not None and payload.session_number.strip() != ts.session_number:
            clean_num = payload.session_number.strip()
            existing_stmt = select(TrainingSession).where(
                TrainingSession.organization_id == organization_id,
                TrainingSession.session_number == clean_num,
                TrainingSession.id != session_id,
            )
            existing_res = await session.execute(existing_stmt)
            if existing_res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Session number '{clean_num}' already in use.",
                )
            ts.session_number = clean_num

        if payload.title is not None:
            ts.title = payload.title
        if payload.session_date is not None:
            ts.session_date = payload.session_date
        if payload.start_time is not None:
            ts.start_time = payload.start_time
        if payload.end_time is not None:
            ts.end_time = payload.end_time
        if payload.location is not None:
            ts.location = payload.location
        if payload.trainer is not None:
            ts.trainer = payload.trainer
        if payload.capacity is not None:
            ts.capacity = payload.capacity
        if payload.notes is not None:
            ts.notes = payload.notes
        if payload.status is not None:
            ts.status = payload.status

        ts.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="training_session.update",
            entity_type="training_session",
            entity_id=ts.id,
            details={"updated_fields": list(payload.model_dump(exclude_unset=True).keys())},
        )

        return _build_session_response(ts)

    @staticmethod
    async def delete_session(
        session: AsyncSession,
        organization_id: UUID,
        session_id: UUID,
        actor_user_id: UUID,
    ) -> None:
        stmt = select(TrainingSession).where(
            TrainingSession.organization_id == organization_id,
            TrainingSession.id == session_id,
        )
        res = await session.execute(stmt)
        ts = res.scalar_one_or_none()
        if not ts:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Training session not found.",
            )

        # Check if enrollments exist
        enr_stmt = select(func.count(TrainingEnrollment.id)).where(
            TrainingEnrollment.training_session_id == session_id
        )
        enr_res = await session.execute(enr_stmt)
        if (enr_res.scalar() or 0) > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete session with linked enrollments.",
            )

        await session.delete(ts)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="training_session.delete",
            entity_type="training_session",
            entity_id=session_id,
            details={"session_number": ts.session_number},
        )

    # =========================================================================
    # Training Enrollments
    # =========================================================================

    @staticmethod
    async def enroll_employee(
        session: AsyncSession,
        organization_id: UUID,
        actor_user_id: UUID,
        payload: TrainingEnrollmentCreate,
        actor_employee_id: UUID | None = None,
        can_manage: bool = False,
    ) -> TrainingEnrollmentResponse:
        target_employee_id = payload.employee_id or actor_employee_id
        if not target_employee_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Employee ID is required for enrollment.",
            )

        # If not authorized to manage others, can only enroll self
        if not can_manage and actor_employee_id and target_employee_id != actor_employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot enroll other employees.",
            )

        # Validate employee belongs to organization
        emp_stmt = select(Employee).where(
            Employee.organization_id == organization_id,
            Employee.id == target_employee_id,
        )
        emp_res = await session.execute(emp_stmt)
        employee = emp_res.scalar_one_or_none()
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found in organization.",
            )

        # Validate training program
        prog_stmt = select(TrainingProgram).where(
            TrainingProgram.organization_id == organization_id,
            TrainingProgram.id == payload.training_program_id,
        )
        prog_res = await session.execute(prog_stmt)
        program = prog_res.scalar_one_or_none()
        if not program:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Training program not found.",
            )

        if program.status == "cancelled":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot enroll in a cancelled training program.",
            )

        # Validate session if provided
        training_session: TrainingSession | None = None
        if payload.training_session_id:
            sess_stmt = select(TrainingSession).where(
                TrainingSession.organization_id == organization_id,
                TrainingSession.id == payload.training_session_id,
                TrainingSession.training_program_id == payload.training_program_id,
            )
            sess_res = await session.execute(sess_stmt)
            training_session = sess_res.scalar_one_or_none()
            if not training_session:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Training session not found or does not belong to this program.",
                )

        # Check duplicate active enrollment
        dup_stmt = select(TrainingEnrollment).where(
            TrainingEnrollment.organization_id == organization_id,
            TrainingEnrollment.training_program_id == payload.training_program_id,
            TrainingEnrollment.employee_id == target_employee_id,
            TrainingEnrollment.status != "cancelled",
        )
        dup_res = await session.execute(dup_stmt)
        if dup_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Employee is already enrolled in this training program.",
            )

        # Check program capacity
        if program.capacity > 0:
            enr_count_stmt = select(func.count(TrainingEnrollment.id)).where(
                TrainingEnrollment.training_program_id == program.id,
                TrainingEnrollment.status != "cancelled",
            )
            enr_count_res = await session.execute(enr_count_stmt)
            active_program_enrolled = enr_count_res.scalar() or 0
            if active_program_enrolled >= program.capacity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Training program has reached maximum capacity.",
                )

        # Check session capacity
        if training_session and training_session.capacity > 0:
            sess_count_stmt = select(func.count(TrainingEnrollment.id)).where(
                TrainingEnrollment.training_session_id == training_session.id,
                TrainingEnrollment.status != "cancelled",
            )
            sess_count_res = await session.execute(sess_count_stmt)
            active_session_enrolled = sess_count_res.scalar() or 0
            if active_session_enrolled >= training_session.capacity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Training session has reached maximum capacity.",
                )

        enrollment = TrainingEnrollment(
            id=uuid.uuid4(),
            organization_id=organization_id,
            training_program_id=payload.training_program_id,
            training_session_id=payload.training_session_id,
            employee_id=target_employee_id,
            enrollment_date=payload.enrollment_date or datetime.now(UTC).date(),
            status="enrolled",
            notes=payload.notes,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(enrollment)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="training_enrollment.create",
            entity_type="training_enrollment",
            entity_id=enrollment.id,
            details={
                "training_program_id": str(program.id),
                "employee_id": str(target_employee_id),
                "status": enrollment.status,
            },
        )

        enrollment.training_program = program
        enrollment.training_session = training_session
        enrollment.employee = employee

        return _build_enrollment_response(enrollment)

    @staticmethod
    async def list_enrollments(
        session: AsyncSession,
        organization_id: UUID,
        program_id: UUID | None = None,
        session_id: UUID | None = None,
        employee_id: UUID | None = None,
        status_filter: str | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> PaginatedData[TrainingEnrollmentResponse]:
        stmt = (
            select(TrainingEnrollment)
            .where(TrainingEnrollment.organization_id == organization_id)
            .options(
                selectinload(TrainingEnrollment.training_program),
                selectinload(TrainingEnrollment.training_session),
                selectinload(TrainingEnrollment.employee),
            )
        )

        if program_id:
            stmt = stmt.where(TrainingEnrollment.training_program_id == program_id)
        if session_id:
            stmt = stmt.where(TrainingEnrollment.training_session_id == session_id)
        if employee_id:
            stmt = stmt.where(TrainingEnrollment.employee_id == employee_id)
        if status_filter and status_filter != "all":
            stmt = stmt.where(TrainingEnrollment.status == status_filter)
        if search and search.strip():
            term = f"%{search.strip()}%"
            stmt = stmt.join(TrainingEnrollment.employee).where(
                or_(
                    Employee.first_name.ilike(term),
                    Employee.last_name.ilike(term),
                    Employee.employee_code.ilike(term),
                    TrainingEnrollment.certificate_number.ilike(term),
                )
            )

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_res = await session.execute(count_stmt)
        total = total_res.scalar() or 0

        total_pages = ceil(total / page_size) if total > 0 else 1
        offset = (page - 1) * page_size

        stmt = stmt.order_by(TrainingEnrollment.enrollment_date.desc()).offset(offset).limit(page_size)
        res = await session.execute(stmt)
        enrollments = _to_list(res.scalars())

        items = [_build_enrollment_response(e) for e in enrollments]

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
    async def get_enrollment(
        session: AsyncSession,
        organization_id: UUID,
        enrollment_id: UUID,
        actor_employee_id: UUID | None = None,
        can_manage: bool = False,
    ) -> TrainingEnrollmentDetail:
        stmt = (
            select(TrainingEnrollment)
            .where(
                TrainingEnrollment.organization_id == organization_id,
                TrainingEnrollment.id == enrollment_id,
            )
            .options(
                selectinload(TrainingEnrollment.training_program),
                selectinload(TrainingEnrollment.training_session),
                selectinload(TrainingEnrollment.employee),
            )
        )
        res = await session.execute(stmt)
        te = res.scalar_one_or_none()
        if not te:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Training enrollment not found.",
            )

        if not can_manage and actor_employee_id and te.employee_id != actor_employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this training enrollment.",
            )

        return TrainingEnrollmentDetail(**_build_enrollment_response(te).model_dump())

    @staticmethod
    async def update_enrollment(
        session: AsyncSession,
        organization_id: UUID,
        enrollment_id: UUID,
        actor_user_id: UUID,
        payload: TrainingEnrollmentUpdate,
    ) -> TrainingEnrollmentResponse:
        stmt = (
            select(TrainingEnrollment)
            .where(
                TrainingEnrollment.organization_id == organization_id,
                TrainingEnrollment.id == enrollment_id,
            )
            .options(
                selectinload(TrainingEnrollment.training_program),
                selectinload(TrainingEnrollment.training_session),
                selectinload(TrainingEnrollment.employee),
            )
        )
        res = await session.execute(stmt)
        te = res.scalar_one_or_none()
        if not te:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Training enrollment not found.",
            )

        if payload.training_session_id is not None:
            sess_stmt = select(TrainingSession).where(
                TrainingSession.organization_id == organization_id,
                TrainingSession.id == payload.training_session_id,
                TrainingSession.training_program_id == te.training_program_id,
            )
            sess_res = await session.execute(sess_stmt)
            if not sess_res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Session not found or does not belong to this training program.",
                )
            te.training_session_id = payload.training_session_id

        if payload.status is not None:
            te.status = payload.status
        if payload.completion_date is not None:
            te.completion_date = payload.completion_date
        if payload.score is not None:
            te.score = payload.score
        if payload.result is not None:
            te.result = payload.result
        if payload.certificate_number is not None:
            te.certificate_number = payload.certificate_number
        if payload.notes is not None:
            te.notes = payload.notes

        te.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="training_enrollment.update",
            entity_type="training_enrollment",
            entity_id=te.id,
            details={"updated_fields": list(payload.model_dump(exclude_unset=True).keys())},
        )

        return _build_enrollment_response(te)

    @staticmethod
    async def attend_enrollment(
        session: AsyncSession,
        organization_id: UUID,
        enrollment_id: UUID,
        actor_user_id: UUID,
        payload: TrainingEnrollmentAttend,
    ) -> TrainingEnrollmentResponse:
        stmt = (
            select(TrainingEnrollment)
            .where(
                TrainingEnrollment.organization_id == organization_id,
                TrainingEnrollment.id == enrollment_id,
            )
            .options(
                selectinload(TrainingEnrollment.training_program),
                selectinload(TrainingEnrollment.training_session),
                selectinload(TrainingEnrollment.employee),
            )
        )
        res = await session.execute(stmt)
        te = res.scalar_one_or_none()
        if not te:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Training enrollment not found.",
            )

        if te.status == "cancelled":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot mark attendance for a cancelled enrollment.",
            )

        te.status = payload.status
        if payload.notes:
            te.notes = f"{te.notes}\n{payload.notes}".strip() if te.notes else payload.notes

        te.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="training_enrollment.attend",
            entity_type="training_enrollment",
            entity_id=te.id,
            details={"status": te.status},
        )

        return _build_enrollment_response(te)

    @staticmethod
    async def complete_enrollment(
        session: AsyncSession,
        organization_id: UUID,
        enrollment_id: UUID,
        actor_user_id: UUID,
        payload: TrainingEnrollmentComplete,
    ) -> TrainingEnrollmentResponse:
        stmt = (
            select(TrainingEnrollment)
            .where(
                TrainingEnrollment.organization_id == organization_id,
                TrainingEnrollment.id == enrollment_id,
            )
            .options(
                selectinload(TrainingEnrollment.training_program),
                selectinload(TrainingEnrollment.training_session),
                selectinload(TrainingEnrollment.employee),
            )
        )
        res = await session.execute(stmt)
        te = res.scalar_one_or_none()
        if not te:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Training enrollment not found.",
            )

        if te.status == "cancelled":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot complete a cancelled enrollment.",
            )

        te.status = "completed"
        te.completion_date = payload.completion_date or datetime.now(UTC).date()
        if payload.score is not None:
            te.score = payload.score
        if payload.result is not None:
            te.result = payload.result
        if payload.certificate_number is not None:
            te.certificate_number = payload.certificate_number
        if payload.notes:
            te.notes = f"{te.notes}\n{payload.notes}".strip() if te.notes else payload.notes

        te.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="training_enrollment.complete",
            entity_type="training_enrollment",
            entity_id=te.id,
            details={
                "status": "completed",
                "result": te.result,
                "certificate_number": te.certificate_number,
            },
        )

        return _build_enrollment_response(te)

    @staticmethod
    async def cancel_enrollment(
        session: AsyncSession,
        organization_id: UUID,
        enrollment_id: UUID,
        actor_user_id: UUID,
        actor_employee_id: UUID | None = None,
        can_manage: bool = False,
    ) -> TrainingEnrollmentResponse:
        stmt = (
            select(TrainingEnrollment)
            .where(
                TrainingEnrollment.organization_id == organization_id,
                TrainingEnrollment.id == enrollment_id,
            )
            .options(
                selectinload(TrainingEnrollment.training_program),
                selectinload(TrainingEnrollment.training_session),
                selectinload(TrainingEnrollment.employee),
            )
        )
        res = await session.execute(stmt)
        te = res.scalar_one_or_none()
        if not te:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Training enrollment not found.",
            )

        if not can_manage and actor_employee_id and te.employee_id != actor_employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot cancel other employees' enrollments.",
            )

        if te.status == "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot cancel a completed enrollment.",
            )

        te.status = "cancelled"
        te.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="training_enrollment.cancel",
            entity_type="training_enrollment",
            entity_id=te.id,
            details={"status": "cancelled"},
        )

        return _build_enrollment_response(te)
