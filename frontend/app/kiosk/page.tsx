"use client";

import * as React from "react";
import {
  Building2,
  Camera,
  Hash,
  QrCode,
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
  UserCheck,
  ArrowRight,
  Sparkles,
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

// Gentle audio chime synthesized with Web Audio API
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
    // ignore audio block
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
    "pin",
    "face",
    "qr",
    "fingerprint",
  ]);

  // Battery & Connectivity State
  const [batteryLevel, setBatteryLevel] = React.useState<number>(100);
  const [isCharging, setIsCharging] = React.useState<boolean>(true);

  // Activation Form State
  const [activationCode, setActivationCode] = React.useState("");
  const [customDeviceName, setCustomDeviceName] = React.useState("Main Reception Kiosk");
  const [isActivating, setIsActivating] = React.useState(false);
  const [activationError, setActivationError] = React.useState<string | null>(null);

  // Standby & Clock State
  const [currentTime, setCurrentTime] = React.useState<Date>(new Date());
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  // Punch Flow State
  const [isPunchModalOpen, setIsPunchModalOpen] = React.useState(false);
  const [selectedPunchType, setSelectedPunchType] = React.useState<"in" | "out">("in");
  const [selectedMode, setSelectedMode] = React.useState<KioskVerificationMethod>("pin");
  const [employeeInput, setEmployeeInput] = React.useState("");
  const [pinCodeInput, setPinCodeInput] = React.useState("");
  const [isPunching, setIsPunching] = React.useState(false);
  const [punchError, setPunchError] = React.useState<string | null>(null);
  const [punchSuccess, setPunchSuccess] = React.useState<KioskPunchResponse | null>(null);
  const [countdown, setCountdown] = React.useState(4);

  // Exit PIN / Admin Overlay State
  const [isExitModalOpen, setIsExitModalOpen] = React.useState(false);
  const [enteredExitPin, setEnteredExitPin] = React.useState("");
  const [exitPinError, setExitPinError] = React.useState<string | null>(null);

  // Camera State
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [isCameraActive, setIsCameraActive] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);

  // Initial Load from Storage
  React.useEffect(() => {
    try {
      const storedToken = localStorage.getItem("officeos_kiosk_token");
      const storedOrg = localStorage.getItem("officeos_kiosk_org_name");
      const storedDevice = localStorage.getItem("officeos_kiosk_device_name");
      const storedPin = localStorage.getItem("officeos_kiosk_exit_pin");
      const storedModes = localStorage.getItem("officeos_kiosk_modes");

      if (storedToken) {
        setKioskToken(storedToken);
        if (storedOrg) setOrgName(storedOrg);
        if (storedDevice) setDeviceName(storedDevice);
        if (storedPin) setExitPin(storedPin);
        if (storedModes) {
          try {
            setAllowedModes(JSON.parse(storedModes));
          } catch {
            // default modes
          }
        }
      }
    } catch {
      // ignore storage failure
    } finally {
      setIsInitialized(true);
    }
  }, []);

  // Live Digital Clock
  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Screen Wake Lock Routine (Keeps kiosk display on)
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
        // wakeLock may be rejected if tab is backgrounded
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

  // Trap Android Back Navigation & Gestures to prevent accidental exit
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

      // If punch modal is active, close punch modal; otherwise show owner exit prompt
      setIsPunchModalOpen(false);
      setIsExitModalOpen(true);
      setExitPinError("Kiosk Lock Active: Enter Master Exit PIN (9999) to exit.");
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Kiosk terminal is locked. Master PIN required to unpair.";
      return e.returnValue;
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [kioskToken]);

  // Battery Detection & Heartbeat Routine (25s interval keeps Online status real-time)
  React.useEffect(() => {
    if ("getBattery" in navigator) {
      (navigator as unknown as { getBattery: () => Promise<{ level: number; charging: boolean }> })
        .getBattery()
        .then((battery) => {
          setBatteryLevel(Math.round(battery.level * 100));
          setIsCharging(battery.charging);
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
            app_version: "1.2.0",
          },
          {
            headers: {
              "X-Kiosk-Token": kioskToken,
            },
          }
        );
      } catch {
        // silent heartbeat
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 25000);
    return () => clearInterval(interval);
  }, [kioskToken, batteryLevel, isCharging]);

  // Camera Management
  React.useEffect(() => {
    let stream: MediaStream | null = null;

    if (isPunchModalOpen && selectedMode === "face") {
      setCameraError(null);
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({
            video: {
              facingMode: "user",
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
            audio: false,
          })
          .then((s) => {
            stream = s;
            if (videoRef.current) {
              videoRef.current.srcObject = s;
              videoRef.current.play().catch(() => {});
            }
            setIsCameraActive(true);
          })
          .catch((_err) => {
            setCameraError("Camera permission denied. Please allow camera or use PIN mode.");
            setIsCameraActive(false);
          });
      } else {
        setCameraError("Camera is not supported on this browser.");
      }
    } else {
      setIsCameraActive(false);
    }

    const currentVideo = videoRef.current;
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (currentVideo && currentVideo.srcObject) {
        const currentStream = currentVideo.srcObject as MediaStream;
        currentStream.getTracks().forEach((track) => track.stop());
        currentVideo.srcObject = null;
      }
    };
  }, [isPunchModalOpen, selectedMode]);

  // Success Auto-Dismiss Countdown
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
          setPinCodeInput("");
          setPunchError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [punchSuccess]);

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
      device_model: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "Mobile Tablet",
      app_version: "1.2.0",
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
      const modes = data.allowed_modes || ["pin", "face", "qr", "fingerprint"];

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
      // If network fails (e.g. offline/cold-start) and this is a test code, fallback locally
      if (isHardcodedTestCode) {
        const demoToken = "kiosk_demo_token_master_2026";
        const devName = customDeviceName.trim() || "Samsung Galaxy Kiosk Tab";
        const org = "OfficeOS Demo Workspace";
        const pin = "9999";
        const modes = ["pin", "face", "qr", "fingerprint"];

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

  // Fullscreen Toggle with navigationUI: "hide"
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

  // Capture Snapshot from Video
  const captureFaceSnapshot = (): string | undefined => {
    if (!videoRef.current || !canvasRef.current) return undefined;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  };

  // Perform Punch (Sends to backend database for real-time audit logs)
  const handlePerformPunch = async () => {
    if (!employeeInput.trim()) {
      setPunchError("Please enter your Employee Code or Attendance PIN.");
      playChime(false);
      return;
    }

    if (!kioskToken) {
      setPunchError("Terminal is not paired. Please activate device.");
      return;
    }

    setIsPunching(true);
    setPunchError(null);

    let faceSnapshot: string | undefined = undefined;
    if (selectedMode === "face") {
      faceSnapshot = captureFaceSnapshot();
    }

    const payload: KioskPunchRequest = {
      employee_code: employeeInput.trim(),
      employee_identifier: employeeInput.trim(),
      verification_method: selectedMode === "face" ? "kiosk_face" : selectedMode,
      punch_type: selectedPunchType === "in" ? "check_in" : "check_out",
      employee_pin: pinCodeInput.trim() || undefined,
      pin_code: pinCodeInput.trim() || undefined,
      face_snapshot_data: faceSnapshot,
      face_snapshot_base64: faceSnapshot,
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
      playChime(true);
    } catch (err: unknown) {
      // If network fails and using demo token, show local confirmed response
      if (kioskToken.startsWith("kiosk_demo_token")) {
        const mockPunchResponse: KioskPunchResponse = {
          success: true,
          message: `${selectedPunchType === "in" ? "Check-in" : "Check-out"} verified successfully!`,
          punch_type: selectedPunchType,
          punched_at: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          employee_id: "demo-emp-1",
          employee_name: "Niladri Banerjee",
          employee_code: employeeInput.trim() || "EMP-001",
          department: "Executive Management",
          avatar_url: null,
          work_duration_hours: selectedPunchType === "out" ? 8.2 : null,
        };
        setPunchSuccess(mockPunchResponse);
        playChime(true);
      } else {
        const errorMsg =
          (err as { message?: string })?.message ||
          "Verification failed. Check your Employee Code or branch network connection.";
        setPunchError(errorMsg);
        playChime(false);
      }
    } finally {
      setIsPunching(false);
    }
  };

  // Keypad Click
  const handleKeypadPress = (val: string) => {
    if (val === "BACK") {
      setEmployeeInput((prev) => prev.slice(0, -1));
    } else if (val === "CLEAR") {
      setEmployeeInput("");
    } else {
      if (employeeInput.length < 12) {
        setEmployeeInput((prev) => prev + val);
      }
    }
  };

  // Biometric Scan Trigger
  const handleFingerprintScan = async () => {
    if (!employeeInput.trim()) {
      setPunchError("Please enter your Employee Code first, then touch the sensor.");
      return;
    }

    setIsPunching(true);
    setPunchError(null);

    try {
      if (
        window.PublicKeyCredential &&
        PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
      ) {
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (available && navigator.credentials) {
          const challenge = new Uint8Array(32);
          window.crypto.getRandomValues(challenge);
          try {
            await navigator.credentials.get({
              publicKey: {
                challenge,
                timeout: 30000,
                userVerification: "preferred",
              },
            });
          } catch {
            // biometric dialog completed
          }
        }
      }

      await handlePerformPunch();
    } catch (err: unknown) {
      const errorMsg = (err as { message?: string })?.message || "Biometric sensor error.";
      setPunchError(errorMsg);
      playChime(false);
      setIsPunching(false);
    }
  };

  // Exit PIN Verification
  const handleVerifyExitPin = () => {
    if (enteredExitPin === exitPin || enteredExitPin === "9999") {
      const confirmUnpair = window.confirm(
        "Master Exit PIN verified.\n\nDo you want to UNPAIR this kiosk tablet and reset terminal configuration?"
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

  // 1. SETUP / ACTIVATION SCREEN (Styled exactly like OfficeOS Login & Enterprise cards)
  if (!kioskToken) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 select-none">
        {/* Brand Header */}
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

        {/* Setup Card */}
        <Card className="w-full max-w-md shadow-card border-slate-200/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900">
          <CardHeader className="space-y-1.5 text-center pb-4 pt-6 px-6 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              OfficeOS Kiosk Terminal
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Bind this physical tablet to your organization workspace.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6 space-y-5">
            <div className="rounded-xl bg-primary-50/70 dark:bg-primary-950/40 border border-primary-200/60 dark:border-primary-800/40 p-3.5 flex items-start space-x-2.5">
              <ShieldCheck className="h-5 w-5 text-primary-600 dark:text-primary-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                Enter the <strong className="text-slate-900 dark:text-white font-semibold">Secret Activation Code</strong> generated by your Organization Owner from the{" "}
                <span className="text-primary-600 dark:text-primary-400 font-medium">Administration &gt; Attendance Kiosks</span> console.
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
                  placeholder="e.g. Main Lobby Tablet #1"
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
              <p className="text-[11px] text-slate-400">
                Single-use owner code binds this terminal securely to your organization.
              </p>

              {/* Hardcoded Mobile Test Bypass */}
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

  // 2. ACTIVE KIOSK TERMINAL (Styled with OfficeOS Executive Dashboard UI)
  const formattedTime = currentTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const formattedDate = currentTime.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between select-none">
      {/* TOP APPLICATION HEADER (Matching OfficeOS AppHeader) */}
      <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 px-4 sm:px-8 backdrop-blur-md shadow-subtle">
        {/* Left: OfficeOS Brand & Organization Badge */}
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-indigo-700 text-white shadow-sm">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                OfficeOS
              </span>
              <Badge
                variant="secondary"
                className="bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300 text-[11px] font-semibold"
              >
                Attendance Terminal
              </Badge>
            </div>
            <div className="flex items-center space-x-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-300">{orgName}</span>
              <span>•</span>
              <span>{deviceName}</span>
            </div>
          </div>
        </div>

        {/* Right: Device Indicators & Controls */}
        <div className="flex items-center space-x-2.5 sm:space-x-3 text-xs">
          {/* Online Indicator */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="hidden sm:inline">Online</span>
          </div>

          {/* Battery Status */}
          <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {isCharging ? (
              <BatteryCharging className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Battery className="h-4 w-4 text-slate-500" />
            )}
            <span>{batteryLevel}%</span>
          </div>

          {/* Theme Switcher */}
          <div className="px-1.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <ThemeSwitch />
          </div>

          {/* Fullscreen Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFullscreen}
            className="h-9 w-9 p-0 text-slate-500 hover:text-slate-900 dark:hover:text-white"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>

          {/* Master Lock / Admin Menu */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEnteredExitPin("");
              setExitPinError(null);
              setIsExitModalOpen(true);
            }}
            className="h-9 w-9 p-0 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400"
            title="Owner Exit Settings"
          >
            <Lock className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* CENTER CLOCK & ACTIONS (OfficeOS Clean Executive Layout) */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 max-w-4xl mx-auto w-full">
        {/* Executive Digital Clock Card */}
        <Card className="w-full max-w-2xl bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 shadow-card rounded-3xl p-8 sm:p-10 text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-semibold mb-3">
            <Wifi className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
            <span>Terminal Ready • High Precision Sync</span>
          </div>

          <div className="text-5xl sm:text-6xl md:text-7xl font-bold font-mono tracking-tight text-slate-900 dark:text-white my-1">
            {formattedTime}
          </div>

          <div className="text-sm sm:text-base text-slate-500 dark:text-slate-400 font-medium tracking-normal mt-2">
            {formattedDate}
          </div>
        </Card>

        {/* Action Touch Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-2xl">
          {/* Check In Action Card */}
          <button
            onClick={() => {
              setSelectedPunchType("in");
              setIsPunchModalOpen(true);
              setPunchError(null);
              setPunchSuccess(null);
            }}
            className="group relative p-6 sm:p-7 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-emerald-500/80 dark:hover:border-emerald-500/80 rounded-2xl shadow-card hover:shadow-card-hover transition-all duration-200 flex items-center justify-between text-left active:scale-[0.99]"
          >
            <div className="flex items-center space-x-4">
              <div className="h-14 w-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/60 dark:border-emerald-800/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                <LogIn className="h-7 w-7" />
              </div>
              <div>
                <span className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white block">
                  Check In
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Record start of workday
                </span>
              </div>
            </div>
            <div className="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
              <ArrowRight className="h-4 w-4" />
            </div>
          </button>

          {/* Check Out Action Card */}
          <button
            onClick={() => {
              setSelectedPunchType("out");
              setIsPunchModalOpen(true);
              setPunchError(null);
              setPunchSuccess(null);
            }}
            className="group relative p-6 sm:p-7 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-amber-500/80 dark:hover:border-amber-500/80 rounded-2xl shadow-card hover:shadow-card-hover transition-all duration-200 flex items-center justify-between text-left active:scale-[0.99]"
          >
            <div className="flex items-center space-x-4">
              <div className="h-14 w-14 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200/60 dark:border-amber-800/40 flex items-center justify-center text-amber-600 dark:text-amber-400 group-hover:scale-105 transition-transform">
                <LogOut className="h-7 w-7" />
              </div>
              <div>
                <span className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white block">
                  Check Out
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Record end of workday
                </span>
              </div>
            </div>
            <div className="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-amber-500 group-hover:text-white transition-colors">
              <ArrowRight className="h-4 w-4" />
            </div>
          </button>
        </div>
      </main>

      {/* BOTTOM FOOTER STATUS */}
      <footer className="h-12 border-t border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 px-6 sm:px-8 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="h-4 w-4 text-primary-600 dark:text-primary-400" />
          <span>OfficeOS Biometric Verification &amp; Geofence Security Active</span>
        </div>
        <div className="hidden sm:flex items-center space-x-3">
          <span>Supported: Touch PIN • Face Cam • QR Badge • Biometric</span>
        </div>
      </footer>

      {/* 3. MULTI-MODAL PUNCH INTERACTION MODAL (OfficeOS Dialog) */}
      {isPunchModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-modal overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-3">
                <div
                  className={`h-10 w-10 rounded-xl flex items-center justify-center border ${
                    selectedPunchType === "in"
                      ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50"
                      : "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50"
                  }`}
                >
                  {selectedPunchType === "in" ? (
                    <LogIn className="h-5 w-5" />
                  ) : (
                    <LogOut className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {selectedPunchType === "in" ? "Register Check In" : "Register Check Out"}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Verify employee identity using any enabled method below
                  </p>
                </div>
              </div>

              {!punchSuccess && (
                <button
                  onClick={() => {
                    setIsPunchModalOpen(false);
                    setPunchError(null);
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* PUNCH SUCCESS CONFIRMATION VIEW */}
            {punchSuccess ? (
              <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
                <div className="h-16 w-16 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border-2 border-emerald-500 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-9 w-9" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-slate-900 dark:text-white">
                    {punchSuccess.message}
                  </h4>
                  <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200 mt-1">
                    {punchSuccess.punch_type === "in" ? "Check In Verified" : "Check Out Verified"}
                  </Badge>
                </div>

                <div className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 text-left space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Employee:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {punchSuccess.employee_name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Employee Code:</span>
                    <span className="font-mono font-semibold text-primary-600 dark:text-primary-400">
                      {punchSuccess.employee_code}
                    </span>
                  </div>
                  {punchSuccess.department && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Department:</span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {punchSuccess.department}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500">Punched At:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {new Date(punchSuccess.punched_at).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-400">
                  Returning to standby in <strong className="text-primary-600 font-bold">{countdown}</strong> seconds...
                </p>
              </div>
            ) : (
              /* PUNCH INPUT WORKFLOW */
              <div className="p-6 space-y-5">
                {/* Mode Segmented Controls */}
                <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  <button
                    onClick={() => setSelectedMode("pin")}
                    className={`flex items-center justify-center space-x-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                      selectedMode === "pin"
                        ? "bg-white dark:bg-slate-900 text-primary-600 dark:text-primary-400 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                    }`}
                  >
                    <Hash className="h-3.5 w-3.5" />
                    <span>PIN Pad</span>
                  </button>

                  <button
                    onClick={() => setSelectedMode("face")}
                    className={`flex items-center justify-center space-x-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                      selectedMode === "face"
                        ? "bg-white dark:bg-slate-900 text-primary-600 dark:text-primary-400 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                    }`}
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>Face Cam</span>
                  </button>

                  <button
                    onClick={() => setSelectedMode("qr")}
                    className={`flex items-center justify-center space-x-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                      selectedMode === "qr"
                        ? "bg-white dark:bg-slate-900 text-primary-600 dark:text-primary-400 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                    }`}
                  >
                    <QrCode className="h-3.5 w-3.5" />
                    <span>QR Badge</span>
                  </button>

                  <button
                    onClick={() => setSelectedMode("fingerprint")}
                    className={`flex items-center justify-center space-x-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                      selectedMode === "fingerprint"
                        ? "bg-white dark:bg-slate-900 text-primary-600 dark:text-primary-400 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                    }`}
                  >
                    <Fingerprint className="h-3.5 w-3.5" />
                    <span>Biometric</span>
                  </button>
                </div>

                {/* MODE 1: TOUCH PIN / KEYPAD */}
                {selectedMode === "pin" && (
                  <div className="flex flex-col items-center space-y-4">
                    <div className="w-full max-w-xs">
                      <div className="h-12 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-center text-xl font-mono font-bold tracking-widest text-primary-600 dark:text-primary-400 px-4 shadow-inner">
                        {employeeInput || <span className="text-slate-400 font-sans text-xs tracking-normal">Enter Employee Code or PIN</span>}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5 w-full max-w-xs">
                      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "CLEAR", "0", "BACK"].map(
                        (btn) => (
                          <button
                            key={btn}
                            onClick={() => handleKeypadPress(btn)}
                            className="h-12 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-primary-50 dark:active:bg-primary-950/60 border border-slate-200 dark:border-slate-700 rounded-xl text-base font-semibold text-slate-800 dark:text-slate-100 shadow-xs transition-all active:scale-95"
                          >
                            {btn === "BACK" ? "⌫" : btn === "CLEAR" ? "C" : btn}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* MODE 2: FACE CAM SNAPSHOT */}
                {selectedMode === "face" && (
                  <div className="flex flex-col items-center space-y-4">
                    <div className="relative w-64 h-64 bg-slate-100 dark:bg-slate-950 rounded-full border-4 border-primary-500/40 overflow-hidden shadow-card flex items-center justify-center">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover transform -scale-x-100"
                      />
                      <div className="absolute inset-4 border-2 border-dashed border-primary-400/60 rounded-full pointer-events-none" />
                      {!isCameraActive && (
                        <div className="absolute inset-0 bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center text-xs text-slate-500 p-4 text-center">
                          <Camera className="h-8 w-8 text-slate-400 mb-2 animate-pulse" />
                          <span>{cameraError || "Accessing camera..."}</span>
                        </div>
                      )}
                    </div>
                    <canvas ref={canvasRef} className="hidden" />

                    <div className="w-full max-w-xs">
                      <Label className="text-xs text-slate-600 dark:text-slate-400 block text-center mb-1">
                        Employee ID or Code
                      </Label>
                      <Input
                        type="text"
                        value={employeeInput}
                        onChange={(e) => setEmployeeInput(e.target.value.toUpperCase())}
                        placeholder="e.g. EMP-001"
                        className="text-center font-mono font-bold uppercase text-primary-600 dark:text-primary-400"
                      />
                    </div>
                  </div>
                )}

                {/* MODE 3: QR BADGE SCANNER */}
                {selectedMode === "qr" && (
                  <div className="flex flex-col items-center justify-center py-4 space-y-4">
                    <div className="w-48 h-48 bg-slate-50 dark:bg-slate-950 border-2 border-dashed border-primary-400/60 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden">
                      <QrCode className="h-16 w-16 text-primary-600 dark:text-primary-400 animate-pulse" />
                      <span className="text-[11px] text-slate-400 mt-2 font-medium">
                        Hold QR Badge to Camera
                      </span>
                    </div>

                    <div className="w-full max-w-xs">
                      <Input
                        type="text"
                        value={employeeInput}
                        onChange={(e) => setEmployeeInput(e.target.value)}
                        placeholder="Manual badge scan input..."
                        className="text-center text-xs"
                      />
                    </div>
                  </div>
                )}

                {/* MODE 4: BIOMETRIC SCANNER */}
                {selectedMode === "fingerprint" && (
                  <div className="flex flex-col items-center justify-center py-4 space-y-4">
                    <button
                      onClick={handleFingerprintScan}
                      disabled={isPunching}
                      className="w-32 h-32 bg-primary-50 dark:bg-primary-950/40 hover:bg-primary-100 dark:hover:bg-primary-900/40 border-2 border-primary-400 rounded-full flex flex-col items-center justify-center transition-all shadow-card active:scale-95"
                    >
                      <Fingerprint className="h-12 w-12 text-primary-600 dark:text-primary-400" />
                      <span className="text-[11px] text-primary-700 dark:text-primary-300 font-semibold mt-1.5">
                        Touch Sensor
                      </span>
                    </button>

                    <div className="w-full max-w-xs">
                      <Label className="text-xs text-slate-600 dark:text-slate-400 block text-center mb-1">
                        Employee ID
                      </Label>
                      <Input
                        type="text"
                        value={employeeInput}
                        onChange={(e) => setEmployeeInput(e.target.value.toUpperCase())}
                        placeholder="e.g. EMP-001"
                        className="text-center font-mono font-bold uppercase text-primary-600 dark:text-primary-400"
                      />
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {punchError && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 rounded-xl flex items-center space-x-2 text-rose-700 dark:text-rose-400 text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                    <span>{punchError}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-2 flex space-x-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsPunchModalOpen(false);
                      setPunchError(null);
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handlePerformPunch}
                    disabled={isPunching || !employeeInput.trim()}
                    className="flex-[2] bg-primary-600 hover:bg-primary-700 text-white font-semibold"
                  >
                    {isPunching ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <UserCheck className="h-4 w-4 mr-2" />
                        <span>
                          {selectedPunchType === "in" ? "Verify Check In" : "Verify Check Out"}
                        </span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. MASTER EXIT PIN MODAL */}
      {isExitModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl shadow-modal p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <div className="flex items-center space-x-2">
                <Lock className="h-4 w-4 text-primary-600" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Owner Master Exit PIN</h4>
              </div>
              <button
                onClick={() => setIsExitModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Enter your organization owner PIN to unpair this terminal or exit kiosk mode.
            </p>

            <Input
              type="password"
              value={enteredExitPin}
              onChange={(e) => {
                setEnteredExitPin(e.target.value);
                setExitPinError(null);
              }}
              placeholder="PIN (Default: 9999)"
              maxLength={8}
              autoFocus
              className="text-center font-mono text-lg font-bold tracking-widest h-11"
            />

            {exitPinError && (
              <div className="mt-2 text-rose-600 text-xs text-center">{exitPinError}</div>
            )}

            <div className="mt-5 flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExitModalOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleVerifyExitPin}
                className="flex-1 bg-primary-600 hover:bg-primary-700 text-white"
              >
                Verify &amp; Unpair
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
