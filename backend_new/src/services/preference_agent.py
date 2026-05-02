from datetime import datetime, timedelta
import math
from sqlalchemy import select, delete
from src.llm.chat import get_chat_response
from src.llm.embedding import get_embedding
from src.database import AsyncSessionLocal
from src.models.preference import UserPreference
from src.models.preference_lib import PreferenceLib


MAX_PREFERENCES_PER_USER = 100


async def extract_single_preferences(raw_input: str) -> list[str]:
    """
    从用户原始输入提取标准偏好标签（不存储）。

    Returns:
        List of standard preference tags, e.g. ["亲子游", "自然风光", "户外探险"]
    """
    if not raw_input or len(raw_input.strip()) < 2:
        return []

    # Get all tags from preference_lib as reference
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(PreferenceLib.tag).limit(100)
        )
        lib_tags = [row[0] for row in result.fetchall()]

    tags_reference = "\n".join(lib_tags) if lib_tags else "无"

    extract_prompt = f"""你是一个旅行偏好提取助手。请从用户输入中提取标准偏好标签。

【用户输入】
{raw_input}

【标准偏好库参考】
{tags_reference}

【要求】
1. 从标准偏好库中选择 3-5 个与用户输入最相关的标签
2. 每个标签单独一行
3. 只返回标签名称，不返回其他内容"""

    messages = [
        {"role": "system", "content": "你是一个旅行偏好提取助手。"},
        {"role": "user", "content": extract_prompt},
    ]

    response = await get_chat_response(messages)
    if not response or len(response.strip()) < 2:
        return []

    # Parse response: each line is a tag
    tags = []
    for line in response.strip().split("\n"):
        tag = line.strip().strip("•-_*1234567890.。 ").strip()
        if tag:
            tags.append(tag)

    return tags[:5]  # Limit to 5 tags


async def save_preferences(user_id: int, task_id: str, preferences: list[str]):
    """
    批量存储偏好列表，关联 task_id。

    Args:
        user_id: User ID
        task_id: Task ID to link
        preferences: List of preference tags to save
    """
    if not preferences:
        return

    async with AsyncSessionLocal() as session:
        for pref_text in preferences:
            # Generate embedding for each tag
            pref_vector = await get_embedding(pref_text)

            pref = UserPreference(
                user_id=user_id,
                task_id=task_id,
                preference_text=pref_text,
                preference_vector=pref_vector,
                source="input",
            )
            session.add(pref)

        await session.commit()

    # Cleanup old preferences
    await _cleanup_old_preferences(user_id)


async def _cleanup_old_preferences(user_id: int):
    """删除超过上限的最老偏好记录。"""
    async with AsyncSessionLocal() as session:
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


async def query_extended_preferences(user_id: int, top_k: int = 5) -> list[str]:
    """
    查询用户历史偏好，语义检索标准库，返回扩展偏好。

    流程：
    1. 查询用户最近 N 条历史偏好
    2. 计算时间衰减权重，加权平均历史偏好向量
    3. 向量检索 preference_lib，返回最相似的 top_k 个标签

    Returns:
        List of extended preference tags, e.g. ["亲子游", "家庭游", "儿童乐园", "自然风光", "户外探险"]
    """
    # Step 1: Query user history
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(UserPreference)
            .where(UserPreference.user_id == user_id)
            .order_by(UserPreference.created_at.desc())
        )
        prefs = result.scalars().all()

    if not prefs:
        return []

    # Step 2: Calculate weighted average vector of history
    weighted_vectors = []
    weights = []

    for pref in prefs:
        if pref.preference_vector:
            weight = _calculate_weight(pref.created_at)
            weighted_vectors.append(pref.preference_vector)
            weights.append(weight)

    if not weighted_vectors:
        return []

    # Weighted average
    total_weight = sum(weights)
    avg_vector = [
        sum(v[i] * w for v, w in zip(weighted_vectors, weights)) / total_weight
        for i in range(len(weighted_vectors[0]))
    ]

    # Step 3: Vector search in preference_lib
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(PreferenceLib)
        )
        all_lib_prefs = result.scalars().all()

    similarities = []
    for lib_pref in all_lib_prefs:
        if lib_pref.embedding_vector:
            similarity = _cosine_similarity(avg_vector, lib_pref.embedding_vector)
            similarities.append((lib_pref.tag, similarity))

    # Sort by similarity descending
    similarities.sort(key=lambda x: x[1], reverse=True)

    # Return top_k tags
    return [tag for tag, _ in similarities[:top_k]]


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
            if pref_a.preference_vector and pref_b.preference_vector:
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


# Legacy function for backward compatibility with routes/preferences.py
async def query_weighted_preferences(user_id: int, current_input: str, top_k: int = 5) -> list[dict]:
    """
    查询用户偏好，带时间衰减权重。
    Returns weighted results with similarity scores.
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
        if current_input and pref.preference_vector:
            current_vector = await get_embedding(current_input)
            similarity = _cosine_similarity(current_vector, pref.preference_vector)
            final_score = similarity * weight
        else:
            similarity = None
            final_score = weight

        weighted_results.append({
            "id": pref.id,
            "text": pref.preference_text,
            "source": pref.source,
            "created_at": pref.created_at.isoformat() if pref.created_at else None,
            "similarity": round(similarity, 4) if similarity is not None else None,
            "weight": round(weight, 4),
            "final_score": round(final_score, 4),
        })

    weighted_results.sort(key=lambda x: x["final_score"], reverse=True)
    return weighted_results[:top_k]
