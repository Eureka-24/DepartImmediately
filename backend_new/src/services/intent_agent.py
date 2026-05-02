from src.llm.chat import get_chat_response


def build_prompt(city: str, start_time: str, end_time: str, duration_minutes: int, preferences: str, extended_preferences: list = None) -> str:
    days = duration_minutes // (60 * 24)
    hours = (duration_minutes % (60 * 24)) // 60

    extended_str = ", ".join(extended_preferences) if extended_preferences else "无"

    return f"""你是一位专业的旅行规划意图识别专家。请从用户的旅行需求描述中提取结构化信息。

【用户输入】
城市: {city}
开始时间: {start_time}
结束时间: {end_time}
旅行时长: 约 {days} 天 {hours} 小时
用户偏好描述: {preferences or '无'}

【用户历史偏好】（语义扩展后的相似偏好）
{extended_str}

说明：以上偏好是基于用户历史行为语义扩展的相关偏好，不是用户直接输入的偏好。请作为参考信息结合用户输入一起分析。

【你的任务】
1. 解析用户输入，提取关键信息
2. 识别用户可能的兴趣点（如亲子游、美食、文化等）
3. 识别特殊需求（如不想排队、避开高峰等）
4. 推断预算等级
5. 建议合适的 POI 类型

【输出格式】
请以以下 JSON 格式返回（只返回 JSON，不要其他内容）：
{{
  "city": "{city}",
  "interests": ["关键词1", "关键词2"],
  "travelStyle": "亲子/休闲/美食/文化/购物/拍照",
  "budget": "经济/中等/奢侈",
  "specialRequirements": ["特殊需求1", "特殊需求2"],
  "suggestedPoiTypes": ["景点", "美食"]
}}"""


async def parse_intent(city: str, start_time: str, end_time: str, preferences: str, extended_preferences: list = None) -> dict:
    """解析用户意图，返回结构化 JSON。"""
    from datetime import datetime

    start = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
    end = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
    duration_minutes = round((end - start).total_seconds() / 60)

    prompt = build_prompt(city, start_time, end_time, duration_minutes, preferences, extended_preferences)

    messages = [
        {"role": "system", "content": "你是一个旅行规划意图识别助手。"},
        {"role": "user", "content": prompt},
    ]

    content = await get_chat_response(messages)
    return _parse_json_response(content, city, start_time, end_time, duration_minutes, preferences)


def _parse_json_response(content: str, city: str, start_time: str, end_time: str, duration_minutes: int, preferences: str) -> dict:
    import re, json

    json_match = re.search(r"```json\s*([\s\S]*?)\s*```|```\s*([\s\S]*?)\s*```|(\{[\s\S]*\})", content)
    json_str = content
    if json_match:
        json_str = json_match.group(1) or json_match.group(2) or json_match.group(3)

    try:
        parsed = json.loads(json_str)
        return {
            "city": city,
            "startTime": start_time,
            "endTime": end_time,
            "duration": duration_minutes,
            "interests": parsed.get("interests", preferences.split(",") if preferences else ["景点"]),
            "travelStyle": parsed.get("travelStyle", "休闲"),
            "budget": parsed.get("budget", "中等"),
            "specialRequirements": parsed.get("specialRequirements", []),
            "suggestedPoiTypes": parsed.get("suggestedPoiTypes", ["景点", "美食"]),
        }
    except json.JSONDecodeError:
        keywords = [s.strip() for s in preferences.split(",") if s.strip()] if preferences else ["景点"]
        return {
            "city": city,
            "startTime": start_time,
            "endTime": end_time,
            "duration": duration_minutes,
            "interests": keywords,
            "travelStyle": "休闲",
            "budget": "中等",
            "specialRequirements": [],
            "suggestedPoiTypes": ["景点", "美食"],
        }