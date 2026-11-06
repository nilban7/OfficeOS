from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session
from app.schemas.common import ApiSuccess
from app.schemas.kiosk import (
    KioskActivationCodeCreate,
    KioskActivationCodeResponse,
    KioskDeviceResponse,
    KioskDeviceUpdateRequest,
    KioskPunchAuditItem,
)
from app.services.kiosk import KioskService

router = APIRouter(prefix="/admin/kiosks", tags=["Admin Kiosks"])


def get_org_id(org_header: Annotated[str | None, Header(alias="X-Organization-Id")]) -> UUID:
    if not org_header:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization context required.")
    try:
        return UUID(org_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid organization id.") from exc


@router.get(
    "",
    response_model=ApiSuccess[list[KioskDeviceResponse]],
    summary="List all registered kiosk hardware devices for the active organization",
)
async def list_kiosks(
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    org_header: Annotated[str | None, Header(alias="X-Organization-Id")] = None,
) -> ApiSuccess[list[KioskDeviceResponse]]:
    org_id = get_org_id(org_header)
    devices = await KioskService.list_kiosks(session, org_id)
    return ApiSuccess(data=devices)


@router.post(
    "/generate-code",
    response_model=ApiSuccess[KioskActivationCodeResponse],
    summary="Generate a secret activation code to pair a new kiosk tablet",
)
async def generate_kiosk_activation_code(
    req: KioskActivationCodeCreate,
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    org_header: Annotated[str | None, Header(alias="X-Organization-Id")] = None,
) -> ApiSuccess[KioskActivationCodeResponse]:
    org_id = get_org_id(org_header)
    code_resp = await KioskService.generate_activation_code(
        session, org_id, UUID(current_user.id), req
    )
    return ApiSuccess(
        data=code_resp,
        message=f"Secret activation code generated: {code_resp.secret_code}. Enter this code on the kiosk tab.",
    )


@router.get(
    "/activation-codes",
    response_model=ApiSuccess[list[KioskActivationCodeResponse]],
    summary="List recent activation codes and their status",
)
async def list_kiosk_activation_codes(
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    org_header: Annotated[str | None, Header(alias="X-Organization-Id")] = None,
) -> ApiSuccess[list[KioskActivationCodeResponse]]:
    org_id = get_org_id(org_header)
    codes = await KioskService.list_activation_codes(session, org_id)
    return ApiSuccess(data=codes)


@router.patch(
    "/{kiosk_id}",
    response_model=ApiSuccess[KioskDeviceResponse],
    summary="Update kiosk device policies, verification modes, IP range, or name",
)
async def update_kiosk_device(
    kiosk_id: UUID,
    req: KioskDeviceUpdateRequest,
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    org_header: Annotated[str | None, Header(alias="X-Organization-Id")] = None,
) -> ApiSuccess[KioskDeviceResponse]:
    org_id = get_org_id(org_header)
    updated = await KioskService.update_kiosk(session, org_id, kiosk_id, req)
    return ApiSuccess(data=updated, message="Kiosk configuration updated successfully.")


@router.delete(
    "/{kiosk_id}",
    response_model=ApiSuccess[dict],
    summary="Unpair and remove a kiosk device",
)
async def delete_kiosk_device(
    kiosk_id: UUID,
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    org_header: Annotated[str | None, Header(alias="X-Organization-Id")] = None,
) -> ApiSuccess[dict]:
    org_id = get_org_id(org_header)
    await KioskService.delete_kiosk(session, org_id, kiosk_id)
    return ApiSuccess(data={"deleted": True}, message="Kiosk device unpaired and deleted.")


@router.get(
    "/punches",
    response_model=ApiSuccess[list[KioskPunchAuditItem]],
    summary="Live kiosk punch audit feed with photo snapshots and telemetry",
)
async def list_kiosk_punches(
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    org_header: Annotated[str | None, Header(alias="X-Organization-Id")] = None,
    limit: int = Query(default=50, ge=1, le=200),
) -> ApiSuccess[list[KioskPunchAuditItem]]:
    org_id = get_org_id(org_header)
    punches = await KioskService.list_kiosk_punches(session, org_id, limit=limit)
    return ApiSuccess(data=punches)
