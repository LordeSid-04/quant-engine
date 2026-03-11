from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, Header, HTTPException, status

from app.config import get_settings
from app.schemas.auth import AuthSessionResponse, AuthUserResponse, LoginRequest, SignupRequest, TestAccountResponse

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _require_supabase() -> tuple[str, str, float]:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase auth is not configured.",
        )
    return settings.supabase_url.rstrip("/"), settings.supabase_anon_key, settings.auth_timeout_seconds


def _service_role_headers() -> dict[str, str]:
    settings = get_settings()
    if not settings.supabase_service_role_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase service role key is not configured.",
        )
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }


def _map_user(payload: dict[str, Any]) -> AuthUserResponse:
    metadata = payload.get("user_metadata") or payload.get("raw_user_meta_data") or {}
    return AuthUserResponse(
        id=str(payload.get("id", "")),
        email=payload.get("email", ""),
        full_name=str(metadata.get("full_name") or metadata.get("name") or ""),
    )


def _map_session(payload: dict[str, Any]) -> AuthSessionResponse:
    user_payload = payload.get("user") or {}
    return AuthSessionResponse(
        access_token=payload.get("access_token", ""),
        refresh_token=payload.get("refresh_token", ""),
        token_type=payload.get("token_type", "bearer"),
        expires_in=int(payload.get("expires_in") or 3600),
        user=_map_user(user_payload),
    )


async def _supabase_login(email: str, password: str) -> dict[str, Any]:
    supabase_url, anon_key, timeout = _require_supabase()
    headers = {
        "apikey": anon_key,
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            f"{supabase_url}/auth/v1/token?grant_type=password",
            headers=headers,
            json={"email": email, "password": password},
        )
    if response.status_code != status.HTTP_200_OK:
        detail = response.json().get("msg") if response.headers.get("content-type", "").startswith("application/json") else ""
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail or "Invalid email or password.")
    return response.json()


async def _find_user_by_email(email: str) -> dict[str, Any] | None:
    settings = get_settings()
    supabase_url, _, timeout = _require_supabase()
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.get(
            f"{supabase_url}/auth/v1/admin/users",
            headers=_service_role_headers(),
            params={"page": 1, "per_page": 1000},
        )
    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Unable to look up Supabase users.")
    payload = response.json()
    if isinstance(payload, list):
        users = payload
    else:
        users = payload.get("users") or []
    normalized = email.strip().lower()
    for user in users:
        if str(user.get("email", "")).strip().lower() == normalized:
            return user
    return None


async def _create_user(email: str, password: str, full_name: str) -> dict[str, Any]:
    supabase_url, _, timeout = _require_supabase()
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            f"{supabase_url}/auth/v1/admin/users",
            headers=_service_role_headers(),
            json={
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"full_name": full_name},
            },
        )
    if response.status_code not in {status.HTTP_200_OK, status.HTTP_201_CREATED}:
        detail = response.json().get("msg") if response.headers.get("content-type", "").startswith("application/json") else ""
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail or "Unable to create account.")
    return response.json()


async def _update_user_password(user_id: str, password: str, full_name: str) -> dict[str, Any]:
    supabase_url, _, timeout = _require_supabase()
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.put(
            f"{supabase_url}/auth/v1/admin/users/{user_id}",
            headers=_service_role_headers(),
            json={
                "password": password,
                "email_confirm": True,
                "user_metadata": {"full_name": full_name},
            },
        )
    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to update test account.")
    return response.json()


@router.get("/testing-account", response_model=TestAccountResponse)
async def auth_testing_account() -> TestAccountResponse:
    settings = get_settings()
    return TestAccountResponse(
        email=settings.test_login_email,
        password=settings.test_login_password,
        full_name=settings.test_login_display_name,
    )


@router.post("/login", response_model=AuthSessionResponse)
async def auth_login(payload: LoginRequest) -> AuthSessionResponse:
    session = await _supabase_login(email=payload.email, password=payload.password)
    return _map_session(session)


@router.post("/signup", response_model=AuthSessionResponse)
async def auth_signup(payload: SignupRequest) -> AuthSessionResponse:
    existing_user = await _find_user_by_email(payload.email)
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")
    await _create_user(email=payload.email, password=payload.password, full_name=payload.full_name.strip())
    session = await _supabase_login(email=payload.email, password=payload.password)
    return _map_session(session)


@router.post("/bootstrap-test-user", response_model=AuthSessionResponse)
async def auth_bootstrap_test_user() -> AuthSessionResponse:
    settings = get_settings()
    try:
        session = await _supabase_login(email=settings.test_login_email, password=settings.test_login_password)
        return _map_session(session)
    except HTTPException as exc:
        if exc.status_code != status.HTTP_401_UNAUTHORIZED:
            raise

    existing_user = await _find_user_by_email(settings.test_login_email)
    if existing_user:
        await _update_user_password(
            user_id=str(existing_user.get("id", "")),
            password=settings.test_login_password,
            full_name=settings.test_login_display_name,
        )
    else:
        await _create_user(
            email=settings.test_login_email,
            password=settings.test_login_password,
            full_name=settings.test_login_display_name,
        )

    session = await _supabase_login(email=settings.test_login_email, password=settings.test_login_password)
    return _map_session(session)


@router.get("/me", response_model=AuthUserResponse)
async def auth_me(authorization: str | None = Header(default=None)) -> AuthUserResponse:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token.")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token.")

    supabase_url, anon_key, timeout = _require_supabase()
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": anon_key,
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.get(f"{supabase_url}/auth/v1/user", headers=headers)
    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token.")
    return _map_user(response.json())
