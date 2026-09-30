"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  TrendingDown,
  TrendingUp,
  Briefcase,
  Building,
  User,
  ShoppingBag,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type { FinancialTransaction } from "@/types/finance";

export default function TransactionDetailPage() {
  const params = useParams<{ id: string }>();
  const txId = params?.id || "";

  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();
  const canView = permissions.includes("finance.view");

  const [transaction, setTransaction] = React.useState<FinancialTransaction | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchTransaction = React.useCallback(async () => {
    if (!currentOrganization?.id || !txId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<any>(API_ENDPOINTS.finance.transactionDetail(txId));
      const data = (res as any)?.data || res;
      setTransaction(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load transaction details.");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, txId]);

  React.useEffect(() => {
    if (canView) fetchTransaction();
  }, [canView, fetchTransaction]);

  if (isOrgLoading) return <LoadingState message="Loading organization..." />;
  if (!canView) {
    return (
      <ErrorState
        title="Access Denied"
        message="You don't have permission to view financial transactions."
      />
    );
  }

  if (isLoading) return <LoadingState message="Loading transaction details..." />;
  if (error || !transaction) {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <ErrorState
          title="Error"
          message={error || "Transaction not found"}
          onRetry={fetchTransaction}
        />
        <Link href="/finance">
          <Button variant="outline" size="sm">
            Back to Finance
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Back Button & Header */}
      <div className="flex items-center gap-3">
        <Link href="/finance">
          <Button variant="ghost" size="sm" className="gap-1 text-slate-600">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">{transaction.transaction_number}</h1>
            <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 capitalize">
              {transaction.status}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Date: {transaction.transaction_date} • Type: {transaction.transaction_type.replace(/_/g, " ")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Transaction Details Card */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Card>
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="text-base font-medium text-slate-900">
                Transaction Details
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-slate-500">Transaction Type</Label>
                <p className="mt-1 font-medium text-slate-900 capitalize">
                  {transaction.transaction_type.replace(/_/g, " ")}
                </p>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Transaction Date</Label>
                <p className="mt-1 font-medium text-slate-900">{transaction.transaction_date}</p>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs text-slate-500">Description</Label>
                <p className="mt-1 text-sm text-slate-800">{transaction.description}</p>
              </div>
              {transaction.reference_type && (
                <div>
                  <Label className="text-xs text-slate-500">Reference Type</Label>
                  <p className="mt-1 font-medium text-slate-900 capitalize">{transaction.reference_type}</p>
                </div>
              )}
              {transaction.reference_id && (
                <div>
                  <Label className="text-xs text-slate-500">Reference ID</Label>
                  <p className="mt-1 font-mono text-xs text-slate-700">{transaction.reference_id}</p>
                </div>
              )}
              {transaction.notes && (
                <div className="sm:col-span-2">
                  <Label className="text-xs text-slate-500">Notes</Label>
                  <p className="mt-1 text-sm text-slate-600 bg-slate-50 p-2.5 rounded-md border border-slate-200">
                    {transaction.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Amounts and Associations */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="text-base font-medium text-slate-900">
                Ledger Impact
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                    <TrendingDown className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Debit</p>
                    <p className="font-semibold text-rose-600">
                      ${Number(transaction.debit).toFixed(2)} {transaction.currency}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Credit</p>
                    <p className="font-semibold text-emerald-600">
                      ${Number(transaction.credit).toFixed(2)} {transaction.currency}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Related Entities */}
          {(transaction.project || transaction.client || transaction.vendor || transaction.employee) && (
            <Card>
              <CardHeader className="border-b border-slate-100 pb-3">
                <CardTitle className="text-base font-medium text-slate-900">
                  Associated Parties
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 pt-4 text-sm">
                {transaction.project && (
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-500">Project:</span>
                    <span className="font-medium text-slate-900">{transaction.project.name}</span>
                  </div>
                )}
                {transaction.client && (
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-500">Client:</span>
                    <span className="font-medium text-slate-900">{transaction.client.name}</span>
                  </div>
                )}
                {transaction.vendor && (
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-500">Vendor:</span>
                    <span className="font-medium text-slate-900">{transaction.vendor.name}</span>
                  </div>
                )}
                {transaction.employee && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-500">Employee:</span>
                    <span className="font-medium text-slate-900">
                      {transaction.employee.first_name} {transaction.employee.last_name}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
