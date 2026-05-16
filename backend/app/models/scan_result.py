from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class ScanResult(Base):
    __tablename__ = "scan_results"

    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id"), nullable=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    scanned_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=True)
    student_number_read = Column(String(50), nullable=True)
    full_name_read = Column(String(200), nullable=True)
    test_group = Column(String(10), nullable=True)
    answers = Column(JSONB, nullable=True)
    scoring = Column(JSONB, nullable=True)
    summary = Column(JSONB, nullable=True)
    image_filename = Column(String(300), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    exam = relationship("Exam", foreign_keys=[exam_id])
    student = relationship("User", foreign_keys=[student_id])
    scanner = relationship("User", foreign_keys=[scanned_by])
