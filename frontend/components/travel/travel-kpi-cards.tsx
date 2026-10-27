"use client";

import * as React from "react";
import {
  Plane,
  Clock,
  Calendar,
  DollarSign,
  Receipt,
  CreditCard,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { TravelSummaryKPI } from "@/types/travel";

interface TravelKpiCardsProps {
  kpi: TravelSummaryKPI | null;
  onFilterClick?: (filterType: string) => void;
}

export function TravelKpiCards({ kpi, onFilterClick }: TravelKpiCardsProps) {
  const formatCurrency = (val: number | string | undefined) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: kpi?.currency || "USD",
      maximumFractionDigits: 0,
    }).format(num);
  };

  const cards = [
    {
      title: "Total Trips",
      value: kpi?.total_trips ?? 0,
      subtext: `${kpi?.ongoing_trips ?? 0} ongoing • ${kpi?.upcoming_trips ?? 0} upcoming`,
      icon: Plane,
      color: "from-blue-600 to-indigo-600",
      textColor: "text-blue-600",
      bgColor: "bg-blue-50/80",
      filter: "all",
    },
    {
      title: "Pending Approvals",
      value: kpi?.pending_approvals ?? 0,
      subtext: "Prior travel requests awaiting review",
      icon: Clock,
      color: "from-amber-500 to-orange-500",
      textColor: "text-amber-600",
      bgColor: "bg-amber-50/80",
      filter: "pending_approval",
    },
    {
      title: "Post-Registered Trips",
      value: kpi?.past_trips ?? 0,
      subtext: "Trips recorded after completion",
      icon: Calendar,
      color: "from-purple-600 to-violet-600",
      textColor: "text-purple-600",
      bgColor: "bg-purple-50/80",
      filter: "past",
    },
    {
      title: "Pending Expense Claims",
      value: kpi?.pending_expense_reviews ?? 0,
      subtext: "Receipts awaiting review & approval",
      icon: Receipt,
      color: "from-rose-500 to-pink-500",
      textColor: "text-rose-600",
      bgColor: "bg-rose-50/80",
      filter: "expenses_pending",
    },
    {
      title: "Approved Travel Spend",
      value: formatCurrency(kpi?.total_actual_approved_expenses),
      subtext: `Budget: ${formatCurrency(kpi?.total_estimated_budget)}`,
      icon: DollarSign,
      color: "from-emerald-600 to-teal-600",
      textColor: "text-emerald-600",
      bgColor: "bg-emerald-50/80",
      filter: "spend",
    },
    {
      title: "Outstanding Advances",
      value: formatCurrency(kpi?.total_advances_paid),
      subtext: `${kpi?.unsettled_trips ?? 0} trips awaiting financial settlement`,
      icon: CreditCard,
      color: "from-cyan-600 to-blue-600",
      textColor: "text-cyan-600",
      bgColor: "bg-cyan-50/80",
      filter: "unsettled",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <Card
            key={idx}
            onClick={() => onFilterClick && onFilterClick(card.filter)}
            className="cursor-pointer hover:shadow-md transition-all duration-200 border-slate-200/80 hover:border-primary-300 group relative overflow-hidden"
          >
            <div
              className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${card.color} opacity-80 group-hover:opacity-100 transition-opacity`}
            />
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 tracking-tight">
                  {card.title}
                </span>
                <div className={`p-2 rounded-lg ${card.bgColor} ${card.textColor}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <div className="text-xl font-bold text-slate-900 tracking-tight">
                  {card.value}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1 truncate font-medium">
                  {card.subtext}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
