from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app


def _build_client(monkeypatch: pytest.MonkeyPatch, store_path: Path) -> TestClient:
    monkeypatch.setenv("AUTH_REQUIRED", "false")
    monkeypatch.setenv("SUPABASE_URL", "")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "")
    monkeypatch.setenv("LOCAL_AUTH_ENABLED", "true")
    monkeypatch.setenv("LOCAL_AUTH_STORE_PATH", str(store_path))
    get_settings.cache_clear()
    return TestClient(create_app())


def test_local_signup_login_and_me(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    store_path = tmp_path / "local-auth-users.json"

    with _build_client(monkeypatch, store_path) as client:
        signup = client.post(
            "/api/v1/auth/signup",
            json={
                "email": "analyst@example.com",
                "password": "AtlasDemo123!",
                "full_name": "Atlas Analyst",
            },
        )
        assert signup.status_code == 200
        session = signup.json()
        assert session["user"]["email"] == "analyst@example.com"
        assert session["user"]["full_name"] == "Atlas Analyst"
        assert session["access_token"]

        me = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {session['access_token']}"},
        )
        assert me.status_code == 200
        assert me.json() == {
            "id": session["user"]["id"],
            "email": "analyst@example.com",
            "full_name": "Atlas Analyst",
        }

        login = client.post(
            "/api/v1/auth/login",
            json={
                "email": "analyst@example.com",
                "password": "AtlasDemo123!",
            },
        )
        assert login.status_code == 200
        assert login.json()["user"]["email"] == "analyst@example.com"
    get_settings.cache_clear()


def test_local_auth_bootstrap_and_invalid_token(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    store_path = tmp_path / "local-auth-users.json"

    with _build_client(monkeypatch, store_path) as client:
        bootstrap = client.post("/api/v1/auth/bootstrap-test-user")
        assert bootstrap.status_code == 200
        session = bootstrap.json()
        assert session["user"]["email"].endswith("@demo.local")

        invalid = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer not-a-real-token"},
        )
        assert invalid.status_code == 401
        assert invalid.json()["detail"] == "Invalid authentication token."
    get_settings.cache_clear()
