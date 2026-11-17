"""Small async client for the Chores REST API."""

from __future__ import annotations

from typing import Any

import aiohttp


class ChoresError(Exception):
    """Generic API error."""


class ChoresAuthError(ChoresError):
    """Token missing or rejected."""


class ChoresConnectionError(ChoresError):
    """Server not reachable."""


class ChoresApi:
    """Talks to the Chores server with an API token."""

    def __init__(self, session: aiohttp.ClientSession, url: str, token: str) -> None:
        self._session = session
        self._base = url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {token}"}

    @property
    def base_url(self) -> str:
        return self._base

    async def _request(self, method: str, path: str, json: dict[str, Any] | None = None) -> Any:
        try:
            async with self._session.request(
                method,
                f"{self._base}{path}",
                headers=self._headers,
                json=json,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status == 401:
                    raise ChoresAuthError("Token ungültig")
                if resp.status == 204:
                    return None
                data = await resp.json(content_type=None)
                if resp.status >= 400:
                    msg = data.get("error") if isinstance(data, dict) else None
                    raise ChoresError(msg or f"HTTP {resp.status}")
                return data
        except (aiohttp.ClientError, TimeoutError) as err:
            raise ChoresConnectionError(str(err)) from err

    async def me(self) -> dict[str, Any]:
        return await self._request("GET", "/api/auth/me")

    async def health(self) -> dict[str, Any]:
        return await self._request("GET", "/api/health")

    async def chores(self) -> list[dict[str, Any]]:
        return await self._request("GET", "/api/chores")

    async def users(self) -> list[dict[str, Any]]:
        return await self._request("GET", "/api/users")

    async def complete(self, chore_id: int, user_id: int | None = None, note: str | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if user_id is not None:
            body["user_id"] = user_id
        if note:
            body["note"] = note
        return await self._request("POST", f"/api/chores/{chore_id}/complete", body)

    async def skip(self, chore_id: int, note: str | None = None) -> dict[str, Any]:
        return await self._request("POST", f"/api/chores/{chore_id}/skip", {"note": note} if note else {})

    async def snooze(self, chore_id: int, days: int) -> dict[str, Any]:
        return await self._request("POST", f"/api/chores/{chore_id}/snooze", {"days": days})

    async def increment_counter(self, chore_id: int, by: int = 1) -> dict[str, Any]:
        return await self._request("POST", f"/api/chores/{chore_id}/counter", {"by": by})
