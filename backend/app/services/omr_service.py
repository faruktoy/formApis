"""
OMR tarama servisi — OMRChecker entegrasyonu.

OMRChecker kurulumu:
    mkdir .external
    cd .external
    git clone https://github.com/Udayraj123/OMRChecker.git

Ardından template dosyaları:
    backend/app/templates/isu_dts836_mvp/template.json
    backend/app/templates/isu_dts836_mvp/config.json
"""
from __future__ import annotations

import csv
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional


class OmrMvpError(Exception):
    pass


class OmrScanService:
    def __init__(self) -> None:
        self.root_dir = Path(__file__).resolve().parents[3]
        self.template_dir = Path(__file__).resolve().parents[1] / "templates" / "isu_dts836_mvp"
        self.runtime_dir = self.root_dir / "backend" / "runtime"
        self.omrchecker_dir = self.root_dir / ".external" / "OMRChecker"
        self.sample_scan_path = self.root_dir / "sampleOptical" / "filledSample.jpg"
        self.runtime_dir.mkdir(parents=True, exist_ok=True)

    # ── Public API ───────────────────────────────────────────────────────────

    def scan_sample(self, answer_key_raw: Optional[str] = None) -> dict:
        if not self.sample_scan_path.exists():
            raise OmrMvpError(f"Örnek görsel bulunamadı: {self.sample_scan_path}")
        return self.scan_file(self.sample_scan_path, answer_key_raw=answer_key_raw)

    def scan_bytes(
        self,
        file_bytes: bytes,
        filename: str,
        answer_key_raw: Optional[str] = None,
    ) -> dict:
        suffix = Path(filename).suffix or ".jpg"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False, dir=self.root_dir) as f:
            temp_path = Path(f.name)
            f.write(file_bytes)
        try:
            return self.scan_file(temp_path, answer_key_raw=answer_key_raw)
        finally:
            temp_path.unlink(missing_ok=True)

    def scan_file(self, image_path: Path, answer_key_raw: Optional[str] = None) -> dict:
        if not self.omrchecker_dir.exists():
            raise OmrMvpError(
                "OMRChecker bulunamadı. Kurulum: "
                "mkdir .external && cd .external && "
                "git clone https://github.com/Udayraj123/OMRChecker.git"
            )
        if not self.template_dir.exists():
            raise OmrMvpError(
                "Şablon dosyaları bulunamadı: backend/app/templates/isu_dts836_mvp/"
            )

        answer_key = self._parse_answer_key(answer_key_raw)
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            input_dir = tmp / "input"
            output_dir = tmp / "output"
            input_dir.mkdir()
            output_dir.mkdir()

            shutil.copy(image_path, input_dir / image_path.name)
            shutil.copy(self.template_dir / "template.json", input_dir / "template.json")
            if (self.template_dir / "config.json").exists():
                shutil.copy(self.template_dir / "config.json", input_dir / "config.json")

            self._run_omrchecker(input_dir, output_dir)
            raw = self._parse_output(output_dir, image_path.name)

        return self._build_result(raw, answer_key)

    # ── Internal ─────────────────────────────────────────────────────────────

    def _run_omrchecker(self, input_dir: Path, output_dir: Path) -> None:
        cmd = [
            sys.executable,
            str(self.omrchecker_dir / "main.py"),
            "--inputDir", str(input_dir),
            "--outputDir", str(output_dir),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(self.omrchecker_dir))
        if result.returncode != 0:
            raise OmrMvpError(f"OMRChecker hatası: {result.stderr[-500:]}")

    def _parse_output(self, output_dir: Path, original_filename: str) -> dict:
        csv_files = list(output_dir.rglob("*.csv"))
        if not csv_files:
            raise OmrMvpError("OMRChecker çıktısı bulunamadı")
        with open(csv_files[0], encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        if not rows:
            raise OmrMvpError("OMRChecker sonuç satırı yok")
        return rows[0]

    def _parse_answer_key(self, raw: Optional[str]) -> Optional[dict]:
        if not raw:
            return None
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                return {str(i + 1): str(v).upper() for i, v in enumerate(data) if v}
            return {str(k).replace("q", "").replace("Q", ""): str(v).upper() for k, v in data.items()}
        except (json.JSONDecodeError, AttributeError):
            return None

    def _build_result(self, raw: dict, answer_key: Optional[dict]) -> dict:
        answers: dict[str, str] = {}
        for k, v in raw.items():
            if k.startswith("q") or k.startswith("Q"):
                q_num = k[1:]
                answers[q_num] = str(v).strip() or "-"

        student_number = raw.get("Roll", raw.get("roll", raw.get("StudentID", "")))
        full_name = raw.get("Name", raw.get("name", ""))
        test_group = raw.get("Set", raw.get("set", raw.get("TestGroup", "A")))
        total = len(answers)
        answered = sum(1 for v in answers.values() if v != "-")
        blank = total - answered

        scoring: dict = {}
        if answer_key:
            correct = sum(1 for q, a in answers.items() if answer_key.get(q) == a and a != "-")
            wrong = answered - correct
            evaluated = len(answer_key)
            scoring = {
                "evaluatedQuestions": evaluated,
                "correct": correct,
                "wrong": wrong,
                "blank": blank,
                "invalid": 0,
                "percentage": round(correct / evaluated * 100, 2) if evaluated else 0.0,
            }

        return {
            "template": "isu_dts836_mvp",
            "student_number": student_number,
            "full_name": full_name,
            "test_group": test_group,
            "answers": answers,
            "summary": {"answered": answered, "blank": blank, "invalid": 0, "totalQuestions": total},
            "scoring": scoring,
        }
