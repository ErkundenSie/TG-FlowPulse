"use client";

import { useEffect, useState, memo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getToken } from "../../../lib/auth";
import {
  listSignTasks,
  deleteSignTask,
  runSignTask,
  getSignTaskHistory,
  getAccountChats,
  searchAccountChats,
  createSignTask,
  updateSignTask,
  exportSignTask,
  importSignTask,
  importAllConfigs,
  getSignTaskLogs,
  SignTask,
  SignTaskHistoryItem,
  ChatInfo,
  CreateSignTaskRequest,
  SignTaskChat,
} from "../../../lib/api";
import {
  CaretLeft,
  CaretDown,
  Plus,
  Play,
  PencilSimple,
  Trash,
  Spinner,
  Clock,
  ChatCircleText,
  CheckCircle,
  Hourglass,
  Power,
  ArrowClockwise,
  ListDashes,
  X,
  DotsThreeVertical,
  Lightning,
  Copy,
  ClipboardText,
  FastForward,
  Image as ImageIcon,
} from "@phosphor-icons/react";
import { ToastContainer, useToast } from "../../../components/ui/toast";
import { useLanguage } from "../../../context/LanguageContext";

type ActionTypeOption =
  | "1"
  | "2"
  | "3"
  | "9"
  | "10"
  | "ai_vision"
  | "ai_logic"
  | "keyword_notify";
type CreateTargetMode = "single_task" | "batch_tasks";
type ScheduleMode = "fixed_time" | "range" | "cron";

const DICE_OPTIONS = [
  "\uD83C\uDFB2",
  "\uD83C\uDFAF",
  "\uD83C\uDFC0",
  "\u26BD",
  "\uD83C\uDFB3",
  "\uD83C\uDFB0",
] as const;

const KEYWORD_VARIABLES = [
  "{keyword}",
  "{message}",
  "{sender}",
  "{chat_title}",
  "{url}",
] as const;
const CHAT_LIST_PREVIEW_LIMIT = 80;

const splitKeywordInput = (value: string, matchMode?: string) => {
  const splitter = matchMode === "regex" ? /\n/ : /\n|,/;
  return value
    .split(splitter)
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseMessageIdsInput = (value: string) => {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
};

const getChatTitle = (chat: ChatInfo) =>
  chat.title || chat.username || chat.first_name || String(chat.id);

const TIME_24H_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const normalizeTime24h = (value: string, fallback: string) => {
  const raw = String(value || "").trim();
  if (TIME_24H_PATTERN.test(raw)) return raw;

  const compactMatch = raw.match(/^(\d{1,2})[:：]?(\d{1,2})$/);
  if (!compactMatch) return fallback;

  const hour = Number(compactMatch[1]);
  const minute = Number(compactMatch[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const cleanTime24hInput = (value: string) => {
  const cleaned = value.replace(/[^\d:：]/g, "").replace("：", ":");
  const [hour = "", minute = ""] = cleaned.split(":");
  if (cleaned.includes(":")) {
    return `${hour.slice(0, 2)}:${minute.slice(0, 2)}`;
  }
  if (hour.length > 2) {
    return `${hour.slice(0, 2)}:${hour.slice(2, 4)}`;
  }
  return hour.slice(0, 2);
};

const cronFromFixedTime = (value: string) => normalizeTime24h(value, "06:00");

const fixedTimeFromSchedule = (value: string) => {
  const raw = String(value || "").trim();
  if (TIME_24H_PATTERN.test(raw)) return raw;
  const parts = raw.split(/\s+/);
  if (parts.length === 5) {
    const [minute, hour, day, month, dayOfWeek] = parts;
    if (day === "*" && month === "*" && dayOfWeek === "*") {
      const hourNum = Number(hour);
      const minuteNum = Number(minute);
      if (
        Number.isInteger(hourNum) &&
        Number.isInteger(minuteNum) &&
        hourNum >= 0 &&
        hourNum <= 23 &&
        minuteNum >= 0 &&
        minuteNum <= 59
      ) {
        return `${String(hourNum).padStart(2, "0")}:${String(minuteNum).padStart(2, "0")}`;
      }
    }
  }
  const sixParts = raw.split(/\s+/);
  if (sixParts.length === 6) {
    const [second, minute, hour, day, month, dayOfWeek] = sixParts;
    if (second === "0" && day === "*" && month === "*" && dayOfWeek === "*") {
      const hourNum = Number(hour);
      const minuteNum = Number(minute);
      if (
        Number.isInteger(hourNum) &&
        Number.isInteger(minuteNum) &&
        hourNum >= 0 &&
        hourNum <= 23 &&
        minuteNum >= 0 &&
        minuteNum <= 59
      ) {
        return `${String(hourNum).padStart(2, "0")}:${String(minuteNum).padStart(2, "0")}`;
      }
    }
  }
  return "06:00";
};

const scheduleModeFromTask = (task: SignTask): ScheduleMode => {
  if (task.execution_mode === "range") return "range";
  const raw = String(task.sign_at || "").trim();
  return TIME_24H_PATTERN.test(raw) ? "fixed_time" : "cron";
};

const formatLogLine = (line: string) => {
  return String(line || "")
    .replace(/[─━_=]{8,}/g, " ")
    .replace(/\s*\|\s*/g, " · ")
    .replace(/\s{2,}/g, " ")
    .trim();
};

const logToneClass = (line: string) => {
  const text = line.toLowerCase();
  if (
    text.includes("error") ||
    text.includes("failed") ||
    line.includes("失败") ||
    line.includes("错误")
  ) {
    return "border-rose-500/15 bg-rose-500/[0.04] text-rose-950/80 dark:text-rose-100/80";
  }
  if (
    text.includes("success") ||
    line.includes("成功") ||
    line.includes("完成")
  ) {
    return "border-emerald-500/15 bg-emerald-500/[0.04] text-emerald-950/80 dark:text-emerald-100/80";
  }
  if (line.includes("目标") || line.includes("开始") || line.includes("执行")) {
    return "border-[#8a3ffc]/15 bg-[#8a3ffc]/[0.045] text-main/85";
  }
  return "border-white/5 bg-white/[0.035] text-main/75";
};

const LogLine = memo(({ line, index }: { line: string; index: number }) => {
  const formatted = formatLogLine(line);
  return (
    <div
      className={`grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 rounded-lg border px-3 py-2 ${logToneClass(formatted)}`}
    >
      <span className="select-none text-right font-mono text-[10px] leading-5 text-main/25">
        {(index + 1).toString().padStart(2, "0")}
      </span>
      <span className="min-w-0 whitespace-pre-wrap break-words text-[12px] leading-5">
        {formatted || "-"}
      </span>
    </div>
  );
});

LogLine.displayName = "LogLine";

type TaskComponentProps = {
  task: SignTask;
  loading: boolean;
  running: boolean;
  onEdit: (task: SignTask) => void;
  onRun: (task: SignTask) => void;
  onToggleEnabled: (task: SignTask) => void;
  onViewLogs: (task: SignTask) => void;
  onCopy: (name: string) => void;
  onDelete: (name: string) => void;
  t: (key: string) => string;
  language: string;
};

// Memoized Task Item Component
const TaskItem = memo(
  ({
    task,
    loading,
    running,
    onEdit,
    onRun,
    onToggleEnabled,
    onViewLogs,
    onCopy,
    onDelete,
    t,
    language,
  }: {
    task: SignTask;
    loading: boolean;
    running: boolean;
    onEdit: (task: SignTask) => void;
    onRun: (task: SignTask) => void;
    onToggleEnabled: (task: SignTask) => void;
    onViewLogs: (task: SignTask) => void;
    onCopy: (name: string) => void;
    onDelete: (name: string) => void;
    t: (key: string) => string;
    language: string;
  }) => {
    const copyTaskTitle =
      language === "zh" ? "\u590D\u5236\u4EFB\u52A1" : "Copy Task";

    return (
      <div
        className={`glass-panel p-4 group flex min-h-[204px] flex-col hover:-translate-y-0.5 hover:border-[#8a3ffc]/30 hover:shadow-xl transition-all duration-200 ${running ? "border-emerald-500/40 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]" : ""} ${task.enabled === false ? "opacity-70" : ""}`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#8a3ffc]/10 flex items-center justify-center text-[#b57dff] shrink-0">
            <ChatCircleText weight="bold" size={20} />
          </div>
          <div className="min-w-0 flex-1 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <h3
                className="font-bold truncate text-base leading-6"
                title={task.name}
              >
                {task.name}
              </h3>
              {running && (
                <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-400 font-bold uppercase">
                  <Spinner className="animate-spin" size={10} />
                  {t("task_running")}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`text-[10px] font-bold px-2 py-1 rounded-md border ${task.enabled === false ? "text-rose-400 bg-rose-500/10 border-rose-500/10" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/10"}`}
              >
                {task.enabled === false
                  ? t("task_disabled")
                  : t("task_enabled")}
              </span>
              {task.group ? (
                <span
                  className="text-[10px] font-bold text-sky-400 bg-sky-500/10 px-2 py-1 rounded-md border border-sky-500/10 truncate max-w-[120px]"
                  title={task.group}
                >
                  {task.group}
                </span>
              ) : null}
              <span
                className="text-[10px] font-mono text-main/35 bg-white/5 px-2 py-1 rounded-md border border-white/5 truncate max-w-[150px]"
                title={String(task.chats[0]?.chat_id || "-")}
              >
                {task.chats[0]?.chat_id || "-"}
              </span>
              {task.chats.length > 1 && (
                <span className="text-[10px] font-bold text-[#8a3ffc]/70 bg-[#8a3ffc]/10 px-2 py-1 rounded-md border border-[#8a3ffc]/10">
                  +{task.chats.length - 1}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/[0.025] px-3 py-2">
              <div className="flex items-center gap-1.5 text-main/40">
                <Clock weight="bold" size={12} />
                <span className="text-[10px] font-bold font-mono uppercase tracking-wider">
                  {task.execution_mode === "range" &&
                  task.range_start &&
                  task.range_end
                    ? `${task.range_start} - ${task.range_end}`
                    : task.sign_at}
                </span>
              </div>
              {task.random_seconds > 0 && (
                <div className="flex items-center gap-1 text-[#8a3ffc]/60">
                  <Hourglass weight="bold" size={12} />
                  <span className="text-[10px] font-bold">
                    ~{Math.round(task.random_seconds / 60)}m
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3">
          {task.last_run ? (
            <div className="text-[10px] font-mono text-main/40 flex items-center gap-2 pt-2 border-t border-white/5">
              <span
                className={
                  task.last_run.success ? "text-emerald-400" : "text-rose-400"
                }
              >
                {task.last_run.success ? t("success") : t("failure")}
              </span>
              <span>
                {new Date(task.last_run.time).toLocaleString(
                  language === "zh" ? "zh-CN" : "en-US",
                  {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                )}
              </span>
            </div>
          ) : (
            <div className="pt-2 border-t border-white/5 text-[10px] text-main/20 font-bold uppercase tracking-widest italic">
              {t("no_data")}
            </div>
          )}
        </div>

        <div className="mt-auto pt-3 grid grid-cols-6 gap-2">
          <button
            onClick={() => onRun(task)}
            disabled={loading || running}
            className="action-btn !w-full !h-10 !text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
            title={t("run_now")}
          >
            {running ? (
              <Spinner className="animate-spin" size={14} />
            ) : (
              <Play weight="fill" size={14} />
            )}
          </button>
          <button
            onClick={() => onToggleEnabled(task)}
            disabled={loading || running}
            className={`action-btn !w-full !h-10 disabled:opacity-40 disabled:cursor-not-allowed ${task.enabled === false ? "!text-rose-400 hover:bg-rose-500/10" : "!text-emerald-400 hover:bg-emerald-500/10"}`}
            title={
              task.enabled === false ? t("enable_task") : t("disable_task")
            }
          >
            <Power
              weight={task.enabled === false ? "regular" : "fill"}
              size={14}
            />
          </button>
          <button
            onClick={() => onEdit(task)}
            disabled={loading}
            className="action-btn !w-full !h-10"
            title={t("edit")}
          >
            <PencilSimple weight="bold" size={14} />
          </button>
          <button
            onClick={() => onViewLogs(task)}
            disabled={loading}
            className="action-btn !w-full !h-10 !text-[#8a3ffc] hover:bg-[#8a3ffc]/10"
            title={t("task_history_logs")}
          >
            <ListDashes weight="bold" size={14} />
          </button>
          <button
            onClick={() => onCopy(task.name)}
            disabled={loading}
            className="action-btn !w-full !h-10 !text-sky-400 hover:bg-sky-500/10"
            title={copyTaskTitle}
          >
            <Copy weight="bold" size={14} />
          </button>
          <button
            onClick={() => onDelete(task.name)}
            disabled={loading}
            className="action-btn !w-full !h-10 !text-rose-400 hover:bg-rose-500/10"
            title={t("delete")}
          >
            <Trash weight="bold" size={14} />
          </button>
        </div>
      </div>
    );
  },
);

TaskItem.displayName = "TaskItem";

export default function AccountTasksContent() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const searchParams = useSearchParams();
  const accountName = searchParams.get("name") || "";
  const { toasts, addToast, removeToast } = useToast();
  const fieldLabelClass =
    "text-[10px] font-bold uppercase tracking-wider text-main/40 mb-1 block";
  const dialogSectionClass =
    "rounded-xl border border-white/5 bg-white/5 p-4 space-y-4";
  const dialogSectionTitleClass =
    "text-sm font-bold text-main/80 flex items-center gap-2";

  const [token, setLocalToken] = useState<string | null>(null);
  const [tasks, setTasks] = useState<SignTask[]>([]);
  const [chats, setChats] = useState<ChatInfo[]>([]);
  const [chatSearch, setChatSearch] = useState("");
  const [chatSearchResults, setChatSearchResults] = useState<ChatInfo[]>([]);
  const [chatSearchLoading, setChatSearchLoading] = useState(false);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [selectedCreateChats, setSelectedCreateChats] = useState<ChatInfo[]>(
    [],
  );
  const [createTargetMode, setCreateTargetMode] =
    useState<CreateTargetMode>("single_task");
  const [loading, setLoading] = useState(false);
  const [refreshingChats, setRefreshingChats] = useState(false);
  const [historyTaskName, setHistoryTaskName] = useState<string | null>(null);
  const [historyLogs, setHistoryLogs] = useState<SignTaskHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedHistoryLogs, setExpandedHistoryLogs] = useState<Set<string>>(
    new Set(),
  );
  const [runningTaskNames, setRunningTaskNames] = useState<Set<string>>(
    new Set(),
  );
  const [liveLogTaskName, setLiveLogTaskName] = useState<string | null>(null);
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

  const addToastRef = useRef(addToast);
  const tRef = useRef(t);
  useEffect(() => {
    addToastRef.current = addToast;
    tRef.current = t;
  }, [addToast, t]);

  const formatErrorMessage = useCallback((key: string, err?: any) => {
    const base = tRef.current ? tRef.current(key) : key;
    const code = err?.code;
    return code ? `${base} (${code})` : base;
  }, []);
  const handleAccountSessionInvalid = useCallback(
    (err: any) => {
      if (err?.code !== "ACCOUNT_SESSION_INVALID") return false;
      const toast = addToastRef.current;
      const message = tRef.current
        ? tRef.current("account_session_invalid")
        : "Account session expired, please login again";
      if (toast) {
        toast(message, "error");
      }
      setTimeout(() => {
        router.replace("/dashboard");
      }, 800);
      return true;
    },
    [router],
  );

  // Create task dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTask, setNewTask] = useState({
    name: "",
    group: "",
    sign_at: "0 6 * * *",
    fixed_time: "06:00",
    schedule_mode: "fixed_time" as ScheduleMode,
    random_minutes: 0,
    chat_id: 0,
    chat_id_manual: "",
    chat_name: "",
    message_thread_id: undefined as number | undefined,
    actions: [{ action: 1, text: "" }],
    delete_after: undefined as number | undefined,
    action_interval: 1,
    execution_mode: "fixed" as "fixed" | "range",
    range_start: "09:00",
    range_end: "18:00",
    enabled: true,
    notify_on_failure: true,
  });

  // Edit task dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTaskName, setEditingTaskName] = useState("");
  const [editTask, setEditTask] = useState({
    group: "",
    sign_at: "0 6 * * *",
    fixed_time: "06:00",
    schedule_mode: "cron" as ScheduleMode,
    random_minutes: 0,
    chat_id: 0,
    chat_id_manual: "",
    chat_name: "",
    message_thread_id: undefined as number | undefined,
    actions: [{ action: 1, text: "" }] as any[],
    delete_after: undefined as number | undefined,
    action_interval: 1,
    execution_mode: "fixed" as "fixed" | "range",
    range_start: "09:00",
    range_end: "18:00",
    enabled: true,
    notify_on_failure: true,
    target_chats: [] as SignTaskChat[],
  });
  const [copyTaskDialog, setCopyTaskDialog] = useState<{
    taskName: string;
    config: string;
  } | null>(null);
  const [showPasteDialog, setShowPasteDialog] = useState(false);
  const [pasteTaskConfigInput, setPasteTaskConfigInput] = useState("");
  const [copyingConfig, setCopyingConfig] = useState(false);
  const [importingPastedConfig, setImportingPastedConfig] = useState(false);

  const [checking, setChecking] = useState(true);
  const isZh = language === "zh";
  const taskNamePlaceholder = isZh
    ? "\u7559\u7A7A\u4F7F\u7528\u9ED8\u8BA4\u540D\u79F0"
    : "Leave empty to use default name";
  const sendTextLabel = isZh
    ? "\u53D1\u9001\u6587\u672C\u6D88\u606F"
    : "Send Text Message";
  const clickTextButtonLabel = isZh
    ? "\u70B9\u51FB\u6587\u5B57\u6309\u94AE"
    : "Click Text Button";
  const sendDiceLabel = isZh ? "\u53D1\u9001\u9AB0\u5B50" : "Send Dice";
  const sendPhotoLabel = isZh ? "\u53D1\u9001\u56FE\u7247" : "Send Photo";
  const forwardMessagesLabel = isZh
    ? "\u8F6C\u53D1\u591A\u6761\u6D88\u606F"
    : "Forward Messages";
  const aiVisionLabel = isZh ? "AI\u8BC6\u56FE" : "AI Vision";
  const aiCalcLabel = isZh ? "AI\u8BA1\u7B97" : "AI Calculate";
  const keywordNotifyLabel = isZh
    ? "\u5173\u952E\u8BCD\u76D1\u542C"
    : "Keyword Monitor";
  const keywordPlaceholder = isZh
    ? "\u6BCF\u884C\u4E00\u4E2A\u5173\u952E\u8BCD\uFF0C\u4E5F\u652F\u6301\u9017\u53F7\u5206\u9694"
    : "One keyword per line, comma-separated also works";
  const barkUrlLabel = isZh ? "Bark 推送" : "Bark Push";
  const forwardPushLabel = isZh ? "\u8F6C\u53D1" : "Forward";
  const forwardThreadIdPlaceholder = isZh ? "\u53EF\u9009" : "Optional";
  const forwardChatIdLabel = isZh ? "\u8F6C\u53D1 Chat ID" : "Forward Chat ID";
  const forwardThreadIdLabel = isZh
    ? "\u8F6C\u53D1\u8BDD\u9898 ID"
    : "Forward Topic ID";
  const keywordContinueLabel = isZh
    ? "\u547D\u4E2D\u540E\u7EE7\u7EED\u6267\u884C"
    : "Continue After Match";
  const keywordContinueHint = isZh
    ? "\u9009\u4E2D\u540E\u4E0D\u53D1\u9001\u63A8\u9001\uFF0C\u76F4\u63A5\u6267\u884C\u4E0B\u65B9\u52A8\u4F5C\u5E8F\u5217"
    : "Runs the action sequence below instead of sending a push";
  const keywordContinueAddLabel = isZh
    ? "\u6DFB\u52A0\u540E\u7EED\u52A8\u4F5C"
    : "Add Continue Action";
  const keywordVariablesLabel = isZh ? "\u53D8\u91CF" : "Variables";
  const continuePushLabel = isZh
    ? "\u540E\u7EED\u52A8\u4F5C"
    : "Continue Actions";
  const continueChatIdLabel = isZh ? "\u6267\u884C Chat ID" : "Action Chat ID";
  const continueThreadIdLabel = isZh
    ? "\u6267\u884C\u8BDD\u9898 ID"
    : "Action Topic ID";
  const continueIntervalLabel = isZh
    ? "\u52A8\u4F5C\u95F4\u9694(\u79D2)"
    : "Action Interval (s)";
  const continueChatIdPlaceholder = isZh
    ? "\u7559\u7A7A\u4F7F\u7528\u547D\u4E2D\u6D88\u606F\u6765\u6E90"
    : "Blank uses matched chat";
  const sendTextPlaceholder = isZh
    ? "\u53D1\u9001\u7684\u6587\u672C\u5185\u5BB9"
    : "Text to send";
  const clickButtonPlaceholder = isZh
    ? "\u8F93\u5165\u6309\u94AE\u6587\u5B57\uFF0C\u4E0D\u8981\u8868\u60C5\uFF01"
    : "Button text to click, no emoji";
  const photoPlaceholder = isZh
    ? "\u56FE\u7247\u8DEF\u5F84 / URL / Telegram\u6D88\u606F\u94FE\u63A5 / file_id"
    : "Photo path / URL / Telegram message link / file_id";
  const photoCaptionPlaceholder = isZh
    ? "\u56FE\u7247\u8BF4\u660E\uFF08\u53EF\u9009\uFF09"
    : "Caption (optional)";
  const forwardSourcePlaceholder = isZh
    ? "\u6765\u6E90 Chat ID / @username"
    : "Source Chat ID / @username";
  const forwardMessageIdsPlaceholder = isZh
    ? "\u6D88\u606F ID\uFF0C\u7528\u9017\u53F7\u6216\u6362\u884C\u5206\u9694"
    : "Message IDs, comma or newline separated";
  const aiVisionSendModeLabel = isZh
    ? "\u8BC6\u56FE\u540E\u53D1\u6587\u672C"
    : "Vision -> Send Text";
  const aiVisionClickModeLabel = isZh
    ? "\u8BC6\u56FE\u540E\u70B9\u6309\u94AE"
    : "Vision -> Click Button";
  const aiCalcSendModeLabel = isZh
    ? "\u8BA1\u7B97\u540E\u53D1\u6587\u672C"
    : "Math -> Send Text";
  const aiCalcClickModeLabel = isZh
    ? "\u8BA1\u7B97\u540E\u70B9\u6309\u94AE"
    : "Math -> Click Button";
  const pasteTaskTitle = isZh
    ? "\u7C98\u8D34\u5BFC\u5165\u4EFB\u52A1"
    : "Paste Task";
  const copyTaskDialogTitle = isZh
    ? "\u590D\u5236\u4EFB\u52A1\u914D\u7F6E"
    : "Copy Task Config";
  const copyTaskDialogDesc = isZh
    ? "\u4EE5\u4E0B\u662F\u4EFB\u52A1\u914D\u7F6E\uFF0C\u53EF\u624B\u52A8\u590D\u5236\u6216\u70B9\u51FB\u4E00\u952E\u590D\u5236\u3002"
    : "Task config is ready. Copy manually or use one-click copy.";
  const copyConfigAction = isZh ? "\u4E00\u952E\u590D\u5236" : "Copy";
  const pasteTaskDialogTitle = isZh
    ? "\u7C98\u8D34\u5BFC\u5165\u4EFB\u52A1"
    : "Paste Task Config";
  const pasteTaskDialogDesc = isZh
    ? "\u65E0\u6CD5\u76F4\u63A5\u8BFB\u53D6\u526A\u8D34\u677F\uFF0C\u8BF7\u5728\u4E0B\u65B9\u7C98\u8D34\u914D\u7F6E\u540E\u5BFC\u5165\u3002"
    : "Clipboard read failed. Paste config below and import.";
  const pasteTaskDialogPlaceholder = isZh
    ? "\u5728\u6B64\u7C98\u8D34\u4EFB\u52A1\u914D\u7F6E JSON..."
    : "Paste task config JSON here...";
  const importTaskAction = isZh ? "\u5BFC\u5165\u4EFB\u52A1" : "Import Task";
  const clipboardReadFailed = isZh
    ? "\u65E0\u6CD5\u8BFB\u53D6\u526A\u8D34\u677F\uFF0C\u5DF2\u5207\u6362\u4E3A\u624B\u52A8\u7C98\u8D34\u5BFC\u5165"
    : "Clipboard read failed, switched to manual paste import";
  const copyTaskSuccess = (taskName: string) =>
    isZh
      ? `\u4EFB\u52A1 ${taskName} \u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F`
      : `Task ${taskName} copied to clipboard`;
  const copyTaskFailed = isZh
    ? "\u590D\u5236\u4EFB\u52A1\u5931\u8D25"
    : "Copy task failed";
  const pasteTaskSuccess = (taskName: string) =>
    isZh
      ? `\u4EFB\u52A1 ${taskName} \u5BFC\u5165\u6210\u529F`
      : `Task ${taskName} imported`;
  const pasteTaskFailed = isZh
    ? "\u7C98\u8D34\u4EFB\u52A1\u5931\u8D25"
    : "Paste task failed";
  const clipboardUnsupported = isZh
    ? "\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u526A\u8D34\u677F\u64CD\u4F5C"
    : "Clipboard API is not available";
  const copyTaskFallbackManual = isZh
    ? "\u81EA\u52A8\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u5728\u5F39\u7A97\u5185\u624B\u52A8\u590D\u5236"
    : "Auto copy failed, please copy manually from dialog";
  const copyAllTasksTitle = t("export_all_tasks");
  const taskFailureNotifyLabel = isZh
    ? "\u5931\u8D25\u901A\u77E5"
    : "Failure Notify";
  const taskEnabledLabel = isZh ? "\u542F\u7528" : "Enabled";
  const taskEnabledUpdated = (enabled: boolean) =>
    enabled
      ? isZh
        ? "\u4EFB\u52A1\u5DF2\u542F\u7528"
        : "Task enabled"
      : isZh
        ? "\u4EFB\u52A1\u5DF2\u505C\u7528"
        : "Task disabled";
  const createTargetModeLabel = isZh
    ? "\u521B\u5EFA\u65B9\u5F0F"
    : "Create Mode";
  const groupLabel = isZh ? "\u5206\u7EC4" : "Group";
  const groupPlaceholder = isZh
    ? "\u4F8B\u5982\uFF1A\u5E7F\u544A / \u7B7E\u5230 / \u76D1\u542C"
    : "e.g. Ads / Check-in / Monitor";
  const ungroupedLabel = isZh ? "\u672A\u5206\u7EC4" : "Ungrouped";
  const scheduleFixedTimeLabel = isZh
    ? "\u56FA\u5B9A\u65F6\u95F4"
    : "Fixed Time";
  const scheduleRangeLabel = isZh
    ? "\u968F\u673A\u65F6\u95F4\u6BB5"
    : "Random Range";
  const scheduleCronLabel = isZh ? "Cron \u9AD8\u7EA7" : "Cron Advanced";
  const fixedTimeLabel = isZh ? "\u6267\u884C\u65F6\u95F4" : "Run Time";
  const scheduleJitterLabel = isZh
    ? "\u968F\u673A\u9519\u5CF0"
    : "Random Jitter";
  const scheduleJitterHint = isZh
    ? "\u540C\u4E00\u65F6\u95F4\u7684\u4EFB\u52A1\u4F1A\u5728\u8FD9\u4E2A\u7A97\u53E3\u5185\u968F\u673A\u5EF6\u8FDF\u6267\u884C"
    : "Tasks scheduled at the same time run after a random delay within this window";
  const minutesLabel = isZh ? "\u5206\u949F" : "min";
  const createModeSingleTaskLabel = isZh
    ? "\u4E00\u4E2A\u4EFB\u52A1\u591A\u4F1A\u8BDD"
    : "One Task, Many Chats";
  const createModeBatchTasksLabel = isZh
    ? "\u591A\u4E2A\u72EC\u7ACB\u4EFB\u52A1"
    : "Separate Tasks";
  const selectedChatsLabel = isZh
    ? "\u5DF2\u9009\u4F1A\u8BDD"
    : "Selected Chats";
  const clearSelectedChatsLabel = isZh ? "\u6E05\u7A7A" : "Clear";
  const multiSelectHint = isZh
    ? "\u5217\u8868\u548C\u641C\u7D22\u7ED3\u679C\u652F\u6301\u591A\u9009\uFF1B\u624B\u52A8 Chat ID \u4FDD\u6301\u5355\u76EE\u6807\u3002"
    : "List and search results support multi-select; manual Chat ID stays single-target.";
  const noSelectedChatsLabel = isZh
    ? "\u5C1A\u672A\u9009\u62E9\u4F1A\u8BDD"
    : "No chats selected";
  const manualChatDisabledHint = isZh
    ? "\u591A\u9009\u65F6\u4F7F\u7528\u4E0A\u65B9\u5DF2\u9009\u4F1A\u8BDD\uFF1B\u5982\u9700\u624B\u52A8 ID\uFF0C\u8BF7\u5148\u6E05\u7A7A\u5DF2\u9009\u4F1A\u8BDD\u3002"
    : "Multi-select uses the selected chats above. Clear them first to enter a manual ID.";
  const chatListPreviewHint = (visible: number, total: number) =>
    isZh
      ? `仅显示前 ${visible} / ${total} 个，会话较多时请使用搜索`
      : `Showing first ${visible} / ${total}; use search for large lists`;
  const batchCreateSummary = (success: number, failed: number) =>
    isZh
      ? `\u6279\u91CF\u521B\u5EFA\u5B8C\u6210\uFF1A\u6210\u529F ${success} \u4E2A\uFF0C\u5931\u8D25 ${failed} \u4E2A`
      : `Batch create finished: ${success} succeeded, ${failed} failed`;

  const sanitizeTaskName = useCallback((raw: string) => {
    return raw
      .trim()
      .replace(/[<>:"/\\|?*]+/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64);
  }, []);

  const resetCreateTaskForm = useCallback(() => {
    setNewTask({
      name: "",
      group: "",
      sign_at: "0 6 * * *",
      fixed_time: "06:00",
      schedule_mode: "fixed_time",
      random_minutes: 0,
      chat_id: 0,
      chat_id_manual: "",
      chat_name: "",
      message_thread_id: undefined,
      actions: [{ action: 1, text: "" }],
      delete_after: undefined,
      action_interval: 1,
      execution_mode: "fixed",
      range_start: "09:00",
      range_end: "18:00",
      enabled: true,
      notify_on_failure: true,
    });
    setSelectedCreateChats([]);
    setCreateTargetMode("single_task");
    setChatSearch("");
    setChatSearchResults([]);
    setChatSearchLoading(false);
  }, []);

  const toggleSelectedChat = useCallback((chat: ChatInfo) => {
    setSelectedCreateChats((prev) => {
      const exists = prev.some((item) => item.id === chat.id);
      if (exists) {
        return prev.filter((item) => item.id !== chat.id);
      }
      return [...prev, chat];
    });
    setNewTask((prev) => ({
      ...prev,
      chat_id: 0,
      chat_id_manual: "",
      chat_name: "",
    }));
  }, []);

  const buildSignTaskChat = useCallback(
    (chat: ChatInfo): SignTaskChat => ({
      chat_id: chat.id,
      name: getChatTitle(chat),
      message_thread_id: newTask.message_thread_id,
      actions: newTask.actions,
      delete_after: newTask.delete_after,
      action_interval: newTask.action_interval,
    }),
    [
      newTask.action_interval,
      newTask.actions,
      newTask.delete_after,
      newTask.message_thread_id,
    ],
  );

  const buildManualSignTaskChat = useCallback(
    (chatId: number): SignTaskChat => ({
      chat_id: chatId,
      name:
        newTask.chat_name ||
        t("chat_default_name").replace("{id}", String(chatId)),
      message_thread_id: newTask.message_thread_id,
      actions: newTask.actions,
      delete_after: newTask.delete_after,
      action_interval: newTask.action_interval,
    }),
    [
      newTask.action_interval,
      newTask.actions,
      newTask.chat_name,
      newTask.delete_after,
      newTask.message_thread_id,
      t,
    ],
  );

  const buildBatchTaskName = useCallback(
    (baseName: string, chat: ChatInfo) => {
      const cleanBase = sanitizeTaskName(baseName);
      const cleanChatName =
        sanitizeTaskName(getChatTitle(chat)) ||
        sanitizeTaskName(`chat_${chat.id}`) ||
        `chat_${chat.id}`;
      return cleanBase
        ? sanitizeTaskName(`${cleanBase}_${cleanChatName}`) || cleanChatName
        : cleanChatName;
    },
    [sanitizeTaskName],
  );

  const chatInfoToSignTaskChat = useCallback(
    (chat: ChatInfo): SignTaskChat => ({
      chat_id: chat.id,
      name: getChatTitle(chat),
      actions: [],
      action_interval: 1,
    }),
    [],
  );

  const toggleEditTargetChat = useCallback(
    (chat: ChatInfo) => {
      const target = chatInfoToSignTaskChat(chat);
      setEditTask((prev) => {
        const exists = prev.target_chats.some(
          (item) => item.chat_id === target.chat_id,
        );
        const nextTargets = exists
          ? prev.target_chats.filter((item) => item.chat_id !== target.chat_id)
          : [...prev.target_chats, target];
        const firstTarget = nextTargets[0];
        return {
          ...prev,
          target_chats: nextTargets,
          chat_id: firstTarget?.chat_id || 0,
          chat_id_manual: firstTarget ? String(firstTarget.chat_id) : "",
          chat_name: firstTarget?.name || "",
          message_thread_id: firstTarget?.message_thread_id,
        };
      });
    },
    [chatInfoToSignTaskChat],
  );

  const removeEditTargetChat = useCallback((chatId: number) => {
    setEditTask((prev) => {
      const nextTargets = prev.target_chats.filter(
        (item) => item.chat_id !== chatId,
      );
      const firstTarget = nextTargets[0];
      return {
        ...prev,
        target_chats: nextTargets,
        chat_id: firstTarget?.chat_id || 0,
        chat_id_manual: firstTarget ? String(firstTarget.chat_id) : "",
        chat_name: firstTarget?.name || "",
        message_thread_id: firstTarget?.message_thread_id,
      };
    });
  }, []);

  const toActionTypeOption = useCallback((action: any): ActionTypeOption => {
    const actionId = Number(action?.action);
    if (actionId === 1) return "1";
    if (actionId === 3) return "3";
    if (actionId === 2) return "2";
    if (actionId === 9) return "9";
    if (actionId === 10) return "10";
    if (actionId === 4 || actionId === 6) return "ai_vision";
    if (actionId === 5 || actionId === 7) return "ai_logic";
    if (actionId === 8) return "keyword_notify";
    return "1";
  }, []);

  const isContinueActionValid = useCallback((action: any) => {
    const actionId = Number(action?.action);
    if (actionId === 1 || actionId === 3) {
      return Boolean((action?.text || "").trim());
    }
    if (actionId === 2) {
      return Boolean((action?.dice || "").trim());
    }
    if (actionId === 9) {
      return Boolean((action?.photo || "").trim());
    }
    if (actionId === 10) {
      const messageIds = Array.isArray(action?.message_ids)
        ? action.message_ids
        : [];
      return (
        Boolean((action?.from_chat_id || "").trim()) && messageIds.length > 0
      );
    }
    return [4, 5, 6, 7].includes(actionId);
  }, []);

  const isActionValid = useCallback(
    (action: any) => {
      const actionId = Number(action?.action);
      if (actionId === 1 || actionId === 3) {
        return Boolean((action?.text || "").trim());
      }
      if (actionId === 2) {
        return Boolean((action?.dice || "").trim());
      }
      if (actionId === 9) {
        return Boolean((action?.photo || "").trim());
      }
      if (actionId === 10) {
        const messageIds = Array.isArray(action?.message_ids)
          ? action.message_ids
          : [];
        return (
          Boolean((action?.from_chat_id || "").trim()) && messageIds.length > 0
        );
      }
      if (actionId === 8) {
        const keywords = Array.isArray(action?.keywords) ? action.keywords : [];
        const hasKeywords = keywords.some((item: string) =>
          (item || "").trim(),
        );
        if (!hasKeywords) return false;
        if (action?.push_channel === "forward") {
          return Boolean((action?.forward_chat_id || "").trim());
        }
        if (action?.push_channel === "bark") {
          return Boolean((action?.bark_url || "").trim());
        }
        if (action?.push_channel === "custom") {
          return Boolean((action?.custom_url || "").trim());
        }
        if (action?.push_channel === "continue") {
          const continueActions = Array.isArray(action?.continue_actions)
            ? action.continue_actions
            : [];
          return (
            continueActions.length > 0 &&
            continueActions.every((item: any) => isContinueActionValid(item))
          );
        }
        return true;
      }
      return [4, 5, 6, 7].includes(actionId);
    },
    [isContinueActionValid],
  );

  const loadData = useCallback(
    async (tokenStr: string) => {
      try {
        setLoading(true);
        const tasksData = await listSignTasks(tokenStr, accountName);
        setTasks(tasksData);
      } catch (err: any) {
        if (handleAccountSessionInvalid(err)) return;
        const toast = addToastRef.current;
        if (toast) {
          toast(formatErrorMessage("load_failed", err), "error");
        }
      } finally {
        setLoading(false);
      }
    },
    [accountName, formatErrorMessage, handleAccountSessionInvalid],
  );

  const groupedTasks = tasks.reduce<Array<{ name: string; tasks: SignTask[] }>>(
    (groups, task) => {
      const groupName = (task.group || "").trim() || ungroupedLabel;
      const existing = groups.find((group) => group.name === groupName);
      if (existing) {
        existing.tasks.push(task);
      } else {
        groups.push({ name: groupName, tasks: [task] });
      }
      return groups;
    },
    [],
  );

  const toggleGroupCollapsed = useCallback((groupName: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const tokenStr = getToken();
    if (!tokenStr) {
      window.location.replace("/");
      return;
    }
    if (!accountName) {
      window.location.replace("/dashboard");
      return;
    }
    setLocalToken(tokenStr);
    setChecking(false);
    loadData(tokenStr);
  }, [accountName, loadData]);

  useEffect(() => {
    if (!token || !accountName) return;
    const query = chatSearch.trim();
    if (!query) {
      setChatSearchResults([]);
      setChatSearchLoading(false);
      return;
    }
    let cancelled = false;
    setChatSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchAccountChats(token, accountName, query, 50, 0);
        if (!cancelled) {
          setChatSearchResults(res.items || []);
        }
      } catch (err: any) {
        if (!cancelled) {
          if (handleAccountSessionInvalid(err)) return;
          const toast = addToastRef.current;
          if (toast) {
            toast(formatErrorMessage("search_failed", err), "error");
          }
          setChatSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setChatSearchLoading(false);
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    chatSearch,
    token,
    accountName,
    formatErrorMessage,
    handleAccountSessionInvalid,
  ]);

  useEffect(() => {
    if (!showCreateDialog && !showEditDialog) {
      setChatSearch("");
      setChatSearchResults([]);
      setChatSearchLoading(false);
    }
  }, [showCreateDialog, showEditDialog, accountName]);

  useEffect(() => {
    if (!token || !accountName || !liveLogTaskName) return;
    let cancelled = false;
    const fetchLiveLogs = async () => {
      try {
        const logs = await getSignTaskLogs(token, liveLogTaskName, accountName);
        if (!cancelled) {
          if (logs && logs.length > 0) {
            setLiveLogs(logs);
          }
        }
      } catch {
        // Live logs are best-effort; the final result toast still reports errors.
      }
    };
    fetchLiveLogs();
    const timer = setInterval(fetchLiveLogs, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token, accountName, liveLogTaskName]);

  const loadChats = useCallback(
    async (forceRefresh = false) => {
      if (!token || !accountName) return;
      try {
        if (forceRefresh) {
          setRefreshingChats(true);
        } else {
          setChatsLoading(true);
        }
        const chatsData = await getAccountChats(
          token,
          accountName,
          forceRefresh,
        );
        setChats(chatsData);
        setChatsLoaded(true);
        if (forceRefresh) {
          addToast(t("chats_refreshed"), "success");
        }
      } catch (err: any) {
        if (handleAccountSessionInvalid(err)) return;
        addToast(formatErrorMessage("refresh_failed", err), "error");
      } finally {
        setRefreshingChats(false);
        setChatsLoading(false);
      }
    },
    [
      accountName,
      addToast,
      formatErrorMessage,
      handleAccountSessionInvalid,
      t,
      token,
    ],
  );

  useEffect(() => {
    if (
      !token ||
      !accountName ||
      (!showCreateDialog && !showEditDialog) ||
      chatsLoaded ||
      chatsLoading
    )
      return;
    loadChats(false);
  }, [
    accountName,
    chatsLoaded,
    chatsLoading,
    loadChats,
    showCreateDialog,
    showEditDialog,
    token,
  ]);

  const handleRefreshChats = async () => {
    await loadChats(true);
  };

  const refreshChats = async () => {
    await loadChats(true);
  };

  const applyChatSelection = (chatId: number, chatName: string) => {
    if (showCreateDialog) {
      setSelectedCreateChats([]);
      setNewTask({
        ...newTask,
        name: newTask.name || chatName,
        chat_id: chatId,
        chat_id_manual: chatId !== 0 ? chatId.toString() : "",
        chat_name: chatName,
      });
    } else {
      setEditTask({
        ...editTask,
        chat_id: chatId,
        chat_id_manual: chatId !== 0 ? chatId.toString() : "",
        chat_name: chatName,
        target_chats:
          chatId !== 0
            ? [
                {
                  chat_id: chatId,
                  name:
                    chatName ||
                    t("chat_default_name").replace("{id}", String(chatId)),
                  actions: [],
                  action_interval: editTask.action_interval,
                  message_thread_id: editTask.message_thread_id,
                  delete_after: editTask.delete_after,
                },
              ]
            : [],
      });
    }
  };

  const handleDeleteTask = async (taskName: string) => {
    if (!token) return;

    if (!confirm(t("confirm_delete"))) {
      return;
    }

    try {
      setLoading(true);
      await deleteSignTask(token, taskName, accountName);
      // No toast here; refresh the list after deleting.
      await loadData(token);
    } catch (err: any) {
      // Only show error if it's NOT a 404 (already deleted/doesn't exist)
      if (err.status !== 404 && !err.message?.includes("not exist")) {
        addToast(formatErrorMessage("delete_failed", err), "error");
      } else {
        await loadData(token); // Refresh anyway if it doesn't exist
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRunTask = async (task: SignTask) => {
    if (!token) return;

    const taskName = task.name;
    const initialLogs = [
      `${t("run_now")}: ${taskName}`,
      `目标会话: ${task.chats.length} 个`,
      ...task.chats.map((chat, index) => {
        const chatName = chat.name || chat.chat_id;
        return `${index + 1}/${task.chats.length} ${chatName} (${chat.chat_id})，动作 ${chat.actions?.length || 0} 步`;
      }),
      "等待后端执行日志...",
    ];

    try {
      setRunningTaskNames((prev) => new Set(prev).add(taskName));
      setLiveLogTaskName(taskName);
      setLiveLogs(initialLogs);
      const result = await runSignTask(token, taskName, accountName);
      const outputLogs = (result.output || "").split(/\r?\n/).filter(Boolean);
      try {
        const logs = await getSignTaskLogs(token, taskName, accountName);
        const finalLogs =
          logs && logs.length >= outputLogs.length ? logs : outputLogs;
        setLiveLogs(finalLogs.length > 0 ? finalLogs : initialLogs);
      } catch {
        setLiveLogs(outputLogs.length > 0 ? outputLogs : initialLogs);
      }

      if (!result.success && result.error) {
        setLiveLogs((prev) => (prev.length > 0 ? prev : [result.error]));
      }
    } catch (err: any) {
      setLiveLogs((prev) => [
        ...prev,
        `${t("task_run_failed")}: ${err?.message || err}`,
      ]);
    } finally {
      setRunningTaskNames((prev) => {
        const next = new Set(prev);
        next.delete(taskName);
        return next;
      });
      await loadData(token);
    }
  };

  const handleToggleTaskEnabled = async (task: SignTask) => {
    if (!token) return;
    const nextEnabled = task.enabled === false;

    try {
      setLoading(true);
      await updateSignTask(
        token,
        task.name,
        { enabled: nextEnabled },
        accountName,
      );
      setTasks((prev) =>
        prev.map((item) =>
          item.name === task.name ? { ...item, enabled: nextEnabled } : item,
        ),
      );
      addToast(taskEnabledUpdated(nextEnabled), "success");
      await loadData(token);
    } catch (err: any) {
      addToast(formatErrorMessage("update_failed", err), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleShowTaskHistory = async (task: SignTask) => {
    if (!token) return;
    setHistoryTaskName(task.name);
    setHistoryLogs([]);
    setExpandedHistoryLogs(new Set());
    setHistoryLoading(true);
    try {
      const logs = await getSignTaskHistory(token, task.name, accountName, 30);
      setHistoryLogs(logs);
    } catch (err: any) {
      addToast(formatErrorMessage("logs_fetch_failed", err), "error");
    } finally {
      setHistoryLoading(false);
    }
  };

  const importTaskFromConfig = async (
    rawConfig: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!token) return { ok: false, error: "NO_TOKEN" };
    const taskConfig = (rawConfig || "").trim();
    if (!taskConfig) {
      addToast(t("import_empty"), "error");
      return { ok: false, error: t("import_empty") };
    }

    try {
      setLoading(true);
      let parsed: any = null;
      try {
        parsed = JSON.parse(taskConfig);
      } catch {
        parsed = null;
      }
      if (
        parsed &&
        typeof parsed === "object" &&
        parsed.signs &&
        typeof parsed.signs === "object"
      ) {
        const taskOnlyBundle: {
          signs: Record<string, any>;
          monitors: Record<string, any>;
          settings: Record<string, any>;
        } = {
          signs: {},
          monitors: {},
          settings: {},
        };
        for (const [key, value] of Object.entries(parsed.signs)) {
          if (!value || typeof value !== "object") continue;
          const config: Record<string, any> = {
            ...(value as Record<string, any>),
            account_name: accountName,
          };
          const taskName = String(config.name || key).split("@")[0];
          taskOnlyBundle.signs[`${taskName}@${accountName}`] = config;
        }
        await importAllConfigs(token, JSON.stringify(taskOnlyBundle), false);
        addToast(t("paste_all_tasks_success"), "success");
        await loadData(token);
        return { ok: true };
      }

      const result = await importSignTask(
        token,
        taskConfig,
        undefined,
        accountName,
      );
      addToast(pasteTaskSuccess(result.task_name), "success");
      await loadData(token);
      return { ok: true };
    } catch (err: any) {
      const message = err?.message
        ? `${pasteTaskFailed}: ${err.message}`
        : pasteTaskFailed;
      addToast(message, "error");
      return { ok: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  const handleCopyTask = async (taskName: string) => {
    if (!token) return;

    try {
      setLoading(true);
      const taskConfig = await exportSignTask(token, taskName, accountName);
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(taskConfig);
          addToast(copyTaskSuccess(taskName), "success");
          return;
        } catch {
          addToast(copyTaskFallbackManual, "error");
        }
      }
      setCopyTaskDialog({ taskName, config: taskConfig });
    } catch (err: any) {
      const message = err?.message
        ? `${copyTaskFailed}: ${err.message}`
        : copyTaskFailed;
      addToast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAllTasks = async () => {
    if (!token) return;
    if (tasks.length === 0) {
      addToast(t("copy_all_tasks_empty"), "error");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      addToast(clipboardUnsupported, "error");
      return;
    }

    try {
      setLoading(true);
      const bundle: {
        signs: Record<string, any>;
        monitors: Record<string, any>;
        settings: Record<string, any>;
      } = {
        signs: {},
        monitors: {},
        settings: {},
      };
      for (const task of tasks) {
        const raw = await exportSignTask(token, task.name, accountName);
        const parsed = JSON.parse(raw);
        const config = { ...(parsed.config || {}) };
        config.account_name = accountName;
        const key = `${parsed.task_name || task.name}@${accountName}`;
        bundle.signs[key] = config;
      }
      await navigator.clipboard.writeText(JSON.stringify(bundle, null, 2));
      addToast(t("copy_all_tasks_success"), "success");
    } catch (err: any) {
      const message = err?.message
        ? `${t("copy_all_tasks_failed")}: ${err.message}`
        : t("copy_all_tasks_failed");
      addToast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyTaskConfig = async () => {
    if (!copyTaskDialog) return;
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      addToast(clipboardUnsupported, "error");
      return;
    }
    try {
      setCopyingConfig(true);
      await navigator.clipboard.writeText(copyTaskDialog.config);
      addToast(copyTaskSuccess(copyTaskDialog.taskName), "success");
      setCopyTaskDialog(null);
    } catch (err: any) {
      const message = err?.message
        ? `${copyTaskFailed}: ${err.message}`
        : copyTaskFailed;
      addToast(message, "error");
    } finally {
      setCopyingConfig(false);
    }
  };

  const handlePasteDialogImport = async () => {
    setImportingPastedConfig(true);
    const result = await importTaskFromConfig(pasteTaskConfigInput);
    if (result.ok) {
      setShowPasteDialog(false);
      setPasteTaskConfigInput("");
    }
    setImportingPastedConfig(false);
  };

  const handlePasteTask = async () => {
    if (!token) return;

    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      try {
        const taskConfig = (await navigator.clipboard.readText()).trim();
        if (taskConfig) {
          const result = await importTaskFromConfig(taskConfig);
          if (result.ok) {
            return;
          }
          setPasteTaskConfigInput(taskConfig);
          setShowPasteDialog(true);
          return;
        }
      } catch {
        addToast(clipboardReadFailed, "error");
      }
    } else {
      addToast(clipboardUnsupported, "error");
    }

    setPasteTaskConfigInput("");
    setShowPasteDialog(true);
  };

  const closeCopyTaskDialog = () => {
    if (copyingConfig) {
      return;
    }
    setCopyTaskDialog(null);
  };

  const closePasteTaskDialog = () => {
    if (importingPastedConfig || loading) {
      return;
    }
    setShowPasteDialog(false);
    setPasteTaskConfigInput("");
  };

  const handleCreateTask = async () => {
    if (!token) return;

    const nextExecutionMode: "fixed" | "range" =
      newTask.schedule_mode === "range" ? "range" : "fixed";
    const nextSignAt =
      newTask.schedule_mode === "fixed_time"
        ? cronFromFixedTime(newTask.fixed_time)
        : newTask.sign_at.trim();

    if (
      newTask.schedule_mode === "fixed_time" &&
      !TIME_24H_PATTERN.test(nextSignAt)
    ) {
      addToast(t("cron_required"), "error");
      return;
    }
    if (newTask.schedule_mode === "cron" && !nextSignAt) {
      addToast(t("cron_required"), "error");
      return;
    }

    const nextRangeStart = normalizeTime24h(newTask.range_start, "09:00");
    const nextRangeEnd = normalizeTime24h(newTask.range_end, "18:00");
    if (
      newTask.schedule_mode === "range" &&
      (!TIME_24H_PATTERN.test(nextRangeStart) ||
        !TIME_24H_PATTERN.test(nextRangeEnd))
    ) {
      addToast(t("range_required"), "error");
      return;
    }

    let chatId = newTask.chat_id;
    if (newTask.chat_id_manual) {
      chatId = parseInt(newTask.chat_id_manual);
      if (isNaN(chatId)) {
        addToast(t("chat_id_numeric"), "error");
        return;
      }
    }

    const hasManualChat = chatId !== 0;
    const selectedChatsForCreate = hasManualChat ? [] : selectedCreateChats;

    if (!hasManualChat && selectedChatsForCreate.length === 0) {
      addToast(t("select_chat_error"), "error");
      return;
    }

    if (
      newTask.actions.length === 0 ||
      newTask.actions.some((action) => !isActionValid(action))
    ) {
      addToast(t("add_action_error"), "error");
      return;
    }

    try {
      setLoading(true);
      const commonRequest = {
        account_name: accountName,
        group: newTask.group.trim(),
        sign_at: nextSignAt,
        random_seconds: newTask.random_minutes * 60,
        execution_mode: nextExecutionMode,
        range_start: nextRangeStart,
        range_end: nextRangeEnd,
        enabled: newTask.enabled,
        notify_on_failure: newTask.notify_on_failure,
      };

      if (hasManualChat || createTargetMode === "single_task") {
        const targetChats = hasManualChat
          ? [buildManualSignTaskChat(chatId)]
          : selectedChatsForCreate.map((chat) => buildSignTaskChat(chat));
        const firstChat = targetChats[0];
        const fallbackTaskName =
          sanitizeTaskName(newTask.chat_name) ||
          sanitizeTaskName(firstChat?.name || "") ||
          sanitizeTaskName(hasManualChat ? `chat_${chatId}` : "") ||
          `task_${Date.now()}`;
        const finalTaskName =
          sanitizeTaskName(newTask.name) || fallbackTaskName;
        const request: CreateSignTaskRequest = {
          ...commonRequest,
          name: finalTaskName,
          chats: targetChats,
        };
        await createSignTask(token, request);
        addToast(t("create_success"), "success");
      } else {
        let successCount = 0;
        let failureCount = 0;
        for (const chat of selectedChatsForCreate) {
          const request: CreateSignTaskRequest = {
            ...commonRequest,
            name: buildBatchTaskName(newTask.name, chat),
            chats: [buildSignTaskChat(chat)],
          };
          try {
            await createSignTask(token, request);
            successCount += 1;
          } catch {
            failureCount += 1;
          }
        }
        addToast(
          batchCreateSummary(successCount, failureCount),
          failureCount > 0 ? "error" : "success",
        );
      }
      setShowCreateDialog(false);
      resetCreateTaskForm();
      await loadData(token);
    } catch (err: any) {
      addToast(formatErrorMessage("create_failed", err), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAddAction = () => {
    setNewTask({
      ...newTask,
      actions: [...newTask.actions, { action: 1, text: "" }],
    });
  };

  const handleRemoveAction = (index: number) => {
    setNewTask({
      ...newTask,
      actions: newTask.actions.filter((_, i) => i !== index),
    });
  };

  const handleEditTask = (task: SignTask) => {
    setEditingTaskName(task.name);
    const chat = task.chats[0];
    const targetChats = task.chats || [];
    setEditTask({
      group: task.group || "",
      sign_at: task.sign_at,
      fixed_time: fixedTimeFromSchedule(task.sign_at),
      random_minutes: Math.round(task.random_seconds / 60),
      chat_id: chat?.chat_id || 0,
      chat_id_manual: chat?.chat_id?.toString() || "",
      chat_name: chat?.name || "",
      message_thread_id: chat?.message_thread_id,
      actions: chat?.actions || [{ action: 1, text: "" }],
      delete_after: chat?.delete_after,
      action_interval: chat?.action_interval || 1,
      schedule_mode: scheduleModeFromTask(task),
      execution_mode: task.execution_mode || "fixed",
      range_start: task.range_start || "09:00",
      range_end: task.range_end || "18:00",
      enabled: task.enabled !== false,
      notify_on_failure: task.notify_on_failure !== false,
      target_chats: targetChats,
    });
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!token) return;

    let editTargets = editTask.target_chats;
    const manualChatId = parseInt(editTask.chat_id_manual) || 0;
    if (
      manualChatId &&
      !editTargets.some((chat) => chat.chat_id === manualChatId)
    ) {
      editTargets = [
        {
          chat_id: manualChatId,
          name:
            editTask.chat_name ||
            t("chat_default_name").replace("{id}", String(manualChatId)),
          actions: [],
          action_interval: editTask.action_interval,
          message_thread_id: editTask.message_thread_id,
          delete_after: editTask.delete_after,
        },
      ];
    }
    if (editTargets.length === 0) {
      addToast(t("select_chat_error"), "error");
      return;
    }
    if (
      editTask.actions.length === 0 ||
      editTask.actions.some((action) => !isActionValid(action))
    ) {
      addToast(t("add_action_error"), "error");
      return;
    }

    const nextExecutionMode: "fixed" | "range" =
      editTask.schedule_mode === "range" ? "range" : "fixed";
    const nextSignAt =
      editTask.schedule_mode === "fixed_time"
        ? cronFromFixedTime(editTask.fixed_time)
        : editTask.sign_at.trim();

    if (
      editTask.schedule_mode === "fixed_time" &&
      !TIME_24H_PATTERN.test(nextSignAt)
    ) {
      addToast(t("cron_required"), "error");
      return;
    }
    if (editTask.schedule_mode === "cron" && !nextSignAt) {
      addToast(t("cron_required"), "error");
      return;
    }

    const nextRangeStart = normalizeTime24h(editTask.range_start, "09:00");
    const nextRangeEnd = normalizeTime24h(editTask.range_end, "18:00");
    if (
      editTask.schedule_mode === "range" &&
      (!TIME_24H_PATTERN.test(nextRangeStart) ||
        !TIME_24H_PATTERN.test(nextRangeEnd))
    ) {
      addToast(t("range_required"), "error");
      return;
    }

    const updatedChats = editTargets.map((chat) => ({
      ...chat,
      name:
        chat.name ||
        t("chat_default_name").replace("{id}", String(chat.chat_id)),
      message_thread_id: editTask.message_thread_id,
      actions: editTask.actions,
      delete_after: editTask.delete_after,
      action_interval: editTask.action_interval,
    }));

    try {
      setLoading(true);

      await updateSignTask(
        token,
        editingTaskName,
        {
          group: editTask.group.trim(),
          sign_at: nextSignAt,
          random_seconds: editTask.random_minutes * 60,
          chats: updatedChats,
          execution_mode: nextExecutionMode,
          range_start: nextRangeStart,
          range_end: nextRangeEnd,
          enabled: editTask.enabled,
          notify_on_failure: editTask.notify_on_failure,
        },
        accountName,
      );

      addToast(t("update_success"), "success");
      setShowEditDialog(false);
      await loadData(token);
    } catch (err: any) {
      addToast(formatErrorMessage("update_failed", err), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleEditAddAction = () => {
    setEditTask({
      ...editTask,
      actions: [...editTask.actions, { action: 1, text: "" }],
    });
  };

  const handleEditRemoveAction = (index: number) => {
    if (editTask.actions.length <= 1) return;
    setEditTask({
      ...editTask,
      actions: editTask.actions.filter((_, i) => i !== index),
    });
  };

  const updateCurrentDialogAction = useCallback(
    (index: number, updater: (action: any) => any) => {
      if (showCreateDialog) {
        setNewTask((prev) => {
          if (index < 0 || index >= prev.actions.length) return prev;
          const nextActions = [...prev.actions];
          nextActions[index] = updater(
            nextActions[index] || { action: 1, text: "" },
          );
          return { ...prev, actions: nextActions };
        });
        return;
      }

      setEditTask((prev) => {
        if (index < 0 || index >= prev.actions.length) return prev;
        const nextActions = [...prev.actions];
        nextActions[index] = updater(
          nextActions[index] || { action: 1, text: "" },
        );
        return { ...prev, actions: nextActions };
      });
    },
    [showCreateDialog],
  );

  const updateKeywordContinueAction = useCallback(
    (
      actionIndex: number,
      continueIndex: number,
      updater: (action: any) => any,
    ) => {
      updateCurrentDialogAction(actionIndex, (currentAction) => {
        const continueActions = Array.isArray(currentAction?.continue_actions)
          ? [...currentAction.continue_actions]
          : [];
        if (continueIndex < 0 || continueIndex >= continueActions.length)
          return currentAction;
        continueActions[continueIndex] = updater(
          continueActions[continueIndex] || { action: 1, text: "{keyword}" },
        );
        return { ...currentAction, continue_actions: continueActions };
      });
    },
    [updateCurrentDialogAction],
  );

  const addKeywordContinueAction = useCallback(
    (actionIndex: number) => {
      updateCurrentDialogAction(actionIndex, (currentAction) => {
        const continueActions = Array.isArray(currentAction?.continue_actions)
          ? currentAction.continue_actions
          : [];
        return {
          ...currentAction,
          push_channel: "continue",
          continue_actions: [
            ...continueActions,
            { action: 1, text: "{keyword}" },
          ],
        };
      });
    },
    [updateCurrentDialogAction],
  );

  const removeKeywordContinueAction = useCallback(
    (actionIndex: number, continueIndex: number) => {
      updateCurrentDialogAction(actionIndex, (currentAction) => {
        const continueActions = Array.isArray(currentAction?.continue_actions)
          ? currentAction.continue_actions
          : [];
        return {
          ...currentAction,
          continue_actions: continueActions.filter(
            (_: any, index: number) => index !== continueIndex,
          ),
        };
      });
    },
    [updateCurrentDialogAction],
  );

  const appendKeywordVariable = useCallback(
    (actionIndex: number, continueIndex: number, variable: string) => {
      updateKeywordContinueAction(
        actionIndex,
        continueIndex,
        (currentAction) => {
          const currentText = String(currentAction?.text || "");
          const separator =
            currentText && !currentText.endsWith(" ") ? " " : "";
          return {
            ...currentAction,
            text: `${currentText}${separator}${variable}`,
          };
        },
      );
    },
    [updateKeywordContinueAction],
  );

  const visibleChats = chats.slice(0, CHAT_LIST_PREVIEW_LIMIT);

  if (!token || checking) {
    return null;
  }

  return (
    <div id="account-tasks-view" className="w-full h-full flex flex-col">
      <nav className="navbar">
        <div className="nav-brand">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="action-btn"
              title={t("sidebar_home")}
            >
              <CaretLeft weight="bold" />
            </Link>
            <h1 className="text-lg font-bold tracking-tight">{accountName}</h1>
          </div>
        </div>
        <div className="top-right-actions">
          <button
            onClick={handleCopyAllTasks}
            disabled={loading}
            className="action-btn"
            title={copyAllTasksTitle}
          >
            <Copy weight="bold" />
          </button>
          <button
            onClick={handlePasteTask}
            disabled={loading}
            className="action-btn"
            title={pasteTaskTitle}
          >
            <ClipboardText weight="bold" />
          </button>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="action-btn"
            title={t("add_task")}
          >
            <Plus weight="bold" />
          </button>
        </div>
      </nav>

      <main className="main-content !pt-6">
        {loading && tasks.length === 0 ? (
          <div className="w-full py-20 flex flex-col items-center justify-center text-main/20">
            <Spinner size={40} weight="bold" className="animate-spin mb-4" />
            <p className="text-xs uppercase tracking-widest font-bold font-mono">
              {t("loading")}
            </p>
          </div>
        ) : tasks.length === 0 ? (
          <div
            className="glass-panel p-20 flex flex-col items-center text-center justify-center border-dashed border-2 group hover:border-[#8a3ffc]/30 transition-all cursor-pointer"
            onClick={() => setShowCreateDialog(true)}
          >
            <div className="w-20 h-20 rounded-3xl bg-main/5 flex items-center justify-center text-main/20 mb-6 group-hover:scale-110 transition-transform group-hover:bg-[#8a3ffc]/10 group-hover:text-[#8a3ffc]">
              <Plus size={40} weight="bold" />
            </div>
            <h3 className="text-xl font-bold mb-2">{t("no_tasks")}</h3>
            <p className="text-sm text-[#9496a1]">{t("no_tasks_desc")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {groupedTasks.map((group) => {
              const collapsed = collapsedGroups.has(group.name);
              const enabledCount = group.tasks.filter(
                (task) => task.enabled !== false,
              ).length;
              return (
                <section
                  key={group.name}
                  className="flex flex-col gap-3 scroll-mt-4"
                >
                  <button
                    type="button"
                    className="flex items-center justify-between gap-3 px-2 pt-1 pb-2 text-left"
                    onClick={() => toggleGroupCollapsed(group.name)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <CaretDown
                        weight="bold"
                        size={14}
                        className={`text-main/35 shrink-0 transition-transform ${collapsed ? "-rotate-90" : ""}`}
                      />
                      <span className="font-bold text-sm truncate">
                        {group.name}
                      </span>
                      <span className="rounded-full bg-[#8a3ffc]/10 px-2 py-0.5 text-[10px] font-bold text-[#8a3ffc]">
                        {group.tasks.length}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-main/35">
                      {enabledCount}/{group.tasks.length} {taskEnabledLabel}
                    </span>
                  </button>
                  {!collapsed ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-3">
                      {group.tasks.map((task) => (
                        <TaskItem
                          key={task.name}
                          task={task}
                          loading={loading}
                          running={runningTaskNames.has(task.name)}
                          onEdit={handleEditTask}
                          onRun={handleRunTask}
                          onToggleEnabled={handleToggleTaskEnabled}
                          onViewLogs={handleShowTaskHistory}
                          onCopy={handleCopyTask}
                          onDelete={handleDeleteTask}
                          t={t}
                          language={language}
                        />
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </main>

      {/* Create/Edit task dialog */}
      {(showCreateDialog || showEditDialog) && (
        <div className="modal-overlay active">
          <div
            className="glass-panel modal-content !w-[min(96vw,1120px)] !max-w-[1120px] !h-[min(92vh,900px)] !p-0 overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="p-5 border-b border-white/5 flex justify-between items-center bg-white/2 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#8a3ffc]/10 text-[#b57dff] flex items-center justify-center shrink-0">
                  <Lightning weight="fill" size={18} />
                </div>
                <div className="min-w-0">
                  <div className="font-bold truncate">
                    {showCreateDialog
                      ? t("create_task")
                      : `${t("edit_task")}: ${editingTaskName}`}
                  </div>
                  <div className="text-[10px] text-main/40">{accountName}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <label className="inline-flex h-7 items-center gap-1.5 text-[10px] text-main/60 font-medium whitespace-nowrap">
                  <input
                    type="checkbox"
                    className="!mb-0 h-3.5 w-3.5 accent-emerald-500"
                    checked={
                      showCreateDialog ? newTask.enabled : editTask.enabled
                    }
                    onChange={(e) => {
                      showCreateDialog
                        ? setNewTask({ ...newTask, enabled: e.target.checked })
                        : setEditTask({
                            ...editTask,
                            enabled: e.target.checked,
                          });
                    }}
                  />
                  {taskEnabledLabel}
                </label>
                <label className="inline-flex h-7 items-center gap-1.5 text-[10px] text-main/60 font-medium whitespace-nowrap">
                  <input
                    type="checkbox"
                    className="!mb-0 h-3.5 w-3.5 accent-[#8a3ffc]"
                    checked={
                      showCreateDialog
                        ? newTask.notify_on_failure
                        : editTask.notify_on_failure
                    }
                    onChange={(e) => {
                      showCreateDialog
                        ? setNewTask({
                            ...newTask,
                            notify_on_failure: e.target.checked,
                          })
                        : setEditTask({
                            ...editTask,
                            notify_on_failure: e.target.checked,
                          });
                    }}
                  />
                  {taskFailureNotifyLabel}
                </label>
                <button
                  onClick={() => {
                    setShowCreateDialog(false);
                    setShowEditDialog(false);
                    if (showCreateDialog) resetCreateTaskForm();
                  }}
                  className="action-btn !w-8 !h-8"
                >
                  <X weight="bold" />
                </button>
              </div>
            </header>

            <div className="p-5 grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-5 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              <section className="space-y-4">
                <div className={dialogSectionClass}>
                  <h3 className={dialogSectionTitleClass}>
                    <Lightning weight="fill" className="text-[#b57dff]" />
                    {t("basic_config") === "basic_config"
                      ? language === "zh"
                        ? "基础配置"
                        : "Basic Config"
                      : t("basic_config")}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    {showCreateDialog ? (
                      <div className="space-y-2">
                        <label className={fieldLabelClass}>
                          {t("task_name")}
                        </label>
                        <input
                          className="!mb-0"
                          placeholder={taskNamePlaceholder}
                          value={newTask.name}
                          onChange={(e) =>
                            setNewTask({ ...newTask, name: e.target.value })
                          }
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <label className={fieldLabelClass}>
                          {t("task_name")}
                        </label>
                        <input
                          className="!mb-0"
                          value={editingTaskName}
                          readOnly
                          aria-readonly="true"
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className={fieldLabelClass}>{groupLabel}</label>
                      <input
                        className="!mb-0"
                        placeholder={groupPlaceholder}
                        value={
                          showCreateDialog ? newTask.group : editTask.group
                        }
                        onChange={(e) =>
                          showCreateDialog
                            ? setNewTask({ ...newTask, group: e.target.value })
                            : setEditTask({
                                ...editTask,
                                group: e.target.value,
                              })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <label className={fieldLabelClass}>
                        {t("action_interval")}
                      </label>
                      <input
                        type="text"
                        className="!mb-0"
                        value={
                          showCreateDialog
                            ? newTask.action_interval
                            : editTask.action_interval
                        }
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          showCreateDialog
                            ? setNewTask({ ...newTask, action_interval: val })
                            : setEditTask({
                                ...editTask,
                                action_interval: val,
                              });
                        }}
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <label className={fieldLabelClass}>
                        {t("scheduling_mode")}
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            ["fixed_time", scheduleFixedTimeLabel],
                            ["range", scheduleRangeLabel],
                            ["cron", scheduleCronLabel],
                          ] as Array<[ScheduleMode, string]>
                        ).map(([mode, label]) => {
                          const active =
                            (showCreateDialog
                              ? newTask.schedule_mode
                              : editTask.schedule_mode) === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              className={`h-10 rounded-lg border text-xs font-bold transition-colors ${active ? "border-[#8a3ffc]/50 bg-[#8a3ffc]/15 text-[#b57dff]" : "border-white/5 bg-black/5 text-main/50 hover:text-main/80"}`}
                              onClick={() =>
                                showCreateDialog
                                  ? setNewTask({
                                      ...newTask,
                                      schedule_mode: mode,
                                      execution_mode:
                                        mode === "range" ? "range" : "fixed",
                                    })
                                  : setEditTask({
                                      ...editTask,
                                      schedule_mode: mode,
                                      execution_mode:
                                        mode === "range" ? "range" : "fixed",
                                    })
                              }
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      {(showCreateDialog
                        ? newTask.schedule_mode
                        : editTask.schedule_mode) === "fixed_time" ? (
                        <>
                          <label className={fieldLabelClass}>
                            {fixedTimeLabel}
                          </label>
                          <input
                            type="time"
                            className="!mb-0"
                            value={
                              showCreateDialog
                                ? newTask.fixed_time
                                : editTask.fixed_time
                            }
                            onChange={(e) =>
                              showCreateDialog
                                ? setNewTask({
                                    ...newTask,
                                    fixed_time: e.target.value,
                                  })
                                : setEditTask({
                                    ...editTask,
                                    fixed_time: e.target.value,
                                  })
                            }
                          />
                        </>
                      ) : (showCreateDialog
                          ? newTask.schedule_mode
                          : editTask.schedule_mode) === "cron" ? (
                        <>
                          <label className={fieldLabelClass}>
                            {t("sign_time_cron")}
                          </label>
                          <input
                            className="!mb-0"
                            placeholder="0 6 * * *"
                            value={
                              showCreateDialog
                                ? newTask.sign_at
                                : editTask.sign_at
                            }
                            onChange={(e) =>
                              showCreateDialog
                                ? setNewTask({
                                    ...newTask,
                                    sign_at: e.target.value,
                                  })
                                : setEditTask({
                                    ...editTask,
                                    sign_at: e.target.value,
                                  })
                            }
                          />
                          <div className="text-[10px] text-main/30 mt-1 italic">
                            {t("cron_example")}
                          </div>
                        </>
                      ) : (
                        <>
                          <label className={fieldLabelClass}>
                            {t("time_range")}
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <label className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.035] px-3 py-2.5 text-main/45 min-w-0">
                              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider">
                                {t("start_label")}
                              </span>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-2][0-9]:[0-5][0-9]"
                                placeholder="09:00"
                                className="!mb-0 !h-7 !border-0 !bg-transparent !p-0 !text-right !font-mono !text-sm !shadow-none focus:!shadow-none"
                                aria-label={t("start_label")}
                                title={t("start_label")}
                                value={
                                  showCreateDialog
                                    ? newTask.range_start
                                    : editTask.range_start
                                }
                                onBlur={(e) => {
                                  const next = normalizeTime24h(
                                    e.target.value,
                                    showCreateDialog
                                      ? newTask.range_start
                                      : editTask.range_start,
                                  );
                                  showCreateDialog
                                    ? setNewTask({
                                        ...newTask,
                                        range_start: next,
                                      })
                                    : setEditTask({
                                        ...editTask,
                                        range_start: next,
                                      });
                                }}
                                onChange={(e) => {
                                  const next = cleanTime24hInput(
                                    e.target.value,
                                  );
                                  showCreateDialog
                                    ? setNewTask({
                                        ...newTask,
                                        range_start: next,
                                      })
                                    : setEditTask({
                                        ...editTask,
                                        range_start: next,
                                      });
                                }}
                              />
                            </label>
                            <label className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.035] px-3 py-2.5 text-main/45 min-w-0">
                              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider">
                                {t("end_label")}
                              </span>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-2][0-9]:[0-5][0-9]"
                                placeholder="18:00"
                                className="!mb-0 !h-7 !border-0 !bg-transparent !p-0 !text-right !font-mono !text-sm !shadow-none focus:!shadow-none"
                                aria-label={t("end_label")}
                                title={t("end_label")}
                                value={
                                  showCreateDialog
                                    ? newTask.range_end
                                    : editTask.range_end
                                }
                                onBlur={(e) => {
                                  const next = normalizeTime24h(
                                    e.target.value,
                                    showCreateDialog
                                      ? newTask.range_end
                                      : editTask.range_end,
                                  );
                                  showCreateDialog
                                    ? setNewTask({
                                        ...newTask,
                                        range_end: next,
                                      })
                                    : setEditTask({
                                        ...editTask,
                                        range_end: next,
                                      });
                                }}
                                onChange={(e) => {
                                  const next = cleanTime24hInput(
                                    e.target.value,
                                  );
                                  showCreateDialog
                                    ? setNewTask({
                                        ...newTask,
                                        range_end: next,
                                      })
                                    : setEditTask({
                                        ...editTask,
                                        range_end: next,
                                      });
                                }}
                              />
                            </label>
                          </div>
                        </>
                      )}
                    </div>

                    {(showCreateDialog
                      ? newTask.schedule_mode
                      : editTask.schedule_mode) !== "range" && (
                      <div className="space-y-2 md:col-span-2">
                        <label className={fieldLabelClass}>
                          {scheduleJitterLabel}
                        </label>
                        <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.035] px-3 py-2.5 text-main/45 min-w-0">
                          <input
                            type="number"
                            min={0}
                            max={1440}
                            step={1}
                            className="!mb-0 !h-7 !border-0 !bg-transparent !p-0 !font-mono !text-sm !shadow-none focus:!shadow-none"
                            value={
                              showCreateDialog
                                ? newTask.random_minutes
                                : editTask.random_minutes
                            }
                            onChange={(e) => {
                              const next = Math.max(
                                0,
                                Math.min(
                                  1440,
                                  parseInt(e.target.value || "0", 10) || 0,
                                ),
                              );
                              showCreateDialog
                                ? setNewTask({
                                    ...newTask,
                                    random_minutes: next,
                                  })
                                : setEditTask({
                                    ...editTask,
                                    random_minutes: next,
                                  });
                            }}
                          />
                          <span className="shrink-0 text-xs font-bold text-main/45">
                            {minutesLabel}
                          </span>
                        </div>
                        <div className="text-[10px] text-main/30 italic">
                          {scheduleJitterHint}
                        </div>
                      </div>
                    )}
                    <div className="space-y-2 md:col-span-2">
                      <label className={fieldLabelClass}>
                        {t("delete_after")}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder={t("delete_after_placeholder")}
                        className="!mb-0"
                        value={
                          showCreateDialog
                            ? (newTask.delete_after ?? "")
                            : (editTask.delete_after ?? "")
                        }
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/[^0-9]/g, "");
                          const val =
                            cleaned === "" ? undefined : Number(cleaned);
                          showCreateDialog
                            ? setNewTask({ ...newTask, delete_after: val })
                            : setEditTask({ ...editTask, delete_after: val });
                        }}
                      />
                    </div>
                  </div>
                </div>
              </section>
              <section className="space-y-1.5">
                <div className="rounded-xl border border-white/5 bg-white/5 p-3 space-y-3">
                  <h3 className={dialogSectionTitleClass}>
                    <ChatCircleText weight="bold" className="text-cyan-400" />
                    {t("target_chats") === "target_chats"
                      ? language === "zh"
                        ? "目标会话"
                        : "Target Chats"
                      : t("target_chats")}
                  </h3>
                  {showCreateDialog && (
                    <div className="space-y-2">
                      <label className="text-[10px] text-main/40 uppercase tracking-wider">
                        {createTargetModeLabel}
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          className={`h-9 rounded-lg border text-xs font-bold transition-colors ${createTargetMode === "single_task" ? "border-[#8a3ffc]/50 bg-[#8a3ffc]/15 text-[#b57dff]" : "border-white/5 bg-black/5 text-main/50 hover:text-main/80"}`}
                          onClick={() => setCreateTargetMode("single_task")}
                        >
                          {createModeSingleTaskLabel}
                        </button>
                        <button
                          type="button"
                          className={`h-9 rounded-lg border text-xs font-bold transition-colors ${createTargetMode === "batch_tasks" ? "border-[#8a3ffc]/50 bg-[#8a3ffc]/15 text-[#b57dff]" : "border-white/5 bg-black/5 text-main/50 hover:text-main/80"}`}
                          onClick={() => setCreateTargetMode("batch_tasks")}
                        >
                          {createModeBatchTasksLabel}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-end rounded-xl border border-cyan-400/10 bg-cyan-400/[0.035] p-2">
                      <div className="space-y-2">
                        <label className="text-[10px] text-main/40 uppercase tracking-wider">
                          {t("search_chat")}
                        </label>
                        <input
                          className="!mb-0 !bg-white/70 dark:!bg-white/[0.04]"
                          placeholder={t("search_chat_placeholder")}
                          value={chatSearch}
                          onChange={(e) => setChatSearch(e.target.value)}
                        />
                      </div>
                      <button
                        onClick={handleRefreshChats}
                        disabled={refreshingChats}
                        className="h-10 px-3 rounded-lg text-[10px] text-[#8a3ffc] hover:text-[#8a3ffc]/80 hover:bg-[#8a3ffc]/10 transition-colors uppercase font-bold tracking-tighter flex items-center gap-1"
                        title={t("refresh_chat_title")}
                      >
                        {refreshingChats ? (
                          <div className="w-3 h-3 border-2 border-[#8a3ffc] border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <ArrowClockwise weight="bold" size={12} />
                        )}
                        {t("refresh_list")}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_236px] gap-3 items-start">
                      <div className="space-y-1.5">
                        <div className="text-[10px] text-main/35 uppercase tracking-wider">
                          {chatSearch.trim()
                            ? isZh
                              ? "搜索结果"
                              : "Search Results"
                            : t("select_from_list")}
                        </div>
                        <div className="h-[166px] overflow-y-auto rounded-xl border border-white/5 bg-black/[0.035] custom-scrollbar">
                          {chatSearch.trim() ? (
                            chatSearchLoading ? (
                              <div className="px-3 py-2 text-xs text-main/40">
                                {t("searching")}
                              </div>
                            ) : chatSearchResults.length > 0 ? (
                              chatSearchResults.map((chat) => {
                                const title = getChatTitle(chat);
                                const selected = showCreateDialog
                                  ? selectedCreateChats.some(
                                      (item) => item.id === chat.id,
                                    )
                                  : editTask.target_chats.some(
                                      (item) => item.chat_id === chat.id,
                                    );
                                return (
                                  <button
                                    key={chat.id}
                                    type="button"
                                    className={`w-full text-left px-3 py-1.5 hover:bg-white/5 border-b border-white/5 last:border-b-0 flex items-center gap-2.5 transition-colors ${selected ? "bg-cyan-400/[0.08]" : ""}`}
                                    onClick={() =>
                                      showCreateDialog
                                        ? toggleSelectedChat(chat)
                                        : toggleEditTargetChat(chat)
                                    }
                                  >
                                    <span
                                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selected ? "bg-cyan-400 border-cyan-400 text-white" : "border-main/20 bg-white/40 dark:bg-white/5"}`}
                                    >
                                      {selected && (
                                        <CheckCircle weight="bold" size={12} />
                                      )}
                                    </span>
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold truncate">
                                        {title}
                                      </div>
                                      <div className="text-[10px] text-main/40 font-mono truncate">
                                        {chat.id}
                                        {chat.username
                                          ? ` · @${chat.username}`
                                          : ""}
                                      </div>
                                    </div>
                                  </button>
                                );
                              })
                            ) : (
                              <div className="px-3 py-2 text-xs text-main/40">
                                {t("search_no_results")}
                              </div>
                            )
                          ) : chatsLoading ? (
                            <div className="px-3 py-2 text-xs text-main/40 flex items-center gap-2">
                              <Spinner className="animate-spin" size={12} />
                              {t("loading")}
                            </div>
                          ) : visibleChats.length > 0 ? (
                            visibleChats.map((chat) => {
                              const title = getChatTitle(chat);
                              const selected = showCreateDialog
                                ? selectedCreateChats.some(
                                    (item) => item.id === chat.id,
                                  )
                                : editTask.target_chats.some(
                                    (item) => item.chat_id === chat.id,
                                  );
                              return (
                                <button
                                  key={chat.id}
                                  type="button"
                                  className={`w-full text-left px-3 py-1.5 hover:bg-white/5 border-b border-white/5 last:border-b-0 flex items-center gap-2.5 transition-colors ${selected ? "bg-cyan-400/[0.08]" : ""}`}
                                  onClick={() =>
                                    showCreateDialog
                                      ? toggleSelectedChat(chat)
                                      : toggleEditTargetChat(chat)
                                  }
                                >
                                  <span
                                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selected ? "bg-cyan-400 border-cyan-400 text-white" : "border-main/20 bg-white/40 dark:bg-white/5"}`}
                                  >
                                    {selected && (
                                      <CheckCircle weight="bold" size={12} />
                                    )}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold truncate">
                                      {title}
                                    </div>
                                    <div className="text-[10px] text-main/40 font-mono truncate">
                                      {chat.id}
                                      {chat.username
                                        ? ` · @${chat.username}`
                                        : ""}
                                    </div>
                                  </div>
                                </button>
                              );
                            })
                          ) : (
                            <div className="px-3 py-2 text-xs text-main/40">
                              {chatsLoaded
                                ? t("search_no_results")
                                : t("loading")}
                            </div>
                          )}
                        </div>
                        {chats.length > CHAT_LIST_PREVIEW_LIMIT && (
                          <div className="pt-2 text-[10px] text-main/30">
                            {chatListPreviewHint(
                              CHAT_LIST_PREVIEW_LIMIT,
                              chats.length,
                            )}
                          </div>
                        )}
                      </div>

                      <div className="space-y-3 rounded-xl border border-white/5 bg-white/[0.035] p-3">
                        <div className="space-y-2">
                          <label className="text-[10px] text-main/40 uppercase tracking-wider">
                            {t("manual_chat_id")}
                          </label>
                          {(() => {
                            const hasSelectedTargets = showCreateDialog
                              ? selectedCreateChats.length > 0
                              : editTask.target_chats.length > 0;
                            return (
                              <input
                                placeholder={t("manual_id_placeholder")}
                                className="!mb-0 !h-9 !text-xs"
                                disabled={hasSelectedTargets}
                                value={
                                  hasSelectedTargets
                                    ? ""
                                    : showCreateDialog
                                      ? newTask.chat_id_manual
                                      : editTask.chat_id_manual
                                }
                                onChange={(e) => {
                                  if (showCreateDialog) {
                                    setSelectedCreateChats([]);
                                    setNewTask({
                                      ...newTask,
                                      chat_id_manual: e.target.value,
                                      chat_id: 0,
                                      chat_name: "",
                                    });
                                  } else {
                                    const value = e.target.value.trim();
                                    const chatId = parseInt(value) || 0;
                                    setEditTask({
                                      ...editTask,
                                      chat_id_manual: value,
                                      chat_id: 0,
                                      chat_name: value
                                        ? t("chat_default_name").replace(
                                            "{id}",
                                            value,
                                          )
                                        : "",
                                      target_chats: chatId
                                        ? [
                                            {
                                              chat_id: chatId,
                                              name: t(
                                                "chat_default_name",
                                              ).replace("{id}", value),
                                              actions: [],
                                              action_interval:
                                                editTask.action_interval,
                                              message_thread_id:
                                                editTask.message_thread_id,
                                              delete_after:
                                                editTask.delete_after,
                                            },
                                          ]
                                        : [],
                                    });
                                  }
                                }}
                              />
                            );
                          })()}
                          {(showCreateDialog
                            ? selectedCreateChats.length > 0
                            : editTask.target_chats.length > 0) && (
                            <div className="text-[10px] text-main/30 leading-4">
                              {manualChatDisabledHint}
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] text-main/40 uppercase tracking-wider">
                            {t("topic_id_label") ||
                              "Topic/Thread ID (Optional)"}
                          </label>
                          <input
                            inputMode="numeric"
                            className="!mb-0 !h-9 !text-xs"
                            placeholder={
                              t("topic_id_placeholder") ||
                              "Leave blank if not applicable"
                            }
                            value={
                              showCreateDialog
                                ? newTask.message_thread_id || ""
                                : editTask.message_thread_id || ""
                            }
                            onChange={(e) => {
                              const val = e.target.value
                                ? parseInt(e.target.value)
                                : undefined;
                              showCreateDialog
                                ? setNewTask({
                                    ...newTask,
                                    message_thread_id: val,
                                  })
                                : setEditTask({
                                    ...editTask,
                                    message_thread_id: val,
                                  });
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="min-h-[62px] rounded-xl border border-cyan-400/10 bg-cyan-400/[0.035] px-3 py-2.5">
                      <div className="grid grid-cols-1 md:grid-cols-[96px_minmax(0,1fr)] gap-2 md:gap-3 items-start">
                        <div className="flex md:flex-col items-center md:items-start justify-between gap-2">
                          <label className="text-[10px] text-main/45 uppercase tracking-wider whitespace-nowrap">
                            {selectedChatsLabel} (
                            {showCreateDialog
                              ? selectedCreateChats.length
                              : editTask.target_chats.length}
                            )
                          </label>
                          <button
                            type="button"
                            className="text-[10px] text-[#8a3ffc] hover:text-[#8a3ffc]/80 font-bold uppercase shrink-0"
                            onClick={() =>
                              showCreateDialog
                                ? setSelectedCreateChats([])
                                : setEditTask({
                                    ...editTask,
                                    target_chats: [],
                                    chat_id: 0,
                                    chat_id_manual: "",
                                    chat_name: "",
                                  })
                            }
                          >
                            {clearSelectedChatsLabel}
                          </button>
                        </div>
                        <div className="min-w-0 space-y-1.5">
                          {(showCreateDialog
                            ? selectedCreateChats.length
                            : editTask.target_chats.length) > 0 ? (
                            <div className="flex max-h-[76px] flex-wrap gap-2 overflow-y-auto pr-1 custom-scrollbar">
                              {showCreateDialog
                                ? selectedCreateChats.map((chat) => (
                                    <button
                                      key={chat.id}
                                      type="button"
                                      className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-cyan-400/[0.12] px-2 py-1 text-[10px] font-bold text-cyan-700 dark:text-cyan-300 hover:bg-rose-500/10 hover:text-rose-300"
                                      onClick={() => toggleSelectedChat(chat)}
                                    >
                                      <span className="truncate max-w-[150px]">
                                        {getChatTitle(chat)}
                                      </span>
                                      <X weight="bold" size={12} />
                                    </button>
                                  ))
                                : editTask.target_chats.map((chat) => (
                                    <button
                                      key={chat.chat_id}
                                      type="button"
                                      className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-cyan-400/[0.12] px-2 py-1 text-[10px] font-bold text-cyan-700 dark:text-cyan-300 hover:bg-rose-500/10 hover:text-rose-300"
                                      onClick={() =>
                                        removeEditTargetChat(chat.chat_id)
                                      }
                                    >
                                      <span className="truncate max-w-[150px]">
                                        {chat.name || chat.chat_id}
                                      </span>
                                      <X weight="bold" size={12} />
                                    </button>
                                  ))}
                            </div>
                          ) : (
                            <div className="text-xs text-main/30">
                              {noSelectedChatsLabel}
                            </div>
                          )}
                          <div className="text-[10px] text-main/30 leading-4">
                            {multiSelectHint}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/5 bg-white/5 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className={dialogSectionTitleClass}>
                      <DotsThreeVertical weight="bold" />
                      {t("action_sequence")}
                    </h3>
                    <button
                      onClick={
                        showCreateDialog ? handleAddAction : handleEditAddAction
                      }
                      className="btn-secondary !h-7 !px-3 !text-[10px]"
                    >
                      + {t("add_action")}
                    </button>
                  </div>

                  <div className="flex flex-col gap-3">
                    {(showCreateDialog
                      ? newTask.actions
                      : editTask.actions
                    ).map((action, index) => (
                      <div
                        key={index}
                        className="rounded-xl border border-white/5 bg-black/5 p-3 animate-scale-in"
                      >
                        <div className="grid grid-cols-[2rem_minmax(0,1fr)_2.5rem] md:grid-cols-[2rem_minmax(0,125px)_minmax(0,1fr)_2.5rem] gap-3 items-start">
                          <div className="shrink-0 w-8 h-10 flex items-center justify-center font-mono text-[10px] text-main/35 font-bold border border-white/5 rounded-lg bg-white/5">
                            {index + 1}
                          </div>
                          <select
                            className="!h-10 !mb-0 !text-xs"
                            value={toActionTypeOption(action)}
                            onChange={(e) => {
                              const selectedType = e.target
                                .value as ActionTypeOption;
                              updateCurrentDialogAction(
                                index,
                                (currentAction) => {
                                  const currentActionId = Number(
                                    currentAction?.action,
                                  );
                                  if (selectedType === "1") {
                                    return {
                                      ...currentAction,
                                      action: 1,
                                      text: currentAction?.text || "",
                                    };
                                  }
                                  if (selectedType === "3") {
                                    return {
                                      ...currentAction,
                                      action: 3,
                                      text: currentAction?.text || "",
                                    };
                                  }
                                  if (selectedType === "2") {
                                    return {
                                      ...currentAction,
                                      action: 2,
                                      dice:
                                        currentAction?.dice || DICE_OPTIONS[0],
                                    };
                                  }
                                  if (selectedType === "9") {
                                    return {
                                      ...currentAction,
                                      action: 9,
                                      photo: currentAction?.photo || "",
                                      caption: currentAction?.caption || "",
                                    };
                                  }
                                  if (selectedType === "10") {
                                    return {
                                      ...currentAction,
                                      action: 10,
                                      from_chat_id:
                                        currentAction?.from_chat_id || "",
                                      message_ids:
                                        currentAction?.message_ids || [],
                                    };
                                  }
                                  if (selectedType === "keyword_notify") {
                                    return {
                                      ...currentAction,
                                      action: 8,
                                      keywords: currentAction?.keywords || [],
                                      match_mode:
                                        currentAction?.match_mode || "contains",
                                      ignore_case:
                                        currentAction?.ignore_case ?? true,
                                      push_channel:
                                        currentAction?.push_channel ||
                                        "telegram",
                                      bark_url: currentAction?.bark_url || "",
                                      custom_url:
                                        currentAction?.custom_url || "",
                                      forward_chat_id:
                                        currentAction?.forward_chat_id || "",
                                      forward_message_thread_id:
                                        currentAction?.forward_message_thread_id,
                                      continue_chat_id:
                                        currentAction?.continue_chat_id || "",
                                      continue_message_thread_id:
                                        currentAction?.continue_message_thread_id,
                                      continue_action_interval:
                                        currentAction?.continue_action_interval ??
                                        1,
                                      continue_actions:
                                        currentAction?.continue_actions || [],
                                    };
                                  }
                                  if (selectedType === "ai_vision") {
                                    const nextActionId =
                                      currentActionId === 4 ||
                                      currentActionId === 6
                                        ? currentActionId
                                        : 6;
                                    return {
                                      ...currentAction,
                                      action: nextActionId,
                                    };
                                  }
                                  const nextActionId =
                                    currentActionId === 5 ||
                                    currentActionId === 7
                                      ? currentActionId
                                      : 5;
                                  return {
                                    ...currentAction,
                                    action: nextActionId,
                                  };
                                },
                              );
                            }}
                          >
                            <option value="1">{sendTextLabel}</option>
                            <option value="3">{clickTextButtonLabel}</option>
                            <option value="2">{sendDiceLabel}</option>
                            <option value="9">{sendPhotoLabel}</option>
                            <option value="10">{forwardMessagesLabel}</option>
                            <option value="ai_vision">{aiVisionLabel}</option>
                            <option value="ai_logic">{aiCalcLabel}</option>
                            <option value="keyword_notify">
                              {keywordNotifyLabel}
                            </option>
                          </select>

                          <div className="min-w-0 col-span-3 md:col-span-1">
                            {(action.action === 1 || action.action === 3) && (
                              <textarea
                                placeholder={
                                  action.action === 1
                                    ? sendTextPlaceholder
                                    : clickButtonPlaceholder
                                }
                                rows={3}
                                className="!mb-0 min-h-[74px] max-h-[180px] w-full resize-y bg-white/[0.035] rounded-xl px-3 py-2.5 text-sm leading-6 text-main/75 border border-white/5 focus:border-[#8a3ffc]/40 focus:bg-white/[0.055] outline-none transition-all placeholder:text-main/20 custom-scrollbar"
                                value={action.text || ""}
                                onChange={(e) => {
                                  updateCurrentDialogAction(
                                    index,
                                    (currentAction) => ({
                                      ...currentAction,
                                      text: e.target.value,
                                    }),
                                  );
                                }}
                              />
                            )}
                            {action.action === 2 && (
                              <div className="flex items-center gap-2 overflow-x-auto">
                                {DICE_OPTIONS.map((d) => (
                                  <button
                                    key={d}
                                    type="button"
                                    className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-lg transition-all ${(action as any).dice === d ? "bg-[#8a3ffc]/20 border border-[#8a3ffc]/40" : "bg-white/5 border border-white/5 hover:bg-white/10"}`}
                                    onClick={() => {
                                      updateCurrentDialogAction(
                                        index,
                                        (currentAction) => ({
                                          ...currentAction,
                                          dice: d,
                                        }),
                                      );
                                    }}
                                  >
                                    {d}
                                  </button>
                                ))}
                              </div>
                            )}
                            {action.action === 9 && (
                              <div className="space-y-2">
                                <div className="relative">
                                  <ImageIcon
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-main/25"
                                    size={16}
                                  />
                                  <input
                                    className="!mb-0 !h-10 !pl-9 !text-xs"
                                    value={action.photo || ""}
                                    onChange={(e) => {
                                      updateCurrentDialogAction(
                                        index,
                                        (currentAction) => ({
                                          ...currentAction,
                                          photo: e.target.value,
                                        }),
                                      );
                                    }}
                                    placeholder={photoPlaceholder}
                                  />
                                </div>
                                <textarea
                                  rows={2}
                                  className="!mb-0 min-h-[58px] max-h-[120px] w-full resize-y bg-white/[0.035] rounded-xl px-3 py-2.5 text-sm leading-6 text-main/75 border border-white/5 focus:border-[#8a3ffc]/40 outline-none transition-all placeholder:text-main/20 custom-scrollbar"
                                  value={action.caption || ""}
                                  onChange={(e) => {
                                    updateCurrentDialogAction(
                                      index,
                                      (currentAction) => ({
                                        ...currentAction,
                                        caption: e.target.value,
                                      }),
                                    );
                                  }}
                                  placeholder={photoCaptionPlaceholder}
                                />
                              </div>
                            )}
                            {action.action === 10 && (
                              <div className="space-y-2">
                                <div className="relative">
                                  <FastForward
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-main/25"
                                    size={16}
                                  />
                                  <input
                                    className="!mb-0 !h-10 !pl-9 !text-xs"
                                    value={action.from_chat_id || ""}
                                    onChange={(e) => {
                                      updateCurrentDialogAction(
                                        index,
                                        (currentAction) => ({
                                          ...currentAction,
                                          from_chat_id: e.target.value,
                                        }),
                                      );
                                    }}
                                    placeholder={forwardSourcePlaceholder}
                                  />
                                </div>
                                <textarea
                                  rows={2}
                                  className="!mb-0 min-h-[58px] max-h-[120px] w-full resize-y bg-white/[0.035] rounded-xl px-3 py-2.5 text-sm leading-6 text-main/75 border border-white/5 focus:border-[#8a3ffc]/40 outline-none transition-all placeholder:text-main/20 custom-scrollbar"
                                  value={(action.message_ids || []).join(", ")}
                                  onChange={(e) => {
                                    updateCurrentDialogAction(
                                      index,
                                      (currentAction) => ({
                                        ...currentAction,
                                        message_ids: parseMessageIdsInput(
                                          e.target.value,
                                        ),
                                      }),
                                    );
                                  }}
                                  placeholder={forwardMessageIdsPlaceholder}
                                />
                              </div>
                            )}
                            {(action.action === 4 || action.action === 6) && (
                              <select
                                className="!mb-0 !h-10 !py-0 !text-xs !w-full max-w-full"
                                value={action.action === 4 ? "click" : "send"}
                                onChange={(e) => {
                                  const nextActionId =
                                    e.target.value === "click" ? 4 : 6;
                                  updateCurrentDialogAction(
                                    index,
                                    (currentAction) => ({
                                      ...currentAction,
                                      action: nextActionId,
                                    }),
                                  );
                                }}
                              >
                                <option value="send">
                                  {aiVisionSendModeLabel}
                                </option>
                                <option value="click">
                                  {aiVisionClickModeLabel}
                                </option>
                              </select>
                            )}
                            {(action.action === 5 || action.action === 7) && (
                              <select
                                className="!mb-0 !h-10 !py-0 !text-xs !w-full max-w-full"
                                value={action.action === 7 ? "click" : "send"}
                                onChange={(e) => {
                                  const nextActionId =
                                    e.target.value === "click" ? 7 : 5;
                                  updateCurrentDialogAction(
                                    index,
                                    (currentAction) => ({
                                      ...currentAction,
                                      action: nextActionId,
                                    }),
                                  );
                                }}
                              >
                                <option value="send">
                                  {aiCalcSendModeLabel}
                                </option>
                                <option value="click">
                                  {aiCalcClickModeLabel}
                                </option>
                              </select>
                            )}
                            {action.action === 8 && (
                              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3 space-y-3">
                                <div className="space-y-1.5">
                                  <textarea
                                    className="w-full min-h-[86px] bg-white/2 rounded-xl p-3 text-[11px] text-main/70 border border-white/5 focus:border-[#8a3ffc]/30 outline-none transition-all placeholder:text-main/20 custom-scrollbar"
                                    value={(action.keywords || []).join("\n")}
                                    onChange={(e) => {
                                      updateCurrentDialogAction(
                                        index,
                                        (currentAction) => ({
                                          ...currentAction,
                                          keywords: splitKeywordInput(
                                            e.target.value,
                                            currentAction?.match_mode ||
                                              action.match_mode ||
                                              "contains",
                                          ),
                                        }),
                                      );
                                    }}
                                    placeholder={keywordPlaceholder}
                                  />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-[150px_minmax(0,1fr)] gap-2 md:gap-3 items-center">
                                  <label className="text-[10px] uppercase tracking-wider text-main/40">
                                    {t("match_mode")}
                                  </label>
                                  <select
                                    className="!mb-0 !h-10 !py-0 !text-xs"
                                    value={action.match_mode || "contains"}
                                    onChange={(e) => {
                                      updateCurrentDialogAction(
                                        index,
                                        (currentAction) => ({
                                          ...currentAction,
                                          match_mode: e.target.value,
                                        }),
                                      );
                                    }}
                                  >
                                    <option value="contains">
                                      {t("match_contains")}
                                    </option>
                                    <option value="exact">
                                      {t("match_exact")}
                                    </option>
                                    <option value="regex">
                                      {t("match_regex")}
                                    </option>
                                  </select>
                                  <label className="text-[10px] uppercase tracking-wider text-main/40">
                                    {t("push_channel")}
                                  </label>
                                  <select
                                    className="!mb-0 !h-10 !py-0 !text-xs"
                                    value={action.push_channel || "telegram"}
                                    onChange={(e) => {
                                      const nextPushChannel = e.target.value;
                                      updateCurrentDialogAction(
                                        index,
                                        (currentAction) => ({
                                          ...currentAction,
                                          push_channel: nextPushChannel,
                                          continue_actions:
                                            nextPushChannel === "continue" &&
                                            !(
                                              currentAction?.continue_actions ||
                                              []
                                            ).length
                                              ? [
                                                  {
                                                    action: 1,
                                                    text: "{keyword}",
                                                  },
                                                ]
                                              : currentAction?.continue_actions,
                                        }),
                                      );
                                    }}
                                  >
                                    <option value="telegram">
                                      {t("telegram_bot_notify")}
                                    </option>
                                    <option value="forward">
                                      {forwardPushLabel}
                                    </option>
                                    <option value="continue">
                                      {continuePushLabel}
                                    </option>
                                    <option value="bark">Bark</option>
                                    <option value="custom">
                                      {t("custom_push_url")}
                                    </option>
                                  </select>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {(action.push_channel || "telegram") ===
                                    "forward" && (
                                    <>
                                      <div className="space-y-1.5">
                                        <label className="text-[10px] uppercase tracking-wider text-main/40">
                                          {forwardChatIdLabel}
                                        </label>
                                      </div>
                                      <div className="space-y-1.5">
                                        <label className="text-[10px] uppercase tracking-wider text-main/40">
                                          {forwardThreadIdLabel}
                                        </label>
                                      </div>
                                      <div className="space-y-1.5">
                                        <input
                                          className="!mb-0 !h-10 !text-xs"
                                          value={action.forward_chat_id || ""}
                                          onChange={(e) => {
                                            updateCurrentDialogAction(
                                              index,
                                              (currentAction) => ({
                                                ...currentAction,
                                                forward_chat_id: e.target.value,
                                              }),
                                            );
                                          }}
                                        />
                                      </div>
                                      <div className="space-y-1.5">
                                        <input
                                          inputMode="numeric"
                                          className="!mb-0 !h-10 !text-xs"
                                          value={
                                            action.forward_message_thread_id ??
                                            ""
                                          }
                                          onChange={(e) => {
                                            updateCurrentDialogAction(
                                              index,
                                              (currentAction) => ({
                                                ...currentAction,
                                                forward_message_thread_id: e
                                                  .target.value
                                                  ? parseInt(e.target.value)
                                                  : undefined,
                                              }),
                                            );
                                          }}
                                          placeholder={
                                            forwardThreadIdPlaceholder
                                          }
                                        />
                                      </div>
                                    </>
                                  )}
                                  {(action.push_channel || "telegram") ===
                                    "bark" && (
                                    <>
                                      <div className="space-y-1.5 md:col-span-2">
                                        <label className="text-[10px] uppercase tracking-wider text-main/40">
                                          {barkUrlLabel}
                                        </label>
                                      </div>
                                      <div className="space-y-1.5 md:col-span-2">
                                        <input
                                          className="!mb-0 !h-10 !text-xs"
                                          value={action.bark_url || ""}
                                          onChange={(e) => {
                                            updateCurrentDialogAction(
                                              index,
                                              (currentAction) => ({
                                                ...currentAction,
                                                bark_url: e.target.value,
                                              }),
                                            );
                                          }}
                                          placeholder={barkUrlLabel}
                                        />
                                      </div>
                                    </>
                                  )}
                                  {(action.push_channel || "telegram") ===
                                    "custom" && (
                                    <>
                                      <div className="space-y-1.5 md:col-span-2">
                                        <label className="text-[10px] uppercase tracking-wider text-main/40">
                                          {t("custom_push_url")}
                                        </label>
                                      </div>
                                      <div className="space-y-1.5 md:col-span-2">
                                        <textarea
                                          className="!mb-0 min-h-[64px] w-full bg-white/2 rounded-xl p-3 !text-[10px] text-main/70 border border-white/5 focus:border-[#8a3ffc]/30 outline-none transition-all placeholder:text-main/20 custom-scrollbar"
                                          value={action.custom_url || ""}
                                          onChange={(e) => {
                                            updateCurrentDialogAction(
                                              index,
                                              (currentAction) => ({
                                                ...currentAction,
                                                custom_url: e.target.value,
                                              }),
                                            );
                                          }}
                                          placeholder={t(
                                            "custom_push_url_placeholder",
                                          )}
                                        />
                                      </div>
                                    </>
                                  )}
                                </div>
                                {(action.push_channel || "telegram") ===
                                  "continue" && (
                                  <div className="border-t border-white/10 pt-4 space-y-4">
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="text-[10px] uppercase tracking-wider text-main/40">
                                          {keywordContinueLabel}
                                        </div>
                                        <div className="text-[10px] text-main/35">
                                          {keywordContinueHint}
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          addKeywordContinueAction(index)
                                        }
                                        className="btn-secondary !h-8 !px-3 !text-[10px] shrink-0"
                                      >
                                        + {keywordContinueAddLabel}
                                      </button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      <div className="space-y-1.5">
                                        <label className="text-[10px] uppercase tracking-wider text-main/40">
                                          {continueChatIdLabel}
                                        </label>
                                        <input
                                          className="!mb-0 !h-10 !text-xs"
                                          value={action.continue_chat_id || ""}
                                          onChange={(e) => {
                                            updateCurrentDialogAction(
                                              index,
                                              (currentAction) => ({
                                                ...currentAction,
                                                continue_chat_id:
                                                  e.target.value,
                                              }),
                                            );
                                          }}
                                          placeholder={
                                            continueChatIdPlaceholder
                                          }
                                        />
                                      </div>
                                      <div className="space-y-1.5">
                                        <label className="text-[10px] uppercase tracking-wider text-main/40">
                                          {continueThreadIdLabel}
                                        </label>
                                        <input
                                          inputMode="numeric"
                                          className="!mb-0 !h-10 !text-xs"
                                          value={
                                            action.continue_message_thread_id ??
                                            ""
                                          }
                                          onChange={(e) => {
                                            updateCurrentDialogAction(
                                              index,
                                              (currentAction) => ({
                                                ...currentAction,
                                                continue_message_thread_id: e
                                                  .target.value
                                                  ? parseInt(e.target.value)
                                                  : undefined,
                                              }),
                                            );
                                          }}
                                          placeholder={
                                            forwardThreadIdPlaceholder
                                          }
                                        />
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-[150px_minmax(0,1fr)] gap-2 md:gap-3 items-center">
                                      <label className="text-[10px] uppercase tracking-wider text-main/40">
                                        {continueIntervalLabel}
                                      </label>
                                      <input
                                        inputMode="decimal"
                                        className="!mb-0 !h-10 !text-xs"
                                        value={
                                          action.continue_action_interval ?? 1
                                        }
                                        onChange={(e) => {
                                          const nextValue =
                                            e.target.value === ""
                                              ? 0
                                              : Number(e.target.value);
                                          updateCurrentDialogAction(
                                            index,
                                            (currentAction) => ({
                                              ...currentAction,
                                              continue_action_interval:
                                                Number.isFinite(nextValue)
                                                  ? nextValue
                                                  : 1,
                                            }),
                                          );
                                        }}
                                      />
                                    </div>
                                    <div className="flex flex-col gap-3">
                                      {(action.continue_actions || []).map(
                                        (
                                          continueAction: any,
                                          continueIndex: number,
                                        ) => {
                                          const continueActionId = Number(
                                            continueAction.action,
                                          );
                                          return (
                                            <div
                                              key={continueIndex}
                                              className="rounded-lg border border-white/5 bg-black/10 p-3 space-y-3"
                                            >
                                              <div className="flex items-center gap-2">
                                                <div className="shrink-0 w-7 h-9 flex items-center justify-center font-mono text-[10px] text-main/30 font-bold border border-white/5 rounded-lg bg-white/5">
                                                  {continueIndex + 1}
                                                </div>
                                                <select
                                                  className="!h-9 !mb-0 max-w-full"
                                                  value={
                                                    toActionTypeOption(
                                                      continueAction,
                                                    ) === "keyword_notify"
                                                      ? "1"
                                                      : toActionTypeOption(
                                                          continueAction,
                                                        )
                                                  }
                                                  onChange={(e) => {
                                                    const selectedType = e
                                                      .target
                                                      .value as ActionTypeOption;
                                                    updateKeywordContinueAction(
                                                      index,
                                                      continueIndex,
                                                      (currentAction) => {
                                                        const currentActionId =
                                                          Number(
                                                            currentAction?.action,
                                                          );
                                                        if (
                                                          selectedType === "1"
                                                        ) {
                                                          return {
                                                            ...currentAction,
                                                            action: 1,
                                                            text:
                                                              currentAction?.text ||
                                                              "{keyword}",
                                                          };
                                                        }
                                                        if (
                                                          selectedType === "3"
                                                        ) {
                                                          return {
                                                            ...currentAction,
                                                            action: 3,
                                                            text:
                                                              currentAction?.text ||
                                                              "",
                                                          };
                                                        }
                                                        if (
                                                          selectedType === "2"
                                                        ) {
                                                          return {
                                                            ...currentAction,
                                                            action: 2,
                                                            dice:
                                                              currentAction?.dice ||
                                                              DICE_OPTIONS[0],
                                                          };
                                                        }
                                                        if (
                                                          selectedType === "9"
                                                        ) {
                                                          return {
                                                            ...currentAction,
                                                            action: 9,
                                                            photo:
                                                              currentAction?.photo ||
                                                              "",
                                                            caption:
                                                              currentAction?.caption ||
                                                              "",
                                                          };
                                                        }
                                                        if (
                                                          selectedType === "10"
                                                        ) {
                                                          return {
                                                            ...currentAction,
                                                            action: 10,
                                                            from_chat_id:
                                                              currentAction?.from_chat_id ||
                                                              "",
                                                            message_ids:
                                                              currentAction?.message_ids ||
                                                              [],
                                                          };
                                                        }
                                                        if (
                                                          selectedType ===
                                                          "ai_vision"
                                                        ) {
                                                          const nextActionId =
                                                            currentActionId ===
                                                              4 ||
                                                            currentActionId ===
                                                              6
                                                              ? currentActionId
                                                              : 6;
                                                          return {
                                                            ...currentAction,
                                                            action:
                                                              nextActionId,
                                                          };
                                                        }
                                                        const nextActionId =
                                                          currentActionId ===
                                                            5 ||
                                                          currentActionId === 7
                                                            ? currentActionId
                                                            : 5;
                                                        return {
                                                          ...currentAction,
                                                          action: nextActionId,
                                                        };
                                                      },
                                                    );
                                                  }}
                                                >
                                                  <option value="1">
                                                    {sendTextLabel}
                                                  </option>
                                                  <option value="3">
                                                    {clickTextButtonLabel}
                                                  </option>
                                                  <option value="2">
                                                    {sendDiceLabel}
                                                  </option>
                                                  <option value="9">
                                                    {sendPhotoLabel}
                                                  </option>
                                                  <option value="10">
                                                    {forwardMessagesLabel}
                                                  </option>
                                                  <option value="ai_vision">
                                                    {aiVisionLabel}
                                                  </option>
                                                  <option value="ai_logic">
                                                    {aiCalcLabel}
                                                  </option>
                                                </select>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    removeKeywordContinueAction(
                                                      index,
                                                      continueIndex,
                                                    )
                                                  }
                                                  className="action-btn shrink-0 !w-9 !h-9 !text-rose-400 !bg-rose-500/5 hover:!bg-rose-500/10 ml-auto"
                                                >
                                                  <Trash
                                                    weight="bold"
                                                    size={14}
                                                  />
                                                </button>
                                              </div>
                                              {(continueActionId === 1 ||
                                                continueActionId === 3) && (
                                                <div className="space-y-2">
                                                  <input
                                                    placeholder={
                                                      continueActionId === 1
                                                        ? sendTextPlaceholder
                                                        : clickButtonPlaceholder
                                                    }
                                                    className="!mb-0 !h-10 !text-xs"
                                                    value={
                                                      continueAction.text || ""
                                                    }
                                                    onChange={(e) => {
                                                      updateKeywordContinueAction(
                                                        index,
                                                        continueIndex,
                                                        (currentAction) => ({
                                                          ...currentAction,
                                                          text: e.target.value,
                                                        }),
                                                      );
                                                    }}
                                                  />
                                                  {continueActionId === 1 && (
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                      <span className="text-[10px] uppercase tracking-wider text-main/35">
                                                        {keywordVariablesLabel}:
                                                      </span>
                                                      {KEYWORD_VARIABLES.map(
                                                        (variable) => (
                                                          <button
                                                            key={variable}
                                                            type="button"
                                                            onClick={() =>
                                                              appendKeywordVariable(
                                                                index,
                                                                continueIndex,
                                                                variable,
                                                              )
                                                            }
                                                            className="h-7 px-2 rounded-lg border border-white/5 bg-white/5 hover:bg-[#8a3ffc]/15 hover:border-[#8a3ffc]/30 text-[10px] font-mono text-main/70 transition-colors"
                                                          >
                                                            {variable}
                                                          </button>
                                                        ),
                                                      )}
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                              {continueActionId === 2 && (
                                                <div className="flex items-center gap-2 overflow-x-auto">
                                                  {DICE_OPTIONS.map((d) => (
                                                    <button
                                                      key={d}
                                                      type="button"
                                                      className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-lg transition-all ${(continueAction as any).dice === d ? "bg-[#8a3ffc]/20 border border-[#8a3ffc]/40" : "bg-white/5 border border-white/5 hover:bg-white/10"}`}
                                                      onClick={() => {
                                                        updateKeywordContinueAction(
                                                          index,
                                                          continueIndex,
                                                          (currentAction) => ({
                                                            ...currentAction,
                                                            dice: d,
                                                          }),
                                                        );
                                                      }}
                                                    >
                                                      {d}
                                                    </button>
                                                  ))}
                                                </div>
                                              )}
                                              {continueActionId === 9 && (
                                                <div className="space-y-2">
                                                  <input
                                                    className="!mb-0 !h-10 !text-xs"
                                                    value={
                                                      continueAction.photo || ""
                                                    }
                                                    onChange={(e) => {
                                                      updateKeywordContinueAction(
                                                        index,
                                                        continueIndex,
                                                        (currentAction) => ({
                                                          ...currentAction,
                                                          photo: e.target.value,
                                                        }),
                                                      );
                                                    }}
                                                    placeholder={
                                                      photoPlaceholder
                                                    }
                                                  />
                                                  <input
                                                    className="!mb-0 !h-10 !text-xs"
                                                    value={
                                                      continueAction.caption ||
                                                      ""
                                                    }
                                                    onChange={(e) => {
                                                      updateKeywordContinueAction(
                                                        index,
                                                        continueIndex,
                                                        (currentAction) => ({
                                                          ...currentAction,
                                                          caption:
                                                            e.target.value,
                                                        }),
                                                      );
                                                    }}
                                                    placeholder={
                                                      photoCaptionPlaceholder
                                                    }
                                                  />
                                                </div>
                                              )}
                                              {continueActionId === 10 && (
                                                <div className="space-y-2">
                                                  <input
                                                    className="!mb-0 !h-10 !text-xs"
                                                    value={
                                                      continueAction.from_chat_id ||
                                                      ""
                                                    }
                                                    onChange={(e) => {
                                                      updateKeywordContinueAction(
                                                        index,
                                                        continueIndex,
                                                        (currentAction) => ({
                                                          ...currentAction,
                                                          from_chat_id:
                                                            e.target.value,
                                                        }),
                                                      );
                                                    }}
                                                    placeholder={
                                                      forwardSourcePlaceholder
                                                    }
                                                  />
                                                  <textarea
                                                    rows={2}
                                                    className="!mb-0 min-h-[58px] max-h-[120px] w-full resize-y bg-white/[0.035] rounded-xl px-3 py-2.5 text-sm leading-6 text-main/75 border border-white/5 focus:border-[#8a3ffc]/40 outline-none transition-all placeholder:text-main/20 custom-scrollbar"
                                                    value={(
                                                      continueAction.message_ids ||
                                                      []
                                                    ).join(", ")}
                                                    onChange={(e) => {
                                                      updateKeywordContinueAction(
                                                        index,
                                                        continueIndex,
                                                        (currentAction) => ({
                                                          ...currentAction,
                                                          message_ids:
                                                            parseMessageIdsInput(
                                                              e.target.value,
                                                            ),
                                                        }),
                                                      );
                                                    }}
                                                    placeholder={
                                                      forwardMessageIdsPlaceholder
                                                    }
                                                  />
                                                </div>
                                              )}
                                              {(continueActionId === 4 ||
                                                continueActionId === 6) && (
                                                <select
                                                  className="!mb-0 !h-10 !py-0 !text-xs !w-full max-w-full"
                                                  value={
                                                    continueActionId === 4
                                                      ? "click"
                                                      : "send"
                                                  }
                                                  onChange={(e) => {
                                                    const nextActionId =
                                                      e.target.value === "click"
                                                        ? 4
                                                        : 6;
                                                    updateKeywordContinueAction(
                                                      index,
                                                      continueIndex,
                                                      (currentAction) => ({
                                                        ...currentAction,
                                                        action: nextActionId,
                                                      }),
                                                    );
                                                  }}
                                                >
                                                  <option value="send">
                                                    {aiVisionSendModeLabel}
                                                  </option>
                                                  <option value="click">
                                                    {aiVisionClickModeLabel}
                                                  </option>
                                                </select>
                                              )}
                                              {(continueActionId === 5 ||
                                                continueActionId === 7) && (
                                                <select
                                                  className="!mb-0 !h-10 !py-0 !text-xs !w-full max-w-full"
                                                  value={
                                                    continueActionId === 7
                                                      ? "click"
                                                      : "send"
                                                  }
                                                  onChange={(e) => {
                                                    const nextActionId =
                                                      e.target.value === "click"
                                                        ? 7
                                                        : 5;
                                                    updateKeywordContinueAction(
                                                      index,
                                                      continueIndex,
                                                      (currentAction) => ({
                                                        ...currentAction,
                                                        action: nextActionId,
                                                      }),
                                                    );
                                                  }}
                                                >
                                                  <option value="send">
                                                    {aiCalcSendModeLabel}
                                                  </option>
                                                  <option value="click">
                                                    {aiCalcClickModeLabel}
                                                  </option>
                                                </select>
                                              )}
                                            </div>
                                          );
                                        },
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() =>
                              showCreateDialog
                                ? handleRemoveAction(index)
                                : handleEditRemoveAction(index)
                            }
                            className="action-btn shrink-0 !w-10 !h-10 !text-rose-400 !bg-rose-500/5 hover:!bg-rose-500/10"
                            title={t("delete")}
                          >
                            <Trash weight="bold" size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>

            <footer className="p-5 border-t border-white/5 bg-black/10 flex gap-3 shrink-0">
              <button
                className="btn-secondary flex-1"
                onClick={() => {
                  setShowCreateDialog(false);
                  setShowEditDialog(false);
                  if (showCreateDialog) resetCreateTaskForm();
                }}
              >
                {t("cancel")}
              </button>
              <button
                className="btn-gradient flex-1"
                onClick={showCreateDialog ? handleCreateTask : handleSaveEdit}
                disabled={loading}
              >
                {loading ? (
                  <Spinner className="animate-spin" />
                ) : showCreateDialog ? (
                  t("add_task")
                ) : (
                  t("save_changes")
                )}
              </button>
            </footer>
          </div>
        </div>
      )}

      {copyTaskDialog && (
        <div className="modal-overlay active">
          <div
            className="glass-panel modal-content !max-w-3xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header border-b border-white/5 pb-3 mb-0">
              <div className="modal-title flex items-center gap-2 !text-base">
                <Copy weight="bold" size={18} />
                {copyTaskDialogTitle}: {copyTaskDialog.taskName}
              </div>
              <button
                onClick={closeCopyTaskDialog}
                className="modal-close"
                disabled={copyingConfig}
              >
                <X weight="bold" />
              </button>
            </header>
            <div className="p-5 space-y-3">
              <p className="text-xs text-main/60">{copyTaskDialogDesc}</p>
              <textarea
                className="w-full h-72 !mb-0 font-mono text-xs"
                value={copyTaskDialog.config}
                readOnly
              />
            </div>
            <footer className="p-5 border-t border-white/5 flex gap-3">
              <button
                className="btn-secondary flex-1"
                onClick={closeCopyTaskDialog}
                disabled={copyingConfig}
              >
                {t("close")}
              </button>
              <button
                className="btn-gradient flex-1"
                onClick={handleCopyTaskConfig}
                disabled={copyingConfig}
              >
                {copyingConfig ? (
                  <Spinner className="animate-spin" />
                ) : (
                  copyConfigAction
                )}
              </button>
            </footer>
          </div>
        </div>
      )}

      {showPasteDialog && (
        <div className="modal-overlay active">
          <div
            className="glass-panel modal-content !max-w-3xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header border-b border-white/5 pb-3 mb-0">
              <div className="modal-title flex items-center gap-2 !text-base">
                <ClipboardText weight="bold" size={18} />
                {pasteTaskDialogTitle}
              </div>
              <button
                onClick={closePasteTaskDialog}
                className="modal-close"
                disabled={importingPastedConfig || loading}
              >
                <X weight="bold" />
              </button>
            </header>
            <div className="p-5 space-y-3">
              <p className="text-xs text-main/60">{pasteTaskDialogDesc}</p>
              <textarea
                className="w-full h-72 !mb-0 font-mono text-xs"
                placeholder={pasteTaskDialogPlaceholder}
                value={pasteTaskConfigInput}
                onChange={(e) => setPasteTaskConfigInput(e.target.value)}
              />
            </div>
            <footer className="p-5 border-t border-white/5 flex gap-3">
              <button
                className="btn-secondary flex-1"
                onClick={closePasteTaskDialog}
                disabled={importingPastedConfig || loading}
              >
                {t("cancel")}
              </button>
              <button
                className="btn-gradient flex-1"
                onClick={handlePasteDialogImport}
                disabled={importingPastedConfig || loading}
              >
                {importingPastedConfig ? (
                  <Spinner className="animate-spin" />
                ) : (
                  importTaskAction
                )}
              </button>
            </footer>
          </div>
        </div>
      )}

      {liveLogTaskName && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel w-full max-w-4xl h-[72vh] flex flex-col shadow-2xl border border-white/10 overflow-hidden animate-zoom-in">
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400">
                  {runningTaskNames.has(liveLogTaskName) ? (
                    <Spinner className="animate-spin" size={18} />
                  ) : (
                    <ListDashes weight="bold" size={18} />
                  )}
                </div>
                <h3 className="font-bold tracking-tight">
                  {t("task_run_logs_title").replace("{name}", liveLogTaskName)}
                </h3>
              </div>
              <button
                onClick={() => setLiveLogTaskName(null)}
                className="action-btn !w-8 !h-8 hover:bg-white/10"
              >
                <X weight="bold" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-black/[0.035] custom-scrollbar">
              {liveLogs.length === 0 ? (
                <div className="flex items-center gap-2 text-main/30 italic">
                  {runningTaskNames.has(liveLogTaskName) ? (
                    <Spinner className="animate-spin" size={12} />
                  ) : null}
                  {t("logs_waiting")}
                </div>
              ) : (
                <div className="space-y-2">
                  {liveLogs.map((line, index) => (
                    <LogLine
                      key={`${index}-${line}`}
                      line={line}
                      index={index}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {historyTaskName && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel w-full max-w-4xl h-[78vh] flex flex-col shadow-2xl border border-white/10 overflow-hidden animate-zoom-in">
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#8a3ffc]/20 flex items-center justify-center text-[#b57dff]">
                  <ListDashes weight="bold" size={18} />
                </div>
                <h3 className="font-bold tracking-tight">
                  {t("task_history_logs_title").replace(
                    "{name}",
                    historyTaskName,
                  )}
                </h3>
              </div>
              <button
                onClick={() => setHistoryTaskName(null)}
                className="action-btn !w-8 !h-8 hover:bg-white/10"
              >
                <X weight="bold" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-black/[0.035] custom-scrollbar">
              {historyLoading ? (
                <div className="flex items-center gap-2 text-main/30 italic">
                  <Spinner className="animate-spin" size={12} />
                  {t("loading")}
                </div>
              ) : historyLogs.length === 0 ? (
                <div className="text-main/30 italic">
                  {t("task_history_empty")}
                </div>
              ) : (
                <div className="space-y-4">
                  {historyLogs.map((log, i) => {
                    const logKey = `${log.time}-${i}`;
                    const hasMultiLineLogs = Boolean(
                      log.flow_logs && log.flow_logs.length > 1,
                    );
                    const isExpanded = expandedHistoryLogs.has(logKey);
                    const visibleFlowLogs =
                      hasMultiLineLogs && !isExpanded
                        ? (log.flow_logs || []).slice(0, 1)
                        : log.flow_logs || [];
                    return (
                      <div
                        key={logKey}
                        className="rounded-xl border border-white/5 bg-white/[0.045] overflow-hidden"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-b border-white/5 text-[10px]">
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <span className="font-mono text-main/35 whitespace-nowrap">
                              {new Date(log.time).toLocaleString(
                                language === "zh" ? "zh-CN" : "en-US",
                              )}
                            </span>
                            {hasMultiLineLogs && (
                              <button
                                type="button"
                                className="rounded-md bg-[#8a3ffc]/10 px-2 py-1 text-[#8a3ffc] hover:bg-[#8a3ffc]/15 hover:text-[#b57dff] font-bold shrink-0 transition-colors"
                                onClick={() => {
                                  setExpandedHistoryLogs((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(logKey)) {
                                      next.delete(logKey);
                                    } else {
                                      next.add(logKey);
                                    }
                                    return next;
                                  });
                                }}
                              >
                                {isExpanded
                                  ? isZh
                                    ? "\u6536\u8d77"
                                    : "Collapse"
                                  : isZh
                                    ? "\u5c55\u5f00\u5b8c\u6574\u65e5\u5fd7"
                                    : "Expand full log"}
                              </button>
                            )}
                          </div>
                          <span
                            className={`rounded-full px-2 py-1 font-bold shrink-0 ${log.success ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}
                          >
                            {log.success ? t("success") : t("failure")}
                          </span>
                        </div>
                        <div className="p-3 space-y-2">
                          <div className="text-main/90">
                            {`${t("task_label")}: ${historyTaskName} ${log.success ? t("task_exec_success") : t("task_exec_failed")}`}
                          </div>
                          {log.message ? (
                            <div className="text-main/60 break-all">
                              {`${t("bot_reply")}: ${log.message}`}
                            </div>
                          ) : null}
                          {visibleFlowLogs.length > 0 ? (
                            visibleFlowLogs.map((line, lineIndex) => (
                              <LogLine
                                key={lineIndex}
                                line={line}
                                index={lineIndex}
                              />
                            ))
                          ) : (
                            <div className="text-main/50">
                              {log.message || t("task_history_no_flow")}
                            </div>
                          )}
                          {log.flow_truncated && (
                            <div className="text-[10px] text-amber-400/90 mt-2">
                              {t("task_history_truncated").replace(
                                "{count}",
                                String(log.flow_line_count || 0),
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
