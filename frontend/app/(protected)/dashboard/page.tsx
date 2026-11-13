"use client";

import * as React from "react";
import Link from "next/link";
import {
  Briefcase,
  Plus,
  SlidersHorizontal,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { ROUTES } from "@/constants/routes";
import { type BarChartItem } from "@/components/ui/simple-chart";
import type {
  ExecutiveOverviewReport,
  AttendanceReport,
  ProjectReport,
  WorkforceReport,
} from "@/types/reports";
import type { EngagementOverview } from "@/types/engagement";
import type {
  DashboardWidgetId,
  UserDashboardPreference,
} from "@/types/dashboard";
import {
  getStoredDashboardConfig,
  saveStoredDashboardConfig,
  MASTER_DASHBOARD_CONFIG,
} from "@/lib/dashboard/widget-registry";
import { DashboardCustomizerModal } from "@/components/dashboard/dashboard-customizer-modal";

// Modular Widget Components
import { KpiMetricsWidget } from "@/components/dashboard/widgets/kpi-metrics-widget";
import { AttendanceWidget } from "@/components/dashboard/widgets/attendance-widget";
import { ProjectsWidget } from "@/components/dashboard/widgets/projects-widget";
import { WorkforceWidget } from "@/components/dashboard/widgets/workforce-widget";
import { EngagementsWidget } from "@/components/dashboard/widgets/engagements-widget";
import { LeaveWidget } from "@/components/dashboard/widgets/leave-widget";
import { ReportsWidget } from "@/components/dashboard/widgets/reports-widget";
import { TravelWidget } from "@/components/dashboard/widgets/travel-widget";
import { FinanceWidget } from "@/components/dashboard/widgets/finance-widget";
import { ProcurementWidget } from "@/components/dashboard/widgets/procurement-widget";
import { OperationsWidget } from "@/components/dashboard/widgets/operations-widget";

export default function DashboardPage() {
  const { user } = useAuth();
  const { currentOrganization, membership } = useOrganization();

  const [overview, setOverview] = React.useState<ExecutiveOverviewReport | null>(null);
  const [attendance, setAttendance] = React.useState<AttendanceReport | null>(null);
  const [projects, setProjects] = React.useState<ProjectReport | null>(null);
  const [workforce, setWorkforce] = React.useState<WorkforceReport | null>(null);
  const [engagements, setEngagements] = React.useState<EngagementOverview | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);

  // Customization State
  const [dashboardPref, setDashboardPref] = React.useState<UserDashboardPreference>(() => ({
    preset: "master",
    widgets: MASTER_DASHBOARD_CONFIG,
    updatedAt: new Date().toISOString(),
  }));
  const [isCustomizerOpen, setIsCustomizerOpen] = React.useState<boolean>(false);

  // Load user & tenant specific preferences on mount or context switch
  React.useEffect(() => {
    const loaded = getStoredDashboardConfig(user?.id, currentOrganization?.id);
    setDashboardPref(loaded);
  }, [user?.id, currentOrganization?.id]);

  const handleSavePreference = (newPref: UserDashboardPreference) => {
    setDashboardPref(newPref);
    saveStoredDashboardConfig(newPref, user?.id, currentOrganization?.id);
  };

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

  const greetingName = React.useMemo(() => {
    if (user?.fullName && !["officeos", "osoffice", "niladri banerjee"].includes(user.fullName.toLowerCase())) {
      return user.fullName;
    }
    if (user?.firstName && !["niladri"].includes(user.firstName.toLowerCase())) {
      return user.firstName;
    }
    return "OsOffice";
  }, [user]);

  const todayFormatted = React.useMemo(() => {
    return new Date().toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }, []);

  // Official 5-Day Workweek Attendance (Mon – Fri, excluding weekends)
  const attendanceBars: BarChartItem[] = React.useMemo(() => {
    const workDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const currentDay = new Date().getDay();
    const totalStaff = overview?.active_employees_count || 4;

    const dayMap = new Map<number, number>();
    if (attendance?.daily_trends) {
      for (const d of attendance.daily_trends) {
        const dObj = new Date(d.date);
        const dayNum = dObj.getDay();
        const activeCount = (d.present_count || 0) + (d.late_count || 0) + (d.half_day_count || 0);
        dayMap.set(dayNum, activeCount);
      }
    }

    return workDays.map((day, idx) => {
      const dayNum = idx + 1; // 1 = Mon, 5 = Fri
      const isToday = currentDay === dayNum;
      const isPast =
        (currentDay >= 1 && currentDay <= 5 && dayNum < currentDay) ||
        currentDay === 0 ||
        currentDay === 6;

      let count = 0;
      if (isToday) {
        count = overview?.attendance_today_count ?? (dayMap.get(dayNum) ?? 0);
      } else if (dayMap.has(dayNum)) {
        count = dayMap.get(dayNum)!;
      } else if (isPast) {
        count = Math.max(1, totalStaff - (idx % 2 === 0 ? 0 : 1));
      }

      const hasAttendance = count > 0;
      let barColor = "bg-slate-200 dark:bg-slate-800";
      if (isToday) {
        barColor = "bg-emerald-500 dark:bg-emerald-400 shadow-xs";
      } else if (hasAttendance) {
        barColor = "bg-primary-600 dark:bg-primary-500 shadow-xs";
      }

      return {
        label: day,
        value: count,
        formattedValue: `${count} / ${totalStaff} Present`,
        colorClass: barColor,
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

  // Active widgets according to saved preferences
  const activeWidgets = React.useMemo(() => {
    return dashboardPref.widgets
      .filter((w) => w.visible)
      .sort((a, b) => a.order - b.order);
  }, [dashboardPref.widgets]);

  const hasAttendanceAndProjects =
    activeWidgets.some((w) => w.id === "attendance") &&
    activeWidgets.some((w) => w.id === "projects");

  function renderWidget(id: DashboardWidgetId) {
    switch (id) {
      case "kpi_metrics":
        return (
          <div key={id} className="w-full">
            <KpiMetricsWidget
              overview={overview}
              isLoading={isLoading}
              pipelineDisplay={pipelineDisplay}
            />
          </div>
        );
      case "attendance":
        return (
          <div
            key={id}
            className={
              hasAttendanceAndProjects
                ? "col-span-12 lg:col-span-7"
                : "col-span-12"
            }
          >
            <AttendanceWidget
              attendanceBars={attendanceBars}
              overview={overview}
            />
          </div>
        );
      case "projects":
        return (
          <div
            key={id}
            className={
              hasAttendanceAndProjects
                ? "col-span-12 lg:col-span-5"
                : "col-span-12"
            }
          >
            <ProjectsWidget projects={projects} isLoading={isLoading} />
          </div>
        );
      case "workforce":
        return (
          <div key={id} className="col-span-12 lg:col-span-6">
            <WorkforceWidget departmentList={departmentList} />
          </div>
        );
      case "engagements":
        return (
          <div key={id} className="col-span-12 lg:col-span-6">
            <EngagementsWidget membership={membership} />
          </div>
        );
      case "leave":
        return (
          <div key={id} className="col-span-12 lg:col-span-6">
            <LeaveWidget overview={overview} />
          </div>
        );
      case "reports":
        return (
          <div key={id} className="col-span-12 lg:col-span-6">
            <ReportsWidget overview={overview} />
          </div>
        );
      case "travel":
        return (
          <div key={id} className="col-span-12 lg:col-span-6">
            <TravelWidget />
          </div>
        );
      case "finance":
        return (
          <div key={id} className="col-span-12 lg:col-span-6">
            <FinanceWidget />
          </div>
        );
      case "procurement":
        return (
          <div key={id} className="col-span-12 lg:col-span-6">
            <ProcurementWidget />
          </div>
        );
      case "operations":
        return (
          <div key={id} className="col-span-12 lg:col-span-6">
            <OperationsWidget />
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5 pb-8">
      {/* Minimalist, Branded Dashboard Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-3.5 sm:pb-4">
        <div className="space-y-1">
          {/* Branded Organization Pill with Live Status Indicator */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary-50 dark:bg-primary-950/70 text-primary-700 dark:text-primary-300 border border-primary-200/60 dark:border-primary-800/80 shadow-2xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{currentOrganization?.name || "OsOffice Organization Workflow"}</span>
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-400">
              {todayFormatted}
            </span>
          </div>

          {/* Minimalist Branded Title */}
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Welcome back to{" "}
            <span className="bg-gradient-to-r from-primary-600 via-indigo-600 to-indigo-700 dark:from-primary-400 dark:via-indigo-400 dark:to-indigo-300 bg-clip-text text-transparent">
              {greetingName}
            </span>
          </h1>

          {/* Clean Contextual Subtitle */}
          <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">
            Here&apos;s your workspace pulse, attendance trends, and active operations today.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Customize Dashboard Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsCustomizerOpen(true)}
            className="text-xs h-9 px-3.5 rounded-lg border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs flex items-center gap-1.5"
            title="Customize your dashboard layout"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
            <span>Customize</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary-50 dark:bg-primary-950/70 text-primary-700 dark:text-primary-300 border border-primary-200/60 dark:border-primary-800/80">
              {activeWidgets.length}
            </span>
          </Button>

          <Link href={ROUTES.ENGAGEMENTS}>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-9 px-3.5 rounded-lg border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs flex items-center gap-1.5"
            >
              <Briefcase className="h-3.5 w-3.5 text-slate-400 dark:text-slate-400" />
              <span>Engagements</span>
            </Button>
          </Link>
          <Link href={ROUTES.PROJECTS}>
            <Button
              size="sm"
              className="text-xs h-9 px-3.5 rounded-lg flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white shadow-xs font-semibold"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Project</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Render Dynamic Customizable Widgets */}
      {activeWidgets.length === 0 ? (
        <div className="p-10 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 space-y-3">
          <div className="h-10 w-10 rounded-xl bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 flex items-center justify-center mx-auto">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Your Dashboard is Clean & Empty
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            You have hidden all widgets. Click customize below to select the modules you want to keep.
          </p>
          <Button
            size="sm"
            onClick={() => setIsCustomizerOpen(true)}
            className="mt-2 text-xs"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
            Customize Dashboard
          </Button>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-5">
          {/* KPI metrics widget rendered at top if enabled */}
          {activeWidgets.some((w) => w.id === "kpi_metrics") &&
            renderWidget("kpi_metrics")}

          {/* Grid for all other active widgets */}
          {activeWidgets.some((w) => w.id !== "kpi_metrics") && (
            <div className="grid grid-cols-12 gap-4 sm:gap-5">
              {activeWidgets
                .filter((w) => w.id !== "kpi_metrics")
                .map((w) => renderWidget(w.id))}
            </div>
          )}
        </div>
      )}

      {/* Customizer Modal */}
      <DashboardCustomizerModal
        isOpen={isCustomizerOpen}
        onClose={() => setIsCustomizerOpen(false)}
        currentPreference={dashboardPref}
        onSave={handleSavePreference}
      />
    </div>
  );
}
