"""Exceptions for the Logbook integration."""

from __future__ import annotations


class LogbookApiError(Exception):
    """Base error returned by the Logbook backend."""

    def __init__(self, message: str, *, status: int | None = None, code: str | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code


class LogbookAuthError(LogbookApiError):
    """Authentication failed."""


class LogbookConnectionError(LogbookApiError):
    """The backend could not be reached."""
