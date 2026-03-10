from fastapi import APIRouter, HTTPException, Query

from app.api.deps import AuthRequired, get_briefing_engine
from app.schemas.briefing import DailyBriefResponse, DevelopmentDetailResponse, FeedStatus, NewsNavigatorRequest, NewsNavigatorResponse

router = APIRouter(prefix="/api/v1/briefing", tags=["briefing"], dependencies=[AuthRequired])


@router.get("/daily", response_model=DailyBriefResponse)
async def briefing_daily(
    window_hours: int = Query(default=72, ge=24, le=720),
    limit: int = Query(default=6, ge=3, le=12),
) -> DailyBriefResponse:
    engine = get_briefing_engine()
    return await engine.get_daily_brief(window_hours=window_hours, limit=limit)


@router.get("/developments/{development_id}", response_model=DevelopmentDetailResponse)
async def briefing_development_detail(development_id: str) -> DevelopmentDetailResponse:
    engine = get_briefing_engine()
    try:
        return await engine.get_development_detail(development_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/feed-status", response_model=FeedStatus)
async def briefing_feed_status(window_hours: int = Query(default=72, ge=24, le=720)) -> FeedStatus:
    engine = get_briefing_engine()
    return await engine.get_feed_status(window_hours=window_hours)


@router.post("/news-navigator", response_model=NewsNavigatorResponse)
async def briefing_news_navigator(payload: NewsNavigatorRequest) -> NewsNavigatorResponse:
    engine = get_briefing_engine()
    return await engine.run_news_navigator(payload=payload)
