from fastapi import APIRouter, HTTPException, Query

from app.api.deps import AuthRequired, get_briefing_engine
from app.schemas.briefing import (
    DailyBriefResponse,
    DevelopmentDetailResponse,
    FeedStatus,
    NewsHeadlinesResponse,
    NewsNavigatorRequest,
    NewsNavigatorResponse,
)

router = APIRouter(prefix="/api/v1/briefing", tags=["briefing"], dependencies=[AuthRequired])


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in str(value or "").split(",") if item.strip()]


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


@router.get("/news-headlines", response_model=NewsHeadlinesResponse)
async def briefing_news_headlines(
    horizon: str = Query(default="daily", min_length=4, max_length=12),
    country: str = Query(default="", max_length=120),
    region: str = Query(default="", max_length=80),
    content_types: str = Query(default="", max_length=240),
    source_types: str = Query(default="", max_length=240),
    search: str = Query(default="", max_length=320),
    limit: int = Query(default=24, ge=6, le=80),
) -> NewsHeadlinesResponse:
    engine = get_briefing_engine()
    return await engine.get_news_headlines(
        horizon=horizon,
        country=country,
        region=region,
        content_types=_split_csv(content_types),
        source_types=_split_csv(source_types),
        search=search,
        limit=limit,
    )
