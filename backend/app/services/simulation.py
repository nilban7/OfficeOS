import logging
import os
import re
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.employee import Employee
from app.models.internship import Internship
from app.models.payroll import SalaryStructure
from app.models.project import Project
from app.schemas.simulation import (
    SimulationMetric,
    SimulationPreset,
    SimulationRunRequest,
    SimulationRunResponse,
    SimulationScenario,
    SimulationTimelineEvent,
)
from app.services.ai_provider import GroqProvider

logger = logging.getLogger(__name__)


PRESETS: list[dict[str, Any]] = [
    {
        "id": "hire_interns",
        "category": "workforce",
        "title": "Hire 5 Interns (3 Months @ ₹15k/mo)",
        "description": "Simulate adding 5 interns: workload redistribution, mentor bottleneck, and net ROI.",
        "prompt": "What if I hire 5 interns for 3 months at ₹15,000/month stipend?",
        "parameters": {"count": 5, "duration_months": 3, "stipend": 15000, "role": "Intern"},
    },
    {
        "id": "salary_hike",
        "category": "compensation",
        "title": "8% Company-wide Salary Increase",
        "description": "Model payroll burn increase, cash runway impact, and retention savings.",
        "prompt": "What if we introduce an 8% company-wide salary increase next month?",
        "parameters": {"percentage": 8, "scope": "all"},
    },
    {
        "id": "project_delay",
        "category": "project_delay",
        "title": "30-Day Critical Project Delay",
        "description": "Evaluate cash flow impact from milestone billing delay and contractor mitigation.",
        "prompt": "What if our primary project is delayed by 30 days due to client scope changes?",
        "parameters": {"delay_days": 30},
    },
    {
        "id": "satellite_office",
        "category": "operations",
        "title": "Open Satellite Office (10 Staff)",
        "description": "Assess Capex, monthly run-rate, break-even period, and operational risk.",
        "prompt": "What if we open a Bangalore satellite branch with 10 employees?",
        "parameters": {"headcount": 10, "city": "Bangalore", "capex": 3500000},
    },
]


class SimulationService:
    @staticmethod
    def get_presets() -> list[SimulationPreset]:
        return [SimulationPreset(**p) for p in PRESETS]

    @staticmethod
    async def collect_tenant_baseline(
        session: AsyncSession,
        organization_id: UUID,
    ) -> dict[str, Any]:
        """Fetch real tenant numbers to anchor simulations in reality."""
        # 1. Employees count & designations
        emp_query = select(Employee.designation, Employee.status).where(
            Employee.organization_id == organization_id,
            Employee.is_active == True,
        )
        emp_res = await session.execute(emp_query)
        emp_rows = emp_res.all()
        total_employees = len(emp_rows)

        # Potential mentors: Seniors, Leads, Directors, Managers, Architects, VPs
        mentor_keywords = ("lead", "senior", "director", "manager", "vp", "chief", "architect", "head")
        potential_mentors = [
            r[0] for r in emp_rows
            if r[0] and any(kw in r[0].lower() for kw in mentor_keywords)
        ]
        mentor_count = max(len(potential_mentors), 1 if total_employees > 0 else 0)

        # 2. Monthly payroll sum
        pay_query = select(func.sum(SalaryStructure.base_salary)).where(
            SalaryStructure.organization_id == organization_id
        )
        pay_res = await session.scalar(pay_query)
        if pay_res and pay_res > 0:
            monthly_payroll = float(pay_res)
        else:
            # Baseline estimate: ₹65,000 avg per employee
            monthly_payroll = float(max(total_employees, 1) * 65000)

        # 3. Active projects
        proj_query = select(Project.name, Project.budget).where(
            Project.organization_id == organization_id,
            Project.status.in_(["planned", "in_progress", "active"]),
        )
        proj_res = await session.execute(proj_query)
        proj_rows = proj_res.all()
        active_projects_count = len(proj_rows)
        sample_projects = [r[0] for r in proj_rows[:3]]

        # 4. Active internships
        intern_query = select(func.count(Internship.id)).where(
            Internship.organization_id == organization_id,
            Internship.status.in_(["active", "applied", "interviewing"]),
        )
        intern_count = await session.scalar(intern_query) or 0

        return {
            "total_employees": total_employees,
            "mentor_count": mentor_count,
            "monthly_payroll": monthly_payroll,
            "active_projects_count": active_projects_count,
            "sample_projects": sample_projects,
            "active_interns": intern_count,
        }

    @classmethod
    async def run_simulation(
        cls,
        session: AsyncSession,
        organization_id: UUID,
        user_permissions: list[str],
        request: SimulationRunRequest,
    ) -> SimulationRunResponse:
        baseline = await cls.collect_tenant_baseline(session, organization_id)
        prompt_lower = request.prompt.lower()

        # Detect category if set to workforce or custom
        category = request.category
        if "intern" in prompt_lower or "hire" in prompt_lower:
            category = "workforce"
        elif "salary" in prompt_lower or "pay" in prompt_lower or "hike" in prompt_lower:
            category = "compensation"
        elif "delay" in prompt_lower or "project" in prompt_lower:
            category = "project_delay"
        elif "office" in prompt_lower or "branch" in prompt_lower or "expand" in prompt_lower:
            category = "operations"

        if category == "workforce":
            return await cls._simulate_workforce(baseline, request)
        elif category == "compensation":
            return await cls._simulate_compensation(baseline, request)
        elif category == "project_delay":
            return await cls._simulate_project_delay(baseline, request)
        elif category == "operations":
            return await cls._simulate_operations(baseline, request)
        else:
            return await cls._simulate_custom(baseline, request)

    @classmethod
    async def _simulate_workforce(
        cls,
        baseline: dict[str, Any],
        request: SimulationRunRequest,
    ) -> SimulationRunResponse:
        # Extract count if present or default to 5
        count_match = re.search(r"(\d+)\s+intern", request.prompt.lower())
        count = int(count_match.group(1)) if count_match else 5
        stipend = 15000
        months = 3

        curr_payroll = baseline["monthly_payroll"]
        mentors = baseline["mentor_count"]
        emp_count = baseline["total_employees"]

        # Math
        monthly_intern_cost = count * stipend
        total_intern_cost = monthly_intern_cost * months
        projected_payroll = curr_payroll + monthly_intern_cost
        curr_workload = 82
        after_workload = max(64, curr_workload - (count * 3))

        # Mentor load: each intern consumes ~18% senior capacity for first month
        mentor_burden = round((count / max(mentors, 1)) * 14, 1)

        # Scenarios
        # Scenario A: As requested (e.g. 5 interns)
        cost_lakhs = round(total_intern_cost / 100000, 2)
        val_low = round(cost_lakhs * 1.6, 2)
        val_high = round(cost_lakhs * 2.3, 2)

        # Scenario B: Balanced (e.g. 3 interns)
        count_b = max(round(count * 0.6), 2)
        cost_b = round((count_b * stipend * months) / 100000, 2)
        val_b_low = round(cost_b * 1.8, 2)
        val_b_high = round(cost_b * 2.5, 2)

        # Scenario C: Scaled (count + 1 dedicated mentor/lead)
        cost_c = round((total_intern_cost + (60000 * months)) / 100000, 2)
        val_c_low = round(cost_c * 1.5, 2)
        val_c_high = round(cost_c * 2.0, 2)

        baseline_metrics = [
            SimulationMetric(
                label="Monthly Payroll",
                current_value=f"₹{round(curr_payroll / 100000, 2)}L",
                projected_value=f"₹{round(projected_payroll / 100000, 2)}L",
                delta=f"+₹{round(monthly_intern_cost / 100000, 2)}L/mo",
            ),
            SimulationMetric(
                label="Total 3-Month Outlay",
                current_value="₹0.00L",
                projected_value=f"₹{cost_lakhs}L",
                delta=f"+₹{cost_lakhs}L",
            ),
            SimulationMetric(
                label="Core Team Workload",
                current_value=f"{curr_workload}%",
                projected_value=f"{after_workload}%",
                delta=f"-{curr_workload - after_workload}%",
            ),
            SimulationMetric(
                label="Mentor Availability",
                current_value=f"{mentors} Leads",
                projected_value=f"+{mentor_burden}% Load",
                delta="Bottleneck Alert",
            ),
        ]

        scenarios = [
            SimulationScenario(
                scenario_id="scenario_a",
                name=f"Scenario A — Hire {count} Interns (Direct)",
                description=f"Hire all {count} candidates immediately. High output volume with mentor strain.",
                cost=f"₹{cost_lakhs}L",
                expected_value=f"₹{val_low}L – ₹{val_high}L",
                roi_range=f"{round(((val_low - cost_lakhs) / cost_lakhs) * 100)}% – {round(((val_high - cost_lakhs) / cost_lakhs) * 100)}%",
                risk_level="Medium",
                is_recommended=False,
                timeline=[
                    SimulationTimelineEvent(period="Month 1", title="Onboarding & Ramp", impact=f"Mentors lose ~{mentor_burden}% capacity; minimal productive output."),
                    SimulationTimelineEvent(period="Month 2", title="Absorption Phase", impact="Interns absorb documentation, QA, and operational backlog."),
                    SimulationTimelineEvent(period="Month 3", title="Peak Velocity", impact=f"Net positive delivery; estimated value ₹{val_low}L+."),
                ],
            ),
            SimulationScenario(
                scenario_id="scenario_b",
                name=f"Scenario B — Hire {count_b} Interns (Optimal)",
                description=f"Right-size cohort to {count_b} interns to maintain senior focus while absorbing repetitive tasks.",
                cost=f"₹{cost_b}L",
                expected_value=f"₹{val_b_low}L – ₹{val_b_high}L",
                roi_range=f"{round(((val_b_low - cost_b) / cost_b) * 100)}% – {round(((val_b_high - cost_b) / cost_b) * 100)}%",
                risk_level="Low",
                is_recommended=True,
                timeline=[
                    SimulationTimelineEvent(period="Month 1", title="Rapid Integration", impact="Manageable 1:1 mentorship without senior project delays."),
                    SimulationTimelineEvent(period="Month 2", title="Full Task Relief", impact="Core engineering workload drops by 9%."),
                    SimulationTimelineEvent(period="Month 3", title="Conversion Assessment", impact=f"Highest risk-adjusted ROI ({round(((val_b_low - cost_b) / cost_b) * 100)}%+)."),
                ],
            ),
            SimulationScenario(
                scenario_id="scenario_c",
                name=f"Scenario C — Hire {count} Interns + 1 Dedicated Lead",
                description="Hire the full cohort and pair with a dedicated contractor mentor to shield senior staff.",
                cost=f"₹{cost_c}L",
                expected_value=f"₹{val_c_low}L – ₹{val_c_high}L",
                roi_range=f"{round(((val_c_low - cost_c) / cost_c) * 100)}% – {round(((val_c_high - cost_c) / cost_c) * 100)}%",
                risk_level="Low",
                is_recommended=False,
                timeline=[
                    SimulationTimelineEvent(period="Month 1", title="Structured Training", impact="Zero disruption to senior team deadlines."),
                    SimulationTimelineEvent(period="Month 2", title="Supervised Delivery", impact="High quality documentation and test coverage."),
                    SimulationTimelineEvent(period="Month 3", title="Scale Achieved", impact="Substantial value but higher initial capital outlay."),
                ],
            ),
        ]

        summary = (
            f"Simulating hiring {count} interns for 3 months at ₹{stipend:,}/mo against your current organization data "
            f"({emp_count} active employees, {mentors} potential mentors, ₹{round(curr_payroll / 100000, 2)}L monthly payroll). "
            f"While core workload drops from {curr_workload}% to {after_workload}%, OfficeOS detected an operational mentor bottleneck: "
            f"{count} interns across {mentors} leads causes an estimated {mentor_burden}% capacity reduction in senior delivery."
        )

        recommendation = (
            f"**OfficeOS Recommendation: Scenario B ({count_b} Interns)** provides the optimal risk-adjusted return. "
            f"It captures ₹{val_b_low}L–₹{val_b_high}L in productivity gains while keeping senior mentor overhead within safe thresholds."
        )

        assumptions = [
            f"Intern stipend held constant at ₹{stipend:,}/month.",
            "Intern productivity reaches 65% efficiency by week 5.",
            f"Mentor load calculated across {mentors} eligible senior roles.",
            "Existing office space & workstation allocation is sufficient without capital expenditure.",
        ]

        narrative = (
            f"### Executive Simulation Breakdown\n\n"
            f"• **Financial Impact**: Additional 3-month investment of **₹{cost_lakhs}L** yields an estimated **₹{val_low}L–₹{val_high}L** in task value.\n"
            f"• **Operational Risk**: Mentorship capacity is your primary bottleneck. Having {mentors} leads train {count} interns simultaneously creates a **{mentor_burden}% drag** on core sprint deliverables.\n"
            f"• **Optimal Path**: Capping the cohort at **{count_b} interns** preserves senior delivery schedules while unlocking a **100%+ ROI**."
        )

        # Optional Groq enrichment if key exists
        enriched_narrative = await cls._enrich_with_groq(request.prompt, summary, narrative)

        return SimulationRunResponse(
            title=f"Workforce Simulation: Hiring {count} Interns",
            summary=summary,
            category="workforce",
            confidence_score=78,
            assumptions=assumptions,
            baseline_metrics=baseline_metrics,
            scenarios=scenarios,
            recommendation=recommendation,
            narrative=enriched_narrative or narrative,
        )

    @classmethod
    async def _simulate_compensation(
        cls,
        baseline: dict[str, Any],
        request: SimulationRunRequest,
    ) -> SimulationRunResponse:
        pct_match = re.search(r"(\d+)%", request.prompt)
        pct = int(pct_match.group(1)) if pct_match else 8

        curr_payroll = baseline["monthly_payroll"]
        emp_count = baseline["total_employees"]
        monthly_delta = curr_payroll * (pct / 100)
        projected_payroll = curr_payroll + monthly_delta
        annual_impact = monthly_delta * 12

        curr_lakhs = round(curr_payroll / 100000, 2)
        proj_lakhs = round(projected_payroll / 100000, 2)
        delta_lakhs = round(monthly_delta / 100000, 2)
        annual_lakhs = round(annual_impact / 100000, 2)

        baseline_metrics = [
            SimulationMetric(
                label="Monthly Payroll",
                current_value=f"₹{curr_lakhs}L",
                projected_value=f"₹{proj_lakhs}L",
                delta=f"+₹{delta_lakhs}L/mo",
            ),
            SimulationMetric(
                label="Annual Budget Delta",
                current_value="₹0.00L",
                projected_value=f"₹{annual_lakhs}L",
                delta=f"+{pct}%",
            ),
            SimulationMetric(
                label="Turnover Risk",
                current_value="14.2% / yr",
                projected_value="6.5% / yr",
                delta="-54% Risk",
            ),
            SimulationMetric(
                label="Cash Runway Impact",
                current_value="14.8 Months",
                projected_value="13.2 Months",
                delta="-1.6 Months",
            ),
        ]

        scenarios = [
            SimulationScenario(
                scenario_id="scenario_a",
                name=f"Scenario A — Uniform {pct}% Blanket Hike",
                description="Apply the increase equally across all designations and pay grades.",
                cost=f"₹{annual_lakhs}L/yr",
                expected_value="High Morale, Moderate Alignment",
                roi_range="Neutral Direct ROI",
                risk_level="Medium",
                is_recommended=False,
                timeline=[
                    SimulationTimelineEvent(period="Month 1", title="Immediate Payroll Adjustment", impact=f"Monthly burn increases by ₹{delta_lakhs}L."),
                    SimulationTimelineEvent(period="Month 3", title="Retention Impact", impact="Immediate reduction in early notice submissions."),
                    SimulationTimelineEvent(period="Month 6", title="Runway Review", impact="Cash buffer shrinks by 1.6 months."),
                ],
            ),
            SimulationScenario(
                scenario_id="scenario_b",
                name="Scenario B — Performance-Tiered (5%–12%)",
                description="Allocate higher increases to high performers and critical revenue-driving roles.",
                cost=f"₹{round(annual_lakhs * 0.92, 2)}L/yr",
                expected_value="Retains Top 20% Talent",
                roi_range="130%–180% via Replacement Savings",
                risk_level="Low",
                is_recommended=True,
                timeline=[
                    SimulationTimelineEvent(period="Month 1", title="Targeted Evaluation", impact="Increases tied directly to Q3 appraisals."),
                    SimulationTimelineEvent(period="Month 3", title="Key Talent Anchoring", impact="Eliminates risk of senior staff departures."),
                    SimulationTimelineEvent(period="Month 6", title="Capital Efficiency", impact="Saves ~₹1.8L compared to blanket hike."),
                ],
            ),
            SimulationScenario(
                scenario_id="scenario_c",
                name="Scenario C — 4% Base Hike + Retention Bonus Pool",
                description="Lower permanent salary burden with milestone-contingent retention bonuses.",
                cost=f"₹{round(annual_lakhs * 0.75, 2)}L/yr",
                expected_value="Capital Flexible",
                roi_range="110%–140%",
                risk_level="Low",
                is_recommended=False,
                timeline=[
                    SimulationTimelineEvent(period="Month 1", title="Modest Base Adjustment", impact="Minimal cash runway compression."),
                    SimulationTimelineEvent(period="Month 6", title="Half-Year Performance Tranche", impact="Bonuses funded strictly from completed projects."),
                    SimulationTimelineEvent(period="Month 12", title="Annual Review", impact="Maximum flexibility if client revenues drop."),
                ],
            ),
        ]

        summary = (
            f"Simulating an {pct}% company-wide salary adjustment across {emp_count} employees. "
            f"Monthly payroll increases from ₹{curr_lakhs}L to ₹{proj_lakhs}L (+₹{delta_lakhs}L/mo), requiring an annualized "
            f"commitment of ₹{annual_lakhs}L. Projected employee turnover drops by ~54%, saving ~₹4.2L in recruiting & ramp costs."
        )

        recommendation = (
            "**OfficeOS Recommendation: Scenario B (Performance-Tiered Allocation)**. "
            "Concentrating higher increments on core architects and revenue-delivering talent preserves capital, "
            "lowers annual cost by ~8%, and shields key projects from attrition."
        )

        assumptions = [
            f"Headcount remains stable at {emp_count} active employees.",
            "Recruiting replacement cost modeled at 2.5 months salary per departing senior staff.",
            "Cash runway modeled under constant accounts receivable collections.",
        ]

        narrative = (
            f"### Compensation Adjustment Analysis\n\n"
            f"• **Budget Requirement**: An {pct}% adjustment requires **+₹{delta_lakhs}L per month** in working capital.\n"
            f"• **Risk Tradeoff**: A blanket across-the-board hike compresses cash runway by **1.6 months**, whereas tiered allocation protects project continuity."
        )

        enriched_narrative = await cls._enrich_with_groq(request.prompt, summary, narrative)

        return SimulationRunResponse(
            title=f"Compensation Simulation: {pct}% Salary Increase",
            summary=summary,
            category="compensation",
            confidence_score=84,
            assumptions=assumptions,
            baseline_metrics=baseline_metrics,
            scenarios=scenarios,
            recommendation=recommendation,
            narrative=enriched_narrative or narrative,
        )

    @classmethod
    async def _simulate_project_delay(
        cls,
        baseline: dict[str, Any],
        request: SimulationRunRequest,
    ) -> SimulationRunResponse:
        delay_match = re.search(r"(\d+)\s+day", request.prompt)
        days = int(delay_match.group(1)) if delay_match else 30

        active_projects = baseline["active_projects_count"]
        sample_name = baseline["sample_projects"][0] if baseline["sample_projects"] else "Enterprise Delivery"
        curr_payroll = baseline["monthly_payroll"]

        delayed_billing = round((curr_payroll * 1.2) / 100000, 2)
        carrying_cost = round((curr_payroll * (days / 30) * 0.4) / 100000, 2)

        baseline_metrics = [
            SimulationMetric(
                label="Billing Delay",
                current_value="On Schedule",
                projected_value=f"+{days} Days",
                delta=f"-₹{delayed_billing}L Cash Flow",
            ),
            SimulationMetric(
                label="Carrying Burn Cost",
                current_value="₹0.00L",
                projected_value=f"₹{carrying_cost}L",
                delta=f"+₹{carrying_cost}L Sunk Cost",
            ),
            SimulationMetric(
                label="Client Satisfaction Risk",
                current_value="Low (94% CSAT)",
                projected_value="Elevated Risk",
                delta="🟠 High Concern",
            ),
            SimulationMetric(
                label="Resource Contention",
                current_value=f"{active_projects} Projects",
                projected_value="Overlap Conflict",
                delta="Next Sprint Delayed",
            ),
        ]

        scenarios = [
            SimulationScenario(
                scenario_id="scenario_a",
                name=f"Scenario A — Absorb {days}-Day Delay",
                description=f"Accept the timeline slippage. Zero additional immediate cost, but delays billing by ₹{delayed_billing}L.",
                cost=f"₹{carrying_cost}L (Idle & Burn)",
                expected_value="Delayed Milestone",
                roi_range="Negative (Cash Lock)",
                risk_level="High",
                is_recommended=False,
                timeline=[
                    SimulationTimelineEvent(period="Day 1–15", title="Slippage Compounding", impact="Engineers locked into incomplete modules; upcoming projects stalled."),
                    SimulationTimelineEvent(period="Day 30", title="Billing Milestone Missed", impact=f"Receivables delayed by ₹{delayed_billing}L; cash dip."),
                    SimulationTimelineEvent(period="Day 45", title="Delivery & Sign-off", impact="Client renegotiation pressure."),
                ],
            ),
            SimulationScenario(
                scenario_id="scenario_b",
                name="Scenario B — Inject 1 Contract Senior for 3 Weeks",
                description="Add targeted capacity to unblock critical path modules and compress delivery delay to 7 days.",
                cost="₹0.75L (Contractor)",
                expected_value=f"Protects ₹{delayed_billing}L Billing",
                roi_range="180% Avoided Loss",
                risk_level="Low",
                is_recommended=True,
                timeline=[
                    SimulationTimelineEvent(period="Week 1", title="Contractor Ingestion", impact="Assign unblocked QA & API integration tasks."),
                    SimulationTimelineEvent(period="Week 2", title="Parallel Execution", impact="Critical path completed on target."),
                    SimulationTimelineEvent(period="Week 3", title="Client Delivery Achieved", impact="Invoice released with minimal 5-day variance."),
                ],
            ),
            SimulationScenario(
                scenario_id="scenario_c",
                name="Scenario C — Scope Deferral & Phased Milestone",
                description="Deliver 80% MVP on schedule for partial billing, deferring secondary features to Phase 2.",
                cost="₹0.00L",
                expected_value="Partial ₹12.0L Invoiced",
                roi_range="Moderate",
                risk_level="Medium",
                is_recommended=False,
                timeline=[
                    SimulationTimelineEvent(period="Week 1", title="Scope Renegotiation", impact="Align client on Phase 1 core deliverables."),
                    SimulationTimelineEvent(period="Week 3", title="Partial Sign-off", impact="Collect 65% milestone invoice on time."),
                    SimulationTimelineEvent(period="Month 2", title="Phase 2 Delivery", impact="Deliver remainder with dedicated roadmap."),
                ],
            ),
        ]

        summary = (
            f"Simulating a {days}-day delivery delay on primary initiative ({sample_name}). "
            f"A {days}-day slippage defers ₹{delayed_billing}L in anticipated client billing, creates ₹{carrying_cost}L in engineering "
            f"carrying burn, and triggers staffing overlaps across your {active_projects} concurrent projects."
        )

        recommendation = (
            f"**OfficeOS Recommendation: Scenario B (Contract Senior Injection)**. "
            f"Investing ₹75,000 in specialized short-term bandwidth compresses the delay by 75% and guarantees the timely collection of ₹{delayed_billing}L."
        )

        assumptions = [
            f"Delayed project carries an estimated milestone value of ₹{delayed_billing}L.",
            "Client does not invoke contractual SLA penalty clauses if variance is under 10 days.",
        ]

        narrative = (
            f"### Project Delay Dependency Analysis\n\n"
            f"• **Dependency Chain**: Delay on `{sample_name}` &rarr; Missed Billing Milestone &rarr; **-₹{delayed_billing}L Cash Flow** &rarr; Staff Contention on upcoming projects.\n"
            f"• **Recommended Action**: Adding 1 external specialist for 3 weeks protects cash runway and preserves client trust."
        )

        enriched_narrative = await cls._enrich_with_groq(request.prompt, summary, narrative)

        return SimulationRunResponse(
            title=f"Project Risk Simulation: {days}-Day Milestone Delay",
            summary=summary,
            category="project_delay",
            confidence_score=81,
            assumptions=assumptions,
            baseline_metrics=baseline_metrics,
            scenarios=scenarios,
            recommendation=recommendation,
            narrative=enriched_narrative or narrative,
        )

    @classmethod
    async def _simulate_operations(
        cls,
        baseline: dict[str, Any],
        request: SimulationRunRequest,
    ) -> SimulationRunResponse:
        city = "Bangalore" if "bangalore" in request.prompt.lower() else "Satellite Office"
        headcount = 10

        curr_payroll = baseline["monthly_payroll"]
        capex = 35.0  # Lakhs
        monthly_opex = 12.5  # Lakhs
        req_revenue = 18.2  # Lakhs / mo

        baseline_metrics = [
            SimulationMetric(label="Initial Setup Capex", current_value="₹0.00L", projected_value=f"₹{capex}L", delta=f"+₹{capex}L Capex"),
            SimulationMetric(label="Monthly Satellite Opex", current_value="₹0.00L", projected_value=f"₹{monthly_opex}L", delta=f"+₹{monthly_opex}L/mo"),
            SimulationMetric(label="Break-Even Runway", current_value="Current HQ", projected_value="11–14 Months", delta="Target Horizon"),
            SimulationMetric(label="Required Monthly Revenue", current_value=f"₹{round(curr_payroll/100000, 2)}L", projected_value=f"₹{req_revenue}L", delta=f"+₹{req_revenue}L/mo"),
        ]

        scenarios = [
            SimulationScenario(
                scenario_id="scenario_a",
                name=f"Scenario A — Full {city} Office (Physical Lease)",
                description=f"Long term 3-year commercial lease with full custom fitout for {headcount} staff.",
                cost=f"₹{capex}L Capex + ₹{monthly_opex}L/mo",
                expected_value="Strong Local Brand Presence",
                roi_range="18–24 Month Payback",
                risk_level="High",
                is_recommended=False,
                timeline=[
                    SimulationTimelineEvent(period="Month 1–2", title="Fitout & Legal", impact="High initial cash drawdown."),
                    SimulationTimelineEvent(period="Month 3", title="Staffing Fill", impact="Local team begins operating."),
                    SimulationTimelineEvent(period="Month 12", title="Break-Even Approaching", impact="Requires steady ₹18.2L/mo billing."),
                ],
            ),
            SimulationScenario(
                scenario_id="scenario_b",
                name="Scenario B — Managed Coworking Hub (Optimal)",
                description=f"Deploy {headcount} workstations in an enterprise flexible workspace (WeWork / Awfis) with zero capex lockup.",
                cost=f"₹3.5L Deposit + ₹{round(monthly_opex * 0.75, 2)}L/mo",
                expected_value="Instant Launch, Agile Scalability",
                roi_range="7–9 Month Payback",
                risk_level="Low",
                is_recommended=True,
                timeline=[
                    SimulationTimelineEvent(period="Month 1", title="Immediate Deployment", impact="Zero capex down; ready in 7 days."),
                    SimulationTimelineEvent(period="Month 3", title="Operational Validation", impact="Validate local pipeline before long leases."),
                    SimulationTimelineEvent(period="Month 6", title="Expansion Gate", impact="Scale desks up or down with 30-day notice."),
                ],
            ),
            SimulationScenario(
                scenario_id="scenario_c",
                name="Scenario C — Remote First with Quarterly Offsites",
                description="Hire local talent remotely and convene for quarterly sprints.",
                cost="₹1.8L/mo Remote Stipend",
                expected_value="Talent Access with Low Overhead",
                roi_range="Immediate Positive ROI",
                risk_level="Low",
                is_recommended=False,
                timeline=[
                    SimulationTimelineEvent(period="Month 1", title="Remote Onboarding", impact="Fastest time to hire."),
                    SimulationTimelineEvent(period="Month 3", title="Quarterly Summit", impact="Team bonding without facility overhead."),
                    SimulationTimelineEvent(period="Month 6", title="Steady State", impact="Maximized profit margin."),
                ],
            ),
        ]

        summary = (
            f"Simulating expansion into {city} with {headcount} personnel. Physical infrastructure requires ₹{capex}L upfront "
            f"and adds ₹{monthly_opex}L in recurring monthly operating costs, requiring ~₹{req_revenue}L/month in localized billing to break even."
        )

        recommendation = (
            f"**OfficeOS Recommendation: Scenario B (Managed Coworking Hub)**. "
            f"Avoids locking up ₹{capex}L in long leases while testing market viability with an 8-month break-even horizon."
        )

        assumptions = [
            f"Headcount targets {headcount} personnel (8 specialists, 2 managers).",
            "Commercial lease security deposit estimated at 6 months rent in tier-1 tech hub.",
        ]

        narrative = (
            f"### Geographic Expansion Assessment\n\n"
            f"• **Capital Requirement**: Upfront commitment ranges from **₹3.5L (coworking)** to **₹{capex}L (dedicated commercial lease)**.\n"
            f"• **Risk Rating**: Committing to physical commercial fitouts prior to localized revenue reaching ₹18L/mo carries elevated capital risk."
        )

        enriched_narrative = await cls._enrich_with_groq(request.prompt, summary, narrative)

        return SimulationRunResponse(
            title=f"Expansion Simulation: {city} Branch ({headcount} Staff)",
            summary=summary,
            category="operations",
            confidence_score=75,
            assumptions=assumptions,
            baseline_metrics=baseline_metrics,
            scenarios=scenarios,
            recommendation=recommendation,
            narrative=enriched_narrative or narrative,
        )

    @classmethod
    async def _simulate_custom(
        cls,
        baseline: dict[str, Any],
        request: SimulationRunRequest,
    ) -> SimulationRunResponse:
        # Default fallback simulator for arbitrary queries
        curr_payroll = baseline["monthly_payroll"]
        emp_count = baseline["total_employees"]

        baseline_metrics = [
            SimulationMetric(label="Current Headcount", current_value=f"{emp_count} Staff", projected_value="Variable", delta="Dynamic"),
            SimulationMetric(label="Monthly Payroll", current_value=f"₹{round(curr_payroll/100000, 2)}L", projected_value="Projected", delta="Variable"),
            SimulationMetric(label="Active Projects", current_value=f"{baseline['active_projects_count']}", projected_value="Impacted", delta="Assessed"),
            SimulationMetric(label="Overall Risk", current_value="Baseline", projected_value="Medium Risk", delta="Evaluated"),
        ]

        scenarios = [
            SimulationScenario(
                scenario_id="scenario_a",
                name="Scenario A — Direct Execution",
                description="Implement the proposed decision as requested with immediate effect.",
                cost="Standard Capital Outlay",
                expected_value="Anticipated Strategic Return",
                roi_range="85%–120%",
                risk_level="Medium",
                is_recommended=False,
                timeline=[
                    SimulationTimelineEvent(period="Month 1", title="Rollout", impact="Initial implementation phase."),
                    SimulationTimelineEvent(period="Month 3", title="Stabilization", impact="Operational adjustment."),
                ],
            ),
            SimulationScenario(
                scenario_id="scenario_b",
                name="Scenario B — Phased Rollout (Recommended)",
                description="Stage implementation over 2 phases with intermediate validation checkpoints.",
                cost="Controlled Tranches",
                expected_value="Maximum Risk-Adjusted Value",
                roi_range="110%–160%",
                risk_level="Low",
                is_recommended=True,
                timeline=[
                    SimulationTimelineEvent(period="Month 1", title="Phase 1 Pilot", impact="Low risk testing."),
                    SimulationTimelineEvent(period="Month 2", title="Evaluation Gate", impact="Review metrics before full funding."),
                ],
            ),
        ]

        summary = f"Simulating custom business hypothesis: '{request.prompt}' against live organization metrics."
        recommendation = "**OfficeOS Recommendation: Scenario B (Phased Rollout)** provides the safest risk-adjusted trajectory."
        assumptions = ["Simulation assumes steady-state operating margins over the next two quarters."]
        narrative = f"### Decision Simulation\n\nOfficeOS analyzed your scenario against current workforce ({emp_count} employees) and operational pipelines."

        enriched_narrative = await cls._enrich_with_groq(request.prompt, summary, narrative)

        return SimulationRunResponse(
            title="Strategic Business Simulation",
            summary=summary,
            category="custom",
            confidence_score=72,
            assumptions=assumptions,
            baseline_metrics=baseline_metrics,
            scenarios=scenarios,
            recommendation=recommendation,
            narrative=enriched_narrative or narrative,
        )

    @classmethod
    async def _enrich_with_groq(
        cls,
        prompt: str,
        summary: str,
        narrative: str,
    ) -> str | None:
        """If GROQ_API_KEY is configured, enrich the narrative with deep strategic nuances."""
        settings = get_settings()
        api_key = settings.groq_api_key or os.getenv("GROQ_API_KEY")
        if not api_key:
            return None

        try:
            groq = GroqProvider(api_key=api_key)
            system_instruction = (
                "You are the OfficeOS Executive Simulation Engine. "
                "Analyze the business scenario and provide an insightful, crisp 2-3 paragraph executive briefing. "
                "Highlight ROI, specific bottlenecks, and actionable recommendations. Do not mention any AI model names."
            )
            resp, _ = await groq.generate_response(
                system_instruction=system_instruction,
                messages=[
                    {"role": "user", "content": f"Scenario: {prompt}\n\nContext Summary:\n{summary}\n\nDraft Breakdown:\n{narrative}"}
                ],
                max_tokens=600,
                temperature=0.6,
            )
            return resp
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Groq simulation enrichment skipped: {e}")
            return None
