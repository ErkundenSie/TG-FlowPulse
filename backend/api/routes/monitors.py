from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Literal, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, validator

from backend.core.auth import get_current_user
from backend.models.user import User
from backend.services.sign_tasks import get_sign_task_service

router = APIRouter()
logger = logging.getLogger("backend.api.monitors")

MonitorChatId = Union[int, str]
_keyword_monitor_restart_task: Optional[asyncio.Task] = None
_keyword_monitor_restart_pending = False


async def _run_keyword_monitor_restart() -> None:
    global _keyword_monitor_restart_pending, _keyword_monitor_restart_task
    try:
        from backend.services.keyword_monitor import get_keyword_monitor_service

        while True:
            _keyword_monitor_restart_pending = False
            try:
                await asyncio.wait_for(
                    get_keyword_monitor_service().restart_from_tasks(),
                    timeout=30,
                )
            except asyncio.TimeoutError:
                logger.warning("Keyword monitor restart timed out")
            except Exception:
                logger.warning("Keyword monitor restart failed", exc_info=True)
            if not _keyword_monitor_restart_pending:
                break
    except asyncio.TimeoutError:
        logger.warning("Keyword monitor restart timed out")
    except Exception:
        logger.warning("Keyword monitor restart failed", exc_info=True)
    finally:
        _keyword_monitor_restart_task = None


async def _restart_keyword_monitors() -> None:
    global _keyword_monitor_restart_pending, _keyword_monitor_restart_task
    if _keyword_monitor_restart_task and not _keyword_monitor_restart_task.done():
        _keyword_monitor_restart_pending = True
        return
    _keyword_monitor_restart_task = asyncio.create_task(_run_keyword_monitor_restart())


def _validate_task_name(value: str) -> str:
    name = value.strip()
    if not name:
        raise ValueError("monitor name cannot be empty")
    if re.search(r'[<>:"/\\|?*]', name):
        raise ValueError('monitor name cannot contain: < > : " / \\ | ? *')
    return name


def _normalize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _keyword_action_from_rule(rule: "MonitorRule") -> dict[str, Any]:
    push_channel = rule.push_channel
    auto_reply_text = _normalize_optional_text(rule.auto_reply_text)
    if auto_reply_text:
        push_channel = "continue"
    thread_ids = [
        int(item)
        for item in (rule.message_thread_ids or [])
        if item is not None
    ]
    if not thread_ids and rule.message_thread_id is not None:
        thread_ids = [rule.message_thread_id]
    action: dict[str, Any] = {
        "action": 8,
        "monitor_scope": "private" if rule.monitor_scope == "private" else "selected",
        "keywords": rule.keywords,
        "match_mode": rule.match_mode,
        "ignore_case": rule.ignore_case,
        "push_channel": push_channel,
        "include_self_messages": rule.include_self_messages,
        "message_thread_ids": thread_ids,
        "time_window_enabled": rule.time_window_enabled,
    }
    if rule.active_time_start:
        action["active_time_start"] = rule.active_time_start
    if rule.active_time_end:
        action["active_time_end"] = rule.active_time_end
    if rule.bark_url:
        action["bark_url"] = rule.bark_url
    if rule.custom_url:
        action["custom_url"] = rule.custom_url
    if rule.forward_chat_id not in (None, ""):
        action["forward_chat_id"] = rule.forward_chat_id
    if rule.forward_message_thread_id is not None:
        action["forward_message_thread_id"] = rule.forward_message_thread_id
    if rule.continue_chat_id not in (None, ""):
        action["continue_chat_id"] = rule.continue_chat_id
    if rule.continue_message_thread_id is not None:
        action["continue_message_thread_id"] = rule.continue_message_thread_id
    if rule.continue_action_interval is not None:
        action["continue_action_interval"] = rule.continue_action_interval
    if rule.continue_actions:
        action["continue_actions"] = rule.continue_actions
    elif auto_reply_text:
        action["continue_actions"] = [{"action": 1, "text": auto_reply_text}]
    elif push_channel == "continue":
        action["continue_actions"] = []
    return action


def _rule_from_chat(task_name: str, account_name: str, chat: dict[str, Any]) -> list[dict[str, Any]]:
    rules: list[dict[str, Any]] = []
    for action in chat.get("actions") or []:
        try:
            action_id = int(action.get("action"))
        except (TypeError, ValueError, AttributeError):
            continue
        if action_id != 8:
            continue
        continue_actions = action.get("continue_actions") or []
        auto_reply_text = None
        if (
            action.get("push_channel") == "continue"
            and isinstance(continue_actions, list)
            and len(continue_actions) == 1
            and isinstance(continue_actions[0], dict)
            and int(continue_actions[0].get("action") or 0) == 1
        ):
            auto_reply_text = continue_actions[0].get("text")
        rules.append(
            {
                "id": f"{task_name}:{len(rules) + 1}",
                "account_name": account_name,
                "chat_id": chat.get("chat_id"),
                "chat_name": chat.get("name") or str(chat.get("chat_id") or ""),
                "message_thread_id": chat.get("message_thread_id"),
                "message_thread_ids": action.get("message_thread_ids") or (
                    [chat.get("message_thread_id")]
                    if chat.get("message_thread_id") is not None
                    else []
                ),
                "monitor_scope": "private"
                if action.get("monitor_scope") == "private"
                else "selected",
                "keywords": action.get("keywords") or [],
                "match_mode": action.get("match_mode") or "contains",
                "ignore_case": bool(action.get("ignore_case", True)),
                "include_self_messages": bool(action.get("include_self_messages", False)),
                "time_window_enabled": bool(action.get("time_window_enabled", False)),
                "active_time_start": action.get("active_time_start"),
                "active_time_end": action.get("active_time_end"),
                "push_channel": action.get("push_channel") or "telegram",
                "bark_url": action.get("bark_url"),
                "custom_url": action.get("custom_url"),
                "forward_chat_id": action.get("forward_chat_id"),
                "forward_message_thread_id": action.get("forward_message_thread_id"),
                "auto_reply_text": auto_reply_text,
                "continue_chat_id": action.get("continue_chat_id"),
                "continue_message_thread_id": action.get("continue_message_thread_id"),
                "continue_action_interval": action.get("continue_action_interval", 1),
                "continue_actions": continue_actions,
            }
        )
    return rules


class MonitorRule(BaseModel):
    chat_id: Optional[MonitorChatId] = Field(None, description="Source chat ID or @username")
    chat_name: str = ""
    message_thread_id: Optional[int] = None
    message_thread_ids: list[int] = Field(default_factory=list)
    monitor_scope: Literal["selected", "private"] = "selected"
    keywords: list[str] = Field(default_factory=list)
    match_mode: Literal["contains", "exact", "regex"] = "contains"
    ignore_case: bool = True
    include_self_messages: bool = False
    time_window_enabled: bool = False
    active_time_start: Optional[str] = None
    active_time_end: Optional[str] = None
    push_channel: Literal["telegram", "forward", "bark", "custom", "continue"] = "telegram"
    bark_url: Optional[str] = None
    custom_url: Optional[str] = None
    forward_chat_id: Optional[MonitorChatId] = None
    forward_message_thread_id: Optional[int] = None
    auto_reply_text: Optional[str] = None
    continue_chat_id: Optional[MonitorChatId] = None
    continue_message_thread_id: Optional[int] = None
    continue_action_interval: float = 1
    continue_actions: list[dict[str, Any]] = Field(default_factory=list)

    @validator("chat_id", "forward_chat_id", "continue_chat_id", pre=True)
    def chat_id_must_be_number_or_username(cls, value):
        if value is None or value == "":
            return None
        text = str(value).strip()
        if text == "private":
            return text
        if text.startswith("@"):
            return text
        try:
            return int(text)
        except ValueError as exc:
            raise ValueError("chat id must be a number or @username") from exc

    @validator("message_thread_ids", pre=True)
    def thread_ids_must_be_numbers(cls, value):
        if value is None or value == "":
            return []
        if not isinstance(value, list):
            value = [value]
        cleaned: list[int] = []
        for item in value:
            if item is None or item == "":
                continue
            try:
                cleaned.append(int(item))
            except (TypeError, ValueError) as exc:
                raise ValueError("topic id must be a number") from exc
        return cleaned

    @validator("active_time_start", "active_time_end", pre=True)
    def time_must_be_hhmm(cls, value):
        text = _normalize_optional_text(value)
        if text is None:
            return None
        if not re.fullmatch(r"\d{2}:\d{2}", text):
            raise ValueError("time must use HH:MM format")
        hour, minute = [int(part) for part in text.split(":", 1)]
        if hour > 23 or minute > 59:
            raise ValueError("time must use HH:MM format")
        return text

    @validator("keywords")
    def keywords_required(cls, value):
        cleaned = [str(item).strip() for item in value if str(item).strip()]
        if not cleaned:
            raise ValueError("at least one keyword or regex is required")
        return cleaned


class MonitorTaskCreate(BaseModel):
    name: str
    account_name: str
    group: str = "monitors"
    enabled: bool = True
    rules: list[MonitorRule]

    @validator("name")
    def name_must_be_valid(cls, value):
        return _validate_task_name(value)


class MonitorTaskUpdate(BaseModel):
    account_name: Optional[str] = None
    group: Optional[str] = None
    enabled: Optional[bool] = None
    rules: Optional[list[MonitorRule]] = None


class MonitorTaskOut(BaseModel):
    name: str
    account_name: str
    group: str = ""
    enabled: bool = True
    rules: list[dict[str, Any]]


class MonitorStatusOut(BaseModel):
    time: str = ""
    active: bool = False
    message: str = ""
    logs: list[str] = Field(default_factory=list)


def _task_to_monitor(task: dict[str, Any]) -> Optional[MonitorTaskOut]:
    chats = task.get("chats") or []
    rules: list[dict[str, Any]] = []
    for chat in chats:
        if isinstance(chat, dict):
            rules.extend(
                _rule_from_chat(
                    str(task.get("name") or ""),
                    str(task.get("account_name") or ""),
                    chat,
                )
            )
    if not rules:
        return None
    return MonitorTaskOut(
        name=str(task.get("name") or ""),
        account_name=str(task.get("account_name") or ""),
        group=str(task.get("group") or ""),
        enabled=bool(task.get("enabled", True)),
        rules=rules,
    )


def _is_standalone_monitor(task: dict[str, Any]) -> bool:
    return bool(task.get("monitor_only")) or str(task.get("group") or "") == "monitors"


def _build_chats(rules: list[MonitorRule]) -> list[dict[str, Any]]:
    chats: list[dict[str, Any]] = []
    for rule in rules:
        if rule.monitor_scope == "selected" and rule.chat_id in (None, ""):
            raise HTTPException(status_code=400, detail="selected monitor requires a source chat")
        chat_id = rule.chat_id if rule.monitor_scope == "selected" else rule.monitor_scope
        thread_ids = rule.message_thread_ids or (
            [rule.message_thread_id] if rule.message_thread_id is not None else []
        )
        chats.append(
            {
                "chat_id": chat_id,
                "name": rule.chat_name or str(chat_id),
                "message_thread_id": thread_ids[0] if len(thread_ids) == 1 else None,
                "action_interval": 1,
                "actions": [_keyword_action_from_rule(rule)],
            }
        )
    return chats


def _mark_monitor_only(account_name: str, task_name: str) -> None:
    service = get_sign_task_service()
    task_dir = service.signs_dir / account_name / task_name
    config_file = task_dir / "config.json"
    if not config_file.exists():
        return
    try:
        with open(config_file, "r", encoding="utf-8") as fp:
            config = json.load(fp)
        config["monitor_only"] = True
        with open(config_file, "w", encoding="utf-8") as fp:
            json.dump(config, fp, ensure_ascii=False, indent=2)
        service._tasks_cache = None
        try:
            from backend.scheduler import remove_sign_task_job

            remove_sign_task_job(account_name, task_name)
        except Exception:
            pass
    except Exception:
        pass


@router.get("", response_model=list[MonitorTaskOut])
def list_monitors(
    account_name: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    tasks = get_sign_task_service().list_tasks(
        account_name=account_name,
        force_refresh=True,
    )
    monitors = []
    for task in tasks:
        if not _is_standalone_monitor(task):
            continue
        monitor = _task_to_monitor(task)
        if monitor:
            monitors.append(monitor)
    return monitors


@router.post("", response_model=MonitorTaskOut, status_code=status.HTTP_201_CREATED)
async def create_monitor(
    payload: MonitorTaskCreate,
    current_user: User = Depends(get_current_user),
):
    if not payload.rules:
        raise HTTPException(status_code=400, detail="at least one monitor rule is required")
    task = get_sign_task_service().create_task(
        task_name=payload.name,
        account_name=payload.account_name,
        group=payload.group or "monitors",
        sign_at="0 0 31 2 *",
        chats=_build_chats(payload.rules),
        random_seconds=0,
        sign_interval=1,
        execution_mode="fixed",
        enabled=payload.enabled,
        notify_on_failure=False,
    )
    _mark_monitor_only(payload.account_name, payload.name)
    await _restart_keyword_monitors()
    monitor = _task_to_monitor(task)
    if not monitor:
        raise HTTPException(status_code=500, detail="failed to create monitor")
    return monitor


@router.get("/{task_name}", response_model=MonitorTaskOut)
def get_monitor(
    task_name: str,
    account_name: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    task = get_sign_task_service().get_task(task_name, account_name=account_name)
    if not task:
        raise HTTPException(status_code=404, detail=f"monitor {task_name} not found")
    if not _is_standalone_monitor(task):
        raise HTTPException(status_code=404, detail=f"monitor {task_name} not found")
    monitor = _task_to_monitor(task)
    if not monitor:
        raise HTTPException(status_code=404, detail=f"monitor {task_name} not found")
    return monitor


@router.put("/{task_name}", response_model=MonitorTaskOut)
async def update_monitor(
    task_name: str,
    payload: MonitorTaskUpdate,
    account_name: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    existing = get_sign_task_service().get_task(task_name, account_name=account_name)
    if not existing:
        raise HTTPException(status_code=404, detail=f"monitor {task_name} not found")
    if not _is_standalone_monitor(existing):
        raise HTTPException(status_code=404, detail=f"monitor {task_name} not found")

    if payload.account_name and payload.account_name != existing.get("account_name"):
        raise HTTPException(
            status_code=400,
            detail="changing monitor account is not supported; create a new monitor instead",
        )

    rules = payload.rules
    if rules is None:
        rules = [MonitorRule(**rule) for rule in (_task_to_monitor(existing) or MonitorTaskOut(name=task_name, account_name="", rules=[])).rules]
    if not rules:
        raise HTTPException(status_code=400, detail="at least one monitor rule is required")

    target_account = account_name or existing.get("account_name")
    task = get_sign_task_service().update_task(
        task_name=task_name,
        account_name=target_account,
        group=payload.group if payload.group is not None else existing.get("group", "monitors"),
        chats=_build_chats(rules),
        enabled=payload.enabled if payload.enabled is not None else existing.get("enabled", True),
        notify_on_failure=False,
    )
    _mark_monitor_only(str(task.get("account_name") or ""), task_name)
    old_account = str(existing.get("account_name") or "")
    if old_account and target_account and old_account != target_account:
        get_sign_task_service().delete_task(task_name, account_name=old_account)
    await _restart_keyword_monitors()
    monitor = _task_to_monitor(task)
    if not monitor:
        raise HTTPException(status_code=500, detail="failed to update monitor")
    return monitor


@router.delete("/{task_name}", status_code=status.HTTP_200_OK)
async def delete_monitor(
    task_name: str,
    account_name: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    existing = get_sign_task_service().get_task(task_name, account_name=account_name)
    if not existing or not _is_standalone_monitor(existing):
        raise HTTPException(status_code=404, detail=f"monitor {task_name} not found")
    success = get_sign_task_service().delete_task(task_name, account_name=account_name)
    if not success:
        raise HTTPException(status_code=404, detail=f"monitor {task_name} not found")
    await _restart_keyword_monitors()
    return {"ok": True}


@router.get("/{task_name}/status", response_model=MonitorStatusOut)
def get_monitor_status(
    task_name: str,
    account_name: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    existing = get_sign_task_service().get_task(task_name, account_name=account_name)
    if not existing or not _is_standalone_monitor(existing):
        raise HTTPException(status_code=404, detail=f"monitor {task_name} not found")

    try:
        from backend.services.keyword_monitor import get_keyword_monitor_service

        service = get_keyword_monitor_service()
        entry = service.get_task_history_entry(
            task_name,
            str(existing.get("account_name") or account_name or ""),
        )
        if not entry:
            return MonitorStatusOut(message="monitor not started or no runtime logs yet")
        return MonitorStatusOut(
            time=str(entry.get("time") or ""),
            active=bool(entry.get("success", False)),
            message=str(entry.get("message") or ""),
            logs=list(entry.get("flow_logs") or []),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"failed to read monitor status: {exc}") from exc


@router.get("/{task_name}/export")
def export_monitor(
    task_name: str,
    account_name: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    monitor = get_monitor(task_name, account_name=account_name, current_user=current_user)
    payload = {
        "task_name": monitor.name,
        "task_type": "monitor",
        "config": {
            "account_name": monitor.account_name,
            "group": monitor.group,
            "enabled": monitor.enabled,
            "rules": monitor.rules,
        },
    }
    return Response(
        content=json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"),
        media_type="application/json; charset=utf-8",
    )


class ImportMonitorRequest(BaseModel):
    config_json: str
    task_name: Optional[str] = None
    account_name: Optional[str] = None


@router.post("/import", response_model=MonitorTaskOut)
async def import_monitor(
    payload: ImportMonitorRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        data = json.loads(payload.config_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="invalid JSON") from exc
    config = data.get("config") if isinstance(data, dict) else None
    if not isinstance(config, dict):
        raise HTTPException(status_code=400, detail="invalid monitor config")
    name = _validate_task_name(payload.task_name or data.get("task_name") or "imported_monitor")
    account_name = _normalize_optional_text(payload.account_name) or _normalize_optional_text(config.get("account_name"))
    if not account_name:
        raise HTTPException(status_code=400, detail="account_name is required")
    request = MonitorTaskCreate(
        name=name,
        account_name=account_name,
        group=config.get("group") or "monitors",
        enabled=bool(config.get("enabled", True)),
        rules=[MonitorRule(**rule) for rule in config.get("rules") or []],
    )
    return await create_monitor(request, current_user=current_user)
