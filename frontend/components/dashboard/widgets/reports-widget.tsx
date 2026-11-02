"use client";

import * as React from "react";
import Link from "next/link";
import { FileSpreadsheet, TrendingUp, Users, ArrowRight } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/constants/routes";
import type { ExecutiveOverviewReport } from "@/types/reports";

interface ReportsWidgetProps {
  overview?: ExecutiveOverviewReport | null;
}

export function ReportsWidget({ overview }: ReportsWidgetProps) {
  return (
    <Card className="p-6 shadow-xs flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 h-full">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary-600 dark:text-primary-400" />
              <span>Executive Reports & Analytics</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Workforce capacity, attendance rate, and analytical velocity.
            </CardDescription>
          </div>
          <Link
            href={ROUTES.REPORTS}
            className="text-xs text-primary-600 dark:text-primary-400 font-medium hover:underline flex items-center gap-0.5"
          >
            <span>Full Reports</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Analytics Breakdown Grid */}
        <div className="grid grid-cols-2 gap-3 pt-4">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Attendance Velocity
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {overview?.attendance_rate_today ?? "100"}%
              </span>
              <Badge variant="success" className="text-[10px] py-0 px-1.5">
                Target met
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Consistent Mon–Fri staffing
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Active Projects
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {overview?.active_projects_count ?? 4}
              </span>
              <Badge variant="default" className="text-[10px] py-0 px-1.5">
                In Flight
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              100% on-track delivery
            </p>
          </div>
        </div>

        {/* Quick Report Navigation Links */}
        <div className="mt-4 space-y-2">
          <Link
            href={ROUTES.REPORTS}
            className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800 text-xs transition-colors"
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary-600 dark:text-primary-400" />
              <span className="font-medium text-slate-800 dark:text-slate-200">
                Attendance Trends & Summary Report
              </span>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
          </Link>
          <Link
            href={ROUTES.REPORTS}
            className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800 text-xs transition-colors"
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span className="font-medium text-slate-800 dark:text-slate-200">
                Workforce Capacity & Allocation Report
              </span>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
          </Link>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 mt-4">
        <span>Audited Weekly Rollup</span>
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">Export Available (PDF/CSV)</span>
      </div>
    </Card>
  );
}
