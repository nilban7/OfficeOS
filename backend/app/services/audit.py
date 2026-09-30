import math
import uuid
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.audit import AuditLog
from app.models.identity import Profile
from app.schemas.audit import (
    ActorSummary,
    AuditLogResponse,
    sanitize_sensitive_data,
)
from app.schemas.common import PaginatedData, PaginationMeta


class AuditLogService:
    @staticmethod
    async def record_audit_log(
        session: AsyncSession,
        organization_id: UUID,
        actor_id: UUID | None,
        action: str,
        entity_type: str,
        entity_id: UUID | None,
        details: dict[str, Any] | None = None,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Centralized write helper for recording immutable audit logs."""
        clean_details = sanitize_sensitive_data(details) if details else {}
        log_entry = AuditLog(
            id=uuid.uuid4(),
            organization_id=organization_id,
            actor_id=actor_id,
            action=action.strip(),
            entity_type=entity_type.strip(),
            entity_id=entity_id,
            details=clean_details,
            ip_address=ip_address.strip() if ip_address else None,
            created_at=datetime.now(UTC),
        )
        session.add(log_entry)
        return log_entry

    @staticmethod
    async def list_audit_logs(
        session: AsyncSession,
        organization_id: UUID,
        actor_id: UUID | None = None,
        action: str | None = None,
        entity_type: str | None = None,
        entity_id: UUID | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> PaginatedData[AuditLogResponse]:
        """Paginated, filtered query for organization audit logs."""
        page = max(1, page)
        page_size = max(1, min(page_size, 100))

        conditions = [AuditLog.organization_id == organization_id]

        if actor_id:
            conditions.append(AuditLog.actor_id == actor_id)
        if action and action.strip():
            conditions.append(AuditLog.action == action.strip())
        if entity_type and entity_type.strip():
            conditions.append(AuditLog.entity_type == entity_type.strip())
        if entity_id:
            conditions.append(AuditLog.entity_id == entity_id)
        if date_from:
            conditions.append(AuditLog.created_at >= date_from)
        if date_to:
            conditions.append(AuditLog.created_at <= date_to)

        search_join_needed = False
        if search and search.strip():
            search_join_needed = True
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    AuditLog.action.ilike(term),
                    AuditLog.entity_type.ilike(term),
                    AuditLog.ip_address.ilike(term),
                    Profile.email.ilike(term),
                    Profile.first_name.ilike(term),
                    Profile.last_name.ilike(term),
                )
            )

        # Count total items
        count_stmt = select(func.count(func.distinct(AuditLog.id))).where(*conditions)
        if search_join_needed:
            count_stmt = count_stmt.outerjoin(Profile, Profile.id == AuditLog.actor_id)
        total_items = (await session.scalar(count_stmt)) or 0

        # Query items with eager-loaded actor profile
        query = (
            select(AuditLog)
            .options(selectinload(AuditLog.actor))
            .where(*conditions)
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        if search_join_needed:
            query = query.outerjoin(Profile, Profile.id == AuditLog.actor_id)

        rows = (await session.scalars(query)).all()

        items: list[AuditLogResponse] = []
        for log in rows:
            actor_summary = None
            if log.actor:
                actor_summary = ActorSummary(
                    id=log.actor.id,
                    email=log.actor.email,
                    first_name=log.actor.first_name,
                    last_name=log.actor.last_name,
                )
            items.append(
                AuditLogResponse(
                    id=log.id,
                    organization_id=log.organization_id,
                    actor_id=log.actor_id,
                    actor=actor_summary,
                    actor_email=actor_summary.email if actor_summary else None,
                    action=log.action,
                    entity_type=log.entity_type,
                    entity_id=log.entity_id,
                    details=sanitize_sensitive_data(log.details) if log.details else {},
                    ip_address=log.ip_address,
                    created_at=log.created_at,
                )
            )

        total_pages = math.ceil(total_items / page_size) if total_items > 0 else 1

        return PaginatedData(
            items=items,
            meta=PaginationMeta(
                total=total_items,
                page=page,
                page_size=page_size,
                total_pages=total_pages,
            ),
        )

    @staticmethod
    async def get_audit_log(
        session: AsyncSession,
        organization_id: UUID,
        log_id: UUID,
    ) -> AuditLogResponse:
        """Retrieve single audit log entry ensuring tenant isolation."""
        query = (
            select(AuditLog)
            .options(selectinload(AuditLog.actor))
            .where(
                AuditLog.id == log_id,
                AuditLog.organization_id == organization_id,
            )
        )
        log = await session.scalar(query)
        if not log:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Audit log entry '{log_id}' not found",
            )

        actor_summary = None
        if log.actor:
            actor_summary = ActorSummary(
                id=log.actor.id,
                email=log.actor.email,
                first_name=log.actor.first_name,
                last_name=log.actor.last_name,
            )

        return AuditLogResponse(
            id=log.id,
            organization_id=log.organization_id,
            actor_id=log.actor_id,
            actor=actor_summary,
            actor_email=actor_summary.email if actor_summary else None,
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            details=sanitize_sensitive_data(log.details) if log.details else {},
            ip_address=log.ip_address,
            created_at=log.created_at,
        )


record_audit_log = AuditLogService.record_audit_log
list_audit_logs = AuditLogService.list_audit_logs
get_audit_log = AuditLogService.get_audit_log
