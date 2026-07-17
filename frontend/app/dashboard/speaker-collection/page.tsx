"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CaretLeft,
  DownloadSimple,
  Play,
  Plus,
  Spinner,
  Trash,
  Users,
} from "@phosphor-icons/react";
import { getToken } from "../../../lib/auth";
import {
  AccountInfo,
  ChatInfo,
  SpeakerCollectionConfig,
  SpeakerCollectionRecord,
  deleteSpeakerCollection,
  exportSpeakerCollectionRecords,
  getAccountChats,
  getSpeakerCollectionRecords,
  listAccounts,
  listSpeakerCollections,
  saveSpeakerCollection,
  scanSpeakerCollection,
} from "../../../lib/api";
import { ToastContainer, useToast } from "../../../components/ui/toast";

const localDateTime = (value?: string | null) =>
  value ? value.slice(0, 16) : "";

export default function SpeakerCollectionPage() {
  const { toasts, addToast, removeToast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [chats, setChats] = useState<ChatInfo[]>([]);
  const [configs, setConfigs] = useState<SpeakerCollectionConfig[]>([]);
  const [records, setRecords] = useState<SpeakerCollectionRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<SpeakerCollectionConfig>({
    name: "发言者采集",
    account_name: "",
    chat_id: "",
    history_limit: 1000,
    continuous: false,
    enabled: true,
    profile_keywords: [],
  });

  const refresh = async (auth: string) => {
    const [accountData, configData] = await Promise.all([
      listAccounts(auth),
      listSpeakerCollections(auth),
    ]);
    setAccounts(accountData.accounts);
    setConfigs(configData);
    if (!form.account_name && accountData.accounts[0])
      setForm((v) => ({ ...v, account_name: accountData.accounts[0].name }));
  };
  useEffect(() => {
    const auth = getToken();
    if (!auth) {
      window.location.replace("/");
      return;
    }
    setToken(auth);
    refresh(auth).catch((e) => addToast(e.message || "加载失败", "error"));
  }, []);
  useEffect(() => {
    if (token && form.account_name)
      getAccountChats(token, form.account_name)
        .then(setChats)
        .catch(() => setChats([]));
  }, [token, form.account_name]);
  const loadRecords = async (id: string) => {
    if (!token) return;
    setSelectedId(id);
    setRecords(await getSpeakerCollectionRecords(token, id));
  };
  const save = async () => {
    if (!token || !form.account_name || !form.chat_id)
      return addToast("请选择账号和群组", "error");
    try {
      setLoading(true);
      const saved = await saveSpeakerCollection(token, {
        ...form,
        start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
      });
      addToast("采集配置已保存", "success");
      setConfigs((items) => [
        saved,
        ...items.filter((item) => item.id !== saved.id),
      ]);
      setSelectedId(saved.id || "");
      setRecords([]);
    } catch (e: any) {
      addToast(e.message || "保存失败", "error");
    } finally {
      setLoading(false);
    }
  };
  const scan = async (id: string) => {
    if (!token) return;
    try {
      setLoading(true);
      const result = await scanSpeakerCollection(token, id);
      addToast(
        `已扫描 ${result.scanned_messages || 0} 条消息，新增 ${result.new_speakers || 0} 位发言者`,
        "success",
      );
      setConfigs((items) =>
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                last_scan_summary: result,
                last_scan_at: new Date().toISOString(),
              }
            : item,
        ),
      );
      await loadRecords(id);
    } catch (e: any) {
      addToast(e.message || "扫描失败", "error");
    } finally {
      setLoading(false);
    }
  };
  const remove = async (id: string) => {
    if (!token || !confirm("删除配置及已收集的发言者记录？")) return;
    await deleteSpeakerCollection(token, id);
    setSelectedId("");
    setRecords([]);
    await refresh(token);
  };

  return (
    <div className="main-content !pt-6">
      <nav className="navbar">
        <div className="nav-brand flex items-center gap-3">
          <Link href="/dashboard/monitors" className="action-btn">
            <CaretLeft weight="bold" />
          </Link>
          <h1 className="text-lg font-bold">发言者采集</h1>
        </div>
      </nav>
      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-5 mt-6">
        <section className="glass-panel p-5 space-y-4">
          <div className="flex items-center gap-2 font-bold">
            <Users weight="fill" className="text-cyan-400" />
            新增/更新采集
          </div>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="采集名称"
          />
          <select
            value={form.account_name}
            onChange={(e) =>
              setForm({ ...form, account_name: e.target.value, chat_id: "" })
            }
          >
            <option value="">选择账号</option>
            {accounts.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={String(form.chat_id)}
            onChange={(e) => {
              const chat = chats.find((c) => String(c.id) === e.target.value);
              setForm({
                ...form,
                chat_id: e.target.value,
                chat_name: chat?.title || chat?.username || e.target.value,
              });
            }}
          >
            <option value="">选择群/频道</option>
            {chats.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.title || c.username || c.id}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs">
              开始时间
              <input
                type="datetime-local"
                value={localDateTime(form.start_at)}
                onChange={(e) =>
                  setForm({ ...form, start_at: e.target.value || null })
                }
              />
            </label>
            <label className="text-xs">
              结束时间
              <input
                type="datetime-local"
                value={localDateTime(form.end_at)}
                onChange={(e) =>
                  setForm({ ...form, end_at: e.target.value || null })
                }
              />
            </label>
          </div>
          <label className="text-xs">
            每次历史消息数
            <input
              type="number"
              min="1"
              max="5000"
              value={form.history_limit || 1000}
              onChange={(e) =>
                setForm({ ...form, history_limit: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-xs">
            简介关键词（逗号或换行分隔，留空则收集全部发言者）
            <textarea
              className="!mb-0 min-h-[84px]"
              value={(form.profile_keywords || []).join("\n")}
              onChange={(e) =>
                setForm({
                  ...form,
                  profile_keywords: e.target.value
                    .split(/[\n,，]/)
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
              placeholder="例如：招聘, 代理, 采购"
            />
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!form.continuous}
              onChange={(e) =>
                setForm({ ...form, continuous: e.target.checked })
              }
            />
            持续监控新发言（每 30 秒）
          </label>
          <button
            className="btn-gradient w-full"
            onClick={save}
            disabled={loading}
          >
            {loading ? (
              <Spinner className="animate-spin" />
            ) : (
              <Plus weight="bold" />
            )}
            保存配置
          </button>
          <p className="text-xs text-main/45">
            仅收集当前账号已可见消息的发言者，并按群组和用户 ID
            自动去重；不会获取 Telegram 隐藏成员。
          </p>
        </section>
        <section className="space-y-5">
          <div className="glass-panel p-5">
            <div className="font-bold mb-3">采集任务</div>
            <div className="space-y-2">
              {configs.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-white/10 p-3 flex justify-between gap-3"
                >
                  <button
                    className="text-left min-w-0"
                    onClick={() => loadRecords(c.id || "")}
                  >
                    <div className="font-bold truncate">{c.name}</div>
                    <div className="text-xs text-main/45 truncate">
                      {c.account_name} · {c.chat_name} · 最近扫描：
                      {c.last_scan_at || "未扫描"}
                    </div>
                  </button>
                  <div className="flex gap-1">
                    <button
                      className="action-btn !text-cyan-400"
                      onClick={() => scan(c.id || "")}
                      title="立即扫描"
                    >
                      <Play weight="bold" />
                    </button>
                    <button
                      className="action-btn !text-rose-400"
                      onClick={() => remove(c.id || "")}
                    >
                      <Trash weight="bold" />
                    </button>
                  </div>
                </div>
              ))}
              {!configs.length && (
                <div className="text-sm text-main/40">暂无采集配置</div>
              )}
            </div>
          </div>
          <div className="glass-panel p-5">
            <div className="flex justify-between mb-3">
              <div className="font-bold">
                已去重发言者 {selectedId ? `(${records.length})` : ""}
              </div>
              {selectedId && (
                <button
                  className="action-btn"
                  onClick={() =>
                    exportSpeakerCollectionRecords(token!, selectedId)
                  }
                  title="导出 XLSX"
                >
                  <DownloadSimple />
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-main/45">
                    <th>发言者</th>
                    <th>用户名</th>
                    <th>简介</th>
                    <th>命中关键词</th>
                    <th>消息数</th>
                    <th>最近发言</th>
                    <th>示例消息</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id} className="border-t border-white/5">
                      <td className="py-2">
                        {r.profile_url ? (
                          <a
                            className="text-cyan-400"
                            href={r.profile_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {r.sender}
                          </a>
                        ) : (
                          r.sender
                        )}
                      </td>
                      <td>{r.sender_username}</td>
                      <td className="max-w-[250px] truncate">{r.bio}</td>
                      <td>{(r.matched_keywords || []).join(", ")}</td>
                      <td>{r.message_count}</td>
                      <td>{r.last_message_at}</td>
                      <td className="max-w-[300px] truncate">
                        {r.sample_message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {selectedId && !records.length && (
                <div className="py-6 text-center text-main/40">
                  尚未收集到发言者
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
