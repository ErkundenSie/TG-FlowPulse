from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AccountBase(BaseModel):
    account_name: str
    api_id: str
    api_hash: str
    proxy: str | None = None  # JSON string


class AccountCreate(AccountBase):
    pass


class AccountUpdate(BaseModel):
    api_id: str | None = None
    api_hash: str | None = None
    proxy: str | None = None
    status: str | None = None


class AccountLoginVerify(BaseModel):
    code: str | None = None
    password: str | None = None


class AccountOut(AccountBase):
    id: int
    status: str
    last_login_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
