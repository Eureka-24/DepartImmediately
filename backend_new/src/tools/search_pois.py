import hashlib
import requests
from src.config import get_settings

settings = get_settings()


def _sign(params: dict) -> str:
    """Generate signature for Amap API request."""
    sorted_params = sorted(params.items(), key=lambda x: x[0])
    sign_str = "".join(f"{k}{v}" for k, v in sorted_params)
    sign_str += settings.AMAP_SECURITY_CODE
    return hashlib.md5(sign_str.encode()).hexdigest()


def _is_rate_limited(data) -> bool:
    """Check if response indicates rate limiting."""
    data_str = str(data).lower()
    return any(kw in data_str for kw in ["CUQPS_HAS_EXCEEDED", "rate limit", "频率", "limit exceeded"])


async def search_pois(keywords: str, city: str, types: str = None) -> list[dict]:
    """Search POIs via Amap API. Returns list of POI dicts."""
    url = "https://restapi.amap.com/v3/place/text"
    params = {
        "key": settings.AMAP_KEY,
        "keywords": keywords,
        "city": city,
        "output": "json",
        "page": 1,
        "offset": 10,
    }
    if types:
        params["types"] = types

    if settings.AMAP_SECURITY_CODE:
        params["sig"] = _sign(params)

    try:
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
    except Exception:
        return []

    if _is_rate_limited(data):
        return []

    pois = data.get("pois", [])
    return [
        {
            "name": p.get("name", ""),
            "address": p.get("address", ""),
            "location": p.get("location", ""),
            "type": p.get("type", ""),
        }
        for p in pois
    ]


def filter_and_rank_pois(pois: list, options: dict = None) -> list:
    """
    根据选项过滤和排序 POI。
    对应 Node.js searchPois.js filterAndRankPois()
    """
    if options is None:
        options = {}

    max_results = options.get("max_results", 8)
    prefer_types = options.get("prefer_types", [])
    avoid_types = options.get("avoid_types", [])

    filtered = list(pois)

    # 排除某些类型
    if avoid_types:
        filtered = [
            p for p in filtered
            if not any(t.lower() in (p.get("type") or "").lower() for t in avoid_types)
        ]

    # 优先某些类型，按评分排序
    def sort_key(p):
        score = p.get("rating", 0) or 0
        if prefer_types:
            matched = any(t in (p.get("type") or "") for t in prefer_types)
            if matched:
                score += 1000
        return score

    filtered.sort(key=sort_key, reverse=True)
    return filtered[:max_results]