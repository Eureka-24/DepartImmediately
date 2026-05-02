import asyncio
from datetime import datetime
import uuid

from sqlalchemy import select, update
from src.database import AsyncSessionLocal
from src.models.task import Task


async def process_task(task_id: str):
    """
    处理单个任务，执行完整的三链（参考 agentService.js）：
    1. Intent Agent: 理解意图，生成结构化 intent 数据
    2. Planning Agent: 根据 intent 调用高德 API 搜索 POI，生成 Markdown 路线
    3. Structured Agent: 将 Markdown 转换为标准 JSON

    Step 0: 偏好处理（在意图识别前）
    - Step 0a: 提取本次偏好
    - Step 0b: 存储本次偏好
    - Step 0c: 语义扩展偏好
    - Step 0d: 传入 parse_intent
    """
    from src.services.intent_agent import parse_intent
    from src.services.planning_agent import generate_plan, pre_search_pois
    from src.services.structured_agent import parse_output, DEFAULT_POPULAR_ROUTE
    from src.services.preference_agent import (
        extract_single_preferences,
        save_preferences,
        query_extended_preferences,
    )

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

    # Step 0a: 提取本次偏好
    std_prefs = []
    try:
        std_prefs = await extract_single_preferences(preferences)
    except Exception:
        pass

    # Step 0b: 存储本次偏好
    if std_prefs:
        try:
            await save_preferences(task.user_id, task_id, std_prefs)
        except Exception:
            pass

    # Step 0c: 语义扩展偏好
    extended_prefs = []
    try:
        extended_prefs = await query_extended_preferences(task.user_id, top_k=5)
    except Exception:
        pass

    # Step 0d: 传入 parse_intent
    intent = await parse_intent(city, start_time, end_time, preferences, extended_prefs)

    # Step 1: 预搜索 POI（参考 agentService.js Step 3）
    candidate_pois = await pre_search_pois(city, intent)

    # Step 2: Planning Agent 生成 Markdown（参考 planningAgent.generatePlan）
    planning_output = await generate_plan(intent, candidate_pois)

    # Step 3: Structured Agent 转换为 JSON（参考 structuredAgent.parse）
    if planning_output:
        plan_result = await parse_output(planning_output)
    else:
        plan_result = DEFAULT_POPULAR_ROUTE

    # 更新任务结果
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