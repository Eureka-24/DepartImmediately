from typing import Optional
from fastapi import APIRouter, Depends, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select, update, delete
from src.database import AsyncSessionLocal
from src.models.task import Task
from src.middleware.auth import get_current_user
from src.models.user import User
from src.services.task_queue import create_task, task_queue_worker
from src.tools.route_planning import (
    geocode_address,
    search_transit,
    search_driving,
    search_walking,
    search_riding,
)
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


class RouteSegmentRequest(BaseModel):
    from_poi: dict  # { name, lng, lat, departure_time? }
    to_poi: dict    # { name, lng, lat }
    transport_mode: str  # "transit" | "driving" | "walking" | "riding"
    departure_time: Optional[str] = None  # "HH:MM", only for transit


@router.post("/route_segment", response_model=TaskResponse)
async def get_route_segment(
    body: RouteSegmentRequest,
    current_user: User = Depends(get_current_user),
):
    """
    查询两个 POI 之间的路径规划详情。
    用于前端切换交通方式时获取路段数据。
    """
    from_lng = body.from_poi.get("lng")
    from_lat = body.from_poi.get("lat")
    to_lng = body.to_poi.get("lng")
    to_lat = body.to_poi.get("lat")

    if not from_lng or not from_lat or not to_lng or not to_lat:
        return TaskResponse(success=False, data={"error": "Missing coordinates"})

    origin = f"{from_lng},{from_lat}"
    destination = f"{to_lng},{to_lat}"

    result = None

    if body.transport_mode == "transit":
        departure_time = None
        if body.departure_time:
            # Convert "HH:MM" to "HHMM" format
            departure_time = body.departure_time.replace(":", "")
        result = await search_transit(
            origin, destination, departure_time=departure_time
        )
    elif body.transport_mode == "driving":
        result = await search_driving(origin, destination)
    elif body.transport_mode == "walking":
        result = await search_walking(origin, destination)
    elif body.transport_mode == "riding":
        result = await search_riding(origin, destination)

    if not result:
        return TaskResponse(success=False, data={"error": "Route not found"})

    return TaskResponse(success=True, data={"segment_to_next": result})


@router.delete("/history/{task_id}", response_model=TaskResponse)
async def delete_history(task_id: str, current_user: User = Depends(get_current_user)):
    async with AsyncSessionLocal() as session:
        await session.execute(
            delete(Task).where(Task.id == task_id, Task.user_id == current_user.id)
        )
        await session.commit()
    return TaskResponse(success=True)