import React, { useEffect } from "react";
import { X } from "lucide-react";

export default function Sheet({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-md", // max-w-md (448px) | max-w-lg (512px) | max-w-xl (576px)
  className = ""
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div
        className={`relative z-50 w-full ${width} bg-surface border-l border-border shadow-2xl flex flex-col h-full transform transition-transform duration-200 ease-out ${className}`}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4 bg-surface-muted">
          <div>
            <h3 className="text-sm font-semibold text-text-primary tracking-tight">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-text-muted mt-0.5 leading-normal">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-text-subtle hover:text-text-primary hover:bg-neutral-bg transition"
            aria-label="Close sheet"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-3.5 border-t border-border bg-surface-muted flex items-center justify-end gap-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
