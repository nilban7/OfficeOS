"""AI Provider abstraction layer for OfficeOS.

Supports model providers (Groq and Google Gemini) and safe development/test fallback engines.
Supports OpenAI-compatible tool/function calling for live database exploration.
Secrets are never written to database rows or logged.
"""

import asyncio
import json
import logging
import os
import re
from abc import ABC, abstractmethod
from collections.abc import Callable, Coroutine
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def synthesize_context_response(
    user_message: str,
    context_data: dict[str, Any] | None,
) -> tuple[str, int]:
    """Fallback context synthesis engine for development, staging, or unconfigured keys."""
    if not context_data:
        response = (
            "Hello! I am your OfficeOS AI Assistant. I can help analyze your organization's "
            "workforce, attendance, leave schedules, projects, procurement pipelines, assets, "
            "maintenance requests, training programs, operations, and financial metrics (with proper authorization). "
            "How may I assist you today?"
        )
        return response, len(response.split())

    sections = []

    # Check for access restriction notifications in context
    if context_data.get("finance_permission_denied"):
        sections.append(
            "🔒 **Financial Data Notice**: You do not have permission to view organization financial metrics. "
            "Financial summaries are omitted from this response."
        )
    if context_data.get("audit_permission_denied"):
        sections.append(
            "🔒 **Audit Logs Notice**: You do not have permission to view organizational audit trail history. "
            "Audit logs are omitted from this response."
        )

    # Workforce context
    if "workforce" in context_data:
        wf = context_data["workforce"]
        active_emp = wf.get("active_employees", 0)
        total_emp = wf.get("total_employees", 0)
        employees_list = wf.get("employees_sample", [])
        emp_detail = ""
        if employees_list:
            emp_lines = [f"  • {e.get('name', 'N/A')} ({e.get('code', 'N/A')}) — {e.get('designation', 'N/A')} [{e.get('department', 'Unassigned')}]" for e in employees_list[:10]]
            emp_detail = "\n" + "\n".join(emp_lines)
        sections.append(
            f"👥 **Workforce Overview**:\n"
            f"- Active Staff: {active_emp} / {total_emp} total registered.\n"
            f"- On Probation: {wf.get('probation_employees', 0)} | On Notice: {wf.get('notice_employees', 0)}.\n"
            f"- Departments: {wf.get('department_count', 0)}."
            f"{emp_detail}"
        )

    # Attendance context
    if "attendance" in context_data:
        att = context_data["attendance"]
        sections.append(
            f"⏱️ **Attendance Summary (Recent)**:\n"
            f"- Attendance Rate: {att.get('attendance_rate', '0.0')}%\n"
            f"- Present: {att.get('present_count', 0)} | Late check-ins: {att.get('late_count', 0)} | Absences: {att.get('absent_count', 0)}."
        )

    # Leave context
    if "leave" in context_data:
        lv = context_data["leave"]
        recent_leaves = lv.get("recent_leaves", [])
        leave_detail = ""
        if recent_leaves:
            l_lines = []
            for l in recent_leaves[:10]:
                ret = l.get("return_date")
                ret_str = f" → Scheduled Return: **{ret}**" if ret and ret != "N/A" else ""
                dates_str = f" ({l.get('start_date', '')} to {l.get('end_date', '')})" if l.get("start_date") and l.get("start_date") != "N/A" else ""
                l_lines.append(f"  • {l.get('employee', 'Staff')}: {l.get('type', 'Leave')}{dates_str} ({l.get('days', 1)}d) — {l.get('status', 'pending')}{ret_str}")
            leave_detail = "\n" + "\n".join(l_lines)
        sections.append(
            f"📅 **Leave Activity**:\n"
            f"- Pending Requests: {lv.get('pending_requests', 0)} awaiting managerial review.\n"
            f"- Approved Leaves: {lv.get('approved_requests', 0)} ({lv.get('total_leave_days_taken', '0.0')} days taken)."
            f"{leave_detail}"
        )

        # Targeted answer if the user asks when an employee returns from leave
        lower_msg = user_message.lower()
        if any(k in lower_msg for k in ["return", "when will", "back to work", "come back", "sick leave", "date"]):
            matches = []
            for l in recent_leaves:
                emp = l.get("employee", "Staff")
                emp_lower = emp.lower()
                is_match = False
                if "sick" in lower_msg and "sick" in l.get("type", "").lower():
                    is_match = True
                for name_part in emp_lower.split():
                    if len(name_part) > 2 and name_part in lower_msg:
                        is_match = True
                        break
                if is_match or "return" in lower_msg or "sick" in lower_msg:
                    ret_date = l.get("return_date", "N/A")
                    start_d = l.get("start_date", "N/A")
                    end_d = l.get("end_date", "N/A")
                    status_d = l.get("status", "approved")
                    matches.append(
                        f"• **{emp}**: On {l.get('type', 'Leave')} ({status_d}) from {start_d} to {end_d}. "
                        f"Scheduled return to work: **{ret_date}**."
                    )
            if matches:
                sections.insert(
                    0,
                    "🗓️ **Scheduled Return Dates for Employees on Leave**:\n" + "\n".join(matches)
                )

    # Projects context
    if "projects" in context_data:
        proj = context_data["projects"]
        proj_list = proj.get("projects_sample", [])
        proj_detail = ""
        if proj_list:
            p_lines = [f"  • {p.get('name', 'Project')} ({p.get('code', 'N/A')}): {p.get('status', 'in_progress')} — Budget: ${p.get('budget', '0')}" for p in proj_list[:6]]
            proj_detail = "\n" + "\n".join(p_lines)
        sections.append(
            f"🚀 **Project Operations**:\n"
            f"- Total Projects: {proj.get('total_projects', 0)} ({proj.get('active_projects', 0)} active, {proj.get('completed_projects', 0)} completed).\n"
            f"- Portfolio Budget: ${proj.get('total_budget', '0.00')}."
            f"{proj_detail}"
        )

    # Operations / Tasks context
    if "operations" in context_data:
        ops = context_data["operations"]
        task_list = ops.get("tasks_sample", [])
        task_detail = ""
        if task_list:
            t_lines = [f"  • {t.get('title', 'Task')} [{t.get('priority', 'medium')}] — {t.get('status', 'open')} (Due: {t.get('due_date', 'N/A')})" for t in task_list[:6]]
            task_detail = "\n" + "\n".join(t_lines)
        sections.append(
            f"📋 **Operational Tasks**:\n"
            f"- Open Tasks: {ops.get('open_tasks', 0)} | Completed: {ops.get('completed_tasks', 0)} | Overdue: {ops.get('overdue_tasks', 0)}."
            f"{task_detail}"
        )

    # Procurement context
    if "procurement" in context_data:
        proc = context_data["procurement"]
        sections.append(
            f"📦 **Procurement & Supply**:\n"
            f"- Pending Requests: {proc.get('pending_requests', 0)} of {proc.get('total_requests', 0)} total.\n"
            f"- Purchase Orders: {proc.get('total_orders', 0)} active across {proc.get('active_vendors', 0)} vendors."
        )

    # Assets & Maintenance context
    if "assets" in context_data or "maintenance" in context_data:
        assets = context_data.get("assets", {})
        maint = context_data.get("maintenance", {})
        sections.append(
            f"🛠️ **Assets & Maintenance**:\n"
            f"- Total Assets: {assets.get('total_assets', 0)} ({assets.get('assigned_assets', 0)} currently assigned).\n"
            f"- Open Maintenance Requests: {maint.get('open_requests', 0)} | Total repair cost: ${maint.get('total_maintenance_cost', '0.00')}."
        )

    # Training & Internships
    if "training" in context_data or "internships" in context_data:
        tr = context_data.get("training", {})
        intern = context_data.get("internships", {})
        sections.append(
            f"🎓 **Talent & Training Programs**:\n"
            f"- Training Programs: {tr.get('total_programs', 0)} ({tr.get('completion_rate', '0.0')}% completion rate).\n"
            f"- Active Internships: {intern.get('active_internships', 0)} ({intern.get('completed_internships', 0)} completed)."
        )

    # Finance context (only populated when authorized)
    if "finance" in context_data:
        fin = context_data["finance"]
        sections.append(
            f"💰 **Financial Insights (Authorized)**:\n"
            f"- Period Expenses: ${fin.get('total_expenses', '0.00')} (Paid: ${fin.get('paid_expenses', '0.00')}).\n"
            f"- Posted Debits: ${fin.get('total_debits', '0.00')} | Posted Credits: ${fin.get('total_credits', '0.00')}."
        )

    # Audit Activity (only populated when authorized)
    if "audit" in context_data:
        aud = context_data["audit"]
        sections.append(
            f"🛡️ **Security & Audit Logs (Authorized)**:\n"
            f"- Total Recorded Events: {aud.get('total_events', 0)}.\n"
            f"- Top Action: {aud.get('top_action', 'N/A')}."
        )

    # Combine tailored response
    if sections:
        header = "Here is the operational intelligence analysis from your organization database:\n\n"
        summary_body = "\n\n".join(sections)
        response = header + summary_body
    else:
        response = (
            f"I processed your query regarding: \"{user_message}\". "
            f"All requested metrics are currently within normal operating thresholds for your organization."
        )

    tokens = len(response.split()) + len(user_message.split())
    return response, tokens


class BaseAIProvider(ABC):
    @abstractmethod
    async def generate_response(
        self,
        system_instruction: str,
        messages: list[dict[str, Any]],
        context_data: dict[str, Any] | None = None,
        model_name: str = "llama-3.3-70b-versatile",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        tools: list[dict[str, Any]] | None = None,
        tool_executor: Callable[[str, dict[str, Any]], Coroutine[Any, Any, Any]] | None = None,
    ) -> tuple[str, int]:
        """Generate response from model provider.

        Returns (response_text, tokens_used).
        """


class GroqProvider(BaseAIProvider):
    """Ultra-fast Groq LLM provider supporting tool calling and database interaction."""

    GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

    DEFAULT_MODEL = "openai/gpt-oss-120b"

    def __init__(self, api_key: str | None = None) -> None:
        settings = get_settings()
        self.api_key = api_key or settings.groq_api_key or os.getenv("GROQ_API_KEY")

    async def generate_response(
        self,
        system_instruction: str,
        messages: list[dict[str, Any]],
        context_data: dict[str, Any] | None = None,
        model_name: str = "openai/gpt-oss-120b",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        tools: list[dict[str, Any]] | None = None,
        tool_executor: Callable[[str, dict[str, Any]], Coroutine[Any, Any, Any]] | None = None,
    ) -> tuple[str, int]:
        latest_user_message = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                latest_user_message = m.get("content", "").strip()
                break

        # Fallback if no API key is provided
        if not self.api_key:
            return synthesize_context_response(latest_user_message, context_data)

        # Build system prompt with context data if present
        sys_content = system_instruction
        if context_data:
            sys_content += f"\n\n--- Organization Live Context Data ---\n{json.dumps(context_data, default=str, indent=2)}"

        payload_messages: list[dict[str, Any]] = [{"role": "system", "content": sys_content}]
        for m in messages:
            payload_messages.append({
                "role": m.get("role", "user"),
                "content": m.get("content", ""),
            })

        headers = {
            "Authorization": f"Bearer {self.api_key.strip()}",
            "Content-Type": "application/json",
        }

        # Multi-turn tool calling loop (up to 5 turns)
        total_tokens = 0
        current_model = model_name or "openai/gpt-oss-120b"
        if "gemini" in current_model.lower():
            # If user configured a gemini model name but is using Groq provider, use Groq's flagship
            current_model = "openai/gpt-oss-120b"

        for _ in range(5):
            req_body: dict[str, Any] = {
                "model": current_model,
                "messages": payload_messages,
                "temperature": max(0.0, min(float(temperature), 1.0)),
                "max_tokens": max(128, min(int(max_tokens), 8192)),
            }
            if tools:
                req_body["tools"] = tools
                req_body["tool_choice"] = "auto"

            try:
                async with httpx.AsyncClient(timeout=45.0) as client:
                    resp = await client.post(self.GROQ_API_URL, headers=headers, json=req_body)
                    if resp.status_code == 429:
                        try:
                            err_msg = resp.json().get("error", {}).get("message", "")
                            delay_m = re.search(r"try again in ([\d\.]+)s", err_msg)
                            delay = float(delay_m.group(1)) if delay_m else 4.0
                        except Exception:  # noqa: BLE001
                            delay = 4.0
                        if delay <= 6.0:
                            logger.info(f"Groq TPM limit reached, waiting {delay:.1f}s before retrying...")
                            await asyncio.sleep(delay + 0.5)
                            resp = await client.post(self.GROQ_API_URL, headers=headers, json=req_body)

                    if resp.status_code != 200:
                        error_detail = resp.text
                        logger.error(f"Groq API error {resp.status_code}: {error_detail}")
                        msg = (
                            f"I encountered an issue communicating with Groq ({resp.status_code}): {error_detail[:200]}. "
                            "Please ensure your GROQ_API_KEY is valid and has sufficient rate limits."
                        )
                        return (msg, 0)
                    data = resp.json()
            except Exception as e:
                logger.exception("Failed to call Groq API")
                return (
                    f"Unable to reach Groq AI: {e!s}. Please check your network connection.",
                    0,
                )

            choice = data.get("choices", [{}])[0]
            msg = choice.get("message", {})
            usage = data.get("usage", {})
            total_tokens += usage.get("total_tokens", 0)

            tool_calls = msg.get("tool_calls")
            if not tool_calls or not tool_executor:
                content = msg.get("content") or "I processed your request, but received an empty response."
                return content, total_tokens

            # Append assistant's tool call message
            payload_messages.append(msg)

            # Execute tool calls
            for tool_call in tool_calls:
                call_id = tool_call.get("id")
                fn = tool_call.get("function", {})
                fn_name = fn.get("name")
                try:
                    args = json.loads(fn.get("arguments", "{}"))
                except Exception:  # noqa: BLE001
                    args = {}

                tool_result = await tool_executor(fn_name, args)
                payload_messages.append({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": json.dumps(tool_result, default=str),
                })

        return (
            "I processed your query with multi-step database analysis, but reached the maximum tool reasoning steps.",
            total_tokens,
        )


class SystemGeminiProvider(BaseAIProvider):
    """Google Gemini provider with safe, deterministic context synthesis fallback."""

    def __init__(self, api_key: str | None = None) -> None:
        settings = get_settings()
        self.api_key = api_key or settings.gemini_api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

    async def generate_response(
        self,
        system_instruction: str,
        messages: list[dict[str, Any]],
        context_data: dict[str, Any] | None = None,
        model_name: str = "gemini-1.5-flash",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        tools: list[dict[str, Any]] | None = None,
        tool_executor: Callable[[str, dict[str, Any]], Coroutine[Any, Any, Any]] | None = None,
    ) -> tuple[str, int]:
        latest_user_message = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                latest_user_message = m.get("content", "").strip()
                break

        # If a live Gemini API key is configured, invoke it safely
        if self.api_key:
            try:
                import google.generativeai as genai  # type: ignore[import-untyped]

                genai.configure(api_key=self.api_key)
                model = genai.GenerativeModel(
                    model_name=model_name or "gemini-1.5-flash",
                    system_instruction=system_instruction,
                )
                full_prompt = latest_user_message
                if context_data:
                    full_prompt = f"Operational Context Data:\n{json.dumps(context_data, default=str)}\n\nUser Question:\n{latest_user_message}"
                response = await model.generate_content_async(full_prompt)
                reply_text = response.text or "I processed your request, but received an empty response."
                token_count = len(reply_text.split()) + len(latest_user_message.split())
                return reply_text, token_count
            except Exception as e:  # noqa: BLE001
                logger.warning(f"Gemini API call failed: {e}")

        # Robust context synthesis engine for development, staging, or fallback
        return synthesize_context_response(latest_user_message, context_data)


def get_ai_provider(provider_type: str | None = None, api_key: str | None = None) -> BaseAIProvider:
    """Return configured AI provider based on configuration, requested type, or environment."""
    settings = get_settings()
    has_groq = bool(api_key or settings.groq_api_key or os.getenv("GROQ_API_KEY"))
    has_gemini = bool(settings.gemini_api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))

    if provider_type == "groq":
        return GroqProvider(api_key=api_key)
    if provider_type == "system_gemini":
        return SystemGeminiProvider(api_key=api_key)

    # Automatic selection: default to Groq if key exists, else Gemini
    if has_groq:
        return GroqProvider(api_key=api_key)
    if has_gemini:
        return SystemGeminiProvider(api_key=api_key)

    # Default to GroqProvider
    return GroqProvider(api_key=api_key)
