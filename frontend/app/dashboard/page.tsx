"use client";

import { useEffect, useState, useCallback, useRef, ChangeEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "../../lib/auth";
import {
  listAccounts,
  startAccountLogin,
  startQrLogin,
  getQrLoginStatus,
  cancelQrLogin,
  submitQrPassword,
  updateAccount,
  verifyAccountLogin,
  cancelImportAccountChatsJob,
  deleteAccount,
  downloadChatMigrationJson,
  getImportAccountChatsJob,
  getAccountChatsExport,
  importAccountChats,
  startImportAccountChatsJob,
  getAccountLogs,
  clearAccountLogs,
  listSignTasks,
  AccountInfo,
  AccountStatusItem,
  AccountLog,
  ChatMigrationExportScope,
  ChatMigrationExportPayload,
  ChatMigrationItem,
  ChatMigrationImportJobResponse,
  ChatMigrationImportResponse,
  SignTask,
} from "../../lib/api";
import {
  Lightning,
  Plus,
  Gear,
  ListDashes,
  Clock,
  Spinner,
  X,
  PencilSimple,
  PaperPlaneRight,
  Trash,
  ChatCircleText,
  DownloadSimple,
  UploadSimple,
  WarningCircle,
  ArrowsOutSimple,
} from "@phosphor-icons/react";
import { ToastContainer, useToast } from "../../components/ui/toast";
import { ThemeLanguageToggle } from "../../components/ThemeLanguageToggle";
import { useLanguage } from "../../context/LanguageContext";

type ChatMigrationSummary = Record<string, number>;

const EMPTY_LOGIN_DATA = {
  account_name: "",
  phone_number: "",
  proxy: "",
  phone_code: "",
  password: "",
  phone_code_hash: "",
};

export default function Dashboard() {
  const router = useRouter();
  const { t } = useLanguage();
  const { toasts, addToast, removeToast } = useToast();
  const [token, setLocalToken] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [tasks, setTasks] = useState<SignTask[]>([]);
  const [loading, setLoading] = useState(false);

  // 日志弹窗
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [logsAccountName, setLogsAccountName] = useState("");
  const [accountLogs, setAccountLogs] = useState<AccountLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // 添加账号对话框
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [loginData, setLoginData] = useState({ ...EMPTY_LOGIN_DATA });
  const [reloginAccountName, setReloginAccountName] = useState<string | null>(
    null,
  );
  const [loginMode, setLoginMode] = useState<"phone" | "qr">("phone");
  const [qrLogin, setQrLogin] = useState<{
    login_id: string;
    qr_uri: string;
    qr_image?: string | null;
    expires_at: string;
  } | null>(null);
  type QrPhase =
    | "idle"
    | "loading"
    | "ready"
    | "scanning"
    | "password"
    | "success"
    | "expired"
    | "error";
  const [qrStatus, setQrStatus] = useState<
    | "waiting_scan"
    | "scanned_wait_confirm"
    | "password_required"
    | "success"
    | "expired"
    | "failed"
  >("waiting_scan");
  const [qrPhase, setQrPhase] = useState<QrPhase>("idle");
  const [qrMessage, setQrMessage] = useState<string>("");
  const [qrCountdown, setQrCountdown] = useState<number>(0);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrPassword, setQrPassword] = useState("");
  const [qrPasswordLoading, setQrPasswordLoading] = useState(false);
  const qrPasswordRef = useRef("");
  const qrPasswordLoadingRef = useRef(false);

  const qrPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrCountdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const qrPollDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrActiveLoginIdRef = useRef<string | null>(null);
  const qrPollSeqRef = useRef(0);
  const qrToastShownRef = useRef<
    Record<string, { expired?: boolean; error?: boolean }>
  >({});
  const qrPollingActiveRef = useRef(false);
  const qrRestartingRef = useRef(false);
  const qrAutoRefreshRef = useRef(0);

  useEffect(() => {
    qrPasswordRef.current = qrPassword;
  }, [qrPassword]);

  useEffect(() => {
    qrPasswordLoadingRef.current = qrPasswordLoading;
  }, [qrPasswordLoading]);

  // 编辑账号对话框
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editData, setEditData] = useState({
    account_name: "",
    remark: "",
    proxy: "",
  });
  const [showChatExportDialog, setShowChatExportDialog] = useState(false);
  const [chatExportAccount, setChatExportAccount] = useState("");
  const [chatExportScope, setChatExportScope] =
    useState<ChatMigrationExportScope>("all");
  const [chatExportLoading, setChatExportLoading] = useState(false);
  const [chatExportError, setChatExportError] = useState("");
  const [chatExportPayload, setChatExportPayload] =
    useState<ChatMigrationExportPayload | null>(null);
  const [chatExportSelectedIds, setChatExportSelectedIds] = useState<
    Record<string, boolean>
  >({});
  const [chatExportSearch, setChatExportSearch] = useState("");
  const [showChatImportDialog, setShowChatImportDialog] = useState(false);
  const [chatImportAccount, setChatImportAccount] = useState("");
  const [chatImportJson, setChatImportJson] = useState("");
  const [chatImportShowJson, setChatImportShowJson] = useState(true);
  const [chatImportPayload, setChatImportPayload] = useState<Record<
    string,
    any
  > | null>(null);
  const [chatImportSelectedIds, setChatImportSelectedIds] = useState<
    Record<string, boolean>
  >({});
  const [chatImportSearch, setChatImportSearch] = useState("");
  const [chatImportDryRun, setChatImportDryRun] = useState(false);
  const [chatImportDelay, setChatImportDelay] = useState(5);
  const [chatImportLoading, setChatImportLoading] = useState(false);
  const [chatImportProgress, setChatImportProgress] = useState("");
  const [chatImportError, setChatImportError] = useState("");
  const [chatImportResult, setChatImportResult] =
    useState<ChatMigrationImportResponse | null>(null);
  const [chatImportJob, setChatImportJob] =
    useState<ChatMigrationImportJobResponse | null>(null);
  const [showChatImportFloat, setShowChatImportFloat] = useState(false);
  const [chatImportJobActionLoading, setChatImportJobActionLoading] =
    useState(false);

  const normalizeAccountName = useCallback((name: string) => name.trim(), []);

  const sanitizeAccountName = (name: string) =>
    name.replace(/[^A-Za-z0-9\u4e00-\u9fff]/g, "");

  const isDuplicateAccountName = useCallback(
    (name: string, allowedSameName?: string | null) => {
      const normalized = normalizeAccountName(name).toLowerCase();
      if (!normalized) return false;
      const allow = normalizeAccountName(allowedSameName || "").toLowerCase();
      return accounts.some((acc) => {
        const current = acc.name.toLowerCase();
        if (allow && current === allow && normalized === allow) {
          return false;
        }
        return current === normalized;
      });
    },
    [accounts, normalizeAccountName],
  );

  const [checking, setChecking] = useState(true);
  const [accountStatusMap, setAccountStatusMap] = useState<
    Record<string, AccountStatusItem>
  >({});

  const addToastRef = useRef(addToast);
  const tRef = useRef(t);

  useEffect(() => {
    addToastRef.current = addToast;
  }, [addToast]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const formatErrorMessage = useCallback(
    (key: string, err?: any, detail = false) => {
      const base = tRef.current ? tRef.current(key) : key;
      const code = err?.code;
      const errorDetail = detail ? err?.message : "";
      const suffix = errorDetail ? `: ${errorDetail}` : "";
      return code ? `${base} (${code})${suffix}` : `${base}${suffix}`;
    },
    [],
  );

  const getChatMigrationItemKey = useCallback(
    (
      item: Pick<ChatMigrationItem, "id" | "title" | "username" | "type">,
      index: number,
    ) =>
      `${item.id ?? item.username ?? item.title ?? "chat"}-${item.type ?? "unknown"}-${index}`,
    [],
  );

  const getChatJoinType = useCallback(
    (item: Pick<ChatMigrationItem, "join">) => {
      const joinType = item.join?.type;
      if (joinType === "username" || joinType === "invite_link")
        return joinType;
      return "none";
    },
    [],
  );

  const summarizeMigrationItems = useCallback(
    (items: Pick<ChatMigrationItem, "join">[]): ChatMigrationSummary => {
      const total = items.length;
      const joinable = items.filter((item) =>
        ["username", "invite_link"].includes(getChatJoinType(item)),
      ).length;
      return {
        total,
        joinable,
        manual_required: total - joinable,
      };
    },
    [getChatJoinType],
  );

  const countSelectedChats = useCallback(
    (selected: Record<string, boolean>) =>
      Object.values(selected).filter(Boolean).length,
    [],
  );

  const getSelectedMigrationItems = useCallback(
    <T extends ChatMigrationItem>(
      items: T[],
      selected: Record<string, boolean>,
    ) =>
      items.filter((item, index) =>
        Boolean(selected[getChatMigrationItemKey(item, index)]),
      ),
    [getChatMigrationItemKey],
  );

  const filterMigrationItems = useCallback(
    <T extends ChatMigrationItem>(items: T[], search: string) => {
      const keyword = search.trim().toLowerCase();
      if (!keyword) return items.map((item, index) => ({ item, index }));
      return items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => {
          const text = [
            item.title,
            item.username,
            item.type,
            item.export_note,
            item.join?.url,
            item.join?.value,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return text.includes(keyword);
        });
    },
    [],
  );

  const getMigrationStatCards = useCallback(
    (items: ChatMigrationItem[], selected: Record<string, boolean>) => {
      const selectedItems = getSelectedMigrationItems(items, selected);
      const selectedSummary = summarizeMigrationItems(selectedItems);
      return [
        ["total", t("chat_migration_total"), items.length],
        ["selected", t("chat_migration_selected"), selectedItems.length],
        ["joinable", t("chat_migration_joinable"), selectedSummary.joinable],
        ["manual", t("chat_migration_manual"), selectedSummary.manual_required],
      ];
    },
    [getSelectedMigrationItems, summarizeMigrationItems, t],
  );

  const renderMigrationItem = useCallback(
    (
      item: ChatMigrationItem,
      index: number,
      selected: Record<string, boolean>,
      onToggle: (key: string) => void,
      disabled = false,
    ) => {
      const key = getChatMigrationItemKey(item, index);
      const joinType = getChatJoinType(item);
      const isSelected = Boolean(selected[key]);
      return (
        <label
          key={key}
          className={`flex items-start gap-3 p-3 border-b border-white/5 last:border-0 cursor-pointer hover:bg-white/3 ${
            isSelected ? "bg-white/3" : ""
          }`}
        >
          <input
            type="checkbox"
            className="mt-1"
            checked={isSelected}
            onChange={() => onToggle(key)}
            disabled={disabled}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold truncate">{item.title}</div>
              <div className="text-[10px] text-main/35 uppercase shrink-0">
                {item.type || "-"} / {joinType}
              </div>
            </div>
            <div className="text-xs text-main/45 mt-1 truncate">
              {item.username
                ? `@${item.username}`
                : item.export_note || t("chat_migration_manual")}
            </div>
          </div>
        </label>
      );
    },
    [getChatJoinType, getChatMigrationItemKey, t],
  );

  const loadData = useCallback(
    async (tokenStr: string) => {
      try {
        setLoading(true);
        const [accountsData, tasksData] = await Promise.all([
          listAccounts(tokenStr),
          listSignTasks(tokenStr),
        ]);
        setAccounts(accountsData.accounts);
        setAccountStatusMap(() => {
          const next: Record<string, AccountStatusItem> = {};
          for (const acc of accountsData.accounts) {
            const rawStatus = acc.status || "connected";
            const needsRelogin =
              Boolean(acc.needs_relogin) ||
              rawStatus === "invalid" ||
              rawStatus === "not_found";
            const status = needsRelogin ? "invalid" : "connected";
            next[acc.name] = {
              account_name: acc.name,
              ok: !needsRelogin,
              status,
              message: acc.status_message || "",
              code: acc.status_code || undefined,
              checked_at: acc.status_checked_at || undefined,
              needs_relogin: needsRelogin,
            };
          }
          return next;
        });
        setTasks(tasksData);
      } catch (err: any) {
        addToastRef.current(formatErrorMessage("load_failed", err), "error");
      } finally {
        setLoading(false);
      }
    },
    [formatErrorMessage],
  );

  useEffect(() => {
    const tokenStr = getToken();
    if (!tokenStr) {
      window.location.replace("/");
      return;
    }
    setLocalToken(tokenStr);
    setChecking(false);
    loadData(tokenStr);
  }, [loadData]);

  const getAccountTaskCount = (accountName: string) => {
    return tasks.filter((task) => task.account_name === accountName).length;
  };

  const openAddDialog = () => {
    setReloginAccountName(null);
    setLoginMode("phone");
    setLoginData({ ...EMPTY_LOGIN_DATA });
    setShowAddDialog(true);
  };

  const handleStartLogin = async () => {
    if (!token) return;
    const trimmedAccountName = normalizeAccountName(loginData.account_name);
    if (!trimmedAccountName || !loginData.phone_number) {
      addToast(t("account_name_phone_required"), "error");
      return;
    }
    if (isDuplicateAccountName(trimmedAccountName, reloginAccountName)) {
      addToast(t("account_name_duplicate"), "error");
      return;
    }
    try {
      setLoading(true);
      const res = await startAccountLogin(token, {
        phone_number: loginData.phone_number,
        account_name: trimmedAccountName,
        proxy: loginData.proxy || undefined,
      });
      setLoginData({
        ...loginData,
        account_name: trimmedAccountName,
        phone_code_hash: res.phone_code_hash,
      });
      addToast(t("code_sent"), "success");
    } catch (err: any) {
      addToast(formatErrorMessage("send_code_failed", err), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyLogin = useCallback(async () => {
    if (!token) return;
    if (!loginData.phone_code) {
      addToast(t("login_code_required"), "error");
      return;
    }
    const trimmedAccountName = normalizeAccountName(loginData.account_name);
    if (!trimmedAccountName) {
      addToast(t("account_name_required"), "error");
      return;
    }
    if (isDuplicateAccountName(trimmedAccountName, reloginAccountName)) {
      addToast(t("account_name_duplicate"), "error");
      return;
    }
    try {
      setLoading(true);
      await verifyAccountLogin(token, {
        account_name: trimmedAccountName,
        phone_number: loginData.phone_number,
        phone_code: loginData.phone_code,
        phone_code_hash: loginData.phone_code_hash,
        password: loginData.password || undefined,
        proxy: loginData.proxy || undefined,
      });
      addToast(t("login_success"), "success");
      setAccountStatusMap((prev) => ({
        ...prev,
        [trimmedAccountName]: {
          account_name: trimmedAccountName,
          ok: true,
          status: "connected",
          message: "",
          code: "OK",
          checked_at: new Date().toISOString(),
          needs_relogin: false,
        },
      }));
      setReloginAccountName(null);
      setLoginData({ ...EMPTY_LOGIN_DATA });
      setShowAddDialog(false);
      loadData(token);
    } catch (err: any) {
      addToast(formatErrorMessage("verify_failed", err), "error");
    } finally {
      setLoading(false);
    }
  }, [
    token,
    loginData.account_name,
    loginData.phone_number,
    loginData.phone_code,
    loginData.phone_code_hash,
    loginData.password,
    loginData.proxy,
    addToast,
    formatErrorMessage,
    isDuplicateAccountName,
    loadData,
    normalizeAccountName,
    reloginAccountName,
    t,
  ]);

  const handleDeleteAccount = async (name: string) => {
    if (!token) return;
    if (!confirm(t("confirm_delete_account").replace("{name}", name))) return;
    try {
      setLoading(true);
      await deleteAccount(token, name);
      addToast(t("account_deleted"), "success");
      loadData(token);
    } catch (err: any) {
      addToast(formatErrorMessage("delete_failed", err), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleEditAccount = (acc: AccountInfo) => {
    setEditData({
      account_name: acc.name,
      remark: acc.remark || "",
      proxy: acc.proxy || "",
    });
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!token) return;
    if (!editData.account_name) return;
    try {
      setLoading(true);
      await updateAccount(token, editData.account_name, {
        remark: editData.remark || "",
        proxy: editData.proxy || "",
      });
      addToast(t("save_changes"), "success");
      setShowEditDialog(false);
      loadData(token);
    } catch (err: any) {
      addToast(formatErrorMessage("save_failed", err), "error");
    } finally {
      setLoading(false);
    }
  };

  const openChatExportDialog = (accountName: string) => {
    setChatExportAccount(accountName);
    setChatExportScope("all");
    setChatExportLoading(false);
    setChatExportError("");
    setChatExportPayload(null);
    setChatExportSelectedIds({});
    setChatExportSearch("");
    setShowChatExportDialog(true);
  };

  const loadChatExportPreview = useCallback(
    async (scope: ChatMigrationExportScope = chatExportScope) => {
      if (!token) return;
      if (!chatExportAccount) return;
      try {
        setChatExportLoading(true);
        setChatExportError("");
        const payload = await getAccountChatsExport(
          token,
          chatExportAccount,
          scope,
        );
        const selected: Record<string, boolean> = {};
        (payload.items || []).forEach((item, index) => {
          selected[getChatMigrationItemKey(item, index)] = true;
        });
        setChatExportPayload(payload);
        setChatExportSelectedIds(selected);
      } catch (err: any) {
        const message = formatErrorMessage(
          "chat_migration_export_failed",
          err,
          true,
        );
        setChatExportError(message);
        addToast(message, "error");
      } finally {
        setChatExportLoading(false);
      }
    },
    [
      addToast,
      chatExportAccount,
      chatExportScope,
      formatErrorMessage,
      getChatMigrationItemKey,
      token,
    ],
  );

  const handleExportScopeChange = (scope: ChatMigrationExportScope) => {
    setChatExportScope(scope);
    setChatExportPayload(null);
    setChatExportSelectedIds({});
    setChatExportError("");
  };

  const handleToggleChatExportItem = (key: string) => {
    setChatExportSelectedIds((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setAllChatExportItems = (checked: boolean) => {
    if (!chatExportPayload) return;
    const next: Record<string, boolean> = {};
    chatExportPayload.items.forEach((item, index) => {
      next[getChatMigrationItemKey(item, index)] = checked;
    });
    setChatExportSelectedIds(next);
  };

  const handleExportChats = async () => {
    if (!chatExportPayload || !chatExportAccount) {
      await loadChatExportPreview();
      return;
    }

    const selectedItems = getSelectedMigrationItems(
      chatExportPayload.items || [],
      chatExportSelectedIds,
    );
    if (!selectedItems.length) {
      addToast(t("chat_migration_select_required"), "error");
      return;
    }

    try {
      setChatExportLoading(true);
      const payload: ChatMigrationExportPayload = {
        ...chatExportPayload,
        scope: `${chatExportPayload.scope || chatExportScope}_selected`,
        exported_at: new Date().toISOString(),
        items: selectedItems,
        summary: summarizeMigrationItems(selectedItems),
      };
      downloadChatMigrationJson(
        payload,
        chatExportAccount,
        payload.scope || "selected",
      );
      addToast(t("chat_migration_export_success"), "success");
      setShowChatExportDialog(false);
    } catch (err: any) {
      addToast(
        formatErrorMessage("chat_migration_export_failed", err, true),
        "error",
      );
    } finally {
      setChatExportLoading(false);
    }
  };

  const openChatImportDialog = (accountName: string) => {
    setChatImportAccount(accountName);
    setChatImportJson("");
    setChatImportShowJson(true);
    setChatImportPayload(null);
    setChatImportSelectedIds({});
    setChatImportSearch("");
    setChatImportDryRun(false);
    setChatImportDelay(5);
    setChatImportProgress("");
    setChatImportError("");
    setChatImportResult(null);
    setShowChatImportFloat(false);
    setShowChatImportDialog(true);
  };

  const parseChatImportJson = useCallback(
    (text: string) => {
      let payload: Record<string, any>;
      try {
        payload = JSON.parse(text);
      } catch (err: any) {
        throw new Error(err?.message || t("chat_migration_import_empty"));
      }

      const items = Array.isArray(payload.items)
        ? payload.items.filter((item) => item && typeof item === "object")
        : [];
      if (!items.length) {
        throw new Error("迁移 JSON 缺少 items 列表或列表为空");
      }

      const selected: Record<string, boolean> = {};
      items.forEach((item, index) => {
        selected[getChatMigrationItemKey(item, index)] = true;
      });

      return {
        payload: {
          ...payload,
          items,
          summary: summarizeMigrationItems(items),
        } as Record<string, any>,
        selected,
      };
    },
    [getChatMigrationItemKey, summarizeMigrationItems, t],
  );

  const loadChatImportPreview = useCallback(
    (text: string) => {
      const parsed = parseChatImportJson(text);
      setChatImportPayload(parsed.payload);
      setChatImportSelectedIds(parsed.selected);
      setChatImportShowJson(false);
      setChatImportError("");
      setChatImportResult(null);
      setChatImportProgress("");
      return parsed.payload;
    },
    [parseChatImportJson],
  );

  useEffect(() => {
    if (!showChatExportDialog || !token || !chatExportAccount) return;
    if (chatExportPayload || chatExportLoading) return;
    loadChatExportPreview(chatExportScope);
  }, [
    showChatExportDialog,
    token,
    chatExportAccount,
    chatExportPayload,
    chatExportLoading,
    chatExportScope,
    loadChatExportPreview,
  ]);

  const handleChatImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setChatImportJson(text);
      loadChatImportPreview(text);
    } catch {
      addToast(t("chat_migration_file_read_failed"), "error");
    } finally {
      event.target.value = "";
    }
  };

  const handleToggleChatImportItem = (key: string) => {
    setChatImportSelectedIds((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setAllChatImportItems = (checked: boolean) => {
    if (!chatImportPayload) return;
    const next: Record<string, boolean> = {};
    (chatImportPayload.items || []).forEach(
      (item: ChatMigrationItem, index: number) => {
        next[getChatMigrationItemKey(item, index)] = checked;
      },
    );
    setChatImportSelectedIds(next);
  };

  const summarizeChatImportResults = (
    results: ChatMigrationImportResponse["results"],
  ) => {
    const summary: Record<string, number> = {
      total: results.length,
      joined: 0,
      already_member: 0,
      request_sent: 0,
      manual_required: 0,
      failed: 0,
      flood_wait: 0,
      skipped: 0,
      ready: 0,
    };
    results.forEach((item) => {
      const status = item.status || "failed";
      summary[status] = (summary[status] || 0) + 1;
    });
    return summary;
  };

  const buildChatImportPayload = (
    source: Record<string, any>,
    items: Record<string, any>[],
  ) => ({
    ...source,
    items,
    summary: {
      ...(source.summary || {}),
      total: items.length,
      joinable: items.filter((item) =>
        ["username", "invite_link"].includes(item?.join?.type),
      ).length,
      manual_required: items.filter(
        (item) => !["username", "invite_link"].includes(item?.join?.type),
      ).length,
    },
  });

  const handleImportChats = async () => {
    if (!token || !chatImportAccount) return;
    if (!chatImportJson.trim()) {
      addToast(t("chat_migration_import_empty"), "error");
      return;
    }
    try {
      setChatImportLoading(true);
      setChatImportError("");
      setChatImportResult(null);
      setChatImportProgress("");

      const migration =
        chatImportPayload || loadChatImportPreview(chatImportJson.trim());
      const items = getSelectedMigrationItems(
        (migration.items || []) as ChatMigrationItem[],
        chatImportSelectedIds,
      );
      if (!items.length) {
        throw new Error(t("chat_migration_select_required"));
      }

      const requestedDelay = Number.isFinite(chatImportDelay)
        ? Math.max(0, chatImportDelay)
        : 0;
      const batchSize = chatImportDryRun
        ? items.length
        : Math.max(
            1,
            Math.min(
              CHAT_IMPORT_BATCH_SIZE,
              Math.floor(30 / Math.max(1, requestedDelay)),
            ),
          );
      const allResults: ChatMigrationImportResponse["results"] = [];
      let lastResult: ChatMigrationImportResponse | null = null;

      for (let start = 0; start < items.length; start += batchSize) {
        const batch = items.slice(start, start + batchSize);
        setChatImportProgress(
          t("chat_migration_import_progress")
            .replace("{done}", start.toString())
            .replace("{total}", items.length.toString()),
        );

        const result = await importAccountChats(token, chatImportAccount, {
          migration: buildChatImportPayload(migration, batch),
          dry_run: chatImportDryRun,
          delay_seconds: requestedDelay,
        });
        lastResult = result;
        allResults.push(...(result.results || []));

        const summary = summarizeChatImportResults(allResults);
        setChatImportResult({
          ...result,
          success: !allResults.some((item) =>
            ["failed", "flood_wait"].includes(item.status),
          ),
          summary,
          results: allResults,
        });

        if (
          !chatImportDryRun &&
          result.results?.some((item) => item.status === "flood_wait")
        ) {
          break;
        }
      }

      const finalSummary = summarizeChatImportResults(allResults);
      const result: ChatMigrationImportResponse = {
        ...(lastResult as ChatMigrationImportResponse),
        success: !allResults.some((item) =>
          ["failed", "flood_wait"].includes(item.status),
        ),
        dry_run: chatImportDryRun,
        source_account: migration.source_account || null,
        target_account: chatImportAccount,
        imported_at: lastResult?.imported_at || new Date().toISOString(),
        summary: finalSummary,
        results: allResults,
        notice: lastResult?.notice || null,
      };
      setChatImportResult(result);
      setChatImportProgress(
        t("chat_migration_import_progress")
          .replace("{done}", allResults.length.toString())
          .replace("{total}", items.length.toString()),
      );
      const summary = result.summary || {};
      const joined = summary.joined || 0;
      const requestSent = summary.request_sent || 0;
      const manual = summary.manual_required || 0;
      const failed = (summary.failed || 0) + (summary.flood_wait || 0);
      addToast(
        t("chat_migration_import_summary")
          .replace("{joined}", joined.toString())
          .replace("{request}", requestSent.toString())
          .replace("{manual}", manual.toString())
          .replace("{failed}", failed.toString()),
        failed > 0 ? "error" : "success",
      );
    } catch (err: any) {
      const message = formatErrorMessage(
        "chat_migration_import_failed",
        err,
        true,
      );
      setChatImportError(message);
      addToast(message, "error");
    } finally {
      setChatImportLoading(false);
    }
  };

  const syncImportJobToDialog = useCallback(
    (job: ChatMigrationImportJobResponse) => {
      setChatImportJob(job);
      setChatImportResult({
        success: job.status === "completed",
        dry_run: job.dry_run,
        source_account: null,
        target_account: job.account_name,
        imported_at: job.finished_at || job.updated_at,
        summary: job.summary || {},
        results: job.results || [],
        notice: job.notice || null,
      });
      setChatImportProgress(
        t("chat_migration_import_progress")
          .replace("{done}", String(job.progress?.done || 0))
          .replace("{total}", String(job.progress?.total || 0)),
      );
      setChatImportLoading(["running", "canceling"].includes(job.status));
      if (job.error) {
        setChatImportError(job.error);
      }
    },
    [t],
  );

  const handleImportChatsInBackground = async () => {
    if (!token || !chatImportAccount) return;
    if (!chatImportJson.trim()) {
      addToast(t("chat_migration_import_empty"), "error");
      return;
    }
    try {
      setChatImportJobActionLoading(true);
      setChatImportError("");
      const migration =
        chatImportPayload || loadChatImportPreview(chatImportJson.trim());
      const items = getSelectedMigrationItems(
        (migration.items || []) as ChatMigrationItem[],
        chatImportSelectedIds,
      );
      if (!items.length) {
        throw new Error(t("chat_migration_select_required"));
      }
      const requestedDelay = Number.isFinite(chatImportDelay)
        ? Math.max(0, chatImportDelay)
        : 0;
      const job = await startImportAccountChatsJob(token, chatImportAccount, {
        migration: buildChatImportPayload(migration, items),
        dry_run: chatImportDryRun,
        delay_seconds: requestedDelay,
      });
      syncImportJobToDialog(job);
      setShowChatImportDialog(false);
      setShowChatImportFloat(true);
      addToast(t("chat_migration_background_started"), "success");
    } catch (err: any) {
      const message = formatErrorMessage(
        "chat_migration_import_failed",
        err,
        true,
      );
      setChatImportError(message);
      addToast(message, "error");
    } finally {
      setChatImportJobActionLoading(false);
    }
  };

  const handleCancelImportJob = async () => {
    if (!token || !chatImportJob) return;
    try {
      setChatImportJobActionLoading(true);
      const job = await cancelImportAccountChatsJob(
        token,
        chatImportJob.job_id,
      );
      syncImportJobToDialog(job);
      addToast(t("chat_migration_background_canceling"), "success");
    } catch (err: any) {
      addToast(
        formatErrorMessage("chat_migration_import_failed", err),
        "error",
      );
    } finally {
      setChatImportJobActionLoading(false);
    }
  };

  useEffect(() => {
    if (!token || !chatImportJob) return;
    if (!["running", "canceling"].includes(chatImportJob.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const job = await getImportAccountChatsJob(token, chatImportJob.job_id);
        syncImportJobToDialog(job);
        if (!["running", "canceling"].includes(job.status)) {
          setShowChatImportFloat(true);
          const summary = job.summary || {};
          const failed = (summary.failed || 0) + (summary.flood_wait || 0);
          addToast(
            job.status === "canceled"
              ? t("chat_migration_background_canceled")
              : t("chat_migration_import_summary")
                  .replace("{joined}", String(summary.joined || 0))
                  .replace("{request}", String(summary.request_sent || 0))
                  .replace("{manual}", String(summary.manual_required || 0))
                  .replace("{failed}", String(failed)),
            failed > 0 || job.status === "failed" ? "error" : "success",
          );
        }
      } catch {
        // Keep last known status; the next poll may succeed.
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [addToast, chatImportJob, syncImportJobToDialog, t, token]);

  const chatExportVisibleItems = chatExportPayload
    ? filterMigrationItems(chatExportPayload.items || [], chatExportSearch)
    : [];
  const chatImportVisibleItems = chatImportPayload
    ? filterMigrationItems(
        (chatImportPayload.items || []) as ChatMigrationItem[],
        chatImportSearch,
      )
    : [];
  const chatImportSelectedTotal = countSelectedChats(chatImportSelectedIds);
  const chatImportProcessedTotal = chatImportResult?.summary?.total || 0;
  const chatImportProgressPercent = Math.min(
    100,
    Math.round(
      (chatImportProcessedTotal / Math.max(1, chatImportSelectedTotal)) * 100,
    ),
  );
  const chatImportJobProgressPercent = chatImportJob
    ? Math.min(
        100,
        Math.round(
          ((chatImportJob.progress?.done || 0) /
            Math.max(1, chatImportJob.progress?.total || 0)) *
            100,
        ),
      )
    : 0;
  const chatImportJobActive = Boolean(
    chatImportJob && ["running", "canceling"].includes(chatImportJob.status),
  );
  const chatImportJobStatusClass = chatImportJob
    ? chatImportJob.status === "completed"
      ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/20"
      : chatImportJob.status === "failed"
        ? "bg-rose-500/15 text-rose-500 border-rose-500/20"
        : chatImportJob.status === "canceled"
          ? "bg-slate-500/15 text-slate-500 border-slate-500/20"
          : chatImportJob.status === "canceling"
            ? "bg-amber-500/15 text-amber-500 border-amber-500/20"
            : "bg-sky-500/15 text-sky-500 border-sky-500/20"
    : "";

  const debugQr = useCallback((payload: Record<string, any>) => {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[qr-login]", payload);
    }
  }, []);

  const clearQrPollingTimers = useCallback(() => {
    if (qrPollTimerRef.current) {
      clearInterval(qrPollTimerRef.current);
      qrPollTimerRef.current = null;
    }
    if (qrPollDelayRef.current) {
      clearTimeout(qrPollDelayRef.current);
      qrPollDelayRef.current = null;
    }
    qrPollingActiveRef.current = false;
  }, []);

  const clearQrCountdownTimer = useCallback(() => {
    if (qrCountdownTimerRef.current) {
      clearInterval(qrCountdownTimerRef.current);
      qrCountdownTimerRef.current = null;
    }
  }, []);

  const clearQrTimers = useCallback(() => {
    clearQrPollingTimers();
    clearQrCountdownTimer();
  }, [clearQrPollingTimers, clearQrCountdownTimer]);

  const setQrPhaseSafe = useCallback(
    (next: QrPhase, reason: string, extra?: Record<string, any>) => {
      setQrPhase((prev) => {
        if (prev !== next) {
          debugQr({
            login_id: qrActiveLoginIdRef.current,
            prev,
            next,
            reason,
            ...extra,
          });
        }
        return next;
      });
    },
    [debugQr],
  );

  const markToastShown = useCallback(
    (loginId: string, kind: "expired" | "error") => {
      if (!loginId) return;
      if (!qrToastShownRef.current[loginId]) {
        qrToastShownRef.current[loginId] = {};
      }
      qrToastShownRef.current[loginId][kind] = true;
    },
    [],
  );

  const hasToastShown = useCallback(
    (loginId: string, kind: "expired" | "error") => {
      if (!loginId) return false;
      return Boolean(qrToastShownRef.current[loginId]?.[kind]);
    },
    [],
  );

  const resetQrState = useCallback(() => {
    clearQrTimers();
    qrActiveLoginIdRef.current = null;
    qrRestartingRef.current = false;
    qrAutoRefreshRef.current = 0;
    setQrLogin(null);
    setQrStatus("waiting_scan");
    setQrPhase("idle");
    setQrMessage("");
    setQrCountdown(0);
    setQrLoading(false);
    setQrPassword("");
    setQrPasswordLoading(false);
  }, [clearQrTimers]);

  const openReloginDialog = useCallback(
    (acc: AccountInfo, showToast: boolean = true) => {
      resetQrState();
      setReloginAccountName(acc.name);
      setLoginMode("phone");
      setLoginData({
        ...EMPTY_LOGIN_DATA,
        account_name: acc.name,
        proxy: acc.proxy || "",
      });
      setShowAddDialog(true);
      if (showToast) {
        addToast(t("account_relogin_required"), "error");
      }
    },
    [addToast, resetQrState, t],
  );

  const handleAccountCardClick = useCallback(
    (acc: AccountInfo) => {
      const statusInfo = accountStatusMap[acc.name];
      const needsRelogin = Boolean(
        statusInfo?.needs_relogin || acc.needs_relogin,
      );
      const status = statusInfo?.status || acc.status;
      if (needsRelogin || status === "invalid") {
        openReloginDialog(acc);
        return;
      }
      router.push(`/dashboard/account-tasks?name=${acc.name}`);
    },
    [accountStatusMap, openReloginDialog, router],
  );

  const performQrLoginStart = useCallback(
    async (options?: {
      autoRefresh?: boolean;
      silent?: boolean;
      reason?: string;
    }) => {
      if (!token) return null;
      const trimmedAccountName = normalizeAccountName(loginData.account_name);
      if (!trimmedAccountName) {
        if (!options?.silent) {
          addToast(t("account_name_required"), "error");
        }
        return null;
      }
      if (isDuplicateAccountName(trimmedAccountName, reloginAccountName)) {
        if (!options?.silent) {
          addToast(t("account_name_duplicate"), "error");
        }
        return null;
      }
      try {
        if (options?.autoRefresh) {
          qrRestartingRef.current = true;
        }
        clearQrTimers();
        setQrLoading(true);
        setQrPhaseSafe("loading", options?.reason ?? "start");
        const res = await startQrLogin(token, {
          account_name: trimmedAccountName,
          proxy: loginData.proxy || undefined,
        });
        setLoginData((prev) => ({ ...prev, account_name: trimmedAccountName }));
        setQrLogin(res);
        qrActiveLoginIdRef.current = res.login_id;
        qrToastShownRef.current[res.login_id] = {};
        setQrStatus("waiting_scan");
        setQrPhaseSafe("ready", "qr_ready", { expires_at: res.expires_at });
        setQrMessage("");
        return res;
      } catch (err: any) {
        setQrPhaseSafe("error", "start_failed");
        if (!options?.silent) {
          addToast(formatErrorMessage("qr_create_failed", err), "error");
        }
        return null;
      } finally {
        setQrLoading(false);
        qrRestartingRef.current = false;
      }
    },
    [
      token,
      loginData.account_name,
      loginData.proxy,
      addToast,
      clearQrTimers,
      formatErrorMessage,
      isDuplicateAccountName,
      normalizeAccountName,
      reloginAccountName,
      setQrPhaseSafe,
      t,
    ],
  );

  const handleSubmitQrPassword = useCallback(
    async (passwordOverride?: string) => {
      if (!token || !qrLogin?.login_id) return;
      const passwordValue = passwordOverride ?? qrPasswordRef.current;
      if (!passwordValue) {
        const msg = t("qr_password_missing");
        addToast(msg, "error");
        setQrMessage(msg);
        return;
      }
      try {
        setQrPasswordLoading(true);
        await submitQrPassword(token, {
          login_id: qrLogin.login_id,
          password: passwordValue,
        });
        addToast(t("login_success"), "success");
        const doneAccount = normalizeAccountName(loginData.account_name);
        if (doneAccount) {
          setAccountStatusMap((prev) => ({
            ...prev,
            [doneAccount]: {
              account_name: doneAccount,
              ok: true,
              status: "connected",
              message: "",
              code: "OK",
              checked_at: new Date().toISOString(),
              needs_relogin: false,
            },
          }));
        }
        setReloginAccountName(null);
        setLoginData({ ...EMPTY_LOGIN_DATA });
        resetQrState();
        setShowAddDialog(false);
        loadData(token);
      } catch (err: any) {
        const errMsg = err?.message ? String(err.message) : "";
        const fallback = formatErrorMessage("qr_login_failed", err);
        let message = errMsg || fallback;
        const lowerMsg = errMsg.toLowerCase();
        if (
          errMsg.includes("\u5bc6\u7801") ||
          errMsg.includes("\u4e24\u6b65\u9a8c\u8bc1") ||
          errMsg.includes("\u4e8c\u6b65\u9a8c\u8bc1") ||
          lowerMsg.includes("2fa") ||
          lowerMsg.includes("password")
        ) {
          message = t("qr_password_invalid");
        }
        addToast(message, "error");
        if (message === t("qr_password_invalid")) {
          resetQrState();
          return;
        }
        setQrMessage(message);
      } finally {
        setQrPasswordLoading(false);
      }
    },
    [
      token,
      qrLogin?.login_id,
      addToast,
      resetQrState,
      loadData,
      t,
      formatErrorMessage,
      loginData.account_name,
      normalizeAccountName,
    ],
  );

  const startQrPolling = useCallback(
    (loginId: string, reason: string = "effect") => {
      if (!token || !loginId) return;
      if (loginMode !== "qr" || !showAddDialog) return;
      if (
        qrPollingActiveRef.current &&
        qrActiveLoginIdRef.current === loginId
      ) {
        debugQr({ login_id: loginId, poll: "skip", reason });
        return;
      }

      clearQrPollingTimers();
      qrActiveLoginIdRef.current = loginId;
      qrPollingActiveRef.current = true;
      qrPollSeqRef.current += 1;
      const seq = qrPollSeqRef.current;
      let stopped = false;

      const stopPolling = () => {
        if (stopped) return;
        stopped = true;
        clearQrPollingTimers();
      };

      const shouldAutoRefresh = () => {
        const now = Date.now();
        if (now - qrAutoRefreshRef.current < 1200) {
          return false;
        }
        qrAutoRefreshRef.current = now;
        return true;
      };

      const poll = async () => {
        try {
          if (qrRestartingRef.current) return;
          const res = await getQrLoginStatus(token, loginId);
          if (stopped) return;
          if (qrActiveLoginIdRef.current !== loginId) return;
          if (qrPollSeqRef.current !== seq) return;

          const status = res.status as
            | "waiting_scan"
            | "scanned_wait_confirm"
            | "password_required"
            | "success"
            | "expired"
            | "failed";
          debugQr({
            login_id: loginId,
            pollResult: status,
            message: res.message || "",
          });
          setQrStatus(status);
          if (status !== "password_required") {
            setQrMessage("");
          }
          if (res.expires_at) {
            setQrLogin((prev) =>
              prev ? { ...prev, expires_at: res.expires_at } : prev,
            );
          }

          if (status === "success") {
            setQrPhaseSafe("success", "poll_success", { status });
            addToast(t("login_success"), "success");
            const doneAccount = normalizeAccountName(loginData.account_name);
            if (doneAccount) {
              setAccountStatusMap((prev) => ({
                ...prev,
                [doneAccount]: {
                  account_name: doneAccount,
                  ok: true,
                  status: "connected",
                  message: "",
                  code: "OK",
                  checked_at: new Date().toISOString(),
                  needs_relogin: false,
                },
              }));
            }
            setReloginAccountName(null);
            setLoginData({ ...EMPTY_LOGIN_DATA });
            stopPolling();
            resetQrState();
            setShowAddDialog(false);
            loadData(token);
            return;
          }

          if (status === "password_required") {
            setQrPhaseSafe("password", "poll_password_required", { status });
            stopPolling();
            setQrMessage(t("qr_password_required"));
            return;
          }

          if (status === "scanned_wait_confirm") {
            setQrPhaseSafe("scanning", "poll_scanned", { status });
            return;
          }

          if (status === "waiting_scan") {
            setQrPhaseSafe("ready", "poll_waiting", { status });
            return;
          }

          if (status === "expired") {
            stopPolling();
            setQrPhaseSafe("loading", "auto_refresh", { status });
            if (!shouldAutoRefresh()) {
              return;
            }
            const refreshed = await performQrLoginStart({
              autoRefresh: true,
              silent: true,
              reason: "auto_refresh",
            });
            if (refreshed?.login_id) {
              startQrPolling(refreshed.login_id, "auto_refresh");
              return;
            }
            setQrPhaseSafe("expired", "auto_refresh_failed", { status });
            if (!hasToastShown(loginId, "expired")) {
              addToast(t("qr_expired_not_found"), "error");
              markToastShown(loginId, "expired");
            }
            return;
          }

          if (status === "failed") {
            setQrPhaseSafe("error", "poll_terminal", { status });
            stopPolling();
            if (!hasToastShown(loginId, "error")) {
              addToast(t("qr_login_failed"), "error");
              markToastShown(loginId, "error");
            }
          }
        } catch (err: any) {
          if (stopped) return;
          if (qrActiveLoginIdRef.current !== loginId) return;
          if (qrPollSeqRef.current !== seq) return;
          debugQr({
            login_id: loginId,
            pollError: err?.message || String(err),
          });
          if (!hasToastShown(loginId, "error")) {
            addToast(formatErrorMessage("qr_status_failed", err), "error");
            markToastShown(loginId, "error");
          }
        }
      };

      qrPollDelayRef.current = setTimeout(() => {
        poll();
        qrPollTimerRef.current = setInterval(poll, 1500);
      }, 0);

      return stopPolling;
    },
    [
      token,
      loginMode,
      showAddDialog,
      addToast,
      clearQrPollingTimers,
      debugQr,
      formatErrorMessage,
      hasToastShown,
      loadData,
      markToastShown,
      loginData.account_name,
      normalizeAccountName,
      performQrLoginStart,
      resetQrState,
      setQrPhaseSafe,
      t,
    ],
  );

  const handleStartQrLogin = async () => {
    const res = await performQrLoginStart();
    if (res?.login_id) {
      startQrPolling(res.login_id, "start_success");
    }
  };

  const handleCancelQrLogin = async () => {
    if (!token || !qrLogin?.login_id) {
      resetQrState();
      return;
    }
    try {
      setQrLoading(true);
      await cancelQrLogin(token, qrLogin.login_id);
    } catch (err: any) {
      addToast(formatErrorMessage("cancel_failed", err), "error");
    } finally {
      setQrLoading(false);
      resetQrState();
    }
  };

  // 手动提交 2FA（避免自动重试导致重复请求）

  const handleCloseAddDialog = () => {
    if (qrLogin?.login_id) {
      handleCancelQrLogin();
    }
    setReloginAccountName(null);
    setLoginData({ ...EMPTY_LOGIN_DATA });
    setLoginMode("phone");
    setShowAddDialog(false);
  };

  const handleShowLogs = async (name: string) => {
    if (!token) return;
    setLogsAccountName(name);
    setShowLogsDialog(true);
    setLogsLoading(true);
    try {
      const logs = await getAccountLogs(token, name, 100);
      setAccountLogs(logs);
    } catch (err: any) {
      addToast(formatErrorMessage("logs_fetch_failed", err), "error");
    } finally {
      setLogsLoading(false);
    }
  };

  const handleClearLogs = async () => {
    if (!token || !logsAccountName) return;
    if (!confirm(t("clear_logs_confirm").replace("{name}", logsAccountName)))
      return;
    try {
      setLoading(true);
      await clearAccountLogs(token, logsAccountName);
      addToast(t("clear_logs_success"), "success");
      setLogsLoading(true);
      const logs = await getAccountLogs(token, logsAccountName, 100);
      setAccountLogs(logs);
    } catch (err: any) {
      addToast(formatErrorMessage("clear_logs_failed", err), "error");
    } finally {
      setLogsLoading(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!qrLogin?.expires_at || !qrActiveLoginIdRef.current) {
      setQrCountdown(0);
      clearQrTimers();
      return;
    }
    if (!(qrPhase === "ready" || qrPhase === "scanning")) {
      setQrCountdown(0);
      if (qrCountdownTimerRef.current) {
        clearInterval(qrCountdownTimerRef.current);
        qrCountdownTimerRef.current = null;
      }
      return;
    }
    const update = () => {
      const expires = new Date(qrLogin.expires_at).getTime();
      const diff = Math.max(0, Math.floor((expires - Date.now()) / 1000));
      setQrCountdown(diff);
    };
    update();
    if (qrCountdownTimerRef.current) {
      clearInterval(qrCountdownTimerRef.current);
    }
    qrCountdownTimerRef.current = setInterval(update, 1000);
    return () => {
      if (qrCountdownTimerRef.current) {
        clearInterval(qrCountdownTimerRef.current);
        qrCountdownTimerRef.current = null;
      }
    };
  }, [qrLogin?.expires_at, qrPhase, clearQrTimers]);

  useEffect(() => {
    if (!token || !qrLogin?.login_id || loginMode !== "qr" || !showAddDialog)
      return;
    if (
      qrPhase === "success" ||
      qrPhase === "expired" ||
      qrPhase === "error" ||
      qrPhase === "password"
    )
      return;
    if (qrRestartingRef.current) return;
    const stop = startQrPolling(qrLogin.login_id, "effect");
    return () => {
      if (stop) stop();
    };
  }, [
    token,
    qrLogin?.login_id,
    loginMode,
    showAddDialog,
    qrPhase,
    startQrPolling,
  ]);

  if (!token || checking) {
    return null;
  }

  return (
    <div id="dashboard-view" className="w-full h-full flex flex-col">
      <nav className="navbar">
        <div
          className="nav-brand"
          style={{ display: "flex", alignItems: "center", gap: "12px" }}
        >
          <Lightning
            weight="fill"
            style={{ fontSize: "28px", color: "#fcd34d" }}
          />
          <span className="nav-title font-bold tracking-tight text-lg">
            TG-FlowPulse
          </span>
        </div>
        <div className="top-right-actions">
          <Link
            href="/dashboard/monitors"
            className="!hidden"
            title={t("keyword_monitor")}
          >
            <ChatCircleText weight="bold" size={16} />
            <span>消息监控</span>
          </Link>
          <ThemeLanguageToggle />
          <Link
            href="/dashboard/monitors"
            title={t("keyword_monitor")}
            className="hidden"
          >
            <ChatCircleText weight="bold" />
          </Link>
          <Link
            href="/dashboard/settings"
            title={t("sidebar_settings")}
            className="action-btn"
          >
            <Gear weight="bold" />
          </Link>
        </div>
      </nav>

      <main className="main-content">
        {loading && accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-main/30">
            <Spinner className="animate-spin mb-4" size={32} />
            <p>{t("loading")}</p>
          </div>
        ) : (
          <div className="card-grid">
            {accounts.map((acc) => {
              const initial = acc.name.charAt(0).toUpperCase();
              const statusInfo = accountStatusMap[acc.name];
              const rawStatus = statusInfo?.status || acc.status || "connected";
              const needsRelogin = Boolean(
                statusInfo?.needs_relogin || acc.needs_relogin,
              );
              const isInvalid =
                needsRelogin ||
                rawStatus === "invalid" ||
                rawStatus === "not_found";
              const statusKey = isInvalid
                ? "account_status_invalid"
                : "connected";
              const statusIconClass = isInvalid
                ? "text-rose-400"
                : "text-emerald-400";
              return (
                <div
                  key={acc.name}
                  className="glass-panel card account-card group cursor-pointer"
                  onClick={() => handleAccountCardClick(acc)}
                >
                  <div className="card-top">
                    <div className="account-name">
                      <div className="account-avatar">{initial}</div>
                      <div className="min-w-0">
                        <div className="font-bold leading-tight truncate">
                          {acc.name}
                        </div>
                        {acc.remark ? (
                          <div className="text-xs text-main/40 leading-tight truncate">
                            {acc.remark}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="task-badge">
                      {getAccountTaskCount(acc.name)} {t("sidebar_tasks")}
                    </div>
                  </div>

                  <div className="account-card-body">
                    <div
                      className={`account-status-pill ${isInvalid ? "invalid" : "connected"}`}
                      title={statusInfo?.message || acc.status_message || ""}
                    >
                      <span className="account-status-dot" />
                      <Clock weight="fill" className={statusIconClass} />
                      <span>{t(statusKey)}</span>
                    </div>
                    <div className="account-card-hint">
                      {isInvalid ? t("relogin_account") : t("sidebar_tasks")}
                    </div>
                  </div>

                  <div className="card-bottom account-card-footer">
                    <div className="card-actions">
                      <Link
                        href={`/dashboard/account-tasks?name=${encodeURIComponent(acc.name)}`}
                        className="action-icon action-primary"
                        title="签到任务"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Lightning weight="bold" size={16} />
                      </Link>
                      <Link
                        href={`/dashboard/monitors?account_name=${encodeURIComponent(acc.name)}`}
                        className="action-icon action-cyan"
                        title="消息监控"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ChatCircleText weight="bold" size={16} />
                      </Link>
                      <div
                        className="action-icon"
                        title={t("edit_account")}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditAccount(acc);
                        }}
                      >
                        <PencilSimple weight="bold" size={16} />
                      </div>
                      <div
                        className="action-icon action-emerald"
                        title={t("chat_migration_export")}
                        onClick={(e) => {
                          e.stopPropagation();
                          openChatExportDialog(acc.name);
                        }}
                      >
                        <UploadSimple weight="bold" size={16} />
                      </div>
                      <div
                        className="action-icon action-sky"
                        title={t("chat_migration_import")}
                        onClick={(e) => {
                          e.stopPropagation();
                          openChatImportDialog(acc.name);
                        }}
                      >
                        <DownloadSimple weight="bold" size={16} />
                      </div>
                      <div
                        className="action-icon delete"
                        title={t("remove")}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAccount(acc.name);
                        }}
                      >
                        <Trash weight="bold" size={16} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* 添加新账号卡片 */}
            <Link href="/dashboard/monitors" className="hidden">
              <div className="add-icon-circle !w-10 !h-10 !bg-cyan-500/10 !text-cyan-500">
                <ChatCircleText weight="bold" size={20} />
              </div>
              <span
                className="text-xs font-bold"
                style={{ color: "var(--text-sub)" }}
              >
                消息监控
              </span>
            </Link>

            <div
              className="card card-add account-card-add"
              onClick={openAddDialog}
            >
              <div className="add-icon-circle">
                <Plus weight="bold" size={20} />
              </div>
              <span className="text-sm font-bold text-main/70">
                {t("add_account")}
              </span>
            </div>
          </div>
        )}
      </main>

      {showAddDialog && (
        <div className="modal-overlay active">
          <div
            className="glass-panel modal-content modal-content-fit !max-w-[420px] !p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header !mb-5">
              <div className="modal-title !text-lg">
                {reloginAccountName ? t("relogin_account") : t("add_account")}
              </div>
              <div className="modal-close" onClick={handleCloseAddDialog}>
                <X weight="bold" />
              </div>
            </div>

            <div className="animate-float-up space-y-4">
              <div className="flex gap-2">
                <button
                  className={`flex-1 h-9 text-xs font-bold rounded-lg ${loginMode === "phone" ? "btn-gradient" : "btn-secondary"}`}
                  onClick={() => {
                    if (loginMode !== "phone" && qrLogin?.login_id) {
                      handleCancelQrLogin();
                    }
                    setLoginMode("phone");
                  }}
                >
                  {t("login_method_phone")}
                </button>
                <button
                  className={`flex-1 h-9 text-xs font-bold rounded-lg ${loginMode === "qr" ? "btn-gradient" : "btn-secondary"}`}
                  onClick={() => setLoginMode("qr")}
                >
                  {t("login_method_qr")}
                </button>
              </div>

              {loginMode === "phone" ? (
                <>
                  <div>
                    <label className="text-[11px] mb-1">
                      {t("session_name")}
                    </label>
                    <input
                      type="text"
                      className="!py-2.5 !px-4 !mb-4"
                      placeholder={t("account_name_placeholder")}
                      value={loginData.account_name}
                      onChange={(e) => {
                        const cleaned = sanitizeAccountName(e.target.value);
                        setLoginData({ ...loginData, account_name: cleaned });
                      }}
                    />

                    <label className="text-[11px] mb-1">
                      {t("phone_number")}
                    </label>
                    <input
                      type="text"
                      className="!py-2.5 !px-4 !mb-4"
                      placeholder={t("phone_number_placeholder")}
                      value={loginData.phone_number}
                      onChange={(e) =>
                        setLoginData({
                          ...loginData,
                          phone_number: e.target.value,
                        })
                      }
                    />

                    <label className="text-[11px] mb-1">
                      {t("login_code")}
                    </label>
                    <div className="input-group !mb-4">
                      <input
                        type="text"
                        className="!py-2.5 !px-4"
                        placeholder={t("login_code_placeholder")}
                        value={loginData.phone_code}
                        onChange={(e) =>
                          setLoginData({
                            ...loginData,
                            phone_code: e.target.value,
                          })
                        }
                      />
                      <button
                        className="btn-code !h-[42px] !w-[42px] !text-lg"
                        onClick={handleStartLogin}
                        disabled={loading}
                        title={t("send_code")}
                      >
                        {loading ? (
                          <Spinner className="animate-spin" size={16} />
                        ) : (
                          <PaperPlaneRight weight="bold" />
                        )}
                      </button>
                    </div>

                    <label className="text-[11px] mb-1">
                      {t("two_step_pass")}
                    </label>
                    <input
                      type="password"
                      className="!py-2.5 !px-4 !mb-4"
                      placeholder={t("two_step_placeholder")}
                      value={loginData.password}
                      onChange={(e) =>
                        setLoginData({ ...loginData, password: e.target.value })
                      }
                    />

                    <label className="text-[11px] mb-1">{t("proxy")}</label>
                    <input
                      type="text"
                      className="!py-2.5 !px-4"
                      placeholder={t("proxy_placeholder")}
                      style={{ marginBottom: 0 }}
                      value={loginData.proxy}
                      onChange={(e) =>
                        setLoginData({ ...loginData, proxy: e.target.value })
                      }
                    />
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      className="btn-secondary flex-1 h-10 !py-0 !text-xs"
                      onClick={handleCloseAddDialog}
                    >
                      {t("cancel")}
                    </button>
                    <button
                      className="btn-gradient flex-1 h-10 !py-0 !text-xs"
                      onClick={handleVerifyLogin}
                      disabled={loading || !loginData.phone_code.trim()}
                    >
                      {loading ? (
                        <Spinner className="animate-spin" />
                      ) : (
                        t("confirm_connect")
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-[11px] mb-1">
                      {t("session_name")}
                    </label>
                    <input
                      type="text"
                      className="!py-2.5 !px-4 !mb-4"
                      placeholder={t("account_name_placeholder")}
                      value={loginData.account_name}
                      onChange={(e) => {
                        const cleaned = sanitizeAccountName(e.target.value);
                        setLoginData({ ...loginData, account_name: cleaned });
                      }}
                    />

                    <label className="text-[11px] mb-1">
                      {t("two_step_pass")}
                    </label>
                    <input
                      type="password"
                      className="!py-2.5 !px-4 !mb-4"
                      placeholder={t("two_step_placeholder")}
                      value={qrPassword}
                      onChange={(e) => setQrPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        if (qrPhase !== "password") return;
                        if (!qrPassword || qrPasswordLoading) return;
                        e.preventDefault();
                        handleSubmitQrPassword(qrPassword);
                      }}
                    />
                    <label className="text-[11px] mb-1">{t("proxy")}</label>
                    <input
                      type="text"
                      className="!py-2.5 !px-4 !mb-4"
                      placeholder={t("proxy_placeholder")}
                      value={loginData.proxy}
                      onChange={(e) =>
                        setLoginData({ ...loginData, proxy: e.target.value })
                      }
                    />
                  </div>

                  <div className="glass-panel !bg-black/5 p-4 rounded-xl space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-main/60">{t("qr_tip")}</div>
                      <button
                        className="btn-secondary h-8 !px-3 !py-0 !text-[11px]"
                        onClick={handleStartQrLogin}
                        disabled={qrLoading}
                      >
                        {qrLoading ? (
                          <Spinner className="animate-spin" />
                        ) : qrLogin ? (
                          t("qr_refresh")
                        ) : (
                          t("qr_start")
                        )}
                      </button>
                    </div>
                    <div className="flex items-center justify-center">
                      {qrLogin?.qr_image ? (
                        <Image
                          src={qrLogin.qr_image}
                          alt={t("qr_alt")}
                          width={160}
                          height={160}
                          className="rounded-lg bg-white p-2"
                        />
                      ) : (
                        <div className="w-40 h-40 rounded-lg bg-white/5 flex items-center justify-center text-xs text-main/40">
                          {t("qr_start")}
                        </div>
                      )}
                    </div>
                    {qrLogin &&
                    (qrPhase === "ready" || qrPhase === "scanning") ? (
                      <div className="text-[11px] text-main/40 font-mono text-center">
                        {t("qr_expires_in").replace(
                          "{seconds}",
                          qrCountdown.toString(),
                        )}
                      </div>
                    ) : null}
                    <div className="text-xs text-center font-bold">
                      {(qrPhase === "loading" || qrPhase === "ready") &&
                        t("qr_waiting")}
                      {qrPhase === "scanning" && t("qr_scanned")}
                      {qrPhase === "password" && t("qr_password_required")}
                      {qrPhase === "success" && t("qr_success")}
                      {qrPhase === "expired" && t("qr_expired")}
                      {qrPhase === "error" && t("qr_failed")}
                    </div>
                    {qrMessage ? (
                      <div className="text-[11px] text-rose-400 text-center">
                        {qrMessage}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex gap-3 mt-2">
                    <button
                      className="btn-secondary flex-1 h-10 !py-0 !text-xs"
                      onClick={handleCloseAddDialog}
                    >
                      {t("cancel")}
                    </button>
                    <button
                      className="btn-gradient flex-1 h-10 !py-0 !text-xs"
                      onClick={() => handleSubmitQrPassword(qrPassword)}
                      disabled={
                        qrPhase !== "password" ||
                        !qrPassword ||
                        qrPasswordLoading
                      }
                    >
                      {qrPasswordLoading ? (
                        <Spinner className="animate-spin" />
                      ) : (
                        t("confirm_connect")
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showEditDialog && (
        <div className="modal-overlay active">
          <div
            className="glass-panel modal-content !max-w-[420px] !p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header !mb-5">
              <div className="modal-title !text-lg">{t("edit_account")}</div>
              <div
                className="modal-close"
                onClick={() => setShowEditDialog(false)}
              >
                <X weight="bold" />
              </div>
            </div>

            <div className="animate-float-up space-y-4">
              <div>
                <label className="text-[11px] mb-1">{t("session_name")}</label>
                <input
                  type="text"
                  className="!py-2.5 !px-4 !mb-4"
                  value={editData.account_name}
                  disabled
                />

                <label className="text-[11px] mb-1">{t("remark")}</label>
                <input
                  type="text"
                  className="!py-2.5 !px-4 !mb-4"
                  placeholder={t("remark_placeholder")}
                  value={editData.remark}
                  onChange={(e) =>
                    setEditData({ ...editData, remark: e.target.value })
                  }
                />

                <label className="text-[11px] mb-1">{t("proxy")}</label>
                <input
                  type="text"
                  className="!py-2.5 !px-4"
                  placeholder={t("proxy_placeholder")}
                  style={{ marginBottom: 0 }}
                  value={editData.proxy}
                  onChange={(e) =>
                    setEditData({ ...editData, proxy: e.target.value })
                  }
                />
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  className="btn-secondary flex-1 h-10 !py-0 !text-xs !bg-amber-500/10 !text-amber-500 hover:!bg-amber-500/20"
                  onClick={() => {
                    setShowEditDialog(false);
                    openReloginDialog(
                      {
                        name: editData.account_name,
                        proxy: editData.proxy,
                      } as any,
                      false,
                    );
                  }}
                >
                  {t("relogin") || "Re-login"}
                </button>
                <button
                  className="btn-secondary flex-1 h-10 !py-0 !text-xs"
                  onClick={() => setShowEditDialog(false)}
                >
                  {t("cancel")}
                </button>
                <button
                  className="btn-gradient flex-1 h-10 !py-0 !text-xs"
                  onClick={handleSaveEdit}
                  disabled={loading}
                >
                  {loading ? <Spinner className="animate-spin" /> : t("save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showChatExportDialog && (
        <div className="modal-overlay active">
          <div
            className="glass-panel modal-content !max-w-3xl max-h-[90vh] flex flex-col overflow-hidden !p-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/2">
              <div className="min-w-0">
                <div className="font-bold text-lg truncate">
                  {t("chat_migration_export")}
                </div>
                <div className="text-xs text-main/40 truncate">
                  {chatExportAccount}
                </div>
              </div>
              <div
                className="modal-close"
                onClick={() => setShowChatExportDialog(false)}
              >
                <X weight="bold" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              <div>
                <label className="text-[11px] mb-1">{t("session_name")}</label>
                <input
                  type="text"
                  className="!py-2.5 !px-4 !mb-4"
                  value={chatExportAccount}
                  disabled
                />

                <label className="text-[11px] mb-2">
                  {t("chat_migration_export_scope")}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ["all", t("chat_migration_scope_all")],
                    ["groups", t("chat_migration_scope_groups")],
                    ["channels", t("chat_migration_scope_channels")],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={`h-10 text-xs font-bold rounded-lg ${
                        chatExportScope === value
                          ? "btn-gradient"
                          : "btn-secondary"
                      }`}
                      onClick={() =>
                        handleExportScopeChange(
                          value as ChatMigrationExportScope,
                        )
                      }
                      disabled={chatExportLoading}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-xs text-main/45 leading-relaxed rounded-xl bg-white/3 border border-white/5 p-3">
                {t("chat_migration_export_scope_hint")}
              </div>

              {chatExportPayload ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {getMigrationStatCards(
                    chatExportPayload.items || [],
                    chatExportSelectedIds,
                  ).map(([key, label, value]) => (
                    <div
                      key={key}
                      className="rounded-xl border border-white/5 bg-white/2 p-3"
                    >
                      <div className="text-lg font-bold">{value}</div>
                      <div className="text-[10px] text-main/40">{label}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="rounded-xl border border-white/5 bg-white/2 overflow-hidden">
                <div className="p-3 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold">
                      {t("chat_migration_export_preview")}
                    </div>
                    <div className="text-xs text-main/40">
                      {t("chat_migration_selected_count")
                        .replace(
                          "{selected}",
                          countSelectedChats(chatExportSelectedIds).toString(),
                        )
                        .replace(
                          "{total}",
                          (chatExportPayload?.items?.length || 0).toString(),
                        )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn-secondary h-8 !py-0 !px-3 !text-[11px]"
                      onClick={() => loadChatExportPreview()}
                      disabled={chatExportLoading}
                    >
                      {chatExportLoading ? (
                        <Spinner className="animate-spin" />
                      ) : (
                        t("chat_migration_load_list")
                      )}
                    </button>
                    <button
                      className="btn-secondary h-8 !py-0 !px-3 !text-[11px]"
                      onClick={() => setAllChatExportItems(true)}
                      disabled={!chatExportPayload || chatExportLoading}
                    >
                      {t("select_all")}
                    </button>
                    <button
                      className="btn-secondary h-8 !py-0 !px-3 !text-[11px]"
                      onClick={() => setAllChatExportItems(false)}
                      disabled={!chatExportPayload || chatExportLoading}
                    >
                      {t("clear")}
                    </button>
                  </div>
                </div>

                {chatExportPayload ? (
                  <div className="p-3 border-b border-white/5">
                    <input
                      type="search"
                      className="!mb-0 !py-2 !px-3 text-xs"
                      placeholder={t("chat_migration_search_placeholder")}
                      value={chatExportSearch}
                      onChange={(e) => setChatExportSearch(e.target.value)}
                    />
                  </div>
                ) : null}

                {chatExportError ? (
                  <div className="m-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 break-words">
                    {chatExportError}
                  </div>
                ) : null}

                {chatExportPayload ? (
                  <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
                    {chatExportVisibleItems.length ? (
                      chatExportVisibleItems.map(({ item, index }) =>
                        renderMigrationItem(
                          item,
                          index,
                          chatExportSelectedIds,
                          handleToggleChatExportItem,
                        ),
                      )
                    ) : (
                      <div className="p-6 text-center text-xs text-main/40">
                        {t("chat_migration_no_matches")}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-main/40">
                    {t("chat_migration_load_list_hint")}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-white/5 flex gap-3 bg-white/2">
              <button
                className="btn-secondary flex-1 h-10 !py-0 !text-xs"
                onClick={() => setShowChatExportDialog(false)}
              >
                {t("cancel")}
              </button>
              <button
                className="btn-gradient flex-1 h-10 !py-0 !text-xs"
                onClick={handleExportChats}
                disabled={chatExportLoading}
              >
                {chatExportLoading ? (
                  <Spinner className="animate-spin" />
                ) : chatExportPayload ? (
                  t("chat_migration_export_selected").replace(
                    "{count}",
                    countSelectedChats(chatExportSelectedIds).toString(),
                  )
                ) : (
                  t("chat_migration_load_list")
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showChatImportDialog && (
        <div className="modal-overlay active">
          <div
            className="glass-panel modal-content !max-w-3xl max-h-[90vh] flex flex-col overflow-hidden !p-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-sky-500/10 rounded-lg text-sky-500">
                  <UploadSimple weight="bold" size={18} />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-lg truncate">
                    {t("chat_migration_import")}
                  </div>
                  <div className="text-xs text-main/40 truncate">
                    {chatImportAccount}
                  </div>
                </div>
              </div>
              <div
                className="modal-close"
                onClick={() => setShowChatImportDialog(false)}
              >
                <X weight="bold" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-amber-300">
                <WarningCircle
                  weight="bold"
                  size={18}
                  className="mt-0.5 shrink-0"
                />
                <div className="text-xs leading-relaxed text-amber-200/90">
                  {t("chat_migration_notice")}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_150px] gap-3 items-end">
                <div>
                  <label className="text-[11px] mb-1">{t("upload_json")}</label>
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="!mb-0"
                    onChange={handleChatImportFile}
                  />
                </div>
                <div>
                  <label className="text-[11px] mb-1">
                    {t("chat_migration_delay")}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    className="!mb-0"
                    value={chatImportDelay}
                    onChange={(e) =>
                      setChatImportDelay(Number(e.target.value || 0))
                    }
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3 mb-1">
                  <label className="text-[11px] !mb-0">
                    {t("chat_migration_json")}
                  </label>
                  <button
                    className="btn-secondary h-8 !py-0 !px-3 !text-[11px]"
                    onClick={() => setChatImportShowJson((prev) => !prev)}
                  >
                    {chatImportShowJson ? t("collapse") : t("expand")}
                  </button>
                </div>
                {chatImportShowJson ? (
                  <textarea
                    className="!mb-0 min-h-[160px] font-mono text-xs"
                    placeholder={t("chat_migration_json_placeholder")}
                    value={chatImportJson}
                    onChange={(e) => {
                      setChatImportJson(e.target.value);
                      try {
                        loadChatImportPreview(e.target.value);
                      } catch {
                        setChatImportPayload(null);
                        setChatImportSelectedIds({});
                        setChatImportError("");
                        setChatImportResult(null);
                        setChatImportProgress("");
                      }
                    }}
                  />
                ) : null}
              </div>

              {chatImportPayload ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {getMigrationStatCards(
                      (chatImportPayload.items || []) as ChatMigrationItem[],
                      chatImportSelectedIds,
                    ).map(([key, label, value]) => (
                      <div
                        key={key}
                        className="rounded-xl border border-white/5 bg-white/2 p-3"
                      >
                        <div className="text-lg font-bold">{value}</div>
                        <div className="text-[10px] text-main/40">{label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-white/5 bg-white/2 overflow-hidden">
                    <div className="p-3 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold">
                          {t("chat_migration_import_preview")}
                        </div>
                        <div className="text-xs text-main/40">
                          {t("chat_migration_selected_count")
                            .replace(
                              "{selected}",
                              countSelectedChats(
                                chatImportSelectedIds,
                              ).toString(),
                            )
                            .replace(
                              "{total}",
                              (chatImportPayload.items?.length || 0).toString(),
                            )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="btn-secondary h-8 !py-0 !px-3 !text-[11px]"
                          onClick={() => setAllChatImportItems(true)}
                          disabled={chatImportLoading}
                        >
                          {t("select_all")}
                        </button>
                        <button
                          className="btn-secondary h-8 !py-0 !px-3 !text-[11px]"
                          onClick={() => setAllChatImportItems(false)}
                          disabled={chatImportLoading}
                        >
                          {t("clear")}
                        </button>
                      </div>
                    </div>
                    <div className="p-3 border-b border-white/5">
                      <input
                        type="search"
                        className="!mb-0 !py-2 !px-3 text-xs"
                        placeholder={t("chat_migration_search_placeholder")}
                        value={chatImportSearch}
                        onChange={(e) => setChatImportSearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-[260px] overflow-y-auto custom-scrollbar">
                      {chatImportVisibleItems.length ? (
                        chatImportVisibleItems.map(({ item, index }) =>
                          renderMigrationItem(
                            item,
                            index,
                            chatImportSelectedIds,
                            handleToggleChatImportItem,
                            chatImportLoading,
                          ),
                        )
                      ) : (
                        <div className="p-6 text-center text-xs text-main/40">
                          {t("chat_migration_no_matches")}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : null}

              <label className="flex items-center gap-2 !mb-0 text-xs text-main/60">
                <input
                  type="checkbox"
                  checked={chatImportDryRun}
                  onChange={(e) => setChatImportDryRun(e.target.checked)}
                />
                {t("chat_migration_dry_run")}
              </label>

              {chatImportPayload ? (
                <div className="rounded-xl border border-sky-500/15 bg-sky-500/10 p-3 text-xs text-sky-200">
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      {chatImportProgress || t("chat_migration_import_ready")}
                    </span>
                    <span>
                      {chatImportProcessedTotal}/{chatImportSelectedTotal}
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-sky-400 transition-all"
                      style={{
                        width: `${chatImportProgressPercent}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {chatImportError ? (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 break-words">
                  {chatImportError}
                </div>
              ) : null}

              {chatImportResult ? (
                <div className="rounded-xl border border-white/5 bg-white/2 overflow-hidden">
                  <div className="p-3 border-b border-white/5 grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
                    {[
                      ["joined", t("chat_migration_joined")],
                      ["already_member", t("chat_migration_already")],
                      ["request_sent", t("chat_migration_request_sent")],
                      ["manual_required", t("chat_migration_manual")],
                      ["failed", t("failure")],
                    ].map(([key, label]) => (
                      <div key={key} className="rounded-lg bg-white/3 p-2">
                        <div className="text-base font-bold">
                          {key === "failed"
                            ? (chatImportResult.summary?.failed || 0) +
                              (chatImportResult.summary?.flood_wait || 0)
                            : chatImportResult.summary?.[key] || 0}
                        </div>
                        <div className="text-[10px] text-main/40">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="max-h-[260px] overflow-y-auto custom-scrollbar">
                    {chatImportResult.results.map((item, index) => {
                      const statusColor =
                        item.status === "joined" ||
                        item.status === "already_member"
                          ? "text-emerald-400"
                          : item.status === "request_sent" ||
                              item.status === "manual_required" ||
                              item.status === "ready"
                            ? "text-amber-300"
                            : "text-rose-400";
                      return (
                        <div
                          key={`${item.title}-${index}`}
                          className="p-3 border-b border-white/5 last:border-0"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-semibold truncate">
                              {item.title}
                            </div>
                            <div
                              className={`text-[10px] font-bold uppercase shrink-0 ${statusColor}`}
                            >
                              {item.status}
                            </div>
                          </div>
                          <div className="text-xs text-main/45 mt-1 leading-relaxed break-words">
                            {item.message}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="p-4 border-t border-white/5 bg-white/2">
              {chatImportJobActive ? (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-sky-500/15 bg-sky-500/10 px-3 py-2 text-xs text-sky-600 dark:text-sky-200">
                  <span className="font-semibold">
                    {t("chat_migration_background_title")} ·{" "}
                    {chatImportJobProgressPercent}%
                  </span>
                  <button
                    className="text-[11px] font-bold hover:underline"
                    onClick={() => {
                      setShowChatImportDialog(false);
                      setShowChatImportFloat(true);
                    }}
                  >
                    {t("chat_migration_view_float")}
                  </button>
                </div>
              ) : null}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  className="btn-secondary h-10 !py-0 !text-xs"
                  onClick={() => {
                    setShowChatImportDialog(false);
                    if (chatImportJob) setShowChatImportFloat(true);
                  }}
                >
                  {t("close")}
                </button>
                <button
                  className="btn-secondary h-10 !py-0 !text-xs !text-sky-500"
                  onClick={handleImportChatsInBackground}
                  disabled={
                    chatImportLoading ||
                    chatImportJobActionLoading ||
                    !chatImportJson.trim() ||
                    !chatImportSelectedTotal
                  }
                >
                  {chatImportJobActionLoading ? (
                    <Spinner className="animate-spin" />
                  ) : (
                    <>
                      <ArrowsOutSimple weight="bold" />
                      {t("chat_migration_run_background")}
                    </>
                  )}
                </button>
                <button
                  className="btn-gradient h-10 !py-0 !text-xs"
                  onClick={handleImportChats}
                  disabled={
                    chatImportLoading ||
                    !chatImportJson.trim() ||
                    !chatImportSelectedTotal
                  }
                >
                  {chatImportLoading ? (
                    <Spinner className="animate-spin" />
                  ) : chatImportDryRun ? (
                    t("chat_migration_preview_selected").replace(
                      "{count}",
                      chatImportSelectedTotal.toString(),
                    )
                  ) : (
                    t("chat_migration_import_selected").replace(
                      "{count}",
                      chatImportSelectedTotal.toString(),
                    )
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {chatImportJob && showChatImportFloat && (
        <div className="fixed right-4 bottom-4 sm:right-6 sm:bottom-6 z-[80] w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-3xl border border-white/20 bg-white/85 dark:bg-[#0b1120]/90 shadow-[0_24px_80px_rgba(15,23,42,0.28)] backdrop-blur-2xl">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-violet-400 to-fuchsia-400" />
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-500">
                  {chatImportJobActive ? (
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
                      {chatImportJob.account_name}
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${chatImportJobStatusClass}`}
                    >
                      {t(`chat_migration_job_${chatImportJob.status}`)}
                    </span>
                  </div>
                </div>
              </div>
              <button
                className="action-icon !w-8 !h-8 opacity-70 hover:opacity-100"
                onClick={() => setShowChatImportFloat(false)}
                disabled={chatImportJobActive}
                title={t("close")}
              >
                <X weight="bold" size={14} />
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-sky-500/15 bg-gradient-to-br from-sky-500/10 to-violet-500/10 p-3 text-xs text-sky-700 dark:text-sky-200">
              <div className="flex items-center justify-between gap-3 font-semibold">
                <span className="truncate">
                  {t("chat_migration_import_progress")
                    .replace(
                      "{done}",
                      String(chatImportJob.progress?.done || 0),
                    )
                    .replace(
                      "{total}",
                      String(chatImportJob.progress?.total || 0),
                    )}
                </span>
                <span className="shrink-0 text-sm font-black">
                  {chatImportJobProgressPercent}%
                </span>
              </div>
              <div className="mt-3 h-2.5 rounded-full bg-white/50 dark:bg-white/10 overflow-hidden shadow-inner">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 via-violet-400 to-fuchsia-400 transition-all duration-500"
                  style={{ width: `${chatImportJobProgressPercent}%` }}
                />
              </div>
            </div>

            {chatImportJob.error ? (
              <div className="mt-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-500 break-words">
                {chatImportJob.error}
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
                      ? (chatImportJob.summary?.failed || 0) +
                        (chatImportJob.summary?.flood_wait || 0)
                      : chatImportJob.summary?.[key] || 0}
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
                onClick={() => {
                  setShowChatImportDialog(true);
                  setShowChatImportFloat(false);
                }}
              >
                {t("chat_migration_view_details")}
              </button>
              {chatImportJobActive ? (
                <button
                  className="btn-secondary flex-1 h-9 !py-0 !text-xs !text-rose-500 hover:!bg-rose-500/10"
                  onClick={handleCancelImportJob}
                  disabled={
                    chatImportJobActionLoading ||
                    chatImportJob.status === "canceling"
                  }
                >
                  {chatImportJob.status === "canceling" ? (
                    <Spinner className="animate-spin" />
                  ) : (
                    t("chat_migration_stop_background")
                  )}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {showLogsDialog && (
        <div className="modal-overlay active">
          <div
            className="glass-panel modal-content !max-w-4xl max-h-[90vh] flex flex-col overflow-hidden !p-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#8a3ffc]/10 rounded-lg text-[#8a3ffc]">
                  <ListDashes weight="bold" size={18} />
                </div>
                <div className="font-bold text-lg">
                  {logsAccountName} {t("running_logs")}
                </div>
              </div>
              <div
                className="modal-close"
                onClick={() => setShowLogsDialog(false)}
              >
                <X weight="bold" />
              </div>
            </div>

            <div className="px-5 py-3 border-b border-white/5 flex justify-between items-center bg-white/2">
              <div className="text-[10px] text-main/30 font-bold uppercase tracking-wider">
                {t("logs_summary")
                  .replace("{count}", accountLogs.length.toString())
                  .replace("{days}", "3")}
              </div>
              {accountLogs.length > 0 && (
                <button
                  onClick={handleClearLogs}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-[10px] font-bold hover:bg-rose-500/20 transition-all disabled:opacity-50"
                >
                  <Trash weight="bold" size={14} />
                  {t("clear_logs")}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-5 font-mono text-[13px] bg-black/10 custom-scrollbar">
              {logsLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-main/30">
                  <Spinner className="animate-spin mb-4" size={32} />
                  {t("loading")}
                </div>
              ) : accountLogs.length === 0 ? (
                <div className="text-center py-20 text-main/20 font-sans">
                  {t("no_logs")}
                </div>
              ) : (
                <div className="space-y-3">
                  {accountLogs.map((log, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-xl bg-white/2 border border-white/5 group hover:border-white/10 transition-colors"
                    >
                      <div className="flex justify-between items-center mb-2.5 text-[10px] uppercase tracking-wider font-bold">
                        <span className="text-main/20 group-hover:text-main/40 transition-colors">
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md ${log.success ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}
                        >
                          {log.success ? t("success") : t("failure")}
                        </span>
                      </div>
                      <div className="text-main/70 font-semibold mb-2">
                        {`${t("task_label")}: ${log.task_name} ${log.success ? t("task_exec_success") : t("task_exec_failed")}`}
                      </div>
                      {log.bot_message ? (
                        <div className="text-main/60 leading-relaxed whitespace-pre-wrap break-words mb-2">
                          <span className="text-main/35">
                            {t("bot_reply")}:{" "}
                          </span>
                          {log.bot_message}
                        </div>
                      ) : null}
                      {log.message &&
                      ![
                        "Success",
                        "Failed",
                        t("task_exec_success"),
                        t("task_exec_failed"),
                      ].includes(log.message.trim()) ? (
                        <pre className="whitespace-pre-wrap text-main/45 leading-relaxed overflow-x-auto max-h-[120px] scrollbar-none font-medium">
                          {log.message}
                        </pre>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/5 text-center bg-white/2">
              <button
                className="btn-secondary px-8 h-9 !py-0 mx-auto !text-xs"
                onClick={() => setShowLogsDialog(false)}
              >
                {t("close")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
