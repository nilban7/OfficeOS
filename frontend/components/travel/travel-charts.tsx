"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plane, Train, Bus, Car, Building2, BarChart3, PieChart } from "lucide-react";
import type { TravelReportMetrics } from "@/types/travel";

interface TravelChartsProps {
  metrics: TravelReportMetrics | null;
}

export function TravelCharts({ metrics }: TravelChartsProps) {
  if (!metrics) return null;

  const summary = metrics.summary || {
    currency: "USD",
    total_trips: 0,
    unsettled_trips: 0,
  };
  const currency = summary.currency || "USD";

  const formatCurrency = (val: number | string | undefined) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const plannedVsPast = metrics.planned_vs_past || {};
  const plannedCount = plannedVsPast["planned"] || 0;
  const pastCount = plannedVsPast["past"] || 0;
  const totalRegCount = plannedCount + pastCount || 1;
  const plannedPct = Math.round((plannedCount / totalRegCount) * 100);
  const pastPct = 100 - plannedPct;

  const monthlyTrend = metrics.monthly_trend || [];
  const byDepartment = metrics.by_department || [];
  const byTransportMode = metrics.by_transport_mode || [];

  // Max for monthly trend scaling
  const maxMonthly = Math.max(
    ...monthlyTrend.map((m) =>
      Math.max(Number(m.estimated_budget || 0), Number(m.approved_expenses || 0))
    ),
    1000
  );

  // Max for department scaling
  const maxDept = Math.max(
    ...byDepartment.map((d) => Number(d.total_cost || 0)),
    1000
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Monthly Budget vs Spend */}
      <Card className="lg:col-span-2 border-slate-200/80 shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary-600" />
            <span>Monthly Travel Spend & Budget Trajectory</span>
          </CardTitle>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-primary-600 inline-block" />
              <span className="text-slate-600">Actual Spend</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-slate-300 inline-block" />
              <span className="text-slate-500">Budget</span>
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {monthlyTrend.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-xs text-slate-400">
              No historical monthly data recorded yet.
            </div>
          ) : (
            <div className="h-48 flex items-end gap-3 pt-6 pb-2 px-2 overflow-x-auto">
              {monthlyTrend.map((item, idx) => {
                const actualH = Math.round((Number(item.approved_expenses) / maxMonthly) * 130);
                const budgetH = Math.round((Number(item.estimated_budget) / maxMonthly) * 130);
                return (
                  <div key={idx} className="flex-1 min-w-[50px] flex flex-col items-center gap-1.5 group">
                    <div className="w-full flex items-end justify-center gap-1 h-36">
                      {/* Budget Bar */}
                      <div
                        style={{ height: `${Math.max(budgetH, 4)}px` }}
                        className="w-3 rounded-t bg-slate-200 group-hover:bg-slate-300 transition-all relative"
                        title={`Budget: ${formatCurrency(item.estimated_budget)}`}
                      />
                      {/* Actual Spend Bar */}
                      <div
                        style={{ height: `${Math.max(actualH, 4)}px` }}
                        className="w-3.5 rounded-t bg-primary-600 group-hover:bg-primary-700 transition-all relative"
                        title={`Actual: ${formatCurrency(item.approved_expenses)}`}
                      />
                    </div>
                    <span className="text-[10px] font-medium text-slate-600 truncate">
                      {item.month}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Registration Type Breakdown */}
      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <PieChart className="h-4 w-4 text-primary-600" />
            <span>Registration Profile</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2 flex flex-col justify-between h-[calc(100%-52px)]">
          <div className="space-y-4 my-auto">
            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-blue-700 font-semibold flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-600" />
                  Planned (Pre-Registered)
                </span>
                <span className="text-slate-700 font-bold">
                  {plannedCount} ({plannedPct}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  style={{ width: `${plannedPct}%` }}
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Approved prior to travel</p>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-purple-700 font-semibold flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-purple-600" />
                  Past (Post-Registered)
                </span>
                <span className="text-slate-700 font-bold">
                  {pastCount} ({pastPct}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  style={{ width: `${pastPct}%` }}
                  className="h-full bg-purple-600 rounded-full transition-all duration-300"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Logged after completion; prior approval bypassed
              </p>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-center text-xs">
            <div className="bg-slate-50 p-2 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">
                Total Trips
              </span>
              <span className="font-bold text-slate-900 text-sm">{summary.total_trips}</span>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">
                Unsettled Trips
              </span>
              <span className="font-bold text-amber-700 text-sm">
                {summary.unsettled_trips}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Spend by Department */}
      <Card className="lg:col-span-2 border-slate-200/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary-600" />
            <span>Travel Expenditure by Department</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2 space-y-3">
          {byDepartment.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              No department-assigned expenses found.
            </div>
          ) : (
            byDepartment.slice(0, 5).map((dept, idx) => {
              const pct = maxDept > 0 ? Math.round((Number(dept.total_cost) / maxDept) * 100) : 0;
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-slate-800 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
                      {dept.department_name}
                      <span className="text-[10px] text-slate-400 font-normal">
                        ({dept.trip_count} trips)
                      </span>
                    </span>
                    <span className="font-semibold text-slate-900">
                      {formatCurrency(dept.total_cost)}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      style={{ width: `${Math.max(pct, 2)}%` }}
                      className="h-full bg-gradient-to-r from-primary-500 to-indigo-600 rounded-full transition-all"
                    />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Spend by Transport Mode */}
      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Plane className="h-4 w-4 text-primary-600" />
            <span>Transport Modes</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="space-y-2.5">
            {byTransportMode.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No transport modes logged yet.
              </div>
            ) : (
              byTransportMode.map((m, idx) => {
                let ModeIcon = Plane;
                if (m.mode.toLowerCase().includes("train")) ModeIcon = Train;
                else if (m.mode.toLowerCase().includes("bus")) ModeIcon = Bus;
                else if (m.mode.toLowerCase().includes("car")) ModeIcon = Car;

                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-50/70 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded bg-white border border-slate-200 text-slate-600 shadow-2xs">
                        <ModeIcon className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">{m.mode}</p>
                        <p className="text-[10px] text-slate-400">{m.count} journeys</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-slate-900">
                      {formatCurrency(m.total_cost)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
