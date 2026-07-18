"""Runtime data container for Logbook."""

from __future__ import annotations

from dataclasses import dataclass

from .api import LogbookClient
from .coordinator import LogbookCoordinator


@dataclass(slots=True)
class LogbookRuntime:
    """Objects owned by one Logbook config entry."""

    client: LogbookClient
    coordinator: LogbookCoordinator
    capabilities: dict
