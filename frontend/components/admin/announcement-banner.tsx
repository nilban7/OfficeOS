"use client";

import * as React from "react";
import { X, AlertTriangle, Info, AlertCircle } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type { PlatformAnnouncement } from "@/types/saas";

export function PlatformAnnouncementBanner() {
  const [announcements, setAnnouncements] = React.useState<PlatformAnnouncement[]>([]);
  const [dismissedIds, setDismissedIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    let isMounted = true;
    async function loadActiveAnnouncements() {
      try {
        const res = await apiClient.get<PlatformAnnouncement[]>(API_ENDPOINTS.announcements.active);
        const data = (res as any)?.data || res;
        if (isMounted && Array.isArray(data)) {
          setAnnouncements(data);
        }
      } catch {
        // Silently ignore if unauthenticated or network error
      }
    }
    loadActiveAnnouncements();
    return () => {
      isMounted = false;
    };
  }, []);

  const activeVisible = announcements.filter((a) => !dismissedIds.includes(a.id));

  if (activeVisible.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      {activeVisible.map((item) => {
        const isCritical = item.severity === "critical";
        const isWarning = item.severity === "warning";

        const bgClass = isCritical
          ? "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 text-red-900 dark:text-red-200"
          : isWarning
          ? "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200"
          : "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-200";

        const Icon = isCritical ? AlertCircle : isWarning ? AlertTriangle : Info;

        return (
          <div
            key={item.id}
            className={`p-3.5 rounded-xl border text-sm flex items-start justify-between gap-3 shadow-xs ${bgClass}`}
            role="alert"
          >
            <div className="flex items-start gap-2.5">
              <Icon className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">{item.title}: </span>
                <span className="text-xs leading-relaxed">{item.content}</span>
              </div>
            </div>
            <button
              onClick={() => setDismissedIds((prev) => [...prev, item.id])}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0 p-1"
              aria-label="Dismiss announcement"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
