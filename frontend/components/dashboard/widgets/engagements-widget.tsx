"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, ShieldCheck, ArrowRight } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import type { OrganizationMembership } from "@/types/organization";

interface EngagementsWidgetProps {
  membership?: OrganizationMembership | null;
}

export function EngagementsWidget({ membership }: EngagementsWidgetProps) {
  return (
    <Card className="p-6 shadow-xs flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 h-full">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Key Operational Milestones</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Certified lifecycle accomplishments for current active engagements.
            </CardDescription>
          </div>
          <Link
            href={ROUTES.ENGAGEMENTS}
            className="text-xs text-primary-600 dark:text-primary-400 font-medium hover:underline flex items-center gap-0.5"
          >
            <span>All</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="space-y-2.5 pt-4 text-xs">
          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-slate-700 dark:text-slate-200 font-medium">Commercial Proposal Accepted (PRP-0001)</span>
          </div>
          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-slate-700 dark:text-slate-200 font-medium">Master Services Agreement e-Signed (AGR-0002)</span>
          </div>
          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-slate-700 dark:text-slate-200 font-medium">Quality Assurance & UAT Acceptance Run (v1.0.0)</span>
          </div>
          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-slate-700 dark:text-slate-200 font-medium">Final Handover Certificate & SLA Activated (HND-0001)</span>
          </div>
        </div>
      </div>

      <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs text-slate-400 font-mono">
        <span className="flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 inline" />
          PostgreSQL RLS: Enforced
        </span>
        <span>Role: {membership?.role?.replace("_", " ") || "Owner"}</span>
      </div>
    </Card>
  );
}
