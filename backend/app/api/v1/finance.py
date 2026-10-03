from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session, require_permission
from app.models.employee import Employee
from app.models.identity import OrganizationMembership, Profile
from app.schemas.common import ApiSuccess, PaginatedData
from app.schemas.finance import (
    ExpenseAction,
    ExpenseCategoryCreate,
    ExpenseCategoryResponse,
    ExpenseCategoryUpdate,
    ExpenseCreate,
    ExpenseDetail,
    ExpensePayAction,
    ExpenseResponse,
    ExpenseReviewAction,
    ExpenseUpdate,
    FinancialOverview,
    FinancialTransactionCreate,
    FinancialTransactionResponse,
    FinancialTransactionUpdate,
)
from app.services.finance import FinanceService
from app.services.identity import get_user_permissions

router = APIRouter(prefix="/finance", tags=["Finance"])

FULL_FINANCE_PERMISSIONS = {"finance.manage", "finance.approve", "finance.pay"}


async def _resolve_employee(
    session: AsyncSession, organization_id: UUID, auth_user_id: UUID
) -> Employee | None:
    query = (
        select(Employee)
        .join(Profile, Profile.id == Employee.profile_id)
        .where(
            Profile.auth_user_id == auth_user_id,
            Employee.organization_id == organization_id,
        )
    )
    emp = await session.scalar(query)
    if emp is not None:
        return emp

    fallback_query = (
        select(Employee)
        .join(OrganizationMembership, OrganizationMembership.id == Employee.membership_id)
        .join(Profile, Profile.id == OrganizationMembership.profile_id)
        .where(
            Profile.auth_user_id == auth_user_id,
            OrganizationMembership.organization_id == organization_id,
        )
    )
    return await session.scalar(fallback_query)


# ---------------------------------------------------------------------------
# Financial Overview
# ---------------------------------------------------------------------------


@router.get(
    "/overview",
    response_model=ApiSuccess[FinancialOverview],
    summary="Get financial overview metrics",
)
async def get_financial_overview_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[FinancialOverview]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "finance.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing finance.view permission",
        )

    data = await FinanceService.get_overview(session, org_id)
    return ApiSuccess(data=data)


# ---------------------------------------------------------------------------
# Expense Categories
# ---------------------------------------------------------------------------


@router.get(
    "/expense-categories",
    response_model=ApiSuccess[list[ExpenseCategoryResponse]],
    summary="List expense categories",
)
async def list_expense_categories_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    include_inactive: Annotated[bool, Query(description="Include inactive categories")] = False,
) -> ApiSuccess[list[ExpenseCategoryResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "finance.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing finance.view permission",
        )

    data = await FinanceService.list_categories(session, org_id, include_inactive=include_inactive)
    return ApiSuccess(data=data)


@router.post(
    "/expense-categories",
    response_model=ApiSuccess[ExpenseCategoryResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create expense category",
    dependencies=[Depends(require_permission("finance.manage"))],
)
async def create_expense_category_endpoint(
    payload: ExpenseCategoryCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ExpenseCategoryResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await FinanceService.create_category(
        session=session,
        organization_id=org_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.get(
    "/expense-categories/{category_id}",
    response_model=ApiSuccess[ExpenseCategoryResponse],
    summary="Get expense category details",
)
async def get_expense_category_endpoint(
    category_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ExpenseCategoryResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "finance.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing finance.view permission",
        )

    data = await FinanceService.get_category(session, org_id, category_id)
    return ApiSuccess(data=data)


@router.patch(
    "/expense-categories/{category_id}",
    response_model=ApiSuccess[ExpenseCategoryResponse],
    summary="Update expense category",
    dependencies=[Depends(require_permission("finance.manage"))],
)
async def update_expense_category_endpoint(
    category_id: UUID,
    payload: ExpenseCategoryUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ExpenseCategoryResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await FinanceService.update_category(
        session=session,
        organization_id=org_id,
        category_id=category_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.delete(
    "/expense-categories/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete expense category",
    dependencies=[Depends(require_permission("finance.manage"))],
)
async def delete_expense_category_endpoint(
    category_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> None:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    await FinanceService.delete_category(
        session=session,
        organization_id=org_id,
        category_id=category_id,
        actor_user_id=user_id,
    )


# ---------------------------------------------------------------------------
# Expenses CRUD & Lifecycle
# ---------------------------------------------------------------------------


@router.get(
    "/expenses",
    response_model=ApiSuccess[PaginatedData[ExpenseResponse]],
    summary="List expenses",
)
async def list_expenses_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    search: Annotated[str | None, Query(description="Search expense number or description")] = None,
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by status")] = None,
    category_id: Annotated[UUID | None, Query(description="Filter by category")] = None,
    employee_id: Annotated[UUID | None, Query(description="Filter by employee")] = None,
    project_id: Annotated[UUID | None, Query(description="Filter by project")] = None,
    client_id: Annotated[UUID | None, Query(description="Filter by client")] = None,
    start_date: Annotated[date | None, Query(description="Filter by start date")] = None,
    end_date: Annotated[date | None, Query(description="Filter by end date")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Page size")] = 20,
) -> ApiSuccess[PaginatedData[ExpenseResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "finance.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing finance.view permission",
        )

    # Scoping check
    is_employee_restricted = not bool(FULL_FINANCE_PERMISSIONS.intersection(perms))
    actor_employee = None
    if is_employee_restricted:
        actor_employee = await _resolve_employee(session, org_id, user_id)

    data = await FinanceService.list_expenses(
        session=session,
        organization_id=org_id,
        search=search,
        status_filter=status_filter,
        category_id=category_id,
        employee_id=employee_id,
        project_id=project_id,
        client_id=client_id,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
        actor_employee_id=actor_employee.id if actor_employee else None,
        is_employee_restricted=is_employee_restricted,
    )
    return ApiSuccess(data=data)


@router.post(
    "/expenses",
    response_model=ApiSuccess[ExpenseResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create expense record",
    dependencies=[Depends(require_permission("finance.create"))],
)
async def create_expense_endpoint(
    payload: ExpenseCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ExpenseResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await FinanceService.create_expense(
        session=session,
        organization_id=org_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.get(
    "/expenses/{expense_id}",
    response_model=ApiSuccess[ExpenseDetail],
    summary="Get expense details",
)
async def get_expense_endpoint(
    expense_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ExpenseDetail]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "finance.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing finance.view permission",
        )

    data = await FinanceService.get_expense(session, org_id, expense_id)
    return ApiSuccess(data=data)


@router.patch(
    "/expenses/{expense_id}",
    response_model=ApiSuccess[ExpenseResponse],
    summary="Update expense",
    dependencies=[Depends(require_permission("finance.update"))],
)
async def update_expense_endpoint(
    expense_id: UUID,
    payload: ExpenseUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ExpenseResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await FinanceService.update_expense(
        session=session,
        organization_id=org_id,
        expense_id=expense_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/expenses/{expense_id}/submit",
    response_model=ApiSuccess[ExpenseResponse],
    summary="Submit expense for approval",
    dependencies=[Depends(require_permission("finance.create"))],
)
async def submit_expense_endpoint(
    expense_id: UUID,
    payload: ExpenseAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ExpenseResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await FinanceService.submit_expense(
        session=session,
        organization_id=org_id,
        expense_id=expense_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/expenses/{expense_id}/approve",
    response_model=ApiSuccess[ExpenseResponse],
    summary="Approve submitted expense",
    dependencies=[Depends(require_permission("finance.approve"))],
)
async def approve_expense_endpoint(
    expense_id: UUID,
    payload: ExpenseReviewAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ExpenseResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    actor_employee = await _resolve_employee(session, org_id, user_id)

    data = await FinanceService.approve_expense(
        session=session,
        organization_id=org_id,
        expense_id=expense_id,
        actor_user_id=user_id,
        actor_employee_id=actor_employee.id if actor_employee else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/expenses/{expense_id}/reject",
    response_model=ApiSuccess[ExpenseResponse],
    summary="Reject submitted expense",
    dependencies=[Depends(require_permission("finance.approve"))],
)
async def reject_expense_endpoint(
    expense_id: UUID,
    payload: ExpenseReviewAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ExpenseResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    actor_employee = await _resolve_employee(session, org_id, user_id)

    data = await FinanceService.reject_expense(
        session=session,
        organization_id=org_id,
        expense_id=expense_id,
        actor_user_id=user_id,
        actor_employee_id=actor_employee.id if actor_employee else None,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/expenses/{expense_id}/cancel",
    response_model=ApiSuccess[ExpenseResponse],
    summary="Cancel expense",
    dependencies=[Depends(require_permission("finance.update"))],
)
async def cancel_expense_endpoint(
    expense_id: UUID,
    payload: ExpenseAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ExpenseResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await FinanceService.cancel_expense(
        session=session,
        organization_id=org_id,
        expense_id=expense_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.post(
    "/expenses/{expense_id}/pay",
    response_model=ApiSuccess[ExpenseResponse],
    summary="Mark approved expense as paid and record financial transaction",
    dependencies=[Depends(require_permission("finance.pay"))],
)
async def pay_expense_endpoint(
    expense_id: UUID,
    payload: ExpensePayAction,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[ExpenseResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await FinanceService.pay_expense(
        session=session,
        organization_id=org_id,
        expense_id=expense_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


# ---------------------------------------------------------------------------
# Financial Transactions
# ---------------------------------------------------------------------------


@router.get(
    "/transactions",
    response_model=ApiSuccess[PaginatedData[FinancialTransactionResponse]],
    summary="List financial transactions",
)
async def list_transactions_endpoint(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    search: Annotated[str | None, Query(description="Search transaction number or description")] = None,
    transaction_type: Annotated[str | None, Query(description="Filter by transaction type")] = None,
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by status")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Page size")] = 20,
) -> ApiSuccess[PaginatedData[FinancialTransactionResponse]]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "finance.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing finance.view permission",
        )

    data = await FinanceService.list_transactions(
        session=session,
        organization_id=org_id,
        search=search,
        transaction_type=transaction_type,
        status_filter=status_filter,
        page=page,
        page_size=page_size,
    )
    return ApiSuccess(data=data)


@router.post(
    "/transactions",
    response_model=ApiSuccess[FinancialTransactionResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create financial transaction",
    dependencies=[Depends(require_permission("finance.create"))],
)
async def create_transaction_endpoint(
    payload: FinancialTransactionCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[FinancialTransactionResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await FinanceService.create_transaction(
        session=session,
        organization_id=org_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)


@router.get(
    "/transactions/{transaction_id}",
    response_model=ApiSuccess[FinancialTransactionResponse],
    summary="Get financial transaction details",
)
async def get_transaction_endpoint(
    transaction_id: UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[FinancialTransactionResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    perms = await get_user_permissions(session, user_id, org_id)
    if "finance.view" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: missing finance.view permission",
        )

    data = await FinanceService.get_transaction(session, org_id, transaction_id)
    return ApiSuccess(data=data)


@router.patch(
    "/transactions/{transaction_id}",
    response_model=ApiSuccess[FinancialTransactionResponse],
    summary="Update financial transaction notes or status",
    dependencies=[Depends(require_permission("finance.update"))],
)
async def update_transaction_endpoint(
    transaction_id: UUID,
    payload: FinancialTransactionUpdate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_tenant_session)],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ApiSuccess[FinancialTransactionResponse]:
    org_id = UUID(organization_header)
    user_id = UUID(current_user.id)

    data = await FinanceService.update_transaction(
        session=session,
        organization_id=org_id,
        transaction_id=transaction_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiSuccess(data=data)
