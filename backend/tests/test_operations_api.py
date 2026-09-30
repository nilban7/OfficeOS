"""Unit tests for Operations Management API endpoints and service methods.

Uses mocked AsyncSession and service methods — no live DB required.
"""

from datetime import UTC, date, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.schemas.common import PaginatedData, PaginationMeta
from app.schemas.operation import (
    OperationChecklistCreate,
    OperationChecklistResponse,
    OperationTaskAssign,
    OperationTaskCreate,
    OperationTaskResponse,
    OperationTaskStatusAction,
    OperationTaskUpdate,
)
from app.services.operation import OperationService


def _make_task_response(**overrides):
    defaults = {
        "id": uuid4(),
        "organization_id": uuid4(),
        "task_number": "OPT-001",
        "title": "Quarterly Facility Audit",
        "description": "Perform full inspection of building security and utilities",
        "category": "Facility",
        "priority": "high",
        "status": "open",
        "requester_id": None,
        "assigned_to_id": None,
        "department_id": None,
        "branch_id": None,
        "project_id": None,
        "client_id": None,
        "asset_id": None,
        "due_date": date(2025, 9, 30),
        "completed_at": None,
        "notes": None,
        "created_at": datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC),
        "updated_at": datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC),
        "requester": None,
        "assigned_to": None,
        "department": None,
        "branch": None,
        "project": None,
        "client": None,
        "asset": None,
        "checklists_count": 2,
        "completed_checklists_count": 0,
        "assignees_count": 0,
    }
    defaults.update(overrides)
    return OperationTaskResponse(**defaults)


def _make_checklist_response(**overrides):
    defaults = {
        "id": uuid4(),
        "organization_id": uuid4(),
        "task_id": uuid4(),
        "title": "Verify fire extinguishers",
        "sequence_order": 1,
        "is_required": True,
        "is_completed": False,
        "completed_by_id": None,
        "completed_at": None,
        "notes": None,
        "created_at": datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC),
        "updated_at": datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC),
        "completed_by": None,
    }
    defaults.update(overrides)
    return OperationChecklistResponse(**defaults)


@pytest.mark.asyncio
async def test_list_tasks_returns_paginated():
    items = [_make_task_response(), _make_task_response(task_number="OPT-002")]
    paginated = PaginatedData(
        items=items,
        meta=PaginationMeta(total=2, page=1, page_size=20, total_pages=1),
    )

    with patch("app.services.operation.OperationService.list_tasks", new=AsyncMock(return_value=paginated)):
        result = await OperationService.list_tasks(
            session=AsyncMock(), organization_id=uuid4()
        )
        assert result.meta.total == 2
        assert len(result.items) == 2


@pytest.mark.asyncio
async def test_create_task_duplicate_number_raises():
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = MagicMock()  # existing task
    mock_session.execute = AsyncMock(return_value=mock_result)

    payload = OperationTaskCreate(
        task_number="OPT-001",
        title="Inspection",
    )

    with pytest.raises(HTTPException) as exc_info:
        await OperationService.create_task(
            session=mock_session,
            organization_id=uuid4(),
            actor_user_id=uuid4(),
            payload=payload,
        )
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_create_task_invalid_assignee_raises():
    mock_session = AsyncMock()
    mock_result_num = MagicMock()
    mock_result_num.scalar_one_or_none.return_value = None  # no duplicate number
    mock_result_emp = MagicMock()
    mock_result_emp.scalar_one_or_none.return_value = None  # employee not found

    call_count = {"n": 0}

    async def side_effect(stmt):
        call_count["n"] += 1
        return mock_result_num if call_count["n"] == 1 else mock_result_emp

    mock_session.execute = AsyncMock(side_effect=side_effect)

    payload = OperationTaskCreate(
        task_number="OPT-NEW",
        title="Inspection",
        assigned_to_id=uuid4(),
    )

    with pytest.raises(HTTPException) as exc_info:
        await OperationService.create_task(
            session=mock_session,
            organization_id=uuid4(),
            actor_user_id=uuid4(),
            payload=payload,
        )
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_get_task_not_found_raises():
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(HTTPException) as exc_info:
        await OperationService.get_task(
            session=mock_session,
            organization_id=uuid4(),
            task_id=uuid4(),
        )
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_update_completed_task_raises():
    mock_task = MagicMock()
    mock_task.status = "completed"

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_task
    mock_session.execute = AsyncMock(return_value=mock_result)

    payload = OperationTaskUpdate(title="New Title")

    with pytest.raises(HTTPException) as exc_info:
        await OperationService.update_task(
            session=mock_session,
            organization_id=uuid4(),
            task_id=uuid4(),
            actor_user_id=uuid4(),
            payload=payload,
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_start_task_invalid_status_raises():
    mock_task = MagicMock()
    mock_task.status = "completed"

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_task
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(HTTPException) as exc_info:
        await OperationService.start_task(
            session=mock_session,
            organization_id=uuid4(),
            task_id=uuid4(),
            actor_user_id=uuid4(),
            payload=OperationTaskStatusAction(),
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_complete_task_with_incomplete_required_checklists_raises():
    mock_task = MagicMock()
    mock_task.status = "in_progress"

    mock_session = AsyncMock()
    mock_task_res = MagicMock()
    mock_task_res.scalar_one_or_none.return_value = mock_task

    mock_chk_res = MagicMock()
    mock_chk_res.scalar.return_value = 2  # 2 incomplete required items

    call_count = {"n": 0}

    async def side_effect(stmt):
        call_count["n"] += 1
        return mock_task_res if call_count["n"] == 1 else mock_chk_res

    mock_session.execute = AsyncMock(side_effect=side_effect)

    with pytest.raises(HTTPException) as exc_info:
        await OperationService.complete_task(
            session=mock_session,
            organization_id=uuid4(),
            task_id=uuid4(),
            actor_user_id=uuid4(),
            payload=OperationTaskStatusAction(),
        )
    assert exc_info.value.status_code == 400
    assert "required checklist" in exc_info.value.detail


@pytest.mark.asyncio
async def test_cancel_completed_task_raises():
    mock_task = MagicMock()
    mock_task.status = "completed"

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_task
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(HTTPException) as exc_info:
        await OperationService.cancel_task(
            session=mock_session,
            organization_id=uuid4(),
            task_id=uuid4(),
            actor_user_id=uuid4(),
            payload=OperationTaskStatusAction(),
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_delete_in_progress_task_raises():
    mock_task = MagicMock()
    mock_task.status = "in_progress"

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_task
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(HTTPException) as exc_info:
        await OperationService.delete_task(
            session=mock_session,
            organization_id=uuid4(),
            task_id=uuid4(),
            actor_user_id=uuid4(),
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_assign_task_not_found_raises():
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(HTTPException) as exc_info:
        await OperationService.assign_task(
            session=mock_session,
            organization_id=uuid4(),
            task_id=uuid4(),
            actor_user_id=uuid4(),
            payload=OperationTaskAssign(assigned_to_id=uuid4()),
        )
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_create_checklist_completed_task_raises():
    mock_task = MagicMock()
    mock_task.status = "completed"

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_task
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(HTTPException) as exc_info:
        await OperationService.create_checklist(
            session=mock_session,
            organization_id=uuid4(),
            task_id=uuid4(),
            actor_user_id=uuid4(),
            payload=OperationChecklistCreate(title="Check step"),
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_delete_checklist_not_found_raises():
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(HTTPException) as exc_info:
        await OperationService.delete_checklist(
            session=mock_session,
            organization_id=uuid4(),
            task_id=uuid4(),
            item_id=uuid4(),
            actor_user_id=uuid4(),
        )
    assert exc_info.value.status_code == 404
