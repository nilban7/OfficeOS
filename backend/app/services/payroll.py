import logging
import uuid
from calendar import monthrange
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.attendance import AttendanceRecord
from app.models.employee import Employee
from app.models.leave import LeaveRequest, LeaveType
from app.models.payroll import Bonus, BonusAllocation, Payroll, Payslip, SalaryStructure
from app.models.project import ProjectMember
from app.schemas.payroll import (
    BonusAllocationResponse,
    BonusAllocationUpdate,
    BonusCreate,
    BonusPreviewItem,
    BonusPreviewRequest,
    BonusPreviewResponse,
    BonusRejectRequest,
    BonusResponse,
    PayrollResponse,
    PayrollRunCreate,
    PayrollSummaryKPI,
    PayslipDisburseRequest,
    PayslipResponse,
    SalaryStructureCreate,
    SalaryStructureResponse,
)

logger = logging.getLogger(__name__)


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

        # Dynamically sync any unpaid payroll runs so salary changes reflect immediately
        unpaid_runs_q = select(Payroll.id).where(
            Payroll.organization_id == organization_id,
            Payroll.status != "paid",
        )
        unpaid_runs_res = await session.execute(unpaid_runs_q)
        for unpaid_p_id in unpaid_runs_res.scalars().all():
            await PayrollService.sync_payroll_run(session, organization_id, unpaid_p_id)

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
    async def sync_payroll_run(
        session: AsyncSession,
        organization_id: uuid.UUID,
        payroll_id: uuid.UUID,
    ) -> PayrollResponse:
        query = (
            select(Payroll)
            .where(
                Payroll.id == payroll_id,
                Payroll.organization_id == organization_id,
            )
            .options(selectinload(Payroll.payslips))
        )
        res = await session.execute(query)
        payroll = res.scalar_one_or_none()
        if not payroll:
            raise HTTPException(status_code=404, detail="Payroll run not found")

        # Once payment is done, no changes can be made
        if payroll.status == "paid":
            resp = PayrollResponse.model_validate(payroll)
            b_sum = Decimal("0.00")
            if hasattr(payroll, "payslips") and payroll.payslips:
                for slip in payroll.payslips:
                    for k, v in (slip.earnings_breakdown or {}).items():
                        if k.lower().startswith("bonus"):
                            b_sum += Decimal(str(v))
            resp.total_bonus_pay = b_sum
            return resp

        # 1. Unlink any currently attached bonus allocations from this payroll
        current_alloc_query = select(BonusAllocation).where(
            BonusAllocation.payroll_id == payroll_id,
            BonusAllocation.organization_id == organization_id,
        )
        current_alloc_res = await session.execute(current_alloc_query)
        for alloc in current_alloc_res.scalars().all():
            alloc.payroll_id = None
            alloc.payslip_id = None
            if alloc.status == "included_in_payroll":
                alloc.status = "approved"

        # 2. Fetch active eligible employees
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

        struct_query = select(SalaryStructure).where(
            SalaryStructure.organization_id == organization_id,
            SalaryStructure.is_active.is_(True),
        )
        struct_res = await session.execute(struct_query)
        structures = {s.employee_id: s for s in struct_res.scalars().all()}
        eligible_employees = [e for e in employees if e.id in structures]

        _, total_days_in_month = monthrange(payroll.period_year, payroll.period_month)
        start_of_month = date(payroll.period_year, payroll.period_month, 1)
        end_of_month = date(payroll.period_year, payroll.period_month, total_days_in_month)

        emp_unpaid_days: dict[uuid.UUID, int] = {}
        try:
            leave_query = (
                select(LeaveRequest)
                .join(LeaveType, LeaveType.id == LeaveRequest.leave_type_id)
                .where(
                    LeaveRequest.organization_id == organization_id,
                    LeaveRequest.status == "approved",
                    LeaveType.is_paid.is_(False),
                    LeaveRequest.start_date <= end_of_month,
                    LeaveRequest.end_date >= start_of_month,
                )
            )
            leave_res = await session.execute(leave_query)
            for lr in leave_res.scalars().all():
                overlap_start = max(lr.start_date, start_of_month)
                overlap_end = min(lr.end_date, end_of_month)
                if overlap_end >= overlap_start:
                    days = (overlap_end - overlap_start).days + 1
                    emp_unpaid_days[lr.employee_id] = (
                        emp_unpaid_days.get(lr.employee_id, 0) + days
                    )
        except SQLAlchemyError as exc:
            logger.warning("Failed to query unpaid leave days for sync: %s", exc)

        # 3. Fetch all currently approved bonus allocations for this period
        emp_bonuses: dict[uuid.UUID, list[BonusAllocation]] = {}
        try:
            bonus_query = (
                select(BonusAllocation)
                .join(Bonus, Bonus.id == BonusAllocation.bonus_id)
                .where(
                    BonusAllocation.organization_id == organization_id,
                    BonusAllocation.period_year == payroll.period_year,
                    BonusAllocation.period_month == payroll.period_month,
                    BonusAllocation.payroll_id.is_(None),
                    or_(
                        BonusAllocation.status == "approved",
                        Bonus.status == "approved",
                    ),
                    BonusAllocation.status != "rejected",
                    BonusAllocation.status != "cancelled",
                    Bonus.status != "rejected",
                    Bonus.status != "cancelled",
                )
                .options(selectinload(BonusAllocation.bonus))
            )
            bonus_res = await session.execute(bonus_query)
            for b_alloc in bonus_res.scalars().all():
                emp_bonuses.setdefault(b_alloc.employee_id, []).append(b_alloc)
        except SQLAlchemyError as exc:
            logger.warning("Failed to query bonus allocations for sync: %s", exc)

        existing_slips_res = await session.execute(
            select(Payslip).where(Payslip.payroll_id == payroll_id)
        )
        existing_slips = {slip.employee_id: slip for slip in existing_slips_res.scalars().all()}

        total_gross = Decimal("0.00")
        total_deduct = Decimal("0.00")
        total_net = Decimal("0.00")
        slip_index = len(existing_slips) + 1

        all_matched_bonus_allocations: list[BonusAllocation] = []
        emp_slip_ids: dict[uuid.UUID, uuid.UUID] = {}
        emp_matched_bonuses: dict[uuid.UUID, list[BonusAllocation]] = {}

        for emp in eligible_employees:
            struct = structures[emp.id]
            base_sal = struct.base_salary
            hra_val = struct.hra or Decimal("0.00")
            custom_allowances: dict[str, Any] = struct.allowances or {}
            allowances_sum = sum(Decimal(str(v)) for v in custom_allowances.values() if v)

            unpaid_days = min(total_days_in_month, emp_unpaid_days.get(emp.id, 0))
            leave_deduction = Decimal("0.00")
            if total_days_in_month > 0 and unpaid_days > 0:
                per_day_rate = (base_sal / Decimal(str(total_days_in_month))).quantize(
                    Decimal("0.01")
                )
                leave_deduction = (per_day_rate * Decimal(str(unpaid_days))).quantize(
                    Decimal("0.01")
                )

            matched_bonuses: list[BonusAllocation] = []
            bonus_total = Decimal("0.00")
            if emp.id in emp_bonuses:
                for b_alloc in emp_bonuses[emp.id]:
                    if (b_alloc.currency or "").strip().upper() == (struct.currency or "").strip().upper():
                        matched_bonuses.append(b_alloc)
                        bonus_total += b_alloc.amount
                        all_matched_bonus_allocations.append(b_alloc)

            gross = base_sal + hra_val + allowances_sum + bonus_total

            custom_deductions: dict[str, Any] = dict(struct.deductions or {})
            if unpaid_days > 0:
                custom_deductions["Unpaid Leave / Absence Deduction"] = float(leave_deduction)

            deductions_sum = sum(Decimal(str(v)) for v in custom_deductions.values() if v)
            net = max(Decimal("0.00"), gross - deductions_sum)

            earnings_breakdown = {
                "Base Salary": float(base_sal),
                **({"House Rent Allowance (HRA)": float(hra_val)} if hra_val > 0 else {}),
                **{k: float(v) for k, v in custom_allowances.items()},
            }
            for b_alloc in matched_bonuses:
                b_name = b_alloc.bonus.name if b_alloc.bonus else "Performance Bonus"
                item_title = f"Bonus: {b_name}"
                if item_title in earnings_breakdown:
                    item_title = f"{item_title} ({str(b_alloc.id)[:6]})"
                earnings_breakdown[item_title] = float(b_alloc.amount)

            deductions_breakdown = {k: float(v) for k, v in custom_deductions.items()}

            if emp.id in existing_slips:
                slip = existing_slips[emp.id]
                slip.base_salary = base_sal
                slip.gross_pay = gross
                slip.total_deductions = deductions_sum
                slip.net_pay = net
                slip.paid_days = total_days_in_month - unpaid_days
                slip.unpaid_days = unpaid_days
                slip.earnings_breakdown = earnings_breakdown
                slip.deductions_breakdown = deductions_breakdown
            else:
                payslip_number = f"PS-{payroll.period_year}{payroll.period_month:02d}-{slip_index:04d}"
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
                slip_index += 1

            emp_slip_ids[emp.id] = slip.id
            emp_matched_bonuses[emp.id] = matched_bonuses

            total_gross += gross
            total_deduct += deductions_sum
            total_net += net

        payroll.total_gross_pay = total_gross
        payroll.total_deductions = total_deduct
        payroll.total_net_pay = total_net
        payroll.employee_count = len(eligible_employees)

        # Flush payslips first so they exist in DB before linking bonus allocations
        await session.flush()

        for emp_id, matched_list in emp_matched_bonuses.items():
            s_id = emp_slip_ids.get(emp_id)
            for b_alloc in matched_list:
                b_alloc.payroll_id = payroll_id
                b_alloc.payslip_id = s_id
                b_alloc.status = "included_in_payroll"

        # Update parent bonus status if all allocations are included
        touched_bonuses = {b_alloc.bonus_id for b_alloc in all_matched_bonus_allocations}
        for b_id in touched_bonuses:
            uninc_query = select(BonusAllocation).where(
                BonusAllocation.bonus_id == b_id,
                BonusAllocation.status != "included_in_payroll",
            )
            uninc_res = await session.execute(uninc_query)
            if not uninc_res.scalars().first():
                b_q = select(Bonus).where(Bonus.id == b_id)
                b_obj = (await session.execute(b_q)).scalar_one_or_none()
                if b_obj and b_obj.status == "approved":
                    b_obj.status = "included_in_payroll"

        await session.flush()
        await session.refresh(payroll)
        resp = PayrollResponse.model_validate(payroll)
        resp.total_bonus_pay = sum(b.amount for b in all_matched_bonus_allocations)
        return resp

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
            .options(selectinload(Payroll.payslips))
            .order_by(Payroll.period_year.desc(), Payroll.period_month.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await session.execute(query)
        runs = result.scalars().all()
        responses = []
        for p in runs:
            if p.status != "paid":
                resp = await PayrollService.sync_payroll_run(session, organization_id, p.id)
                responses.append(resp)
            else:
                resp = PayrollResponse.model_validate(p)
                b_sum = Decimal("0.00")
                if hasattr(p, "payslips") and p.payslips:
                    for slip in p.payslips:
                        for k, v in (slip.earnings_breakdown or {}).items():
                            if k.lower().startswith("bonus"):
                                b_sum += Decimal(str(v))
                resp.total_bonus_pay = b_sum
                responses.append(resp)
        return responses

    @staticmethod
    async def get_payroll_run(
        session: AsyncSession,
        organization_id: uuid.UUID,
        payroll_id: uuid.UUID,
    ) -> PayrollResponse:
        query = (
            select(Payroll)
            .where(
                Payroll.id == payroll_id,
                Payroll.organization_id == organization_id,
            )
            .options(selectinload(Payroll.payslips))
        )
        result = await session.execute(query)
        payroll = result.scalar_one_or_none()
        if not payroll:
            raise HTTPException(status_code=404, detail="Payroll run not found")

        # Dynamically sync before returning if payroll has not been paid
        if payroll.status != "paid":
            return await PayrollService.sync_payroll_run(session, organization_id, payroll_id)

        resp = PayrollResponse.model_validate(payroll)
        b_sum = Decimal("0.00")
        if hasattr(payroll, "payslips") and payroll.payslips:
            for slip in payroll.payslips:
                for k, v in (slip.earnings_breakdown or {}).items():
                    if k.lower().startswith("bonus"):
                        b_sum += Decimal(str(v))
        resp.total_bonus_pay = b_sum
        return resp

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

        # Only active employees with a declared active salary structure are eligible for payroll
        eligible_employees = [emp for emp in employees if emp.id in structures]
        if not eligible_employees:
            raise HTTPException(
                status_code=400,
                detail="No active employees with declared salary structures found. Please configure employee salary structures before processing payroll.",
            )

        _, total_days_in_month = monthrange(data.period_year, data.period_month)
        start_of_month = date(data.period_year, data.period_month, 1)
        end_of_month = date(data.period_year, data.period_month, total_days_in_month)

        # Track unpaid days per employee from approved unpaid leave requests
        emp_unpaid_days: dict[uuid.UUID, int] = {}
        try:
            unpaid_leave_query = (
                select(LeaveRequest)
                .join(LeaveType, LeaveType.id == LeaveRequest.leave_type_id)
                .where(
                    LeaveRequest.organization_id == organization_id,
                    LeaveRequest.status == "approved",
                    LeaveType.is_paid.is_(False),
                    LeaveRequest.start_date <= end_of_month,
                    LeaveRequest.end_date >= start_of_month,
                )
            )
            unpaid_res = await session.execute(unpaid_leave_query)
            for lv in unpaid_res.scalars().all():
                overlap_start = max(lv.start_date, start_of_month)
                overlap_end = min(lv.end_date, end_of_month)
                days = (overlap_end - overlap_start).days + 1
                emp_unpaid_days[lv.employee_id] = emp_unpaid_days.get(lv.employee_id, 0) + max(0, days)
        except SQLAlchemyError as exc:
            logger.warning("Failed to query unpaid leave days for payroll run: %s", exc)

        # Track absent attendance records
        try:
            absent_query = select(AttendanceRecord).where(
                AttendanceRecord.organization_id == organization_id,
                AttendanceRecord.status == "absent",
                AttendanceRecord.work_date >= start_of_month,
                AttendanceRecord.work_date <= end_of_month,
            )
            absent_res = await session.execute(absent_query)
            for rec in absent_res.scalars().all():
                emp_unpaid_days[rec.employee_id] = emp_unpaid_days.get(rec.employee_id, 0) + 1
        except SQLAlchemyError as exc:
            logger.warning("Failed to query absent attendance records for payroll run: %s", exc)

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

        # Fetch approved bonus allocations for this period
        emp_bonuses: dict[uuid.UUID, list[BonusAllocation]] = {}
        try:
            bonus_query = (
                select(BonusAllocation)
                .join(Bonus, Bonus.id == BonusAllocation.bonus_id)
                .where(
                    BonusAllocation.organization_id == organization_id,
                    BonusAllocation.period_year == data.period_year,
                    BonusAllocation.period_month == data.period_month,
                    BonusAllocation.payroll_id.is_(None),
                    or_(
                        BonusAllocation.status == "approved",
                        Bonus.status == "approved",
                    ),
                    BonusAllocation.status != "rejected",
                    BonusAllocation.status != "cancelled",
                )
                .options(selectinload(BonusAllocation.bonus))
            )
            bonus_res = await session.execute(bonus_query)
            for b_alloc in bonus_res.scalars().all():
                emp_bonuses.setdefault(b_alloc.employee_id, []).append(b_alloc)
        except SQLAlchemyError as exc:
            logger.warning("Failed to query bonus allocations for payroll run: %s", exc)

        all_matched_bonus_allocations: list[BonusAllocation] = []
        emp_slip_ids: dict[uuid.UUID, uuid.UUID] = {}
        emp_matched_bonuses: dict[uuid.UUID, list[BonusAllocation]] = {}

        for emp in eligible_employees:
            struct = structures[emp.id]
            base_sal = struct.base_salary
            hra_val = struct.hra or Decimal("0.00")

            # Parse custom allowances
            custom_allowances: dict[str, Any] = struct.allowances or {}
            allowances_sum = sum(Decimal(str(v)) for v in custom_allowances.values() if v)

            # Check unpaid leaves and absences
            unpaid_days = min(total_days_in_month, emp_unpaid_days.get(emp.id, 0))
            leave_deduction = Decimal("0.00")
            if total_days_in_month > 0 and unpaid_days > 0:
                per_day_rate = (base_sal / Decimal(str(total_days_in_month))).quantize(
                    Decimal("0.01")
                )
                leave_deduction = (per_day_rate * Decimal(str(unpaid_days))).quantize(
                    Decimal("0.01")
                )

            # Match approved bonuses for this employee with compatible currency
            matched_bonuses: list[BonusAllocation] = []
            bonus_total = Decimal("0.00")
            if emp.id in emp_bonuses:
                for b_alloc in emp_bonuses[emp.id]:
                    if (b_alloc.currency or "").strip().upper() == (struct.currency or "").strip().upper():
                        matched_bonuses.append(b_alloc)
                        bonus_total += b_alloc.amount
                        all_matched_bonus_allocations.append(b_alloc)

            gross = base_sal + hra_val + allowances_sum + bonus_total

            # Parse custom deductions
            custom_deductions: dict[str, Any] = dict(struct.deductions or {})
            if unpaid_days > 0:
                custom_deductions["Unpaid Leave / Absence Deduction"] = float(leave_deduction)

            deductions_sum = sum(Decimal(str(v)) for v in custom_deductions.values() if v)
            net = max(Decimal("0.00"), gross - deductions_sum)

            earnings_breakdown = {
                "Base Salary": float(base_sal),
                **({"House Rent Allowance (HRA)": float(hra_val)} if hra_val > 0 else {}),
                **{k: float(v) for k, v in custom_allowances.items()},
            }
            for b_alloc in matched_bonuses:
                b_name = b_alloc.bonus.name if b_alloc.bonus else "Performance Bonus"
                item_title = f"Bonus: {b_name}"
                if item_title in earnings_breakdown:
                    item_title = f"{item_title} ({str(b_alloc.id)[:6]})"
                earnings_breakdown[item_title] = float(b_alloc.amount)

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
            emp_slip_ids[emp.id] = slip.id
            emp_matched_bonuses[emp.id] = matched_bonuses

            total_gross += gross
            total_deduct += deductions_sum
            total_net += net
            slip_index += 1

        payroll.total_gross_pay = total_gross
        payroll.total_deductions = total_deduct
        payroll.total_net_pay = total_net
        payroll.employee_count = len(eligible_employees)

        # Flush payslips first so they exist in DB before linking bonus allocations
        await session.flush()

        for emp_id, matched_list in emp_matched_bonuses.items():
            s_id = emp_slip_ids.get(emp_id)
            for b_alloc in matched_list:
                b_alloc.payroll_id = payroll_id
                b_alloc.payslip_id = s_id
                b_alloc.status = "included_in_payroll"

        # Update parent bonus status if all allocations are included
        touched_bonuses = {b_alloc.bonus_id for b_alloc in all_matched_bonus_allocations}
        for b_id in touched_bonuses:
            uninc_query = select(BonusAllocation).where(
                BonusAllocation.bonus_id == b_id,
                BonusAllocation.status != "included_in_payroll",
            )
            uninc_res = await session.execute(uninc_query)
            if not uninc_res.scalars().first():
                b_q = select(Bonus).where(Bonus.id == b_id)
                b_obj = (await session.execute(b_q)).scalar_one_or_none()
                if b_obj and b_obj.status == "approved":
                    b_obj.status = "included_in_payroll"

        await session.flush()
        await session.refresh(payroll)
        resp = PayrollResponse.model_validate(payroll)
        resp.total_bonus_pay = sum(b.amount for b in all_matched_bonus_allocations)
        return resp

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

        # Update linked bonus allocations to paid
        alloc_query = select(BonusAllocation).where(
            BonusAllocation.payroll_id == payroll_id,
            BonusAllocation.organization_id == organization_id,
        )
        alloc_res = await session.execute(alloc_query)
        touched_bonuses = set()
        for alloc in alloc_res.scalars().all():
            alloc.status = "paid"
            touched_bonuses.add(alloc.bonus_id)

        for b_id in touched_bonuses:
            unpaid_alloc_q = select(BonusAllocation).where(
                BonusAllocation.bonus_id == b_id,
                BonusAllocation.status != "paid",
            )
            unpaid_res = await session.execute(unpaid_alloc_q)
            if not unpaid_res.scalars().first():
                b_res = await session.execute(select(Bonus).where(Bonus.id == b_id))
                b_obj = b_res.scalar_one_or_none()
                if b_obj and b_obj.status != "paid":
                    b_obj.status = "paid"

        await session.flush()
        await session.refresh(payroll)
        return PayrollResponse.model_validate(payroll)

    @staticmethod
    async def delete_payroll_run(
        session: AsyncSession,
        organization_id: uuid.UUID,
        payroll_id: uuid.UUID,
    ) -> None:
        query = select(Payroll).where(
            Payroll.id == payroll_id,
            Payroll.organization_id == organization_id,
        )
        res = await session.execute(query)
        payroll = res.scalar_one_or_none()
        if not payroll:
            raise HTTPException(status_code=404, detail="Payroll run not found")
        if payroll.status not in ("draft", "cancelled"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete payroll in '{payroll.status}' state. Only draft or cancelled runs can be removed.",
            )

        # Release any included bonus allocations back to approved
        alloc_query = select(BonusAllocation).where(
            BonusAllocation.payroll_id == payroll_id,
            BonusAllocation.organization_id == organization_id,
        )
        alloc_res = await session.execute(alloc_query)
        touched_bonuses = set()
        for alloc in alloc_res.scalars().all():
            alloc.status = "approved"
            alloc.payroll_id = None
            alloc.payslip_id = None
            touched_bonuses.add(alloc.bonus_id)

        for b_id in touched_bonuses:
            b_res = await session.execute(select(Bonus).where(Bonus.id == b_id))
            b_obj = b_res.scalar_one_or_none()
            if b_obj and b_obj.status == "included_in_payroll":
                b_obj.status = "approved"

        await session.delete(payroll)
        await session.flush()

    @staticmethod
    async def list_payslips(
        session: AsyncSession,
        organization_id: uuid.UUID,
        payroll_id: uuid.UUID | None = None,
        employee_id: uuid.UUID | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> list[PayslipResponse]:
        if payroll_id:
            p_res = await session.execute(
                select(Payroll.status).where(
                    Payroll.id == payroll_id,
                    Payroll.organization_id == organization_id,
                )
            )
            p_status = p_res.scalar_one_or_none()
            if p_status and p_status != "paid":
                await PayrollService.sync_payroll_run(session, organization_id, payroll_id)

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
            b_amount = Decimal("0.00")
            for k, v in (slip.earnings_breakdown or {}).items():
                if k.lower().startswith("bonus"):
                    b_amount += Decimal(str(v))
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
                    bonus_amount=b_amount,
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
        b_amount = Decimal("0.00")
        for k, v in (slip.earnings_breakdown or {}).items():
            if k.lower().startswith("bonus"):
                b_amount += Decimal(str(v))

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
            bonus_amount=b_amount,
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

        # Active employees with declared salary structure
        emp_q = (
            select(func.count(func.distinct(SalaryStructure.employee_id)))
            .join(Employee, Employee.id == SalaryStructure.employee_id)
            .where(
                SalaryStructure.organization_id == organization_id,
                SalaryStructure.is_active.is_(True),
                Employee.is_active.is_(True),
            )
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

    # -----------------------------------------------------------------------
    # Bonus Management
    # -----------------------------------------------------------------------

    @staticmethod
    async def preview_bonus(
        session: AsyncSession,
        organization_id: uuid.UUID,
        data: BonusPreviewRequest,
    ) -> BonusPreviewResponse:
        if data.rate_or_amount < Decimal("0.00"):
            raise HTTPException(status_code=400, detail="Bonus rate or amount cannot be negative")

        # Resolve targeted active employees
        query = (
            select(Employee)
            .where(
                Employee.organization_id == organization_id,
                Employee.is_active.is_(True),
            )
            .options(selectinload(Employee.department))
        )
        if data.employee_ids:
            query = query.where(Employee.id.in_(data.employee_ids))
        elif data.project_id:
            query = query.join(ProjectMember, ProjectMember.employee_id == Employee.id).where(
                ProjectMember.project_id == data.project_id
            )
        elif data.target_department_id:
            query = query.where(Employee.department_id == data.target_department_id)

        emp_res = await session.execute(query)
        employees = emp_res.scalars().all()
        if not employees:
            return BonusPreviewResponse(
                currency=data.currency,
                total_estimated_amount=Decimal("0.00"),
                employee_count=0,
                items=[],
            )

        # Fetch active salary structures
        struct_q = select(SalaryStructure).where(
            SalaryStructure.organization_id == organization_id,
            SalaryStructure.is_active.is_(True),
            SalaryStructure.currency == data.currency,
        )
        struct_res = await session.execute(struct_q)
        structures = {s.employee_id: s for s in struct_res.scalars().all()}

        items: list[BonusPreviewItem] = []
        total_est = Decimal("0.00")

        for emp in employees:
            struct = structures.get(emp.id)
            base_sal = struct.base_salary if struct else Decimal("0.00")
            dept_name = emp.department.name if emp.department else None

            if data.calculation_type == "percentage":
                rate = data.rate_or_amount
                calculated_amt = (base_sal * rate / Decimal(100)).quantize(Decimal("0.01"))
            else:
                rate = None
                calculated_amt = data.rate_or_amount.quantize(Decimal("0.01"))

            total_est += calculated_amt
            items.append(
                BonusPreviewItem(
                    employee_id=emp.id,
                    employee_name=f"{emp.first_name} {emp.last_name}".strip(),
                    employee_code=emp.employee_code,
                    department_name=dept_name,
                    base_salary=base_sal,
                    bonus_amount=calculated_amt,
                    percentage_rate=rate,
                )
            )

        return BonusPreviewResponse(
            currency=data.currency,
            total_estimated_amount=total_est,
            employee_count=len(items),
            items=items,
        )

    @staticmethod
    async def create_bonus(
        session: AsyncSession,
        organization_id: uuid.UUID,
        user_id: uuid.UUID,
        data: BonusCreate,
    ) -> BonusResponse:
        if data.rate_or_amount < Decimal("0.00"):
            raise HTTPException(status_code=400, detail="Bonus rate or amount cannot be negative")

        allocations_to_create: list[dict[str, Any]] = []

        if data.allocations and len(data.allocations) > 0:
            for alloc_data in data.allocations:
                if alloc_data.amount < Decimal("0.00"):
                    raise HTTPException(status_code=400, detail="Allocation amount cannot be negative")
                allocations_to_create.append({
                    "employee_id": alloc_data.employee_id,
                    "amount": alloc_data.amount,
                    "percentage_rate": alloc_data.percentage_rate,
                    "calculation_base_amount": alloc_data.calculation_base_amount,
                    "notes": alloc_data.notes,
                })
        else:
            preview_req = BonusPreviewRequest(
                bonus_type=data.bonus_type,
                calculation_type=data.calculation_type,
                calculation_base=data.calculation_base,
                rate_or_amount=data.rate_or_amount,
                currency=data.currency,
                period_month=data.period_month,
                period_year=data.period_year,
                project_id=data.project_id,
                target_department_id=data.target_department_id,
                employee_ids=data.employee_ids,
            )
            preview = await PayrollService.preview_bonus(session, organization_id, preview_req)
            if preview.employee_count == 0:
                raise HTTPException(
                    status_code=400,
                    detail="No active eligible employees found matching criteria or matching currency.",
                )
            for item in preview.items:
                allocations_to_create.append({
                    "employee_id": item.employee_id,
                    "amount": item.bonus_amount,
                    "percentage_rate": item.percentage_rate,
                    "calculation_base_amount": item.base_salary,
                    "notes": None,
                })

        total_amount = sum((a["amount"] for a in allocations_to_create), Decimal("0.00"))
        bonus_id = uuid.uuid4()

        bonus = Bonus(
            id=bonus_id,
            organization_id=organization_id,
            name=data.name,
            description=data.description,
            bonus_type=data.bonus_type,
            calculation_type=data.calculation_type,
            calculation_base=data.calculation_base,
            rate_or_amount=data.rate_or_amount,
            currency=data.currency,
            period_month=data.period_month,
            period_year=data.period_year,
            status="draft",
            total_amount=total_amount,
            employee_count=len(allocations_to_create),
            project_id=data.project_id,
            project_reference=data.project_reference,
            target_department_id=data.target_department_id,
            notes=data.notes,
            created_by=user_id,
        )
        session.add(bonus)

        for a in allocations_to_create:
            alloc_obj = BonusAllocation(
                id=uuid.uuid4(),
                organization_id=organization_id,
                bonus_id=bonus_id,
                employee_id=a["employee_id"],
                amount=a["amount"],
                percentage_rate=a.get("percentage_rate"),
                calculation_base_amount=a.get("calculation_base_amount"),
                currency=data.currency,
                status="draft",
                period_month=data.period_month,
                period_year=data.period_year,
                notes=a.get("notes"),
            )
            session.add(alloc_obj)

        await session.flush()
        return await PayrollService.get_bonus(session, organization_id, bonus_id)

    @staticmethod
    async def list_bonuses(
        session: AsyncSession,
        organization_id: uuid.UUID,
        status: str | None = None,
        period_year: int | None = None,
        period_month: int | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> list[BonusResponse]:
        query = (
            select(Bonus)
            .where(Bonus.organization_id == organization_id)
            .options(
                selectinload(Bonus.allocations).selectinload(BonusAllocation.employee).selectinload(Employee.department)
            )
            .order_by(Bonus.created_at.desc())
        )
        if status:
            query = query.where(Bonus.status == status)
        if period_year:
            query = query.where(Bonus.period_year == period_year)
        if period_month:
            query = query.where(Bonus.period_month == period_month)

        query = query.offset(skip).limit(limit)
        res = await session.execute(query)
        bonuses = res.scalars().all()

        results = []
        for b in bonuses:
            alloc_responses = []
            for a in b.allocations:
                emp = a.employee
                emp_name = f"{emp.first_name} {emp.last_name}".strip() if emp else None
                emp_code = emp.employee_code if emp else None
                dept_name = emp.department.name if emp and emp.department else None
                alloc_responses.append(
                    BonusAllocationResponse(
                        id=a.id,
                        organization_id=a.organization_id,
                        bonus_id=a.bonus_id,
                        employee_id=a.employee_id,
                        employee_name=emp_name,
                        employee_code=emp_code,
                        department_name=dept_name,
                        amount=a.amount,
                        percentage_rate=a.percentage_rate,
                        calculation_base_amount=a.calculation_base_amount,
                        currency=a.currency,
                        status=a.status,
                        payroll_id=a.payroll_id,
                        payslip_id=a.payslip_id,
                        period_month=a.period_month,
                        period_year=a.period_year,
                        notes=a.notes,
                        created_at=a.created_at,
                        updated_at=a.updated_at,
                    )
                )
            results.append(
                BonusResponse(
                    id=b.id,
                    organization_id=b.organization_id,
                    name=b.name,
                    description=b.description,
                    bonus_type=b.bonus_type,
                    calculation_type=b.calculation_type,
                    calculation_base=b.calculation_base,
                    rate_or_amount=b.rate_or_amount,
                    currency=b.currency,
                    period_month=b.period_month,
                    period_year=b.period_year,
                    status=b.status,
                    total_amount=b.total_amount,
                    employee_count=b.employee_count,
                    project_id=b.project_id,
                    project_reference=b.project_reference,
                    target_department_id=b.target_department_id,
                    rejection_reason=b.rejection_reason,
                    notes=b.notes,
                    created_by=b.created_by,
                    approved_by=b.approved_by,
                    rejected_by=b.rejected_by,
                    cancelled_by=b.cancelled_by,
                    created_at=b.created_at,
                    updated_at=b.updated_at,
                    allocations=alloc_responses,
                )
            )
        return results

    @staticmethod
    async def get_bonus(
        session: AsyncSession,
        organization_id: uuid.UUID,
        bonus_id: uuid.UUID,
    ) -> BonusResponse:
        query = (
            select(Bonus)
            .where(
                Bonus.id == bonus_id,
                Bonus.organization_id == organization_id,
            )
            .options(
                selectinload(Bonus.allocations).selectinload(BonusAllocation.employee).selectinload(Employee.department)
            )
        )
        res = await session.execute(query)
        b = res.scalar_one_or_none()
        if not b:
            raise HTTPException(status_code=404, detail="Bonus campaign not found")

        alloc_responses = []
        for a in b.allocations:
            emp = a.employee
            emp_name = f"{emp.first_name} {emp.last_name}".strip() if emp else None
            emp_code = emp.employee_code if emp else None
            dept_name = emp.department.name if emp and emp.department else None
            alloc_responses.append(
                BonusAllocationResponse(
                    id=a.id,
                    organization_id=a.organization_id,
                    bonus_id=a.bonus_id,
                    employee_id=a.employee_id,
                    employee_name=emp_name,
                    employee_code=emp_code,
                    department_name=dept_name,
                    amount=a.amount,
                    percentage_rate=a.percentage_rate,
                    calculation_base_amount=a.calculation_base_amount,
                    currency=a.currency,
                    status=a.status,
                    payroll_id=a.payroll_id,
                    payslip_id=a.payslip_id,
                    period_month=a.period_month,
                    period_year=a.period_year,
                    notes=a.notes,
                    created_at=a.created_at,
                    updated_at=a.updated_at,
                )
            )
        return BonusResponse(
            id=b.id,
            organization_id=b.organization_id,
            name=b.name,
            description=b.description,
            bonus_type=b.bonus_type,
            calculation_type=b.calculation_type,
            calculation_base=b.calculation_base,
            rate_or_amount=b.rate_or_amount,
            currency=b.currency,
            period_month=b.period_month,
            period_year=b.period_year,
            status=b.status,
            total_amount=b.total_amount,
            employee_count=b.employee_count,
            project_id=b.project_id,
            project_reference=b.project_reference,
            target_department_id=b.target_department_id,
            rejection_reason=b.rejection_reason,
            notes=b.notes,
            created_by=b.created_by,
            approved_by=b.approved_by,
            rejected_by=b.rejected_by,
            cancelled_by=b.cancelled_by,
            created_at=b.created_at,
            updated_at=b.updated_at,
            allocations=alloc_responses,
        )

    @staticmethod
    async def submit_bonus_for_approval(
        session: AsyncSession,
        organization_id: uuid.UUID,
        bonus_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> BonusResponse:
        b_res = await session.execute(
            select(Bonus).where(Bonus.id == bonus_id, Bonus.organization_id == organization_id)
        )
        b = b_res.scalar_one_or_none()
        if not b:
            raise HTTPException(status_code=404, detail="Bonus campaign not found")
        if b.status not in ("draft", "rejected"):
            raise HTTPException(status_code=400, detail=f"Cannot submit bonus in '{b.status}' state")

        b.status = "pending_approval"
        alloc_res = await session.execute(
            select(BonusAllocation).where(BonusAllocation.bonus_id == bonus_id)
        )
        for a in alloc_res.scalars().all():
            a.status = "pending_approval"

        await session.flush()
        return await PayrollService.get_bonus(session, organization_id, bonus_id)

    @staticmethod
    async def approve_bonus(
        session: AsyncSession,
        organization_id: uuid.UUID,
        bonus_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> BonusResponse:
        b_res = await session.execute(
            select(Bonus).where(Bonus.id == bonus_id, Bonus.organization_id == organization_id)
        )
        b = b_res.scalar_one_or_none()
        if not b:
            raise HTTPException(status_code=404, detail="Bonus campaign not found")
        if b.status not in ("draft", "pending_approval"):
            raise HTTPException(status_code=400, detail=f"Cannot approve bonus in '{b.status}' state")

        b.status = "approved"
        b.approved_by = user_id
        alloc_res = await session.execute(
            select(BonusAllocation).where(BonusAllocation.bonus_id == bonus_id)
        )
        for a in alloc_res.scalars().all():
            a.status = "approved"

        await session.flush()

        # Dynamically sync any unpaid payroll run for this period
        unpaid_payroll_q = select(Payroll.id).where(
            Payroll.organization_id == organization_id,
            Payroll.period_year == b.period_year,
            Payroll.period_month == b.period_month,
            Payroll.status != "paid",
        )
        unpaid_payroll_res = await session.execute(unpaid_payroll_q)
        unpaid_payroll_id = unpaid_payroll_res.scalar_one_or_none()
        if unpaid_payroll_id:
            await PayrollService.sync_payroll_run(session, organization_id, unpaid_payroll_id)

        return await PayrollService.get_bonus(session, organization_id, bonus_id)

    @staticmethod
    async def reject_bonus(
        session: AsyncSession,
        organization_id: uuid.UUID,
        bonus_id: uuid.UUID,
        user_id: uuid.UUID,
        data: BonusRejectRequest,
    ) -> BonusResponse:
        if not data.rejection_reason or len(data.rejection_reason.strip()) < 3:
            raise HTTPException(status_code=400, detail="A valid rejection reason is required")

        b_res = await session.execute(
            select(Bonus).where(Bonus.id == bonus_id, Bonus.organization_id == organization_id)
        )
        b = b_res.scalar_one_or_none()
        if not b:
            raise HTTPException(status_code=404, detail="Bonus campaign not found")
        if b.status == "paid":
            raise HTTPException(
                status_code=400,
                detail="Cannot reject a bonus that has already been paid",
            )
        paid_run_check = await session.execute(
            select(Payroll.id).join(BonusAllocation, BonusAllocation.payroll_id == Payroll.id)
            .where(BonusAllocation.bonus_id == bonus_id, Payroll.status == "paid")
        )
        if paid_run_check.scalars().first():
            raise HTTPException(
                status_code=400,
                detail="Cannot reject a bonus that has already been disbursed in a paid payroll run",
            )

        b.status = "rejected"
        b.rejected_by = user_id
        b.rejection_reason = data.rejection_reason.strip()

        alloc_res = await session.execute(
            select(BonusAllocation).where(BonusAllocation.bonus_id == bonus_id)
        )
        for a in alloc_res.scalars().all():
            a.status = "rejected"
            a.payroll_id = None
            a.payslip_id = None

        await session.flush()

        # Dynamically sync any unpaid payroll run for this period to remove this bonus
        unpaid_payroll_q = select(Payroll.id).where(
            Payroll.organization_id == organization_id,
            Payroll.period_year == b.period_year,
            Payroll.period_month == b.period_month,
            Payroll.status != "paid",
        )
        unpaid_payroll_res = await session.execute(unpaid_payroll_q)
        unpaid_payroll_id = unpaid_payroll_res.scalar_one_or_none()
        if unpaid_payroll_id:
            await PayrollService.sync_payroll_run(session, organization_id, unpaid_payroll_id)

        return await PayrollService.get_bonus(session, organization_id, bonus_id)

    @staticmethod
    async def cancel_bonus(
        session: AsyncSession,
        organization_id: uuid.UUID,
        bonus_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> BonusResponse:
        b_res = await session.execute(
            select(Bonus).where(Bonus.id == bonus_id, Bonus.organization_id == organization_id)
        )
        b = b_res.scalar_one_or_none()
        if not b:
            raise HTTPException(status_code=404, detail="Bonus campaign not found")
        if b.status == "paid":
            raise HTTPException(
                status_code=400,
                detail="Cannot cancel a bonus that has already been paid",
            )
        paid_run_check = await session.execute(
            select(Payroll.id).join(BonusAllocation, BonusAllocation.payroll_id == Payroll.id)
            .where(BonusAllocation.bonus_id == bonus_id, Payroll.status == "paid")
        )
        if paid_run_check.scalars().first():
            raise HTTPException(
                status_code=400,
                detail="Cannot cancel a bonus that has already been disbursed in a paid payroll run",
            )

        b.status = "cancelled"
        b.cancelled_by = user_id

        alloc_res = await session.execute(
            select(BonusAllocation).where(BonusAllocation.bonus_id == bonus_id)
        )
        for a in alloc_res.scalars().all():
            a.status = "cancelled"
            a.payroll_id = None
            a.payslip_id = None

        await session.flush()

        # Dynamically sync any unpaid payroll run for this period to remove this bonus
        unpaid_payroll_q = select(Payroll.id).where(
            Payroll.organization_id == organization_id,
            Payroll.period_year == b.period_year,
            Payroll.period_month == b.period_month,
            Payroll.status != "paid",
        )
        unpaid_payroll_res = await session.execute(unpaid_payroll_q)
        unpaid_payroll_id = unpaid_payroll_res.scalar_one_or_none()
        if unpaid_payroll_id:
            await PayrollService.sync_payroll_run(session, organization_id, unpaid_payroll_id)

        return await PayrollService.get_bonus(session, organization_id, bonus_id)

    @staticmethod
    async def delete_bonus(
        session: AsyncSession,
        organization_id: uuid.UUID,
        bonus_id: uuid.UUID,
    ) -> None:
        b_res = await session.execute(
            select(Bonus).where(Bonus.id == bonus_id, Bonus.organization_id == organization_id)
        )
        b = b_res.scalar_one_or_none()
        if not b:
            raise HTTPException(status_code=404, detail="Bonus campaign not found")
        if b.status == "paid":
            raise HTTPException(
                status_code=400,
                detail="Cannot delete a bonus that has already been paid",
            )
        paid_run_check = await session.execute(
            select(Payroll.id).join(BonusAllocation, BonusAllocation.payroll_id == Payroll.id)
            .where(BonusAllocation.bonus_id == bonus_id, Payroll.status == "paid")
        )
        if paid_run_check.scalars().first():
            raise HTTPException(
                status_code=400,
                detail="Cannot delete a bonus that has already been disbursed in a paid payroll run",
            )

        period_year = b.period_year
        period_month = b.period_month

        await session.delete(b)
        await session.flush()

        # Dynamically sync any unpaid payroll run for this period
        unpaid_payroll_q = select(Payroll.id).where(
            Payroll.organization_id == organization_id,
            Payroll.period_year == period_year,
            Payroll.period_month == period_month,
            Payroll.status != "paid",
        )
        unpaid_payroll_res = await session.execute(unpaid_payroll_q)
        unpaid_payroll_id = unpaid_payroll_res.scalar_one_or_none()
        if unpaid_payroll_id:
            await PayrollService.sync_payroll_run(session, organization_id, unpaid_payroll_id)

    @staticmethod
    async def list_bonus_allocations(
        session: AsyncSession,
        organization_id: uuid.UUID,
        employee_id: uuid.UUID | None = None,
        bonus_id: uuid.UUID | None = None,
        status: str | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> list[BonusAllocationResponse]:
        query = (
            select(BonusAllocation)
            .where(BonusAllocation.organization_id == organization_id)
            .options(
                selectinload(BonusAllocation.employee).selectinload(Employee.department),
                selectinload(BonusAllocation.bonus),
            )
            .order_by(BonusAllocation.created_at.desc())
        )
        if employee_id:
            query = query.where(BonusAllocation.employee_id == employee_id)
        if bonus_id:
            query = query.where(BonusAllocation.bonus_id == bonus_id)
        if status:
            query = query.where(BonusAllocation.status == status)

        query = query.offset(skip).limit(limit)
        res = await session.execute(query)
        allocs = res.scalars().all()

        results = []
        for a in allocs:
            emp = a.employee
            emp_name = f"{emp.first_name} {emp.last_name}".strip() if emp else None
            emp_code = emp.employee_code if emp else None
            dept_name = emp.department.name if emp and emp.department else None
            results.append(
                BonusAllocationResponse(
                    id=a.id,
                    organization_id=a.organization_id,
                    bonus_id=a.bonus_id,
                    employee_id=a.employee_id,
                    employee_name=emp_name,
                    employee_code=emp_code,
                    department_name=dept_name,
                    amount=a.amount,
                    percentage_rate=a.percentage_rate,
                    calculation_base_amount=a.calculation_base_amount,
                    currency=a.currency,
                    status=a.status,
                    payroll_id=a.payroll_id,
                    payslip_id=a.payslip_id,
                    period_month=a.period_month,
                    period_year=a.period_year,
                    notes=a.notes,
                    created_at=a.created_at,
                    updated_at=a.updated_at,
                )
            )
        return results

    @staticmethod
    async def update_bonus_allocation(
        session: AsyncSession,
        organization_id: uuid.UUID,
        allocation_id: uuid.UUID,
        data: BonusAllocationUpdate,
    ) -> BonusAllocationResponse:
        alloc_res = await session.execute(
            select(BonusAllocation)
            .where(
                BonusAllocation.id == allocation_id,
                BonusAllocation.organization_id == organization_id,
            )
            .options(
                selectinload(BonusAllocation.employee).selectinload(Employee.department),
                selectinload(BonusAllocation.bonus),
            )
        )
        alloc = alloc_res.scalar_one_or_none()
        if not alloc:
            raise HTTPException(status_code=404, detail="Bonus allocation not found")

        # Check if already paid in a disbursed payroll run
        if alloc.status == "paid":
            raise HTTPException(
                status_code=400,
                detail="Cannot change a bonus allocation that has already been paid",
            )
        if alloc.payroll_id:
            p_res = await session.execute(
                select(Payroll.status).where(Payroll.id == alloc.payroll_id)
            )
            p_status = p_res.scalar_one_or_none()
            if p_status == "paid":
                raise HTTPException(
                    status_code=400,
                    detail="Cannot change a bonus allocation that has already been disbursed in a paid payroll run",
                )

        alloc.amount = data.amount
        if data.notes is not None:
            alloc.notes = data.notes

        # Re-sum parent bonus total_amount
        all_allocs = await session.execute(
            select(BonusAllocation.amount).where(BonusAllocation.bonus_id == alloc.bonus_id)
        )
        total_b = sum((row[0] for row in all_allocs.all()), Decimal("0.00"))
        b_parent = (await session.execute(select(Bonus).where(Bonus.id == alloc.bonus_id))).scalar_one_or_none()
        if b_parent:
            b_parent.total_amount = total_b

        await session.flush()

        # Dynamically sync any unpaid payroll run for this allocation's period
        unpaid_p_res = await session.execute(
            select(Payroll.id).where(
                Payroll.organization_id == organization_id,
                Payroll.period_year == alloc.period_year,
                Payroll.period_month == alloc.period_month,
                Payroll.status != "paid",
            )
        )
        unpaid_p_id = unpaid_p_res.scalar_one_or_none()
        if unpaid_p_id:
            await PayrollService.sync_payroll_run(session, organization_id, unpaid_p_id)

        emp = alloc.employee
        return BonusAllocationResponse(
            id=alloc.id,
            organization_id=alloc.organization_id,
            bonus_id=alloc.bonus_id,
            employee_id=alloc.employee_id,
            employee_name=f"{emp.first_name} {emp.last_name}".strip() if emp else None,
            employee_code=emp.employee_code if emp else None,
            department_name=emp.department.name if emp and emp.department else None,
            amount=alloc.amount,
            percentage_rate=alloc.percentage_rate,
            calculation_base_amount=alloc.calculation_base_amount,
            currency=alloc.currency,
            status=alloc.status,
            payroll_id=alloc.payroll_id,
            payslip_id=alloc.payslip_id,
            period_month=alloc.period_month,
            period_year=alloc.period_year,
            notes=alloc.notes,
            created_at=alloc.created_at,
            updated_at=alloc.updated_at,
        )

