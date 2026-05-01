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


async def route_planning(
    origin: str,
    destination: str,
    waypoints: list[str] = None,
    strategy: int = 0,
) -> dict:
    """
    Plan a route via Amap driving API.
    strategy: 0=速度优先, 1=费用优先, 2=距离优先
    Returns dict with route summary and steps.
    """
    url = "https://restapi.amap.com/v3/direction/driving"
    params = {
        "key": settings.AMAP_KEY,
        "origin": origin,
        "destination": destination,
        "strategy": strategy,
        "output": "json",
    }
    if waypoints:
        params["waypoints"] = ";".join(waypoints)

    if settings.AMAP_SECURITY_CODE:
        params["sig"] = _sign(params)

    try:
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
    except Exception:
        return {}

    if _is_rate_limited(data):
        return {}

    route = data.get("route", {})
    paths = route.get("paths", [])
    if not paths:
        return {}

    return {
        "distance": paths[0].get("distance", ""),
        "duration": paths[0].get("duration", ""),
        "strategy": strategy,
    }