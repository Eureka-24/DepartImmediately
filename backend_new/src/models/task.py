from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from datetime import datetime
from src.database import Base


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Text, primary_key=True)
    user_id = Column(Integer, nullable=False)
    input = Column(JSON, nullable=False)
    result = Column(JSON)
    error = Column(Text)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)