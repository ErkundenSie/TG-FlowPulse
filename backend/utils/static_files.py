from __future__ import annotations

from pathlib import Path
from typing import Optional


class StaticFileResolver:
    def __init__(self, root: Path):
        self.root = root
        self._resolved_root = root.resolve()

    def existing_file(self, relative_path: str) -> Optional[Path]:
        return self._safe_existing_file(self.root / relative_path)

    def existing_html_file(self, relative_path: str) -> Optional[Path]:
        return self._safe_existing_file(self.root / f"{relative_path}.html")

    def index_file(self) -> Optional[Path]:
        return self._safe_existing_file(self.root / "index.html")

    def _safe_existing_file(self, path: Path) -> Optional[Path]:
        resolved = path.resolve(strict=False)
        if resolved != self._resolved_root and self._resolved_root not in resolved.parents:
            return None
        if resolved.exists() and resolved.is_file():
            return resolved
        return None
