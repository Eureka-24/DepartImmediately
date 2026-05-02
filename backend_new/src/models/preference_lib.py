from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
from src.database import Base


class PreferenceLib(Base):
    """
    标准偏好库，包含常见旅行偏好标签及同义词。
    用于通过向量检索实现用户偏好的语义扩展。
    """
    __tablename__ = "preference_lib"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tag = Column(String(64), nullable=False, unique=True)  # 偏好标签，如"亲子游"
    description = Column(Text)  # 标签描述
    synonyms = Column(Text)  # 同义词列表，逗号分隔
    embedding_vector = Column(JSONB)  # tag+description+synonyms 组合向量 (1024维)
    created_at = Column(DateTime, default=datetime.utcnow)
