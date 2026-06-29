#!/usr/bin/env python3
"""Nanobot SQL — FastAPI Entry Point.

This is the main application file that:
- Initializes the nanobot AgentLoop at startup
- Registers all API routers (sessions, settings, skills)
- Mounts the WebSocket chat endpoint
- Serves the frontend static files
"""

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Ensure project root and libs are on sys.path
from backend.workspace import get_workspace
BASE_DIR = get_workspace()  # per-agent workspace (set by AGENT_WORKSPACE env var)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: initialize nanobot AgentLoop with tools and patches."""
    from backend.agent.manager import agent_manager
    agent_manager.initialize(BASE_DIR)
    print("[backend] FastAPI app ready")
    yield


app = FastAPI(
    title="Tpa_RuYiBot",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow all origins for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register API routers ──────────────────────────────────────────
from backend.api.sessions import router as sessions_router
from backend.api.settings import router as settings_router
from backend.api.skills import router as skills_router
from backend.api.chat import router as chat_router

# Chat router includes WebSocket at "/" and bootstrap at "/webui/bootstrap"
# These must be registered BEFORE the static file mount
app.include_router(chat_router)

# REST API routers under /api prefix
app.include_router(sessions_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(skills_router, prefix="/api")

# Also expose nanobot-compatible session list endpoint (native format)
from backend.api.nanobot_compat import router as compat_router
app.include_router(compat_router, prefix="/api")


# ── Health check ──────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    import os
    return {
        "status": "ok",
        "name": "Tpa_RuYiBot",
        "version": "1.0.0",
        "workspace": str(BASE_DIR.resolve()) if hasattr(BASE_DIR, "resolve") else str(BASE_DIR),
        "pid": os.getpid()
    }


# ── Shutdown endpoint ─────────────────────────────────────────────
import os
import signal
import asyncio
from fastapi.responses import JSONResponse

@app.post("/api/shutdown")
async def shutdown():
    """Gracefully shut down the gateway server."""
    async def _do_shutdown():
        await asyncio.sleep(0.5)  # Give response time to be sent
        os.kill(os.getpid(), signal.SIGTERM)

    asyncio.create_task(_do_shutdown())
    return JSONResponse({"status": "shutting down"})


# ── Static file serving (Next.js export) ──────────────────────────
# This must be the LAST route registered, as it acts as a catch-all.

FRONTEND_DIR = BASE_DIR / "frontend" / "out"

if FRONTEND_DIR.exists():
    # Serve static assets (_next, images, etc.)
    app.mount("/_next", StaticFiles(directory=str(FRONTEND_DIR / "_next")), name="next_static")

    # Catch-all: serve HTML pages with Next.js static export conventions
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve Next.js static export with HTML fallback routing."""
        if not full_path:
            full_path = "index.html"

        # Security: prevent path traversal
        if ".." in full_path.split("/"):
            return FileResponse(FRONTEND_DIR / "index.html")

        candidate = FRONTEND_DIR / full_path

        # Direct file match
        if candidate.is_file():
            return FileResponse(candidate)

        # Try .html extension
        html_candidate = FRONTEND_DIR / (full_path + ".html")
        if html_candidate.is_file():
            return FileResponse(html_candidate)

        # Try /index.html
        index_candidate = FRONTEND_DIR / full_path / "index.html"
        if index_candidate.is_file():
            return FileResponse(index_candidate)

        # SPA fallback
        fallback = FRONTEND_DIR / "index.html"
        if fallback.is_file():
            return FileResponse(fallback)

        return {"error": "Not found"}, 404
