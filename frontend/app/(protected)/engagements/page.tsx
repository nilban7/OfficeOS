"use client";

import * as React from "react";
import Link from "next/link";
import {
  Handshake,
  Plus,
  Search,
  FileCheck2,
  Briefcase,
  ChevronRight,
  TrendingUp,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type { Client, ClientListResponse } from "@/types/client";
import type {
  ClientEngagementSummary,
  EngagementOverview,
  EngagementStage,
  DeliveryHealth,
} from "@/types/engagement";

const STAGE_LABELS: Record<EngagementStage, { label: string; step: number }> = {
  proposal: { label: "1. Proposal & Scoping", step: 1 },
  agreement: { label: "2. Agreement & e-Sign", step: 2 },
  kickoff: { label: "3. Kickoff Ready", step: 3 },
  delivery: { label: "4. Sprints & Delivery", step: 4 },
  weekly_reporting: { label: "5. Weekly Reporting", step: 5 },
  uat: { label: "6. Client Mock Run (UAT)", step: 6 },
  issues_triage: { label: "7. Query & Defect Triage", step: 7 },
  acceptance_handover: { label: "8. Final Handover", step: 8 },
  maintenance_support: { label: "9. SLA & Support", step: 9 },
};

const HEALTH_COLORS: Record<DeliveryHealth, { badge: string; text: string }> = {
  on_track: { badge: "success", text: "On Track" },
  at_risk: { badge: "warning", text: "At Risk" },
  blocked: { badge: "destructive", text: "Blocked" },
  completed: { badge: "info", text: "Completed" },
};

export default function EngagementsCommandCenterPage() {
  const { currentOrganization } = useOrganization();
  const [overview, setOverview] = React.useState<EngagementOverview | null>(null);
  const [engagements, setEngagements] = React.useState<ClientEngagementSummary[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [stageFilter, setStageFilter] = React.useState<string>("");
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  // New Engagement Form
  const [clientId, setClientId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [contractValue, setContractValue] = React.useState("");
  const [targetDate, setTargetDate] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    if (!currentOrganization?.id) return;
    setIsLoading(true);
    try {
      const [ovRes, listRes, clientsRes] = await Promise.all([
        apiClient.get<EngagementOverview>(API_ENDPOINTS.engagements.overview, {
          organizationId: currentOrganization.id,
        }),
        apiClient.get<ClientEngagementSummary[] | { items: ClientEngagementSummary[] }>(API_ENDPOINTS.engagements.list, {
          organizationId: currentOrganization.id,
        }),
        apiClient.get<ClientListResponse | Client[]>(API_ENDPOINTS.clients.list, {
          params: { page_size: 100 },
          organizationId: currentOrganization.id,
        }),
      ]);
      setOverview(ovRes);
      const engList = Array.isArray(listRes) ? listRes : (listRes as { items?: ClientEngagementSummary[] })?.items || [];
      setEngagements(engList);
      const clientList = Array.isArray(clientsRes) ? clientsRes : (clientsRes as ClientListResponse)?.items || [];
      setClients(clientList);
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const [createError, setCreateError] = React.useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !clientId || !title) return;
    setIsSubmitting(true);
    setCreateError(null);
    try {
      await apiClient.post(
        API_ENDPOINTS.engagements.create,
        {
          client_id: clientId,
          title,
          description: description || null,
          contract_value: contractValue ? parseFloat(contractValue) : null,
          target_completion_date: targetDate || null,
        },
        { organizationId: currentOrganization.id }
      );
      setIsCreateOpen(false);
      setTitle("");
      setDescription("");
      setContractValue("");
      setTargetDate("");
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initiate engagement";
      setCreateError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredEngagements = engagements.filter((e) => {
    const matchSearch = e.title.toLowerCase().includes(search.toLowerCase()) ||
      (e.client_name && e.client_name.toLowerCase().includes(search.toLowerCase())) ||
      e.engagement_code.toLowerCase().includes(search.toLowerCase());
    const matchStage = stageFilter ? e.current_stage === stageFilter : true;
    return matchSearch && matchStage;
  });

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/60 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Handshake className="h-7 w-7 text-primary-600" />
            <span>Client Engagements</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Unified commercial & delivery lifecycle engine — from proposal & digital signatures to project handover.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 shadow-subtle"
          >
            <Plus className="h-4 w-4" />
            <span>New Engagement</span>
          </Button>
        </div>
      </div>

      {/* Overview KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <Card hover className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Active Engagements
            </span>
            <div className="h-8 w-8 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center border border-primary-100">
              <Briefcase className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
              {overview?.active_engagements_count ?? 0}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">In active delivery lifecycle</p>
          </div>
        </Card>

        <Card hover className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Pending Signatures
            </span>
            <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <FileCheck2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
              {overview?.agreements_pending_signatures_count ?? 0}
            </div>
            <p className="text-[11px] text-amber-600 font-medium mt-1">Awaiting digital execution</p>
          </div>
        </Card>

        <Card hover className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Active Mock Runs (UAT)
            </span>
            <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
              {overview?.uat_active_count ?? 0}
            </div>
            <p className="text-[11px] text-indigo-600 font-medium mt-1">Client test sessions open</p>
          </div>
        </Card>

        <Card hover className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Pipeline Value
            </span>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
              ₹{Number(overview?.total_pipeline_value || 0).toLocaleString("en-IN")}
            </div>
            <p className="text-[11px] text-emerald-600 font-medium mt-1">Contract value contracted</p>
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-subtle">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, client, or code..."
            className="h-9 w-full rounded-lg border border-slate-200/90 bg-slate-50/70 pl-9 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/15"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200/90 bg-white px-3 text-xs text-slate-700 shadow-subtle focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/15"
          >
            <option value="">All Lifecycle Stages</option>
            <option value="proposal">1. Proposal & Scoping</option>
            <option value="agreement">2. Agreement & e-Sign</option>
            <option value="kickoff">3. Kickoff Ready</option>
            <option value="delivery">4. Sprints & Delivery</option>
            <option value="weekly_reporting">5. Weekly Reporting</option>
            <option value="uat">6. Client Mock Run (UAT)</option>
            <option value="issues_triage">7. Query & Defect Triage</option>
            <option value="acceptance_handover">8. Final Handover</option>
            <option value="maintenance_support">9. SLA & Support</option>
          </select>
        </div>
      </div>

      {/* Engagements List with Live Steppers */}
      {isLoading ? (
        <LoadingState message="Loading client engagements..." />
      ) : filteredEngagements.length === 0 ? (
        <EmptyState
          title="No Engagements Found"
          description="Create your first client engagement to begin the commercial proposal, digital contract, and delivery lifecycle."
          actionLabel="Create Engagement"
          onAction={() => setIsCreateOpen(true)}
        />
      ) : (
        <div className="space-y-3.5">
          {filteredEngagements.map((item) => {
            const stageInfo = STAGE_LABELS[item.current_stage] || { label: item.current_stage, step: 1 };
            const healthBadge = HEALTH_COLORS[item.delivery_health] || { badge: "default", text: item.delivery_health };

            return (
              <Link
                key={item.id}
                href={`/engagements/${item.id}`}
                className="block group"
              >
                <Card hover className="p-4 sm:p-5 transition-all">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Title & Metadata */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded border border-primary-200/60">
                          {item.engagement_code}
                        </span>
                        <h3 className="text-base font-semibold text-slate-900 truncate group-hover:text-primary-600 transition-colors">
                          {item.title}
                        </h3>
                        <Badge variant={healthBadge.badge as any}>
                          {healthBadge.text}
                        </Badge>
                      </div>

                      <p className="text-xs text-slate-500 flex items-center gap-2">
                        <span>Client: <strong className="text-slate-700">{item.client_name || "Unknown"}</strong></span>
                        <span>•</span>
                        <span>Value: <strong className="text-slate-700">₹{Number(item.contract_value || 0).toLocaleString("en-IN")}</strong></span>
                        {item.target_completion_date && (
                          <>
                            <span>•</span>
                            <span>Target: <strong className="text-slate-700">{item.target_completion_date}</strong></span>
                          </>
                        )}
                      </p>
                    </div>

                    {/* Progress Bar & Stage Indicator */}
                    <div className="w-full lg:w-72 space-y-1.5 flex-shrink-0">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-slate-700">{stageInfo.label}</span>
                        <span className="font-bold text-slate-900 tabular-nums">{item.progress_percentage}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden border border-slate-200/80">
                        <div
                          className="h-full bg-gradient-to-r from-primary-500 to-indigo-600 rounded-full transition-all duration-300"
                          style={{ width: `${item.progress_percentage}%` }}
                        />
                      </div>
                    </div>

                    <div className="hidden lg:flex items-center text-slate-400 group-hover:text-primary-600 transition-colors pl-2">
                      <ChevronRight className="h-5 w-5" />
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Create Engagement Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Initiate New Client Engagement"
        description="Establish a new commercial engagement pipeline for an existing client."
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {createError && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
              {createError}
            </div>
          )}
          <div>
            <Label className="text-xs font-semibold text-slate-700">Select Client *</Label>
            <select
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs text-slate-800 shadow-subtle focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/15"
            >
              <option value="">-- Choose a Client --</option>
              {(clients || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.client_code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700">Engagement Title *</Label>
            <Input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Modernization & Cloud Integration SOW"
              className="mt-1.5 text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Estimated Contract Value (₹)</Label>
              <Input
                type="number"
                value={contractValue}
                onChange={(e) => setContractValue(e.target.value)}
                placeholder="e.g. 500000"
                className="mt-1.5 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700">Target Delivery Date</Label>
              <Input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="mt-1.5 text-xs"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700">Scoping Summary</Label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Outline the core business goals and requirements..."
              className="mt-1.5 w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs text-slate-800 shadow-subtle focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/15"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 mt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting || !clientId || !title}>
              {isSubmitting ? "Creating..." : "Start Engagement"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
