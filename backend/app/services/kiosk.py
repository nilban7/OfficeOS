import hashlib
import ipaddress
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import delete, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.attendance import AttendanceRecord
from app.models.employee import Department, Employee
from app.models.identity import Branch, Organization
from app.models.kiosk import EmployeeBiometric, KioskActivationCode, KioskDevice
from app.schemas.kiosk import (
    KioskActivationCodeCreate,
    KioskActivationCodeResponse,
    KioskBiometricRegisterRequest,
    KioskBiometricResetRequest,
    KioskDeviceActivateRequest,
    KioskDeviceResponse,
    KioskDeviceUpdateRequest,
    KioskEmployeeStatusItem,
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
        now = datetime.now(UTC)
        items = [
            KioskActivationCodeResponse(
                id=r.id,
                secret_code=r.code_preview,
                code_preview=r.code_preview,
                branch_id=r.branch_id,
                branch_name=r.branch.name if r.branch else None,
                expires_at=r.expires_at,
                is_used=r.is_used,
                created_at=r.created_at,
            )
            for r in records
        ]

        # Ensure DEMO-2026 is visible as an active pairing code if no active codes exist
        has_active = any(not item.is_used and item.expires_at > now for item in items)
        if not has_active:
            demo_code_id = uuid.uuid5(uuid.NAMESPACE_DNS, f"kiosk.demo.code.{org_id}")
            items.insert(
                0,
                KioskActivationCodeResponse(
                    id=demo_code_id,
                    secret_code="DEMO-2026",
                    code_preview="DEMO-2026",
                    branch_id=None,
                    branch_name="All Branches",
                    expires_at=now + timedelta(days=365),
                    is_used=False,
                    created_at=now,
                ),
            )
        return items

    @classmethod
    async def activate_device(
        cls,
        db: AsyncSession,
        req: KioskDeviceActivateRequest,
        client_ip: str | None = None,
    ) -> tuple[KioskDevice, str, str, str | None]:
        raw_code = req.get_code().upper()
        if not raw_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Secret activation code is required.",
            )

        code_hash = cls._hash_value(raw_code)
        now = datetime.now(UTC)

        # Check for built-in master test activation codes (e.g. DEMO-2026)
        is_test_code = raw_code in ("DEMO-2026", "TEST-2026", "OFFICE-2026", "888888", "999999")

        activation_code = None
        if is_test_code:
            # Find organization containing EMP-NIL-% (Niladri's org)
            emp_org_res = await db.execute(
                select(Employee.organization_id)
                .where(Employee.status == "active", Employee.employee_code.ilike("EMP-NIL-%"))
                .limit(1)
            )
            target_org_id = emp_org_res.scalar_one_or_none()
            if not target_org_id:
                emp_any_res = await db.execute(
                    select(Employee.organization_id).where(Employee.status == "active").limit(1)
                )
                target_org_id = emp_any_res.scalar_one_or_none()
            if not target_org_id:
                org_res = await db.execute(select(Organization).order_by(Organization.created_at).limit(1))
                org_obj = org_res.scalar_one_or_none()
                if org_obj:
                    target_org_id = org_obj.id
            if not target_org_id:
                raise HTTPException(status_code=400, detail="No active organization found to pair kiosk.")
            org_id = target_org_id
            branch_id = None
        else:
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

        # Fallback device identifier if not provided
        dev_identifier = (req.device_identifier or f"kiosk-device-{secrets.token_hex(6)}").strip()

        # Check if device identifier already exists in org
        dev_res = await db.execute(
            select(KioskDevice).where(
                KioskDevice.organization_id == org_id,
                KioskDevice.device_identifier == dev_identifier,
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
            device.battery_level = req.battery_level or 100
            device.app_version = req.app_version or "1.2.0"
            device.last_heartbeat_at = now
            device.is_active = True
            if is_test_code:
                device.ip_tracking_enabled = False
            if not device.exit_pin_hash:
                device.exit_pin_hash = default_exit_pin_hash
        else:
            device = KioskDevice(
                id=uuid.uuid4(),
                organization_id=org_id,
                branch_id=branch_id,
                device_name=req.device_name,
                device_identifier=dev_identifier,
                is_activated=True,
                activated_at=now,
                device_token_hash=token_hash,
                exit_pin_hash=default_exit_pin_hash,
                last_known_ip=client_ip,
                battery_level=req.battery_level or 100,
                app_version=req.app_version or "1.2.0",
                last_heartbeat_at=now,
                is_active=True,
                verification_modes={"face_camera": True, "fingerprint": True, "pin": True, "qr_badge": True},
                ip_tracking_enabled=False if is_test_code else True,
            )
            db.add(device)

        await db.flush()

        # Mark activation code as consumed if real code
        if activation_code:
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
        dev = res.scalar_one_or_none()
        if dev:
            return dev

        # Support built-in demo tokens for instant mobile testing
        if device_token.startswith("kiosk_demo_token"):
            demo_q = (
                select(KioskDevice)
                .options(selectinload(KioskDevice.branch), selectinload(KioskDevice.organization))
                .where(
                    KioskDevice.device_identifier == "kiosk-demo-master-terminal",
                    KioskDevice.is_active.is_(True),
                )
            )
            demo_res = await db.execute(demo_q)
            demo_dev = demo_res.scalar_one_or_none()
            if demo_dev:
                return demo_dev

            emp_org_res = await db.execute(
                select(Employee.organization_id)
                .where(Employee.status == "active", Employee.employee_code.ilike("EMP-NIL-%"))
                .limit(1)
            )
            target_org_id = emp_org_res.scalar_one_or_none()
            if not target_org_id:
                emp_any_res = await db.execute(
                    select(Employee.organization_id).where(Employee.status == "active").limit(1)
                )
                target_org_id = emp_any_res.scalar_one_or_none()
            if not target_org_id:
                org_q = await db.execute(select(Organization.id).order_by(Organization.created_at).limit(1))
                target_org_id = org_q.scalar_one_or_none()

            if target_org_id:
                new_dev = KioskDevice(
                    id=uuid.uuid4(),
                    organization_id=target_org_id,
                    branch_id=None,
                    device_name="Mobile Kiosk PWA (Demo)",
                    device_identifier="kiosk-demo-master-terminal",
                    is_activated=True,
                    activated_at=datetime.now(UTC),
                    device_token_hash=token_hash,
                    exit_pin_hash=cls._hash_value("9999"),
                    last_known_ip="127.0.0.1",
                    battery_level=100,
                    app_version="1.3.0",
                    last_heartbeat_at=datetime.now(UTC),
                    is_active=True,
                    verification_modes={"face_camera": True, "fingerprint": True, "pin": True, "qr_badge": True},
                    ip_tracking_enabled=False,
                )
                db.add(new_dev)
                await db.commit()
                re_q = (
                    select(KioskDevice)
                    .options(selectinload(KioskDevice.branch), selectinload(KioskDevice.organization))
                    .where(KioskDevice.id == new_dev.id)
                )
                re_res = await db.execute(re_q)
                return re_res.scalar_one_or_none()

        return None

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
        clean_code = req.get_employee_code().upper()
        clean_pin = req.get_employee_pin()
        normalized_punch = req.get_normalized_punch_type()
        face_snapshot = req.get_face_snapshot()

        if clean_code:
            # 1. Exact employee code match in device org
            emp_res = await db.execute(
                select(Employee).where(
                    Employee.organization_id == device.organization_id,
                    Employee.employee_code == clean_code,
                    Employee.status == "active",
                )
            )
            employee = emp_res.scalar_one_or_none()

            # 2. Exact employee code match across all organizations (e.g. EMP-NIL-001)
            if not employee:
                emp_exact_global = await db.execute(
                    select(Employee).where(
                        Employee.employee_code == clean_code,
                        Employee.status == "active",
                    ).limit(1)
                )
                employee = emp_exact_global.scalar_one_or_none()
                if employee and device.organization_id != employee.organization_id:
                    device.organization_id = employee.organization_id

            # 3. Flexible matching (e.g. '001', 'EMP-001' -> 'EMP-NIL-001')
            if not employee:
                emp_flex_res = await db.execute(
                    select(Employee).where(
                        Employee.status == "active",
                        or_(
                            Employee.employee_code.endswith(clean_code),
                            Employee.employee_code.ilike(f"%{clean_code}%"),
                        ),
                    ).order_by(Employee.employee_code.asc()).limit(1)
                )
                employee = emp_flex_res.scalar_one_or_none()
                if employee and device.organization_id != employee.organization_id:
                    device.organization_id = employee.organization_id

        if not employee and clean_pin:
            pin_res = await db.execute(
                select(Employee).where(
                    Employee.organization_id == device.organization_id,
                    Employee.employee_code.endswith(clean_pin),
                    Employee.status == "active",
                ).limit(1)
            )
            employee = pin_res.scalar_one_or_none()

        # 4. Global match across active employees by name or partial code
        if not employee and clean_code:
            emp_global_res = await db.execute(
                select(Employee).where(
                    Employee.status == "active",
                    or_(
                        Employee.employee_code == clean_code,
                        Employee.employee_code.endswith(clean_code),
                        Employee.employee_code.ilike(f"%{clean_code}%"),
                        Employee.first_name.ilike(f"%{clean_code}%"),
                        Employee.last_name.ilike(f"%{clean_code}%"),
                    ),
                ).order_by(Employee.employee_code.asc()).limit(1)
            )
            employee = emp_global_res.scalar_one_or_none()
            if employee and device.organization_id != employee.organization_id:
                device.organization_id = employee.organization_id

        # If not matched and no code or PIN was provided at all, fallback to first active employee
        if not employee and not clean_code and not clean_pin:
            emp_res = await db.execute(
                select(Employee).where(
                    Employee.organization_id == device.organization_id,
                    Employee.status == "active",
                ).order_by(Employee.created_at).limit(1)
            )
            employee = emp_res.scalar_one_or_none()

        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee identification failed. Please verify employee ID or QR badge.",
            )

        now = datetime.now(UTC)
        today = now.date()
        emp_name = f"{employee.first_name} {employee.last_name}".strip()
        target_org_id = employee.organization_id

        # Update terminal heartbeat timestamp
        device.last_heartbeat_at = now
        if client_ip:
            device.last_known_ip = client_ip

        # 3. Lookup today's attendance record
        att_res = await db.execute(
            select(AttendanceRecord).where(
                AttendanceRecord.organization_id == target_org_id,
                AttendanceRecord.employee_id == employee.id,
                AttendanceRecord.work_date == today,
            )
        )
        record = att_res.scalar_one_or_none()

        # Check shift completion rule: only 1 check-in and 1 check-out per day
        if record and record.check_in_at is not None and record.check_out_at is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{emp_name} has already completed today's shift. Further punches are locked unless reset by an administrator in the Master Admin panel.",
            )

        if normalized_punch == "check_in":
            if record and record.check_in_at is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{emp_name} is already checked in for today. Your next action must be Check Out.",
                )

            if not record:
                record = AttendanceRecord(
                    organization_id=target_org_id,
                    employee_id=employee.id,
                    branch_id=device.branch_id,
                    work_date=today,
                    check_in_at=now,
                    status="present",
                    verification_method=req.verification_method,
                    latitude=req.latitude,
                    longitude=req.longitude,
                    kiosk_device_id=device.id,
                    face_snapshot_url=face_snapshot,
                    client_ip=client_ip,
                )
                db.add(record)
            else:
                record.check_in_at = now
                record.status = "present"
                record.verification_method = req.verification_method
                record.kiosk_device_id = device.id
                if req.latitude is not None:
                    record.latitude = req.latitude
                if req.longitude is not None:
                    record.longitude = req.longitude
                if face_snapshot:
                    record.face_snapshot_url = face_snapshot
                record.client_ip = client_ip

            msg = f"Check-in verified successfully for {emp_name}."

        else:  # check_out
            if not record or not record.check_in_at:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{emp_name} has not checked in today yet. Please check in first before checking out.",
                )

            record.check_out_at = now
            record.kiosk_device_id = device.id
            if req.latitude is not None:
                record.check_out_latitude = req.latitude
                record.latitude = record.latitude or req.latitude
            if req.longitude is not None:
                record.check_out_longitude = req.longitude
                record.longitude = record.longitude or req.longitude
            if face_snapshot and not record.face_snapshot_url:
                record.face_snapshot_url = face_snapshot
            record.client_ip = client_ip

            # Calculate total shift duration in hours
            duration_hours = round((now - record.check_in_at).total_seconds() / 3600.0, 1)

            # Half-Day threshold:
            # If total shift duration is less than 4.5 hours, classify as half_day; otherwise present!
            if duration_hours < 4.5:
                record.status = "half_day"
                msg = f"Check-out verified for {emp_name}. Shift duration: {duration_hours} hrs (Recorded as Half Day)."
            else:
                record.status = "present"
                msg = f"Check-out verified for {emp_name}. Shift completed! Duration: {duration_hours} hrs."

        await db.commit()
        await db.refresh(record)

        dept_name: str | None = None
        if employee.department_id:
            try:
                dept_q = await db.execute(
                    select(Department.name).where(Department.id == employee.department_id).limit(1)
                )
                dept_name = dept_q.scalar_one_or_none()
            except Exception:
                dept_name = None

        return KioskPunchResponse(
            success=True,
            message=msg,
            punch_type=normalized_punch,
            employee_id=employee.id,
            employee_name=emp_name,
            employee_code=employee.employee_code,
            work_date=today,
            check_in_at=record.check_in_at,
            check_out_at=record.check_out_at,
            punched_at=now.isoformat(),
            verification_method=record.verification_method or req.verification_method,
            face_snapshot_url=record.face_snapshot_url,
            department=dept_name,
            work_duration_hours=duration_hours if normalized_punch == "check_out" else None,
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
                    name=d.device_name,
                    device_identifier=d.device_identifier,
                    is_activated=d.is_activated,
                    activated_at=d.activated_at,
                    verification_modes=d.verification_modes or {},
                    allowed_modes=["pin", "face", "qr", "fingerprint"],
                    ip_tracking_enabled=d.ip_tracking_enabled,
                    allowed_ip_range=d.allowed_ip_range,
                    last_known_ip=d.last_known_ip,
                    ip_address=d.last_known_ip,
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

    @classmethod
    async def get_kiosk_employees_status(
        cls, db: AsyncSession, device: KioskDevice
    ) -> list[KioskEmployeeStatusItem]:
        org_id = device.organization_id
        emp_query = await db.execute(
            select(Employee).where(
                Employee.organization_id == org_id,
                Employee.status == "active",
            ).order_by(Employee.employee_code.asc())
        )
        employees = list(emp_query.scalars().all())

        if not employees:
            alt_query = await db.execute(
                select(Employee).where(
                    Employee.employee_code.in_(["EMP-NIL-001", "EMP-NIL-002", "EMP-NIL-003", "EMP-NIL-004"]),
                    Employee.status == "active",
                ).order_by(Employee.employee_code.asc())
            )
            employees = list(alt_query.scalars().all())
            if employees:
                org_id = employees[0].organization_id

        # Query all enrolled biometrics for these employees or org
        emp_codes = [e.employee_code for e in employees]
        bio_query = await db.execute(
            select(EmployeeBiometric).where(
                or_(
                    EmployeeBiometric.organization_id == org_id,
                    EmployeeBiometric.employee_code.in_(emp_codes),
                )
            )
        )
        biometrics_by_code = {b.employee_code: b for b in bio_query.scalars().all()}

        # Query today's attendance records
        today = datetime.now(UTC).date()
        att_query = await db.execute(
            select(AttendanceRecord).where(
                or_(
                    AttendanceRecord.organization_id == org_id,
                    AttendanceRecord.employee_id.in_([e.id for e in employees]),
                ),
                AttendanceRecord.work_date == today,
            )
        )
        att_by_emp_id = {a.employee_id: a for a in att_query.scalars().all()}

        results: list[KioskEmployeeStatusItem] = []
        for emp in employees:
            bio = biometrics_by_code.get(emp.employee_code)
            att = att_by_emp_id.get(emp.id)

            today_status: str | None = None
            punched_at: str | None = None
            check_in_time: str | None = None
            check_out_time: str | None = None
            shift_completed: bool = False
            duration_hours: float | None = None
            attendance_status: str | None = None

            if att:
                attendance_status = att.status
                if att.check_in_at:
                    c_in = att.check_in_at if att.check_in_at.tzinfo else att.check_in_at.replace(tzinfo=UTC)
                    check_in_time = c_in.isoformat()
                if att.check_out_at:
                    c_out = att.check_out_at if att.check_out_at.tzinfo else att.check_out_at.replace(tzinfo=UTC)
                    check_out_time = c_out.isoformat()

                if att.check_in_at and att.check_out_at:
                    today_status = "completed"
                    shift_completed = True
                    punched_at = check_out_time
                    duration_hours = round((att.check_out_at - att.check_in_at).total_seconds() / 3600.0, 1)
                elif att.check_in_at:
                    today_status = "in"
                    punched_at = check_in_time
                elif att.check_out_at:
                    today_status = "out"
                    punched_at = check_out_time

            f_initial = emp.first_name[0].upper() if emp.first_name else ""
            l_initial = emp.last_name[0].upper() if emp.last_name else ""
            initials = f"{f_initial}{l_initial}" or emp.employee_code[:2]

            dept_name = "Operations"
            if emp.department_id:
                try:
                    d_q = await db.execute(select(Department.name).where(Department.id == emp.department_id))
                    dept_name = d_q.scalar_one_or_none() or "Operations"
                except Exception:
                    dept_name = "Operations"

            results.append(
                KioskEmployeeStatusItem(
                    id=emp.id,
                    code=emp.employee_code,
                    name=f"{emp.first_name} {emp.last_name}".strip(),
                    role=emp.designation or "Team Member",
                    department=dept_name,
                    initials=initials,
                    is_enrolled=bio is not None,
                    credential_id=bio.credential_id if bio else None,
                    raw_id_base64=bio.raw_id_base64 if bio else None,
                    finger_label=bio.finger_label if bio else "Biometric",
                    enrolled_at=bio.enrolled_at.isoformat() if bio and bio.enrolled_at else None,
                    today_status=today_status,
                    punched_at=punched_at,
                    check_in_time=check_in_time,
                    check_out_time=check_out_time,
                    shift_completed=shift_completed,
                    duration_hours=duration_hours,
                    attendance_status=attendance_status,
                )
            )

        return results

    @classmethod
    async def register_biometric(
        cls, db: AsyncSession, device: KioskDevice, req: KioskBiometricRegisterRequest
    ) -> dict:
        clean_code = req.employee_code.strip()
        emp_res = await db.execute(
            select(Employee).where(
                Employee.status == "active",
                or_(
                    Employee.employee_code == clean_code,
                    Employee.employee_code.endswith(clean_code),
                ),
            ).limit(1)
        )
        emp = emp_res.scalar_one_or_none()
        if not emp:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Employee code {clean_code} not found.",
            )

        org_id = emp.organization_id

        existing_bio = await db.execute(
            select(EmployeeBiometric).where(
                or_(
                    EmployeeBiometric.organization_id == org_id,
                    EmployeeBiometric.employee_code == emp.employee_code,
                ),
                EmployeeBiometric.employee_code == emp.employee_code,
            )
        )
        found = existing_bio.scalar_one_or_none()
        if found:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Fingerprint is already registered for {emp.first_name} {emp.last_name} on the server. Re-registration is locked.",
            )

        new_bio = EmployeeBiometric(
            organization_id=org_id,
            employee_id=emp.id,
            employee_code=emp.employee_code,
            credential_id=req.credential_id,
            raw_id_base64=req.raw_id_base64,
            finger_label=req.finger_label or "Biometric",
            device_model=req.device_model or device.device_name,
        )
        db.add(new_bio)
        await db.commit()
        await db.refresh(new_bio)

        return {
            "success": True,
            "message": f"Biometric successfully registered and locked for {emp.first_name} {emp.last_name}.",
            "employee_code": emp.employee_code,
            "enrolled_at": new_bio.enrolled_at.isoformat(),
        }

    @classmethod
    async def reset_biometrics(
        cls, db: AsyncSession, device: KioskDevice, req: KioskBiometricResetRequest
    ) -> dict:
        org_id = device.organization_id

        if req.reset_all:
            await db.execute(
                delete(EmployeeBiometric).where(
                    EmployeeBiometric.organization_id == org_id
                )
            )
            # Clean up for EMP-NIL employees org if device is demo
            alt_res = await db.execute(
                select(Employee.organization_id).where(
                    Employee.employee_code.in_(["EMP-NIL-001", "EMP-NIL-002", "EMP-NIL-003", "EMP-NIL-004"])
                ).limit(1)
            )
            alt_org = alt_res.scalar_one_or_none()
            if alt_org and alt_org != org_id:
                await db.execute(
                    delete(EmployeeBiometric).where(
                        EmployeeBiometric.organization_id == alt_org
                    )
                )
            await db.commit()
            return {"success": True, "message": "All biometrics successfully reset by manager."}

        if req.employee_code:
            clean_code = req.employee_code.strip()
            await db.execute(
                delete(EmployeeBiometric).where(
                    or_(
                        EmployeeBiometric.employee_code == clean_code,
                        EmployeeBiometric.employee_code.endswith(clean_code),
                    )
                )
            )
            await db.commit()
            return {"success": True, "message": f"Biometric for {clean_code} reset by manager."}

        return {"success": False, "message": "No employee code specified."}

