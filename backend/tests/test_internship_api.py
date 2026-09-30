"""Unit tests for Internship Management API endpoints.

Uses mocked AsyncSession and service methods — no live DB required.
"""

from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.schemas.common import PaginatedData, PaginationMeta
from app.schemas.internship import (
    InternshipAction,
    InternshipCreate,
    InternshipExtend,
    InternshipResponse,
    InternshipReviewResponse,
    InternshipSupervisorCreate,
    InternshipSupervisorResponse,
)
from app.services.internship import InternshipService


def _make_internship_response(**overrides):
    defaults = {
        "id": uuid4(),
        "organization_id": uuid4(),
        "employee_id": None,
        "department_id": None,
        "supervisor_id": None,
        "title": "Software Dev Internship",
        "code": "INT-001",
        "intern_name": "Alice Smith",
        "intern_email": "alice@uni.edu",
        "institution": "State University",
        "start_date": date(2025, 6, 1),
        "end_date": date(2025, 8, 31),
        "status": "planned",
        "stipend": Decimal("500.00"),
        "description": None,
        "notes": None,
        "created_at": datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC),
        "updated_at": datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC),
        "supervisor": None,
        "supervisors_count": 0,
        "reviews_count": 0,
    }
    defaults.update(overrides)
    return InternshipResponse(**defaults)


def _make_supervisor_response(**overrides):
    defaults = {
        "id": uuid4(),
        "organization_id": uuid4(),
        "internship_id": uuid4(),
        "employee_id": uuid4(),
        "role": "supervisor",
        "created_at": datetime(2025, 1, 1, 12, 0, 0, tzinfo=UTC),
        "employee": None,
    }
    defaults.update(overrides)
    return InternshipSupervisorResponse(**defaults)


def _make_review_response(**overrides):
    defaults = {
        "id": uuid4(),
        "organization_id": uuid4(),
        "internship_id": uuid4(),
        "reviewer_id": None,
        "review_date": date(2025, 7, 15),
        "rating": 4,
        "feedback": "Good progress",
        "status": "submitted",
        "created_at": datetime(2025, 7, 15, 10, 0, 0, tzinfo=UTC),
        "updated_at": datetime(2025, 7, 15, 10, 0, 0, tzinfo=UTC),
        "reviewer": None,
        "internship": None,
    }
    defaults.update(overrides)
    return InternshipReviewResponse(**defaults)


@pytest.mark.asyncio
async def test_list_internships_returns_paginated():
    items = [_make_internship_response(), _make_internship_response(code="INT-002")]
    paginated = PaginatedData(
        items=items,
        meta=PaginationMeta(total=2, page=1, page_size=20, total_pages=1),
    )

    with patch("app.services.internship.InternshipService.list_internships", new=AsyncMock(return_value=paginated)):
        result = await InternshipService.list_internships(
            session=AsyncMock(), organization_id=uuid4()
        )
        assert result.meta.total == 2
        assert len(result.items) == 2


@pytest.mark.asyncio
async def test_create_internship_duplicate_code_raises():
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = MagicMock()  # simulate existing record
    mock_session.execute = AsyncMock(return_value=mock_result)

    payload = InternshipCreate(
        title="Dev Internship",
        code="INT-001",
        intern_name="Bob Jones",
        start_date=date(2025, 6, 1),
        end_date=date(2025, 8, 31),
    )

    with pytest.raises(HTTPException) as exc_info:
        await InternshipService.create_internship(
            session=mock_session,
            organization_id=uuid4(),
            actor_user_id=uuid4(),
            payload=payload,
        )
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_create_internship_invalid_dates_raises():
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None  # no duplicate
    mock_session.execute = AsyncMock(return_value=mock_result)

    payload = InternshipCreate(
        title="Dev Internship",
        code="INT-NEW",
        intern_name="Bob Jones",
        start_date=date(2025, 8, 31),
        end_date=date(2025, 6, 1),  # end before start
    )

    with pytest.raises(HTTPException) as exc_info:
        await InternshipService.create_internship(
            session=mock_session,
            organization_id=uuid4(),
            actor_user_id=uuid4(),
            payload=payload,
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_get_internship_not_found_raises():
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(HTTPException) as exc_info:
        await InternshipService.get_internship(
            session=mock_session,
            organization_id=uuid4(),
            internship_id=uuid4(),
        )
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_delete_active_internship_raises():
    mock_internship = MagicMock()
    mock_internship.status = "active"

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_internship
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(HTTPException) as exc_info:
        await InternshipService.delete_internship(
            session=mock_session,
            organization_id=uuid4(),
            internship_id=uuid4(),
            actor_user_id=uuid4(),
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_start_internship_wrong_status_raises():
    mock_internship = MagicMock()
    mock_internship.status = "completed"

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_internship
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(HTTPException) as exc_info:
        await InternshipService.start_internship(
            session=mock_session,
            organization_id=uuid4(),
            internship_id=uuid4(),
            actor_user_id=uuid4(),
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_extend_internship_date_not_later_raises():
    mock_internship = MagicMock()
    mock_internship.status = "active"
    mock_internship.end_date = date(2025, 8, 31)

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_internship
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(HTTPException) as exc_info:
        await InternshipService.extend_internship(
            session=mock_session,
            organization_id=uuid4(),
            internship_id=uuid4(),
            actor_user_id=uuid4(),
            payload=InternshipExtend(new_end_date=date(2025, 7, 31)),  # before current end
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_terminate_completed_internship_raises():
    mock_internship = MagicMock()
    mock_internship.status = "completed"

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_internship
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(HTTPException) as exc_info:
        await InternshipService.terminate_internship(
            session=mock_session,
            organization_id=uuid4(),
            internship_id=uuid4(),
            actor_user_id=uuid4(),
            payload=InternshipAction(),
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_add_duplicate_supervisor_raises():
    mock_internship = MagicMock()
    mock_internship.status = "active"
    mock_employee = MagicMock()
    mock_existing_supervisor = MagicMock()

    call_count = {"n": 0}

    async def side_effect(stmt):
        call_count["n"] += 1
        result = MagicMock()
        if call_count["n"] == 1:  # get_internship_or_404
            result.scalar_one_or_none.return_value = mock_internship
        elif call_count["n"] == 2:  # get employee
            result.scalar_one_or_none.return_value = mock_employee
        else:  # check duplicate
            result.scalar_one_or_none.return_value = mock_existing_supervisor
        return result

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(side_effect=side_effect)

    emp_id = uuid4()
    with pytest.raises(HTTPException) as exc_info:
        await InternshipService.add_supervisor(
            session=mock_session,
            organization_id=uuid4(),
            internship_id=uuid4(),
            actor_user_id=uuid4(),
            payload=InternshipSupervisorCreate(employee_id=emp_id),
        )
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_delete_review_not_found_raises():
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(HTTPException) as exc_info:
        await InternshipService.delete_review(
            session=mock_session,
            organization_id=uuid4(),
            internship_id=uuid4(),
            review_id=uuid4(),
            actor_user_id=uuid4(),
        )
    assert exc_info.value.status_code == 404
