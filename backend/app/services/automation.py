"""Automation Service layer for OfficeOS.

Provides secure, tenant-isolated automation workflow management, safe primitive actions
(notifications, audit logging, operational task creation), execution history, and auditability.
No arbitrary code, shell commands, or raw SQL execution allowed.
"""

import inspect
import time
import uuid
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation import Automation, AutomationExecution
from app.models.identity import Profile
from app.models.notification import Notification
from app.models.operation import OperationTask
from app.schemas.automation import (
    AutomationCreate,
    AutomationExecutionResponse,
    AutomationResponse,
    AutomationUpdate,
)
from app.services.audit import AuditLogService


class AutomationService:
    @staticmethod
    async def list_automations(
        session: AsyncSession,
        organization_id: UUID,
    ) -> list[AutomationResponse]:
        stmt = (
            select(Automation)
            .where(Automation.organization_id == organization_id)
            .order_by(Automation.created_at.desc())
        )
        result = await session.scalars(stmt)
        return [AutomationResponse.model_validate(a) for a in result.all()]

    @staticmethod
    async def create_automation(
        session: AsyncSession,
        organization_id: UUID,
        auth_user_id: UUID,
        data: AutomationCreate,
        ip_address: str | None = None,
    ) -> AutomationResponse:
        profile_stmt = select(Profile.id).where(Profile.auth_user_id == auth_user_id)
        profile_id = await session.scalar(profile_stmt)
        if not profile_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")

        automation = Automation(
            id=uuid.uuid4(),
            organization_id=organization_id,
            name=data.name.strip(),
            description=data.description.strip() if data.description else None,
            is_active=data.is_active,
            trigger_type=data.trigger_type,
            trigger_config=data.trigger_config,
            action_type=data.action_type,
            action_config=data.action_config,
            created_by_id=profile_id,
            run_count=0,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(automation)
        await session.flush()

        await AuditLogService.record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=profile_id,
            action="automation.created",
            entity_type="automation",
            entity_id=automation.id,
            details={
                "name": automation.name,
                "trigger_type": automation.trigger_type,
                "action_type": automation.action_type,
            },
            ip_address=ip_address,
        )

        return AutomationResponse.model_validate(automation)

    @staticmethod
    async def get_automation(
        session: AsyncSession,
        organization_id: UUID,
        automation_id: UUID,
    ) -> AutomationResponse:
        stmt = select(Automation).where(
            Automation.id == automation_id,
            Automation.organization_id == organization_id,
        )
        automation = await session.scalar(stmt)
        if not automation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Automation not found")
        return AutomationResponse.model_validate(automation)

    @staticmethod
    async def update_automation(
        session: AsyncSession,
        organization_id: UUID,
        automation_id: UUID,
        auth_user_id: UUID,
        data: AutomationUpdate,
        ip_address: str | None = None,
    ) -> AutomationResponse:
        profile_stmt = select(Profile.id).where(Profile.auth_user_id == auth_user_id)
        profile_id = await session.scalar(profile_stmt)
        if not profile_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")

        stmt = select(Automation).where(
            Automation.id == automation_id,
            Automation.organization_id == organization_id,
        )
        automation = await session.scalar(stmt)
        if not automation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Automation not found")

        changes: dict[str, Any] = {}
        if data.name is not None and data.name != automation.name:
            changes["name"] = {"old": automation.name, "new": data.name}
            automation.name = data.name.strip()

        if data.description is not None and data.description != automation.description:
            changes["description"] = {"old": automation.description, "new": data.description}
            automation.description = data.description.strip() if data.description else None

        if data.is_active is not None and data.is_active != automation.is_active:
            changes["is_active"] = {"old": automation.is_active, "new": data.is_active}
            automation.is_active = data.is_active

        if data.trigger_type is not None and data.trigger_type != automation.trigger_type:
            changes["trigger_type"] = {"old": automation.trigger_type, "new": data.trigger_type}
            automation.trigger_type = data.trigger_type

        if data.trigger_config is not None:
            changes["trigger_config"] = {"old": automation.trigger_config, "new": data.trigger_config}
            automation.trigger_config = data.trigger_config

        if data.action_type is not None and data.action_type != automation.action_type:
            changes["action_type"] = {"old": automation.action_type, "new": data.action_type}
            automation.action_type = data.action_type

        if data.action_config is not None:
            changes["action_config"] = {"old": automation.action_config, "new": data.action_config}
            automation.action_config = data.action_config

        automation.updated_at = datetime.now(UTC)
        await session.flush()

        if changes:
            await AuditLogService.record_audit_log(
                session=session,
                organization_id=organization_id,
                actor_id=profile_id,
                action="automation.updated",
                entity_type="automation",
                entity_id=automation.id,
                details={"changes": changes},
                ip_address=ip_address,
            )

        return AutomationResponse.model_validate(automation)

    @staticmethod
    async def toggle_automation(
        session: AsyncSession,
        organization_id: UUID,
        automation_id: UUID,
        auth_user_id: UUID,
        is_active: bool,
        ip_address: str | None = None,
    ) -> AutomationResponse:
        profile_stmt = select(Profile.id).where(Profile.auth_user_id == auth_user_id)
        profile_id = await session.scalar(profile_stmt)
        if not profile_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")

        stmt = select(Automation).where(
            Automation.id == automation_id,
            Automation.organization_id == organization_id,
        )
        automation = await session.scalar(stmt)
        if not automation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Automation not found")

        automation.is_active = is_active
        automation.updated_at = datetime.now(UTC)
        await session.flush()

        await AuditLogService.record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=profile_id,
            action="automation.toggled",
            entity_type="automation",
            entity_id=automation.id,
            details={"is_active": is_active},
            ip_address=ip_address,
        )

        return AutomationResponse.model_validate(automation)

    @staticmethod
    async def delete_automation(
        session: AsyncSession,
        organization_id: UUID,
        automation_id: UUID,
        auth_user_id: UUID,
        ip_address: str | None = None,
    ) -> None:
        profile_stmt = select(Profile.id).where(Profile.auth_user_id == auth_user_id)
        profile_id = await session.scalar(profile_stmt)
        if not profile_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")

        stmt = select(Automation).where(
            Automation.id == automation_id,
            Automation.organization_id == organization_id,
        )
        automation = await session.scalar(stmt)
        if not automation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Automation not found")

        name = automation.name
        await session.delete(automation)
        await session.flush()

        await AuditLogService.record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=profile_id,
            action="automation.deleted",
            entity_type="automation",
            entity_id=automation_id,
            details={"name": name},
            ip_address=ip_address,
        )

    @staticmethod
    async def execute_automation(
        session: AsyncSession,
        organization_id: UUID,
        automation_id: UUID,
        auth_user_id: UUID | None = None,
        actor_profile_id: UUID | None = None,
        trigger_source: str = "manual",
        input_payload: dict[str, Any] | None = None,
        ip_address: str | None = None,
    ) -> AutomationExecutionResponse:
        start_time = time.perf_counter()
        profile_id: UUID | None = actor_profile_id
        if not profile_id and auth_user_id:
            profile_stmt = select(Profile.id).where(Profile.auth_user_id == auth_user_id)
            profile_id = await session.scalar(profile_stmt)

        stmt = select(Automation).where(
            Automation.id == automation_id,
            Automation.organization_id == organization_id,
        )
        automation = await session.scalar(stmt)
        if not automation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Automation not found")

        if not automation.is_active and trigger_source != "manual":
            # Skipped inactive automation
            duration_ms = int((time.perf_counter() - start_time) * 1000)
            execution = AutomationExecution(
                id=uuid.uuid4(),
                organization_id=organization_id,
                automation_id=automation.id,
                triggered_by_id=profile_id,
                trigger_source=trigger_source,
                status="skipped",
                execution_payload=input_payload or {},
                result_summary="Execution skipped because automation is disabled.",
                duration_ms=duration_ms,
                created_at=datetime.now(UTC),
            )
            session.add(execution)
            await session.flush()
            return AutomationExecutionResponse.model_validate(execution)

        exec_status = "success"
        result_summary = ""
        error_message: str | None = None

        try:
            # Execute safe primitive action
            if automation.action_type == "notification":
                target_recipient = str(automation.action_config.get("target_recipient", "requester")).lower()
                payload_recipient = (input_payload or {}).get("recipient_id")

                if target_recipient == "creator":
                    recipient_raw = automation.created_by_id
                elif target_recipient == "actor":
                    recipient_raw = profile_id or automation.created_by_id
                elif payload_recipient:
                    recipient_raw = payload_recipient
                else:
                    recipient_raw = (
                        automation.action_config.get("recipient_id")
                        or profile_id
                        or automation.created_by_id
                    )

                try:
                    recipient_id = UUID(str(recipient_raw))
                except (ValueError, TypeError):
                    recipient_id = automation.created_by_id

                # Resolve route / URL
                action_url = (
                    automation.action_config.get("route")
                    or automation.action_config.get("action_url")
                    or (input_payload or {}).get("route")
                    or (input_payload or {}).get("action_url")
                )

                # Resolve notification type
                valid_types = {
                    "system", "task", "project", "document", "leave",
                    "attendance", "finance", "maintenance", "training", "general",
                }
                notif_type = automation.action_config.get("notification_type") or (input_payload or {}).get("notification_type")
                if not notif_type or notif_type not in valid_types:
                    if "leave" in automation.name.lower() or "leave" in trigger_source.lower():
                        notif_type = "leave"
                    elif "task" in automation.name.lower():
                        notif_type = "task"
                    elif "attendance" in automation.name.lower():
                        notif_type = "attendance"
                    elif "finance" in automation.name.lower() or "expense" in automation.name.lower():
                        notif_type = "finance"
                    else:
                        notif_type = "system"

                title = automation.action_config.get("title", f"Automation Alert: {automation.name}")
                message = automation.action_config.get(
                    "message", "This is an automated notification triggered by OfficeOS Automation Engine."
                )

                # Replace string templates if present in input_payload
                if input_payload:
                    for k, v in input_payload.items():
                        if isinstance(v, (str, int, float)):
                            placeholder = f"{{{k}}}"
                            title = title.replace(placeholder, str(v))
                            message = message.replace(placeholder, str(v))

                notif = Notification(
                    id=uuid.uuid4(),
                    organization_id=organization_id,
                    recipient_id=recipient_id,
                    notification_type=notif_type,
                    title=title,
                    message=message,
                    action_url=str(action_url) if action_url else None,
                    metadata_json={
                        "automation_id": str(automation.id),
                        **(input_payload or {}),
                    },
                    created_at=datetime.now(UTC),
                    updated_at=datetime.now(UTC),
                )
                session.add(notif)
                result_summary = f"Dispatched in-app notification to member {recipient_id}."

            elif automation.action_type == "audit_log":
                action_name = automation.action_config.get("action", "automation.custom_event")
                await AuditLogService.record_audit_log(
                    session=session,
                    organization_id=organization_id,
                    actor_id=profile_id or automation.created_by_id,
                    action=action_name,
                    entity_type="automation_event",
                    entity_id=automation.id,
                    details={
                        "automation_name": automation.name,
                        "payload": input_payload or {},
                    },
                    ip_address=ip_address,
                )
                result_summary = f"Recorded immutable audit log event: {action_name}."

            elif automation.action_type == "task_create":
                task_title = automation.action_config.get("title", f"Automated Task: {automation.name}")
                task_desc = automation.action_config.get("description", "Created by OfficeOS Automation workflow.")
                priority = automation.action_config.get("priority", "medium")

                if input_payload:
                    for k, v in input_payload.items():
                        if isinstance(v, (str, int, float)):
                            placeholder = f"{{{k}}}"
                            task_title = task_title.replace(placeholder, str(v))
                            task_desc = task_desc.replace(placeholder, str(v))

                task = OperationTask(
                    id=uuid.uuid4(),
                    organization_id=organization_id,
                    title=task_title,
                    description=task_desc,
                    priority=priority,
                    status="pending",
                    created_by_id=profile_id or automation.created_by_id,
                    created_at=datetime.now(UTC),
                    updated_at=datetime.now(UTC),
                )
                session.add(task)
                result_summary = f"Created operational task '{task_title}' (id: {task.id})."

            else:
                exec_status = "failed"
                error_message = f"Unsupported action type: {automation.action_type}"

        except Exception as exc:  # noqa: BLE001
            exec_status = "failed"
            error_message = str(exc)

        duration_ms = max(int((time.perf_counter() - start_time) * 1000), 1)

        # Record execution history
        execution = AutomationExecution(
            id=uuid.uuid4(),
            organization_id=organization_id,
            automation_id=automation.id,
            triggered_by_id=profile_id,
            trigger_source=trigger_source,
            status=exec_status,
            execution_payload=input_payload or {},
            result_summary=result_summary if exec_status == "success" else None,
            error_message=error_message,
            duration_ms=duration_ms,
            created_at=datetime.now(UTC),
        )
        session.add(execution)

        # Update automation stats
        automation.last_run_at = datetime.now(UTC)
        automation.last_run_status = exec_status
        automation.run_count += 1
        automation.updated_at = datetime.now(UTC)
        await session.flush()

        # Audit execution event
        await AuditLogService.record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=profile_id or automation.created_by_id,
            action="automation.executed",
            entity_type="automation",
            entity_id=automation.id,
            details={
                "status": exec_status,
                "duration_ms": duration_ms,
                "trigger_source": trigger_source,
            },
            ip_address=ip_address,
        )

        return AutomationExecutionResponse.model_validate(execution)

    @staticmethod
    async def dispatch_event(
        session: AsyncSession,
        organization_id: UUID,
        event_name: str,
        payload: dict[str, Any] | None = None,
        actor_profile_id: UUID | None = None,
        ip_address: str | None = None,
    ) -> list[AutomationExecutionResponse]:
        """Dispatches an event across active tenant automations matching the event route/name."""
        stmt = (
            select(Automation)
            .where(
                Automation.organization_id == organization_id,
                Automation.is_active == True,  # noqa: E712
                Automation.trigger_type == "event",
            )
        )
        candidates_result = await session.scalars(stmt)
        candidates: list[Any] = []
        if candidates_result:
            if hasattr(candidates_result, "all"):
                raw_candidates = candidates_result.all()
                if inspect.isawaitable(raw_candidates):
                    raw_candidates = await raw_candidates
                candidates = list(raw_candidates) if raw_candidates else []
            elif isinstance(candidates_result, (list, tuple)):
                candidates = list(candidates_result)

        executions: list[AutomationExecutionResponse] = []
        normalized_event = event_name.strip().lower()

        for auto in candidates:
            cfg = auto.trigger_config or {}
            cfg_event = str(cfg.get("event_name") or cfg.get("event_route") or "").strip().lower()

            # Determine whether this automation matches the event
            is_match = False
            if cfg_event == normalized_event:
                is_match = True
            elif normalized_event == "leave.approved" and (
                cfg_event in ["leave.approved", "leave_request.approve", "leave_request.approved", "leave.accepted", "leave_approval"]
                # Also match existing rules named like "Notify on Leave Approval" created with default/custom trigger
                or (cfg_event in ["", "custom.trigger"] and "leave" in auto.name.lower() and any(k in auto.name.lower() for k in ["approv", "accept"]))
            ):
                is_match = True
            elif normalized_event == "leave.rejected" and (
                cfg_event in ["leave.rejected", "leave_request.reject"]
                or (cfg_event in ["", "custom.trigger"] and "leave" in auto.name.lower() and "reject" in auto.name.lower())
            ):
                is_match = True
            elif normalized_event == "leave.requested" and (
                cfg_event in ["leave.requested", "leave_request.create", "leave.created"]
                or (cfg_event in ["", "custom.trigger"] and "leave" in auto.name.lower() and any(k in auto.name.lower() for k in ["request", "submit", "apply"]))
            ):
                is_match = True

            if is_match:
                res = await AutomationService.execute_automation(
                    session=session,
                    organization_id=organization_id,
                    automation_id=auto.id,
                    auth_user_id=None,
                    actor_profile_id=actor_profile_id,
                    trigger_source=f"event:{normalized_event}",
                    input_payload=payload or {},
                    ip_address=ip_address,
                )
                executions.append(res)

        return executions

    @staticmethod
    async def list_executions(
        session: AsyncSession,
        organization_id: UUID,
        automation_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[AutomationExecutionResponse]:
        stmt = (
            select(AutomationExecution)
            .where(
                AutomationExecution.organization_id == organization_id,
                AutomationExecution.automation_id == automation_id,
            )
            .order_by(AutomationExecution.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await session.scalars(stmt)
        return [AutomationExecutionResponse.model_validate(e) for e in result.all()]

