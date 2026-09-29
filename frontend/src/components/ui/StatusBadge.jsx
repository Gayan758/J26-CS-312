import React from "react";

export default function StatusBadge({
  children,
  label,
  variant = "neutral", // "critical" | "warning" | "success" | "info" | "neutral"
  dot = false,
  icon: Icon,
  className = "",
  size = "sm"
}) {
  const textContent = label || children;

  const variantStyles = {
    critical: {
      bg: "bg-critical-bg text-critical border-critical-border",
      dot: "bg-critical"
    },
    warning: {
      bg: "bg-warning-bg text-warning border-warning-border",
      dot: "bg-warning"
    },
    success: {
      bg: "bg-success-bg text-success border-success-border",
      dot: "bg-success"
    },
    info: {
      bg: "bg-info-bg text-info border-info-border",
      dot: "bg-info"
    },
    neutral: {
      bg: "bg-neutral-bg text-neutral border-neutral-border",
      dot: "bg-neutral"
    }
  }[variant] || {
    bg: "bg-neutral-bg text-neutral border-neutral-border",
    dot: "bg-neutral"
  };

  const sizeStyles = {
    xs: "text-[10px] px-1.5 py-0.5",
    sm: "text-xs px-2 py-0.5",
    md: "text-xs px-2.5 py-1"
  }[size] || "text-xs px-2 py-0.5";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium border rounded-md font-sans ${sizeStyles} ${variantStyles.bg} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${variantStyles.dot}`} />}
      {Icon && <Icon className="w-3 h-3 shrink-0" />}
      <span>{textContent}</span>
    </span>
  );
}
