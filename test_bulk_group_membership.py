from pathlib import Path
from types import SimpleNamespace

import pytest

from backend.services.bulk_group_membership import BulkGroupMembershipService


def make_service(tmp_path: Path) -> BulkGroupMembershipService:
    service = BulkGroupMembershipService.__new__(BulkGroupMembershipService)
    service.root = tmp_path
    service.root.mkdir(parents=True, exist_ok=True)
    service.jobs = {}
    service._tasks = {}
    return service


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("https://t.me/public_group", "@public_group"),
        ("t.me/public_group", "@public_group"),
        ("@public_group", "@public_group"),
        ("https://t.me/+Abc_123", "https://t.me/+Abc_123"),
        ("https://t.me/joinchat/Abc-123", "https://t.me/+Abc-123"),
        ("+Abc_123", "https://t.me/+Abc_123"),
    ],
)
def test_normalize_join_ref(tmp_path, raw, expected):
    service = make_service(tmp_path)
    assert service._normalize_join_ref(raw) == expected


def test_normalize_join_ref_rejects_message_link(tmp_path):
    service = make_service(tmp_path)
    with pytest.raises(ValueError):
        service._normalize_join_ref("https://t.me/public_group/123")


def test_normalize_links_removes_empty_and_duplicate_values(tmp_path):
    service = make_service(tmp_path)
    assert service._normalize_links(
        ["https://t.me/group_one\n\nhttps://t.me/group_two", "https://t.me/group_one"]
    ) == ["https://t.me/group_one", "https://t.me/group_two"]


def test_validate_delay_requires_safe_range(tmp_path):
    service = make_service(tmp_path)
    assert service._validate_delay(5, 10) == (5.0, 10.0)
    with pytest.raises(ValueError):
        service._validate_delay(0, 10)
    with pytest.raises(ValueError):
        service._validate_delay(20, 10)


@pytest.mark.asyncio
async def test_flood_wait_is_retried(tmp_path):
    service = make_service(tmp_path)
    job = {
        "job_id": "job1",
        "updated_at": service._now(),
        "logs": [],
        "auto_wait_flood": True,
        "_cancel_requested": False,
    }
    attempts = 0

    class FloodWait(Exception):
        value = 1

    async def operation():
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise FloodWait("FLOOD_WAIT_1")
        return "done"

    async def no_wait(_job, _seconds):
        return False

    service._cancelable_sleep = no_wait
    success, value = await service._call_with_flood_wait(job, "@group", operation)

    assert success is True
    assert value == "done"
    assert attempts == 2
    assert job["logs"][0]["level"] == "warning"


@pytest.mark.asyncio
async def test_leave_selected_only_processes_selected_groups(tmp_path):
    service = make_service(tmp_path)

    class FakeClient:
        async def get_dialogs(self, *, from_archive=False):
            values = (
                [(-1003, "Archived Channel", "CHANNEL")]
                if from_archive
                else [
                    (-1001, "Group One", "SUPERGROUP"),
                    (-1002, "Group Two", "SUPERGROUP"),
                ]
            )
            for chat_id, title, chat_type in values:
                yield SimpleNamespace(
                    chat=SimpleNamespace(
                        id=chat_id,
                        title=title,
                        type=SimpleNamespace(name=chat_type),
                    )
                )

    left_ids = []

    async def fake_leave(_client, _job, chat):
        left_ids.append(chat.id)
        return {
            "ref": str(chat.id),
            "title": chat.title,
            "chat_id": chat.id,
            "status": "left",
            "message": "已退出群组",
        }

    service._leave_item = fake_leave
    job = {
        "job_id": "selected-job",
        "mode": "leave_selected",
        "min_delay_seconds": 1,
        "max_delay_seconds": 1,
        "progress": {"done": 0, "total": 1},
        "summary": {},
        "results": [],
        "logs": [],
        "updated_at": service._now(),
        "_selected_chat_ids": [-1003],
        "_cancel_requested": False,
    }

    await service._run_items(FakeClient(), job)

    assert left_ids == [-1003]
    assert job["progress"] == {"done": 1, "total": 1}
    assert job["summary"]["left"] == 1


@pytest.mark.asyncio
async def test_group_iterator_includes_archive_and_deduplicates(tmp_path):
    service = make_service(tmp_path)

    class FakeClient:
        async def get_dialogs(self, *, from_archive=False):
            values = (
                [
                    (-1002, "Duplicate", "SUPERGROUP"),
                    (-1003, "Archived Channel", "CHANNEL"),
                    (1234, "Private Chat", "PRIVATE"),
                ]
                if from_archive
                else [
                    (-1001, "Main Group", "GROUP"),
                    (-1002, "Duplicate", "SUPERGROUP"),
                ]
            )
            for chat_id, title, chat_type in values:
                yield SimpleNamespace(
                    chat=SimpleNamespace(
                        id=chat_id,
                        title=title,
                        type=SimpleNamespace(name=chat_type),
                    )
                )

    groups = [chat async for chat in service._iter_account_group_chats(FakeClient())]

    assert [chat.id for chat in groups] == [-1001, -1002, -1003]
