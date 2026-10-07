"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bot,
  ArrowLeft,
  Save,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Loader2,
  Key,
  Eye,
  EyeOff,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { ROUTES } from "@/constants/routes";
import type { AIConfiguration, AIConfigurationUpdate } from "@/types/ai";

const ALL_CAPABILITIES = [
  { id: "workforce", label: "Workforce & Headcount Analytics" },
  { id: "attendance", label: "Attendance Rates & Shift Analysis" },
  { id: "leave", label: "Leave Requests & Quotas" },
  { id: "projects", label: "Projects & Portfolio Budgets" },
  { id: "procurement", label: "Procurement & Purchase Requests" },
  { id: "assets", label: "Asset Inventories & Hardware" },
  { id: "maintenance", label: "Equipment Maintenance Records" },
  { id: "training", label: "Training Programs & Courses" },
  { id: "internships", label: "Internships & Stipends" },
  { id: "operations", label: "Operational Tasks & Checklists" },
  { id: "documents", label: "Document Repositories" },
];

export default function AISettingsPage() {
  const { currentOrganization, permissions } = useOrganization();
  const canManage = permissions.includes("ai.manage") || permissions.includes("settings:manage");

  const [isEnabled, setIsEnabled] = React.useState(true);
  const [provider, setProvider] = React.useState("groq");
  const [modelName, setModelName] = React.useState("qwen/qwen3.8-27b");
  const [apiKey, setApiKey] = React.useState("");
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [temperature, setTemperature] = React.useState(0.7);
  const [maxTokens, setMaxTokens] = React.useState(1024);
  const [dailyLimit, setDailyLimit] = React.useState(1000);
  const [selectedCapabilities, setSelectedCapabilities] = React.useState<string[]>([]);

  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  React.useEffect(() => {
    if (!currentOrganization || !canManage) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    async function loadConfig() {
      setIsLoading(true);
      try {
        const res = await apiClient.get<AIConfiguration>(API_ENDPOINTS.ai.configuration);
        if (!isMounted) return;
        if (res) {
          const cfg = res;
          setIsEnabled(cfg.is_enabled);
          if (cfg.provider) {
            setProvider(cfg.provider);
          }
          if (cfg.model_name) {
            setModelName(cfg.model_name);
          }
          if (cfg.api_key) {
            setApiKey(cfg.api_key);
          }
          setTemperature(cfg.temperature != null ? Number(cfg.temperature) : 0.7);
          setMaxTokens(cfg.max_tokens_per_response != null ? cfg.max_tokens_per_response : 2048);
          setDailyLimit(cfg.daily_request_limit != null ? cfg.daily_request_limit : 1000);
          setSelectedCapabilities(cfg.allowed_capabilities || []);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : "Failed to load AI settings";
        setStatusMessage({ type: "error", text: msg });
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadConfig();

    return () => {
      isMounted = false;
    };
  }, [currentOrganization, canManage]);

  function toggleCapability(capId: string) {
    setSelectedCapabilities((prev) =>
      prev.includes(capId) ? prev.filter((c) => c !== capId) : [...prev, capId]
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage || isSaving) return;

    setIsSaving(true);
    setStatusMessage(null);

    const payload: AIConfigurationUpdate = {
      is_enabled: isEnabled,
      provider,
      model_name: modelName,
      api_key: apiKey.trim() || undefined,
      temperature,
      max_tokens_per_response: maxTokens,
      daily_request_limit: dailyLimit,
      allowed_capabilities: selectedCapabilities,
    };

    try {
      const res = await apiClient.patch<AIConfiguration>(API_ENDPOINTS.ai.configuration, payload);
      if (res) {
        setStatusMessage({ type: "success", text: "AI configuration saved successfully." });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update configuration";
      setStatusMessage({ type: "error", text: msg });
    } finally {
      setIsSaving(false);
    }
  }

  if (!canManage) {
    return (
      <div className="mx-auto max-w-4xl py-12 px-4 sm:px-6">
        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="pt-6 text-center space-y-3">
            <ShieldAlert className="h-10 w-10 text-rose-600 mx-auto" />
            <h2 className="text-lg font-bold text-rose-900">Access Restricted</h2>
            <p className="text-sm text-rose-700 max-w-md mx-auto">
              You do not have administrative permission (`ai.manage`) to configure organization AI parameters.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <Link href={ROUTES.AI}>
            <Button size="sm" variant="ghost" className="p-2 text-slate-500 hover:text-slate-700">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">AI Assistant Settings</h1>
            <p className="text-xs text-slate-500">Manage tenant-level model parameters, capabilities, and security boundaries</p>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`rounded-lg p-3 text-xs flex items-center gap-2 border ${
            statusMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-600" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-xs text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading configuration...
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* General Enablement Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold">Organization AI Status</CardTitle>
              <CardDescription>Control availability of AI Assistant across your organization</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-slate-900">Enable AI Assistant</div>
                  <div className="text-xs text-slate-500">Allow authorized staff members to interact with OfficeOS Assistant</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(e) => setIsEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:width-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Model Parameters Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold">Model Parameters</CardTitle>
              <CardDescription>Provider defaults and execution hyperparameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">AI Provider</label>
                  <select
                    value={provider}
                    onChange={(e) => {
                      const nextProv = e.target.value;
                      setProvider(nextProv);
                      if (nextProv === "groq") {
                        setModelName("qwen/qwen3.8-27b");
                      } else {
                        setModelName("gemini-1.5-flash");
                      }
                    }}
                    className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2.5 text-slate-800"
                  >
                    <option value="groq">Groq Cloud (Ultra-Fast LPU Inference)</option>
                    <option value={provider === "gemini" ? "gemini" : "system_gemini"}>Google Gemini API</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Model Identifier</label>
                  <select
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2.5 text-slate-800"
                  >
                    {provider === "groq" ? (
                      <>
                        <option value="qwen/qwen3.8-27b">Qwen 3.8 27B (Recommended, Ultra-Fast & High Token Efficiency)</option>
                        <option value="openai/gpt-oss-120b">GPT-OSS 120B (High Reasoning)</option>
                        <option value="openai/gpt-oss-20b">GPT-OSS 20B (Fast & Efficient)</option>
                      </>
                    ) : (
                      <>
                        <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fast & Balanced)</option>
                        <option value="gemini-1.5-pro">Gemini 1.5 Pro (Deep Analysis)</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Daily Request Quota</label>
                  <Input
                    type="number"
                    min="10"
                    max="100000"
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(Number(e.target.value))}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Max Tokens per Response</label>
                  <Input
                    type="number"
                    min="256"
                    max="8192"
                    step="256"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(Number(e.target.value))}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-700">Creativity (Temperature)</span>
                  <span className="text-slate-500">{temperature.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
              </div>
            </CardContent>
          </Card>

          {/* Provider Credentials & API Key Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Key className="h-4 w-4 text-primary-600" />
                <span>Provider API Credentials</span>
              </CardTitle>
              <CardDescription>
                Configure your organization&apos;s Groq Cloud API Key to unlock ultra-fast LLM reasoning and the &quot;What If?&quot; simulator.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">
                    Groq API Key (Stored securely per organization)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                  >
                    {showApiKey ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5" /> Hide
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5" /> Reveal
                      </>
                    )}
                  </button>
                </div>
                <div className="relative">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="gsk_..."
                    className="text-xs font-mono pr-10"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Leave empty to inherit the global server key if configured. Your key enables real-time tool calling and decision simulations across all devices.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Allowed Capabilities Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold">Allowed Intelligence Domains</CardTitle>
              <CardDescription>Select which modules the AI Assistant can analyze for your organization</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ALL_CAPABILITIES.map((cap) => {
                  const isChecked = selectedCapabilities.includes(cap.id);
                  return (
                    <label
                      key={cap.id}
                      className={`flex items-center space-x-3 p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                        isChecked
                          ? "border-primary-300 bg-primary-50/40 text-slate-900 font-medium"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCapability(cap.id)}
                        className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span>{cap.label}</span>
                    </label>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              size="sm"
              disabled={isSaving}
              className="bg-primary-600 hover:bg-primary-700 text-white flex items-center gap-1.5 px-6"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>Save Configuration</span>
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
