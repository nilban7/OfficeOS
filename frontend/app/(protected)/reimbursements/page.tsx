"use client";

import * as React from "react";
import {
  Receipt,
  Plus,
  Search,
  Eye,
  CheckCircle2,
  Clock,
  DollarSign,
  AlertCircle,
  XCircle,
  FileText,
  Send,
  CreditCard,
  Trash2,
  ExternalLink,
  ChevronRight,
  RefreshCw,
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
  ReimbursementClaim,
  ReimbursementClaimCreate,
  ReimbursementClaimItem,
  ReimbursementPayAction,
  ReimbursementReviewAction,
  ReimbursementStatus,
  ReimbursementSummaryKPI,
} from "@/types/reimbursement";

interface ClaimsResponse {
  items: ReimbursementClaim[];
  meta?: {
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
  };
}

const STATUS_CONFIG: Record<
  ReimbursementStatus,
  { label: string; className: string; dotColor: string }
> = {
  draft: {
    label: "Draft",
    className: "bg-slate-100 text-slate-700 border-slate-300",
    dotColor: "bg-slate-400",
  },
  submitted: {
    label: "Pending Approval",
    className: "bg-amber-50 text-amber-800 border-amber-300",
    dotColor: "bg-amber-500",
  },
  approved: {
    label: "Approved",
    className: "bg-blue-50 text-blue-800 border-blue-300",
    dotColor: "bg-blue-500",
  },
  paid: {
    label: "Paid / Reimbursed",
    className: "bg-emerald-50 text-emerald-800 border-emerald-300",
    dotColor: "bg-emerald-500",
  },
  rejected: {
    label: "Rejected",
    className: "bg-rose-50 text-rose-800 border-rose-300",
    dotColor: "bg-rose-500",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-neutral-100 text-neutral-600 border-neutral-300",
    dotColor: "bg-neutral-400",
  },
};

const CATEGORY_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  travel: { label: "Travel & Mileage", badgeClass: "bg-sky-50 text-sky-700 border-sky-200" },
  meals: { label: "Meals & Entertaining", badgeClass: "bg-orange-50 text-orange-700 border-orange-200" },
  office_supplies: { label: "Office Supplies", badgeClass: "bg-slate-100 text-slate-700 border-slate-200" },
  tech_hardware: { label: "Hardware & Tech", badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  software_subscriptions: { label: "Software & SaaS", badgeClass: "bg-violet-50 text-violet-700 border-violet-200" },
  medical: { label: "Medical & Health", badgeClass: "bg-rose-50 text-rose-700 border-rose-200" },
  telecom: { label: "Phone & Internet", badgeClass: "bg-teal-50 text-teal-700 border-teal-200" },
  professional_development: { label: "Training & Dev", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  other: { label: "General & Other", badgeClass: "bg-gray-100 text-gray-700 border-gray-200" },
};

export default function ReimbursementsPage() {
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  const canCreate = permissions.includes("reimbursements.create");
  const canApprove =
    permissions.includes("reimbursements.approve") ||
    permissions.includes("reimbursements.manage") ||
    permissions.includes("admin.full");
  const canPay =
    permissions.includes("reimbursements.pay") ||
    permissions.includes("reimbursements.manage") ||
    permissions.includes("admin.full");

  // State
  const [claims, setClaims] = React.useState<ReimbursementClaim[]>([]);
  const [kpi, setKpi] = React.useState<ReimbursementSummaryKPI | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Filters & Tabs
  const [activeTab, setActiveTab] = React.useState<string>("all");
  const [searchTerm, setSearchTerm] = React.useState<string>("");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all");
  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [totalPages, setTotalPages] = React.useState<number>(1);
  const [totalItems, setTotalItems] = React.useState<number>(0);

  // Create Modal State
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [createLoading, setCreateLoading] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [createForm, setCreateForm] = React.useState<ReimbursementClaimCreate>({
    title: "",
    category: "travel",
    claim_date: new Date().toISOString().split("T")[0] as string,
    amount: 0,
    currency: "USD",
    description: "",
    receipt_url: "",
    items: [],
    submit_immediately: false,
  });

  // Review Modal State
  const [reviewClaim, setReviewClaim] = React.useState<ReimbursementClaim | null>(null);
  const [reviewComment, setReviewComment] = React.useState<string>("");
  const [reviewLoading, setReviewLoading] = React.useState<boolean>(false);
  const [reviewError, setReviewError] = React.useState<string | null>(null);

  // Pay Modal State
  const [payClaim, setPayClaim] = React.useState<ReimbursementClaim | null>(null);
  const [paymentReference, setPaymentReference] = React.useState<string>("");
  const [payLoading, setPayLoading] = React.useState<boolean>(false);
  const [payError, setPayError] = React.useState<string | null>(null);

  // View Details Modal State
  const [viewClaim, setViewClaim] = React.useState<ReimbursementClaim | null>(null);

  // Fetch KPI
  const fetchKPI = React.useCallback(async () => {
    if (!currentOrganization) return;
    try {
      const res = await apiClient.get<ReimbursementSummaryKPI>(API_ENDPOINTS.reimbursements.summary);
      setKpi(res);
    } catch {
      // Ignored non-fatal for KPI
    }
  }, [currentOrganization]);

  // Fetch Claims List
  const fetchClaims = React.useCallback(async () => {
    if (!currentOrganization) return;
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {
        page: currentPage,
        page_size: 15,
      };
      if (activeTab !== "all") {
        params.status = activeTab;
      }
      if (categoryFilter !== "all") {
        params.category = categoryFilter;
      }
      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }

      const res = await apiClient.get<ClaimsResponse>(
        API_ENDPOINTS.reimbursements.list,
        { params }
      );
      setClaims(res.items || []);
      if (res.meta) {
        setTotalPages(res.meta.total_pages || 1);
        setTotalItems(res.meta.total || 0);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load reimbursement claims");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization, activeTab, categoryFilter, searchTerm, currentPage]);

  React.useEffect(() => {
    fetchKPI();
  }, [fetchKPI]);

  React.useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  // Handle Item Addition in Create Modal
  const handleAddItem = () => {
    const newItem: ReimbursementClaimItem = {
      description: "",
      amount: 0,
      category: createForm.category,
      expense_date: createForm.claim_date,
      receipt_url: "",
    };
    const nextItems = [...createForm.items, newItem];
    const totalAmount = nextItems.reduce(
      (acc, item) => acc + (parseFloat(String(item.amount)) || 0),
      0
    );
    setCreateForm((prev) => ({
      ...prev,
      items: nextItems,
      amount: totalAmount > 0 ? totalAmount : prev.amount,
    }));
  };

  const handleRemoveItem = (index: number) => {
    const nextItems = createForm.items.filter((_, i) => i !== index);
    const totalAmount = nextItems.reduce(
      (acc, item) => acc + (parseFloat(String(item.amount)) || 0),
      0
    );
    setCreateForm((prev) => ({
      ...prev,
      items: nextItems,
      amount: totalAmount > 0 ? totalAmount : prev.amount,
    }));
  };

  const handleItemChange = (
    index: number,
    field: keyof ReimbursementClaimItem,
    value: string | number
  ) => {
    const nextItems = [...createForm.items];
    const item = nextItems[index];
    if (!item) return;
    nextItems[index] = {
      description: item.description,
      amount: item.amount,
      category: item.category,
      expense_date: item.expense_date,
      receipt_url: item.receipt_url,
      [field]: value,
    };
    const totalAmount = nextItems.reduce(
      (acc, it) => acc + (parseFloat(String(it.amount)) || 0),
      0
    );
    setCreateForm((prev) => ({
      ...prev,
      items: nextItems,
      amount: totalAmount > 0 ? totalAmount : prev.amount,
    }));
  };

  // Submit New Claim Form
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) {
      setCreateError("Title is required");
      return;
    }
    if (createForm.amount <= 0) {
      setCreateError("Claim amount must be greater than zero");
      return;
    }

    setCreateLoading(true);
    setCreateError(null);
    try {
      await apiClient.post(API_ENDPOINTS.reimbursements.create, createForm);
      setShowCreateModal(false);
      setCreateForm({
        title: "",
        category: "travel",
        claim_date: new Date().toISOString().split("T")[0] as string,
        amount: 0,
        currency: "USD",
        description: "",
        receipt_url: "",
        items: [],
        submit_immediately: false,
      });
      fetchClaims();
      fetchKPI();
    } catch (err: any) {
      setCreateError(err?.message || "Failed to create reimbursement claim");
    } finally {
      setCreateLoading(false);
    }
  };

  // Submit Draft Claim
  const handleSubmitDraft = async (claimId: string) => {
    try {
      await apiClient.post(API_ENDPOINTS.reimbursements.submit(claimId));
      fetchClaims();
      fetchKPI();
    } catch (err: any) {
      alert(err?.message || "Failed to submit claim for approval");
    }
  };

  // Approve Claim
  const handleApprove = async () => {
    if (!reviewClaim) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      const payload: ReimbursementReviewAction = {
        reviewer_comment: reviewComment || undefined,
      };
      await apiClient.post(API_ENDPOINTS.reimbursements.approve(reviewClaim.id), payload);
      setReviewClaim(null);
      setReviewComment("");
      fetchClaims();
      fetchKPI();
    } catch (err: any) {
      setReviewError(err?.message || "Failed to approve claim");
    } finally {
      setReviewLoading(false);
    }
  };

  // Reject Claim
  const handleReject = async () => {
    if (!reviewClaim) return;
    if (!reviewComment.trim()) {
      setReviewError("Please provide a rejection note explaining why the claim was declined.");
      return;
    }
    setReviewLoading(true);
    setReviewError(null);
    try {
      const payload: ReimbursementReviewAction = {
        reviewer_comment: reviewComment,
      };
      await apiClient.post(API_ENDPOINTS.reimbursements.reject(reviewClaim.id), payload);
      setReviewClaim(null);
      setReviewComment("");
      fetchClaims();
      fetchKPI();
    } catch (err: any) {
      setReviewError(err?.message || "Failed to reject claim");
    } finally {
      setReviewLoading(false);
    }
  };

  // Pay Claim
  const handlePay = async () => {
    if (!payClaim) return;
    setPayLoading(true);
    setPayError(null);
    try {
      const payload: ReimbursementPayAction = {
        payment_reference: paymentReference || undefined,
      };
      await apiClient.post(API_ENDPOINTS.reimbursements.pay(payClaim.id), payload);
      setPayClaim(null);
      setPaymentReference("");
      fetchClaims();
      fetchKPI();
    } catch (err: any) {
      setPayError(err?.message || "Failed to mark claim as reimbursed");
    } finally {
      setPayLoading(false);
    }
  };

  // Cancel Claim
  const handleCancelClaim = async (claimId: string) => {
    if (!confirm("Are you sure you want to cancel this reimbursement claim?")) return;
    try {
      await apiClient.post(API_ENDPOINTS.reimbursements.cancel(claimId));
      fetchClaims();
      fetchKPI();
    } catch (err: any) {
      alert(err?.message || "Failed to cancel claim");
    }
  };

  if (isOrgLoading) {
    return <LoadingState message="Loading organization context..." />;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            <span>People & HR</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-indigo-600 font-semibold">Reimbursements</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Reimbursements & Claims
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Submit employee expense claims, review itemized receipts, and disburse reimbursements.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchClaims();
              fetchKPI();
            }}
            className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 border-slate-300"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </Button>

          {canCreate && (
            <Button
              onClick={() => {
                setCreateError(null);
                setShowCreateModal(true);
              }}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Submit Claim</span>
            </Button>
          )}
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Claims */}
        <Card className="border border-slate-200/80 shadow-sm bg-white hover:border-slate-300 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Total Claims
              </span>
              <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
                <Receipt className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold text-slate-900">
                {kpi ? kpi.total_claims_count : 0}
              </span>
              <p className="mt-1 text-xs text-slate-500">
                Lifetime value: ${kpi ? Number(kpi.total_claimed_amount).toLocaleString() : "0"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Pending Approval */}
        <Card className="border border-amber-200/80 shadow-sm bg-amber-50/30 hover:border-amber-300 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-amber-800">
                Pending Approval
              </span>
              <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700">
                <Clock className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold text-amber-900">
                {kpi ? kpi.pending_approval_count : 0}
              </span>
              <p className="mt-1 text-xs text-amber-700 font-medium">
                ${kpi ? Number(kpi.pending_approval_amount).toLocaleString() : "0"} awaiting review
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Ready for Payment */}
        <Card className="border border-blue-200/80 shadow-sm bg-blue-50/30 hover:border-blue-300 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-blue-800">
                Ready to Disburse
              </span>
              <div className="rounded-xl bg-blue-100 p-2.5 text-blue-700">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold text-blue-900">
                {kpi ? kpi.approved_unpaid_count : 0}
              </span>
              <p className="mt-1 text-xs text-blue-700 font-medium">Approved claims ready to pay</p>
            </div>
          </CardContent>
        </Card>

        {/* Reimbursed YTD */}
        <Card className="border border-emerald-200/80 shadow-sm bg-emerald-50/30 hover:border-emerald-300 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-emerald-800">
                Total Reimbursed
              </span>
              <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700">
                <DollarSign className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold text-emerald-900">
                ${kpi ? Number(kpi.total_reimbursed_amount).toLocaleString() : "0"}
              </span>
              <p className="mt-1 text-xs text-emerald-700 font-medium">
                {kpi ? kpi.paid_claims_count : 0} paid claims disbursed
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs & Search Controls */}
      <Card className="border border-slate-200/80 shadow-sm bg-white">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            {/* Status Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-sm font-medium border-b border-slate-100 pb-3">
              {[
                { id: "all", label: "All Claims" },
                { id: "submitted", label: "Pending Approval" },
                { id: "approved", label: "Approved" },
                { id: "paid", label: "Paid" },
                { id: "rejected", label: "Rejected" },
                { id: "draft", label: "Drafts" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? "bg-slate-900 text-white font-semibold shadow-xs"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              {/* Search */}
              <div className="relative sm:col-span-8">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search by claim number, title, or description..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9 bg-slate-50 border-slate-200 focus:bg-white text-sm"
                />
              </div>

              {/* Category Dropdown */}
              <div className="sm:col-span-4">
                <select
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">All Expense Categories</option>
                  <option value="travel">Travel & Mileage</option>
                  <option value="meals">Meals & Food</option>
                  <option value="office_supplies">Office Supplies</option>
                  <option value="tech_hardware">Hardware & Tech</option>
                  <option value="software_subscriptions">Software & Subscriptions</option>
                  <option value="medical">Medical & Health</option>
                  <option value="telecom">Phone & Internet</option>
                  <option value="professional_development">Training & Development</option>
                  <option value="other">Other / General</option>
                </select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Area: Claims Table */}
      {isLoading ? (
        <LoadingState message="Loading reimbursement claims..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchClaims} />
      ) : claims.length === 0 ? (
        <EmptyState
          title="No reimbursement claims found"
          description={
            searchTerm || activeTab !== "all" || categoryFilter !== "all"
              ? "No claims match your current filters. Try resetting the search or status."
              : "No expense reimbursement claims have been created yet. Submit a new claim to get started."
          }
          actionLabel={canCreate ? "Submit First Claim" : undefined}
          onAction={canCreate ? () => setShowCreateModal(true) : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3.5">
                    Claim #
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Employee
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Category
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Date
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right">
                    Amount
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-center">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {claims.map((claim) => {
                  const statusInfo = STATUS_CONFIG[claim.status] ?? {
                    label: "Draft",
                    className: "bg-slate-100 text-slate-700 border-slate-300",
                    dotColor: "bg-slate-400",
                  };
                  const categoryInfo = CATEGORY_CONFIG[claim.category] ?? {
                    label: "General",
                    badgeClass: "bg-gray-100 text-gray-700 border-gray-200",
                  };

                  return (
                    <tr
                      key={claim.id}
                      className="hover:bg-slate-50/80 transition-colors cursor-default"
                    >
                      {/* Claim Number & Title */}
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900 flex items-center gap-2">
                          <span>{claim.claim_number}</span>
                          {claim.receipt_url && (
                            <a
                              href={claim.receipt_url}
                              target="_blank"
                              rel="noreferrer"
                              title="View receipt"
                              className="text-indigo-600 hover:text-indigo-800"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 font-medium truncate max-w-xs mt-0.5">
                          {claim.title}
                        </div>
                      </td>

                      {/* Employee */}
                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-900">
                          {claim.employee_name || "Employee"}
                        </div>
                        {claim.employee_code && (
                          <div className="text-xs text-slate-500">{claim.employee_code}</div>
                        )}
                      </td>

                      {/* Category */}
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${categoryInfo.badgeClass}`}
                        >
                          {categoryInfo.label}
                        </span>
                      </td>

                      {/* Claim Date */}
                      <td className="px-5 py-4 whitespace-nowrap text-xs text-slate-600">
                        {new Date(claim.claim_date).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>

                      {/* Amount */}
                      <td className="px-5 py-4 text-right font-bold text-slate-900 whitespace-nowrap">
                        {claim.currency}{" "}
                        {Number(claim.amount).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${statusInfo.className}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dotColor}`} />
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View Details */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewClaim(claim)}
                            title="View details"
                            className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          {/* Submit Draft */}
                          {claim.status === "draft" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSubmitDraft(claim.id)}
                              title="Submit for approval"
                              className="h-8 px-2.5 text-xs text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 flex items-center gap-1"
                            >
                              <Send className="h-3.5 w-3.5" />
                              <span>Submit</span>
                            </Button>
                          )}

                          {/* Review Button (Approve/Reject) */}
                          {claim.status === "submitted" && canApprove && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setReviewComment("");
                                setReviewError(null);
                                setReviewClaim(claim);
                              }}
                              className="h-8 px-2.5 text-xs text-amber-800 bg-amber-50 border-amber-300 hover:bg-amber-100 flex items-center gap-1"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Review</span>
                            </Button>
                          )}

                          {/* Disburse / Pay */}
                          {claim.status === "approved" && canPay && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setPaymentReference("");
                                setPayError(null);
                                setPayClaim(claim);
                              }}
                              className="h-8 px-2.5 text-xs text-emerald-800 bg-emerald-50 border-emerald-300 hover:bg-emerald-100 flex items-center gap-1"
                            >
                              <CreditCard className="h-3.5 w-3.5" />
                              <span>Disburse</span>
                            </Button>
                          )}

                          {/* Cancel */}
                          {(claim.status === "draft" || claim.status === "submitted") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancelClaim(claim.id)}
                              title="Cancel claim"
                              className="h-8 w-8 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
              <span>
                Showing page {currentPage} of {totalPages} ({totalItems} total claims)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  className="h-7 px-2 text-xs"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  className="h-7 px-2 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Create Reimbursement Claim Modal                              */}
      {/* ------------------------------------------------------------- */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Submit Reimbursement Claim"
        description="File an employee expense claim for travel, meals, equipment, or business expenditures."
        size="lg"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {createError && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Title */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="claim-title">Claim Title / Purpose *</Label>
              <Input
                id="claim-title"
                required
                placeholder="e.g. Flight & Accommodation for Chicago Client Conference"
                value={createForm.title}
                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label htmlFor="claim-category">Category *</Label>
              <select
                id="claim-category"
                value={createForm.category}
                onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="travel">Travel & Mileage</option>
                <option value="meals">Meals & Food</option>
                <option value="office_supplies">Office Supplies</option>
                <option value="tech_hardware">Hardware & Tech</option>
                <option value="software_subscriptions">Software & Subscriptions</option>
                <option value="medical">Medical & Health</option>
                <option value="telecom">Phone & Internet</option>
                <option value="professional_development">Training & Development</option>
                <option value="other">Other / General</option>
              </select>
            </div>

            {/* Claim Date */}
            <div className="space-y-1.5">
              <Label htmlFor="claim-date">Expense Date *</Label>
              <Input
                id="claim-date"
                type="date"
                required
                value={createForm.claim_date}
                onChange={(e) => setCreateForm({ ...createForm, claim_date: e.target.value })}
              />
            </div>

            {/* Currency & Amount */}
            <div className="space-y-1.5">
              <Label htmlFor="claim-currency">Currency</Label>
              <select
                id="claim-currency"
                value={createForm.currency}
                onChange={(e) => setCreateForm({ ...createForm, currency: e.target.value })}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="INR">INR (₹)</option>
                <option value="CAD">CAD ($)</option>
                <option value="AUD">AUD ($)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="claim-amount">Total Amount *</Label>
              <Input
                id="claim-amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={createForm.amount}
                onChange={(e) =>
                  setCreateForm({ ...createForm, amount: parseFloat(e.target.value) || 0 })
                }
              />
            </div>

            {/* Receipt URL */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="claim-receipt">Receipt URL / Document Link</Label>
              <Input
                id="claim-receipt"
                type="url"
                placeholder="https://... (Cloud storage link or receipt attachment)"
                value={createForm.receipt_url || ""}
                onChange={(e) => setCreateForm({ ...createForm, receipt_url: e.target.value })}
              />
            </div>

            {/* Notes / Description */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="claim-desc">Notes & Justification</Label>
              <textarea
                id="claim-desc"
                rows={2}
                placeholder="Provide additional context or client details..."
                value={createForm.description || ""}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                className="w-full rounded-md border border-slate-300 p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Itemized Breakdown Section */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Itemized Expenses (Optional)
                </h4>
                <p className="text-xs text-slate-500">
                  Break down multi-item receipts into specific line items.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddItem}
                className="h-7 text-xs flex items-center gap-1 border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                <Plus className="h-3 w-3" />
                <span>Add Item</span>
              </Button>
            </div>

            {createForm.items.length > 0 && (
              <div className="space-y-2">
                {createForm.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded-lg border border-slate-200 shadow-xs"
                  >
                    <div className="col-span-6">
                      <Input
                        placeholder="Description (e.g. Taxi fare)"
                        value={item.description}
                        onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                        className="h-8 text-xs"
                        required
                      />
                    </div>
                    <div className="col-span-4">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Amount"
                        value={item.amount}
                        onChange={(e) =>
                          handleItemChange(idx, "amount", parseFloat(e.target.value) || 0)
                        }
                        className="h-8 text-xs font-medium"
                        required
                      />
                    </div>
                    <div className="col-span-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveItem(idx)}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit immediately toggle */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="submit-immediately"
              checked={createForm.submit_immediately}
              onChange={(e) =>
                setCreateForm({ ...createForm, submit_immediately: e.target.checked })
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <Label htmlFor="submit-immediately" className="text-xs text-slate-700 font-normal">
              Submit immediately for manager approval (uncheck to save as draft)
            </Label>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={createLoading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {createLoading
                ? "Submitting..."
                : createForm.submit_immediately
                  ? "Submit Claim"
                  : "Save Draft"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* Review Modal (Approve / Reject)                                */}
      {/* ------------------------------------------------------------- */}
      <Modal
        isOpen={Boolean(reviewClaim)}
        onClose={() => setReviewClaim(null)}
        title="Review Reimbursement Claim"
        description="Verify submitted expense receipts and approve or reject the claim."
        size="md"
      >
        {reviewClaim && (
          <div className="space-y-4">
            {reviewError && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{reviewError}</span>
              </div>
            )}

            {/* Claim Highlights */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Claim Number:</span>
                <span className="font-semibold text-slate-900">{reviewClaim.claim_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Employee:</span>
                <span className="font-medium text-slate-900">
                  {reviewClaim.employee_name || "Employee"} ({reviewClaim.employee_code || "N/A"})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Category:</span>
                <span className="font-medium text-slate-900 capitalize">
                  {reviewClaim.category}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Claimed:</span>
                <span className="font-bold text-slate-900 text-sm">
                  {reviewClaim.currency} {Number(reviewClaim.amount).toFixed(2)}
                </span>
              </div>
              {reviewClaim.receipt_url && (
                <div className="flex justify-between pt-1">
                  <span className="text-slate-500">Receipt Attachment:</span>
                  <a
                    href={reviewClaim.receipt_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    <span>Open Receipt Document</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>

            {/* Review Comment */}
            <div className="space-y-1.5">
              <Label htmlFor="review-comment">Reviewer Comments / Audit Notes</Label>
              <textarea
                id="review-comment"
                rows={3}
                placeholder="Optional for approval, required for rejection..."
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                className="w-full rounded-md border border-slate-300 p-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setReviewClaim(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={reviewLoading}
                onClick={handleReject}
                className="border-rose-300 text-rose-700 hover:bg-rose-50"
              >
                Reject Claim
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={reviewLoading}
                onClick={handleApprove}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {reviewLoading ? "Processing..." : "Approve Claim"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* Pay / Disburse Modal                                          */}
      {/* ------------------------------------------------------------- */}
      <Modal
        isOpen={Boolean(payClaim)}
        onClose={() => setPayClaim(null)}
        title="Disburse Reimbursement"
        description="Mark approved reimbursement claim as paid and record disbursement transaction."
        size="md"
      >
        {payClaim && (
          <div className="space-y-4">
            {payError && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{payError}</span>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Claim:</span>
                <span className="font-semibold text-slate-900">{payClaim.claim_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payee:</span>
                <span className="font-medium text-slate-900">{payClaim.employee_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Disbursement Amount:</span>
                <span className="font-bold text-emerald-700 text-sm">
                  {payClaim.currency} {Number(payClaim.amount).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-ref">Payment Reference / Transaction ID</Label>
              <Input
                id="pay-ref"
                placeholder="e.g. ACH-202610-091 or Payroll Ref PR-202610"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                Helps reconcile against bank statements or accounting ledgers.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" size="sm" onClick={() => setPayClaim(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={payLoading}
                onClick={handlePay}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {payLoading ? "Processing..." : "Confirm Payment"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* Details Modal                                                 */}
      {/* ------------------------------------------------------------- */}
      <Modal
        isOpen={Boolean(viewClaim)}
        onClose={() => setViewClaim(null)}
        title={viewClaim ? `${viewClaim.claim_number} Details` : "Claim Details"}
        size="lg"
      >
        {viewClaim && (
          <div className="space-y-4 text-xs">
            {/* Header info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-500 font-medium">Status</span>
                <div className="mt-1">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                      STATUS_CONFIG[viewClaim.status]?.className
                    }`}
                  >
                    {STATUS_CONFIG[viewClaim.status]?.label}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-slate-500 font-medium">Category</span>
                <div className="mt-1 font-semibold text-slate-900 capitalize">
                  {viewClaim.category}
                </div>
              </div>

              <div>
                <span className="text-slate-500 font-medium">Expense Date</span>
                <div className="mt-1 font-semibold text-slate-900">
                  {new Date(viewClaim.claim_date).toLocaleDateString()}
                </div>
              </div>

              <div>
                <span className="text-slate-500 font-medium">Total Amount</span>
                <div className="mt-1 font-bold text-slate-900 text-sm">
                  {viewClaim.currency} {Number(viewClaim.amount).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Purpose & Notes */}
            <div className="rounded-xl border border-slate-200 p-3.5 space-y-1">
              <span className="text-slate-500 font-semibold uppercase tracking-wider text-2xs">
                Purpose & Notes
              </span>
              <p className="text-slate-800 text-sm">{viewClaim.title}</p>
              {viewClaim.description && (
                <p className="text-slate-600 mt-1 whitespace-pre-wrap">{viewClaim.description}</p>
              )}
            </div>

            {/* Itemized list if any */}
            {viewClaim.items && viewClaim.items.length > 0 && (
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 border-b border-slate-200">
                  Itemized Expenses ({viewClaim.items.length})
                </div>
                <div className="divide-y divide-slate-100">
                  {viewClaim.items.map((it, i) => (
                    <div key={i} className="flex justify-between items-center p-3">
                      <div>
                        <div className="font-medium text-slate-900">{it.description}</div>
                        {it.category && (
                          <div className="text-2xs text-slate-500 capitalize">{it.category}</div>
                        )}
                      </div>
                      <div className="font-semibold text-slate-900">
                        {viewClaim.currency} {Number(it.amount).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Review & Audit Timeline */}
            <div className="rounded-xl border border-slate-200 p-3.5 space-y-2 bg-slate-50/50">
              <span className="text-slate-500 font-semibold uppercase tracking-wider text-2xs">
                Workflow & Audit Trail
              </span>
              <div className="space-y-1.5 text-xs text-slate-700">
                <div className="flex justify-between">
                  <span>Filed by:</span>
                  <span className="font-medium">
                    {viewClaim.employee_name} ({viewClaim.employee_code || "N/A"})
                  </span>
                </div>
                {viewClaim.submitted_at && (
                  <div className="flex justify-between">
                    <span>Submitted at:</span>
                    <span>{new Date(viewClaim.submitted_at).toLocaleString()}</span>
                  </div>
                )}
                {viewClaim.reviewed_at && (
                  <div className="flex justify-between">
                    <span>Reviewed by:</span>
                    <span>
                      {viewClaim.reviewer_name || "Manager"} on{" "}
                      {new Date(viewClaim.reviewed_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {viewClaim.reviewer_comment && (
                  <div className="pt-1 border-t border-slate-200">
                    <span className="text-slate-500 font-medium">Reviewer Comment:</span>
                    <p className="mt-0.5 text-slate-800 italic">&ldquo;{viewClaim.reviewer_comment}&rdquo;</p>
                  </div>
                )}
                {viewClaim.paid_at && (
                  <div className="flex justify-between pt-1 border-t border-slate-200 text-emerald-800 font-medium">
                    <span>Disbursed on:</span>
                    <span>
                      {new Date(viewClaim.paid_at).toLocaleString()}{" "}
                      {viewClaim.payment_reference ? `(${viewClaim.payment_reference})` : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* External Receipt Link */}
            {viewClaim.receipt_url && (
              <div className="flex justify-end pt-2">
                <a
                  href={viewClaim.receipt_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  <FileText className="h-4 w-4" />
                  <span>Open Attached Receipt</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
