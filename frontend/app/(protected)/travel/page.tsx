"use client";

import * as React from "react";
import {
  Plane,
  Search,
  Calendar,
  Download,
  Users,
  CheckCircle2,
  FileText,
  Eye,
  ShieldCheck,
  Layers,
  ArrowRight,
  Receipt,
  MapPin,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/feedback/loading-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { TravelKpiCards } from "@/components/travel/travel-kpi-cards";
import { TravelCharts } from "@/components/travel/travel-charts";
import { PlannedTravelModal } from "@/components/travel/planned-travel-modal";
import { PastTravelModal } from "@/components/travel/past-travel-modal";
import { TripDetailView } from "@/components/travel/trip-detail-view";
import type {
  TravelExpenseCreate,
  TravelExpenseReviewAction,
  TravelItineraryCreate,
  TravelMemberCreate,
  TravelPaymentCreate,
  TravelReportMetrics,
  TravelSettlementCreate,
  TravelSummaryKPI,
  TravelTrip,
  TravelTripActualCostsUpdate,
  TravelTripApprovalAction,
  TravelTripCreatePast,
  TravelTripCreatePlanned,
  TravelTripDetail,
} from "@/types/travel";

interface TripsResponse {
  items: TravelTrip[];
  meta?: {
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
  };
}

export default function TravelManagementPage() {
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  // Role permissions
  const canCreate = permissions.includes("travel.create");
  const canApprove =
    permissions.includes("travel.approve") ||
    permissions.includes("travel.manage") ||
    permissions.includes("admin.full");
  const canSettle =
    permissions.includes("travel.settle") ||
    permissions.includes("travel.manage") ||
    permissions.includes("admin.full");

  // Navigation tab
  const [activeTab, setActiveTab] = React.useState<
    "dashboard" | "all_trips" | "my_travel" | "expenses" | "approvals" | "reports"
  >("dashboard");

  // Data State
  const [kpi, setKpi] = React.useState<TravelSummaryKPI | null>(null);
  const [reports, setReports] = React.useState<TravelReportMetrics | null>(null);
  const [trips, setTrips] = React.useState<TravelTrip[]>([]);
  const [selectedTrip, setSelectedTrip] = React.useState<TravelTripDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isDetailLoading, setIsDetailLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Filters
  const [search, setSearch] = React.useState("");
  const [registrationTypeFilter, setRegistrationTypeFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [settlementStatusFilter, setSettlementStatusFilter] = React.useState("all");
  const [departmentFilter, setDepartmentFilter] = React.useState("all");
  const [startDateFilter, setStartDateFilter] = React.useState("");
  const [endDateFilter, setEndDateFilter] = React.useState("");

  // Pagination
  const [currentPage, setCurrentPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalItems, setTotalItems] = React.useState(0);

  // Dropdown reference lists
  const [departments, setDepartments] = React.useState<{ id: string; name: string }[]>([]);
  const [employees, setEmployees] = React.useState<
    { id: string; first_name: string; last_name: string; employee_code?: string }[]
  >([]);
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([]);
  const [clients, setClients] = React.useState<{ id: string; name: string }[]>([]);

  // Modals
  const [showPlannedModal, setShowPlannedModal] = React.useState(false);
  const [showPastModal, setShowPastModal] = React.useState(false);

  // Load Reference Data
  const loadReferenceData = React.useCallback(async () => {
    if (!currentOrganization) return;
    try {
      const [deptRes, empRes, projRes, clientRes] = await Promise.allSettled([
        apiClient.get<{ items: { id: string; name: string }[] }>(API_ENDPOINTS.departments.list),
        apiClient.get<{ items: { id: string; first_name: string; last_name: string; employee_code?: string }[] }>(
          API_ENDPOINTS.employees.list
        ),
        apiClient.get<{ items: { id: string; name: string }[] }>(API_ENDPOINTS.projects.list),
        apiClient.get<{ items: { id: string; name: string }[] }>(API_ENDPOINTS.clients.list),
      ]);

      if (deptRes.status === "fulfilled" && deptRes.value?.items) {
        setDepartments(deptRes.value.items);
      }
      if (empRes.status === "fulfilled" && empRes.value?.items) {
        setEmployees(empRes.value.items);
      }
      if (projRes.status === "fulfilled" && projRes.value?.items) {
        setProjects(projRes.value.items);
      }
      if (clientRes.status === "fulfilled" && clientRes.value?.items) {
        setClients(clientRes.value.items);
      }
    } catch {
      // Non-fatal reference loading
    }
  }, [currentOrganization]);

  // Load KPI & Reports
  const loadMetrics = React.useCallback(async () => {
    if (!currentOrganization) return;
    try {
      const [kpiRes, repRes] = await Promise.allSettled([
        apiClient.get<TravelSummaryKPI>(API_ENDPOINTS.travel.dashboard),
        apiClient.get<TravelReportMetrics>(API_ENDPOINTS.travel.reports),
      ]);

      if (kpiRes.status === "fulfilled" && kpiRes.value) {
        setKpi(kpiRes.value);
      }
      if (repRes.status === "fulfilled" && repRes.value) {
        setReports(repRes.value);
      }
    } catch {
      // Ignored
    }
  }, [currentOrganization]);

  // Load Trips List
  const loadTrips = React.useCallback(async () => {
    if (!currentOrganization) return;
    try {
      setIsLoading(true);
      setError(null);

      const params: Record<string, string | number> = {
        page: currentPage,
        page_size: 15,
      };

      if (search.trim()) params.search = search.trim();
      if (registrationTypeFilter !== "all") params.registration_type = registrationTypeFilter;
      if (statusFilter !== "all") params.status = statusFilter;
      if (settlementStatusFilter !== "all") params.settlement_status = settlementStatusFilter;
      if (departmentFilter !== "all") params.department_id = departmentFilter;
      if (startDateFilter) params.start_date = startDateFilter;
      if (endDateFilter) params.end_date = endDateFilter;

      // Special tab filters
      if (activeTab === "approvals") {
        params.status = "pending_approval";
      }

      const res = await apiClient.get<TripsResponse>(API_ENDPOINTS.travel.list, { params });
      setTrips(res.items || []);
      if (res.meta) {
        setTotalPages(res.meta.total_pages);
        setTotalItems(res.meta.total);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load travel trips";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [
    currentOrganization,
    currentPage,
    search,
    registrationTypeFilter,
    statusFilter,
    settlementStatusFilter,
    departmentFilter,
    startDateFilter,
    endDateFilter,
    activeTab,
  ]);

  // Initial Load
  React.useEffect(() => {
    if (currentOrganization) {
      loadReferenceData();
      loadMetrics();
      loadTrips();
    }
  }, [currentOrganization, loadReferenceData, loadMetrics, loadTrips]);

  // Load Single Trip Detail
  const handleOpenTripDetail = async (tripId: string) => {
    try {
      setIsDetailLoading(true);
      const detail = await apiClient.get<TravelTripDetail>(API_ENDPOINTS.travel.detail(tripId));
      setSelectedTrip(detail);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to open trip details";
      setError(msg);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleRefreshDetail = async () => {
    if (!selectedTrip) return;
    await handleOpenTripDetail(selectedTrip.id);
    await loadMetrics();
  };

  // Submit Planned Trip
  const handleSubmitTrip = async (tripId: string) => {
    await apiClient.post(API_ENDPOINTS.travel.submit(tripId));
    await handleRefreshDetail();
    await loadTrips();
  };

  // Approve Trip
  const handleApproveTrip = async (tripId: string, action: TravelTripApprovalAction) => {
    await apiClient.post(API_ENDPOINTS.travel.approve(tripId), action);
    await handleRefreshDetail();
    await loadTrips();
  };

  // Reject Trip
  const handleRejectTrip = async (tripId: string, action: TravelTripApprovalAction) => {
    await apiClient.post(API_ENDPOINTS.travel.reject(tripId), action);
    await handleRefreshDetail();
    await loadTrips();
  };

  // Cancel Trip
  const handleCancelTrip = async (tripId: string) => {
    await apiClient.post(API_ENDPOINTS.travel.cancel(tripId));
    await handleRefreshDetail();
    await loadTrips();
  };

  // Member Operations
  const handleAddMember = async (tripId: string, data: TravelMemberCreate) => {
    await apiClient.post(API_ENDPOINTS.travel.members(tripId), data);
  };

  const handleRemoveMember = async (tripId: string, memberId: string) => {
    await apiClient.delete(API_ENDPOINTS.travel.removeMember(tripId, memberId));
    await handleRefreshDetail();
  };

  // Itinerary Operations
  const handleAddItinerary = async (tripId: string, data: TravelItineraryCreate) => {
    await apiClient.post(API_ENDPOINTS.travel.itineraries(tripId), data);
  };

  const handleDeleteItinerary = async (tripId: string, itineraryId: string) => {
    await apiClient.delete(API_ENDPOINTS.travel.deleteItinerary(tripId, itineraryId));
    await handleRefreshDetail();
  };

  // Expense Operations
  const handleAddExpense = async (tripId: string, data: TravelExpenseCreate) => {
    await apiClient.post(API_ENDPOINTS.travel.expenses(tripId), data);
  };

  const handleDeleteExpense = async (tripId: string, expenseId: string) => {
    await apiClient.delete(API_ENDPOINTS.travel.deleteExpense(tripId, expenseId));
    await handleRefreshDetail();
  };

  const handleReviewExpense = async (
    tripId: string,
    expenseId: string,
    action: TravelExpenseReviewAction
  ) => {
    await apiClient.post(API_ENDPOINTS.travel.reviewExpense(tripId, expenseId), action);
  };

  // Settlement Operations
  const handleRecordSettlement = async (tripId: string, data: TravelSettlementCreate) => {
    await apiClient.post(API_ENDPOINTS.travel.settlements(tripId), data);
  };

  // Actual Costs Operations
  const handleUpdateActualCosts = async (tripId: string, data: TravelTripActualCostsUpdate) => {
    await apiClient.patch(API_ENDPOINTS.travel.updateActualCosts(tripId), data);
    await handleRefreshDetail();
    await loadTrips();
  };

  // Payment Operations
  const handleAddPayment = async (tripId: string, data: TravelPaymentCreate) => {
    await apiClient.post(API_ENDPOINTS.travel.payments(tripId), data);
    await handleRefreshDetail();
    await loadTrips();
  };

  const handleDeletePayment = async (tripId: string, paymentId: string) => {
    await apiClient.delete(API_ENDPOINTS.travel.deletePayment(tripId, paymentId));
    await handleRefreshDetail();
    await loadTrips();
  };

  // Create Planned Trip
  const handleCreatePlannedTrip = async (data: TravelTripCreatePlanned) => {
    const created = await apiClient.post<TravelTripDetail>(API_ENDPOINTS.travel.createPlanned, data);
    await loadMetrics();
    await loadTrips();
    setSelectedTrip(created);
  };

  // Create Past Trip
  const handleCreatePastTrip = async (data: TravelTripCreatePast) => {
    const created = await apiClient.post<TravelTripDetail>(API_ENDPOINTS.travel.createPast, data);
    await loadMetrics();
    await loadTrips();
    setSelectedTrip(created);
  };

  // Export CSV Helper
  const handleExportCSV = () => {
    if (trips.length === 0) return;
    const headers = [
      "Trip Number",
      "Title",
      "Registration Type",
      "Status",
      "Settlement Status",
      "Requester",
      "Origin",
      "Destination",
      "Start Date",
      "End Date",
      "Budget",
      "Approved Expenses",
      "Advance Paid",
    ];
    const rows = trips.map((t) => [
      t.trip_number,
      `"${t.title.replace(/"/g, '""')}"`,
      t.registration_type,
      t.status,
      t.settlement_status,
      `"${t.requester_name || ""}"`,
      `"${t.origin}"`,
      `"${t.destination}"`,
      t.actual_start_date || t.planned_start_date || "",
      t.actual_end_date || t.planned_end_date || "",
      t.estimated_budget,
      t.total_approved_expenses,
      t.advance_paid,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Travel_Trips_Export_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Currency formatter
  const formatCurrency = (val: number | string | undefined) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(num);
  };

  if (isOrgLoading || isDetailLoading) {
    return (
      <LoadingState
        message={isDetailLoading ? "Loading trip dossier & itinerary..." : "Loading organization travel context..."}
        fullPage
      />
    );
  }

  // If a specific trip is open in detailed view
  if (selectedTrip) {
    return (
      <TripDetailView
        trip={selectedTrip}
        onBack={() => {
          setSelectedTrip(null);
          loadTrips();
        }}
        onRefresh={handleRefreshDetail}
        onSubmitTrip={handleSubmitTrip}
        onApproveTrip={handleApproveTrip}
        onRejectTrip={handleRejectTrip}
        onCancelTrip={handleCancelTrip}
        onAddMember={handleAddMember}
        onRemoveMember={handleRemoveMember}
        onAddItinerary={handleAddItinerary}
        onDeleteItinerary={handleDeleteItinerary}
        onAddExpense={handleAddExpense}
        onDeleteExpense={handleDeleteExpense}
        onReviewExpense={handleReviewExpense}
        onRecordSettlement={handleRecordSettlement}
        onUpdateActualCosts={handleUpdateActualCosts}
        onAddPayment={handleAddPayment}
        onDeletePayment={handleDeletePayment}
        canApprove={canApprove}
        canSettle={canSettle}
        employees={employees}
      />
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-500 hover:text-rose-700 font-bold ml-2 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Module Title & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Travel Management</h1>
            <Badge variant="outline" className="border-primary-200 text-primary-700 bg-primary-50">
              People & HR
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            End-to-end corporate travel: planned requests, post-registered travel, groups, itineraries,
            expenses, advances, and financial settlements.
          </p>
        </div>

        {/* Dual Primary Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {canCreate && (
            <>
              <Button
                size="sm"
                onClick={() => setShowPlannedModal(true)}
                className="bg-primary-600 hover:bg-primary-700 text-white flex items-center gap-1.5 shadow-xs"
              >
                <Plane className="h-4 w-4" />
                <span>Request Planned Travel</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowPastModal(true)}
                className="border-purple-300 text-purple-700 hover:bg-purple-50 flex items-center gap-1.5 shadow-xs"
              >
                <Calendar className="h-4 w-4 text-purple-600" />
                <span>Register Past Travel</span>
              </Button>
            </>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 text-slate-600"
            title="Export CSV"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </div>

      {/* Module Level Tabs (Single unified module under HR) */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto pb-px">
          {[
            { id: "dashboard", label: "Dashboard", icon: Layers },
            { id: "all_trips", label: `All Trips (${totalItems})`, icon: Plane },
            { id: "my_travel", label: "My Travel", icon: Users },
            { id: "expenses", label: "Expenses & Receipts", icon: Receipt },
            {
              id: "approvals",
              label: `Approvals (${kpi?.pending_approvals ?? 0})`,
              icon: ShieldCheck,
              badge: kpi?.pending_approvals ? kpi.pending_approvals : undefined,
            },
            { id: "reports", label: "Reports & Analytics", icon: FileText },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as typeof activeTab);
                  setCurrentPage(1);
                }}
                className={`flex items-center gap-2 py-3 px-3.5 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? "border-primary-600 text-primary-700 bg-primary-50/40 rounded-t-lg"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-primary-600" : "text-slate-400"}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="ml-1 rounded-full bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 text-[10px]">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* TAB 1: DASHBOARD */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {/* KPI Statistics Ribbon */}
          <TravelKpiCards
            kpi={kpi}
            onFilterClick={(type) => {
              if (type === "pending_approval") {
                setActiveTab("approvals");
              } else if (type === "past") {
                setRegistrationTypeFilter("past");
                setActiveTab("all_trips");
              } else if (type === "unsettled") {
                setSettlementStatusFilter("unsettled");
                setActiveTab("all_trips");
              } else {
                setActiveTab("all_trips");
              }
            }}
          />

          {/* Graphical Analytics Trajectory */}
          <TravelCharts metrics={reports} />

          {/* Quick Registry Table for Active / Recent Trips */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Recent & Active Corporate Travel
                </CardTitle>
                <p className="text-xs text-slate-500">
                  Quick view of ongoing journeys and recently filed travel plans.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab("all_trips")}
                className="text-xs text-primary-600 hover:text-primary-700"
              >
                <span>View All Trips Registry</span>
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {trips.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No travel records found. Use the buttons above to request planned travel or register past travel.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50/80 text-slate-500 font-semibold border-y border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5">Trip Ref</th>
                        <th className="px-4 py-2.5">Title & Destination</th>
                        <th className="px-4 py-2.5">Registration Type</th>
                        <th className="px-4 py-2.5">Travel Dates</th>
                        <th className="px-4 py-2.5">Trip Owner</th>
                        <th className="px-4 py-2.5 text-right">Estimated Total</th>
                        <th className="px-4 py-2.5 text-right">Actual Total</th>
                        <th className="px-4 py-2.5 text-center">Status</th>
                        <th className="px-4 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {trips.slice(0, 5).map((trip) => (
                        <tr
                          key={trip.id}
                          className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                          onClick={() => handleOpenTripDetail(trip.id)}
                        >
                          <td className="px-4 py-3 font-mono font-bold text-primary-700">
                            {trip.trip_number}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-slate-900 block">{trip.title}</span>
                            <span className="text-[11px] text-slate-500 flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-slate-400" />
                              {trip.origin} → {trip.destination}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant="outline"
                              className={
                                trip.registration_type === "planned"
                                  ? "bg-blue-50 text-blue-700 border-blue-200 font-medium text-[10px]"
                                  : "bg-purple-50 text-purple-700 border-purple-200 font-medium text-[10px]"
                              }
                            >
                              {trip.registration_type === "planned" ? "Pre-Travel" : "Post-Travel"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {trip.actual_start_date || trip.planned_start_date} to{" "}
                            {trip.actual_end_date || trip.planned_end_date}
                          </td>
                          <td className="px-4 py-3 text-slate-700 font-medium">
                            {trip.requester_name || "Employee"}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-700">
                            {trip.registration_type === "planned"
                              ? formatCurrency(trip.estimated_total ?? trip.estimated_budget)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">
                            {formatCurrency(trip.actual_total || trip.total_approved_expenses || 0)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              className={`text-[10px] uppercase font-bold ${
                                trip.status === "approved"
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                  : trip.status === "pending_approval"
                                  ? "bg-amber-100 text-amber-800 border-amber-200"
                                  : trip.status === "completed"
                                  ? "bg-slate-100 text-slate-700 border-slate-300"
                                  : trip.status === "rejected"
                                  ? "bg-rose-100 text-rose-800 border-rose-200"
                                  : "bg-slate-100 text-slate-700 border-slate-200"
                              }`}
                            >
                              {trip.status.replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-primary-600 hover:text-primary-800"
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              <span>View</span>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: ALL TRIPS REGISTRY & TAB 3: MY TRAVEL */}
      {(activeTab === "all_trips" || activeTab === "my_travel") && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <Card className="border-slate-200/80 shadow-xs">
            <CardContent className="p-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5">
                <div className="lg:col-span-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      placeholder="Search ref #, title, destination..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-8 text-xs h-8"
                    />
                  </div>
                </div>

                <div>
                  <select
                    value={registrationTypeFilter}
                    onChange={(e) => setRegistrationTypeFilter(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2.5 py-1 text-xs bg-white h-8 text-slate-700"
                  >
                    <option value="all">All Registration Types</option>
                    <option value="planned">Pre-Travel (Planned)</option>
                    <option value="past">Post-Travel (Post-Registered)</option>
                  </select>
                </div>

                <div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2.5 py-1 text-xs bg-white h-8 text-slate-700"
                  >
                    <option value="all">All Trip Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="pending_approval">Pending Approval</option>
                    <option value="approved">Approved</option>
                    <option value="booked">Booked</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                    <option value="rejected">Rejected</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div>
                  <select
                    value={settlementStatusFilter}
                    onChange={(e) => setSettlementStatusFilter(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2.5 py-1 text-xs bg-white h-8 text-slate-700"
                  >
                    <option value="all">All Settlement Statuses</option>
                    <option value="unsettled">Unsettled</option>
                    <option value="pending">Settlement Pending</option>
                    <option value="partially_settled">Partially Settled</option>
                    <option value="settled">Settled</option>
                  </select>
                </div>

                <div>
                  <select
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2.5 py-1 text-xs bg-white h-8 text-slate-700"
                  >
                    <option value="all">All Departments</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Input
                    type="date"
                    value={startDateFilter}
                    onChange={(e) => setStartDateFilter(e.target.value)}
                    className="text-xs h-8 bg-white text-slate-700"
                    placeholder="From Date"
                    title="Filter trips on/after date"
                  />
                </div>

                <div>
                  <Input
                    type="date"
                    value={endDateFilter}
                    onChange={(e) => setEndDateFilter(e.target.value)}
                    className="text-xs h-8 bg-white text-slate-700"
                    placeholder="To Date"
                    title="Filter trips on/before date"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Trips Table */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="py-16">
                  <LoadingState message="Fetching travel records..." />
                </div>
              ) : trips.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-500">
                  <Plane className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700 text-sm">No trips match current filters</p>
                  <p className="text-slate-400 mt-1">
                    Try adjusting search criteria or register a new trip above.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50/90 text-slate-500 font-semibold border-y border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5">Trip Ref</th>
                        <th className="px-4 py-2.5">Title & Destination</th>
                        <th className="px-4 py-2.5">Type</th>
                        <th className="px-4 py-2.5">Owner / Department</th>
                        <th className="px-4 py-2.5">Travel Dates</th>
                        <th className="px-4 py-2.5 text-right">Estimated Total</th>
                        <th className="px-4 py-2.5 text-right">Actual Total</th>
                        <th className="px-4 py-2.5 text-right">Difference</th>
                        <th className="px-4 py-2.5 text-center">Payer</th>
                        <th className="px-4 py-2.5 text-center">Status</th>
                        <th className="px-4 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {trips.map((trip) => {
                        const estTotal = Number(trip.estimated_total ?? trip.estimated_budget ?? 0);
                        const actTotal = Number(trip.actual_total || trip.total_approved_expenses || 0);
                        const diff = actTotal - estTotal;
                        return (
                          <tr
                            key={trip.id}
                            className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                            onClick={() => handleOpenTripDetail(trip.id)}
                          >
                            <td className="px-4 py-3 font-mono font-bold text-primary-700">
                              {trip.trip_number}
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-semibold text-slate-900 block">{trip.title}</span>
                              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-slate-400" />
                                {trip.origin} → {trip.destination}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className={
                                  trip.registration_type === "planned"
                                    ? "bg-blue-50 text-blue-700 border-blue-200 font-medium text-[10px]"
                                    : "bg-purple-50 text-purple-700 border-purple-200 font-medium text-[10px]"
                                }
                              >
                                {trip.registration_type === "planned" ? "Pre-Travel" : "Post-Travel"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-medium text-slate-900 block">
                                {trip.requester_name || "Employee"}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {trip.department_name || "General"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {trip.actual_start_date || trip.planned_start_date} to{" "}
                              {trip.actual_end_date || trip.planned_end_date}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-slate-700">
                              {trip.registration_type === "planned" ? formatCurrency(estTotal) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-900">
                              {formatCurrency(actTotal)}
                            </td>
                            <td className="px-4 py-3 text-right font-medium">
                              {trip.registration_type === "planned" ? (
                                diff > 0 ? (
                                  <span className="text-rose-600 font-semibold">+{formatCurrency(diff)}</span>
                                ) : diff < 0 ? (
                                  <span className="text-emerald-600 font-semibold">{formatCurrency(diff)}</span>
                                ) : (
                                  <span className="text-slate-500 font-medium">{formatCurrency(0)}</span>
                                )
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge
                                variant="outline"
                                className={
                                  trip.payer_type === "employee"
                                    ? "bg-amber-50 text-amber-700 border-amber-200 text-[10px] capitalize"
                                    : trip.payer_type === "split"
                                    ? "bg-purple-50 text-purple-700 border-purple-200 text-[10px] capitalize"
                                    : "bg-slate-50 text-slate-700 border-slate-200 text-[10px] capitalize"
                                }
                              >
                                {trip.payer_type || "company"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge
                                className={`text-[10px] uppercase font-bold ${
                                  trip.status === "approved"
                                    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                    : trip.status === "pending_approval"
                                    ? "bg-amber-100 text-amber-800 border-amber-200"
                                    : trip.status === "completed"
                                    ? "bg-slate-100 text-slate-700 border-slate-300"
                                    : trip.status === "rejected"
                                    ? "bg-rose-100 text-rose-800 border-rose-200"
                                    : "bg-slate-100 text-slate-700 border-slate-200"
                                }`}
                              >
                                {trip.status.replace("_", " ")}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-primary-600 hover:text-primary-800"
                              >
                                <Eye className="h-3.5 w-3.5 mr-1" />
                                <span>Details</span>
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-3 border-t border-slate-100 text-xs">
                  <span className="text-slate-500">
                    Showing page {currentPage} of {totalPages} ({totalItems} total trips)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="h-7 text-xs"
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      className="h-7 text-xs"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: EXPENSES & RECEIPTS */}
      {activeTab === "expenses" && (
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-800">
                Corporate Travel Expense Claims
              </CardTitle>
              <p className="text-xs text-slate-500">
                Cross-trip expense management, receipt verification, and review workflow.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">
                Pending Reviews: <strong>{kpi?.pending_expense_reviews ?? 0}</strong>
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-4 text-xs text-slate-600 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
              <span>
                To view or review expenses for a specific journey, select the trip from the registry below.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("all_trips")}
                className="h-7 text-xs"
              >
                Browse All Trips
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5">Trip Number</th>
                    <th className="px-4 py-2.5">Title</th>
                    <th className="px-4 py-2.5">Requester</th>
                    <th className="px-4 py-2.5">Dates</th>
                    <th className="px-4 py-2.5 text-right">Submitted Expenses</th>
                    <th className="px-4 py-2.5 text-right">Approved Expenses</th>
                    <th className="px-4 py-2.5 text-center">Settlement</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trips.map((trip) => (
                    <tr
                      key={trip.id}
                      className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                      onClick={() => handleOpenTripDetail(trip.id)}
                    >
                      <td className="px-4 py-3 font-mono font-bold text-primary-700">
                        {trip.trip_number}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{trip.title}</td>
                      <td className="px-4 py-3 text-slate-700">{trip.requester_name || "Employee"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {trip.actual_start_date || trip.planned_start_date} to{" "}
                        {trip.actual_end_date || trip.planned_end_date}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-700">
                        {formatCurrency(trip.total_submitted_expenses)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">
                        {formatCurrency(trip.total_approved_expenses)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          className={`text-[10px] capitalize ${
                            trip.settlement_status === "settled"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {trip.settlement_status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-primary-600">
                          <span>Inspect Claims</span>
                          <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 5: APPROVALS QUEUE */}
      {activeTab === "approvals" && (
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-800">
                Approvals & Review Inbox
              </CardTitle>
              <p className="text-xs text-slate-500">
                Planned travel requests currently awaiting management or HR authorization.
              </p>
            </div>
            <Badge className="bg-amber-100 text-amber-800 border-amber-200">
              {trips.filter((t) => t.status === "pending_approval").length} Pending
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            {trips.filter((t) => t.status === "pending_approval").length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-400">
                <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
                <p className="font-semibold text-slate-700 text-sm">Inbox Zero!</p>
                <p className="text-slate-400 mt-1">There are no travel requests awaiting approval.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {trips
                  .filter((t) => t.status === "pending_approval")
                  .map((t) => (
                    <div
                      key={t.id}
                      className="p-4 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-primary-700">{t.trip_number}</span>
                          <span className="font-bold text-slate-900 text-sm">{t.title}</span>
                          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
                            Awaiting Authorization
                          </Badge>
                        </div>
                        <p className="text-slate-500 mt-1 line-clamp-1">{t.business_purpose}</p>
                        <div className="flex items-center gap-3 text-slate-400 mt-1.5 flex-wrap text-[11px]">
                          <span>Requester: <strong className="text-slate-700">{t.requester_name}</strong></span>
                          <span>•</span>
                          <span>Destination: <strong className="text-slate-700">{t.origin} → {t.destination}</strong></span>
                          <span>•</span>
                          <span>Estimated Budget: <strong className="text-slate-700">{formatCurrency(t.estimated_budget)}</strong></span>
                          {Number(t.advance_requested) > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-blue-700 font-semibold">
                                Advance Requested: {formatCurrency(t.advance_requested)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <Button
                          size="sm"
                          onClick={() => handleOpenTripDetail(t.id)}
                          className="bg-primary-600 hover:bg-primary-700 text-white h-8 text-xs"
                        >
                          Review & Decide
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 6: REPORTS & EXPORTS */}
      {activeTab === "reports" && (
        <div className="space-y-6">
          <TravelCharts metrics={reports} />

          {/* Budget vs Actual Comparative Table */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Budget Variance Analysis
                </CardTitle>
                <p className="text-xs text-slate-500">
                  Actual approved expenses versus original estimated budget across all trips.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 text-xs h-8"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export Audit CSV</span>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-y border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Trip Number</th>
                      <th className="px-4 py-2.5">Title</th>
                      <th className="px-4 py-2.5">Department</th>
                      <th className="px-4 py-2.5 text-right">Estimated Budget</th>
                      <th className="px-4 py-2.5 text-right">Actual Approved</th>
                      <th className="px-4 py-2.5 text-right">Variance</th>
                      <th className="px-4 py-2.5 text-center">Budget Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {trips.map((trip) => {
                      const budget = Number(trip.estimated_budget || 0);
                      const actual = Number(trip.total_approved_expenses || 0);
                      const variance = actual - budget;
                      const over = variance > 0;
                      return (
                        <tr
                          key={trip.id}
                          className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                          onClick={() => handleOpenTripDetail(trip.id)}
                        >
                          <td className="px-4 py-3 font-mono font-bold text-primary-700">
                            {trip.trip_number}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{trip.title}</td>
                          <td className="px-4 py-3 text-slate-600">{trip.department_name || "General"}</td>
                          <td className="px-4 py-3 text-right font-medium text-slate-700">
                            {formatCurrency(budget)}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">
                            {formatCurrency(actual)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-bold ${
                              over ? "text-rose-600" : "text-emerald-600"
                            }`}
                          >
                            {over ? "+" : ""}
                            {formatCurrency(variance)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              className={`text-[10px] ${
                                over
                                  ? "bg-rose-100 text-rose-800 border-rose-200"
                                  : "bg-emerald-100 text-emerald-800 border-emerald-200"
                              }`}
                            >
                              {over ? "Over Budget" : "Within Budget"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pre-Registration Modal */}
      <PlannedTravelModal
        isOpen={showPlannedModal}
        onClose={() => setShowPlannedModal(false)}
        onSubmit={handleCreatePlannedTrip}
        departments={departments}
        employees={employees}
        projects={projects}
        clients={clients}
      />

      {/* Post-Registration Modal */}
      <PastTravelModal
        isOpen={showPastModal}
        onClose={() => setShowPastModal(false)}
        onSubmit={handleCreatePastTrip}
        departments={departments}
        employees={employees}
        projects={projects}
        clients={clients}
      />
    </div>
  );
}
