"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "../../../../lib/auth";
import {
    createSignTask,
    listAccounts,
    getAccountChats,
    searchAccountChats,
    AccountInfo,
    ChatInfo,
    SignTaskChat,
} from "../../../../lib/api";
import {
    CaretLeft,
    Plus,
    X,
    ChatCircleText,
    Trash,
    Spinner,
    Lightning,
    Check,
    FastForward,
    Image as ImageIcon
} from "@phosphor-icons/react";
import { ThemeLanguageToggle } from "../../../../components/ThemeLanguageToggle";
import { useLanguage } from "../../../../context/LanguageContext";
import { ToastContainer, useToast } from "../../../../components/ui/toast";

type CreateTargetMode = "single_task" | "batch_tasks";
type ActionTypeOption = "1" | "9" | "10";

const getChatTitle = (chat: ChatInfo) => chat.title || chat.username || chat.first_name || String(chat.id);

const parseMessageIdsInput = (value: string) => {
    return value
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0);
};

export default function CreateSignTaskPage() {
    const router = useRouter();
    const { t } = useLanguage();
    const { toasts, addToast, removeToast } = useToast();
    const [token, setLocalToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // 表单数据
    const [taskName, setTaskName] = useState("");
    const [executionMode, setExecutionMode] = useState<"fixed" | "range">("range");
    const [signAt, setSignAt] = useState("0 6 * * *");
    const [rangeStart, setRangeStart] = useState("09:00");
    const [rangeEnd, setRangeEnd] = useState("18:00");
    const [randomSeconds, setRandomSeconds] = useState(0);
    const [signInterval, setSignInterval] = useState(1);
    const [chats, setChats] = useState<SignTaskChat[]>([]);
    const [createTargetMode, setCreateTargetMode] = useState<CreateTargetMode>("single_task");

    // 账号和 Chat 数据
    const [accounts, setAccounts] = useState<AccountInfo[]>([]);
    const [selectedAccount, setSelectedAccount] = useState("");
    const [availableChats, setAvailableChats] = useState<ChatInfo[]>([]);
    const [chatSearch, setChatSearch] = useState("");
    const [chatSearchResults, setChatSearchResults] = useState<ChatInfo[]>([]);
    const [chatSearchLoading, setChatSearchLoading] = useState(false);
    const [selectedDialogChats, setSelectedDialogChats] = useState<ChatInfo[]>([]);

    const formatErrorMessage = useCallback((key: string, err?: any) => {
        const base = t(key);
        const code = err?.code;
        return code ? `${base} (${code})` : base;
    }, [t]);
    const handleAccountSessionInvalid = useCallback((err: any) => {
        if (err?.code !== "ACCOUNT_SESSION_INVALID") return false;
        addToast(t("account_session_invalid"), "error");
        setTimeout(() => {
            router.replace("/dashboard");
        }, 800);
        return true;
    }, [addToast, router, t]);

    // 当前编辑的 Chat
    const [editingChat, setEditingChat] = useState<{
        chat_id: number;
        name: string;
        actions: any[];
        delete_after?: number;
        action_interval: number;
        message_thread_id?: number;
    } | null>(null);

    const loadChats = useCallback(async (tokenStr: string, accountName: string) => {
        try {
            const chatsData = await getAccountChats(tokenStr, accountName);
            setAvailableChats(chatsData);
        } catch (err: any) {
            if (handleAccountSessionInvalid(err)) return;
            console.error("加载 Chat 失败:", err);
        }
    }, [handleAccountSessionInvalid]);

    const loadAccounts = useCallback(async (tokenStr: string) => {
        try {
            const data = await listAccounts(tokenStr);
            setAccounts(data.accounts);
            if (data.accounts.length > 0) {
                setSelectedAccount(data.accounts[0].name);
                loadChats(tokenStr, data.accounts[0].name);
            }
        } catch (err: any) {
            addToast(formatErrorMessage("load_failed", err), "error");
        }
    }, [addToast, loadChats, formatErrorMessage]);

    useEffect(() => {
        const tokenStr = getToken();
        if (!tokenStr) {
            router.replace("/");
            return;
        }
        setLocalToken(tokenStr);
        loadAccounts(tokenStr);
    }, [router, loadAccounts]);

    const handleAccountChange = (accountName: string) => {
        setSelectedAccount(accountName);
        setChats([]);
        setSelectedDialogChats([]);
        if (token) {
            loadChats(token, accountName);
        }
    };

    useEffect(() => {
        if (!token || !selectedAccount) return;
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
                const res = await searchAccountChats(token, selectedAccount, query, 50, 0);
                if (!cancelled) {
                    setChatSearchResults(res.items || []);
                }
            } catch (err: any) {
                if (!cancelled) {
                    if (handleAccountSessionInvalid(err)) return;
                    addToast(formatErrorMessage("search_failed", err), "error");
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
    }, [chatSearch, token, selectedAccount, addToast, t, formatErrorMessage, handleAccountSessionInvalid]);

    useEffect(() => {
        if (!editingChat) {
            setChatSearch("");
            setChatSearchResults([]);
            setChatSearchLoading(false);
            setSelectedDialogChats([]);
        }
    }, [editingChat, selectedAccount]);

    const sanitizeTaskName = useCallback((raw: string) => {
        return raw
            .trim()
            .replace(/[<>:"/\\|?*]+/g, "_")
            .replace(/\s+/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 64);
    }, []);

    const batchCreateSummary = useCallback((success: number, failed: number) => {
        return `${t("batch_create_done")}: ${success} ${t("success")}, ${failed} ${t("failure")}`;
    }, [t]);

    const buildBatchTaskName = useCallback((baseName: string, chat: SignTaskChat) => {
        const cleanBase = sanitizeTaskName(baseName);
        const cleanChatName = sanitizeTaskName(chat.name) || sanitizeTaskName(`chat_${chat.chat_id}`) || `chat_${chat.chat_id}`;
        return cleanBase ? sanitizeTaskName(`${cleanBase}_${cleanChatName}`) || cleanChatName : cleanChatName;
    }, [sanitizeTaskName]);

    const toggleSelectedDialogChat = useCallback((chat: ChatInfo) => {
        setSelectedDialogChats((prev) => {
            const exists = prev.some((item) => item.id === chat.id);
            if (exists) {
                return prev.filter((item) => item.id !== chat.id);
            }
            return [...prev, chat];
        });
        setEditingChat((prev) => prev ? { ...prev, chat_id: 0, name: "" } : prev);
    }, []);

    const buildDialogChat = useCallback((chat: ChatInfo, source: NonNullable<typeof editingChat>): SignTaskChat => ({
        chat_id: chat.id,
        name: getChatTitle(chat),
        message_thread_id: source.message_thread_id,
        actions: source.actions,
        action_interval: source.action_interval,
        delete_after: source.delete_after,
    }), []);

    const handleAddChat = () => {
        setEditingChat({
            chat_id: 0,
            name: "",
            message_thread_id: undefined,
            actions: [],
            action_interval: 1,
        });
    };

    const handleSaveChat = () => {
        if (!editingChat) return;
        const hasManualSelection = editingChat.chat_id !== 0;
        if (!hasManualSelection && selectedDialogChats.length === 0) {
            addToast(t("select_chat_error"), "error");
            return;
        }
        const isActionValid = (action: any) => {
            const actionId = Number(action?.action);
            if (actionId === 1) return Boolean((action?.text || "").trim());
            if (actionId === 9) return Boolean((action?.photo || "").trim());
            if (actionId === 10) {
                const messageIds = Array.isArray(action?.message_ids) ? action.message_ids : [];
                return Boolean((action?.from_chat_id || "").trim()) && messageIds.length > 0;
            }
            return false;
        };
        if (editingChat.actions.length === 0 || editingChat.actions.some((action) => !isActionValid(action))) {
            addToast(t("add_action_error"), "error");
            return;
        }
        const nextChats = hasManualSelection
            ? [editingChat]
            : selectedDialogChats.map((chat) => buildDialogChat(chat, editingChat));
        setChats([...chats, ...nextChats]);
        setEditingChat(null);
    };

    const handleSubmit = async () => {
        if (!token) return;
        if (!taskName && createTargetMode === "single_task") {
            addToast(t("task_name_required"), "error");
            return;
        }
        if (executionMode === "fixed" && !signAt) {
            addToast(t("cron_required"), "error");
            return;
        }
        if (executionMode === "range" && (!rangeStart || !rangeEnd)) {
            addToast(t("range_required"), "error");
            return;
        }
        if (chats.length === 0) {
            addToast(t("chat_required"), "error");
            return;
        }

        try {
            setLoading(true);
            if (createTargetMode === "batch_tasks") {
                let successCount = 0;
                let failureCount = 0;
                for (const chat of chats) {
                    try {
                        await createSignTask(token, {
                            name: buildBatchTaskName(taskName, chat),
                            account_name: selectedAccount,
                            sign_at: executionMode === "fixed" ? signAt : "0 0 * * *",
                            chats: [chat],
                            random_seconds: randomSeconds,
                            sign_interval: signInterval,
                            execution_mode: executionMode,
                            range_start: rangeStart,
                            range_end: rangeEnd,
                        });
                        successCount += 1;
                    } catch {
                        failureCount += 1;
                    }
                }
                addToast(batchCreateSummary(successCount, failureCount), failureCount > 0 ? "error" : "success");
                setTimeout(() => router.push("/dashboard/sign-tasks"), 1500);
                return;
            }
            await createSignTask(token, {
                name: taskName,
                account_name: selectedAccount,
                sign_at: executionMode === "fixed" ? signAt : "0 0 * * *", // 占位，后端会处理
                chats: chats,
                random_seconds: randomSeconds,
                sign_interval: signInterval,
                execution_mode: executionMode,
                range_start: rangeStart,
                range_end: rangeEnd,
            });
            addToast(t("create_success"), "success");
            setTimeout(() => router.push("/dashboard/sign-tasks"), 1500);
        } catch (err: any) {
            addToast(formatErrorMessage("create_failed", err), "error");
        } finally {
            setLoading(false);
        }
    };

    if (!token) return null;

    return (
        <div id="create-task-view" className="w-full h-full flex flex-col pt-[72px]">
            <nav className="navbar fixed top-0 left-0 right-0 z-50 h-[72px] px-5 md:px-10 flex justify-between items-center glass-panel rounded-none border-x-0 border-t-0 bg-white/2 dark:bg-black/5">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/sign-tasks" className="action-btn" title={t("cancel")}>
                        <CaretLeft weight="bold" />
                    </Link>
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <span className="text-main/40 uppercase tracking-widest text-[10px]">{t("sidebar_tasks")}</span>
                        <span className="text-main/20">/</span>
                        <span className="text-main uppercase tracking-widest text-[10px]">{t("add_task")}</span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <ThemeLanguageToggle />
                </div>
            </nav>

            <main className="flex-1 p-5 md:p-10 w-full max-w-[900px] mx-auto overflow-y-auto animate-float-up pb-20">
                <header className="mb-10">
                    <h1 className="text-3xl font-bold tracking-tight mb-2">{t("add_task")}</h1>
                    <p className="text-[#9496a1] text-sm">{t("define_global_rules")}</p>
                </header>

                <div className="grid gap-8">
                    {/* 基本配置 */}
                    <section className="glass-panel p-6 space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-[#8a3ffc]/10 rounded-lg text-[#b57dff]">
                                <Lightning weight="fill" size={18} />
                            </div>
                            <h2 className="text-lg font-bold">{t("basic_config")}</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-main/40 uppercase tracking-wider">{t("task_name")}</label>
                                <input
                                    className="!mb-0"
                                    value={taskName}
                                    onChange={(e) => setTaskName(e.target.value)}
                                    placeholder={t("task_name_placeholder")}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-main/40 uppercase tracking-wider">{t("associated_account")}</label>
                                <select
                                    className="!mb-0"
                                    value={selectedAccount}
                                    onChange={(e) => handleAccountChange(e.target.value)}
                                >
                                    {accounts.map(acc => <option key={acc.name} value={acc.name}>{acc.name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <label className="text-xs font-bold text-main/40 uppercase tracking-wider">{t("create_target_mode")}</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        className={`h-10 rounded-lg border text-xs font-bold transition-colors ${createTargetMode === "single_task" ? "border-[#8a3ffc]/50 bg-[#8a3ffc]/15 text-[#b57dff]" : "border-white/5 bg-black/5 text-main/50 hover:text-main/80"}`}
                                        onClick={() => setCreateTargetMode("single_task")}
                                    >
                                        {t("create_mode_single_task")}
                                    </button>
                                    <button
                                        type="button"
                                        className={`h-10 rounded-lg border text-xs font-bold transition-colors ${createTargetMode === "batch_tasks" ? "border-[#8a3ffc]/50 bg-[#8a3ffc]/15 text-[#b57dff]" : "border-white/5 bg-black/5 text-main/50 hover:text-main/80"}`}
                                        onClick={() => setCreateTargetMode("batch_tasks")}
                                    >
                                        {t("create_mode_batch_tasks")}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 调度模式 (Only Range Mode Displayed) */}
                        <div className="p-4 glass-panel !bg-black/5 space-y-4 border-white/5">
                            <div className="flex items-center justify-between mb-4">
                                <label className="text-xs font-bold text-main/40 uppercase tracking-wider">
                                    {t("scheduling_mode")}
                                </label>
                                <div className="text-xs font-bold text-[#8a3ffc] bg-[#8a3ffc]/10 px-2 py-1 rounded">
                                    {t("random_range_default")}
                                </div>
                            </div>

                            <p className="text-xs text-[#9496a1] mb-4">
                                {t("random_range_desc")}
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-main/40 uppercase tracking-wider">{t("start_time")}</label>
                                    <input
                                        type="time"
                                        className="!mb-0"
                                        value={rangeStart}
                                        onChange={(e) => setRangeStart(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-main/40 uppercase tracking-wider">{t("end_time")}</label>
                                    <input
                                        type="time"
                                        className="!mb-0"
                                        value={rangeEnd}
                                        onChange={(e) => setRangeEnd(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>


                    </section>

                    {/* Chat 配置 */}
                    <section className="glass-panel p-6 space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-[#8a3ffc]/10 rounded-lg text-[#b57dff]">
                                    <ChatCircleText weight="fill" size={18} />
                                </div>
                                <h2 className="text-lg font-bold">{t("target_chat_config")} ({chats.length})</h2>
                            </div>
                            <button onClick={handleAddChat} className="btn-secondary !h-8 !px-3 font-bold !text-[10px]">
                                + {t("add_chat")}
                            </button>
                        </div>

                        {
                            chats.length === 0 ? (
                                <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-2xl text-main/20">
                                    <p className="text-sm">{t("no_target_chat")}</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {chats.map((chat, idx) => (
                                        <div key={idx} className="glass-panel !bg-black/5 p-4 flex items-center justify-between group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center font-bold text-xs">
                                                    {idx + 1}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-sm">{chat.name}</div>
                                                    <div className="text-[10px] text-main/30 font-mono mt-0.5">
                                                        {t("id_label")}: {chat.chat_id} | <span className="text-[#8a3ffc]/60 font-bold">{chat.actions.length} {t("actions_count")}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setChats(chats.filter((_, i) => i !== idx))}
                                                className="action-btn !text-rose-400 hover:!bg-rose-500/10"
                                            >
                                                <Trash weight="bold" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )
                        }
                    </section>

                    <div className="flex gap-4 pt-4">
                        <button onClick={() => router.back()} className="btn-secondary flex-1">{t("cancel")}</button>
                        <button onClick={handleSubmit} disabled={loading} className="btn-gradient flex-1">
                            {loading ? <Spinner className="animate-spin mx-auto" weight="bold" /> : t("deploy_task")}
                        </button>
                    </div>
                </div>
            </main>

            {/* Editing Dialog */}
            {
                editingChat && (
                    <div className="modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <div className="glass-panel modal-content w-full max-w-lg animate-scale-in flex flex-col overflow-hidden">
                            <header className="p-6 border-b border-white/5 flex justify-between items-center bg-black/5">
                                <h2 className="text-xl font-bold flex items-center gap-3">
                                    <div className="p-2 bg-[#8a3ffc]/10 rounded-lg text-[#b57dff]">
                                        <Plus weight="bold" size={20} />
                                    </div>
                                    {t("configure_target_chat")}
                                </h2>
                                <button onClick={() => setEditingChat(null)} className="action-btn !w-8 !h-8">
                                    <X weight="bold" />
                                </button>
                            </header>

                            <div className="p-6 space-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs uppercase tracking-widest font-bold text-main/40">{t("select_target_chat")}</label>
                                    <div className="space-y-2">
                                        <label className="text-[10px] text-main/40 uppercase tracking-wider">{t("search_chat")}</label>
                                        <input
                                            className="!mb-0"
                                            placeholder={t("search_chat_placeholder")}
                                            value={chatSearch}
                                            onChange={(e) => setChatSearch(e.target.value)}
                                        />
                                    </div>
                                    {chatSearch.trim() ? (
                                        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-white/5 bg-black/5">
                                            {chatSearchLoading ? (
                                                <div className="px-3 py-2 text-xs text-main/40">{t("searching")}</div>
                                            ) : chatSearchResults.length > 0 ? (
                                                <div className="flex flex-col">
                                                    {chatSearchResults.map((chat) => {
                                                        const title = getChatTitle(chat);
                                                        const selected = selectedDialogChats.some((item) => item.id === chat.id);
                                                        return (
                                                            <button
                                                                key={chat.id}
                                                                type="button"
                                                                className="text-left px-3 py-2 hover:bg-white/5 border-b border-white/5 last:border-b-0 flex items-center gap-2"
                                                                onClick={() => {
                                                                    toggleSelectedDialogChat(chat);
                                                                }}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    readOnly
                                                                    checked={selected}
                                                                    className="!mb-0 h-4 w-4 accent-[#8a3ffc] shrink-0"
                                                                />
                                                                <div className="text-sm font-semibold truncate">{title}</div>
                                                                <div className="text-[10px] text-main/40 font-mono truncate">
                                                                    {chat.id}{chat.username ? ` · @${chat.username}` : ""}
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="px-3 py-2 text-xs text-main/40">{t("search_no_results")}</div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-white/5 bg-black/5">
                                            {availableChats.map((chat) => {
                                                const title = getChatTitle(chat);
                                                const selected = selectedDialogChats.some((item) => item.id === chat.id);
                                                return (
                                                    <button
                                                        key={chat.id}
                                                        type="button"
                                                        className="w-full text-left px-3 py-2 hover:bg-white/5 border-b border-white/5 last:border-b-0 flex items-center gap-2"
                                                        onClick={() => toggleSelectedDialogChat(chat)}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            readOnly
                                                            checked={selected}
                                                            className="!mb-0 h-4 w-4 accent-[#8a3ffc] shrink-0"
                                                        />
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-semibold truncate">{title}</div>
                                                            <div className="text-[10px] text-main/40 font-mono truncate">
                                                                {chat.id}{chat.username ? ` · @${chat.username}` : ""}
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <div className="mt-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] text-main/40 uppercase tracking-wider">
                                                {t("selected_chats")} ({selectedDialogChats.length})
                                            </label>
                                            <button
                                                type="button"
                                                className="text-[10px] text-[#8a3ffc] hover:text-[#8a3ffc]/80 font-bold uppercase"
                                                onClick={() => setSelectedDialogChats([])}
                                            >
                                                {t("clear_selected")}
                                            </button>
                                        </div>
                                        {selectedDialogChats.length > 0 ? (
                                            <div className="flex flex-wrap gap-2">
                                                {selectedDialogChats.map((chat) => (
                                                    <button
                                                        key={chat.id}
                                                        type="button"
                                                        className="inline-flex max-w-full items-center gap-2 rounded-lg border border-white/5 bg-white/5 px-2 py-1 text-xs text-main/70 hover:bg-rose-500/10 hover:text-rose-300"
                                                        onClick={() => toggleSelectedDialogChat(chat)}
                                                    >
                                                        <span className="truncate max-w-[180px]">{getChatTitle(chat)}</span>
                                                        <X weight="bold" size={12} />
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-xs text-main/30">{t("no_selected_chats")}</div>
                                        )}
                                        <div className="text-[10px] text-main/30">{t("multi_select_hint")}</div>
                                    </div>
                                    <div className="mt-4">
                                        <label className="text-[10px] text-main/40 uppercase tracking-wider">{t("topic_id_label") || "Topic/Thread ID (Optional)"}</label>
                                        <input
                                            inputMode="numeric"
                                            className="!mb-0"
                                            placeholder={t("topic_id_placeholder") || "Leave blank if not applicable"}
                                            value={editingChat.message_thread_id || ""}
                                            onChange={(e) => setEditingChat({ ...editingChat, message_thread_id: e.target.value ? parseInt(e.target.value) : undefined })}
                                        />
                                    </div>
                                    <div className="mt-4">
                                        <label className="text-[10px] text-main/40 uppercase tracking-wider">{t("manual_chat_id")}</label>
                                        <input
                                            inputMode="numeric"
                                            className="!mb-0"
                                            placeholder={t("manual_id_placeholder")}
                                            value={editingChat.chat_id ? String(editingChat.chat_id) : ""}
                                            onChange={(e) => {
                                                const value = e.target.value.trim();
                                                const cid = value ? parseInt(value) : 0;
                                                setSelectedDialogChats([]);
                                                setEditingChat({
                                                    ...editingChat,
                                                    chat_id: Number.isNaN(cid) ? 0 : cid,
                                                    name: value ? t("chat_default_name").replace("{id}", value) : "",
                                                });
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs uppercase tracking-widest font-bold text-main/40">{t("action_sequence_title")}</label>
                                        <button
                                            onClick={() => setEditingChat({ ...editingChat, actions: [...editingChat.actions, { action: 1, text: "" }] })}
                                            className="text-[10px] font-bold text-[#8a3ffc] hover:underline"
                                        >
                                            + {t("add_sign_action")}
                                        </button>
                                    </div>

                                    <div className="max-h-[200px] overflow-y-auto space-y-3 custom-scrollbar pr-2">
                                        {editingChat.actions.map((act, i) => (
                                            <div key={i} className="grid grid-cols-[1.5rem_minmax(0,120px)_minmax(0,1fr)_2.25rem] gap-3 items-start animate-scale-in">
                                                <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-bold text-main/30 mt-2">
                                                    {i + 1}
                                                </div>
                                                <select
                                                    className="!mb-0 !h-10 !text-xs"
                                                    value={String(act.action || 1) as ActionTypeOption}
                                                    onChange={(e) => {
                                                        const nextType = e.target.value as ActionTypeOption;
                                                        const newActs = [...editingChat.actions];
                                                        if (nextType === "9") {
                                                            newActs[i] = { ...newActs[i], action: 9, photo: newActs[i]?.photo || "", caption: newActs[i]?.caption || "" };
                                                        } else if (nextType === "10") {
                                                            newActs[i] = { ...newActs[i], action: 10, from_chat_id: newActs[i]?.from_chat_id || "", message_ids: newActs[i]?.message_ids || [] };
                                                        } else {
                                                            newActs[i] = { ...newActs[i], action: 1, text: newActs[i]?.text || "" };
                                                        }
                                                        setEditingChat({ ...editingChat, actions: newActs });
                                                    }}
                                                >
                                                    <option value="1">{t("action_send_text")}</option>
                                                    <option value="9">{t("action_send_photo") || "发送图片"}</option>
                                                    <option value="10">{t("action_forward_messages") || "转发消息"}</option>
                                                </select>
                                                <div className="min-w-0">
                                                    {Number(act.action || 1) === 1 && (
                                                        <textarea
                                                            rows={3}
                                                            className="min-h-[72px] max-h-[180px] w-full resize-y bg-white/2 rounded-xl p-3 !text-sm text-main/70 border border-white/5 focus:border-[#8a3ffc]/30 outline-none transition-all placeholder:text-main/20 custom-scrollbar"
                                                            value={act.text || ""}
                                                            onChange={(e) => {
                                                                const newActs = [...editingChat.actions];
                                                                newActs[i] = { ...newActs[i], text: e.target.value };
                                                                setEditingChat({ ...editingChat, actions: newActs });
                                                            }}
                                                        />
                                                    )}
                                                    {Number(act.action) === 9 && (
                                                        <div className="space-y-2">
                                                            <div className="relative">
                                                                <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-main/25" size={16} />
                                                                <input
                                                                    className="!mb-0 !h-10 !pl-9 !text-xs"
                                                                    value={act.photo || ""}
                                                                    onChange={(e) => {
                                                                        const newActs = [...editingChat.actions];
                                                                        newActs[i] = { ...newActs[i], photo: e.target.value };
                                                                        setEditingChat({ ...editingChat, actions: newActs });
                                                                    }}
                                                                    placeholder="图片路径 / URL / file_id"
                                                                />
                                                            </div>
                                                            <input
                                                                className="!mb-0 !h-10 !text-xs"
                                                                value={act.caption || ""}
                                                                onChange={(e) => {
                                                                    const newActs = [...editingChat.actions];
                                                                    newActs[i] = { ...newActs[i], caption: e.target.value };
                                                                    setEditingChat({ ...editingChat, actions: newActs });
                                                                }}
                                                                placeholder="说明文字（可选）"
                                                            />
                                                        </div>
                                                    )}
                                                    {Number(act.action) === 10 && (
                                                        <div className="space-y-2">
                                                            <div className="relative">
                                                                <FastForward className="absolute left-3 top-1/2 -translate-y-1/2 text-main/25" size={16} />
                                                                <input
                                                                    className="!mb-0 !h-10 !pl-9 !text-xs"
                                                                    value={act.from_chat_id || ""}
                                                                    onChange={(e) => {
                                                                        const newActs = [...editingChat.actions];
                                                                        newActs[i] = { ...newActs[i], from_chat_id: e.target.value };
                                                                        setEditingChat({ ...editingChat, actions: newActs });
                                                                    }}
                                                                    placeholder="来源 Chat ID / @username"
                                                                />
                                                            </div>
                                                            <textarea
                                                                rows={2}
                                                                className="!mb-0 min-h-[58px] max-h-[120px] w-full resize-y bg-white/2 rounded-xl p-3 !text-sm text-main/70 border border-white/5 focus:border-[#8a3ffc]/30 outline-none transition-all placeholder:text-main/20 custom-scrollbar"
                                                                value={(act.message_ids || []).join(", ")}
                                                                onChange={(e) => {
                                                                    const newActs = [...editingChat.actions];
                                                                    newActs[i] = { ...newActs[i], message_ids: parseMessageIdsInput(e.target.value) };
                                                                    setEditingChat({ ...editingChat, actions: newActs });
                                                                }}
                                                                placeholder="消息 ID，逗号或换行分隔"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const newActs = editingChat.actions.filter((_, idx) => idx !== i);
                                                        setEditingChat({ ...editingChat, actions: newActs });
                                                    }}
                                                    className="action-btn !w-9 !h-9 !text-rose-400 mt-2"
                                                >
                                                    <X weight="bold" />
                                                </button>
                                            </div>
                                        ))}
                                        {editingChat.actions.length === 0 && (
                                            <div className="text-center py-4 text-xs text-main/20 italic">
                                                {t("no_actions_hint")}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <footer className="p-6 border-t border-white/5 flex gap-4 bg-black/10">
                                <button onClick={() => setEditingChat(null)} className="btn-secondary flex-1">{t("cancel")}</button>
                                <button onClick={handleSaveChat} className="btn-gradient flex-1 flex items-center justify-center gap-2">
                                    <Check weight="bold" />
                                    {t("confirm_add")}
                                </button>
                            </footer>
                        </div>
                    </div>
                )
            }

            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </div >
    );
}
