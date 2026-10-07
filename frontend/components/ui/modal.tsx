"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses: Record<"sm" | "md" | "lg" | "xl", string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  className,
  size = "md",
}: ModalProps) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
      aria-describedby={description ? "modal-description" : undefined}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Content */}
      <div
        className={cn(
          "relative z-50 w-full rounded-2xl bg-white p-5 sm:p-6 shadow-modal border border-slate-100 animate-in fade-in-0 zoom-in-95 duration-200 max-h-[calc(100vh-2.5rem)] flex flex-col",
          sizeClasses[size],
          className
        )}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-shrink-0">
          <div>
            {title && (
              <h2 id="modal-title" className="text-base font-semibold text-slate-900">
                {title}
              </h2>
            )}
            {description && (
              <p id="modal-description" className="mt-0.5 text-xs text-slate-500">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 overflow-y-auto flex-1 pr-1 overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
