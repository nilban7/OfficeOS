"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  SlidersHorizontal,
  ExternalLink,
  Archive,
  CheckCircle2,
  Clock,
  Layers,
  FileText,
  DollarSign,
  Briefcase,
  AlertCircle,
  GraduationCap,
  Wrench,
  Search,
  Filter,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type {
  Notification,
  NotificationType,
  NotificationPreference,
  NotificationPreferenceItem,
} from "@/types/notification";

const NOTIFICATION_TYPES: NotificationType[] = [
  "general",
  "system",
  "task",
  "project",
  "document",
  "leave",
  "attendance",
  "finance",
  "maintenance",
  "training",
];

function getTypeIcon(type: NotificationType) {
  switch (type) {
    case "task":
      return <CheckCircle2 className="h-5 w-5 text-indigo-500" />;
    case "project":
      return <Layers className="h-5 w-5 text-blue-500" />;
    case "document":
      return <FileText className="h-5 w-5 text-emerald-500" />;
    case "finance":
      return <DollarSign className="h-5 w-5 text-amber-500" />;
    case "leave":
    case "attendance":
      return <Clock className="h-5 w-5 text-purple-500" />;
    case "training":
      return <GraduationCap className="h-5 w-5 text-teal-500" />;
    case "maintenance":
      return <Wrench className="h-5 w-5 text-orange-500" />;
    case "system":
      return <AlertCircle className="h-5 w-5 text-rose-500" />;
    case "general":
    default:
      return <Briefcase className="h-5 w-5 text-slate-500" />;
  }
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return dateString;
  }
}

export default function NotificationsPage() {
  const { currentOrganization } = useOrganization();

  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Pagination & Filtering
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalCount, setTotalCount] = React.useState(0);

  // Action status
  const [actionLoadingId, setActionLoadingId] = React.useState<string | null>(null);
  const [markAllLoading, setMarkAllLoading] = React.useState(false);

  // Preferences Modal
  const [showPreferencesModal, setShowPreferencesModal] = React.useState(false);
  const [preferences, setPreferences] = React.useState<NotificationPreference[]>([]);
  const [preferencesLoading, setPreferencesLoading] = React.useState(false);
  const [preferencesSaving, setPreferencesSaving] = React.useState(false);
  const [preferencesSuccess, setPreferencesSuccess] = React.useState(false);
  const [preferencesError, setPreferencesError] = React.useState<string | null>(null);

  // Debounce search
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchUnreadCount = React.useCallback(async () => {
    if (!currentOrganization?.id) return;
    try {
      const res = await apiClient.get<any>(API_ENDPOINTS.notifications.unreadCount);
      const data = (res as any)?.data || res;
      setUnreadCount(data?.unread_count ?? 0);
    } catch {
      // Ignore count fetch errors
    }
  }, [currentOrganization?.id]);

  const fetchNotifications = React.useCallback(async () => {
    if (!currentOrganization?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {
        page: String(currentPage),
        page_size: "20",
      };
      if (statusFilter !== "all") params.status = statusFilter;
      if (typeFilter !== "all") params.notification_type = typeFilter;

      const query = new URLSearchParams(params).toString();
      const res = await apiClient.get<any>(`${API_ENDPOINTS.notifications.list}?${query}`);
      const data = (res as any)?.data || res;
      setNotifications(data?.items || []);
      setTotalPages(data?.meta?.total_pages || data?.total_pages || 1);
      setTotalCount(data?.meta?.total_items || data?.total || 0);
    } catch (err: any) {
      setError(err?.message || "Failed to load notifications.");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, currentPage, statusFilter, typeFilter]);

  React.useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
  }, [fetchNotifications, fetchUnreadCount]);

  const handleMarkAsRead = async (id: string) => {
    setActionLoadingId(id);
    try {
      await apiClient.post(API_ENDPOINTS.notifications.markRead(id));
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
      fetchUnreadCount();
    } catch (err: any) {
      setError(err?.message || "Failed to mark notification as read.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleMarkAsUnread = async (id: string) => {
    setActionLoadingId(id);
    try {
      await apiClient.post(API_ENDPOINTS.notifications.markUnread(id));
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: null } : n))
      );
      fetchUnreadCount();
    } catch (err: any) {
      setError(err?.message || "Failed to mark notification as unread.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleArchive = async (id: string) => {
    setActionLoadingId(id);
    try {
      await apiClient.post(API_ENDPOINTS.notifications.archive(id));
      if (statusFilter !== "archived") {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      } else {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, archived_at: new Date().toISOString() } : n))
        );
      }
      fetchUnreadCount();
    } catch (err: any) {
      setError(err?.message || "Failed to archive notification.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleMarkAllAsRead = async () => {
    setMarkAllLoading(true);
    try {
      await apiClient.post(API_ENDPOINTS.notifications.markAllRead);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (err: any) {
      setError(err?.message || "Failed to mark all as read.");
    } finally {
      setMarkAllLoading(false);
    }
  };

  const openPreferencesModal = async () => {
    setShowPreferencesModal(true);
    setPreferencesLoading(true);
    setPreferencesError(null);
    setPreferencesSuccess(false);
    try {
      const res = await apiClient.get<any>(API_ENDPOINTS.notifications.preferences);
      const data = (res as any)?.data || res;
      setPreferences(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setPreferencesError(err?.message || "Failed to load preferences.");
    } finally {
      setPreferencesLoading(false);
    }
  };

  const togglePreference = (type: NotificationType, field: "in_app_enabled" | "email_enabled") => {
    setPreferences((prev) => {
      const existing = prev.find((p) => p.notification_type === type);
      if (existing) {
        return prev.map((p) =>
          p.notification_type === type ? { ...p, [field]: !p[field] } : p
        );
      }
      // Add new preference entry if not already present
      return [
        ...prev,
        {
          id: "",
          organization_id: currentOrganization?.id || "",
          recipient_id: "",
          notification_type: type,
          in_app_enabled: field === "in_app_enabled" ? false : true,
          email_enabled: field === "email_enabled" ? false : true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
    });
  };

  const savePreferences = async () => {
    setPreferencesSaving(true);
    setPreferencesError(null);
    setPreferencesSuccess(false);
    try {
      const payload: NotificationPreferenceItem[] = NOTIFICATION_TYPES.map((type) => {
        const pref = preferences.find((p) => p.notification_type === type);
        return {
          notification_type: type,
          in_app_enabled: pref ? pref.in_app_enabled : true,
          email_enabled: pref ? pref.email_enabled : true,
        };
      });
      const res = await apiClient.put<any>(API_ENDPOINTS.notifications.updatePreferences, {
        preferences: payload,
      });
      const data = (res as any)?.data || res;
      setPreferences(Array.isArray(data) ? data : []);
      setPreferencesSuccess(true);
      setTimeout(() => setPreferencesSuccess(false), 2500);
    } catch (err: any) {
      setPreferencesError(err?.message || "Failed to save preferences.");
    } finally {
      setPreferencesSaving(false);
    }
  };

  const filteredNotifications = React.useMemo(() => {
    if (!debouncedSearch) return notifications;
    const lower = debouncedSearch.toLowerCase();
    return notifications.filter(
      (n) =>
        n.title.toLowerCase().includes(lower) ||
        n.message.toLowerCase().includes(lower) ||
        n.notification_type.toLowerCase().includes(lower)
    );
  }, [notifications, debouncedSearch]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Notifications</h1>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="px-2 py-0.5 text-xs font-semibold">
                {unreadCount} unread
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Stay updated with your tasks, project activities, documents, and system alerts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllAsRead}
              disabled={markAllLoading}
              className="flex items-center gap-1.5"
            >
              <CheckCheck className="h-4 w-4" />
              <span>{markAllLoading ? "Marking..." : "Mark All Read"}</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={openPreferencesModal}
            className="flex items-center gap-1.5"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Preferences</span>
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Status tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
              {[
                { id: "all", label: "All" },
                { id: "unread", label: "Unread" },
                { id: "read", label: "Read" },
                { id: "archived", label: "Archived" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setStatusFilter(tab.id);
                    setCurrentPage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    statusFilter === tab.id
                      ? "bg-primary-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Type & Search Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:w-48">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Filter notifications..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-8 text-xs"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <Filter className="h-4 w-4 text-slate-400" />
                <select
                  aria-label="Filter by type"
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="all">All Types</option>
                  {NOTIFICATION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content State */}
      {isLoading ? (
        <LoadingState message="Loading notifications..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchNotifications} />
      ) : filteredNotifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications found"
          description={
            statusFilter === "unread"
              ? "You're all caught up! No unread notifications."
              : "No notifications match your current filter settings."
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((n) => {
            const isRead = !!n.read_at;
            const isArchived = !!n.archived_at;
            const isActionLoading = actionLoadingId === n.id;

            return (
              <div
                key={n.id}
                className={`flex flex-col gap-3 rounded-xl border p-4 transition-all md:flex-row md:items-start md:justify-between ${
                  isRead
                    ? "border-slate-200 bg-white hover:border-slate-300"
                    : "border-primary-200 bg-primary-50/20 shadow-sm hover:border-primary-300"
                }`}
              >
                {/* Notification Icon & Body */}
                <div className="flex items-start gap-3.5">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
                    {getTypeIcon(n.notification_type)}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{n.title}</span>
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                        {n.notification_type}
                      </Badge>
                      {!isRead && (
                        <span className="inline-block h-2 w-2 rounded-full bg-primary-600 ring-2 ring-primary-100" />
                      )}
                    </div>

                    <p className="text-sm text-slate-600 leading-relaxed">{n.message}</p>

                    <div className="flex items-center gap-3 pt-1 text-xs text-slate-400">
                      <span>{formatRelativeTime(n.created_at)}</span>
                      {isArchived && <span>• Archived</span>}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                  {n.action_url && (
                    <Link
                      href={n.action_url}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-primary-700 hover:bg-slate-50 transition-colors"
                    >
                      <span>View</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  )}

                  {!isRead ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMarkAsRead(n.id)}
                      disabled={isActionLoading}
                      className="h-8 text-xs text-slate-600 hover:text-slate-900"
                    >
                      Mark read
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMarkAsUnread(n.id)}
                      disabled={isActionLoading}
                      className="h-8 text-xs text-slate-500 hover:text-slate-800"
                    >
                      Mark unread
                    </Button>
                  )}

                  {!isArchived && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleArchive(n.id)}
                      disabled={isActionLoading}
                      className="h-8 px-2 text-xs text-slate-400 hover:text-slate-700"
                      title="Archive"
                      aria-label="Archive notification"
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-500">
              <span>
                Showing page {currentPage} of {totalPages} ({totalCount} total)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  className="h-8 text-xs"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  className="h-8 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preferences Modal */}
      <Modal
        isOpen={showPreferencesModal}
        onClose={() => setShowPreferencesModal(false)}
        title="Notification Preferences"
        description="Choose how you receive notifications across various business activities."
      >
        <div className="space-y-4 pt-2">
          {preferencesLoading ? (
            <LoadingState message="Loading preferences..." />
          ) : preferencesError ? (
            <ErrorState message={preferencesError} onRetry={openPreferencesModal} />
          ) : (
            <div className="space-y-3">
              {preferencesSuccess && (
                <div className="rounded-lg bg-emerald-50 p-3 text-xs font-medium text-emerald-800 border border-emerald-200">
                  Preferences updated successfully!
                </div>
              )}

              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center justify-between p-3 bg-slate-50/70 text-xs font-semibold text-slate-600">
                  <span>Category</span>
                  <div className="flex items-center gap-6">
                    <span className="w-16 text-center">In-App</span>
                    <span className="w-16 text-center">Email</span>
                  </div>
                </div>

                {NOTIFICATION_TYPES.map((type) => {
                  const pref = preferences.find((p) => p.notification_type === type);
                  const inApp = pref ? pref.in_app_enabled : true;
                  const email = pref ? pref.email_enabled : true;

                  return (
                    <div
                      key={type}
                      className="flex items-center justify-between p-3 transition-colors hover:bg-slate-50/50"
                    >
                      <div className="flex items-center gap-2.5">
                        {getTypeIcon(type)}
                        <div>
                          <span className="text-xs font-medium capitalize text-slate-900">
                            {type}
                          </span>
                          <p className="text-[11px] text-slate-500">
                            Updates regarding {type} actions & status
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <label className="flex w-16 cursor-pointer justify-center">
                          <input
                            type="checkbox"
                            checked={inApp}
                            onChange={() => togglePreference(type, "in_app_enabled")}
                            className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                            aria-label={`Enable in-app notifications for ${type}`}
                          />
                        </label>

                        <label className="flex w-16 cursor-pointer justify-center">
                          <input
                            type="checkbox"
                            checked={email}
                            onChange={() => togglePreference(type, "email_enabled")}
                            className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                            aria-label={`Enable email notifications for ${type}`}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreferencesModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={savePreferences}
                  disabled={preferencesSaving}
                >
                  {preferencesSaving ? "Saving..." : "Save Preferences"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
