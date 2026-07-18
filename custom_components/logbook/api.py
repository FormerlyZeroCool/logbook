"""Async client for the Logbook backend."""

from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from aiohttp import ClientError, ClientSession, ClientTimeout

from .exceptions import LogbookApiError, LogbookAuthError, LogbookConnectionError
from .models import VoiceCatalog


def normalize_base_url(value: str) -> str:
    """Normalize a user supplied backend URL."""
    stripped = value.strip().rstrip("/")
    if stripped.endswith("/api/v1"):
        stripped = stripped[:-7]
    parsed = urlsplit(stripped)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Enter a complete http:// or https:// URL")
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path.rstrip("/"), "", ""))


class LogbookClient:
    """Small HTTP client that preserves omitted-versus-null JSON fields."""

    def __init__(self, session: ClientSession, base_url: str, api_key: str) -> None:
        self._session = session
        self.base_url = normalize_base_url(base_url)
        self._api_key = api_key
        self._timeout = ClientTimeout(total=15)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
        authenticated: bool = True,
    ) -> dict[str, Any]:
        headers: dict[str, str] = {"Accept": "application/json"}
        if authenticated:
            headers["Authorization"] = f"Bearer {self._api_key}"
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        if json is not None:
            headers["Content-Type"] = "application/json"

        try:
            async with self._session.request(
                method,
                f"{self.base_url}{path}",
                headers=headers,
                json=json,
                timeout=self._timeout,
            ) as response:
                if response.status == 204:
                    payload: dict[str, Any] = {}
                else:
                    try:
                        decoded = await response.json(content_type=None)
                        payload = decoded if isinstance(decoded, dict) else {"result": decoded}
                    except (ValueError, TypeError):
                        payload = {"message": await response.text()}

                if response.status == 401:
                    raise LogbookAuthError(
                        str(payload.get("message") or "The Logbook API key was rejected"),
                        status=response.status,
                        code=str(payload.get("error") or "unauthorized"),
                    )
                if response.status >= 400:
                    raise LogbookApiError(
                        str(payload.get("message") or f"Logbook returned HTTP {response.status}"),
                        status=response.status,
                        code=str(payload.get("error") or "api_error"),
                    )
                return payload
        except LogbookApiError:
            raise
        except (ClientError, asyncio.TimeoutError) as err:
            raise LogbookConnectionError(f"Could not connect to Logbook at {self.base_url}") from err

    async def async_health(self) -> dict[str, Any]:
        return await self._request("GET", "/health", authenticated=False)

    async def async_capabilities(self) -> dict[str, Any]:
        return await self._request("GET", "/api/v1/capabilities")

    async def async_voice_catalog(self) -> VoiceCatalog:
        return VoiceCatalog.from_dict(await self._request("GET", "/api/v1/voice-catalog"))

    async def async_list_event_types(self) -> dict[str, Any]:
        return await self._request("GET", "/api/v1/voice-catalog")

    async def async_log_point(self, payload: dict[str, Any], call_id: str) -> dict[str, Any]:
        return await self._request("POST", "/api/v1/events/log", json=payload, idempotency_key=call_id)

    async def async_start_duration(self, payload: dict[str, Any], call_id: str) -> dict[str, Any]:
        return await self._request("POST", "/api/v1/events/start", json=payload, idempotency_key=call_id)

    async def async_finish_duration(self, payload: dict[str, Any], call_id: str) -> dict[str, Any]:
        return await self._request("POST", "/api/v1/events/end", json=payload, idempotency_key=call_id)

    async def async_get_latest(self, event_type_key: str) -> dict[str, Any]:
        return await self._request("GET", f"/api/v1/event-types/{event_type_key}/latest-event")

    async def async_update_latest(self, event_type_key: str, payload: dict[str, Any], call_id: str) -> dict[str, Any]:
        return await self._request(
            "PATCH",
            f"/api/v1/event-types/{event_type_key}/latest-event",
            json=payload,
            idempotency_key=call_id,
        )
