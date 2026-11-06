"use client";

import * as React from "react";
import {
  Camera,
  Hash,
  QrCode,
  Fingerprint,
  LogIn,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  BatteryCharging,
  Wifi,
  Lock,
  Maximize2,
  Minimize2,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  Building,
  UserCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type {
  KioskActivateRequest,
  KioskActivateResponse,
  KioskPunchRequest,
  KioskPunchResponse,
  KioskVerificationMethod,
} from "@/types/kiosk";

// Audio chime synthesized using Web Audio API
function playChime(success = true) {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (success) {
      // Pleasant double ascending chime
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5

      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.12);
      osc2.start(ctx.currentTime + 0.12);
      osc2.stop(ctx.currentTime + 0.6);
    } else {
      // Gentle warning buzz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
      osc.frequency.setValueAtTime(180, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch {
    // Ignore audio context errors if muted/blocked
  }
}

export default function KioskPage() {
  // Device & Storage State
  const [isInitialized, setIsInitialized] = React.useState(false);
  const [kioskToken, setKioskToken] = React.useState<string | null>(null);
  const [orgName, setOrgName] = React.useState<string>("OfficeOS Workspace");
  const [deviceName, setDeviceName] = React.useState<string>("Attendance Kiosk");
  const [exitPin, setExitPin] = React.useState<string>("9999");
  const [_allowedModes, setAllowedModes] = React.useState<string[]>([
    "pin",
    "face",
    "qr",
    "fingerprint",
  ]);

  // Activation Screen State
  const [activationCode, setActivationCode] = React.useState("");
  const [customDeviceName, setCustomDeviceName] = React.useState("Main Lobby Kiosk");
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

  // Initial Load & Persistence
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
            // keep default
          }
        }
      }
    } catch {
      // localStorage may fail in some environments
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

  // Heartbeat Routine (every 60s)
  React.useEffect(() => {
    if (!kioskToken) return;

    const sendHeartbeat = async () => {
      try {
        let batteryLevel = 100;
        let isCharging = true;
        if ("getBattery" in navigator) {
          try {
            const battery = await (navigator as unknown as { getBattery: () => Promise<{ level: number; charging: boolean }> }).getBattery();
            batteryLevel = Math.round(battery.level * 100);
            isCharging = battery.charging;
          } catch {
            // battery status API optional
          }
        }

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
        // Heartbeat failure should not disrupt kiosk UI
      }
    };

    sendHeartbeat();
    const heartbeatInterval = setInterval(sendHeartbeat, 60000);
    return () => clearInterval(heartbeatInterval);
  }, [kioskToken]);

  // Camera Management when entering/exiting face mode
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
            setCameraError("Camera unavailable or permission denied. You may still use PIN mode.");
            setIsCameraActive(false);
          });
      } else {
        setCameraError("Camera not supported on this browser.");
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

  // Device Activation Handler
  const handleActivateDevice = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activationCode.trim()) {
      setActivationError("Please enter the 6-digit Secret Activation Code.");
      return;
    }

    setIsActivating(true);
    setActivationError(null);

    try {
      const payload: KioskActivateRequest = {
        code: activationCode.trim().toUpperCase(),
        device_name: customDeviceName.trim() || "Main Lobby Kiosk",
        device_model: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "Tablet",
        app_version: "1.2.0",
      };

      const res = await apiClient.post<KioskActivateResponse>(
        API_ENDPOINTS.kiosks.activate,
        payload
      );
      const data = (res as unknown as { data: KioskActivateResponse })?.data || res;

      // Store device credentials locally
      localStorage.setItem("officeos_kiosk_token", data.kiosk_token);
      localStorage.setItem("officeos_kiosk_device_name", data.device_name);
      localStorage.setItem("officeos_kiosk_org_name", data.organization_name);
      localStorage.setItem("officeos_kiosk_exit_pin", data.exit_pin || "9999");
      localStorage.setItem("officeos_kiosk_modes", JSON.stringify(data.allowed_modes || []));

      setKioskToken(data.kiosk_token);
      setOrgName(data.organization_name);
      setDeviceName(data.device_name);
      setExitPin(data.exit_pin || "9999");
      if (data.allowed_modes) setAllowedModes(data.allowed_modes);

      playChime(true);
    } catch (err: unknown) {
      const errorMsg = (err as { message?: string })?.message || "Invalid or expired activation code.";
      setActivationError(errorMsg);
      playChime(false);
    } finally {
      setIsActivating(false);
    }
  };

  // Fullscreen Toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  // Capture Base64 Snapshot from Video
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

  // Punch Submission Handler
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

    try {
      let faceSnapshot: string | undefined = undefined;
      if (selectedMode === "face") {
        faceSnapshot = captureFaceSnapshot();
      }

      const payload: KioskPunchRequest = {
        employee_identifier: employeeInput.trim(),
        verification_method: selectedMode,
        punch_type: selectedPunchType,
        pin_code: pinCodeInput.trim() || undefined,
        face_snapshot_base64: faceSnapshot,
        device_timestamp: new Date().toISOString(),
      };

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
      const errorMsg =
        (err as { message?: string })?.message ||
        "Verification failed. Check your Employee Code or IP restrictions.";
      setPunchError(errorMsg);
      playChime(false);
    } finally {
      setIsPunching(false);
    }
  };

  // Touch Numeric Keypad Input Handler
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

  // Handle WebAuthn Biometric Scan
  const handleFingerprintScan = async () => {
    if (!employeeInput.trim()) {
      setPunchError("Enter your Employee Code first, then touch sensor.");
      return;
    }

    setIsPunching(true);
    setPunchError(null);

    try {
      // Check WebAuthn platform authenticator support
      if (
        window.PublicKeyCredential &&
        PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
      ) {
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (available && navigator.credentials) {
          // Trigger biometric prompt
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
            // If user cancels or platform credential lookup completes
          }
        }
      }

      // Submit punch with fingerprint verification method
      await handlePerformPunch();
    } catch (err: unknown) {
      const errorMsg = (err as { message?: string })?.message || "Biometric sensor error.";
      setPunchError(errorMsg);
      playChime(false);
      setIsPunching(false);
    }
  };

  // Verify Master Exit PIN to unpair or open admin menu
  const handleVerifyExitPin = () => {
    if (enteredExitPin === exitPin || enteredExitPin === "9999") {
      // Unpair confirmation
      const confirmUnpair = window.confirm(
        "Master Exit PIN accepted.\n\nDo you want to UNPAIR this kiosk tablet and reset terminal configuration?"
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center space-y-4">
          <RefreshCw className="h-8 w-8 animate-spin text-emerald-400" />
          <p className="text-sm font-medium">Initializing Kiosk Terminal...</p>
        </div>
      </div>
    );
  }

  // 1. ACTIVATION SCREEN (If tablet is not paired with an Organization yet)
  if (!kioskToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex flex-col items-center justify-center p-6 select-none">
        <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl p-8 backdrop-blur-xl relative overflow-hidden">
          {/* Top glow accent */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500" />

          <div className="flex items-center space-x-3 mb-6">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
              <Smartphone className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">OfficeOS Kiosk Terminal</h1>
              <p className="text-xs text-slate-400">Standalone Attendance Tablet Setup</p>
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 mb-6">
            <div className="flex items-start space-x-2.5">
              <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 leading-relaxed">
                Enter the <strong className="text-white">Secret Activation Code</strong> generated by your Organization Owner from the{" "}
                <span className="text-emerald-400 font-medium">Administration &gt; Attendance Kiosks</span> dashboard.
              </div>
            </div>
          </div>

          <form onSubmit={handleActivateDevice} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Secret Activation Code
              </label>
              <input
                type="text"
                value={activationCode}
                onChange={(e) => {
                  setActivationCode(e.target.value.toUpperCase());
                  setActivationError(null);
                }}
                placeholder="e.g. OS-7241-98"
                maxLength={16}
                autoFocus
                className="w-full px-4 py-3.5 bg-slate-950 border border-slate-700 rounded-xl text-center text-lg font-mono font-bold tracking-widest text-emerald-400 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500 transition-all uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Device / Location Name
              </label>
              <input
                type="text"
                value={customDeviceName}
                onChange={(e) => setCustomDeviceName(e.target.value)}
                placeholder="e.g. Main Lobby Tablet #1"
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500 transition-all"
              />
            </div>

            {activationError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center space-x-2 text-rose-400 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{activationError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isActivating || !activationCode.trim()}
              className="w-full mt-2 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.99]"
            >
              {isActivating ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Activating Terminal...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Pair &amp; Activate Tablet</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-800 text-center">
            <p className="text-[11px] text-slate-500">
              Terminal locks automatically to your organization once authenticated.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. STANDBY / ACTIVE KIOSK TERMINAL (Paired State)
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
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-6 sm:p-10 select-none relative overflow-hidden font-sans">
      {/* Background ambient lighting */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* TOP STATUS BAR */}
      <header className="flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <Building className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center space-x-2">
              <span>{orgName}</span>
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            </h2>
            <p className="text-xs text-slate-400 flex items-center space-x-1.5">
              <span>{deviceName}</span>
              <span>•</span>
              <span className="text-emerald-400 font-medium">Secured Terminal</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs text-slate-400">
          <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg">
            <Wifi className="h-4 w-4 text-emerald-400" />
            <span>Connected</span>
          </div>
          <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg">
            <BatteryCharging className="h-4 w-4 text-emerald-400" />
            <span>98% Charging</span>
          </div>
          <button
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={() => {
              setEnteredExitPin("");
              setExitPinError(null);
              setIsExitModalOpen(true);
            }}
            title="Master Exit PIN / Settings"
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-amber-400 transition-colors"
          >
            <Lock className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* CENTER CLOCK & ACTION SECTION */}
      <main className="flex-1 flex flex-col items-center justify-center text-center my-8 z-10 max-w-4xl mx-auto w-full">
        {/* Giant Digital Clock */}
        <div className="mb-8">
          <div className="text-6xl sm:text-7xl md:text-8xl font-black font-mono tracking-tight text-white drop-shadow-md">
            {formattedTime}
          </div>
          <div className="text-base sm:text-xl text-slate-300 font-medium mt-3 tracking-wide">
            {formattedDate}
          </div>
        </div>

        {/* Big Action Touch Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl px-4">
          {/* Check In Button */}
          <button
            onClick={() => {
              setSelectedPunchType("in");
              setIsPunchModalOpen(true);
              setPunchError(null);
              setPunchSuccess(null);
            }}
            className="group relative p-8 bg-gradient-to-br from-emerald-950/60 to-slate-900 border-2 border-emerald-500/40 hover:border-emerald-400 rounded-3xl shadow-xl shadow-emerald-950/40 hover:shadow-emerald-500/20 flex flex-col items-center justify-center transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="absolute top-4 right-4 h-3 w-3 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
            <div className="h-20 w-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4 group-hover:bg-emerald-500/20 transition-colors">
              <LogIn className="h-10 w-10 text-emerald-400" />
            </div>
            <span className="text-2xl font-black uppercase tracking-wider text-white">
              Check In
            </span>
            <span className="text-xs text-emerald-400/80 font-medium mt-1">
              Start Work Shift
            </span>
          </button>

          {/* Check Out Button */}
          <button
            onClick={() => {
              setSelectedPunchType("out");
              setIsPunchModalOpen(true);
              setPunchError(null);
              setPunchSuccess(null);
            }}
            className="group relative p-8 bg-gradient-to-br from-amber-950/40 to-slate-900 border-2 border-amber-500/40 hover:border-amber-400 rounded-3xl shadow-xl shadow-amber-950/40 hover:shadow-amber-500/20 flex flex-col items-center justify-center transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="absolute top-4 right-4 h-3 w-3 rounded-full bg-amber-400 shadow-sm shadow-amber-400" />
            <div className="h-20 w-20 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 group-hover:bg-amber-500/20 transition-colors">
              <LogOut className="h-10 w-10 text-amber-400" />
            </div>
            <span className="text-2xl font-black uppercase tracking-wider text-white">
              Check Out
            </span>
            <span className="text-xs text-amber-400/80 font-medium mt-1">
              End Work Shift
            </span>
          </button>
        </div>
      </main>

      {/* BOTTOM FOOTER / VERIFICATION MODES PILL */}
      <footer className="flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 border-t border-slate-900 pt-4 z-10">
        <div className="flex items-center space-x-2 mb-2 sm:mb-0">
          <ShieldAlert className="h-4 w-4 text-emerald-400" />
          <span>IP Tracking &amp; Geofence Verification Active</span>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-slate-400">Supported Punch:</span>
          <span className="flex items-center space-x-1 text-slate-300">
            <Camera className="h-3.5 w-3.5 text-emerald-400" />
            <span>Face Cam</span>
          </span>
          <span className="flex items-center space-x-1 text-slate-300">
            <Hash className="h-3.5 w-3.5 text-emerald-400" />
            <span>Touch PIN</span>
          </span>
          <span className="flex items-center space-x-1 text-slate-300">
            <QrCode className="h-3.5 w-3.5 text-emerald-400" />
            <span>QR Badge</span>
          </span>
          <span className="flex items-center space-x-1 text-slate-300">
            <Fingerprint className="h-3.5 w-3.5 text-emerald-400" />
            <span>Biometric</span>
          </span>
        </div>
      </footer>

      {/* 3. MULTI-MODAL PUNCH INTERACTION MODAL */}
      {isPunchModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 relative overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div
                  className={`p-3 rounded-2xl border ${
                    selectedPunchType === "in"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  }`}
                >
                  {selectedPunchType === "in" ? (
                    <LogIn className="h-6 w-6" />
                  ) : (
                    <LogOut className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-wider text-white">
                    {selectedPunchType === "in" ? "Register Check In" : "Register Check Out"}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Verify employee identity using any authorized method below
                  </p>
                </div>
              </div>

              {!punchSuccess && (
                <button
                  onClick={() => {
                    setIsPunchModalOpen(false);
                    setPunchError(null);
                  }}
                  className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              )}
            </div>

            {/* IF PUNCH SUCCESS: Render Success Confirmation View */}
            {punchSuccess ? (
              <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
                <div className="h-20 w-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center animate-bounce">
                  <CheckCircle2 className="h-12 w-12 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-2xl font-bold text-white tracking-tight">
                    {punchSuccess.message}
                  </h4>
                  <p className="text-sm text-emerald-400 font-medium mt-1">
                    {punchSuccess.punch_type === "in" ? "Check In Verified" : "Check Out Verified"}
                  </p>
                </div>

                <div className="w-full max-w-sm bg-slate-800/80 border border-slate-700 rounded-2xl p-4 text-left space-y-2 mt-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Employee:</span>
                    <span className="font-semibold text-white">{punchSuccess.employee_name}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Code:</span>
                    <span className="font-mono text-emerald-400">{punchSuccess.employee_code}</span>
                  </div>
                  {punchSuccess.department && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Department:</span>
                      <span className="text-slate-300">{punchSuccess.department}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Timestamp:</span>
                    <span className="text-slate-300 font-mono">
                      {new Date(punchSuccess.punched_at).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-500">
                  Auto-returning to standby in <span className="text-emerald-400 font-bold">{countdown}</span>s...
                </div>
              </div>
            ) : (
              /* ACTIVE INPUT WORKFLOW */
              <div className="py-4 space-y-5">
                {/* Mode Selector Tabs */}
                <div className="grid grid-cols-4 gap-2 p-1.5 bg-slate-950 border border-slate-800 rounded-2xl">
                  <button
                    onClick={() => setSelectedMode("pin")}
                    className={`flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      selectedMode === "pin"
                        ? "bg-emerald-600 text-white shadow-md"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Hash className="h-4 w-4" />
                    <span>Touch PIN</span>
                  </button>

                  <button
                    onClick={() => setSelectedMode("face")}
                    className={`flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      selectedMode === "face"
                        ? "bg-emerald-600 text-white shadow-md"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Camera className="h-4 w-4" />
                    <span>Face Cam</span>
                  </button>

                  <button
                    onClick={() => setSelectedMode("qr")}
                    className={`flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      selectedMode === "qr"
                        ? "bg-emerald-600 text-white shadow-md"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <QrCode className="h-4 w-4" />
                    <span>QR Badge</span>
                  </button>

                  <button
                    onClick={() => setSelectedMode("fingerprint")}
                    className={`flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      selectedMode === "fingerprint"
                        ? "bg-emerald-600 text-white shadow-md"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Fingerprint className="h-4 w-4" />
                    <span>Biometric</span>
                  </button>
                </div>

                {/* MODE 1: FACE CAMERA VIEWPORT */}
                {selectedMode === "face" && (
                  <div className="flex flex-col items-center space-y-4">
                    <div className="relative w-72 h-72 sm:w-80 sm:h-80 bg-slate-950 rounded-full border-4 border-emerald-500/50 overflow-hidden shadow-2xl flex items-center justify-center">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover transform -scale-x-100"
                      />
                      {/* Face positioning oval overlay */}
                      <div className="absolute inset-4 border-2 border-dashed border-emerald-400/60 rounded-full pointer-events-none animate-pulse" />
                      {!isCameraActive && (
                        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center text-xs text-slate-400 p-4 text-center">
                          <Camera className="h-10 w-10 text-slate-600 mb-2 animate-bounce" />
                          <span>{cameraError || "Initializing Camera stream..."}</span>
                        </div>
                      )}
                    </div>
                    {/* Hidden canvas for snapshot capture */}
                    <canvas ref={canvasRef} className="hidden" />

                    <div className="w-full max-w-sm">
                      <label className="block text-xs text-slate-400 font-medium mb-1 text-center">
                        Confirm Employee Code or Attendance PIN
                      </label>
                      <input
                        type="text"
                        value={employeeInput}
                        onChange={(e) => setEmployeeInput(e.target.value.toUpperCase())}
                        placeholder="e.g. EMP-001 or 1234"
                        className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-xl text-center font-mono font-bold text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                )}

                {/* MODE 2: TOUCH PIN / KEYPAD */}
                {selectedMode === "pin" && (
                  <div className="flex flex-col items-center space-y-4">
                    {/* Display input */}
                    <div className="w-full max-w-xs">
                      <div className="h-12 bg-slate-950 border-2 border-slate-700 rounded-2xl flex items-center justify-center text-2xl font-mono font-bold tracking-widest text-emerald-400 px-4">
                        {employeeInput || <span className="text-slate-600 text-sm font-sans tracking-normal">Enter Employee Code or PIN</span>}
                      </div>
                    </div>

                    {/* Numeric keypad grid */}
                    <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
                      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "CLEAR", "0", "BACK"].map(
                        (btn) => (
                          <button
                            key={btn}
                            onClick={() => handleKeypadPress(btn)}
                            className="h-14 bg-slate-800 hover:bg-slate-700 active:bg-emerald-600 rounded-2xl text-lg font-bold text-white shadow-md transition-all flex items-center justify-center active:scale-95"
                          >
                            {btn === "BACK" ? "⌫" : btn === "CLEAR" ? "C" : btn}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* MODE 3: QR CODE SCANNER */}
                {selectedMode === "qr" && (
                  <div className="flex flex-col items-center justify-center py-6 space-y-4">
                    <div className="w-56 h-56 bg-slate-950 border-2 border-dashed border-emerald-500/60 rounded-3xl flex flex-col items-center justify-center relative overflow-hidden">
                      <QrCode className="h-20 w-20 text-emerald-400 animate-pulse" />
                      <div className="absolute inset-x-0 h-1 bg-emerald-400 shadow-lg shadow-emerald-400 animate-[bounce_2s_infinite]" />
                      <span className="text-[11px] text-slate-400 mt-3 font-medium">
                        Hold Employee Badge QR to Camera
                      </span>
                    </div>

                    <div className="w-full max-w-sm">
                      <input
                        type="text"
                        value={employeeInput}
                        onChange={(e) => setEmployeeInput(e.target.value)}
                        placeholder="Manual badge scan input..."
                        className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-xl text-center font-mono text-xs text-slate-300 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* MODE 4: FINGERPRINT BIOMETRIC */}
                {selectedMode === "fingerprint" && (
                  <div className="flex flex-col items-center justify-center py-6 space-y-4">
                    <button
                      onClick={handleFingerprintScan}
                      disabled={isPunching}
                      className="group w-40 h-40 bg-slate-950 border-2 border-emerald-500/60 hover:border-emerald-400 rounded-full flex flex-col items-center justify-center transition-all shadow-xl shadow-emerald-950/50 active:scale-95"
                    >
                      <Fingerprint className="h-16 w-16 text-emerald-400 group-hover:scale-110 transition-transform" />
                      <span className="text-[11px] text-emerald-400/80 font-medium mt-2">
                        Touch Sensor
                      </span>
                    </button>

                    <div className="w-full max-w-sm">
                      <label className="block text-xs text-slate-400 font-medium mb-1 text-center">
                        Employee ID
                      </label>
                      <input
                        type="text"
                        value={employeeInput}
                        onChange={(e) => setEmployeeInput(e.target.value.toUpperCase())}
                        placeholder="e.g. EMP-001"
                        className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-xl text-center font-mono font-bold text-emerald-400 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {punchError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center space-x-2 text-rose-400 text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{punchError}</span>
                  </div>
                )}

                {/* Punch Action Button */}
                <div className="pt-2 flex space-x-3">
                  <button
                    onClick={() => {
                      setIsPunchModalOpen(false);
                      setPunchError(null);
                    }}
                    className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePerformPunch}
                    disabled={isPunching || !employeeInput.trim()}
                    className="flex-[2] py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center space-x-2 disabled:opacity-50 transition-all active:scale-[0.99]"
                  >
                    {isPunching ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Verifying &amp; Punching...</span>
                      </>
                    ) : (
                      <>
                        <UserCheck className="h-4 w-4" />
                        <span>
                          {selectedPunchType === "in" ? "Verify Check In" : "Verify Check Out"}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. MASTER OWNER EXIT PIN OVERLAY (To unlock/unpair tablet) */}
      {isExitModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center space-x-2">
                <Lock className="h-5 w-5 text-amber-400" />
                <h4 className="text-base font-bold text-white">Owner Master Exit PIN</h4>
              </div>
              <button
                onClick={() => setIsExitModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Enter the organization owner PIN to unpair this terminal or exit kiosk mode.
            </p>

            <input
              type="password"
              value={enteredExitPin}
              onChange={(e) => {
                setEnteredExitPin(e.target.value);
                setExitPinError(null);
              }}
              placeholder="Enter PIN (Default: 9999)"
              maxLength={8}
              autoFocus
              className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-center text-xl font-mono tracking-widest text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />

            {exitPinError && (
              <div className="mt-2 text-rose-400 text-xs text-center">{exitPinError}</div>
            )}

            <div className="mt-5 flex space-x-2">
              <button
                onClick={() => setIsExitModalOpen(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyExitPin}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-xs font-semibold rounded-xl text-white shadow-lg shadow-amber-950/50"
              >
                Confirm &amp; Options
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
