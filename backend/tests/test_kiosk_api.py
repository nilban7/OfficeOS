"""Unit tests for Kiosk Attendance and Admin Kiosk management.

Tests activation code generation, device pairing, multi-modal punches,
IP restrictions, heartbeat, and exit PIN verification.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.schemas.kiosk import (
    KioskActivationCodeCreate,
    KioskDeviceActivateRequest,
    KioskHeartbeatRequest,
    KioskPunchRequest,
)
from app.services.kiosk import KioskService


@pytest.mark.asyncio
async def test_generate_kiosk_activation_code():
    mock_session = AsyncMock()
    mock_session.commit = AsyncMock()
    mock_session.refresh = AsyncMock()

    org_id = uuid4()
    user_id = uuid4()
    req = KioskActivationCodeCreate(valid_hours=24)

    res = await KioskService.generate_activation_code(mock_session, org_id, user_id, req)

    assert res.secret_code is not None
    assert res.secret_code.startswith("OS-")
    assert res.is_used is False
    assert mock_session.add.called
    assert mock_session.commit.called


@pytest.mark.asyncio
async def test_activate_kiosk_device_invalid_code():
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None  # Code not found
    mock_session.execute = AsyncMock(return_value=mock_result)

    req = KioskDeviceActivateRequest(
        secret_code="INVALID-CODE",
        device_identifier="tablet-hw-001",
        device_name="Front Desk Tablet",
    )

    with pytest.raises(HTTPException) as exc_info:
        await KioskService.activate_device(mock_session, req, client_ip="192.168.1.50")

    assert exc_info.value.status_code == 400
    assert "Invalid or expired secret activation code" in exc_info.value.detail


@pytest.mark.asyncio
async def test_activate_kiosk_device_success():
    mock_session = AsyncMock()
    mock_code = MagicMock()
    mock_code.organization_id = uuid4()
    mock_code.branch_id = uuid4()
    mock_code.is_used = False

    # First query returns code, second query checks existing device (none), third gets org name
    res_code = MagicMock()
    res_code.scalar_one_or_none.return_value = mock_code

    res_dev = MagicMock()
    res_dev.scalar_one_or_none.return_value = None

    res_org = MagicMock()
    res_org.scalar_one_or_none.return_value = "Acme Corp"

    mock_session.execute = AsyncMock(side_effect=[res_code, res_dev, res_org, MagicMock()])

    req = KioskDeviceActivateRequest(
        secret_code="OS-9999-11",
        device_identifier="tablet-hw-001",
        device_name="Front Desk Tablet",
    )

    device, token, _org_name, _branch_name = await KioskService.activate_device(
        mock_session, req, client_ip="10.0.0.1"
    )

    assert token.startswith("kiosk_")
    assert device.device_name == "Front Desk Tablet"
    assert device.is_activated is True
    assert mock_code.is_used is True


@pytest.mark.asyncio
async def test_kiosk_heartbeat():
    mock_session = AsyncMock()
    device = MagicMock()
    req = KioskHeartbeatRequest(battery_level=85, app_version="1.0.2")

    await KioskService.record_heartbeat(mock_session, device, req, client_ip="10.0.0.5")

    assert device.battery_level == 85
    assert device.app_version == "1.0.2"
    assert device.last_known_ip == "10.0.0.5"
    assert mock_session.commit.called


def test_kiosk_verify_exit_pin():
    device = MagicMock()
    pin = "1234"
    device.exit_pin_hash = KioskService._hash_value(pin)

    assert KioskService.verify_exit_pin(device, "1234") is True
    assert KioskService.verify_exit_pin(device, "0000") is False

    # Default fallback when hash is None
    device.exit_pin_hash = None
    assert KioskService.verify_exit_pin(device, "9999") is True


def test_kiosk_ip_restriction_validation():
    device = MagicMock()
    device.ip_tracking_enabled = True
    device.allowed_ip_range = "192.168.1.0/24, 10.0.0.50"

    # Authorized IPs
    assert KioskService.validate_ip_restriction(device, "192.168.1.15") is True
    assert KioskService.validate_ip_restriction(device, "10.0.0.50") is True

    # Unauthorized IPs
    assert KioskService.validate_ip_restriction(device, "203.0.113.1") is False
    assert KioskService.validate_ip_restriction(device, None) is False

    # Disabled restriction allows all
    device.ip_tracking_enabled = False
    assert KioskService.validate_ip_restriction(device, "203.0.113.1") is True


@pytest.mark.asyncio
async def test_kiosk_punch_check_in_success():
    mock_session = AsyncMock()
    device = MagicMock()
    device.organization_id = uuid4()
    device.branch_id = uuid4()
    device.id = uuid4()
    device.ip_tracking_enabled = False

    emp = MagicMock()
    emp.id = uuid4()
    emp.first_name = "Jane"
    emp.last_name = "Doe"
    emp.employee_code = "EMP-042"

    emp_res = MagicMock()
    emp_res.scalar_one_or_none.return_value = emp

    att_res = MagicMock()
    att_res.scalar_one_or_none.return_value = None  # No prior punch today

    mock_session.execute = AsyncMock(side_effect=[emp_res, att_res])

    req = KioskPunchRequest(
        employee_code="EMP-042",
        punch_type="check_in",
        verification_method="kiosk_face",
        face_snapshot_data="data:image/jpeg;base64,mockphoto...",
    )

    res = await KioskService.process_kiosk_punch(mock_session, device, req, client_ip="10.0.0.1")

    assert res.success is True
    assert res.punch_type == "check_in"
    assert res.employee_code == "EMP-042"
    assert res.verification_method == "kiosk_face"
    assert mock_session.add.called
    assert mock_session.commit.called


@pytest.mark.asyncio
async def test_kiosk_punch_employee_not_found_raises():
    mock_session = AsyncMock()
    device = MagicMock()
    device.organization_id = uuid4()
    device.ip_tracking_enabled = False

    emp_res = MagicMock()
    emp_res.scalar_one_or_none.return_value = None  # Not found
    mock_session.execute = AsyncMock(return_value=emp_res)

    req = KioskPunchRequest(
        employee_code="UNKNOWN-999",
        punch_type="check_in",
    )

    with pytest.raises(HTTPException) as exc_info:
        await KioskService.process_kiosk_punch(mock_session, device, req)

    assert exc_info.value.status_code == 404
    assert "Employee identification failed" in exc_info.value.detail


@pytest.mark.asyncio
async def test_kiosk_punch_double_check_in_rejected():
    mock_session = AsyncMock()
    device = MagicMock()
    device.organization_id = uuid4()
    device.branch_id = uuid4()
    device.id = uuid4()
    device.ip_tracking_enabled = False

    emp = MagicMock()
    emp.id = uuid4()
    emp.first_name = "Jane"
    emp.last_name = "Doe"
    emp.employee_code = "EMP-042"

    record = MagicMock()
    record.check_in_at = datetime.now(timezone.utc) - timedelta(hours=2)
    record.check_out_at = None

    emp_res = MagicMock()
    emp_res.scalar_one_or_none.return_value = emp

    att_res = MagicMock()
    att_res.scalar_one_or_none.return_value = record

    mock_session.execute = AsyncMock(side_effect=[emp_res, att_res])

    req = KioskPunchRequest(
        employee_code="EMP-042",
        punch_type="check_in",
    )

    with pytest.raises(HTTPException) as exc_info:
        await KioskService.process_kiosk_punch(mock_session, device, req)

    assert exc_info.value.status_code == 400
    assert "already checked in for today" in exc_info.value.detail
    assert "Next action must be Check Out" in exc_info.value.detail or "must be Check Out" in exc_info.value.detail


@pytest.mark.asyncio
async def test_kiosk_punch_check_out_without_check_in_rejected():
    mock_session = AsyncMock()
    device = MagicMock()
    device.organization_id = uuid4()
    device.branch_id = uuid4()
    device.id = uuid4()
    device.ip_tracking_enabled = False

    emp = MagicMock()
    emp.id = uuid4()
    emp.first_name = "Jane"
    emp.last_name = "Doe"
    emp.employee_code = "EMP-042"

    emp_res = MagicMock()
    emp_res.scalar_one_or_none.return_value = emp

    att_res = MagicMock()
    att_res.scalar_one_or_none.return_value = None  # No check-in record

    mock_session.execute = AsyncMock(side_effect=[emp_res, att_res])

    req = KioskPunchRequest(
        employee_code="EMP-042",
        punch_type="check_out",
    )

    with pytest.raises(HTTPException) as exc_info:
        await KioskService.process_kiosk_punch(mock_session, device, req)

    assert exc_info.value.status_code == 400
    assert "has not checked in today yet" in exc_info.value.detail


@pytest.mark.asyncio
async def test_kiosk_punch_shift_completed_lock():
    mock_session = AsyncMock()
    device = MagicMock()
    device.organization_id = uuid4()
    device.branch_id = uuid4()
    device.id = uuid4()
    device.ip_tracking_enabled = False

    emp = MagicMock()
    emp.id = uuid4()
    emp.first_name = "Jane"
    emp.last_name = "Doe"
    emp.employee_code = "EMP-042"

    record = MagicMock()
    record.check_in_at = datetime.now(timezone.utc) - timedelta(hours=9)
    record.check_out_at = datetime.now(timezone.utc) - timedelta(hours=1)

    emp_res = MagicMock()
    emp_res.scalar_one_or_none.return_value = emp

    att_res = MagicMock()
    att_res.scalar_one_or_none.return_value = record

    mock_session.execute = AsyncMock(side_effect=[emp_res, att_res])

    # Trying to punch again after shift completed
    req = KioskPunchRequest(
        employee_code="EMP-042",
        punch_type="check_in",
    )

    with pytest.raises(HTTPException) as exc_info:
        await KioskService.process_kiosk_punch(mock_session, device, req)

    assert exc_info.value.status_code == 400
    assert "already completed today's shift" in exc_info.value.detail
    assert "locked unless reset by an administrator" in exc_info.value.detail


@pytest.mark.asyncio
async def test_kiosk_punch_half_day_classification():
    mock_session = AsyncMock()
    device = MagicMock()
    device.organization_id = uuid4()
    device.branch_id = uuid4()
    device.id = uuid4()
    device.ip_tracking_enabled = False

    emp = MagicMock()
    emp.id = uuid4()
    emp.first_name = "Jane"
    emp.last_name = "Doe"
    emp.employee_code = "EMP-042"

    # Shift duration: 3.5 hours (< 4.5 hours threshold)
    record = MagicMock()
    record.check_in_at = datetime.now(timezone.utc) - timedelta(hours=3, minutes=30)
    record.check_out_at = None
    record.status = "present"
    record.verification_method = "fingerprint"
    record.latitude = None
    record.longitude = None
    record.face_snapshot_url = None

    emp_res = MagicMock()
    emp_res.scalar_one_or_none.return_value = emp

    att_res = MagicMock()
    att_res.scalar_one_or_none.return_value = record

    mock_session.execute = AsyncMock(side_effect=[emp_res, att_res])

    req = KioskPunchRequest(
        employee_code="EMP-042",
        punch_type="check_out",
    )

    res = await KioskService.process_kiosk_punch(mock_session, device, req)

    assert res.success is True
    assert record.status == "half_day"
    assert "Half Day" in res.message


@pytest.mark.asyncio
async def test_kiosk_punch_full_day_classification():
    mock_session = AsyncMock()
    device = MagicMock()
    device.organization_id = uuid4()
    device.branch_id = uuid4()
    device.id = uuid4()
    device.ip_tracking_enabled = False

    emp = MagicMock()
    emp.id = uuid4()
    emp.first_name = "Jane"
    emp.last_name = "Doe"
    emp.employee_code = "EMP-042"

    # Shift duration: 8.5 hours (>= 4.5 hours threshold)
    record = MagicMock()
    record.check_in_at = datetime.now(timezone.utc) - timedelta(hours=8, minutes=30)
    record.check_out_at = None
    record.status = "present"
    record.verification_method = "fingerprint"
    record.latitude = None
    record.longitude = None
    record.face_snapshot_url = None

    emp_res = MagicMock()
    emp_res.scalar_one_or_none.return_value = emp

    att_res = MagicMock()
    att_res.scalar_one_or_none.return_value = record

    mock_session.execute = AsyncMock(side_effect=[emp_res, att_res])

    req = KioskPunchRequest(
        employee_code="EMP-042",
        punch_type="check_out",
    )

    res = await KioskService.process_kiosk_punch(mock_session, device, req)

    assert res.success is True
    assert record.status == "present"
    assert "Shift completed" in res.message
