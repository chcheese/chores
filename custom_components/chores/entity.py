"""Shared entity base."""

from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import ChoresCoordinator


class ChoresEntity(CoordinatorEntity[ChoresCoordinator]):
    """All entities hang off one 'Haushalt' service device."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: ChoresCoordinator) -> None:
        super().__init__(coordinator)
        entry = coordinator.config_entry
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name="Haushalt",
            manufacturer="Chores",
            entry_type=DeviceEntryType.SERVICE,
            configuration_url=coordinator.api.base_url,
        )
