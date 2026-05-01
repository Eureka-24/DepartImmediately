from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://wayfinder:wayfinder_secret@localhost:5432/wayfinder"

    # LLM
    DEEPSEEK_API_KEY: str = ""
    ZHIPU_API_KEY: str = ""

    # Amap
    AMAP_KEY: str = ""
    AMAP_SECURITY_CODE: str = ""

    # Auth
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_HOURS: int = 24 * 7  # 7 days

    # Server
    PORT: int = 8000
    CORS_ORIGIN: str = "http://localhost:5173"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()