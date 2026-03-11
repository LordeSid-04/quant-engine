from fastapi import APIRouter

from app.api.routes import auth, briefing, health, historical, market, memory, metadata, risk, scenario, themes, world_pulse

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(health.router)
api_router.include_router(market.router)
api_router.include_router(world_pulse.router)
api_router.include_router(briefing.router)
api_router.include_router(scenario.router)
api_router.include_router(historical.router)
api_router.include_router(risk.router)
api_router.include_router(themes.router)
api_router.include_router(memory.router)
api_router.include_router(metadata.router)
