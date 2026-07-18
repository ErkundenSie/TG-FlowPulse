"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "../../lib/utils";

interface ToastProps {
  message: string;
  type?: "success" | "error" | "info";
  duration?: number;
  onClose: () => void;
}

export function Toast({
  message,
  type = "info",
  duration = 4000,
  onClose,
}: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(onClose, 220);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const styles = {
    success: {
      shell:
        "border-emerald-500/25 bg-card/95 text-foreground shadow-[0_12px_40px_-12px_rgba(16,185,129,0.35)]",
      icon: "bg-emerald-500/15 text-emerald-500",
      accent: "from-emerald-500/20 to-transparent",
    },
    error: {
      shell:
        "border-rose-500/25 bg-card/95 text-foreground shadow-[0_12px_40px_-12px_rgba(244,63,94,0.35)]",
      icon: "bg-rose-500/15 text-rose-500",
      accent: "from-rose-500/20 to-transparent",
    },
    info: {
      shell:
        "border-primary/25 bg-card/95 text-foreground shadow-[0_12px_40px_-12px_rgba(139,92,246,0.3)]",
      icon: "bg-primary/15 text-primary",
      accent: "from-primary/20 to-transparent",
    },
  }[type];

  const icon = {
    success: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    info: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  }[type];

  return (
    <div
      className={cn(
        isExiting ? "toast-exit" : "toast-enter",
        "relative flex items-center gap-3 px-4 py-3 rounded-2xl border backdrop-blur-xl min-w-[280px] max-w-[400px] overflow-hidden",
        styles.shell
      )}
      role="status"
    >
      <div className={cn("absolute inset-y-0 left-0 w-1 bg-gradient-to-b", styles.accent)} />
      <div className={cn("p-2 rounded-xl shrink-0", styles.icon)}>{icon}</div>
      <p className="text-sm font-medium text-foreground/90 flex-1 leading-snug">
        {message}
      </p>
      <button
        type="button"
        onClick={() => {
          setIsExiting(true);
          setTimeout(onClose, 220);
        }}
        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Close"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Array<{
    id: string;
    message: string;
    type: "success" | "error" | "info";
  }>;
  removeToast: (id: string) => void;
}

export function ToastContainer({ toasts, removeToast }: ToastContainerProps) {
  return (
    <div className="fixed bottom-6 right-6 z-[1000] flex flex-col gap-2.5 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<
    Array<{ id: string; message: string; type: "success" | "error" | "info" }>
  >([]);

  const addToast = useCallback(
    (message: string, type: "success" | "error" | "info" = "info") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, message, type }].slice(-5));
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}
