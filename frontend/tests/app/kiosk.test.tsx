import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KioskPage from "@/app/kiosk/page";
import { apiClient } from "@/lib/api/client";

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe("KioskPage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders activation screen when terminal is not yet paired", async () => {
    render(<KioskPage />);

    await waitFor(() => {
      expect(screen.getByText("OfficeOS Kiosk Terminal")).toBeDefined();
      expect(screen.getAllByText("Secret Activation Code").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /Pair.*Activate Tablet/i })).toBeDefined();
    });
  });

  it("pairs tablet successfully when valid activation code is entered", async () => {
    const user = userEvent.setup();
    (apiClient.post as unknown as { mockResolvedValue: (val: unknown) => void }).mockResolvedValue({
      data: {
        kiosk_token: "mock-kiosk-token-123",
        kiosk_id: "kiosk-1",
        organization_id: "org-1",
        organization_name: "Acme Global",
        device_name: "Front Desk Tablet",
        allowed_modes: ["pin", "face", "qr"],
        exit_pin: "9999",
      },
    });

    render(<KioskPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("e.g. OS-7241-98")).toBeDefined();
    });

    const codeInput = screen.getByPlaceholderText("e.g. OS-7241-98");
    await user.type(codeInput, "OS-8492-71");

    const pairBtn = screen.getByRole("button", { name: /Pair.*Activate Tablet/i });
    await user.click(pairBtn);

    await waitFor(() => {
      expect(localStorage.getItem("officeos_kiosk_token")).toBe("mock-kiosk-token-123");
      expect(screen.getByText("Acme Global")).toBeDefined();
      expect(screen.getByRole("button", { name: /Check In/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /Check Out/i })).toBeDefined();
    });
  });

  it("renders standby terminal directly when token is already in localStorage", async () => {
    localStorage.setItem("officeos_kiosk_token", "saved-token-abc");
    localStorage.setItem("officeos_kiosk_org_name", "Cyberdyne Systems");
    localStorage.setItem("officeos_kiosk_device_name", "East Wing Terminal");

    render(<KioskPage />);

    await waitFor(() => {
      expect(screen.getByText("Cyberdyne Systems")).toBeDefined();
      expect(screen.getByText(/East Wing Terminal/)).toBeDefined();
      expect(screen.getByRole("button", { name: /Check In/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /Check Out/i })).toBeDefined();
    });
  });

  it("pairs tablet with DEMO-2026 falling back locally when network fails", async () => {
    const user = userEvent.setup();
    (apiClient.post as unknown as { mockRejectedValueOnce: (err: unknown) => void }).mockRejectedValueOnce(
      new Error("Network Error")
    );

    render(<KioskPage />);

    await waitFor(() => {
      expect(screen.getByText("DEMO-2026")).toBeDefined();
    });

    const codeInput = screen.getByPlaceholderText("e.g. OS-7241-98");
    await user.type(codeInput, "DEMO-2026");

    const pairBtn = screen.getByRole("button", { name: /Pair.*Activate Tablet/i });
    await user.click(pairBtn);

    await waitFor(() => {
      expect(localStorage.getItem("officeos_kiosk_token")).toBe("kiosk_demo_token_master_2026");
      expect(screen.getByText("OfficeOS Demo Workspace")).toBeDefined();
      expect(screen.getByRole("button", { name: /Check In/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /Check Out/i })).toBeDefined();
    });
  });
});

