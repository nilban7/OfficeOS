"use client";

import * as React from "react";
import Link from "next/link";
import {
  FileText,
  Plus,
  Search,
  Eye,
  Filter,
  Layers,
  HardDrive,
  Archive,
  CheckCircle2,
  FileCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type {
  Document,
  DocumentCreate,
  DocumentStatus,
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

export default function DocumentsPage() {
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  const canView = permissions.includes("documents.view");
  const canCreate = permissions.includes("documents.create");

  const [documents, setDocuments] = React.useState<Document[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [totalPages, setTotalPages] = React.useState(1);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [totalCount, setTotalCount] = React.useState(0);

  // Filters
  const [searchTerm, setSearchTerm] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");

  // Create Modal
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [createLoading, setCreateLoading] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<DocumentCreate>({
    document_number: "",
    title: "",
    description: "",
    category: "contract",
    document_type: "pdf",
    owner_id: "",
    client_id: "",
    project_id: "",
    vendor_id: "",
    branch_id: "",
    status: "active",
    storage_path: "",
    original_filename: "",
    mime_type: "application/pdf",
    file_size: 10240,
    notes: "Initial version",
  });

  // Debounce search
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const fetchDocuments = React.useCallback(async () => {
    if (!currentOrganization?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {
        page: String(currentPage),
        page_size: "20",
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (categoryFilter !== "all") params.category = categoryFilter;
      if (statusFilter !== "all") params.status = statusFilter;

      const query = new URLSearchParams(params).toString();
      const res = await apiClient.get<any>(`${API_ENDPOINTS.documents.list}?${query}`);
      const data = (res as any)?.data || res;
      setDocuments(data?.items || []);
      setTotalPages(data?.total_pages || 1);
      setTotalCount(data?.total || 0);
    } catch (err: any) {
      setError(err?.message || "Failed to load documents.");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, currentPage, debouncedSearch, categoryFilter, statusFilter]);

  React.useEffect(() => {
    if (canView) fetchDocuments();
  }, [fetchDocuments, canView]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id) return;
    setCreateLoading(true);
    setCreateError(null);

    // Auto-generate storage path if not provided
    const safePath =
      form.storage_path.trim() ||
      `${currentOrganization.id}/documents/${Date.now()}_${form.original_filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    const payload: DocumentCreate = {
      ...form,
      storage_path: safePath,
      client_id: form.client_id ? form.client_id : undefined,
      project_id: form.project_id ? form.project_id : undefined,
      vendor_id: form.vendor_id ? form.vendor_id : undefined,
      branch_id: form.branch_id ? form.branch_id : undefined,
      description: form.description ? form.description : undefined,
      notes: form.notes ? form.notes : undefined,
    };

    try {
      await apiClient.post(API_ENDPOINTS.documents.create, payload);
      setShowCreateModal(false);
      setForm({
        document_number: "",
        title: "",
        description: "",
        category: "contract",
        document_type: "pdf",
        owner_id: "",
        client_id: "",
        project_id: "",
        vendor_id: "",
        branch_id: "",
        status: "active",
        storage_path: "",
        original_filename: "",
        mime_type: "application/pdf",
        file_size: 10240,
        notes: "Initial version",
      });
      fetchDocuments();
    } catch (err: any) {
      setCreateError(err?.message || "Failed to create document.");
    } finally {
      setCreateLoading(false);
    }
  };

  // Metrics
  const activeCount = documents.filter((d) => d.status === "active").length;
  const archivedCount = documents.filter((d) => d.status === "archived").length;
  const totalStorage = documents.reduce((sum, d) => sum + (d.file_size || 0), 0);

  if (isOrgLoading) {
    return <LoadingState message="Loading documents module..." />;
  }

  if (!canView) {
    return (
      <div className="p-8">
        <ErrorState
          title="Access Denied"
          message="You do not have permission to view documents."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Document Management
          </h1>
          <p className="text-sm text-slate-500">
            Store, version, and manage organization documents securely.
          </p>
        </div>
        {canCreate && (
          <Button
            onClick={() => {
              setForm((prev) => ({
                ...prev,
                document_number: `DOC-${Date.now().toString().slice(-6)}`,
                original_filename: "document.pdf",
              }));
              setShowCreateModal(true);
            }}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Upload Document
          </Button>
        )}
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-blue-50 p-3 text-blue-600">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Total Documents
              </p>
              <p className="text-2xl font-bold text-slate-900">
                {totalCount || documents.length}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-emerald-50 p-3 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Active Documents
              </p>
              <p className="text-2xl font-bold text-slate-900">{activeCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-indigo-50 p-3 text-indigo-600">
              <HardDrive className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Total File Size
              </p>
              <p className="text-2xl font-bold text-slate-900">
                {formatFileSize(totalStorage)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-amber-50 p-3 text-amber-600">
              <Archive className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Archived
              </p>
              <p className="text-2xl font-bold text-slate-900">{archivedCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search by title, number, or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-400" />
                <select
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">All Categories</option>
                  <option value="contract">Contract</option>
                  <option value="invoice">Invoice</option>
                  <option value="policy">Policy</option>
                  <option value="proposal">Proposal</option>
                  <option value="report">Report</option>
                  <option value="identification">Identification</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Area */}
      {isLoading ? (
        <LoadingState message="Loading documents..." />
      ) : error ? (
        <ErrorState title="Error Loading Documents" message={error} onRetry={fetchDocuments} />
      ) : documents.length === 0 ? (
        <EmptyState
          title="No documents found"
          description="Get started by uploading your first organization document."
          actionLabel={canCreate ? "Upload Document" : undefined}
          onAction={
            canCreate
              ? () => {
                  setForm((prev) => ({
                    ...prev,
                    document_number: `DOC-${Date.now().toString().slice(-6)}`,
                    original_filename: "document.pdf",
                  }));
                  setShowCreateModal(true);
                }
              : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-3">Document</th>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Version</th>
                  <th className="px-6 py-3">Size</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Updated</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {documents.map((doc) => {
                  const statusConf = STATUS_CONFIG[doc.status] || STATUS_CONFIG.active;
                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="px-6 py-4">
                        <Link
                          href={`/documents/${doc.id}`}
                          className="font-medium text-slate-900 hover:text-blue-600 flex items-center gap-2"
                        >
                          <FileCheck className="h-4 w-4 text-blue-500 shrink-0" />
                          <div>
                            <div>{doc.title}</div>
                            <div className="text-xs text-slate-400 font-mono">
                              {doc.document_number}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800 capitalize">
                          {doc.category}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 uppercase">
                          {doc.document_type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-mono font-medium text-slate-700">
                          <Layers className="h-3 w-3" />v{doc.current_version}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-500">
                        {formatFileSize(doc.file_size)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusConf.className}`}
                        >
                          {statusConf.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400">
                        {new Date(doc.updated_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/documents/${doc.id}`}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <Eye className="h-4 w-4 text-slate-600" />
                            <span className="sr-only">View</span>
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3">
              <span className="text-xs text-slate-500">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Upload Document Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Upload New Document"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {createError && (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700 border border-rose-200">
              {createError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="doc-number">Document Number *</Label>
              <Input
                id="doc-number"
                required
                value={form.document_number}
                onChange={(e) => setForm({ ...form, document_number: e.target.value })}
                placeholder="DOC-0001"
              />
            </div>
            <div>
              <Label htmlFor="doc-owner">Owner ID (UUID) *</Label>
              <Input
                id="doc-owner"
                required
                value={form.owner_id}
                onChange={(e) => setForm({ ...form, owner_id: e.target.value })}
                placeholder="Employee UUID"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="doc-title">Title *</Label>
            <Input
              id="doc-title"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Master Services Agreement"
            />
          </div>

          <div>
            <Label htmlFor="doc-desc">Description</Label>
            <Input
              id="doc-desc"
              value={form.description || ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional overview of the document contents"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="doc-cat">Category *</Label>
              <select
                id="doc-cat"
                required
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="contract">Contract</option>
                <option value="invoice">Invoice</option>
                <option value="policy">Policy</option>
                <option value="proposal">Proposal</option>
                <option value="report">Report</option>
                <option value="identification">Identification</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <Label htmlFor="doc-type">Document Type *</Label>
              <select
                id="doc-type"
                required
                value={form.document_type}
                onChange={(e) => setForm({ ...form, document_type: e.target.value })}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="pdf">PDF</option>
                <option value="docx">DOCX</option>
                <option value="xlsx">XLSX</option>
                <option value="image">Image</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="doc-filename">Original Filename *</Label>
              <Input
                id="doc-filename"
                required
                value={form.original_filename}
                onChange={(e) => setForm({ ...form, original_filename: e.target.value })}
                placeholder="contract_signed.pdf"
              />
            </div>
            <div>
              <Label htmlFor="doc-size">File Size (Bytes) *</Label>
              <Input
                id="doc-size"
                type="number"
                required
                min={0}
                value={form.file_size}
                onChange={(e) => setForm({ ...form, file_size: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="doc-notes">Initial Version Notes</Label>
            <Input
              id="doc-notes"
              value={form.notes || ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g. Initial signed copy"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateModal(false)}
              disabled={createLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createLoading}>
              {createLoading ? "Creating..." : "Save Document"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
