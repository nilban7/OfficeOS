"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Users,
  Star,
  Plus,
  Trash2,
  X,
  Calendar,
  Building2,
  Mail,
  DollarSign,
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
  InternshipDetail,
  InternshipStatus,
  InternshipReviewCreate,
  InternshipSupervisorCreate,
} from "@/types/internship";

const STATUS_CONFIG: Record<InternshipStatus, { label: string; className: string }> = {
  planned: { label: "Planned", className: "bg-slate-100 text-slate-700 border-slate-300" },
  active: { label: "Active", className: "bg-blue-50 text-blue-700 border-blue-200" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  extended: { label: "Extended", className: "bg-amber-50 text-amber-700 border-amber-200" },
  terminated: { label: "Terminated", className: "bg-rose-50 text-rose-700 border-rose-200" },
  cancelled: { label: "Cancelled", className: "bg-neutral-100 text-neutral-700 border-neutral-300" },
};

type Tab = "overview" | "supervisors" | "reviews";

export default function InternshipDetailPage() {
  const params = useParams<{ id: string }>();
  const internshipId = params?.id || "";
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  const canManage = permissions.includes("internships.manage");
  const canReview = permissions.includes("internships.review");
  const canView = permissions.includes("internships.view");

  const [internship, setInternship] = React.useState<InternshipDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<Tab>("overview");

  // Add supervisor modal
  const [showAddSupervisorModal, setShowAddSupervisorModal] = React.useState(false);
  const [supForm, setSupForm] = React.useState<InternshipSupervisorCreate>({
    employee_id: "",
    role: "supervisor",
  });
  const [supLoading, setSupLoading] = React.useState(false);
  const [supError, setSupError] = React.useState<string | null>(null);

  // Add review modal
  const [showAddReviewModal, setShowAddReviewModal] = React.useState(false);
  const [reviewForm, setReviewForm] = React.useState<InternshipReviewCreate>({
    review_date: new Date().toISOString().slice(0, 10),
    rating: undefined,
    feedback: "",
    status: "draft",
  });
  const [reviewLoading, setReviewLoading] = React.useState(false);
  const [reviewError, setReviewError] = React.useState<string | null>(null);

  // Action loading
  const [actionLoading, setActionLoading] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const fetchInternship = React.useCallback(async () => {
    if (!currentOrganization?.id || !internshipId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<any>(API_ENDPOINTS.internships.detail(internshipId));
      const data = (res as any)?.data || res;
      setInternship(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load internship.");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, internshipId]);

  React.useEffect(() => {
    if (canView) fetchInternship();
  }, [fetchInternship, canView]);

  const handleLifecycleAction = async (action: "start" | "complete" | "terminate") => {
    if (!internship) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const endpoint =
        action === "start"
          ? API_ENDPOINTS.internships.start(internship.id)
          : action === "complete"
          ? API_ENDPOINTS.internships.complete(internship.id)
          : API_ENDPOINTS.internships.terminate(internship.id);
      await apiClient.post(endpoint, {});
      fetchInternship();
    } catch (err: any) {
      setActionError(err?.message || `Failed to ${action} internship.`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddSupervisor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!internship) return;
    setSupLoading(true);
    setSupError(null);
    try {
      await apiClient.post(API_ENDPOINTS.internships.supervisors(internship.id), supForm);
      setShowAddSupervisorModal(false);
      setSupForm({ employee_id: "", role: "supervisor" });
      fetchInternship();
    } catch (err: any) {
      setSupError(err?.message || "Failed to add supervisor.");
    } finally {
      setSupLoading(false);
    }
  };

  const handleRemoveSupervisor = async (supervisorId: string) => {
    if (!internship) return;
    try {
      await apiClient.delete(API_ENDPOINTS.internships.supervisor(internship.id, supervisorId));
      fetchInternship();
    } catch {
      // silently fail
    }
  };

  const handleAddReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!internship) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      await apiClient.post(API_ENDPOINTS.internships.reviews(internship.id), reviewForm);
      setShowAddReviewModal(false);
      setReviewForm({ review_date: new Date().toISOString().slice(0, 10), status: "draft" });
      fetchInternship();
    } catch (err: any) {
      setReviewError(err?.message || "Failed to create review.");
    } finally {
      setReviewLoading(false);
    }
  };

  if (isOrgLoading || isLoading) return <LoadingState message="Loading internship..." />;
  if (error) return <ErrorState title="Error" message={error} onRetry={fetchInternship} />;
  if (!internship) return <ErrorState title="Not Found" message="Internship not found." />;

  const statusCfg = STATUS_CONFIG[internship.status];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/internships" className="mt-1 text-slate-400 hover:text-slate-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-slate-900 truncate">{internship.title}</h1>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusCfg.className}`}
            >
              {statusCfg.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {internship.code} · {internship.intern_name}
          </p>
        </div>
        {/* Lifecycle Actions */}
        {canManage && (
          <div className="flex gap-2 shrink-0">
            {internship.status === "planned" && (
              <Button size="sm" onClick={() => handleLifecycleAction("start")} disabled={actionLoading}>
                Start
              </Button>
            )}
            {(internship.status === "active" || internship.status === "extended") && (
              <Button
                size="sm"
                onClick={() => handleLifecycleAction("complete")}
                disabled={actionLoading}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Complete
              </Button>
            )}
            {!["completed", "terminated", "cancelled"].includes(internship.status) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleLifecycleAction("terminate")}
                disabled={actionLoading}
                className="text-rose-600 border-rose-300 hover:bg-rose-50"
              >
                Terminate
              </Button>
            )}
          </div>
        )}
      </div>

      {actionError && (
        <div className="flex items-center gap-2 rounded-md bg-rose-50 p-3 text-sm text-rose-700">
          <X className="h-4 w-4 shrink-0" />
          {actionError}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-6">
          {(["overview", "supervisors", "reviews"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 pb-3 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab}
              {tab === "supervisors" && (
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                  {internship.supervisors?.length ?? 0}
                </span>
              )}
              {tab === "reviews" && (
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                  {internship.reviews?.length ?? 0}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Intern Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <Users className="h-4 w-4 text-slate-400" />
                <span className="font-medium">Name:</span>
                <span>{internship.intern_name}</span>
              </div>
              {internship.intern_email && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <span className="font-medium">Email:</span>
                  <a href={`mailto:${internship.intern_email}`} className="text-blue-600 hover:underline">
                    {internship.intern_email}
                  </a>
                </div>
              )}
              {internship.institution && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  <span className="font-medium">Institution:</span>
                  <span>{internship.institution}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-slate-600">
                <Calendar className="h-4 w-4 text-slate-400" />
                <span className="font-medium">Period:</span>
                <span>
                  {internship.start_date.slice(0, 10)} → {internship.end_date.slice(0, 10)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <DollarSign className="h-4 w-4 text-slate-400" />
                <span className="font-medium">Stipend:</span>
                <span>${Number(internship.stipend).toFixed(2)}/month</span>
              </div>
            </CardContent>
          </Card>
          {internship.description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{internship.description}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "supervisors" && (
        <div className="space-y-4">
          {canManage && (
            <div className="flex justify-end">
              <Button onClick={() => setShowAddSupervisorModal(true)} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Add Supervisor
              </Button>
            </div>
          )}
          {!internship.supervisors?.length ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
              <p className="text-sm text-slate-500">No supervisors assigned yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {internship.supervisors.map((sup) => (
                <Card key={sup.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium text-slate-900">
                        {sup.employee
                          ? `${sup.employee.first_name} ${sup.employee.last_name}`
                          : sup.employee_id}
                      </p>
                      <p className="text-xs text-slate-500 capitalize">{sup.role}</p>
                    </div>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveSupervisor(sup.id)}
                        className="text-rose-500 hover:text-rose-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "reviews" && (
        <div className="space-y-4">
          {canReview && (
            <div className="flex justify-end">
              <Button onClick={() => setShowAddReviewModal(true)} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Add Review
              </Button>
            </div>
          )}
          {!internship.reviews?.length ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
              <p className="text-sm text-slate-500">No reviews yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {internship.reviews.map((review) => (
                <Card key={review.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">
                        {review.review_date.slice(0, 10)}
                      </span>
                      <div className="flex items-center gap-3">
                        {review.rating != null && (
                          <div className="flex items-center gap-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`h-3.5 w-3.5 ${
                                  i < review.rating! ? "text-amber-400 fill-amber-400" : "text-slate-300"
                                }`}
                              />
                            ))}
                          </div>
                        )}
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs ${
                            review.status === "submitted"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : review.status === "acknowledged"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-slate-100 text-slate-700 border-slate-300"
                          }`}
                        >
                          {review.status}
                        </span>
                      </div>
                    </div>
                    {review.feedback && (
                      <p className="text-sm text-slate-600 whitespace-pre-wrap">{review.feedback}</p>
                    )}
                    {review.reviewer && (
                      <p className="text-xs text-slate-500">
                        By: {review.reviewer.first_name} {review.reviewer.last_name}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Supervisor Modal */}
      <Modal
        isOpen={showAddSupervisorModal}
        onClose={() => { setShowAddSupervisorModal(false); setSupError(null); }}
        title="Add Supervisor"
        size="sm"
      >
        <form onSubmit={handleAddSupervisor} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="employee_id">Employee ID *</Label>
            <Input
              id="employee_id"
              required
              value={supForm.employee_id}
              onChange={(e) => setSupForm({ ...supForm, employee_id: e.target.value })}
              placeholder="Enter employee UUID"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup_role">Role</Label>
            <Input
              id="sup_role"
              value={supForm.role || "supervisor"}
              onChange={(e) => setSupForm({ ...supForm, role: e.target.value })}
              placeholder="supervisor"
            />
          </div>
          {supError && (
            <div className="flex items-center gap-2 rounded-md bg-rose-50 p-3 text-sm text-rose-700">
              <X className="h-4 w-4 shrink-0" />
              {supError}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowAddSupervisorModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={supLoading}>
              {supLoading ? "Adding..." : "Add Supervisor"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Review Modal */}
      <Modal
        isOpen={showAddReviewModal}
        onClose={() => { setShowAddReviewModal(false); setReviewError(null); }}
        title="Add Review"
        size="md"
      >
        <form onSubmit={handleAddReview} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="review_date">Review Date *</Label>
            <Input
              id="review_date"
              type="date"
              required
              value={reviewForm.review_date}
              onChange={(e) => setReviewForm({ ...reviewForm, review_date: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rating">Rating (1–5)</Label>
            <Input
              id="rating"
              type="number"
              min={1}
              max={5}
              value={reviewForm.rating ?? ""}
              onChange={(e) => setReviewForm({ ...reviewForm, rating: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="feedback">Feedback</Label>
            <textarea
              id="feedback"
              rows={3}
              value={reviewForm.feedback || ""}
              onChange={(e) => setReviewForm({ ...reviewForm, feedback: e.target.value })}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter feedback..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="review_status">Status</Label>
            <select
              id="review_status"
              value={reviewForm.status}
              onChange={(e) => setReviewForm({ ...reviewForm, status: e.target.value as any })}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="acknowledged">Acknowledged</option>
            </select>
          </div>
          {reviewError && (
            <div className="flex items-center gap-2 rounded-md bg-rose-50 p-3 text-sm text-rose-700">
              <X className="h-4 w-4 shrink-0" />
              {reviewError}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowAddReviewModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={reviewLoading}>
              {reviewLoading ? "Saving..." : "Add Review"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
