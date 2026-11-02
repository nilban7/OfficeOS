"use client";

import * as React from "react";
import Link from "next/link";
import { ShoppingCart, Wrench, ArrowRight } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/constants/routes";

export function ProcurementWidget() {
  return (
    <Card className="p-6 shadow-xs flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 h-full">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              <span>Procurement & Assets</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Equipment requisition, asset allocation, and IT maintenance.
            </CardDescription>
          </div>
          <Link
            href={ROUTES.PROCUREMENT}
            className="text-xs text-primary-600 dark:text-primary-400 font-medium hover:underline flex items-center gap-0.5"
          >
            <span>Orders</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 pt-4">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Active Orders
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                3
              </span>
              <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                In Transit
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              IT workstations & network hardware
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Assigned Assets
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                28
              </span>
              <span className="text-[11px] text-slate-400">devices</span>
            </div>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
              100% verified in inventory
            </p>
          </div>
        </div>

        {/* Asset Maintenance Note */}
        <div className="mt-4 p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-slate-400" />
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              Maintenance Tickets
            </span>
          </div>
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Zero Critical</span>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 mt-4">
        <span>Vendor Compliance: Verified</span>
        <Link href={ROUTES.ASSETS}>
          <span className="text-primary-600 dark:text-primary-400 font-medium hover:underline">
            Asset Inventory →
          </span>
        </Link>
      </div>
    </Card>
  );
}
