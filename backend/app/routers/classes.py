from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..dependencies import require_teacher, get_current_user
from ..models.user import User
from .. import crud

router = APIRouter(prefix="/api/classes", tags=["classes"])


class CreateClassRequest(BaseModel):
    name: str


class AddStudentRequest(BaseModel):
    student_id: int


@router.get("")
def list_classes(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    classes = crud.get_classes(db, teacher_id=current_user.id)
    return [
        {
            "id": c.id,
            "name": c.name,
            "student_count": len(c.students),
            "created_at": c.created_at,
        }
        for c in classes
    ]


@router.post("", status_code=201)
def create_class(
    req: CreateClassRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    cls = crud.create_class(db, req.name, current_user.id)
    return {"id": cls.id, "name": cls.name}


@router.get("/{class_id}")
def get_class(
    class_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    cls = crud.get_class(db, class_id)
    if not cls or cls.teacher_id != current_user.id:
        raise HTTPException(status_code=404, detail="Sınıf bulunamadı")
    return {
        "id": cls.id,
        "name": cls.name,
        "students": [
            {"id": s.id, "full_name": s.full_name, "student_number": s.student_number}
            for s in cls.students
        ],
    }


@router.post("/{class_id}/students", status_code=201)
def add_student(
    class_id: int,
    req: AddStudentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    cls = crud.get_class(db, class_id)
    if not cls or cls.teacher_id != current_user.id:
        raise HTTPException(status_code=404, detail="Sınıf bulunamadı")
    crud.add_student_to_class(db, class_id, req.student_id)
    return {"message": "Öğrenci eklendi"}


@router.post("/{class_id}/students/import", status_code=201)
async def import_students(
    class_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    cls = crud.get_class(db, class_id)
    if not cls or cls.teacher_id != current_user.id:
        raise HTTPException(status_code=404, detail="Sınıf bulunamadı")
    csv_bytes = await file.read()
    users = crud.import_users_from_csv(db, csv_bytes, role="student")
    for u in users:
        crud.add_student_to_class(db, class_id, u.id)
    return {"imported": len(users)}
