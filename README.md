# Atlas Macro Economics Tracker

Atlas is a macro-intelligence platform that helps users convert fast-moving global news into clear, evidence-backed decisions. It combines live macro signals, scenario simulation, and memory continuity in one workflow.

## Submission Deliverables
- GitHub Repository: https://github.com/LordeSid-04/atlas-marco-economics-tracker
- Video Pitch (max 5 mins): `ADD_YOUTUBE_LINK_HERE`
  - Suggested title: `FinTech Innovators Hackathon 2026_(teamname)`

## What the Solution Does
- **World Pulse**: surfaces live macro developments with traceable source evidence.
- **News Navigator**: analyzes either a selected headline (if no prompt) or a user prompt (if provided), then explains local and global impacts.
- **Scenario Lab**: runs deterministic shock simulations and transmission pathways.
- **Memory Vault**: stores prior analyses for continuity and faster follow-up decisions.
- **Supabase Auth**: secure signup/login with persistent user sessions.

## Why It Solves the Problem
Macro decisions are often delayed by fragmented data and non-repeatable analysis. Atlas reduces that latency by unifying trusted sources, deterministic scoring, and explainable outputs in one interface.

## Local Setup (Quick Start)

### 1) Frontend
```bash
npm install
npm run dev
```
Frontend: http://127.0.0.1:5173
Backend: http://127.0.0.1:8000
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
# source .venv/bin/activate

pip install -r requirements-dev.txt
cp .env.example .env   # Windows PowerShell: Copy-Item .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
# 3) Required Environment Variables (backend/.env)
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY (optional but recommended for richer narrative generation)
# 4) Auth Mode
AUTH_REQUIRED=true for full login/signup flow
AUTH_REQUIRED=false for local testing without auth gate
Key API Endpoints
POST /api/v1/auth/signup
POST /api/v1/auth/login
GET /api/v1/world-pulse/live
POST /api/v1/scenario/run
POST /api/v1/briefing/news-navigator
GET /api/v1/memory/history



