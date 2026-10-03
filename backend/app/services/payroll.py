import uuid
from calendar import monthrange
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.employee import Employee
from app.models.payroll import Payroll, Payslip, SalaryStructure
from app.schemas.payroll import (
    PayrollResponse,
    PayrollRunCreate,
    PayrollSummaryKPI,
    PayslipDisburseRequest,
    PayslipResponse,
    SalaryStructureCreate,
    SalaryStructureResponse,
)


class PayrollService:
    @staticmethod
    async def list_salary_structures(
        session: AsyncSession,
        organization_id: uuid.UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> list[SalaryStructureResponse]:
        query = (
            select(SalaryStructure)
            .where(SalaryStructure.organization_id == organization_id)
            .options(selectinload(SalaryStructure.employee))
            .order_by(SalaryStructure.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await session.execute(query)
        structures = result.scalars().all()

        responses = []
        for s in structures:
            emp = s.employee
            emp_name = f"{emp.first_name} {emp.last_name}" if emp else None
            emp_code = emp.employee_code if emp else None
            responses.append(
                SalaryStructureResponse(
                    id=s.id,
                    organization_id=s.organization_id,
                    employee_id=s.employee_id,
                    employee_name=emp_name,
                    employee_code=emp_code,
                    currency=s.currency,
                    base_salary=s.base_salary,
                    hra=s.hra,
                    allowances=s.allowances,
                    deductions=s.deductions,
                    payment_frequency=s.payment_frequency,
                    effective_from=s.effective_from,
                    is_active=s.is_active,
                    created_at=s.created_at,
                    updated_at=s.updated_at,
                )
            )
        return responses

    @staticmethod
    async def get_salary_structure_by_employee(
        session: AsyncSession,
        organization_id: uuid.UUID,
        employee_id: uuid.UUID,
    ) -> SalaryStructureResponse | None:
        query = (
            select(SalaryStructure)
            .where(
                SalaryStructure.organization_id == organization_id,
                SalaryStructure.employee_id == employee_id,
            )
            .options(selectinload(SalaryStructure.employee))
        )
        result = await session.execute(query)
        s = result.scalar_one_or_none()
        if not s:
            return None

        emp = s.employee
        return SalaryStructureResponse(
            id=s.id,
            organization_id=s.organization_id,
            employee_id=s.employee_id,
            employee_name=f"{emp.first_name} {emp.last_name}" if emp else None,
            employee_code=emp.employee_code if emp else None,
            currency=s.currency,
            base_salary=s.base_salary,
            hra=s.hra,
            allowances=s.allowances,
            deductions=s.deductions,
            payment_frequency=s.payment_frequency,
            effective_from=s.effective_from,
            is_active=s.is_active,
            created_at=s.created_at,
            updated_at=s.updated_at,
        )

    @staticmethod
    async def upsert_salary_structure(
        session: AsyncSession,
        organization_id: uuid.UUID,
        data: SalaryStructureCreate,
    ) -> SalaryStructureResponse:
        # Verify employee belongs to organization
        emp_query = select(Employee).where(
            Employee.id == data.employee_id,
            Employee.organization_id == organization_id,
        )
        emp_res = await session.execute(emp_query)
        emp = emp_res.scalar_one_or_none()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found in organization")

        # Check existing
        existing_query = select(SalaryStructure).where(
            SalaryStructure.organization_id == organization_id,
            SalaryStructure.employee_id == data.employee_id,
        )
        existing_res = await session.execute(existing_query)
        structure = existing_res.scalar_one_or_none()

        if structure:
            structure.currency = data.currency
            structure.base_salary = data.base_salary
            structure.hra = data.hra
            structure.allowances = data.allowances
            structure.deductions = data.deductions
            structure.payment_frequency = data.payment_frequency
            structure.effective_from = data.effective_from
            structure.is_active = data.is_active
        else:
            structure = SalaryStructure(
                id=uuid.uuid4(),
                organization_id=organization_id,
                employee_id=data.employee_id,
                currency=data.currency,
                base_salary=data.base_salary,
                hra=data.hra,
                allowances=data.allowances,
                deductions=data.deductions,
                payment_frequency=data.payment_frequency,
                effective_from=data.effective_from,
                is_active=data.is_active,
            )
            session.add(structure)

        await session.flush()
        await session.refresh(structure)

        return SalaryStructureResponse(
            id=structure.id,
            organization_id=structure.organization_id,
            employee_id=structure.employee_id,
            employee_name=f"{emp.first_name} {emp.last_name}",
            employee_code=emp.employee_code,
            currency=structure.currency,
            base_salary=structure.base_salary,
            hra=structure.hra,
            allowances=structure.allowances,
            deductions=structure.deductions,
            payment_frequency=structure.payment_frequency,
            effective_from=structure.effective_from,
            is_active=structure.is_active,
            created_at=structure.created_at,
            updated_at=structure.updated_at,
        )

    @staticmethod
    async def list_payroll_runs(
        session: AsyncSession,
        organization_id: uuid.UUID,
        skip: int = 0,
        limit: int = 50,
    ) -> list[PayrollResponse]:
        query = (
            select(Payroll)
            .where(Payroll.organization_id == organization_id)
            .order_by(Payroll.period_year.desc(), Payroll.period_month.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await session.execute(query)
        return [PayrollResponse.model_validate(p) for p in result.scalars().all()]

    @staticmethod
    async def get_payroll_run(
        session: AsyncSession,
        organization_id: uuid.UUID,
        payroll_id: uuid.UUID,
    ) -> PayrollResponse:
        query = select(Payroll).where(
            Payroll.id == payroll_id,
            Payroll.organization_id == organization_id,
        )
        result = await session.execute(query)
        payroll = result.scalar_one_or_none()
        if not payroll:
            raise HTTPException(status_code=404, detail="Payroll run not found")
        return PayrollResponse.model_validate(payroll)

    @staticmethod
    async def generate_payroll_run(
        session: AsyncSession,
        organization_id: uuid.UUID,
        user_id: uuid.UUID,
        data: PayrollRunCreate,
    ) -> PayrollResponse:
        # Check duplicate
        dup_query = select(Payroll).where(
            Payroll.organization_id == organization_id,
            Payroll.period_year == data.period_year,
            Payroll.period_month == data.period_month,
            Payroll.status != "cancelled",
        )
        dup_res = await session.execute(dup_query)
        if dup_res.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail=f"Payroll for {data.period_month}/{data.period_year} already exists",
            )

        # Fetch active employees
        emp_query = (
            select(Employee)
            .where(
                Employee.organization_id == organization_id,
                Employee.is_active.is_(True),
            )
            .options(selectinload(Employee.department))
        )
        emp_res = await session.execute(emp_query)
        employees = emp_res.scalars().all()

        if not employees:
            raise HTTPException(
                status_code=400, detail="No active employees found to process payroll"
            )

        # Fetch salary structures
        struct_query = select(SalaryStructure).where(
            SalaryStructure.organization_id == organization_id,
            SalaryStructure.is_active.is_(True),
        )
        struct_res = await session.execute(struct_query)
        structures = {s.employee_id: s for s in struct_res.scalars().all()}

        _, total_days_in_month = monthrange(data.period_year, data.period_month)
        payroll_id = uuid.uuid4()
        month_name = date(data.period_year, data.period_month, 1).strftime("%B")
        payroll_title = data.title or f"{month_name} {data.period_year} Payroll"

        payroll = Payroll(
            id=payroll_id,
            organization_id=organization_id,
            title=payroll_title,
            period_month=data.period_month,
            period_year=data.period_year,
            status="draft",
            total_gross_pay=Decimal("0.00"),
            total_deductions=Decimal("0.00"),
            total_net_pay=Decimal("0.00"),
            employee_count=0,
            processed_by=user_id,
            notes=data.notes,
        )
        session.add(payroll)

        total_gross = Decimal("0.00")
        total_deduct = Decimal("0.00")
        total_net = Decimal("0.00")
        slip_index = 1

        for emp in employees:
            struct = structures.get(emp.id)
            base_sal = struct.base_salary if struct else Decimal("5000.00")
            hra_val = struct.hra if struct else Decimal("1000.00")

            # Parse custom allowances
            custom_allowances: dict[str, Any] = (
                struct.allowances if struct else {"Special Allowance": 500}
            )
            allowances_sum = sum(Decimal(str(v)) for v in custom_allowances.values() if v)

            # Check unpaid leaves
            unpaid_days = 0
            leave_deduction = Decimal("0.00")
            if total_days_in_month > 0:
                per_day_rate = (base_sal / Decimal(str(total_days_in_month))).quantize(
                    Decimal("0.01")
                )
                leave_deduction = (per_day_rate * Decimal(str(unpaid_days))).quantize(
                    Decimal("0.01")
                )

            gross = base_sal + hra_val + allowances_sum

            # Parse custom deductions
            custom_deductions: dict[str, Any] = (
                struct.deductions
                if struct
                else {
                    "Provident Fund": float((base_sal * Decimal("0.05")).quantize(Decimal("0.01"))),
                    "Tax (TDS)": float((gross * Decimal("0.10")).quantize(Decimal("0.01"))),
                }
            )
            if unpaid_days > 0:
                custom_deductions["Unpaid Leave Deduction"] = float(leave_deduction)

            deductions_sum = sum(Decimal(str(v)) for v in custom_deductions.values() if v)
            net = max(Decimal("0.00"), gross - deductions_sum)

            earnings_breakdown = {
                "Base Salary": float(base_sal),
                "House Rent Allowance (HRA)": float(hra_val),
                **{k: float(v) for k, v in custom_allowances.items()},
            }
            deductions_breakdown = {k: float(v) for k, v in custom_deductions.items()}

            payslip_number = f"PS-{data.period_year}{data.period_month:02d}-{slip_index:04d}"
            slip = Payslip(
                id=uuid.uuid4(),
                organization_id=organization_id,
                payroll_id=payroll_id,
                employee_id=emp.id,
                payslip_number=payslip_number,
                base_salary=base_sal,
                gross_pay=gross,
                total_deductions=deductions_sum,
                net_pay=net,
                paid_days=total_days_in_month - unpaid_days,
                unpaid_days=unpaid_days,
                earnings_breakdown=earnings_breakdown,
                deductions_breakdown=deductions_breakdown,
                status="draft",
                payment_method="bank_transfer",
            )
            session.add(slip)

            total_gross += gross
            total_deduct += deductions_sum
            total_net += net
            slip_index += 1

        payroll.total_gross_pay = total_gross
        payroll.total_deductions = total_deduct
        payroll.total_net_pay = total_net
        payroll.employee_count = len(employees)

        await session.flush()
        await session.refresh(payroll)
        return PayrollResponse.model_validate(payroll)

    @staticmethod
    async def approve_payroll_run(
        session: AsyncSession,
        organization_id: uuid.UUID,
        payroll_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> PayrollResponse:
        query = select(Payroll).where(
            Payroll.id == payroll_id,
            Payroll.organization_id == organization_id,
        )
        res = await session.execute(query)
        payroll = res.scalar_one_or_none()
        if not payroll:
            raise HTTPException(status_code=404, detail="Payroll run not found")
        if payroll.status not in ("draft", "processing"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot approve payroll in '{payroll.status}' state",
            )

        payroll.status = "approved"
        payroll.approved_by = user_id

        # Update payslips
        slips_query = select(Payslip).where(
            Payslip.payroll_id == payroll_id,
            Payslip.organization_id == organization_id,
        )
        slips_res = await session.execute(slips_query)
        for slip in slips_res.scalars().all():
            slip.status = "pending"

        await session.flush()
        await session.refresh(payroll)
        return PayrollResponse.model_validate(payroll)

    @staticmethod
    async def disburse_payroll_run(
        session: AsyncSession,
        organization_id: uuid.UUID,
        payroll_id: uuid.UUID,
        data: PayslipDisburseRequest,
    ) -> PayrollResponse:
        query = select(Payroll).where(
            Payroll.id == payroll_id,
            Payroll.organization_id == organization_id,
        )
        res = await session.execute(query)
        payroll = res.scalar_one_or_none()
        if not payroll:
            raise HTTPException(status_code=404, detail="Payroll run not found")
        if payroll.status != "approved":
            raise HTTPException(
                status_code=400,
                detail="Payroll run must be approved before disbursement",
            )

        now = data.disbursement_date or datetime.now(UTC)
        payroll.status = "paid"
        payroll.payment_date = now.date() if isinstance(now, datetime) else now

        # Update payslips
        slips_query = select(Payslip).where(
            Payslip.payroll_id == payroll_id,
            Payslip.organization_id == organization_id,
        )
        slips_res = await session.execute(slips_query)
        for slip in slips_res.scalars().all():
            slip.status = "paid"
            slip.payment_method = data.payment_method
            slip.payment_reference = data.payment_reference or f"DISB-{slip.payslip_number}"
            slip.disbursement_date = now

        await session.flush()
        await session.refresh(payroll)
        return PayrollResponse.model_validate(payroll)

    @staticmethod
    async def list_payslips(
        session: AsyncSession,
        organization_id: uuid.UUID,
        payroll_id: uuid.UUID | None = None,
        employee_id: uuid.UUID | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> list[PayslipResponse]:
        query = (
            select(Payslip)
            .where(Payslip.organization_id == organization_id)
            .options(
                selectinload(Payslip.employee).selectinload(Employee.department),
            )
        )
        if payroll_id:
            query = query.where(Payslip.payroll_id == payroll_id)
        if employee_id:
            query = query.where(Payslip.employee_id == employee_id)

        query = query.order_by(Payslip.created_at.desc()).offset(skip).limit(limit)
        res = await session.execute(query)
        slips = res.scalars().all()

        responses = []
        for slip in slips:
            emp = slip.employee
            emp_name = f"{emp.first_name} {emp.last_name}" if emp else None
            emp_code = emp.employee_code if emp else None
            dept_name = emp.department.name if emp and emp.department else None
            responses.append(
                PayslipResponse(
                    id=slip.id,
                    organization_id=slip.organization_id,
                    payroll_id=slip.payroll_id,
                    employee_id=slip.employee_id,
                    employee_name=emp_name,
                    employee_code=emp_code,
                    department_name=dept_name,
                    payslip_number=slip.payslip_number,
                    base_salary=slip.base_salary,
                    gross_pay=slip.gross_pay,
                    total_deductions=slip.total_deductions,
                    net_pay=slip.net_pay,
                    paid_days=slip.paid_days,
                    unpaid_days=slip.unpaid_days,
                    earnings_breakdown=slip.earnings_breakdown,
                    deductions_breakdown=slip.deductions_breakdown,
                    status=slip.status,
                    payment_method=slip.payment_method,
                    payment_reference=slip.payment_reference,
                    disbursement_date=slip.disbursement_date,
                    created_at=slip.created_at,
                    updated_at=slip.updated_at,
                )
            )
        return responses

    @staticmethod
    async def get_payslip(
        session: AsyncSession,
        organization_id: uuid.UUID,
        payslip_id: uuid.UUID,
    ) -> PayslipResponse:
        query = (
            select(Payslip)
            .where(
                Payslip.id == payslip_id,
                Payslip.organization_id == organization_id,
            )
            .options(
                selectinload(Payslip.employee).selectinload(Employee.department),
            )
        )
        res = await session.execute(query)
        slip = res.scalar_one_or_none()
        if not slip:
            raise HTTPException(status_code=404, detail="Payslip not found")

        emp = slip.employee
        return PayslipResponse(
            id=slip.id,
            organization_id=slip.organization_id,
            payroll_id=slip.payroll_id,
            employee_id=slip.employee_id,
            employee_name=f"{emp.first_name} {emp.last_name}" if emp else None,
            employee_code=emp.employee_code if emp else None,
            department_name=emp.department.name if emp and emp.department else None,
            payslip_number=slip.payslip_number,
            base_salary=slip.base_salary,
            gross_pay=slip.gross_pay,
            total_deductions=slip.total_deductions,
            net_pay=slip.net_pay,
            paid_days=slip.paid_days,
            unpaid_days=slip.unpaid_days,
            earnings_breakdown=slip.earnings_breakdown,
            deductions_breakdown=slip.deductions_breakdown,
            status=slip.status,
            payment_method=slip.payment_method,
            payment_reference=slip.payment_reference,
            disbursement_date=slip.disbursement_date,
            created_at=slip.created_at,
            updated_at=slip.updated_at,
        )

    @staticmethod
    async def get_summary_kpi(
        session: AsyncSession,
        organization_id: uuid.UUID,
    ) -> PayrollSummaryKPI:
        # Latest payroll total
        latest_q = (
            select(Payroll.total_net_pay)
            .where(
                Payroll.organization_id == organization_id,
                Payroll.status != "cancelled",
            )
            .order_by(Payroll.period_year.desc(), Payroll.period_month.desc())
            .limit(1)
        )
        latest_res = await session.execute(latest_q)
        monthly_total = latest_res.scalar_one_or_none() or Decimal("0.00")

        # Pending approvals
        pending_q = select(func.count(Payroll.id)).where(
            Payroll.organization_id == organization_id,
            Payroll.status.in_(["draft", "processing"]),
        )
        pending_res = await session.execute(pending_q)
        pending_count = pending_res.scalar_one() or 0

        # YTD disbursed
        current_year = datetime.now(UTC).year
        ytd_q = select(func.sum(Payroll.total_net_pay)).where(
            Payroll.organization_id == organization_id,
            Payroll.period_year == current_year,
            Payroll.status == "paid",
        )
        ytd_res = await session.execute(ytd_q)
        ytd_total = ytd_res.scalar_one() or Decimal("0.00")

        # Active employees
        emp_q = select(func.count(Employee.id)).where(
            Employee.organization_id == organization_id,
            Employee.is_active.is_(True),
        )
        emp_res = await session.execute(emp_q)
        emp_count = emp_res.scalar_one() or 0

        return PayrollSummaryKPI(
            monthly_payroll_total=monthly_total,
            pending_approvals_count=pending_count,
            total_disbursed_ytd=ytd_total,
            active_employees_count=emp_count,
            currency="USD",
        )
