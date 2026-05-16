from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..dependencies import require_admin
from ..models.user import User
from .. import crud

router = APIRouter(prefix="/api/users", tags=["users"])


class CreateUserRequest(BaseModel):
    full_name: str
    email: str
    password: str
    role: str = "student"
    student_number: Optional[str] = None


@router.get("")
def list_users(
    role: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    users = crud.get_users(db, role=role)
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role,
            "student_number": u.student_number,
            "created_at": u.created_at,
        }
        for u in users
    ]


@router.post("", status_code=201)
def create_user(
    req: CreateUserRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if crud.get_user_by_email(db, req.email):
        raise HTTPException(status_code=409, detail="Bu e-posta zaten kayıtlı")
    user = crud.create_user(
        db, req.full_name, req.email, req.password, req.role, req.student_number
    )
    return {"id": user.id, "full_name": user.full_name, "email": user.email, "role": user.role}


@router.post("/import", status_code=201)
async def import_users(
    file: UploadFile = File(...),
    role: str = "student",
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    csv_bytes = await file.read()
    created = crud.import_users_from_csv(db, csv_bytes, role=role)
    return {"created": len(created), "users": [u.email for u in created]}


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not crud.delete_user(db, user_id):
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
