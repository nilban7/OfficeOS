import logging
import uuid
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import session_factory, set_transaction_context
from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import require_permission

logger = logging.getLogger("officeos.engagements")
from app.schemas.engagement import (
    AgreementCreate,
    AgreementResponse,
    ChangeRequestCreate,
    ChangeRequestResponse,
    ChatMessageCreate,
    ChatMessageResponse,
    ChatParticipantsResponse,
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
    WsTicketResponse,
)
from app.services.chat_ws import chat_connection_manager, chat_ticket_store
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

# --- Sub-resource: Chat & Discussion Between Project Members and Client ---
@router.get("/{id}/messages", response_model=list[ChatMessageResponse])
async def list_chat_messages(
    id: uuid.UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("engagements.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    channel: Annotated[str | None, Query()] = None,
    visibility: Annotated[str | None, Query()] = None,
    conversation: Annotated[str | None, Query()] = "client",
) -> list[ChatMessageResponse]:
    org_id = uuid.UUID(organization_header)
    await EngagementService.verify_engagement_participant(session, org_id, id, current_user.id)
    _, _, _, _, is_internal = await EngagementService.resolve_sender_identity(session, org_id, current_user.id)
    msgs = await EngagementService.list_chat_messages(
        session,
        org_id,
        id,
        channel=channel,
        is_internal=is_internal,
        visibility_filter=visibility,
        conversation=conversation,
    )
    return [ChatMessageResponse.model_validate(m) for m in msgs]


@router.post("/{id}/messages", response_model=ChatMessageResponse, status_code=status.HTTP_201_CREATED)
async def create_chat_message(
    id: uuid.UUID,
    payload: ChatMessageCreate,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("engagements.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ChatMessageResponse:
    org_id = uuid.UUID(organization_header)
    await EngagementService.verify_engagement_participant(session, org_id, id, current_user.id)
    msg = await EngagementService.create_chat_message(
        session,
        org_id,
        id,
        payload,
        current_user_id=current_user.id,
    )
    logger.info("Chat message %s saved via REST for engagement %s by %s", msg.get("id"), id, current_user.id)
    target_conv = msg.get("visibility", "client")
    # Broadcast to connected WebSocket participants in the specific conversation room
    delivered_count = await chat_connection_manager.broadcast_message(
        id,
        msg,
        conversation=target_conv,
    )
    logger.info(
        "REST chat message %s broadcast to %d active WebSocket clients in room %s [%s]",
        msg.get("id"),
        delivered_count,
        id,
        target_conv,
    )
    return ChatMessageResponse.model_validate(msg)


@router.get("/{id}/chat-participants", response_model=ChatParticipantsResponse)
async def get_chat_participants(
    id: uuid.UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("engagements.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
) -> ChatParticipantsResponse:
    org_id = uuid.UUID(organization_header)
    await EngagementService.verify_engagement_participant(session, org_id, id, current_user.id)
    return await EngagementService.get_chat_participants(session, org_id, id)


@router.post("/{id}/ws-ticket", response_model=WsTicketResponse)
async def create_ws_ticket(
    id: uuid.UUID,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(require_permission("engagements.view"))],
    organization_header: Annotated[str, Header(alias="X-Organization-Id")],
    conversation: Annotated[str, Query()] = "client",
) -> WsTicketResponse:
    org_id = uuid.UUID(organization_header)
    await EngagementService.verify_engagement_participant(session, org_id, id, current_user.id)
    profile_id, _, user_name, user_role, is_internal = await EngagementService.resolve_sender_identity(
        session, org_id, current_user.id
    )

    norm_conv = "internal" if conversation == "internal" else "client"
    if norm_conv == "internal" and not is_internal:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Client contacts cannot connect to internal team chat",
        )

    ticket = await chat_ticket_store.issue_ticket(
        user_id=current_user.id,
        org_id=org_id,
        engagement_id=id,
        profile_id=profile_id,
        user_name=user_name,
        user_role=user_role,
        is_internal=is_internal,
        conversation=norm_conv,
        ttl_seconds=60,
    )
    return WsTicketResponse(ticket=ticket, expires_in=60, engagement_id=id, conversation=norm_conv)


@router.websocket("/{id}/ws")
async def engagement_chat_websocket(
    websocket: WebSocket,
    id: uuid.UUID,
    ticket: Annotated[str | None, Query()] = None,
    conversation: Annotated[str | None, Query()] = None,
):
    effective_ticket = ticket or websocket.query_params.get("ticket")
    if not effective_ticket:
        logger.warning("WebSocket rejected: No ticket provided for engagement %s", id)
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    chat_ticket = await chat_ticket_store.redeem_ticket(effective_ticket, id)
    if not chat_ticket:
        logger.warning("WebSocket rejected: Invalid or expired ticket for engagement %s", id)
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    req_conv = conversation or websocket.query_params.get("conversation")
    effective_conv = "internal" if (req_conv or chat_ticket.conversation) == "internal" else "client"

    if effective_conv == "internal" and not chat_ticket.is_internal:
        logger.warning(
            "WebSocket rejected: Non-internal user %s attempted connection to internal room %s",
            chat_ticket.user_name,
            id,
        )
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await chat_connection_manager.connect(id, websocket, chat_ticket, conversation=effective_conv)
    logger.info(
        "WebSocket client connected to engagement %s [%s] (user: %s, role: %s, internal: %s)",
        id,
        effective_conv,
        chat_ticket.user_name,
        chat_ticket.user_role,
        chat_ticket.is_internal,
    )

    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("type")

            if event_type == "ping":
                await chat_connection_manager.send_pong(websocket)
                continue

            if event_type == "chat_message":
                raw_payload = data.get("payload", {})
                try:
                    payload = ChatMessageCreate(**raw_payload)
                    payload.conversation = effective_conv
                    payload.visibility = effective_conv
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Invalid chat_message payload received over WebSocket for engagement %s: %s", id, exc)
                    await websocket.send_json({"type": "error", "message": f"Invalid payload: {exc}"})
                    continue

                # Short-lived database session per message event (prevents long-lived open transactions)
                async with session_factory() as session:
                    try:
                        await set_transaction_context(session, chat_ticket.user_id, str(chat_ticket.org_id))
                        msg = await EngagementService.create_chat_message(
                            session,
                            chat_ticket.org_id,
                            id,
                            payload,
                            current_user_id=chat_ticket.user_id,
                        )
                    except Exception as exc:
                        await session.rollback()
                        logger.exception("Failed to persist message via WebSocket for engagement %s", id)
                        await websocket.send_json({"type": "error", "message": f"Failed to save message: {exc}"})
                        continue

                logger.info(
                    "Message %s persisted via WebSocket for engagement %s by %s [%s]",
                    msg.get("id"),
                    id,
                    chat_ticket.user_id,
                    effective_conv,
                )

                # Broadcast to authorized participants in this specific conversation room
                delivered_count = await chat_connection_manager.broadcast_message(
                    id,
                    msg,
                    conversation=effective_conv,
                )
                logger.info(
                    "WebSocket message %s broadcast to %d participants in room %s [%s]",
                    msg.get("id"),
                    delivered_count,
                    id,
                    effective_conv,
                )

    except WebSocketDisconnect as ws_disc:
        logger.info(
            "WebSocket disconnected from engagement %s [%s] for user %s (code: %s)",
            id,
            effective_conv,
            chat_ticket.user_name,
            getattr(ws_disc, "code", None),
        )
        await chat_connection_manager.disconnect(id, websocket, conversation=effective_conv)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "WebSocket unexpected error in engagement %s [%s] for user %s: %s",
            id,
            effective_conv,
            chat_ticket.user_name,
            exc,
        )
        await chat_connection_manager.disconnect(id, websocket, conversation=effective_conv)

