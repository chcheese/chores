"""The Chores (Haushaltsaufgaben) integration."""

from __future__ import annotations

from datetime import timedelta

import voluptuous as vol

from homeassistant.const import CONF_TOKEN, CONF_URL, Platform
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.typing import ConfigType

from .api import ChoresApi, ChoresError
from .const import (
    ATTR_BY,
    ATTR_CHORE_ID,
    ATTR_CONFIG_ENTRY_ID,
    ATTR_DAYS,
    ATTR_NOTE,
    ATTR_USER_ID,
    CONF_SCAN_INTERVAL,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    SERVICE_COMPLETE,
    SERVICE_INCREMENT_COUNTER,
    SERVICE_SKIP,
    SERVICE_SNOOZE,
)
from .coordinator import ChoresConfigEntry, ChoresCoordinator

PLATFORMS = [Platform.SENSOR, Platform.TODO]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

_BASE = {vol.Required(ATTR_CHORE_ID): cv.positive_int, vol.Optional(ATTR_CONFIG_ENTRY_ID): cv.string}
SCHEMAS = {
    SERVICE_COMPLETE: vol.Schema({**_BASE, vol.Optional(ATTR_USER_ID): cv.positive_int, vol.Optional(ATTR_NOTE): cv.string}),
    SERVICE_SKIP: vol.Schema({**_BASE, vol.Optional(ATTR_NOTE): cv.string}),
    SERVICE_SNOOZE: vol.Schema({**_BASE, vol.Optional(ATTR_DAYS, default=1): vol.All(vol.Coerce(int), vol.Range(min=1, max=365))}),
    SERVICE_INCREMENT_COUNTER: vol.Schema(
        {**_BASE, vol.Optional(ATTR_BY, default=1): vol.All(vol.Coerce(int), vol.Range(min=-1000, max=1000))}
    ),
}


def _coordinator(hass: HomeAssistant, call: ServiceCall) -> ChoresCoordinator:
    entries: list[ChoresConfigEntry] = [e for e in hass.config_entries.async_loaded_entries(DOMAIN)]
    wanted = call.data.get(ATTR_CONFIG_ENTRY_ID)
    if wanted:
        entries = [e for e in entries if e.entry_id == wanted]
    if not entries:
        raise ServiceValidationError("Keine geladene Chores-Instanz gefunden")
    return entries[0].runtime_data


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the services once, independent of config entries."""

    async def handle(call: ServiceCall) -> dict | None:
        coord = _coordinator(hass, call)
        chore_id = call.data[ATTR_CHORE_ID]
        try:
            if call.service == SERVICE_COMPLETE:
                result = await coord.api.complete(chore_id, call.data.get(ATTR_USER_ID), call.data.get(ATTR_NOTE))
            elif call.service == SERVICE_SKIP:
                result = await coord.api.skip(chore_id, call.data.get(ATTR_NOTE))
            elif call.service == SERVICE_SNOOZE:
                result = await coord.api.snooze(chore_id, call.data[ATTR_DAYS])
            else:
                result = await coord.api.increment_counter(chore_id, call.data[ATTR_BY])
        except ChoresError as err:
            raise HomeAssistantError(f"Chores: {err}") from err
        await coord.async_request_refresh()
        chore = result.get("chore", result) if isinstance(result, dict) else None
        return {"chore": chore} if call.return_response else None

    for name, schema in SCHEMAS.items():
        hass.services.async_register(DOMAIN, name, handle, schema=schema, supports_response=SupportsResponse.OPTIONAL)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ChoresConfigEntry) -> bool:
    api = ChoresApi(async_get_clientsession(hass), entry.data[CONF_URL], entry.data[CONF_TOKEN])
    seconds = entry.options.get(CONF_SCAN_INTERVAL)
    interval = timedelta(seconds=seconds) if seconds else DEFAULT_SCAN_INTERVAL
    coordinator = ChoresCoordinator(hass, entry, api, interval)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_reload_on_options))
    return True


async def _reload_on_options(hass: HomeAssistant, entry: ChoresConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ChoresConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
