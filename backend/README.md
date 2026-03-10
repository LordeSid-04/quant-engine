# Atlas Backend (FastAPI + Supabase)

Deterministic backend for Atlas Macro Scenario Intelligence Engine.

## Stack
- FastAPI + Pydantic
- Supabase (database + auth)
- NetworkX + NumPy + pandas + scikit-learn
- Docker
- Multi-provider market feed (Twelve Data + AlphaVantage + Yahoo + FRED + Stooq fallback)

## Local Run (without auth)
1. `cd backend`
2. `python -m venv .venv`
3. Windows: `.venv\Scripts\activate`
4. `pip install -r requirements-dev.txt`
5. `Copy-Item .env.example .env`
6. Set `AUTH_REQUIRED=false`
7. `uvicorn app.main:app --reload --port 8000`

## Watchlist Real-Time Feed
- `/api/stooq` is now backed by a provider cascade:
  1. Twelve Data (primary, supports websocket + quote API)
  2. AlphaVantage (FX fallback)
  3. Yahoo Finance chart API (broad futures/index/FX fallback)
  4. FRED (rates/yield fallback)
  5. Stooq (last fallback)
- Backend keeps an in-memory ticker cache updated by background polling and optional Twelve Data websocket stream.
- Status endpoint: `GET /api/v1/market/feed-status`

### Recommended keys for full watchlist reliability
- `TWELVEDATA_API_KEY` (primary for live quotes)
- `ALPHAVANTAGE_API_KEY` (extra FX reliability)
- `FRED_API_KEY` (rates/yields backup; optional because CSV fallback exists)
- `YAHOO_ENABLED=true` (default; no API key required)

## Supabase Setup
1. Create a Supabase project.
2. Apply SQL in `supabase/schema.sql`.
3. Put these values in `.env`:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTH_REQUIRED=true`

## Docker (Mac/Windows/Linux)
1. `cd backend`
2. Create `.env` from `.env.example`
3. `docker compose up --build`
4. API: `http://localhost:8000`
5. Docs: `http://localhost:8000/docs`

## Endpoints
- `GET /api/stooq`
- `GET /api/stooq/batch`
- `GET /api/v1/world-pulse/live`
- `GET /api/v1/world-pulse/relation?from_country=us&to_country=cn`
- `GET /api/v1/world-pulse/country-proof?country_id=us`
- `GET /api/v1/market/feed-status`
- `GET /api/v1/scenario/options`
- `POST /api/v1/scenario/run`
- `POST /api/v1/scenario/run/stream` (NDJSON log stream + final result)
- `GET /api/v1/historical/analogues`
- `GET /api/v1/risk-radar/live`
- `GET /api/v1/themes/live`
- `GET /api/v1/themes/{theme_id}/timeline`
- `GET /api/v1/themes/{theme_id}/sources`
- `GET /api/v1/briefing/daily`
- `POST /api/v1/briefing/news-navigator`
- `GET /api/v1/memory/themes/{theme_id}`

`/api/stooq` and `/api/stooq/batch` include a `provenance` block per quote:
- `provider`
- `provider_symbol`
- `mode` (`live_api`, `memory_cache`, `stale_memory_cache`, `supabase_cache`, `stream`)
- `observed_at`
- `fetched_at`
- `age_seconds`

World Pulse responses include `data_proof` blocks with deterministic methodology, provider mix, and contextual source references (global, country-specific, or bilateral relation-specific).

Theme APIs use deterministic keyword-weight scoring over curated + optional live RSS sources. Hot/cool state is derived via weighted temperature + hysteresis (no black-box model outputs).

For real-time global news ingestion in the News Navigator flow, the backend now supports MediaStack as the primary API source (with strict reliability filtering by trusted source name/domain), plus institutional RSS as a verification layer.
- Env key: `MEDIASTACK_API_KEY`
- Base URL: `MEDIASTACK_BASE_URL` (default `http://api.mediastack.com/v1`)
- Optional controls: `MEDIASTACK_KEYWORDS`, `MEDIASTACK_CATEGORIES`, `MEDIASTACK_LANGUAGES`, `MEDIASTACK_MAX_ARTICLES`

Daily Briefing enriches theme outputs with standardized model-driven scores and proof objects:
- `GET /api/v1/briefing/daily`
- `GET /api/v1/briefing/feed-status`
- `GET /api/v1/briefing/developments/{development_id}`
- `POST /api/v1/briefing/news-navigator`

`POST /api/v1/briefing/news-navigator` combines verified source evidence, theme heat/cool scoring, and memory-intake persistence. It runs deterministically by default, and can optionally augment narrative output using OpenAI when `OPENAI_API_KEY` is configured.

## Notes
- Scores are standardized and traceable through source, market, and model proof bundles.
- `trace_id` is returned for every major frontend-visible block.
