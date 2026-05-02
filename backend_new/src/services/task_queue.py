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
    """
    from src.services.intent_agent import parse_intent
    from src.services.planning_agent import generate_plan, pre_search_pois
    from src.services.structured_agent import parse_output, DEFAULT_POPULAR_ROUTE
    from src.services.preference_agent import extract_and_save_preferences

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

    # Step 1: 意图识别（参考 intentAgent.parseIntent）
    # 注意：当前无用户历史偏好，传入 None
    intent = await parse_intent(city, start_time, end_time, preferences, None)

    # Step 2: 预搜索 POI（参考 agentService.js Step 3）
    candidate_pois = await pre_search_pois(city, intent)

    # Step 3: Planning Agent 生成 Markdown（参考 planningAgent.generatePlan）
    planning_output = await generate_plan(intent, candidate_pois)

    # Step 4: Structured Agent 转换为 JSON（参考 structuredAgent.parse）
    if planning_output:
        plan_result = await parse_output(planning_output)
    else:
        plan_result = DEFAULT_POPULAR_ROUTE

    # Step 5: 提取并保存用户偏好（参考 userPrefs.js）
    try:
        await extract_and_save_preferences(task.user_id, preferences)
    except Exception:
        pass

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