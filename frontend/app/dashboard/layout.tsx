"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  ChatCircleText,
  CaretDown,
  Cpu,
  DownloadSimple,
  Gear,
  House,
  ListChecks,
  PaperPlaneTilt,
  Robot as BotIcon,
  ShieldCheck,
  SignOut,
  Terminal,
  UsersThree,
  UserList,
  X,
  List,
  Lightning,
  UserCircle,
} from "@phosphor-icons/react";
import { ThemeLanguageToggle } from "../../components/ThemeLanguageToggle";
import { useLanguage } from "../../context/LanguageContext";
import { logout } from "../../lib/auth";

const navGroups = [
  {
    label: { zh: "工作台", en: "Workspace" },
    items: [
      {
        href: "/dashboard",
        label: { zh: "账号概览", en: "Accounts" },
        icon: House,
        exact: true,
      },
      {
        href: "/dashboard/sign-tasks",
        label: { zh: "签到任务", en: "Sign Tasks" },
        icon: ListChecks,
      },
    ],
  },
  {
    label: { zh: "消息自动化", en: "Message Automation" },
    items: [
      {
        href: "/dashboard/monitors",
        label: { zh: "关键词监控", en: "Keyword Monitor" },
        icon: ChatCircleText,
      },
    ],
  },
  {
    label: { zh: "群组工具", en: "Group Tools" },
    items: [
      {
        href: "/dashboard/broadcast",
        label: { zh: "消息群发", en: "Broadcast" },
        icon: PaperPlaneTilt,
      },
    ],
  },
  {
    label: { zh: "成员采集", en: "Member Collection" },
    items: [
      {
        href: "/dashboard/member-export",
        label: { zh: "成员导出", en: "Member Export" },
        icon: UsersThree,
      },
      {
        href: "/dashboard/speaker-collection",
        label: { zh: "群发言者筛选", en: "Speaker Filter" },
        icon: UserList,
      },
    ],
  },
  {
    label: { zh: "系统", en: "System" },
    items: [
      {
        href: "/dashboard/settings",
        label: { zh: "系统设置", en: "Settings" },
        icon: Gear,
        children: [
          {
            href: "/dashboard/settings?section=account",
            section: "account",
            label: { zh: "账户安全", en: "Account Security" },
            icon: ShieldCheck,
          },
          {
            href: "/dashboard/settings?section=global",
            section: "global",
            label: { zh: "全局设置", en: "Global Settings" },
            icon: Gear,
          },
          {
            href: "/dashboard/settings?section=notify",
            section: "notify",
            label: { zh: "Bot 通知", en: "Bot Notify" },
            icon: BotIcon,
          },
          {
            href: "/dashboard/settings?section=ai",
            section: "ai",
            label: { zh: "AI 配置", en: "AI Config" },
            icon: BotIcon,
          },
          {
            href: "/dashboard/settings?section=telegram",
            section: "telegram",
            label: { zh: "Telegram API", en: "Telegram API" },
            icon: Cpu,
          },
          {
            href: "/dashboard/settings?section=logs",
            section: "logs",
            label: { zh: "系统日志", en: "System Logs" },
            icon: Terminal,
          },
          {
            href: "/dashboard/settings?section=backup",
            section: "backup",
            label: { zh: "备份迁移", en: "Backup" },
            icon: DownloadSimple,
          },
        ],
      },
    ],
  },
];

function navItemClass(active: boolean, nested = false) {
  const base = nested
    ? "sidebar-nav-item sidebar-nav-item-nested"
    : "sidebar-nav-item";
  return `${base}${active ? " is-active" : ""}`;
}

function DashboardSidebar({
  mobileOpen,
  setMobileOpen,
}: {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { language } = useLanguage();
  const text = (label: { zh: string; en: string }) => label[language];
  const settingsSection = searchParams.get("section") || "account";
  const onSettings = pathname.startsWith("/dashboard/settings");
  const [settingsOpen, setSettingsOpen] = useState(onSettings);

  useEffect(() => {
    if (onSettings) setSettingsOpen(true);
  }, [onSettings]);

  return (
    <aside className={`sidebar-shell${mobileOpen ? " is-open" : ""}`}>
      <div className="sidebar-brand">
        <Link
          href="/dashboard"
          className="sidebar-brand-home"
          aria-label={
            language === "zh" ? "返回账户概览" : "Go to account overview"
          }
          onClick={() => setMobileOpen(false)}
        >
          <div className="sidebar-brand-mark" aria-hidden>
            <Lightning weight="fill" size={18} />
          </div>
          <div className="sidebar-brand-text">
            <div className="sidebar-brand-title">TG-FlowPulse</div>
            <div className="sidebar-brand-subtitle">Control Center</div>
          </div>
        </Link>
        <button
          type="button"
          className="sidebar-icon-btn lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label={language === "zh" ? "关闭" : "Close"}
        >
          <X weight="bold" size={16} />
        </button>
      </div>

      <nav className="sidebar-nav">
        {navGroups.map((group) => (
          <div className="sidebar-group" key={group.label.zh}>
            <div className="sidebar-group-label">{text(group.label)}</div>
            <div className="sidebar-group-items">
              {group.items.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                const Icon = item.icon;
                const children = "children" in item ? item.children : undefined;

                if (children?.length) {
                  const expanded = settingsOpen || onSettings;
                  return (
                    <div
                      key={item.href}
                      className={`sidebar-tree${expanded ? " is-expanded" : ""}`}
                    >
                      <button
                        type="button"
                        className={navItemClass(active)}
                        onClick={() => setSettingsOpen((open) => !open)}
                        aria-expanded={expanded}
                      >
                        <Icon
                          weight={active ? "fill" : "duotone"}
                          size={18}
                          className="sidebar-nav-icon"
                        />
                        <span className="sidebar-nav-text">
                          {text(item.label)}
                        </span>
                        <CaretDown
                          weight="bold"
                          size={12}
                          className={`sidebar-caret${expanded ? " is-open" : ""}`}
                        />
                      </button>
                      {expanded && (
                        <div className="sidebar-subnav">
                          {children.map((child) => {
                            const childActive =
                              onSettings && settingsSection === child.section;
                            const ChildIcon = child.icon;
                            return (
                              <Link
                                href={child.href}
                                key={child.href}
                                className={navItemClass(childActive, true)}
                                onClick={() => setMobileOpen(false)}
                              >
                                <ChildIcon
                                  weight={childActive ? "fill" : "duotone"}
                                  size={16}
                                  className="sidebar-nav-icon"
                                />
                                <span className="sidebar-nav-text">
                                  {text(child.label)}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <Link
                    href={item.href}
                    key={item.href}
                    className={navItemClass(active)}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Icon
                      weight={active ? "fill" : "duotone"}
                      size={18}
                      className="sidebar-nav-icon"
                    />
                    <span className="sidebar-nav-text">{text(item.label)}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-footer-tools">
          <ThemeLanguageToggle />
        </div>
        <div className="sidebar-user">
          <div className="sidebar-user-avatar" aria-hidden>
            <UserCircle weight="fill" size={22} />
          </div>
          <div className="sidebar-user-meta">
            <div className="sidebar-user-name">
              {language === "zh" ? "管理员" : "Admin"}
            </div>
            <div className="sidebar-user-role">admin</div>
          </div>
          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={logout}
            title={language === "zh" ? "退出登录" : "Sign out"}
            aria-label={language === "zh" ? "退出登录" : "Sign out"}
          >
            <SignOut weight="bold" size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { language } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <div className="app-shell">
      <button
        type="button"
        className="sidebar-mobile-trigger"
        onClick={() => setMobileOpen(true)}
        aria-label={language === "zh" ? "打开导航" : "Open navigation"}
      >
        <List weight="bold" size={20} />
      </button>

      {mobileOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-label={language === "zh" ? "关闭导航" : "Close navigation"}
        />
      )}

      <Suspense fallback={null}>
        <DashboardSidebar
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
        />
      </Suspense>

      <main className="app-main">
        <div className="app-main-glow" aria-hidden />
        <div className="app-main-content">{children}</div>
      </main>
    </div>
  );
}
