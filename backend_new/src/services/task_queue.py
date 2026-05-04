import asyncio
from datetime import datetime
import uuid

from sqlalchemy import select, update
from src.tools.route_planning import geocode_address, search_transit, search_driving, search_walking, search_riding
from src.database import AsyncSessionLocal
from src.models.task import Task

# 城市代码到中文名称的映射
CITY_CODE_TO_NAME = {
    "beijing": "北京",
    "shanghai": "上海",
    "hangzhou": "杭州",
    "chengdu": "成都",
    "xian": "西安",
    "chongqing": "重庆",
}


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

    # 统一 enrich routes with actual segment data
    plan_result = await enrich_routes_with_segments(plan_result, city)

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


async def enrich_routes_with_segments(routes_result: dict, city: str) -> dict:
    """
    为每段 POI 之间的路段查询实际路径规划数据，
    并将结果嵌入到对应 POI 的 segment_to_next 字段中。
    """
    routes = routes_result.get("routes", [])
    if not routes or len(routes) < 2:
        return routes_result

    async def get_coords_for_poi(poi: dict) -> tuple[float, float] | None:
        """获取 POI 坐标，优先使用已有坐标，否则尝试地理编码。"""
        lng = poi.get("lng")
        lat = poi.get("lat")
        if lng is not None and lat is not None:
            return (float(lng), float(lat))

        # 尝试从 location 解析
        location = poi.get("location", "")
        if location and "," in location:
            try:
                parts = location.split(",")
                if len(parts) == 2:
                    return (float(parts[0]), float(parts[1]))
            except (ValueError, TypeError):
                pass

        # 尝试地理编码
        if location:
            result = geocode_address(location)
            if result:
                return (result["lng"], result["lat"])
        return None

    # 计算累计时间，用于确定出发时间
    current_time = None
    try:
        # 解析起始时间，格式如 "09:00"
        from datetime import datetime, timedelta
        first_time = routes[0].get("time", "")
        if first_time and len(first_time) >= 5:
            base_parts = first_time.split("-")[0].strip()
            if ":" in base_parts:
                time_parts = base_parts.split(":")
                hour = int(time_parts[0])
                minute = int(time_parts[1])
                today = datetime.now()
                current_time = today.replace(hour=hour, minute=minute, second=0, microsecond=0)
    except Exception:
        pass

    for i in range(len(routes) - 1):
        from_poi = routes[i]
        to_poi = routes[i + 1]

        # 获取起点坐标
        from_coords = await get_coords_for_poi(from_poi)
        to_coords = await get_coords_for_poi(to_poi)

        if not from_coords or not to_coords:
            continue

        # 计算出发时间：如果已知当前时间，加上前一个 POI 的停留时长
        departure_time = None
        if current_time and from_poi.get("duration"):
            # 尝试解析停留时长，如 "3小时" -> 180 分钟
            duration_str = from_poi.get("duration", "")
            try:
                if "小时" in duration_str:
                    hours = int(duration_str.split("小时")[0].strip())
                    current_time += timedelta(minutes=hours * 60)
                elif "分钟" in duration_str:
                    minutes = int(duration_str.split("分钟")[0].strip())
                    current_time += timedelta(minutes=minutes)
            except (ValueError, TypeError):
                pass

            departure_time = current_time.strftime("%H%M")

        # 查询公交路线（默认）
        origin_str = f"{from_coords[0]},{from_coords[1]}"
        dest_str = f"{to_coords[0]},{to_coords[1]}"
        # 转换为 Amap API 所需的中文城市名
        city_name = CITY_CODE_TO_NAME.get(city, city)

        segment = await search_transit(
            origin_str,
            dest_str,
            departure_time=departure_time,
            city=city_name,
        )

        if segment:
            # 计算到下一个 POI 的出发时间
            if current_time and segment.get("duration"):
                # 尝试解析 driving duration, 格式如 "15分钟"
                dur_str = segment.get("duration", "")
                try:
                    if "小时" in dur_str:
                        parts = dur_str.split("小时")
                        hours = int(parts[0].strip())
                        mins = int(parts[1].replace("分钟", "").strip()) if len(parts) > 1 and "分钟" in parts[1] else 0
                        current_time += timedelta(hours=hours, minutes=mins)
                    elif "分钟" in dur_str:
                        mins = int(dur_str.split("分钟")[0].strip())
                        current_time += timedelta(minutes=mins)
                except (ValueError, TypeError):
                    pass

            # segment_to_next 存储在 destination POI (i+1) 上
            # 这样当展示 POI[i+1] 时，显示的是"到达这个景点"的路径
            routes[i + 1]["segment_to_next"] = segment
            # departure_time 存储在 destination POI 上，表示从上一个 POI 出发的时间
            routes[i + 1]["departure_time"] = departure_time[:2] + ":" + departure_time[2:] if departure_time else None

    return routes_result


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

    # Step 4:  Enrich routes with actual route segments
    plan_result = await enrich_routes_with_segments(plan_result, city)

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