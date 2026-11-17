"""Binary sensor: vacation mode."""

from __future__ import annotations

from typing import Any

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import ChoresConfigEntry, ChoresCoordinator
from .entity import ChoresEntity


async def async_setup_entry(hass: HomeAssistant, entry: ChoresConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    async_add_entities([VacationSensor(entry.runtime_data)])


class VacationSensor(ChoresEntity, BinarySensorEntity):
    """On while vacation mode is active (nothing is due)."""

    _attr_translation_key = "vacation"
    _attr_icon = "mdi:beach"

    def __init__(self, coordinator: ChoresCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_vacation"

    @property
    def is_on(self) -> bool:
        return bool((self.coordinator.data.vacation or {}).get("active"))

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        v = self.coordinator.data.vacation
        return {"start": v["from"] if v else None, "until": v["until"] if v else None, "planned": bool(v and not v.get("active"))}
