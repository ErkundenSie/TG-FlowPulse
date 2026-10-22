from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TaskBase(BaseModel):
    name: str  # 对应 tg-signer 的 task_name
    cron: str
    account_id: int


class TaskCreate(TaskBase):
    enabled: bool = True


class TaskUpdate(BaseModel):
    name: str | None = None
    cron: str | None = None
    enabled: bool | None = None
    account_id: int | None = None


class TaskOut(TaskBase):
    id: int
    enabled: bool
    last_run_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
