import asyncio
import hashlib
import time
import re
from typing import Optional

import requests

from src.config import get_settings

settings = get_settings()

MAX_RETRIES = 3
RETRY_DELAY = 3  # seconds

# 城市名到城市代码映射
CITY_NAME_TO_CODE = {
    "北京": "010",
    "上海": "021",
    "杭州": "0571",
    "成都": "028",
    "西安": "029",
    "重庆": "023",
}


def _sign(params: dict) -> str:
    """Generate signature for Amap API request."""
    sorted_params = sorted(params.items(), key=lambda x: x[0])
    sign_str = "".join(f"{k}{v}" for k, v in sorted_params)
    sign_str += settings.AMAP_SECURITY_CODE
    return hashlib.md5(sign_str.encode()).hexdigest()


def _is_rate_limited(data) -> bool:
    """Check if response indicates rate limiting."""
    data_str = str(data).lower()
    return any(kw in data_str for kw in ["CUQPS_HAS_EXCEEDED", "rate limit", "频率", "limit exceeded", "10012"])


def _make_request(url: str, params: dict) -> Optional[dict]:
    """Make a request with retry logic for rate limiting."""
    if settings.AMAP_SECURITY_CODE:
        params["sig"] = _sign(params)

    for attempt in range(MAX_RETRIES):
        try:
            response = requests.get(url, params=params, timeout=15)
            data = response.json()

            if _is_rate_limited(data):
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_DELAY)
                    continue
                return None

            return data
        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)
                continue
            return None

    return None


def _format_duration(seconds) -> str:
    """Format seconds to human readable duration."""
    try:
        seconds = int(seconds)
    except (ValueError, TypeError):
        return "未知"
    if seconds < 60:
        return f"{seconds}秒"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}分钟"
    hours = minutes // 60
    remaining_minutes = minutes % 60
    if remaining_minutes == 0:
        return f"{hours}小时"
    return f"{hours}小时{remaining_minutes}分钟"


def _format_distance(meters) -> str:
    """Format meters to human readable distance."""
    try:
        meters = int(meters)
    except (ValueError, TypeError):
        return "未知"
    if meters < 1000:
        return f"{meters}米"
    km = meters / 1000
    if km == int(km):
        return f"{int(km)}公里"
    return f"{km:.1f}公里"


def _get_city_code(city_name: str) -> Optional[str]:
    """Convert city name to city code for Amap API."""
    # 先尝试直接映射
    if city_name in CITY_NAME_TO_CODE:
        return CITY_NAME_TO_CODE[city_name]
    # 尝试查询城市编码
    url = "https://restapi.amap.com/v3/config/district"
    params = {
        "key": settings.AMAP_KEY,
        "keywords": city_name,
        "subdistrict": 0,
        "output": "json",
    }
    data = _make_request(url, params)
    if data and data.get("districts"):
        return data["districts"][0].get("citycode")
    return None


def _clean_address(address: str) -> str:
    """Clean address string - remove parenthetical content and special characters."""
    if not address:
        return address
    # Remove content in parentheses and after "或" or "；"
    cleaned = re.sub(r'[（(][^）)]*[)）]', '', address)
    cleaned = re.split(r'[或；;]', cleaned)[0]
    return cleaned.strip()


def geocode_address(address: str) -> Optional[dict]:
    """
    Convert address string to coordinates via Amap Geocoder API.
    Returns dict with lng, lat or None if failed.
    """
    url = "https://restapi.amap.com/v3/geocode/geo"

    cleaned = _clean_address(address)

    params = {
        "key": settings.AMAP_KEY,
        "address": cleaned,
        "output": "json",
    }

    data = _make_request(url, params)
    if not data:
        # Fallback: try original address if cleaning changed it
        if cleaned != address:
            params["address"] = address
            data = _make_request(url, params)
        if not data:
            return None

    geocodes = data.get("geocodes", [])
    if not geocodes:
        return None

    location = geocodes[0].get("location", "")
    if not location:
        return None

    parts = location.split(",")
    if len(parts) != 2:
        return None

    return {
        "lng": float(parts[0]),
        "lat": float(parts[1]),
    }


def _parse_polyline(path_str: str) -> str:
    """Parse polyline from Amap response to simplified string format."""
    if not path_str:
        return ""
    return path_str.replace(";", ";")


async def search_transit(
    origin: str,
    destination: str,
    departure_time: Optional[str] = None,
    city: Optional[str] = None,
) -> Optional[dict]:
    """
    Search transit route via Amap Transit API v5.
    origin/destination: "lng,lat" format
    departure_time: "HHMM" format, e.g. "1200" for 12:00
    city: city name for transit search (e.g., "北京")
    Returns structured segment data or None.
    """
    url = "https://restapi.amap.com/v5/direction/transit/integrated"

    # 获取城市代码
    city_code = city
    if city and city not in CITY_NAME_TO_CODE.values():
        code = _get_city_code(city)
        if code:
            city_code = code

    params = {
        "key": settings.AMAP_KEY,
        "origin": origin,
        "destination": destination,
        "city1": city_code or "010",
        "city2": city_code or "010",
        "strategy": 0,  # 推荐模式
        "nightflag": 0,
        "date": time.strftime("%Y%m%d"),
        "show_fields": "polyline,cost,navi",
        "output": "json",
    }

    if departure_time:
        params["time"] = departure_time

    data = _make_request(url, params)
    if not data or data.get("status") != "1":
        return None

    route = data.get("route", {})
    paths = route.get("transits", [])
    if not paths:
        return None

    # 使用第一（推荐）路线
    transit = paths[0]

    # 解析 segments
    segments = []
    for seg in transit.get("segments", []):
        walking = seg.get("walking", {})
        bus = seg.get("bus", {})
        metro = seg.get("metro", {})

        # 步行路段
        if walking.get("steps"):
            for step in walking["steps"]:
                instruction = step.get("instruction", "")
                road = step.get("road_name", "") or step.get("road", "")
                distance = step.get("distance", 0)
                segments.append({
                    "instruction": instruction,
                    "road": road if road else "步行",
                    "distance": _format_distance(distance) if distance else "0米",
                })

        # 公交/地铁路段
        if bus.get("buslines"):
            for line in bus["buslines"]:
                name = line.get("name", "")
                instruction = f"乘坐{name}"
                segments.append({
                    "instruction": instruction,
                    "road": name,
                    "distance": "0米",
                })

        # 地铁路段
        if metro.get("lines"):
            for line in metro["lines"]:
                name = line.get("name", "")
                instruction = f"乘坐地铁{name}"
                segments.append({
                    "instruction": instruction,
                    "road": name,
                    "distance": "0米",
                })

    # 构建道路摘要
    road_parts = []
    for seg in segments[:5]:
        if seg["road"] and seg["road"] not in road_parts and seg["road"] not in ["步行"]:
            road_parts.append(seg["road"])
    road_summary = " → ".join(road_parts) if road_parts else "公交路线"

    distance = transit.get("distance", 0)
    # v5 API 中 duration 在 cost 对象里
    duration = transit.get("cost", {}).get("duration", 0) or 0

    # 获取 polyline（路线坐标点串）
    # v5 公交 API 的 polyline 在 segments 中的 walking 路段
    polyline_parts = []
    for seg in transit.get("segments", []):
        walking = seg.get("walking", {})
        if walking:
            for step in walking.get("steps", []):
                polyline = step.get("polyline")
                if polyline:
                    polyline_parts.append(str(polyline))
    polyline = ";".join(polyline_parts)

    return {
        "distance": _format_distance(distance) if distance else "未知",
        "duration": _format_duration(int(duration)) if duration else "未知",
        "road_summary": road_summary,
        "polyline": polyline,
        "steps": segments,
    }


async def search_driving(
    origin: str,
    destination: str,
    waypoints: Optional[list[str]] = None,
    strategy: int = 0,
) -> Optional[dict]:
    """
    Search driving route via Amap Driving API v5.
    origin/destination: "lng,lat" format
    Returns structured segment data with polyline and steps.
    """
    url = "https://restapi.amap.com/v5/direction/driving"
    params = {
        "key": settings.AMAP_KEY,
        "origin": origin,
        "destination": destination,
        "strategy": strategy,
        "show_fields": "polyline,navi,cost",
        "output": "json",
    }

    if waypoints:
        params["waypoints"] = ";".join(waypoints)

    data = _make_request(url, params)
    if not data or data.get("status") != "1":
        return None

    route = data.get("route", {})
    paths = route.get("paths", [])
    if not paths:
        return None

    path = paths[0]
    distance = path.get("distance", 0)
    duration = path.get("duration", 0)

    # 解析 steps
    steps = []
    road_parts = []
    for step in path.get("steps", []):
        instruction = step.get("instruction", "")
        road = step.get("road_name", "") or step.get("road", "")
        step_distance = step.get("step_distance", 0) or step.get("distance", 0)

        steps.append({
            "instruction": instruction,
            "road": road if road else "",
            "distance": _format_distance(step_distance) if step_distance else "0米",
        })

        if road and road not in road_parts:
            road_parts.append(road)

    road_summary = " → ".join(road_parts[:5]) if road_parts else "驾车路线"

    return {
        "distance": _format_distance(distance) if distance else "未知",
        "duration": _format_duration(duration) if duration else "未知",
        "road_summary": road_summary,
        "polyline": _parse_polyline(path.get("polyline", "")),
        "steps": steps,
    }


async def search_walking(
    origin: str,
    destination: str,
) -> Optional[dict]:
    """
    Search walking route via Amap Walking API v5.
    origin/destination: "lng,lat" format
    Returns structured segment data with polyline and steps.
    """
    url = "https://restapi.amap.com/v5/direction/walking"
    params = {
        "key": settings.AMAP_KEY,
        "origin": origin,
        "destination": destination,
        "show_fields": "polyline,navi",
        "output": "json",
    }

    data = _make_request(url, params)
    if not data or data.get("status") != "1":
        return None

    route = data.get("route", {})
    paths = route.get("paths", [])
    if not paths:
        return None

    path = paths[0]
    distance = path.get("distance", 0)
    duration = path.get("duration", 0)

    # 解析 steps
    steps = []
    road_parts = []
    for step in path.get("steps", []):
        instruction = step.get("instruction", "")
        road = step.get("road_name", "") or step.get("road", "")
        step_distance = step.get("step_distance", 0) or step.get("distance", 0)

        steps.append({
            "instruction": instruction,
            "road": road if road else "",
            "distance": _format_distance(step_distance) if step_distance else "0米",
        })

        if road and road not in road_parts:
            road_parts.append(road)

    road_summary = " → ".join(road_parts) if road_parts else "步行路线"

    return {
        "distance": _format_distance(distance) if distance else "未知",
        "duration": _format_duration(duration) if duration else "未知",
        "road_summary": road_summary,
        "polyline": _parse_polyline(path.get("polyline", "")),
        "steps": steps,
    }


async def search_riding(
    origin: str,
    destination: str,
    strategy: int = 0,
) -> Optional[dict]:
    """
    Search riding route via Amap Riding API v5.
    origin/destination: "lng,lat" format
    strategy: 0=综合, 1=推荐路线, 2=最快路线
    Returns structured segment data with polyline and steps.
    """
    url = "https://restapi.amap.com/v5/direction/bicycling"
    params = {
        "key": settings.AMAP_KEY,
        "origin": origin,
        "destination": destination,
        "strategy": strategy,
        "show_fields": "polyline,navi",
        "output": "json",
    }

    data = _make_request(url, params)
    if not data or data.get("status") != "1":
        return None

    route = data.get("route", {})
    paths = route.get("paths", [])
    if not paths:
        return None

    path = paths[0]
    distance = path.get("distance", 0)
    duration = path.get("duration", 0)

    # 解析 steps
    steps = []
    road_parts = []
    for step in path.get("steps", []):
        instruction = step.get("instruction", "")
        road = step.get("road_name", "") or step.get("road", "")
        step_distance = step.get("step_distance", 0) or step.get("distance", 0)

        steps.append({
            "instruction": instruction,
            "road": road if road else "",
            "distance": _format_distance(step_distance) if step_distance else "0米",
        })

        if road and road not in road_parts:
            road_parts.append(road)

    road_summary = " → ".join(road_parts) if road_parts else "骑行路线"

    return {
        "distance": _format_distance(distance) if distance else "未知",
        "duration": _format_duration(duration) if duration else "未知",
        "road_summary": road_summary,
        "polyline": _parse_polyline(path.get("polyline", "")),
        "steps": steps,
    }


async def route_planning(
    origin: str,
    destination: str,
    waypoints: list[str] = None,
    strategy: int = 0,
) -> dict:
    """
    Plan a route via Amap driving API v5.
    strategy: 0=速度优先, 1=费用优先, 2=距离优先
    Returns dict with route summary and steps.
    """
    url = "https://restapi.amap.com/v5/direction/driving"
    params = {
        "key": settings.AMAP_KEY,
        "origin": origin,
        "destination": destination,
        "strategy": strategy,
        "show_fields": "cost",
        "output": "json",
    }
    if waypoints:
        params["waypoints"] = ";".join(waypoints)

    data = _make_request(url, params)
    if not data or data.get("status") != "1":
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
