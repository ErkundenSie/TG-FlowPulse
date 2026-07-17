from __future__ import annotations

from typing import Optional, Union

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.core.auth import get_current_user
from backend.models.user import User
from backend.services.speaker_collection import get_speaker_collection_service

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
