"use client";

import * as React from "react";
import Link from "next/link";
import {
  Award,
  Plus,
  Search,
  Eye,
  X,
  Calendar,
  Users,
  Building2,
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
import type { Internship, InternshipCreate, InternshipStatus } from "@/types/internship";

const STATUS_CONFIG: Record<InternshipStatus, { label: string; className: string }> = {
  planned: { label: "Planned", className: "bg-slate-100 text-slate-700 border-slate-300" },
  active: { label: "Active", className: "bg-blue-50 text-blue-700 border-blue-200" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  extended: { label: "Extended", className: "bg-amber-50 text-amber-700 border-amber-200" },
  terminated: { label: "Terminated", className: "bg-rose-50 text-rose-700 border-rose-200" },
  cancelled: { label: "Cancelled", className: "bg-neutral-100 text-neutral-700 border-neutral-300" },
};

export default function InternshipsPage() {
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  const canCreate = permissions.includes("internships.create");
  const canView = permissions.includes("internships.view");

  // Data state
  const [internships, setInternships] = React.useState<Internship[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [totalPages, setTotalPages] = React.useState(1);
  const [currentPage, setCurrentPage] = React.useState(1);

  // Filters
  const [searchTerm, setSearchTerm] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");

  // Create modal
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [createLoading, setCreateLoading] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<InternshipCreate>({
    title: "",
    code: "",
    intern_name: "",
    intern_email: "",
    institution: "",
    start_date: "",
    end_date: "",
    status: "planned",
    stipend: "0.00",
  });

  // Debounce search
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const fetchInternships = React.useCallback(async () => {
    if (!currentOrganization?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page: String(currentPage), page_size: "20" };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter !== "all") params.status = statusFilter;

      const query = new URLSearchParams(params).toString();
      const res = await apiClient.get<any>(`${API_ENDPOINTS.internships.list}?${query}`);
      const data = (res as any)?.data || res;
      setInternships(data?.items || []);
      setTotalPages(data?.total_pages || 1);
    } catch (err: any) {
      setError(err?.message || "Failed to load internships.");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, currentPage, debouncedSearch, statusFilter]);

  React.useEffect(() => {
    if (canView) fetchInternships();
  }, [fetchInternships, canView]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id) return;
    setCreateLoading(true);
    setCreateError(null);
    try {
      await apiClient.post(API_ENDPOINTS.internships.create, form);
      setShowCreateModal(false);
      setForm({
        title: "",
        code: "",
        intern_name: "",
        intern_email: "",
        institution: "",
        start_date: "",
        end_date: "",
        status: "planned",
        stipend: "0.00",
      });
      fetchInternships();
    } catch (err: any) {
      setCreateError(err?.message || "Failed to create internship.");
    } finally {
      setCreateLoading(false);
    }
  };

  const filteredInternships = internships.filter((i) => {
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    if (
      debouncedSearch &&
      !i.title.toLowerCase().includes(debouncedSearch.toLowerCase()) &&
      !i.code.toLowerCase().includes(debouncedSearch.toLowerCase()) &&
      !i.intern_name.toLowerCase().includes(debouncedSearch.toLowerCase())
    )
      return false;
    return true;
  });

  if (isOrgLoading) return <LoadingState message="Loading organization..." />;
  if (!canView) {
    return (
      <ErrorState
        title="Access Denied"
        message="You don't have permission to view internships."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Internships</h1>
            <p className="text-sm text-slate-500">Manage internship programs and intern reviews</p>
          </div>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreateModal(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Internship
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by title, code, intern name..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          {(Object.keys(STATUS_CONFIG) as InternshipStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingState message="Loading internships..." />
      ) : error ? (
        <ErrorState title="Error" message={error} onRetry={fetchInternships} />
      ) : filteredInternships.length === 0 ? (
        <EmptyState
          icon={Award}
          title="No internships found"
          description={debouncedSearch || statusFilter !== "all" ? "Try adjusting your filters." : "Create your first internship to get started."}
          actionLabel={canCreate ? "New Internship" : undefined}
          onAction={canCreate ? () => setShowCreateModal(true) : undefined}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredInternships.map((internship) => {
              const statusCfg = STATUS_CONFIG[internship.status];
              return (
                <Card key={internship.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/internships/${internship.id}`}
                          className="block font-semibold text-slate-900 hover:text-blue-600 truncate"
                        >
                          {internship.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-slate-500">{internship.code}</p>
                      </div>
                      <span
                        className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusCfg.className}`}
                      >
                        {statusCfg.label}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                      <div className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        <span className="truncate">{internship.intern_name}</span>
                      </div>
                      {internship.institution && (
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 text-slate-400" />
                          <span className="truncate text-xs">{internship.institution}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-xs">
                          {internship.start_date.slice(0, 10)} → {internship.end_date.slice(0, 10)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{internship.supervisors_count} supervisors</span>
                        <span>{internship.reviews_count} reviews</span>
                      </div>
                      <Link
                        href={`/internships/${internship.id}`}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                      >
                        <Eye className="h-3 w-3" />
                        View
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-slate-600">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); setCreateError(null); }}
        title="New Internship"
        size="lg"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Software Dev Internship"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code">Code *</Label>
              <Input
                id="code"
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="INT-001"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="intern_name">Intern Name *</Label>
              <Input
                id="intern_name"
                required
                value={form.intern_name}
                onChange={(e) => setForm({ ...form, intern_name: e.target.value })}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="intern_email">Intern Email</Label>
              <Input
                id="intern_email"
                type="email"
                value={form.intern_email || ""}
                onChange={(e) => setForm({ ...form, intern_email: e.target.value })}
                placeholder="intern@university.edu"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="institution">Institution</Label>
            <Input
              id="institution"
              value={form.institution || ""}
              onChange={(e) => setForm({ ...form, institution: e.target.value })}
              placeholder="University / College name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="start_date">Start Date *</Label>
              <Input
                id="start_date"
                type="date"
                required
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end_date">End Date *</Label>
              <Input
                id="end_date"
                type="date"
                required
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as InternshipStatus })}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {(Object.keys(STATUS_CONFIG) as InternshipStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stipend">Monthly Stipend</Label>
              <Input
                id="stipend"
                type="number"
                min={0}
                step="0.01"
                value={form.stipend || "0.00"}
                onChange={(e) => setForm({ ...form, stipend: e.target.value })}
              />
            </div>
          </div>
          {createError && (
            <div className="flex items-center gap-2 rounded-md bg-rose-50 p-3 text-sm text-rose-700">
              <X className="h-4 w-4 shrink-0" />
              {createError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setShowCreateModal(false); setCreateError(null); }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createLoading}>
              {createLoading ? "Creating..." : "Create Internship"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
