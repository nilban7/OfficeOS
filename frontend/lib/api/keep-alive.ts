/**
 * OfficeOS Backend Keep-Alive Heartbeat Manager.
 *
 * Free-tier and hobby cloud instances (e.g. Render, Railway) sleep after 15 minutes of inactivity.
 * When a user accesses the platform, cold starts take 45–60 seconds.
 *
 * This utility:
 * 1. Immediately sends a gentle, non-blocking wake-up ping to `/health` on app load.
 * 2. Runs a background heartbeat every 4 minutes while the app is open to prevent idle spin-down.
 * 3. Wakes the server when the user returns to the tab (via `visibilitychange`).
 * 4. Exposes an observable server status (isWakingUp, isHealthy) for non-intrusive UI feedback.
 */

import { env } from "@/lib/config/env";

type ServerStatusListener = (status: { isWakingUp: boolean; isHealthy: boolean; lastChecked: Date | null }) => void;

class KeepAliveManager {
  private static instance: KeepAliveManager;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastPingTimestamp = 0;
  private isWakingUp = false;
  private isHealthy = true;
  private lastChecked: Date | null = null;
  private listeners: Set<ServerStatusListener> = new Set();
  private started = false;

  private constructor() {}

  public static getInstance(): KeepAliveManager {
    if (!KeepAliveManager.instance) {
      KeepAliveManager.instance = new KeepAliveManager();
    }
    return KeepAliveManager.instance;
  }

  public subscribe(listener: ServerStatusListener): () => void {
    this.listeners.add(listener);
    // Immediately emit current state
    listener({
      isWakingUp: this.isWakingUp,
      isHealthy: this.isHealthy,
      lastChecked: this.lastChecked,
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((fn) =>
      fn({
        isWakingUp: this.isWakingUp,
        isHealthy: this.isHealthy,
        lastChecked: this.lastChecked,
      })
    );
  }

  private getEffectiveBaseUrl(): string {
    let base = env.apiUrl.replace(/\/+$/, "");
    if (
      typeof window !== "undefined" &&
      window.location.hostname &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1"
    ) {
      const isLanIp = /^(?:192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(window.location.hostname);
      if (isLanIp) {
        try {
          const parsed = new URL(base);
          if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
            parsed.hostname = window.location.hostname;
            return parsed.toString().replace(/\/+$/, "");
          }
        } catch {
          // ignore
        }
      }
    }
    return base;
  }

  /**
   * Pings the root health check or API health endpoint.
   */
  public async ping(): Promise<boolean> {
    if (typeof window === "undefined") return true;

    const base = this.getEffectiveBaseUrl();
    // Resolve health endpoint: if base ends with /api/v1, root /health is at origin
    let healthUrl = `${base}/health`;
    try {
      const parsed = new URL(base);
      healthUrl = `${parsed.origin}/health`;
    } catch {
      healthUrl = `${base}/health`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      this.isWakingUp = true;
      this.notify();
    }, 3000); // If ping takes > 3s, flag that the server is cold-starting

    const timeout = setTimeout(() => controller.abort(), 65000); // 65s max for cold boot

    try {
      const res = await fetch(healthUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timer);
      clearTimeout(timeout);

      this.isWakingUp = false;
      this.isHealthy = res.ok;
      this.lastChecked = new Date();
      this.lastPingTimestamp = Date.now();
      this.notify();
      return res.ok;
    } catch {
      clearTimeout(timer);
      clearTimeout(timeout);

      // Fallback: try /api/v1/health if root /health didn't respond
      try {
        const fallbackRes = await fetch(`${base}/health`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        this.isWakingUp = false;
        this.isHealthy = fallbackRes.ok;
        this.lastChecked = new Date();
        this.lastPingTimestamp = Date.now();
        this.notify();
        return fallbackRes.ok;
      } catch {
        this.isWakingUp = false;
        this.isHealthy = false;
        this.lastChecked = new Date();
        this.notify();
        return false;
      }
    }
  }

  /**
   * Starts the background keep-alive loop and registers lifecycle event listeners.
   */
  public start(): () => void {
    if (this.started || typeof window === "undefined") {
      return () => {};
    }

    this.started = true;

    // 1. Initial wake-up ping
    void this.ping();

    // 2. Periodic heartbeat every 4 minutes (240,000ms)
    // Render free tier sleeps after 15 min, so 4 min is comfortably below threshold.
    this.intervalId = setInterval(() => {
      void this.ping();
    }, 4 * 60 * 1000);

    // 3. Tab visibility listener
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const elapsed = Date.now() - this.lastPingTimestamp;
        // If tab was inactive for > 3 minutes, ping to keep server warm
        if (elapsed > 3 * 60 * 1000) {
          void this.ping();
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      this.started = false;
    };
  }

  public getStatus() {
    return {
      isWakingUp: this.isWakingUp,
      isHealthy: this.isHealthy,
      lastChecked: this.lastChecked,
    };
  }
}

export const keepAlive = KeepAliveManager.getInstance();
