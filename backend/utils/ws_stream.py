from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Sequence

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("backend.websocket")


async def stream_log_updates(
    websocket: WebSocket,
    get_logs: Callable[[], Sequence[str]],
    is_running: Callable[[], bool],
    *,
    poll_seconds: float = 0.5,
    startup_grace_seconds: float = 5.0,
) -> None:
    """Push incremental log updates until the task finishes."""
    last_idx = 0
    saw_activity = False
    waited_seconds = 0.0
    try:
        while True:
            active_logs = list(get_logs())
            running = bool(is_running())
            saw_activity = saw_activity or running or bool(active_logs)

            if len(active_logs) > last_idx:
                await websocket.send_json(
                    {
                        "type": "logs",
                        "data": active_logs[last_idx:],
                        "is_running": running,
                    }
                )
                last_idx = len(active_logs)

            if not running and last_idx >= len(active_logs):
                if not saw_activity and waited_seconds < startup_grace_seconds:
                    await asyncio.sleep(poll_seconds)
                    waited_seconds += poll_seconds
                    continue
                await websocket.send_json({"type": "done", "is_running": False})
                break

            await asyncio.sleep(poll_seconds)
            waited_seconds += poll_seconds
    except WebSocketDisconnect:
        return
    except Exception:
        logger.exception("WebSocket log stream failed")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
