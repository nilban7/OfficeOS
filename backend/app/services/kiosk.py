import hashlib
import ipaddress
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.attendance import AttendanceRecord
from app.models.employee import Employee
from app.models.identity import Branch, Organization
from app.models.kiosk import KioskActivationCode, KioskDevice
from app.schemas.kiosk import (
    KioskActivationCodeCreate,
    KioskActivationCodeResponse,
    KioskDeviceActivateRequest,
    KioskDeviceResponse,
    KioskDeviceUpdateRequest,
    KioskHeartbeatRequest,
    KioskPunchAuditItem,
    KioskPunchRequest,
    KioskPunchResponse,
)


class KioskService:
    @staticmethod
    def _hash_value(val: str) -> str:
        return hashlib.sha256(val.strip().encode("utf-8")).hexdigest()

    @classmethod
    async def generate_activation_code(
        cls,
        db: AsyncSession,
        org_id: uuid.UUID,
        created_by_id: uuid.UUID,
        req: KioskActivationCodeCreate,
    ) -> KioskActivationCodeResponse:
        # Generate human-friendly code: e.g. OS-7429-81
        random_part = f"{secrets.randbelow(8999) + 1000}-{secrets.randbelow(89) + 10}"
        raw_code = f"OS-{random_part}"
        code_hash = cls._hash_value(raw_code.upper())
        expires_at = datetime.now(UTC) + timedelta(hours=req.valid_hours)

        now = datetime.now(UTC)
        record = KioskActivationCode(
            id=uuid.uuid4(),
            organization_id=org_id,
            branch_id=req.branch_id,
            code_hash=code_hash,
            code_preview=f"OS-****-{raw_code[-2:]}",
            created_by_id=created_by_id,
            expires_at=expires_at,
            is_used=False,
            created_at=now,
        )
        db.add(record)
        await db.commit()

        # Get branch name if available
        branch_name = None
        if record.branch_id:
            branch_res = await db.execute(select(Branch.name).where(Branch.id == record.branch_id))
            branch_name = branch_res.scalar_one_or_none()

        return KioskActivationCodeResponse(
            id=record.id,
            secret_code=raw_code,
            code_preview=record.code_preview,
            branch_id=record.branch_id,
            branch_name=branch_name,
            expires_at=record.expires_at,
            is_used=record.is_used,
            created_at=record.created_at,
        )

    @classmethod
    async def list_activation_codes(
        cls, db: AsyncSession, org_id: uuid.UUID
    ) -> list[KioskActivationCodeResponse]:
        query = (
            select(KioskActivationCode)
            .options(selectinload(KioskActivationCode.branch))
            .where(KioskActivationCode.organization_id == org_id)
            .order_by(desc(KioskActivationCode.created_at))
            .limit(50)
        )
        res = await db.execute(query)
        records = res.scalars().all()
        return [
            KioskActivationCodeResponse(
                id=r.id,
                secret_code=None,
                code_preview=r.code_preview,
                branch_id=r.branch_id,
                branch_name=r.branch.name if r.branch else None,
                expires_at=r.expires_at,
                is_used=r.is_used,
                created_at=r.created_at,
            )
            for r in records
        ]

    @classmethod
    async def activate_device(
        cls,
        db: AsyncSession,
        req: KioskDeviceActivateRequest,
        client_ip: str | None = None,
    ) -> tuple[KioskDevice, str, str, str | None]:
        code_hash = cls._hash_value(req.secret_code.upper())
        now = datetime.now(UTC)

        # Find valid activation code
        query = select(KioskActivationCode).where(
            KioskActivationCode.code_hash == code_hash,
            KioskActivationCode.is_used.is_(False),
            KioskActivationCode.expires_at > now,
        )
        res = await db.execute(query)
        activation_code = res.scalar_one_or_none()

        if not activation_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired secret activation code. Please request a new code from the administrator.",
            )

        org_id = activation_code.organization_id
        branch_id = activation_code.branch_id

        # Generate unique device token
        raw_device_token = f"kiosk_{secrets.token_urlsafe(32)}"
        token_hash = cls._hash_value(raw_device_token)
        default_exit_pin_hash = cls._hash_value("9999")

        # Check if device identifier already exists in org
        dev_res = await db.execute(
            select(KioskDevice).where(
                KioskDevice.organization_id == org_id,
                KioskDevice.device_identifier == req.device_identifier,
            )
        )
        device = dev_res.scalar_one_or_none()

        if device:
            device.device_name = req.device_name
            device.branch_id = branch_id
            device.is_activated = True
            device.activated_at = now
            device.device_token_hash = token_hash
            device.last_known_ip = client_ip
            device.battery_level = req.battery_level
            device.app_version = req.app_version
            device.last_heartbeat_at = now
            device.is_active = True
            if not device.exit_pin_hash:
                device.exit_pin_hash = default_exit_pin_hash
        else:
            device = KioskDevice(
                id=uuid.uuid4(),
                organization_id=org_id,
                branch_id=branch_id,
                device_name=req.device_name,
                device_identifier=req.device_identifier,
                is_activated=True,
                activated_at=now,
                device_token_hash=token_hash,
                exit_pin_hash=default_exit_pin_hash,
                last_known_ip=client_ip,
                battery_level=req.battery_level,
                app_version=req.app_version,
                last_heartbeat_at=now,
                is_active=True,
                verification_modes={"face_camera": True, "fingerprint": True, "pin": True, "qr_badge": True},
                ip_tracking_enabled=True,
            )
            db.add(device)

        await db.flush()

        # Mark activation code as consumed
        activation_code.is_used = True
        activation_code.used_at = now
        activation_code.used_by_device_id = device.id

        await db.commit()
        await db.refresh(device)

        # Retrieve organization and branch names
        org_name = "OfficeOS Organization"
        org_res = await db.execute(select(Organization.name).where(Organization.id == org_id))
        org_n = org_res.scalar_one_or_none()
        if org_n:
            org_name = org_n

        branch_name = None
        if branch_id:
            b_res = await db.execute(select(Branch.name).where(Branch.id == branch_id))
            branch_name = b_res.scalar_one_or_none()

        return device, raw_device_token, org_name, branch_name

    @classmethod
    async def get_device_by_token(
        cls, db: AsyncSession, device_token: str
    ) -> KioskDevice | None:
        token_hash = cls._hash_value(device_token)
        query = (
            select(KioskDevice)
            .options(selectinload(KioskDevice.branch), selectinload(KioskDevice.organization))
            .where(
                KioskDevice.device_token_hash == token_hash,
                KioskDevice.is_active.is_(True),
                KioskDevice.is_activated.is_(True),
            )
        )
        res = await db.execute(query)
        return res.scalar_one_or_none()

    @classmethod
    async def record_heartbeat(
        cls,
        db: AsyncSession,
        device: KioskDevice,
        req: KioskHeartbeatRequest,
        client_ip: str | None = None,
    ) -> None:
        device.last_heartbeat_at = datetime.now(UTC)
        if req.battery_level is not None:
            device.battery_level = req.battery_level
        if req.app_version:
            device.app_version = req.app_version
        if client_ip:
            device.last_known_ip = client_ip
        await db.commit()

    @classmethod
    def verify_exit_pin(cls, device: KioskDevice, exit_pin: str) -> bool:
        pin_hash = cls._hash_value(exit_pin.strip())
        if device.exit_pin_hash:
            return device.exit_pin_hash == pin_hash
        return exit_pin.strip() == "9999"

    @classmethod
    def validate_ip_restriction(cls, device: KioskDevice, client_ip: str | None) -> bool:
        if not device.ip_tracking_enabled or not device.allowed_ip_range:
            return True
        if not client_ip:
            return False

        allowed_entries = [entry.strip() for entry in device.allowed_ip_range.split(",") if entry.strip()]
        for entry in allowed_entries:
            try:
                if "/" in entry:
                    if ipaddress.ip_address(client_ip) in ipaddress.ip_network(entry, strict=False):
                        return True
                else:
                    if client_ip == entry:
                        return True
            except ValueError:
                continue
        return False

    @classmethod
    async def process_kiosk_punch(
        cls,
        db: AsyncSession,
        device: KioskDevice,
        req: KioskPunchRequest,
        client_ip: str | None = None,
    ) -> KioskPunchResponse:
        # 1. IP Tracking validation
        if not cls.validate_ip_restriction(device, client_ip):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Kiosk attendance blocked: Device IP '{client_ip}' is outside authorized office networks.",
            )

        # 2. Locate Employee
        employee: Employee | None = None
        clean_code = (req.employee_code or "").strip().upper()
        clean_pin = (req.employee_pin or "").strip()

        if clean_code:
            emp_res = await db.execute(
                select(Employee).where(
                    Employee.organization_id == device.organization_id,
                    Employee.employee_code == clean_code,
                    Employee.status == "active",
                )
            )
            employee = emp_res.scalar_one_or_none()

        if not employee and clean_pin:
            # Check if any employee's phone or code matches PIN or lookup by PIN
            pin_res = await db.execute(
                select(Employee).where(
                    Employee.organization_id == device.organization_id,
                    Employee.employee_code.endswith(clean_pin),
                    Employee.status == "active",
                )
            )
            employee = pin_res.scalars().first()

        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee identification failed. Please verify employee ID or QR badge.",
            )

        now = datetime.now(UTC)
        today = now.date()
        emp_name = f"{employee.first_name} {employee.last_name}".strip()

        # 3. Lookup today's attendance record
        att_res = await db.execute(
            select(AttendanceRecord).where(
                AttendanceRecord.organization_id == device.organization_id,
                AttendanceRecord.employee_id == employee.id,
                AttendanceRecord.work_date == today,
            )
        )
        record = att_res.scalar_one_or_none()

        if req.punch_type == "check_in":
            if record and record.check_in_at:
                return KioskPunchResponse(
                    success=True,
                    message=f"Already checked in today at {record.check_in_at.strftime('%I:%M %p')}.",
                    punch_type="check_in",
                    employee_id=employee.id,
                    employee_name=emp_name,
                    employee_code=employee.employee_code,
                    work_date=today,
                    check_in_at=record.check_in_at,
                    check_out_at=record.check_out_at,
                    verification_method=record.verification_method,
                    face_snapshot_url=record.face_snapshot_url,
                )
            if not record:
                record = AttendanceRecord(
                    organization_id=device.organization_id,
                    employee_id=employee.id,
                    branch_id=device.branch_id,
                    work_date=today,
                    check_in_at=now,
                    status="present",
                    verification_method=req.verification_method,
                    latitude=req.latitude,
                    longitude=req.longitude,
                    kiosk_device_id=device.id,
                    face_snapshot_url=req.face_snapshot_data,
                    client_ip=client_ip,
                )
                db.add(record)
            else:
                record.check_in_at = now
                record.status = "present"
                record.verification_method = req.verification_method
                record.kiosk_device_id = device.id
                record.face_snapshot_url = req.face_snapshot_data
                record.client_ip = client_ip

            msg = f"Check-in recorded successfully for {emp_name}."

        else:  # check_out
            if not record:
                record = AttendanceRecord(
                    organization_id=device.organization_id,
                    employee_id=employee.id,
                    branch_id=device.branch_id,
                    work_date=today,
                    check_in_at=now - timedelta(hours=8),  # auto fallback
                    check_out_at=now,
                    status="present",
                    verification_method=req.verification_method,
                    latitude=req.latitude,
                    longitude=req.longitude,
                    kiosk_device_id=device.id,
                    face_snapshot_url=req.face_snapshot_data,
                    client_ip=client_ip,
                )
                db.add(record)
            else:
                record.check_out_at = now
                record.kiosk_device_id = device.id
                if req.face_snapshot_data and not record.face_snapshot_url:
                    record.face_snapshot_url = req.face_snapshot_data
                record.client_ip = client_ip

            msg = f"Check-out recorded successfully for {emp_name}. Have a great evening!"

        await db.commit()
        await db.refresh(record)

        return KioskPunchResponse(
            success=True,
            message=msg,
            punch_type=req.punch_type,
            employee_id=employee.id,
            employee_name=emp_name,
            employee_code=employee.employee_code,
            work_date=today,
            check_in_at=record.check_in_at,
            check_out_at=record.check_out_at,
            verification_method=record.verification_method,
            face_snapshot_url=record.face_snapshot_url,
        )

    @classmethod
    async def list_kiosks(cls, db: AsyncSession, org_id: uuid.UUID) -> list[KioskDeviceResponse]:
        query = (
            select(KioskDevice)
            .options(selectinload(KioskDevice.branch))
            .where(KioskDevice.organization_id == org_id)
            .order_by(desc(KioskDevice.created_at))
        )
        res = await db.execute(query)
        devices = res.scalars().all()
        now = datetime.now(UTC)

        result: list[KioskDeviceResponse] = []
        for d in devices:
            # Active heartbeat within 5 minutes indicates Online
            is_online = (
                d.is_activated
                and d.is_active
                and d.last_heartbeat_at is not None
                and (now - d.last_heartbeat_at).total_seconds() < 300
            )
            status_label = "online" if is_online else ("offline" if d.is_activated else "pending")

            result.append(
                KioskDeviceResponse(
                    id=d.id,
                    organization_id=d.organization_id,
                    branch_id=d.branch_id,
                    branch_name=d.branch.name if d.branch else None,
                    device_name=d.device_name,
                    device_identifier=d.device_identifier,
                    is_activated=d.is_activated,
                    activated_at=d.activated_at,
                    verification_modes=d.verification_modes or {},
                    ip_tracking_enabled=d.ip_tracking_enabled,
                    allowed_ip_range=d.allowed_ip_range,
                    last_known_ip=d.last_known_ip,
                    battery_level=d.battery_level,
                    app_version=d.app_version,
                    last_heartbeat_at=d.last_heartbeat_at,
                    is_active=d.is_active,
                    created_at=d.created_at,
                    updated_at=d.updated_at,
                    status=status_label,
                )
            )
        return result

    @classmethod
    async def update_kiosk(
        cls, db: AsyncSession, org_id: uuid.UUID, kiosk_id: uuid.UUID, req: KioskDeviceUpdateRequest
    ) -> KioskDeviceResponse:
        res = await db.execute(
            select(KioskDevice)
            .options(selectinload(KioskDevice.branch))
            .where(KioskDevice.organization_id == org_id, KioskDevice.id == kiosk_id)
        )
        device = res.scalar_one_or_none()
        if not device:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kiosk device not found.")

        if req.device_name is not None:
            device.device_name = req.device_name
        if req.branch_id is not None:
            device.branch_id = req.branch_id
        if req.allowed_ip_range is not None:
            device.allowed_ip_range = req.allowed_ip_range
        if req.verification_modes is not None:
            device.verification_modes = req.verification_modes
        if req.ip_tracking_enabled is not None:
            device.ip_tracking_enabled = req.ip_tracking_enabled
        if req.is_active is not None:
            device.is_active = req.is_active
        if req.exit_pin is not None:
            device.exit_pin_hash = cls._hash_value(req.exit_pin)

        await db.commit()
        await db.refresh(device)

        now = datetime.now(UTC)
        is_online = (
            device.is_activated
            and device.is_active
            and device.last_heartbeat_at is not None
            and (now - device.last_heartbeat_at).total_seconds() < 300
        )
        status_label = "online" if is_online else ("offline" if device.is_activated else "pending")

        return KioskDeviceResponse(
            id=device.id,
            organization_id=device.organization_id,
            branch_id=device.branch_id,
            branch_name=device.branch.name if device.branch else None,
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
            status=status_label,
        )

    @classmethod
    async def delete_kiosk(cls, db: AsyncSession, org_id: uuid.UUID, kiosk_id: uuid.UUID) -> None:
        res = await db.execute(
            select(KioskDevice).where(KioskDevice.organization_id == org_id, KioskDevice.id == kiosk_id)
        )
        device = res.scalar_one_or_none()
        if not device:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kiosk device not found.")
        await db.delete(device)
        await db.commit()

    @classmethod
    async def list_kiosk_punches(
        cls, db: AsyncSession, org_id: uuid.UUID, limit: int = 50
    ) -> list[KioskPunchAuditItem]:
        query = (
            select(AttendanceRecord, Employee, KioskDevice)
            .join(Employee, AttendanceRecord.employee_id == Employee.id)
            .outerjoin(KioskDevice, AttendanceRecord.kiosk_device_id == KioskDevice.id)
            .where(
                AttendanceRecord.organization_id == org_id,
                AttendanceRecord.kiosk_device_id.is_not(None),
            )
            .order_by(desc(AttendanceRecord.created_at))
            .limit(limit)
        )
        res = await db.execute(query)
        rows = res.all()

        results: list[KioskPunchAuditItem] = []
        for att, emp, dev in rows:
            emp_name = f"{emp.first_name} {emp.last_name}".strip()
            results.append(
                KioskPunchAuditItem(
                    id=att.id,
                    employee_id=emp.id,
                    employee_name=emp_name,
                    employee_code=emp.employee_code,
                    work_date=att.work_date,
                    check_in_at=att.check_in_at,
                    check_out_at=att.check_out_at,
                    verification_method=att.verification_method,
                    face_snapshot_url=att.face_snapshot_url,
                    client_ip=att.client_ip,
                    device_name=dev.device_name if dev else "Unassigned Kiosk",
                )
            )
        return results
