from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base

class_students = Table(
    "class_students",
    Base.metadata,
    Column("class_id", Integer, ForeignKey("classes.id", ondelete="CASCADE"), primary_key=True),
    Column("student_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)


class Class(Base):
    __tablename__ = "classes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    teacher = relationship("User", foreign_keys=[teacher_id])
    students = relationship("User", secondary=class_students)
