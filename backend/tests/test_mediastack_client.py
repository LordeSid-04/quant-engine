from __future__ import annotations

import pytest

from app.config import get_settings
from app.data.mediastack_client import MediaStackClient


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


class _FakeAsyncClient:
    call_count = 0

    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def get(self, url: str, params: dict | None = None):
        type(self).call_count += 1
        return _FakeResponse(
            429,
            {
                "error": {
                    "code": "usage_limit_reached",
                    "message": "Your monthly usage limit has been reached.",
                }
            },
        )


@pytest.mark.asyncio
async def test_mediastack_usage_limit_enables_backoff(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MEDIASTACK_API_KEY", "demo-key")
    get_settings.cache_clear()
    _FakeAsyncClient.call_count = 0
    monkeypatch.setattr("app.data.mediastack_client.httpx.AsyncClient", _FakeAsyncClient)

    client = MediaStackClient()

    first = await client.fetch_news(
        keywords="rates",
        categories="business",
        languages="en",
        limit=10,
    )
    second = await client.fetch_news(
        keywords="rates",
        categories="business",
        languages="en",
        limit=10,
    )

    assert first == []
    assert second == []
    assert client.last_error_code == "usage_limit_reached"
    assert client.configured is False
    assert _FakeAsyncClient.call_count == 1

    get_settings.cache_clear()
