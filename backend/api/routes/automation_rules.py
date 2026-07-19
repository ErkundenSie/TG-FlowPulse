from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from backend.core.auth import get_current_user
from backend.models.user import User
from backend.services.automation_rules import (
    SUPPORTED_HANDLERS,
    SUPPORTED_TRIGGERS,
    get_automation_rule_service,
)

router = APIRouter()


class AutomationTriggerPayload(BaseModel):
    id: Optional[str] = None
    type: str
    params: dict[str, Any] = Field(default_factory=dict)


class AutomationFilterPayload(BaseModel):
    chat_id: Optional[Any] = None
    chat_ids: list[Any] = Field(default_factory=list)
    from_user_ids: list[Any] = Field(default_factory=list)
    text_rule: str = "all"
    text_value: Optional[str] = None
    ignore_case: bool = True


class AutomationHandlerPayload(BaseModel):
    handler: str
    params: dict[str, Any] = Field(default_factory=dict)


class AutomationRulePayload(BaseModel):
    id: Optional[str] = None
    name: str
    account_name: str
    group: str = "默认分组"
    enabled: bool = True
    drop_if_running: bool = True
    triggers: list[AutomationTriggerPayload]
    filters: Optional[AutomationFilterPayload] = None
    handlers: list[AutomationHandlerPayload]
    vars: dict[str, Any] = Field(default_factory=dict)


class AutomationEnabledPayload(BaseModel):
    enabled: bool


@router.get("/capabilities")
def capabilities(current_user: User = Depends(get_current_user)):
    return {
        "triggers": sorted(SUPPORTED_TRIGGERS),
        "handlers": sorted(SUPPORTED_HANDLERS),
    }


@router.get("")
def list_rules(
    account_name: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    return get_automation_rule_service().list_rules(account_name)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_rule(
    payload: AutomationRulePayload,
    current_user: User = Depends(get_current_user),
):
    try:
        return await get_automation_rule_service().create_rule(payload.dict())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{rule_id}")
def get_rule(rule_id: str, current_user: User = Depends(get_current_user)):
    rule = get_automation_rule_service().get_rule(rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="自动化规则不存在")
    return rule


@router.put("/{rule_id}")
async def update_rule(
    rule_id: str,
    payload: AutomationRulePayload,
    current_user: User = Depends(get_current_user),
):
    try:
        return await get_automation_rule_service().update_rule(rule_id, payload.dict())
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="自动化规则不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{rule_id}")
async def delete_rule(rule_id: str, current_user: User = Depends(get_current_user)):
    if not await get_automation_rule_service().delete_rule(rule_id):
        raise HTTPException(status_code=404, detail="自动化规则不存在")
    return {"ok": True}


@router.patch("/{rule_id}/enabled")
async def set_enabled(
    rule_id: str,
    payload: AutomationEnabledPayload,
    current_user: User = Depends(get_current_user),
):
    try:
        return await get_automation_rule_service().set_enabled(rule_id, payload.enabled)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="自动化规则不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{rule_id}/run")
async def run_rule(rule_id: str, current_user: User = Depends(get_current_user)):
    try:
        result = await get_automation_rule_service().run_manual(rule_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="自动化规则不存在") from exc
    if not result.get("success") and not result.get("skipped"):
        raise HTTPException(
            status_code=400,
            detail=str(result.get("error") or "自动化规则执行失败"),
        )
    return result


@router.get("/{rule_id}/status")
def rule_status(rule_id: str, current_user: User = Depends(get_current_user)):
    try:
        return get_automation_rule_service().get_status(rule_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="自动化规则不存在") from exc


@router.get("/{rule_id}/logs")
def rule_logs(
    rule_id: str,
    limit: int = Query(200, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
):
    try:
        return get_automation_rule_service().get_logs(rule_id, limit)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="自动化规则不存在") from exc


@router.get("/{rule_id}/state")
def rule_state(rule_id: str, current_user: User = Depends(get_current_user)):
    try:
        return get_automation_rule_service().get_state(rule_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="自动化规则不存在") from exc


@router.delete("/{rule_id}/state")
async def clear_rule_state(
    rule_id: str,
    current_user: User = Depends(get_current_user),
):
    try:
        await get_automation_rule_service().clear_state(rule_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="自动化规则不存在") from exc
    return {"ok": True}
