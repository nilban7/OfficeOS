import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";

describe("UI Design Primitives", () => {
  describe("Button Component", () => {
    it("renders button with text correctly", () => {
      render(<Button>Click Me</Button>);
      expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
    });

    it("triggers onClick callback when clicked", () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Submit</Button>);
      fireEvent.click(screen.getByRole("button", { name: /submit/i }));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("disables button and displays loading indicator when isLoading is true", () => {
      render(<Button isLoading>Processing</Button>);
      const button = screen.getByRole("button", { name: /processing/i });
      expect(button).toBeDisabled();
    });

    it("applies variant classes accurately", () => {
      const { container } = render(<Button variant="destructive">Delete</Button>);
      expect(container.firstChild).toHaveClass("bg-red-600");
    });
  });

  describe("Input & Label Components", () => {
    it("renders input field and handles value changes", () => {
      const handleChange = vi.fn();
      render(<Input placeholder="Enter username" onChange={handleChange} />);
      const input = screen.getByPlaceholderText("Enter username");
      fireEvent.change(input, { target: { value: "testuser" } });
      expect(handleChange).toHaveBeenCalled();
    });

    it("renders error message and aria-invalid attribute when error prop is provided", () => {
      render(<Input id="email-field" error="Invalid email address" />);
      expect(screen.getByText("Invalid email address")).toBeInTheDocument();
      expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    });

    it("renders label with required asterisk when required prop is set", () => {
      render(<Label required>Email</Label>);
      expect(screen.getByText("Email")).toBeInTheDocument();
      expect(screen.getByText("*")).toBeInTheDocument();
    });
  });

  describe("Card Component", () => {
    it("renders card header, title, and content", () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Overview Card</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Card body content</p>
          </CardContent>
        </Card>
      );
      expect(screen.getByText("Overview Card")).toBeInTheDocument();
      expect(screen.getByText("Card body content")).toBeInTheDocument();
    });
  });

  describe("Badge Component", () => {
    it("renders badge with text and variant classes", () => {
      render(<Badge variant="success">Active</Badge>);
      const badge = screen.getByText("Active");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass("text-emerald-700");
    });
  });

  describe("Modal Component", () => {
    it("renders modal content when isOpen is true", () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="Test Modal">
          <p>Modal body</p>
        </Modal>
      );
      expect(screen.getByText("Test Modal")).toBeInTheDocument();
      expect(screen.getByText("Modal body")).toBeInTheDocument();
    });

    it("does not render modal when isOpen is false", () => {
      render(
        <Modal isOpen={false} onClose={vi.fn()} title="Hidden Modal">
          <p>Hidden body</p>
        </Modal>
      );
      expect(screen.queryByText("Hidden Modal")).not.toBeInTheDocument();
    });

    it("calls onClose when escape key is pressed", () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="Escape Modal">
          <p>Press Esc</p>
        </Modal>
      );
      fireEvent.keyDown(window, { key: "Escape" });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });
});
