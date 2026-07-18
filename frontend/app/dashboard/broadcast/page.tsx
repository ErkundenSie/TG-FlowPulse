"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getToken } from "../../../lib/auth";
import { listAccounts, AccountInfo } from "../../../lib/api";
import AccountTasksContent from "../account-tasks/AccountTasksContent";
import { useLanguage } from "../../../context/LanguageContext";
import { Spinner, PaperPlaneTilt } from "@phosphor-icons/react";

function BroadcastInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguage();
  const accountName = searchParams.get("name") || "";
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const isZh = language === "zh";

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.replace("/");
      return;
    }
    if (accountName) {
      setLoading(false);
      return;
    }
    listAccounts(token)
      .then((data) => {
        setAccounts(data.accounts || []);
        if (data.accounts?.[0]?.name) {
          router.replace(
            `/dashboard/broadcast?name=${encodeURIComponent(data.accounts[0].name)}`,
          );
        }
      })
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false));
  }, [accountName, router]);

  if (accountName) {
    return (
      <AccountTasksContent
        taskKind="broadcast"
        pageTitle={isZh ? "消息群发" : "Broadcast"}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-main/40">
        <Spinner className="animate-spin" size={28} />
        <div className="text-xs font-bold tracking-widest uppercase">
          {isZh ? "加载中" : "Loading"}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-full flex flex-col">
      <header className="navbar">
        <div className="nav-brand">
          <div className="navbar-title-block">
            <div className="nav-title">{isZh ? "消息群发" : "Broadcast"}</div>
            <div className="nav-subtitle">
              {isZh
                ? "基于签到任务引擎，独立隔离的群发调度"
                : "Sign-task engine, isolated broadcast jobs"}
            </div>
          </div>
        </div>
      </header>
      <main className="main-content !pt-8">
        <div className="glass-panel p-8 max-w-xl mx-auto text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-violet-500/10 text-violet-500 grid place-items-center">
            <PaperPlaneTilt weight="fill" size={22} />
          </div>
          <h1 className="text-lg font-bold">
            {isZh ? "请先添加 Telegram 账号" : "Add a Telegram account first"}
          </h1>
          <p className="text-sm text-main/50">
            {isZh
              ? "消息群发会按账号隔离保存，不会与签到任务混在一起。"
              : "Broadcast jobs are stored per account and isolated from sign tasks."}
          </p>
          <button
            className="btn-gradient"
            onClick={() => router.push("/dashboard")}
          >
            {isZh ? "返回账号概览" : "Back to accounts"}
          </button>
          {accounts.length > 0 && (
            <div className="pt-2 space-y-2">
              {accounts.map((acc) => (
                <button
                  key={acc.name}
                  className="btn-secondary w-full"
                  onClick={() =>
                    router.push(
                      `/dashboard/broadcast?name=${encodeURIComponent(acc.name)}`,
                    )
                  }
                >
                  {acc.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function BroadcastPage() {
  const { t } = useLanguage();
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          {t("loading")}
        </div>
      }
    >
      <BroadcastInner />
    </Suspense>
  );
}
