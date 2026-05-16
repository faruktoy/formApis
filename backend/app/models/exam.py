from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class Exam(Base):
    __tablename__ = "exams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=False)
    answer_key = Column(JSONB, nullable=True)
    question_count = Column(Integer, nullable=False, default=200)
    is_active = Column(Boolean, default=False)
    deadline = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    class_ = relationship("Class")
    template = relationship("Template")
