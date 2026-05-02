from fastapi import APIRouter, Depends
from pydantic import BaseModel
from src.middleware.auth import get_current_user
from src.models.user import User
from src.services.preference_agent import (
    query_weighted_preferences,
    detect_conflicts,
    extract_and_save_preferences,
)

router = APIRouter(prefix="/api/preferences", tags=["preferences"])


class PreferenceCreate(BaseModel):
    text: str


class PreferenceResponse(BaseModel):
    id: int
    text: str
    source: str
    weight: float
    similarity: float | None = None
    final_score: float | None = None
    created_at: str | None = None


@router.get("")
async def get_preferences(
    current_user: User = Depends(get_current_user),
):
    """获取用户偏好，带时间衰减权重。"""
    prefs = await query_weighted_preferences(current_user.id, "", top_k=20)
    return {"success": True, "data": prefs}


@router.post("")
async def create_preference(
    body: PreferenceCreate,
    current_user: User = Depends(get_current_user),
):
    """手动添加用户偏好。"""
    await extract_and_save_preferences(current_user.id, body.text)
    return {"success": True}


@router.get("/conflicts")
async def get_conflicts(
    threshold: float = 0.3,
    current_user: User = Depends(get_current_user),
):
    """检测近期偏好矛盾。"""
    conflicts = await detect_conflicts(current_user.id, threshold)
    return {"success": True, "data": conflicts}