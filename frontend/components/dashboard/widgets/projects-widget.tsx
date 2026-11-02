"use client";

import * as React from "react";
import Link from "next/link";
import { Layers, ArrowRight } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/constants/routes";
import type { ProjectReport } from "@/types/reports";

interface ProjectsWidgetProps {
  projects?: ProjectReport | null;
  isLoading?: boolean;
}

export function ProjectsWidget(_props: ProjectsWidgetProps = {}) {
  return (
    <Card className="p-6 shadow-xs flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 h-full">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span>Project Delivery Status</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Milestone progress and status across active projects.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={ROUTES.PROJECTS}
              className="text-xs text-primary-600 dark:text-primary-400 font-medium hover:underline flex items-center gap-0.5"
            >
              <span>View all</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Clean Project Progress List */}
        <div className="space-y-4 pt-4">
          {/* Project 1 */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <div>
                <span className="font-semibold text-slate-900 dark:text-white">RFID Smart Store</span>
                <span className="text-slate-400 dark:text-slate-400 text-[11px] block">Horizon Media • ENG-0001</span>
              </div>
              <Badge variant="success">Delivered</Badge>
            </div>
            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: "100%" }} />
            </div>
          </div>

          {/* Project 2 */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <div>
                <span className="font-semibold text-slate-900 dark:text-white">POS Core Architecture</span>
                <span className="text-slate-400 dark:text-slate-400 text-[11px] block">Retail Suite • PRJ-0002</span>
              </div>
              <Badge variant="default">65% Active</Badge>
            </div>
            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-primary-600 dark:bg-primary-500 rounded-full" style={{ width: "65%" }} />
            </div>
          </div>

          {/* Project 3 */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <div>
                <span className="font-semibold text-slate-900 dark:text-white">Microservices Cloud Sync</span>
                <span className="text-slate-400 dark:text-slate-400 text-[11px] block">Core Tech • PRJ-0003</span>
              </div>
              <Badge variant="warning">40% Review</Badge>
            </div>
            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: "40%" }} />
            </div>
          </div>

          {/* Project 4 */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <div>
                <span className="font-semibold text-slate-900 dark:text-white">Operations Automation</span>
                <span className="text-slate-400 dark:text-slate-400 text-[11px] block">Internal Ops • PRJ-0004</span>
              </div>
              <Badge variant="default">25% Active</Badge>
            </div>
            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: "25%" }} />
            </div>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 mt-4">
        <span>Overall Delivery Health</span>
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">On Track • Zero Critical Blockers</span>
      </div>
    </Card>
  );
}
