"use client";

import * as React from "react";
import { Check, Spinner } from "@phosphor-icons/react";
import { cn } from "../../lib/utils";

export type ChatPickerItemData = {
  id: string | number;
  title: string;
  subtitle?: string;
  selected?: boolean;
};

type ChatPickerListProps = {
  items: ChatPickerItemData[];
  loading?: boolean;
  emptyText?: string;
  loadingText?: string;
  maxHeight?: number | string;
  className?: string;
  onSelect: (id: string | number) => void;
  multi?: boolean;
};

export function ChatPickerList({
  items,
  loading = false,
  emptyText = "暂无结果",
  loadingText = "加载中...",
  maxHeight = 220,
  className,
  onSelect,
  multi = true,
}: ChatPickerListProps) {
  const heightStyle =
    typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight;

  return (
    <div
      className={cn("chat-picker-list", className)}
      style={{ maxHeight: heightStyle }}
      role="listbox"
      aria-multiselectable={multi}
    >
      {loading ? (
        <div className="chat-picker-state">
          <Spinner className="animate-spin shrink-0" size={14} />
          <span>{loadingText}</span>
        </div>
      ) : items.length > 0 ? (
        items.map((item) => (
          <button
            key={String(item.id)}
            type="button"
            role="option"
            aria-selected={Boolean(item.selected)}
            className={cn(
              "chat-picker-item",
              item.selected && "is-selected",
            )}
            onClick={() => onSelect(item.id)}
          >
            <span
              className={cn(
                "chat-picker-check",
                item.selected && "is-checked",
              )}
              aria-hidden
            >
              {item.selected && <Check weight="bold" size={11} />}
            </span>
            <span className="chat-picker-meta">
              <span className="chat-picker-title" title={item.title}>
                {item.title}
              </span>
              {item.subtitle ? (
                <span className="chat-picker-subtitle" title={item.subtitle}>
                  {item.subtitle}
                </span>
              ) : null}
            </span>
          </button>
        ))
      ) : (
        <div className="chat-picker-state is-empty">{emptyText}</div>
      )}
    </div>
  );
}

type ChatPickerFieldProps = {
  label?: React.ReactNode;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshLabel?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

export function ChatPickerField({
  label,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  onRefresh,
  refreshing,
  refreshLabel,
  children,
  footer,
  className,
}: ChatPickerFieldProps) {
  return (
    <div className={cn("chat-picker", className)}>
      {label ? <div className="chat-picker-label">{label}</div> : null}
      <div className="chat-picker-search-row">
        <input
          type="search"
          className="chat-picker-search-input"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          autoComplete="off"
        />
        {onRefresh ? (
          <button
            type="button"
            className="chat-picker-refresh"
            onClick={onRefresh}
            disabled={refreshing}
            title={refreshLabel}
          >
            {refreshing ? (
              <Spinner className="animate-spin" size={14} />
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            )}
            {refreshLabel ? <span>{refreshLabel}</span> : null}
          </button>
        ) : null}
      </div>
      {children}
      {footer ? <div className="chat-picker-footer">{footer}</div> : null}
    </div>
  );
}

export function formatChatSubtitle(chat: {
  id: string | number;
  username?: string | null;
}) {
  return chat.username ? `${chat.id} · @${chat.username}` : String(chat.id);
}
