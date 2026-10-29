import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive" | "link";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      children,
      type = "button",
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-all duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/80 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 select-none";

    const variants: Record<string, string> = {
      primary:
        "bg-primary-600 text-white shadow-subtle hover:bg-primary-700 hover:shadow-card active:bg-primary-800",
      secondary:
        "bg-slate-100/90 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-700 active:bg-slate-200 dark:active:bg-slate-600",
      outline:
        "border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 shadow-subtle hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 active:bg-slate-100/80 dark:active:bg-slate-700",
      ghost:
        "bg-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800 active:bg-slate-200/70 dark:active:bg-slate-700",
      destructive:
        "bg-red-600 text-white shadow-subtle hover:bg-red-700 hover:shadow-card active:bg-red-800",
      link: "text-primary-600 dark:text-primary-400 underline-offset-4 hover:underline p-0 h-auto active:scale-100",
    };

    const sizes: Record<string, string> = {
      sm: "h-8 px-2.5 text-xs rounded-lg gap-1.5",
      md: "h-9 px-3.5 py-2 text-xs sm:text-sm rounded-lg gap-2",
      lg: "h-11 px-5 text-sm sm:text-base rounded-lg gap-2.5",
      icon: "h-9 w-9 p-2 rounded-lg",
    };

    return (
      <button
        ref={ref}
        type={type}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
