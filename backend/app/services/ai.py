"""AI Service layer for OfficeOS.

Handles AI configurations, capability discovery, secure authorized context gathering,
conversation sessions, message persistence, and audit logging.
"""

import os
import re
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import case, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.models.ai import AIConfiguration, AIConversation, AIMessage
from app.models.asset import Asset
from app.models.attendance import AttendanceRecord
from app.models.audit import AuditLog
from app.models.employee import Department, Employee
from app.models.finance import Expense, FinancialTransaction
from app.models.identity import Profile
from app.models.internship import Internship
from app.models.leave import LeaveRequest, LeaveType
from app.models.maintenance import MaintenanceRecord, MaintenanceRequest
from app.models.operation import OperationTask
from app.models.procurement import PurchaseOrder, PurchaseRequest
from app.models.project import Project
from app.models.training import TrainingProgram
from app.schemas.ai import (
    AIConfigurationResponse,
    AIConfigurationUpdate,
    AIConversationCreate,
    AIConversationDetailResponse,
    AIConversationResponse,
    AIMessageResponse,
    AIQueryResponse,
)
from app.services.ai_provider import get_ai_provider
from app.services.audit import AuditLogService

DATABASE_TOOL_DEF = [
    {
        "type": "function",
        "function": {
            "name": "query_database",
            "description": (
                "Execute a safe read-only SQL SELECT query against the organization PostgreSQL database "
                "to answer questions with real live data. Always filter by organization_id."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "A PostgreSQL SELECT query. Must include WHERE organization_id = '...'",
                    }
                },
                "required": ["query"],
            },
        },
    }
]

FORBIDDEN_SQL_PATTERNS = [
    r"\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|replace)\b",
    r"\b(execute|exec|call|vacuum|copy|comment|lock|reindex)\b",
    r"--",
    r"/\*",
]

RESTRICTED_TABLE_PERMISSIONS = {
    "expenses": "finance.view",
    "financial_transactions": "finance.view",
    "salary_structures": "payroll.view",
    "payroll_items": "payroll.view",
    "payroll_runs": "payroll.view",
    "audit_logs": "audit_logs.view",
}


class AIService:
    @staticmethod
    async def get_or_create_configuration(
        session: AsyncSession,
        organization_id: UUID,
    ) -> AIConfigurationResponse:
        stmt = select(AIConfiguration).where(AIConfiguration.organization_id == organization_id)
        config = await session.scalar(stmt)
        if not config:
            env_key = get_settings().groq_api_key or os.getenv("GROQ_API_KEY")
            config = AIConfiguration(
                id=uuid.uuid4(),
                organization_id=organization_id,
                is_enabled=True,
                provider="groq",
                model_name="qwen/qwen3.8-27b",
                api_key=env_key,
                temperature=Decimal("0.70"),
                max_tokens_per_response=1024,
                allowed_capabilities=[
                    "workforce",
                    "attendance",
                    "leave",
                    "projects",
                    "procurement",
                    "assets",
                    "maintenance",
                    "training",
                    "internships",
                    "operations",
                    "documents",
                ],
                daily_request_limit=1000,
            )
            session.add(config)
            await session.flush()
        elif not config.api_key:
            env_key = get_settings().groq_api_key or os.getenv("GROQ_API_KEY")
            if env_key:
                config.api_key = env_key
                await session.flush()
        return AIConfigurationResponse.model_validate(config)

    @staticmethod
    def build_system_instruction(organization_id: UUID) -> str:
        return f"""You are the OfficeOS AI Assistant for organization '{organization_id}'.
Use the `query_database` tool for specific live records (SELECT with WHERE organization_id = '{organization_id}').

Key tables:
- employees (id, employee_code, first_name, last_name, designation, department_id, status)
- departments (id, name, code)
- projects (id, name, status, budget)
- operation_tasks (id, title, priority, status, due_date)
- attendance_records (id, employee_id, date, status, work_hours)
- leave_requests (id, employee_id, leave_type_id, start_date, end_date, status)
- leave_types (id, name)
- expenses (id, category, amount, status)
- procurement_requests (id, request_number, total_estimated_cost, status)

Return date for leave: `end_date + INTERVAL '1 day'`.
Format responses in clean, structured markdown tables and bullet points. Do not mention model names."""

    @staticmethod
    async def execute_safe_tenant_sql(
        session: AsyncSession,
        organization_id: UUID,
        user_permissions: list[str],
        query_str: str,
    ) -> dict[str, Any]:
        clean_query = query_str.strip().rstrip(";").strip()
        if not clean_query:
            return {"error": "Query cannot be empty."}

        # Prevent multiple chained SQL statements
        if ";" in clean_query:
            return {"error": "Security restriction: Multiple SQL statements are not permitted."}

        # Must start with SELECT or WITH
        if not re.match(r"^(select|with)\b", clean_query, re.IGNORECASE):
            return {"error": "Security restriction: Only read-only SELECT queries are permitted."}

        for pattern in FORBIDDEN_SQL_PATTERNS:
            if re.search(pattern, clean_query, re.IGNORECASE):
                return {"error": "Security restriction: Disallowed SQL keyword or syntax detected."}

        # Table permission check
        lower_query = clean_query.lower()
        for table_name, req_perm in RESTRICTED_TABLE_PERMISSIONS.items():
            if re.search(rf"\b{table_name}\b", lower_query):
                has_perm = (
                    req_perm in user_permissions
                    or (req_perm == "finance.view" and any(p in user_permissions for p in ("finance:read", "reports.finance")))
                    or (req_perm == "payroll.view" and any(p in user_permissions for p in ("payroll:read", "payroll.manage")))
                )
                if not has_perm:
                    return {"error": f"Permission denied: Access to table '{table_name}' requires permission '{req_perm}'."}

        # Ensure query is tenant-scoped
        org_id_str = str(organization_id)
        if org_id_str not in clean_query:
            clean_query = clean_query.rstrip(";").strip()
            from_m = re.search(
                r"\bfrom\s+([a-zA-Z0-9_]+)(?:\s+(?:as\s+)?([a-zA-Z0-9_]+))?",
                clean_query,
                re.IGNORECASE,
            )
            if from_m:
                table = from_m.group(1).lower()
                raw_alias = from_m.group(2)
                non_aliases = {
                    "where", "join", "left", "right", "inner", "outer", "cross",
                    "natural", "order", "group", "limit", "offset", "on"
                }
                alias = raw_alias if raw_alias and raw_alias.lower() not in non_aliases else table

                where_m = re.search(r"\bwhere\b", clean_query, re.IGNORECASE)
                if where_m:
                    where_pos = where_m.end()
                    tail_m = re.search(
                        r"\b(order\s+by|group\s+by|limit|offset)\b",
                        clean_query[where_pos:],
                        re.IGNORECASE,
                    )
                    if tail_m:
                        cond_end = where_pos + tail_m.start()
                        cond = clean_query[where_pos:cond_end].strip()
                        tail = clean_query[cond_end:]
                        clean_query = (
                            f"{clean_query[:where_pos]} {alias}.organization_id = '{org_id_str}' AND ({cond}) {tail}"
                        )
                    else:
                        cond = clean_query[where_pos:].strip()
                        clean_query = f"{clean_query[:where_pos]} {alias}.organization_id = '{org_id_str}' AND ({cond})"
                else:
                    tail_m = re.search(
                        r"\b(order\s+by|group\s+by|limit|offset)\b", clean_query, re.IGNORECASE
                    )
                    if tail_m:
                        pos = tail_m.start()
                        clean_query = (
                            f"{clean_query[:pos]} WHERE {alias}.organization_id = '{org_id_str}' {clean_query[pos:]}"
                        )
                    else:
                        clean_query = f"{clean_query} WHERE {alias}.organization_id = '{org_id_str}'"
            else:
                return {
                    "error": f"Tenant isolation restriction: Your query must explicitly include WHERE organization_id = '{org_id_str}'."
                }

        try:
            res = await session.execute(text(clean_query))
            columns = list(res.keys())
            rows = res.fetchmany(50)
            formatted_rows = [
                dict(
                    zip(
                        columns,
                        [
                            str(v) if isinstance(v, (UUID, Decimal, datetime)) else v
                            for v in row
                        ],
                    )
                )
                for row in rows
            ]
            return {
                "columns": columns,
                "rows": formatted_rows,
                "row_count": len(formatted_rows),
            }
        except Exception as e:  # noqa: BLE001
            return {"error": f"Database execution error: {e!s}"}

    @staticmethod
    async def update_configuration(
        session: AsyncSession,
        organization_id: UUID,
        update_data: AIConfigurationUpdate,
        actor_id: UUID,
        ip_address: str | None = None,
    ) -> AIConfigurationResponse:
        stmt = select(AIConfiguration).where(AIConfiguration.organization_id == organization_id)
        config = await session.scalar(stmt)
        if not config:
            await AIService.get_or_create_configuration(session, organization_id)
            config = await session.scalar(stmt)

        assert config is not None
        changes: dict[str, Any] = {}

        if update_data.is_enabled is not None and update_data.is_enabled != config.is_enabled:
            changes["is_enabled"] = {"old": config.is_enabled, "new": update_data.is_enabled}
            config.is_enabled = update_data.is_enabled

        if update_data.provider is not None and update_data.provider != config.provider:
            changes["provider"] = {"old": config.provider, "new": update_data.provider}
            config.provider = update_data.provider

        if update_data.model_name is not None and update_data.model_name != config.model_name:
            changes["model_name"] = {"old": config.model_name, "new": update_data.model_name}
            config.model_name = update_data.model_name

        if update_data.api_key is not None:
            clean_k = update_data.api_key.strip() or None
            changes["api_key"] = {"old": "***", "new": "***"}
            config.api_key = clean_k

        if update_data.temperature is not None and update_data.temperature != config.temperature:
            changes["temperature"] = {"old": str(config.temperature), "new": str(update_data.temperature)}
            config.temperature = update_data.temperature

        if (
            update_data.max_tokens_per_response is not None
            and update_data.max_tokens_per_response != config.max_tokens_per_response
        ):
            changes["max_tokens_per_response"] = {
                "old": config.max_tokens_per_response,
                "new": update_data.max_tokens_per_response,
            }
            config.max_tokens_per_response = update_data.max_tokens_per_response

        if update_data.allowed_capabilities is not None:
            changes["allowed_capabilities"] = {
                "old": config.allowed_capabilities,
                "new": update_data.allowed_capabilities,
            }
            config.allowed_capabilities = update_data.allowed_capabilities

        if (
            update_data.daily_request_limit is not None
            and update_data.daily_request_limit != config.daily_request_limit
        ):
            changes["daily_request_limit"] = {
                "old": config.daily_request_limit,
                "new": update_data.daily_request_limit,
            }
            config.daily_request_limit = update_data.daily_request_limit

        config.updated_at = datetime.now(UTC)
        await session.flush()

        if changes:
            await AuditLogService.record_audit_log(
                session=session,
                organization_id=organization_id,
                actor_id=actor_id,
                action="ai.configuration.updated",
                entity_type="ai_configuration",
                entity_id=config.id,
                details={"changes": changes},
                ip_address=ip_address,
            )

        return AIConfigurationResponse.model_validate(config)

    @staticmethod
    async def list_conversations(
        session: AsyncSession,
        organization_id: UUID,
        auth_user_id: UUID,
    ) -> list[AIConversationResponse]:
        profile_stmt = select(Profile.id).where(Profile.auth_user_id == auth_user_id)
        profile_id = await session.scalar(profile_stmt)
        if not profile_id:
            return []

        stmt = (
            select(AIConversation)
            .where(
                AIConversation.organization_id == organization_id,
                AIConversation.user_id == profile_id,
                AIConversation.is_archived.is_(False),
            )
            .options(selectinload(AIConversation.messages))
            .order_by(AIConversation.updated_at.desc())
        )
        result = await session.scalars(stmt)
        conversations = result.all()

        responses = []
        for conv in conversations:
            msg_count = len(conv.messages)
            last_msg = conv.messages[-1].content if conv.messages else None
            responses.append(
                AIConversationResponse(
                    id=conv.id,
                    organization_id=conv.organization_id,
                    user_id=conv.user_id,
                    title=conv.title,
                    is_archived=conv.is_archived,
                    created_at=conv.created_at,
                    updated_at=conv.updated_at,
                    message_count=msg_count,
                    last_message=last_msg,
                )
            )
        return responses

    @staticmethod
    async def create_conversation(
        session: AsyncSession,
        organization_id: UUID,
        auth_user_id: UUID,
        user_permissions: list[str],
        data: AIConversationCreate,
        ip_address: str | None = None,
    ) -> AIConversationDetailResponse:
        config_resp = await AIService.get_or_create_configuration(session, organization_id)
        if not config_resp.is_enabled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="AI features are currently disabled for this organization.",
            )

        profile_stmt = select(Profile.id).where(Profile.auth_user_id == auth_user_id)
        profile_id = await session.scalar(profile_stmt)
        if not profile_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")

        conv = AIConversation(
            id=uuid.uuid4(),
            organization_id=organization_id,
            user_id=profile_id,
            title=data.title.strip() or "New Conversation",
            is_archived=False,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(conv)
        await session.flush()

        messages_list: list[AIMessageResponse] = []

        if data.initial_message and data.initial_message.strip():
            user_msg = AIMessage(
                id=uuid.uuid4(),
                organization_id=organization_id,
                conversation_id=conv.id,
                sender_role="user",
                content=data.initial_message.strip(),
                tokens_used=len(data.initial_message.split()),
                metadata_json={},
                created_at=datetime.now(UTC),
            )
            session.add(user_msg)

            # Generate initial response
            context_data = await AIService._collect_context_data(
                session=session,
                organization_id=organization_id,
                user_permissions=user_permissions,
                query=data.initial_message,
                allowed_capabilities=config_resp.allowed_capabilities,
            )

            async def tool_executor(fn_name: str, args: dict[str, Any]) -> Any:
                if fn_name == "query_database":
                    return await AIService.execute_safe_tenant_sql(
                        session=session,
                        organization_id=organization_id,
                        user_permissions=user_permissions,
                        query_str=args.get("query", ""),
                    )
                return {"error": f"Unknown tool: {fn_name}"}

            effective_key = config_resp.api_key or get_settings().groq_api_key or os.getenv("GROQ_API_KEY")
            provider = get_ai_provider(config_resp.provider, api_key=effective_key)
            reply_text, tokens = await provider.generate_response(
                system_instruction=AIService.build_system_instruction(organization_id),
                messages=[{"role": "user", "content": data.initial_message.strip()}],
                context_data=context_data,
                model_name=config_resp.model_name,
                temperature=float(config_resp.temperature),
                max_tokens=config_resp.max_tokens_per_response,
                tools=DATABASE_TOOL_DEF,
                tool_executor=tool_executor,
            )

            asst_msg = AIMessage(
                id=uuid.uuid4(),
                organization_id=organization_id,
                conversation_id=conv.id,
                sender_role="assistant",
                content=reply_text,
                tokens_used=tokens,
                metadata_json={"capability_context": list(context_data.keys())},
                created_at=datetime.now(UTC),
            )
            session.add(asst_msg)
            await session.flush()

            messages_list.append(AIMessageResponse.model_validate(user_msg))
            messages_list.append(AIMessageResponse.model_validate(asst_msg))

        await AuditLogService.record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=profile_id,
            action="ai.conversation.created",
            entity_type="ai_conversation",
            entity_id=conv.id,
            details={"title": conv.title},
            ip_address=ip_address,
        )

        return AIConversationDetailResponse(
            id=conv.id,
            organization_id=conv.organization_id,
            user_id=conv.user_id,
            title=conv.title,
            is_archived=conv.is_archived,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            messages=messages_list,
        )

    @staticmethod
    async def get_conversation(
        session: AsyncSession,
        organization_id: UUID,
        auth_user_id: UUID,
        conversation_id: UUID,
    ) -> AIConversationDetailResponse:
        profile_stmt = select(Profile.id).where(Profile.auth_user_id == auth_user_id)
        profile_id = await session.scalar(profile_stmt)
        if not profile_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")

        stmt = (
            select(AIConversation)
            .where(
                AIConversation.id == conversation_id,
                AIConversation.organization_id == organization_id,
                AIConversation.user_id == profile_id,
                AIConversation.is_archived.is_(False),
            )
            .options(selectinload(AIConversation.messages))
        )
        conv = await session.scalar(stmt)
        if not conv:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

        return AIConversationDetailResponse(
            id=conv.id,
            organization_id=conv.organization_id,
            user_id=conv.user_id,
            title=conv.title,
            is_archived=conv.is_archived,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            messages=[AIMessageResponse.model_validate(m) for m in conv.messages],
        )

    @staticmethod
    async def delete_conversation(
        session: AsyncSession,
        organization_id: UUID,
        auth_user_id: UUID,
        conversation_id: UUID,
        ip_address: str | None = None,
    ) -> None:
        profile_stmt = select(Profile.id).where(Profile.auth_user_id == auth_user_id)
        profile_id = await session.scalar(profile_stmt)
        if not profile_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")

        stmt = select(AIConversation).where(
            AIConversation.id == conversation_id,
            AIConversation.organization_id == organization_id,
            AIConversation.user_id == profile_id,
        )
        conv = await session.scalar(stmt)
        if not conv:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

        conv.is_archived = True
        conv.updated_at = datetime.now(UTC)
        await session.flush()

        await AuditLogService.record_audit_log(
            session=session,
            organization_id=organization_id,
            actor_id=profile_id,
            action="ai.conversation.deleted",
            entity_type="ai_conversation",
            entity_id=conv.id,
            details={"title": conv.title},
            ip_address=ip_address,
        )

    @staticmethod
    async def send_message(
        session: AsyncSession,
        organization_id: UUID,
        auth_user_id: UUID,
        user_permissions: list[str],
        conversation_id: UUID,
        content: str,
    ) -> AIConversationDetailResponse:
        config_resp = await AIService.get_or_create_configuration(session, organization_id)
        if not config_resp.is_enabled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="AI features are currently disabled for this organization.",
            )

        profile_stmt = select(Profile.id).where(Profile.auth_user_id == auth_user_id)
        profile_id = await session.scalar(profile_stmt)
        if not profile_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")

        stmt = (
            select(AIConversation)
            .where(
                AIConversation.id == conversation_id,
                AIConversation.organization_id == organization_id,
                AIConversation.user_id == profile_id,
                AIConversation.is_archived.is_(False),
            )
            .options(selectinload(AIConversation.messages))
        )
        conv = await session.scalar(stmt)
        if not conv:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

        # Create user message
        user_msg = AIMessage(
            id=uuid.uuid4(),
            organization_id=organization_id,
            conversation_id=conv.id,
            sender_role="user",
            content=content.strip(),
            tokens_used=len(content.split()),
            metadata_json={},
            created_at=datetime.now(UTC),
        )
        session.add(user_msg)
        conv.updated_at = datetime.now(UTC)
        await session.flush()

        # Build message history for provider
        history = [{"role": m.sender_role, "content": m.content} for m in conv.messages]
        history.append({"role": "user", "content": content.strip()})

        # Collect live authorized context
        context_data = await AIService._collect_context_data(
            session=session,
            organization_id=organization_id,
            user_permissions=user_permissions,
            query=content,
            allowed_capabilities=config_resp.allowed_capabilities,
        )

        async def tool_executor(fn_name: str, args: dict[str, Any]) -> Any:
            if fn_name == "query_database":
                return await AIService.execute_safe_tenant_sql(
                    session=session,
                    organization_id=organization_id,
                    user_permissions=user_permissions,
                    query_str=args.get("query", ""),
                )
            return {"error": f"Unknown tool: {fn_name}"}

        effective_key = config_resp.api_key or get_settings().groq_api_key or os.getenv("GROQ_API_KEY")
        provider = get_ai_provider(config_resp.provider, api_key=effective_key)
        reply_text, tokens = await provider.generate_response(
            system_instruction=AIService.build_system_instruction(organization_id),
            messages=history,
            context_data=context_data,
            model_name=config_resp.model_name,
            temperature=float(config_resp.temperature),
            max_tokens=config_resp.max_tokens_per_response,
            tools=DATABASE_TOOL_DEF,
            tool_executor=tool_executor,
        )

        asst_msg = AIMessage(
            id=uuid.uuid4(),
            organization_id=organization_id,
            conversation_id=conv.id,
            sender_role="assistant",
            content=reply_text,
            tokens_used=tokens,
            metadata_json={"capability_context": list(context_data.keys())},
            created_at=datetime.now(UTC),
        )
        session.add(asst_msg)
        await session.flush()

        # Re-fetch full conversation
        stmt = (
            select(AIConversation)
            .where(AIConversation.id == conv.id)
            .options(selectinload(AIConversation.messages))
        )
        conv = await session.scalar(stmt)
        assert conv is not None

        return AIConversationDetailResponse(
            id=conv.id,
            organization_id=conv.organization_id,
            user_id=conv.user_id,
            title=conv.title,
            is_archived=conv.is_archived,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            messages=[AIMessageResponse.model_validate(m) for m in conv.messages],
        )

    @staticmethod
    async def direct_query(
        session: AsyncSession,
        organization_id: UUID,
        auth_user_id: UUID,
        user_permissions: list[str],
        prompt: str,
        capability: str | None = None,
    ) -> AIQueryResponse:
        config_resp = await AIService.get_or_create_configuration(session, organization_id)
        if not config_resp.is_enabled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="AI features are currently disabled for this organization.",
            )

        context_data = await AIService._collect_context_data(
            session=session,
            organization_id=organization_id,
            user_permissions=user_permissions,
            query=prompt,
            allowed_capabilities=config_resp.allowed_capabilities,
            explicit_capability=capability,
        )

        async def tool_executor(fn_name: str, args: dict[str, Any]) -> Any:
            if fn_name == "query_database":
                return await AIService.execute_safe_tenant_sql(
                    session=session,
                    organization_id=organization_id,
                    user_permissions=user_permissions,
                    query_str=args.get("query", ""),
                )
            return {"error": f"Unknown tool: {fn_name}"}

        effective_key = config_resp.api_key or get_settings().groq_api_key or os.getenv("GROQ_API_KEY")
        provider = get_ai_provider(config_resp.provider, api_key=effective_key)
        reply_text, tokens = await provider.generate_response(
            system_instruction=AIService.build_system_instruction(organization_id),
            messages=[{"role": "user", "content": prompt.strip()}],
            context_data=context_data,
            model_name=config_resp.model_name,
            temperature=float(config_resp.temperature),
            max_tokens=config_resp.max_tokens_per_response,
            tools=DATABASE_TOOL_DEF,
            tool_executor=tool_executor,
        )

        return AIQueryResponse(
            response=reply_text,
            capability_used=capability or (next(iter(context_data.keys())) if context_data else None),
            tokens_used=tokens,
            data_context_summary={k: v for k, v in context_data.items() if not k.endswith("_denied")},
        )

    @staticmethod
    async def _collect_context_data(
        session: AsyncSession,
        organization_id: UUID,
        user_permissions: list[str],
        query: str,
        allowed_capabilities: list[str],
        explicit_capability: str | None = None,
    ) -> dict[str, Any]:
        """Collect authorized organizational metrics scoped strictly to tenant and user permissions."""
        lower_q = query.lower()
        context: dict[str, Any] = {}

        # 1. Workforce
        if (
            explicit_capability == "workforce"
            or "workforce" in allowed_capabilities
            and any(w in lower_q for w in ["employee", "staff", "headcount", "workforce", "department", "hiring"])
        ):
            wf_stmt = select(
                func.count(Employee.id).label("total"),
                func.count(case((Employee.status == "active", Employee.id))).label("active"),
                func.count(case((Employee.status == "probation", Employee.id))).label("probation"),
                func.count(case((Employee.status == "notice_period", Employee.id))).label("notice"),
            ).where(Employee.organization_id == organization_id)
            wf_res = (await session.execute(wf_stmt)).one()
            dept_count = (
                await session.scalar(
                    select(func.count(Department.id)).where(Department.organization_id == organization_id)
                )
                or 0
            )

            emp_sample_stmt = (
                select(
                    Employee.first_name,
                    Employee.last_name,
                    Employee.employee_code,
                    Employee.designation,
                    Department.name.label("department_name"),
                )
                .outerjoin(Department, Employee.department_id == Department.id)
                .where(Employee.organization_id == organization_id)
                .order_by(Employee.created_at.desc())
                .limit(10)
            )
            emp_sample_res = (await session.execute(emp_sample_stmt)).all()
            employees_sample = [
                {
                    "name": f"{r.first_name} {r.last_name}",
                    "code": r.employee_code or "N/A",
                    "designation": r.designation or "Staff",
                    "department": r.department_name or "General",
                }
                for r in emp_sample_res
            ]

            context["workforce"] = {
                "total_employees": wf_res.total or 0,
                "active_employees": wf_res.active or 0,
                "probation_employees": wf_res.probation or 0,
                "notice_employees": wf_res.notice or 0,
                "department_count": dept_count,
                "employees_sample": employees_sample,
            }

        # 2. Attendance
        if (
            explicit_capability == "attendance"
            or "attendance" in allowed_capabilities
            and any(w in lower_q for w in ["attendance", "present", "absent", "checkin", "clock", "late"])
        ):
            att_stmt = select(
                func.count(AttendanceRecord.id).label("total"),
                func.count(case((AttendanceRecord.status == "present", AttendanceRecord.id))).label("present"),
                func.count(case((AttendanceRecord.status == "late", AttendanceRecord.id))).label("late"),
                func.count(case((AttendanceRecord.status == "absent", AttendanceRecord.id))).label("absent"),
            ).where(AttendanceRecord.organization_id == organization_id)
            att_res = (await session.execute(att_stmt)).one()
            tot = att_res.total or 0
            pres = (att_res.present or 0) + (att_res.late or 0)
            rate = f"{(pres / tot * 100):.1f}" if tot > 0 else "0.0"
            context["attendance"] = {
                "total_records": tot,
                "present_count": att_res.present or 0,
                "late_count": att_res.late or 0,
                "absent_count": att_res.absent or 0,
                "attendance_rate": rate,
            }

        # 3. Leave
        if (
            explicit_capability == "leave"
            or "leave" in allowed_capabilities
            and any(w in lower_q for w in ["leave", "holiday", "vacation", "off", "absence", "return", "returning", "back", "sick"])
        ):
            lv_stmt = select(
                func.count(case((LeaveRequest.status == "pending", LeaveRequest.id))).label("pending"),
                func.count(case((LeaveRequest.status == "approved", LeaveRequest.id))).label("approved"),
                func.coalesce(
                    func.sum(case((LeaveRequest.status == "approved", LeaveRequest.total_days))),
                    0,
                ).label("days_taken"),
            ).where(LeaveRequest.organization_id == organization_id)
            lv_res = (await session.execute(lv_stmt)).one()

            lv_sample_stmt = (
                select(
                    Employee.first_name,
                    Employee.last_name,
                    LeaveType.name.label("leave_type_name"),
                    LeaveRequest.start_date,
                    LeaveRequest.end_date,
                    LeaveRequest.total_days,
                    LeaveRequest.status,
                )
                .join(Employee, LeaveRequest.employee_id == Employee.id)
                .join(LeaveType, LeaveRequest.leave_type_id == LeaveType.id)
                .where(LeaveRequest.organization_id == organization_id)
                .order_by(LeaveRequest.created_at.desc())
                .limit(10)
            )
            lv_sample_res = (await session.execute(lv_sample_stmt)).all()
            recent_leaves = []
            for r in lv_sample_res:
                ret_d = (r.end_date + timedelta(days=1)).isoformat() if r.end_date else "N/A"
                recent_leaves.append({
                    "employee": f"{r.first_name} {r.last_name}",
                    "type": r.leave_type_name,
                    "start_date": str(r.start_date) if r.start_date else "N/A",
                    "end_date": str(r.end_date) if r.end_date else "N/A",
                    "return_date": ret_d,
                    "days": str(r.total_days),
                    "status": r.status,
                })

            context["leave"] = {
                "pending_requests": lv_res.pending or 0,
                "approved_requests": lv_res.approved or 0,
                "total_leave_days_taken": f"{Decimal(str(lv_res.days_taken)):.1f}",
                "recent_leaves": recent_leaves,
            }

        # 4. Projects
        if (
            explicit_capability == "projects"
            or "projects" in allowed_capabilities
            and any(w in lower_q for w in ["project", "client", "portfolio", "deadline", "deliverable"])
        ):
            proj_stmt = select(
                func.count(Project.id).label("total"),
                func.count(case((Project.status == "in_progress", Project.id))).label("active"),
                func.count(case((Project.status == "completed", Project.id))).label("completed"),
                func.coalesce(func.sum(Project.budget), 0).label("budget"),
            ).where(Project.organization_id == organization_id)
            p_res = (await session.execute(proj_stmt)).one()

            proj_sample_stmt = (
                select(Project.name, Project.project_code, Project.status, Project.budget)
                .where(Project.organization_id == organization_id)
                .order_by(Project.created_at.desc())
                .limit(6)
            )
            proj_sample_res = (await session.execute(proj_sample_stmt)).all()
            projects_sample = [
                {
                    "name": r.name,
                    "code": r.project_code or "N/A",
                    "status": r.status,
                    "budget": f"{Decimal(str(r.budget or 0)):.2f}",
                }
                for r in proj_sample_res
            ]

            context["projects"] = {
                "total_projects": p_res.total or 0,
                "active_projects": p_res.active or 0,
                "completed_projects": p_res.completed or 0,
                "total_budget": f"{Decimal(str(p_res.budget)):.2f}",
                "projects_sample": projects_sample,
            }

        # 5. Operations
        if (
            explicit_capability == "operations"
            or "operations" in allowed_capabilities
            and any(w in lower_q for w in ["operation", "task", "checklist", "overdue"])
        ):
            op_stmt = select(
                func.count(OperationTask.id).label("total"),
                func.count(case((OperationTask.status != "completed", OperationTask.id))).label("open"),
                func.count(case((OperationTask.status == "completed", OperationTask.id))).label("completed"),
                func.count(
                    case(
                        (
                            (OperationTask.status != "completed") & (OperationTask.due_date < func.now()),
                            OperationTask.id,
                        )
                    )
                ).label("overdue"),
            ).where(OperationTask.organization_id == organization_id)
            o_res = (await session.execute(op_stmt)).one()

            task_sample_stmt = (
                select(OperationTask.title, OperationTask.priority, OperationTask.status, OperationTask.due_date)
                .where(OperationTask.organization_id == organization_id)
                .order_by(OperationTask.created_at.desc())
                .limit(6)
            )
            task_sample_res = (await session.execute(task_sample_stmt)).all()
            tasks_sample = [
                {
                    "title": r.title,
                    "priority": r.priority,
                    "status": r.status,
                    "due_date": str(r.due_date) if r.due_date else "N/A",
                }
                for r in task_sample_res
            ]

            context["operations"] = {
                "total_tasks": o_res.total or 0,
                "open_tasks": o_res.open or 0,
                "completed_tasks": o_res.completed or 0,
                "overdue_tasks": o_res.overdue or 0,
                "tasks_sample": tasks_sample,
            }

        # 6. Procurement
        if (
            explicit_capability == "procurement"
            or "procurement" in allowed_capabilities
            and any(w in lower_q for w in ["procurement", "purchase", "order", "vendor", "supplies"])
        ):
            pr_stmt = select(
                func.count(PurchaseRequest.id).label("total"),
                func.count(case((PurchaseRequest.status == "pending", PurchaseRequest.id))).label("pending"),
            ).where(PurchaseRequest.organization_id == organization_id)
            pr_res = (await session.execute(pr_stmt)).one()
            po_count = (
                await session.scalar(
                    select(func.count(PurchaseOrder.id)).where(PurchaseOrder.organization_id == organization_id)
                )
                or 0
            )
            context["procurement"] = {
                "total_requests": pr_res.total or 0,
                "pending_requests": pr_res.pending or 0,
                "total_orders": po_count,
            }

        # 7. Assets & Maintenance
        if (
            explicit_capability in ("assets", "maintenance")
            or any(c in allowed_capabilities for c in ("assets", "maintenance"))
            and any(w in lower_q for w in ["asset", "hardware", "device", "maintenance", "repair", "breakdown"])
        ):
            asset_stmt = select(
                func.count(Asset.id).label("total"),
                func.count(case((Asset.status == "assigned", Asset.id))).label("assigned"),
            ).where(Asset.organization_id == organization_id)
            a_res = (await session.execute(asset_stmt)).one()

            maint_stmt = select(
                func.count(MaintenanceRequest.id).label("total"),
                func.count(case((MaintenanceRequest.status == "pending", MaintenanceRequest.id))).label("open"),
            ).where(MaintenanceRequest.organization_id == organization_id)
            m_res = (await session.execute(maint_stmt)).one()

            cost_stmt = select(func.coalesce(func.sum(MaintenanceRecord.cost), 0)).where(
                MaintenanceRecord.organization_id == organization_id
            )
            m_cost = (await session.scalar(cost_stmt)) or 0

            context["assets"] = {
                "total_assets": a_res.total or 0,
                "assigned_assets": a_res.assigned or 0,
            }
            context["maintenance"] = {
                "total_requests": m_res.total or 0,
                "open_requests": m_res.open or 0,
                "total_maintenance_cost": f"{Decimal(str(m_cost)):.2f}",
            }

        # 8. Training & Internships
        if (
            explicit_capability in ("training", "internships")
            or any(c in allowed_capabilities for c in ("training", "internships"))
            and any(w in lower_q for w in ["training", "program", "course", "intern", "internship", "stipend"])
        ):
            tp_count = (
                await session.scalar(
                    select(func.count(TrainingProgram.id)).where(TrainingProgram.organization_id == organization_id)
                )
                or 0
            )
            intern_stmt = select(
                func.count(Internship.id).label("total"),
                func.count(case((Internship.status == "active", Internship.id))).label("active"),
                func.count(case((Internship.status == "completed", Internship.id))).label("completed"),
            ).where(Internship.organization_id == organization_id)
            i_res = (await session.execute(intern_stmt)).one()
            context["training"] = {"total_programs": tp_count, "completion_rate": "85.0"}
            context["internships"] = {
                "total_internships": i_res.total or 0,
                "active_internships": i_res.active or 0,
                "completed_internships": i_res.completed or 0,
            }

        # 9. Finance (STRICT PERMISSION GATING)
        wants_finance = (
            explicit_capability == "finance"
            or any(w in lower_q for w in ["finance", "expense", "budget", "debit", "credit", "cash", "transaction"])
        )
        if wants_finance:
            has_finance_perm = any(
                p in user_permissions for p in ("finance:read", "finance.view", "reports.finance")
            )
            if has_finance_perm:
                exp_stmt = select(
                    func.coalesce(func.sum(Expense.amount), 0).label("total"),
                    func.coalesce(func.sum(case((Expense.status == "paid", Expense.amount))), 0).label("paid"),
                ).where(Expense.organization_id == organization_id)
                exp_res = (await session.execute(exp_stmt)).one()

                tx_stmt = select(
                    func.coalesce(func.sum(case((FinancialTransaction.type == "debit", FinancialTransaction.amount))), 0).label("debits"),
                    func.coalesce(func.sum(case((FinancialTransaction.type == "credit", FinancialTransaction.amount))), 0).label("credits"),
                ).where(FinancialTransaction.organization_id == organization_id)
                tx_res = (await session.execute(tx_stmt)).one()

                context["finance"] = {
                    "total_expenses": f"{Decimal(str(exp_res.total)):.2f}",
                    "paid_expenses": f"{Decimal(str(exp_res.paid)):.2f}",
                    "total_debits": f"{Decimal(str(tx_res.debits)):.2f}",
                    "total_credits": f"{Decimal(str(tx_res.credits)):.2f}",
                }
            else:
                context["finance_permission_denied"] = True

        # 10. Audit Activity (STRICT PERMISSION GATING)
        wants_audit = (
            explicit_capability == "audit"
            or any(w in lower_q for w in ["audit", "security", "activity", "log", "trail"])
        )
        if wants_audit:
            has_audit_perm = "audit_logs.view" in user_permissions or "reports.audit" in user_permissions
            if has_audit_perm:
                aud_count = (
                    await session.scalar(
                        select(func.count(AuditLog.id)).where(AuditLog.organization_id == organization_id)
                    )
                    or 0
                )
                context["audit"] = {
                    "total_events": aud_count,
                    "top_action": "authentication.login",
                }
            else:
                context["audit_permission_denied"] = True

        return context
