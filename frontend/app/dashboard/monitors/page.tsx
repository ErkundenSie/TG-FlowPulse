"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
    MonitorTask,
    createMonitorTask,
    deleteMonitorTask,
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
    keywords: [],
    match_mode: "contains",
    ignore_case: true,
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

const normalizeChatIdInput = (value: string) => {
    const text = value.trim();
    if (!text) return "";
    if (text.startsWith("@")) return text;
    const parsed = Number.parseInt(text, 10);
    return Number.isNaN(parsed) ? text : parsed;
};

type RuleDraft = MonitorRule & { keywordsText: string };

const toDraftRule = (rule?: MonitorRule): RuleDraft => ({
    ...emptyRule(),
    ...(rule || {}),
    keywordsText: (rule?.keywords || []).join("\n"),
});

export default function MonitorTasksPage() {
    const { t, language } = useLanguage();
    const isZh = language === "zh";
    const { toasts, addToast, removeToast } = useToast();
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [accounts, setAccounts] = useState<AccountInfo[]>([]);
    const [tasks, setTasks] = useState<MonitorTask[]>([]);
    const [availableChats, setAvailableChats] = useState<ChatInfo[]>([]);
    const [chatSearch, setChatSearch] = useState("");
    const [chatSearchResults, setChatSearchResults] = useState<ChatInfo[]>([]);
    const [chatSearchLoading, setChatSearchLoading] = useState(false);
    const [editing, setEditing] = useState<MonitorTask | null>(null);
    const [showEditor, setShowEditor] = useState(false);
    const [form, setForm] = useState({
        name: "",
        account_name: "",
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
        monitorName: isZh ? "监控名称" : "Monitor Name",
        chatSearch: isZh ? "搜索最近会话" : "Search recent chats",
        manualChat: isZh ? "手动 Chat ID / @username" : "Manual Chat ID / @username",
        topic: isZh ? "话题 / Thread ID" : "Topic / Thread ID",
        keywords: isZh ? "关键词 / 正则" : "Keywords / Regex",
        keywordsHint: isZh ? "普通匹配可用逗号或换行分隔；正则模式每行一个表达式。" : "Contains/exact can use commas or new lines; regex mode uses one pattern per line.",
        matchMode: isZh ? "匹配方式" : "Match Mode",
        ignoreCase: isZh ? "忽略大小写" : "Ignore Case",
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
    }), [isZh]);

    const formatError = useCallback((fallback: string, err: any) => {
        return err?.message ? `${fallback}: ${err.message}` : fallback;
    }, []);

    const loadData = useCallback(async (tokenStr: string) => {
        setLoading(true);
        try {
            const [monitorData, accountData] = await Promise.all([
                listMonitorTasks(tokenStr),
                listAccounts(tokenStr),
            ]);
            setTasks(monitorData);
            setAccounts(accountData.accounts);
            if (!form.account_name && accountData.accounts[0]?.name) {
                setForm((prev) => ({ ...prev, account_name: accountData.accounts[0].name }));
            }
        } catch (err: any) {
            addToast(formatError(t("load_failed"), err), "error");
        } finally {
            setLoading(false);
        }
    }, [addToast, form.account_name, formatError, t]);

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
            account_name: accounts[0]?.name || "",
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
            enabled: task.enabled,
            rule: toDraftRule(task.rules[0]),
        });
        setShowEditor(true);
    };

    const updateRule = (patch: Partial<RuleDraft>) => {
        setForm((prev) => ({ ...prev, rule: { ...prev.rule, ...patch } }));
    };

    const selectChat = (chat: ChatInfo) => {
        updateRule({
            chat_id: chat.id,
            chat_name: getChatTitle(chat),
        });
    };

    const saveMonitor = async () => {
        if (!token) return;
        const name = form.name.trim();
        const accountName = form.account_name.trim();
        const rule: MonitorRule = {
            ...form.rule,
            chat_id: normalizeChatIdInput(String(form.rule.chat_id || "")),
            chat_name: form.rule.chat_name || String(form.rule.chat_id || ""),
            message_thread_id: parseOptionalInt(String(form.rule.message_thread_id || "")),
            keywords: splitKeywords(form.rule.keywordsText, form.rule.match_mode),
            forward_chat_id: normalizeChatIdInput(String(form.rule.forward_chat_id || "")) || null,
            forward_message_thread_id: parseOptionalInt(String(form.rule.forward_message_thread_id || "")),
            bark_url: String(form.rule.bark_url || "").trim() || null,
            custom_url: String(form.rule.custom_url || "").trim() || null,
            auto_reply_text: String(form.rule.auto_reply_text || "").trim() || null,
        continue_actions: form.rule.push_channel === "continue" && String(form.rule.auto_reply_text || "").trim()
            ? [{ action: 1, text: String(form.rule.auto_reply_text || "").trim() }]
            : [],
        };
        if (!name || !accountName || !rule.chat_id || rule.keywords.length === 0) {
            addToast(isZh ? "请填写名称、账号、监听来源和关键词" : "Name, account, source chat, and keywords are required", "error");
            return;
        }
        if (rule.push_channel === "forward" && !rule.forward_chat_id) {
            addToast(isZh ? "请填写转发目标 Chat ID" : "Forward target Chat ID is required", "error");
            return;
        }
        if (rule.push_channel === "continue" && !rule.auto_reply_text) {
            addToast(isZh ? "请填写自动回复文本" : "Auto reply text is required", "error");
            return;
        }
        try {
            setLoading(true);
            if (editing) {
                await updateMonitorTask(token, editing.name, {
                    account_name: accountName,
                    enabled: form.enabled,
                    group: "monitors",
                    rules: [rule],
                }, editing.account_name);
            } else {
                await createMonitorTask(token, {
                    name,
                    account_name: accountName,
                    group: "monitors",
                    enabled: form.enabled,
                    rules: [rule],
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

    const visibleChats = chatSearch.trim() ? chatSearchResults : availableChats.slice(0, 80);
    const currentRule = form.rule;

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
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                        {tasks.map((task) => {
                            const rule = task.rules[0];
                            const channel = rule?.push_channel || "telegram";
                            return (
                                <div key={`${task.account_name}-${task.name}`} className="glass-panel p-5 flex flex-col gap-4">
                                    <div className="flex justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${task.enabled ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-white/5 text-main/30 border-white/10"}`}>
                                                    {task.enabled ? t("status_active") : t("status_paused")}
                                                </span>
                                                <span className="text-[10px] text-main/35 font-mono truncate">{task.account_name}</span>
                                            </div>
                                            <h3 className="font-bold text-lg truncate">{task.name}</h3>
                                        </div>
                                        <div className="w-11 h-11 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
                                            <ChatCircleText weight="fill" size={22} />
                                        </div>
                                    </div>
                                    <div className="space-y-2 text-xs">
                                        <div className="flex justify-between gap-3 rounded-lg bg-white/5 border border-white/5 px-3 py-2">
                                            <span className="text-main/40">{labels.source}</span>
                                            <span className="font-mono text-main/75 truncate">{rule?.chat_name || rule?.chat_id}</span>
                                        </div>
                                        <div className="flex justify-between gap-3 rounded-lg bg-white/5 border border-white/5 px-3 py-2">
                                            <span className="text-main/40">{labels.matchMode}</span>
                                            <span className="text-[#b57dff] font-bold">{rule?.match_mode}</span>
                                        </div>
                                        <div className="flex justify-between gap-3 rounded-lg bg-white/5 border border-white/5 px-3 py-2">
                                            <span className="text-main/40">{labels.pushChannel}</span>
                                            <span className="text-cyan-400 font-bold">{channel}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2 min-h-8">
                                        {(rule?.keywords || []).slice(0, 5).map((keyword) => (
                                            <span key={keyword} className="px-2 py-1 rounded-md bg-[#8a3ffc]/10 text-[#b57dff] text-[10px] font-bold max-w-full truncate">
                                                {keyword}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="mt-auto flex justify-end gap-2 border-t border-white/5 pt-4">
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
                )}
            </main>

            {showEditor && (
                <div className="modal-overlay active">
                    <div className="glass-panel modal-content !max-w-5xl !p-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
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

                        <div className="p-5 grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-5 max-h-[75vh] overflow-y-auto custom-scrollbar">
                            <section className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[11px] uppercase tracking-wider">{labels.monitorName}</label>
                                        <input className="!mb-0" value={form.name} disabled={Boolean(editing)} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="monitor_gifts" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] uppercase tracking-wider">{labels.account}</label>
                                        <select className="!mb-0" value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })}>
                                            {accounts.map((account) => (
                                                <option key={account.name} value={account.name}>{account.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-white/5 bg-white/5 p-4">
                                    <label className="text-[11px] uppercase tracking-wider">{labels.enabled}</label>
                                    <button
                                        type="button"
                                        onClick={() => setForm({ ...form, enabled: !form.enabled })}
                                        className={`h-9 px-4 rounded-lg text-xs font-bold border ${form.enabled ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-white/5 text-main/35 border-white/10"}`}
                                    >
                                        {form.enabled ? t("status_active") : t("status_paused")}
                                    </button>
                                </div>

                                <div className="rounded-xl border border-white/5 bg-white/5 p-4 space-y-3">
                                    <div className="flex items-center gap-2 font-bold text-sm">
                                        <ChatCircleText weight="fill" className="text-cyan-400" />
                                        {labels.source}
                                    </div>
                                    <input className="!mb-0" placeholder={labels.chatSearch} value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} />
                                    <div className="max-h-48 overflow-y-auto rounded-lg border border-white/5 bg-black/5 custom-scrollbar">
                                        {chatSearchLoading ? (
                                            <div className="px-3 py-3 text-xs text-main/40"><Spinner className="animate-spin inline mr-2" />{t("loading")}</div>
                                        ) : visibleChats.length > 0 ? (
                                            visibleChats.map((chat) => (
                                                <button key={chat.id} type="button" className="w-full px-3 py-2 text-left hover:bg-white/5 border-b border-white/5 last:border-b-0" onClick={() => selectChat(chat)}>
                                                    <div className="text-sm font-semibold truncate">{getChatTitle(chat)}</div>
                                                    <div className="text-[10px] text-main/40 font-mono truncate">{chat.id}{chat.username ? ` · @${chat.username}` : ""}</div>
                                                </button>
                                            ))
                                        ) : (
                                            <div className="px-3 py-3 text-xs text-main/35">{labels.selectChat}</div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] uppercase tracking-wider">{labels.manualChat}</label>
                                            <input className="!mb-0" value={String(currentRule.chat_id || "")} onChange={(e) => updateRule({ chat_id: e.target.value, chat_name: e.target.value })} placeholder="-1001234567890 / @channel" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase tracking-wider">{labels.topic}</label>
                                            <input className="!mb-0" inputMode="numeric" value={currentRule.message_thread_id || ""} onChange={(e) => updateRule({ message_thread_id: parseOptionalInt(e.target.value) })} placeholder="1" />
                                        </div>
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
                                    <textarea className="!mb-0 min-h-[120px] custom-scrollbar" value={currentRule.keywordsText} onChange={(e) => updateRule({ keywordsText: e.target.value })} placeholder={labels.keywords} />
                                    <div className="text-[10px] text-main/35">{labels.keywordsHint}</div>
                                    <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                                        <input type="checkbox" checked={currentRule.ignore_case} onChange={(e) => updateRule({ ignore_case: e.target.checked })} className="accent-[#8a3ffc]" />
                                        {labels.ignoreCase}
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

                        <div className="p-5 border-t border-white/5 bg-black/10 flex gap-3">
                            <button onClick={() => setShowEditor(false)} className="btn-secondary flex-1">{t("cancel")}</button>
                            <button onClick={saveMonitor} disabled={loading} className="btn-gradient flex-1">
                                {loading ? <Spinner className="animate-spin" /> : <Check weight="bold" />}
                                {labels.save}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </div>
    );
}
