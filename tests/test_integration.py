"""Tests for the Chores integration."""

from homeassistant import config_entries
from homeassistant.const import CONF_TOKEN, CONF_URL
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.chores.const import DOMAIN, EVENT_REWARD_REQUESTED, EVENT_STATUS_CHANGED

from .conftest import CHORES, CLAIMS, PROGRESS, TOKEN, URL, USERS, VACATION, chore, claim


async def _setup(hass: HomeAssistant) -> MockConfigEntry:
    entry = MockConfigEntry(domain=DOMAIN, data={CONF_URL: URL, CONF_TOKEN: TOKEN}, unique_id=URL)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_config_flow_success(hass: HomeAssistant, mock_api) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert result["type"] is FlowResultType.FORM
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {CONF_URL: URL + "/", CONF_TOKEN: TOKEN})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"] == {CONF_URL: URL, CONF_TOKEN: TOKEN}


async def test_config_flow_invalid_auth(hass: HomeAssistant, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/auth/me", status=401, json={"error": "Nicht angemeldet"})
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {CONF_URL: URL, CONF_TOKEN: "bad"})
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"base": "invalid_auth"}


async def test_config_flow_rejects_session_login(hass: HomeAssistant, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/auth/me", json={"kind": "session", "user": USERS[0], "tokenName": None})
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {CONF_URL: URL, CONF_TOKEN: TOKEN})
    assert result["errors"] == {"base": "invalid_auth"}


async def test_config_flow_cannot_connect(hass: HomeAssistant, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/auth/me", exc=TimeoutError())
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {CONF_URL: URL, CONF_TOKEN: TOKEN})
    assert result["errors"] == {"base": "cannot_connect"}


async def test_sensors_and_todo(hass: HomeAssistant, mock_api) -> None:
    await _setup(hass)
    assert hass.states.get("sensor.haushalt_fallige_aufgaben") or hass.states.get("sensor.haushalt_due_chores")
    states = {s.entity_id: s for s in hass.states.async_all()}
    due = next(s for e, s in states.items() if e.startswith("sensor.") and e.endswith("_due_chores") or e.endswith("_fallige_aufgaben"))
    assert due.state == "2"
    assert [c["chore_id"] for c in due.attributes["chores"]] == [1, 2]
    overdue = next(s for e, s in states.items() if e.endswith("_overdue_chores") or e.endswith("_uberfallige_aufgaben"))
    assert overdue.state == "1"

    window = next(s for e, s in states.items() if "fenster" in e)
    assert window.state == "2027-01-10"
    assert window.attributes["counter_value"] == 12
    assert window.attributes["chore_id"] == 3

    assert states["todo.haushalt"].state == "2"  # open items


async def test_todo_check_off_completes(hass: HomeAssistant, mock_api) -> None:
    await _setup(hass)
    mock_api.post(f"{URL}/api/chores/1/complete", json={"chore": CHORES[0], "completion_id": 9})
    todo_id = next(s.entity_id for s in hass.states.async_all() if s.entity_id.startswith("todo."))
    await hass.services.async_call("todo", "update_item", {"item": "1", "status": "completed"}, target={"entity_id": todo_id}, blocking=True)
    assert any(call[0] == "POST" and str(call[1]).endswith("/api/chores/1/complete") for call in mock_api.mock_calls)


async def test_services(hass: HomeAssistant, mock_api) -> None:
    await _setup(hass)
    mock_api.post(f"{URL}/api/chores/2/complete", json={"chore": CHORES[1], "completion_id": 5})
    mock_api.post(f"{URL}/api/chores/3/counter", json=CHORES[2])
    mock_api.post(f"{URL}/api/chores/2/snooze", json=CHORES[1])
    mock_api.post(f"{URL}/api/chores/2/skip", json={"chore": CHORES[1], "completion_id": 6})

    resp = await hass.services.async_call(DOMAIN, "complete", {"chore_id": 2, "user_id": 1}, blocking=True, return_response=True)
    assert resp["chore"]["id"] == 2
    await hass.services.async_call(DOMAIN, "increment_counter", {"chore_id": 3, "by": 2}, blocking=True)
    await hass.services.async_call(DOMAIN, "snooze", {"chore_id": 2, "days": 3}, blocking=True)
    await hass.services.async_call(DOMAIN, "skip", {"chore_id": 2}, blocking=True)

    posts = [(str(c[1]), c[2]) for c in mock_api.mock_calls if c[0] == "POST"]
    assert (f"{URL}/api/chores/2/complete", {"user_id": 1}) in posts
    assert (f"{URL}/api/chores/3/counter", {"by": 2}) in posts
    assert (f"{URL}/api/chores/2/snooze", {"days": 3}) in posts


async def test_status_change_event_and_new_chore(hass: HomeAssistant, mock_api) -> None:
    entry = await _setup(hass)
    events = []
    hass.bus.async_listen(EVENT_STATUS_CHANGED, lambda e: events.append(e.data))

    mock_api.clear_requests()
    changed = [CHORES[0], chore(2, "Betten beziehen", "overdue", "2026-11-17"), CHORES[2], chore(4, "Neu", "ok", "2026-12-01")]
    mock_api.get(f"{URL}/api/chores", json=changed)
    mock_api.get(f"{URL}/api/users", json=USERS)
    mock_api.get(f"{URL}/api/vacation", json=VACATION)
    mock_api.get(f"{URL}/api/claims?status=pending", json=CLAIMS)
    mock_api.get(f"{URL}/api/progress", json=PROGRESS)
    await entry.runtime_data.async_refresh()
    await hass.async_block_till_done()

    assert events == [
        {"chore_id": 2, "title": "Betten beziehen", "old_status": "due", "new_status": "overdue", "next_due": "2026-11-17", "assignee": None}
    ]
    ent_reg = er.async_get(hass)
    assert ent_reg.async_get_entity_id("sensor", DOMAIN, f"{entry.entry_id}_chore_4") is not None


async def test_unload(hass: HomeAssistant, mock_api) -> None:
    entry = await _setup(hass)
    assert await hass.config_entries.async_unload(entry.entry_id)


async def test_vacation_rewards_and_points(hass: HomeAssistant, mock_api) -> None:
    await _setup(hass)
    states = {s.entity_id: s for s in hass.states.async_all()}
    vacation = next(s for e, s in states.items() if e.startswith("binary_sensor."))
    assert vacation.state == "on"
    assert vacation.attributes["until"] == "2026-11-22"

    pending = next(s for e, s in states.items() if e.endswith("_pending_rewards") or e.endswith("_offene_wunsche"))
    assert pending.state == "1"
    assert pending.attributes["claims"][0] == {
        "claim_id": 7, "reward": "Glace", "icon": "🍦", "cost": 40, "user": "Lena", "requested_at": "2026-11-17T10:00:00Z"
    }

    lena = next(s for e, s in states.items() if e.endswith("punkte_lena"))
    assert lena.state == "80"
    assert lena.attributes["streak"] == 4
    assert lena.attributes["badges"] == ["🌱 Erste Schritte"]


async def test_reward_event_and_services(hass: HomeAssistant, mock_api) -> None:
    entry = await _setup(hass)
    events = []
    hass.bus.async_listen(EVENT_REWARD_REQUESTED, lambda e: events.append(e.data))

    mock_api.clear_requests()
    mock_api.get(f"{URL}/api/auth/me", json={"kind": "token", "user": None, "tokenName": "HA"})
    mock_api.get(f"{URL}/api/chores", json=CHORES)
    mock_api.get(f"{URL}/api/users", json=USERS)
    mock_api.get(f"{URL}/api/vacation", json=None)
    mock_api.get(f"{URL}/api/claims?status=pending", json=[*CLAIMS, claim(8, title="Filmabend", cost=80)])
    mock_api.get(f"{URL}/api/progress", json=PROGRESS)
    await entry.runtime_data.async_refresh()
    await hass.async_block_till_done()
    assert events == [{"claim_id": 8, "reward": "Filmabend", "icon": "🍦", "cost": 80, "user_id": 2, "user": "Lena"}]

    mock_api.post(f"{URL}/api/claims/8/approve", json=claim(8))
    mock_api.post(f"{URL}/api/claims/7/reject", json=claim(7))
    mock_api.put(f"{URL}/api/vacation", json=VACATION)
    mock_api.delete(f"{URL}/api/vacation", status=204)
    await hass.services.async_call(DOMAIN, "approve_reward", {"claim_id": 8}, blocking=True)
    await hass.services.async_call(DOMAIN, "reject_reward", {"claim_id": 7}, blocking=True)
    await hass.services.async_call(DOMAIN, "start_vacation", {"start": "2026-12-24", "until": "2027-01-03"}, blocking=True)
    await hass.services.async_call(DOMAIN, "end_vacation", {}, blocking=True)
    calls = [(c[0], str(c[1]), c[2]) for c in mock_api.mock_calls if c[0] != "GET"]
    assert ("POST", f"{URL}/api/claims/8/approve", {}) in calls
    assert ("POST", f"{URL}/api/claims/7/reject", {}) in calls
    assert ("PUT", f"{URL}/api/vacation", {"from": "2026-12-24", "until": "2027-01-03"}) in calls
    assert any(c[0] == "DELETE" for c in calls)


async def test_older_server_without_extras(hass: HomeAssistant, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/auth/me", json={"kind": "token", "user": None, "tokenName": "HA"})
    aioclient_mock.get(f"{URL}/api/chores", json=CHORES)
    aioclient_mock.get(f"{URL}/api/users", json=USERS)
    aioclient_mock.get(f"{URL}/api/vacation", status=404, json={"error": "Nicht gefunden"})
    entry = await _setup(hass)
    assert entry.state.value == "loaded"
    vacation = next(s for s in hass.states.async_all() if s.entity_id.startswith("binary_sensor."))
    assert vacation.state == "off"
