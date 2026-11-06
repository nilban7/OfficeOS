from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class KioskVerificationModes(BaseModel):
    face_camera: bool = True
    fingerprint: bool = True
    pin: bool = True
    qr_badge: bool = True


class KioskActivationCodeCreate(BaseModel):
    branch_id: UUID | None = None
    valid_hours: int = Field(default=24, ge=1, le=168)


class KioskActivationCodeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    secret_code: str | None = None
    code_preview: str
    branch_id: UUID | None = None
    branch_name: str | None = None
    expires_at: datetime
    is_used: bool
    created_at: datetime


class KioskDeviceActivateRequest(BaseModel):
    secret_code: str = Field(..., min_length=4, max_length=32)
    device_identifier: str = Field(..., min_length=4, max_length=255)
    device_name: str = Field(..., min_length=1, max_length=150)
    app_version: str | None = "1.0.0"
    battery_level: int | None = None


class KioskDeviceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    branch_id: UUID | None = None
    device_name: str
    device_identifier: str
    is_activated: bool
    activated_at: datetime | None = None
    verification_modes: dict[str, Any]
    ip_tracking_enabled: bool
    allowed_ip_range: str | None = None
    last_known_ip: str | None = None
    battery_level: int | None = None
    app_version: str | None = None
    last_heartbeat_at: datetime | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    branch_name: str | None = None
    status: str = "offline"  # online, offline, pending


class KioskActivateResponse(BaseModel):
    device: KioskDeviceResponse
    device_token: str
    organization_name: str
    branch_name: str | None = None


class KioskHeartbeatRequest(BaseModel):
    battery_level: int | None = None
    app_version: str | None = None


class KioskPunchRequest(BaseModel):
    employee_code: str | None = None
    employee_pin: str | None = None
    biometric_data: str | None = None
    face_snapshot_data: str | None = None
    punch_type: str = Field(..., pattern="^(check_in|check_out)$")
    verification_method: str = Field(default="kiosk_face")
    latitude: Decimal | None = None
    longitude: Decimal | None = None


class KioskPunchResponse(BaseModel):
    success: bool
    message: str
    punch_type: str
    employee_id: UUID
    employee_name: str
    employee_code: str
    work_date: date
    check_in_at: datetime | None = None
    check_out_at: datetime | None = None
    verification_method: str
    face_snapshot_url: str | None = None


class KioskExitPinVerifyRequest(BaseModel):
    exit_pin: str = Field(..., min_length=4, max_length=16)


class KioskDeviceUpdateRequest(BaseModel):
    device_name: str | None = None
    branch_id: UUID | None = None
    allowed_ip_range: str | None = None
    verification_modes: dict[str, Any] | None = None
    ip_tracking_enabled: bool | None = None
    is_active: bool | None = None
    exit_pin: str | None = None


class KioskPunchAuditItem(BaseModel):
    id: UUID
    employee_id: UUID
    employee_name: str
    employee_code: str
    work_date: date
    check_in_at: datetime | None = None
    check_out_at: datetime | None = None
    verification_method: str
    face_snapshot_url: str | None = None
    client_ip: str | None = None
    device_name: str | None = None
