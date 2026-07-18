"use client";

import { useTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import { Translate, Sun, Moon } from "@phosphor-icons/react";

export function ThemeLanguageToggle() {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
        className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-transparent hover:border-border/60 transition-all duration-200 active:scale-95"
        title={
          language === "zh" ? t("switch_to_english") : t("switch_to_chinese")
        }
      >
        <Translate weight="bold" size={18} />
      </button>

      <button
        type="button"
        onClick={toggleTheme}
        className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-transparent hover:border-border/60 transition-all duration-200 active:scale-95"
        title={theme === "dark" ? t("switch_to_light") : t("switch_to_dark")}
      >
        {theme === "dark" ? (
          <Sun weight="bold" size={18} />
        ) : (
          <Moon weight="bold" size={18} />
        )}
      </button>
    </div>
  );
}
