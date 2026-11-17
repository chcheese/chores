"""Config flow for the Chores integration."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.const import CONF_TOKEN, CONF_URL
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import ChoresApi, ChoresAuthError, ChoresConnectionError, ChoresError
from .const import CONF_CHORE_SENSORS, CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL, DOMAIN


class ChoresConfigFlow(ConfigFlow, domain=DOMAIN):
    """Ask for server URL + API token."""

    VERSION = 1

    async def _validate(self, url: str, token: str) -> dict[str, str]:
        api = ChoresApi(async_get_clientsession(self.hass), url, token)
        try:
            me = await api.me()
        except ChoresAuthError:
            return {"base": "invalid_auth"}
        except ChoresConnectionError:
            return {"base": "cannot_connect"}
        except ChoresError:
            return {"base": "unknown"}
        if me.get("kind") != "token":
            return {"base": "invalid_auth"}
        return {}

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            url = user_input[CONF_URL].rstrip("/")
            await self.async_set_unique_id(url.lower())
            self._abort_if_unique_id_configured()
            errors = await self._validate(url, user_input[CONF_TOKEN])
            if not errors:
                return self.async_create_entry(title="Haushalt", data={CONF_URL: url, CONF_TOKEN: user_input[CONF_TOKEN]})
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_URL, default=(user_input or {}).get(CONF_URL, "http://")): str,
                    vol.Required(CONF_TOKEN): str,
                }
            ),
            errors=errors,
        )

    async def async_step_reauth(self, entry_data: Mapping[str, Any]) -> ConfigFlowResult:
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        entry = self._get_reauth_entry()
        if user_input is not None:
            errors = await self._validate(entry.data[CONF_URL], user_input[CONF_TOKEN])
            if not errors:
                return self.async_update_reload_and_abort(entry, data_updates={CONF_TOKEN: user_input[CONF_TOKEN]})
        return self.async_show_form(step_id="reauth_confirm", data_schema=vol.Schema({vol.Required(CONF_TOKEN): str}), errors=errors)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: Any) -> ChoresOptionsFlow:
        return ChoresOptionsFlow()


class ChoresOptionsFlow(OptionsFlow):
    """Polling interval and per-chore sensors."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        opts = self.config_entry.options
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_SCAN_INTERVAL, default=opts.get(CONF_SCAN_INTERVAL, int(DEFAULT_SCAN_INTERVAL.total_seconds()))
                    ): vol.All(vol.Coerce(int), vol.Range(min=15, max=3600)),
                    vol.Required(CONF_CHORE_SENSORS, default=opts.get(CONF_CHORE_SENSORS, True)): bool,
                }
            ),
        )
