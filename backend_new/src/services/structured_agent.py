import re
import json
from src.llm.chat import get_chat_response


STRUCTURED_AGENT_PROMPT = """你是一个结构化旅行规划输出助手。你的任务是将输入的旅行规划文本（可能是 Markdown 格式）转换为严格的 JSON 格式。

【输入】
{input}

【输出规则】
1. 你必须输出一个有效的 JSON 对象，不能有任何 Markdown 格式标记（如 ```json、``` 等）
2. 不要输出任何解释性文字，只输出纯 JSON
3. JSON 必须符合以下结构：
{{
  "routes": [
    {{
      "name": "景点名称",
      "location": "地址字符串（如：西直门外大街137号）",
      "time": "计划时间（如：第一天（4月28日）17:00 — 19:00）",
      "rating": "评分（如：4.8）",
      "duration": "时长（如：约2小时）",
      "description": "Markdown 格式详细描述，包含地址、交通、注意事项等",
      "reason": "推荐理由，简短描述",
      "transport": "交通信息（第一个景点为"起始点"，后续为交通方式描述）"
    }}
  ],
  "summary": "总体描述"
}}

【重要说明】
- routes 是扁平数组，按时间顺序排列，不是按天分组
- location 使用地址字符串，不要使用经纬度
- description 使用 Markdown 格式，可以包含换行和格式
- transport 第一个 POI 固定为 "起始点"
- 从 Markdown 中提取每个景点的完整信息

【POI 名称要求 - 最重要】
- 每个 POI 的 name 必须是**具体的、真实的景点名称**，如"故宫博物院"、"北京动物园"等
- 绝对不能出现"某个热门景点"、"选择一个适合的地方"、"推荐一个XX"等模糊描述
- 如果 Markdown 中描述的是某个类别（如"亲子乐园"）而不是具体名称，需要根据上下文推断或标注"待确认"
- 只有当 Markdown 明确提供了具体景点名称时，才能输出具体名称

【解析要求】
- 从 Markdown 中提取每个景点的名称、地址、时间、评分、时长、描述
- 如果 Markdown 中没有提供 rating，使用空字符串 ""
- 如果 Markdown 中没有提供 duration，根据时间推算或使用默认值 "约2小时"
- description 应包含 Markdown 格式的详细说明
- 如果发现 Markdown 中有模糊描述（如"某景点"），在 description 中标注"具体名称待确认"

【错误处理】
- 如果输入为空或无法解析，返回 {{ "routes": [], "summary": "解析失败" }}
- 确保 routes 数组至少有一个元素
- 如果 Markdown 中只提供了模糊描述而没有具体名称，依然要输出但在对应字段标注"待确认" """


DEFAULT_POPULAR_ROUTE = {
    "routes": [
        {
            "name": "当地热门景点A",
            "location": "当地热门景点A地址",
            "time": "第一天 09:00 — 11:00",
            "rating": "4.5",
            "duration": "约2小时",
            "description": "不容错过的经典景点，建议提前购票。\n\n**地址：** 景点A地址\n**交通：** 地铁直达",
            "reason": "经典地标，必游推荐",
            "transport": "起始点"
        },
        {
            "name": "当地热门景点B",
            "location": "当地热门景点B地址",
            "time": "第一天 11:30 — 13:00",
            "rating": "4.6",
            "duration": "约1.5小时",
            "description": "知名打卡地，适合拍照留念。\n\n**地址：** 景点B地址\n**交通：** 步行约10分钟",
            "reason": "网红打卡点，景色优美",
            "transport": "步行约10分钟"
        },
        {
            "name": "特色美食街",
            "location": "美食街地址",
            "time": "第一天 13:00 — 14:30",
            "rating": "4.7",
            "duration": "约1.5小时",
            "description": "品尝当地特色美食，多家老字号云集。\n\n**推荐美食：** 特色小吃、当地菜肴\n**地址：** 美食街地址",
            "reason": "美食爱好者天堂",
            "transport": "步行约5分钟"
        },
        {
            "name": "当地热门景点C",
            "location": "当地热门景点C地址",
            "time": "第一天 15:00 — 17:00",
            "rating": "4.8",
            "duration": "约2小时",
            "description": "必游之地，历史文化底蕴深厚。\n\n**地址：** 景点C地址\n**交通：** 地铁/公交直达",
            "reason": "历史文化遗迹",
            "transport": "地铁约20分钟"
        }
    ],
    "summary": "这是一条热门路线，包含当地最受欢迎的景点和美食，适合首次来访的游客。"
}


async def parse_output(markdown_text: str) -> dict:
    """
    将 Markdown 格式的旅行规划转换为标准 JSON 结构。
    对应 Node.js structuredAgent.parse()
    """
    if not markdown_text or not isinstance(markdown_text, str):
        return _error_result("输入为空")

    try:
        result = await _parse_with_llm(markdown_text)
        if _validate_result(result):
            return result
        return _error_result("结果格式验证失败", markdown_text)
    except Exception as e:
        return await _retry_with_prompt(markdown_text, str(e))


async def _parse_with_llm(markdown_text: str) -> dict:
    """使用 LLM 解析 Markdown。"""
    prompt = STRUCTURED_AGENT_PROMPT.replace("{input}", markdown_text)
    messages = [
        {"role": "system", "content": "你是一个结构化旅行规划输出助手。"},
        {"role": "user", "content": prompt},
    ]
    content = await get_chat_response(messages)
    return _extract_json(content)


def _extract_json(content: str) -> dict:
    """从 LLM 输出中提取 JSON。"""
    json_match = re.search(r"```json\s*([\s\S]*?)\s*```|```\s*([\s\S]*?)\s*```|(\{[\s\S]*\})", content)
    json_str = content
    if json_match:
        json_str = json_match.group(1) or json_match.group(2) or json_match.group(3)

    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            raise ValueError("无法解析 JSON")


async def _retry_with_prompt(markdown_text: str, error_msg: str) -> dict:
    """使用更明确的 prompt 重试。"""
    retry_prompt = f"""请将以下旅行规划文本转换为严格的 JSON 格式。

【重要规则】
1. 输出必须是有效的 JSON，不能有任何 Markdown 格式
2. routes 是扁平数组，每个元素是一个 POI
3. 每个 POI 必须包含: name, location, time, rating, duration, description, reason, transport
4. 不要输出任何解释性文字，只输出 JSON

【输入文本】
{markdown_text}

【输出格式】
{{
  "routes": [
    {{
      "name": "景点名称",
      "location": "地址字符串",
      "time": "计划时间",
      "rating": "评分",
      "duration": "时长",
      "description": "Markdown 格式详细描述",
      "reason": "推荐理由",
      "transport": "起始点" 或 "交通方式描述"
    }}
  ],
  "summary": "总体描述"
}}"""

    messages = [
        {"role": "system", "content": "你是一个行程数据解析助手，擅长将自然语言行程解析为结构化JSON。"},
        {"role": "user", "content": retry_prompt},
    ]

    try:
        content = await get_chat_response(messages)
        result = _extract_json(content)
        if _validate_result(result):
            return result
    except Exception:
        pass

    return _error_result(error_msg, markdown_text)


def _validate_result(result: dict) -> bool:
    """验证结果格式。"""
    if not result or not isinstance(result, dict):
        return False
    if not result.get("routes") or not isinstance(result["routes"], list):
        return False
    if len(result["routes"]) == 0:
        return False
    for poi in result["routes"]:
        if not poi.get("name") or not poi.get("time"):
            return False
        if "location" not in poi:
            return False
    return True


def _error_result(error_message: str, raw_text: str = "") -> dict:
    """返回降级错误结果。"""
    return {
        "routes": [
            {
                "name": "规划结果",
                "location": "",
                "time": "09:00",
                "rating": "",
                "duration": "约2小时",
                "description": f"AI 规划结果解析失败，请稍后重试",
                "reason": "解析失败",
                "transport": "起始点",
            },
        ],
        "summary": error_message or "解析失败",
        "error": error_message,
        "rawOutput": raw_text[:500] if raw_text else "",
    }