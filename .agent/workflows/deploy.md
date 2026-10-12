---
description: How to deploy the application to production
---

# Deploy Sentinel

Database on Neon (free Postgres), backend on Render, frontend on Vercel.

## 1. Database - Neon (free, persistent)

Render's free disk is wiped on every deploy, so SQLite would lose all cases. Use Postgres instead.

1. Create a project at https://neon.tech
2. Copy the connection string (`postgresql://...neon.tech/neondb?sslmode=require`). The backend converts it for asyncpg automatically.

## 2. Backend - Render

1. Push to GitHub.
2. Render dashboard → **New + → Blueprint** → select the repo. `render.yaml` configures everything.
3. Fill in the secret env vars when prompted:

| Variable | Value |
|---|---|
| `NVIDIA_API_KEY` | from https://build.nvidia.com |
| `DATABASE_URL` | Neon connection string |
| `INVITE_CODES` | optional, e.g. `PILOT-METRO-2026` - sign-up then requires it |

`SECRET_KEY` is generated for you. `ENVIRONMENT=production` hides `/docs` and raw error details.

4. Verify: `https://<your-api>.onrender.com/health` should show `"ai_online": true`.

## 3. Frontend - Vercel

1. Import the repo, **Root Directory** `frontend`, preset **Vite**.
2. Env var `VITE_API_URL` = your Render URL (also in `frontend/.env.production`).
3. Deploy, then add the Vercel URL to `ALLOWED_ORIGINS` on Render.

## Notes

- Free Render instances sleep after inactivity; the first request takes ~50 s. Upgrade before a demo.
- To change models, edit `REASONING_MODEL` / `EXTRACTION_MODEL` / `VISION_MODEL` on Render - no redeploy of code needed.
- On-premise: run the backend in a container next to a self-hosted NVIDIA NIM and set `LLM_BASE_URL` to it.
