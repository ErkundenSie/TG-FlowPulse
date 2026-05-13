from __future__ import annotations

import re
from pathlib import Path


_INVALID_NAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}


def validate_name_segment(value: str, field_name: str = "name") -> str:
    """Validate a user-controlled value before it is used as one path segment."""
    name = str(value or "").strip()
    if not name:
        raise ValueError(f"{field_name} cannot be empty")
    if name in {".", ".."} or ".." in name:
        raise ValueError(f"{field_name} cannot contain '..'")
    if _INVALID_NAME_CHARS.search(name):
        raise ValueError(f'{field_name} cannot contain: < > : " / \\ | ? *')
    if name.endswith(".") or name.endswith(" "):
        raise ValueError(f"{field_name} cannot end with a dot or space")
    if name.split(".", 1)[0].upper() in _WINDOWS_RESERVED_NAMES:
        raise ValueError(f"{field_name} is a reserved Windows filename")
    return name


def ensure_child_path(base_dir: Path, *segments: str) -> Path:
    """Join validated segments and ensure the result remains below base_dir."""
    base = base_dir.resolve()
    target = base
    for segment in segments:
        target = target / validate_name_segment(segment)
    resolved = target.resolve(strict=False)
    if resolved != base and base not in resolved.parents:
        raise ValueError("path escapes the configured data directory")
    return target
