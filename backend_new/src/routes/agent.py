from fastapi import APIRouter, Depends, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select, update, delete
from src.database import AsyncSessionLocal
from src.models.task import Task
from src.middleware.auth import get_current_user
from src.models.user import User
from src.services.task_queue import create_task, task_queue_worker
import asyncio

router = APIRouter(prefix="/api/agent", tags=["agent"])


class PlanAsyncRequest(BaseModel):
    city: str
    startTime: str
    endTime: str
    preferences: str


class ReplanRequest(BaseModel):
    city: str
    startTime: str
    endTime: str
    preferences: str
    pois: list[dict]


class TaskResponse(BaseModel):
    success: bool = True
    data: dict | list | None = None


@router.post("/plan_async", response_model=TaskResponse)
async def plan_async(
    body: PlanAsyncRequest,
    current_user: User = Depends(get_current_user),
):
    task_id = create_task(
        user_id=current_user.id,
        city=body.city,
        start_time=body.startTime,
        end_time=body.endTime,
        preferences=body.preferences,
    )

    async with AsyncSessionLocal() as session:
        task = Task(
            id=task_id,
            user_id=current_user.id,
            input=body.model_dump(),
            status="pending",
        )
        session.add(task)
        await session.commit()

    return TaskResponse(success=True, data={"id": task_id, "status": "pending"})


@router.post("/replan", response_model=TaskResponse)
async def replan(
    body: ReplanRequest,
    current_user: User = Depends(get_current_user),
):
    """
    重新规划路线。

    用户确认景点列表后调用此接口，后端将：
    1. 将这些景点作为必经点
    2. 调用 LLM 分配游览时间并优化顺序
    3. 调用高德路径规划 API 生成交通信息
    4. 返回完整的路线规划结果
    """
    task_id = create_task(
        user_id=current_user.id,
        city=body.city,
        start_time=body.startTime,
        end_time=body.endTime,
        preferences=body.preferences,
    )

    async with AsyncSessionLocal() as session:
        task = Task(
            id=task_id,
            user_id=current_user.id,
            input={
                "city": body.city,
                "startTime": body.startTime,
                "endTime": body.endTime,
                "preferences": body.preferences,
                "pois": body.pois,
                "is_replan": True,
            },
            status="pending",
        )
        session.add(task)
        await session.commit()

    return TaskResponse(success=True, data={"id": task_id, "status": "pending"})


@router.get("/task/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str, current_user: User = Depends(get_current_user)):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Task).where(Task.id == task_id, Task.user_id == current_user.id)
        )
        task = result.scalar_one_or_none()
        if not task:
            return TaskResponse(success=False, data={"error": "Task not found"})

        data = {
            "id": task.id,
            "status": task.status,
        }
        if task.result:
            data["result"] = task.result
        if task.error:
            data["error"] = task.error

        return TaskResponse(success=True, data=data)


@router.get("/history", response_model=TaskResponse)
async def get_history(current_user: User = Depends(get_current_user)):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Task)
            .where(Task.user_id == current_user.id)
            .order_by(Task.created_at.desc())
            .limit(50)
        )
        tasks = result.scalars().all()

        data = [
            {
                "id": t.id,
                "city": t.input.get("city") if t.input else None,
                "startTime": t.input.get("startTime") if t.input else None,
                "endTime": t.input.get("endTime") if t.input else None,
                "preferences": t.input.get("preferences") if t.input else None,
                "result": t.result,
                "status": t.status,
            }
            for t in tasks
        ]

        return TaskResponse(success=True, data=data)


@router.delete("/history/{task_id}", response_model=TaskResponse)
async def delete_history(task_id: str, current_user: User = Depends(get_current_user)):
    async with AsyncSessionLocal() as session:
        await session.execute(
            delete(Task).where(Task.id == task_id, Task.user_id == current_user.id)
        )
        await session.commit()
    return TaskResponse(success=True)