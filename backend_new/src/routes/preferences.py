from fastapi import APIRouter, Depends
from src.middleware.auth import get_current_user
from src.models.user import User
from src.services.preference_agent import (
    query_weighted_preferences,
    detect_conflicts,
)

router = APIRouter(prefix="/api/preferences", tags=["preferences"])


@router.get("")
async def get_preferences(
    current_user: User = Depends(get_current_user),
):
    """获取用户偏好，带时间衰减权重。"""
    prefs = await query_weighted_preferences(current_user.id, "", top_k=20)
    return {"success": True, "data": prefs}


@router.get("/conflicts")
async def get_conflicts(
    threshold: float = 0.3,
    current_user: User = Depends(get_current_user),
):
    """检测近期偏好矛盾。"""
    conflicts = await detect_conflicts(current_user.id, threshold)
    return {"success": True, "data": conflicts}