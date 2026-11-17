"""Fixtures for the Chores integration tests."""

import pytest

pytest_plugins = ["pytest_homeassistant_custom_component"]

URL = "http://chores.test"
TOKEN = "chores_testtoken"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    yield


def chore(cid, title, status, next_due, **extra):
    base = {
        "id": cid, "title": title, "description": "", "room": "Küche", "icon": "🧹", "points": 10, "active": True,
        "scheduleType": "after_completion", "intervalValue": 7, "intervalUnit": "day", "rrule": None, "anchorDate": None,
        "toleranceDays": 2, "nextDue": next_due, "lastDone": None, "assignmentMode": "anyone", "assignedUserId": None,
        "rotationUserIds": [], "rotationIndex": 0, "counterTarget": None, "counterValue": 0, "counterLabel": "",
        "createdAt": "2026-11-01T00:00:00Z", "updatedAt": "2026-11-01T00:00:00Z",
        "status": status, "daysUntilDue": 0, "counterReached": False, "assignee": None,
    }
    base.update(extra)
    return base


CHORES = [
    chore(1, "Boden saugen", "overdue", "2026-11-12", assignee={"id": 1, "name": "Claudio", "avatar": "🦊", "color": "#000000"}),
    chore(2, "Betten beziehen", "due", "2026-11-17"),
    chore(3, "Fenster putzen", "ok", "2027-01-10", counterTarget=30, counterValue=12, counterLabel="Spülgänge"),
]
USERS = [{"id": 1, "name": "Claudio", "avatar": "🦊", "color": "#000000", "role": "admin", "pointsTotal": 0, "active": True, "hasPin": True, "createdAt": "x"}]


@pytest.fixture
def mock_api(aioclient_mock):
    aioclient_mock.get(f"{URL}/api/auth/me", json={"kind": "token", "user": None, "tokenName": "HA"})
    aioclient_mock.get(f"{URL}/api/chores", json=CHORES)
    aioclient_mock.get(f"{URL}/api/users", json=USERS)
    return aioclient_mock
