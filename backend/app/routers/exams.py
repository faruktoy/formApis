from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..dependencies import require_teacher, get_current_user
from ..models.user import User
from .. import crud

router = APIRouter(prefix="/api/exams", tags=["exams"])


class CreateExamRequest(BaseModel):
    name: str
    class_id: int
    template_id: int
    question_count: int = 200
    answer_key: Optional[dict] = None


class UpdateExamRequest(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    answer_key: Optional[dict] = None


def _exam_to_dict(e) -> dict:
    return {
        "id": e.id,
        "name": e.name,
        "class_id": e.class_id,
        "class_name": e.class_.name if e.class_ else None,
        "template_id": e.template_id,
        "template_name": e.template.name if e.template else None,
        "question_count": e.question_count,
        "is_active": e.is_active,
        "deadline": e.deadline,
        "created_at": e.created_at,
    }


@router.get("")
def list_exams(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    return [_exam_to_dict(e) for e in crud.get_exams(db, current_user.id)]


@router.get("/active")
def active_exams_for_student(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return [_exam_to_dict(e) for e in crud.get_active_exams_for_student(db, current_user.id)]


@router.post("", status_code=201)
def create_exam(
    req: CreateExamRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    exam = crud.create_exam(
        db,
        name=req.name,
        class_id=req.class_id,
        template_id=req.template_id,
        question_count=req.question_count,
        answer_key=req.answer_key,
    )
    return _exam_to_dict(exam)


@router.patch("/{exam_id}")
def update_exam(
    exam_id: int,
    req: UpdateExamRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    exam = crud.update_exam(db, exam_id, **updates)
    if not exam:
        raise HTTPException(status_code=404, detail="Sınav bulunamadı")
    return _exam_to_dict(exam)
