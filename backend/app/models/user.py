from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from ..database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(200), nullable=False)
    email = Column(String(200), unique=True, nullable=False, index=True)
    student_number = Column(String(50), unique=True, nullable=True, index=True)
    password_hash = Column(String(300), nullable=False)
    role = Column(String(20), nullable=False, default="student")  # admin|teacher|student
    created_at = Column(DateTime(timezone=True), server_default=func.now())
