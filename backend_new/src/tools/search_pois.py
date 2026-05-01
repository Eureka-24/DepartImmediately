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