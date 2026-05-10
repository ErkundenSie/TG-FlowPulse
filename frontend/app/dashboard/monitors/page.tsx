"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
    ArrowClockwise,
    CaretLeft,
    ChatCircleText,
    Check,
    Eye,
    Lightning,
    PaperPlaneTilt,
    PencilSimple,
    Plus,
    Robot,
    Spinner,
    Trash,
    X,
} from "@phosphor-icons/react";
import { getToken } from "../../../lib/auth";
import {
    AccountInfo,
    ChatInfo,
    MonitorRule,
    MonitorStatus,
    MonitorTask,
    createMonitorTask,
    deleteMonitorTask,
    getMonitorStatus,
    getAccountChats,
    listAccounts,
    listMonitorTasks,
    searchAccountChats,
    updateMonitorTask,
} from "../../../lib/api";
import { ThemeLanguageToggle } from "../../../components/ThemeLanguageToggle";
import { ToastContainer, useToast } from "../../../components/ui/toast";
import { useLanguage } from "../../../context/LanguageContext";

const emptyRule = (): MonitorRule => ({
    chat_id: "",
    chat_name: "",
    message_thread_id: null,
    message_thread_ids: [],
    monitor_scope: "selected",
    keywords: [],
    match_mode: "contains",
    ignore_case: true,
    include_self_messages: false,
    time_window_enabled: false,
    active_time_start: "",
    active_time_end: "",
    push_channel: "telegram",
    forward_chat_id: "",
    forward_message_thread_id: null,
    auto_reply_text: "",
    continue_action_interval: 1,
    continue_actions: [],
});

const getChatTitle = (chat: ChatInfo) => chat.title || chat.username || chat.first_name || String(chat.id);

const splitKeywords = (value: string, mode: MonitorRule["match_mode"]) => {
    const splitter = mode === "regex" ? /\n/ : /\n|,/;
    return value.split(splitter).map((item) => item.trim()).filter(Boolean);
};

const parseOptionalInt = (value: string) => {
    const text = value.trim();
    if (!text) return null;
    const parsed = Number.parseInt(text, 10);
    return Number.isNaN(parsed) ? null : parsed;
};

const splitTopicIds = (value: string) => {
    return value
        .split(/\n|,|，/)
        .map((item) => parseOptionalInt(item))
        .filter((item): item is number => typeof item === "number");
};

const normalizeChatIdInput = (value: string) => {
    const text = value.trim();
    if (!text) return "";
    if (text.startsWith("@")) return text;
    const parsed = Number.parseInt(text, 10);
    return Number.isNaN(parsed) ? text : parsed;
};

type SelectedMonitorChat = { chat_id: NonNullable<MonitorRule["chat_id"]>; chat_name: string };

type RuleDraft = MonitorRule & {
    keywordsText: string;
    topicIdsText: string;
    selectedChats: SelectedMonitorChat[];
};

const toDraftRule = (rule?: MonitorRule, allRules?: MonitorRule[]): RuleDraft => ({
    ...emptyRule(),
    ...(rule || {}),
    keywordsText: (rule?.keywords || []).join("\n"),
    topicIdsText: (
        rule?.message_thread_ids?.length
            ? rule.message_thread_ids
            : rule?.message_thread_id
                ? [rule.message_thread_id]
                : []
    ).join("\n"),
    selectedChats: (allRules || (rule ? [rule] : []))
        .filter((item) => (item.monitor_scope || "selected") === "selected" && item.chat_id !== undefined && item.chat_id !== null && item.chat_id !== "")
        .map((item) => ({
            chat_id: item.chat_id as NonNullable<MonitorRule["chat_id"]>,
            chat_name: item.chat_name || String(item.chat_id),
        })),
});

const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
};

export default function MonitorTasksPage() {
    const { t, language } = useLanguage();
    const searchParams = useSearchParams();
    const selectedAccountName = searchParams.get("account_name") || "";
    const isZh = language === "zh";
    const { toasts, addToast, removeToast } = useToast();
    const addToastRef = useRef(addToast);
    const translateRef = useRef(t);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [accounts, setAccounts] = useState<AccountInfo[]>([]);
    const [tasks, setTasks] = useState<MonitorTask[]>([]);
    const [availableChats, setAvailableChats] = useState<ChatInfo[]>([]);
    const [chatSearch, setChatSearch] = useState("");
    const [chatSearchResults, setChatSearchResults] = useState<ChatInfo[]>([]);
    const [chatSearchLoading, setChatSearchLoading] = useState(false);
    const [editing, setEditing] = useState<MonitorTask | null>(null);
    const [statusTask, setStatusTask] = useState<MonitorTask | null>(null);
    const [statusInfo, setStatusInfo] = useState<MonitorStatus | null>(null);
    const [statusLoading, setStatusLoading] = useState(false);
    const [showEditor, setShowEditor] = useState(false);
    const [form, setForm] = useState({
        name: "",
        account_name: "",
        group: "monitors",
        enabled: true,
        rule: toDraftRule(),
    });

    const labels = useMemo(() => ({
        title: isZh ? "消息监控" : "Message Monitors",
        subtitle: isZh ? "个人、群组、频道消息监控、转发与自动回复" : "Monitor private, group, and channel messages with forwarding and auto replies",
        add: isZh ? "新增监控" : "New Monitor",
        edit: isZh ? "编辑监控" : "Edit Monitor",
        noTasks: isZh ? "还没有监控任务" : "No monitor tasks yet",
        noTasksDesc: isZh ? "添加一个监听来源，配置关键词、转发或自动回复。" : "Add a source chat, then configure keywords, forwarding, or auto replies.",
        source: isZh ? "监听来源" : "Source",
        handling: isZh ? "命中处理" : "Match Handling",
        account: isZh ? "监听账号" : "Account",
        group: isZh ? "分组" : "Group",
        monitorName: isZh ? "监控名称" : "Monitor Name",
        chatSearch: isZh ? "搜索最近会话" : "Search recent chats",
        manualChat: isZh ? "手动 Chat ID / @username" : "Manual Chat ID / @username",
        topic: isZh ? "话题 / Thread IDs" : "Topic / Thread IDs",
        keywords: isZh ? "关键词 / 正则" : "Keywords / Regex",
        keywordsHint: isZh ? "每行或逗号分隔一个关键词；正则模式建议每行一个表达式。" : "Use one keyword per line or comma; regex mode should use one expression per line.",
        matchMode: isZh ? "匹配方式" : "Match Mode",
        ignoreCase: isZh ? "忽略大小写" : "Ignore Case",
        includeSelf: isZh ? "监听自己发送的消息" : "Include My Own Messages",
        includeSelfHint: isZh ? "默认关闭，避免自动回复自己触发循环。" : "Off by default to avoid self-trigger loops.",
        pushChannel: isZh ? "处理方式" : "Action",
        forwardChat: isZh ? "转发目标 Chat ID / @username" : "Forward Target Chat ID / @username",
        forwardTopic: isZh ? "转发目标话题 ID" : "Forward Topic ID",
        autoReply: isZh ? "自动回复文本" : "Auto Reply Text",
        barkUrl: "Bark URL",
        customUrl: isZh ? "自定义推送 URL" : "Custom Push URL",
        enabled: isZh ? "启用监听" : "Enabled",
        save: isZh ? "保存监控" : "Save Monitor",
        deleteConfirm: isZh ? "确定删除这个监控任务吗？" : "Delete this monitor task?",
        saved: isZh ? "监控已保存，后台监听已刷新" : "Monitor saved and background listener refreshed",
        deleted: isZh ? "监控已删除" : "Monitor deleted",
        selectChat: isZh ? "选择会话" : "Select Chat",
        telegramNotify: isZh ? "Telegram Bot 通知" : "Telegram Bot Notify",
        forward: isZh ? "转发消息" : "Forward",
        bark: "Bark",
        custom: isZh ? "自定义 URL" : "Custom URL",
        reply: isZh ? "自动回复" : "Auto Reply",
        status: isZh ? "运行状态" : "Runtime Status",
        statusEmpty: isZh ? "暂无运行日志，保存后请稍等几秒再刷新。" : "No runtime logs yet. Wait a few seconds after saving, then refresh.",
        viewStatus: isZh ? "查看运行状态" : "View Runtime Status",
    }), [isZh]);

    const extraLabels = useMemo(() => ({
        scope: isZh ? "监听范围" : "Scope",
        selectedScope: isZh ? "指定会话" : "Selected Chat",
        privateScope: isZh ? "私聊监控" : "Private Chats",
        privateHint: isZh ? "只监听该账号的私人对话消息。" : "Only monitor private one-to-one conversations for this account.",
        topicPlaceholder: isZh ? "留空=全部话题；多个用逗号或换行，例如 1, 3, 8" : "Blank = all topics; use commas or new lines, e.g. 1, 3, 8",
        timeWindow: isZh ? "限定监控时间段" : "Limit Active Time",
        timeWindowHint: isZh ? "关闭时全天实时监控；开启后只在这个时间段内处理命中消息，支持跨午夜。" : "Off means always realtime; when enabled, matches only during this time window, including overnight ranges.",
        startTime: isZh ? "开始时间" : "Start Time",
        endTime: isZh ? "结束时间" : "End Time",
    }), [isZh]);

    const matchModeHelp = useMemo(() => ({
        contains: isZh
            ? "contains：消息里包含关键词就命中，例如关键词 test 可匹配 hello test。"
            : "contains: matches when the message contains a keyword, e.g. test matches hello test.",
        exact: isZh
            ? "exact：整条消息必须和关键词完全一致，适合口令类消息。"
            : "exact: the whole message must equal the keyword, useful for command-like messages.",
        regex: isZh
            ? "regex：使用正则表达式匹配，每行一个表达式，例如 ^订单\\d+$。"
            : "regex: match with regular expressions, one expression per line, e.g. ^order\\d+$.",
    }), [isZh]);

    const formatError = useCallback((fallback: string, err: any) => {
        return err?.message ? `${fallback}: ${err.message}` : fallback;
    }, []);

    useEffect(() => {
        addToastRef.current = addToast;
        translateRef.current = t;
    }, [addToast, t]);

    const loadData = useCallback(async (tokenStr: string) => {
        setLoading(true);
        try {
            const monitorData = await withTimeout(listMonitorTasks(tokenStr), 12000, "monitor list");
            setTasks(monitorData);
        } catch (err: any) {
            addToastRef.current(formatError(translateRef.current("load_failed"), err), "error");
        } finally {
            setLoading(false);
        }

        try {
            const accountData = await withTimeout(listAccounts(tokenStr), 12000, "account list");
            setAccounts(accountData.accounts);
        setForm((prev) => (
            prev.account_name || !(selectedAccountName || accountData.accounts[0]?.name)
                ? prev
                : { ...prev, account_name: selectedAccountName || accountData.accounts[0].name }
        ));
        } catch (err: any) {
            addToastRef.current(formatError(translateRef.current("load_failed"), err), "error");
        }
    }, [formatError, selectedAccountName]);

    const loadChats = useCallback(async (tokenStr: string, accountName: string) => {
        if (!accountName) return;
        try {
            const chats = await getAccountChats(tokenStr, accountName);
            setAvailableChats(chats);
        } catch {
            setAvailableChats([]);
        }
    }, []);

    useEffect(() => {
        const tokenStr = getToken();
        if (!tokenStr) {
            window.location.replace("/");
            return;
        }
        setToken(tokenStr);
        loadData(tokenStr);
    }, [loadData]);

    useEffect(() => {
        if (token && form.account_name && showEditor) {
            loadChats(token, form.account_name);
        }
    }, [token, form.account_name, showEditor, loadChats]);

    useEffect(() => {
        if (!token || !form.account_name || !showEditor) return;
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
                const res = await searchAccountChats(token, form.account_name, query, 30, 0);
                if (!cancelled) setChatSearchResults(res.items || []);
            } catch {
                if (!cancelled) setChatSearchResults([]);
            } finally {
                if (!cancelled) setChatSearchLoading(false);
            }
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [chatSearch, token, form.account_name, showEditor]);

    const openCreate = () => {
        setEditing(null);
        setChatSearch("");
        setForm({
            name: "",
            account_name: selectedAccountName || accounts[0]?.name || "",
            group: "monitors",
            enabled: true,
            rule: toDraftRule(),
        });
        setShowEditor(true);
    };

    const openEdit = (task: MonitorTask) => {
        setEditing(task);
        setChatSearch("");
        setForm({
            name: task.name,
            account_name: task.account_name,
            group: task.group || "monitors",
            enabled: task.enabled,
            rule: toDraftRule(task.rules[0], task.rules),
        });
        setShowEditor(true);
    };

    const updateRule = (patch: Partial<RuleDraft>) => {
        setForm((prev) => ({ ...prev, rule: { ...prev.rule, ...patch } }));
    };

    const setManualChat = (value: string) => {
        const text = value.trim();
        const chatId = normalizeChatIdInput(text);
        updateRule({
            chat_id: text,
            chat_name: text,
            selectedChats: chatId ? [{ chat_id: chatId, chat_name: text }] : [],
        });
    };

    const selectChat = (chat: ChatInfo) => {
        const chatName = getChatTitle(chat);
        const chatId = chat.id;
        const exists = currentRule.selectedChats.some((item) => String(item.chat_id) === String(chatId));
        const selectedChats = exists
            ? currentRule.selectedChats.filter((item) => String(item.chat_id) !== String(chatId))
            : [...currentRule.selectedChats, { chat_id: chatId, chat_name: chatName }];
        updateRule({
            selectedChats,
            chat_id: selectedChats[0]?.chat_id || "",
            chat_name: selectedChats[0]?.chat_name || "",
            monitor_scope: "selected",
        });
    };

    const saveMonitor = async () => {
        if (!token) return;
        const name = form.name.trim();
        const accountName = form.account_name.trim();
        const groupName = form.group.trim() || "monitors";
        const monitorScope = form.rule.monitor_scope || "selected";
        const topicIds = splitTopicIds(form.rule.topicIdsText || "");
        const sourceChatId = normalizeChatIdInput(String(form.rule.chat_id || ""));
        const sourceChatName = form.rule.chat_name || String(form.rule.chat_id || "");
        const selectedChats = monitorScope === "selected"
            ? (
                form.rule.selectedChats.length > 0
                    ? form.rule.selectedChats
                    : sourceChatId
                        ? [{ chat_id: sourceChatId, chat_name: sourceChatName }]
                        : []
            )
            : [];
        const baseRule: MonitorRule = {
            ...form.rule,
            monitor_scope: monitorScope,
            chat_id: monitorScope === "selected" ? sourceChatId : monitorScope,
            chat_name: monitorScope === "private"
                ? (isZh ? "私聊监控" : "Private Chats")
                : sourceChatName,
            message_thread_id: topicIds[0] ?? null,
            message_thread_ids: topicIds,
            keywords: splitKeywords(form.rule.keywordsText, form.rule.match_mode),
            include_self_messages: Boolean(form.rule.include_self_messages),
            time_window_enabled: Boolean(form.rule.time_window_enabled),
            active_time_start: form.rule.time_window_enabled ? String(form.rule.active_time_start || "").trim() || null : null,
            active_time_end: form.rule.time_window_enabled ? String(form.rule.active_time_end || "").trim() || null : null,
            forward_chat_id: normalizeChatIdInput(String(form.rule.forward_chat_id || "")) || null,
            forward_message_thread_id: parseOptionalInt(String(form.rule.forward_message_thread_id || "")),
            bark_url: String(form.rule.bark_url || "").trim() || null,
            custom_url: String(form.rule.custom_url || "").trim() || null,
            auto_reply_text: String(form.rule.auto_reply_text || "").trim() || null,
            continue_actions: form.rule.push_channel === "continue" && String(form.rule.auto_reply_text || "").trim()
                ? [{ action: 1, text: String(form.rule.auto_reply_text || "").trim() }]
                : [],
        };
        const rules: MonitorRule[] = monitorScope === "selected"
            ? selectedChats.map((chat) => ({
                ...baseRule,
                chat_id: chat.chat_id,
                chat_name: chat.chat_name,
            }))
            : [baseRule];
        if (!name || !accountName || (monitorScope === "selected" && selectedChats.length === 0) || baseRule.keywords.length === 0) {
            addToast(isZh ? "请填写名称、账号、监听来源和关键词" : "Name, account, source chat, and keywords are required", "error");
            return;
        }
        if (baseRule.time_window_enabled && (!baseRule.active_time_start || !baseRule.active_time_end)) {
            addToast(isZh ? "请填写完整的监控开始和结束时间" : "Start and end time are required for active time window", "error");
            return;
        }
        if (baseRule.push_channel === "forward" && !baseRule.forward_chat_id) {
            addToast(isZh ? "请填写转发目标 Chat ID" : "Forward target Chat ID is required", "error");
            return;
        }
        if (baseRule.push_channel === "continue" && !baseRule.auto_reply_text) {
            addToast(isZh ? "请填写自动回复文本" : "Auto reply text is required", "error");
            return;
        }
        try {
            setLoading(true);
            if (editing) {
                await updateMonitorTask(token, editing.name, {
                    account_name: accountName,
                    enabled: form.enabled,
                    group: groupName,
                    rules,
                }, editing.account_name);
            } else {
                await createMonitorTask(token, {
                    name,
                    account_name: accountName,
                    group: groupName,
                    enabled: form.enabled,
                    rules,
                });
            }
            addToast(labels.saved, "success");
            setShowEditor(false);
            await loadData(token);
        } catch (err: any) {
            addToast(formatError(t("save_failed"), err), "error");
        } finally {
            setLoading(false);
        }
    };

    const removeMonitor = async (task: MonitorTask) => {
        if (!token || !confirm(labels.deleteConfirm)) return;
        try {
            setLoading(true);
            await deleteMonitorTask(token, task.name, task.account_name);
            addToast(labels.deleted, "success");
            await loadData(token);
        } catch (err: any) {
            addToast(formatError(t("delete_failed"), err), "error");
        } finally {
            setLoading(false);
        }
    };

    const openStatus = async (task: MonitorTask) => {
        if (!token) return;
        setStatusTask(task);
        setStatusInfo(null);
        setStatusLoading(true);
        try {
            const info = await getMonitorStatus(token, task.name, task.account_name);
            setStatusInfo(info);
        } catch (err: any) {
            addToast(formatError(t("load_failed"), err), "error");
        } finally {
            setStatusLoading(false);
        }
    };

    const visibleChats = chatSearch.trim() ? chatSearchResults : availableChats.slice(0, 80);
    const currentRule = form.rule;
    const statusLogs = Array.isArray(statusInfo?.logs) ? statusInfo.logs : [];
    const groupedTasks = useMemo(() => {
        const groups = new Map<string, MonitorTask[]>();
        for (const task of tasks) {
            const groupName = (task.group || "monitors").trim() || "monitors";
            const label = groupName === "monitors" ? (isZh ? "默认分组" : "Default") : groupName;
            groups.set(label, [...(groups.get(label) || []), task]);
        }
        return Array.from(groups.entries());
    }, [isZh, tasks]);

    if (!token) return null;

    return (
        <div id="monitor-view" className="w-full h-full flex flex-col">
            <nav className="navbar">
                <div className="nav-brand">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard" className="action-btn" title={t("sidebar_home")}>
                            <CaretLeft weight="bold" />
                        </Link>
                        <h1 className="text-lg font-bold tracking-tight">{labels.title}</h1>
                    </div>
                </div>
                <div className="top-right-actions">
                    <button onClick={() => loadData(token)} disabled={loading} className="action-btn" title={t("refresh_list")}>
                        <ArrowClockwise weight="bold" className={loading ? "animate-spin" : ""} />
                    </button>
                    <button onClick={openCreate} className="action-btn !text-[#8a3ffc]" title={labels.add}>
                        <Plus weight="bold" />
                    </button>
                    <ThemeLanguageToggle />
                </div>
            </nav>

            <main className="main-content !pt-6">
                <header className="mb-6 flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                            <Eye weight="bold" size={22} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold">{labels.title}</h2>
                            <p className="text-sm text-main/45">{labels.subtitle}</p>
                        </div>
                    </div>
                </header>

                {loading && tasks.length === 0 ? (
                    <div className="py-20 flex justify-center text-main/30">
                        <Spinner className="animate-spin" size={32} />
                    </div>
                ) : tasks.length === 0 ? (
                    <div className="glass-panel p-12 flex flex-col items-center text-center border-dashed border-2 cursor-pointer" onClick={openCreate}>
                        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-4">
                            <Plus weight="bold" size={30} />
                        </div>
                        <h3 className="text-xl font-bold mb-2">{labels.noTasks}</h3>
                        <p className="text-sm text-main/45">{labels.noTasksDesc}</p>
                    </div>
                ) : (
                    <div className="space-y-7">
                        {groupedTasks.map(([groupName, groupTasks]) => (
                            <section key={groupName} className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-sm font-bold text-main/70">{groupName}</h3>
                                    <span className="text-[10px] text-main/35">{groupTasks.length}</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                                    {groupTasks.map((task) => {
                                        const rule = task.rules[0];
                                        const channel = rule?.push_channel || "telegram";
                                        const scope = rule?.monitor_scope || "selected";
                                        const sourceLabel = scope === "private"
                                            ? extraLabels.privateScope
                                            : task.rules.length > 1
                                                ? `${task.rules.length} ${isZh ? "个会话" : "chats"}`
                                                : (rule?.chat_name || rule?.chat_id);
                                        return (
                                            <div key={`${task.account_name}-${task.name}`} className="glass-panel p-4 flex flex-col gap-3">
                                                <div className="flex justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${task.enabled ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-white/5 text-main/30 border-white/10"}`}>
                                                                {task.enabled ? t("status_active") : t("status_paused")}
                                                            </span>
                                                            <span className="text-[10px] text-main/35 font-mono truncate">{task.account_name}</span>
                                                        </div>
                                                        <h3 className="font-bold text-base truncate">{task.name}</h3>
                                                    </div>
                                                    <div className="w-9 h-9 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
                                                        <ChatCircleText weight="fill" size={18} />
                                                    </div>
                                                </div>
                                                <div className="space-y-2 text-xs">
                                                    <div className="flex justify-between gap-3 rounded-lg bg-white/5 border border-white/5 px-3 py-1.5">
                                                        <span className="text-main/40">{labels.source}</span>
                                                        <span className="font-mono text-main/75 truncate">{sourceLabel}</span>
                                                    </div>
                                                    {rule?.time_window_enabled && (
                                                        <div className="flex justify-between gap-3 rounded-lg bg-white/5 border border-white/5 px-3 py-1.5">
                                                            <span className="text-main/40">{extraLabels.timeWindow}</span>
                                                            <span className="font-mono text-cyan-400">{rule.active_time_start || "--:--"} - {rule.active_time_end || "--:--"}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between gap-3 rounded-lg bg-white/5 border border-white/5 px-3 py-1.5">
                                                        <span className="text-main/40">{labels.pushChannel}</span>
                                                        <span className="text-cyan-400 font-bold">{channel}</span>
                                                    </div>
                                                </div>
                                                <div className="mt-auto flex justify-end gap-2 border-t border-white/5 pt-3">
                                                    <button onClick={() => openStatus(task)} className="action-btn !text-emerald-400 hover:bg-emerald-500/10" title={labels.viewStatus}>
                                                        <Eye weight="bold" size={18} />
                                                    </button>
                                                    <button onClick={() => openEdit(task)} className="action-btn" title={t("edit")}>
                                                        <PencilSimple weight="bold" size={18} />
                                                    </button>
                                                    <button onClick={() => removeMonitor(task)} className="action-btn !text-rose-400 hover:bg-rose-500/10" title={t("delete")}>
                                                        <Trash weight="bold" size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        ))}
                    </div>
                )}
            </main>

            {showEditor && (
                <div className="modal-overlay active">
                    <div className="glass-panel modal-content !w-[min(96vw,1120px)] !max-w-[1120px] !h-[min(92vh,900px)] !p-0 overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/2">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                                    <Eye weight="bold" size={18} />
                                </div>
                                <div>
                                    <div className="font-bold">{editing ? labels.edit : labels.add}</div>
                                    <div className="text-[10px] text-main/40">{labels.subtitle}</div>
                                </div>
                            </div>
                            <button onClick={() => setShowEditor(false)} className="action-btn !w-8 !h-8">
                                <X weight="bold" />
                            </button>
                        </div>

                        <div className="p-5 grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-5 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                            <section className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[11px] uppercase tracking-wider">{labels.monitorName}</label>
                                        <input className="!mb-0" value={form.name} disabled={Boolean(editing)} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="monitor_gifts" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] uppercase tracking-wider">{labels.group}</label>
                                        <input className="!mb-0" value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })} placeholder="monitors" />
                                    </div>
                                </div>

                                <div className="rounded-xl border border-white/5 bg-white/5 p-3 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-[10px] uppercase tracking-wider text-main/40">{labels.account}</div>
                                        <div className="text-sm font-bold truncate">{form.account_name || "-"}</div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setForm({ ...form, enabled: !form.enabled })}
                                        className={`h-9 px-4 rounded-lg text-xs font-bold border shrink-0 ${form.enabled ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-white/5 text-main/35 border-white/10"}`}
                                    >
                                        {form.enabled ? labels.enabled : t("status_paused")}
                                    </button>
                                </div>

                                <div className="rounded-xl border border-white/5 bg-white/5 p-4 space-y-3">
                                    <div className="flex items-center gap-2 font-bold text-sm">
                                        <ChatCircleText weight="fill" className="text-cyan-400" />
                                        {labels.source}
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] uppercase tracking-wider">{extraLabels.scope}</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {([
                                                ["selected", extraLabels.selectedScope],
                                                ["private", extraLabels.privateScope],
                                            ] as const).map(([scope, label]) => (
                                                <button key={scope} type="button" onClick={() => updateRule({ monitor_scope: scope })} className={`h-9 rounded-lg border text-xs font-bold ${currentRule.monitor_scope === scope ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-400" : "border-white/5 bg-black/5 text-main/50"}`}>
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                        {currentRule.monitor_scope !== "selected" && (
                                            <div className="rounded-lg border border-cyan-400/10 bg-cyan-400/5 p-3 text-xs text-main/50 leading-5">
                                                {extraLabels.privateHint}
                                            </div>
                                        )}
                                    </div>
                                    {currentRule.monitor_scope === "selected" && <input className="!mb-0" placeholder={labels.chatSearch} value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} />}
                                    {currentRule.monitor_scope === "selected" && <div className="max-h-48 overflow-y-auto rounded-lg border border-white/5 bg-black/5 custom-scrollbar">
                                        {chatSearchLoading ? (
                                            <div className="px-3 py-3 text-xs text-main/40"><Spinner className="animate-spin inline mr-2" />{t("loading")}</div>
                                        ) : visibleChats.length > 0 ? (
                                            visibleChats.map((chat) => {
                                                const selected = currentRule.selectedChats.some((item) => String(item.chat_id) === String(chat.id));
                                                return (
                                                    <button key={chat.id} type="button" className={`w-full px-3 py-2 text-left hover:bg-white/5 border-b border-white/5 last:border-b-0 flex items-center gap-3 ${selected ? "bg-cyan-400/10" : ""}`} onClick={() => selectChat(chat)}>
                                                        <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selected ? "bg-cyan-400 border-cyan-400 text-white" : "border-main/25"}`}>
                                                            {selected && <Check weight="bold" size={12} />}
                                                        </span>
                                                        <span className="min-w-0">
                                                            <span className="block text-sm font-semibold truncate">{getChatTitle(chat)}</span>
                                                            <span className="block text-[10px] text-main/40 font-mono truncate">{chat.id}{chat.username ? ` · @${chat.username}` : ""}</span>
                                                        </span>
                                                    </button>
                                                );
                                            })
                                        ) : (
                                            <div className="px-3 py-3 text-xs text-main/35">{labels.selectChat}</div>
                                        )}
                                    </div>}
                                    {currentRule.monitor_scope === "selected" && currentRule.selectedChats.length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {currentRule.selectedChats.map((chat) => (
                                                <button
                                                    key={String(chat.chat_id)}
                                                    type="button"
                                                    onClick={() => {
                                                        const selectedChats = currentRule.selectedChats.filter((item) => String(item.chat_id) !== String(chat.chat_id));
                                                        updateRule({
                                                            selectedChats,
                                                            chat_id: selectedChats[0]?.chat_id || "",
                                                            chat_name: selectedChats[0]?.chat_name || "",
                                                        });
                                                    }}
                                                    className="px-2 py-1 rounded-md bg-cyan-400/10 text-cyan-500 text-[10px] font-bold max-w-full truncate"
                                                >
                                                    {chat.chat_name} ×
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {currentRule.monitor_scope === "selected" && <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] uppercase tracking-wider">{labels.manualChat}</label>
                                            <input className="!mb-0" value={String(currentRule.chat_id || "")} onChange={(e) => setManualChat(e.target.value)} placeholder="-1001234567890 / @channel" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase tracking-wider">{labels.topic}</label>
                                            <textarea className="!mb-0 min-h-[76px] custom-scrollbar" value={currentRule.topicIdsText || ""} onChange={(e) => updateRule({ topicIdsText: e.target.value })} placeholder={extraLabels.topicPlaceholder} />
                                        </div>
                                    </div>}
                                    <div className="rounded-lg border border-white/5 bg-black/5 p-3 space-y-3">
                                        <label className="inline-flex items-start gap-2 text-xs cursor-pointer">
                                            <input type="checkbox" checked={Boolean(currentRule.time_window_enabled)} onChange={(e) => updateRule({ time_window_enabled: e.target.checked })} className="accent-cyan-400 mt-0.5" />
                                            <span>
                                                <span className="block font-bold">{extraLabels.timeWindow}</span>
                                                <span className="block text-[10px] text-main/35 mt-0.5">{extraLabels.timeWindowHint}</span>
                                            </span>
                                        </label>
                                        {currentRule.time_window_enabled && (
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-[10px] uppercase tracking-wider">{extraLabels.startTime}</label>
                                                    <input className="!mb-0" type="time" value={currentRule.active_time_start || ""} onChange={(e) => updateRule({ active_time_start: e.target.value })} />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] uppercase tracking-wider">{extraLabels.endTime}</label>
                                                    <input className="!mb-0" type="time" value={currentRule.active_time_end || ""} onChange={(e) => updateRule({ active_time_end: e.target.value })} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </section>

                            <section className="space-y-4">
                                <div className="rounded-xl border border-white/5 bg-white/5 p-4 space-y-3">
                                    <div className="flex items-center gap-2 font-bold text-sm">
                                        <Lightning weight="fill" className="text-[#b57dff]" />
                                        {labels.matchMode}
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(["contains", "exact", "regex"] as const).map((mode) => (
                                            <button key={mode} type="button" onClick={() => updateRule({ match_mode: mode })} className={`h-9 rounded-lg border text-xs font-bold ${currentRule.match_mode === mode ? "border-[#8a3ffc]/50 bg-[#8a3ffc]/15 text-[#b57dff]" : "border-white/5 bg-black/5 text-main/50"}`}>
                                                {mode}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="rounded-lg border border-[#8a3ffc]/10 bg-[#8a3ffc]/5 px-3 py-2 text-[11px] text-main/50 leading-5">
                                        {matchModeHelp[currentRule.match_mode]}
                                    </div>
                                    <textarea className="!mb-0 min-h-[120px] custom-scrollbar" value={currentRule.keywordsText} onChange={(e) => updateRule({ keywordsText: e.target.value })} placeholder={labels.keywords} />
                                    <div className="text-[10px] text-main/35">{labels.keywordsHint}</div>
                                    <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                                        <input type="checkbox" checked={currentRule.ignore_case} onChange={(e) => updateRule({ ignore_case: e.target.checked })} className="accent-[#8a3ffc]" />
                                        {labels.ignoreCase}
                                    </label>
                                    <label className="inline-flex items-start gap-2 text-xs cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(currentRule.include_self_messages)}
                                            onChange={(e) => updateRule({ include_self_messages: e.target.checked })}
                                            className="accent-[#8a3ffc] mt-0.5"
                                        />
                                        <span>
                                            <span className="block">{labels.includeSelf}</span>
                                            <span className="block text-[10px] text-main/35 mt-0.5">{labels.includeSelfHint}</span>
                                        </span>
                                    </label>
                                </div>

                                <div className="rounded-xl border border-white/5 bg-white/5 p-4 space-y-3">
                                    <div className="flex items-center gap-2 font-bold text-sm">
                                        <PaperPlaneTilt weight="fill" className="text-emerald-400" />
                                        {labels.handling}
                                    </div>
                                    <select className="!mb-0" value={currentRule.push_channel} onChange={(e) => updateRule({ push_channel: e.target.value as MonitorRule["push_channel"] })}>
                                        <option value="telegram">{labels.telegramNotify}</option>
                                        <option value="forward">{labels.forward}</option>
                                        <option value="continue">{labels.reply}</option>
                                        <option value="bark">{labels.bark}</option>
                                        <option value="custom">{labels.custom}</option>
                                    </select>

                                    {currentRule.push_channel === "forward" && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[10px] uppercase tracking-wider">{labels.forwardChat}</label>
                                                <input className="!mb-0" value={String(currentRule.forward_chat_id || "")} onChange={(e) => updateRule({ forward_chat_id: e.target.value })} placeholder="-1009876543210 / @target" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] uppercase tracking-wider">{labels.forwardTopic}</label>
                                                <input className="!mb-0" inputMode="numeric" value={currentRule.forward_message_thread_id || ""} onChange={(e) => updateRule({ forward_message_thread_id: parseOptionalInt(e.target.value) })} />
                                            </div>
                                        </div>
                                    )}

                                    {currentRule.push_channel === "continue" && (
                                        <div>
                                            <label className="text-[10px] uppercase tracking-wider flex items-center gap-1"><Robot weight="bold" />{labels.autoReply}</label>
                                            <textarea className="!mb-0 min-h-[96px] custom-scrollbar" value={currentRule.auto_reply_text || ""} onChange={(e) => updateRule({ auto_reply_text: e.target.value })} placeholder="{keyword}" />
                                        </div>
                                    )}

                                    {currentRule.push_channel === "bark" && (
                                        <div>
                                            <label className="text-[10px] uppercase tracking-wider">{labels.barkUrl}</label>
                                            <input className="!mb-0" value={currentRule.bark_url || ""} onChange={(e) => updateRule({ bark_url: e.target.value })} placeholder="https://api.day.app/key" />
                                        </div>
                                    )}

                                    {currentRule.push_channel === "custom" && (
                                        <div>
                                            <label className="text-[10px] uppercase tracking-wider">{labels.customUrl}</label>
                                            <input className="!mb-0" value={currentRule.custom_url || ""} onChange={(e) => updateRule({ custom_url: e.target.value })} placeholder="https://example.com/tg" />
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>

                        <div className="p-5 border-t border-white/5 bg-black/10 flex gap-3 shrink-0">
                            <button onClick={() => setShowEditor(false)} className="btn-secondary flex-1">{t("cancel")}</button>
                            <button onClick={saveMonitor} disabled={loading} className="btn-gradient flex-1">
                                {loading ? <Spinner className="animate-spin" /> : <Check weight="bold" />}
                                {labels.save}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {statusTask && (
                <div className="modal-overlay active">
                    <div className="glass-panel modal-content !max-w-3xl !p-0 overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/2">
                            <div>
                                <div className="text-lg font-bold">{labels.status}</div>
                                <div className="text-xs text-main/40 font-mono">{statusTask.account_name} / {statusTask.name}</div>
                            </div>
                            <button onClick={() => setStatusTask(null)} className="action-btn">
                                <X weight="bold" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto custom-scrollbar">
                            {statusLoading ? (
                                <div className="py-12 flex justify-center text-main/35">
                                    <Spinner className="animate-spin" size={28} />
                                </div>
                            ) : statusInfo ? (
                                <>
                                    <div className={`rounded-xl border px-4 py-3 ${statusInfo.active ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>
                                        <div className="text-sm font-bold">{statusInfo.message || labels.statusEmpty}</div>
                                        {statusInfo.time && <div className="text-[10px] opacity-70 mt-1">{statusInfo.time}</div>}
                                    </div>
                                    <div className="rounded-xl border border-white/5 bg-black/20 p-4 font-mono text-xs leading-6 text-main/70 whitespace-pre-wrap">
                                        {statusLogs.length > 0 ? statusLogs.join("\n") : labels.statusEmpty}
                                    </div>
                                </>
                            ) : (
                                <div className="py-12 text-center text-main/35">{labels.statusEmpty}</div>
                            )}
                        </div>
                        <div className="p-5 border-t border-white/5 bg-black/10 flex gap-3">
                            <button onClick={() => openStatus(statusTask)} disabled={statusLoading} className="btn-gradient flex-1">
                                {statusLoading ? <Spinner className="animate-spin" /> : <ArrowClockwise weight="bold" />}
                                {t("refresh_list")}
                            </button>
                            <button onClick={() => setStatusTask(null)} className="btn-secondary flex-1">{t("close")}</button>
                        </div>
                    </div>
                </div>
            )}

            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </div>
    );
}
