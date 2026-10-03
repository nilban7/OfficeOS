import uuid
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal
from math import ceil
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.client import Client
from app.models.employee import Employee
from app.models.finance import Expense, ExpenseCategory, ExpenseItem, FinancialTransaction
from app.models.identity import Branch
from app.models.procurement import Vendor
from app.models.project import Project
from app.schemas.common import PaginatedData, PaginationMeta
from app.schemas.finance import (
    BranchSummary,
    CategorySummary,
    ClientSummary,
    EmployeeSummary,
    ExpenseAction,
    ExpenseCategoryCreate,
    ExpenseCategoryResponse,
    ExpenseCategoryUpdate,
    ExpenseCreate,
    ExpenseDetail,
    ExpenseItemResponse,
    ExpensePayAction,
    ExpenseResponse,
    ExpenseReviewAction,
    ExpenseUpdate,
    FinancialOverview,
    FinancialTransactionCreate,
    FinancialTransactionResponse,
    FinancialTransactionUpdate,
    ProjectSummary,
    VendorSummary,
)
from app.services.organization import record_audit_log

TWO_PLACES = Decimal("0.01")


def _round(val: Decimal) -> Decimal:
    return val.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def _to_list(result: Any) -> list[Any]:
    if result is None:
        return []
    if isinstance(result, list):
        return result
    if hasattr(result, "all"):
        return list(result.all())
    return list(result)


def _build_employee_summary(employee: Employee | None) -> EmployeeSummary | None:
    if employee is None:
        return None
    return EmployeeSummary(
        id=employee.id,
        employee_code=employee.employee_code,
        first_name=employee.first_name,
        last_name=employee.last_name,
        designation=employee.designation,
    )


def _build_category_summary(category: ExpenseCategory | None) -> CategorySummary | None:
    if category is None:
        return None
    return CategorySummary(
        id=category.id,
        name=category.name,
        code=category.code,
    )


def _build_project_summary(project: Project | None) -> ProjectSummary | None:
    if project is None:
        return None
    return ProjectSummary(
        id=project.id,
        name=project.name,
        code=getattr(project, "project_code", getattr(project, "code", "")),
    )


def _build_client_summary(client: Client | None) -> ClientSummary | None:
    if client is None:
        return None
    return ClientSummary(
        id=client.id,
        name=client.name,
    )


def _build_vendor_summary(vendor: Vendor | None) -> VendorSummary | None:
    if vendor is None:
        return None
    return VendorSummary(
        id=vendor.id,
        name=vendor.name,
        code=vendor.code,
    )


def _build_branch_summary(branch: Branch | None) -> BranchSummary | None:
    if branch is None:
        return None
    return BranchSummary(
        id=branch.id,
        name=branch.name,
        code=branch.code,
    )


def _build_expense_response(
    expense: Expense,
    items_count: int = 0,
) -> ExpenseResponse:
    return ExpenseResponse(
        id=expense.id,
        organization_id=expense.organization_id,
        expense_number=expense.expense_number,
        employee_id=expense.employee_id,
        category_id=expense.category_id,
        project_id=expense.project_id,
        client_id=expense.client_id,
        branch_id=expense.branch_id,
        expense_date=expense.expense_date,
        description=expense.description,
        amount=expense.amount,
        tax_amount=expense.tax_amount,
        total_amount=expense.total_amount,
        currency=expense.currency,
        status=expense.status,
        submitted_at=expense.submitted_at,
        approved_at=expense.approved_at,
        rejected_at=expense.rejected_at,
        paid_at=expense.paid_at,
        reviewer_id=expense.reviewer_id,
        reviewer_comment=expense.reviewer_comment,
        notes=expense.notes,
        created_at=expense.created_at,
        updated_at=expense.updated_at,
        employee=_build_employee_summary(expense.employee) if hasattr(expense, "employee") else None,
        category=_build_category_summary(expense.category) if hasattr(expense, "category") else None,
        project=_build_project_summary(expense.project) if hasattr(expense, "project") else None,
        client=_build_client_summary(expense.client) if hasattr(expense, "client") else None,
        branch=_build_branch_summary(expense.branch) if hasattr(expense, "branch") else None,
        reviewer=_build_employee_summary(expense.reviewer) if hasattr(expense, "reviewer") else None,
        items_count=items_count,
    )


def _build_item_response(item: ExpenseItem) -> ExpenseItemResponse:
    return ExpenseItemResponse(
        id=item.id,
        organization_id=item.organization_id,
        expense_id=item.expense_id,
        description=item.description,
        quantity=item.quantity,
        unit_price=item.unit_price,
        tax_amount=item.tax_amount,
        line_total=item.line_total,
        created_at=item.created_at,
    )


def _build_transaction_response(tx: FinancialTransaction) -> FinancialTransactionResponse:
    return FinancialTransactionResponse(
        id=tx.id,
        organization_id=tx.organization_id,
        transaction_number=tx.transaction_number,
        transaction_date=tx.transaction_date,
        transaction_type=tx.transaction_type,
        reference_type=tx.reference_type,
        reference_id=tx.reference_id,
        description=tx.description,
        debit=tx.debit,
        credit=tx.credit,
        currency=tx.currency,
        project_id=tx.project_id,
        client_id=tx.client_id,
        vendor_id=tx.vendor_id,
        employee_id=tx.employee_id,
        status=tx.status,
        notes=tx.notes,
        created_at=tx.created_at,
        updated_at=tx.updated_at,
        project=_build_project_summary(tx.project) if hasattr(tx, "project") else None,
        client=_build_client_summary(tx.client) if hasattr(tx, "client") else None,
        vendor=_build_vendor_summary(tx.vendor) if hasattr(tx, "vendor") else None,
        employee=_build_employee_summary(tx.employee) if hasattr(tx, "employee") else None,
    )


class FinanceService:
    # =========================================================================
    # Validation Helpers
    # =========================================================================

    @staticmethod
    async def _validate_linked_entities(
        session: AsyncSession,
        organization_id: UUID,
        employee_id: UUID | None = None,
        category_id: UUID | None = None,
        project_id: UUID | None = None,
        client_id: UUID | None = None,
        branch_id: UUID | None = None,
        vendor_id: UUID | None = None,
    ) -> None:
        if employee_id:
            res = await session.execute(
                select(Employee).where(
                    Employee.organization_id == organization_id,
                    Employee.id == employee_id,
                )
            )
            if not res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Employee not found in organization.",
                )

        if category_id:
            res = await session.execute(
                select(ExpenseCategory).where(
                    ExpenseCategory.organization_id == organization_id,
                    ExpenseCategory.id == category_id,
                )
            )
            if not res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Expense category not found in organization.",
                )

        if project_id:
            res = await session.execute(
                select(Project).where(
                    Project.organization_id == organization_id,
                    Project.id == project_id,
                )
            )
            if not res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found in organization.",
                )

        if client_id:
            res = await session.execute(
                select(Client).where(
                    Client.organization_id == organization_id,
                    Client.id == client_id,
                )
            )
            if not res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Client not found in organization.",
                )

        if branch_id:
            res = await session.execute(
                select(Branch).where(
                    Branch.organization_id == organization_id,
                    Branch.id == branch_id,
                )
            )
            if not res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Branch not found in organization.",
                )

        if vendor_id:
            res = await session.execute(
                select(Vendor).where(
                    Vendor.organization_id == organization_id,
                    Vendor.id == vendor_id,
                )
            )
            if not res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Vendor not found in organization.",
                )

    # =========================================================================
    # Expense Categories
    # =========================================================================

    @staticmethod
    async def list_categories(
        session: AsyncSession,
        organization_id: UUID,
        include_inactive: bool = False,
    ) -> list[ExpenseCategoryResponse]:
        stmt = select(ExpenseCategory).where(ExpenseCategory.organization_id == organization_id)
        if not include_inactive:
            stmt = stmt.where(ExpenseCategory.is_active == True)
        stmt = stmt.order_by(ExpenseCategory.name.asc())
        res = await session.execute(stmt)
        return [ExpenseCategoryResponse.model_validate(c) for c in _to_list(res.scalars())]

    @staticmethod
    async def get_category(
        session: AsyncSession,
        organization_id: UUID,
        category_id: UUID,
    ) -> ExpenseCategoryResponse:
        stmt = select(ExpenseCategory).where(
            ExpenseCategory.organization_id == organization_id,
            ExpenseCategory.id == category_id,
        )
        res = await session.execute(stmt)
        cat = res.scalar_one_or_none()
        if not cat:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense category not found.")
        return ExpenseCategoryResponse.model_validate(cat)

    @staticmethod
    async def create_category(
        session: AsyncSession,
        organization_id: UUID,
        actor_user_id: UUID,
        payload: ExpenseCategoryCreate,
    ) -> ExpenseCategoryResponse:
        existing = await session.execute(
            select(ExpenseCategory).where(
                ExpenseCategory.organization_id == organization_id,
                ExpenseCategory.code == payload.code.strip().upper(),
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Category with code '{payload.code.strip().upper()}' already exists.",
            )

        cat = ExpenseCategory(
            id=uuid.uuid4(),
            organization_id=organization_id,
            name=payload.name.strip(),
            code=payload.code.strip().upper(),
            description=payload.description,
            is_active=payload.is_active,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(cat)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="expense_category.create",
            entity_type="expense_category",
            entity_id=cat.id,
            details={"name": cat.name, "code": cat.code},
        )
        return ExpenseCategoryResponse.model_validate(cat)

    @staticmethod
    async def update_category(
        session: AsyncSession,
        organization_id: UUID,
        category_id: UUID,
        actor_user_id: UUID,
        payload: ExpenseCategoryUpdate,
    ) -> ExpenseCategoryResponse:
        stmt = select(ExpenseCategory).where(
            ExpenseCategory.organization_id == organization_id,
            ExpenseCategory.id == category_id,
        )
        res = await session.execute(stmt)
        cat = res.scalar_one_or_none()
        if not cat:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense category not found.")

        if payload.name is not None:
            cat.name = payload.name.strip()
        if payload.description is not None:
            cat.description = payload.description
        if payload.is_active is not None:
            cat.is_active = payload.is_active

        cat.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="expense_category.update",
            entity_type="expense_category",
            entity_id=cat.id,
            details={"updated_fields": list(payload.model_dump(exclude_unset=True).keys())},
        )
        return ExpenseCategoryResponse.model_validate(cat)

    @staticmethod
    async def delete_category(
        session: AsyncSession,
        organization_id: UUID,
        category_id: UUID,
        actor_user_id: UUID,
    ) -> None:
        stmt = select(ExpenseCategory).where(
            ExpenseCategory.organization_id == organization_id,
            ExpenseCategory.id == category_id,
        )
        res = await session.execute(stmt)
        cat = res.scalar_one_or_none()
        if not cat:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense category not found.")

        # Check if in use by expenses
        usage_res = await session.execute(
            select(func.count(Expense.id)).where(
                Expense.organization_id == organization_id,
                Expense.category_id == category_id,
            )
        )
        if (usage_res.scalar() or 0) > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete category that is referenced by expenses. Deactivate it instead.",
            )

        await session.delete(cat)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="expense_category.delete",
            entity_type="expense_category",
            entity_id=category_id,
            details={"code": cat.code},
        )

    # =========================================================================
    # Expenses
    # =========================================================================

    @staticmethod
    async def create_expense(
        session: AsyncSession,
        organization_id: UUID,
        actor_user_id: UUID,
        payload: ExpenseCreate,
    ) -> ExpenseResponse:
        # Check duplicate expense_number in organization
        existing_res = await session.execute(
            select(Expense).where(
                Expense.organization_id == organization_id,
                Expense.expense_number == payload.expense_number.strip(),
            )
        )
        if existing_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Expense number '{payload.expense_number.strip()}' already exists.",
            )

        # Validate linked entities
        await FinanceService._validate_linked_entities(
            session=session,
            organization_id=organization_id,
            employee_id=payload.employee_id,
            category_id=payload.category_id,
            project_id=payload.project_id,
            client_id=payload.client_id,
            branch_id=payload.branch_id,
        )

        expense_id = uuid.uuid4()
        now = datetime.now(UTC)

        # Calculate amounts
        if payload.items and len(payload.items) > 0:
            subtotal = Decimal("0.00")
            total_tax = Decimal("0.00")
            item_records = []
            for item in payload.items:
                line_sub = _round(item.quantity * item.unit_price)
                line_tax = _round(item.tax_amount)
                line_total = line_sub + line_tax
                subtotal += line_sub
                total_tax += line_tax

                item_records.append(
                    ExpenseItem(
                        id=uuid.uuid4(),
                        organization_id=organization_id,
                        expense_id=expense_id,
                        description=item.description.strip(),
                        quantity=item.quantity,
                        unit_price=item.unit_price,
                        tax_amount=line_tax,
                        line_total=line_total,
                        created_at=now,
                    )
                )
            amount = _round(subtotal)
            tax_amount = _round(total_tax)
            total_amount = amount + tax_amount
        else:
            amount = _round(payload.amount)
            tax_amount = _round(payload.tax_amount)
            total_amount = amount + tax_amount
            item_records = []

        expense = Expense(
            id=expense_id,
            organization_id=organization_id,
            expense_number=payload.expense_number.strip(),
            employee_id=payload.employee_id,
            category_id=payload.category_id,
            project_id=payload.project_id,
            client_id=payload.client_id,
            branch_id=payload.branch_id,
            expense_date=payload.expense_date,
            description=payload.description,
            amount=amount,
            tax_amount=tax_amount,
            total_amount=total_amount,
            currency=payload.currency.strip().upper(),
            status="draft",
            notes=payload.notes,
            created_at=now,
            updated_at=now,
        )
        session.add(expense)
        for item in item_records:
            session.add(item)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="expense.create",
            entity_type="expense",
            entity_id=expense.id,
            details={
                "expense_number": expense.expense_number,
                "amount": str(expense.amount),
                "total_amount": str(expense.total_amount),
            },
        )

        return _build_expense_response(expense, items_count=len(item_records))

    @staticmethod
    async def list_expenses(
        session: AsyncSession,
        organization_id: UUID,
        search: str | None = None,
        status_filter: str | None = None,
        category_id: UUID | None = None,
        employee_id: UUID | None = None,
        project_id: UUID | None = None,
        client_id: UUID | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        page: int = 1,
        page_size: int = 20,
        actor_employee_id: UUID | None = None,
        is_employee_restricted: bool = False,
    ) -> PaginatedData[ExpenseResponse]:
        stmt = (
            select(Expense)
            .where(Expense.organization_id == organization_id)
            .options(
                selectinload(Expense.employee),
                selectinload(Expense.category),
                selectinload(Expense.project),
                selectinload(Expense.client),
                selectinload(Expense.branch),
                selectinload(Expense.reviewer),
            )
        )

        if is_employee_restricted and actor_employee_id:
            stmt = stmt.where(Expense.employee_id == actor_employee_id)
        elif employee_id:
            stmt = stmt.where(Expense.employee_id == employee_id)

        if status_filter and status_filter != "all":
            stmt = stmt.where(Expense.status == status_filter)
        if category_id:
            stmt = stmt.where(Expense.category_id == category_id)
        if project_id:
            stmt = stmt.where(Expense.project_id == project_id)
        if client_id:
            stmt = stmt.where(Expense.client_id == client_id)
        if start_date:
            stmt = stmt.where(Expense.expense_date >= start_date)
        if end_date:
            stmt = stmt.where(Expense.expense_date <= end_date)

        if search and search.strip():
            term = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    Expense.expense_number.ilike(term),
                    Expense.description.ilike(term),
                )
            )

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_res = await session.execute(count_stmt)
        total = total_res.scalar() or 0

        total_pages = ceil(total / page_size) if total > 0 else 1
        offset = (page - 1) * page_size

        stmt = stmt.order_by(Expense.expense_date.desc(), Expense.created_at.desc()).offset(offset).limit(page_size)
        res = await session.execute(stmt)
        expenses = _to_list(res.scalars())

        items: list[ExpenseResponse] = []
        for exp in expenses:
            cnt_stmt = select(func.count(ExpenseItem.id)).where(ExpenseItem.expense_id == exp.id)
            cnt_res = await session.execute(cnt_stmt)
            cnt = cnt_res.scalar() or 0
            items.append(_build_expense_response(exp, items_count=cnt))

        return PaginatedData(
            items=items,
            meta=PaginationMeta(
                total=total,
                page=page,
                page_size=page_size,
                total_pages=total_pages,
            ),
        )

    @staticmethod
    async def get_expense(
        session: AsyncSession,
        organization_id: UUID,
        expense_id: UUID,
    ) -> ExpenseDetail:
        stmt = (
            select(Expense)
            .where(Expense.organization_id == organization_id, Expense.id == expense_id)
            .options(
                selectinload(Expense.employee),
                selectinload(Expense.category),
                selectinload(Expense.project),
                selectinload(Expense.client),
                selectinload(Expense.branch),
                selectinload(Expense.reviewer),
                selectinload(Expense.items),
            )
        )
        res = await session.execute(stmt)
        expense = res.scalar_one_or_none()
        if not expense:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found.")

        items = [_build_item_response(i) for i in expense.items]
        base_resp = _build_expense_response(expense, items_count=len(items))

        return ExpenseDetail(
            **base_resp.model_dump(),
            items=items,
        )

    @staticmethod
    async def update_expense(
        session: AsyncSession,
        organization_id: UUID,
        expense_id: UUID,
        actor_user_id: UUID,
        payload: ExpenseUpdate,
    ) -> ExpenseResponse:
        stmt = (
            select(Expense)
            .where(Expense.organization_id == organization_id, Expense.id == expense_id)
            .options(
                selectinload(Expense.employee),
                selectinload(Expense.category),
                selectinload(Expense.project),
                selectinload(Expense.client),
                selectinload(Expense.branch),
                selectinload(Expense.reviewer),
                selectinload(Expense.items),
            )
        )
        res = await session.execute(stmt)
        expense = res.scalar_one_or_none()
        if not expense:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found.")

        if expense.status not in ("draft", "rejected"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot edit expense with status '{expense.status}'. Only draft or rejected expenses can be edited.",
            )

        # Validate linked entities
        await FinanceService._validate_linked_entities(
            session=session,
            organization_id=organization_id,
            category_id=payload.category_id,
            project_id=payload.project_id,
            client_id=payload.client_id,
            branch_id=payload.branch_id,
        )

        now = datetime.now(UTC)
        if payload.category_id is not None:
            expense.category_id = payload.category_id
        if payload.project_id is not None:
            expense.project_id = payload.project_id
        if payload.client_id is not None:
            expense.client_id = payload.client_id
        if payload.branch_id is not None:
            expense.branch_id = payload.branch_id
        if payload.expense_date is not None:
            expense.expense_date = payload.expense_date
        if payload.description is not None:
            expense.description = payload.description
        if payload.currency is not None:
            expense.currency = payload.currency.strip().upper()
        if payload.notes is not None:
            expense.notes = payload.notes

        # Handle items update
        if payload.items is not None:
            # Delete old items
            for old_item in expense.items:
                await session.delete(old_item)

            subtotal = Decimal("0.00")
            total_tax = Decimal("0.00")
            for item in payload.items:
                line_sub = _round(item.quantity * item.unit_price)
                line_tax = _round(item.tax_amount)
                line_total = line_sub + line_tax
                subtotal += line_sub
                total_tax += line_tax

                session.add(
                    ExpenseItem(
                        id=uuid.uuid4(),
                        organization_id=organization_id,
                        expense_id=expense_id,
                        description=item.description.strip(),
                        quantity=item.quantity,
                        unit_price=item.unit_price,
                        tax_amount=line_tax,
                        line_total=line_total,
                        created_at=now,
                    )
                )
            expense.amount = _round(subtotal)
            expense.tax_amount = _round(total_tax)
            expense.total_amount = expense.amount + expense.tax_amount
        else:
            if payload.amount is not None:
                expense.amount = _round(payload.amount)
            if payload.tax_amount is not None:
                expense.tax_amount = _round(payload.tax_amount)
            expense.total_amount = expense.amount + expense.tax_amount

        expense.updated_at = now
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="expense.update",
            entity_type="expense",
            entity_id=expense.id,
            details={"updated_fields": list(payload.model_dump(exclude_unset=True).keys())},
        )
        return _build_expense_response(expense)

    @staticmethod
    async def submit_expense(
        session: AsyncSession,
        organization_id: UUID,
        expense_id: UUID,
        actor_user_id: UUID,
        payload: ExpenseAction,
    ) -> ExpenseResponse:
        stmt = (
            select(Expense)
            .where(Expense.organization_id == organization_id, Expense.id == expense_id)
            .options(
                selectinload(Expense.employee),
                selectinload(Expense.category),
                selectinload(Expense.project),
                selectinload(Expense.client),
                selectinload(Expense.branch),
                selectinload(Expense.reviewer),
            )
        )
        res = await session.execute(stmt)
        expense = res.scalar_one_or_none()
        if not expense:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found.")

        if expense.status not in ("draft", "rejected"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot submit expense with status '{expense.status}'.",
            )

        expense.status = "submitted"
        expense.submitted_at = datetime.now(UTC)
        if payload.notes:
            expense.notes = f"{expense.notes}\n{payload.notes}" if expense.notes else payload.notes
        expense.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="expense.submit",
            entity_type="expense",
            entity_id=expense.id,
            details={"status": "submitted"},
        )
        return _build_expense_response(expense)

    @staticmethod
    async def approve_expense(
        session: AsyncSession,
        organization_id: UUID,
        expense_id: UUID,
        actor_user_id: UUID,
        actor_employee_id: UUID | None,
        payload: ExpenseReviewAction,
    ) -> ExpenseResponse:
        stmt = (
            select(Expense)
            .where(Expense.organization_id == organization_id, Expense.id == expense_id)
            .options(
                selectinload(Expense.employee),
                selectinload(Expense.category),
                selectinload(Expense.project),
                selectinload(Expense.client),
                selectinload(Expense.branch),
                selectinload(Expense.reviewer),
            )
        )
        res = await session.execute(stmt)
        expense = res.scalar_one_or_none()
        if not expense:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found.")

        if expense.status != "submitted":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot approve expense with status '{expense.status}'.",
            )

        # Self-approval check
        if actor_employee_id and expense.employee_id == actor_employee_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot approve your own expense request.",
            )

        expense.status = "approved"
        expense.approved_at = datetime.now(UTC)
        expense.reviewer_id = actor_employee_id
        if payload.comment:
            expense.reviewer_comment = payload.comment
        expense.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="expense.approve",
            entity_type="expense",
            entity_id=expense.id,
            details={"status": "approved", "reviewer_id": str(actor_employee_id)},
        )
        return _build_expense_response(expense)

    @staticmethod
    async def reject_expense(
        session: AsyncSession,
        organization_id: UUID,
        expense_id: UUID,
        actor_user_id: UUID,
        actor_employee_id: UUID | None,
        payload: ExpenseReviewAction,
    ) -> ExpenseResponse:
        stmt = (
            select(Expense)
            .where(Expense.organization_id == organization_id, Expense.id == expense_id)
            .options(
                selectinload(Expense.employee),
                selectinload(Expense.category),
                selectinload(Expense.project),
                selectinload(Expense.client),
                selectinload(Expense.branch),
                selectinload(Expense.reviewer),
            )
        )
        res = await session.execute(stmt)
        expense = res.scalar_one_or_none()
        if not expense:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found.")

        if expense.status != "submitted":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot reject expense with status '{expense.status}'.",
            )

        if not payload.comment or not payload.comment.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Rejection comment is required.",
            )

        expense.status = "rejected"
        expense.rejected_at = datetime.now(UTC)
        expense.reviewer_id = actor_employee_id
        expense.reviewer_comment = payload.comment.strip()
        expense.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="expense.reject",
            entity_type="expense",
            entity_id=expense.id,
            details={"status": "rejected", "comment": expense.reviewer_comment},
        )
        return _build_expense_response(expense)

    @staticmethod
    async def cancel_expense(
        session: AsyncSession,
        organization_id: UUID,
        expense_id: UUID,
        actor_user_id: UUID,
        payload: ExpenseAction,
    ) -> ExpenseResponse:
        stmt = (
            select(Expense)
            .where(Expense.organization_id == organization_id, Expense.id == expense_id)
            .options(
                selectinload(Expense.employee),
                selectinload(Expense.category),
                selectinload(Expense.project),
                selectinload(Expense.client),
                selectinload(Expense.branch),
                selectinload(Expense.reviewer),
            )
        )
        res = await session.execute(stmt)
        expense = res.scalar_one_or_none()
        if not expense:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found.")

        if expense.status == "paid":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot cancel an already paid expense.",
            )

        expense.status = "cancelled"
        if payload.notes:
            expense.notes = f"{expense.notes}\n{payload.notes}" if expense.notes else payload.notes
        expense.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="expense.cancel",
            entity_type="expense",
            entity_id=expense.id,
            details={"status": "cancelled"},
        )
        return _build_expense_response(expense)

    @staticmethod
    async def pay_expense(
        session: AsyncSession,
        organization_id: UUID,
        expense_id: UUID,
        actor_user_id: UUID,
        payload: ExpensePayAction,
    ) -> ExpenseResponse:
        stmt = (
            select(Expense)
            .where(Expense.organization_id == organization_id, Expense.id == expense_id)
            .options(
                selectinload(Expense.employee),
                selectinload(Expense.category),
                selectinload(Expense.project),
                selectinload(Expense.client),
                selectinload(Expense.branch),
                selectinload(Expense.reviewer),
            )
        )
        res = await session.execute(stmt)
        expense = res.scalar_one_or_none()
        if not expense:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found.")

        if expense.status != "approved":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot mark expense as paid with status '{expense.status}'. Must be approved first.",
            )

        now = datetime.now(UTC)
        expense.status = "paid"
        expense.paid_at = now
        if payload.notes:
            expense.notes = f"{expense.notes}\n{payload.notes}" if expense.notes else payload.notes
        expense.updated_at = now

        # Create posted financial transaction automatically
        tx_number = f"TX-EXP-{expense.expense_number}"
        tx = FinancialTransaction(
            id=uuid.uuid4(),
            organization_id=organization_id,
            transaction_number=tx_number,
            transaction_date=expense.expense_date,
            transaction_type="expense",
            reference_type="expense",
            reference_id=expense.id,
            description=f"Disbursement for expense {expense.expense_number}: {expense.description or ''}".strip(),
            debit=expense.total_amount,
            credit=Decimal("0.00"),
            currency=expense.currency,
            project_id=expense.project_id,
            client_id=expense.client_id,
            employee_id=expense.employee_id,
            status="posted",
            notes=f"Auto-generated on expense payment. {payload.notes or ''}".strip(),
            created_at=now,
            updated_at=now,
        )
        session.add(tx)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="expense.pay",
            entity_type="expense",
            entity_id=expense.id,
            details={"status": "paid", "transaction_number": tx_number},
        )
        return _build_expense_response(expense)

    # =========================================================================
    # Financial Transactions
    # =========================================================================

    @staticmethod
    async def create_transaction(
        session: AsyncSession,
        organization_id: UUID,
        actor_user_id: UUID,
        payload: FinancialTransactionCreate,
    ) -> FinancialTransactionResponse:
        # Check duplicate transaction_number in organization
        existing = await session.execute(
            select(FinancialTransaction).where(
                FinancialTransaction.organization_id == organization_id,
                FinancialTransaction.transaction_number == payload.transaction_number.strip(),
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Transaction number '{payload.transaction_number.strip()}' already exists.",
            )

        # Debit/credit validation
        debit = _round(payload.debit)
        credit = _round(payload.credit)
        if (debit > 0 and credit > 0) or (debit == 0 and credit == 0):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Transaction must have either positive debit or positive credit, but not both.",
            )

        # Validate linked entities
        await FinanceService._validate_linked_entities(
            session=session,
            organization_id=organization_id,
            project_id=payload.project_id,
            client_id=payload.client_id,
            vendor_id=payload.vendor_id,
            employee_id=payload.employee_id,
        )

        now = datetime.now(UTC)
        tx = FinancialTransaction(
            id=uuid.uuid4(),
            organization_id=organization_id,
            transaction_number=payload.transaction_number.strip(),
            transaction_date=payload.transaction_date,
            transaction_type=payload.transaction_type.strip(),
            reference_type=payload.reference_type,
            reference_id=payload.reference_id,
            description=payload.description.strip(),
            debit=debit,
            credit=credit,
            currency=payload.currency.strip().upper(),
            project_id=payload.project_id,
            client_id=payload.client_id,
            vendor_id=payload.vendor_id,
            employee_id=payload.employee_id,
            status="posted",
            notes=payload.notes,
            created_at=now,
            updated_at=now,
        )
        session.add(tx)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="financial_transaction.create",
            entity_type="financial_transaction",
            entity_id=tx.id,
            details={
                "transaction_number": tx.transaction_number,
                "debit": str(tx.debit),
                "credit": str(tx.credit),
            },
        )
        return _build_transaction_response(tx)

    @staticmethod
    async def list_transactions(
        session: AsyncSession,
        organization_id: UUID,
        search: str | None = None,
        transaction_type: str | None = None,
        status_filter: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> PaginatedData[FinancialTransactionResponse]:
        stmt = (
            select(FinancialTransaction)
            .where(FinancialTransaction.organization_id == organization_id)
            .options(
                selectinload(FinancialTransaction.project),
                selectinload(FinancialTransaction.client),
                selectinload(FinancialTransaction.vendor),
                selectinload(FinancialTransaction.employee),
            )
        )

        if transaction_type and transaction_type != "all":
            stmt = stmt.where(FinancialTransaction.transaction_type == transaction_type)
        if status_filter and status_filter != "all":
            stmt = stmt.where(FinancialTransaction.status == status_filter)

        if search and search.strip():
            term = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    FinancialTransaction.transaction_number.ilike(term),
                    FinancialTransaction.description.ilike(term),
                )
            )

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_res = await session.execute(count_stmt)
        total = total_res.scalar() or 0

        total_pages = ceil(total / page_size) if total > 0 else 1
        offset = (page - 1) * page_size

        stmt = stmt.order_by(FinancialTransaction.transaction_date.desc(), FinancialTransaction.created_at.desc()).offset(offset).limit(page_size)
        res = await session.execute(stmt)
        txs = _to_list(res.scalars())

        return PaginatedData(
            items=[_build_transaction_response(t) for t in txs],
            meta=PaginationMeta(
                total=total,
                page=page,
                page_size=page_size,
                total_pages=total_pages,
            ),
        )

    @staticmethod
    async def get_transaction(
        session: AsyncSession,
        organization_id: UUID,
        transaction_id: UUID,
    ) -> FinancialTransactionResponse:
        stmt = (
            select(FinancialTransaction)
            .where(
                FinancialTransaction.organization_id == organization_id,
                FinancialTransaction.id == transaction_id,
            )
            .options(
                selectinload(FinancialTransaction.project),
                selectinload(FinancialTransaction.client),
                selectinload(FinancialTransaction.vendor),
                selectinload(FinancialTransaction.employee),
            )
        )
        res = await session.execute(stmt)
        tx = res.scalar_one_or_none()
        if not tx:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Financial transaction not found.")
        return _build_transaction_response(tx)

    @staticmethod
    async def update_transaction(
        session: AsyncSession,
        organization_id: UUID,
        transaction_id: UUID,
        actor_user_id: UUID,
        payload: FinancialTransactionUpdate,
    ) -> FinancialTransactionResponse:
        stmt = (
            select(FinancialTransaction)
            .where(
                FinancialTransaction.organization_id == organization_id,
                FinancialTransaction.id == transaction_id,
            )
            .options(
                selectinload(FinancialTransaction.project),
                selectinload(FinancialTransaction.client),
                selectinload(FinancialTransaction.vendor),
                selectinload(FinancialTransaction.employee),
            )
        )
        res = await session.execute(stmt)
        tx = res.scalar_one_or_none()
        if not tx:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Financial transaction not found.")

        if payload.description is not None:
            tx.description = payload.description.strip()
        if payload.status is not None:
            tx.status = payload.status
        if payload.notes is not None:
            tx.notes = payload.notes

        tx.updated_at = datetime.now(UTC)
        await session.flush()

        await record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=actor_user_id,
            action="financial_transaction.update",
            entity_type="financial_transaction",
            entity_id=tx.id,
            details={"updated_fields": list(payload.model_dump(exclude_unset=True).keys())},
        )
        return _build_transaction_response(tx)

    @staticmethod
    async def get_overview(
        session: AsyncSession,
        organization_id: UUID,
    ) -> FinancialOverview:
        # Expenses summary
        exp_stmt = select(
            func.coalesce(func.sum(Expense.total_amount), Decimal("0.00")),
            func.count(Expense.id).filter(Expense.status == "submitted"),
            func.count(Expense.id).filter(Expense.status == "approved"),
            func.count(Expense.id).filter(Expense.status == "paid"),
        ).where(Expense.organization_id == organization_id)
        exp_res = await session.execute(exp_stmt)
        exp_row = exp_res.first()
        total_expenses = exp_row[0] if exp_row else Decimal("0.00")
        pending_count = exp_row[1] if exp_row else 0
        approved_count = exp_row[2] if exp_row else 0
        paid_count = exp_row[3] if exp_row else 0

        # Transactions summary
        tx_stmt = select(
            func.coalesce(func.sum(FinancialTransaction.debit), Decimal("0.00")),
            func.coalesce(func.sum(FinancialTransaction.credit), Decimal("0.00")),
        ).where(
            FinancialTransaction.organization_id == organization_id,
            FinancialTransaction.status == "posted",
        )
        tx_res = await session.execute(tx_stmt)
        tx_row = tx_res.first()
        total_debits = tx_row[0] if tx_row else Decimal("0.00")
        total_credits = tx_row[1] if tx_row else Decimal("0.00")

        return FinancialOverview(
            total_expenses=_round(total_expenses),
            pending_approvals_count=pending_count,
            approved_expenses_count=approved_count,
            paid_expenses_count=paid_count,
            total_debits=_round(total_debits),
            total_credits=_round(total_credits),
        )
