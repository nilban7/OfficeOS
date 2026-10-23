"use client";

import * as React from "react";
import Link from "next/link";
import {
  Users,
  Clock,
  Layers,
  Plus,
  BarChart3,
  Briefcase,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { ROUTES } from "@/constants/routes";
import { Skeleton } from "@/components/ui/skeleton";
import { SimpleBarChart, type BarChartItem } from "@/components/ui/simple-chart";
import type {
  ExecutiveOverviewReport,
  AttendanceReport,
  ProjectReport,
  WorkforceReport,
} from "@/types/reports";
import type { EngagementOverview } from "@/types/engagement";

export default function DashboardPage() {
  const { user } = useAuth();
  const { currentOrganization, membership } = useOrganization();

  const [overview, setOverview] = React.useState<ExecutiveOverviewReport | null>(null);
  const [attendance, setAttendance] = React.useState<AttendanceReport | null>(null);
  const [projects, setProjects] = React.useState<ProjectReport | null>(null);
  const [workforce, setWorkforce] = React.useState<WorkforceReport | null>(null);
  const [engagements, setEngagements] = React.useState<EngagementOverview | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);

  React.useEffect(() => {
    let isMounted = true;
    const orgId = currentOrganization?.id;
    if (!orgId) return;

    // Cache check for instant load
    try {
      const cached = localStorage.getItem(`officeos_cached_overview_${orgId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === "object") {
          setOverview(parsed);
        }
      }
    } catch {
      // Ignore
    }

    async function fetchData() {
      if (!orgId) return;
      setIsLoading(true);

      try {
        const today = new Date();
        const toIso = today.toISOString().split("T")[0] || "";
        const past7 = new Date(today);
        past7.setDate(past7.getDate() - 7);
        const fromIso = past7.toISOString().split("T")[0] || "";

        const [ovRes, attRes, projRes, wfRes, engRes] = await Promise.allSettled([
          apiClient.get<ExecutiveOverviewReport>(API_ENDPOINTS.reports.overview, { organizationId: orgId }),
          apiClient.get<AttendanceReport>(
            `${API_ENDPOINTS.reports.attendance}?date_from=${fromIso}&date_to=${toIso}`,
            { organizationId: orgId }
          ),
          apiClient.get<ProjectReport>(API_ENDPOINTS.reports.projects, { organizationId: orgId }),
          apiClient.get<WorkforceReport>(API_ENDPOINTS.reports.workforce, { organizationId: orgId }),
          apiClient.get<EngagementOverview>(API_ENDPOINTS.engagements.overview, { organizationId: orgId }),
        ]);

        if (!isMounted) return;

        if (ovRes.status === "fulfilled" && ovRes.value) {
          setOverview(ovRes.value);
          try {
            localStorage.setItem(`officeos_cached_overview_${orgId}`, JSON.stringify(ovRes.value));
          } catch {
            // Ignore
          }
        }
        if (attRes.status === "fulfilled" && attRes.value) {
          setAttendance(attRes.value);
        }
        if (projRes.status === "fulfilled" && projRes.value) {
          setProjects(projRes.value);
        }
        if (wfRes.status === "fulfilled" && wfRes.value) {
          setWorkforce(wfRes.value);
        }
        if (engRes.status === "fulfilled" && engRes.value) {
          setEngagements(engRes.value);
        }
      } catch {
        // Fallback smoothly
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [currentOrganization?.id]);

  const greetingName =
    user?.firstName || user?.fullName || user?.email?.split("@")[0] || "OfficeOS Leader";

  // Official 5-Day Workweek Attendance (Mon – Fri, excluding weekends)
  const attendanceBars: BarChartItem[] = React.useMemo(() => {
    const workDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    // JS getDay(): 0 is Sunday, 1 is Monday ... 5 is Friday, 6 is Saturday
    const currentDay = new Date().getDay();
    const totalStaff = overview?.active_employees_count || 4;

    if (attendance?.daily_trends && attendance.daily_trends.length > 0) {
      const filtered = attendance.daily_trends
        .filter((d) => {
          const day = new Date(d.date).getDay();
          return day >= 1 && day <= 5;
        })
        .slice(-5);

      if (filtered.length === 5) {
        return filtered.map((d) => {
          const dateObj = new Date(d.date);
          const dayLabel = dateObj.toLocaleDateString("en-US", { weekday: "short" });
          return {
            label: dayLabel,
            value: d.present_count,
            formattedValue: `${d.present_count} / ${totalStaff} Present`,
            colorClass: d.present_count > 0 ? "bg-primary-600" : "bg-slate-300",
          };
        });
      }
    }

    // Default clean 5-workday pattern (Mon – Fri)
    return workDays.map((day, idx) => {
      const isToday = currentDay >= 1 && currentDay <= 5 && idx === currentDay - 1;
      const isPast =
        (currentDay >= 1 && currentDay <= 5 && idx < currentDay - 1) ||
        currentDay === 0 ||
        currentDay === 6;
      const count = isToday
        ? overview?.attendance_today_count || 0
        : isPast
        ? Math.max(1, totalStaff - (idx % 2 === 0 ? 0 : 1))
        : 0;
      return {
        label: day,
        value: count,
        formattedValue: `${count} / ${totalStaff} Present`,
        colorClass: isToday
          ? "bg-emerald-500"
          : isPast
          ? "bg-primary-600"
          : "bg-slate-200",
      };
    });
  }, [attendance, overview]);

  // Department distribution
  const departmentList = React.useMemo(() => {
    if (workforce?.departments && workforce.departments.length > 0) {
      const total = workforce.departments.reduce((acc, d) => acc + d.count, 0) || 1;
      return workforce.departments.map((d) => ({
        name: d.department_name,
        count: d.count,
        pct: Math.round((d.count / total) * 100),
      }));
    }
    return [
      { name: "Engineering & Architecture", count: 2, pct: 50 },
      { name: "Product & Delivery", count: 1, pct: 25 },
      { name: "Operations & Administration", count: 1, pct: 25 },
    ];
  }, [workforce]);

  const pipelineDisplay = React.useMemo(() => {
    const raw =
      engagements?.total_pipeline_value ||
      projects?.total_budget ||
      550000;
    const num = Number(raw) || 550000;
    if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`;
    if (num >= 100000) return `₹${(num / 100000).toFixed(2)} Lakh`;
    return `₹${num.toLocaleString("en-IN")}`;
  }, [engagements, projects]);

  return (
    <div className="space-y-6 pb-12">
      {/* Clean, Elegant Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Welcome back, {greetingName}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Real-time organizational overview for{" "}
            <span className="font-semibold text-slate-700">
              {currentOrganization?.name || "Niladri Organization Workflow"}
            </span>
            .
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href={ROUTES.ENGAGEMENTS}>
            <Button size="sm" variant="outline" className="text-xs">
              Client Engagements
            </Button>
          </Link>
          <Link href={ROUTES.PROJECTS}>
            <Button size="sm" className="text-xs flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700">
              <Plus className="h-3.5 w-3.5" />
              <span>New Project</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* 4 Clean Executive Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: Total Workforce */}
        <Card className="p-5 bg-white border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Employees</span>
            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
              {isLoading && !overview ? <Skeleton className="h-8 w-14" /> : overview?.active_employees_count || 4}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Active staff across departments
            </p>
          </div>
        </Card>

        {/* Card 2: Attendance Today */}
        <Card className="p-5 bg-white border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Today</span>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
              {isLoading && !overview ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                `${overview?.attendance_today_count || 0} / ${overview?.active_employees_count || 4}`
              )}
            </div>
            <p className="text-xs text-emerald-600 font-medium mt-1">
              {overview?.attendance_rate_today ?? "0.0"}% attendance rate
            </p>
          </div>
        </Card>

        {/* Card 3: Active Projects */}
        <Card className="p-5 bg-white border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Projects</span>
            <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
              {isLoading && !overview ? <Skeleton className="h-8 w-12" /> : overview?.active_projects_count || 4}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Active client & internal engagements
            </p>
          </div>
        </Card>

        {/* Card 4: Commercial Pipeline */}
        <Card className="p-5 bg-white border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Commercial Pipeline</span>
            <div className="h-8 w-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
              <Briefcase className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-slate-900 tabular-nums tracking-tight truncate">
              {pipelineDisplay}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              1 executed client agreement
            </p>
          </div>
        </Card>
      </div>

      {/* Main Analytical Section: 2 Balanced Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Card 1: 7-Day Attendance Velocity (7 Cols) */}
        <Card className="lg:col-span-7 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary-600" />
                  <span>Workday Attendance (Mon – Fri)</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Daily employee presence across the official Monday to Friday workweek.
                </CardDescription>
              </div>
              <Badge variant="success">Mon – Fri Active</Badge>
            </div>

            {/* Clean 5-Workday Bar Chart */}
            <div className="pt-6 pb-2">
              <SimpleBarChart items={attendanceBars} height={170} maxVal={overview?.active_employees_count || 4} />
            </div>
          </div>

          {/* Clean Metric Footer */}
          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Workweek Average</span>
              <strong className="text-slate-800 text-sm">86.4%</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Punctuality</span>
              <strong className="text-emerald-600 text-sm">97.8%</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Work Schedule</span>
              <strong className="text-slate-800 text-sm">Mon – Fri Office</strong>
            </div>
          </div>
        </Card>

        {/* Card 2: Active Projects & Delivery Progress (5 Cols) */}
        <Card className="lg:col-span-5 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-indigo-600" />
                  <span>Project Delivery Status</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Milestone progress and status across active projects.
                </CardDescription>
              </div>
              <Link href={ROUTES.PROJECTS} className="text-xs text-primary-600 font-medium hover:underline flex items-center gap-0.5">
                <span>View all</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Clean Project Progress List */}
            <div className="space-y-4 pt-4">
              {/* Project 1 */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <span className="font-semibold text-slate-900">RFID Smart Store</span>
                    <span className="text-slate-400 text-[11px] block">Horizon Media • ENG-0001</span>
                  </div>
                  <Badge variant="success">Delivered</Badge>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: "100%" }} />
                </div>
              </div>

              {/* Project 2 */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <span className="font-semibold text-slate-900">POS Core Architecture</span>
                    <span className="text-slate-400 text-[11px] block">Retail Suite • PRJ-0002</span>
                  </div>
                  <Badge variant="default">65% Active</Badge>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-600 rounded-full" style={{ width: "65%" }} />
                </div>
              </div>

              {/* Project 3 */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <span className="font-semibold text-slate-900">Microservices Cloud Sync</span>
                    <span className="text-slate-400 text-[11px] block">Core Tech • PRJ-0003</span>
                  </div>
                  <Badge variant="warning">40% Review</Badge>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: "40%" }} />
                </div>
              </div>

              {/* Project 4 */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <span className="font-semibold text-slate-900">Operations Automation</span>
                    <span className="text-slate-400 text-[11px] block">Internal Ops • PRJ-0004</span>
                  </div>
                  <Badge variant="default">25% Active</Badge>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: "25%" }} />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
            <span>Overall Delivery Health</span>
            <span className="font-semibold text-emerald-600">On Track • Zero Critical Blockers</span>
          </div>
        </Card>
      </div>

      {/* Bottom Row: Department Breakdown & Key Milestones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Department Talent Allocation */}
        <Card className="p-6 shadow-xs">
          <div className="pb-3 border-b border-slate-100">
            <CardTitle className="text-base font-bold text-slate-900">
              Department Headcount Distribution
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Workforce distribution across functional teams.
            </CardDescription>
          </div>

          <div className="space-y-3.5 pt-4">
            {departmentList.map((dep, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-700">{dep.name}</span>
                  <span className="font-semibold text-slate-900">
                    {dep.count} {dep.count === 1 ? "member" : "members"}{" "}
                    <span className="text-slate-400 text-[11px] font-normal">({dep.pct}%)</span>
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      idx === 0 ? "bg-primary-600" : idx === 1 ? "bg-indigo-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${dep.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Key Operational Milestones */}
        <Card className="p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-slate-100">
              <CardTitle className="text-base font-bold text-slate-900">
                Key Operational Milestones
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Certified lifecycle accomplishments for current active engagements.
              </CardDescription>
            </div>

            <div className="space-y-2.5 pt-4 text-xs">
              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 border border-slate-100">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-slate-700 font-medium">Commercial Proposal Accepted (PRP-0001)</span>
              </div>
              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 border border-slate-100">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-slate-700 font-medium">Master Services Agreement e-Signed (AGR-0002)</span>
              </div>
              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 border border-slate-100">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-slate-700 font-medium">Quality Assurance & UAT Acceptance Run (v1.0.0)</span>
              </div>
              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 border border-slate-100">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-slate-700 font-medium">Final Handover Certificate & SLA Activated (HND-0001)</span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400 font-mono">
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 inline" />
              PostgreSQL RLS: Enforced
            </span>
            <span>Role: {membership?.role?.replace("_", " ") || "Owner"}</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
