from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4

from jose import JWTError, jwt

from app.config import Settings, get_settings

LOCAL_AUTH_ALGORITHM = "HS256"
LOCAL_AUTH_AUDIENCE = "atlas-local"
LOCAL_AUTH_ISSUER = "atlas-local-auth"
PBKDF2_ITERATIONS = 240_000

_LOCAL_AUTH_LOCK = Lock()


def is_local_auth_active(settings: Settings | None = None) -> bool:
    settings = settings or get_settings()
    environment = str(settings.app_env or "dev").strip().lower()
    return bool(
        settings.local_auth_enabled
        and (
            not settings.auth_required
            or environment in {"dev", "local", "test"}
            or not settings.supabase_url
            or not settings.supabase_anon_key
        )
    )


def authenticate_local_user(email: str, password: str) -> dict[str, Any] | None:
    user = _find_local_user_by_email(email)
    if not user or not _verify_password(password, user):
        return None
    return build_local_session(user)


def create_local_user(email: str, password: str, full_name: str = "") -> dict[str, Any]:
    normalized_email = _normalize_email(email)
    cleaned_name = str(full_name or "").strip()
    with _LOCAL_AUTH_LOCK:
        payload = _read_store_payload()
        users = payload.get("users") or []
        if any(_normalize_email(user.get("email", "")) == normalized_email for user in users):
            raise ValueError("An account with this email already exists.")

        now = datetime.now(UTC).isoformat()
        salt_hex = secrets.token_hex(16)
        user = {
            "id": str(uuid4()),
            "email": normalized_email,
            "full_name": cleaned_name,
            "password_salt": salt_hex,
            "password_hash": _hash_password(password, salt_hex),
            "created_at": now,
            "updated_at": now,
        }
        users.append(user)
        payload["users"] = users
        _write_store_payload(payload)
    return build_local_session(user)


def ensure_local_user(email: str, password: str, full_name: str = "") -> dict[str, Any]:
    normalized_email = _normalize_email(email)
    cleaned_name = str(full_name or "").strip()
    with _LOCAL_AUTH_LOCK:
        payload = _read_store_payload()
        users = payload.get("users") or []
        user = next((item for item in users if _normalize_email(item.get("email", "")) == normalized_email), None)
        now = datetime.now(UTC).isoformat()
        if user is None:
            salt_hex = secrets.token_hex(16)
            user = {
                "id": str(uuid4()),
                "email": normalized_email,
                "full_name": cleaned_name,
                "password_salt": salt_hex,
                "password_hash": _hash_password(password, salt_hex),
                "created_at": now,
                "updated_at": now,
            }
            users.append(user)
        else:
            salt_hex = user.get("password_salt") or secrets.token_hex(16)
            user["password_salt"] = salt_hex
            user["password_hash"] = _hash_password(password, salt_hex)
            user["full_name"] = cleaned_name or str(user.get("full_name", "")).strip()
            user["updated_at"] = now

        payload["users"] = users
        _write_store_payload(payload)
    return build_local_session(user)


def decode_local_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        return jwt.decode(
            token,
            settings.local_auth_secret,
            algorithms=[LOCAL_AUTH_ALGORITHM],
            audience=LOCAL_AUTH_AUDIENCE,
            issuer=LOCAL_AUTH_ISSUER,
        )
    except JWTError as exc:
        raise ValueError("Invalid authentication token.") from exc


def build_local_session(user: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    expires_in = max(int(settings.local_auth_session_hours), 1) * 3600
    now = datetime.now(UTC)
    payload = {
        "sub": str(user.get("id", "")),
        "email": str(user.get("email", "")),
        "full_name": str(user.get("full_name", "")),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=expires_in)).timestamp()),
        "aud": LOCAL_AUTH_AUDIENCE,
        "iss": LOCAL_AUTH_ISSUER,
    }
    access_token = jwt.encode(payload, settings.local_auth_secret, algorithm=LOCAL_AUTH_ALGORITHM)
    return {
        "access_token": access_token,
        "refresh_token": "",
        "token_type": "bearer",
        "expires_in": expires_in,
        "user": {
            "id": str(user.get("id", "")),
            "email": str(user.get("email", "")),
            "full_name": str(user.get("full_name", "")),
        },
    }


def get_local_user_from_token(token: str) -> dict[str, Any]:
    payload = decode_local_token(token)
    return {
        "id": str(payload.get("sub", "")),
        "email": str(payload.get("email", "")),
        "full_name": str(payload.get("full_name", "")),
    }


def _find_local_user_by_email(email: str) -> dict[str, Any] | None:
    normalized_email = _normalize_email(email)
    payload = _read_store_payload()
    users = payload.get("users") or []
    return next((user for user in users if _normalize_email(user.get("email", "")) == normalized_email), None)


def _hash_password(password: str, salt_hex: str) -> str:
    salt = bytes.fromhex(salt_hex)
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS).hex()


def _verify_password(password: str, user: dict[str, Any]) -> bool:
    salt_hex = str(user.get("password_salt", ""))
    expected_hash = str(user.get("password_hash", ""))
    if not salt_hex or not expected_hash:
        return False
    candidate_hash = _hash_password(password, salt_hex)
    return hmac.compare_digest(candidate_hash, expected_hash)


def _normalize_email(email: str) -> str:
    return str(email or "").strip().lower()


def _store_path() -> Path:
    settings = get_settings()
    path = Path(settings.local_auth_store_path).expanduser()
    if path.is_absolute():
        return path
    backend_root = Path(__file__).resolve().parents[1]
    return backend_root / path


def _read_store_payload() -> dict[str, Any]:
    path = _store_path()
    if not path.exists():
        return {"users": []}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"users": []}


def _write_store_payload(payload: dict[str, Any]) -> None:
    path = _store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
