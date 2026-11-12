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
    custom_code: str | None = Field(default=None, max_length=32)


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
    secret_code: str | None = Field(default=None, max_length=64)
    code: str | None = Field(default=None, max_length=64)
    device_identifier: str | None = Field(default=None, max_length=255)
    device_name: str = Field(..., min_length=1, max_length=150)
    device_model: str | None = None
    app_version: str | None = "1.0.0"
    battery_level: int | None = None

    def get_code(self) -> str:
        raw = self.secret_code or self.code or ""
        return raw.strip()


class KioskDeviceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    branch_id: UUID | None = None
    device_name: str
    name: str | None = None
    device_identifier: str
    is_activated: bool
    activated_at: datetime | None = None
    verification_modes: dict[str, Any]
    allowed_modes: list[str] | None = None
    ip_tracking_enabled: bool
    allowed_ip_range: str | None = None
    last_known_ip: str | None = None
    ip_address: str | None = None
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
    kiosk_token: str | None = None
    organization_name: str
    branch_name: str | None = None
    kiosk_id: UUID | None = None
    organization_id: UUID | None = None
    device_name: str | None = None
    allowed_modes: list[str] = ["pin", "face", "qr", "fingerprint"]
    exit_pin: str = "9999"


class KioskHeartbeatRequest(BaseModel):
    battery_level: int | None = None
    app_version: str | None = None
    is_charging: bool | None = None


class KioskPunchRequest(BaseModel):
    employee_code: str | None = None
    employee_identifier: str | None = None
    employee_pin: str | None = None
    pin_code: str | None = None
    biometric_data: str | None = None
    face_snapshot_data: str | None = None
    face_snapshot_base64: str | None = None
    punch_type: str = Field(..., pattern="^(check_in|check_out|in|out)$")
    verification_method: str = Field(default="kiosk_face")
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    device_timestamp: str | None = None

    def get_employee_code(self) -> str:
        return (self.employee_code or self.employee_identifier or "").strip()

    def get_employee_pin(self) -> str:
        return (self.employee_pin or self.pin_code or "").strip()

    def get_face_snapshot(self) -> str | None:
        return self.face_snapshot_data or self.face_snapshot_base64

    def get_normalized_punch_type(self) -> str:
        if self.punch_type in ("in", "check_in"):
            return "check_in"
        return "check_out"


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
    punched_at: str | None = None
    verification_method: str
    face_snapshot_url: str | None = None
    department: str | None = None
    avatar_url: str | None = None
    work_duration_hours: float | None = None


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


class KioskEmployeeStatusItem(BaseModel):
    id: UUID
    code: str
    name: str
    role: str
    department: str
    initials: str
    is_enrolled: bool = False
    credential_id: str | None = None
    raw_id_base64: str | None = None
    finger_label: str | None = None
    enrolled_at: str | None = None
    today_status: str | None = None  # "in" | "out" | "completed" | None
    punched_at: str | None = None
    check_in_time: str | None = None
    check_out_time: str | None = None
    shift_completed: bool = False
    duration_hours: float | None = None
    attendance_status: str | None = None  # "present" | "half_day" | "late"


class KioskBiometricRegisterRequest(BaseModel):
    employee_code: str = Field(..., min_length=1, max_length=32)
    credential_id: str = Field(..., min_length=1, max_length=500)
    raw_id_base64: str | None = None
    finger_label: str | None = "Biometric"
    device_model: str | None = None


class KioskBiometricResetRequest(BaseModel):
    employee_code: str | None = None
    reset_all: bool = False
    exit_pin: str | None = None
