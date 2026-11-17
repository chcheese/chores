"""Sensors: due/overdue counts and one next-due date sensor per chore."""

from __future__ import annotations

from datetime import date
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import CONF_CHORE_SENSORS
from .coordinator import ChoresConfigEntry, ChoresCoordinator
from .entity import ChoresEntity


def _brief(c: dict[str, Any]) -> dict[str, Any]:
    return {
        "chore_id": c["id"],
        "title": c["title"],
        "icon": c["icon"],
        "status": c["status"],
        "next_due": c["nextDue"],
        "days_until_due": c["daysUntilDue"],
        "assignee": (c.get("assignee") or {}).get("name"),
        "duration_minutes": c.get("durationMinutes"),
    }


async def async_setup_entry(hass: HomeAssistant, entry: ChoresConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    coordinator = entry.runtime_data
    async_add_entities([DueCountSensor(coordinator), OverdueCountSensor(coordinator), PendingRewardsSensor(coordinator)])

    chore_sensors = entry.options.get(CONF_CHORE_SENSORS, True)
    known_chores: set[int] = set()
    known_users: set[int] = set()

    @callback
    def add_new() -> None:
        entities: list[SensorEntity] = []
        if chore_sensors:
            new = [cid for cid in coordinator.data.chores if cid not in known_chores]
            known_chores.update(new)
            entities += [ChoreSensor(coordinator, cid) for cid in new]
        users = [uid for uid in coordinator.data.progress if uid not in known_users]
        known_users.update(users)
        entities += [PointsSensor(coordinator, uid) for uid in users]
        if entities:
            async_add_entities(entities)

    add_new()
    entry.async_on_unload(coordinator.async_add_listener(add_new))


class DueCountSensor(ChoresEntity, SensorEntity):
    """Number of due + overdue chores, list in attributes."""

    _attr_translation_key = "due"
    _attr_icon = "mdi:broom"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_native_unit_of_measurement = "Aufgaben"

    def __init__(self, coordinator: ChoresCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_due"

    @property
    def native_value(self) -> int:
        return len(self.coordinator.data.due)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        due = self.coordinator.data.due
        return {
            "chores": [_brief(c) for c in due],
            "total_minutes": sum(c.get("durationMinutes") or 0 for c in due),
            "vacation": bool((self.coordinator.data.vacation or {}).get("active")),
        }


class OverdueCountSensor(ChoresEntity, SensorEntity):
    """Number of overdue chores."""

    _attr_translation_key = "overdue"
    _attr_icon = "mdi:alert-circle-outline"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_native_unit_of_measurement = "Aufgaben"

    def __init__(self, coordinator: ChoresCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_overdue"

    @property
    def native_value(self) -> int:
        return len(self.coordinator.data.overdue)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {"chores": [_brief(c) for c in self.coordinator.data.overdue]}


class ChoreSensor(ChoresEntity, SensorEntity):
    """Next due date of one chore; status, counter etc. as attributes."""

    _attr_device_class = SensorDeviceClass.DATE

    def __init__(self, coordinator: ChoresCoordinator, chore_id: int) -> None:
        super().__init__(coordinator)
        self._chore_id = chore_id
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_chore_{chore_id}"

    @property
    def _chore(self) -> dict[str, Any] | None:
        return self.coordinator.data.chores.get(self._chore_id)

    @property
    def available(self) -> bool:
        # Deleted/deactivated chores become unavailable instead of vanishing silently.
        return super().available and self._chore is not None

    @property
    def name(self) -> str | None:
        c = self._chore
        return c["title"] if c else f"Aufgabe {self._chore_id}"

    @property
    def icon(self) -> str:
        c = self._chore
        if not c:
            return "mdi:checkbox-blank-circle-outline"
        return {"overdue": "mdi:alert-circle", "due": "mdi:clock-alert-outline"}.get(c["status"], "mdi:check-circle-outline")

    @property
    def native_value(self) -> date | None:
        c = self._chore
        return date.fromisoformat(c["nextDue"]) if c else None

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        c = self._chore
        if not c:
            return None
        attrs = _brief(c) | {
            "room": c["room"],
            "points": c["points"],
            "last_done": c["lastDone"],
            "schedule_type": c["scheduleType"],
            "freshness": c.get("freshness"),
            "in_season": c.get("inSeason", True),
            "active_months": c.get("activeMonths", []),
        }
        if c.get("counterTarget") is not None:
            attrs |= {"counter_value": c["counterValue"], "counter_target": c["counterTarget"], "counter_label": c["counterLabel"]}
        return attrs


class PendingRewardsSensor(ChoresEntity, SensorEntity):
    """Reward wishes waiting for an adult; list in attributes."""

    _attr_translation_key = "pending_rewards"
    _attr_icon = "mdi:gift-outline"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator: ChoresCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_pending_rewards"

    @property
    def native_value(self) -> int:
        return len(self.coordinator.data.pending_claims)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        users = self.coordinator.data.users
        return {
            "claims": [
                {
                    "claim_id": c["id"],
                    "reward": c["title"],
                    "icon": c["icon"],
                    "cost": c["cost"],
                    "kind": c.get("kind", "reward"),
                    "amount_chf": c["amountRappen"] / 100 if c.get("amountRappen") else None,
                    "user": (users.get(c["userId"]) or {}).get("name"),
                    "requested_at": c["requestedAt"],
                }
                for c in self.coordinator.data.pending_claims
            ]
        }


class PointsSensor(ChoresEntity, SensorEntity):
    """Spendable points of one person; level, streak and badges as attributes."""

    _attr_icon = "mdi:star-circle-outline"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_native_unit_of_measurement = "Punkte"

    def __init__(self, coordinator: ChoresCoordinator, user_id: int) -> None:
        super().__init__(coordinator)
        self._user_id = user_id
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_points_{user_id}"

    @property
    def _progress(self) -> dict[str, Any] | None:
        return self.coordinator.data.progress.get(self._user_id)

    @property
    def available(self) -> bool:
        return super().available and self._progress is not None

    @property
    def name(self) -> str:
        user = self.coordinator.data.users.get(self._user_id) or {}
        return f"Punkte {user.get('name', self._user_id)}"

    @property
    def native_value(self) -> int | None:
        p = self._progress
        return p["balance"] if p else None

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        p = self._progress
        if not p:
            return None
        return {
            "user_id": self._user_id,
            "points_total": p["pointsTotal"],
            "level": p["level"],
            "next_level_at": p["levelNext"],
            "streak": p["streak"],
            "best_streak": p["bestStreak"],
            "done_this_week": p["doneThisWeek"],
            "badges": [f"{b['icon']} {b['title']}" for b in p["badges"] if b["earnedAt"]],
            "allowance_chf": p["allowanceRappen"] / 100 if p.get("allowanceRappen") is not None else None,
        }
