diff --git a/c:\Users\siddh\Downloads\Telegram Desktop\atlas-fintech-hackathon\atlas-marco-economics-tracker\README.md b/c:\Users\siddh\Downloads\Telegram Desktop\atlas-fintech-hackathon\atlas-marco-economics-tracker\README.md
--- a/c:\Users\siddh\Downloads\Telegram Desktop\atlas-fintech-hackathon\atlas-marco-economics-tracker\README.md
+++ b/c:\Users\siddh\Downloads\Telegram Desktop\atlas-fintech-hackathon\atlas-marco-economics-tracker\README.md
@@ -0,0 +1,61 @@
+# Atlas Macro Economics Tracker
+
+Atlas is a macro-intelligence platform that turns noisy global developments into actionable, explainable signals for analysts, founders, and portfolio teams.
+
+## Submission Links
+- GitHub Repository: `https://github.com/LordeSid-04/atlas-marco-economics-tracker`
+- Video Pitch (max 5 min): `ADD_YOUTUBE_LINK_HERE`
+  - Suggested title format: `FinTech Innovators Hackathon 2026_(teamname)`
+
+## What We Built
+- `World Pulse`: Live macro developments with source-backed evidence.
+- `Scenario Lab`: Deterministic scenario simulation and propagation analysis.
+- `News Navigator`: Headline/prompt-driven analysis with local + global impact breakdown.
+- `Memory Vault`: Stores discussion history and analysis continuity for follow-up decisions.
+- `Auth + Session`: Supabase-backed login/signup and persistent user sessions.
+
+## Why This Solves The Problem
+Teams struggle to move from fragmented macro news to fast, defensible decisions. Atlas combines verified sources, deterministic scoring, and optional LLM narrative augmentation to reduce analysis time while preserving transparency.
+
+## Local Use (Quick Start)
+
+### 1) Frontend setup
+```bash
+npm install
+npm run dev
+```
+Frontend runs on `http://127.0.0.1:5173`.
+
+### 2) Backend setup
+```bash
+cd backend
+python -m venv .venv
+.venv\Scripts\activate
+pip install -r requirements-dev.txt
+Copy-Item .env.example .env
+uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
+```
+Backend runs on `http://127.0.0.1:8000`.
+
+### 3) Required environment values (`backend/.env`)
+- `SUPABASE_URL`
+- `SUPABASE_ANON_KEY`
+- `SUPABASE_SERVICE_ROLE_KEY`
+- `OPENAI_API_KEY` (optional but recommended for richer News Navigator responses)
+
+### 4) Auth mode toggle
+- For full login/signup flow: `AUTH_REQUIRED=true`
+- For quick local development without auth lock: `AUTH_REQUIRED=false`
+
+## Core Endpoints
+- `POST /api/v1/auth/signup`
+- `POST /api/v1/auth/login`
+- `GET /api/v1/world-pulse/live`
+- `POST /api/v1/scenario/run`
+- `POST /api/v1/briefing/news-navigator`
+- `GET /api/v1/memory/history`
+
+## Demo Focus
+- Prototype demonstration
+- Explanation of logic and market potential
+- Traceable decision support, not black-box outputs
