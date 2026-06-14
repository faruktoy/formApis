// Runtime config — production'da deploy scriptiyle override edilir.
//
// Default: gerçek backend + same-origin (UI ve API aynı sunucudan servis ediliyor).
// Backend (uvicorn) hem /api/* hem web statiklerini servis ettiği için
// __OMR_API_BASE'i set ETMEYE GEREK YOK — auth.js same-origin'e düşer.
//
// Ayrı port veya farklı host kullanıyorsan (örn. Live Server :5500 + backend :8765):
//   window.__OMR_API_BASE = "http://127.0.0.1:8765";
//
// Dev için MOCK moduna dönmek istersen:
//   window.__OMR_USE_MOCK = true;
window.__OMR_USE_MOCK = true;
// window.__OMR_API_BASE = "http://127.0.0.1:8765";  // ← same-origin için kapalı
