// ==============================================
// OMR Projesi — Kimlik Doğrulama ve API Modülü
// ==============================================

// Mock/Gerçek API mod kontrolü — runtime config'ten (index.html injecting)
// veya production build'inde sabit false. Default: gerçek API.
//
// Override (dev için):
//   <script>window.__OMR_USE_MOCK = true;</script>  → mock-api/*.json
//
// `USE_MOCK = true` iken:
//   • apiFetch mock dosyayı döner
//   • doLogin demo hesap listesinden şifre kontrolü yapar
//   • Rol/isim dinamik override edilir
const _useMockRaw = (typeof window !== 'undefined') ? window.__OMR_USE_MOCK : undefined;
export const USE_MOCK = (_useMockRaw === true);

// BASE_URL — runtime config veya same-origin
// Override: <script>window.__OMR_API_BASE = "https://omr.istinye.edu.tr";</script>
const _injectedBase = (typeof window !== 'undefined') ? window.__OMR_API_BASE : undefined;
const BASE_URL = _injectedBase
    || (window.location.origin && window.location.origin.startsWith('http')
        ? window.location.origin
        : 'http://127.0.0.1:8000');

// --- Storage erişimi: localStorage (kalıcı) ve sessionStorage (tab kapanınca silinir) ---
// "Beni hatırla" işaretsiz iken sessionStorage kullanılır → tarayıcı tab/pencere
// kapanınca otomatik logout (güvenlik).
//
// Token okurken: önce sessionStorage'a bak, yoksa localStorage'a düş.
// Bu sayede aynı kullanıcı bir kez "beni hatırla" yapmış ama sonra yapmamışsa
// eski kayıt karışmaz.

function _safeOp(storage, op, key, value) {
    try {
        if (op === 'get') return storage.getItem(key);
        if (op === 'set') return storage.setItem(key, value);
        if (op === 'remove') return storage.removeItem(key);
    } catch (e) {
        console.warn(`Storage ${op} hatası:`, e);
    }
    return null;
}

// SESSION-KEY listesi: rememberMe işaretsiz iken sessionStorage'a yazılan tüm anahtarlar
const _SESSION_KEYS = [
    'omr_token', 'omr_role', 'omr_name', 'omr_user_id',
    'omr_student_number', 'omr_profile_image', 'omr_gender',
];

// Read: önce sessionStorage, sonra localStorage
function safeStorageGet(key) {
    if (_SESSION_KEYS.includes(key)) {
        const s = _safeOp(sessionStorage, 'get', key);
        if (s !== null && s !== undefined) return s;
    }
    return _safeOp(localStorage, 'get', key);
}

// Write: default localStorage (geriye uyumlu — UI tercihleri, tema, dil vb.)
function safeStorageSet(key, value) {
    _safeOp(localStorage, 'set', key, value);
}

// Write to specific storage — saveSession için
function _writeToStorage(useSession, key, value) {
    const storage = useSession ? sessionStorage : localStorage;
    _safeOp(storage, 'set', key, value);
}

// Remove: her iki storage'tan sil (her ihtimale karşı)
function safeStorageRemove(key) {
    _safeOp(localStorage, 'remove', key);
    _safeOp(sessionStorage, 'remove', key);
}

/**
 * Login session'ını yaz.
 * @param {object} data — backend'in dönüş objesi
 * @param {boolean} remember — true ise localStorage (kalıcı), false ise sessionStorage (tab kapanınca silinir)
 */
export function saveSession(data, remember = false) {
    // Önce TÜM eski session verisini her iki storage'dan sil — bayatlık kalmasın
    for (const k of _SESSION_KEYS) safeStorageRemove(k);
    const useSession = !remember;
    if (data.access_token)   _writeToStorage(useSession, 'omr_token', data.access_token);
    if (data.role)           _writeToStorage(useSession, 'omr_role', data.role);
    if (data.full_name)      _writeToStorage(useSession, 'omr_name', data.full_name);
    if (data.user_id)        _writeToStorage(useSession, 'omr_user_id', data.user_id);
    if (data.student_number !== undefined && data.student_number !== null) {
        _writeToStorage(useSession, 'omr_student_number', data.student_number);
    }
    if (data.profile_image !== undefined && data.profile_image) {
        _writeToStorage(useSession, 'omr_profile_image', data.profile_image);
    }
    if (data.gender !== undefined && data.gender !== null) {
        _writeToStorage(useSession, 'omr_gender', data.gender);
    }
}

export function getToken() {
    return safeStorageGet('omr_token');
}

export function getRole() {
    return safeStorageGet('omr_role');
}

export function getName() {
    return safeStorageGet('omr_name');
}

export function getUserId() {
    return safeStorageGet('omr_user_id');
}

export function logout() {
    // Her iki storage'tan TÜM session verisini sil
    for (const k of _SESSION_KEYS) safeStorageRemove(k);
    window.location.href = './login.html';
}
window.logout = logout;

export function requireAuth(allowedRoles = []) {
    const token = getToken();
    if (!token) {
        window.location.href = './login.html';
        return;
    }

    if (allowedRoles && allowedRoles.length > 0) {
        const role = getRole();
        if (!allowedRoles.includes(role)) {
            window.location.href = './login.html';
        }
    }
}

export async function apiFetch(path, options = {}, mockFile = null) {
    // Mock modda doğrudan mock dosyayı dön
    if (USE_MOCK && mockFile) {
        console.log(`[MOCK] ${path} → ${mockFile}`);
        try {
            const mockResponse = await fetch(mockFile);
            if (!mockResponse.ok) {
                throw new Error(`Mock dosya bulunamadı: ${mockFile}`);
            }
            return await mockResponse.json();
        } catch (mockError) {
            console.error(`Mock veri yüklenemedi (${mockFile}):`, mockError);
            throw mockError;
        }
    }

    // Gerçek API modu
    const url = `${BASE_URL}${path}`;
    const token = getToken();

    // FormData gönderiliyorsa Content-Type ekleme
    // (Browser otomatik olarak multipart/form-data + boundary ayarlayacak)
    const headers = { ...options.headers };
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(url, { ...options, headers });

        // 401 Unauthorized — Token süresi dolmuş veya geçersiz
        // İSTİSNA: login endpoint'inin kendi 401'i (yanlış şifre vb.) normal
        // hata olarak throw edilmeli — yoksa form error banner gösteremiyor.
        const isLoginEndpoint = path === '/api/auth/login' || path.endsWith('/auth/login');
        if (response.status === 401 && !isLoginEndpoint) {
            console.warn('Oturum süresi dolmuş veya geçersiz token. Çıkış yapılıyor...');
            safeStorageRemove('omr_token');
            safeStorageRemove('omr_role');
            safeStorageRemove('omr_name');
            safeStorageRemove('omr_user_id');
            safeStorageRemove('omr_student_number');
            window.location.href = './login.html';
            return;
        }

        if (!response.ok) {
            // Backend tipik FastAPI hata formatı: {"detail": "..."}
            let detail = `HTTP ${response.status}`;
            try {
                const errJson = await response.json();
                if (errJson?.detail) detail = errJson.detail;
            } catch {}
            const err = new Error(detail);
            err.status = response.status;
            throw err;
        }
        return await response.json();
    } catch (error) {
        // Sadece MOCK modda fallback yap; production'da gerçek hatayı fırlat
        if (USE_MOCK && mockFile) {
            console.warn(`[MOCK fallback] ${url} → ${mockFile} (${error.message})`);
            try {
                const mockResponse = await fetch(mockFile);
                if (!mockResponse.ok) throw error;
                return await mockResponse.json();
            } catch {
                throw error;
            }
        }
        throw error;
    }
}

// ── Çoklu file/form-data POST (batch upload için) ───────────────────────────
//    apiFetch'in body=JSON varsayımını bozmaz; FormData ile çağırılır.
export async function apiUpload(path, formData) {
    const url = `${BASE_URL}${path}`;
    const token = getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(url, { method: 'POST', headers, body: formData });
    if (response.status === 401) {
        safeStorageRemove('omr_token');
        window.location.href = './login.html';
        return;
    }
    if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
            const errJson = await response.json();
            if (errJson?.detail) detail = errJson.detail;
        } catch {}
        const err = new Error(detail);
        err.status = response.status;
        throw err;
    }
    return await response.json();
}

// ── Auth'lı binary indirme (marked.jpg için) ─────────────────────────────────
//    Token header ile fetch, Blob URL döndürür. <img src="..."> bağlanabilir.
export async function fetchBlobAuthed(path) {
    if (USE_MOCK) {
        console.log(`[MOCK] fetchBlobAuthed: ${path}`);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="#f0f0f0"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#666">Test (Mock) İşaretli Görsel</text><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#888">${path}</text></svg>`;
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        return URL.createObjectURL(blob);
    }
    const url = `${BASE_URL}${path}`;
    const token = getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
}

/**
 * Login.
 * @param {string} email
 * @param {string} password
 * @param {boolean} remember — "Beni hatırla" işaretliyse true. Default false
 *                  (sessionStorage; tab kapanınca oturum kapanır).
 */
export async function doLogin(email, password, remember = false) {
    // Mock modda demo hesap doğrulaması + rol override (sadece dev).
    // Production'da bu bloklar tamamen atlanır — backend gerçek doğrulamayı yapar.
    if (USE_MOCK) {
        const demoAccounts = {
            'ogretmen@omr.local': 'ogretmen123',
            'admin@omr.local':    'admin123',
            'vedat@omr.local':    'ogrenci123',
            'emrecan@omr.local':  'ogrenci123',
        };
        const storedPwd = safeStorageGet('omr_pwd_' + email);
        const expectedPwd = storedPwd || demoAccounts[email] || '123456';
        if (password !== expectedPwd) {
            throw new Error('E-posta veya şifre hatalı');
        }
    }

    const data = await apiFetch(
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify({ email, password }) },
        USE_MOCK ? './mock-api/login.json' : null
    );

    if (!data || !data.access_token) {
        throw new Error('Geçersiz login yanıtı (access_token bulunamadı)');
    }

    // Mock modda backend olmadığı için login.json hep aynı rolü döndürür;
    // burada e-postaya göre düzeltiyoruz.
    if (USE_MOCK) {
        const demoProfiles = {
            'admin@omr.local':    { role: 'admin',   full_name: 'Demo Admin' },
            'ogretmen@omr.local': { role: 'teacher', full_name: 'Demo Öğretmen' },
            'emrecan@omr.local':  { role: 'student', full_name: 'Emrecan Ünal',     student_number: '2420171020' },
            'vedat@omr.local':    { role: 'student', full_name: 'Vedat Emre Keskin', student_number: '2420171021' },
        };
        const stored = safeStorageGet('omr_mock_users');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                const u = parsed.find(x => x.email === email);
                if (u) Object.assign(data, { role: u.role, full_name: u.full_name, student_number: u.student_number });
            } catch {}
        }
        if (demoProfiles[email]) Object.assign(data, demoProfiles[email]);
    }

    safeStorageSet('omr_email', email);
    saveSession(data, remember);

    const role = data.role;
    if (role === 'admin')   window.location.href = './admin.html';
    else if (role === 'teacher') window.location.href = './teacher.html';
    else if (role === 'student') window.location.href = './student.html';
    else console.error('Bilinmeyen rol:', role);
    return data;
}

// ==========================================================================
// Global UI İyileştirmeleri (Kısa Vadeli Ekstralar)
// ==========================================================================

// 1. Dark Mode Desteği
export function initDarkMode() {
    const savedTheme = safeStorageGet('omr_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    const toggleBtn = document.getElementById('darkModeToggle');
    if (toggleBtn) {
        // İkonu ayarla
        toggleBtn.innerHTML = savedTheme === 'dark' ? '<i class="ph ph-sun"></i>' : '<i class="ph ph-moon"></i>';

        toggleBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const nextTheme = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', nextTheme);
            safeStorageSet('omr_theme', nextTheme);
            toggleBtn.innerHTML = nextTheme === 'dark' ? '<i class="ph ph-sun"></i>' : '<i class="ph ph-moon"></i>';
        });
    }
}

// 2. Klavye Kısayolları (Keyboard Shortcuts)
function initShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl + S (Tarama Başlatma)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            const scanBtn = document.getElementById('scanBtn');
            // scanBtn varsa ve sayfadaysa tıkla
            if (scanBtn && !scanBtn.disabled && scanBtn.offsetParent !== null) {
                scanBtn.click();
            }
        }

        // Esc (Modal Kapatma)
        if (e.key === 'Escape') {
            const openDialog = document.querySelector('dialog[open]');
            if (openDialog) {
                openDialog.removeAttribute('open');
            }
        }
    });
}

// Sayfa yüklendiğinde global özellikleri başlat
document.addEventListener('DOMContentLoaded', () => {
    initDarkMode();
    initShortcuts();
    initLanguage();
});

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => console.log('SW kayıt edildi:', registration.scope))
            .catch(err => console.warn('SW kaydı başarısız:', err));
    });
}

// 3. Dil Desteği Sistemi
const translations = {
    tr: {
        // Login Page
        hero_desc: "Optik Form Okuma • Otomatik Puanlama • Veri Analizi",
        brand_desc: "Optik Form Okuma Sistemi — Giriş Yapın",
        error_text: "Giriş başarısız. Lütfen bilgilerinizi kontrol edin.",
        email_placeholder: "E-posta adresiniz",
        password_placeholder: "Şifreniz",
        remember_me: "Beni hatırla",
        login_btn: "Giriş Yap",
        demo_title: "Demo Hesapları",
        role_admin: "Admin",
        role_teacher: "Öğretmen",
        role_student: "Öğrenci",
        footer_support: "Destek",
        footer_rights: "Tüm hakları saklıdır.",
        footer_contact: "İletişim",

        // Common Dashboard
        nav_users: "Kullanıcılar",
        nav_templates: "Şablonlar",
        nav_logout: "Çıkış",
        nav_profile: "Profilim",
        nav_classes: "Sınıflar",
        nav_exams: "Sınavlar",
        nav_results: "Sonuçlar",
        nav_dashboard: "Panel",
        nav_scan: "Tara",
        loading: "Yükleniyor...",
        welcome: "Hoş Geldiniz",
        forgot_pwd: "Şifremi Unuttum",
        back_to_login: "Giriş Ekranına Dön",
        forgot_pwd_desc: "Lütfen sisteme kayıtlı e-posta adresinizi girin. Şifre sıfırlama bağlantınızı göndereceğiz.",
        send_reset_link: "Sıfırlama Linki Gönder",
        reset_success: "Şifre sıfırlama bağlantısı e-postanıza gönderildi!",
        reset_fail: "Bu e-posta adresiyle eşleşen bir kullanıcı bulunamadı!",
        current_password: "Mevcut Şifre",
        new_password: "Yeni Şifre",
        confirm_password: "Yeni Şifre (Tekrar)",
        update_password: "Şifreyi Güncelle",
        change_picture: "Resmi Değiştir",
        delete_picture: "Resmi Kaldır",
        modal_profile_title: "Hesabım",
        msg_pwd_mismatch: "Yeni şifreler eşleşmiyor!",
        msg_pwd_success: "Şifreniz başarıyla güncellendi!",
        msg_pwd_wrong: "Mevcut şifre yanlış!",

        // Admin
        admin_panel: "OMR — Admin Paneli",
        user_mgmt: "Kullanıcı Yönetimi",
        add_user: "Yeni Kullanıcı Ekle",
        name_placeholder: "Ad Soyad",
        role_select: "Rol Seç...",
        student_no_placeholder: "Öğrenci Numarası (Sadece Öğrenciler İçin)",
        btn_add: "Ekle",
        bulk_add: "CSV ile Toplu Kullanıcı Ekle",
        role_to_add: "Eklenecek Rol",
        csv_file: "CSV Dosyası",
        btn_import: "İçe Aktar",
        user_list: "Kullanıcı Listesi",
        filter_all: "Tümü",
        search_user: "İsim veya e-posta ile ara...",
        th_name: "Ad Soyad",
        th_email: "E-Posta",
        th_role: "Rol",
        th_student_no: "Öğrenci No",
        th_action: "İşlem",
        btn_delete: "Sil",
        tpl_title: "Optik Form Şablonları",
        th_tpl_name: "Şablon Adı",
        th_desc: "Açıklama",
        th_qcount: "Soru Sayısı",
        th_status: "Durum",
        th_teacher: "Öğretmen",
        status_active: "Aktif",
        status_passive: "Pasif",

        // Admin JS
        confirm_del: "Bu kullanıcıyı silmek istediğinize emin misiniz?",
        msg_user_del: "Kullanıcı silindi.",
        msg_del_fail: "Silme işlemi başarısız!",
        msg_user_add: "Kullanıcı başarıyla eklendi!",
        msg_add_fail: "Kullanıcı eklenemedi.",
        msg_csv_ok: "CSV dosyası işlendi ve kullanıcılar başarıyla içeri aktarıldı!",
        msg_users_fail: "Kullanıcılar yüklenemedi.",
        msg_no_user: "Kullanıcı bulunamadı.",
        msg_no_tpl: "Henüz şablon bulunmuyor.",
        msg_tpl_fail: "Şablonlar yüklenemedi.",

        // Teacher
        teacher_panel: "OMR — Öğretmen Paneli",
        stat_classes: "Toplam Sınıf",
        stat_exams: "Toplam Sınav",
        stat_scans: "Taranan Form",
        create_class: "Yeni Sınıf Oluştur",
        class_name: "Sınıf Adı",
        class_placeholder: "Örn: Bilgisayar Müh. 1. Sınıf",
        btn_create: "Oluştur",
        th_student_count: "Öğrenci Sayısı",
        btn_detail: "Detay",
        create_exam: "Yeni Sınav Oluştur",
        exam_name: "Sınav Adı",
        select_class: "Sınıf Seç...",
        select_template: "Şablon Seç...",
        answer_key: "Cevap Anahtarı (JSON Formatı)",
        btn_create_exam: "Sınav Oluştur",
        scan_title: "Optik Form Tara",
        scan_mode_exam: "Sınav ile Tara",
        scan_mode_quick: "Hızlı Tarama (sınavsız)",
        scan_with_image: "İşaretli görsel üret (skor + işaretli .jpg)",
        scan_with_image_help: "Kapalıyken sadece skor/JSON üretilir; daha hızlı ve disk tasarrufu sağlar.",
        scan_go_results: "Sonuçları Görüntüle →",
        bs_total_pages: "Toplam Sayfa",
        bs_processed: "Başarılı",
        bs_failed: "Hatalı",
        bs_scored: "Skorlanan",
        bs_avg: "Ortalama",
        bs_keys_detected: "Tespit Edilen Cevap Anahtarları:",
        scan_no_exam_label: "—",
        scan_method_exam: "Sınav",
        scan_method_quick: "Hızlı",
        col_exam: "Sınav",
        col_method: "Yöntem",
        col_actions: "İşlem",
        assign_to_exam: "Sınava Aktar",
        assign_to_exam_bulk: "Bu Klasörü Sınava Aktar",
        select_exam_for_assign: "Sınav seçin",
        assign_success: "Sınava atandı.",
        assign_failed: "Sınava atama başarısız.",
        batch_folder_label: "Tarama",
        batch_folder_items: "kayıt",
        no_results_yet: "Henüz tarama sonucu yok.",
        bulk_selected: "seçili",
        bulk_assign: "Seçilenleri Sınava Aktar",
        bulk_delete: "Seçilenleri Sil",
        bulk_assign_dlg_title: "Seçilenleri Sınava Aktar",
        bulk_delete_confirm: "Seçilen {n} kaydı kalıcı olarak silmek istediğinize emin misiniz?",
        bulk_assign_no_selection: "Hiç kayıt seçilmedi.",
        bulk_delete_success: "{n} kayıt silindi.",
        delete_folder_btn: "Klasörü Sil",
        delete_folder_confirm: "Bu tarama klasörü ve içindeki tüm sonuçlar silinecek. Devam edilsin mi?",
        delete_folder_success: "Klasör silindi.",
        source_pdf_label: "Kaynak",
        marked_answers_title: "Öğrencinin İşaretlediği",
        no_key_no_score: "Cevap anahtarı yok — skor hesaplanmadı. Yalnızca öğrencinin işaretleri gösteriliyor.",
        pwd_show_hide: "Şifreyi göster/gizle",
        pwd_random: "Rastgele şifre üret",
        pwd_random_copied: "Şifre üretildi ve panoya kopyalandı.",
        pwd_reset_title: "Şifre sıfırla",
        pwd_reset_confirm: "{name} için yeni şifre üretildi: {pwd}\n\nKullanıcıya bu şifreyi iletmen gerekecek. Devam edilsin mi?",
        pwd_reset_success: "✓ Şifre güncellendi.\n\n{name} → {pwd}\n\n(Şifre panoya kopyalandı.)",
        pwd_reset_failed: "Şifre sıfırlama başarısız",
        csv_no_data: "İndirilecek veri yok.",
        csv_downloaded: "{n} kayıt CSV olarak indirildi.",
        csv_template_download: "Örnek CSV İndir",
        csv_format_hint: "Format: full_name,email,password,student_number — şablonu indirip kullanın.",
        filters_toggle: "Filtreler",
        nav_audit: "Denetim Kaydı",
        audit_title: "Denetim Kaydı (Audit Log)",
        audit_actor: "Yapan",
        audit_action: "Aksiyon",
        audit_target: "Hedef",
        audit_summary: "Özet",
        all_actions: "Tüm aksiyonlar",
        tpl_add_new: "Yeni Şablon Ekle",
        coming_soon: "(Yakında)",
        no_records: "Kayıt bulunamadı.",
        csv_role_hint: "CSV'deki tüm satırlara bu rol atanır.",
        csv_format_hint_v2: "Sütunlar:",
        csv_role_note: "⓵ Rol CSV'de yer ALMAZ — yukarıdaki \"Eklenecek Rol\" alanından seçilir ve tüm satırlara uygulanır.",
        csv_template_downloaded: "CSV şablonu indirildi.",
        btn_edit: "Düzenle",
        btn_save: "Kaydet",
        btn_cancel: "İptal",
        edit_user_title: "Kullanıcı Düzenle",
        edit_user_sn_hint: "Sadece öğrenciler için; boş bırakabilirsiniz.",
        edit_user_success: "Kullanıcı güncellendi.",
        // Tarama sihirbazı şablondan yükle
        vk_load_from_exam: "Sınavdan Yükle",
        vk_load_exam_hint: "Mevcut bir sınavın cevap anahtarını seçin",
        vk_load_success: "{n} soru anahtardan yüklendi.",
        vk_load_no_key: "Bu sınava henüz cevap anahtarı tanımlanmamış.",
        // Marked image zoom
        marked_zoom_in: "Yakınlaştır",
        marked_zoom_out: "Uzaklaştır",
        marked_zoom_reset: "Sıfırla",
        // Student aktif sınavlarda durum
        exam_status_done: "Tamamlandı",
        exam_status_pending: "Bekliyor",
        class_list: "Sınıf Listesi",
        exam_list: "Sınav Listesi",
        all_status: "Tüm Durumlar",
        gender: "Cinsiyet",
        gender_male: "Erkek",
        gender_female: "Kız",
        gender_unspecified: "Belirtilmedi",
        // Tarama iptal
        scan_cancel: "Taramayı İptal Et",
        scan_cancel_confirm: "Aktif taramayı iptal etmek istediğinize emin misiniz? Bu işleme kadar olan sonuçlar kaydedilmiş olacak.",
        scan_cancel_sent: "İptal isteği gönderildi…",
        // Sınav silme (admin)
        exam_delete_force_confirm: "\"{name}\" sınavına bağlı {n} sonuç var.\n\nDevam ederseniz sınav silinecek ve sonuçlar 'sınavsız (hızlı tarama)' haline gelecek. Sonuçlar silinmez.\n\nDevam edilsin mi?",
        exam_delete_force_ok: "Sınav silindi. {n} sonuç sınavsız hale getirildi.",
        // Hızlı tarama → sınav oluştur
        create_exam_from_batch: "Bu Klasörden Sınav Oluştur",
        create_exam_from_batch_short: "Sınav Oluştur",
        create_exam_from_batch_help: "Bu klasördeki sonuçlar yeni oluşturulan sınava bağlanacak.",
        create_exam_from_batch_ok: "\"{name}\" sınavı oluşturuldu, sonuçlar aktarıldı.",
        cefb_use_auto_key: "Tarama sırasında tespit edilen cevap anahtarını kullan",
        cefb_use_auto_key_hint: "CEVAP sayfalarından otomatik çıkarılan anahtarlar varsa onlar kullanılır.",
        // İtirazlar
        disputes_my: "İtirazlarım",
        disputes_for_result: "Bu Sonuca Açılan İtirazlar",
        disputes_none: "Bu sonuca açılmış itiraz yok.",
        dispute_create_btn: "İtiraz Et",
        dispute_prompt: "İtirazınızı kısaca açıklayın (en az 3 karakter):",
        dispute_created: "İtirazınız oluşturuldu, öğretmen yanıtlayacak.",
        dispute_delete_confirm: "Bu itirazı silmek istediğinize emin misiniz?",
        dispute_deleted: "İtiraz silindi.",
        dispute_badge_title: "Bu sonuca itiraz açık",
        disp_status_open: "Açık",
        disp_status_answered: "Yanıtlandı",
        disp_status_closed: "Kapalı",
        disp_response: "Yanıt",
        disp_respond: "Yanıtla",
        disp_respond_prompt: "Öğrencinin itirazına verdiğiniz yanıt:",
        disp_respond_ok: "Yanıtınız iletildi.",
        quick_question_count: "Soru Sayısı",
        quick_question_count_ph: "Örn: 30, 60, 90, 200",
        quick_question_count_hint: "Soru sayısı verirseniz sadece o kadar soru sonuca dahil edilir; gereksiz kolonlar parse edilmez. <strong>⚡ Tarama motoru optimize edildi</strong> — her sayfa için fazladan süre tasarrufu sağlar.",
        // CSV / Yazdır dialog'u
        export_csv_title: "CSV İndirme Seçenekleri",
        export_print_title: "Yazdırma Seçenekleri",
        export_scope_q: "Hangi kayıtlar dahil edilsin?",
        export_scope_selected: "Seçili kayıtlar",
        export_scope_selected_count: "{n} kayıt seçili",
        export_scope_selected_none: "Tablo üzerinde önce kayıt seçmelisin",
        export_scope_all: "Tüm filtrelenen kayıtlar",
        export_scope_all_count: "{n} kayıt — şu anki arama/filtre sonucu",
        export_include_image_csv: "İşaretli görsellerin URL'lerini ekle",
        export_include_image_csv_help: "Marked görsel mevcutsa bir kolon olarak eklenir.",
        export_include_image_print: "İşaretli görseller yazdırılsın",
        export_include_image_print_help: "Görseller PDF çıktısında yer alır (büyük dosya).",
        // CSV özet alanları (_ozet.json formatına benzer)
        csv_section_summary: "ÖZET",
        csv_section_records: "KAYITLAR",
        csv_total_records: "Toplam Kayıt",
        csv_scored_records: "Skorlanan Kayıt",
        csv_avg_correct: "Ortalama Doğru",
        csv_avg_wrong: "Ortalama Yanlış",
        csv_avg_blank: "Ortalama Boş",
        csv_avg_percent: "Ortalama Yüzde",
        csv_max_percent: "Maks. Yüzde",
        csv_min_percent: "Min. Yüzde",
        csv_image_url: "Görsel",
        csv_answer_key: "Cevap Anahtarı (JSON)",
        export_answer_keys: "Cevap Anahtarları",
        print_group_key_title: "{tg} Grubu Cevap Anahtarı",
        print_key_undefined: "(anahtar tanımsız)",
        print_header_date: "Tarih",
        print_header_records: "Kayıt",
        print_header_exam: "Sınav",
        print_header_method: "Yöntem",
        print_header_printed_at: "Yazdırılma zamanı",
        sinavlar_lbl: "sınav",
        export_scope_legend: "Kapsam",
        export_extra_legend: "Ek Seçenekler",
        quick_template: "Şablon",
        quick_answer_key: "Cevap Anahtarı (opsiyonel)",
        quick_answer_key_help: "JSON formatı veya boş bırakın; auto-key seçiliyse CEVAP sayfalarından otomatik çıkarılır.",
        select_exam: "Sınav Seçiniz...",
        scan_multi_label: "Optik Form Görselleri veya PDF (Çoklu Seçim Yapabilirsiniz)",
        scan_single_label: "Optik Form Görseli veya PDF",
        selected_files: "Seçilen Dosyalar",
        btn_scan_multi: "Formları Tara",
        btn_scan_single: "TARA ve GÖNDER",
        scan_success: "Tarama Sonucu Başarılı!",
        res_student: "Öğrenci:",
        res_no: "Numara:",
        res_group: "Kitapçık:",
        res_correct: "Doğru Sayısı:",
        res_wrong: "Yanlış Sayısı:",
        res_score: "Başarı Puanı:",
        res_map: "Cevap Haritası:",
        search_res: "İsim veya numara...",
        all_classes: "Tüm Sınıflar",
        btn_download_csv: "CSV İndir",
        th_group: "Grup",
        th_correct: "Doğru",
        th_wrong: "Yanlış",
        th_percent: "Yüzde",
        th_date: "Tarih",
        visual_key_title: "Cevap Anahtarı Sihirbazı",
        visual_key_subtitle: "Soru sayısına göre şıklar otomatik listelenir. Tıklayarak işaretle, veya toplu girişi kullan.",
        visual_key_info: "Soru sayısı girildiğinde sihirbaz aktif olacaktır.",
        vk_bulk_label: "Toplu desen",
        vk_bulk_placeholder: "Örn: ABCDE veya ABCDEABCDE…",
        vk_apply: "Uygula",
        vk_random: "Rastgele",
        vk_all_a: "Tümü A",
        vk_clear: "Temizle",
        vk_blank: "Boş",
        vk_invalid_pattern: "Geçersiz desen. Sadece A-E veya '-' kullanın.",
        chart_title: "Sınıf Başarı Ortalamaları (%)",
        chart_avg_score: "Ortalama Puan (%)",
        btn_print: "Yazdır",

        // Scan UI (Sprint 3 — async batch akışı)
        auto_key_title: "Cevap anahtarını otomatik tespit et",
        auto_key_subtitle: "PDF'in başında veya sonunda CEVAP sayfası varsa her test grubu için anahtar otomatik çıkarılır.",
        phase_pending: "Sıraya alındı…",
        phase_rasterize: "PDF sayfalara dönüştürülüyor…",
        phase_phase1: "Tüm sayfalar taranıyor…",
        phase_phase2: "CEVAP sayfalarından anahtar çıkarılıyor…",
        phase_phase3: "Skorlanıyor ve görseller üretiliyor…",
        phase_phase4: "Özet hesaplanıyor…",
        phase_complete: "Tamamlandı ✓",
        phase_failed: "Tarama başarısız.",
        batch_started: "Tarama başlatıldı",
        batch_summary_pages: "sayfa işlendi",
        batch_summary_errors: "hata",
        batch_summary_avg: "ortalama",
        batch_summary_keys: "Anahtarlar",
        batch_started_failed: "Tarama başlatılamadı",
        batch_polling_failed: "Tarama izleme hatası",
        batch_failed: "Tarama başarısız",
        batch_mock_warning: "Mock modda async batch desteklenmiyor — sadece UI demo",
        scan_view_marked: "İşaretli Görseli Aç",
        scan_no_map: "Tüm cevap haritası için sonuç detayını açın.",

        // Marked viewer modal legend
        marked_title: "İşaretli Görsel",
        legend_correct: "Doğru cevap",
        legend_correct_pos: "Doğru cevap konumu (yanlış)",
        legend_blank_pos: "Boş (doğru cevap)",
        legend_wrong: "Öğrenci yanlış işaret",
        legend_sn_fn_tg: "SN/FN/TG işareti",
        legend_ambig: "Belirsiz (#)",
        marked_loading: "Görsel yükleniyor…",
        marked_load_failed: "Görsel yüklenemedi",
        ambig_title: "Belirsiz / çakışan işaret",

        // Teacher JS
        msg_class_ok: "sınıfı başarıyla oluşturuldu!",
        msg_class_err: "Sınıf oluşturulurken hata meydana geldi.",
        msg_exam_ok: "sınavı başarıyla oluşturuldu!",
        msg_scan_ok: "form başarıyla tarandı!",
        msg_scan_err: "Tarama başarısız oldu!",
        msg_no_classes: "Henüz sınıf oluşturulmamış.",
        msg_no_exams: "Henüz sınav oluşturulmamış.",
        msg_results_fail: "Sonuçlar yüklenemedi.",

        // Student
        student_panel: "OMR — Öğrenci Paneli",
        nav_active_exams: "Aktif Sınavlar",
        nav_my_results: "Sonuçlarım",
        scan_form: "Optik Formunu Tara",
        res_blank: "Boş:",
        your_answers: "Cevaplarınız:",
        exam_date: "Sınav Tarihi",
        msg_no_active_exams: "Şu anda aktif bir sınavınız bulunmuyor.",
        msg_no_results: "Henüz sonucunuz bulunmuyor."
    },
    en: {
        // Login Page
        hero_desc: "Optical Mark Recognition • Auto Grading • Data Analysis",
        brand_desc: "OMR System — Sign In to Continue",
        error_text: "Login failed. Please check your credentials.",
        email_placeholder: "Your email address",
        password_placeholder: "Your password",
        remember_me: "Remember me",
        login_btn: "Sign In",
        demo_title: "Demo Accounts",
        role_admin: "Admin",
        role_teacher: "Teacher",
        role_student: "Student",
        footer_support: "Support",
        footer_rights: "All rights reserved.",
        footer_contact: "Contact",

        // Common Dashboard
        nav_users: "Users",
        nav_templates: "Templates",
        nav_logout: "Logout",
        nav_profile: "My Profile",
        nav_classes: "Classes",
        nav_exams: "Exams",
        nav_results: "Results",
        nav_dashboard: "Dashboard",
        nav_scan: "Scan",
        loading: "Loading...",
        welcome: "Welcome",
        forgot_pwd: "Forgot Password?",
        back_to_login: "Back to Login",
        forgot_pwd_desc: "Please enter your registered email address. We will send you a password reset link.",
        send_reset_link: "Send Reset Link",
        reset_success: "Password reset link has been sent to your email!",
        reset_fail: "No user found matching this email address!",
        current_password: "Current Password",
        new_password: "New Password",
        confirm_password: "Confirm New Password",
        update_password: "Update Password",
        change_picture: "Change Picture",
        delete_picture: "Remove Picture",
        modal_profile_title: "My Profile",
        msg_pwd_mismatch: "New passwords do not match!",
        msg_pwd_success: "Password updated successfully!",
        msg_pwd_wrong: "Current password is wrong!",

        // Admin
        admin_panel: "OMR — Admin Panel",
        user_mgmt: "User Management",
        add_user: "Add New User",
        name_placeholder: "Full Name",
        role_select: "Select Role...",
        student_no_placeholder: "Student Number (Only for Students)",
        btn_add: "Add",
        bulk_add: "Bulk Add via CSV",
        role_to_add: "Role to Add",
        csv_file: "CSV File",
        btn_import: "Import",
        user_list: "User List",
        filter_all: "All",
        search_user: "Search by name or email...",
        th_name: "Full Name",
        th_email: "Email",
        th_role: "Role",
        th_student_no: "Student No",
        th_action: "Action",
        btn_delete: "Delete",
        tpl_title: "Optical Form Templates",
        th_tpl_name: "Template Name",
        th_desc: "Description",
        th_qcount: "Question Count",
        th_status: "Status",
        th_teacher: "Teacher",
        status_active: "Active",
        status_passive: "Passive",

        // Admin JS
        confirm_del: "Are you sure you want to delete this user?",
        msg_user_del: "User deleted.",
        msg_del_fail: "Deletion failed!",
        msg_user_add: "User added successfully!",
        msg_add_fail: "Failed to add user.",
        msg_csv_ok: "CSV file processed and users imported successfully!",
        msg_users_fail: "Failed to load users.",
        msg_no_user: "No users found.",
        msg_no_tpl: "No templates yet.",
        msg_tpl_fail: "Failed to load templates.",

        // Teacher
        teacher_panel: "OMR — Teacher Panel",
        stat_classes: "Total Classes",
        stat_exams: "Total Exams",
        stat_scans: "Scanned Forms",
        create_class: "Create New Class",
        class_name: "Class Name",
        class_placeholder: "e.g., Computer Eng. 1st Year",
        btn_create: "Create",
        th_student_count: "Student Count",
        btn_detail: "Detail",
        create_exam: "Create New Exam",
        exam_name: "Exam Name",
        select_class: "Select Class...",
        select_template: "Select Template...",
        answer_key: "Answer Key (JSON Format)",
        btn_create_exam: "Create Exam",
        scan_title: "Scan Optical Form",
        scan_mode_exam: "Scan with Exam",
        scan_mode_quick: "Quick Scan (no exam)",
        scan_with_image: "Generate annotated image (.jpg + score)",
        scan_with_image_help: "When off, only score/JSON is produced — faster and saves disk.",
        scan_go_results: "View Results →",
        bs_total_pages: "Total Pages",
        bs_processed: "Successful",
        bs_failed: "Failed",
        bs_scored: "Scored",
        bs_avg: "Average",
        bs_keys_detected: "Detected Answer Keys:",
        scan_no_exam_label: "—",
        scan_method_exam: "Exam",
        scan_method_quick: "Quick",
        col_exam: "Exam",
        col_method: "Method",
        col_actions: "Actions",
        assign_to_exam: "Assign to Exam",
        assign_to_exam_bulk: "Assign this batch to Exam",
        select_exam_for_assign: "Select exam",
        assign_success: "Assigned to exam.",
        assign_failed: "Failed to assign to exam.",
        batch_folder_label: "Scan",
        batch_folder_items: "items",
        no_results_yet: "No scan results yet.",
        bulk_selected: "selected",
        bulk_assign: "Assign Selected to Exam",
        bulk_delete: "Delete Selected",
        bulk_assign_dlg_title: "Assign Selected to Exam",
        bulk_delete_confirm: "Are you sure you want to permanently delete {n} records?",
        bulk_assign_no_selection: "No records selected.",
        bulk_delete_success: "{n} records deleted.",
        delete_folder_btn: "Delete Folder",
        delete_folder_confirm: "This batch folder and all results inside will be deleted. Continue?",
        delete_folder_success: "Folder deleted.",
        source_pdf_label: "Source",
        marked_answers_title: "Student Marks",
        no_key_no_score: "No answer key — score not computed. Only the student's marks are shown.",
        pwd_show_hide: "Show/hide password",
        pwd_random: "Generate random password",
        pwd_random_copied: "Password generated and copied to clipboard.",
        pwd_reset_title: "Reset password",
        pwd_reset_confirm: "A new password has been generated for {name}: {pwd}\n\nYou will need to share this password with the user. Continue?",
        pwd_reset_success: "✓ Password updated.\n\n{name} → {pwd}\n\n(Password copied to clipboard.)",
        pwd_reset_failed: "Password reset failed",
        csv_no_data: "No data to download.",
        csv_downloaded: "{n} records downloaded as CSV.",
        csv_template_download: "Download CSV Template",
        csv_format_hint: "Format: full_name,email,password,student_number — download and use the template.",
        filters_toggle: "Filters",
        nav_audit: "Audit Log",
        audit_title: "Audit Log",
        audit_actor: "Actor",
        audit_action: "Action",
        audit_target: "Target",
        audit_summary: "Summary",
        all_actions: "All actions",
        tpl_add_new: "Add New Template",
        coming_soon: "(Coming soon)",
        no_records: "No records found.",
        csv_role_hint: "All rows in the CSV will be assigned this role.",
        csv_format_hint_v2: "Columns:",
        csv_role_note: "⓵ Role is NOT in the CSV — selected from \"Role to Add\" above and applied to all rows.",
        csv_template_downloaded: "CSV template downloaded.",
        btn_edit: "Edit",
        btn_save: "Save",
        btn_cancel: "Cancel",
        edit_user_title: "Edit User",
        edit_user_sn_hint: "Only for students; can be left empty.",
        edit_user_success: "User updated.",
        vk_load_from_exam: "Load from Exam",
        vk_load_exam_hint: "Select an existing exam's answer key",
        vk_load_success: "{n} questions loaded from the answer key.",
        vk_load_no_key: "No answer key defined for this exam yet.",
        marked_zoom_in: "Zoom In",
        marked_zoom_out: "Zoom Out",
        marked_zoom_reset: "Reset",
        exam_status_done: "Completed",
        exam_status_pending: "Pending",
        class_list: "Class List",
        exam_list: "Exam List",
        all_status: "All Statuses",
        gender: "Gender",
        gender_male: "Male",
        gender_female: "Female",
        gender_unspecified: "Unspecified",
        scan_cancel: "Cancel Scan",
        scan_cancel_confirm: "Are you sure you want to cancel the active scan? Results processed up to that point will be kept.",
        scan_cancel_sent: "Cancel request sent…",
        exam_delete_force_confirm: "Exam \"{name}\" has {n} linked results.\n\nIf you continue, the exam will be deleted and the results will become 'no-exam (quick scan)'. Results are NOT deleted.\n\nContinue?",
        exam_delete_force_ok: "Exam deleted. {n} results are now without an exam.",
        create_exam_from_batch: "Create Exam from This Folder",
        create_exam_from_batch_short: "Create Exam",
        create_exam_from_batch_help: "Results in this folder will be linked to the new exam.",
        create_exam_from_batch_ok: "Exam \"{name}\" created and results linked.",
        cefb_use_auto_key: "Use the answer key detected during scanning",
        cefb_use_auto_key_hint: "If auto-detected keys exist from CEVAP pages, they will be used.",
        disputes_my: "My Disputes",
        disputes_for_result: "Disputes for This Result",
        disputes_none: "No disputes for this result.",
        dispute_create_btn: "File a Dispute",
        dispute_prompt: "Describe your dispute briefly (min 3 chars):",
        dispute_created: "Your dispute has been submitted.",
        dispute_delete_confirm: "Are you sure you want to delete this dispute?",
        dispute_deleted: "Dispute deleted.",
        dispute_badge_title: "Open dispute(s) for this result",
        disp_status_open: "Open",
        disp_status_answered: "Answered",
        disp_status_closed: "Closed",
        disp_response: "Response",
        disp_respond: "Respond",
        disp_respond_prompt: "Your response to the student's dispute:",
        disp_respond_ok: "Your response was sent.",
        quick_question_count: "Question Count",
        quick_question_count_ph: "e.g. 30, 60, 90, 200",
        quick_question_count_hint: "Providing a question count limits results to that many questions; unnecessary columns are not parsed. <strong>⚡ Scan engine optimized</strong> — extra time savings per page.",
        export_csv_title: "CSV Download Options",
        export_print_title: "Print Options",
        export_scope_q: "Which records should be included?",
        export_scope_selected: "Selected records",
        export_scope_selected_count: "{n} records selected",
        export_scope_selected_none: "Select rows in the table first",
        export_scope_all: "All filtered records",
        export_scope_all_count: "{n} records — current search/filter result",
        export_include_image_csv: "Include annotated image URLs",
        export_include_image_csv_help: "If marked images exist, add them as a column.",
        export_include_image_print: "Print annotated images",
        export_include_image_print_help: "Images will appear in the PDF output (large file).",
        csv_section_summary: "SUMMARY",
        csv_section_records: "RECORDS",
        csv_total_records: "Total Records",
        csv_scored_records: "Scored Records",
        csv_avg_correct: "Avg. Correct",
        csv_avg_wrong: "Avg. Wrong",
        csv_avg_blank: "Avg. Blank",
        csv_avg_percent: "Avg. Percentage",
        csv_max_percent: "Max. Percentage",
        csv_min_percent: "Min. Percentage",
        csv_image_url: "Image",
        csv_answer_key: "Answer Key (JSON)",
        export_answer_keys: "Answer Keys",
        print_group_key_title: "Group {tg} Answer Key",
        print_key_undefined: "(key undefined)",
        print_header_date: "Date",
        print_header_records: "Records",
        print_header_exam: "Exam",
        print_header_method: "Method",
        print_header_printed_at: "Printed at",
        sinavlar_lbl: "exams",
        export_scope_legend: "Scope",
        export_extra_legend: "Additional Options",
        quick_template: "Template",
        quick_answer_key: "Answer Key (optional)",
        quick_answer_key_help: "JSON format, or leave empty; if auto-key is enabled, keys are extracted from CEVAP pages.",
        select_exam: "Select Exam...",
        scan_multi_label: "Optical Form Images or PDF (Multiple Selection)",
        scan_single_label: "Optical Form Image or PDF",
        selected_files: "Selected Files",
        btn_scan_multi: "Scan Forms",
        btn_scan_single: "SCAN and SUBMIT",
        scan_success: "Scan Successful!",
        res_student: "Student:",
        res_no: "Number:",
        res_group: "Booklet:",
        res_correct: "Correct:",
        res_wrong: "Wrong:",
        res_score: "Score:",
        res_map: "Answer Map:",
        search_res: "Name or number...",
        all_classes: "All Classes",
        btn_download_csv: "Download CSV",
        th_group: "Group",
        th_correct: "Correct",
        th_wrong: "Wrong",
        th_percent: "Percentage",
        th_date: "Date",
        visual_key_title: "Answer Key Wizard",
        visual_key_subtitle: "Options are listed below based on the question count. Click to select, or use bulk entry.",
        visual_key_info: "The wizard will activate once you enter a question count.",
        vk_bulk_label: "Bulk pattern",
        vk_bulk_placeholder: "e.g. ABCDE or ABCDEABCDE…",
        vk_apply: "Apply",
        vk_random: "Random",
        vk_all_a: "All A",
        vk_clear: "Clear",
        vk_blank: "Blank",
        vk_invalid_pattern: "Invalid pattern. Use only A-E or '-'.",
        chart_title: "Class Performance Averages (%)",
        chart_avg_score: "Average Score (%)",
        btn_print: "Print",

        // Scan UI (Sprint 3 — async batch flow)
        auto_key_title: "Auto-detect answer key",
        auto_key_subtitle: "If the PDF includes ANSWER pages at the start or end, a key is automatically extracted per test group.",
        phase_pending: "Queued…",
        phase_rasterize: "Converting PDF pages…",
        phase_phase1: "Scanning all pages…",
        phase_phase2: "Extracting answer keys from CEVAP pages…",
        phase_phase3: "Scoring and generating annotated images…",
        phase_phase4: "Computing summary…",
        phase_complete: "Completed ✓",
        phase_failed: "Scan failed.",
        batch_started: "Scan started",
        batch_summary_pages: "pages processed",
        batch_summary_errors: "errors",
        batch_summary_avg: "average",
        batch_summary_keys: "Keys",
        batch_started_failed: "Could not start scan",
        batch_polling_failed: "Polling error",
        batch_failed: "Scan failed",
        batch_mock_warning: "Async batch not supported in mock mode — UI demo only",
        scan_view_marked: "Open Annotated Image",
        scan_no_map: "Open the result detail for the full answer map.",

        // Marked viewer modal legend
        marked_title: "Annotated Image",
        legend_correct: "Correct answer",
        legend_correct_pos: "Correct option (student wrong)",
        legend_blank_pos: "Blank (correct option)",
        legend_wrong: "Student wrong mark",
        legend_sn_fn_tg: "SN/FN/TG mark",
        legend_ambig: "Ambiguous (#)",
        marked_loading: "Loading image…",
        marked_load_failed: "Image could not be loaded",
        ambig_title: "Ambiguous / conflicting mark",

        // Teacher JS
        msg_class_ok: "class created successfully!",
        msg_class_err: "Error creating class.",
        msg_exam_ok: "exam created successfully!",
        msg_scan_ok: "forms scanned successfully!",
        msg_scan_err: "Scan failed!",
        msg_no_classes: "No classes created yet.",
        msg_no_exams: "No exams created yet.",
        msg_results_fail: "Failed to load results.",

        // Student
        student_panel: "OMR — Student Panel",
        nav_active_exams: "Active Exams",
        nav_my_results: "My Results",
        scan_form: "Scan Your Optical Form",
        res_blank: "Blank:",
        your_answers: "Your Answers:",
        exam_date: "Exam Date",
        msg_no_active_exams: "You currently have no active exams.",
        msg_no_results: "You don't have any results yet."
    }
};

// İlk açılış dili: kayıtlı tercih > tarayıcı dili > 'tr' fallback.
// `navigator.language` örn. "tr-TR", "en-US"; ilk 2 karakter eşleştiriliyor.
function _detectInitialLang() {
    const saved = safeStorageGet('omr_lang');
    if (saved && (saved === 'tr' || saved === 'en')) return saved;
    try {
        const nav = (navigator.language || navigator.userLanguage || 'tr').toLowerCase();
        if (nav.startsWith('en')) return 'en';
    } catch {}
    return 'tr';
}
let currentLang = _detectInitialLang();

export function t(key) {
    if (translations[currentLang] && translations[currentLang][key]) {
        return translations[currentLang][key];
    }
    return key; // Fallback
}

export function updateLangUI() {
    const d = translations[currentLang];
    if (!d) return;

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (d[key]) el.innerHTML = d[key]; // Allow simple inner HTML replacement
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (d[key]) el.placeholder = d[key];
    });

    document.querySelectorAll('.lang-text').forEach(el => {
        el.textContent = currentLang === 'tr' ? 'EN' : 'TR';
    });
}

export function initLanguage() {
    updateLangUI();
    document.querySelectorAll('.lang-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            currentLang = currentLang === 'tr' ? 'en' : 'tr';
            safeStorageSet('omr_lang', currentLang);
            updateLangUI();

            // Dispatch a custom event so dynamic tables can re-render if needed
            window.dispatchEvent(new CustomEvent('languageChanged'));
        });
    });
}

// ==========================================================================
// Yapılandırma
// ==========================================================================
// NOT: USE_MOCK sabiti dosyanın başında (satır 8) tanımlanmıştır.

// ==========================================================================
// Profil Modalı ve Şifre Değiştirme Mantığı
// ==========================================================================
window.openProfileModal = async function () {
    const modal = document.getElementById('profileModal');
    if (!modal) return;
    modal.setAttribute('open', 'true');
    document.getElementById('profileName').textContent = safeStorageGet('omr_name') || 'Kullanıcı';
    document.getElementById('profileRole').textContent = t('role_' + safeStorageGet('omr_role')) || safeStorageGet('omr_role');

    // Gender bilgisini backend'den çek ve avatar'ı güncelle
    try {
        const me = await apiFetch('/api/auth/me');
        _currentGender = me?.gender || null;
        _updateGenderAvatar(_currentGender);
    } catch (e) {
        _currentGender = null;
        _updateGenderAvatar(null);
    }
};

// Cinsiyete göre avatar emoji + buton state'i
let _currentGender = null;
function _updateGenderAvatar(g) {
    const emoji = document.getElementById('profileAvatarEmoji');
    const av = document.getElementById('profileAvatar');
    const maleBtn = document.getElementById('genderMaleBtn');
    const femaleBtn = document.getElementById('genderFemaleBtn');
    const clearBtn = document.getElementById('genderClearBtn');
    if (!emoji) return;
    if (g === 'male') {
        emoji.textContent = '👨';
        if (av) av.style.background = 'rgba(56,189,248,0.18)';
    } else if (g === 'female') {
        emoji.textContent = '👩';
        if (av) av.style.background = 'rgba(244,114,182,0.18)';
    } else {
        emoji.textContent = '🧑';
        if (av) av.style.background = 'var(--pico-primary-focus)';
    }
    if (maleBtn) maleBtn.classList.toggle('contrast', g === 'male');
    if (femaleBtn) femaleBtn.classList.toggle('contrast', g === 'female');
    if (clearBtn) clearBtn.classList.toggle('contrast', !g);
}

// Cinsiyet seçimi (backend'e PATCH)
window.setProfileGender = async function(gender) {
    try {
        const me = await apiFetch('/api/auth/me', {
            method: 'PATCH',
            body: JSON.stringify({ gender: gender || '' }),
        });
        _currentGender = me?.gender || null;
        _updateGenderAvatar(_currentGender);
        // Storage'ı da güncelle (refresh sonrası tekrar yüklensin)
        if (_currentGender) {
            safeStorageSet('omr_gender', _currentGender);
        } else {
            safeStorageRemove('omr_gender');
        }
        // Navbar profil ikonu da güncellensin (cinsiyete göre)
        updateNavbarProfileImage();
    } catch (err) {
        console.error('Cinsiyet güncellenemedi:', err);
    }
};

window.closeProfileModal = function () {
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.removeAttribute('open');
        const form = document.getElementById('changePwdForm');
        if (form) form.reset();
    }
};

// Profile resim sistemi kaldırıldı — geriye uyumluluk için export'lar no-op
export function updateModalProfileImage() { /* deprecated */ }

// Navbar profile butonu: cinsiyete göre ufak emoji
export function updateNavbarProfileImage() {
    const profileBtn = document.getElementById('profileBtn');
    if (!profileBtn) return;
    // Login response'ta gender geldi mi?
    const g = safeStorageGet('omr_gender');
    if (g === 'male') {
        profileBtn.innerHTML = `<span style="font-size:1.1rem; line-height:1;">👨</span>`;
    } else if (g === 'female') {
        profileBtn.innerHTML = `<span style="font-size:1.1rem; line-height:1;">👩</span>`;
    } else {
        profileBtn.innerHTML = `<i class="ph ph-user"></i>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateNavbarProfileImage();
});

// Profile image upload kaldırıldı (cinsiyet seçimine geçildi) — geriye uyumluluk için no-op
window.uploadProfileImage = function () { /* deprecated */ };

window.deleteProfileImage = function () { /* deprecated */ };


// Global showToast fallback
function showToast(msg, type) {
    // Arayüzdeki custom showToast fonksiyonunu bulmaya çalış, yoksa alert ver
    const activeToast = window.showToast || (document.querySelector('.toast-container') ? (m, t) => {
        const container = document.querySelector('.toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${t}`;
        const icons = { success: 'ph-check-circle', error: 'ph-x-circle', info: 'ph-info', warning: 'ph-warning' };
        toast.innerHTML = `<i class="ph ${icons[t] || icons.info}"></i> ${m}`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('toast-hide');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    } : null);

    if (activeToast) {
        activeToast(msg, type);
    } else {
        alert(msg);
    }
}

window.changePassword = async function (event) {
    event.preventDefault();
    const currentPwd = document.getElementById('currentPwd').value;
    const newPwd = document.getElementById('newPwd').value;
    const confirmPwd = document.getElementById('confirmPwd').value;

    if (newPwd !== confirmPwd) {
        if (typeof showToast === 'function') showToast(t('msg_pwd_mismatch'), 'error');
        else alert(t('msg_pwd_mismatch'));
        return;
    }

    if (USE_MOCK) {
        let currentEmail = safeStorageGet('omr_email');
        if (!currentEmail) {
            const role = safeStorageGet('omr_role');
            if (role === 'admin') currentEmail = 'admin@omr.local';
            else if (role === 'teacher') currentEmail = 'ogretmen@omr.local';
            else if (role === 'student') currentEmail = 'emrecan@omr.local';
            else currentEmail = 'unknown';
        }
        const storedPwd = safeStorageGet('omr_pwd_' + currentEmail);

        let defaultPwd = '123456';
        if (currentEmail === 'ogretmen@omr.local') defaultPwd = 'ogretmen123';
        else if (currentEmail === 'admin@omr.local') defaultPwd = 'admin123';
        else if (currentEmail === 'vedat@omr.local' || currentEmail === 'emrecan@omr.local') defaultPwd = 'ogrenci123';

        const expectedPwd = storedPwd || defaultPwd;

        if (currentPwd !== expectedPwd) {
            if (typeof showToast === 'function') showToast(t('msg_pwd_wrong'), 'error');
            else alert(t('msg_pwd_wrong'));
            return;
        }

        let currentEmailForSave = safeStorageGet('omr_email');
        if (!currentEmailForSave) {
            const role = safeStorageGet('omr_role');
            if (role === 'admin') currentEmailForSave = 'admin@omr.local';
            else if (role === 'teacher') currentEmailForSave = 'ogretmen@omr.local';
            else if (role === 'student') currentEmailForSave = 'emrecan@omr.local';
        }
        if (currentEmailForSave) safeStorageSet('omr_pwd_' + currentEmailForSave, newPwd);

        if (typeof showToast === 'function') showToast(t('msg_pwd_success'), 'success');
        else alert(t('msg_pwd_success'));
        closeProfileModal();
    } else {
        try {
            await apiFetch('/api/auth/change-password', {
                method: 'POST',
                body: JSON.stringify({
                    current_password: currentPwd,
                    new_password: newPwd
                })
            });
            if (typeof showToast === 'function') showToast(t('msg_pwd_success'), 'success');
            else alert(t('msg_pwd_success'));
            closeProfileModal();
        } catch (error) {
            console.error('Şifre değiştirme hatası:', error);
            if (typeof showToast === 'function') showToast(t('msg_pwd_wrong'), 'error');
            else alert(t('msg_pwd_wrong'));
        }
    }
};
