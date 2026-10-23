import hashlib
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.engagement import (
    AgreementSignature,
    ClientEngagement,
    EngagementAgreement,
    EngagementChangeRequest,
    EngagementHandover,
    EngagementIssue,
    EngagementProposal,
    EngagementUatSession,
    EngagementUatTestCase,
    EngagementWeeklyReport,
)
from app.models.project import Project
from app.schemas.engagement import (
    AgreementCreate,
    ChangeRequestCreate,
    ClientEngagementCreate,
    ClientEngagementUpdate,
    EngagementOverview,
    HandoverCreateOrUpdate,
    IssueCreate,
    ProposalCreate,
    SignatureCreate,
    UatSessionCreate,
    WeeklyReportCreate,
)


class EngagementService:
    @staticmethod
    async def get_overview(db: AsyncSession, organization_id: uuid.UUID) -> EngagementOverview:
        engagements_q = select(ClientEngagement).where(ClientEngagement.organization_id == organization_id)
        res = await db.execute(engagements_q)
        all_engagements = res.scalars().all()

        active_count = len([e for e in all_engagements if e.current_stage != "maintenance_support"])
        pipeline_val = sum((e.contract_value or Decimal("0.00") for e in all_engagements), Decimal("0.00"))
        collected_val = sum((e.collected_amount for e in all_engagements), Decimal("0.00"))

        # Pending proposals
        prop_q = select(func.count(EngagementProposal.id)).where(
            EngagementProposal.organization_id == organization_id,
            EngagementProposal.status.in_(["draft", "in_review", "sent"]),
        )
        prop_res = await db.execute(prop_q)
        pending_props = prop_res.scalar() or 0

        # Pending agreements
        agr_q = select(func.count(EngagementAgreement.id)).where(
            EngagementAgreement.organization_id == organization_id,
            EngagementAgreement.status.in_(["pending_signatures", "partially_signed"]),
        )
        agr_res = await db.execute(agr_q)
        pending_agrs = agr_res.scalar() or 0

        # Kickoff ready
        kickoff_ready = len([e for e in all_engagements if e.current_stage == "kickoff"])
        active_delivery = len([e for e in all_engagements if e.current_stage == "delivery"])

        # Critical issues
        issue_q = select(func.count(EngagementIssue.id)).where(
            EngagementIssue.organization_id == organization_id,
            EngagementIssue.priority == "critical",
            EngagementIssue.status.in_(["open", "in_progress"]),
        )
        issue_res = await db.execute(issue_q)
        critical_issues = issue_res.scalar() or 0

        # Active UAT
        uat_q = select(func.count(EngagementUatSession.id)).where(
            EngagementUatSession.organization_id == organization_id,
            EngagementUatSession.status == "active",
        )
        uat_res = await db.execute(uat_q)
        active_uat = uat_res.scalar() or 0

        return EngagementOverview(
            active_engagements_count=active_count,
            proposals_pending_count=pending_props,
            agreements_pending_signatures_count=pending_agrs,
            kickoff_ready_count=kickoff_ready,
            active_delivery_count=active_delivery,
            open_critical_issues_count=critical_issues,
            uat_active_count=active_uat,
            total_pipeline_value=pipeline_val,
            total_collected_value=collected_val,
        )

    @staticmethod
    async def list_engagements(
        db: AsyncSession,
        organization_id: uuid.UUID,
        stage: str | None = None,
        health: str | None = None,
        search: str | None = None,
        project_id: uuid.UUID | None = None,
    ) -> list[ClientEngagement]:
        query = (
            select(ClientEngagement)
            .options(selectinload(ClientEngagement.client))
            .where(ClientEngagement.organization_id == organization_id)
            .order_by(ClientEngagement.created_at.desc())
        )
        if stage:
            query = query.where(ClientEngagement.current_stage == stage)
        if health:
            query = query.where(ClientEngagement.delivery_health == health)
        if search:
            query = query.where(ClientEngagement.title.ilike(f"%{search}%"))
        if project_id:
            query = query.where(ClientEngagement.project_id == project_id)

        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def create_engagement(
        db: AsyncSession, organization_id: uuid.UUID, payload: ClientEngagementCreate
    ) -> ClientEngagement:
        # Generate code
        count_q = select(func.count(ClientEngagement.id)).where(ClientEngagement.organization_id == organization_id)
        count_res = await db.execute(count_q)
        num = (count_res.scalar() or 0) + 1
        code = f"ENG-{num:04d}"

        engagement = ClientEngagement(
            organization_id=organization_id,
            client_id=payload.client_id,
            project_id=payload.project_id,
            engagement_code=code,
            title=payload.title,
            description=payload.description,
            contract_value=payload.contract_value,
            currency=payload.currency,
            target_completion_date=payload.target_completion_date,
            engagement_lead_id=payload.engagement_lead_id,
            current_stage="delivery" if payload.project_id else "proposal",
            delivery_health="on_track",
            progress_percentage=15 if payload.project_id else 0,
        )
        db.add(engagement)
        await db.commit()
        await db.refresh(engagement)
        return engagement

    @staticmethod
    async def get_engagement_detail(
        db: AsyncSession, organization_id: uuid.UUID, engagement_id: uuid.UUID
    ) -> ClientEngagement | None:
        query = (
            select(ClientEngagement)
            .options(
                selectinload(ClientEngagement.client),
                selectinload(ClientEngagement.proposals),
                selectinload(ClientEngagement.agreements).selectinload(EngagementAgreement.signatures),
                selectinload(ClientEngagement.weekly_reports),
                selectinload(ClientEngagement.uat_sessions).selectinload(EngagementUatSession.test_cases),
                selectinload(ClientEngagement.issues),
                selectinload(ClientEngagement.change_requests),
                selectinload(ClientEngagement.handover),
            )
            .where(ClientEngagement.organization_id == organization_id, ClientEngagement.id == engagement_id)
        )
        result = await db.execute(query)
        return result.scalars().first()

    @staticmethod
    async def update_engagement(
        db: AsyncSession, organization_id: uuid.UUID, engagement_id: uuid.UUID, payload: ClientEngagementUpdate
    ) -> ClientEngagement | None:
        engagement = await EngagementService.get_engagement_detail(db, organization_id, engagement_id)
        if not engagement:
            return None

        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(engagement, field, value)

        await db.commit()
        await db.refresh(engagement)
        return engagement

    @staticmethod
    async def _auto_advance_stage(
        db: AsyncSession,
        engagement_id: uuid.UUID,
        target_stage: str,
        target_progress: int,
    ) -> None:
        STAGE_ORDER = [
            "proposal",
            "agreement",
            "kickoff",
            "delivery",
            "weekly_reporting",
            "uat",
            "issues_triage",
            "acceptance_handover",
            "maintenance_support",
        ]
        eng = await db.get(ClientEngagement, engagement_id)
        if not eng:
            return
        curr_idx = STAGE_ORDER.index(eng.current_stage) if eng.current_stage in STAGE_ORDER else 0
        tgt_idx = STAGE_ORDER.index(target_stage) if target_stage in STAGE_ORDER else 0
        if tgt_idx > curr_idx:
            eng.current_stage = target_stage
        if target_progress > eng.progress_percentage:
            eng.progress_percentage = min(100, target_progress)

    # --- Sub-resource Methods ---
    @staticmethod
    async def create_proposal(
        db: AsyncSession, organization_id: uuid.UUID, engagement_id: uuid.UUID, payload: ProposalCreate
    ) -> EngagementProposal:
        count_q = select(func.count(EngagementProposal.id)).where(EngagementProposal.organization_id == organization_id)
        c_res = await db.execute(count_q)
        cnt = (c_res.scalar() or 0) + 1
        p_num = f"PROP-{cnt:04d}"
        while True:
            chk = await db.scalar(
                select(EngagementProposal.id).where(
                    EngagementProposal.organization_id == organization_id,
                    EngagementProposal.proposal_number == p_num,
                )
            )
            if not chk:
                break
            cnt += 1
            p_num = f"PROP-{cnt:04d}"

        proposal = EngagementProposal(
            organization_id=organization_id,
            engagement_id=engagement_id,
            proposal_number=p_num,
            title=payload.title,
            total_amount=payload.total_amount,
            currency=payload.currency,
            valid_until=payload.valid_until,
            scope_of_work=payload.scope_of_work,
            deliverables_json=payload.deliverables_json,
            line_items_json=payload.line_items_json,
            payment_terms=payload.payment_terms,
            status="draft",
        )
        db.add(proposal)
        await db.commit()
        await db.refresh(proposal)
        return proposal

    @staticmethod
    async def create_agreement(
        db: AsyncSession, organization_id: uuid.UUID, engagement_id: uuid.UUID, payload: AgreementCreate
    ) -> EngagementAgreement:
        count_q = select(func.count(EngagementAgreement.id)).where(EngagementAgreement.organization_id == organization_id)
        c_res = await db.execute(count_q)
        cnt = (c_res.scalar() or 0) + 1
        a_num = f"AGR-{cnt:04d}"
        while True:
            chk = await db.scalar(
                select(EngagementAgreement.id).where(
                    EngagementAgreement.organization_id == organization_id,
                    EngagementAgreement.agreement_number == a_num,
                )
            )
            if not chk:
                break
            cnt += 1
            a_num = f"AGR-{cnt:04d}"

        # Calculate initial SHA-256 for document content
        content = payload.document_content or f"Agreement {a_num}: {payload.title}"
        doc_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()

        agreement = EngagementAgreement(
            organization_id=organization_id,
            engagement_id=engagement_id,
            proposal_id=payload.proposal_id,
            agreement_number=a_num,
            title=payload.title,
            agreement_type=payload.agreement_type,
            status="pending_signatures",
            contract_value=payload.contract_value,
            currency=payload.currency,
            effective_date=payload.effective_date,
            expiry_date=payload.expiry_date,
            document_content=content,
            document_sha256=doc_hash,
        )
        db.add(agreement)
        await EngagementService._auto_advance_stage(db, engagement_id, "agreement", 12)
        await db.commit()

        # Eager load signatures to prevent MissingGreenlet in async serializer
        stmt = (
            select(EngagementAgreement)
            .options(selectinload(EngagementAgreement.signatures))
            .where(EngagementAgreement.id == agreement.id)
        )
        res = await db.execute(stmt)
        return res.scalar_one()

    @staticmethod
    async def delete_agreement(
        db: AsyncSession, organization_id: uuid.UUID, engagement_id: uuid.UUID, agreement_id: uuid.UUID
    ) -> bool:
        stmt = select(EngagementAgreement).where(
            EngagementAgreement.organization_id == organization_id,
            EngagementAgreement.engagement_id == engagement_id,
            EngagementAgreement.id == agreement_id,
        )
        res = await db.execute(stmt)
        agreement = res.scalars().first()
        if not agreement:
            return False
        await db.delete(agreement)
        await db.commit()
        return True

    @staticmethod
    async def add_signature(
        db: AsyncSession,
        organization_id: uuid.UUID,
        agreement_id: uuid.UUID,
        payload: SignatureCreate,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> AgreementSignature:
        sig_hash = hashlib.sha256(payload.signature_data.encode("utf-8")).hexdigest()
        now = datetime.now(UTC)

        signature = AgreementSignature(
            organization_id=organization_id,
            agreement_id=agreement_id,
            signer_name=payload.signer_name,
            signer_email=payload.signer_email,
            signer_role=payload.signer_role,
            signer_title=payload.signer_title,
            status="signed",
            signed_at=now,
            ip_address=ip_address,
            user_agent=user_agent,
            signature_data=payload.signature_data,
            signature_checksum=sig_hash,
        )
        db.add(signature)

        # Check if agreement has both internal and client signatures to mark active
        agr_q = (
            select(EngagementAgreement)
            .options(selectinload(EngagementAgreement.signatures))
            .where(EngagementAgreement.id == agreement_id)
        )
        agr_res = await db.execute(agr_q)
        agreement = agr_res.scalars().first()
        if agreement:
            agreement.status = "partially_signed"
            existing_roles = {s.signer_role for s in agreement.signatures}
            existing_roles.add(payload.signer_role)
            if "internal" in existing_roles and "client" in existing_roles:
                agreement.status = "active"
            await EngagementService._auto_advance_stage(db, agreement.engagement_id, "kickoff", 25)

        await db.commit()
        await db.refresh(signature)
        return signature

    @staticmethod
    async def kickoff_project(
        db: AsyncSession, organization_id: uuid.UUID, engagement_id: uuid.UUID
    ) -> Project | None:
        engagement = await EngagementService.get_engagement_detail(db, organization_id, engagement_id)
        if not engagement:
            return None

        # If project already linked, return it (idempotent)
        if engagement.project_id:
            proj_q = select(Project).where(Project.id == engagement.project_id)
            p_res = await db.execute(proj_q)
            return p_res.scalars().first()

        # Generate project
        count_q = select(func.count(Project.id)).where(Project.organization_id == organization_id)
        c_res = await db.execute(count_q)
        cnt = (c_res.scalar() or 0) + 1
        p_code = f"PRJ-{cnt:04d}"
        while True:
            chk = await db.scalar(
                select(Project.id).where(
                    Project.organization_id == organization_id,
                    Project.project_code == p_code,
                )
            )
            if not chk:
                break
            cnt += 1
            p_code = f"PRJ-{cnt:04d}"

        new_project = Project(
            organization_id=organization_id,
            client_id=engagement.client_id,
            project_code=p_code,
            name=engagement.title[:200],
            description=engagement.description or f"Execution project for {engagement.engagement_code}",
            status="active",
            start_date=date.today(),
            budget=engagement.contract_value,
            project_manager_employee_id=engagement.engagement_lead_id,
        )
        db.add(new_project)
        await db.flush()

        # Link project to engagement and transition stage
        engagement.project_id = new_project.id
        engagement.current_stage = "delivery"
        engagement.progress_percentage = 15
        await db.commit()
        await db.refresh(new_project)
        return new_project

    @staticmethod
    async def create_weekly_report(
        db: AsyncSession, organization_id: uuid.UUID, engagement_id: uuid.UUID, payload: WeeklyReportCreate
    ) -> EngagementWeeklyReport:
        count_q = select(func.count(EngagementWeeklyReport.id)).where(EngagementWeeklyReport.organization_id == organization_id)
        c_res = await db.execute(count_q)
        cnt = (c_res.scalar() or 0) + 1
        r_num = f"WR-{cnt:04d}"
        while True:
            chk = await db.scalar(
                select(EngagementWeeklyReport.id).where(
                    EngagementWeeklyReport.organization_id == organization_id,
                    EngagementWeeklyReport.report_number == r_num,
                )
            )
            if not chk:
                break
            cnt += 1
            r_num = f"WR-{cnt:04d}"

        now = datetime.now(UTC)
        report = EngagementWeeklyReport(
            organization_id=organization_id,
            engagement_id=engagement_id,
            report_number=r_num,
            week_start_date=payload.week_start_date,
            week_end_date=payload.week_end_date,
            executive_summary=payload.executive_summary,
            accomplishments=payload.accomplishments,
            next_week_plans=payload.next_week_plans,
            risks_and_blockers=payload.risks_and_blockers,
            delivery_health=payload.delivery_health,
            client_action_items=payload.client_action_items,
            is_published=payload.is_published,
            published_at=now if payload.is_published else None,
        )
        db.add(report)
        await EngagementService._auto_advance_stage(db, engagement_id, "weekly_reporting", 55)
        await db.commit()
        await db.refresh(report)
        return report

    @staticmethod
    async def create_uat_session(
        db: AsyncSession, organization_id: uuid.UUID, engagement_id: uuid.UUID, payload: UatSessionCreate
    ) -> EngagementUatSession:
        session = EngagementUatSession(
            organization_id=organization_id,
            engagement_id=engagement_id,
            session_title=payload.session_title,
            build_version=payload.build_version,
            staging_url=payload.staging_url,
            start_date=payload.start_date,
            end_date=payload.end_date,
            status="active",
        )
        db.add(session)
        await db.flush()

        for tc in payload.test_cases:
            case = EngagementUatTestCase(
                organization_id=organization_id,
                session_id=session.id,
                title=tc.title,
                instructions=tc.instructions,
                expected_outcome=tc.expected_outcome,
                status="pending",
            )
            db.add(case)

        await EngagementService._auto_advance_stage(db, engagement_id, "uat", 70)
        await db.commit()

        # Eager load test_cases to prevent MissingGreenlet in async serializer
        stmt = (
            select(EngagementUatSession)
            .options(selectinload(EngagementUatSession.test_cases))
            .where(EngagementUatSession.id == session.id)
        )
        res = await db.execute(stmt)
        return res.scalar_one()

    @staticmethod
    async def create_issue(
        db: AsyncSession, organization_id: uuid.UUID, engagement_id: uuid.UUID, payload: IssueCreate
    ) -> EngagementIssue:
        count_q = select(func.count(EngagementIssue.id)).where(EngagementIssue.organization_id == organization_id)
        c_res = await db.execute(count_q)
        cnt = (c_res.scalar() or 0) + 1
        i_num = f"ISS-{cnt:04d}"
        while True:
            chk = await db.scalar(
                select(EngagementIssue.id).where(
                    EngagementIssue.organization_id == organization_id,
                    EngagementIssue.issue_number == i_num,
                )
            )
            if not chk:
                break
            cnt += 1
            i_num = f"ISS-{cnt:04d}"

        issue = EngagementIssue(
            organization_id=organization_id,
            engagement_id=engagement_id,
            issue_number=i_num,
            title=payload.title,
            description=payload.description,
            issue_type=payload.issue_type,
            priority=payload.priority,
            status="open",
            reported_by_name=payload.reported_by_name,
            assigned_employee_id=payload.assigned_employee_id,
        )
        db.add(issue)
        await EngagementService._auto_advance_stage(db, engagement_id, "issues_triage", 80)
        await db.commit()
        await db.refresh(issue)
        return issue

    @staticmethod
    async def create_change_request(
        db: AsyncSession, organization_id: uuid.UUID, engagement_id: uuid.UUID, payload: ChangeRequestCreate
    ) -> EngagementChangeRequest:
        count_q = select(func.count(EngagementChangeRequest.id)).where(EngagementChangeRequest.organization_id == organization_id)
        c_res = await db.execute(count_q)
        cnt = (c_res.scalar() or 0) + 1
        cr_num = f"CR-{cnt:04d}"
        while True:
            chk = await db.scalar(
                select(EngagementChangeRequest.id).where(
                    EngagementChangeRequest.organization_id == organization_id,
                    EngagementChangeRequest.cr_number == cr_num,
                )
            )
            if not chk:
                break
            cnt += 1
            cr_num = f"CR-{cnt:04d}"

        cr = EngagementChangeRequest(
            organization_id=organization_id,
            engagement_id=engagement_id,
            cr_number=cr_num,
            title=payload.title,
            justification=payload.justification,
            scope_delta=payload.scope_delta,
            additional_cost=payload.additional_cost,
            additional_days=payload.additional_days,
            status="draft",
        )
        db.add(cr)
        await db.commit()
        await db.refresh(cr)
        return cr

    @staticmethod
    async def record_handover(
        db: AsyncSession, organization_id: uuid.UUID, engagement_id: uuid.UUID, payload: HandoverCreateOrUpdate
    ) -> EngagementHandover:
        handover_q = select(EngagementHandover).where(
            EngagementHandover.organization_id == organization_id, EngagementHandover.engagement_id == engagement_id
        )
        h_res = await db.execute(handover_q)
        handover = h_res.scalars().first()

        now = datetime.now(UTC)
        if not handover:
            count_q = select(func.count(EngagementHandover.id)).where(EngagementHandover.organization_id == organization_id)
            c_res = await db.execute(count_q)
            h_num = f"HND-{(c_res.scalar() or 0) + 1:04d}"

            handover = EngagementHandover(
                organization_id=organization_id,
                engagement_id=engagement_id,
                handover_number=h_num,
                deliverables_accepted=payload.deliverables_accepted,
                documentation_provided=payload.documentation_provided,
                client_signoff_name=payload.client_signoff_name,
                client_signoff_at=now if payload.client_signoff_name else None,
                warranty_start_date=payload.warranty_start_date,
                warranty_end_date=payload.warranty_end_date,
                sla_tier=payload.sla_tier,
                notes=payload.notes,
            )
            db.add(handover)
        else:
            handover.deliverables_accepted = payload.deliverables_accepted
            handover.documentation_provided = payload.documentation_provided
            if payload.client_signoff_name and not handover.client_signoff_at:
                handover.client_signoff_name = payload.client_signoff_name
                handover.client_signoff_at = now
            handover.warranty_start_date = payload.warranty_start_date
            handover.warranty_end_date = payload.warranty_end_date
            handover.sla_tier = payload.sla_tier
            handover.notes = payload.notes

        # Transition engagement to maintenance / support if signed off
        if payload.deliverables_accepted and payload.client_signoff_name:
            eng_q = select(ClientEngagement).where(ClientEngagement.id == engagement_id)
            e_res = await db.execute(eng_q)
            eng = e_res.scalars().first()
            if eng:
                eng.current_stage = "maintenance_support"
                eng.progress_percentage = 100
                eng.delivery_health = "completed"

        await db.commit()
        await db.refresh(handover)
        return handover
