from __future__ import annotations

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import TextIO

_SETUP_DONE = False


class TeeStream:
    def __init__(self, stream: TextIO, log_file: Path):
        self._stream = stream
        self._log_file = log_file

    def write(self, data: str) -> int:
        written = self._stream.write(data)
        try:
            with self._log_file.open("a", encoding="utf-8", errors="replace") as fp:
                fp.write(data)
        except Exception:
            pass
        return written

    def flush(self) -> None:
        self._stream.flush()

    def isatty(self) -> bool:
        return bool(getattr(self._stream, "isatty", lambda: False)())

    @property
    def encoding(self) -> str:
        return getattr(self._stream, "encoding", "utf-8") or "utf-8"


def setup_app_logging(logs_dir: Path) -> Path:
    global _SETUP_DONE

    logs_dir.mkdir(parents=True, exist_ok=True)
    log_file = logs_dir / "app.log"
    if _SETUP_DONE:
        return log_file

    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s [%(name)s] %(message)s"
    )
    handler = RotatingFileHandler(
        log_file,
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    handler.setFormatter(formatter)
    handler.setLevel(logging.INFO)

    for logger_name in ("", "backend", "tg-signer", "uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(logger_name)
        if not any(
            isinstance(existing, RotatingFileHandler)
            and Path(getattr(existing, "baseFilename", "")) == log_file
            for existing in logger.handlers
        ):
            logger.addHandler(handler)

    sys.stdout = TeeStream(sys.stdout, log_file)  # type: ignore[assignment]
    sys.stderr = TeeStream(sys.stderr, log_file)  # type: ignore[assignment]
    _SETUP_DONE = True
    return log_file
