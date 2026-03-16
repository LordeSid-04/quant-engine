from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class MediaStackClient:
    def __init__(self) -> None:
        settings = get_settings()
        self.access_key = str(settings.mediastack_api_key or "").strip()
        self.base_url = str(settings.mediastack_base_url or "https://api.mediastack.com/v1").rstrip("/")
        self.timeout_seconds = min(max(2.0, float(settings.mediastack_timeout_seconds)), 2.75)
        self._disabled_until: datetime | None = None
        self._last_error_code = ""

    @property
    def configured(self) -> bool:
        return bool(self.access_key) and not self._is_temporarily_disabled()

    @property
    def last_error_code(self) -> str:
        return self._last_error_code

    async def fetch_news(
        self,
        *,
        keywords: str,
        categories: str,
        languages: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        if not self.access_key or self._is_temporarily_disabled():
            return []

        url = f"{self.base_url}/news"
        params = {
            "access_key": self.access_key,
            "keywords": keywords,
            "categories": categories,
            "languages": languages,
            "sort": "published_desc",
            "limit": str(max(1, min(100, int(limit)))),
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds, follow_redirects=True) as client:
                response = await client.get(url, params=params)
        except Exception as exc:
            self._last_error_code = "request_failed"
            logger.debug("MediaStack request failed.", exc_info=exc)
            return []

        payload = self._response_payload(response)
        if response.status_code >= 400:
            self._apply_error_backoff(response.status_code, payload)
            return []

        if not isinstance(payload, dict):
            self._last_error_code = "invalid_payload"
            return []
        error_payload = payload.get("error")
        if error_payload:
            self._apply_error_backoff(response.status_code or 400, payload)
            return []
        items = payload.get("data", [])
        if not isinstance(items, list):
            self._last_error_code = "invalid_data"
            return []
        self._last_error_code = ""
        return [item for item in items if isinstance(item, dict)]

    def _is_temporarily_disabled(self) -> bool:
        return self._disabled_until is not None and datetime.now(UTC) < self._disabled_until

    def _response_payload(self, response: httpx.Response) -> dict[str, Any]:
        try:
            payload = response.json()
        except Exception:
            return {}
        return payload if isinstance(payload, dict) else {}

    def _apply_error_backoff(self, status_code: int, payload: dict[str, Any]) -> None:
        error = payload.get("error") if isinstance(payload, dict) else {}
        error_code = str(error.get("code") or f"http_{status_code}").strip().lower()
        self._last_error_code = error_code
        if status_code not in {401, 403, 429} and error_code not in {"usage_limit_reached", "invalid_access_key"}:
            return

        cooldown_hours = 12 if error_code == "usage_limit_reached" else 1
        self._disabled_until = datetime.now(UTC) + timedelta(hours=cooldown_hours)
        logger.warning(
            "MediaStack disabled for %sh after %s (status %s).",
            cooldown_hours,
            error_code,
            status_code,
        )
