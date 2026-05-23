# 🎬 OMR Sistemi — 5 Dakikalık Demo Senaryosu (Ultimate Sürüm)

**Hazırlayan:** Emrecan ÜNAL  
**Tarih:** 23 Mayıs 2026  
**Süre:** ~5 Dakika  
**Gereksinimler:** Modern tarayıcı (Chrome/Edge), arka planda çalışan yerel sunucu (örn: `python -m http.server 8080`)

---

## 🎯 Ön Hazırlık (Demo Öncesi)

1. `web/` klasörünün bulunduğu dizinde bir HTTP sunucu başlatın:
   ```bash
   python -m http.server 8080
   ```
2. Tarayıcıda `http://localhost:8080/web/login.html` açın.
3. F12 Console açık olsun (hata olmadığını göstermek için).
4. Uygulama "PWA" (Progressive Web App) olduğu için tarayıcının adres çubuğunda çıkan "Uygulamayı Yükle" ikonunun göründüğünden emin olun.

---

## 📋 Demo Akışı

### Bölüm 1: Giriş Ekranı & PWA (45 saniye)

| Adım | Eylem | Beklenen Sonuç |
|------|-------|----------------|
| 1.1 | Login sayfasını gösterin | Premium UI: Sol tarafta animasyonlu görsel, sağda form |
| 1.2 | PWA özelliğini vurgulayın | Adres çubuğundaki "Yükle" butonuna tıklayarak uygulamanın masaüstü gibi çalışabildiğini gösterin |
| 1.3 | Sağ üstteki Dark Mode butonuna tıklayın | Sayfa anında şık bir karanlık temaya geçer |
| 1.4 | `ogretmen@omr.local` / `ogretmen123` ile giriş | Öğretmen paneline yönlendirme, Dashboard açılır |

**Konuşma:** *"Sistemimiz sadece bir web sayfası değil, aynı zamanda yüklenebilir bir PWA (Progressive Web App). Modern dark mode desteğimiz var ve tasarımı oldukça premium seviyede."*

---

### Bölüm 2: Öğretmen Paneli & Çoklu Tarama (2 dakika)

| Adım | Eylem | Beklenen Sonuç |
|------|-------|----------------|
| 2.1 | Dashboard statlarını ve Profil butonunu gösterin | "Profilim" modalını açın (şifre değiştirme vs.) |
| 2.2 | "Sınıflar" sekmesine geçip yeni sınıf ekleyin | Sınıf eklenir, başarılı toast mesajı fırlatılır |
| 2.3 | "Tara" sekmesine geçin ve klavyeden `Ctrl+S` basın | Hızlı kısayol desteğini vurgulayın |
| 2.4 | **Çoklu Dosya Yükleme (Batch Upload):** Sınav seçin ve birden fazla dosya seçin | Seçilen dosyaların mini önizlemeleri grid halinde belirir |
| 2.5 | "Formları Tara" butonuna tıklayın | Ekranda animasyonlu Progress Bar çıkar (Örn: "İşleniyor: 2/5") ve tarama biter |
| 2.6 | Başarı sonucunu gösterin | En son taranan öğrencinin detaylı skoru ve cevap haritası gösterilir |

**Konuşma:** *"Öğretmenler artık formları tek tek değil, toplu halde taratabiliyor. Ekranda kaçıncı dosyada olduğumuzu gösteren bir progress bar ve formların önizlemeleri mevcut."*

---

### Bölüm 3: Gelişmiş Sonuçlar & Gerçek Zamanlı Veri (1 dakika 15 sn)

| Adım | Eylem | Beklenen Sonuç |
|------|-------|----------------|
| 3.1 | "Sonuçlar" sekmesine geçin | Sonuçlar tablosu listelenir |
| 3.2 | Tarih ve Sınıf filtrelerini kullanın | Tablonun saniyesinde filtrelendiğini gösterin |
| 3.3 | "Detay" butonuna tıklayın | Modal içinde gelişmiş CSS istatistik bar chart ve cevap grid'i görünür |
| 3.4 | **(Sürpriz Özellik) Bekleyin:** | Siz hiçbir şey yapmadan ekrana aniden "Yeni bir sınav sonucu sisteme düştü" bildirimi gelir ve tabloya yeni veri eklenir |
| 3.5 | "CSV İndir" butonuna tıklayın | Rapor BOM destekli (Türkçe karakter sorunu olmadan) iner |

**Konuşma:** *"Sonuçlar ekranında tarih filtrelerimiz var. Ayrıca sistem WebSocket altyapısına sahip. Bakın, ben hiçbir şeye tıklamadığım halde başka bir öğretmenin tarattığı form anında benim ekranıma düştü."*

---

### Bölüm 4: Kapanış & Admin Paneli (1 dakika)

| Adım | Eylem | Beklenen Sonuç |
|------|-------|----------------|
| 4.1 | Çıkış yapın, `admin@omr.local` / `admin123` ile giriş | Admin paneline yönlendirilir |
| 4.2 | Kullanıcılar sekmesindeki filtre butonlarına tıklayın | Rol bazlı filtreleme sorunsuz çalışır |
| 4.3 | Console'u gösterin | Hata yoktur, sadece API çağrı logları vardır |
| 4.4 | Token güvenliğini gösterin | Çıkış yaptıktan sonra `teacher.html` adresine girmeye çalışın, sistem Login sayfasına geri atar |

**Konuşma:** *"Oturum yönetimimiz JWT Bearer Token ile yapılıyor. Token olmayan hiç kimse sistemdeki diğer sayfalara erişemez. Dinlediğiniz için teşekkür ederim."*

---

## 🔑 Demo Sırasında Vurgulanacak 5 Yıldızlı Özellikler

1. **PWA (Progressive Web App):** Uygulama olarak yüklenebilme ve offline (Service Worker) altyapısı.
2. **Batch Upload:** Çoklu optik form tarama, animasyonlu Progress Bar ve Grid önizleme.
3. **Gerçek Zamanlı WebSocket:** Verilerin sayfa yenilemeden canlı olarak tabloya düşmesi.
4. **Dark Mode & Kısayollar:** Modern karanlık tema ve `Ctrl+S`, `Esc` gibi power-user özellikleri.
5. **Backend Format Uyumluluğu:** Token koruması, `FormData` kullanımı ve sıfır console hatası.
