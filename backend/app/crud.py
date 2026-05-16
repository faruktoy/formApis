import csv
import io
from typing import Optional
from sqlalchemy.orm import Session
from .models.user import User
from .models.template import Template
from .models.class_ import Class, class_students
from .models.exam import Exam
from .models.scan_result import ScanResult
from .auth import hash_password


# ── Kullanıcılar ──────────────────────────────────────────────────────────────

def get_user(db: Session, user_id: int) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()


def get_user_by_student_number(db: Session, student_number: str) -> Optional[User]:
    return db.query(User).filter(User.student_number == student_number).first()


def get_users(db: Session, role: Optional[str] = None):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    return q.all()


def create_user(
    db: Session,
    full_name: str,
    email: str,
    password: str,
    role: str = "student",
    student_number: Optional[str] = None,
) -> User:
    user = User(
        full_name=full_name,
        email=email,
        password_hash=hash_password(password),
        role=role,
        student_number=student_number or None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user_id: int) -> bool:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return False
    db.delete(user)
    db.commit()
    return True


def import_users_from_csv(db: Session, csv_bytes: bytes, role: str = "student") -> list[User]:
    """CSV sütunları: full_name, email, student_number (opsiyonel)"""
    created = []
    reader = csv.DictReader(io.StringIO(csv_bytes.decode("utf-8-sig")))
    for row in reader:
        email = row.get("email", "").strip()
        full_name = row.get("full_name", "").strip()
        student_number = row.get("student_number", "").strip() or None
        if not email or not full_name:
            continue
        if get_user_by_email(db, email):
            continue
        default_pass = student_number or email.split("@")[0]
        user = create_user(db, full_name, email, default_pass, role, student_number)
        created.append(user)
    return created


# ── Sınıflar ──────────────────────────────────────────────────────────────────

def get_classes(db: Session, teacher_id: int):
    return db.query(Class).filter(Class.teacher_id == teacher_id).all()


def create_class(db: Session, name: str, teacher_id: int) -> Class:
    cls = Class(name=name, teacher_id=teacher_id)
    db.add(cls)
    db.commit()
    db.refresh(cls)
    return cls


def get_class(db: Session, class_id: int) -> Optional[Class]:
    return db.query(Class).filter(Class.id == class_id).first()


def add_student_to_class(db: Session, class_id: int, student_id: int) -> bool:
    db.execute(
        class_students.insert().values(class_id=class_id, student_id=student_id)
    )
    db.commit()
    return True


def get_classes_for_student(db: Session, student_id: int):
    return (
        db.query(Class)
        .join(class_students, Class.id == class_students.c.class_id)
        .filter(class_students.c.student_id == student_id)
        .all()
    )


# ── Sınavlar ──────────────────────────────────────────────────────────────────

def get_exams(db: Session, teacher_id: int):
    return (
        db.query(Exam)
        .join(Class, Exam.class_id == Class.id)
        .filter(Class.teacher_id == teacher_id)
        .all()
    )


def create_exam(
    db: Session,
    name: str,
    class_id: int,
    template_id: int,
    question_count: int = 200,
    answer_key: Optional[dict] = None,
) -> Exam:
    exam = Exam(
        name=name,
        class_id=class_id,
        template_id=template_id,
        question_count=question_count,
        answer_key=answer_key,
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam


def update_exam(db: Session, exam_id: int, **kwargs) -> Optional[Exam]:
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        return None
    for k, v in kwargs.items():
        setattr(exam, k, v)
    db.commit()
    db.refresh(exam)
    return exam


def get_active_exams_for_student(db: Session, student_id: int):
    student_class_ids = [
        c.id for c in get_classes_for_student(db, student_id)
    ]
    if not student_class_ids:
        return []
    return (
        db.query(Exam)
        .filter(Exam.class_id.in_(student_class_ids), Exam.is_active == True)
        .all()
    )


# ── Tarama Sonuçları ──────────────────────────────────────────────────────────

def save_scan_result(
    db: Session,
    result_dict: dict,
    exam_id: Optional[int],
    student_id: Optional[int],
    scanned_by: int,
    image_filename: Optional[str] = None,
) -> ScanResult:
    sr = ScanResult(
        exam_id=exam_id,
        student_id=student_id,
        scanned_by=scanned_by,
        student_number_read=result_dict.get("student_number"),
        full_name_read=result_dict.get("full_name"),
        test_group=result_dict.get("test_group"),
        answers=result_dict.get("answers"),
        scoring=result_dict.get("scoring"),
        summary=result_dict.get("summary"),
        image_filename=image_filename,
    )
    db.add(sr)
    db.commit()
    db.refresh(sr)
    return sr


def get_results_for_teacher(db: Session, teacher_id: int, exam_id: Optional[int] = None):
    q = (
        db.query(ScanResult)
        .join(Exam, ScanResult.exam_id == Exam.id, isouter=True)
        .join(Class, Exam.class_id == Class.id, isouter=True)
        .filter(ScanResult.scanned_by == teacher_id)
    )
    if exam_id:
        q = q.filter(ScanResult.exam_id == exam_id)
    return q.order_by(ScanResult.created_at.desc()).all()


def get_results_for_student(db: Session, student_id: int):
    return (
        db.query(ScanResult)
        .filter(ScanResult.student_id == student_id)
        .order_by(ScanResult.created_at.desc())
        .all()
    )


# ── Şablonlar ─────────────────────────────────────────────────────────────────

def get_templates(db: Session):
    return db.query(Template).filter(Template.is_active == True).all()


def get_template_by_name(db: Session, name: str) -> Optional[Template]:
    return db.query(Template).filter(Template.name == name).first()
