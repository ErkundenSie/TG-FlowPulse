import { ChatMigrationImportJobResponse } from "./api";

export const CHAT_IMPORT_JOB_STORAGE_KEY = "tg-flowpulse-chat-import-job-id";
export const CHAT_IMPORT_LAST_JOB_STORAGE_KEY =
  "tg-flowpulse-chat-import-last-job";
export const CHAT_IMPORT_JOB_HISTORY_STORAGE_KEY =
  "tg-flowpulse-chat-import-job-history";
export const CHAT_IMPORT_JOB_HISTORY_LIMIT = 5;

export const loadChatImportJobHistory = () => {
  if (typeof window === "undefined")
    return [] as ChatMigrationImportJobResponse[];
  try {
    const storedHistory = localStorage.getItem(
      CHAT_IMPORT_JOB_HISTORY_STORAGE_KEY,
    );
    if (storedHistory) {
      const parsed = JSON.parse(storedHistory);
      return Array.isArray(parsed)
        ? (parsed as ChatMigrationImportJobResponse[]).slice(
            0,
            CHAT_IMPORT_JOB_HISTORY_LIMIT,
          )
        : [];
    }

    const legacyStored = localStorage.getItem(CHAT_IMPORT_LAST_JOB_STORAGE_KEY);
    return legacyStored
      ? [JSON.parse(legacyStored) as ChatMigrationImportJobResponse]
      : [];
  } catch {
    localStorage.removeItem(CHAT_IMPORT_LAST_JOB_STORAGE_KEY);
    localStorage.removeItem(CHAT_IMPORT_JOB_HISTORY_STORAGE_KEY);
    return [];
  }
};

export const saveChatImportJobToHistory = (
  job: ChatMigrationImportJobResponse,
) => {
  if (typeof window === "undefined") return;
  const history = loadChatImportJobHistory();
  const nextHistory = [
    job,
    ...history.filter((item) => item.job_id !== job.job_id),
  ].slice(0, CHAT_IMPORT_JOB_HISTORY_LIMIT);
  localStorage.setItem(
    CHAT_IMPORT_JOB_HISTORY_STORAGE_KEY,
    JSON.stringify(nextHistory),
  );
  localStorage.setItem(CHAT_IMPORT_LAST_JOB_STORAGE_KEY, JSON.stringify(job));
  window.dispatchEvent(new CustomEvent("chat-import-job-history-updated"));
};
