from src.tools.search_pois import search_pois, filter_and_rank_pois
from src.llm.chat import get_chat_response


SYSTEM_PROMPT = """你是一位专业的旅行规划师，擅长根据用户需求规划个性化旅行路线。

【核心能力】
1. 理解用户模糊需求（如"亲子游"、"吃货"、"不想排队"）
2. 搜索合适的 POI 地点
3. 规划合理的路线顺序
4. 计算预估时间，确保符合用户时间范围
5. 生成详细的行程安排

【输出格式】
请以 Markdown 格式输出旅行规划，包含：
- 每日行程安排（时间、景点、活动）
- 推荐理由
- 交通方式建议
- 备选方案（如有）

【约束】
- 每个 POI 停留时间默认 60-180 分钟
- 出行时间超过 30 分钟需注明交通方式
- 总时长不能超过用户指定的时间范围
- 不要编造景点信息，必须基于实际数据"""


async def generate_plan(intent: dict, candidate_pois: list = None) -> str:
    """
    根据意图生成旅行规划（Markdown 格式）。
    返回的 markdown 字符串由 structured_agent 解析为 JSON。
    """
    city = intent.get("city", "")
    start_time = intent.get("startTime", "")
    end_time = intent.get("endTime", "")
    duration = intent.get("duration", 0)
    interests = intent.get("interests", [])
    travel_style = intent.get("travelStyle", "休闲")
    special_requirements = intent.get("specialRequirements", [])

    days = duration // (60 * 24)
    hours = (duration % (60 * 24)) // 60

    # 构建用户消息
    user_message = f"""请为以下旅行需求生成规划：

【基本信息】
城市: {city}
时间范围: {start_time} - {end_time}
旅行时长: 约 {days} 天 {hours} 小时

【用户偏好】
兴趣关键词: {', '.join(interests) if interests else '景点,热门'}
旅行风格: {travel_style}
"""

    if special_requirements:
        user_message += f"特殊需求: {', '.join(special_requirements)}\n"

    if candidate_pois:
        user_message += f"\n【已搜索的 POI】（共 {len(candidate_pois)} 个）\n"
        for i, poi in enumerate(candidate_pois):
            user_message += f"{i+1}. {poi.get('name', '')} - 类型: {poi.get('type', '景点')}, 评分: {poi.get('rating', 'N/A')}\n"
        user_message += "\n请从上述 POI 中选择合适的景点进行路线规划。"
    else:
        user_message += f"\n请首先调用 search_pois 搜索相关的 POI 地点，然后再进行路线规划。"

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    return await get_chat_response(messages)


def get_fallback_result(pois: list, city: str) -> str:
    """降级结果：POI 不足时返回基于已有 POI 的简单规划。"""
    if pois:
        lines = [f"# {city} 旅行规划\n\n## 路线规划\n"]
        for i, poi in enumerate(pois[:5]):
            hour = 9 + i * 2
            lines.append(f"- {hour}:00 - {poi.get('name', '景点')}")
        lines.append("\n这是一条基于热门景点的推荐路线。")
        return "\n".join(lines)
    return "# 旅行规划\n\n抱歉，暂时无法生成规划，请稍后重试。"


async def pre_search_pois(city: str, intent: dict) -> list:
    """根据意图预搜索 POI，为规划做准备。"""
    keywords = intent.get("interests", []) or intent.get("suggestedPoiTypes", [])
    if not keywords:
        keywords = ["景点,热门"]

    search_keywords = ",".join(keywords) if isinstance(keywords, list) else str(keywords)

    try:
        pois = await search_pois(city, search_keywords)
        filtered = filter_and_rank_pois(pois, {
            "max_results": 10,
            "prefer_types": intent.get("interests", []),
            "avoid_types": intent.get("specialRequirements", []),
        })
        return filtered
    except Exception:
        return []