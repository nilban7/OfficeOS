"use client";

import * as React from "react";
import Link from "next/link";
import { Receipt, Clock, ArrowRight } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/constants/routes";

export function FinanceWidget() {
  return (
    <Card className="p-6 shadow-xs flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 h-full">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Receipt className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Finance & Reimbursements</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Expense claims, monthly payroll status, and financial health.
            </CardDescription>
          </div>
          <Link
            href={ROUTES.REIMBURSEMENTS}
            className="text-xs text-primary-600 dark:text-primary-400 font-medium hover:underline flex items-center gap-0.5"
          >
            <span>Claims</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 pt-4">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Pending Claims
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                ₹12,450
              </span>
            </div>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
              3 claims awaiting finance review
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Payroll Cycle
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                Active
              </span>
              <Badge variant="success" className="text-[10px] py-0 px-1.5">
                On Schedule
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Disbursement locked for month-end
            </p>
          </div>
        </div>

        {/* Recent Claim Preview */}
        <div className="mt-4 p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" />
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              Client Dining & Travel Expense
            </span>
          </div>
          <span className="font-semibold text-slate-900 dark:text-white">₹4,200</span>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 mt-4">
        <span>Finance Audit: Clean</span>
        <Link href={ROUTES.PAYROLL}>
          <span className="text-primary-600 dark:text-primary-400 font-medium hover:underline">
            View Payroll Hub →
          </span>
        </Link>
      </div>
    </Card>
  );
}
