# OMR Sistemi — İstinye Üniversitesi Bitirme Projesi

Optik form okuma (OMR) sistemi. FastAPI backend, PostgreSQL veritabanı, JWT kimlik doğrulama.

## Ekip

| Kişi | Rol |
|---|---|
| Faruk TOY | Backend / API / Entegrasyon |
| Emrecan ÜNAL | Web Arayüzü |
| Vedat Emre KESKİN | Mobil Uygulama (Flutter) |

## Proje Yapısı

```
omr-project/
├── backend/          Faruk — FastAPI + PostgreSQL
├── web/              Emrecan — HTML/JS/CSS (henüz oluşturulmadı)
├── mobile/           Vedat — Flutter (henüz oluşturulmadı)
├── sampleOptical/    Test için örnek OMR form görselleri
├── TARAMA/           Gerçek taranan formlar
└── Reports/          Proje raporları ve planlar
```

## Backend Kurulum (Faruk)

```powershell
cd backend
py -3 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # .env'i düzenle: DATABASE_URL, SECRET_KEY
py -3 -m app.seed        # Admin kullanıcısı + şablon oluştur
uvicorn app.main:app --reload
```

Swagger: `http://127.0.0.1:8000/docs`

## OMRChecker Kurulumu

Backend tarama özelliği için `.external/OMRChecker` dizinine ihtiyaç duyar:

```powershell
mkdir .external
cd .external
git clone https://github.com/Udayraj123/OMRChecker.git
```

Raporlar için `Reports/` dizinine bak.
