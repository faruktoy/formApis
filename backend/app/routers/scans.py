from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session
from typing import Optional
from ..database import get_db
from ..dependencies import get_current_user, require_teacher
from ..models.user import User
from ..models.scan_result import ScanResult
from ..services.omr_service import OmrScanService, OmrMvpError
from .. import crud

router = APIRouter(prefix="/api", tags=["scans"])
scan_service = OmrScanService()


def _resolve_student(db: Session, student_number_read: str) -> Optional[int]:
    if not student_number_read:
        return None
    user = crud.get_user_by_student_number(db, student_number_read)
    return user.id if user else None


@router.post("/scan")
async def scan_image(
    file: UploadFile = File(...),
    answer_key: Optional[str] = Form(default=None),
    exam_id: Optional[int] = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    try:
        file_bytes = await file.read()
        result = scan_service.scan_bytes(
            file_bytes=file_bytes,
            filename=file.filename or "upload.jpg",
            answer_key_raw=answer_key,
        )
    except OmrMvpError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    student_id = _resolve_student(db, result.get("student_number", ""))
    sr = crud.save_scan_result(
        db,
        result_dict=result,
        exam_id=exam_id,
        student_id=student_id,
        scanned_by=current_user.id,
        image_filename=file.filename,
    )
    result["id"] = sr.id
    return result


@router.post("/scan/sample")
def scan_sample(
    answer_key: Optional[str] = Form(default=None),
    exam_id: Optional[int] = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    try:
        result = scan_service.scan_sample(answer_key_raw=answer_key)
    except OmrMvpError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    student_id = _resolve_student(db, result.get("student_number", ""))
    sr = crud.save_scan_result(
        db,
        result_dict=result,
        exam_id=exam_id,
        student_id=student_id,
        scanned_by=current_user.id,
        image_filename="sample",
    )
    result["id"] = sr.id
    return result


@router.get("/results")
def list_results(
    exam_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role in ("admin", "teacher"):
        results = crud.get_results_for_teacher(db, current_user.id, exam_id=exam_id)
    else:
        results = crud.get_results_for_student(db, current_user.id)

    return [
        {
            "id": r.id,
            "full_name": r.full_name_read,
            "student_number": r.student_number_read,
            "test_group": r.test_group,
            "exam_id": r.exam_id,
            "scoring": r.scoring,
            "summary": r.summary,
            "created_at": r.created_at,
        }
        for r in results
    ]


@router.get("/results/{result_id}")
def get_result(
    result_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sr = db.query(ScanResult).filter(ScanResult.id == result_id).first()
    if not sr:
        raise HTTPException(status_code=404, detail="Sonuç bulunamadı")
    return {
        "id": sr.id,
        "full_name": sr.full_name_read,
        "student_number": sr.student_number_read,
        "test_group": sr.test_group,
        "exam_id": sr.exam_id,
        "answers": sr.answers,
        "scoring": sr.scoring,
        "summary": sr.summary,
        "created_at": sr.created_at,
    }


@router.get("/templates")
def list_templates(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    templates = crud.get_templates(db)
    return [
        {"id": t.id, "name": t.name, "description": t.description, "question_count": t.question_count}
        for t in templates
    ]
