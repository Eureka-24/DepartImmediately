import asyncio
from datetime import datetime
import uuid

from sqlalchemy import select, update
from src.database import AsyncSessionLocal
from src.models.task import Task


async def process_task(task_id: str):
    """
    处理单个任务，分发到普通规划或重新规划流程。
    """
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            return

        task_input = task.input or {}
        city = task_input.get("city", "")
        start_time = task_input.get("startTime", "")
        end_time = task_input.get("endTime", "")
        preferences = task_input.get("preferences", "")
        is_replan = task_input.get("is_replan", False)

    if is_replan:
        pois = task_input.get("pois", [])
        plan_result = await process_replan_task(
            pois=pois,
            city=city,
            start_time=start_time,
            end_time=end_time,
        )
    else:
        plan_result = await process_normal_task(
            user_id=task.user_id,
            task_id=task_id,
            city=city,
            start_time=start_time,
            end_time=end_time,
            preferences=preferences,
        )

    async with AsyncSessionLocal() as session:
        await session.execute(
            update(Task)
            .where(Task.id == task_id)
            .values(
                status="completed",
                result=plan_result,
                updated_at=datetime.utcnow(),
            )
        )
        await session.commit()


async def process_normal_task(
    user_id: int,
    task_id: str,
    city: str,
    start_time: str,
    end_time: str,
    preferences: str,
) -> dict:
    """
    处理普通规划任务。

    流程：
    1. Step 0a: 提取本次偏好
    2. Step 0b: 存储本次偏好
    3. Step 0c: 语义扩展偏好
    4. Step 0d: 传入 parse_intent
    5. 预搜索 POI
    6. Planning Agent 生成 Markdown
    7. Structured Agent 转换为 JSON
    """
    from src.services.intent_agent import parse_intent
    from src.services.planning_agent import generate_plan, pre_search_pois
    from src.services.structured_agent import parse_output, DEFAULT_POPULAR_ROUTE
    from src.services.preference_agent import (
        extract_single_preferences,
        save_preferences,
        query_extended_preferences,
    )

    # Step 0a: 提取本次偏好
    std_prefs = []
    try:
        std_prefs = await extract_single_preferences(preferences)
    except Exception:
        pass

    # Step 0b: 存储本次偏好
    if std_prefs:
        try:
            await save_preferences(user_id, task_id, std_prefs)
        except Exception:
            pass

    # Step 0c: 语义扩展偏好
    extended_prefs = []
    try:
        extended_prefs = await query_extended_preferences(user_id, top_k=5)
    except Exception:
        pass

    # Step 0d: 传入 parse_intent
    intent = await parse_intent(city, start_time, end_time, preferences, extended_prefs)

    # Step 1: 预搜索 POI
    candidate_pois = await pre_search_pois(city, intent)

    # Step 2: Planning Agent 生成 Markdown
    planning_output = await generate_plan(intent, candidate_pois)

    # Step 3: Structured Agent 转换为 JSON
    if planning_output:
        plan_result = await parse_output(planning_output)
    else:
        plan_result = DEFAULT_POPULAR_ROUTE

    return plan_result


async def process_replan_task(
    pois: list[dict],
    city: str,
    start_time: str,
    end_time: str,
) -> dict:
    """
    处理重新规划任务。

    不同于普通规划，这里：
    1. 用户已确认景点，不需要 AI 重新选择
    2. 需要调用 LLM 分配游览时间和优化顺序
    3. 需要调用高德路径规划 API 生成交通信息
    """
    from src.services.replan_agent import generate_replan
    from src.services.structured_agent import parse_output

    if not pois or len(pois) == 0:
        return {
            "routes": [],
            "summary": "未提供景点列表"
        }

    # Step 1: 调用 LLM 分配时间并生成 Markdown
    planning_output = await generate_replan(
        pois=pois,
        city=city,
        start_time=start_time,
        end_time=end_time,
    )

    # Step 2: 将 Markdown 转换为 JSON
    if planning_output:
        plan_result = await parse_output(planning_output)
    else:
        plan_result = {
            "routes": [
                {
                    "name": poi.get("name", "景点"),
                    "location": poi.get("location", ""),
                    "lng": poi.get("lng"),
                    "lat": poi.get("lat"),
                    "type": poi.get("type", "景点"),
                    "time": "",
                    "rating": poi.get("rating", ""),
                    "duration": "约2小时",
                    "description": "",
                    "reason": "用户选择",
                    "transport": "起始点",
                }
                for poi in pois
            ],
            "summary": "基于用户选择的景点生成"
        }

    return plan_result


async def task_queue_worker():
    """
    后台协程：轮询 tasks 表处理 pending 任务。
    """
    while True:
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(Task)
                    .where(Task.status == "pending")
                    .order_by(Task.created_at.asc())
                    .limit(1)
                    .with_for_update(skip_locked=True)
                )
                task = result.scalar_one_or_none()

                if task:
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
    """创建新任务并返回任务ID。"""
    task_id = f"task_{uuid.uuid4().hex[:12]}"
    return task_id