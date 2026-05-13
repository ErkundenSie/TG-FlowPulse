export interface LogStreamMessage {
  type: "logs" | "done";
  data?: string[];
  is_running?: boolean;
}

export interface SignTaskLogSocketOptions {
  taskName: string;
  accountName: string;
  token: string;
  onLogs: (logs: string[]) => void;
  onDone: () => void;
  onError?: (event: Event) => void;
}

const wsProtocol = () =>
  window.location.protocol === "https:" ? "wss:" : "ws:";

const encodePath = (value: string | number) =>
  encodeURIComponent(String(value));

export function openSignTaskLogSocket({
  taskName,
  accountName,
  token,
  onLogs,
  onDone,
  onError,
}: SignTaskLogSocketOptions) {
  const params = new URLSearchParams({ account_name: accountName });
  const url = `${wsProtocol()}//${window.location.host}/api/sign-tasks/ws/${encodePath(
    taskName,
  )}?${params.toString()}`;
  const socket = new WebSocket(url, ["tg-flowpulse-token", token]);

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data) as LogStreamMessage;
    if (message.type === "logs" && message.data?.length) {
      onLogs(message.data);
      return;
    }
    if (message.type === "done") {
      onDone();
    }
  };
  if (onError) {
    socket.onerror = onError;
  }

  return socket;
}
