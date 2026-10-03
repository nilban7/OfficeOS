"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Upload,
  Shield,
  Layers,
  FileText,
  User,
  Building2,
  Briefcase,
  Store,
  Trash2,
  Archive,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type {
  DocumentDetail,
  DocumentDownloadResponse,
  DocumentPermissionCreate,
  DocumentStatus,
  DocumentVersionCreate,
  GranteeType,
  PermissionLevel,
} from "@/types/document";

const STATUS_CONFIG: Record<DocumentStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-300" },
  active: { label: "Active", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  archived: { label: "Archived", className: "bg-amber-50 text-amber-700 border-amber-200" },
  deleted: { label: "Deleted", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const documentId = params?.id || "";
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  const canView = permissions.includes("documents.view");
  const canDownload =
    permissions.includes("documents.download") || permissions.includes("documents.view");
  const canUpdate = permissions.includes("documents.update");
  const canManage = permissions.includes("documents.manage");

  const [document, setDocument] = React.useState<DocumentDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Download state
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);

  // New Version Modal
  const [showVersionModal, setShowVersionModal] = React.useState(false);
  const [versionLoading, setVersionLoading] = React.useState(false);
  const [versionError, setVersionError] = React.useState<string | null>(null);
  const [versionForm, setVersionForm] = React.useState<DocumentVersionCreate>({
    storage_path: "",
    original_filename: "",
    mime_type: "application/pdf",
    file_size: 10240,
    notes: "",
  });

  // Permission Modal
  const [showPermModal, setShowPermModal] = React.useState(false);
  const [permLoading, setPermLoading] = React.useState(false);
  const [permError, setPermError] = React.useState<string | null>(null);
  const [permForm, setPermForm] = React.useState<DocumentPermissionCreate>({
    grantee_type: "employee",
    grantee_id: "",
    permission_level: "view",
  });

  const fetchDocument = React.useCallback(async () => {
    if (!currentOrganization?.id || !documentId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<any>(API_ENDPOINTS.documents.detail(documentId));
      const data = (res as any)?.data || res;
      setDocument(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load document details.");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, documentId]);

  React.useEffect(() => {
    if (canView) fetchDocument();
  }, [fetchDocument, canView]);

  const handleDownload = async (versionId?: string) => {
    if (!documentId) return;
    setDownloadingId(versionId || "latest");
    setDownloadError(null);
    try {
      const payload = versionId ? { version_id: versionId } : {};
      const res = await apiClient.post<any>(
        API_ENDPOINTS.documents.download(documentId),
        payload
      );
      const data: DocumentDownloadResponse = (res as any)?.data || res;
      if (data?.download_url) {
        if (typeof window !== "undefined") {
          window.open(data.download_url, "_blank");
        }
      }
    } catch (err: any) {
      setDownloadError(err?.message || "Failed to generate download link.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleUploadVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !documentId) return;
    setVersionLoading(true);
    setVersionError(null);

    const safePath =
      versionForm.storage_path.trim() ||
      `${currentOrganization.id}/documents/${Date.now()}_${versionForm.original_filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    const payload: DocumentVersionCreate = {
      ...versionForm,
      storage_path: safePath,
      notes: versionForm.notes ? versionForm.notes : undefined,
    };

    try {
      await apiClient.post(API_ENDPOINTS.documents.createVersion(documentId), payload);
      setShowVersionModal(false);
      setVersionForm({
        storage_path: "",
        original_filename: "",
        mime_type: "application/pdf",
        file_size: 10240,
        notes: "",
      });
      fetchDocument();
    } catch (err: any) {
      setVersionError(err?.message || "Failed to add new version.");
    } finally {
      setVersionLoading(false);
    }
  };

  const handleAddPermission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !documentId) return;
    setPermLoading(true);
    setPermError(null);

    try {
      await apiClient.post(API_ENDPOINTS.documents.createPermission(documentId), permForm);
      setShowPermModal(false);
      setPermForm({
        grantee_type: "employee",
        grantee_id: "",
        permission_level: "view",
      });
      fetchDocument();
    } catch (err: any) {
      setPermError(err?.message || "Failed to grant permission.");
    } finally {
      setPermLoading(false);
    }
  };

  const handleDeletePermission = async (permId: string) => {
    if (!documentId) return;
    try {
      await apiClient.delete(API_ENDPOINTS.documents.deletePermission(documentId, permId));
      fetchDocument();
    } catch (err: any) {
      setError(err?.message || "Failed to revoke permission.");
    }
  };

  const handleArchive = async () => {
    if (!documentId) return;
    try {
      await apiClient.patch(API_ENDPOINTS.documents.update(documentId), {
        status: "archived",
      });
      fetchDocument();
    } catch (err: any) {
      setError(err?.message || "Failed to archive document.");
    }
  };

  if (isOrgLoading || isLoading) {
    return <LoadingState message="Loading document details..." />;
  }

  if (!canView) {
    return (
      <div className="p-8">
        <ErrorState
          title="Access Denied"
          message="You do not have permission to view this document."
        />
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="p-8 space-y-4">
        <Link href="/documents">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Documents
          </Button>
        </Link>
        <ErrorState
          title="Document Not Found"
          message={error || "The requested document could not be loaded."}
          onRetry={fetchDocument}
        />
      </div>
    );
  }

  const statusConf = STATUS_CONFIG[document.status] || STATUS_CONFIG.active;

  return (
    <div className="space-y-6 p-6">
      {/* Top Navigation & Status */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/documents">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {document.title}
              </h1>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusConf.className}`}
              >
                {statusConf.label}
              </span>
            </div>
            <p className="text-xs font-mono text-slate-400 mt-0.5">
              {document.document_number} &bull; v{document.current_version}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {canDownload && (
            <Button
              onClick={() => handleDownload()}
              disabled={downloadingId !== null}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              {downloadingId === "latest" ? "Downloading..." : "Download"}
            </Button>
          )}

          {canUpdate && (
            <Button
              variant="outline"
              onClick={() => {
                setVersionForm({
                  storage_path: "",
                  original_filename: document.original_filename,
                  mime_type: document.mime_type,
                  file_size: document.file_size,
                  notes: `Version ${document.current_version + 1} update`,
                });
                setShowVersionModal(true);
              }}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              New Version
            </Button>
          )}

          {canManage && (
            <Button
              variant="outline"
              onClick={() => setShowPermModal(true)}
              className="gap-2"
            >
              <Shield className="h-4 w-4" />
              Permissions
            </Button>
          )}

          {canUpdate && document.status !== "archived" && (
            <Button
              variant="outline"
              onClick={handleArchive}
              className="gap-2 text-amber-700 hover:text-amber-800"
            >
              <Archive className="h-4 w-4" />
              Archive
            </Button>
          )}
        </div>
      </div>

      {downloadError && (
        <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700 border border-rose-200">
          {downloadError}
        </div>
      )}

      {/* Main Metadata Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Details & Version History */}
        <div className="space-y-6 lg:col-span-2">
          {/* Document Overview Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Document Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {document.description && (
                <p className="text-sm text-slate-600 leading-relaxed border-b border-slate-100 pb-3">
                  {document.description}
                </p>
              )}

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 text-sm">
                <div>
                  <span className="text-xs text-slate-400 font-medium uppercase">
                    Category
                  </span>
                  <p className="font-medium text-slate-800 capitalize mt-0.5">
                    {document.category}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 font-medium uppercase">
                    Document Type
                  </span>
                  <p className="font-semibold text-blue-700 uppercase mt-0.5">
                    {document.document_type}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 font-medium uppercase">
                    File Size
                  </span>
                  <p className="font-medium text-slate-800 font-mono mt-0.5">
                    {formatFileSize(document.file_size)}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 font-medium uppercase">
                    Original File
                  </span>
                  <p className="font-medium text-slate-800 font-mono text-xs truncate mt-0.5">
                    {document.original_filename}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 font-medium uppercase">
                    MIME Type
                  </span>
                  <p className="font-medium text-slate-800 text-xs font-mono mt-0.5">
                    {document.mime_type}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 font-medium uppercase">
                    Last Updated
                  </span>
                  <p className="font-medium text-slate-800 mt-0.5">
                    {new Date(document.updated_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Version History Card */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Layers className="h-5 w-5 text-indigo-600" />
                Version History ({document.versions?.length || 1})
              </CardTitle>
              {canUpdate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setVersionForm({
                      storage_path: "",
                      original_filename: document.original_filename,
                      mime_type: document.mime_type,
                      file_size: document.file_size,
                      notes: `Version ${document.current_version + 1}`,
                    });
                    setShowVersionModal(true);
                  }}
                  className="gap-1.5 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Upload Version
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Version</th>
                      <th className="px-4 py-2.5">Filename</th>
                      <th className="px-4 py-2.5">Size</th>
                      <th className="px-4 py-2.5">Uploaded</th>
                      <th className="px-4 py-2.5">Notes</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {document.versions && document.versions.length > 0 ? (
                      document.versions.map((ver) => (
                        <tr key={ver.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-slate-800">
                              v{ver.version_number}
                              {ver.version_number === document.current_version && (
                                <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[10px] font-semibold text-blue-700">
                                  Current
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-700">
                            {ver.original_filename}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-slate-500">
                            {formatFileSize(ver.file_size)}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            {new Date(ver.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {ver.notes || "-"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {canDownload && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownload(ver.id)}
                                disabled={downloadingId === ver.id}
                                className="h-7 px-2 text-xs gap-1 text-blue-600 hover:text-blue-700"
                              >
                                <Download className="h-3.5 w-3.5" />
                                {downloadingId === ver.id ? "..." : "Get"}
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-4 text-center text-xs text-slate-400">
                          No version history recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Col: Associations & Permissions */}
        <div className="space-y-6">
          {/* Ownership & Links Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <User className="h-5 w-5 text-slate-600" />
                Ownership &amp; Links
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500 flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-400" />
                  Owner:
                </span>
                <span className="font-medium text-slate-800">
                  {document.owner
                    ? `${document.owner.first_name} ${document.owner.last_name}`
                    : document.owner_id.slice(0, 8)}
                </span>
              </div>

              {document.project && (
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500 flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-slate-400" />
                    Project:
                  </span>
                  <span className="font-medium text-slate-800">{document.project.name}</span>
                </div>
              )}

              {document.client && (
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    Client:
                  </span>
                  <span className="font-medium text-slate-800">{document.client.name}</span>
                </div>
              )}

              {document.vendor && (
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500 flex items-center gap-2">
                    <Store className="h-4 w-4 text-slate-400" />
                    Vendor:
                  </span>
                  <span className="font-medium text-slate-800">{document.vendor.name}</span>
                </div>
              )}

              {document.branch && (
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    Branch:
                  </span>
                  <span className="font-medium text-slate-800">{document.branch.name}</span>
                </div>
              )}

              <div className="pt-1">
                <span className="text-xs text-slate-400 block uppercase">Created At</span>
                <span className="text-xs text-slate-600">
                  {new Date(document.created_at).toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Document Access / Permissions Card */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Shield className="h-5 w-5 text-emerald-600" />
                Permissions ({document.permissions?.length || 0})
              </CardTitle>
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPermModal(true)}
                  className="gap-1 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {document.permissions && document.permissions.length > 0 ? (
                <div className="space-y-2">
                  {document.permissions.map((perm) => (
                    <div
                      key={perm.id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5 text-xs bg-slate-50/50"
                    >
                      <div>
                        <div className="font-medium text-slate-800 capitalize">
                          {perm.grantee_type}:{" "}
                          <span className="font-mono text-slate-600">
                            {perm.grantee_id.slice(0, 8)}...
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Level:{" "}
                          <span className="font-semibold text-blue-600 capitalize">
                            {perm.permission_level}
                          </span>
                        </div>
                      </div>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeletePermission(perm.id)}
                          className="h-7 w-7 p-0 text-rose-500 hover:text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="sr-only">Revoke</span>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-3">
                  Default role-based access applies.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Upload New Version Modal */}
      <Modal
        isOpen={showVersionModal}
        onClose={() => setShowVersionModal(false)}
        title="Upload New Version"
      >
        <form onSubmit={handleUploadVersion} className="space-y-4">
          {versionError && (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700 border border-rose-200">
              {versionError}
            </div>
          )}

          <div>
            <Label htmlFor="ver-filename">Original Filename *</Label>
            <Input
              id="ver-filename"
              required
              value={versionForm.original_filename}
              onChange={(e) =>
                setVersionForm({ ...versionForm, original_filename: e.target.value })
              }
              placeholder="revised_document.pdf"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ver-mime">MIME Type *</Label>
              <Input
                id="ver-mime"
                required
                value={versionForm.mime_type}
                onChange={(e) =>
                  setVersionForm({ ...versionForm, mime_type: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="ver-size">File Size (Bytes) *</Label>
              <Input
                id="ver-size"
                type="number"
                required
                min={0}
                value={versionForm.file_size}
                onChange={(e) =>
                  setVersionForm({
                    ...versionForm,
                    file_size: parseInt(e.target.value) || 0,
                  })
                }
              />
            </div>
          </div>

          <div>
            <Label htmlFor="ver-notes">Version Notes</Label>
            <Input
              id="ver-notes"
              value={versionForm.notes || ""}
              onChange={(e) => setVersionForm({ ...versionForm, notes: e.target.value })}
              placeholder="e.g. Updated terms and signature section"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowVersionModal(false)}
              disabled={versionLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={versionLoading}>
              {versionLoading ? "Uploading..." : "Save Version"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Grant Permission Modal */}
      <Modal
        isOpen={showPermModal}
        onClose={() => setShowPermModal(false)}
        title="Grant Document Permission"
      >
        <form onSubmit={handleAddPermission} className="space-y-4">
          {permError && (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700 border border-rose-200">
              {permError}
            </div>
          )}

          <div>
            <Label htmlFor="perm-type">Grantee Type *</Label>
            <select
              id="perm-type"
              required
              value={permForm.grantee_type}
              onChange={(e) =>
                setPermForm({ ...permForm, grantee_type: e.target.value as GranteeType })
              }
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="employee">Employee</option>
              <option value="department">Department</option>
              <option value="role">Role</option>
            </select>
          </div>

          <div>
            <Label htmlFor="perm-id">Grantee ID (UUID) *</Label>
            <Input
              id="perm-id"
              required
              value={permForm.grantee_id}
              onChange={(e) => setPermForm({ ...permForm, grantee_id: e.target.value })}
              placeholder="Target UUID"
            />
          </div>

          <div>
            <Label htmlFor="perm-level">Permission Level *</Label>
            <select
              id="perm-level"
              required
              value={permForm.permission_level}
              onChange={(e) =>
                setPermForm({
                  ...permForm,
                  permission_level: e.target.value as PermissionLevel,
                })
              }
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="view">View</option>
              <option value="edit">Edit</option>
              <option value="manage">Manage</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPermModal(false)}
              disabled={permLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={permLoading}>
              {permLoading ? "Granting..." : "Grant Permission"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
