"use client";

import * as React from "react";
import Link from "next/link";
import { BarChart3, ArrowRight } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SimpleBarChart, type BarChartItem } from "@/components/ui/simple-chart";
import { ROUTES } from "@/constants/routes";
import type { ExecutiveOverviewReport } from "@/types/reports";

interface AttendanceWidgetProps {
  attendanceBars: BarChartItem[];
  overview?: ExecutiveOverviewReport | null;
}

export function AttendanceWidget({
  attendanceBars,
  overview,
}: AttendanceWidgetProps) {
  return (
    <Card className="p-6 shadow-xs flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 h-full">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary-600 dark:text-primary-400" />
              <span>Workday Attendance (Mon – Fri)</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Daily employee presence across the official Monday to Friday workweek.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success">Mon – Fri Active</Badge>
            <Link
              href={ROUTES.ATTENDANCE}
              className="text-xs text-primary-600 dark:text-primary-400 font-medium hover:underline flex items-center gap-0.5 ml-2"
            >
              <span>Details</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Clean 5-Workday Bar Chart */}
        <div className="pt-6 pb-2">
          <SimpleBarChart
            items={attendanceBars}
            height={170}
            maxVal={overview?.active_employees_count || 4}
          />
        </div>
      </div>

      {/* Clean Metric Footer */}
      <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs mt-4">
        <div>
          <span className="text-slate-400 dark:text-slate-400 block text-[11px]">Workweek Average</span>
          <strong className="text-slate-800 dark:text-slate-200 text-sm">86.4%</strong>
        </div>
        <div>
          <span className="text-slate-400 dark:text-slate-400 block text-[11px]">Punctuality</span>
          <strong className="text-emerald-600 dark:text-emerald-400 text-sm">97.8%</strong>
        </div>
        <div>
          <span className="text-slate-400 dark:text-slate-400 block text-[11px]">Work Schedule</span>
          <strong className="text-slate-800 dark:text-slate-200 text-sm">Mon – Fri Office</strong>
        </div>
      </div>
    </Card>
  );
}
