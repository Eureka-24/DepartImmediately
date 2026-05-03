from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
from src.config import get_settings
from src.database import engine, Base
from src.services.task_queue import task_queue_worker
from datetime import datetime

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Start background task queue
    asyncio.create_task(task_queue_worker())
    yield
    # Shutdown: dispose engine
    await engine.dispose()


app = FastAPI(title="Wayfinder API", version="1.0.0", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGIN.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check():
    return {
        "success": True,
        "message": "服务运行正常",
        "timestamp": datetime.utcnow().isoformat(),
    }


from src.routes.auth import router as auth_router
from src.routes.agent import router as agent_router
from src.routes.preferences import router as preferences_router
from src.routes.pois import router as pois_router

app.include_router(auth_router)
app.include_router(agent_router)
app.include_router(preferences_router)
app.include_router(pois_router)