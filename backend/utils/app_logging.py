from __future__ import annotations

import logging
import os
import re
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import TextIO

_SETUP_DONE = False


class SecretRedactionFilter(logging.Filter):
    _token = re.compile(r"bot\d+:[A-Za-z0-9_-]+")

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            rendered = record.getMessage()
        except Exception:
            return True
        cleaned = self._token.sub("bot<redacted>", rendered)
        if cleaned != rendered:
            record.msg = cleaned
            record.args = ()
        return True


class TeeStream:
    def __init__(self, stream: TextIO, log_file: Path):
        self._stream = stream
        self._log_file = log_file
        self._fp = None
        self._inode = None

    def _close_file(self) -> None:
        if self._fp is not None and not self._fp.closed:
            try:
                self._fp.close()
            except Exception:
                pass
        self._fp = None
        self._inode = None

    def _file(self):
        current = None
        if self._log_file.exists():
            try:
                current = self._log_file.stat().st_ino
            except OSError:
                current = None
        if self._fp is None or self._fp.closed or self._inode != current:
            self._close_file()
            self._fp = self._log_file.open("a", encoding="utf-8", errors="replace")
            try:
                self._inode = os.fstat(self._fp.fileno()).st_ino
            except OSError:
                self._inode = current
        return self._fp

    def write(self, data: str) -> int:
        written = self._stream.write(data)
        try:
            fp = self._file()
            fp.write(data)
            fp.flush()
        except Exception:
            self._close_file()
        return written

    def flush(self) -> None:
        self._stream.flush()
        if self._fp is not None and not self._fp.closed:
            try:
                self._fp.flush()
            except Exception:
                self._close_file()

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
    handler.addFilter(SecretRedactionFilter())
    for noisy in ("httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    root_logger = logging.getLogger()
    if root_logger.getEffectiveLevel() > logging.INFO:
        root_logger.setLevel(logging.INFO)

    for logger_name in ("", "backend", "tg-flowpulse", "tg-signer", "uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(logger_name)
        if logger_name and logger.getEffectiveLevel() > logging.INFO:
            logger.setLevel(logging.INFO)
        if logger_name and logger.propagate:
            continue
        if not any(
            isinstance(existing, RotatingFileHandler)
            and Path(getattr(existing, "baseFilename", "")) == log_file
            for existing in logger.handlers
        ):
            logger.addHandler(handler)

    sys.stdout = TeeStream(sys.stdout, log_file)  # type: ignore[assignment]
    _SETUP_DONE = True
    return log_file
