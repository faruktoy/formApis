"""
Başlangıç verisi oluşturur: admin, örnek öğretmen, ISU DTS.836 şablonu.

Çalıştırma (backend/ dizininden):
    python -m app.seed
"""
import json
from pathlib import Path
from .database import engine, SessionLocal, Base
from .models import User, Template
from . import models  # noqa: F401 — Base.metadata için
from .auth import hash_password


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.email == "admin@omr.local").first():
            db.add(User(
                full_name="Sistem Admin",
                email="admin@omr.local",
                password_hash=hash_password("admin123"),
                role="admin",
            ))
            print("✓ admin@omr.local / admin123")

        if not db.query(User).filter(User.email == "ogretmen@omr.local").first():
            db.add(User(
                full_name="Örnek Öğretmen",
                email="ogretmen@omr.local",
                password_hash=hash_password("ogretmen123"),
                role="teacher",
            ))
            print("✓ ogretmen@omr.local / ogretmen123")

        if not db.query(Template).filter(Template.name == "isu_dts836_mvp").first():
            template_path = Path(__file__).parent / "templates" / "isu_dts836_mvp" / "template.json"
            config_path   = Path(__file__).parent / "templates" / "isu_dts836_mvp" / "config.json"
            t_json = json.loads(template_path.read_text(encoding="utf-8")) if template_path.exists() else None
            c_json = json.loads(config_path.read_text(encoding="utf-8"))   if config_path.exists()   else None
            db.add(Template(
                name="isu_dts836_mvp",
                description="İstinye Üniversitesi DTS.836 — 200 soruluk optik form",
                question_count=200,
                template_json=t_json,
                config_json=c_json,
            ))
            print("✓ Şablon: isu_dts836_mvp")

        db.commit()
        print("\nSeed tamamlandı.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
