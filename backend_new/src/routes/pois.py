from fastapi import APIRouter, Depends
from pydantic import BaseModel
from src.middleware.auth import get_current_user
from src.models.user import User
from src.tools.search_pois import search_pois

router = APIRouter(prefix="/api/pois", tags=["pois"])


class SearchRequest(BaseModel):
    keyword: str
    city: str


class TaskResponse(BaseModel):
    success: bool = True
    data: dict | list | None = None


@router.post("/search", response_model=TaskResponse)
async def search_poi(
    body: SearchRequest,
    current_user: User = Depends(get_current_user),
):
    """
    搜索 POI 景点。

    返回 BasicPOI 结构：
    - name: 景点名称
    - location: 地址字符串或经纬度，如"116.397428,39.90923"
    - lng: 经度
    - lat: 纬度
    - type: POI 类型
    - rating: 评分（可能无）
    - address: 详细地址（可能无）
    """
    pois = await search_pois(
        keywords=body.keyword,
        city=body.city,
    )

    # 转换 location 为 lng/lat
    result = []
    for poi in pois:
        location = poi.get("location", "")
        lng, lat = None, None
        if location:
            parts = location.split(",")
            if len(parts) == 2:
                lng, lat = float(parts[0]), float(parts[1])

        result.append({
            "name": poi.get("name", ""),
            "location": location,
            "lng": lng,
            "lat": lat,
            "type": poi.get("type", ""),
            "rating": None,  # 高德 POI 搜索返回的数据不包含 rating
            "address": poi.get("address", ""),
        })

    return TaskResponse(success=True, data=result)