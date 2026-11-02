"use client";

import * as React from "react";
import Link from "next/link";
import { Calendar, Clock, ArrowRight } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import type { ExecutiveOverviewReport } from "@/types/reports";

interface LeaveWidgetProps {
  overview?: ExecutiveOverviewReport | null;
}

export function LeaveWidget({ overview }: LeaveWidgetProps) {
  const pendingCount = overview?.pending_leaves_count ?? 0;

  return (
    <Card className="p-6 shadow-xs flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 h-full">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Leave & Time Off</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Review team absence, pending approvals, and upcoming holidays.
            </CardDescription>
          </div>
          <Link
            href={ROUTES.LEAVE}
            className="text-xs text-primary-600 dark:text-primary-400 font-medium hover:underline flex items-center gap-0.5"
          >
            <span>Manage</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Status Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 pt-4">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Pending Approvals
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {pendingCount}
              </span>
              <span className="text-[11px] text-slate-400">requests</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {pendingCount === 0 ? "All requests processed" : "Awaiting supervisor signoff"}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-100/60 dark:border-emerald-800/40">
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider block">
              Team Presence
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                100%
              </span>
              <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80">available</span>
            </div>
            <p className="text-[11px] text-emerald-600/90 dark:text-emerald-400/90 mt-0.5">
              Zero unplanned leaves today
            </p>
          </div>
        </div>

        {/* Upcoming Team Leave Notice */}
        <div className="mt-4 p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" />
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              Next Organization Holiday
            </span>
          </div>
          <Badge variant="outline" className="text-[11px]">Upcoming • Republic Day</Badge>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs mt-4">
        <span className="text-slate-500 dark:text-slate-400">Leave Policy Enforced</span>
        <Link href={ROUTES.LEAVE}>
          <Button size="sm" variant="outline" className="text-xs h-7 px-2.5">
            View Leave Calendar
          </Button>
        </Link>
      </div>
    </Card>
  );
}
