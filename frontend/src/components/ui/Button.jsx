import React from "react";
import { Loader2 } from "lucide-react";

export default function Button({
  children,
  variant = "secondary", // "primary" | "secondary" | "ghost" | "critical"
  size = "md", // "sm" | "md" | "lg"
  loading = false,
  disabled = false,
  icon: Icon,
  iconPosition = "left",
  className = "",
  type = "button",
  onClick,
  ...props
}) {
  const baseClasses =
    "inline-flex items-center justify-center font-medium transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed rounded-md";

  const sizeClasses = {
    sm: "h-7 text-xs px-2.5 gap-1.5",
    md: "h-9 text-xs px-3.5 gap-2",
    lg: "h-10 text-sm px-4 gap-2",
  }[size] || "h-9 text-xs px-3.5 gap-2";

  const variantClasses = {
    primary:
      "bg-primary hover:bg-primary-hover text-white shadow-sm border border-transparent",
    secondary:
      "bg-surface hover:bg-surface-muted text-text-primary border border-border shadow-xs",
    ghost:
      "bg-transparent hover:bg-surface-muted text-text-muted hover:text-text-primary border border-transparent",
    critical:
      "bg-critical hover:bg-[#912018] text-white shadow-xs border border-transparent active:scale-[0.98]",
  }[variant] || "bg-surface hover:bg-surface-muted text-text-primary border border-border";

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : Icon && iconPosition === "left" ? (
        <Icon className="w-3.5 h-3.5 shrink-0" />
      ) : null}
      <span>{children}</span>
      {!loading && Icon && iconPosition === "right" && (
        <Icon className="w-3.5 h-3.5 shrink-0" />
      )}
    </button>
  );
}
