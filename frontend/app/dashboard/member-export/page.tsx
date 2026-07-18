"use client";

import { useEffect, useState } from "react";
import {
  DownloadSimple,
  Spinner,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react";
import { getToken } from "../../../lib/auth";
import {
  AccountInfo,
  ChatInfo,
  exportMatchedChatMembers,
  getAccountChats,
  listAccounts,
} from "../../../lib/api";
import { ToastContainer, useToast } from "../../../components/ui/toast";

const chatTitle = (chat: ChatInfo) =>
  chat.title || chat.username || chat.first_name || String(chat.id);

const truncateLabel = (value: string, max = 42) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

export default function MemberExportPage() {
  const { toasts, addToast, removeToast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [chats, setChats] = useState<ChatInfo[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState({
    account: "",
    chatId: "",
    keywords: "",
    limit: 3000,
    includeBots: false,
  });

  useEffect(() => {
    const auth = getToken();
    if (!auth) {
      window.location.replace("/");
      return;
    }
    setToken(auth);
    listAccounts(auth)
      .then((data) => {
        setAccounts(data.accounts);
        const requestedAccount =
          new URLSearchParams(window.location.search).get("account_name") || "";
        const initialAccount = data.accounts.some(
          (item) => item.name === requestedAccount,
        )
          ? requestedAccount
          : data.accounts[0]?.name || "";
        if (initialAccount)
          setForm((prev) => ({ ...prev, account: initialAccount }));
      })
      .catch((error) => addToast(error?.message || "账号加载失败", "error"));
  }, [addToast]);

  useEffect(() => {
    if (!token || !form.account) return;
    setLoadingChats(true);
    getAccountChats(token, form.account)
      .then(setChats)
      .catch(() => setChats([]))
      .finally(() => setLoadingChats(false));
  }, [token, form.account]);

  const exportMembers = async () => {
    if (!token || !form.account || !form.chatId.trim()) {
      addToast("请选择账号和群组", "error");
      return;
    }
    try {
      setExporting(true);
      const keywords = form.keywords
        .split(/[\n,，]/)
        .map((item) => item.trim())
        .filter(Boolean);
      await exportMatchedChatMembers(token, form.account, {
        chat_id: form.chatId.trim(),
        keywords,
        limit: Math.max(1, Math.min(form.limit || 3000, 10000)),
        include_bots: form.includeBots,
      });
      addToast("成员表已导出", "success");
    } catch (error: any) {
      addToast(error?.message || "导出失败", "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="w-full min-h-full flex flex-col">
      <header className="navbar">
        <div className="nav-brand">
          <div className="navbar-title-block">
            <div className="nav-title">成员导出</div>
            <div className="nav-subtitle">直接读取 Telegram 群成员列表</div>
          </div>
        </div>
      </header>
      <main className="main-content !max-w-5xl !pt-7">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.8fr] gap-5">
          <section className="glass-panel p-6 space-y-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-11 h-11 rounded-xl bg-cyan-500/10 text-cyan-500 grid place-items-center">
                <UsersThree weight="fill" size={22} />
              </div>
              <div>
                <h1 className="font-bold text-lg tracking-tight">群成员导出</h1>
                <p className="text-xs text-muted-foreground">
                  导出 Telegram 当前允许该账号读取的成员
                </p>
              </div>
            </div>

            <label>Telegram 账号</label>
            <select
              className="!mb-0"
              value={form.account}
              onChange={(e) =>
                setForm({ ...form, account: e.target.value, chatId: "" })
              }
            >
              <option value="">选择账号</option>
              {accounts.map((account) => (
                <option key={account.name} value={account.name}>
                  {account.name}
                </option>
              ))}
            </select>

            <label>群组</label>
            <div className="field-stack">
              <select
                className="!mb-0"
                value={form.chatId}
                onChange={(e) => setForm({ ...form, chatId: e.target.value })}
                disabled={loadingChats}
              >
                <option value="">
                  {loadingChats ? "群组加载中..." : "选择群组/频道"}
                </option>
                {chats.map((chat) => {
                  const full = `${chatTitle(chat)}${
                    chat.username ? ` (@${chat.username})` : ""
                  }`;
                  return (
                    <option key={chat.id} value={String(chat.id)} title={full}>
                      {truncateLabel(full)}
                    </option>
                  );
                })}
              </select>
              <input
                className="!mb-0"
                value={form.chatId}
                onChange={(e) => setForm({ ...form, chatId: e.target.value })}
                placeholder="也可手动输入 Chat ID / @username"
              />
            </div>

            <label>关键词（可选）</label>
            <textarea
              className="!mb-0 min-h-[92px]"
              value={form.keywords}
              onChange={(e) => setForm({ ...form, keywords: e.target.value })}
              placeholder="逗号或换行分隔；仅用于标记是否命中，留空仍导出所有可读取成员"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label>
                最大读取人数
                <input
                  className="!mb-0 mt-2"
                  type="number"
                  min={1}
                  max={10000}
                  value={form.limit}
                  onChange={(e) =>
                    setForm({ ...form, limit: Number(e.target.value) })
                  }
                />
              </label>
              <label className="flex items-center gap-2 self-end h-10 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.includeBots}
                  onChange={(e) =>
                    setForm({ ...form, includeBots: e.target.checked })
                  }
                />
                包含机器人账号
              </label>
            </div>

            <button
              className="btn-gradient btn-block"
              onClick={exportMembers}
              disabled={exporting}
            >
              {exporting ? (
                <Spinner className="animate-spin" />
              ) : (
                <DownloadSimple weight="bold" />
              )}
              导出 XLSX
            </button>
          </section>

          <aside className="glass-panel p-6 h-fit">
            <div className="flex items-center gap-2 text-amber-400 font-bold mb-3">
              <WarningCircle weight="fill" size={20} />
              权限说明
            </div>
            <div className="space-y-3 text-sm text-main/55 leading-6">
              <p>
                该工具调用 Telegram 成员列表接口，适合管理自己拥有或管理的群组。
              </p>
              <p>
                如果当前账号不是群管理员，Telegram
                可能只返回管理员或极少量成员，程序无法绕过服务端权限。
              </p>
              <p>
                非管理员群请使用左侧“群发言者筛选”，从历史消息和后续新消息中逐步收集发言者资料。
              </p>
            </div>
          </aside>
        </div>
      </main>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
