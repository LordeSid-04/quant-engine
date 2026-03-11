from fastapi import APIRouter, HTTPException, Query

from app.api.deps import AuthRequired, get_briefing_engine
from app.schemas.briefing import MemoryEntryResponse, MemoryHistoryResponse, ThemeMemoryResponse

router = APIRouter(prefix="/api/v1/memory", tags=["memory"], dependencies=[AuthRequired])


@router.get("/history", response_model=MemoryHistoryResponse)
async def memory_history(limit: int = Query(default=80, ge=5, le=200)) -> MemoryHistoryResponse:
    engine = get_briefing_engine()
    return await engine.get_memory_history(limit=limit)


@router.get("/entries/{entry_id}", response_model=MemoryEntryResponse)
async def memory_entry(entry_id: str) -> MemoryEntryResponse:
    engine = get_briefing_engine()
    try:
        return await engine.get_memory_entry(entry_id=entry_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/themes/{theme_id}", response_model=ThemeMemoryResponse)
async def theme_memory(
    theme_id: str,
    window_hours: int = Query(default=720, ge=24, le=2160),
    limit: int = Query(default=30, ge=5, le=80),
) -> ThemeMemoryResponse:
    engine = get_briefing_engine()
    try:
        return await engine.get_theme_memory(theme_id=theme_id, window_hours=window_hours, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
