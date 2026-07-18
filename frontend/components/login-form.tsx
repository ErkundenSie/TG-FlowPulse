"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "../lib/api";
import { setToken } from "../lib/auth";
import {
  Lightning,
  Spinner,
  GithubLogo,
  LockKey,
  User,
  ShieldCheck,
} from "@phosphor-icons/react";
import { ThemeLanguageToggle } from "./ThemeLanguageToggle";
import { useLanguage } from "../context/LanguageContext";

export default function LoginForm() {
  const router = useRouter();
  const { t } = useLanguage();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const canSubmit = Boolean(username.trim() && password && !loading);

  const formatLoginError = (err: any) => {
    const msg = String(err?.message || "");
    const lowerMsg = msg.toLowerCase();

    if (lowerMsg.includes("totp")) return t("totp_error");
    if (
      lowerMsg.includes("invalid") ||
      lowerMsg.includes("credentials") ||
      lowerMsg.includes("password")
    ) {
      return t("user_or_pass_error");
    }
    return t("login_failed");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await login({
        username: username.trim(),
        password,
        totp_code: totp.trim() || undefined,
      });
      setToken(res.access_token);
      router.push("/dashboard");
    } catch (err: any) {
      setErrorMsg(formatLoginError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="login-view"
      className="w-full min-h-screen flex flex-col justify-center items-center relative p-4 overflow-x-hidden bg-background"
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[35%] -left-[15%] w-[65%] h-[65%] rounded-full bg-primary/12 blur-[110px] animate-pulse-slow" />
        <div
          className="absolute -bottom-[35%] -right-[15%] w-[60%] h-[60%] rounded-full bg-accent/10 blur-[110px] animate-pulse-slow"
          style={{ animationDelay: "2s" }}
        />
      </div>

      <div className="relative z-10 w-full max-w-[420px] p-8 sm:p-9 text-center animate-float-up bg-card/70 backdrop-blur-2xl border border-border/60 rounded-3xl shadow-modal overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-primary/[0.04] pointer-events-none" />

        <div className="relative z-20 mb-7">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/25 mb-4">
            <Lightning weight="fill" className="text-white text-2xl" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground mb-1.5">
            TG-FlowPulse
          </h1>
          <p className="text-muted-foreground text-xs font-medium max-w-[280px] mx-auto leading-relaxed">
            {t("settings_desc")}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="relative z-20 text-left flex flex-col gap-4"
          autoComplete="off"
        >
          <div className="group">
            <label className="text-[11px] mb-1.5 ml-0.5 block font-bold text-muted-foreground uppercase tracking-wider">
              {t("username")}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
                <User weight="bold" size={17} />
              </div>
              <input
                type="text"
                name="username"
                className="!mb-0 w-full !py-3 !pl-10 !pr-3.5 bg-background/60 border border-border/70 rounded-xl text-foreground text-sm font-medium focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition-all placeholder:text-muted-foreground/50"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("username")}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="group">
            <label className="text-[11px] mb-1.5 ml-0.5 block font-bold text-muted-foreground uppercase tracking-wider">
              {t("password")}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
                <LockKey weight="bold" size={17} />
              </div>
              <input
                type="password"
                name="password"
                className="!mb-0 w-full !py-3 !pl-10 !pr-3.5 bg-background/60 border border-border/70 rounded-xl text-foreground text-sm font-medium focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition-all placeholder:text-muted-foreground/50"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("password")}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="group">
            <label className="text-[11px] mb-1.5 ml-0.5 block font-bold text-muted-foreground uppercase tracking-wider">
              {t("totp")}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
                <ShieldCheck weight="bold" size={17} />
              </div>
              <input
                type="text"
                name="totp"
                className="!mb-0 w-full !py-3 !pl-10 !pr-3.5 bg-background/60 border border-border/70 rounded-xl text-foreground text-sm font-bold tracking-[0.25em] focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition-all placeholder:text-muted-foreground/50 placeholder:tracking-normal placeholder:font-medium"
                value={totp}
                onChange={(e) =>
                  setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder={t("totp_placeholder")}
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="animate-fade-in text-destructive text-xs text-center bg-destructive/10 p-3 rounded-xl font-medium border border-destructive/20">
              {errorMsg}
            </div>
          )}

          <button
            className="mt-1 relative w-full h-12 bg-gradient-to-r from-primary to-accent hover:brightness-105 text-white rounded-xl font-bold text-sm shadow-[0_10px_24px_-6px_rgba(139,92,246,0.45)] hover:shadow-[0_14px_28px_-6px_rgba(139,92,246,0.55)] transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 overflow-hidden"
            type="submit"
            disabled={!canSubmit}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner className="animate-spin" size={18} />
                <span>{t("login_loading")}</span>
              </span>
            ) : (
              <span>{t("login")}</span>
            )}
          </button>
        </form>

        <div className="relative z-20 mt-7 pt-5 border-t border-border/50 flex items-center justify-center gap-4">
          <ThemeLanguageToggle />
          <a
            href="https://github.com/ErkundenSie/TG-FlowPulse"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/50 transition-all active:scale-95"
            title={t("github_repo")}
          >
            <GithubLogo weight="bold" size={18} />
          </a>
        </div>
      </div>
    </div>
  );
}
