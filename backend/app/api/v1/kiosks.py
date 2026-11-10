from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.models.kiosk import KioskDevice
from app.schemas.common import ApiSuccess
from app.schemas.kiosk import (
    KioskActivateResponse,
    KioskBiometricRegisterRequest,
    KioskBiometricResetRequest,
    KioskDeviceActivateRequest,
    KioskDeviceResponse,
    KioskEmployeeStatusItem,
    KioskExitPinVerifyRequest,
    KioskHeartbeatRequest,
    KioskPunchRequest,
    KioskPunchResponse,
)
from app.services.kiosk import KioskService

router = APIRouter(prefix="/kiosks", tags=["Kiosks"])


async def get_authenticated_kiosk(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    kiosk_token: Annotated[str | None, Header(alias="X-Kiosk-Token")] = None,
) -> tuple[AsyncSession, KioskDevice]:
    if not kiosk_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kiosk authentication required. X-Kiosk-Token header missing.",
        )
    device = await KioskService.get_device_by_token(session, kiosk_token)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or deactivated kiosk device token. Please re-pair kiosk.",
        )
    return session, device


def extract_client_ip(request: Request) -> str | None:
    # Check X-Forwarded-For or client host
    x_forwarded = request.headers.get("x-forwarded-for")
    if x_forwarded:
        return x_forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@router.post(
    "/activate",
    response_model=ApiSuccess[KioskActivateResponse],
    summary="Activate and pair a new physical kiosk tablet using Owner's Secret Activation Code",
)
async def activate_kiosk_device(
    req: KioskDeviceActivateRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ApiSuccess[KioskActivateResponse]:
    client_ip = extract_client_ip(request)
    device, token, org_name, branch_name = await KioskService.activate_device(
        session, req, client_ip=client_ip
    )

    device_resp = KioskDeviceResponse(
        id=device.id,
        organization_id=device.organization_id,
        branch_id=device.branch_id,
        branch_name=branch_name,
        device_name=device.device_name,
        device_identifier=device.device_identifier,
        is_activated=device.is_activated,
        activated_at=device.activated_at,
        verification_modes=device.verification_modes or {},
        ip_tracking_enabled=device.ip_tracking_enabled,
        allowed_ip_range=device.allowed_ip_range,
        last_known_ip=device.last_known_ip,
        battery_level=device.battery_level,
        app_version=device.app_version,
        last_heartbeat_at=device.last_heartbeat_at,
        is_active=device.is_active,
        created_at=device.created_at,
        updated_at=device.updated_at,
        status="online",
    )

    return ApiSuccess(
        data=KioskActivateResponse(
            device=device_resp,
            device_token=token,
            kiosk_token=token,
            organization_name=org_name,
            branch_name=branch_name,
            kiosk_id=device.id,
            organization_id=device.organization_id,
            device_name=device.device_name,
        ),
        message=f"Kiosk terminal successfully paired and locked to {org_name}.",
    )


@router.get(
    "/config",
    response_model=ApiSuccess[KioskDeviceResponse],
    summary="Retrieve current active configuration and branch branding for paired kiosk",
)
async def get_kiosk_config(
    kiosk_auth: Annotated[tuple[AsyncSession, KioskDevice], Depends(get_authenticated_kiosk)],
) -> ApiSuccess[KioskDeviceResponse]:
    _, device = kiosk_auth
    branch_name = device.branch.name if device.branch else None

    return ApiSuccess(
        data=KioskDeviceResponse(
            id=device.id,
            organization_id=device.organization_id,
            branch_id=device.branch_id,
            branch_name=branch_name,
            device_name=device.device_name,
            device_identifier=device.device_identifier,
            is_activated=device.is_activated,
            activated_at=device.activated_at,
            verification_modes=device.verification_modes or {},
            ip_tracking_enabled=device.ip_tracking_enabled,
            allowed_ip_range=device.allowed_ip_range,
            last_known_ip=device.last_known_ip,
            battery_level=device.battery_level,
            app_version=device.app_version,
            last_heartbeat_at=device.last_heartbeat_at,
            is_active=device.is_active,
            created_at=device.created_at,
            updated_at=device.updated_at,
            status="online",
        )
    )


@router.post(
    "/heartbeat",
    response_model=ApiSuccess[dict],
    summary="Kiosk terminal telemetry ping",
)
async def kiosk_heartbeat(
    req: KioskHeartbeatRequest,
    request: Request,
    kiosk_auth: Annotated[tuple[AsyncSession, KioskDevice], Depends(get_authenticated_kiosk)],
) -> ApiSuccess[dict]:
    session, device = kiosk_auth
    client_ip = extract_client_ip(request)
    await KioskService.record_heartbeat(session, device, req, client_ip=client_ip)
    return ApiSuccess(data={"status": "acknowledged", "server_time": device.last_heartbeat_at})


@router.post(
    "/verify-exit-pin",
    response_model=ApiSuccess[dict],
    summary="Verify Organization Owner's Master Exit PIN to access kiosk admin settings or unpair tablet",
)
async def verify_kiosk_exit_pin(
    req: KioskExitPinVerifyRequest,
    kiosk_auth: Annotated[tuple[AsyncSession, KioskDevice], Depends(get_authenticated_kiosk)],
) -> ApiSuccess[dict]:
    _, device = kiosk_auth
    is_valid = KioskService.verify_exit_pin(device, req.exit_pin)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect Master Exit PIN. Access denied.",
        )
    return ApiSuccess(data={"valid": True, "message": "Exit PIN verified."})


@router.post(
    "/attendance/punch",
    response_model=ApiSuccess[KioskPunchResponse],
    summary="Submit attendance punch from kiosk terminal with multi-modal verification",
)
async def submit_kiosk_punch(
    req: KioskPunchRequest,
    request: Request,
    kiosk_auth: Annotated[tuple[AsyncSession, KioskDevice], Depends(get_authenticated_kiosk)],
) -> ApiSuccess[KioskPunchResponse]:
    session, device = kiosk_auth
    client_ip = extract_client_ip(request)
    punch_res = await KioskService.process_kiosk_punch(session, device, req, client_ip=client_ip)
    return ApiSuccess(data=punch_res, message=punch_res.message)


@router.get(
    "/employees",
    response_model=ApiSuccess[list[KioskEmployeeStatusItem]],
    summary="Get active organization employees with biometric registration and today attendance status",
)
async def get_kiosk_employees(
    kiosk_auth: Annotated[tuple[AsyncSession, KioskDevice], Depends(get_authenticated_kiosk)],
) -> ApiSuccess[list[KioskEmployeeStatusItem]]:
    session, device = kiosk_auth
    items = await KioskService.get_kiosk_employees_status(session, device)
    return ApiSuccess(data=items, message="Kiosk employees status retrieved.")


@router.post(
    "/biometrics/register",
    response_model=ApiSuccess[dict],
    summary="Register and permanently lock an employee biometric credential on the backend",
)
async def register_kiosk_biometric(
    req: KioskBiometricRegisterRequest,
    kiosk_auth: Annotated[tuple[AsyncSession, KioskDevice], Depends(get_authenticated_kiosk)],
) -> ApiSuccess[dict]:
    session, device = kiosk_auth
    res = await KioskService.register_biometric(session, device, req)
    return ApiSuccess(data=res, message=res["message"])


@router.post(
    "/biometrics/reset",
    response_model=ApiSuccess[dict],
    summary="Reset single or all employee biometrics (authorized via Master Exit PIN)",
)
async def reset_kiosk_biometrics(
    req: KioskBiometricResetRequest,
    kiosk_auth: Annotated[tuple[AsyncSession, KioskDevice], Depends(get_authenticated_kiosk)],
) -> ApiSuccess[dict]:
    session, device = kiosk_auth
    res = await KioskService.reset_biometrics(session, device, req)
    return ApiSuccess(data=res, message=res["message"])

