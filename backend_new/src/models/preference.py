from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
from src.database import Base


class UserPreference(Base):
    """
    User preference records, linked to tasks via task_id.
    Each record stores a single preference tag extracted from user input.
    """
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False)
    task_id = Column(String(64))  # Link to the task that generated this preference
    preference_text = Column(String(255), nullable=False)  # Standard preference tag
    preference_vector = Column(JSONB)  # Embedding vector (1024 dimensions)
    source = Column(String(32), default="input")  # input/manual/system
    created_at = Column(DateTime, default=datetime.utcnow)