"use client";

import * as React from "react";
import {
  Plus,
  RotateCcw,
  Edit2,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { AdminHeader } from "@/components/admin/admin-header";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type {
  PlatformAnnouncement,
  PlatformAnnouncementCreate,
  PlatformAnnouncementUpdate,
  AnnouncementSeverity,
  AnnouncementTargetType,
} from "@/types/saas";

export default function SaaSAdminAnnouncementsPage() {
  const { membership, permissions, isLoading: isOrgLoading } = useOrganization();
  const isSysAdmin = membership?.role === "system_admin" || permissions.includes("saas.view");
  const canManage = membership?.role === "system_admin" || permissions.includes("saas.manage");

  const [announcements, setAnnouncements] = React.useState<PlatformAnnouncement[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Modal Create / Edit States
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<PlatformAnnouncement | null>(null);
  const [formTitle, setFormTitle] = React.useState("");
  const [formContent, setFormContent] = React.useState("");
  const [formSeverity, setFormSeverity] = React.useState<AnnouncementSeverity>("info");
  const [formTargetType, setFormTargetType] = React.useState<AnnouncementTargetType>("all");
  const [formTargetOrgs, setFormTargetOrgs] = React.useState("");
  const [formIsActive, setFormIsActive] = React.useState(true);
  const [formLoading, setFormLoading] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Delete Confirmation State
  const [deleteTarget, setDeleteTarget] = React.useState<PlatformAnnouncement | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  const fetchAnnouncements = React.useCallback(async () => {
    if (!isSysAdmin) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiClient.get<PlatformAnnouncement[]>(API_ENDPOINTS.admin.announcements);
      const data = (res as any)?.data || res;
      setAnnouncements(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load platform announcements");
    } finally {
      setIsLoading(false);
    }
  }, [isSysAdmin]);

  React.useEffect(() => {
    if (!isOrgLoading && isSysAdmin) {
      fetchAnnouncements();
    } else if (!isOrgLoading && !isSysAdmin) {
      setIsLoading(false);
    }
  }, [isOrgLoading, isSysAdmin, fetchAnnouncements]);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormTitle("");
    setFormContent("");
    setFormSeverity("info");
    setFormTargetType("all");
    setFormTargetOrgs("");
    setFormIsActive(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (item: PlatformAnnouncement) => {
    setEditingItem(item);
    setFormTitle(item.title);
    setFormContent(item.content);
    setFormSeverity(item.severity);
    setFormTargetType(item.target_type);
    setFormTargetOrgs((item.target_org_ids || []).join(", "));
    setFormIsActive(item.is_active);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    setFormLoading(true);
    setFormError(null);

    try {
      const targetOrgs =
        formTargetType === "specific_orgs"
          ? formTargetOrgs
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean)
          : [];

      if (editingItem) {
        const payload: PlatformAnnouncementUpdate = {
          title: formTitle.trim(),
          content: formContent.trim(),
          severity: formSeverity,
          target_type: formTargetType,
          target_org_ids: targetOrgs,
          is_active: formIsActive,
        };
        await apiClient.patch(API_ENDPOINTS.admin.announcementDetail(editingItem.id), payload);
      } else {
        const payload: PlatformAnnouncementCreate = {
          title: formTitle.trim(),
          content: formContent.trim(),
          severity: formSeverity,
          target_type: formTargetType,
          target_org_ids: targetOrgs,
          is_active: formIsActive,
        };
        await apiClient.post(API_ENDPOINTS.admin.announcements, payload);
      }

      setIsModalOpen(false);
      fetchAnnouncements();
    } catch (err: any) {
      setFormError(err?.message || "Failed to save announcement");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !canManage) return;
    setDeleteLoading(true);

    try {
      await apiClient.delete(API_ENDPOINTS.admin.announcementDetail(deleteTarget.id));
      setDeleteTarget(null);
      fetchAnnouncements();
    } catch (err: any) {
      setError(err?.message || "Failed to delete announcement");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (isOrgLoading) {
    return <LoadingState message="Verifying administrative credentials..." />;
  }

  if (!isSysAdmin) {
    return (
      <div className="py-12">
        <ErrorState
          title="Access Forbidden"
          message="Platform Administration is strictly restricted to system_admin personnel."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Platform Announcements"
        description="Broadcast notices across tenant organizations. Target all tenants or specific organizations with severity tags."
        badgeText={`Total: ${announcements.length}`}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAnnouncements}
            disabled={isLoading}
            className="flex items-center gap-1.5"
          >
            <RotateCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>

          {canManage && (
            <Button size="sm" onClick={openCreateModal} className="flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              <span>Create Announcement</span>
            </Button>
          )}
        </div>
      </AdminHeader>

      {/* Announcements List */}
      <Card className="border-slate-200/80 dark:border-slate-800 overflow-hidden">
        {isLoading && announcements.length === 0 ? (
          <div className="py-16">
            <LoadingState message="Loading announcements..." />
          </div>
        ) : error && announcements.length === 0 ? (
          <div className="py-12">
            <ErrorState title="Failed to load announcements" message={error} onRetry={fetchAnnouncements} />
          </div>
        ) : announcements.length === 0 ? (
          <div className="py-16">
            <EmptyState
              title="No Platform Announcements"
              description="Create an announcement to broadcast notices across tenant organizations."
              actionLabel={canManage ? "New Announcement" : undefined}
              onAction={canManage ? openCreateModal : undefined}
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {announcements.map((item) => {
              const severityVariant =
                item.severity === "critical"
                  ? "destructive"
                  : item.severity === "warning"
                  ? "warning"
                  : "info";

              return (
                <div
                  key={item.id}
                  className="p-5 hover:bg-slate-50/70 dark:hover:bg-slate-900/30 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                >
                  <div className="space-y-1.5 max-w-3xl">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <Badge variant={severityVariant} className="text-[10px] uppercase font-bold tracking-wider">
                        {item.severity}
                      </Badge>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                        {item.title}
                      </h3>
                      {!item.is_active && (
                        <Badge variant="secondary" className="text-[10px]">
                          Inactive / Draft
                        </Badge>
                      )}
                      <span className="text-xs text-slate-400 font-mono">
                        Target: {item.target_type === "all" ? "All Tenants" : `${item.target_org_ids.length} specific org(s)`}
                      </span>
                    </div>

                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                      {item.content}
                    </p>

                    <div className="flex items-center gap-3 pt-1 text-xs text-slate-400">
                      <span>Created {new Date(item.created_at).toLocaleDateString()}</span>
                      {item.ends_at && (
                        <span>• Expires {new Date(item.ends_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2.5 text-xs"
                        onClick={() => openEditModal(item)}
                      >
                        <Edit2 className="h-3.5 w-3.5 mr-1" />
                        <span>Edit</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => setDeleteTarget(item)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        <span>Delete</span>
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => !formLoading && setIsModalOpen(false)}
          title={editingItem ? "Edit Platform Announcement" : "Create Platform Announcement"}
        >
          <form onSubmit={handleFormSubmit} className="space-y-4 py-2">
            {formError && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs">
                {formError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Announcement Title
              </label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. Scheduled Maintenance Window..."
                required
                disabled={formLoading}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Announcement Content
              </label>
              <textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Write the full announcement text here..."
                required
                rows={4}
                disabled={formLoading}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Severity Level
                </label>
                <select
                  value={formSeverity}
                  onChange={(e) => setFormSeverity(e.target.value as AnnouncementSeverity)}
                  disabled={formLoading}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                >
                  <option value="info">Info (Blue)</option>
                  <option value="warning">Warning (Amber)</option>
                  <option value="critical">Critical (Red)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Target Audience
                </label>
                <select
                  value={formTargetType}
                  onChange={(e) => setFormTargetType(e.target.value as AnnouncementTargetType)}
                  disabled={formLoading}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                >
                  <option value="all">All Tenant Organizations</option>
                  <option value="specific_orgs">Specific Organizations (By UUID)</option>
                </select>
              </div>
            </div>

            {formTargetType === "specific_orgs" && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Target Organization UUIDs (Comma-separated)
                </label>
                <Input
                  value={formTargetOrgs}
                  onChange={(e) => setFormTargetOrgs(e.target.value)}
                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000, ..."
                  disabled={formLoading}
                />
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="is_active_chk"
                checked={formIsActive}
                onChange={(e) => setFormIsActive(e.target.checked)}
                disabled={formLoading}
                className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="is_active_chk" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Publish immediately (Active)
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={formLoading}
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={formLoading}>
                {formLoading ? "Saving..." : editingItem ? "Update Notice" : "Publish Notice"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <Modal
          isOpen={true}
          onClose={() => !deleteLoading && setDeleteTarget(null)}
          title="Delete Platform Announcement"
        >
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Are you sure you want to permanently delete announcement{" "}
              <strong className="text-slate-900 dark:text-white">&ldquo;{deleteTarget.title}&rdquo;</strong>?
            </p>
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <Button
                variant="outline"
                size="sm"
                disabled={deleteLoading}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteLoading}
                onClick={handleDelete}
              >
                {deleteLoading ? "Deleting..." : "Confirm Delete"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
