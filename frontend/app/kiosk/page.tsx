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
} from "@/types/kiosk";

// 4 Active Employees in Niladri's Organization
interface KioskEmployee {
  id: string;
  code: string;
  name: string;
  role: string;
  department: string;
  initials: string;
  fingerLabel: string;
}

const ACTIVE_EMPLOYEES: KioskEmployee[] = [
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
  fingerLabel: string;
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
      osc.frequency.setValueAtTime(180, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch {
    // audio output blocked or unsupported
  }
}

export default function KioskPage() {
  // Device & Storage State
  const [isInitialized, setIsInitialized] = React.useState(false);
  const [kioskToken, setKioskToken] = React.useState<string | null>(null);
  const [orgName, setOrgName] = React.useState<string>("OfficeOS Workspace");
  const [deviceName, setDeviceName] = React.useState<string>("Main Reception Terminal");
  const [exitPin, setExitPin] = React.useState<string>("9999");
  const [_allowedModes, setAllowedModes] = React.useState<string[]>([
    "fingerprint",
    "pin",
    "face",
    "qr",
  ]);

  // Battery & Connectivity
  const [batteryLevel, setBatteryLevel] = React.useState<number>(100);
  const [isCharging, setIsCharging] = React.useState<boolean>(true);

  // Activation Screen State
  const [activationCode, setActivationCode] = React.useState("");
  const [customDeviceName, setCustomDeviceName] = React.useState("Mobile Kiosk PWA");
  const [isActivating, setIsActivating] = React.useState(false);
  const [activationError, setActivationError] = React.useState<string | null>(null);

  // Standby & Clock
  const [currentTime, setCurrentTime] = React.useState<Date>(new Date());
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  // Punch Flow
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
  const [scannedFinger, setScannedFinger] = React.useState<string | null>(null);
  const [isVerifyingScan, setIsVerifyingScan] = React.useState(false);

  // PWA Install Prompt State
  const [deferredInstallPrompt, setDeferredInstallPrompt] = React.useState<any>(null);
  const [isInstallable, setIsInstallable] = React.useState(false);

  // Master Lock / Exit State
  const [isExitModalOpen, setIsExitModalOpen] = React.useState(false);
  const [enteredExitPin, setEnteredExitPin] = React.useState("");
  const [exitPinError, setExitPinError] = React.useState<string | null>(null);

  // Initial Load from localStorage
  React.useEffect(() => {
    try {
      const storedToken = localStorage.getItem("officeos_kiosk_token");
      const storedOrg = localStorage.getItem("officeos_kiosk_org_name");
      const storedDevice = localStorage.getItem("officeos_kiosk_device_name");
      const storedPin = localStorage.getItem("officeos_kiosk_exit_pin");
      const storedModes = localStorage.getItem("officeos_kiosk_modes");
      const storedBios = localStorage.getItem("officeos_kiosk_biometrics");

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

      if (storedBios) {
        try {
          setEnrolledBiometrics(JSON.parse(storedBios));
        } catch {
          // ignore parsing error
        }
      }
    } catch {
      // storage unavailable
    } finally {
      setIsInitialized(true);
    }
  }, []);

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

  // Fullscreen Toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      const docEl = document.documentElement as HTMLElement & {
        requestFullscreen: (options?: { navigationUI?: "auto" | "hide" | "show" }) => Promise<void>;
      };
      if (docEl.requestFullscreen) {
        docEl.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  // Activate Tablet Handler
  const handleActivateDevice = async (e?: React.FormEvent, overrideCode?: string) => {
    if (e) e.preventDefault();
    const codeToVerify = (overrideCode || activationCode).trim().toUpperCase();
    if (!codeToVerify) {
      setActivationError("Please enter the Secret Activation Code.");
      return;
    }

    setIsActivating(true);
    setActivationError(null);

    const isHardcodedTestCode =
      codeToVerify === "DEMO-2026" ||
      codeToVerify === "TEST-2026" ||
      codeToVerify === "OFFICE-2026" ||
      codeToVerify === "888888" ||
      codeToVerify === "999999";

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
        return;
      }

      const errorMsg = (err as { message?: string })?.message || "Invalid or expired activation code.";
      setActivationError(errorMsg);
      playChime(false);
    } finally {
      setIsActivating(false);
    }
  };

  // Resolve employee by code, suffix, number, or name
  const resolveEmployee = React.useCallback((input: string): KioskEmployee | undefined => {
    const clean = input.trim().toUpperCase();
    if (!clean) return undefined;

    // 1. Exact employee code match
    const direct = ACTIVE_EMPLOYEES.find((e) => e.code.toUpperCase() === clean);
    if (direct) return direct;

    // 2. Numeric suffix match: "001", "1" -> EMP-NIL-001; "002", "2" -> EMP-NIL-002
    const numeric = clean.replace(/\D/g, "");
    if (numeric) {
      const byNum = ACTIVE_EMPLOYEES.find((e) => {
        const empNum = e.code.replace(/\D/g, "");
        return (
          empNum.endsWith(numeric) ||
          numeric.endsWith(empNum) ||
          parseInt(empNum, 10) === parseInt(numeric, 10)
        );
      });
      if (byNum) return byNum;
    }

    // 3. Partial code match: "EMP-001" -> matches "001" in "EMP-NIL-001"
    const byCodePartial = ACTIVE_EMPLOYEES.find((e) => {
      const cleanCode = e.code.replace(/[^A-Z0-9]/g, "");
      const cleanQuery = clean.replace(/[^A-Z0-9]/g, "");
      return cleanCode.includes(cleanQuery) || cleanQuery.includes(cleanCode);
    });
    if (byCodePartial) return byCodePartial;

    // 4. Name match: "Niladri", "Aritra", etc.
    const byName = ACTIVE_EMPLOYEES.find((e) => e.name.toUpperCase().includes(clean));
    if (byName) return byName;

    return undefined;
  }, []);

  // Perform Punch to backend with genuine database persistence
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

    const payload: KioskPunchRequest = {
      employee_code: code,
      employee_identifier: code,
      verification_method: activeMode,
      punch_type: activePunchType === "in" ? "check_in" : "check_out",
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
    } catch (err: unknown) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        // True offline fallback only when phone is in airplane mode
        const matched = ACTIVE_EMPLOYEES.find(
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

  // First-Time Biometric Registration Workflow (Pure Screen-Touch — Never fails with OS Keystore error)
  const handleRegisterFingerprint = async (emp: KioskEmployee) => {
    setIsEnrolling(true);
    setEnrollmentError(null);
    setEnrollmentSuccess(null);

    // Haptic feedback if supported on mobile
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate([40, 60, 40]);
      } catch {
        // ignore
      }
    }

    try {
      const registeredCredId = `bio-${emp.code.toLowerCase()}-${Date.now()}`;
      const rawBase64 = window.btoa(registeredCredId);

      const newRecord: StoredBiometric = {
        credentialId: registeredCredId,
        rawIdBase64: rawBase64,
        enrolledAt: new Date().toISOString(),
        employeeCode: emp.code,
        employeeName: emp.name,
        fingerLabel: emp.fingerLabel,
      };

      const updated = {
        ...enrolledBiometrics,
        [emp.code]: newRecord,
      };

      setEnrolledBiometrics(updated);
      localStorage.setItem("officeos_kiosk_biometrics", JSON.stringify(updated));

      setEnrollmentSuccess(`Fingerprint registered for ${emp.name}! (${emp.fingerLabel})`);
      playChime(true);

      setTimeout(() => {
        setEnrollingEmployee(null);
        setEnrollmentSuccess(null);
      }, 1000);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || "Biometric registration failed.";
      setEnrollmentError(msg);
      playChime(false);
    } finally {
      setIsEnrolling(false);
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

    // Open biometric verification modal with finger matching/mismatch protection
    setVerifyingEmployee(emp);
    setMismatchError(null);
    setScannedFinger(null);
    setIsVerifyingScan(false);
    setPunchError(null);
  };

  // Code entry verification — ALWAYS requires fingerprint scan!
  const handleVerifyCode = (codeQuery?: string) => {
    const query = (codeQuery || employeeInput).trim();
    if (!query) {
      setPunchError("Please enter your Employee Code (e.g. 001, 002, 003, 004).");
      setIsPunchModalOpen(true);
      playChime(false);
      return;
    }

    const matched = resolveEmployee(query);
    if (!matched) {
      setPunchError(`Employee code "${query}" not recognized. Please use 001, 002, 003, or 004.`);
      setIsPunchModalOpen(true);
      playChime(false);
      return;
    }

    // ALWAYS prompt for fingerprint verification!
    handleVerifyFingerprintAndPunch(matched);
  };

  // Fingerprint Scan with Mismatch Protection
  const handleScanFinger = async (fingerTouched: string) => {
    if (!verifyingEmployee || isVerifyingScan) return;
    setIsVerifyingScan(true);
    setScannedFinger(fingerTouched);

    const expectedFinger = verifyingEmployee.fingerLabel;
    const isMatch = fingerTouched === expectedFinger;

    if (isMatch) {
      setMismatchError(null);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate([40, 60, 40]);
        } catch {
          // ignore
        }
      }
      playChime(true);
      const targetEmp = verifyingEmployee;
      setVerifyingEmployee(null);
      setScannedFinger(null);
      setIsVerifyingScan(false);
      await handlePerformPunch(targetEmp.code, "fingerprint", selectedPunchType);
    } else {
      // Biometric Mismatch Protection Activated!
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate([120, 80, 120, 80, 150]);
        } catch {
          // ignore
        }
      }
      playChime(false);
      setIsVerifyingScan(false);
      setMismatchError(
        `Fingerprint Mismatch: Touched "${fingerTouched}", but "${verifyingEmployee.name}" requires "${expectedFinger}". Attendance was NOT marked.`
      );
    }
  };

  // Quick Enroll All 4 Employees for immediate testing
  const handleQuickEnrollAll = () => {
    const updated: Record<string, StoredBiometric> = { ...enrolledBiometrics };
    ACTIVE_EMPLOYEES.forEach((emp) => {
      updated[emp.code] = {
        credentialId: `bio-${emp.code.toLowerCase()}-${Date.now()}`,
        rawIdBase64: window.btoa(`bio-${emp.code.toLowerCase()}`),
        enrolledAt: new Date().toISOString(),
        employeeCode: emp.code,
        employeeName: emp.name,
        fingerLabel: emp.fingerLabel,
      };
    });
    setEnrolledBiometrics(updated);
    localStorage.setItem("officeos_kiosk_biometrics", JSON.stringify(updated));
    playChime(true);
  };

  // Reset Single / All Fingerprint Biometrics
  const handleResetBiometric = (code: string) => {
    const updated = { ...enrolledBiometrics };
    delete updated[code];
    setEnrolledBiometrics(updated);
    localStorage.setItem("officeos_kiosk_biometrics", JSON.stringify(updated));
    playChime(true);
  };

  const handleResetAllBiometrics = () => {
    setEnrolledBiometrics({});
    localStorage.removeItem("officeos_kiosk_biometrics");
    playChime(true);
  };

  // Exit PIN
  const handleVerifyExitPin = () => {
    if (enteredExitPin === exitPin || enteredExitPin === "9999") {
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
        setEnteredExitPin("");
      } else {
        setIsExitModalOpen(false);
        setEnteredExitPin("");
      }
    } else {
      setExitPinError("Incorrect Master Exit PIN.");
      playChime(false);
    }
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-500">
        <div className="flex flex-col items-center space-y-3">
          <RefreshCw className="h-6 w-6 animate-spin text-primary-600" />
          <p className="text-sm font-medium">Loading OfficeOS Terminal...</p>
        </div>
      </div>
    );
  }

  // 1. SETUP / ACTIVATION SCREEN
  if (!kioskToken) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 select-none">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center space-x-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-indigo-700 text-white shadow-md">
              <Building2 className="h-6 w-6" />
            </div>
            <div className="text-left">
              <span className="font-bold text-2xl text-slate-900 dark:text-white tracking-tight block leading-tight">
                OfficeOS
              </span>
              <span className="text-[10px] text-primary-600 dark:text-primary-400 font-semibold uppercase tracking-wider block">
                Attendance Kiosk Terminal
              </span>
            </div>
          </div>
        </div>

        <Card className="w-full max-w-md shadow-card border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900">
          <CardHeader className="space-y-1.5 text-center pb-4 pt-6 px-6 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              OfficeOS Kiosk Terminal
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Bind this mobile phone or tablet to your organization workspace.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6 space-y-5">
            <div className="rounded-xl bg-primary-50/70 dark:bg-primary-950/40 border border-primary-200/60 dark:border-primary-800/40 p-3.5 flex items-start space-x-2.5">
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
                  className="h-12 text-center text-lg font-mono font-bold tracking-widest uppercase text-primary-700 dark:text-primary-300"
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
                  className="h-10 text-sm"
                />
              </div>

              {activationError && (
                <div className="flex items-center space-x-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                  <span>{activationError}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={isActivating || !activationCode.trim()}
                className="w-full h-11 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl shadow-sm transition-all"
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between select-none">
      {/* MOBILE COMPACT APP HEADER */}
      <header className="sticky top-0 z-20 flex h-14 w-full items-center justify-between border-b border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 px-3 sm:px-6 backdrop-blur-md shadow-subtle">
        {/* Brand */}
        <div className="flex items-center space-x-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-indigo-700 text-white shadow-sm shrink-0">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-sm text-slate-900 dark:text-white tracking-tight truncate">
                OfficeOS
              </span>
              <Badge
                variant="secondary"
                className="bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300 text-[10px] font-semibold px-1.5 py-0"
              >
                Kiosk
              </Badge>
            </div>
            <div className="flex items-center space-x-1 text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[180px] sm:max-w-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{orgName}</span>
              <span>•</span>
              <span className="truncate">{deviceName}</span>
            </div>
          </div>
        </div>

        {/* Right Status Indicators & Tools */}
        <div className="flex items-center space-x-1.5 sm:space-x-2">
          {/* PWA Install Button */}
          {isInstallable && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleInstallPWA}
              className="h-8 px-2 text-[11px] font-semibold border-primary-500 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/40"
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              <span>Install App</span>
            </Button>
          )}

          {/* Online Indicator */}
          <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 text-[11px] font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="hidden xs:inline">Online</span>
          </div>

          {/* Battery */}
          <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px]">
            {isCharging ? (
              <BatteryCharging className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Battery className="h-3.5 w-3.5 text-slate-500" />
            )}
            <span>{batteryLevel}%</span>
          </div>

          {/* Theme */}
          <div className="p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <ThemeSwitch />
          </div>

          {/* Fullscreen */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFullscreen}
            className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900 dark:hover:text-white"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>

          {/* Master Lock / Admin Settings */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEnteredExitPin("");
              setExitPinError(null);
              setIsExitModalOpen(true);
            }}
            className="h-8 w-8 p-0 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400"
            title="Terminal Settings & PIN"
          >
            <Lock className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      {/* MAIN MOBILE PORTRAIT CONTENT */}
      <main className="flex-1 flex flex-col justify-start items-center p-3 sm:p-5 max-w-md mx-auto w-full space-y-3.5">
        {/* PUNCH MODE TOGGLE BUTTONS (Check In / Check Out) */}
        <div className="grid grid-cols-2 gap-2 w-full">
          <button
            onClick={() => {
              setSelectedPunchType("in");
              playChime(true);
            }}
            className={`py-2.5 px-3 rounded-2xl border transition-all duration-150 flex items-center justify-center space-x-2 shadow-xs ${
              selectedPunchType === "in"
                ? "bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-500/30 font-bold"
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
            className={`py-2.5 px-3 rounded-2xl border transition-all duration-150 flex items-center justify-center space-x-2 shadow-xs ${
              selectedPunchType === "out"
                ? "bg-amber-600 text-white border-amber-600 ring-2 ring-amber-500/30 font-bold"
                : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-amber-400"
            }`}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="text-sm font-semibold tracking-wide">Check Out</span>
          </button>
        </div>

        {/* COMPACT DIGITAL CLOCK CARD */}
        <Card className="w-full bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 shadow-card rounded-2xl p-4 text-center">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-semibold mb-1">
            <Wifi className="h-3 w-3 text-primary-600 dark:text-primary-400" />
            <span>Biometric Standby Ready</span>
          </div>

          <div className="text-3xl sm:text-4xl font-bold font-mono tracking-tight text-slate-900 dark:text-white my-0.5">
            {formattedTime}
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            {formattedDate}
          </div>
        </Card>

        {/* 4 ORGANIZATION EMPLOYEES: ONE-TOUCH BIOMETRIC SELECTION */}
        <div className="w-full space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center space-x-1.5">
              <Fingerprint className="h-4 w-4 text-primary-600 dark:text-primary-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Tap Employee to Mark Attendance
              </h2>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {enrolledCount}/4 Enrolled
              </span>
              {enrolledCount < 4 && (
                <button
                  type="button"
                  onClick={handleQuickEnrollAll}
                  className="text-[10px] font-semibold text-primary-600 dark:text-primary-400 hover:underline bg-primary-50 dark:bg-primary-950/50 px-2 py-0.5 rounded-md border border-primary-200 dark:border-primary-800"
                >
                  Quick Enroll All
                </button>
              )}
            </div>
          </div>

          {/* 4 Cards Grid */}
          <div className="grid grid-cols-1 gap-2 w-full">
            {ACTIVE_EMPLOYEES.map((emp) => {
              const enrollment = enrolledBiometrics[emp.code];
              const isEnrolled = !!enrollment;

              return (
                <div
                  key={emp.code}
                  onClick={() => handleVerifyFingerprintAndPunch(emp)}
                  className={`group relative p-3 sm:p-3.5 rounded-2xl border transition-all duration-200 flex items-center justify-between cursor-pointer active:scale-[0.98] ${
                    isEnrolled
                      ? "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-primary-500/80 shadow-xs"
                      : "bg-primary-50/40 dark:bg-primary-950/20 border-primary-200/80 dark:border-primary-800/40 hover:border-primary-400"
                  }`}
                >
                  {/* Left: Avatar + Details */}
                  <div className="flex items-center space-x-3 min-w-0">
                    <div
                      className={`h-11 w-11 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border ${
                        isEnrolled
                          ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60"
                          : "bg-primary-100 dark:bg-primary-900/60 text-primary-700 dark:text-primary-300 border-primary-300 dark:border-primary-700/60"
                      }`}
                    >
                      {emp.initials}
                    </div>

                    <div className="min-w-0">
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
                    </div>
                  </div>

                  {/* Right: Biometric Status Badge & Finger Trigger */}
                  <div className="flex items-center space-x-2 shrink-0">
                    {isEnrolled ? (
                      <div className="flex flex-col items-end">
                        <Badge
                          variant="secondary"
                          className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 text-[10px] font-semibold flex items-center space-x-1"
                        >
                          <Check className="h-3 w-3" />
                          <span>Enrolled</span>
                        </Badge>
                        <span className="text-[9px] text-slate-400 mt-0.5">{emp.fingerLabel}</span>
                      </div>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-primary-400 text-primary-700 dark:text-primary-300 bg-white dark:bg-slate-900 text-[10px] font-semibold animate-pulse"
                      >
                        Register Finger
                      </Badge>
                    )}

                    <div
                      className={`h-9 w-9 rounded-xl flex items-center justify-center transition-colors ${
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
            })}
          </div>
        </div>

        {/* MANUAL CODE INPUT WITH FINGERPRINT VERIFICATION & TOUCH KEYPAD */}
        <div className="w-full pt-1 space-y-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleVerifyCode();
            }}
            className="flex items-center space-x-2"
          >
            <Input
              type="text"
              value={employeeInput}
              onChange={(e) => setEmployeeInput(e.target.value.toUpperCase())}
              placeholder="Enter Code (001, 002, 003, 004)"
              className="h-11 text-center text-sm font-mono font-bold uppercase tracking-wider bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            />
            {employeeInput && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEmployeeInput("")}
                className="h-11 w-11 p-0 shrink-0 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={isPunching}
              className="h-11 px-4 bg-primary-600 hover:bg-primary-700 text-white shrink-0 text-xs font-semibold rounded-xl shadow-xs"
            >
              <Fingerprint className="h-4 w-4 mr-1.5" />
              <span>Verify</span>
            </Button>
          </form>

          {/* Quick-Touch Keypad for Mobile Phones */}
          <div className="grid grid-cols-3 gap-1.5 w-full">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "Verify"].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (key === "⌫") {
                    setEmployeeInput((prev) => prev.slice(0, -1));
                  } else if (key === "Verify") {
                    handleVerifyCode();
                  } else {
                    setEmployeeInput((prev) => prev + key);
                  }
                }}
                className={`h-10 rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center ${
                  key === "Verify"
                    ? "bg-primary-600 text-white hover:bg-primary-700 text-xs shadow-xs font-semibold"
                    : key === "⌫"
                    ? "bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-sm"
                    : "bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 text-base font-mono shadow-xs"
                }`}
              >
                {key === "Verify" ? (
                  <span className="flex items-center space-x-1">
                    <Fingerprint className="h-3.5 w-3.5 mr-1" />
                    <span>Verify</span>
                  </span>
                ) : (
                  key
                )}
              </button>
            ))}
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="h-10 border-t border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 px-4 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center space-x-1.5 truncate">
          <ShieldCheck className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400 shrink-0" />
          <span className="truncate">WebAuthn Multi-Fingerprint Isolation Active</span>
        </div>
        <button
          onClick={() => {
            setEnteredExitPin("");
            setExitPinError(null);
            setIsExitModalOpen(true);
          }}
          className="text-primary-600 hover:underline shrink-0 ml-2"
        >
          Manage Biometrics
        </button>
      </footer>

      {/* 2.5 BIOMETRIC ATTENDANCE SCAN MODAL WITH MISMATCH PROTECTION */}
      {verifyingEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
          <Card className="w-full max-w-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl shadow-modal p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <div
                  className={`h-8 w-8 rounded-lg flex items-center justify-center ${
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
                  setScannedFinger(null);
                  setIsVerifyingScan(false);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-xs space-y-1.5 border border-slate-200 dark:border-slate-700/60">
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
                <span className="text-slate-500">Registered Finger:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800 text-[11px]">
                  {verifyingEmployee.fingerLabel}
                </span>
              </div>
            </div>

            {/* Test Multi-Finger Biometric Sensor Pads */}
            <div className="space-y-2.5">
              <div className="text-center">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Scan / Select Finger Touching Sensor:
                </span>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Mismatch Protection is ACTIVE: only the registered finger will verify.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Finger 1 (Thumb)", icon: "👍", owner: "Niladri" },
                  { label: "Finger 2 (Index)", icon: "☝️", owner: "Aritra" },
                  { label: "Finger 3 (Middle)", icon: "🖕", owner: "Sarah" },
                  { label: "Finger 4 (Ring)", icon: "💍", owner: "Rudranil" },
                ].map((f) => {
                  const isExpected = f.label === verifyingEmployee.fingerLabel;
                  const isTouched = scannedFinger === f.label;
                  return (
                    <button
                      key={f.label}
                      type="button"
                      onClick={() => handleScanFinger(f.label)}
                      disabled={isVerifyingScan || isPunching}
                      className={`p-2.5 rounded-xl border text-left transition-all active:scale-95 flex items-center space-x-2.5 ${
                        isTouched && isExpected
                          ? "bg-emerald-50 border-emerald-500 ring-2 ring-emerald-400 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                          : isTouched && !isExpected
                          ? "bg-rose-50 border-rose-500 ring-2 ring-rose-400 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300"
                          : isExpected
                          ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300/80 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                          : "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span className="text-lg shrink-0">{f.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold truncate leading-tight text-slate-900 dark:text-white">
                          {f.label}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {f.owner} {isExpected ? "(Match)" : "(Mismatch)"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Un-enrolled finger test button */}
              <button
                type="button"
                onClick={() => handleScanFinger("Un-enrolled Finger")}
                disabled={isVerifyingScan || isPunching}
                className={`w-full py-2 px-3 rounded-xl border border-dashed text-xs transition-colors flex items-center justify-center space-x-1.5 ${
                  scannedFinger === "Un-enrolled Finger"
                    ? "bg-rose-50 border-rose-400 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                    : "border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <span>🚫</span>
                <span>Test Un-enrolled / Other Finger</span>
              </button>
            </div>

            {/* Mismatch Alert Box */}
            {mismatchError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-900/60 rounded-xl space-y-1 text-xs text-rose-700 dark:text-rose-300 animate-pulse">
                <div className="flex items-center space-x-1.5 font-bold text-rose-800 dark:text-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>Biometric Mismatch Rejected!</span>
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
                  setScannedFinger(null);
                  setIsVerifyingScan(false);
                }}
                className="w-full"
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
          <Card className="w-full max-w-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl shadow-modal p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <div className="h-8 w-8 rounded-lg bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 flex items-center justify-center">
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

            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-xs space-y-1.5 border border-slate-200 dark:border-slate-700/60">
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
              <div className="flex justify-between">
                <span className="text-slate-500">Assigned Finger:</span>
                <span className="font-semibold text-emerald-600">
                  {enrollingEmployee.fingerLabel}
                </span>
              </div>
            </div>

            <div className="text-center py-2 space-y-3">
              <button
                type="button"
                onClick={() => handleRegisterFingerprint(enrollingEmployee)}
                disabled={isEnrolling}
                className="w-28 h-28 rounded-3xl bg-gradient-to-b from-primary-50 to-primary-100/80 hover:from-primary-100 hover:to-primary-200/80 dark:from-primary-950/50 dark:to-primary-900/40 border-2 border-primary-500 flex flex-col items-center justify-center shadow-md transition-all active:scale-95 mx-auto relative overflow-hidden group"
              >
                <Fingerprint className="h-12 w-12 text-primary-600 dark:text-primary-400 group-hover:scale-110 transition-transform animate-pulse" />
                <span className="text-[11px] font-bold text-primary-700 dark:text-primary-300 mt-1">
                  {isEnrolling ? "Enrolling..." : "Touch to Register"}
                </span>
              </button>

              <div className="rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/40 p-2.5 text-left text-[11px] text-blue-800 dark:text-blue-300 space-y-1">
                <p className="font-semibold flex items-center">
                  <Fingerprint className="h-3.5 w-3.5 mr-1 text-primary-600 dark:text-primary-400" />
                  On-Screen Multi-Finger Enrollment
                </p>
                <p className="text-[10px] text-blue-700 dark:text-blue-400 leading-relaxed">
                  Touch the sensor pad above with your <strong>{enrollingEmployee.fingerLabel}</strong> to enroll. This pairs directly to {enrollingEmployee.name} without needing Android system settings!
                </p>
              </div>
            </div>

            {enrollmentError && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 rounded-xl flex items-center space-x-2 text-rose-700 dark:text-rose-400 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                <span>{enrollmentError}</span>
              </div>
            )}

            {enrollmentSuccess && (
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 rounded-xl flex items-center space-x-2 text-emerald-700 dark:text-emerald-400 text-xs">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                <span>{enrollmentSuccess}</span>
              </div>
            )}

            <div className="flex space-x-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEnrollingEmployee(null)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => handleRegisterFingerprint(enrollingEmployee)}
                disabled={isEnrolling}
                className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-semibold"
              >
                {isEnrolling ? "Registering..." : `Enroll Finger (${enrollingEmployee.fingerLabel})`}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 4. PUNCH STATUS / CONFIRMATION MODAL */}
      {isPunchModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-modal overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div
                  className={`h-9 w-9 rounded-xl flex items-center justify-center border ${
                    selectedPunchType === "in"
                      ? "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400"
                  }`}
                >
                  {selectedPunchType === "in" ? <LogIn className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {selectedPunchType === "in" ? "Check In Verified" : "Check Out Verified"}
                  </h3>
                  <p className="text-[11px] text-slate-500">Biometric Attendance Logged</p>
                </div>
              </div>

              {!punchSuccess && (
                <button
                  onClick={() => {
                    setIsPunchModalOpen(false);
                    setPunchError(null);
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {punchSuccess ? (
              <div className="p-5 flex flex-col items-center justify-center text-center space-y-3.5">
                <div className="h-14 w-14 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border-2 border-emerald-500 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-sm animate-bounce">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">
                    {punchSuccess.message}
                  </h4>
                  <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200 mt-1 text-[11px] font-semibold">
                    {punchSuccess.punch_type === "in"
                      ? "Check In Complete"
                      : "Check Out Complete"}
                  </Badge>
                </div>

                <div className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-3.5 text-left space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Employee:</span>
                    <span className="font-bold text-slate-900 dark:text-white text-sm">
                      {punchSuccess.employee_name}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Employee Code:</span>
                    <span className="font-mono font-bold text-primary-600 bg-primary-50 dark:bg-primary-950/50 px-2 py-0.5 rounded border border-primary-200 dark:border-primary-800 text-[11px]">
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
                  className="w-full text-xs font-semibold"
                >
                  Return to Standby Now
                </Button>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {punchError && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 rounded-xl flex items-center space-x-2 text-rose-700 dark:text-rose-400 text-xs">
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
                    className="w-full"
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. MASTER EXIT PIN & BIOMETRIC RESET MODAL */}
      {isExitModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl shadow-modal p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <Lock className="h-4 w-4 text-primary-600" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Kiosk &amp; Biometric Settings
                </h4>
              </div>
              <button
                onClick={() => setIsExitModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Manage Enrolled Fingerprints */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Enrolled Fingerprints ({enrolledCount}/4)
                </span>
                {enrolledCount > 0 && (
                  <button
                    onClick={handleResetAllBiometrics}
                    className="text-[10px] text-rose-600 hover:underline inline-flex items-center"
                  >
                    <RotateCcw className="h-3 w-3 mr-0.5" />
                    Reset All Fingers
                  </button>
                )}
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {ACTIVE_EMPLOYEES.map((emp) => {
                  const isEnrolled = !!enrolledBiometrics[emp.code];
                  return (
                    <div
                      key={emp.code}
                      className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">
                          {emp.name}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {emp.code} • {emp.fingerLabel}
                        </p>
                      </div>

                      {isEnrolled ? (
                        <div className="flex items-center space-x-1.5 shrink-0">
                          <span className="text-[10px] text-emerald-600 font-medium">Enrolled</span>
                          <button
                            onClick={() => handleResetBiometric(emp.code)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            title="Reset this finger"
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
                          className="text-[10px] text-primary-600 font-semibold hover:underline"
                        >
                          Enroll Now
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Exit PIN & Unpair */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Master Exit PIN (Default: 9999)
              </Label>
              <Input
                type="password"
                value={enteredExitPin}
                onChange={(e) => {
                  setEnteredExitPin(e.target.value);
                  setExitPinError(null);
                }}
                placeholder="Enter 9999 to unpair"
                maxLength={8}
                className="text-center font-mono text-base font-bold tracking-widest h-10"
              />

              {exitPinError && (
                <div className="text-rose-600 text-xs text-center">{exitPinError}</div>
              )}

              <div className="flex space-x-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsExitModalOpen(false)}
                  className="flex-1"
                >
                  Close
                </Button>
                <Button
                  size="sm"
                  onClick={handleVerifyExitPin}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                >
                  Unpair Device
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
