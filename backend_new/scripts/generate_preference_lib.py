#!/usr/bin/env python
"""
Generate standard preference library using LLM.

This script generates 100 travel preference tags with descriptions and synonyms,
then stores them in the preference_lib table.

Usage:
    python scripts/generate_preference_lib.py

Requires:
    - PostgreSQL running with pgvector extension
    - DATABASE_URL, ZHIPU_API_KEY in .env or environment variable
"""
import asyncio
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.database import AsyncSessionLocal
from src.models.preference_lib import PreferenceLib
from src.llm.chat import get_chat_response
from src.llm.embedding import get_embedding


TRAVEL_PREFERENCE_PROMPT = """你是一个旅行偏好专家。请生成常见旅行偏好标签。

【要求】
生成 {count} 个旅行偏好标签，覆盖以下类型：
- 旅行类型（亲子游、蜜月旅行独自旅行等）
- 景点类型（自然风光、历史遗迹主题公园等）
- 餐饮类型（美食之旅街头小吃特色餐厅等）
- 住宿类型（豪华酒店民宿露营等）
- 活动类型（徒步探险温泉滑雪等）
- 体验类型（文化探索购物娱乐等）

【输出格式】
每个标签包含：tag（标签名）、description（描述，10-20字）、synonyms（同义词，3-5个，逗号分隔）

请以 JSON 数组格式返回，只返回 JSON，不要其他内容。
格式示例：
[
  {{"tag": "亲子游", "description": "适合带儿童一起参与的活动和景点", "synonyms": "家庭游,儿童活动,亲子乐园"}},
  ...
]"""


async def generate_preference_batch(batch_num: int, batch_size: int = 20) -> list[dict]:
    """Generate a batch of preference tags using LLM."""
    prompt = TRAVEL_PREFERENCE_PROMPT.format(count=batch_size)

    messages = [
        {"role": "system", "content": "你是一个旅行偏好专家。"},
        {"role": "user", "content": prompt},
    ]

    response = await get_chat_response(messages)

    # Parse JSON response
    json_match = None
    for pattern in [r"```json\s*([\s\S]*?)\s*```", r"```\s*([\s\S]*?)\s*```", r"(\[[\s\S]*\])"]:
        import re
        json_match = re.search(pattern, response)
        if json_match:
            break

    if not json_match:
        print(f"Warning: Could not parse JSON from batch {batch_num}")
        return []

    try:
        tags = json.loads(json_match.group(1))
        return tags
    except json.JSONDecodeError as e:
        print(f"Warning: JSON parse error in batch {batch_num}: {e}")
        return []


async def generate_all_preferences(total: int = 100, batch_size: int = 20) -> list[dict]:
    """Generate all preference tags in batches."""
    all_tags = []
    batches = (total + batch_size - 1) // batch_size

    print(f"Generating {total} preference tags in {batches} batches...")

    for i in range(batches):
        remaining = total - len(all_tags)
        current_batch_size = min(batch_size, remaining)
        print(f"Generating batch {i+1}/{batches} ({current_batch_size} tags)...")

        tags = await generate_preference_batch(i, current_batch_size)
        all_tags.extend(tags)
        print(f"  Generated {len(tags)} tags. Total: {len(all_tags)}")

    return all_tags[:total]


async def generate_embedding_vector(tag: dict) -> list[float]:
    """Generate embedding vector for a preference tag."""
    text = f"{tag['tag']} {tag['description']} {tag['synonyms']}"
    return await get_embedding(text)


async def save_to_database(preferences: list[dict]):
    """Save preference tags to database, skipping duplicates using upsert."""
    from sqlalchemy.dialects.postgresql import insert

    print(f"Saving {len(preferences)} preferences to database...")

    async with AsyncSessionLocal() as session:
        for pref in preferences:
            # Generate embedding vector
            embedding = await generate_embedding_vector(pref)

            stmt = insert(PreferenceLib).values(
                tag=pref["tag"],
                description=pref["description"],
                synonyms=pref["synonyms"],
                embedding_vector=embedding,
            )
            stmt = stmt.on_conflict_do_nothing(index_elements=["tag"])
            await session.execute(stmt)

        await session.commit()
        print("Preferences saved successfully.")


async def save_to_json(preferences: list[dict], output_path: str = None):
    """Save preference tags to JSON file (for manual inspection/import)."""
    if output_path is None:
        output_path = os.path.join(
            os.path.dirname(__file__),
            "preference_lib_output.json"
        )

    # Generate embeddings
    enriched_prefs = []
    for i, pref in enumerate(preferences):
        print(f"Generating embedding for {i+1}/{len(preferences)}: {pref['tag']}")
        embedding = await generate_embedding_vector(pref)
        enriched_prefs.append({
            **pref,
            "embedding_vector": embedding,
        })

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(enriched_prefs, f, ensure_ascii=False, indent=2)

    print(f"Preferences saved to {output_path}")


async def main():
    import argparse

    parser = argparse.ArgumentParser(description="Generate travel preference library")
    parser.add_argument("--count", type=int, default=100, help="Number of tags to generate (default: 100)")
    parser.add_argument("--batch-size", type=int, default=20, help="Batch size for LLM calls (default: 20)")
    parser.add_argument("--output", type=str, default=None, help="Output JSON file path")
    parser.add_argument("--save-db", action="store_true", help="Save directly to database")

    args = parser.parse_args()

    # Generate preferences
    preferences = await generate_all_preferences(args.count, args.batch_size)

    if not preferences:
        print("No preferences generated. Exiting.")
        sys.exit(1)

    print(f"\nGenerated {len(preferences)} preferences.")

    # Save preferences
    if args.save_db:
        await save_to_database(preferences)
    else:
        await save_to_json(preferences, args.output)

    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
