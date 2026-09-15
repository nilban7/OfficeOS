import * as React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  errorCode?: string;
  onRetry?: () => void;
  className?: string;
  isRetrying?: boolean;
}

export function ErrorState({
  title = "Something went wrong",
  message = "An error occurred while communicating with the server. Please try again.",
  errorCode,
  onRetry,
  className,
  isRetrying = false,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50/50 p-8 text-center",
        className
      )}
      role="alert"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 mb-4">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-slate-600 leading-relaxed">
        {message}
      </p>
      {errorCode && (
        <span className="mt-2 inline-block rounded bg-red-100/80 px-2 py-0.5 font-mono text-xs text-red-700">
          Code: {errorCode}
        </span>
      )}
      {onRetry && (
        <div className="mt-5">
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            isLoading={isRetrying}
            className="border-red-300 text-red-700 hover:bg-red-100 hover:border-red-400"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}
