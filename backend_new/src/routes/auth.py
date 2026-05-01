from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
import bcrypt
from jose import jwt
from datetime import datetime, timedelta
from sqlalchemy import select
from src.config import get_settings
from src.database import AsyncSessionLocal
from src.models.user import User
from src.middleware.auth import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    success: bool = True
    data: dict | None = None


def create_access_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(hours=settings.JWT_EXPIRATION_HOURS)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


@router.post("/register", response_model=TokenResponse)
async def register(body: RegisterRequest):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(User.username == body.username)
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already exists",
            )

        hashed = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
        user = User(username=body.username, password=hashed)
        session.add(user)
        await session.commit()
        await session.refresh(user)

        token = create_access_token(user.id)
        return TokenResponse(
            success=True,
            data={
                "token": token,
                "user": {"id": user.id, "username": user.username},
            },
        )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(User.username == body.username)
        )
        user = result.scalar_one_or_none()

        if not user or not bcrypt.checkpw(body.password.encode(), user.password.encode()):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password",
            )

        token = create_access_token(user.id)
        return TokenResponse(
            success=True,
            data={
                "token": token,
                "user": {"id": user.id, "username": user.username},
            },
        )


@router.get("/verify", response_model=TokenResponse)
async def verify(current_user: User = Depends(get_current_user)):
    return TokenResponse(
        success=True,
        data={"user": {"id": current_user.id, "username": current_user.username}},
    )