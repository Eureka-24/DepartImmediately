import asyncio
from datetime import datetime
import uuid

from sqlalchemy import select, update
from src.database import AsyncSessionLocal, engine
from src.models.task import Task


async def process_task(task_id: str):
    """
    Process a single task. Called by task_queue_worker.
    Currently a stub - full logic in Phase 6.
    """
    async with AsyncSessionLocal() as session:
        await session.execute(
            update(Task)
            .where(Task.id == task_id)
            .values(status="completed", result={"message": "stub"}, updated_at=datetime.utcnow())
        )
        await session.commit()


async def task_queue_worker():
    """
    Background coroutine: polls tasks table for pending tasks,
    processes them, and updates status to completed/failed.
    """
    while True:
        try:
            async with AsyncSessionLocal() as session:
                # Atomically claim one pending task
                result = await session.execute(
                    select(Task)
                    .where(Task.status == "pending")
                    .order_by(Task.created_at.asc())
                    .limit(1)
                    .with_for_update(skip_locked=True)
                )
                task = result.scalar_one_or_none()

                if task:
                    # Mark as processing
                    task.status = "processing"
                    task.updated_at = datetime.utcnow()
                    await session.commit()

                    try:
                        await process_task(task.id)
                    except Exception as e:
                        async with AsyncSessionLocal() as err_session:
                            await err_session.execute(
                                update(Task)
                                .where(Task.id == task.id)
                                .values(status="failed", error=str(e), updated_at=datetime.utcnow())
                            )
                            await err_session.commit()
                else:
                    await asyncio.sleep(1)
        except Exception as e:
            print(f"Task queue error: {e}")
            await asyncio.sleep(5)


def create_task(user_id: int, city: str, start_time: str, end_time: str, preferences: str) -> str:
    """Create a new pending task and return its ID."""
    task_id = f"task_{uuid.uuid4().hex[:12]}"
    task = Task(
        id=task_id,
        user_id=user_id,
        input={"city": city, "startTime": start_time, "endTime": end_time, "preferences": preferences},
        status="pending",
    )
    return task_id