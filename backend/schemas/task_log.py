from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TaskLogOut(BaseModel):
    id: int
    task_id: int
    status: str
    log_path: str | None = None
    output: str | None = None
    started_at: datetime
    finished_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
