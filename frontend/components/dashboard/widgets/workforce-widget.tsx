"use client";

import * as React from "react";
import Link from "next/link";
import { Users, ArrowRight } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";

interface DepartmentItem {
  name: string;
  count: number;
  pct: number;
}

interface WorkforceWidgetProps {
  departmentList: DepartmentItem[];
}

export function WorkforceWidget({ departmentList }: WorkforceWidgetProps) {
  return (
    <Card className="p-6 shadow-xs bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 h-full">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="h-4 w-4 text-primary-600 dark:text-primary-400" />
            <span>Department Headcount Distribution</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Workforce distribution across functional teams.
          </CardDescription>
        </div>
        <Link
          href={ROUTES.EMPLOYEES}
          className="text-xs text-primary-600 dark:text-primary-400 font-medium hover:underline flex items-center gap-0.5"
        >
          <span>Directory</span>
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="space-y-3.5 pt-4">
        {departmentList.map((dep, idx) => (
          <div key={idx} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">{dep.name}</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {dep.count} {dep.count === 1 ? "member" : "members"}{" "}
                <span className="text-slate-400 text-[11px] font-normal">({dep.pct}%)</span>
              </span>
            </div>
            <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  idx === 0
                    ? "bg-primary-600 dark:bg-primary-500"
                    : idx === 1
                    ? "bg-indigo-500 dark:bg-indigo-400"
                    : "bg-emerald-500 dark:bg-emerald-400"
                }`}
                style={{ width: `${dep.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
