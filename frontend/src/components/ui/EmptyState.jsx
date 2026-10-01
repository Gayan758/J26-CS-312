import React from "react";
import Button from "./Button";

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className = ""
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center border border-dashed border-border rounded-lg bg-surface-muted/50 ${className}`}
    >
      {Icon && (
        <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center text-text-subtle mb-3 shadow-xs">
          <Icon className="w-5 h-5" />
        </div>
      )}
      <h4 className="text-xs font-semibold text-text-primary tracking-tight">
        {title}
      </h4>
      {description && (
        <p className="text-xs text-text-muted mt-1 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <div className="mt-4">
          <Button variant="primary" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
