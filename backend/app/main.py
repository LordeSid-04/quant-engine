import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.deps import get_briefing_engine
from app.api.router import api_router
from app.config import get_settings
from app.data.seed import get_data_repository

logger = logging.getLogger(__name__)


async def _prewarm_news_cache() -> None:
    settings = get_settings()
    if not settings.theme_news_live_enabled:
        return
    try:
        await asyncio.sleep(8.0)
        await get_briefing_engine().get_news_headlines(horizon="daily", limit=24)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.debug("News headline prewarm skipped.", exc_info=True)


def create_app() -> FastAPI:
    settings = get_settings()
    allowed_origins = [origin.strip() for origin in str(settings.cors_allowed_origins or "").split(",") if origin.strip()]
    allow_origin_regex = str(settings.cors_allow_origin_regex or "").strip() or None

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        repository = get_data_repository()
        news_prewarm_task: asyncio.Task[None] | None = None
        await repository.start_market_streams()
        news_prewarm_task = asyncio.create_task(_prewarm_news_cache(), name="news-headline-prewarm")
        try:
            yield
        finally:
            if news_prewarm_task is not None and not news_prewarm_task.done():
                news_prewarm_task.cancel()
                await asyncio.gather(news_prewarm_task, return_exceptions=True)
            await repository.stop_market_streams()

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_origin_regex=allow_origin_regex,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/")
    def root() -> dict[str, str]:
        return {"service": "atlas-backend", "status": "running"}

    app.include_router(api_router)
    return app


app = create_app()
