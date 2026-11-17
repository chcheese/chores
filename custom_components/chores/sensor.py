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
    }


async def async_setup_entry(hass: HomeAssistant, entry: ChoresConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    coordinator = entry.runtime_data
    async_add_entities([DueCountSensor(coordinator), OverdueCountSensor(coordinator)])

    if not entry.options.get(CONF_CHORE_SENSORS, True):
        return

    known: set[int] = set()

    @callback
    def add_new() -> None:
        new = [cid for cid in coordinator.data.chores if cid not in known]
        known.update(new)
        if new:
            async_add_entities([ChoreSensor(coordinator, cid) for cid in new])

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
        return {"chores": [_brief(c) for c in self.coordinator.data.due]}


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
        }
        if c.get("counterTarget") is not None:
            attrs |= {"counter_value": c["counterValue"], "counter_target": c["counterTarget"], "counter_label": c["counterLabel"]}
        return attrs
