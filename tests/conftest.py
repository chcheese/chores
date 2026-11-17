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
USERS = [
    {"id": 1, "name": "Claudio", "avatar": "🦊", "color": "#000000", "role": "admin", "pointsTotal": 0, "active": True, "hasPin": True, "createdAt": "x"},
    {"id": 2, "name": "Lena", "avatar": "🐱", "color": "#be185d", "role": "child", "pointsTotal": 120, "active": True, "hasPin": True, "createdAt": "x"},
]


def claim(cid, user_id=2, title="Glace", cost=40):
    return {"id": cid, "rewardId": 1, "title": title, "icon": "🍦", "cost": cost, "userId": user_id, "status": "pending",
            "requestedAt": "2026-11-17T10:00:00Z", "decidedAt": None, "decidedBy": None}


def progress(user_id, balance, streak=0):
    return {"userId": user_id, "pointsTotal": balance + 40, "balance": balance, "level": 2, "levelFloor": 50, "levelNext": 150,
            "streak": streak, "bestStreak": streak, "doneCount": 5, "doneThisWeek": 3,
            "badges": [{"key": "erste", "title": "Erste Schritte", "icon": "🌱", "description": "", "earnedAt": "2026-11-10T08:00:00Z"},
                       {"key": "zehn", "title": "Fleissig", "icon": "⭐", "description": "", "earnedAt": None}]}


VACATION = {"from": "2026-11-15", "until": "2026-11-22", "active": True}
CLAIMS = [claim(7)]
PROGRESS = [progress(1, 0), progress(2, 80, streak=4)]


@pytest.fixture
def mock_api(aioclient_mock):
    aioclient_mock.get(f"{URL}/api/auth/me", json={"kind": "token", "user": None, "tokenName": "HA"})
    aioclient_mock.get(f"{URL}/api/chores", json=CHORES)
    aioclient_mock.get(f"{URL}/api/users", json=USERS)
    aioclient_mock.get(f"{URL}/api/vacation", json=VACATION)
    aioclient_mock.get(f"{URL}/api/claims?status=pending", json=CLAIMS)
    aioclient_mock.get(f"{URL}/api/progress", json=PROGRESS)
    return aioclient_mock
