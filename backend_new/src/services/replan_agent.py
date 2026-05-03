"""
重新规划服务。

当用户确认景点列表后，使用这些景点进行路径规划。
与普通规划的区别：
- 不需要意图识别（用户已确认景点）
- 不需要 AI 生成路线详情（用户已选择）
- 只需要计算景点间的路径和交通
"""

from src.llm.chat import get_chat_response
from src.tools.route_planning import route_planning


SYSTEM_PROMPT_REPLAN = """你是一位专业的旅行规划师。根据用户提供的景点列表和时间范围，生成完整的旅行路线。

【输入】
用户已经选择了以下景点：
{pois_list}

旅行时间范围：{start_time} - {end_time}

【任务】
1. 为每个景点分配合理的游览时间
2. 根据地理位置优化景点顺序
3. 生成交通指引

【输出格式】
请以 Markdown 格式输出旅行规划，包含：
- 每个景点的游览时间
- 景点间的交通方式
- 总体时间安排

【约束】
- 每个 POI 停留时间默认 60-120 分钟
- 出行时间超过 20 分钟需注明交通方式
- 确保总时长不超过用户指定的时间范围"""


async def generate_replan(
    pois: list[dict],
    city: str,
    start_time: str,
    end_time: str,
) -> str:
    """
    根据用户确认的景点列表生成重新规划的 Markdown。
    """
    # 构建 POI 列表字符串
    pois_list_text = []
    for i, poi in enumerate(pois):
        name = poi.get("name", "未知景点")
        poi_type = poi.get("type", "景点")
        location = poi.get("location", "")
        pois_list_text.append(f"{i+1}. {name} (类型: {poi_type}, 位置: {location})")

    user_message = f"""请为以下已确认的景点生成规划：

【已确认景点】
{chr(10).join(pois_list_text)}

【旅行时间】
{start_time} - {end_time}

请生成完整的旅行路线规划。"""

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT_REPLAN.format(
            pois_list=chr(10).join(pois_list_text),
            start_time=start_time,
            end_time=end_time
        )},
        {"role": "user", "content": user_message},
    ]

    return await get_chat_response(messages)