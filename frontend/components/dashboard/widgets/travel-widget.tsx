"use client";

import * as React from "react";
import Link from "next/link";
import { Plane, ArrowRight } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/constants/routes";

export function TravelWidget() {
  return (
    <Card className="p-6 shadow-xs flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 h-full">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Plane className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <span>Travel & Expense Approvals</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Active business itineraries, travel advances, and settlement claims.
            </CardDescription>
          </div>
          <Link
            href={ROUTES.TRAVEL}
            className="text-xs text-primary-600 dark:text-primary-400 font-medium hover:underline flex items-center gap-0.5"
          >
            <span>Travel Portal</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Status Metrics */}
        <div className="grid grid-cols-2 gap-3 pt-4">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Active Trips
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                2
              </span>
              <Badge variant="default" className="text-[10px] py-0 px-1.5">
                On Schedule
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Client & conference travels
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Advances & Claims
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                ₹35,000
              </span>
            </div>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
              Settlements in verification
            </p>
          </div>
        </div>

        {/* Recent Itinerary Preview */}
        <div className="mt-4 p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Bangalore Client QBR (Horizon Media)
            </span>
            <Badge variant="success">Approved</Badge>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Nov 12 – Nov 15 • Flights confirmed • Advance disbursed
          </p>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 mt-4">
        <span>Travel Policy: Tier 1 Compliant</span>
        <Link href={ROUTES.TRAVEL}>
          <span className="text-primary-600 dark:text-primary-400 font-medium hover:underline">
            Register New Trip →
          </span>
        </Link>
      </div>
    </Card>
  );
}
