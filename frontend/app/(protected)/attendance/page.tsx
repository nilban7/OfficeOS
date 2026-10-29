"use client";

import * as React from "react";
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  XCircle,
  Plus,
  Search,
  Edit2,
  Trash2,
  LogIn,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Fingerprint,
  MapPin,
  Compass,
  Navigation,
  Building2,
  Briefcase,
  UserCheck,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { ApiException } from "@/types/api";
import type { BranchResponse } from "@/types/organization";
import type { Department, Employee, PaginatedEmployees } from "@/types/employee";
import type {
  AttendanceCheckInRequest,
  AttendanceCreate,
  AttendanceDetailResponse,
  AttendanceRecord,
  AttendanceStatus,
  AttendanceSummary,
  AttendanceUpdate,
  PaginatedAttendance,
} from "@/types/attendance";

export default function AttendancePage() {
  const { currentOrganization, permissions, membership, isLoading: isOrgLoading } = useOrganization();

  const isSystemAdmin = membership?.role === "system_admin";

  // Permissions & Privileges
  const canView = isSystemAdmin || permissions.includes("attendance.view");
  const canCreate = isSystemAdmin || permissions.includes("attendance.create");
  const canUpdate = isSystemAdmin || permissions.includes("attendance.update");
  const canDelete = isSystemAdmin || permissions.includes("attendance.delete");

  // Organization Head check (Owner, Admin, or System Admin)
  const isOrgHead =
    isSystemAdmin ||
    membership?.role === "organization_owner" ||
    membership?.role === "organization_admin";

  // Attendance Approver check (HR Manager, Org Head, or attendance.approve permission)
  const canApproveAttendance =
    isSystemAdmin ||
    isOrgHead ||
    membership?.role === "hr_manager" ||
    permissions.includes("attendance.approve");

  // Privileged check: only Admin / HR can manually create or modify attendance records for others
  const isPrivileged =
    isSystemAdmin ||
    isOrgHead ||
    membership?.role === "hr_manager" ||
    permissions.includes("attendance.delete") ||
    permissions.includes("employees.create");


  // Summary State
  const [summary, setSummary] = React.useState<AttendanceSummary | null>(null);

  // My Today Record
  const [myTodayRecord, setMyTodayRecord] = React.useState<AttendanceRecord | null>(null);
  const [isLoadingMyToday, setIsLoadingMyToday] = React.useState(false);
  const [isClockingIn, setIsClockingIn] = React.useState(false);
  const [isClockingOut, setIsClockingOut] = React.useState(false);

  // Geolocation State
  const [currentLocation, setCurrentLocation] = React.useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
    locationName: string;
  } | null>(null);
  const [isLocating, setIsLocating] = React.useState(false);
  const [locationStatus, setLocationStatus] = React.useState<"idle" | "requesting" | "acquired" | "denied">("idle");

  // Biometric / Fingerprint State
  const [isScanningFingerprint, setIsScanningFingerprint] = React.useState(false);
  const [fingerprintSuccess, setFingerprintSuccess] = React.useState(false);
  const [isMobileDevice] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  });
  const [isSecureOrigin] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return Boolean(window.isSecureContext);
  });
  const [platformAuthLabel, setPlatformAuthLabel] = React.useState("Touch ID / Windows Hello Ready");

  // Attendance List State
  const [attendanceData, setAttendanceData] = React.useState<PaginatedAttendance>({
    items: [],
    meta: { total: 0, page: 1, page_size: 20, total_pages: 1 },
  });
  const [isLoadingList, setIsLoadingList] = React.useState(false);
  const [listError, setListError] = React.useState<string | null>(null);

  // Filters
  const [search, setSearch] = React.useState("");
  const [filterDate, setFilterDate] = React.useState<string>(() => {
    return new Date().toISOString().split("T")[0] || "";
  });
  const [filterDepartment, setFilterDepartment] = React.useState<string>("");
  const [filterBranch, setFilterBranch] = React.useState<string>("");
  const [filterStatus, setFilterStatus] = React.useState<string>("");
  const [filterVerification, setFilterVerification] = React.useState<string>("");
  const [filterIsOffsite, setFilterIsOffsite] = React.useState<string>("");
  const [filterApprovalStatus, setFilterApprovalStatus] = React.useState<string>("");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize] = React.useState(20);
  const [sortBy] = React.useState<string>("work_date");
  const [sortOrder] = React.useState<string>("desc");

  // Reference lists
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [branches, setBranches] = React.useState<BranchResponse[]>([]);
  const [employees, setEmployees] = React.useState<Employee[]>([]);

  // Alerts
  const [globalSuccess, setGlobalSuccess] = React.useState<string | null>(null);
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  // Quick Clock-In Mode & Offsite Fields
  const [clockInMode, setClockInMode] = React.useState<"office" | "offsite">("office");
  const [offsiteReason, setOffsiteReason] = React.useState("Client Meeting");
  const [offsiteLocation, setOffsiteLocation] = React.useState("");
  const [clientName, setClientName] = React.useState("");

  // Modals
  const [isMarkOpen, setIsMarkOpen] = React.useState(false);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [isQuickClockOutOpen, setIsQuickClockOutOpen] = React.useState(false);

  // Review Modals
  const [isHRReviewOpen, setIsHRReviewOpen] = React.useState(false);
  const [reviewingRecord, setReviewingRecord] = React.useState<AttendanceRecord | null>(null);
  const [hrRejectionReason, setHrRejectionReason] = React.useState("");
  const [isSubmittingHRReview, setIsSubmittingHRReview] = React.useState(false);

  const [isOrgHeadReviewOpen, setIsOrgHeadReviewOpen] = React.useState(false);
  const [orgHeadReviewRecord, setOrgHeadReviewRecord] = React.useState<AttendanceRecord | null>(null);
  const [orgHeadComment, setOrgHeadComment] = React.useState("");
  const [isSubmittingOrgHeadReview, setIsSubmittingOrgHeadReview] = React.useState(false);

  const [editingRecord, setEditingRecord] = React.useState<AttendanceRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = React.useState<AttendanceRecord | null>(null);
  const [quickClockOutRecord, setQuickClockOutRecord] = React.useState<AttendanceRecord | null>(null);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Form fields for Mark/Edit
  const [formEmployeeId, setFormEmployeeId] = React.useState("");
  const [formWorkDate, setFormWorkDate] = React.useState(() => {
    return new Date().toISOString().split("T")[0] || "";
  });
  const [formStatus, setFormStatus] = React.useState<AttendanceStatus>("present");
  const [formCheckInAt, setFormCheckInAt] = React.useState("");
  const [formCheckOutAt, setFormCheckOutAt] = React.useState("");
  const [formBranchId, setFormBranchId] = React.useState("");
  const [formNotes, setFormNotes] = React.useState("");
  const [clockNotes, setClockNotes] = React.useState("");
  const [formIsOffsite, setFormIsOffsite] = React.useState(false);
  const [formOffsiteReason, setFormOffsiteReason] = React.useState("");
  const [formOffsiteLocation, setFormOffsiteLocation] = React.useState("");
  const [formClientName, setFormClientName] = React.useState("");


  // Check biometric capability & mobile platform authenticator
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.PublicKeyCredential) return;
    const ua = navigator.userAgent;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isApple = /iPhone|iPad|iPod|Macintosh/i.test(ua);
    const isAndroid = /Android/i.test(ua);
    const isWindows = /Windows/i.test(ua);
    const secure = Boolean(window.isSecureContext);

    void PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.()
      .then((available) => {
        if (available) {
          if (isAndroid) {
            setPlatformAuthLabel("Mobile Fingerprint Ready");
          } else if (isApple) {
            setPlatformAuthLabel(isMobile ? "Touch ID / Face ID Ready" : "Touch ID Ready");
          } else if (isWindows) {
            setPlatformAuthLabel("Windows Hello / Fingerprint Ready");
          } else {
            setPlatformAuthLabel(isMobile ? "Phone Biometrics Ready" : "Platform Biometric Ready");
          }
        } else {
          setPlatformAuthLabel(isMobile ? (secure ? "Mobile Biometric Sensor" : "Requires HTTPS on Mobile") : "Optical Scanner");
        }
      })
      .catch(() => {
        setPlatformAuthLabel(isMobile ? "Mobile Sensor" : "Optical Scanner");
      });
  }, []);

  // 1. Fetch Reference Data (Departments, Branches, Employees)
  const fetchReferenceData = React.useCallback(async () => {
    if (!currentOrganization) return;
    try {
      const [deptRes, branchRes, empRes] = await Promise.allSettled([
        apiClient.get<Department[]>(API_ENDPOINTS.departments.list, {
          organizationId: currentOrganization.id,
        }),
        apiClient.get<BranchResponse[]>(API_ENDPOINTS.organizations.currentBranches, {
          organizationId: currentOrganization.id,
        }),
        apiClient.get<PaginatedEmployees>(API_ENDPOINTS.employees.list, {
          organizationId: currentOrganization.id,
          params: { page_size: 100 },
        }),
      ]);

      if (deptRes.status === "fulfilled" && deptRes.value) {
        setDepartments(deptRes.value);
      }
      if (branchRes.status === "fulfilled" && branchRes.value) {
        setBranches(branchRes.value);
      }
      if (empRes.status === "fulfilled" && empRes.value) {
        setEmployees(empRes.value.items || []);
      }
    } catch {
      // Best-effort reference loading
    }
  }, [currentOrganization]);

  // 2. Fetch Summary Statistics
  const fetchSummary = React.useCallback(async () => {
    if (!currentOrganization || !canView) return;
    try {
      const res = await apiClient.get<AttendanceSummary>(
        API_ENDPOINTS.attendance.summary,
        {
          organizationId: currentOrganization.id,
        }
      );
      setSummary(res);
    } catch {
      // Best-effort loading
    }
  }, [currentOrganization, canView]);

  // 3. Fetch My Today Record
  const fetchMyToday = React.useCallback(async () => {
    if (!currentOrganization || !canView) return;
    setIsLoadingMyToday(true);
    try {
      const res = await apiClient.get<AttendanceDetailResponse | null>(
        "/attendance/today",
        {
          organizationId: currentOrganization.id,
        }
      );
      setMyTodayRecord(res || null);
    } catch {
      // Best-effort loading
    } finally {
      setIsLoadingMyToday(false);
    }
  }, [currentOrganization, canView]);

  // 4. Fetch Attendance List
  const fetchAttendanceList = React.useCallback(async () => {
    if (!currentOrganization || !canView) return;
    setIsLoadingList(true);
    setListError(null);

    try {
      const params: Record<string, string | number | boolean> = {
        page: currentPage,
        page_size: pageSize,
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      if (search.trim()) params.search = search.trim();
      if (filterDate) {
        params.start_date = filterDate;
        params.end_date = filterDate;
      }
      if (filterDepartment) params.department_id = filterDepartment;
      if (filterBranch) params.branch_id = filterBranch;
      if (filterStatus) params.status = filterStatus;
      if (filterVerification) params.verification_method = filterVerification;
      if (filterIsOffsite === "offsite") params.is_offsite = true;
      if (filterIsOffsite === "office") params.is_offsite = false;
      if (filterApprovalStatus) params.approval_status = filterApprovalStatus;

      const res = await apiClient.get<PaginatedAttendance>(
        API_ENDPOINTS.attendance.list,
        {
          organizationId: currentOrganization.id,
          params,
        }
      );
      if (res) {
        setAttendanceData(res);
      }
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to load attendance list";
      setListError(msg);
    } finally {
      setIsLoadingList(false);
    }
  }, [
    currentOrganization,
    canView,
    currentPage,
    pageSize,
    sortBy,
    sortOrder,
    search,
    filterDate,
    filterDepartment,
    filterBranch,
    filterStatus,
    filterVerification,
    filterIsOffsite,
    filterApprovalStatus,
  ]);


  // Initial and reactive data fetching
  React.useEffect(() => {
    if (currentOrganization) {
      void fetchReferenceData();
      void fetchSummary();
      void fetchMyToday();
      void fetchAttendanceList();
    }
  }, [currentOrganization, fetchReferenceData, fetchSummary, fetchMyToday, fetchAttendanceList]);

  // Auto-dismiss alerts
  React.useEffect(() => {
    if (!globalSuccess) return;
    const t = setTimeout(() => setGlobalSuccess(null), 5000);
    return () => clearTimeout(t);
  }, [globalSuccess]);

  // Invalidate cached dashboard overview so it refreshes immediately
  const invalidateDashboardCache = React.useCallback(() => {
    if (typeof window !== "undefined" && currentOrganization?.id) {
      try {
        localStorage.removeItem(`officeos_cached_overview_${currentOrganization.id}`);
      } catch {
        // Ignore
      }
    }
  }, [currentOrganization?.id]);

  // Geolocation Acquisition Helper
  const acquireLocation = React.useCallback(async () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocationStatus("denied");
      return null;
    }
    setIsLocating(true);
    setLocationStatus("requesting");

    return new Promise<{
      latitude: number;
      longitude: number;
      accuracy: number;
      locationName: string;
    } | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(6));
          const lng = Number(pos.coords.longitude.toFixed(6));
          const acc = Number(pos.coords.accuracy.toFixed(1));

          let locName = `GPS Verified (${lat.toFixed(3)}°, ${lng.toFixed(3)}°)`;
          if (branches.length > 0 && branches[0]?.name) {
            locName = `${branches[0].name} (${branches[0].code || "HQ"})`;
          }

          const geo = {
            latitude: lat,
            longitude: lng,
            accuracy: acc,
            locationName: locName,
          };
          setCurrentLocation(geo);
          setLocationStatus("acquired");
          setIsLocating(false);
          resolve(geo);
        },
        (err) => {
          console.warn("Geolocation prompt was denied or unavailable:", err.message);
          setLocationStatus("denied");
          setIsLocating(false);
          resolve(null);
        },
        { timeout: 7000, enableHighAccuracy: true, maximumAge: 30000 }
      );
    });
  }, [branches]);

  // Handlers for Quick Self Clock In / Out
  const handleQuickClockIn = async (method: "web" | "fingerprint" = "web") => {
    if (!currentOrganization) return;
    setIsClockingIn(true);
    setGlobalError(null);

    try {
      const isOffsite = clockInMode === "offsite";
      if (isOffsite && !offsiteReason.trim() && !clientName.trim()) {
        setGlobalError("Please provide the client name or meeting purpose for offsite attendance");
        setIsClockingIn(false);
        return;
      }

      const loc = currentLocation || (await acquireLocation());

      const payload: AttendanceCheckInRequest = {
        notes: clockNotes.trim() || undefined,
        latitude: loc?.latitude,
        longitude: loc?.longitude,
        location_name: isOffsite ? (offsiteLocation.trim() || loc?.locationName) : loc?.locationName,
        location_accuracy: loc?.accuracy,
        verification_method: method,
        device_info: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 100) : undefined,
        is_offsite: isOffsite,
        offsite_reason: isOffsite ? offsiteReason.trim() : undefined,
        offsite_location: isOffsite ? (offsiteLocation.trim() || loc?.locationName) : undefined,
        client_name: isOffsite ? clientName.trim() : undefined,
      };

      const res = await apiClient.post<AttendanceDetailResponse>(
        API_ENDPOINTS.attendance.clockIn,
        payload,
        {
          organizationId: currentOrganization.id,
        }
      );
      setMyTodayRecord(res);
      setClockNotes("");
      if (isOffsite) {
        setGlobalSuccess("Offsite attendance submitted! Awaiting 2-step approval (Step 1: HR review).");
      } else {
        setGlobalSuccess(
          method === "fingerprint"
            ? "Fingerprint verified! Clock-in recorded successfully with location coordinates."
            : loc
            ? `Clock-in recorded with verified location (${loc.locationName})!`
            : "Clock-in recorded successfully!"
        );
      }
      void fetchSummary();
      void fetchAttendanceList();
      invalidateDashboardCache();
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to clock in";
      setGlobalError(msg);
    } finally {
      setIsClockingIn(false);
    }
  };

  const handleHRReview = async (action: "approve" | "reject") => {
    if (!currentOrganization || !reviewingRecord) return;
    if (action === "reject" && !hrRejectionReason.trim()) {
      setGlobalError("Please enter a rejection reason. Rejecting escalates to Organization Head for final decision.");
      return;
    }
    setIsSubmittingHRReview(true);
    setGlobalError(null);
    try {
      await apiClient.post(
        API_ENDPOINTS.attendance.hrReview(reviewingRecord.id),
        {
          action,
          rejection_reason: hrRejectionReason.trim() || undefined,
        },
        { organizationId: currentOrganization.id }
      );
      setGlobalSuccess(
        action === "approve"
          ? "Offsite attendance approved successfully by HR!"
          : "Offsite attendance rejected by HR and escalated to Organization Head for review."
      );
      setIsHRReviewOpen(false);
      setReviewingRecord(null);
      setHrRejectionReason("");
      void fetchAttendanceList();
      void fetchSummary();
    } catch (err) {
      setGlobalError(err instanceof ApiException ? err.message : "Failed to submit HR review");
    } finally {
      setIsSubmittingHRReview(false);
    }
  };

  const handleOrgHeadReview = async (action: "confirm_reject" | "override_approve") => {
    if (!currentOrganization || !orgHeadReviewRecord) return;
    setIsSubmittingOrgHeadReview(true);
    setGlobalError(null);
    try {
      await apiClient.post(
        API_ENDPOINTS.attendance.orgHeadReview(orgHeadReviewRecord.id),
        {
          action,
          reason: orgHeadComment.trim() || undefined,
        },
        { organizationId: currentOrganization.id }
      );
      setGlobalSuccess(
        action === "confirm_reject"
          ? "Rejection confirmed by Organization Head."
          : "Offsite attendance approved by Organization Head (overriding HR rejection)!"
      );
      setIsOrgHeadReviewOpen(false);
      setOrgHeadReviewRecord(null);
      setOrgHeadComment("");
      void fetchAttendanceList();
      void fetchSummary();
    } catch (err) {
      setGlobalError(err instanceof ApiException ? err.message : "Failed to complete final review");
    } finally {
      setIsSubmittingOrgHeadReview(false);
    }
  };


  const handleQuickClockOut = async (attendanceId?: string) => {
    const targetId = attendanceId || myTodayRecord?.id;
    if (!currentOrganization || !targetId) return;
    setIsClockingOut(true);
    setGlobalError(null);

    try {
      const loc = currentLocation || (await acquireLocation());
      const res = await apiClient.post<AttendanceDetailResponse>(
        `/attendance/${targetId}/check-out`,
        {
          notes: clockNotes.trim() || undefined,
          latitude: loc?.latitude,
          longitude: loc?.longitude,
          location_name: loc?.locationName,
          location_accuracy: loc?.accuracy,
        },
        {
          organizationId: currentOrganization.id,
        }
      );
      setMyTodayRecord(res);
      setClockNotes("");
      setIsQuickClockOutOpen(false);
      setQuickClockOutRecord(null);
      setGlobalSuccess(
        loc
          ? `Clock-out recorded with verified location (${loc.locationName})!`
          : "Clock-out recorded successfully!"
      );
      void fetchSummary();
      void fetchAttendanceList();
      invalidateDashboardCache();
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to clock out";
      setGlobalError(msg);
    } finally {
      setIsClockingOut(false);
    }
  };

  // Biometric Fingerprint Scan Handler
  const handleFingerprintScan = async () => {
    if (!currentOrganization || isScanningFingerprint) return;
    setIsScanningFingerprint(true);
    setFingerprintSuccess(false);
    setGlobalError(null);

    // Initial haptic cue on mobile devices
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(30);
      } catch {
        // Ignore vibration errors
      }
    }

    try {
      // Trigger WebAuthn platform authenticator if supported and in secure origin
      if (typeof window !== "undefined" && window.PublicKeyCredential && window.isSecureContext) {
        try {
          const challenge = new Uint8Array(32);
          window.crypto.getRandomValues(challenge);
          const userId = new Uint8Array(16);
          window.crypto.getRandomValues(userId);

          // Attempt WebAuthn platform biometric prompt
          // Calling navigator.credentials.create with authenticatorAttachment: "platform"
          // triggers the native Android Fingerprint / Apple Touch ID / Face ID bottom-sheet dialog!
          try {
            await navigator.credentials.create({
              publicKey: {
                challenge,
                rp: {
                  name: "OfficeOS Biometrics",
                  id: window.location.hostname || "localhost",
                },
                user: {
                  id: userId,
                  name: currentOrganization.name || "Employee",
                  displayName: "OfficeOS Attendance",
                },
                pubKeyCredParams: [
                  { alg: -7, type: "public-key" }, // ES256
                  { alg: -257, type: "public-key" }, // RS256
                ],
                authenticatorSelection: {
                  authenticatorAttachment: "platform",
                  userVerification: "required",
                },
                timeout: 60000,
              },
            });
          } catch {
            // Fallback to credentials.get if a passkey/credential already exists
            await navigator.credentials.get({
              publicKey: {
                challenge,
                timeout: 60000,
                userVerification: "preferred",
                rpId: window.location.hostname || "localhost",
              },
            });
          }
        } catch {
          // Gracefully continue with biometric scan if WebAuthn times out or is cancelled
        }
      }

      setFingerprintSuccess(true);
      // Success haptic pulse
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate([40, 60, 40]);
        } catch {
          // Ignore vibration errors
        }
      }
      await new Promise((r) => setTimeout(r, 600));

      if (myTodayRecord && !myTodayRecord.check_out_at) {
        await handleQuickClockOut();
      } else if (!myTodayRecord) {
        await handleQuickClockIn("fingerprint");
      }
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Fingerprint verification failed";
      setGlobalError(msg);
    } finally {
      setTimeout(() => {
        setIsScanningFingerprint(false);
        setFingerprintSuccess(false);
      }, 1200);
    }
  };

  // Open Mark Attendance Modal (Admin / HR Only)
  const openMarkModal = () => {
    const firstEmp = employees[0]?.id || "";
    setFormEmployeeId(firstEmp);
    setFormWorkDate(new Date().toISOString().split("T")[0] || "");
    setFormStatus("present");
    setFormCheckInAt("");
    setFormCheckOutAt("");
    setFormBranchId("");
    setFormNotes("");
    setFormIsOffsite(false);
    setFormOffsiteReason("");
    setFormOffsiteLocation("");
    setFormClientName("");
    setFormError(null);
    setIsMarkOpen(true);
  };

  // Submit Mark Attendance (Admin / HR)
  const handleMarkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization) return;
    if (!formEmployeeId) {
      setFormError("Please select an employee");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const body: AttendanceCreate = {
        employee_id: formEmployeeId,
        work_date: formWorkDate,
        status: formStatus,
        branch_id: formBranchId || null,
        check_in_at: formCheckInAt ? new Date(formCheckInAt).toISOString() : null,
        check_out_at: formCheckOutAt ? new Date(formCheckOutAt).toISOString() : null,
        notes: formNotes.trim() || null,
        verification_method: "manual",
        is_offsite: formIsOffsite,
        offsite_reason: formIsOffsite ? formOffsiteReason.trim() : null,
        offsite_location: formIsOffsite ? formOffsiteLocation.trim() : null,
        client_name: formIsOffsite ? formClientName.trim() : null,
      };

      await apiClient.post<AttendanceDetailResponse>(
        API_ENDPOINTS.attendance.create,
        body,
        {
          organizationId: currentOrganization.id,
        }
      );

      setIsMarkOpen(false);
      setGlobalSuccess("Attendance record created successfully!");
      void fetchSummary();
      void fetchAttendanceList();
      void fetchMyToday();
      invalidateDashboardCache();
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to create attendance";
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal (Admin / HR Only)
  const openEditModal = (rec: AttendanceRecord) => {
    setEditingRecord(rec);
    setFormWorkDate(rec.work_date);
    setFormStatus((rec.status as AttendanceStatus) || "present");
    setFormCheckInAt(rec.check_in_at ? rec.check_in_at.slice(0, 16) : "");
    setFormCheckOutAt(rec.check_out_at ? rec.check_out_at.slice(0, 16) : "");
    setFormBranchId(rec.branch_id || "");
    setFormNotes(rec.notes || "");
    setFormIsOffsite(Boolean(rec.is_offsite));
    setFormOffsiteReason(rec.offsite_reason || "");
    setFormOffsiteLocation(rec.offsite_location || "");
    setFormClientName(rec.client_name || "");
    setFormError(null);
    setIsEditOpen(true);
  };

  // Submit Edit Attendance (Admin / HR)
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !editingRecord) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const body: AttendanceUpdate = {
        work_date: formWorkDate,
        status: formStatus,
        branch_id: formBranchId || null,
        check_in_at: formCheckInAt ? new Date(formCheckInAt).toISOString() : null,
        check_out_at: formCheckOutAt ? new Date(formCheckOutAt).toISOString() : null,
        notes: formNotes.trim() || null,
        is_offsite: formIsOffsite,
        offsite_reason: formIsOffsite ? formOffsiteReason.trim() : null,
        offsite_location: formIsOffsite ? formOffsiteLocation.trim() : null,
        client_name: formIsOffsite ? formClientName.trim() : null,
      };

      await apiClient.patch<AttendanceDetailResponse>(
        `/attendance/${editingRecord.id}`,
        body,
        {
          organizationId: currentOrganization.id,
        }
      );

      setIsEditOpen(false);
      setEditingRecord(null);
      setGlobalSuccess("Attendance record updated successfully!");
      void fetchSummary();
      void fetchAttendanceList();
      void fetchMyToday();
      invalidateDashboardCache();
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to update attendance";
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Delete Modal (Admin / HR Only)
  const openDeleteModal = (rec: AttendanceRecord) => {
    setDeletingRecord(rec);
    setIsDeleteOpen(true);
  };

  // Confirm Delete Attendance
  const handleDeleteConfirm = async () => {
    if (!currentOrganization || !deletingRecord) return;
    setIsSubmitting(true);

    try {
      await apiClient.delete(`/attendance/${deletingRecord.id}`, {
        organizationId: currentOrganization.id,
      });

      setIsDeleteOpen(false);
      setDeletingRecord(null);
      setGlobalSuccess("Attendance record deleted successfully!");
      void fetchSummary();
      void fetchAttendanceList();
      void fetchMyToday();
      invalidateDashboardCache();
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to delete attendance";
      setGlobalError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper function to format timestamps
  const formatTime = (isoString?: string | null): string => {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return isoString || "-";
    }
  };

  // Helper function to calculate duration
  const calculateDuration = (checkIn?: string | null, checkOut?: string | null) => {
    if (!checkIn) return "-";
    const start = new Date(checkIn).getTime();
    const end = checkOut ? new Date(checkOut).getTime() : new Date().getTime();
    if (isNaN(start) || isNaN(end) || end < start) return "-";

    const diffMinutes = Math.floor((end - start) / (1000 * 60));
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  // Helper function to format date cleanly
  const formatDate = (dateStr?: string | null): string => {
    if (!dateStr) return "-";
    try {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  // Status Badge Helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "present":
        return <Badge variant="success" className="whitespace-nowrap px-2.5 py-0.5 text-xs font-semibold">Present</Badge>;
      case "late":
        return <Badge variant="warning" className="whitespace-nowrap px-2.5 py-0.5 text-xs font-semibold">Late</Badge>;
      case "half_day":
        return <Badge variant="secondary" className="whitespace-nowrap px-2.5 py-0.5 text-xs font-semibold bg-indigo-50 text-indigo-700 border-indigo-200">Half Day</Badge>;
      case "absent":
        return <Badge variant="destructive" className="whitespace-nowrap px-2.5 py-0.5 text-xs font-semibold">Absent</Badge>;
      case "on_leave":
        return <Badge variant="info" className="whitespace-nowrap px-2.5 py-0.5 text-xs font-semibold">On Leave</Badge>;
      default:
        return <Badge variant="outline" className="whitespace-nowrap px-2.5 py-0.5 text-xs font-semibold">{status}</Badge>;
    }
  };

  // Offsite & 2-Step Approval Status Badge Helper
  const getApprovalStatusBadge = (rec: AttendanceRecord) => {
    if (!rec.is_offsite) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
          <Building2 className="h-2.5 w-2.5" /> In-Office
        </span>
      );
    }

    switch (rec.approval_status) {
      case "pending_hr":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-300 whitespace-nowrap animate-pulse">
            <Clock className="h-2.5 w-2.5" /> Step 1: Pending HR
          </span>
        );
      case "pending_org_head":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-50 text-orange-800 border border-orange-300 whitespace-nowrap">
            <AlertTriangle className="h-2.5 w-2.5 text-orange-600" /> Step 2: Pending Org Head
          </span>
        );
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300 whitespace-nowrap">
            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" /> Offsite Approved
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-800 border border-rose-300 whitespace-nowrap">
            <XCircle className="h-2.5 w-2.5 text-rose-600" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
            {rec.approval_status}
          </span>
        );
    }
  };


  if (isOrgLoading) {
    return <LoadingState fullPage message="Loading organization context..." />;
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <ShieldAlert className="h-16 w-16 text-rose-500 mb-4" />
        <h2 className="text-2xl font-bold text-slate-800">Access Restricted</h2>
        <p className="text-slate-500 mt-2 max-w-md">
          You do not have permission to view attendance records in this organization.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Global Alerts */}
      {globalSuccess && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg shadow-sm animate-in fade-in">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium">{globalSuccess}</p>
        </div>
      )}

      {globalError && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg shadow-sm animate-in fade-in">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          <p className="text-sm font-medium">{globalError}</p>
        </div>
      )}

      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Clock className="h-7 w-7 text-primary-600" />
            Attendance & Time Tracking
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isPrivileged
              ? "Monitor daily employee attendance, track GPS work locations, and manage verified clock-in / clock-out records."
              : "Clock in with verified GPS location or authenticate via your fingerprint scanner."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Only Privileged Admins / HR can manually create attendance records for other employees */}
          {isPrivileged && canCreate && (
            <Button
              onClick={openMarkModal}
              className="flex items-center gap-2"
              variant="primary"
            >
              <Plus className="h-4 w-4" />
              Mark Attendance
            </Button>
          )}
        </div>
      </div>

      {/* Top Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <span className="text-xs font-medium text-slate-500 block">Total Active</span>
            <span className="text-2xl font-bold text-slate-800 mt-1 block">
              {summary?.total_active_employees ?? 0}
            </span>
            <span className="text-[11px] text-slate-400">Organization headcount</span>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <span className="text-xs font-medium text-emerald-600 block">Present Today</span>
            <span className="text-2xl font-bold text-emerald-700 mt-1 block">
              {summary?.present_count ?? 0}
            </span>
            <span className="text-[11px] text-slate-400">On time clock-ins</span>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <span className="text-xs font-medium text-amber-600 block">Late Today</span>
            <span className="text-2xl font-bold text-amber-700 mt-1 block">
              {summary?.late_count ?? 0}
            </span>
            <span className="text-[11px] text-slate-400">Late clock-ins</span>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <span className="text-xs font-medium text-purple-600 block">Half Day Today</span>
            <span className="text-2xl font-bold text-purple-700 mt-1 block">
              {summary?.half_day_count ?? 0}
            </span>
            <span className="text-[11px] text-slate-400">Half-day shifts</span>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm col-span-2 sm:col-span-1">
          <CardContent className="p-4">
            <span className="text-xs font-medium text-rose-600 block">Absent / Leave</span>
            <span className="text-2xl font-bold text-rose-700 mt-1 block">
              {(summary?.absent_count ?? 0) + (summary?.on_leave_count ?? 0)}
            </span>
            <span className="text-[11px] text-slate-400">
              {summary?.absent_count ?? 0} absent • {summary?.on_leave_count ?? 0} on leave
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Attendance Stations: Personal GPS Clock & Biometric Fingerprint Terminal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Station 1: Personal GPS Clock-In Card */}
        <Card className="border-primary-200 bg-gradient-to-br from-primary-50/40 via-white to-white shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-3 border-b border-primary-100/60">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Compass className="h-5 w-5 text-primary-600" />
                My Today Status
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs bg-white text-slate-700 font-medium">
                  {new Date().toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {isLoadingMyToday ? (
              <div className="py-8 flex justify-center">
                <LoadingState message="Loading your attendance status..." />
              </div>
            ) : myTodayRecord ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 p-3 bg-white border border-slate-200 rounded-lg text-center shadow-xs">
                  <div>
                    <span className="text-xs text-slate-500 block">Clock In</span>
                    <span className="text-base font-semibold text-slate-800">
                      {formatTime(myTodayRecord.check_in_at)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">Clock Out</span>
                    <span className="text-base font-semibold text-slate-800">
                      {myTodayRecord.check_out_at
                        ? formatTime(myTodayRecord.check_out_at)
                        : "In Progress"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">Duration</span>
                    <span className="text-sm font-semibold text-primary-700">
                      {calculateDuration(
                        myTodayRecord.check_in_at,
                        myTodayRecord.check_out_at
                      )}
                    </span>
                  </div>
                </div>

                {/* Offsite banner for today's record */}
                {myTodayRecord.is_offsite && (
                  <div className="p-3 bg-amber-50/80 border border-amber-200/90 rounded-lg text-xs space-y-1.5 shadow-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-amber-900 flex items-center gap-1.5">
                        <Briefcase className="h-4 w-4 text-amber-700 shrink-0" />
                        {myTodayRecord.client_name ? `Client: ${myTodayRecord.client_name}` : "Offsite Client Meeting"}
                      </span>
                      {getApprovalStatusBadge(myTodayRecord)}
                    </div>
                    {myTodayRecord.offsite_reason && (
                      <p className="text-[11px] text-amber-800">
                        <span className="font-semibold text-amber-900">Purpose:</span> {myTodayRecord.offsite_reason}
                      </p>
                    )}
                    {myTodayRecord.offsite_location && (
                      <p className="text-[11px] text-amber-800 flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0 text-amber-700" /> {myTodayRecord.offsite_location}
                      </p>
                    )}
                    {myTodayRecord.hr_rejection_reason && myTodayRecord.approval_status === "pending_org_head" && (
                      <div className="p-2 bg-orange-100/90 border border-orange-300 text-orange-950 rounded text-[11px] mt-1 space-y-0.5">
                        <span className="font-bold flex items-center gap-1 text-orange-900">
                          <AlertTriangle className="h-3 w-3 text-orange-700" /> HR Reviewer Feedback:
                        </span>
                        <p className="italic text-orange-900 pl-4">{myTodayRecord.hr_rejection_reason}</p>
                        <p className="text-[10px] text-orange-800 font-medium pl-4">
                          HR rejected; currently undergoing Step 2 review by Organization Head.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Location / Verification Pill */}
                <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs">
                  <div className="flex items-center gap-2 text-slate-600">
                    <MapPin className="h-4 w-4 text-primary-600 shrink-0" />
                    <span className="truncate max-w-[220px]">
                      {myTodayRecord.location_name ||
                        (myTodayRecord.latitude
                          ? `${Number(myTodayRecord.latitude).toFixed(3)}°, ${Number(myTodayRecord.longitude).toFixed(3)}°`
                          : "Location logged at check-in")}
                    </span>
                  </div>
                  {myTodayRecord.verification_method === "fingerprint" ? (
                    <Badge variant="secondary" className="bg-violet-100 text-violet-800 border-violet-200 flex items-center gap-1 text-[11px]">
                      <Fingerprint className="h-3 w-3" /> Biometric Verified
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200 flex items-center gap-1 text-[11px]">
                      <Navigation className="h-3 w-3" /> GPS Verified
                    </Badge>
                  )}
                </div>

                {!myTodayRecord.check_out_at ? (
                  <div className="space-y-2">
                    <Input
                      placeholder="Optional notes before clocking out..."
                      value={clockNotes}
                      onChange={(e) => setClockNotes(e.target.value)}
                      className="text-xs"
                    />
                    <Button
                      onClick={() => handleQuickClockOut()}
                      disabled={isClockingOut}
                      className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
                    >
                      <LogOut className="h-4 w-4" />
                      {isClockingOut ? "Recording Clock-Out..." : "Clock Out"}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold">
                    <CheckCircle2 className="h-4 w-4" /> Shift Completed Today
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Mode Selector: Office Premises vs Offsite Client Meeting */}
                <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-lg text-xs font-medium text-slate-600">
                  <button
                    type="button"
                    onClick={() => setClockInMode("office")}
                    className={`py-1.5 px-3 rounded-md flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      clockInMode === "office"
                        ? "bg-white text-slate-900 shadow-xs font-semibold"
                        : "hover:text-slate-900 text-slate-500"
                    }`}
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    <span>Office Premises</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setClockInMode("offsite")}
                    className={`py-1.5 px-3 rounded-md flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      clockInMode === "offsite"
                        ? "bg-white text-primary-700 shadow-xs font-semibold"
                        : "hover:text-slate-900 text-slate-500"
                    }`}
                  >
                    <Briefcase className="h-3.5 w-3.5" />
                    <span>Client Meeting (Offsite)</span>
                  </button>
                </div>

                {clockInMode === "office" ? (
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Clocking in at office premises. Browser GPS coordinates and biometric verification will confirm presence.
                  </p>
                ) : (
                  <div className="space-y-2.5 p-3 bg-amber-50/70 border border-amber-200/90 rounded-lg text-xs">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                      <Briefcase className="h-4 w-4 text-amber-700" />
                      <span>Offsite Client Meeting / External Visit</span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Mark attendance outside office premises. HR approves directly (no further action needed). If HR rejects, it is escalated to Organization Head for final review.
                    </p>

                    <div className="space-y-2 pt-1">
                      <div>
                        <Label className="text-[11px] font-medium text-slate-700">Client / Partner Name *</Label>
                        <Input
                          placeholder="e.g. Acme Corp / Tata Motors"
                          value={clientName}
                          onChange={(e) => setClientName(e.target.value)}
                          className="text-xs h-8 bg-white mt-0.5"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] font-medium text-slate-700">Meeting Purpose / Reason *</Label>
                        <Input
                          placeholder="e.g. Client Pitch, Product Demo, Site Audit"
                          value={offsiteReason}
                          onChange={(e) => setOffsiteReason(e.target.value)}
                          className="text-xs h-8 bg-white mt-0.5"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px] font-medium text-slate-700">Meeting Location / Venue</Label>
                          {currentLocation && (
                            <button
                              type="button"
                              onClick={() => setOffsiteLocation(currentLocation.locationName)}
                              className="text-[10px] text-primary-600 hover:text-primary-700 font-medium"
                            >
                              Use Current GPS
                            </button>
                          )}
                        </div>
                        <Input
                          placeholder="e.g. Sector 5 Tech Hub, Room 402"
                          value={offsiteLocation}
                          onChange={(e) => setOffsiteLocation(e.target.value)}
                          className="text-xs h-8 bg-white mt-0.5"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* GPS Status Indicator */}
                <div className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg text-xs">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="text-slate-600 font-medium">
                      {isLocating
                        ? "Acquiring GPS coordinates..."
                        : locationStatus === "denied"
                        ? "GPS denied (Clock-in permitted without geo)"
                        : currentLocation
                        ? currentLocation.locationName
                        : "GPS location will be prompted upon clock in"}
                    </span>
                  </div>
                  {!currentLocation && !isLocating && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void acquireLocation()}
                      className="text-[11px] h-7 px-2 text-primary-600 hover:text-primary-700"
                    >
                      Check Location
                    </Button>
                  )}
                </div>

                <Input
                  placeholder="Optional notes..."
                  value={clockNotes}
                  onChange={(e) => setClockNotes(e.target.value)}
                  className="text-xs"
                />
                <Button
                  onClick={() => handleQuickClockIn("web")}
                  disabled={isClockingIn || isLocating}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                >
                  <LogIn className="h-4 w-4" />
                  {isClockingIn
                    ? "Verifying & Clocking In..."
                    : clockInMode === "offsite"
                    ? "Submit Offsite Attendance (2-Step Review)"
                    : "Clock In Now"}
                </Button>
              </div>
            )}

          </CardContent>
        </Card>

        {/* Station 2: Dedicated Biometric Fingerprint Terminal */}
        <Card className="border-indigo-200 bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white shadow-md relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />
          <CardHeader className="pb-2 border-b border-indigo-800/60 z-10">
            <CardTitle className="text-base font-semibold text-white flex items-center justify-between">
              <span className="flex items-center gap-2 text-indigo-200">
                <Fingerprint className="h-5 w-5 text-indigo-400" />
                Biometric Fingerprint Station
              </span>
              <Badge
                variant="outline"
                className="text-[11px] bg-indigo-950/80 border-indigo-700 text-indigo-300"
              >
                {platformAuthLabel}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 pb-6 space-y-4 z-10 text-center flex flex-col items-center justify-center">
            {/* Visual Fingerprint Scanner Target */}
            <div className="relative my-2">
              <button
                type="button"
                onClick={handleFingerprintScan}
                disabled={isScanningFingerprint || (myTodayRecord !== null && Boolean(myTodayRecord.check_out_at))}
                className={`relative group h-24 w-24 rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none ${
                  fingerprintSuccess
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/50 scale-105"
                    : isScanningFingerprint
                    ? "bg-indigo-600 text-indigo-100 animate-pulse shadow-lg shadow-indigo-500/50 scale-105"
                    : "bg-indigo-950/80 hover:bg-indigo-800 text-indigo-300 hover:text-white border-2 border-indigo-600/80 hover:border-indigo-400 shadow-md hover:scale-105 cursor-pointer"
                }`}
                title="Scan biometric fingerprint"
                aria-label="Scan biometric fingerprint"
              >
                {/* Sonar Pulse Rings when scanning or idle */}
                {isScanningFingerprint && (
                  <span className="absolute -inset-2 rounded-full border border-indigo-400 animate-ping opacity-75" />
                )}
                {fingerprintSuccess ? (
                  <CheckCircle2 className="h-12 w-12 text-white animate-in zoom-in" />
                ) : (
                  <Fingerprint className={`h-12 w-12 transition-transform duration-300 ${isScanningFingerprint ? "rotate-12" : "group-hover:scale-110"}`} />
                )}
              </button>
            </div>

            {/* Scanner Status Message */}
            <div className="space-y-1 max-w-xs">
              <p className="text-sm font-semibold text-white">
                {fingerprintSuccess
                  ? "Fingerprint Verified!"
                  : isScanningFingerprint
                  ? (isMobileDevice ? "Touch your phone's fingerprint sensor..." : "Authenticating Biometrics & GPS...")
                  : myTodayRecord && !myTodayRecord.check_out_at
                  ? "Touch Sensor to Clock Out"
                  : myTodayRecord
                  ? "Shift Completed for Today"
                  : "Touch Sensor to Clock In"}
              </p>
              <p className="text-xs text-indigo-300/80 leading-relaxed">
                {myTodayRecord && myTodayRecord.check_out_at
                  ? "Your daily attendance has been authenticated and finalized."
                  : isMobileDevice
                  ? isSecureOrigin
                    ? "Uses your phone's built-in fingerprint reader or Face ID via WebAuthn."
                    : "Mobile biometrics require HTTPS or localhost. Hardware optical fallback is active."
                  : "Supports mobile fingerprint, Touch ID, Windows Hello, and optical scanners."}
              </p>
            </div>

            {/* Scan Action Button */}
            {(!myTodayRecord || !myTodayRecord.check_out_at) && (
              <Button
                type="button"
                onClick={handleFingerprintScan}
                disabled={isScanningFingerprint}
                className="w-full max-w-xs min-h-[44px] flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-md border border-indigo-400/40 text-xs py-2"
              >
                <Fingerprint className="h-4 w-4" />
                {isScanningFingerprint
                  ? (isMobileDevice ? "Reading Mobile Fingerprint..." : "Scanning Sensor...")
                  : myTodayRecord
                  ? "Scan Fingerprint to Clock Out"
                  : "Scan Fingerprint to Clock In"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            {/* Search */}
            <div className="lg:col-span-1">
              <Label className="text-xs text-slate-500 mb-1 block">Search Employee</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Name or code..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-8 text-xs h-9"
                />
              </div>
            </div>

            {/* Date */}
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Work Date</Label>
              <Input
                type="date"
                value={filterDate}
                onChange={(e) => {
                  setFilterDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="text-xs h-9"
              />
            </div>

            {/* Department */}
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Department</Label>
              <select
                value={filterDepartment}
                onChange={(e) => {
                  setFilterDepartment(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-800 shadow-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Branch */}
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Branch</Label>
              <select
                value={filterBranch}
                onChange={(e) => {
                  setFilterBranch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-800 shadow-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Status</Label>
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-800 shadow-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">All Statuses</option>
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="half_day">Half Day</option>
                <option value="absent">Absent</option>
                <option value="on_leave">On Leave</option>
              </select>
            </div>

            {/* Offsite Filter */}
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Location Type</Label>
              <select
                value={filterIsOffsite}
                onChange={(e) => {
                  setFilterIsOffsite(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-800 shadow-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">All Locations</option>
                <option value="office">Office Premises</option>
                <option value="offsite">Offsite Meetings</option>
              </select>
            </div>

            {/* Approval Status Filter */}
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Approval Status</Label>
              <select
                value={filterApprovalStatus}
                onChange={(e) => {
                  setFilterApprovalStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-800 shadow-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">All Approvals</option>
                <option value="pending_hr">Pending HR (Step 1)</option>
                <option value="pending_org_head">Pending Org Head (Step 2)</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            {/* Reset Filter Button */}
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setFilterDate(new Date().toISOString().split("T")[0] || "");
                  setFilterDepartment("");
                  setFilterBranch("");
                  setFilterStatus("");
                  setFilterVerification("");
                  setFilterIsOffsite("");
                  setFilterApprovalStatus("");
                  setCurrentPage(1);
                }}
                className="w-full h-9 text-xs"
              >
                Reset Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Records Table */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardContent className="p-0">
          {isLoadingList ? (
            <div className="py-16">
              <LoadingState message="Loading attendance records..." />
            </div>
          ) : listError ? (
            <div className="p-8">
              <ErrorState
                title="Failed to Load Attendance"
                message={listError}
                onRetry={fetchAttendanceList}
              />
            </div>
          ) : attendanceData.items.length === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={Clock}
                title="No Attendance Records Found"
                description="No attendance records match the selected date and filters."
                actionLabel={isPrivileged && canCreate ? "Mark Attendance" : undefined}
                onAction={isPrivileged && canCreate ? openMarkModal : undefined}
              />
            </div>
          ) : (
            <div>
              {/* Mobile Card List View (Visible on mobile screens < 768px) */}
              <div className="block md:hidden divide-y divide-slate-100">
                {attendanceData.items.map((rec) => (
                  <div key={`mobile-card-${rec.id}`} className="p-4 space-y-3 bg-white hover:bg-slate-50/50 transition-colors">
                    {/* Header: Employee Info + Status Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 shrink-0 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-xs ring-2 ring-white shadow-xs">
                          {rec.employee?.first_name?.[0] || "E"}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-semibold text-slate-900 text-sm leading-tight truncate">
                            {rec.employee
                              ? `Employee: ${rec.employee.first_name} ${rec.employee.last_name}`
                              : "Unknown Employee"}
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            ID: {rec.employee?.employee_code || "—"} | {rec.employee?.designation || "—"}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {getStatusBadge(rec.status)}
                        {getApprovalStatusBadge(rec)}
                      </div>
                    </div>

                    {/* Offsite Meeting Context (if offsite) */}
                    {rec.is_offsite && (
                      <div className="p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-lg text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-amber-900 flex items-center gap-1 text-[11px]">
                            <Briefcase className="h-3 w-3 text-amber-700" />
                            {rec.client_name ? `Client: ${rec.client_name}` : "External Client Meeting"}
                          </span>
                        </div>
                        {rec.offsite_reason && (
                          <p className="text-[11px] text-amber-800">
                            <span className="font-medium text-amber-900">Purpose:</span> {rec.offsite_reason}
                          </p>
                        )}
                        {rec.offsite_location && (
                          <p className="text-[11px] text-amber-800 flex items-center gap-1">
                            <MapPin className="h-2.5 w-2.5 text-amber-700 shrink-0" /> {rec.offsite_location}
                          </p>
                        )}
                        {rec.approval_status === "pending_org_head" && rec.hr_rejection_reason && (
                          <div className="mt-1 p-2 bg-orange-100 border border-orange-200 rounded text-[11px] text-orange-950 space-y-0.5">
                            <span className="font-semibold text-orange-900 block">HR Reviewer Feedback (Escalated):</span>
                            <p className="italic">{rec.hr_rejection_reason}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Clock In / Out / Duration Summary Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                      <div className="bg-slate-50/90 p-2.5 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-400 block font-semibold uppercase tracking-wider">Clock In</span>
                        <span className="font-mono font-semibold text-slate-800 text-xs mt-0.5 block">
                          {formatTime(rec.check_in_at)}
                        </span>
                      </div>
                      <div className="bg-slate-50/90 p-2.5 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-400 block font-semibold uppercase tracking-wider">Clock Out</span>
                        {rec.check_out_at ? (
                          <span className="font-mono font-semibold text-slate-800 text-xs mt-0.5 block">
                            {formatTime(rec.check_out_at)}
                          </span>
                        ) : rec.check_in_at ? (
                          (isPrivileged || rec.employee_id === myTodayRecord?.employee_id) && canUpdate ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setQuickClockOutRecord(rec);
                                setIsQuickClockOutOpen(true);
                              }}
                              className="mt-0.5 h-6 px-2 text-[11px] text-rose-600 border-rose-200 hover:bg-rose-50 font-medium flex items-center gap-1 shadow-xs"
                            >
                              <LogOut className="h-3 w-3" />
                              <span>Clock Out</span>
                            </Button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 mt-0.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                              In Progress
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400 text-xs mt-0.5 block">—</span>
                        )}
                      </div>
                    </div>

                    {/* Meta Row: Date, Duration & Verification Pill */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1 text-slate-600">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-700">{formatDate(rec.work_date)}</span>
                        <span>•</span>
                        <span className="font-mono text-primary-700 font-semibold">{calculateDuration(rec.check_in_at, rec.check_out_at)}</span>
                      </div>
                      <div>
                        {rec.verification_method === "fingerprint" || rec.verification_method === "biometric" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200">
                            <Fingerprint className="h-2.5 w-2.5" /> Fingerprint
                          </span>
                        ) : rec.latitude && rec.longitude ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            <Navigation className="h-2.5 w-2.5" /> GPS Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            <Clock className="h-2.5 w-2.5" /> Web Portal
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Department, Location & Mobile Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <div className="flex items-center gap-1 text-slate-500 text-[11px] truncate max-w-[160px]">
                        <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="truncate">{rec.branch?.name || rec.employee?.branch_name || "Headquarters"}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* 2-Step Approval Action Buttons for HR and Org Head */}
                        {rec.approval_status === "pending_hr" && canApproveAttendance && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setReviewingRecord(rec);
                              setHrRejectionReason("");
                              setIsHRReviewOpen(true);
                            }}
                            className="h-7 px-2 text-[11px] text-amber-800 border-amber-300 hover:bg-amber-50 font-semibold flex items-center gap-1 shadow-xs"
                          >
                            <UserCheck className="h-3 w-3 text-amber-700" />
                            <span>HR Review</span>
                          </Button>
                        )}
                        {rec.approval_status === "pending_org_head" && isOrgHead && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setOrgHeadReviewRecord(rec);
                              setOrgHeadComment("");
                              setIsOrgHeadReviewOpen(true);
                            }}
                            className="h-7 px-2 text-[11px] text-orange-800 border-orange-300 hover:bg-orange-50 font-semibold flex items-center gap-1 shadow-xs"
                          >
                            <ShieldCheck className="h-3 w-3 text-orange-700" />
                            <span>Org Review</span>
                          </Button>
                        )}
                        {isPrivileged && canUpdate && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(rec)}
                            className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900 rounded-md hover:bg-slate-100 flex items-center gap-1"
                            aria-label={`Edit ${rec.employee?.first_name || "record"}`}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            <span>Edit</span>
                          </Button>
                        )}
                        {isPrivileged && canDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteModal(rec)}
                            className="h-7 px-2 text-rose-500 hover:text-rose-700 rounded-md hover:bg-rose-50 flex items-center gap-1"
                            aria-label={`Delete ${rec.employee?.first_name || "record"}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View (Visible on md screens and up) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm min-w-full">
                  <thead className="bg-slate-50/90 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3.5 whitespace-nowrap min-w-[200px]">Employee</th>
                      <th className="px-4 py-3.5 whitespace-nowrap min-w-[160px]">Department / Branch</th>
                      <th className="px-4 py-3.5 whitespace-nowrap min-w-[100px]">Date</th>
                      <th className="px-4 py-3.5 whitespace-nowrap min-w-[80px]">Clock In</th>
                      <th className="px-4 py-3.5 whitespace-nowrap min-w-[130px]">Clock Out</th>
                      <th className="px-4 py-3.5 whitespace-nowrap min-w-[75px]">Duration</th>
                      <th className="px-4 py-3.5 whitespace-nowrap min-w-[90px]">Status</th>
                      <th className="px-4 py-3.5 whitespace-nowrap min-w-[150px]">Location & Approval</th>
                      <th className="px-4 py-3.5 whitespace-nowrap min-w-[160px]">Verification & Details</th>
                      <th className="px-4 py-3.5 whitespace-nowrap min-w-[100px] text-right sticky right-0 bg-slate-50/95 backdrop-blur-xs z-10 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.06)]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attendanceData.items.map((rec) => (
                      <tr key={rec.id} className="group hover:bg-slate-50/70 transition-colors">
                        {/* Employee */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 shrink-0 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-xs ring-2 ring-white shadow-xs">
                              {rec.employee?.first_name?.[0] || "E"}
                            </div>
                            <div className="min-w-0">
                              <span className="font-semibold text-slate-900 block text-sm leading-tight whitespace-nowrap">
                                {rec.employee
                                  ? `${rec.employee.first_name} ${rec.employee.last_name}`
                                  : "Unknown Employee"}
                              </span>
                              <span className="text-xs text-slate-500 mt-0.5 block whitespace-nowrap">
                                {rec.employee?.employee_code || "—"} • {rec.employee?.designation || "—"}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Department / Branch */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600">
                          <div className="font-medium text-slate-800 whitespace-nowrap">
                            {rec.employee?.department_name || "—"}
                          </div>
                          <div className="text-slate-400 text-[11px] whitespace-nowrap flex items-center gap-1 mt-0.5">
                            <MapPin className="h-2.5 w-2.5 text-slate-400 shrink-0" />
                            <span>{rec.branch?.name || rec.employee?.branch_name || "Headquarters"}</span>
                          </div>
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs font-semibold text-slate-700">
                          {formatDate(rec.work_date)}
                        </td>

                        {/* Clock In */}
                        <td className="px-4 py-3.5 whitespace-nowrap font-mono text-xs text-slate-800 font-medium">
                          {formatTime(rec.check_in_at)}
                        </td>

                        {/* Clock Out */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                          {rec.check_out_at ? (
                            <span className="font-mono text-slate-800 font-medium whitespace-nowrap">
                              {formatTime(rec.check_out_at)}
                            </span>
                          ) : rec.check_in_at ? (
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              {(isPrivileged || rec.employee_id === myTodayRecord?.employee_id) && canUpdate ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setQuickClockOutRecord(rec);
                                    setIsQuickClockOutOpen(true);
                                  }}
                                  className="text-xs h-7 px-2.5 text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300 whitespace-nowrap font-medium flex items-center gap-1 shadow-xs"
                                  title="Clock out this employee"
                                >
                                  <LogOut className="h-3 w-3" />
                                  <span>Clock Out</span>
                                </Button>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/80 whitespace-nowrap">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                  In Progress
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 whitespace-nowrap">—</span>
                          )}
                        </td>

                        {/* Duration */}
                        <td className="px-4 py-3.5 whitespace-nowrap font-mono text-xs font-semibold text-slate-700">
                          {calculateDuration(rec.check_in_at, rec.check_out_at)}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5 whitespace-nowrap">{getStatusBadge(rec.status)}</td>

                        {/* Location & Approval */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                          <div className="flex flex-col gap-1 items-start whitespace-nowrap">
                            {getApprovalStatusBadge(rec)}
                            {rec.is_offsite && (
                              <div className="text-[11px] text-slate-600 max-w-[200px] truncate space-y-0.5">
                                {rec.client_name && (
                                  <span className="font-semibold text-slate-800 block truncate" title={rec.client_name}>
                                    Client: {rec.client_name}
                                  </span>
                                )}
                                {rec.offsite_reason && (
                                  <span className="text-slate-500 block truncate" title={rec.offsite_reason}>
                                    {rec.offsite_reason}
                                  </span>
                                )}
                                {rec.approval_status === "pending_org_head" && rec.hr_rejection_reason && (
                                  <span
                                    className="inline-block text-[10px] text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 truncate max-w-[180px]"
                                    title={`HR Rejection: ${rec.hr_rejection_reason}`}
                                  >
                                    HR: {rec.hr_rejection_reason}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Verification & Details */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                          <div className="flex flex-col gap-1 items-start whitespace-nowrap">
                            {rec.verification_method === "fingerprint" || rec.verification_method === "biometric" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 whitespace-nowrap">
                                <Fingerprint className="h-3 w-3" /> Fingerprint
                              </span>
                            ) : rec.latitude && rec.longitude ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                                <Navigation className="h-3 w-3" /> GPS Verified
                              </span>
                            ) : rec.verification_method === "manual" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                                <Edit2 className="h-3 w-3" /> Manual (HR)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                                <Clock className="h-3 w-3" /> Web Portal
                              </span>
                            )}

                            {rec.location_name ? (
                              <span className="text-[11px] text-slate-500 flex items-center gap-1 max-w-[200px] truncate whitespace-nowrap" title={rec.location_name}>
                                <MapPin className="h-2.5 w-2.5 text-slate-400 shrink-0" /> {rec.location_name}
                              </span>
                            ) : rec.latitude && rec.longitude ? (
                              <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                                {Number(rec.latitude).toFixed(3)}°, {Number(rec.longitude).toFixed(3)}°
                              </span>
                            ) : null}

                            {rec.notes ? (
                              <span className="text-[11px] text-slate-500 italic max-w-[200px] truncate whitespace-nowrap block" title={rec.notes}>
                                {rec.notes}
                              </span>
                            ) : null}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-right sticky right-0 bg-white group-hover:bg-slate-50/90 z-10 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.06)]">
                          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                            {rec.approval_status === "pending_hr" && canApproveAttendance && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setReviewingRecord(rec);
                                  setHrRejectionReason("");
                                  setIsHRReviewOpen(true);
                                }}
                                className="h-7 px-2 text-xs text-amber-800 border-amber-300 hover:bg-amber-50 font-semibold flex items-center gap-1 shadow-xs"
                                title="HR Review Offsite Attendance"
                              >
                                <UserCheck className="h-3.5 w-3.5 text-amber-700" />
                                <span>HR Review</span>
                              </Button>
                            )}
                            {rec.approval_status === "pending_org_head" && isOrgHead && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setOrgHeadReviewRecord(rec);
                                  setOrgHeadComment("");
                                  setIsOrgHeadReviewOpen(true);
                                }}
                                className="h-7 px-2 text-xs text-orange-800 border-orange-300 hover:bg-orange-50 font-semibold flex items-center gap-1 shadow-xs"
                                title="Org Head Final Review"
                              >
                                <ShieldCheck className="h-3.5 w-3.5 text-orange-700" />
                                <span>Org Review</span>
                              </Button>
                            )}
                            {isPrivileged && canUpdate && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditModal(rec)}
                                className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100"
                                title="Edit attendance"
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            )}
                            {isPrivileged && canDelete && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openDeleteModal(rec)}
                                className="h-8 w-8 p-0 text-rose-500 hover:text-rose-700 rounded-md hover:bg-rose-50"
                                title="Delete record"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {attendanceData.meta.total_pages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-200 bg-slate-50/50">
                  <div className="text-xs text-slate-500 text-center sm:text-left">
                    Showing {(currentPage - 1) * pageSize + 1} to{" "}
                    {Math.min(currentPage * pageSize, attendanceData.meta.total)} of{" "}
                    {attendanceData.meta.total} records
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="h-8 px-2.5 text-xs"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                    </Button>
                    <span className="text-xs text-slate-600 px-2 font-medium">
                      Page {currentPage} of {attendanceData.meta.total_pages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((p) =>
                          Math.min(attendanceData.meta.total_pages, p + 1)
                        )
                      }
                      disabled={currentPage >= attendanceData.meta.total_pages}
                      className="h-8 px-2.5 text-xs"
                    >
                      Next <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* MODAL 1: Mark Attendance (Privileged HR/Admin Only) */}
      <Modal
        isOpen={isMarkOpen}
        onClose={() => setIsMarkOpen(false)}
        title="Mark Attendance Record"
      >
        <form onSubmit={handleMarkSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-md">
              {formError}
            </div>
          )}

          <div>
            <Label className="text-xs font-semibold text-slate-700">
              Employee <span className="text-rose-500">*</span>
            </Label>
            <select
              value={formEmployeeId}
              onChange={(e) => setFormEmployeeId(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">Select Employee</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name} ({emp.employee_code}) - {emp.designation}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold text-slate-700">
                Work Date <span className="text-rose-500">*</span>
              </Label>
              <Input
                type="date"
                value={formWorkDate}
                onChange={(e) => setFormWorkDate(e.target.value)}
                required
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700">
                Status <span className="text-rose-500">*</span>
              </Label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as AttendanceStatus)}
                required
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="half_day">Half Day</option>
                <option value="absent">Absent</option>
                <option value="on_leave">On Leave</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Check In Time</Label>
              <Input
                type="datetime-local"
                value={formCheckInAt}
                onChange={(e) => setFormCheckInAt(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700">Check Out Time</Label>
              <Input
                type="datetime-local"
                value={formCheckOutAt}
                onChange={(e) => setFormCheckOutAt(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700">Branch (Optional)</Label>
            <select
              value={formBranchId}
              onChange={(e) => setFormBranchId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">Default Employee Branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700">Notes / Remarks</Label>
            <Input
              placeholder="e.g. Approved manual override by HR..."
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              className="mt-1 text-xs"
            />
          </div>

          {/* Offsite Client Meeting Section */}
          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={formIsOffsite}
                onChange={(e) => setFormIsOffsite(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-amber-600" />
                Client Meeting / Offsite Visit
              </span>
            </label>

            {formIsOffsite && (
              <div className="mt-3 p-3 bg-amber-50/70 border border-amber-200/90 rounded-md space-y-2.5">
                <div>
                  <Label className="text-[11px] font-medium text-slate-700">Client / Partner Name</Label>
                  <Input
                    placeholder="e.g. Acme Global"
                    value={formClientName}
                    onChange={(e) => setFormClientName(e.target.value)}
                    className="mt-0.5 text-xs bg-white"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-medium text-slate-700">Meeting Purpose / Reason</Label>
                  <Input
                    placeholder="e.g. Contract Signing, Site Inspection"
                    value={formOffsiteReason}
                    onChange={(e) => setFormOffsiteReason(e.target.value)}
                    className="mt-0.5 text-xs bg-white"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-medium text-slate-700">Meeting Location / Venue</Label>
                  <Input
                    placeholder="e.g. Client Office, City Center"
                    value={formOffsiteLocation}
                    onChange={(e) => setFormOffsiteLocation(e.target.value)}
                    className="mt-0.5 text-xs bg-white"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsMarkOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save Record"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Edit Attendance (Privileged HR/Admin Only) */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Attendance Record"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-md">
              {formError}
            </div>
          )}

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-700">
            <span className="font-semibold block">
              {editingRecord?.employee?.first_name} {editingRecord?.employee?.last_name}
            </span>
            <span className="text-slate-500">
              {editingRecord?.employee?.employee_code} • {editingRecord?.employee?.designation}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold text-slate-700">
                Work Date <span className="text-rose-500">*</span>
              </Label>
              <Input
                type="date"
                value={formWorkDate}
                onChange={(e) => setFormWorkDate(e.target.value)}
                required
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700">
                Status <span className="text-rose-500">*</span>
              </Label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as AttendanceStatus)}
                required
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="half_day">Half Day</option>
                <option value="absent">Absent</option>
                <option value="on_leave">On Leave</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Check In Time</Label>
              <Input
                type="datetime-local"
                value={formCheckInAt}
                onChange={(e) => setFormCheckInAt(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700">Check Out Time</Label>
              <Input
                type="datetime-local"
                value={formCheckOutAt}
                onChange={(e) => setFormCheckOutAt(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700">Branch (Optional)</Label>
            <select
              value={formBranchId}
              onChange={(e) => setFormBranchId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">None / Keep Existing</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700">Notes / Remarks</Label>
            <Input
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              className="mt-1 text-xs"
            />
          </div>

          {/* Offsite Client Meeting Section in Edit */}
          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={formIsOffsite}
                onChange={(e) => setFormIsOffsite(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-amber-600" />
                Client Meeting / Offsite Visit
              </span>
            </label>

            {formIsOffsite && (
              <div className="mt-3 p-3 bg-amber-50/70 border border-amber-200/90 rounded-md space-y-2.5">
                <div>
                  <Label className="text-[11px] font-medium text-slate-700">Client / Partner Name</Label>
                  <Input
                    placeholder="e.g. Acme Global"
                    value={formClientName}
                    onChange={(e) => setFormClientName(e.target.value)}
                    className="mt-0.5 text-xs bg-white"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-medium text-slate-700">Meeting Purpose / Reason</Label>
                  <Input
                    placeholder="e.g. Contract Signing, Site Inspection"
                    value={formOffsiteReason}
                    onChange={(e) => setFormOffsiteReason(e.target.value)}
                    className="mt-0.5 text-xs bg-white"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-medium text-slate-700">Meeting Location / Venue</Label>
                  <Input
                    placeholder="e.g. Client Office, City Center"
                    value={formOffsiteLocation}
                    onChange={(e) => setFormOffsiteLocation(e.target.value)}
                    className="mt-0.5 text-xs bg-white"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Updating..." : "Update Record"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: Delete Attendance (Privileged HR/Admin Only) */}
      <Modal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        title="Delete Attendance Record"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Are you sure you want to permanently delete this attendance record for{" "}
            <span className="font-semibold text-slate-800">
              {deletingRecord?.employee?.first_name} {deletingRecord?.employee?.last_name}
            </span>{" "}
            on <span className="font-semibold text-slate-800">{deletingRecord?.work_date}</span>?
          </p>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-xs">
            This action cannot be undone and will be logged in organization audit logs.
          </div>
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDeleteConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Deleting..." : "Delete Record"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 4: Quick Clock Out Confirm */}
      <Modal
        isOpen={isQuickClockOutOpen}
        onClose={() => setIsQuickClockOutOpen(false)}
        title="Confirm Clock Out"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Confirm clock out for{" "}
            <span className="font-semibold text-slate-800">
              {quickClockOutRecord?.employee?.first_name} {quickClockOutRecord?.employee?.last_name}
            </span>
            ? Your current time and GPS location coordinates will be recorded.
          </p>
          <Input
            placeholder="Optional check-out notes..."
            value={clockNotes}
            onChange={(e) => setClockNotes(e.target.value)}
            className="text-xs"
          />
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsQuickClockOutOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => handleQuickClockOut(quickClockOutRecord?.id)}
              disabled={isClockingOut}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isClockingOut ? "Recording..." : "Confirm Clock Out"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 5: HR Review Modal */}
      <Modal
        isOpen={isHRReviewOpen}
        onClose={() => {
          setIsHRReviewOpen(false);
          setReviewingRecord(null);
          setHrRejectionReason("");
        }}
        title="HR Review: Offsite Client Meeting"
      >
        <div className="space-y-4">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900 text-sm">
                {reviewingRecord?.employee?.first_name} {reviewingRecord?.employee?.last_name}
              </span>
              <span className="text-slate-500 font-mono text-[11px]">
                {reviewingRecord?.employee?.employee_code || "—"}
              </span>
            </div>
            <div className="text-slate-600 text-xs">
              <span className="font-medium">Date:</span> {formatDate(reviewingRecord?.work_date)} •{" "}
              <span className="font-medium">Time:</span> {formatTime(reviewingRecord?.check_in_at)} - {formatTime(reviewingRecord?.check_out_at)}
            </div>
            {reviewingRecord?.client_name && (
              <div className="text-slate-700">
                <span className="font-semibold text-slate-900">Client / Partner:</span> {reviewingRecord.client_name}
              </div>
            )}
            {reviewingRecord?.offsite_reason && (
              <div className="text-slate-700">
                <span className="font-semibold text-slate-900">Meeting Purpose:</span> {reviewingRecord.offsite_reason}
              </div>
            )}
            {reviewingRecord?.offsite_location && (
              <div className="text-slate-700 flex items-center gap-1">
                <MapPin className="h-3 w-3 text-primary-600 shrink-0" />
                <span>{reviewingRecord.offsite_location}</span>
              </div>
            )}
            {reviewingRecord?.latitude && reviewingRecord?.longitude && (
              <div className="text-[11px] text-slate-500 font-mono">
                GPS: {Number(reviewingRecord.latitude).toFixed(4)}°, {Number(reviewingRecord.longitude).toFixed(4)}°
              </div>
            )}
          </div>

          <div className="p-3 bg-amber-50/80 border border-amber-200 text-amber-900 rounded-md text-xs space-y-1">
            <span className="font-semibold flex items-center gap-1 text-amber-950">
              <AlertCircle className="h-3.5 w-3.5 text-amber-700" /> 2-Step Approval Policy
            </span>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              <strong>Approve:</strong> Confirms offsite attendance immediately without further review.
              <br />
              <strong>Reject:</strong> Requires a rejection reason and escalates this record to the Organization Head for final review.
            </p>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700">
              Rejection Reason (Required if Rejecting)
            </Label>
            <textarea
              placeholder="e.g. No client meeting was scheduled in official calendar, or location mismatch..."
              value={hrRejectionReason}
              onChange={(e) => setHrRejectionReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsHRReviewOpen(false);
                setReviewingRecord(null);
                setHrRejectionReason("");
              }}
              disabled={isSubmittingHRReview}
            >
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => handleHRReview("reject")}
                disabled={isSubmittingHRReview || !hrRejectionReason.trim()}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {isSubmittingHRReview ? "Submitting..." : "Reject & Escalate"}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => handleHRReview("approve")}
                disabled={isSubmittingHRReview}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isSubmittingHRReview ? "Approving..." : "Approve Attendance"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* MODAL 6: Organization Head Final Review Modal */}
      <Modal
        isOpen={isOrgHeadReviewOpen}
        onClose={() => {
          setIsOrgHeadReviewOpen(false);
          setOrgHeadReviewRecord(null);
          setOrgHeadComment("");
        }}
        title="Organization Head Final Review"
      >
        <div className="space-y-4">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900 text-sm">
                {orgHeadReviewRecord?.employee?.first_name} {orgHeadReviewRecord?.employee?.last_name}
              </span>
              <span className="text-slate-500 font-mono text-[11px]">
                {orgHeadReviewRecord?.employee?.employee_code || "—"}
              </span>
            </div>
            <div className="text-slate-600 text-xs">
              <span className="font-medium">Date:</span> {formatDate(orgHeadReviewRecord?.work_date)} •{" "}
              <span className="font-medium">Times:</span> {formatTime(orgHeadReviewRecord?.check_in_at)} - {formatTime(orgHeadReviewRecord?.check_out_at)}
            </div>
            {orgHeadReviewRecord?.client_name && (
              <div className="text-slate-700">
                <span className="font-semibold text-slate-900">Client / Partner:</span> {orgHeadReviewRecord.client_name}
              </div>
            )}
            {orgHeadReviewRecord?.offsite_reason && (
              <div className="text-slate-700">
                <span className="font-semibold text-slate-900">Meeting Purpose:</span> {orgHeadReviewRecord.offsite_reason}
              </div>
            )}
            {orgHeadReviewRecord?.offsite_location && (
              <div className="text-slate-700 flex items-center gap-1">
                <MapPin className="h-3 w-3 text-primary-600 shrink-0" />
                <span>{orgHeadReviewRecord.offsite_location}</span>
              </div>
            )}
          </div>

          {/* HR Rejection Feedback Callout */}
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs space-y-1 text-rose-950">
            <span className="font-bold flex items-center gap-1.5 text-rose-900">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-700" />
              HR Rejection Reason (Escalated to you for final determination):
            </span>
            <p className="italic text-rose-900 pl-5">
              &quot;{orgHeadReviewRecord?.hr_rejection_reason || "No specific reason logged"}&quot;
            </p>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700">
              Organization Head Final Comments (Optional)
            </Label>
            <textarea
              placeholder="e.g. Confirmed with client sponsor / Verified travel permit..."
              value={orgHeadComment}
              onChange={(e) => setOrgHeadComment(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsOrgHeadReviewOpen(false);
                setOrgHeadReviewRecord(null);
                setOrgHeadComment("");
              }}
              disabled={isSubmittingOrgHeadReview}
            >
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => handleOrgHeadReview("confirm_reject")}
                disabled={isSubmittingOrgHeadReview}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {isSubmittingOrgHeadReview ? "Processing..." : "Confirm Rejection"}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => handleOrgHeadReview("override_approve")}
                disabled={isSubmittingOrgHeadReview}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isSubmittingOrgHeadReview ? "Processing..." : "Override & Approve"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
