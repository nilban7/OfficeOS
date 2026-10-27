"use client";

import * as React from "react";
import {
  Plane,
  Calendar,
  DollarSign,
  Users,
  FileText,
  CreditCard,
  History,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Send,
  Building2,
  MapPin,
  ArrowRight,
  ExternalLink,
  ChevronLeft,
  Check,
  X,
  Trash2,
  Receipt,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ExpenseModal } from "./expense-modal";
import { ItineraryModal } from "./itinerary-modal";
import { SettlementModal } from "./settlement-modal";
import { MemberModal } from "./member-modal";
import type {
  TravelExpenseCreate,
  TravelExpenseReviewAction,
  TravelItineraryCreate,
  TravelMemberCreate,
  TravelPaymentCreate,
  TravelSettlementCreate,
  TravelTripActualCostsUpdate,
  TravelTripApprovalAction,
  TravelTripDetail,
} from "@/types/travel";

interface TripDetailViewProps {
  trip: TravelTripDetail;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onSubmitTrip: (tripId: string) => Promise<void>;
  onApproveTrip: (tripId: string, action: TravelTripApprovalAction) => Promise<void>;
  onRejectTrip: (tripId: string, action: TravelTripApprovalAction) => Promise<void>;
  onCancelTrip: (tripId: string) => Promise<void>;
  onAddMember: (tripId: string, data: TravelMemberCreate) => Promise<void>;
  onRemoveMember: (tripId: string, memberId: string) => Promise<void>;
  onAddItinerary: (tripId: string, data: TravelItineraryCreate) => Promise<void>;
  onDeleteItinerary: (tripId: string, itineraryId: string) => Promise<void>;
  onAddExpense: (tripId: string, data: TravelExpenseCreate) => Promise<void>;
  onDeleteExpense: (tripId: string, expenseId: string) => Promise<void>;
  onReviewExpense: (tripId: string, expenseId: string, action: TravelExpenseReviewAction) => Promise<void>;
  onRecordSettlement: (tripId: string, data: TravelSettlementCreate) => Promise<void>;
  onUpdateActualCosts?: (tripId: string, data: TravelTripActualCostsUpdate) => Promise<void>;
  onAddPayment?: (tripId: string, data: TravelPaymentCreate) => Promise<void>;
  onDeletePayment?: (tripId: string, paymentId: string) => Promise<void>;
  canApprove: boolean;
  canSettle: boolean;
  employees: { id: string; first_name: string; last_name: string; employee_code?: string }[];
}

export function TripDetailView({
  trip,
  onBack,
  onRefresh,
  onSubmitTrip,
  onApproveTrip,
  onRejectTrip,
  onCancelTrip,
  onAddMember,
  onRemoveMember,
  onAddItinerary,
  onDeleteItinerary,
  onAddExpense,
  onDeleteExpense,
  onReviewExpense,
  onRecordSettlement,
  onUpdateActualCosts,
  onAddPayment,
  onDeletePayment,
  canApprove,
  canSettle,
  employees,
}: TripDetailViewProps) {
  const [activeTab, setActiveTab] = React.useState<
    "overview" | "members" | "itinerary" | "expenses" | "documents" | "settlement" | "history"
  >("overview");

  // Modals
  const [showMemberModal, setShowMemberModal] = React.useState(false);
  const [showItineraryModal, setShowItineraryModal] = React.useState(false);
  const [showExpenseModal, setShowExpenseModal] = React.useState(false);
  const [showSettlementModal, setShowSettlementModal] = React.useState(false);

  // Approval Modal
  const [showApprovalModal, setShowApprovalModal] = React.useState(false);
  const [approvalDecision, setApprovalDecision] = React.useState<"approve" | "reject">("approve");
  const [approvalComment, setApprovalComment] = React.useState("");
  const [approvalLoading, setApprovalLoading] = React.useState(false);

  // Expense Review Modal
  const [reviewExpenseId, setReviewExpenseId] = React.useState<string | null>(null);
  const [expenseReviewAction, setExpenseReviewAction] = React.useState<"approve" | "reject">("approve");
  const [expenseReviewComment, setExpenseReviewComment] = React.useState("");
  const [reviewLoading, setReviewLoading] = React.useState(false);

  // Actual Costs Update Modal State
  const [showActualCostsModal, setShowActualCostsModal] = React.useState(false);
  const [actualCostsForm, setActualCostsForm] = React.useState<TravelTripActualCostsUpdate>({
    act_travel_transport: Number(trip.act_travel_transport || 0),
    act_hotel_accommodation: Number(trip.act_hotel_accommodation || 0),
    act_food_meals: Number(trip.act_food_meals || 0),
    act_local_transport: Number(trip.act_local_transport || 0),
    act_other_expenses: Number(trip.act_other_expenses || 0),
    payer_type: (trip.payer_type as "company" | "employee" | "split") || "company",
    company_paid_amount: Number(trip.company_paid_amount || 0),
    employee_paid_amount: Number(trip.employee_paid_amount || 0),
  });
  const [actualCostsLoading, setActualCostsLoading] = React.useState(false);

  React.useEffect(() => {
    setActualCostsForm({
      act_travel_transport: Number(trip.act_travel_transport || 0),
      act_hotel_accommodation: Number(trip.act_hotel_accommodation || 0),
      act_food_meals: Number(trip.act_food_meals || 0),
      act_local_transport: Number(trip.act_local_transport || 0),
      act_other_expenses: Number(trip.act_other_expenses || 0),
      payer_type: (trip.payer_type as "company" | "employee" | "split") || "company",
      company_paid_amount: Number(trip.company_paid_amount || 0),
      employee_paid_amount: Number(trip.employee_paid_amount || 0),
    });
  }, [trip]);

  // Payment Entry Modal State
  const [showPaymentModal, setShowPaymentModal] = React.useState(false);
  const [paymentForm, setPaymentForm] = React.useState<TravelPaymentCreate>({
    payer_type: "company",
    payer_name: "",
    amount: 0,
    currency: trip.currency || "USD",
    payment_method: "corporate_card",
    payment_date: new Date().toISOString().split("T")[0] as string,
    transaction_reference: "",
    notes: "",
  });
  const [paymentLoading, setPaymentLoading] = React.useState(false);

  // Currency Formatter
  const currency = trip.currency || "USD";
  const formatCurrency = (val: number | string | undefined) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(num);
  };

  const settlementBalance = Number(trip.settlement_balance || 0);
  const budgetVariance = Number(trip.budget_variance || 0);
  const isOverBudget = budgetVariance > 0;

  const handleApprovalSubmit = async () => {
    try {
      setApprovalLoading(true);
      if (approvalDecision === "approve") {
        await onApproveTrip(trip.id, { approver_comment: approvalComment });
      } else {
        await onRejectTrip(trip.id, { approver_comment: approvalComment });
      }
      setShowApprovalModal(false);
      setApprovalComment("");
      await onRefresh();
    } catch {
      // Ignored
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleExpenseReviewSubmit = async () => {
    if (!reviewExpenseId) return;
    try {
      setReviewLoading(true);
      await onReviewExpense(trip.id, reviewExpenseId, {
        action: expenseReviewAction,
        reviewer_comment: expenseReviewComment,
      });
      setReviewExpenseId(null);
      setExpenseReviewComment("");
      await onRefresh();
    } catch {
      // Ignored
    } finally {
      setReviewLoading(false);
    }
  };

  const handleActualCostsSubmit = async () => {
    if (!onUpdateActualCosts) return;
    try {
      setActualCostsLoading(true);
      await onUpdateActualCosts(trip.id, actualCostsForm);
      setShowActualCostsModal(false);
      await onRefresh();
    } catch {
      // Ignored
    } finally {
      setActualCostsLoading(false);
    }
  };

  const handleAddPaymentSubmit = async () => {
    if (!onAddPayment) return;
    if (paymentForm.amount <= 0) return;
    try {
      setPaymentLoading(true);
      await onAddPayment(trip.id, paymentForm);
      setShowPaymentModal(false);
      setPaymentForm({
        payer_type: "company",
        payer_name: "",
        amount: 0,
        currency: trip.currency || "USD",
        payment_method: "corporate_card",
        payment_date: new Date().toISOString().split("T")[0] as string,
        transaction_reference: "",
        notes: "",
      });
      await onRefresh();
    } catch {
      // Ignored
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!onDeletePayment) return;
    if (!confirm("Are you sure you want to delete this payment record?")) return;
    try {
      await onDeletePayment(trip.id, paymentId);
      await onRefresh();
    } catch {
      // Ignored
    }
  };

  const liveModalActualTotal =
    Number(actualCostsForm.act_travel_transport || 0) +
    Number(actualCostsForm.act_hotel_accommodation || 0) +
    Number(actualCostsForm.act_food_meals || 0) +
    Number(actualCostsForm.act_local_transport || 0) +
    Number(actualCostsForm.act_other_expenses || 0);

  const handleActualCategoryChange = (key: keyof TravelTripActualCostsUpdate, val: number) => {
    setActualCostsForm((prev) => {
      const updated = { ...prev, [key]: val };
      const newTotal =
        Number(key === "act_travel_transport" ? val : updated.act_travel_transport || 0) +
        Number(key === "act_hotel_accommodation" ? val : updated.act_hotel_accommodation || 0) +
        Number(key === "act_food_meals" ? val : updated.act_food_meals || 0) +
        Number(key === "act_local_transport" ? val : updated.act_local_transport || 0) +
        Number(key === "act_other_expenses" ? val : updated.act_other_expenses || 0);

      if (updated.payer_type === "company") {
        updated.company_paid_amount = newTotal;
        updated.employee_paid_amount = 0;
      } else if (updated.payer_type === "employee") {
        updated.company_paid_amount = 0;
        updated.employee_paid_amount = newTotal;
      }
      return updated;
    });
  };

  const handlePayerTypeChange = (payerType: "company" | "employee" | "split") => {
    setActualCostsForm((prev) => {
      const total =
        Number(prev.act_travel_transport || 0) +
        Number(prev.act_hotel_accommodation || 0) +
        Number(prev.act_food_meals || 0) +
        Number(prev.act_local_transport || 0) +
        Number(prev.act_other_expenses || 0);
      let comp = Number(prev.company_paid_amount || 0);
      let emp = Number(prev.employee_paid_amount || 0);
      if (payerType === "company") {
        comp = total;
        emp = 0;
      } else if (payerType === "employee") {
        comp = 0;
        emp = total;
      } else if (comp === 0 && emp === 0) {
        comp = total;
        emp = 0;
      }
      return {
        ...prev,
        payer_type: payerType,
        company_paid_amount: comp,
        employee_paid_amount: emp,
      };
    });
  };

  // 5 Expense Categories Data
  const costCategories = [
    {
      key: "travel_transport",
      name: "Travel / Transport",
      est: Number(trip.est_travel_transport || 0),
      act: Number(trip.act_travel_transport || 0),
    },
    {
      key: "hotel_accommodation",
      name: "Hotel / Accommodation",
      est: Number(trip.est_hotel_accommodation || 0),
      act: Number(trip.act_hotel_accommodation || 0),
    },
    {
      key: "food_meals",
      name: "Food / Meals",
      est: Number(trip.est_food_meals || 0),
      act: Number(trip.act_food_meals || 0),
    },
    {
      key: "local_transport",
      name: "Local Transport",
      est: Number(trip.est_local_transport || 0),
      act: Number(trip.act_local_transport || 0),
    },
    {
      key: "other_expenses",
      name: "Other Expenses",
      est: Number(trip.est_other_expenses || 0),
      act: Number(trip.act_other_expenses || 0),
    },
  ];

  const totalEstimatedCosts = Number(trip.estimated_total ?? trip.estimated_budget ?? 0);
  const totalActualCosts = Number(trip.actual_total || 0);
  const totalCostDiff = totalActualCosts - totalEstimatedCosts;

  // Extract all documents & receipts from itineraries and expenses
  const allDocuments = React.useMemo(() => {
    const docs: { title: string; type: string; url: string; date: string; source: string }[] = [];
    trip.itineraries.forEach((itn) => {
      if (itn.attachment_url) {
        docs.push({
          title: `${itn.title} (Booking Confirmation)`,
          type: "Ticket / Voucher",
          url: itn.attachment_url,
          date: itn.created_at,
          source: itn.provider_name || itn.type,
        });
      }
    });
    trip.expenses.forEach((exp) => {
      if (exp.receipt_url) {
        docs.push({
          title: exp.receipt_file_name || `${exp.description} Receipt`,
          type: `${exp.category} Receipt`,
          url: exp.receipt_url,
          date: exp.expense_date,
          source: exp.employee_name || "Claimant",
        });
      }
    });
    return docs;
  }, [trip.itineraries, trip.expenses]);

  return (
    <div className="space-y-5">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="h-8 gap-1 text-slate-600 hover:text-slate-900 border-slate-200"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Back to Trips</span>
          </Button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
              {trip.trip_number}
            </span>
            <Badge
              variant={trip.registration_type === "planned" ? "default" : "secondary"}
              className={
                trip.registration_type === "planned"
                  ? "bg-blue-100 text-blue-800 border-blue-200 font-medium"
                  : "bg-purple-100 text-purple-800 border-purple-200 font-medium"
              }
            >
              {trip.registration_type === "planned" ? "Planned Travel" : "Post-Registered Past Travel"}
            </Badge>
            <Badge
              className={
                trip.status === "approved"
                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                  : trip.status === "pending_approval"
                  ? "bg-amber-100 text-amber-800 border-amber-200"
                  : trip.status === "completed"
                  ? "bg-slate-100 text-slate-800 border-slate-300"
                  : trip.status === "rejected"
                  ? "bg-rose-100 text-rose-800 border-rose-200"
                  : "bg-gray-100 text-gray-700 border-gray-200"
              }
            >
              Status: {trip.status.replace("_", " ").toUpperCase()}
            </Badge>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {trip.registration_type === "planned" && trip.status === "draft" && (
            <Button
              size="sm"
              onClick={() => onSubmitTrip(trip.id)}
              className="bg-primary-600 hover:bg-primary-700 text-white flex items-center gap-1.5 h-8 text-xs"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Submit for Approval</span>
            </Button>
          )}

          {trip.registration_type === "planned" && trip.status === "pending_approval" && canApprove && (
            <>
              <Button
                size="sm"
                onClick={() => {
                  setApprovalDecision("approve");
                  setShowApprovalModal(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 h-8 text-xs"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Approve Trip</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setApprovalDecision("reject");
                  setShowApprovalModal(true);
                }}
                className="text-rose-600 hover:bg-rose-50 border-rose-200 flex items-center gap-1 h-8 text-xs"
              >
                <X className="h-3.5 w-3.5" />
                <span>Reject</span>
              </Button>
            </>
          )}

          {trip.status !== "cancelled" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowExpenseModal(true)}
                className="flex items-center gap-1.5 h-8 text-xs"
              >
                <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                <span>Add Expense</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowItineraryModal(true)}
                className="flex items-center gap-1.5 h-8 text-xs"
              >
                <Plane className="h-3.5 w-3.5 text-blue-600" />
                <span>Add Booking</span>
              </Button>
              {canSettle && trip.settlement_status !== "settled" && (
                <Button
                  size="sm"
                  onClick={() => setShowSettlementModal(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 h-8 text-xs"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>Settle Trip</span>
                </Button>
              )}
              {trip.status !== "completed" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (window.confirm("Are you sure you want to cancel this trip? Incurred expenses and audit logs will be preserved.")) {
                      onCancelTrip(trip.id);
                    }
                  }}
                  className="text-slate-600 hover:bg-slate-100 flex items-center gap-1 h-8 text-xs"
                >
                  <Trash2 className="h-3.5 w-3.5 text-slate-400" />
                  <span>Cancel Trip</span>
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Trip Title Card */}
      <Card className="border-slate-200/90 shadow-sm bg-gradient-to-br from-white to-slate-50/50">
        <CardContent className="p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">{trip.title}</h1>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5 flex-wrap">
                <span className="flex items-center gap-1 font-medium text-slate-700">
                  <MapPin className="h-3.5 w-3.5 text-primary-600" />
                  {trip.origin} <ArrowRight className="h-3 w-3 inline" /> {trip.destination}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  {trip.actual_start_date || trip.planned_start_date} to{" "}
                  {trip.actual_end_date || trip.planned_end_date}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                  Owner: {trip.requester_name || "Employee"}
                </span>
                {trip.department_name && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5 text-slate-400" />
                      {trip.department_name}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Quick Metrics Badge Ribbon */}
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-center min-w-[90px]">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Budget
                </span>
                <span className="text-xs font-bold text-slate-800">
                  {formatCurrency(trip.estimated_budget)}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-center min-w-[90px]">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Approved Claims
                </span>
                <span className="text-xs font-bold text-emerald-700">
                  {formatCurrency(trip.total_approved_expenses)}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-center min-w-[90px]">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Advance Paid
                </span>
                <span className="text-xs font-bold text-blue-700">
                  {formatCurrency(trip.advance_paid)}
                </span>
              </div>

              <div
                className={`p-2.5 rounded-lg border text-center min-w-[100px] ${
                  settlementBalance > 0
                    ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                    : settlementBalance < 0
                    ? "bg-amber-50 border-amber-300 text-amber-800"
                    : "bg-slate-50 border-slate-200 text-slate-700"
                }`}
              >
                <span className="text-[10px] uppercase tracking-wider block font-bold">
                  {settlementBalance > 0
                    ? "Reimbursement"
                    : settlementBalance < 0
                    ? "Recovery"
                    : "Settled"}
                </span>
                <span className="text-xs font-black">
                  {formatCurrency(settlementBalance)}
                </span>
              </div>
            </div>
          </div>

          {/* Budget Variance Warning if exceeded */}
          {isOverBudget && (
            <div className="mt-4 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <span>
                <strong>Budget Warning:</strong> Actual approved expenses exceed the estimated budget by{" "}
                <strong>{formatCurrency(budgetVariance)}</strong>.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs Navigation Header */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto pb-px">
          {[
            { id: "overview", label: "Overview", icon: FileText },
            { id: "members", label: `Members (${trip.members.length})`, icon: Users },
            { id: "itinerary", label: `Itinerary & Bookings (${trip.itineraries.length})`, icon: Plane },
            { id: "expenses", label: `Expenses (${trip.expenses.length})`, icon: DollarSign },
            { id: "documents", label: `Documents (${allDocuments.length})`, icon: Receipt },
            { id: "settlement", label: "Advances & Settlement", icon: CreditCard },
            { id: "history", label: `Activity History (${trip.activity_logs.length})`, icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 py-2.5 px-3 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? "border-primary-600 text-primary-700 bg-primary-50/40 rounded-t-lg"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-primary-600" : "text-slate-400"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Card className="md:col-span-2 border-slate-200/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-800">Trip Overview & Purpose</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div>
                <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] block">
                  Business Purpose & Deliverables
                </span>
                <p className="mt-1 text-slate-800 leading-relaxed text-sm bg-slate-50 p-3 rounded-lg border border-slate-100">
                  {trip.business_purpose}
                </p>
              </div>

              {trip.missing_info_explanation && (
                <div>
                  <span className="font-semibold text-purple-700 uppercase tracking-wider text-[10px] block">
                    Post-Registration Documentation Notes
                  </span>
                  <p className="mt-1 text-purple-900 bg-purple-50/70 p-2.5 rounded-lg border border-purple-100">
                    {trip.missing_info_explanation}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] block">
                    Travel Dates
                  </span>
                  <p className="mt-1 text-slate-800 font-medium">
                    {trip.actual_start_date
                      ? `Actual: ${trip.actual_start_date} to ${trip.actual_end_date}`
                      : `Planned: ${trip.planned_start_date} to ${trip.planned_end_date}`}
                  </p>
                </div>

                <div>
                  <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] block">
                    Transport Mode
                  </span>
                  <p className="mt-1 text-slate-800 font-medium capitalize">
                    {trip.actual_transport_mode || trip.preferred_transport_mode || "Not specified"}
                  </p>
                </div>

                <div>
                  <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] block">
                    Client Association
                  </span>
                  <p className="mt-1 text-slate-800 font-medium">
                    {trip.client_name || "Internal / None"}
                  </p>
                </div>

                <div>
                  <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] block">
                    Project Reference
                  </span>
                  <p className="mt-1 text-slate-800 font-medium">
                    {trip.project_name || "General Business"}
                  </p>
                </div>
              </div>

              {trip.notes && (
                <div className="pt-2 border-t border-slate-100">
                  <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] block">
                    Additional Notes
                  </span>
                  <p className="mt-1 text-slate-700">{trip.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Authorization & Financial Cards */}
          <div className="space-y-4">
            <Card className="border-slate-200/80 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Approval & Verification
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 text-xs">
                {trip.registration_type === "planned" ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Travel Status:</span>
                      <span className="font-semibold capitalize text-slate-800">
                        {trip.status.replace("_", " ")}
                      </span>
                    </div>
                    {trip.approver_name && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Authorized By:</span>
                        <span className="font-semibold text-slate-800">{trip.approver_name}</span>
                      </div>
                    )}
                    {trip.approved_at && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Decision Date:</span>
                        <span className="text-slate-700">
                          {new Date(trip.approved_at).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {trip.approver_comment && (
                      <div className="pt-2 border-t border-slate-100">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                          Approver Notes
                        </span>
                        <p className="mt-0.5 text-slate-700 italic">&ldquo;{trip.approver_comment}&rdquo;</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-2.5 rounded bg-purple-50 text-purple-900 border border-purple-100">
                    <p className="font-semibold">Bypassed Prior Approval</p>
                    <p className="text-[11px] text-purple-700 mt-0.5">
                      Trip registered post-completion. No prior authorization was required.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200/80 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Budget Tracking & Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Estimated Budget:</span>
                  <span className="font-semibold text-slate-800">
                    {formatCurrency(trip.estimated_budget)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Booking Commitments:</span>
                  <span className="font-semibold text-slate-800">
                    {formatCurrency(trip.booking_commitments)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Submitted Claims:</span>
                  <span className="font-semibold text-slate-800">
                    {formatCurrency(trip.total_submitted_expenses)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                  <span className="text-slate-700 font-bold">Approved Actuals:</span>
                  <span className="font-bold text-emerald-700 text-sm">
                    {formatCurrency(trip.total_approved_expenses)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                  <span className="text-slate-500">Budget Variance:</span>
                  <span
                    className={`font-bold ${
                      isOverBudget ? "text-rose-600" : "text-emerald-600"
                    }`}
                  >
                    {isOverBudget ? "+" : ""}
                    {formatCurrency(budgetVariance)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

          {/* 5 Expense Categories: Estimated vs Actual Comparison Table */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Expense Categories & Cost Variance
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pre-travel approved estimates vs incurred actual costs across 5 categories. Actual costs remain editable post-approval.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {trip.registration_type === "planned" && trip.status !== "draft" && (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 text-xs">
                    Approved Estimates: {formatCurrency(totalEstimatedCosts)}
                  </Badge>
                )}
                {onUpdateActualCosts && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowActualCostsModal(true)}
                    className="text-xs border-primary-200 text-primary-700 hover:bg-primary-50"
                  >
                    Update Actual Costs
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Expense Category</th>
                      <th className="py-2.5 px-3">Estimated Cost</th>
                      <th className="py-2.5 px-3">Incurred Actual Cost</th>
                      <th className="py-2.5 px-3">Difference</th>
                      <th className="py-2.5 px-3 text-right">Variance Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {costCategories.map((cat) => {
                      const diff = cat.act - cat.est;
                      const hasEstimates = trip.registration_type === "planned";
                      return (
                        <tr key={cat.key} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3 font-medium text-slate-800">
                            {cat.name}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {hasEstimates ? (
                              formatCurrency(cat.est)
                            ) : (
                              <span className="text-slate-400 italic">No prior estimate</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">
                            {formatCurrency(cat.act)}
                          </td>
                          <td className="py-2.5 px-3">
                            {hasEstimates ? (
                              diff > 0 ? (
                                <span className="text-rose-600 font-medium">
                                  +{formatCurrency(diff)}
                                </span>
                              ) : diff < 0 ? (
                                <span className="text-emerald-600 font-medium">
                                  {formatCurrency(diff)}
                                </span>
                              ) : (
                                <span className="text-slate-500 font-medium">
                                  {formatCurrency(0)}
                                </span>
                              )
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {hasEstimates ? (
                              cat.act === 0 ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  Pending Actuals
                                </Badge>
                              ) : diff > 0 ? (
                                <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200">
                                  Over Estimate
                                </Badge>
                              ) : diff < 0 ? (
                                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                                  Within Estimate
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                  Exact Match
                                </Badge>
                              )
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">
                                Incurred
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-200">
                    <tr>
                      <td className="py-3 px-3 text-slate-900">Total Trip Costs</td>
                      <td className="py-3 px-3 text-slate-700">
                        {trip.registration_type === "planned"
                          ? formatCurrency(totalEstimatedCosts)
                          : "—"}
                      </td>
                      <td className="py-3 px-3 text-slate-900 text-sm">
                        {formatCurrency(totalActualCosts)}
                      </td>
                      <td className="py-3 px-3">
                        {trip.registration_type === "planned" ? (
                          totalCostDiff > 0 ? (
                            <span className="text-rose-600">+{formatCurrency(totalCostDiff)}</span>
                          ) : totalCostDiff < 0 ? (
                            <span className="text-emerald-600">{formatCurrency(totalCostDiff)}</span>
                          ) : (
                            <span className="text-slate-700">{formatCurrency(0)}</span>
                          )
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {trip.registration_type === "planned" && totalCostDiff !== 0 && (
                          <span
                            className={`text-[11px] font-semibold ${
                              totalCostDiff > 0 ? "text-rose-600" : "text-emerald-600"
                            }`}
                          >
                            {totalCostDiff > 0 ? "Over Budget" : "Under Budget"}
                          </span>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Payer Details & Multi-Payment Records */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Payer Details & Payment Records
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Expense responsibility breakdown across company and employee payers, with discrete payment entries.
                </p>
              </div>
              {onAddPayment && (
                <Button
                  size="sm"
                  onClick={() => setShowPaymentModal(true)}
                  className="text-xs bg-primary-600 hover:bg-primary-700 text-white"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Record Payment Entry
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Cost Split Summary KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                  <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                    Total Incurred Cost
                  </span>
                  <p className="mt-1 text-base font-bold text-slate-900">
                    {formatCurrency(totalActualCosts || trip.actual_total || 0)}
                  </p>
                  <span className="text-[10px] text-slate-500">Trip aggregate</span>
                </div>

                <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-100">
                  <span className="text-[10px] uppercase font-semibold text-blue-700 block">
                    Company-Paid Cost
                  </span>
                  <p className="mt-1 text-base font-bold text-blue-900">
                    {formatCurrency(trip.company_paid_amount || 0)}
                  </p>
                  <span className="text-[10px] text-blue-600">Direct corporate funds</span>
                </div>

                <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-100">
                  <span className="text-[10px] uppercase font-semibold text-amber-700 block">
                    Employee-Paid Cost
                  </span>
                  <p className="mt-1 text-base font-bold text-amber-900">
                    {formatCurrency(trip.employee_paid_amount || 0)}
                  </p>
                  <span className="text-[10px] text-amber-600">Paid out-of-pocket</span>
                </div>

                <div className="p-3 bg-purple-50/60 rounded-lg border border-purple-100">
                  <span className="text-[10px] uppercase font-semibold text-purple-700 block">
                    Payer Configuration
                  </span>
                  <p className="mt-1 text-sm font-bold capitalize text-purple-900">
                    {trip.payer_type ? `${trip.payer_type.replace("_", " ")} Payment` : "Company Paid"}
                  </p>
                  <span className="text-[10px] text-purple-600">Trip funding model</span>
                </div>
              </div>

              {/* Reimbursement Policy Banner */}
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-950">
                    Reimbursement Policy Notice
                  </p>
                  <p className="mt-0.5 text-amber-800 text-[11px] leading-relaxed">
                    Employee-paid trip costs are <strong className="text-amber-950 underline">not automatically marked as reimbursed</strong>.
                    Any out-of-pocket expenses must be submitted as verified expense receipts and settled through the finance reimbursement process.
                  </p>
                </div>
              </div>

              {/* Payments List Table */}
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Payer</th>
                      <th className="py-2.5 px-3">Payer Name</th>
                      <th className="py-2.5 px-3">Amount</th>
                      <th className="py-2.5 px-3">Payment Method</th>
                      <th className="py-2.5 px-3">Payment Date</th>
                      <th className="py-2.5 px-3">Transaction Reference</th>
                      <th className="py-2.5 px-3">Notes</th>
                      {onDeletePayment && <th className="py-2.5 px-3 text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(!trip.payments || trip.payments.length === 0) ? (
                      <tr>
                        <td
                          colSpan={onDeletePayment ? 8 : 7}
                          className="py-6 text-center text-slate-500 italic"
                        >
                          No payment entries recorded yet. Use &ldquo;Record Payment Entry&rdquo; to capture specific transaction records.
                        </td>
                      </tr>
                    ) : (
                      trip.payments.map((pmt) => (
                        <tr key={pmt.id} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3">
                            <Badge
                              variant="outline"
                              className={
                                pmt.payer_type === "company"
                                  ? "bg-blue-50 text-blue-700 border-blue-200 capitalize text-[10px]"
                                  : "bg-amber-50 text-amber-700 border-amber-200 capitalize text-[10px]"
                              }
                            >
                              {pmt.payer_type}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-800">
                            {pmt.payer_name || (pmt.payer_type === "company" ? "Corporate Account" : trip.requester_name || "Employee")}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {formatCurrency(pmt.amount)}
                          </td>
                          <td className="py-2.5 px-3 capitalize text-slate-700">
                            {pmt.payment_method.replace("_", " ")}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {pmt.payment_date || "—"}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                            {pmt.transaction_reference || "—"}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 max-w-[150px] truncate">
                            {pmt.notes || "—"}
                          </td>
                          {onDeletePayment && (
                            <td className="py-2.5 px-3 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeletePayment(pmt.id)}
                                className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                                title="Delete payment entry"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 2: Members */}
      {activeTab === "members" && (
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-800">
                Travelling Team Roster
              </CardTitle>
              <p className="text-xs text-slate-500">
                Employees travelling on this trip, individual dates, and submitted expenses.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setShowMemberModal(true)}
              className="flex items-center gap-1.5 h-8 text-xs bg-primary-600 hover:bg-primary-700 text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Participant</span>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50/80 text-slate-500 font-semibold border-y border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5">Employee</th>
                    <th className="px-4 py-2.5">Trip Role</th>
                    <th className="px-4 py-2.5">Participation</th>
                    <th className="px-4 py-2.5">Travel Dates</th>
                    <th className="px-4 py-2.5 text-right">Incurred Expenses</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {trip.members.map((member) => (
                    <tr key={member.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 font-semibold">
                        {member.employee_name}
                        {member.employee_code && (
                          <span className="text-[10px] text-slate-400 font-mono ml-1.5">
                            ({member.employee_code})
                          </span>
                        )}
                        {member.department_name && (
                          <span className="block text-[10px] text-slate-400 font-normal">
                            {member.department_name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className="capitalize font-medium text-[11px] bg-slate-50"
                        >
                          {member.trip_role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          <span className="capitalize">{member.participation_status}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {member.individual_departure_date || trip.planned_start_date || "—"} to{" "}
                        {member.individual_return_date || trip.planned_end_date || "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {formatCurrency(member.total_expenses)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {member.employee_id !== trip.requester_id ? (
                          <button
                            type="button"
                            onClick={() => onRemoveMember(trip.id, member.id)}
                            className="text-slate-400 hover:text-rose-600 p-1"
                            title="Remove participant"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Trip Owner</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Itinerary & Bookings */}
      {activeTab === "itinerary" && (
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-800">
                Itinerary & Confirmed Bookings
              </CardTitle>
              <p className="text-xs text-slate-500">
                Flights, trains, hotels, and scheduled activities for all travellers.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setShowItineraryModal(true)}
              className="flex items-center gap-1.5 h-8 text-xs bg-primary-600 hover:bg-primary-700 text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Booking</span>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {trip.itineraries.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                No itineraries or bookings recorded yet. Click &quot;Add Booking&quot; to enter flights or hotels.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50/80 text-slate-500 font-semibold border-y border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Type & Title</th>
                      <th className="px-4 py-2.5">Carrier / Provider</th>
                      <th className="px-4 py-2.5">Locations</th>
                      <th className="px-4 py-2.5">Reference / PNR</th>
                      <th className="px-4 py-2.5">Assigned To</th>
                      <th className="px-4 py-2.5 text-right">Cost</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {trip.itineraries.map((itn) => (
                      <tr key={itn.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-semibold block">{itn.title}</span>
                          <span className="text-[10px] text-primary-600 uppercase font-semibold">
                            {itn.type} • {itn.booking_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {itn.provider_name || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {itn.departure_location && itn.arrival_location
                            ? `${itn.departure_location} → ${itn.arrival_location}`
                            : itn.departure_location || itn.arrival_location || "—"}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-800">
                          {itn.booking_reference || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {itn.member_name || "Shared"}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">
                          {formatCurrency(itn.estimated_cost)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {itn.attachment_url && (
                              <a
                                href={itn.attachment_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary-600 hover:text-primary-800 p-1"
                                title="View confirmation"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => onDeleteItinerary(trip.id, itn.id)}
                              className="text-slate-400 hover:text-rose-600 p-1"
                              title="Delete booking"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 4: Expenses */}
      {activeTab === "expenses" && (
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-800">
                Incurred Travel Expenses & Receipts
              </CardTitle>
              <p className="text-xs text-slate-500">
                Detailed claims submitted for this trip. Filterable by category, employee, and status.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setShowExpenseModal(true)}
              className="flex items-center gap-1.5 h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Record Expense</span>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {trip.expenses.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                No expenses recorded for this trip yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50/80 text-slate-500 font-semibold border-y border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Claimant</th>
                      <th className="px-4 py-2.5">Category</th>
                      <th className="px-4 py-2.5">Description</th>
                      <th className="px-4 py-2.5">Method</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                      <th className="px-4 py-2.5 text-center">Status</th>
                      <th className="px-4 py-2.5 text-right">Review / Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {trip.expenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 text-slate-500">{exp.expense_date}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {exp.employee_name || "Employee"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="capitalize px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[11px]">
                            {exp.category.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold block">{exp.description}</span>
                          {exp.reviewer_comment && (
                            <span className="text-[10px] text-slate-400 italic block">
                              Note: {exp.reviewer_comment}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 capitalize text-slate-600">
                          {exp.payment_method.replace("_", " ")}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">
                          {formatCurrency(exp.amount)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            className={
                              exp.status === "approved"
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                : exp.status === "submitted"
                                ? "bg-amber-100 text-amber-800 border-amber-200"
                                : exp.status === "paid"
                                ? "bg-blue-100 text-blue-800 border-blue-200"
                                : exp.status === "rejected"
                                ? "bg-rose-100 text-rose-800 border-rose-200"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                            }
                          >
                            {exp.status.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {exp.receipt_url && (
                              <a
                                href={exp.receipt_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary-600 hover:text-primary-800 p-1"
                                title="View Receipt"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}

                            {canApprove && exp.status === "submitted" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReviewExpenseId(exp.id);
                                    setExpenseReviewAction("approve");
                                  }}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                  title="Approve expense"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReviewExpenseId(exp.id);
                                    setExpenseReviewAction("reject");
                                  }}
                                  className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                                  title="Reject expense"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}

                            {exp.status === "draft" && (
                              <button
                                type="button"
                                onClick={() => onDeleteExpense(trip.id, exp.id)}
                                className="text-slate-400 hover:text-rose-600 p-1"
                                title="Delete expense"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 5: Documents */}
      {activeTab === "documents" && (
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-800">
              Trip Documents, Tickets & Receipts Repository
            </CardTitle>
            <p className="text-xs text-slate-500">
              Consolidated audit repository of all booking confirmations, boarding passes, invoices, and vouchers.
            </p>
          </CardHeader>
          <CardContent>
            {allDocuments.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                No documents or receipt URLs uploaded for this trip yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {allDocuments.map((doc, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-lg border border-slate-200 bg-white hover:border-primary-300 transition-colors flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-primary-600 uppercase tracking-wider">
                          {doc.type}
                        </span>
                        <Receipt className="h-4 w-4 text-slate-400" />
                      </div>
                      <h4 className="text-xs font-bold text-slate-900 mt-1 line-clamp-1">
                        {doc.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">Source: {doc.source}</p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">{doc.date.split("T")[0]}</span>
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-primary-600 hover:text-primary-800 flex items-center gap-1"
                      >
                        <span>View Document</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 6: Advances & Settlement */}
      {activeTab === "settlement" && (
        <div className="space-y-5">
          {/* Financial Lifecycle Card */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Advances, Reimbursements & Final Settlement
                </CardTitle>
                <p className="text-xs text-slate-500">
                  Reconciliation balance: Approved Reimbursable Expenses − Actual Advance Paid.
                </p>
              </div>
              {canSettle && (
                <Button
                  size="sm"
                  onClick={() => setShowSettlementModal(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 h-8 text-xs"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>Execute Settlement</span>
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 block font-semibold">
                    Approved Claims
                  </span>
                  <span className="text-base font-bold text-slate-900 mt-1 block">
                    {formatCurrency(trip.total_approved_expenses)}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 block font-semibold">
                    Cash Advance Paid
                  </span>
                  <span className="text-base font-bold text-blue-700 mt-1 block">
                    {formatCurrency(trip.advance_paid)}
                  </span>
                </div>

                <div
                  className={`p-3 rounded-lg border ${
                    settlementBalance > 0
                      ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                      : settlementBalance < 0
                      ? "bg-amber-50 border-amber-300 text-amber-900"
                      : "bg-slate-50 border-slate-200 text-slate-800"
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wider block font-bold">
                    Net Settlement Balance
                  </span>
                  <span className="text-base font-black mt-1 block">
                    {formatCurrency(settlementBalance)}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 block font-semibold">
                    Settlement Status
                  </span>
                  <Badge
                    className={`mt-1 capitalize ${
                      trip.settlement_status === "settled"
                        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                        : "bg-amber-100 text-amber-800 border-amber-300"
                    }`}
                  >
                    {trip.settlement_status.replace("_", " ")}
                  </Badge>
                </div>
              </div>

              {/* Settlement History Table */}
              <div className="pt-2">
                <h4 className="text-xs font-bold text-slate-800 mb-2">Settlement Payment Ledger</h4>
                {trip.settlements.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                    No financial settlements executed yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-2.5">Date</th>
                          <th className="px-4 py-2.5">Type</th>
                          <th className="px-4 py-2.5">Method</th>
                          <th className="px-4 py-2.5">Reference #</th>
                          <th className="px-4 py-2.5">Settled By</th>
                          <th className="px-4 py-2.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {trip.settlements.map((stl) => (
                          <tr key={stl.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2.5 text-slate-600">{stl.payment_date}</td>
                            <td className="px-4 py-2.5 capitalize font-medium text-slate-800">
                              {stl.settlement_type.replace("_", " ")}
                            </td>
                            <td className="px-4 py-2.5 capitalize text-slate-600">
                              {stl.payment_method?.replace("_", " ") || "—"}
                            </td>
                            <td className="px-4 py-2.5 font-mono font-bold text-slate-800">
                              {stl.payment_reference || "—"}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600">
                              {stl.settler_name || "Finance Admin"}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-emerald-700">
                              {formatCurrency(stl.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 7: Activity History */}
      {activeTab === "history" && (
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-800">
              Trip Audit & Activity History
            </CardTitle>
            <p className="text-xs text-slate-500">
              Immutable timeline of all state transitions, approvals, additions, and settlements.
            </p>
          </CardHeader>
          <CardContent>
            {trip.activity_logs.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No activity logs recorded.
              </div>
            ) : (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {trip.activity_logs.map((log) => (
                  <div key={log.id} className="relative group text-xs">
                    <span className="absolute -left-6 top-1 h-3 w-3 rounded-full border-2 border-white bg-primary-600 shadow-2xs" />
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 capitalize">
                        {log.action.replace("_", " ")}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-slate-600 mt-0.5">{log.description}</p>
                    {log.actor_name && (
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Actor: {log.actor_name}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modals */}
      <MemberModal
        isOpen={showMemberModal}
        onClose={() => setShowMemberModal(false)}
        onSubmit={async (data) => {
          await onAddMember(trip.id, data);
          await onRefresh();
        }}
        employees={employees}
        existingMemberEmployeeIds={trip.members.map((m) => m.employee_id)}
        defaultDepartureDate={trip.actual_start_date || trip.planned_start_date}
        defaultReturnDate={trip.actual_end_date || trip.planned_end_date}
      />

      <ItineraryModal
        isOpen={showItineraryModal}
        onClose={() => setShowItineraryModal(false)}
        onSubmit={async (data) => {
          await onAddItinerary(trip.id, data);
          await onRefresh();
        }}
        members={trip.members}
      />

      <ExpenseModal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        onSubmit={async (data) => {
          await onAddExpense(trip.id, data);
          await onRefresh();
        }}
        tripCurrency={trip.currency}
        members={trip.members}
      />

      <SettlementModal
        isOpen={showSettlementModal}
        onClose={() => setShowSettlementModal(false)}
        onSubmit={async (data) => {
          await onRecordSettlement(trip.id, data);
          await onRefresh();
        }}
        tripNumber={trip.trip_number}
        currency={trip.currency}
        settlementBalance={settlementBalance}
        approvedExpenses={Number(trip.total_approved_expenses || 0)}
        advancePaid={Number(trip.advance_paid || 0)}
        requesterName={trip.requester_name}
      />

      {/* Trip Approval Decision Modal */}
      <Modal
        isOpen={showApprovalModal}
        onClose={() => setShowApprovalModal(false)}
        title={approvalDecision === "approve" ? "Authorize Planned Travel" : "Reject Travel Request"}
        description="Record your approver decision and notes for the trip owner and HR audit records."
        size="md"
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="approval_comment" className="text-xs font-semibold text-slate-700">
              Approver Comments / Instructions
            </Label>
            <textarea
              id="approval_comment"
              value={approvalComment}
              onChange={(e) => setApprovalComment(e.target.value)}
              rows={3}
              placeholder={
                approvalDecision === "approve"
                  ? "Approved. Proceed with travel booking according to company policy..."
                  : "Please state reason for rejection (e.g. Budget constraints, reschedule required)..."
              }
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowApprovalModal(false)}
              disabled={approvalLoading}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleApprovalSubmit}
              disabled={approvalLoading}
              className={
                approvalDecision === "approve"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-rose-600 hover:bg-rose-700 text-white"
              }
            >
              {approvalLoading
                ? "Processing..."
                : approvalDecision === "approve"
                ? "Confirm Approval"
                : "Confirm Rejection"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Expense Review Decision Modal */}
      <Modal
        isOpen={Boolean(reviewExpenseId)}
        onClose={() => setReviewExpenseId(null)}
        title={expenseReviewAction === "approve" ? "Approve Expense Claim" : "Reject Expense Claim"}
        description="Validate and approve receipt claim for employee reimbursement."
        size="md"
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="expense_comment" className="text-xs font-semibold text-slate-700">
              Reviewer Notes
            </Label>
            <textarea
              id="expense_comment"
              value={expenseReviewComment}
              onChange={(e) => setExpenseReviewComment(e.target.value)}
              rows={3}
              placeholder={
                expenseReviewAction === "approve"
                  ? "Receipt verified and approved for reimbursement..."
                  : "State reason for rejecting this claim (e.g. Missing receipt, out-of-policy)..."
              }
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReviewExpenseId(null)}
              disabled={reviewLoading}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleExpenseReviewSubmit}
              disabled={reviewLoading}
              className={
                expenseReviewAction === "approve"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-rose-600 hover:bg-rose-700 text-white"
              }
            >
              {reviewLoading
                ? "Processing..."
                : expenseReviewAction === "approve"
                ? "Approve Claim"
                : "Reject Claim"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Update Actual Trip Costs Modal */}
      <Modal
        isOpen={showActualCostsModal}
        onClose={() => setShowActualCostsModal(false)}
        title="Update Incurred Actual Costs"
        description="Record or update actual costs for the 5 travel expense categories and configure payer allocation."
        size="lg"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="modal_act_travel_transport" className="text-xs font-semibold text-slate-700">
                1. Travel / Transport Cost ({currency})
              </Label>
              <Input
                id="modal_act_travel_transport"
                type="number"
                min="0"
                step="0.01"
                value={actualCostsForm.act_travel_transport ?? 0}
                onChange={(e) => handleActualCategoryChange("act_travel_transport", Number(e.target.value) || 0)}
                className="mt-1 text-xs"
              />
              {trip.registration_type === "planned" && (
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Approved Estimate: {formatCurrency(trip.est_travel_transport || 0)}
                </span>
              )}
            </div>

            <div>
              <Label htmlFor="modal_act_hotel_accommodation" className="text-xs font-semibold text-slate-700">
                2. Hotel / Accommodation ({currency})
              </Label>
              <Input
                id="modal_act_hotel_accommodation"
                type="number"
                min="0"
                step="0.01"
                value={actualCostsForm.act_hotel_accommodation ?? 0}
                onChange={(e) => handleActualCategoryChange("act_hotel_accommodation", Number(e.target.value) || 0)}
                className="mt-1 text-xs"
              />
              {trip.registration_type === "planned" && (
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Approved Estimate: {formatCurrency(trip.est_hotel_accommodation || 0)}
                </span>
              )}
            </div>

            <div>
              <Label htmlFor="modal_act_food_meals" className="text-xs font-semibold text-slate-700">
                3. Food / Meals ({currency})
              </Label>
              <Input
                id="modal_act_food_meals"
                type="number"
                min="0"
                step="0.01"
                value={actualCostsForm.act_food_meals ?? 0}
                onChange={(e) => handleActualCategoryChange("act_food_meals", Number(e.target.value) || 0)}
                className="mt-1 text-xs"
              />
              {trip.registration_type === "planned" && (
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Approved Estimate: {formatCurrency(trip.est_food_meals || 0)}
                </span>
              )}
            </div>

            <div>
              <Label htmlFor="modal_act_local_transport" className="text-xs font-semibold text-slate-700">
                4. Local Transport ({currency})
              </Label>
              <Input
                id="modal_act_local_transport"
                type="number"
                min="0"
                step="0.01"
                value={actualCostsForm.act_local_transport ?? 0}
                onChange={(e) => handleActualCategoryChange("act_local_transport", Number(e.target.value) || 0)}
                className="mt-1 text-xs"
              />
              {trip.registration_type === "planned" && (
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Approved Estimate: {formatCurrency(trip.est_local_transport || 0)}
                </span>
              )}
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="modal_act_other_expenses" className="text-xs font-semibold text-slate-700">
                5. Other Expenses ({currency})
              </Label>
              <Input
                id="modal_act_other_expenses"
                type="number"
                min="0"
                step="0.01"
                value={actualCostsForm.act_other_expenses ?? 0}
                onChange={(e) => handleActualCategoryChange("act_other_expenses", Number(e.target.value) || 0)}
                className="mt-1 text-xs"
              />
              {trip.registration_type === "planned" && (
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Approved Estimate: {formatCurrency(trip.est_other_expenses || 0)}
                </span>
              )}
            </div>
          </div>

          {/* Real-time Summary Card */}
          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                Calculated Total Actual Cost
              </span>
              <p className="text-base font-bold text-slate-900 mt-0.5">
                {formatCurrency(liveModalActualTotal)}
              </p>
            </div>
            {trip.registration_type === "planned" && (
              <>
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Approved Total Estimate
                  </span>
                  <p className="text-sm font-semibold text-slate-700 mt-0.5">
                    {formatCurrency(totalEstimatedCosts)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Net Difference
                  </span>
                  <p
                    className={`text-sm font-bold mt-0.5 ${
                      liveModalActualTotal - totalEstimatedCosts > 0
                        ? "text-rose-600"
                        : liveModalActualTotal - totalEstimatedCosts < 0
                        ? "text-emerald-600"
                        : "text-slate-700"
                    }`}
                  >
                    {liveModalActualTotal - totalEstimatedCosts > 0 ? "+" : ""}
                    {formatCurrency(liveModalActualTotal - totalEstimatedCosts)}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Payer Configuration */}
          <div className="pt-2 border-t border-slate-200 space-y-3">
            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Expense Funding / Payer Model
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handlePayerTypeChange("company")}
                  className={`p-2.5 rounded-lg border text-xs font-medium text-center transition-all ${
                    actualCostsForm.payer_type === "company"
                      ? "border-primary-600 bg-primary-50 text-primary-900 font-semibold"
                      : "border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  Company Paid
                </button>
                <button
                  type="button"
                  onClick={() => handlePayerTypeChange("employee")}
                  className={`p-2.5 rounded-lg border text-xs font-medium text-center transition-all ${
                    actualCostsForm.payer_type === "employee"
                      ? "border-amber-600 bg-amber-50 text-amber-900 font-semibold"
                      : "border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  Employee Paid
                </button>
                <button
                  type="button"
                  onClick={() => handlePayerTypeChange("split")}
                  className={`p-2.5 rounded-lg border text-xs font-medium text-center transition-all ${
                    actualCostsForm.payer_type === "split"
                      ? "border-purple-600 bg-purple-50 text-purple-900 font-semibold"
                      : "border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  Split Payment
                </button>
              </div>
            </div>

            {actualCostsForm.payer_type === "split" && (
              <div className="grid grid-cols-2 gap-3 p-3 bg-purple-50/50 rounded-lg border border-purple-100">
                <div>
                  <Label htmlFor="split_company_paid" className="text-xs font-semibold text-purple-900">
                    Company-Paid Amount ({currency})
                  </Label>
                  <Input
                    id="split_company_paid"
                    type="number"
                    min="0"
                    step="0.01"
                    value={actualCostsForm.company_paid_amount ?? 0}
                    onChange={(e) =>
                      setActualCostsForm((prev) => ({
                        ...prev,
                        company_paid_amount: Number(e.target.value) || 0,
                      }))
                    }
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label htmlFor="split_employee_paid" className="text-xs font-semibold text-purple-900">
                    Employee-Paid Amount ({currency})
                  </Label>
                  <Input
                    id="split_employee_paid"
                    type="number"
                    min="0"
                    step="0.01"
                    value={actualCostsForm.employee_paid_amount ?? 0}
                    onChange={(e) =>
                      setActualCostsForm((prev) => ({
                        ...prev,
                        employee_paid_amount: Number(e.target.value) || 0,
                      }))
                    }
                    className="mt-1 text-xs"
                  />
                </div>
                {Number(actualCostsForm.company_paid_amount || 0) +
                  Number(actualCostsForm.employee_paid_amount || 0) !==
                  liveModalActualTotal && (
                  <p className="col-span-2 text-[11px] text-amber-700 font-medium">
                    Warning: Company ({formatCurrency(actualCostsForm.company_paid_amount)}) + Employee ({formatCurrency(actualCostsForm.employee_paid_amount)}) = {formatCurrency(Number(actualCostsForm.company_paid_amount || 0) + Number(actualCostsForm.employee_paid_amount || 0))}, which differs from total actual costs ({formatCurrency(liveModalActualTotal)}).
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowActualCostsModal(false)}
              disabled={actualCostsLoading}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleActualCostsSubmit}
              disabled={actualCostsLoading}
              className="bg-primary-600 hover:bg-primary-700 text-white"
            >
              {actualCostsLoading ? "Saving..." : "Save Actual Costs"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Record Payment Entry Modal */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="Record Payment Entry"
        description="Capture payment transaction details for company or employee expense coverage."
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="payment_payer_type" className="text-xs font-semibold text-slate-700">
                Payer Entity
              </Label>
              <select
                id="payment_payer_type"
                value={paymentForm.payer_type}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    payer_type: e.target.value as "company" | "employee",
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
              >
                <option value="company">Company</option>
                <option value="employee">Employee</option>
              </select>
            </div>

            <div>
              <Label htmlFor="payment_payer_name" className="text-xs font-semibold text-slate-700">
                Payer Name / Account
              </Label>
              <Input
                id="payment_payer_name"
                placeholder={paymentForm.payer_type === "company" ? "Corporate Account" : trip.requester_name || "Employee"}
                value={paymentForm.payer_name || ""}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    payer_name: e.target.value,
                  }))
                }
                className="mt-1 text-xs"
              />
            </div>

            <div>
              <Label htmlFor="payment_amount" className="text-xs font-semibold text-slate-700">
                Amount ({currency})
              </Label>
              <Input
                id="payment_amount"
                type="number"
                min="0.01"
                step="0.01"
                value={paymentForm.amount || ""}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    amount: Number(e.target.value) || 0,
                  }))
                }
                className="mt-1 text-xs"
              />
            </div>

            <div>
              <Label htmlFor="payment_method" className="text-xs font-semibold text-slate-700">
                Payment Method
              </Label>
              <select
                id="payment_method"
                value={paymentForm.payment_method}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    payment_method: e.target.value,
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
              >
                <option value="corporate_card">Corporate Card</option>
                <option value="personal_card">Personal Card</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
                <option value="upi">UPI / Digital Wallet</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <Label htmlFor="payment_date" className="text-xs font-semibold text-slate-700">
                Payment Date
              </Label>
              <Input
                id="payment_date"
                type="date"
                value={paymentForm.payment_date || ""}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    payment_date: e.target.value,
                  }))
                }
                className="mt-1 text-xs"
              />
            </div>

            <div>
              <Label htmlFor="payment_ref" className="text-xs font-semibold text-slate-700">
                Transaction Reference #
              </Label>
              <Input
                id="payment_ref"
                placeholder="UTR / Ref / Invoice #"
                value={paymentForm.transaction_reference || ""}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    transaction_reference: e.target.value,
                  }))
                }
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="payment_notes" className="text-xs font-semibold text-slate-700">
              Payment Memo / Notes
            </Label>
            <textarea
              id="payment_notes"
              rows={2}
              placeholder="e.g. Paid flight tickets directly, or employee paid fuel cash..."
              value={paymentForm.notes || ""}
              onChange={(e) =>
                setPaymentForm((prev) => ({
                  ...prev,
                  notes: e.target.value,
                }))
              }
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPaymentModal(false)}
              disabled={paymentLoading}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAddPaymentSubmit}
              disabled={paymentLoading || paymentForm.amount <= 0}
              className="bg-primary-600 hover:bg-primary-700 text-white"
            >
              {paymentLoading ? "Saving..." : "Record Payment"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
