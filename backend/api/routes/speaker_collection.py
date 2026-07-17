from __future__ import annotations

from typing import Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from backend.core.auth import get_current_user
from backend.models.user import User
from backend.services.speaker_collection import get_speaker_collection_service
from backend.utils.xlsx_export import ExternalHyperlink, build_xlsx_bytes

router = APIRouter()
ChatId = Union[int, str]


class SpeakerCollectionConfig(BaseModel):
    id: Optional[str] = None
    name: str = "发言者采集"
    account_name: str
    chat_id: ChatId
    chat_name: str = ""
    start_at: Optional[str] = None
    end_at: Optional[str] = None
    profile_keywords: list[str] = []
    continuous: bool = False
    enabled: bool = True
    history_limit: int = Field(1000, ge=1, le=5000)


@router.get("")
def list_configs(
    account_name: Optional[str] = None, current_user: User = Depends(get_current_user)
):
    return get_speaker_collection_service().list_configs(account_name)


@router.post("", status_code=status.HTTP_201_CREATED)
async def save_config(
    payload: SpeakerCollectionConfig, current_user: User = Depends(get_current_user)
):
    try:
        return await get_speaker_collection_service().save_config(payload.dict())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{config_id}")
async def delete_config(config_id: str, current_user: User = Depends(get_current_user)):
    if not await get_speaker_collection_service().delete_config(config_id):
        raise HTTPException(status_code=404, detail="采集配置不存在")
    return {"ok": True}


@router.post("/{config_id}/scan")
async def scan(config_id: str, current_user: User = Depends(get_current_user)):
    try:
        return await get_speaker_collection_service().scan(config_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="采集配置不存在")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{config_id}/records")
def records(
    config_id: str, limit: int = 500, current_user: User = Depends(get_current_user)
):
    return get_speaker_collection_service().get_records(config_id, limit)


@router.get("/{config_id}/records/export")
def export_records(config_id: str, current_user: User = Depends(get_current_user)):
    service = get_speaker_collection_service()
    records = service.get_records(config_id, 5000)
    max_websites = max((len(item.get("websites") or []) for item in records), default=0)
    website_headers = [f"网站链接 {index}" for index in range(1, max_websites + 1)]
    content = build_xlsx_bytes(
        [
            "发言者",
            "用户名",
            "用户 ID",
            "个人链接",
            "完整简介",
            "网站",
            *website_headers,
            "命中关键词",
            "消息数",
            "首次发言",
            "最近发言",
            "示例消息",
        ],
        [
            [
                item.get("sender", ""),
                item.get("sender_username", ""),
                item.get("sender_id", ""),
                (
                    ExternalHyperlink(item["profile_url"], item["profile_url"])
                    if item.get("profile_url")
                    else ""
                ),
                item.get("bio", ""),
                ", ".join(item.get("websites") or []),
                *[ExternalHyperlink(url, url) for url in (item.get("websites") or [])],
                *["" for _ in range(max_websites - len(item.get("websites") or []))],
                ", ".join(item.get("matched_keywords", [])),
                item.get("message_count", 0),
                item.get("first_message_at", ""),
                item.get("last_message_at", ""),
                item.get("sample_message", ""),
            ]
            for item in records
        ],
        sheet_name="发言者筛选结果",
    )
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="speaker_collection.xlsx"'
        },
    )
