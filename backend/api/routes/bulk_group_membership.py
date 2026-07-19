import logging
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from backend.core.auth import get_current_user
from backend.models.user import User
from backend.services.bulk_group_membership import get_bulk_group_membership_service

router = APIRouter()
logger = logging.getLogger("backend.api.bulk_group_membership")


class BulkGroupMembershipStartRequest(BaseModel):
    account_name: str
    mode: Literal["join", "leave_selected", "leave_all_groups"]
    links: List[str] = Field(default_factory=list)
    selected_chat_ids: List[int] = Field(default_factory=list)
    min_delay_seconds: float = 5
    max_delay_seconds: float = 10
    auto_wait_flood: bool = True


class BulkGroupMembershipJobResponse(BaseModel):
    job_id: str
    status: Literal["running", "canceling", "canceled", "completed", "failed"]
    mode: Literal["join", "leave_selected", "leave_all_groups"]
    account_name: str
    min_delay_seconds: float
    max_delay_seconds: float
    auto_wait_flood: bool
    created_at: str
    updated_at: str
    finished_at: Optional[str] = None
    progress: Dict[str, int]
    summary: Dict[str, int] = Field(default_factory=dict)
    results: List[Dict[str, Any]] = Field(default_factory=list)
    logs: List[Dict[str, Any]] = Field(default_factory=list)
    error: Optional[str] = None


class BulkGroupItem(BaseModel):
    id: int
    title: str
    username: Optional[str] = None
    type: str


@router.get("/accounts/{account_name}/groups", response_model=List[BulkGroupItem])
async def list_account_groups(
    account_name: str,
    current_user: User = Depends(get_current_user),
):
    try:
        return [
            BulkGroupItem(**item)
            for item in await get_bulk_group_membership_service().list_account_groups(
                account_name
            )
        ]
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.exception("List account groups failed account=%s", account_name)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"读取账号群组和频道失败: {exc}",
        )


@router.get("/jobs", response_model=List[BulkGroupMembershipJobResponse])
async def list_jobs(
    limit: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
):
    return [
        BulkGroupMembershipJobResponse(**job)
        for job in get_bulk_group_membership_service().list_jobs(limit)
    ]


@router.post("/jobs", response_model=BulkGroupMembershipJobResponse)
async def start_job(
    request: BulkGroupMembershipStartRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        job = get_bulk_group_membership_service().start_job(
            account_name=request.account_name,
            mode=request.mode,
            links=request.links,
            selected_chat_ids=request.selected_chat_ids,
            min_delay_seconds=request.min_delay_seconds,
            max_delay_seconds=request.max_delay_seconds,
            auto_wait_flood=request.auto_wait_flood,
        )
        return BulkGroupMembershipJobResponse(**job)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.exception("Start bulk group membership job failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"启动批量加退群/频道任务失败: {exc}",
        )


@router.get("/jobs/{job_id}", response_model=BulkGroupMembershipJobResponse)
async def get_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
):
    try:
        return BulkGroupMembershipJobResponse(
            **get_bulk_group_membership_service().get_job(job_id)
        )
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")


@router.post("/jobs/{job_id}/cancel", response_model=BulkGroupMembershipJobResponse)
async def cancel_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
):
    try:
        return BulkGroupMembershipJobResponse(
            **get_bulk_group_membership_service().cancel_job(job_id)
        )
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
