"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DownloadSimple,
  Spinner,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import { getToken } from "../lib/auth";
import {
  cancelImportAccountChatsJob,
  ChatMigrationImportJobResponse,
  getImportAccountChatsJob,
} from "../lib/api";
import { useLanguage } from "../context/LanguageContext";

const CHAT_IMPORT_JOB_STORAGE_KEY = "tg-flowpulse-chat-import-job-id";
const CHAT_IMPORT_FLOAT_POSITION_KEY =
  "tg-flowpulse-chat-import-float-position";
const ACTIVE_JOB_STATUSES = ["running", "canceling"];

type FloatPosition = {
  x: number;
  y: number;
};

const isActiveJob = (job?: ChatMigrationImportJobResponse | null) =>
  Boolean(job && ACTIVE_JOB_STATUSES.includes(job.status));

const statusClassName = (status: string) => {
  if (status === "completed") {
    return "bg-emerald-500/15 text-emerald-500 border-emerald-500/20";
  }
  if (status === "failed") {
    return "bg-rose-500/15 text-rose-500 border-rose-500/20";
  }
  if (status === "canceled") {
    return "bg-slate-500/15 text-slate-500 border-slate-500/20";
  }
  if (status === "canceling") {
    return "bg-amber-500/15 text-amber-500 border-amber-500/20";
  }
  return "bg-sky-500/15 text-sky-500 border-sky-500/20";
};

const getDefaultPosition = (): FloatPosition => {
  if (typeof window === "undefined") return { x: 24, y: 24 };
  return {
    x: Math.max(16, window.innerWidth - 88),
    y: Math.max(16, window.innerHeight - 88),
  };
};

const clampPosition = (position: FloatPosition): FloatPosition => {
  if (typeof window === "undefined") return position;
  return {
    x: Math.min(Math.max(12, position.x), Math.max(12, window.innerWidth - 68)),
    y: Math.min(
      Math.max(12, position.y),
      Math.max(12, window.innerHeight - 68),
    ),
  };
};

const loadStoredPosition = () => {
  if (typeof window === "undefined") return getDefaultPosition();
  try {
    const stored = localStorage.getItem(CHAT_IMPORT_FLOAT_POSITION_KEY);
    if (!stored) return getDefaultPosition();
    const parsed = JSON.parse(stored) as FloatPosition;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") {
      return getDefaultPosition();
    }
    return clampPosition(parsed);
  } catch {
    return getDefaultPosition();
  }
};

export function ChatImportJobFloat() {
  const { t } = useLanguage();
  const [job, setJob] = useState<ChatMigrationImportJobResponse | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [position, setPosition] = useState<FloatPosition>(() =>
    getDefaultPosition(),
  );
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const progressPercent = useMemo(() => {
    if (!job) return 0;
    return Math.min(
      100,
      Math.round(
        ((job.progress?.done || 0) / Math.max(1, job.progress?.total || 0)) *
          100,
      ),
    );
  }, [job]);
  const active = isActiveJob(job);

  const refreshJob = useCallback(async (jobId: string) => {
    const token = getToken();
    if (!token) return;
    const nextJob = await getImportAccountChatsJob(token, jobId);
    setJob(nextJob);
    if (!isActiveJob(nextJob)) {
      localStorage.removeItem(CHAT_IMPORT_JOB_STORAGE_KEY);
      setExpanded(true);
    }
  }, []);

  useEffect(() => {
    setPosition(loadStoredPosition());
    const jobId = localStorage.getItem(CHAT_IMPORT_JOB_STORAGE_KEY);
    if (jobId) {
      setLoading(true);
      refreshJob(jobId).finally(() => setLoading(false));
    }
  }, [refreshJob]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CHAT_IMPORT_JOB_STORAGE_KEY || !event.newValue) return;
      setLoading(true);
      refreshJob(event.newValue).finally(() => setLoading(false));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refreshJob]);

  useEffect(() => {
    const onJobStarted = (event: Event) => {
      const detail = (event as CustomEvent<{ jobId?: string }>).detail;
      if (!detail?.jobId) return;
      setLoading(true);
      refreshJob(detail.jobId).finally(() => setLoading(false));
    };
    window.addEventListener("chat-import-job-started", onJobStarted);
    return () =>
      window.removeEventListener("chat-import-job-started", onJobStarted);
  }, [refreshJob]);

  useEffect(() => {
    if (!job || !active) return;
    const timer = window.setInterval(() => {
      refreshJob(job.job_id).catch(() => {
        // Keep the last visible state; next poll may recover.
      });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [active, job, refreshJob]);

  useEffect(() => {
    const onResize = () => {
      setPosition((current) => {
        const next = clampPosition(current);
        localStorage.setItem(
          CHAT_IMPORT_FLOAT_POSITION_KEY,
          JSON.stringify(next),
        );
        return next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
    const next = clampPosition({ x: drag.originX + dx, y: drag.originY + dy });
    setPosition(next);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragState.current = null;
    localStorage.setItem(
      CHAT_IMPORT_FLOAT_POSITION_KEY,
      JSON.stringify(position),
    );
    if (!drag.moved) setExpanded((value) => !value);
  };

  const handleCancel = async () => {
    if (!job) return;
    const token = getToken();
    if (!token) return;
    try {
      setCancelLoading(true);
      const nextJob = await cancelImportAccountChatsJob(token, job.job_id);
      setJob(nextJob);
    } finally {
      setCancelLoading(false);
    }
  };

  const handleClose = () => {
    if (active) {
      setExpanded(false);
      return;
    }
    setExpanded(false);
    setJob(null);
    localStorage.removeItem(CHAT_IMPORT_JOB_STORAGE_KEY);
  };

  if (!job && !loading) return null;

  return (
    <div
      className="chat-import-float-layer"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
    >
      <button
        type="button"
        className={`chat-import-float-icon ${active ? "active" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        title={t("chat_migration_background_title")}
      >
        {loading ? (
          <Spinner className="animate-spin" weight="bold" size={22} />
        ) : (
          <UploadSimple weight="bold" size={22} />
        )}
        {active ? <span className="chat-import-float-pulse" /> : null}
        <span className="chat-import-float-percent">{progressPercent}%</span>
      </button>

      {job && expanded ? (
        <div className="chat-import-float-panel">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-violet-400 to-fuchsia-400" />
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-500">
                  {active ? (
                    <span className="absolute inset-0 rounded-2xl animate-ping bg-sky-400/20" />
                  ) : null}
                  <UploadSimple weight="bold" size={18} className="relative" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">
                    {t("chat_migration_background_title")}
                  </div>
                  <div className="mt-1 flex items-center gap-2 min-w-0">
                    <span className="text-[11px] text-main/45 truncate">
                      {job.account_name}
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClassName(job.status)}`}
                    >
                      {t(`chat_migration_job_${job.status}`)}
                    </span>
                  </div>
                </div>
              </div>
              <button
                className="action-icon !w-8 !h-8 opacity-70 hover:opacity-100"
                onClick={handleClose}
                title={t("close")}
              >
                <X weight="bold" size={14} />
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-sky-500/15 bg-gradient-to-br from-sky-500/10 to-violet-500/10 p-3 text-xs text-sky-700 dark:text-sky-200">
              <div className="flex items-center justify-between gap-3 font-semibold">
                <span className="truncate">
                  {t("chat_migration_import_progress")
                    .replace("{done}", String(job.progress?.done || 0))
                    .replace("{total}", String(job.progress?.total || 0))}
                </span>
                <span className="shrink-0 text-sm font-black">
                  {progressPercent}%
                </span>
              </div>
              <div className="mt-3 h-2.5 rounded-full bg-white/50 dark:bg-white/10 overflow-hidden shadow-inner">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 via-violet-400 to-fuchsia-400 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {job.error ? (
              <div className="mt-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-500 break-words">
                {job.error}
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {[
                ["joined", t("chat_migration_joined")],
                ["request_sent", t("chat_migration_request_sent")],
                ["manual_required", t("chat_migration_manual")],
                ["failed", t("failure")],
              ].map(([key, label]) => (
                <div
                  key={key}
                  className="rounded-2xl border border-black/5 bg-black/[0.03] p-2 dark:border-white/5 dark:bg-white/[0.04]"
                >
                  <div className="text-sm font-bold">
                    {key === "failed"
                      ? (job.summary?.failed || 0) +
                        (job.summary?.flood_wait || 0)
                      : job.summary?.[key] || 0}
                  </div>
                  <div className="text-[9px] text-main/40 truncate">
                    {label}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                className="btn-gradient flex-1 h-9 !py-0 !text-xs"
                onClick={() => setExpanded(false)}
              >
                <DownloadSimple weight="bold" />
                {t("collapse")}
              </button>
              {active ? (
                <button
                  className="btn-secondary flex-1 h-9 !py-0 !text-xs !text-rose-500 hover:!bg-rose-500/10"
                  onClick={handleCancel}
                  disabled={cancelLoading || job.status === "canceling"}
                >
                  {cancelLoading || job.status === "canceling" ? (
                    <Spinner className="animate-spin" />
                  ) : (
                    t("chat_migration_stop_background")
                  )}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { CHAT_IMPORT_JOB_STORAGE_KEY };
