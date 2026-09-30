"use client";

import * as React from "react";
import Link from "next/link";
import {
  DollarSign,
  Plus,
  Search,
  Eye,
  CheckCircle2,
  Clock,
  Receipt,
  ArrowUpRight,
  TrendingDown,
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
  Expense,
  ExpenseCategory,
  ExpenseCreate,
  ExpenseStatus,
  FinancialOverview,
  FinancialTransaction,
} from "@/types/finance";

const STATUS_CONFIG: Record<ExpenseStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-300" },
  submitted: { label: "Submitted", className: "bg-blue-50 text-blue-700 border-blue-200" },
  approved: { label: "Approved", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "Rejected", className: "bg-rose-50 text-rose-700 border-rose-200" },
  cancelled: { label: "Cancelled", className: "bg-neutral-100 text-neutral-600 border-neutral-300" },
  paid: { label: "Paid", className: "bg-purple-50 text-purple-700 border-purple-200" },
};

export default function FinancePage() {
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  const canCreate = permissions.includes("finance.create");
  const canView = permissions.includes("finance.view");

  const [activeTab, setActiveTab] = React.useState<"expenses" | "transactions">("expenses");

  // Expenses State
  const [expenses, setExpenses] = React.useState<Expense[]>([]);
  const [categories, setCategories] = React.useState<ExpenseCategory[]>([]);
  const [overview, setOverview] = React.useState<FinancialOverview | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [totalPages, setTotalPages] = React.useState(1);
  const [currentPage, setCurrentPage] = React.useState(1);

  // Transactions State
  const [transactions, setTransactions] = React.useState<FinancialTransaction[]>([]);
  const [txTotalPages, setTxTotalPages] = React.useState(1);
  const [txCurrentPage, setTxCurrentPage] = React.useState(1);

  // Filters
  const [searchTerm, setSearchTerm] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [categoryFilter, setCategoryFilter] = React.useState("all");

  // Create Expense Modal
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [createLoading, setCreateLoading] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<ExpenseCreate>({
    expense_number: "",
    employee_id: "",
    category_id: "",
    expense_date: new Date().toISOString().slice(0, 10),
    description: "",
    amount: "0.00",
    tax_amount: "0.00",
    currency: "USD",
    notes: "",
  });

  // Debounce search
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const fetchOverview = React.useCallback(async () => {
    if (!currentOrganization?.id) return;
    try {
      const res = await apiClient.get<any>(API_ENDPOINTS.finance.overview);
      const data = (res as any)?.data || res;
      setOverview(data);
    } catch {
      // Non-blocking for page load
    }
  }, [currentOrganization?.id]);

  const fetchCategories = React.useCallback(async () => {
    if (!currentOrganization?.id) return;
    try {
      const res = await apiClient.get<any>(API_ENDPOINTS.finance.categories);
      const data = (res as any)?.data || res;
      setCategories(Array.isArray(data) ? data : data?.items || []);
    } catch {
      // Non-blocking
    }
  }, [currentOrganization?.id]);

  const fetchExpenses = React.useCallback(async () => {
    if (!currentOrganization?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page: String(currentPage), page_size: "20" };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter !== "all") params.status = statusFilter;
      if (categoryFilter !== "all") params.category_id = categoryFilter;

      const query = new URLSearchParams(params).toString();
      const res = await apiClient.get<any>(`${API_ENDPOINTS.finance.expenses}?${query}`);
      const data = (res as any)?.data || res;
      setExpenses(data?.items || []);
      setTotalPages(data?.meta?.total_pages || data?.total_pages || 1);
    } catch (err: any) {
      setError(err?.message || "Failed to load expenses.");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, currentPage, debouncedSearch, statusFilter, categoryFilter]);

  const fetchTransactions = React.useCallback(async () => {
    if (!currentOrganization?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page: String(txCurrentPage), page_size: "20" };
      if (debouncedSearch) params.search = debouncedSearch;

      const query = new URLSearchParams(params).toString();
      const res = await apiClient.get<any>(`${API_ENDPOINTS.finance.transactions}?${query}`);
      const data = (res as any)?.data || res;
      setTransactions(data?.items || []);
      setTxTotalPages(data?.meta?.total_pages || data?.total_pages || 1);
    } catch (err: any) {
      setError(err?.message || "Failed to load transactions.");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, txCurrentPage, debouncedSearch]);

  React.useEffect(() => {
    if (canView) {
      fetchOverview();
      fetchCategories();
      if (activeTab === "expenses") {
        fetchExpenses();
      } else {
        fetchTransactions();
      }
    }
  }, [canView, activeTab, fetchOverview, fetchCategories, fetchExpenses, fetchTransactions]);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id) return;
    setCreateLoading(true);
    setCreateError(null);
    try {
      await apiClient.post(API_ENDPOINTS.finance.createExpense, {
        ...form,
        amount: Number(form.amount),
        tax_amount: Number(form.tax_amount || 0),
      });
      setShowCreateModal(false);
      setForm({
        expense_number: "",
        employee_id: "",
        category_id: "",
        expense_date: new Date().toISOString().slice(0, 10),
        description: "",
        amount: "0.00",
        tax_amount: "0.00",
        currency: "USD",
        notes: "",
      });
      fetchExpenses();
      fetchOverview();
    } catch (err: any) {
      setCreateError(err?.message || "Failed to create expense.");
    } finally {
      setCreateLoading(false);
    }
  };

  if (isOrgLoading) return <LoadingState message="Loading organization..." />;
  if (!canView) {
    return (
      <ErrorState
        title="Access Denied"
        message="You don't have permission to view financial management."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Finance Management</h1>
            <p className="text-sm text-slate-500">
              Manage expenses, categories, approvals, and transaction audit trails
            </p>
          </div>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreateModal(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Expense
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Total Expenses</p>
              <p className="text-xl font-bold text-slate-900">
                ${Number(overview?.total_expenses || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Pending Approval</p>
              <p className="text-xl font-bold text-amber-600">
                {overview?.pending_approvals_count ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Approved</p>
              <p className="text-xl font-bold text-blue-600">
                {overview?.approved_expenses_count ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <ArrowUpRight className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Paid Expenses</p>
              <p className="text-xl font-bold text-purple-600">
                {overview?.paid_expenses_count ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => { setActiveTab("expenses"); setCurrentPage(1); }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "expenses"
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Receipt className="h-4 w-4" />
          Expenses
        </button>
        <button
          onClick={() => { setActiveTab("transactions"); setTxCurrentPage(1); }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "transactions"
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <TrendingDown className="h-4 w-4" />
          Financial Transactions
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder={
              activeTab === "expenses"
                ? "Search expense number, description..."
                : "Search transaction number, description..."
            }
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
              setTxCurrentPage(1);
            }}
            className="pl-9"
          />
        </div>
        {activeTab === "expenses" && (
          <>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Statuses</option>
              {(Object.keys(STATUS_CONFIG) as ExpenseStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Content Area */}
      {isLoading ? (
        <LoadingState message="Loading data..." />
      ) : error ? (
        <ErrorState title="Error" message={error} />
      ) : activeTab === "expenses" ? (
        expenses.length === 0 ? (
          <EmptyState
            title="No Expenses Found"
            description="No expenses match your criteria. Create a new expense request to get started."
            actionLabel={canCreate ? "New Expense" : undefined}
            onAction={canCreate ? () => setShowCreateModal(true) : undefined}
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Expense #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((exp) => {
                  const cfg = STATUS_CONFIG[exp.status] || STATUS_CONFIG.draft;
                  return (
                    <tr key={exp.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <Link
                          href={`/finance/expenses/${exp.id}`}
                          className="hover:text-emerald-600 hover:underline"
                        >
                          {exp.expense_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{exp.expense_date}</td>
                      <td className="px-4 py-3">
                        {exp.employee ? `${exp.employee.first_name} ${exp.employee.last_name}` : "—"}
                      </td>
                      <td className="px-4 py-3">{exp.category?.name || "—"}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        ${Number(exp.total_amount).toFixed(2)} {exp.currency}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/finance/expenses/${exp.id}`}>
                          <Button variant="ghost" size="sm" className="gap-1 text-slate-600 hover:text-emerald-600">
                            <Eye className="h-4 w-4" />
                            View
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-xs text-slate-500">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )
      ) : (
        /* Transactions Table */
        transactions.length === 0 ? (
          <EmptyState
            title="No Financial Transactions Found"
            description="No transactions recorded yet."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Transaction #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Debit</th>
                  <th className="px-4 py-3">Credit</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link
                        href={`/finance/transactions/${tx.id}`}
                        className="hover:text-emerald-600 hover:underline"
                      >
                        {tx.transaction_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{tx.transaction_date}</td>
                    <td className="px-4 py-3 capitalize">{tx.transaction_type.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 truncate max-w-xs">{tx.description}</td>
                    <td className="px-4 py-3 font-medium text-rose-600">
                      {Number(tx.debit) > 0 ? `$${Number(tx.debit).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-emerald-600">
                      {Number(tx.credit) > 0 ? `$${Number(tx.credit).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/finance/transactions/${tx.id}`}>
                        <Button variant="ghost" size="sm" className="gap-1 text-slate-600 hover:text-emerald-600">
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {txTotalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={txCurrentPage <= 1}
                  onClick={() => setTxCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-xs text-slate-500">
                  Page {txCurrentPage} of {txTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={txCurrentPage >= txTotalPages}
                  onClick={() => setTxCurrentPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )
      )}

      {/* Create Expense Modal */}
      {showCreateModal && (
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Create New Expense"
        >
          <form onSubmit={handleCreateExpense} className="flex flex-col gap-4">
            {createError && (
              <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
                {createError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="expense_number">Expense Number *</Label>
                <Input
                  id="expense_number"
                  placeholder="EXP-2025-001"
                  required
                  value={form.expense_number}
                  onChange={(e) => setForm({ ...form, expense_number: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="expense_date">Date *</Label>
                <Input
                  id="expense_date"
                  type="date"
                  required
                  value={form.expense_date}
                  onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="employee_id">Employee ID *</Label>
                <Input
                  id="employee_id"
                  placeholder="Employee UUID"
                  required
                  value={form.employee_id}
                  onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category_id">Category *</Label>
                <select
                  id="category_id"
                  required
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select Category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Brief summary of expenses"
                value={form.description || ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="amount">Subtotal Amount *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tax_amount">Tax Amount</Label>
                <Input
                  id="tax_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.tax_amount}
                  onChange={(e) => setForm({ ...form, tax_amount: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currency">Currency</Label>
                <Input
                  id="currency"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                rows={2}
                placeholder="Optional internal remarks"
                className="rounded-md border border-slate-200 p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={form.notes || ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateModal(false)}
                disabled={createLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createLoading}>
                {createLoading ? "Creating..." : "Create Expense"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
