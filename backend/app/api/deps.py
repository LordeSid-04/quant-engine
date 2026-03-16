from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import httpx
from fastapi import Depends, Header, HTTPException, status

from app.config import get_settings
from app.data.seed import get_data_repository
from app.engines.analogue_engine import AnalogueEngine
from app.engines.briefing_engine import BriefingEngine
from app.local_auth import get_local_user_from_token, is_local_auth_active
from app.engines.risk_engine import RiskEngine
from app.engines.scenario_engine import ScenarioEngine
from app.engines.theme_engine import ThemeEngine
from app.engines.world_pulse_engine import WorldPulseEngine


@dataclass(slots=True)
class AuthContext:
    user_id: str
    email: str | None = None


@lru_cache(maxsize=1)
def get_world_pulse_engine() -> WorldPulseEngine:
    return WorldPulseEngine(get_data_repository())


@lru_cache(maxsize=1)
def get_scenario_engine() -> ScenarioEngine:
    world_engine = get_world_pulse_engine()
    return ScenarioEngine(get_data_repository(), world_engine)


@lru_cache(maxsize=1)
def get_analogue_engine() -> AnalogueEngine:
    world_engine = get_world_pulse_engine()
    return AnalogueEngine(get_data_repository(), world_engine)


@lru_cache(maxsize=1)
def get_risk_engine() -> RiskEngine:
    world_engine = get_world_pulse_engine()
    return RiskEngine(get_data_repository(), world_engine)


@lru_cache(maxsize=1)
def get_theme_engine() -> ThemeEngine:
    world_engine = get_world_pulse_engine()
    return ThemeEngine(get_data_repository(), world_engine)


@lru_cache(maxsize=1)
def get_briefing_engine() -> BriefingEngine:
    return BriefingEngine(
        get_data_repository(),
        get_world_pulse_engine(),
        get_theme_engine(),
        get_risk_engine(),
        get_analogue_engine(),
    )


async def get_current_user(authorization: str | None = Header(default=None)) -> AuthContext:
    settings = get_settings()
    if not settings.auth_required:
        return AuthContext(user_id="dev-user", email="dev@atlas.local")

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    if is_local_auth_active(settings):
        try:
            payload = get_local_user_from_token(token)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
        return AuthContext(user_id=payload.get("id", "unknown"), email=payload.get("email"))

    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase auth is required but not configured",
        )

    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": settings.supabase_anon_key,
    }
    url = settings.supabase_url.rstrip("/") + "/auth/v1/user"

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(url, headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Unable to reach Supabase auth service: {exc}",
        ) from exc

    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token")

    payload = response.json()
    return AuthContext(user_id=payload.get("id", "unknown"), email=payload.get("email"))


AuthRequired = Depends(get_current_user)
