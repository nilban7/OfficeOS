"use client";

import * as React from "react";
import Link from "next/link";
import {
  Building2,
  Clock,
  Coins,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Save,
  RefreshCw,
  Sliders,
  Calendar,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/feedback/loading-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { ROUTES } from "@/constants/routes";
import { ApiException } from "@/types/api";
import type {
  OrganizationProfile,
  OrganizationProfileUpdate,
  OrganizationSettings,
  OrganizationSettingsUpdate,
} from "@/types/organization";

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const COMMON_CURRENCIES = [
  { code: "USD", label: "USD - US Dollar" },
  { code: "EUR", label: "EUR - Euro" },
  { code: "GBP", label: "GBP - British Pound" },
  { code: "INR", label: "INR - Indian Rupee" },
  { code: "CAD", label: "CAD - Canadian Dollar" },
  { code: "AUD", label: "AUD - Australian Dollar" },
  { code: "JPY", label: "JPY - Japanese Yen" },
  { code: "SGD", label: "SGD - Singapore Dollar" },
  { code: "CHF", label: "CHF - Swiss Franc" },
  { code: "AED", label: "AED - UAE Dirham" },
];

export default function OrganizationSettingsPage() {
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  // Permission flags
  const canView = permissions.includes("organizations.view");
  const canUpdateProfile = permissions.includes("organizations.update");
  const canManageSettings = permissions.includes("organizations.settings_manage");

  // State: Organization Profile
  const [profile, setProfile] = React.useState<OrganizationProfile | null>(null);
  const [nameInput, setNameInput] = React.useState("");
  const [isLoadingProfile, setIsLoadingProfile] = React.useState(false);
  const [isSavingProfile, setIsSavingProfile] = React.useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = React.useState<string | null>(null);
  const [profileError, setProfileError] = React.useState<string | null>(null);

  // State: Organization Settings
  const [settings, setSettings] = React.useState<OrganizationSettings | null>(null);
  const [timezoneInput, setTimezoneInput] = React.useState("UTC");
  const [currencyInput, setCurrencyInput] = React.useState("USD");
  const [isLoadingSettings, setIsLoadingSettings] = React.useState(false);
  const [isSavingSettings, setIsSavingSettings] = React.useState(false);
  const [settingsSuccessMsg, setSettingsSuccessMsg] = React.useState<string | null>(null);
  const [settingsError, setSettingsError] = React.useState<string | null>(null);

  // Global load error
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Fetch profile and settings when active organization or view permission changes
  const loadOrganizationData = React.useCallback(async () => {
    if (!currentOrganization?.id || !canView) return;

    setLoadError(null);
    setProfileError(null);
    setSettingsError(null);
    setProfileSuccessMsg(null);
    setSettingsSuccessMsg(null);

    setIsLoadingProfile(true);
    setIsLoadingSettings(true);

    // 1. Fetch Profile
    try {
      const profileData = await apiClient.get<OrganizationProfile>(
        API_ENDPOINTS.organizations.current,
        { organizationId: currentOrganization.id }
      );
      setProfile(profileData);
      setNameInput(profileData.name || "");
    } catch (err) {
      const msg =
        err instanceof ApiException
          ? err.message
          : "Failed to load organization profile. Please try again.";
      setProfileError(msg);
      if (err instanceof ApiException && err.status === 403) {
        setLoadError("Access denied: You lack permission to view this organization.");
      }
    } finally {
      setIsLoadingProfile(false);
    }

    // 2. Fetch Settings if permitted
    if (canManageSettings) {
      try {
        const settingsData = await apiClient.get<OrganizationSettings>(
          API_ENDPOINTS.organizations.currentSettings,
          { organizationId: currentOrganization.id }
        );
        setSettings(settingsData);
        setTimezoneInput(settingsData.timezone || "UTC");
        setCurrencyInput(settingsData.currency || "USD");
      } catch (err) {
        const msg =
          err instanceof ApiException
            ? err.message
            : "Failed to load organization settings.";
        setSettingsError(msg);
      } finally {
        setIsLoadingSettings(false);
      }
    } else {
      setIsLoadingSettings(false);
    }
  }, [currentOrganization?.id, canView, canManageSettings]);

  React.useEffect(() => {
    void loadOrganizationData();
  }, [loadOrganizationData]);

  // Handle Profile Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !canUpdateProfile) return;

    const trimmedName = nameInput.trim();
    if (trimmedName.length < 2 || trimmedName.length > 160) {
      setProfileError("Organization name must be between 2 and 160 characters.");
      return;
    }

    setIsSavingProfile(true);
    setProfileError(null);
    setProfileSuccessMsg(null);

    try {
      const payload: OrganizationProfileUpdate = { name: trimmedName };
      const updated = await apiClient.patch<OrganizationProfile>(
        API_ENDPOINTS.organizations.current,
        payload,
        { organizationId: currentOrganization.id }
      );
      setProfile(updated);
      setNameInput(updated.name);
      setProfileSuccessMsg("Organization profile updated successfully.");
    } catch (err) {
      if (err instanceof ApiException) {
        if (err.status === 403) {
          setProfileError("Permission denied: You do not have permission to update organization profile.");
        } else if (err.status === 422) {
          setProfileError(`Validation error: ${err.message}`);
        } else {
          setProfileError(err.message || "Failed to update profile.");
        }
      } else {
        setProfileError("An unexpected error occurred while saving profile.");
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Handle Settings Save
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !canManageSettings) return;

    const trimmedTimezone = timezoneInput.trim();
    const trimmedCurrency = currencyInput.trim().toUpperCase();

    if (trimmedTimezone.length < 1 || trimmedTimezone.length > 64) {
      setSettingsError("Timezone is required (max 64 characters).");
      return;
    }

    if (trimmedCurrency.length !== 3) {
      setSettingsError("Currency must be a 3-letter ISO code (e.g. USD, EUR).");
      return;
    }

    setIsSavingSettings(true);
    setSettingsError(null);
    setSettingsSuccessMsg(null);

    try {
      const payload: OrganizationSettingsUpdate = {
        timezone: trimmedTimezone,
        currency: trimmedCurrency,
      };
      const updated = await apiClient.patch<OrganizationSettings>(
        API_ENDPOINTS.organizations.currentSettings,
        payload,
        { organizationId: currentOrganization.id }
      );
      setSettings(updated);
      setTimezoneInput(updated.timezone);
      setCurrencyInput(updated.currency);
      setSettingsSuccessMsg("Organization settings updated successfully.");
    } catch (err) {
      if (err instanceof ApiException) {
        if (err.status === 403) {
          setSettingsError("Permission denied: You do not have permission to manage organization settings.");
        } else if (err.status === 422) {
          setSettingsError(`Validation error: ${err.message}`);
        } else {
          setSettingsError(err.message || "Failed to update settings.");
        }
      } else {
        setSettingsError("An unexpected error occurred while saving settings.");
      }
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Loading State
  if (isOrgLoading || (isLoadingProfile && !profile)) {
    return <LoadingState fullPage message="Loading organization settings..." />;
  }

  // No Selected Organization State
  if (!currentOrganization) {
    return (
      <EmptyState
        title="No Organization Selected"
        description="Please select an active organization from the switcher in the header to view and manage its settings."
        icon={Building2}
      />
    );
  }

  // Missing organizations.view Permission State
  if (!canView) {
    return (
      <ErrorState
        title="Access Denied"
        message="You do not have permission to view organization settings (requires 'organizations.view'). Please contact your administrator."
        errorCode="403_FORBIDDEN"
      />
    );
  }

  // Global load error state
  if (loadError) {
    return (
      <ErrorState
        title="Unable to Load Organization"
        message={loadError}
        onRetry={loadOrganizationData}
      />
    );
  }

  const isProfileDirty = profile ? nameInput.trim() !== profile.name : false;
  const isSettingsDirty = settings
    ? timezoneInput.trim() !== settings.timezone || currencyInput.trim().toUpperCase() !== settings.currency
    : false;

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
            <span>Settings</span>
            <span>/</span>
            <span className="text-primary-600">Organization</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Organization Profile & Settings
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage organization identity, branding, and localization preferences for{" "}
            <span className="font-semibold text-slate-700">{currentOrganization.name}</span>.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadOrganizationData}
            isLoading={isLoadingProfile || isLoadingSettings}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-3 text-sm font-medium">
        <Link
          href={ROUTES.SETTINGS_ORGANIZATION}
          className="rounded-lg bg-primary-50 px-3 py-1.5 text-primary-700 font-semibold shadow-sm flex items-center space-x-2"
        >
          <Sliders className="h-4 w-4 text-primary-600" />
          <span>Profile & Settings</span>
        </Link>
        <Link
          href={ROUTES.SETTINGS_ORGANIZATION_BRANCHES}
          className="rounded-lg px-3 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors flex items-center space-x-2"
        >
          <Building2 className="h-4 w-4 text-slate-400" />
          <span>Branches</span>
        </Link>
      </div>

      {/* Grid: Profile & Settings Sections */}
      <div className="space-y-8">
        {/* SECTION 1: Organization Profile */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600 border border-primary-100">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Organization Profile</CardTitle>
                  <CardDescription>
                    Core identification and public workspace details.
                  </CardDescription>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {profile?.is_active ? (
                  <Badge variant="success">Active Workspace</Badge>
                ) : (
                  <Badge variant="warning">Inactive</Badge>
                )}
                {!canUpdateProfile && (
                  <Badge variant="secondary">Read-Only</Badge>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <form id="profile-form" onSubmit={handleSaveProfile} className="space-y-5">
              {/* Success Feedback */}
              {profileSuccessMsg && (
                <div
                  className="flex items-center space-x-2.5 rounded-lg bg-emerald-50 p-3.5 text-sm text-emerald-800 border border-emerald-200"
                  role="status"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{profileSuccessMsg}</span>
                </div>
              )}

              {/* Error Feedback */}
              {profileError && (
                <div
                  className="flex items-center space-x-2.5 rounded-lg bg-red-50 p-3.5 text-sm text-red-800 border border-red-200"
                  role="alert"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                  <span>{profileError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Organization Name */}
                <div className="space-y-2">
                  <Label htmlFor="org-name" required>
                    Organization Name
                  </Label>
                  <Input
                    id="org-name"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    disabled={!canUpdateProfile || isSavingProfile}
                    placeholder="e.g. Acme Corporation"
                    helperText="Between 2 and 160 characters."
                    required
                  />
                </div>

                {/* Organization Slug (Read-only) */}
                <div className="space-y-2">
                  <Label htmlFor="org-slug">
                    Workspace Slug
                  </Label>
                  <Input
                    id="org-slug"
                    value={profile?.slug || currentOrganization.slug}
                    disabled
                    helperText="Unique identifier generated during tenant creation."
                  />
                </div>
              </div>

              {/* Metadata Details */}
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block">Organization ID</span>
                  <span className="font-mono text-slate-800 font-medium break-all">
                    {profile?.id || currentOrganization.id}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Created At</span>
                  <span className="text-slate-800 font-medium flex items-center mt-0.5">
                    <Calendar className="h-3 w-3 mr-1 text-slate-400" />
                    {profile?.created_at
                      ? new Date(profile.created_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Last Updated</span>
                  <span className="text-slate-800 font-medium flex items-center mt-0.5">
                    <Clock className="h-3 w-3 mr-1 text-slate-400" />
                    {profile?.updated_at
                      ? new Date(profile.updated_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </span>
                </div>
              </div>
            </form>
          </CardContent>

          <CardFooter className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {canUpdateProfile
                ? "Click save to persist organization profile changes."
                : "You need 'organizations.update' permission to edit profile fields."}
            </p>
            <Button
              type="submit"
              form="profile-form"
              size="sm"
              isLoading={isSavingProfile}
              disabled={!canUpdateProfile || isSavingProfile || !isProfileDirty}
            >
              <Save className="mr-1.5 h-4 w-4" />
              Save Profile
            </Button>
          </CardFooter>
        </Card>

        {/* SECTION 2: Organization Settings & Localization */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-600 border border-sky-100">
                  <Sliders className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Localization & General Settings</CardTitle>
                  <CardDescription>
                    Configure timezone, currency, and default operational preferences.
                  </CardDescription>
                </div>
              </div>

              {!canManageSettings && (
                <Badge variant="secondary">Requires settings_manage Permission</Badge>
              )}
            </div>
          </CardHeader>

          <CardContent>
            <form id="settings-form" onSubmit={handleSaveSettings} className="space-y-5">
              {/* Success Feedback */}
              {settingsSuccessMsg && (
                <div
                  className="flex items-center space-x-2.5 rounded-lg bg-emerald-50 p-3.5 text-sm text-emerald-800 border border-emerald-200"
                  role="status"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{settingsSuccessMsg}</span>
                </div>
              )}

              {/* Error Feedback */}
              {settingsError && (
                <div
                  className="flex items-center space-x-2.5 rounded-lg bg-red-50 p-3.5 text-sm text-red-800 border border-red-200"
                  role="alert"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                  <span>{settingsError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Timezone Selection */}
                <div className="space-y-2">
                  <Label htmlFor="org-timezone" required>
                    Organization Timezone
                  </Label>
                  <div className="space-y-1.5">
                    <div className="relative flex items-center">
                      <div className="pointer-events-none absolute left-3 flex items-center text-slate-400">
                        <Clock className="h-4 w-4" />
                      </div>
                      <select
                        id="org-timezone"
                        value={timezoneInput}
                        onChange={(e) => setTimezoneInput(e.target.value)}
                        disabled={!canManageSettings || isSavingSettings || isLoadingSettings}
                        className="flex h-10 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60 transition-colors"
                      >
                        {COMMON_TIMEZONES.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz}
                          </option>
                        ))}
                        {!COMMON_TIMEZONES.includes(timezoneInput) && timezoneInput && (
                          <option value={timezoneInput}>{timezoneInput}</option>
                        )}
                      </select>
                    </div>
                    <p className="text-xs text-slate-500">
                      Standard IANA timezone for timestamps and scheduling.
                    </p>
                  </div>
                </div>

                {/* Currency Selection */}
                <div className="space-y-2">
                  <Label htmlFor="org-currency" required>
                    Default Currency (ISO 4217)
                  </Label>
                  <div className="space-y-1.5">
                    <div className="relative flex items-center">
                      <div className="pointer-events-none absolute left-3 flex items-center text-slate-400">
                        <Coins className="h-4 w-4" />
                      </div>
                      <select
                        id="org-currency"
                        value={currencyInput}
                        onChange={(e) => setCurrencyInput(e.target.value)}
                        disabled={!canManageSettings || isSavingSettings || isLoadingSettings}
                        className="flex h-10 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60 transition-colors"
                      >
                        {COMMON_CURRENCIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                        {!COMMON_CURRENCIES.some((c) => c.code === currencyInput) && currencyInput && (
                          <option value={currencyInput}>{currencyInput}</option>
                        )}
                      </select>
                    </div>
                    <p className="text-xs text-slate-500">
                      3-letter ISO currency code for billing and payroll.
                    </p>
                  </div>
                </div>
              </div>
            </form>
          </CardContent>

          <CardFooter className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {canManageSettings
                ? "Click save to update timezone and currency preferences."
                : "You need 'organizations.settings_manage' permission to modify settings."}
            </p>
            <Button
              type="submit"
              form="settings-form"
              size="sm"
              isLoading={isSavingSettings}
              disabled={!canManageSettings || isSavingSettings || !isSettingsDirty}
            >
              <Save className="mr-1.5 h-4 w-4" />
              Save Settings
            </Button>
          </CardFooter>
        </Card>

        {/* Security & Multi-Tenant Boundary Information Card */}
        <Card className="bg-slate-50/50 border-slate-200">
          <CardContent className="p-6">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-white border border-slate-200 text-primary-600 shadow-sm mt-0.5">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-slate-900">
                  Authoritative Tenant Isolation
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  All profile and setting modifications are validated server-side by FastAPI and PostgreSQL Row Level Security (RLS). The active tenant header (<code className="font-mono text-slate-800 bg-white px-1.5 py-0.5 rounded border border-slate-200">X-Organization-Id</code>) is cryptographically bounded to your authenticated Supabase user profile.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
