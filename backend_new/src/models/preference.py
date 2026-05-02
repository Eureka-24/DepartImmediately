from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
from src.database import Base


class UserPreference(Base):
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False)
    preference_text = Column(Text, nullable=False)
    preference_vector = Column(JSONB)  # Store as JSON array, DB has VECTOR(1024)
    source = Column(String, default="input")
    created_at = Column(DateTime, default=datetime.utcnow)