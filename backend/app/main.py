from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import auth, users, classes, exams, scans
from .services.omr_service import OmrScanService

app = FastAPI(
    title="OMR Sistemi",
    version="2.0.0",
    description="İstinye Üniversitesi — Optik Form Okuma Sistemi",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(classes.router)
app.include_router(exams.router)
app.include_router(scans.router)

_scan_service = OmrScanService()


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "omrchecker_available": _scan_service.omrchecker_dir.exists(),
        "template_available": _scan_service.template_dir.exists(),
    }
