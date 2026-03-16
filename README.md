# Atlas

Atlas is a macro decision OS for teams that need to turn fast-moving global events into defensible action. It combines live signal detection, portfolio-aware analysis, deterministic scenario simulation, source-backed evidence, and institutional memory in one Bloomberg-inspired workflow.

## Links
- Live app: https://atlas-marco-economics-tracker.vercel.app/
- Public GitHub: https://github.com/LordeSid-04/quant-engine
- Video demo: https://youtu.be/jxmZfiHDLHk

## Why We Built It

Macro decisions still break down in the same places: the signal arrives late, the interpretation is fragmented, and the reasoning disappears after the meeting. Traders, treasury teams, fintech operators, and strategy teams are forced to jump between news feeds, spreadsheets, dashboards, and chat threads before they can answer a simple question: what changed, why does it matter, and what should we do now?

Atlas was built to collapse that workflow into one system. It watches the macro environment, explains the transmission path, stress-tests shocks, and preserves the reasoning so teams can respond faster with more confidence.

## What Atlas Does

Atlas is organized as one connected decision loop:

- `Signal Desk` surfaces live macro themes, cross-border spillovers, and market-sensitive developments with traceable source proof.
- `News Navigator` turns a headline or prompt into a concise action brief with local/global impact, Portfolio Twin context, agent debate, memory recall, and a final decision artifact.
- `Scenario Lab` stress-tests macro shocks through deterministic transmission pathways across regions and asset classes.
- `Risk Radar` monitors systemic pressure, theme clustering, and macro vulnerability.
- `Evidence Explorer` exposes the article-level evidence trail behind each view.
- `Memory Vault` stores prior analyses so the desk does not restart from zero every cycle.

## What Makes It Different

- `Explainable by design`: major outputs are tied to sources, proof bundles, and deterministic system logic.
- `Decision-first`: Atlas does not stop at summarizing news; it produces actionable implications, watch items, and next moves.
- `Portfolio-aware`: the platform can reason from the perspective of different operating profiles such as a fintech lender, retail bank treasury, or pension CIO.
- `Memory-native`: prior analyses become reusable institutional context instead of disposable chat output.
- `Fast enough for demo and desk use`: the current build includes response-path cleanup, caching, tighter upstream time budgets, and cleaner UI flows for judging.

## Product Walkthrough

1. Open `Signal Desk` to see what macro themes are heating up or cooling down.
2. Select a headline or enter a custom prompt in `News Navigator`.
3. Choose a `Portfolio Twin` to frame the analysis around a real institution or operating model.
4. Review the quick action brief, transmission logic, agent debate, and memory recall.
5. Jump to `Scenario Lab` to stress-test the same theme under a formal shock.
6. Save or revisit the analysis in `Memory Vault`.

## Technology Stack

### Languages
- JavaScript
- Python
- SQL
- HTML
- CSS

### Frontend
- React 18
- Vite
- React Router
- TanStack Query
- Tailwind CSS
- Radix UI
- Framer Motion
- Recharts

### Backend
- FastAPI
- Pydantic
- NumPy
- pandas
- scikit-learn
- NetworkX
- HTTPX

### Platforms And Data Providers
- Supabase for auth, persistence, and data storage
- Vercel for frontend hosting
- MediaStack for news ingestion
- Twelve Data, AlphaVantage, Yahoo Finance, FRED, and Stooq for market and macro data fallback coverage

### Tools
- Docker
- Pytest
- ESLint
- TypeScript type-checking
- GitHub

## Architecture

- The `frontend` is a multi-route React workspace with a command palette, Bloomberg-style navigation shell, and evidence-first analysis surfaces.
- The `backend` is a FastAPI service that blends deterministic scoring, live market/news ingestion, scenario logic, risk engines, and memory persistence.
- `World Pulse`, `Theme Engine`, `Risk Radar`, and `Briefing Engine` cooperate to produce live themes, impact chains, and decision-ready briefings.
- `News Navigator` now supports portfolio-tuned reasoning, agent debate, memory recall, and decision artifacts using the existing backend architecture instead of generic summarization.

## Local Setup

### Fastest Windows Launch
Use the launchers in the repo root if you want a quick local run:

```powershell
.\launch_atlas_local.vbs
```

To stop the local services:

```powershell
.\stop_atlas_local.bat
```

### Manual Frontend Setup

```bash
npm install
npm run dev
```

Frontend runs at `http://127.0.0.1:5173`.

### Manual Backend Setup

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Backend runs at `http://127.0.0.1:8000` and docs at `http://127.0.0.1:8000/docs`.

### Environment Variables

Required in `backend/.env`:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTH_REQUIRED`

Recommended for stronger live data coverage:

- `MEDIASTACK_API_KEY`
- `TWELVEDATA_API_KEY`
- `ALPHAVANTAGE_API_KEY`
- `FRED_API_KEY`
- `YAHOO_ENABLED=true`

Optional:

- `OPENAI_API_KEY`

For local judging or local review without auth, set `AUTH_REQUIRED=false`.

## Key API Endpoints

- `GET /health`
- `GET /api/v1/world-pulse/live`
- `GET /api/v1/risk-radar/live`
- `GET /api/v1/briefing/daily`
- `GET /api/v1/briefing/news-headlines`
- `POST /api/v1/briefing/news-navigator`
- `GET /api/v1/historical/analogues`
- `POST /api/v1/scenario/run`
- `POST /api/v1/scenario/run/stream`
- `GET /api/v1/memory/history`

## Verification

The latest local verification pass completed successfully with:

```bash
npm run lint
npm run typecheck
cd backend && .venv\Scripts\python.exe -m pytest -q
```

## Submission Snapshot

- Project title: `Atlas`
- Team: `MNB`
- Category fit: macro intelligence, explainable AI decision support, production-ready financial tooling
- AI use: Atlas combines deterministic analytics with AI-assisted development and optional LLM augmentation for selected narrative surfaces

## License

No license has been added yet. If you plan to keep the repo public for judging, add one before broader distribution.









