from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime
from src.database import Base


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False)
    city = Column(Text)
    start_time = Column(Text)
    end_time = Column(Text)
    preferences = Column(Text)
    result = Column(Text)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)