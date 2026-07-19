from types import SimpleNamespace

import pytest

from backend.services.automation_rules import AutomationRuleService


def make_service() -> AutomationRuleService:
    return AutomationRuleService.__new__(AutomationRuleService)


def test_validate_message_automation_rule():
    service = make_service()
    rule = service.validate_rule(
        {
            "name": "reply-demo",
            "account_name": "test_account",
            "triggers": [
                {
                    "type": "message",
                    "params": {"chat_ids": [-100123, "@public_group"]},
                }
            ],
            "filters": {
                "text_rule": "regex",
                "text_value": r"code=(\d+)",
                "ignore_case": True,
            },
            "handlers": [
                {
                    "handler": "send_text",
                    "params": {"text": "收到 {group1}"},
                }
            ],
        }
    )

    assert rule["name"] == "reply-demo"
    assert rule["triggers"][0]["id"] == "trigger_1"
    assert rule["filters"]["text_rule"] == "regex"
    assert rule["handlers"][0]["handler"] == "send_text"


def test_validate_rejects_unsafe_callback_url():
    service = make_service()
    with pytest.raises(ValueError):
        service.validate_rule(
            {
                "name": "unsafe-callback",
                "account_name": "test_account",
                "triggers": [{"type": "startup", "params": {}}],
                "handlers": [
                    {
                        "handler": "http_callback",
                        "params": {"url": "http://127.0.0.1/internal"},
                    }
                ],
            }
        )


def test_regex_filter_exports_capture_variables():
    service = make_service()
    message = SimpleNamespace(text="Code=12345", caption=None)

    matched, variables = service._filter_matches(
        {
            "text_rule": "regex",
            "text_value": r"code=(?P<code>\d+)",
            "ignore_case": True,
        },
        message,
    )

    assert matched is True
    assert variables["match"] == "Code=12345"
    assert variables["group1"] == "12345"
    assert variables["code"] == "12345"


def test_template_render_uses_only_known_variables():
    service = make_service()
    rendered = service._render(
        "chat={chat_id}; code=${code}; unknown={secret}",
        {"chat_id": -100123, "code": "42"},
    )

    assert rendered == "chat=-100123; code=42; unknown={secret}"


@pytest.mark.asyncio
async def test_schedule_next_updates_scheduler_and_state(tmp_path, monkeypatch):
    from backend import scheduler as scheduler_module

    class FakeScheduler:
        def __init__(self):
            self.modified = None

        def modify_job(self, job_id, *, next_run_time):
            self.modified = (job_id, next_run_time)

    fake_scheduler = FakeScheduler()
    monkeypatch.setattr(scheduler_module, "scheduler", fake_scheduler)
    service = make_service()
    service.root = tmp_path
    service._io_locks = {}
    rule = {
        "id": "rule1",
        "triggers": [
            {"id": "timer1", "type": "timer", "params": {"interval_seconds": 60}}
        ],
    }

    result = await service._execute_handler(
        rule,
        {"handler": "schedule_next", "params": {"delay_seconds": 30}},
        client=None,
        message=None,
        variables={"trigger_id": "timer1"},
    )

    assert result == "continue"
    assert fake_scheduler.modified[0] == "automation-rule1-0"
    assert service._load_state("rule1")["_triggers"]["timer1"]["next_run_at"]
