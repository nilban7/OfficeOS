import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { keepAlive } from "@/lib/api/keep-alive";

describe("KeepAliveManager", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("subscribes to status updates and performs ping", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok" }),
    });

    const statusUpdates: boolean[] = [];
    const unsubscribe = keepAlive.subscribe((status) => {
      statusUpdates.push(status.isHealthy);
    });

    const isHealthy = await keepAlive.ping();
    expect(isHealthy).toBe(true);
    expect(global.fetch).toHaveBeenCalled();
    expect(statusUpdates.length).toBeGreaterThan(0);

    unsubscribe();
  });

  it("starts and stops keep-alive loop cleanly", () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const stop = keepAlive.start();
    expect(typeof stop).toBe("function");

    // Stopping should not throw
    expect(() => stop()).not.toThrow();
  });
});
