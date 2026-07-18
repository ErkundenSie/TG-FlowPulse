"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "../../../context/LanguageContext";

function AccountTasksRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const name = searchParams.get("name") || "";

  useEffect(() => {
    const qs = name ? `?name=${encodeURIComponent(name)}` : "";
    router.replace(`/dashboard/sign-tasks${qs}`);
  }, [name, router]);

  return null;
}

export default function AccountTasksPage() {
  const { t } = useLanguage();
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          {t("loading")}
        </div>
      }
    >
      <AccountTasksRedirectInner />
    </Suspense>
  );
}
