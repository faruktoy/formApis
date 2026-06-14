// ============================================================================
// OMR Service Worker — DEV MODE: NO-OP + KENDİNİ SİL
// ============================================================================
// Geliştirme sırasında cache karmaşalarını önlemek için SW pasifleştirildi.
// Yeni yüklemede kendini unregister eder ve mevcut tüm cache'leri temizler.
// Production'a geçince burayı geri açabilirsin (eski v2 git history'de duruyor).
// ============================================================================

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        // 1) Tüm cache'leri sil
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
        console.log('[SW] Tüm cache silindi:', names);

        // 2) Kendini unregister et — bir daha hayata dönmesin
        await self.registration.unregister();
        console.log('[SW] Unregister edildi');

        // 3) Tüm açık tab'ları yenile ki yeni içerik gelsin
        const clientsList = await self.clients.matchAll({ type: 'window' });
        for (const c of clientsList) {
            try { c.navigate(c.url); } catch (e) { console.warn('[SW] reload err', e); }
        }
    })());
});

// fetch event'ine müdahale etme — her istek direkt network'ten gitsin
self.addEventListener('fetch', () => { /* no-op */ });
