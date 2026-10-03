import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface LoadingStateProps {
  message?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  fullPage?: boolean;
}

export function LoadingState({
  message = "Loading...",
  className,
  size = "md",
  fullPage = false,
}: LoadingStateProps) {
  const spinnerSizes = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  const content = (
    <div className={cn("flex flex-col items-center justify-center space-y-3 text-slate-500", className)}>
      <Loader2 className={cn("animate-spin text-primary-600", spinnerSizes[size])} />
      {message && <p className="text-sm font-medium animate-pulse">{message}</p>}
    </div>
  );

  if (fullPage) {
    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center p-8">
        {content}
      </div>
    );
  }

  return content;
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-200/80", className)}
      {...props}
    />
  );
}
