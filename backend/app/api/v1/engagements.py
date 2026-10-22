import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_permission
from app.models.identity import OrganizationMembership
from app.schemas.engagement import (
    AgreementCreate,
    AgreementResponse,
    ChangeRequestCreate,
    ChangeRequestResponse,
    ClientEngagementCreate,
    ClientEngagementDetail,
    ClientEngagementSummary,
    ClientEngagementUpdate,
    EngagementOverview,
    HandoverCreateOrUpdate,
    HandoverResponse,
    IssueCreate,
    IssueResponse,
    IssueUpdate,
    ProposalCreate,
    ProposalResponse,
    SignatureCreate,
    SignatureResponse,
    UatSessionCreate,
    UatSessionResponse,
    WeeklyReportCreate,
    WeeklyReportResponse,
)
from app.services.engagement import EngagementService

router = APIRouter(prefix="/engagements", tags=["Client Engagements"])


@router.get("/overview", response_model=EngagementOverview)
async def get_overview(
    membership: Annotated[OrganizationMembership, Depends(require_permission("engagements.view"))],
    db: AsyncSession = Depends(get_db),
) -> EngagementOverview:
    return await EngagementService.get_overview(db, membership.organization_id)


@router.get("", response_model=list[ClientEngagementSummary])
async def list_engagements(
    membership: Annotated[OrganizationMembership, Depends(require_permission("engagements.view"))],
    stage: str | None = Query(None),
    health: str | None = Query(None),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[ClientEngagementSummary]:
    records = await EngagementService.list_engagements(
        db, membership.organization_id, stage=stage, health=health, search=search
    )
    result = []
    for r in records:
        result.append(
            ClientEngagementSummary(
                id=r.id,
                engagement_code=r.engagement_code,
                title=r.title,
                client_id=r.client_id,
                client_name=r.client.name if r.client else None,
                project_id=r.project_id,
                current_stage=r.current_stage,
                delivery_health=r.delivery_health,
                progress_percentage=r.progress_percentage,
                contract_value=r.contract_value,
                currency=r.currency,
                target_completion_date=r.target_completion_date,
                created_at=r.created_at,
            )
        )
    return result


@router.post("", response_model=ClientEngagementSummary, status_code=status.HTTP_201_CREATED)
async def create_engagement(
    payload: ClientEngagementCreate,
    membership: Annotated[OrganizationMembership, Depends(require_permission("engagements.create"))],
    db: AsyncSession = Depends(get_db),
) -> ClientEngagementSummary:
    engagement = await EngagementService.create_engagement(db, membership.organization_id, payload)
    return ClientEngagementSummary(
        id=engagement.id,
        engagement_code=engagement.engagement_code,
        title=engagement.title,
        client_id=engagement.client_id,
        current_stage=engagement.current_stage,
        delivery_health=engagement.delivery_health,
        progress_percentage=engagement.progress_percentage,
        contract_value=engagement.contract_value,
        currency=engagement.currency,
        target_completion_date=engagement.target_completion_date,
        created_at=engagement.created_at,
    )


@router.get("/{id}", response_model=ClientEngagementDetail)
async def get_engagement(
    id: uuid.UUID,
    membership: Annotated[OrganizationMembership, Depends(require_permission("engagements.view"))],
    db: AsyncSession = Depends(get_db),
) -> ClientEngagementDetail:
    engagement = await EngagementService.get_engagement_detail(db, membership.organization_id, id)
    if not engagement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engagement not found")

    return ClientEngagementDetail(
        id=engagement.id,
        engagement_code=engagement.engagement_code,
        title=engagement.title,
        description=engagement.description,
        client_id=engagement.client_id,
        client_name=engagement.client.name if engagement.client else None,
        project_id=engagement.project_id,
        current_stage=engagement.current_stage,
        delivery_health=engagement.delivery_health,
        progress_percentage=engagement.progress_percentage,
        contract_value=engagement.contract_value,
        invoiced_amount=engagement.invoiced_amount,
        collected_amount=engagement.collected_amount,
        currency=engagement.currency,
        target_completion_date=engagement.target_completion_date,
        actual_completion_date=engagement.actual_completion_date,
        engagement_lead_id=engagement.engagement_lead_id,
        created_at=engagement.created_at,
        proposals=[ProposalResponse.model_validate(p) for p in engagement.proposals],
        agreements=[AgreementResponse.model_validate(a) for a in engagement.agreements],
        weekly_reports=[WeeklyReportResponse.model_validate(w) for w in engagement.weekly_reports],
        uat_sessions=[UatSessionResponse.model_validate(u) for u in engagement.uat_sessions],
        issues=[IssueResponse.model_validate(i) for i in engagement.issues],
        change_requests=[ChangeRequestResponse.model_validate(c) for c in engagement.change_requests],
        handover=HandoverResponse.model_validate(engagement.handover) if engagement.handover else None,
    )


@router.patch("/{id}", response_model=ClientEngagementDetail)
async def update_engagement(
    id: uuid.UUID,
    payload: ClientEngagementUpdate,
    membership: Annotated[OrganizationMembership, Depends(require_permission("engagements.update"))],
    db: AsyncSession = Depends(get_db),
) -> ClientEngagementDetail:
    engagement = await EngagementService.update_engagement(db, membership.organization_id, id, payload)
    if not engagement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engagement not found")
    return await get_engagement(id, membership, db)


# --- Sub-resource: Proposals ---
@router.post("/{id}/proposals", response_model=ProposalResponse, status_code=status.HTTP_201_CREATED)
async def create_proposal(
    id: uuid.UUID,
    payload: ProposalCreate,
    membership: Annotated[OrganizationMembership, Depends(require_permission("proposals.create"))],
    db: AsyncSession = Depends(get_db),
) -> ProposalResponse:
    proposal = await EngagementService.create_proposal(db, membership.organization_id, id, payload)
    return ProposalResponse.model_validate(proposal)


# --- Sub-resource: Agreements & Signatures ---
@router.post("/{id}/agreements", response_model=AgreementResponse, status_code=status.HTTP_201_CREATED)
async def create_agreement(
    id: uuid.UUID,
    payload: AgreementCreate,
    membership: Annotated[OrganizationMembership, Depends(require_permission("agreements.create"))],
    db: AsyncSession = Depends(get_db),
) -> AgreementResponse:
    agreement = await EngagementService.create_agreement(db, membership.organization_id, id, payload)
    return AgreementResponse.model_validate(agreement)


@router.post("/agreements/{agreement_id}/signatures", response_model=SignatureResponse)
async def sign_agreement(
    agreement_id: uuid.UUID,
    payload: SignatureCreate,
    request: Request,
    membership: Annotated[OrganizationMembership, Depends(require_permission("agreements.sign"))],
    db: AsyncSession = Depends(get_db),
) -> SignatureResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    sig = await EngagementService.add_signature(
        db, membership.organization_id, agreement_id, payload, ip_address=client_ip, user_agent=user_agent
    )
    return SignatureResponse.model_validate(sig)


# --- Kickoff Integration ---
@router.post("/{id}/kickoff")
async def kickoff_project(
    id: uuid.UUID,
    membership: Annotated[OrganizationMembership, Depends(require_permission("engagements.manage"))],
    db: AsyncSession = Depends(get_db),
):
    project = await EngagementService.kickoff_project(db, membership.organization_id, id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engagement not found")
    return {"message": "Project successfully kicked off and linked", "project_id": str(project.id)}


# --- Sub-resource: Weekly Reports ---
@router.post("/{id}/weekly-reports", response_model=WeeklyReportResponse, status_code=status.HTTP_201_CREATED)
async def create_weekly_report(
    id: uuid.UUID,
    payload: WeeklyReportCreate,
    membership: Annotated[OrganizationMembership, Depends(require_permission("engagements.update"))],
    db: AsyncSession = Depends(get_db),
) -> WeeklyReportResponse:
    report = await EngagementService.create_weekly_report(db, membership.organization_id, id, payload)
    return WeeklyReportResponse.model_validate(report)


# --- Sub-resource: UAT ---
@router.post("/{id}/uat-sessions", response_model=UatSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_uat_session(
    id: uuid.UUID,
    payload: UatSessionCreate,
    membership: Annotated[OrganizationMembership, Depends(require_permission("uat.manage"))],
    db: AsyncSession = Depends(get_db),
) -> UatSessionResponse:
    session = await EngagementService.create_uat_session(db, membership.organization_id, id, payload)
    return UatSessionResponse.model_validate(session)


# --- Sub-resource: Issues & Queries ---
@router.post("/{id}/issues", response_model=IssueResponse, status_code=status.HTTP_201_CREATED)
async def report_issue(
    id: uuid.UUID,
    payload: IssueCreate,
    membership: Annotated[OrganizationMembership, Depends(require_permission("engagements.view"))],
    db: AsyncSession = Depends(get_db),
) -> IssueResponse:
    issue = await EngagementService.create_issue(db, membership.organization_id, id, payload)
    return IssueResponse.model_validate(issue)


# --- Sub-resource: Change Requests ---
@router.post("/{id}/change-requests", response_model=ChangeRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_change_request(
    id: uuid.UUID,
    payload: ChangeRequestCreate,
    membership: Annotated[OrganizationMembership, Depends(require_permission("engagements.update"))],
    db: AsyncSession = Depends(get_db),
) -> ChangeRequestResponse:
    cr = await EngagementService.create_change_request(db, membership.organization_id, id, payload)
    return ChangeRequestResponse.model_validate(cr)


# --- Sub-resource: Acceptance & Handover ---
@router.post("/{id}/handover", response_model=HandoverResponse)
async def record_handover(
    id: uuid.UUID,
    payload: HandoverCreateOrUpdate,
    membership: Annotated[OrganizationMembership, Depends(require_permission("engagements.manage"))],
    db: AsyncSession = Depends(get_db),
) -> HandoverResponse:
    handover = await EngagementService.record_handover(db, membership.organization_id, id, payload)
    return HandoverResponse.model_validate(handover)
