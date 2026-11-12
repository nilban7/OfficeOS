"use client";

import * as React from "react";
import Link from "next/link";
import {
  Tablet,
  Plus,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Copy,
  Clock,
  Battery,
  BatteryCharging,
  Wifi,
  Trash2,
  Camera,
  Hash,
  QrCode,
  Fingerprint,
  LogIn,
  LogOut,
  Sliders,
  Check,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { AdminHeader } from "@/components/admin/admin-header";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type {
  KioskDevice,
  KioskActivationCode,
  KioskPunchAuditItem,
} from "@/types/kiosk";

export default function AdminKiosksManagementPage() {
  const { currentOrganization, membership, permissions, isLoading: isOrgLoading } =
    useOrganization();

  const isSysAdmin =
    membership?.role === "system_admin" ||
    membership?.role === "owner" ||
    membership?.role === "admin" ||
    permissions.includes("saas.view") ||
    permissions.includes("organizations.settings_manage");

  // Active Tab
  const [activeTab, setActiveTab] = React.useState<"kiosks" | "codes" | "punches">("kiosks");

  // Data States
  const [kiosks, setKiosks] = React.useState<KioskDevice[]>([]);
  const [codes, setCodes] = React.useState<KioskActivationCode[]>([]);
  const [punches, setPunches] = React.useState<KioskPunchAuditItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Generate Code Modal State
  const [isGenerateModalOpen, setIsGenerateModalOpen] = React.useState(false);
  const [expiresInHours, setExpiresInHours] = React.useState(24);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [generatedCode, setGeneratedCode] = React.useState<KioskActivationCode | null>(null);
  const [copiedCode, setCopiedCode] = React.useState(false);
  const [generateError, setGenerateError] = React.useState<string | null>(null);

  // Edit Kiosk Modal State
  const [editingKiosk, setEditingKiosk] = React.useState<KioskDevice | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editIpRestrictions, setEditIpRestrictions] = React.useState("");
  const [editAllowedModes, setEditAllowedModes] = React.useState<string[]>([]);
  const [isSavingEdit, setIsSavingEdit] = React.useState(false);

  // Snapshot Preview Modal State
  const [previewSnapshotUrl, setPreviewSnapshotUrl] = React.useState<string | null>(null);

  // Load All Data
  const isInitialLoad = React.useRef(true);
  const fetchData = React.useCallback(async () => {
    if (isInitialLoad.current) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const [kiosksRes, codesRes, punchesRes] = await Promise.allSettled([
        apiClient.get<KioskDevice[]>(API_ENDPOINTS.admin.kiosks),
        apiClient.get<KioskActivationCode[]>(API_ENDPOINTS.admin.kioskActivationCodes),
        apiClient.get<KioskPunchAuditItem[]>(API_ENDPOINTS.admin.kioskPunches),
      ]);

      if (kiosksRes.status === "fulfilled") {
        const raw = (kiosksRes.value as unknown as { data: KioskDevice[] })?.data || kiosksRes.value;
        const normalized = Array.isArray(raw)
          ? raw.map((k) => ({
              ...k,
              name: k.name || (k as unknown as { device_name?: string }).device_name || "OfficeOS Kiosk",
              ip_address: k.ip_address || (k as unknown as { last_known_ip?: string }).last_known_ip,
              allowed_modes: k.allowed_modes || ["pin", "face", "qr", "fingerprint"],
            }))
          : [];
        setKiosks(normalized);
      }
      if (codesRes.status === "fulfilled") {
        const raw =
          (codesRes.value as unknown as { data: KioskActivationCode[] })?.data || codesRes.value;
        const normalized = Array.isArray(raw)
          ? raw.map((c) => ({
              ...c,
              code:
                c.code ||
                (c as unknown as { code_preview?: string }).code_preview ||
                (c as unknown as { secret_code?: string }).secret_code ||
                "DEMO-2026",
            }))
          : [];
        setCodes(normalized);
      }
      if (punchesRes.status === "fulfilled") {
        const raw =
          (punchesRes.value as unknown as { data: KioskPunchAuditItem[] })?.data || punchesRes.value;
        const normalized = Array.isArray(raw)
          ? raw.map((p) => ({
              ...p,
              punch_type: p.punch_type === "in" || p.punch_type === "check_in" ? "in" : "out",
              timestamp:
                p.timestamp ||
                (p as unknown as { created_at?: string }).created_at ||
                new Date().toISOString(),
            }))
          : [];
        setPunches(normalized);
      }
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || "Failed to load kiosk management data");
    } finally {
      setIsLoading(false);
      isInitialLoad.current = false;
    }
  }, []);

  React.useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Generate Secret Pairing Code (Persisted strictly in backend database)
  const handleGenerateCode = async () => {
    setIsGenerating(true);
    setCopiedCode(false);
    setGenerateError(null);

    try {
      const orgId = currentOrganization?.id || membership?.organizationId;
      const res = await apiClient.post<KioskActivationCode>(
        API_ENDPOINTS.admin.generateKioskCode,
        {
          valid_hours: expiresInHours,
          expires_in_hours: expiresInHours,
        },
        orgId ? { organizationId: orgId } : undefined
      );
      const data = (res as unknown as { data: KioskActivationCode })?.data || res;
      if (data) {
        const confirmedCode =
          data.secret_code ||
          data.code ||
          (data as unknown as { secret_code?: string }).secret_code ||
          "";
        setGeneratedCode({
          ...data,
          code: confirmedCode,
        });
      }
      fetchData();
    } catch (err: unknown) {
      const msg =
        (err as { message?: string })?.message ||
        "Failed to generate activation code. Please check connection and try again.";
      setGenerateError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  // Copy Code to Clipboard
  const handleCopyCode = (codeText: string) => {
    navigator.clipboard.writeText(codeText);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Open Edit Kiosk Modal
  const handleOpenEdit = (kiosk: KioskDevice) => {
    setEditingKiosk(kiosk);
    setEditName(kiosk.name);
    setEditIpRestrictions((kiosk.ip_restrictions || []).join(", "));
    setEditAllowedModes(kiosk.allowed_modes || ["pin", "face", "qr", "fingerprint"]);
  };

  // Save Kiosk Edit
  const handleSaveEdit = async () => {
    if (!editingKiosk) return;
    setIsSavingEdit(true);

    try {
      const ipList = editIpRestrictions
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await apiClient.put(API_ENDPOINTS.admin.kioskDetail(editingKiosk.id), {
        name: editName.trim() || editingKiosk.name,
        ip_restrictions: ipList,
        allowed_modes: editAllowedModes,
      });

      setEditingKiosk(null);
      fetchData();
    } catch (err: unknown) {
      alert((err as { message?: string })?.message || "Failed to update kiosk configuration");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Delete / Unpair Kiosk
  const handleDeleteKiosk = async (kiosk: KioskDevice) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to unpair and remove kiosk "${kiosk.name}"?\n\nThe physical tablet will be disconnected immediately.`
    );
    if (!confirmDelete) return;

    try {
      await apiClient.delete(API_ENDPOINTS.admin.kioskDetail(kiosk.id));
      fetchData();
    } catch (err: unknown) {
      alert((err as { message?: string })?.message || "Failed to delete kiosk");
    }
  };

  // Online status calculation (heartbeat in last 5 minutes)
  const isKioskOnline = (kiosk: KioskDevice): boolean => {
    if (!kiosk.is_active || !kiosk.last_heartbeat_at) return false;
    const diffMs = Date.now() - new Date(kiosk.last_heartbeat_at).getTime();
    return diffMs < 5 * 60 * 1000;
  };

  const totalKiosks = kiosks.length;
  const onlineKiosks = kiosks.filter(isKioskOnline).length;
  const activeCodes = codes.filter((c) => !c.is_used && new Date(c.expires_at) > new Date()).length;
  const todayPunches = punches.length;

  if (isOrgLoading) {
    return <LoadingState message="Loading administration dashboard..." />;
  }

  if (!isSysAdmin) {
    return (
      <ErrorState
        title="Unauthorized Access"
        message="You do not have administrative permissions to configure attendance kiosk hardware."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <AdminHeader
        title="Attendance Kiosks Management"
        description="Pair physical kiosk tablets, generate single-use secret activation codes, and monitor multi-modal face & fingerprint attendance punches."
        badgeText="Hardware Fleet"
      >
        <div className="flex items-center gap-2.5">
          <Link href="/kiosk" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              <span>Open Kiosk PWA</span>
            </Button>
          </Link>
          <Button
            onClick={() => {
              setGeneratedCode(null);
              setGenerateError(null);
              setIsGenerateModalOpen(true);
            }}
            size="sm"
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="h-4 w-4" />
            <span>Generate Secret Code</span>
          </Button>
        </div>
      </AdminHeader>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Registered Tablets
            </CardTitle>
            <Tablet className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {totalKiosks}
            </div>
            <p className="text-xs text-slate-500 mt-1">Authorized terminals</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Online Terminals
            </CardTitle>
            <Wifi className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <span>{onlineKiosks}</span>
              {onlineKiosks > 0 && (
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Active heartbeats &lt; 5m
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Kiosk Punches
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {todayPunches}
            </div>
            <p className="text-xs text-slate-500 mt-1">Audited physical logs</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Pairing Codes
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {activeCodes}
            </div>
            <p className="text-xs text-slate-500 mt-1">Active secret codes</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab("kiosks")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === "kiosks"
                ? "border-emerald-600 text-emerald-600 dark:text-emerald-400 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Registered Kiosks ({totalKiosks})
          </button>
          <button
            onClick={() => setActiveTab("codes")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === "codes"
                ? "border-emerald-600 text-emerald-600 dark:text-emerald-400 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Secret Activation Codes ({codes.length})
          </button>
          <button
            onClick={() => setActiveTab("punches")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === "punches"
                ? "border-emerald-600 text-emerald-600 dark:text-emerald-400 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Live Punch Audit Feed ({punches.length})
          </button>
        </div>

        <Button variant="ghost" size="sm" onClick={fetchData} className="gap-1.5 text-xs text-slate-500">
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* TAB CONTENT */}
      {isLoading ? (
        <LoadingState message="Fetching kiosk devices..." />
      ) : error ? (
        <ErrorState title="Error Loading Data" message={error} onRetry={fetchData} />
      ) : (
        <>
          {/* TAB 1: REGISTERED KIOSKS */}
          {activeTab === "kiosks" && (
            <div>
              {kiosks.length === 0 ? (
                <EmptyState
                  icon={Tablet}
                  title="No Registered Kiosks Yet"
                  description="No physical tablets or kiosk terminals have been paired with your organization. Generate a Secret Activation Code to connect your first tablet."
                  actionLabel="Generate Secret Activation Code"
                  onAction={() => {
                    setGeneratedCode(null);
                    setGenerateError(null);
                    setIsGenerateModalOpen(true);
                  }}
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider font-semibold text-[11px] border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-3">Device Name &amp; ID</th>
                        <th className="px-4 py-3">IP Address</th>
                        <th className="px-4 py-3">Battery</th>
                        <th className="px-4 py-3">Verification Modes</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {kiosks.map((kiosk) => {
                        const online = isKioskOnline(kiosk);
                        return (
                          <tr key={kiosk.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                  <Tablet className="h-4 w-4" />
                                </div>
                                <div>
                                  <div className="font-semibold text-slate-900 dark:text-white">
                                    {kiosk.name}
                                  </div>
                                  <div className="text-[11px] text-slate-400 font-mono">
                                    {kiosk.device_identifier}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                              {kiosk.ip_address || "Auto-detect"}
                              {kiosk.ip_restrictions && kiosk.ip_restrictions.length > 0 && (
                                <Badge variant="outline" className="ml-2 text-[10px]">
                                  {kiosk.ip_restrictions.length} Whitelisted
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                {kiosk.is_charging ? (
                                  <BatteryCharging className="h-4 w-4 text-emerald-500" />
                                ) : (
                                  <Battery className="h-4 w-4 text-slate-400" />
                                )}
                                <span>{kiosk.battery_level != null ? `${kiosk.battery_level}%` : "—"}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {(kiosk.allowed_modes || ["pin", "face", "qr", "fingerprint"]).map(
                                  (mode) => (
                                    <span
                                      key={mode}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                    >
                                      {mode === "face" && <Camera className="h-2.5 w-2.5 text-emerald-500" />}
                                      {mode === "pin" && <Hash className="h-2.5 w-2.5 text-blue-500" />}
                                      {mode === "qr" && <QrCode className="h-2.5 w-2.5 text-purple-500" />}
                                      {mode === "fingerprint" && <Fingerprint className="h-2.5 w-2.5 text-amber-500" />}
                                      <span className="capitalize">{mode}</span>
                                    </span>
                                  )
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {online ? (
                                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200 gap-1.5">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Online
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-slate-500">
                                  Offline
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenEdit(kiosk)}
                                  className="h-8 w-8 p-0"
                                  title="Configure Kiosk"
                                >
                                  <Sliders className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteKiosk(kiosk)}
                                  className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                  title="Unpair Tablet"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SECRET ACTIVATION CODES */}
          {activeTab === "codes" && (
            <div>
              {codes.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title="No Secret Codes Generated"
                  description="Generate a secret activation code to pair a new tablet terminal to this organization."
                  actionLabel="Generate Secret Activation Code"
                  onAction={() => {
                    setGeneratedCode(null);
                    setGenerateError(null);
                    setIsGenerateModalOpen(true);
                  }}
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider font-semibold text-[11px] border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-3">Secret Pairing Code</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Created</th>
                        <th className="px-4 py-3">Expires At</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {codes.map((item) => {
                        const isExpired = new Date(item.expires_at) < new Date();
                        return (
                          <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="px-4 py-3">
                              <span className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400 tracking-wider">
                                {item.code}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {item.is_used ? (
                                <Badge variant="secondary" className="text-slate-500">
                                  Redeemed
                                </Badge>
                              ) : isExpired ? (
                                <Badge variant="destructive">Expired</Badge>
                              ) : (
                                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                                  Active &amp; Ready
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-xs">
                              {new Date(item.created_at).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-xs">
                              {new Date(item.expires_at).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {!item.is_used && !isExpired && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleCopyCode(item.code)}
                                  className="gap-1.5 text-xs"
                                >
                                  <Copy className="h-3 w-3" />
                                  <span>Copy</span>
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LIVE PUNCH AUDIT FEED */}
          {activeTab === "punches" && (
            <div>
              {punches.length === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  title="No Kiosk Punches Recorded"
                  description="When employees record check-in or check-out at physical kiosk tablets, real-time audit records and photo snapshots will appear here."
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider font-semibold text-[11px] border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-3">Photo Snapshot</th>
                        <th className="px-4 py-3">Employee</th>
                        <th className="px-4 py-3">Action</th>
                        <th className="px-4 py-3">Method</th>
                        <th className="px-4 py-3">Kiosk Tablet</th>
                        <th className="px-4 py-3">Client IP</th>
                        <th className="px-4 py-3 text-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {punches.map((punch) => (
                        <tr key={punch.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-3">
                            {punch.face_snapshot_url ? (
                              <button
                                onClick={() => setPreviewSnapshotUrl(punch.face_snapshot_url || null)}
                                className="group relative h-10 w-10 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 focus:outline-none"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={punch.face_snapshot_url}
                                  alt="Face snapshot"
                                  className="h-full w-full object-cover group-hover:scale-110 transition-transform"
                                />
                              </button>
                            ) : (
                              <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400">
                                <Hash className="h-4 w-4" />
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {punch.employee_name}
                            </div>
                            <div className="font-mono text-xs text-slate-400">
                              {punch.employee_code}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {punch.punch_type === "in" ? (
                              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 gap-1">
                                <LogIn className="h-3 w-3" />
                                <span>Check In</span>
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 gap-1">
                                <LogOut className="h-3 w-3" />
                                <span>Check Out</span>
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="capitalize font-medium text-slate-600 dark:text-slate-300">
                              {punch.verification_method}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {punch.kiosk_device_name || "Lobby Terminal"}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">
                            {punch.client_ip || "127.0.0.1"}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-slate-500 font-mono">
                            {new Date(punch.timestamp).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* MODAL 1: GENERATE ACTIVATION CODE */}
      <Modal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        title="Generate Secret Activation Code"
        description="Create a single-use pairing code for the Organization Owner to unlock and bind a physical kiosk tablet."
      >
        <div className="space-y-4 pt-2">
          {generatedCode ? (
            <div className="space-y-4 text-center">
              <div className="p-6 bg-slate-950 rounded-2xl border-2 border-emerald-500/40">
                <div className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-2">
                  Secret Pairing Code
                </div>
                <div className="text-3xl font-mono font-black tracking-widest text-emerald-400 mb-3">
                  {generatedCode.code}
                </div>
                <Button
                  onClick={() => handleCopyCode(generatedCode.code)}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  {copiedCode ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  <span>{copiedCode ? "Copied!" : "Copy Code"}</span>
                </Button>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl text-left text-xs text-slate-600 dark:text-slate-300 space-y-1.5 border border-slate-200 dark:border-slate-700">
                <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  <span>How to pair the tablet:</span>
                </div>
                <ol className="list-decimal pl-4 space-y-1 text-slate-500 dark:text-slate-400">
                  <li>Open the Kiosk web app on the physical tablet at <code className="text-emerald-500">/kiosk</code></li>
                  <li>Type this secret code on the terminal setup screen.</li>
                  <li>The tablet will securely bind to this organization and store cryptographic device tokens.</li>
                </ol>
              </div>

              <Button
                onClick={() => setIsGenerateModalOpen(false)}
                className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900"
              >
                Done
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Code Expiration
                </label>
                <select
                  value={expiresInHours}
                  onChange={(e) => setExpiresInHours(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm"
                >
                  <option value={6}>6 Hours</option>
                  <option value={12}>12 Hours</option>
                  <option value={24}>24 Hours (Standard)</option>
                  <option value={48}>48 Hours</option>
                  <option value={72}>72 Hours</option>
                </select>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl text-xs text-amber-700 dark:text-amber-300">
                Activation codes are single-use and can only be redeemed once on one tablet device.
              </div>

              {generateError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 rounded-xl text-xs text-rose-700 dark:text-rose-400">
                  {generateError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setIsGenerateModalOpen(false)}
                  disabled={isGenerating}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerateCode}
                  disabled={isGenerating}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Generating Secure Code...</span>
                    </>
                  ) : (
                    <span>Generate Code</span>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* MODAL 2: EDIT KIOSK SETTINGS */}
      <Modal
        isOpen={!!editingKiosk}
        onClose={() => setEditingKiosk(null)}
        title="Configure Kiosk Terminal"
        description="Update device settings, authorized verification modes, and IP geofencing restrictions."
      >
        {editingKiosk && (
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Kiosk Terminal Name
              </label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g. Ground Floor Reception"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                IP Geofence Restrictions
              </label>
              <Input
                value={editIpRestrictions}
                onChange={(e) => setEditIpRestrictions(e.target.value)}
                placeholder="Comma separated IP subnets e.g. 192.168.1.0/24, 203.0.113.10"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Leave empty to allow punch from any connected network.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Enabled Verification Modes
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "face", label: "Face Camera Snapshot", icon: Camera },
                  { id: "pin", label: "Touch PIN & Employee ID", icon: Hash },
                  { id: "qr", label: "QR Badge Scanning", icon: QrCode },
                  { id: "fingerprint", label: "Biometric Sensor", icon: Fingerprint },
                ].map((mode) => {
                  const isChecked = editAllowedModes.includes(mode.id);
                  const Icon = mode.icon;
                  return (
                    <label
                      key={mode.id}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                        isChecked
                          ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/50 text-emerald-900 dark:text-emerald-200"
                          : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditAllowedModes([...editAllowedModes, mode.id]);
                          } else {
                            setEditAllowedModes(editAllowedModes.filter((m) => m !== mode.id));
                          }
                        }}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <Icon className="h-4 w-4" />
                      <span className="text-xs font-medium">{mode.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <Button
                variant="outline"
                onClick={() => setEditingKiosk(null)}
                disabled={isSavingEdit}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={isSavingEdit || editAllowedModes.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isSavingEdit ? "Saving..." : "Save Configuration"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL 3: SNAPSHOT PREVIEW */}
      <Modal
        isOpen={!!previewSnapshotUrl}
        onClose={() => setPreviewSnapshotUrl(null)}
        title="Photo Snapshot Verification"
      >
        {previewSnapshotUrl && (
          <div className="flex flex-col items-center justify-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewSnapshotUrl}
              alt="Audit Snapshot Preview"
              className="max-h-96 rounded-2xl border-2 border-slate-800 shadow-xl"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
