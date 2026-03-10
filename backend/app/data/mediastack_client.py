from __future__ import annotations

from typing import Any

import httpx

from app.config import get_settings


class MediaStackClient:
    def __init__(self) -> None:
        settings = get_settings()
        self.access_key = str(settings.mediastack_api_key or "").strip()
        self.base_url = str(settings.mediastack_base_url or "http://api.mediastack.com/v1").rstrip("/")
        self.timeout_seconds = max(2.0, float(settings.mediastack_timeout_seconds))

    @property
    def configured(self) -> bool:
        return bool(self.access_key)

    async def fetch_news(
        self,
        *,
        keywords: str,
        categories: str,
        languages: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        if not self.configured:
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
            if response.status_code >= 400:
                return []
            payload = response.json()
        except Exception:
            return []

        if not isinstance(payload, dict):
            return []
        if payload.get("error"):
            return []
        items = payload.get("data", [])
        if not isinstance(items, list):
            return []
        return [item for item in items if isinstance(item, dict)]
