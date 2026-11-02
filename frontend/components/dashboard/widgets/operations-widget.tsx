"use client";

import * as React from "react";
import Link from "next/link";
import { CheckSquare, Zap, ArrowRight } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/constants/routes";

export function OperationsWidget() {
  return (
    <Card className="p-6 shadow-xs flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 h-full">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-primary-600 dark:text-primary-400" />
              <span>Operations & Tasks</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Daily operational milestones, internal checklist, and task queue.
            </CardDescription>
          </div>
          <Link
            href={ROUTES.OPERATIONS}
            className="text-xs text-primary-600 dark:text-primary-400 font-medium hover:underline flex items-center gap-0.5"
          >
            <span>Operations Hub</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Task List */}
        <div className="space-y-3 pt-4">
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="font-medium text-slate-800 dark:text-slate-200">
                Quarterly Access Audit & Credential Rotation
              </span>
            </div>
            <Badge variant="success">Completed</Badge>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="h-2 w-2 rounded-full bg-primary-500 animate-pulse" />
              <span className="font-medium text-slate-800 dark:text-slate-200">
                Monthly Vendor Invoice Reconciliation
              </span>
            </div>
            <Badge variant="default">In Progress</Badge>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
              <span className="font-medium text-slate-800 dark:text-slate-200">
                Office Cloud Infrastructure Backup Verification
              </span>
            </div>
            <Badge variant="outline">Scheduled</Badge>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 mt-4">
        <span className="flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-amber-500" />
          Automations Active: 4 Tasks
        </span>
        <Link href={ROUTES.AUTOMATIONS}>
          <span className="text-primary-600 dark:text-primary-400 font-medium hover:underline">
            Automations →
          </span>
        </Link>
      </div>
    </Card>
  );
}
