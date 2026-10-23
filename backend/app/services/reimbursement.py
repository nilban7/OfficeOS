import math
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.employee import Employee
from app.models.reimbursement import ReimbursementClaim
from app.schemas.common import PaginatedData, PaginationMeta
from app.schemas.reimbursement import (
    ReimbursementClaimCreate,
    ReimbursementClaimResponse,
    ReimbursementClaimUpdate,
    ReimbursementPayAction,
    ReimbursementReviewAction,
    ReimbursementSummaryKPI,
)


class ReimbursementService:
    @staticmethod
    def _map_claim_response(claim: ReimbursementClaim) -> ReimbursementClaimResponse:
        emp = claim.employee
        rev = claim.reviewer
        emp_name = f"{emp.first_name} {emp.last_name}" if emp else None
        emp_code = emp.employee_code if emp else None
        rev_name = f"{rev.first_name} {rev.last_name}" if rev else None

        return ReimbursementClaimResponse(
            id=claim.id,
            organization_id=claim.organization_id,
            employee_id=claim.employee_id,
            employee_name=emp_name,
            employee_code=emp_code,
            claim_number=claim.claim_number,
            title=claim.title,
            category=claim.category,
            claim_date=claim.claim_date,
            amount=claim.amount,
            currency=claim.currency,
            status=claim.status,
            receipt_url=claim.receipt_url,
            description=claim.description,
            items=claim.items or [],
            submitted_at=claim.submitted_at,
            reviewer_id=claim.reviewer_id,
            reviewer_name=rev_name,
            reviewed_at=claim.reviewed_at,
            reviewer_comment=claim.reviewer_comment,
            paid_at=claim.paid_at,
            payment_reference=claim.payment_reference,
            created_at=claim.created_at,
            updated_at=claim.updated_at,
        )

    @classmethod
    async def get_summary_kpi(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
    ) -> ReimbursementSummaryKPI:
        base_filter = ReimbursementClaim.organization_id == organization_id

        # Total counts by status
        total_stmt = select(func.count(ReimbursementClaim.id)).where(base_filter)
        total_claims = await session.scalar(total_stmt) or 0

        pending_stmt = select(func.count(ReimbursementClaim.id)).where(
            base_filter, ReimbursementClaim.status == "submitted"
        )
        pending_count = await session.scalar(pending_stmt) or 0

        approved_stmt = select(func.count(ReimbursementClaim.id)).where(
            base_filter, ReimbursementClaim.status == "approved"
        )
        approved_count = await session.scalar(approved_stmt) or 0

        paid_stmt = select(func.count(ReimbursementClaim.id)).where(
            base_filter, ReimbursementClaim.status == "paid"
        )
        paid_count = await session.scalar(paid_stmt) or 0

        # Amounts
        total_amount_stmt = select(func.coalesce(func.sum(ReimbursementClaim.amount), 0)).where(
            base_filter, ReimbursementClaim.status != "cancelled"
        )
        total_amount = await session.scalar(total_amount_stmt) or Decimal("0.00")

        pending_amount_stmt = select(func.coalesce(func.sum(ReimbursementClaim.amount), 0)).where(
            base_filter, ReimbursementClaim.status == "submitted"
        )
        pending_amount = await session.scalar(pending_amount_stmt) or Decimal("0.00")

        paid_amount_stmt = select(func.coalesce(func.sum(ReimbursementClaim.amount), 0)).where(
            base_filter, ReimbursementClaim.status == "paid"
        )
        paid_amount = await session.scalar(paid_amount_stmt) or Decimal("0.00")

        return ReimbursementSummaryKPI(
            total_claims_count=total_claims,
            pending_approval_count=pending_count,
            approved_unpaid_count=approved_count,
            paid_claims_count=paid_count,
            total_claimed_amount=Decimal(str(total_amount)),
            pending_approval_amount=Decimal(str(pending_amount)),
            total_reimbursed_amount=Decimal(str(paid_amount)),
            currency="USD",
        )

    @classmethod
    async def list_claims(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        search: str | None = None,
        status_filter: str | None = None,
        category: str | None = None,
        employee_id: uuid.UUID | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        page: int = 1,
        page_size: int = 20,
        actor_employee_id: uuid.UUID | None = None,
        is_employee_restricted: bool = False,
    ) -> PaginatedData[ReimbursementClaimResponse]:
        query = (
            select(ReimbursementClaim)
            .where(ReimbursementClaim.organization_id == organization_id)
            .options(
                selectinload(ReimbursementClaim.employee),
                selectinload(ReimbursementClaim.reviewer),
            )
        )

        if is_employee_restricted and actor_employee_id:
            query = query.where(ReimbursementClaim.employee_id == actor_employee_id)
        elif employee_id:
            query = query.where(ReimbursementClaim.employee_id == employee_id)

        if status_filter and status_filter.lower() != "all":
            query = query.where(ReimbursementClaim.status == status_filter.lower())

        if category and category.lower() != "all":
            query = query.where(ReimbursementClaim.category == category.lower())

        if start_date:
            query = query.where(ReimbursementClaim.claim_date >= start_date)

        if end_date:
            query = query.where(ReimbursementClaim.claim_date <= end_date)

        if search and search.strip():
            term = f"%{search.strip()}%"
            query = query.where(
                or_(
                    ReimbursementClaim.claim_number.ilike(term),
                    ReimbursementClaim.title.ilike(term),
                    ReimbursementClaim.description.ilike(term),
                )
            )

        # Count total
        count_stmt = select(func.count()).select_from(query.subquery())
        total_items = await session.scalar(count_stmt) or 0

        # Paginate
        offset = (page - 1) * page_size
        items_stmt = (
            query.order_by(ReimbursementClaim.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        result = await session.execute(items_stmt)
        claims = result.scalars().all()

        total_pages = math.ceil(total_items / page_size) if total_items > 0 else 1

        items = [cls._map_claim_response(c) for c in claims]

        return PaginatedData(
            items=items,
            meta=PaginationMeta(
                total=total_items,
                page=page,
                page_size=page_size,
                total_pages=total_pages,
            ),
        )

    @classmethod
    async def get_claim(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        claim_id: uuid.UUID,
    ) -> ReimbursementClaimResponse:
        stmt = (
            select(ReimbursementClaim)
            .where(
                ReimbursementClaim.id == claim_id,
                ReimbursementClaim.organization_id == organization_id,
            )
            .options(
                selectinload(ReimbursementClaim.employee),
                selectinload(ReimbursementClaim.reviewer),
            )
        )
        claim = await session.scalar(stmt)
        if not claim:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Reimbursement claim not found",
            )
        return cls._map_claim_response(claim)

    @classmethod
    async def create_claim(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        actor_employee_id: uuid.UUID | None,
        payload: ReimbursementClaimCreate,
    ) -> ReimbursementClaimResponse:
        effective_employee_id = payload.employee_id or actor_employee_id
        if not effective_employee_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Employee profile must be associated to file reimbursement claim",
            )

        # Validate employee belongs to organization
        emp_stmt = select(Employee).where(
            Employee.id == effective_employee_id,
            Employee.organization_id == organization_id,
        )
        emp = await session.scalar(emp_stmt)
        if not emp:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found in organization",
            )

        # Generate claim number: CLM-YYYYMM-XXXX
        today = date.today()
        prefix = f"CLM-{today.strftime('%Y%m')}"
        count_stmt = select(func.count(ReimbursementClaim.id)).where(
            ReimbursementClaim.organization_id == organization_id,
            ReimbursementClaim.claim_number.like(f"{prefix}-%"),
        )
        existing_count = await session.scalar(count_stmt) or 0
        claim_number = f"{prefix}-{existing_count + 1:04d}"

        # Serialize items if provided
        serialized_items = [item.model_dump(mode="json") for item in payload.items]

        initial_status = "submitted" if payload.submit_immediately else "draft"
        submitted_at = datetime.now(UTC) if payload.submit_immediately else None

        claim = ReimbursementClaim(
            id=uuid.uuid4(),
            organization_id=organization_id,
            employee_id=effective_employee_id,
            claim_number=claim_number,
            title=payload.title,
            category=payload.category,
            claim_date=payload.claim_date,
            amount=payload.amount,
            currency=payload.currency or "USD",
            status=initial_status,
            receipt_url=payload.receipt_url,
            description=payload.description,
            items=serialized_items,
            submitted_at=submitted_at,
        )

        session.add(claim)
        await session.flush()
        await session.refresh(claim, attribute_names=["employee", "reviewer"])

        return cls._map_claim_response(claim)

    @classmethod
    async def update_claim(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        claim_id: uuid.UUID,
        payload: ReimbursementClaimUpdate,
        actor_employee_id: uuid.UUID | None = None,
        is_employee_restricted: bool = False,
    ) -> ReimbursementClaimResponse:
        stmt = (
            select(ReimbursementClaim)
            .where(
                ReimbursementClaim.id == claim_id,
                ReimbursementClaim.organization_id == organization_id,
            )
            .options(
                selectinload(ReimbursementClaim.employee),
                selectinload(ReimbursementClaim.reviewer),
            )
        )
        claim = await session.scalar(stmt)
        if not claim:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Reimbursement claim not found",
            )

        if is_employee_restricted and actor_employee_id and claim.employee_id != actor_employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot edit someone else's reimbursement claim",
            )

        if claim.status not in ("draft", "rejected"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot edit claim in '{claim.status}' status",
            )

        update_data = payload.model_dump(exclude_unset=True)
        if "items" in update_data and update_data["items"] is not None:
            update_data["items"] = [item.model_dump(mode="json") if hasattr(item, "model_dump") else item for item in payload.items or []]

        for field, value in update_data.items():
            setattr(claim, field, value)

        await session.flush()
        await session.refresh(claim, attribute_names=["employee", "reviewer"])
        return cls._map_claim_response(claim)

    @classmethod
    async def submit_claim(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        claim_id: uuid.UUID,
        actor_employee_id: uuid.UUID | None = None,
        is_employee_restricted: bool = False,
    ) -> ReimbursementClaimResponse:
        stmt = (
            select(ReimbursementClaim)
            .where(
                ReimbursementClaim.id == claim_id,
                ReimbursementClaim.organization_id == organization_id,
            )
            .options(
                selectinload(ReimbursementClaim.employee),
                selectinload(ReimbursementClaim.reviewer),
            )
        )
        claim = await session.scalar(stmt)
        if not claim:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Reimbursement claim not found",
            )

        if is_employee_restricted and actor_employee_id and claim.employee_id != actor_employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only submit your own claims",
            )

        if claim.status != "draft":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Claim is in '{claim.status}' state and cannot be submitted",
            )

        claim.status = "submitted"
        claim.submitted_at = datetime.now(UTC)

        await session.flush()
        await session.refresh(claim, attribute_names=["employee", "reviewer"])
        return cls._map_claim_response(claim)

    @classmethod
    async def approve_claim(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        claim_id: uuid.UUID,
        reviewer_employee_id: uuid.UUID | None,
        payload: ReimbursementReviewAction,
    ) -> ReimbursementClaimResponse:
        stmt = (
            select(ReimbursementClaim)
            .where(
                ReimbursementClaim.id == claim_id,
                ReimbursementClaim.organization_id == organization_id,
            )
            .options(
                selectinload(ReimbursementClaim.employee),
                selectinload(ReimbursementClaim.reviewer),
            )
        )
        claim = await session.scalar(stmt)
        if not claim:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Reimbursement claim not found",
            )

        if claim.status != "submitted":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only submitted claims can be approved (currently '{claim.status}')",
            )

        claim.status = "approved"
        claim.reviewer_id = reviewer_employee_id
        claim.reviewed_at = datetime.now(UTC)
        if payload.reviewer_comment:
            claim.reviewer_comment = payload.reviewer_comment

        await session.flush()
        await session.refresh(claim, attribute_names=["employee", "reviewer"])
        return cls._map_claim_response(claim)

    @classmethod
    async def reject_claim(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        claim_id: uuid.UUID,
        reviewer_employee_id: uuid.UUID | None,
        payload: ReimbursementReviewAction,
    ) -> ReimbursementClaimResponse:
        stmt = (
            select(ReimbursementClaim)
            .where(
                ReimbursementClaim.id == claim_id,
                ReimbursementClaim.organization_id == organization_id,
            )
            .options(
                selectinload(ReimbursementClaim.employee),
                selectinload(ReimbursementClaim.reviewer),
            )
        )
        claim = await session.scalar(stmt)
        if not claim:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Reimbursement claim not found",
            )

        if claim.status != "submitted":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only submitted claims can be rejected (currently '{claim.status}')",
            )

        claim.status = "rejected"
        claim.reviewer_id = reviewer_employee_id
        claim.reviewed_at = datetime.now(UTC)
        if payload.reviewer_comment:
            claim.reviewer_comment = payload.reviewer_comment

        await session.flush()
        await session.refresh(claim, attribute_names=["employee", "reviewer"])
        return cls._map_claim_response(claim)

    @classmethod
    async def pay_claim(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        claim_id: uuid.UUID,
        payload: ReimbursementPayAction,
    ) -> ReimbursementClaimResponse:
        stmt = (
            select(ReimbursementClaim)
            .where(
                ReimbursementClaim.id == claim_id,
                ReimbursementClaim.organization_id == organization_id,
            )
            .options(
                selectinload(ReimbursementClaim.employee),
                selectinload(ReimbursementClaim.reviewer),
            )
        )
        claim = await session.scalar(stmt)
        if not claim:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Reimbursement claim not found",
            )

        if claim.status != "approved":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only approved claims can be disbursed as paid (currently '{claim.status}')",
            )

        claim.status = "paid"
        claim.paid_at = datetime.now(UTC)
        if payload.payment_reference:
            claim.payment_reference = payload.payment_reference

        await session.flush()
        await session.refresh(claim, attribute_names=["employee", "reviewer"])
        return cls._map_claim_response(claim)

    @classmethod
    async def cancel_claim(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        claim_id: uuid.UUID,
        actor_employee_id: uuid.UUID | None = None,
        is_employee_restricted: bool = False,
    ) -> ReimbursementClaimResponse:
        stmt = (
            select(ReimbursementClaim)
            .where(
                ReimbursementClaim.id == claim_id,
                ReimbursementClaim.organization_id == organization_id,
            )
            .options(
                selectinload(ReimbursementClaim.employee),
                selectinload(ReimbursementClaim.reviewer),
            )
        )
        claim = await session.scalar(stmt)
        if not claim:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Reimbursement claim not found",
            )

        if is_employee_restricted and actor_employee_id and claim.employee_id != actor_employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only cancel your own claims",
            )

        if claim.status in ("paid", "cancelled"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot cancel claim in '{claim.status}' state",
            )

        claim.status = "cancelled"

        await session.flush()
        await session.refresh(claim, attribute_names=["employee", "reviewer"])
        return cls._map_claim_response(claim)

    @classmethod
    async def delete_claim(
        cls,
        session: AsyncSession,
        organization_id: uuid.UUID,
        claim_id: uuid.UUID,
        actor_employee_id: uuid.UUID | None = None,
        is_employee_restricted: bool = False,
    ) -> None:
        stmt = select(ReimbursementClaim).where(
            ReimbursementClaim.id == claim_id,
            ReimbursementClaim.organization_id == organization_id,
        )
        claim = await session.scalar(stmt)
        if not claim:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Reimbursement claim not found",
            )

        if is_employee_restricted and actor_employee_id and claim.employee_id != actor_employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only delete your own claims",
            )

        if claim.status != "draft":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete non-draft claim (currently '{claim.status}')",
            )

        await session.delete(claim)
        await session.flush()
