"""Catalog coordinator for Logbook."""

from __future__ import annotations

from datetime import timedelta
import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import LogbookClient
from .const import DOMAIN
from .exceptions import LogbookApiError, LogbookAuthError, LogbookConnectionError
from .models import VoiceCatalog

_LOGGER = logging.getLogger(__name__)


class LogbookCoordinator(DataUpdateCoordinator[VoiceCatalog]):
    """Keep the active voice catalog ready before each LLM request."""

    def __init__(
        self,
        hass,
        entry: ConfigEntry,
        client: LogbookClient,
        refresh_interval: int,
    ) -> None:
        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=f"{DOMAIN} catalog",
            update_interval=timedelta(seconds=refresh_interval),
            always_update=False,
        )
        self.client = client

    async def _async_update_data(self) -> VoiceCatalog:
        try:
            return await self.client.async_voice_catalog()
        except LogbookAuthError as err:
            raise ConfigEntryAuthFailed(str(err)) from err
        except (LogbookConnectionError, LogbookApiError) as err:
            raise UpdateFailed(str(err)) from err
