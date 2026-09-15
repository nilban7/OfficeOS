import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LoadingState } from "@/components/feedback/loading-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";

describe("Feedback Components", () => {
  describe("LoadingState", () => {
    it("renders default message", () => {
      render(<LoadingState />);
      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("renders custom message", () => {
      render(<LoadingState message="Fetching data..." />);
      expect(screen.getByText("Fetching data...")).toBeInTheDocument();
    });
  });

  describe("EmptyState", () => {
    it("renders title and description", () => {
      render(
        <EmptyState
          title="No items found"
          description="There are currently no records to display."
        />
      );
      expect(screen.getByText("No items found")).toBeInTheDocument();
      expect(
        screen.getByText("There are currently no records to display.")
      ).toBeInTheDocument();
    });

    it("renders action button and triggers onAction when clicked", () => {
      const handleAction = vi.fn();
      render(
        <EmptyState
          title="No items"
          actionLabel="Create New Item"
          onAction={handleAction}
        />
      );
      const button = screen.getByRole("button", { name: /create new item/i });
      fireEvent.click(button);
      expect(handleAction).toHaveBeenCalledTimes(1);
    });
  });

  describe("ErrorState", () => {
    it("renders error title, message, and error code", () => {
      render(
        <ErrorState
          title="Failed to Load"
          message="Server returned error 500."
          errorCode="ERR_SERVER_500"
        />
      );
      expect(screen.getByText("Failed to Load")).toBeInTheDocument();
      expect(screen.getByText("Server returned error 500.")).toBeInTheDocument();
      expect(screen.getByText("Code: ERR_SERVER_500")).toBeInTheDocument();
    });

    it("renders retry button and triggers callback", () => {
      const handleRetry = vi.fn();
      render(<ErrorState onRetry={handleRetry} />);
      const retryButton = screen.getByRole("button", { name: /try again/i });
      fireEvent.click(retryButton);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });
  });
});
