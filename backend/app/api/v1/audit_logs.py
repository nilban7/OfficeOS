from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.tenant import require_permission
from app.schemas.audit import AuditLogResponse
from app.schemas.common import ApiSuccess, PaginatedData
from app.services.audit import AuditLogService

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


@router.get("", response_model=ApiSuccess[PaginatedData[AuditLogResponse]])
async def list_audit_logs(
    session: Annotated[AsyncSession, Depends(require_permission("audit_logs.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    actor_id: Annotated[UUID | None, Query(description="Filter by actor ID")] = None,
    action: Annotated[str | None, Query(description="Filter by action code")] = None,
    entity_type: Annotated[str | None, Query(description="Filter by resource / entity type")] = None,
    entity_id: Annotated[UUID | None, Query(description="Filter by resource / entity ID")] = None,
    date_from: Annotated[datetime | None, Query(description="Filter by minimum timestamp")] = None,
    date_to: Annotated[datetime | None, Query(description="Filter by maximum timestamp")] = None,
    search: Annotated[str | None, Query(description="Search term for actions, types, IP, or actors")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Page size (max 100)")] = 20,
) -> ApiSuccess[PaginatedData[AuditLogResponse]]:
    """List paginated audit logs for the current organization."""
    try:
        org_id = UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id"
        ) from exc

    data = await AuditLogService.list_audit_logs(
        session=session,
        organization_id=org_id,
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        date_from=date_from,
        date_to=date_to,
        search=search,
        page=page,
        page_size=page_size,
    )
    return ApiSuccess(data=data)


@router.get("/{audit_log_id}", response_model=ApiSuccess[AuditLogResponse])
async def get_audit_log_detail(
    audit_log_id: UUID,
    session: Annotated[AsyncSession, Depends(require_permission("audit_logs.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[AuditLogResponse]:
    """Retrieve details of a specific audit log entry."""
    try:
        org_id = UUID(organization_header)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id"
        ) from exc

    log = await AuditLogService.get_audit_log(
        session=session,
        organization_id=org_id,
        log_id=audit_log_id,
    )
    return ApiSuccess(data=log)
