import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils/cn";
import { validateClientEnv } from "@/lib/config/env";

describe("Utility Functions", () => {
  describe("cn (classnames merge)", () => {
    it("merges multiple string classes", () => {
      expect(cn("px-4", "py-2")).toBe("px-4 py-2");
    });

    it("handles conditional classes properly", () => {
      const isVisible = false;
      const isActive = true;
      expect(cn("base-class", isVisible && "hidden", isActive && "active-class")).toBe(
        "base-class active-class"
      );
    });

    it("correctly resolves Tailwind class collisions using tailwind-merge", () => {
      expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
      expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
    });
  });

  describe("Environment Configuration Validator", () => {
    it("reports missing variables when environment is unconfigured", () => {
      const result = validateClientEnv();
      expect(typeof result.isValid).toBe("boolean");
      expect(Array.isArray(result.missing)).toBe(true);
    });
  });
});
