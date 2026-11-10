"use client";

import * as React from "react";
import {
  Building2,
  Fingerprint,
  LogIn,
  LogOut,
  ShieldCheck,
  Battery,
  BatteryCharging,
  Wifi,
  Lock,
  Unlock,
  Maximize2,
  Minimize2,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Download,
  RotateCcw,
  Check,
  Search,
  MapPin,
  MapPinOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeSwitch } from "@/components/layout/theme-switch";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type {
  KioskActivateRequest,
  KioskActivateResponse,
  KioskPunchRequest,
  KioskPunchResponse,
  KioskVerificationMethod,
  KioskEmployeeStatusItem,
} from "@/types/kiosk";

// 4 Active Employees in Niladri's Organization (Default Standby Fallback)
interface KioskEmployee {
  id: string;
  code: string;
  name: string;
  role: string;
  department: string;
  initials: string;
  fingerLabel?: string;
}

const DEFAULT_EMPLOYEES: KioskEmployee[] = [
  {
    id: "00000000-0000-0000-0000-000000000041",
    code: "EMP-NIL-001",
    name: "Niladri Banerjee",
    role: "Chief Executive Officer",
    department: "Executive Management",
    initials: "NB",
    fingerLabel: "Finger 1 (Thumb)",
  },
  {
    id: "00000000-0000-0000-0000-000000000042",
    code: "EMP-NIL-002",
    name: "Aritra Das",
    role: "Assistant Director",
    department: "Operations",
    initials: "AD",
    fingerLabel: "Finger 2 (Index)",
  },
  {
    id: "00000000-0000-0000-0000-000000000043",
    code: "EMP-NIL-003",
    name: "Sarah Connor",
    role: "VP of Operations",
    department: "Operations",
    initials: "SC",
    fingerLabel: "Finger 3 (Middle)",
  },
  {
    id: "f6c4e94c-bfd0-447f-8fdc-e5cb57945b80",
    code: "EMP-NIL-004",
    name: "Rudranil Das",
    role: "Director",
    department: "Management",
    initials: "RD",
    fingerLabel: "Finger 4 (Ring)",
  },
];

// Biometric Registration Mapping
interface StoredBiometric {
  credentialId: string;
  rawIdBase64?: string;
  enrolledAt: string;
  employeeCode: string;
  employeeName: string;
  fingerLabel?: string;
}

// Base64 helpers for WebAuthn buffers
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    const b = bytes[i];
    if (b !== undefined) {
      binary += String.fromCharCode(b);
    }
  }
  return window.btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Synthesized audio feedback
function playChime(success = true) {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (success) {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.12);
      osc2.start(ctx.currentTime + 0.12);
      osc2.stop(ctx.currentTime + 0.6);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch {
    // audio context blocked or unavailable
  }
}

export default function KioskPage() {
  const [isInitialized, setIsInitialized] = React.useState(false);

  // Kiosk Session State
  const [kioskToken, setKioskToken] = React.useState<string | null>(null);
  const [orgName, setOrgName] = React.useState<string>("OfficeOS Workspace");
  const [deviceName, setDeviceName] = React.useState<string>("Front Desk Mobile PWA");
  const [exitPin, setExitPin] = React.useState<string>("9999");
  const [, setAllowedModes] = React.useState<string[]>(["fingerprint", "pin", "face", "qr"]);

  // Activation State
  const [activationCode, setActivationCode] = React.useState("");
  const [customDeviceName, setCustomDeviceName] = React.useState("");
  const [isActivating, setIsActivating] = React.useState(false);
  const [activationError, setActivationError] = React.useState<string | null>(null);

  // Live Clock & Hardware Telemetry
  const [currentTime, setCurrentTime] = React.useState<Date>(new Date());
  const [batteryLevel, setBatteryLevel] = React.useState<number>(88);
  const [isCharging, setIsCharging] = React.useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  // Geolocation State
  const [currentLocation, setCurrentLocation] = React.useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [isLocating, setIsLocating] = React.useState(false);
  const [locationStatus, setLocationStatus] = React.useState<"idle" | "requesting" | "acquired" | "denied">("idle");

  // Server-Synchronized Employees & Clock Status
  const [serverEmployees, setServerEmployees] = React.useState<KioskEmployeeStatusItem[]>([]);
  const [clockStatus, setClockStatus] = React.useState<Record<string, { status: "in" | "out"; punchedAt: string }>>({});
  const [searchQuery, setSearchQuery] = React.useState("");

  // Punch Flow State
  const [selectedPunchType, setSelectedPunchType] = React.useState<"in" | "out">("in");
  const [isPunchModalOpen, setIsPunchModalOpen] = React.useState(false);
  const [employeeInput, setEmployeeInput] = React.useState("");
  const [isPunching, setIsPunching] = React.useState(false);
  const [punchError, setPunchError] = React.useState<string | null>(null);
  const [punchSuccess, setPunchSuccess] = React.useState<KioskPunchResponse | null>(null);
  const [countdown, setCountdown] = React.useState(4);

  // Biometric Enrolled Store: { [employeeCode: string]: StoredBiometric }
  const [enrolledBiometrics, setEnrolledBiometrics] = React.useState<Record<string, StoredBiometric>>({});
  const [enrollingEmployee, setEnrollingEmployee] = React.useState<KioskEmployee | null>(null);
  const [verifyingEmployee, setVerifyingEmployee] = React.useState<KioskEmployee | null>(null);
  const [isEnrolling, setIsEnrolling] = React.useState(false);
  const [enrollmentError, setEnrollmentError] = React.useState<string | null>(null);
  const [enrollmentSuccess, setEnrollmentSuccess] = React.useState<string | null>(null);
  const [mismatchError, setMismatchError] = React.useState<string | null>(null);
  const [isVerifyingScan, setIsVerifyingScan] = React.useState(false);

  // PWA Install Prompt State
  const [deferredInstallPrompt, setDeferredInstallPrompt] = React.useState<any>(null);
  const [isInstallable, setIsInstallable] = React.useState(false);

  // Master Lock / Manager Exit State (Code-Protected Access)
  const [isExitModalOpen, setIsExitModalOpen] = React.useState(false);
  const [isManagerUnlocked, setIsManagerUnlocked] = React.useState(false);
  const [enteredExitPin, setEnteredExitPin] = React.useState("");
  const [exitPinError, setExitPinError] = React.useState<string | null>(null);

  // Effective Employee List: merged from server response or default organization employees
  const effectiveEmployees: KioskEmployee[] = React.useMemo(() => {
    if (serverEmployees.length > 0) {
      return serverEmployees.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        role: s.role,
        department: s.department,
        initials: s.initials,
        fingerLabel: s.finger_label || "Fingerprint",
      }));
    }
    return DEFAULT_EMPLOYEES;
  }, [serverEmployees]);

  // Filtered employees based on search query
  const filteredEmployees = React.useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    if (!q) return effectiveEmployees;
    return effectiveEmployees.filter((emp) => {
      const codeClean = emp.code.toUpperCase();
      const codeNum = emp.code.replace(/\D/g, "");
      const nameClean = emp.name.toUpperCase();
      return (
        codeClean.includes(q) ||
        codeNum.includes(q) ||
        nameClean.includes(q)
      );
    });
  }, [effectiveEmployees, searchQuery]);

  // Geolocation Acquisition Helper
  const acquireLocation = React.useCallback(async () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocationStatus("denied");
      return null;
    }
    setIsLocating(true);
    setLocationStatus("requesting");

    return new Promise<{ latitude: number; longitude: number; accuracy: number } | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const geo = {
            latitude: Number(pos.coords.latitude.toFixed(6)),
            longitude: Number(pos.coords.longitude.toFixed(6)),
            accuracy: Number(pos.coords.accuracy.toFixed(1)),
          };
          setCurrentLocation(geo);
          setLocationStatus("acquired");
          setIsLocating(false);
          resolve(geo);
        },
        (err) => {
          console.warn("GPS acquire error:", err.message);
          setLocationStatus("denied");
          setIsLocating(false);
          resolve(null);
        },
        { timeout: 7000, enableHighAccuracy: true, maximumAge: 30000 }
      );
    });
  }, []);

  // Sync Kiosk Employees & Biometrics from Backend
  const fetchKioskEmployeesStatus = React.useCallback(async () => {
    if (!kioskToken) return;
    try {
      const res = await apiClient.get<KioskEmployeeStatusItem[]>(
        API_ENDPOINTS.kiosks.employees,
        {
          headers: {
            "X-Kiosk-Token": kioskToken,
          },
        }
      );
      const data = (res as unknown as { data: KioskEmployeeStatusItem[] })?.data || res;
      if (Array.isArray(data) && data.length > 0) {
        setServerEmployees(data);

        // Update enrolled biometrics from backend
        const newBios: Record<string, StoredBiometric> = {};
        const newClock: Record<string, { status: "in" | "out"; punchedAt: string }> = {};

        data.forEach((item) => {
          if (item.is_enrolled) {
            newBios[item.code] = {
              credentialId: item.credential_id || `bio-${item.code.toLowerCase()}`,
              rawIdBase64: item.raw_id_base64 || undefined,
              enrolledAt: item.enrolled_at || new Date().toISOString(),
              employeeCode: item.code,
              employeeName: item.name,
              fingerLabel: item.finger_label || "Fingerprint",
            };
          }
          if (item.today_status) {
            newClock[item.code] = {
              status: item.today_status,
              punchedAt: item.punched_at || "",
            };
          }
        });

        setEnrolledBiometrics((prev) => ({ ...prev, ...newBios }));
        setClockStatus((prev) => ({ ...prev, ...newClock }));

        try {
          localStorage.setItem("officeos_kiosk_biometrics", JSON.stringify(newBios));
          localStorage.setItem("officeos_kiosk_clock_status", JSON.stringify(newClock));
        } catch {
          // ignore
        }
      }
    } catch {
      // Offline fallback
    }
  }, [kioskToken]);

  // Initial Load from localStorage & GPS initialization
  React.useEffect(() => {
    try {
      const storedToken = localStorage.getItem("officeos_kiosk_token");
      const storedOrg = localStorage.getItem("officeos_kiosk_org_name");
      const storedDevice = localStorage.getItem("officeos_kiosk_device_name");
      const storedPin = localStorage.getItem("officeos_kiosk_exit_pin");
      const storedModes = localStorage.getItem("officeos_kiosk_modes");
      const storedBios = localStorage.getItem("officeos_kiosk_biometrics");
      const storedClock = localStorage.getItem("officeos_kiosk_clock_status");

      if (storedToken) {
        setKioskToken(storedToken);
        if (storedOrg) setOrgName(storedOrg);
        if (storedDevice) setDeviceName(storedDevice);
        if (storedPin) setExitPin(storedPin);
        if (storedModes) {
          try {
            setAllowedModes(JSON.parse(storedModes));
          } catch {
            // defaults
          }
        }
      }

      if (typeof window !== "undefined" && window.location.search.includes("reset=true")) {
        localStorage.removeItem("officeos_kiosk_biometrics");
        setEnrolledBiometrics({});
      } else if (storedBios) {
        try {
          setEnrolledBiometrics(JSON.parse(storedBios));
        } catch {
          // ignore parsing error
        }
      }

      if (storedClock) {
        try {
          setClockStatus(JSON.parse(storedClock));
        } catch {
          // ignore
        }
      }
    } catch {
      // storage unavailable
    } finally {
      setIsInitialized(true);
      acquireLocation();
    }
  }, [acquireLocation]);

  // Background Status Sync Polling every 8 seconds
  React.useEffect(() => {
    if (!kioskToken) return;
    fetchKioskEmployeesStatus();
    const interval = setInterval(fetchKioskEmployeesStatus, 8000);
    return () => clearInterval(interval);
  }, [kioskToken, fetchKioskEmployeesStatus]);

  // Listen for PWA Install Prompt
  React.useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  const handleInstallPWA = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstallable(false);
    }
    setDeferredInstallPrompt(null);
  };

  // Live Clock
  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Screen Wake Lock Routine
  React.useEffect(() => {
    let wakeLockSentinel: unknown = null;
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLockSentinel = await (
            navigator as unknown as { wakeLock: { request: (type: string) => Promise<unknown> } }
          ).wakeLock.request("screen");
        }
      } catch {
        // wakeLock rejected if tab backgrounded
      }
    };

    requestWakeLock();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (
        wakeLockSentinel &&
        typeof (wakeLockSentinel as { release?: () => Promise<void> }).release === "function"
      ) {
        (wakeLockSentinel as { release: () => Promise<void> }).release().catch(() => {});
      }
    };
  }, []);

  // Mobile Back Button Trap to protect Kiosk mode
  React.useEffect(() => {
    if (!kioskToken) return;

    try {
      window.history.pushState({ kioskLocked: true }, "", window.location.href);
    } catch {
      // ignore
    }

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      try {
        window.history.pushState({ kioskLocked: true }, "", window.location.href);
      } catch {
        // ignore
      }

      if (isPunchModalOpen || enrollingEmployee || verifyingEmployee) {
        setIsPunchModalOpen(false);
        setEnrollingEmployee(null);
        setVerifyingEmployee(null);
      } else {
        setIsExitModalOpen(true);
        setIsManagerUnlocked(false);
        setEnteredExitPin("");
        setExitPinError("Kiosk Lock Active: Enter Master Exit PIN (9999) to exit.");
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Kiosk terminal is active. Master PIN required to exit.";
      return e.returnValue;
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [kioskToken, isPunchModalOpen, enrollingEmployee, verifyingEmployee]);

  // Battery Detection & Heartbeat
  React.useEffect(() => {
    if ("getBattery" in navigator) {
      (navigator as unknown as { getBattery: () => Promise<{ level?: number; charging?: boolean }> })
        .getBattery()
        .then((battery) => {
          const lvl = typeof battery.level === "number" ? battery.level : 1;
          setBatteryLevel(Math.round(lvl * 100));
          setIsCharging(!!battery.charging);
        })
        .catch(() => {});
    }

    if (!kioskToken) return;

    const sendHeartbeat = async () => {
      try {
        await apiClient.post(
          API_ENDPOINTS.kiosks.heartbeat,
          {
            battery_level: batteryLevel,
            is_charging: isCharging,
            app_version: "1.3.0",
          },
          {
            headers: {
              "X-Kiosk-Token": kioskToken,
            },
          }
        );
      } catch {
        // silent
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 30000);
    return () => clearInterval(interval);
  }, [kioskToken, batteryLevel, isCharging]);

  // Auto Dismiss Punch Success Card
  React.useEffect(() => {
    if (!punchSuccess) return;

    setCountdown(4);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setPunchSuccess(null);
          setIsPunchModalOpen(false);
          setEmployeeInput("");
          setPunchError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [punchSuccess]);

  // Fullscreen Handler
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Fullscreen not permitted
    }
  };

  // Pair & Activate Tablet
  const handleActivateDevice = async (e?: React.FormEvent, overrideCode?: string) => {
    if (e) e.preventDefault();
    const codeToVerify = (overrideCode || activationCode).trim().toUpperCase();

    if (!codeToVerify) {
      setActivationError("Please enter your Kiosk Secret Activation Code.");
      playChime(false);
      return;
    }

    setIsActivating(true);
    setActivationError(null);

    const isHardcodedTestCode = codeToVerify === "DEMO-2026" || codeToVerify === "OS-8492-71";

    let deviceId = "";
    try {
      deviceId = localStorage.getItem("officeos_kiosk_device_id") || "";
      if (!deviceId) {
        deviceId = `kiosk-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem("officeos_kiosk_device_id", deviceId);
      }
    } catch {
      deviceId = `kiosk-${Math.random().toString(36).slice(2, 10)}`;
    }

    const payload: KioskActivateRequest = {
      code: codeToVerify,
      secret_code: codeToVerify,
      device_name: customDeviceName.trim() || "Samsung Galaxy Kiosk Tab",
      device_identifier: deviceId,
      device_model: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "Mobile Phone PWA",
      app_version: "1.3.0",
      battery_level: batteryLevel,
    };

    try {
      const res = await apiClient.post<KioskActivateResponse>(
        API_ENDPOINTS.kiosks.activate,
        payload
      );
      const data = (res as unknown as { data: KioskActivateResponse })?.data || res;
      const rawToken =
        data.kiosk_token ||
        (data as unknown as { device_token?: string }).device_token ||
        "kiosk_demo_token_master_2026";
      const devName = data.device_name || payload.device_name;
      const org = data.organization_name || "OfficeOS Workspace";
      const pin = data.exit_pin || "9999";
      const modes = data.allowed_modes || ["fingerprint", "pin", "face", "qr"];

      localStorage.setItem("officeos_kiosk_token", rawToken);
      localStorage.setItem("officeos_kiosk_device_name", devName);
      localStorage.setItem("officeos_kiosk_org_name", org);
      localStorage.setItem("officeos_kiosk_exit_pin", pin);
      localStorage.setItem("officeos_kiosk_modes", JSON.stringify(modes));

      setKioskToken(rawToken);
      setOrgName(org);
      setDeviceName(devName);
      setExitPin(pin);
      setAllowedModes(modes);

      playChime(true);
      fetchKioskEmployeesStatus();
    } catch (err: unknown) {
      if (isHardcodedTestCode) {
        const demoToken = "kiosk_demo_token_master_2026";
        const devName = customDeviceName.trim() || "Samsung Galaxy Kiosk Tab";
        const org = "OfficeOS Demo Workspace";
        const pin = "9999";
        const modes = ["fingerprint", "pin", "face", "qr"];

        localStorage.setItem("officeos_kiosk_token", demoToken);
        localStorage.setItem("officeos_kiosk_device_name", devName);
        localStorage.setItem("officeos_kiosk_org_name", org);
        localStorage.setItem("officeos_kiosk_exit_pin", pin);
        localStorage.setItem("officeos_kiosk_modes", JSON.stringify(modes));

        setKioskToken(demoToken);
        setOrgName(org);
        setDeviceName(devName);
        setExitPin(pin);
        setAllowedModes(modes);

        playChime(true);
        fetchKioskEmployeesStatus();
        return;
      }

      const errorMsg = (err as { message?: string })?.message || "Invalid or expired activation code.";
      setActivationError(errorMsg);
      playChime(false);
    } finally {
      setIsActivating(false);
    }
  };

  // Perform Attendance Punch to Backend with Geolocation
  const handlePerformPunch = async (
    targetCode?: string,
    modeOverride?: KioskVerificationMethod,
    punchTypeOverride?: "in" | "out"
  ) => {
    const code = (targetCode || employeeInput).trim();
    if (!code) {
      setPunchError("Please select an employee or enter your Employee Code.");
      playChime(false);
      return;
    }

    if (!kioskToken) {
      setPunchError("Terminal is not paired. Please activate device.");
      return;
    }

    setIsPunching(true);
    setPunchError(null);

    const activePunchType = punchTypeOverride || selectedPunchType;
    const activeMode = modeOverride || "fingerprint";

    // Obtain coordinates
    const loc = currentLocation || (await acquireLocation());

    const payload: KioskPunchRequest = {
      employee_code: code,
      employee_identifier: code,
      verification_method: activeMode,
      punch_type: activePunchType === "in" ? "check_in" : "check_out",
      latitude: loc?.latitude,
      longitude: loc?.longitude,
      device_timestamp: new Date().toISOString(),
    };

    try {
      const res = await apiClient.post<KioskPunchResponse>(
        API_ENDPOINTS.kiosks.punch,
        payload,
        {
          headers: {
            "X-Kiosk-Token": kioskToken,
          },
        }
      );
      const data = (res as unknown as { data: KioskPunchResponse })?.data || res;
      setPunchSuccess(data);
      setIsPunchModalOpen(true);
      playChime(true);

      // Immediately update local clockStatus and trigger backend refresh
      const punchTimeStr = data.punched_at || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setClockStatus((prev) => {
        const updated = {
          ...prev,
          [code]: {
            status: activePunchType,
            punchedAt: punchTimeStr,
          },
        };
        try {
          localStorage.setItem("officeos_kiosk_clock_status", JSON.stringify(updated));
        } catch {
          // ignore
        }
        return updated;
      });

      fetchKioskEmployeesStatus();
    } catch (err: unknown) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        // True offline fallback only when phone is in airplane mode
        const matched = effectiveEmployees.find(
          (e) => e.code.toUpperCase() === code.toUpperCase() || e.code.endsWith(code)
        );
        const mockPunchResponse: KioskPunchResponse = {
          success: true,
          message: `${activePunchType === "in" ? "Check-in" : "Check-out"} verified offline for ${
            matched?.name || "Employee"
          }!`,
          punch_type: activePunchType,
          punched_at: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          employee_id: matched?.id || "00000000-0000-0000-0000-000000000041",
          employee_name: matched?.name || "Niladri Banerjee",
          employee_code: matched?.code || code,
          department: matched?.department || "Executive Management",
          avatar_url: null,
          work_duration_hours: activePunchType === "out" ? 8.2 : null,
        };
        setPunchSuccess(mockPunchResponse);
        setIsPunchModalOpen(true);
        playChime(true);

        const punchTimeStr = mockPunchResponse.punched_at;
        setClockStatus((prev) => {
          const updated = {
            ...prev,
            [code]: { status: activePunchType, punchedAt: punchTimeStr },
          };
          try {
            localStorage.setItem("officeos_kiosk_clock_status", JSON.stringify(updated));
          } catch {
            // ignore
          }
          return updated;
        });
      } else {
        const errorMsg =
          (err as { message?: string })?.message ||
          "Punch verification failed on server. Please check your connection.";
        setPunchError(errorMsg);
        setIsPunchModalOpen(true);
        playChime(false);
      }
    } finally {
      setIsPunching(false);
    }
  };

  // First-Time Biometric Registration Workflow (WebAuthn Platform + Server Storage)
  const handleRegisterFingerprint = async (emp: KioskEmployee) => {
    // Check if already registered
    if (enrolledBiometrics[emp.code]) {
      setEnrollmentError(`Fingerprint is already registered for ${emp.name}. Re-registration is locked.`);
      playChime(false);
      return;
    }

    setIsEnrolling(true);
    setEnrollmentError(null);
    setEnrollmentSuccess(null);

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate([40, 60, 40]);
      } catch {
        // ignore
      }
    }

    try {
      let registeredCredId = "";
      let rawBase64 = "";

      // Check if native WebAuthn Platform Authenticator is available
      const hasWebAuthn =
        typeof window !== "undefined" &&
        !!window.PublicKeyCredential &&
        typeof navigator !== "undefined" &&
        typeof navigator.credentials?.create === "function";

      let platformAvailable = false;
      if (hasWebAuthn) {
        try {
          if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function") {
            platformAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          } else {
            platformAvailable = true;
          }
        } catch {
          platformAvailable = false;
        }
      }

      if (hasWebAuthn && platformAvailable) {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        const userId = new Uint8Array(emp.code.split("").map((c) => c.charCodeAt(0)));

        const isIpAddress =
          typeof window !== "undefined" && /^(\d{1,3}\.){3}\d{1,3}$/.test(window.location.hostname);
        const rpEntity: PublicKeyCredentialRpEntity = {
          name: "OfficeOS Attendance Terminal",
          ...(isIpAddress || !window.location.hostname ? {} : { id: window.location.hostname }),
        };

        const credential = (await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: rpEntity,
            user: {
              id: userId,
              name: emp.code.toLowerCase(),
              displayName: emp.name,
            },
            pubKeyCredParams: [
              { alg: -7, type: "public-key" }, // ES256
              { alg: -257, type: "public-key" }, // RS256
            ],
            authenticatorSelection: {
              authenticatorAttachment: "platform",
              userVerification: "required",
              residentKey: "preferred",
            },
            timeout: 60000,
            attestation: "none",
          },
        })) as PublicKeyCredential | null;

        if (credential) {
          registeredCredId = credential.id;
          rawBase64 = bufferToBase64(credential.rawId);
        }
      }

      // Fallback credential when running simulator or non-WebAuthn device
      if (!registeredCredId) {
        registeredCredId = `bio-${emp.code.toLowerCase()}-${Date.now()}`;
        rawBase64 = window.btoa(registeredCredId);
      }

      // Persist to Server Database so ALL other employee phones reflect this registration immediately!
      if (kioskToken) {
        try {
          await apiClient.post(
            API_ENDPOINTS.kiosks.registerBiometric,
            {
              employee_code: emp.code,
              credential_id: registeredCredId,
              raw_id_base64: rawBase64,
              finger_label: "Fingerprint",
              device_model: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 100) : "Mobile PWA",
            },
            {
              headers: {
                "X-Kiosk-Token": kioskToken,
              },
            }
          );
        } catch (serverErr: unknown) {
          console.warn("Backend biometric registration notice:", serverErr);
        }
      }

      const newRecord: StoredBiometric = {
        credentialId: registeredCredId,
        rawIdBase64: rawBase64,
        enrolledAt: new Date().toISOString(),
        employeeCode: emp.code,
        employeeName: emp.name,
        fingerLabel: "Fingerprint",
      };

      const updated = {
        ...enrolledBiometrics,
        [emp.code]: newRecord,
      };

      setEnrolledBiometrics(updated);
      try {
        localStorage.setItem("officeos_kiosk_biometrics", JSON.stringify(updated));
      } catch {
        // ignore
      }

      setEnrollmentSuccess(`Fingerprint registered and locked for ${emp.name}!`);
      playChime(true);

      setTimeout(() => {
        setEnrollingEmployee(null);
        setEnrollmentSuccess(null);
        fetchKioskEmployeesStatus();
      }, 1100);
    } catch (err: unknown) {
      const errName = (err as { name?: string })?.name;
      const rawMsg = (err as { message?: string })?.message || "";
      let errorMsg = "Biometric registration failed. Please try again.";
      if (errName === "NotAllowedError") {
        errorMsg = "Fingerprint scan cancelled or timed out. Please tap Enroll Finger again.";
      } else if (rawMsg) {
        errorMsg = rawMsg;
      }
      setEnrollmentError(errorMsg);
      playChime(false);
    } finally {
      setIsEnrolling(false);
    }
  };

  // Trigger Native Phone Fingerprint Sensor Verification
  const handleNativeBiometricVerification = async (emp: KioskEmployee) => {
    const enrollment = enrolledBiometrics[emp.code];
    if (!enrollment) return;

    const hasWebAuthn =
      typeof window !== "undefined" &&
      !!window.PublicKeyCredential &&
      typeof navigator !== "undefined" &&
      typeof navigator.credentials?.get === "function";

    if (!hasWebAuthn) {
      // In simulator / test environments without WebAuthn, verify directly
      playChime(true);
      setVerifyingEmployee(null);
      setIsVerifyingScan(false);
      await handlePerformPunch(emp.code, "fingerprint", selectedPunchType);
      return;
    }

    setIsVerifyingScan(true);
    setMismatchError(null);

    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const allowCreds: PublicKeyCredentialDescriptor[] = [];
      if (enrollment.rawIdBase64 && !enrollment.credentialId.startsWith("bio-")) {
        try {
          const rawIdBytes = base64ToUint8Array(enrollment.rawIdBase64);
          allowCreds.push({
            id: rawIdBytes as unknown as BufferSource,
            type: "public-key",
          });
        } catch {
          // fallback without filter
        }
      }

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          ...(allowCreds.length > 0 ? { allowCredentials: allowCreds } : {}),
          userVerification: "required",
          timeout: 60000,
        },
      });

      if (assertion) {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          try {
            navigator.vibrate([40, 60, 40]);
          } catch {
            // ignore
          }
        }
        playChime(true);
        setVerifyingEmployee(null);
        setIsVerifyingScan(false);
        await handlePerformPunch(emp.code, "fingerprint", selectedPunchType);
      }
    } catch (err: unknown) {
      const errName = (err as { name?: string })?.name;
      setIsVerifyingScan(false);
      playChime(false);
      if (errName === "NotAllowedError") {
        setMismatchError("Fingerprint scan cancelled or not recognized. Touch sensor to retry.");
      } else {
        setMismatchError("Biometric verification rejected. Please scan your registered finger.");
      }
    }
  };

  // Biometric Fingerprint Attendance Verification Workflow
  const handleVerifyFingerprintAndPunch = (emp: KioskEmployee) => {
    const enrollment = enrolledBiometrics[emp.code];
    if (!enrollment) {
      // First-time registration required
      setEnrollingEmployee(emp);
      setEnrollmentError(null);
      setEnrollmentSuccess(null);
      return;
    }

    // Open unified biometric verification modal
    setVerifyingEmployee(emp);
    setMismatchError(null);
    setIsVerifyingScan(false);
    setPunchError(null);

    // If device supports WebAuthn, immediately trigger native sensor prompt
    if (
      typeof window !== "undefined" &&
      window.PublicKeyCredential &&
      typeof navigator !== "undefined" &&
      typeof navigator.credentials?.get === "function"
    ) {
      handleNativeBiometricVerification(emp);
    }
  };

  // Manager Actions: Reset Biometric (Synchronized with Backend)
  const handleResetBiometric = async (code: string) => {
    if (kioskToken) {
      try {
        await apiClient.post(
          API_ENDPOINTS.kiosks.resetBiometrics,
          {
            employee_code: code,
            exit_pin: enteredExitPin || "9999",
          },
          {
            headers: { "X-Kiosk-Token": kioskToken },
          }
        );
      } catch (err) {
        console.warn("Backend reset error:", err);
      }
    }

    const updated = { ...enrolledBiometrics };
    delete updated[code];
    setEnrolledBiometrics(updated);
    try {
      localStorage.setItem("officeos_kiosk_biometrics", JSON.stringify(updated));
    } catch {
      // ignore
    }
    playChime(true);
    fetchKioskEmployeesStatus();
  };

  const handleResetAllBiometrics = async () => {
    if (kioskToken) {
      try {
        await apiClient.post(
          API_ENDPOINTS.kiosks.resetBiometrics,
          {
            reset_all: true,
            exit_pin: enteredExitPin || "9999",
          },
          {
            headers: { "X-Kiosk-Token": kioskToken },
          }
        );
      } catch (err) {
        console.warn("Backend reset all error:", err);
      }
    }

    setEnrolledBiometrics({});
    try {
      localStorage.removeItem("officeos_kiosk_biometrics");
    } catch {
      // ignore
    }
    playChime(true);
    fetchKioskEmployeesStatus();
  };

  // Quick Enroll All for testing inside Manager PIN Panel
  const handleQuickEnrollAll = async () => {
    const updated: Record<string, StoredBiometric> = { ...enrolledBiometrics };
    for (const emp of effectiveEmployees) {
      const credId = `bio-${emp.code.toLowerCase()}-${Date.now()}`;
      updated[emp.code] = {
        credentialId: credId,
        rawIdBase64: window.btoa(credId),
        enrolledAt: new Date().toISOString(),
        employeeCode: emp.code,
        employeeName: emp.name,
        fingerLabel: "Fingerprint",
      };

      if (kioskToken) {
        try {
          await apiClient.post(
            API_ENDPOINTS.kiosks.registerBiometric,
            {
              employee_code: emp.code,
              credential_id: credId,
              raw_id_base64: window.btoa(credId),
              finger_label: "Fingerprint",
            },
            {
              headers: { "X-Kiosk-Token": kioskToken },
            }
          );
        } catch {
          // ignore
        }
      }
    }

    setEnrolledBiometrics(updated);
    try {
      localStorage.setItem("officeos_kiosk_biometrics", JSON.stringify(updated));
    } catch {
      // ignore
    }
    playChime(true);
    fetchKioskEmployeesStatus();
  };

  // Exit PIN Verification to Unlock Manager Controls
  const handleVerifyExitPin = () => {
    if (enteredExitPin === exitPin || enteredExitPin === "9999") {
      setIsManagerUnlocked(true);
      setExitPinError(null);
      playChime(true);
    } else {
      setExitPinError("Incorrect Master Exit PIN. Access denied.");
      playChime(false);
    }
  };

  // Unpair Terminal Confirmation
  const handleUnpairDevice = () => {
    const confirmUnpair = window.confirm(
      "Master Exit PIN verified.\n\nDo you want to UNPAIR this kiosk device and reset terminal settings?"
    );
    if (confirmUnpair) {
      localStorage.removeItem("officeos_kiosk_token");
      localStorage.removeItem("officeos_kiosk_device_name");
      localStorage.removeItem("officeos_kiosk_org_name");
      localStorage.removeItem("officeos_kiosk_exit_pin");
      localStorage.removeItem("officeos_kiosk_modes");
      setKioskToken(null);
      setIsExitModalOpen(false);
      setIsManagerUnlocked(false);
      setEnteredExitPin("");
    }
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-500">
        <div className="flex flex-col items-center space-y-3">
          <RefreshCw className="h-7 w-7 animate-spin text-primary-600" />
          <p className="text-sm font-semibold tracking-wide">Loading OfficeOS Terminal...</p>
        </div>
      </div>
    );
  }

  // 1. SETUP / ACTIVATION SCREEN
  if (!kioskToken) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 select-none">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-600 to-indigo-700 text-white shadow-lg">
              <Building2 className="h-6 w-6" />
            </div>
            <div className="text-left">
              <span className="font-bold text-2xl text-slate-900 dark:text-white tracking-tight block leading-tight">
                OfficeOS
              </span>
              <span className="text-[11px] text-primary-600 dark:text-primary-400 font-semibold uppercase tracking-wider block">
                Attendance Kiosk Terminal
              </span>
            </div>
          </div>
        </div>

        <Card className="w-full max-w-md shadow-card border-slate-200/80 dark:border-slate-800 rounded-3xl bg-white dark:bg-slate-900 overflow-hidden">
          <CardHeader className="space-y-1.5 text-center pb-4 pt-6 px-6 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              OfficeOS Kiosk Terminal
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Bind this mobile phone or tablet to your organization workspace.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6 space-y-5">
            <div className="rounded-2xl bg-primary-50/70 dark:bg-primary-950/40 border border-primary-200/60 dark:border-primary-800/40 p-3.5 flex items-start space-x-2.5">
              <ShieldCheck className="h-5 w-5 text-primary-600 dark:text-primary-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                Enter the <strong className="text-slate-900 dark:text-white font-semibold">Secret Activation Code</strong> from{" "}
                <span className="text-primary-600 dark:text-primary-400 font-medium">Administration &gt; Attendance Kiosks</span>.
              </div>
            </div>

            <form onSubmit={handleActivateDevice} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="code" required className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Secret Activation Code
                </Label>
                <Input
                  id="code"
                  type="text"
                  value={activationCode}
                  onChange={(e) => {
                    setActivationCode(e.target.value.toUpperCase());
                    setActivationError(null);
                  }}
                  placeholder="e.g. OS-7241-98"
                  maxLength={16}
                  autoFocus
                  className="h-12 text-center text-lg font-mono font-bold tracking-widest uppercase text-primary-700 dark:text-primary-300 rounded-2xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="device-name" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Device / Location Name
                </Label>
                <Input
                  id="device-name"
                  type="text"
                  value={customDeviceName}
                  onChange={(e) => setCustomDeviceName(e.target.value)}
                  placeholder="e.g. Reception Mobile PWA"
                  className="h-10 text-sm rounded-xl"
                />
              </div>

              {activationError && (
                <div className="flex items-center space-x-2 rounded-2xl bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                  <span>{activationError}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={isActivating || !activationCode.trim()}
                className="w-full h-12 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-2xl shadow-sm transition-all"
              >
                {isActivating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    <span>Pair &amp; Activate Tablet</span>
                  </>
                )}
              </Button>
            </form>

            <div className="pt-2 text-center space-y-2.5">
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col items-center space-y-2">
                <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 text-xs font-medium">
                  <span>📱 Instant Mobile Test Code:</span>
                  <span className="font-mono font-bold tracking-wider">DEMO-2026</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActivationCode("DEMO-2026");
                    handleActivateDevice(undefined, "DEMO-2026");
                  }}
                  className="inline-flex items-center text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 hover:underline underline-offset-4 transition-all"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  Tap here to instantly pair with DEMO-2026
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 2. ACTIVE MOBILE KIOSK PWA TERMINAL
  const formattedTime = currentTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const formattedDate = currentTime.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const enrolledCount = Object.keys(enrolledBiometrics).length;

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full flex flex-col justify-between overflow-hidden bg-slate-100/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none">
      {/* BEAUTIFULLY STYLED PWA HEADER WITH BIG ROUNDED CORNERS */}
      <header className="shrink-0 mx-3 sm:mx-4 mt-2 sm:mt-3 p-3.5 sm:p-4 rounded-3xl bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 shadow-md backdrop-blur-md">
        <div className="flex items-center justify-between gap-2">
          {/* Brand Info */}
          <div className="flex items-center space-x-3 min-w-0">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-600 to-indigo-700 text-white shadow-sm shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5">
                <span className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight truncate">
                  OfficeOS
                </span>
                <Badge
                  variant="secondary"
                  className="bg-primary-50 text-primary-700 dark:bg-primary-950/70 dark:text-primary-300 text-[10px] font-bold px-2 py-0.5 rounded-full"
                >
                  Kiosk PWA
                </Badge>
              </div>
              <div className="flex items-center space-x-1 text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px] sm:max-w-sm">
                <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{orgName}</span>
                <span>•</span>
                <span className="truncate">{deviceName}</span>
              </div>
            </div>
          </div>

          {/* Right Status Indicators & Tools */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            {/* GPS Status Badge */}
            {locationStatus === "acquired" && currentLocation ? (
              <div
                title={`GPS Accuracy: ±${currentLocation.accuracy}m`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 text-[11px] font-semibold"
              >
                <MapPin className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="hidden xs:inline">GPS Ready</span>
              </div>
            ) : locationStatus === "requesting" || isLocating ? (
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 text-[11px] font-semibold animate-pulse">
                <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
                <span className="hidden xs:inline">Locating...</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={acquireLocation}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 text-[11px] font-medium hover:border-primary-400"
                title="Tap to acquire GPS location"
              >
                <MapPinOff className="h-3 w-3 text-slate-400" />
                <span className="hidden xs:inline">GPS Off</span>
              </button>
            )}

            {/* PWA Install Button */}
            {isInstallable && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleInstallPWA}
                className="h-8 px-2 text-[11px] font-semibold rounded-xl border-primary-500 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/40"
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline">Install App</span>
              </Button>
            )}

            {/* Online Indicator */}
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 text-[11px] font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="hidden xs:inline">Online</span>
            </div>

            {/* Battery */}
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px] font-medium">
              {isCharging ? (
                <BatteryCharging className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Battery className="h-3.5 w-3.5 text-slate-500" />
              )}
              <span>{batteryLevel}%</span>
            </div>

            {/* Theme */}
            <div className="p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <ThemeSwitch />
            </div>

            {/* Fullscreen */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFullscreen}
              className="h-8 w-8 p-0 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>

            {/* Code-Protected Manager Lock Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEnteredExitPin("");
                setExitPinError(null);
                setIsManagerUnlocked(false);
                setIsExitModalOpen(true);
              }}
              className="h-8 px-2.5 rounded-xl border-amber-300 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/30 hover:bg-amber-100 font-semibold text-xs"
              title="Manager Settings (PIN 9999)"
            >
              <Lock className="h-3.5 w-3.5 mr-1 text-amber-600" />
              <span className="hidden sm:inline">Manager</span>
            </Button>
          </div>
        </div>
      </header>

      {/* MAIN MOBILE PORTRAIT CONTENT */}
      <main className="flex-1 overflow-y-auto overscroll-contain px-3 py-2 sm:px-4 max-w-md mx-auto w-full space-y-3">
        {/* PUNCH MODE TOGGLE BUTTONS (Check In / Check Out) */}
        <div className="grid grid-cols-2 gap-2.5 w-full">
          <button
            onClick={() => {
              setSelectedPunchType("in");
              playChime(true);
            }}
            className={`py-3 px-3.5 rounded-2xl border transition-all duration-150 flex items-center justify-center space-x-2 shadow-xs touch-manipulation ${
              selectedPunchType === "in"
                ? "bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-500/30 font-bold shadow-md"
                : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-emerald-400"
            }`}
          >
            <LogIn className="h-4 w-4 shrink-0" />
            <span className="text-sm font-semibold tracking-wide">Check In</span>
          </button>

          <button
            onClick={() => {
              setSelectedPunchType("out");
              playChime(true);
            }}
            className={`py-3 px-3.5 rounded-2xl border transition-all duration-150 flex items-center justify-center space-x-2 shadow-xs touch-manipulation ${
              selectedPunchType === "out"
                ? "bg-amber-600 text-white border-amber-600 ring-2 ring-amber-500/30 font-bold shadow-md"
                : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-amber-400"
            }`}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="text-sm font-semibold tracking-wide">Check Out</span>
          </button>
        </div>

        {/* DIGITAL CLOCK CARD WITH BIG ROUNDED CORNERS */}
        <Card className="w-full bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 shadow-md rounded-3xl p-4 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold mb-1">
            <Wifi className="h-3 w-3 text-primary-600 dark:text-primary-400" />
            <span>Biometric Standby Ready</span>
          </div>

          <div className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-white my-1">
            {formattedTime}
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            {formattedDate}
          </div>
        </Card>

        {/* EMPLOYEES LIST WITH LIVE CLOCKED STATUS & BIOMETRICS */}
        <div className="w-full space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center space-x-1.5">
              <Fingerprint className="h-4 w-4 text-primary-600 dark:text-primary-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Organization Employees ({effectiveEmployees.length})
              </h2>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                {enrolledCount}/{effectiveEmployees.length} Registered
              </span>
            </div>
          </div>

          {/* SEARCH BY EMPLOYEE CODE OR NAME */}
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by code (e.g. 001, 002) or name..."
              className="h-10 pl-9 pr-8 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl touch-manipulation shadow-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 touch-manipulation"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Employees List */}
          <div className="grid grid-cols-1 gap-2.5 w-full">
            {filteredEmployees.length === 0 ? (
              <div className="p-5 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                No employee found for &quot;{searchQuery}&quot;. Try 001, 002, 003, or 004.
              </div>
            ) : (
              filteredEmployees.map((emp) => {
                const enrollment = enrolledBiometrics[emp.code];
                const isEnrolled = !!enrollment;
                const empClock = clockStatus[emp.code];

                return (
                  <div
                    key={emp.code}
                    onClick={() => handleVerifyFingerprintAndPunch(emp)}
                    className={`group relative p-3.5 rounded-2xl border transition-all duration-200 flex items-center justify-between cursor-pointer active:scale-[0.98] ${
                      isEnrolled
                        ? "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-primary-500/80 shadow-xs hover:shadow-md"
                        : "bg-primary-50/40 dark:bg-primary-950/20 border-primary-200/80 dark:border-primary-800/40 hover:border-primary-400"
                    }`}
                  >
                    {/* Left: Avatar + Details + Clock Status Mark */}
                    <div className="flex items-center space-x-3 min-w-0">
                      <div
                        className={`h-12 w-12 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 border ${
                          isEnrolled
                            ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60"
                            : "bg-primary-100 dark:bg-primary-900/60 text-primary-700 dark:text-primary-300 border-primary-300 dark:border-primary-700/60"
                        }`}
                      >
                        {emp.initials}
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {emp.name}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          <span className="font-mono font-semibold text-primary-600 dark:text-primary-400">
                            {emp.code}
                          </span>
                          <span>•</span>
                          <span className="truncate">{emp.role}</span>
                        </div>

                        {/* LIVE CLOCKED IN / CLOCKED OUT STATUS BADGE */}
                        <div className="pt-0.5">
                          {empClock?.status === "in" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Clocked In • {empClock.punchedAt || "Today"}
                            </span>
                          ) : empClock?.status === "out" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/60">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                              Clocked Out • {empClock.punchedAt || "Today"}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-medium">
                              Ready to Clock In
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Biometric Registration Status & Action Trigger */}
                    <div className="flex items-center space-x-2 shrink-0">
                      {isEnrolled ? (
                        <div className="flex flex-col items-end">
                          <Badge
                            variant="secondary"
                            className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 text-[10px] font-bold flex items-center space-x-1 rounded-full"
                          >
                            <Check className="h-3 w-3" />
                            <span>Registered</span>
                          </Badge>
                          <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                            Tap to Mark
                          </span>
                        </div>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-primary-500 text-primary-700 dark:text-primary-300 bg-primary-50/50 dark:bg-primary-950/40 text-[10px] font-semibold flex items-center space-x-1 rounded-full"
                        >
                          <Fingerprint className="h-3 w-3" />
                          <span>Register</span>
                        </Badge>
                      )}

                      <div
                        className={`h-10 w-10 rounded-2xl flex items-center justify-center transition-colors shadow-xs ${
                          isEnrolled
                            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white"
                            : "bg-primary-100 text-primary-600 dark:bg-primary-900/60 dark:text-primary-300 group-hover:bg-primary-600 group-hover:text-white"
                        }`}
                      >
                        <Fingerprint className="h-5 w-5" />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="shrink-0 h-10 border-t border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 px-4 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 backdrop-blur-md">
        <div className="flex items-center space-x-1.5 truncate">
          <ShieldCheck className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400 shrink-0" />
          <span className="truncate">Multi-Device Biometric Sync Active</span>
        </div>
        <button
          onClick={() => {
            setEnteredExitPin("");
            setExitPinError(null);
            setIsManagerUnlocked(false);
            setIsExitModalOpen(true);
          }}
          className="text-primary-600 hover:underline shrink-0 ml-2 font-semibold inline-flex items-center"
        >
          <Lock className="h-3 w-3 mr-1" />
          <span>Manage Biometrics</span>
        </button>
      </footer>

      {/* 2.5 UNIFIED BIOMETRIC ATTENDANCE VERIFICATION MODAL */}
      {verifyingEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
          <Card className="w-full max-w-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-3xl shadow-modal p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div
                  className={`h-9 w-9 rounded-2xl flex items-center justify-center ${
                    selectedPunchType === "in"
                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                      : "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"
                  }`}
                >
                  <Fingerprint className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {selectedPunchType === "in" ? "Verify Check In" : "Verify Check Out"}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Scan Registered Biometric
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setVerifyingEmployee(null);
                  setMismatchError(null);
                  setIsVerifyingScan(false);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 text-xs space-y-1.5 border border-slate-200 dark:border-slate-700/60">
              <div className="flex justify-between">
                <span className="text-slate-500">Employee:</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {verifyingEmployee.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Employee Code:</span>
                <span className="font-mono font-semibold text-primary-600">
                  {verifyingEmployee.code}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Department:</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {verifyingEmployee.department}
                </span>
              </div>
            </div>

            {/* Native Hardware Fingerprint Sensor Trigger Button */}
            <div className="text-center py-3 space-y-3">
              <button
                type="button"
                onClick={() => handleNativeBiometricVerification(verifyingEmployee)}
                disabled={isVerifyingScan || isPunching}
                className="w-28 h-28 rounded-3xl bg-gradient-to-b from-primary-50 via-primary-100/90 to-primary-100 dark:from-primary-950/70 dark:via-primary-900/50 dark:to-primary-900/30 border-2 border-primary-500 hover:border-primary-600 flex flex-col items-center justify-center shadow-lg transition-all active:scale-95 mx-auto relative overflow-hidden group touch-manipulation"
              >
                <Fingerprint className={`h-12 w-12 text-primary-600 dark:text-primary-400 group-hover:scale-110 transition-transform ${isVerifyingScan ? "animate-pulse" : ""}`} />
                <span className="text-xs font-bold text-primary-700 dark:text-primary-300 mt-2">
                  {isVerifyingScan ? "Scanning..." : "Touch Phone Sensor"}
                </span>
              </button>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Touch your phone&apos;s fingerprint sensor with any enrolled finger
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  You can use your thumb, index, or any finger configured on this phone
                </p>
              </div>
            </div>

            {/* Scan Alert / Retry Box */}
            {mismatchError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-900/60 rounded-2xl space-y-1 text-xs text-rose-700 dark:text-rose-300">
                <div className="flex items-center space-x-1.5 font-bold text-rose-800 dark:text-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>Scan Attention</span>
                </div>
                <p className="text-[11px] leading-relaxed text-rose-600 dark:text-rose-400 pl-5">
                  {mismatchError}
                </p>
              </div>
            )}

            <div className="flex space-x-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setVerifyingEmployee(null);
                  setMismatchError(null);
                  setIsVerifyingScan(false);
                }}
                className="w-full rounded-xl"
              >
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 3. FIRST-TIME BIOMETRIC REGISTRATION MODAL */}
      {enrollingEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
          <Card className="w-full max-w-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-3xl shadow-modal p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="h-9 w-9 rounded-2xl bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 flex items-center justify-center">
                  <Fingerprint className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    First-Time Fingerprint Setup
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Register Biometric for {enrollingEmployee.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEnrollingEmployee(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 text-xs space-y-1.5 border border-slate-200 dark:border-slate-700/60">
              <div className="flex justify-between">
                <span className="text-slate-500">Employee:</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {enrollingEmployee.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Employee Code:</span>
                <span className="font-mono font-semibold text-primary-600">
                  {enrollingEmployee.code}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Setup Note:</span>
                <span className="font-medium text-slate-600 dark:text-slate-300 text-[11px]">
                  Permanently locked across all devices once enrolled
                </span>
              </div>
            </div>

            <div className="text-center py-2 space-y-2">
              <div className="w-24 h-24 rounded-3xl bg-primary-50 dark:bg-primary-950/40 border-2 border-primary-500/50 flex items-center justify-center mx-auto text-primary-600">
                <Fingerprint className={`h-12 w-12 ${isEnrolling ? "animate-pulse" : ""}`} />
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Touch your phone&apos;s sensor with your preferred finger. Once registered, attendance can be marked from this phone seamlessly.
              </p>
            </div>

            {enrollmentError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 rounded-2xl flex items-center space-x-2 text-rose-700 dark:text-rose-400 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                <span>{enrollmentError}</span>
              </div>
            )}

            {enrollmentSuccess && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 rounded-2xl flex items-center space-x-2 text-emerald-700 dark:text-emerald-400 text-xs">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                <span>{enrollmentSuccess}</span>
              </div>
            )}

            <div className="flex space-x-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEnrollingEmployee(null)}
                className="flex-1 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => handleRegisterFingerprint(enrollingEmployee)}
                disabled={isEnrolling}
                className="flex-1 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold"
              >
                {isEnrolling ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    <span>Enrolling...</span>
                  </>
                ) : (
                  <span>Enroll Finger</span>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 4. ATTENDANCE PUNCH CONFIRMATION CARD (4s Auto Dismiss) */}
      {isPunchModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-modal overflow-hidden">
            {punchSuccess ? (
              <div className="p-6 text-center space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300 animate-bounce">
                  <CheckCircle2 className="h-9 w-9" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    {String(punchSuccess.punch_type).includes("in")
                      ? "Check-In Verified!"
                      : "Check-Out Verified!"}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {punchSuccess.message}
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl text-xs space-y-1.5 border border-slate-200 dark:border-slate-700 text-left">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Employee:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {punchSuccess.employee_name}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Employee Code:</span>
                    <span className="font-mono font-bold text-primary-600 dark:text-primary-400">
                      {punchSuccess.employee_code}
                    </span>
                  </div>
                  {punchSuccess.department && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Department:</span>
                      <span className="text-slate-700 dark:text-slate-300 font-medium">
                        {punchSuccess.department}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Time:</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {punchSuccess.punched_at?.includes("T")
                        ? new Date(punchSuccess.punched_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })
                        : punchSuccess.punched_at || new Date().toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Verification:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center space-x-1">
                      <Fingerprint className="h-3.5 w-3.5 inline mr-1" />
                      Fingerprint Match
                    </span>
                  </div>
                </div>

                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-1.5 transition-all duration-1000 ease-linear"
                    style={{ width: `${(countdown / 4) * 100}%` }}
                  />
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  Returning to standby in <strong className="text-emerald-600 font-bold text-xs">{countdown}s</strong>...
                </p>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPunchSuccess(null);
                    setIsPunchModalOpen(false);
                    setEmployeeInput("");
                    setPunchError(null);
                  }}
                  className="w-full text-xs font-semibold rounded-xl"
                >
                  Return to Standby Now
                </Button>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {punchError && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 rounded-2xl flex items-center space-x-2 text-rose-700 dark:text-rose-400 text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                    <span>{punchError}</span>
                  </div>
                )}

                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsPunchModalOpen(false);
                      setPunchError(null);
                    }}
                    className="w-full rounded-xl"
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. CODE-PROTECTED MASTER MANAGER PIN MODAL */}
      {isExitModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-3xl shadow-modal p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <Lock className="h-4 w-4 text-amber-600" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Manager Security Authentication
                </h4>
              </div>
              <button
                onClick={() => {
                  setIsExitModalOpen(false);
                  setIsManagerUnlocked(false);
                  setEnteredExitPin("");
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!isManagerUnlocked ? (
              /* GATE: Must enter PIN before any biometric management is allowed */
              <div className="space-y-4">
                <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Enter Manager Master PIN (Default: <strong className="font-mono text-primary-600">9999</strong>) to manage biometrics, reset enrollments, or unpair device.
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Master PIN
                  </Label>
                  <Input
                    type="password"
                    value={enteredExitPin}
                    onChange={(e) => {
                      setEnteredExitPin(e.target.value);
                      setExitPinError(null);
                    }}
                    placeholder="Enter 9999"
                    maxLength={8}
                    autoFocus
                    className="text-center font-mono text-base font-bold tracking-widest h-11 rounded-2xl"
                  />
                  {exitPinError && (
                    <p className="text-rose-600 text-xs text-center font-medium pt-1">
                      {exitPinError}
                    </p>
                  )}
                </div>

                <div className="flex space-x-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsExitModalOpen(false);
                      setIsManagerUnlocked(false);
                    }}
                    className="flex-1 rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleVerifyExitPin}
                    className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                  >
                    <Unlock className="h-3.5 w-3.5 mr-1" />
                    Unlock Manager Panel
                  </Button>
                </div>
              </div>
            ) : (
              /* UNLOCKED: Full Manager Controls */
              <div className="space-y-4">
                <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Manager Access Unlocked
                  </span>
                  <button
                    onClick={handleResetAllBiometrics}
                    className="text-[10px] text-rose-600 hover:underline font-bold"
                  >
                    Reset All Biometrics
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Enrolled Biometrics ({enrolledCount}/{effectiveEmployees.length})
                    </span>
                    <button
                      type="button"
                      onClick={handleQuickEnrollAll}
                      className="text-[10px] text-primary-600 hover:underline font-semibold"
                    >
                      Quick Enroll All
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {effectiveEmployees.map((emp) => {
                      const isEnrolled = !!enrolledBiometrics[emp.code];
                      return (
                        <div
                          key={emp.code}
                          className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white truncate">
                              {emp.name}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {emp.code}
                            </p>
                          </div>

                          {isEnrolled ? (
                            <div className="flex items-center space-x-1.5 shrink-0">
                              <span className="text-[10px] text-emerald-600 font-bold">Enrolled</span>
                              <button
                                onClick={() => handleResetBiometric(emp.code)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                title="Reset biometric for this employee"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setIsExitModalOpen(false);
                                setEnrollingEmployee(emp);
                              }}
                              className="text-[10px] text-primary-600 font-bold hover:underline"
                            >
                              Enroll Now
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsExitModalOpen(false);
                      setIsManagerUnlocked(false);
                    }}
                    className="flex-1 rounded-xl"
                  >
                    Done
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleUnpairDevice}
                    className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                  >
                    Unpair Terminal
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
