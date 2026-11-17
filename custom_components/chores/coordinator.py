"""Polling coordinator for the Chores integration."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import ChoresApi, ChoresAuthError, ChoresError, ChoresNotFoundError
from .const import DOMAIN, EVENT_REWARD_REQUESTED, EVENT_STATUS_CHANGED

_LOGGER = logging.getLogger(__name__)


@dataclass
class ChoresData:
    """Snapshot of the server state."""

    chores: dict[int, dict[str, Any]]
    users: dict[int, dict[str, Any]]
    vacation: dict[str, Any] | None = None
    pending_claims: list[dict[str, Any]] = field(default_factory=list)
    progress: dict[int, dict[str, Any]] = field(default_factory=dict)

    @property
    def due(self) -> list[dict[str, Any]]:
        return [c for c in self.chores.values() if c["status"] != "ok"]

    @property
    def overdue(self) -> list[dict[str, Any]]:
        return [c for c in self.chores.values() if c["status"] == "overdue"]


type ChoresConfigEntry = ConfigEntry[ChoresCoordinator]


class ChoresCoordinator(DataUpdateCoordinator[ChoresData]):
    """Fetches all active chores and users."""

    config_entry: ChoresConfigEntry

    def __init__(self, hass: HomeAssistant, entry: ChoresConfigEntry, api: ChoresApi, interval: timedelta) -> None:
        super().__init__(hass, _LOGGER, config_entry=entry, name=DOMAIN, update_interval=interval)
        self.api = api

    async def _async_update_data(self) -> ChoresData:
        try:
            chores = await self.api.chores()
            users = await self.api.users()
            extras = await self._fetch_extras()
        except ChoresAuthError as err:
            raise ConfigEntryAuthFailed(str(err)) from err
        except ChoresError as err:
            raise UpdateFailed(str(err)) from err

        data = ChoresData(chores={c["id"]: c for c in chores}, users={u["id"]: u for u in users}, **extras)
        self._fire_status_events(data)
        self._fire_reward_events(data)
        return data

    async def _fetch_extras(self) -> dict[str, Any]:
        """Vacation, reward wishes and progress (server 0.2+; skipped on older servers)."""
        try:
            return {
                "vacation": await self.api.vacation(),
                "pending_claims": await self.api.claims("pending"),
                "progress": {p["userId"]: p for p in await self.api.progress()},
            }
        except ChoresNotFoundError:
            return {}

    def _fire_reward_events(self, new: ChoresData) -> None:
        """Fire chores_reward_requested for each new reward wish (not on first load)."""
        if self.data is None:
            return
        known = {c["id"] for c in self.data.pending_claims}
        for claim in new.pending_claims:
            if claim["id"] in known:
                continue
            self.hass.bus.async_fire(
                EVENT_REWARD_REQUESTED,
                {
                    "claim_id": claim["id"],
                    "reward": claim["title"],
                    "icon": claim["icon"],
                    "cost": claim["cost"],
                    "user_id": claim["userId"],
                    "user": (new.users.get(claim["userId"]) or {}).get("name"),
                },
            )

    def _fire_status_events(self, new: ChoresData) -> None:
        """Fire chores_status_changed when a chore turns due/overdue/ok (not on first load)."""
        if self.data is None:
            return
        for chore_id, chore in new.chores.items():
            old = self.data.chores.get(chore_id)
            if old is None or old["status"] == chore["status"]:
                continue
            self.hass.bus.async_fire(
                EVENT_STATUS_CHANGED,
                {
                    "chore_id": chore_id,
                    "title": chore["title"],
                    "old_status": old["status"],
                    "new_status": chore["status"],
                    "next_due": chore["nextDue"],
                    "assignee": (chore.get("assignee") or {}).get("name"),
                },
            )
