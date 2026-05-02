from datetime import datetime, timedelta
import math
import json
from src.llm.chat import get_chat_response
from src.llm.embedding import get_embedding
from src.database import AsyncSessionLocal
from src.models.preference import UserPreference


MAX_PREFERENCES_PER_USER = 100


async def extract_and_save_preferences(user_id: int, raw_input: str):
    """
    1. 调用 LLM 提取结构化偏好
    2. 生成 embedding 向量
    3. 存入 PostgreSQL
    4. 超过上限时删除最老的
    """
    # LLM 提取关键词偏好
    extract_prompt = f"""你是一个旅行偏好提取助手。从用户输入中提取3-5个关键词偏好。

用户输入：{raw_input}

请列出提取的偏好关键词，如：亲子游、放松、美食、自然风光、文化探索。

每个偏好单独一行，不需要额外说明。"""

    messages = [
        {"role": "system", "content": "你是一个旅行偏好提取助手。"},
        {"role": "user", "content": extract_prompt},
    ]

    preference_text = await get_chat_response(messages)
    if not preference_text or len(preference_text.strip()) < 2:
        return

    # 生成 embedding
    preference_vector = await get_embedding(preference_text)

    # 存入数据库
    async with AsyncSessionLocal() as session:
        pref = UserPreference(
            user_id=user_id,
            preference_text=preference_text.strip(),
            preference_vector=preference_vector,
            source="input",
        )
        session.add(pref)
        await session.commit()

    # 清理超过上限的记录
    await _cleanup_old_preferences(user_id)


async def _cleanup_old_preferences(user_id: int):
    """删除超过上限的最老偏好记录。"""
    async with AsyncSessionLocal() as session:
        from sqlalchemy import select, delete

        # 统计当前数量
        result = await session.execute(
            select(UserPreference)
            .where(UserPreference.user_id == user_id)
            .order_by(UserPreference.created_at.asc())
        )
        all_prefs = result.scalars().all()

        if len(all_prefs) > MAX_PREFERENCES_PER_USER:
            excess = len(all_prefs) - MAX_PREFERENCES_PER_USER
            to_delete_ids = [p.id for p in all_prefs[:excess]]

            await session.execute(
                delete(UserPreference)
                .where(UserPreference.id.in_(to_delete_ids))
            )
            await session.commit()


async def query_weighted_preferences(user_id: int, current_input: str, top_k: int = 5) -> list[dict]:
    """
    查询用户偏好，带时间衰减权重。
    返回加权后得分最高的 top_k 条偏好。
    """
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(UserPreference)
            .where(UserPreference.user_id == user_id)
            .order_by(UserPreference.created_at.desc())
        )
        prefs = result.scalars().all()

    weighted_results = []
    for pref in prefs:
        weight = _calculate_weight(pref.created_at)
        # 只有当 current_input 非空时才计算相似度
        if current_input and pref.preference_vector:
            current_vector = await get_embedding(current_input)
            similarity = _cosine_similarity(current_vector, pref.preference_vector)
            final_score = similarity * weight
        else:
            similarity = None
            final_score = weight  # 无相似度时只用时间权重

        weighted_results.append({
            "id": pref.id,
            "text": pref.preference_text,
            "source": pref.source,
            "created_at": pref.created_at.isoformat() if pref.created_at else None,
            "similarity": round(similarity, 4) if similarity is not None else None,
            "weight": round(weight, 4),
            "final_score": round(final_score, 4),
        })

    # 按 final_score 排序
    weighted_results.sort(key=lambda x: x["final_score"], reverse=True)
    return weighted_results[:top_k]


def _calculate_weight(created_at: datetime) -> float:
    """
    指数衰减：每天衰减约 1%
    - 今天: weight = 1.0
    - 7 天前: weight ≈ 0.93
    - 30 天前: weight ≈ 0.74
    - 90 天前: weight ≈ 0.41
    """
    if not created_at:
        return 0.0
    days_elapsed = (datetime.now() - created_at.replace(tzinfo=None)).days
    return math.exp(-0.01 * days_elapsed)


def _cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """计算两个向量的余弦相似度。"""
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0

    dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return dot_product / (norm_a * norm_b)


async def detect_conflicts(user_id: int, threshold: float = 0.3) -> list[dict]:
    """
    检测用户在近期内（7天）偏好差异过大的情况。
    threshold: cosine distance 阈值，超过该值视为矛盾（distance > threshold）
    注意：similarity < (1 - threshold) 时视为矛盾
    """
    async with AsyncSessionLocal() as session:
        from datetime import timedelta

        week_ago = datetime.now() - timedelta(days=7)
        result = await session.execute(
            select(UserPreference)
            .where(
                UserPreference.user_id == user_id,
                UserPreference.created_at >= week_ago,
            )
        )
        recent_prefs = result.scalars().all()

    conflicts = []
    for i, pref_a in enumerate(recent_prefs):
        for pref_b in recent_prefs[i + 1:]:
            similarity = _cosine_similarity(pref_a.preference_vector, pref_b.preference_vector)
            distance = 1 - similarity
            if distance > threshold:
                conflicts.append({
                    "pref_a": pref_a.preference_text,
                    "pref_b": pref_b.preference_text,
                    "distance": round(distance, 4),
                    "created_at_a": pref_a.created_at.isoformat() if pref_a.created_at else None,
                    "created_at_b": pref_b.created_at.isoformat() if pref_b.created_at else None,
                })

    return conflicts