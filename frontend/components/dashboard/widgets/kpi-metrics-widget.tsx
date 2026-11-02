"use client";

import * as React from "react";
import { Users, Clock, Layers, Briefcase } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ExecutiveOverviewReport } from "@/types/reports";

interface KpiMetricsWidgetProps {
  overview: ExecutiveOverviewReport | null;
  isLoading: boolean;
  pipelineDisplay: string;
}

export function KpiMetricsWidget({
  overview,
  isLoading,
  pipelineDisplay,
}: KpiMetricsWidgetProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
      {/* Card 1: Total Workforce */}
      <Card className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span className="text-xs font-semibold uppercase tracking-wider">Total Employees</span>
          <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-transparent dark:border-blue-800/40 flex items-center justify-center">
            <Users className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight">
            {isLoading && !overview ? <Skeleton className="h-8 w-14" /> : overview?.active_employees_count || 4}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-400 mt-1">
            Active staff across departments
          </p>
        </div>
      </Card>

      {/* Card 2: Attendance Today */}
      <Card className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span className="text-xs font-semibold uppercase tracking-wider">Active Today</span>
          <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-transparent dark:border-emerald-800/40 flex items-center justify-center">
            <Clock className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight">
            {isLoading && !overview ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              `${overview?.attendance_today_count || 0} / ${overview?.active_employees_count || 4}`
            )}
          </div>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
            {overview?.attendance_rate_today ?? "0.0"}% attendance rate
          </p>
        </div>
      </Card>

      {/* Card 3: Active Projects */}
      <Card className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span className="text-xs font-semibold uppercase tracking-wider">Active Projects</span>
          <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-transparent dark:border-indigo-800/40 flex items-center justify-center">
            <Layers className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight">
            {isLoading && !overview ? <Skeleton className="h-8 w-12" /> : overview?.active_projects_count || 4}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-400 mt-1">
            Active client & internal engagements
          </p>
        </div>
      </Card>

      {/* Card 4: Commercial Pipeline */}
      <Card className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span className="text-xs font-semibold uppercase tracking-wider">Commercial Pipeline</span>
          <div className="h-8 w-8 rounded-lg bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 border border-transparent dark:border-violet-800/40 flex items-center justify-center">
            <Briefcase className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight truncate">
            {pipelineDisplay}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-400 mt-1">
            Executed client agreements
          </p>
        </div>
      </Card>
    </div>
  );
}
