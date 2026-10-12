# Sentinel - AI Case Intelligence

Sentinel (formerly *Crime Investigation GPT*) is an AI analyst for criminal investigators. Feed it witness statements,
reports, transcripts and scene photos; it builds a live **evidence graph** and **timeline**, reasons through the case with
the detective, and produces a scored **intelligence brief** - persons of interest, competing hypotheses, contradictions,
evidence gaps and next steps.

## Features

| | |
|---|---|
| **Investigate** | Streaming analyst chat with a visible reasoning trace, conversation memory, voice dictation and drag-and-drop evidence |
| **Evidence Board** | Force-directed graph of people, places, vehicles, weapons, organisations and communications. Directed, multi-relationship, with supporting quotes and confidence. Investigators can merge duplicates, retype or remove entities |
| **Timeline** | Times and dates extracted from every message and document, sorted into one chronology |
| **Case Brief** | Motive / means / opportunity scoring, hypotheses with evidence for and against, contradictions, leads, next steps |
| **Evidence Locker** | PDF, DOCX, TXT/CSV/logs and images (described by a vision model). Every file is SHA-256 fingerprinted |
| **Case file export** | Markdown report: brief, entity register, relationships, timeline, evidence register with hashes, full log |
| **Governance** | Append-only audit log, rate limiting, optional agency invite codes, presumption-of-innocence guardrails in prompts |

## Architecture

```
frontend/  React 19 + Vite + Tailwind + framer-motion + react-force-graph-2d   (Vercel)
backend/   FastAPI (async) + SQLAlchemy + NetworkX                            (Render / any container host)
  config.py              all settings from env
  modules/llm_engine.py  OpenAI-compatible client -> NVIDIA NIM (hosted or self-hosted)
  modules/graph_manager.py  MultiDiGraph knowledge graph, entity resolution, timeline
  routers/investigation.py  SSE chat, evidence, graph, brief, report
```

The LLM layer speaks the OpenAI API, so the same code runs on NVIDIA's free hosted endpoint today and on an
**on-premise, air-gapped NIM deployment** for agencies (set `LLM_BASE_URL`).

## Run locally

```bash
# Backend
cd backend
python -m venv venv && venv\Scripts\activate      # source venv/bin/activate on macOS/Linux
pip install -r requirements.txt
copy .env.example .env                            # then put your NVIDIA_API_KEY in it
uvicorn main:app --reload                         # http://localhost:8000/docs

# Frontend
cd frontend
npm install
npm run dev                                       # http://localhost:5173
```

Get a free key at [build.nvidia.com](https://build.nvidia.com). Models are set with `REASONING_MODEL`,
`EXTRACTION_MODEL` and `VISION_MODEL` - no code change needed when NVIDIA rotates its catalogue.

Without a key the app still runs (offline mode): cases, evidence storage and the UI work, AI features explain that they are offline.

## Deploy

See [.agent/workflows/deploy.md](.agent/workflows/deploy.md). Short version: Postgres on Neon (free), API on Render
via `render.yaml`, frontend on Vercel with `VITE_API_URL` pointing at the API.

> AI-assisted analysis. All findings must be independently verified by a qualified investigator.
