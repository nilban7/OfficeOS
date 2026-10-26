import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.tenant import require_permission
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
    session: Annotated[AsyncSession, Depends(require_permission("engagements.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> EngagementOverview:
    org_id = uuid.UUID(organization_header)
    return await EngagementService.get_overview(session, org_id)


@router.get("", response_model=list[ClientEngagementSummary])
async def list_engagements(
    session: Annotated[AsyncSession, Depends(require_permission("engagements.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    stage: Annotated[str | None, Query()] = None,
    health: Annotated[str | None, Query()] = None,
    search: Annotated[str | None, Query()] = None,
    project_id: Annotated[uuid.UUID | None, Query()] = None,
) -> list[ClientEngagementSummary]:
    org_id = uuid.UUID(organization_header)
    records = await EngagementService.list_engagements(
        session, org_id, stage=stage, health=health, search=search, project_id=project_id
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
    session: Annotated[AsyncSession, Depends(require_permission("engagements.create"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ClientEngagementSummary:
    org_id = uuid.UUID(organization_header)
    engagement = await EngagementService.create_engagement(session, org_id, payload)
    return ClientEngagementSummary(
        id=engagement.id,
        engagement_code=engagement.engagement_code,
        title=engagement.title,
        client_id=engagement.client_id,
        project_id=engagement.project_id,
        current_stage=engagement.current_stage,
        delivery_health=engagement.delivery_health,
        progress_percentage=engagement.progress_percentage,
        contract_value=engagement.contract_value,
        currency=engagement.currency,
        target_completion_date=engagement.target_completion_date,
        created_at=engagement.created_at,
    )


# --- Agreement Signatures ---
@router.post("/agreements/{agreement_id}/signatures", response_model=SignatureResponse)
async def sign_agreement(
    agreement_id: uuid.UUID,
    payload: SignatureCreate,
    request: Request,
    session: Annotated[AsyncSession, Depends(require_permission("agreements.sign"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> SignatureResponse:
    org_id = uuid.UUID(organization_header)
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    sig = await EngagementService.add_signature(
        session, org_id, agreement_id, payload, ip_address=client_ip, user_agent=user_agent
    )
    return SignatureResponse.model_validate(sig)


@router.get("/{id}", response_model=ClientEngagementDetail)
async def get_engagement(
    id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(require_permission("engagements.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ClientEngagementDetail:
    org_id = uuid.UUID(organization_header)
    engagement = await EngagementService.get_engagement_detail(session, org_id, id)
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
    session: Annotated[AsyncSession, Depends(require_permission("engagements.update"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ClientEngagementDetail:
    org_id = uuid.UUID(organization_header)
    engagement = await EngagementService.update_engagement(session, org_id, id, payload)
    if not engagement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engagement not found")
    return await get_engagement(id, session, organization_header)


# --- Sub-resource: Proposals ---
@router.post("/{id}/proposals", response_model=ProposalResponse, status_code=status.HTTP_201_CREATED)
async def create_proposal(
    id: uuid.UUID,
    payload: ProposalCreate,
    session: Annotated[AsyncSession, Depends(require_permission("proposals.create"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ProposalResponse:
    org_id = uuid.UUID(organization_header)
    proposal = await EngagementService.create_proposal(session, org_id, id, payload)
    return ProposalResponse.model_validate(proposal)


# --- Sub-resource: Agreements & Signatures ---
@router.post("/{id}/agreements", response_model=AgreementResponse, status_code=status.HTTP_201_CREATED)
async def create_agreement(
    id: uuid.UUID,
    payload: AgreementCreate,
    session: Annotated[AsyncSession, Depends(require_permission("agreements.create"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> AgreementResponse:
    org_id = uuid.UUID(organization_header)
    agreement = await EngagementService.create_agreement(session, org_id, id, payload)
    return AgreementResponse.model_validate(agreement)


@router.delete("/{id}/agreements/{agreement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agreement(
    id: uuid.UUID,
    agreement_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(require_permission("agreements.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> None:
    org_id = uuid.UUID(organization_header)
    deleted = await EngagementService.delete_agreement(session, org_id, id, agreement_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agreement not found")


# --- Kickoff Integration ---
@router.post("/{id}/kickoff")
async def kickoff_project(
    id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(require_permission("engagements.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
):
    org_id = uuid.UUID(organization_header)
    project = await EngagementService.kickoff_project(session, org_id, id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engagement not found")
    return {"message": "Project successfully kicked off and linked", "project_id": str(project.id)}


# --- Sub-resource: Weekly Reports ---
@router.post("/{id}/weekly-reports", response_model=WeeklyReportResponse, status_code=status.HTTP_201_CREATED)
async def create_weekly_report(
    id: uuid.UUID,
    payload: WeeklyReportCreate,
    session: Annotated[AsyncSession, Depends(require_permission("engagements.update"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> WeeklyReportResponse:
    org_id = uuid.UUID(organization_header)
    report = await EngagementService.create_weekly_report(session, org_id, id, payload)
    return WeeklyReportResponse.model_validate(report)


# --- Sub-resource: UAT ---
@router.post("/{id}/uat-sessions", response_model=UatSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_uat_session(
    id: uuid.UUID,
    payload: UatSessionCreate,
    session: Annotated[AsyncSession, Depends(require_permission("uat.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> UatSessionResponse:
    org_id = uuid.UUID(organization_header)
    s = await EngagementService.create_uat_session(session, org_id, id, payload)
    return UatSessionResponse.model_validate(s)


# --- Sub-resource: Issues & Queries ---
@router.post("/{id}/issues", response_model=IssueResponse, status_code=status.HTTP_201_CREATED)
async def report_issue(
    id: uuid.UUID,
    payload: IssueCreate,
    session: Annotated[AsyncSession, Depends(require_permission("engagements.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> IssueResponse:
    org_id = uuid.UUID(organization_header)
    issue = await EngagementService.create_issue(session, org_id, id, payload)
    return IssueResponse.model_validate(issue)


# --- Sub-resource: Change Requests ---
@router.post("/{id}/change-requests", response_model=ChangeRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_change_request(
    id: uuid.UUID,
    payload: ChangeRequestCreate,
    session: Annotated[AsyncSession, Depends(require_permission("engagements.update"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ChangeRequestResponse:
    org_id = uuid.UUID(organization_header)
    cr = await EngagementService.create_change_request(session, org_id, id, payload)
    return ChangeRequestResponse.model_validate(cr)


# --- Sub-resource: Acceptance & Handover ---
@router.post("/{id}/handover", response_model=HandoverResponse)
async def record_handover(
    id: uuid.UUID,
    payload: HandoverCreateOrUpdate,
    session: Annotated[AsyncSession, Depends(require_permission("engagements.manage"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> HandoverResponse:
    org_id = uuid.UUID(organization_header)
    handover = await EngagementService.record_handover(session, org_id, id, payload)
    return HandoverResponse.model_validate(handover)
