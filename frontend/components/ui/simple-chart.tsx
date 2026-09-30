import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface BarChartItem {
  label: string;
  value: number;
  colorClass?: string;
  formattedValue?: string;
}

export interface SimpleBarChartProps {
  items: BarChartItem[];
  maxVal?: number;
  height?: number;
  className?: string;
}

export function SimpleBarChart({
  items,
  maxVal,
  height = 160,
  className,
}: SimpleBarChartProps) {
  const calculatedMax = maxVal ?? Math.max(...items.map((i) => i.value), 1);

  if (items.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-slate-400">
        No chart data available
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className="flex items-end gap-2 sm:gap-3 pt-6 pb-2"
        style={{ height: `${height}px` }}
      >
        {items.map((item, idx) => {
          const pct = Math.min(Math.round((item.value / calculatedMax) * 100), 100);
          return (
            <div
              key={`${item.label}-${idx}`}
              className="group relative flex-1 flex flex-col items-center h-full justify-end"
            >
              {/* Tooltip on hover */}
              <div className="absolute -top-7 scale-0 group-hover:scale-100 transition-transform bg-slate-900 text-white text-[10px] font-medium px-1.5 py-0.5 rounded shadow whitespace-nowrap z-10 pointer-events-none">
                {item.label}: {item.formattedValue ?? item.value}
              </div>

              {/* Bar */}
              <div
                className={cn(
                  "w-full rounded-t-md transition-all duration-300 hover:opacity-85",
                  item.colorClass || "bg-primary-600"
                )}
                style={{ height: `${Math.max(pct, 4)}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* Labels Axis */}
      <div className="flex justify-between gap-1 border-t border-slate-100 pt-1.5 text-[11px] text-slate-500 font-medium">
        {items.map((item, idx) => (
          <div
            key={`lbl-${item.label}-${idx}`}
            className="flex-1 text-center truncate"
            title={item.label}
          >
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export interface DonutChartItem {
  label: string;
  value: number;
  color: string;
}

export interface SimpleDonutChartProps {
  items: DonutChartItem[];
  centerLabel?: string;
  centerValue?: string | number;
  size?: number;
  className?: string;
}

export function SimpleDonutChart({
  items,
  centerLabel,
  centerValue,
  size = 140,
  className,
}: SimpleDonutChartProps) {
  const total = items.reduce((acc, curr) => acc + curr.value, 0);

  if (total === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-slate-400">
        No distribution data
      </div>
    );
  }

  // Calculate SVG stroke dashes
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  let accumulatedOffset = 0;

  return (
    <div className={cn("flex flex-col sm:flex-row items-center gap-6", className)}>
      <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90 transform">
          {items.map((item, idx) => {
            const strokeDasharray = (item.value / total) * circumference;
            const strokeDashoffset = -accumulatedOffset;
            accumulatedOffset += strokeDasharray;

            return (
              <circle
                key={`donut-slice-${idx}`}
                cx="50"
                cy="50"
                r={radius}
                fill="transparent"
                stroke={item.color}
                strokeWidth="12"
                strokeDasharray={`${strokeDasharray} ${circumference}`}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-300 hover:opacity-80"
              />
            );
          })}
        </svg>

        {/* Center label */}
        {(centerLabel || centerValue !== undefined) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2">
            {centerValue !== undefined && (
              <span className="text-base font-bold text-slate-900 tracking-tight leading-none">
                {centerValue}
              </span>
            )}
            {centerLabel && (
              <span className="text-[10px] text-slate-500 font-medium uppercase mt-0.5">
                {centerLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Legend list */}
      <div className="flex-1 space-y-1.5 w-full">
        {items.map((item, idx) => {
          const pct = Math.round((item.value / total) * 100);
          return (
            <div key={`legend-${idx}`} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 truncate">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-slate-700 font-medium truncate">{item.label}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-500 font-semibold shrink-0">
                <span>{item.value}</span>
                <span className="text-[10px] text-slate-400">({pct}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface ProgressBarItem {
  label: string;
  value: number;
  total: number;
  colorClass?: string;
  hint?: string;
}

export function SimpleProgressBar({
  label,
  value,
  total,
  colorClass = "bg-primary-600",
  hint,
}: ProgressBarItem) {
  const pct = total > 0 ? Math.min(Math.round((value / total) * 100), 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold text-slate-900">
          {value} / {total} {hint && <span className="font-normal text-slate-400 text-[10px]">({hint})</span>}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={cn("h-full transition-all duration-300 rounded-full", colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
