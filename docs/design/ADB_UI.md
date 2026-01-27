# ADB_UI Specification (v2.0) ⚡

> **Kod Adı:** TECHNICAL_COMMAND_HUD (v2.0)
> **Vizyon:** Android ekosistemi için tasarlanmış, askeri sınıf HUD (Heads-Up Display) estetiği ile modern teknik verimliliği birleştiren profesyonel bir tasarım dili.

---

## 1. Tasarım Felsefesi (Philosophy)

ADB_UI, "Safe Harbor" (Güvenli Liman) tasarımlarını (yuvarlak köşeler, pastel renkler, yumuşak gölgeler) reddeder. Onun yerine:
- **Teknik Hassasiyet:** Her piksel bir veri noktasıdır.
- **Acımasız Verimlilik:** Görsellik her zaman işlevselliği ve veri görünürlüğünü destekler.
- **İçgüdüsel Geri Bildirim (Visceral Feedback):** Sistem durumu renk ve hareketle anında kullanıcıya hissettirilir.
- **Unified Headers:** Tüm modüller standartlaştırılmış Typography ve Layout kullanır. Sol taraftan hizalama (`p-6`) ile görsel tutarlılık sağlanır.

---

## 2. Renk Sistemi (Color Palette)

| Kategorisi | İsim | HEX | Fonksiyon |
| :--- | :--- | :--- | :--- |
| **Ana Renk** | Neon Green | `#00FF41` | Standart durumlar, başarılar, ana hatlar. |
| **Vurgu** | Acid Green | `#AAFF00` | Etkileşimli öğeler (hover), seçili durumlar. |
| **Kritik** | Signal Red | `#FF3131` | Hatalar, kritik pil, tehlikeli modüller, sistem uyarıları. |
| **Uyarı** | Heat Orange | `#FFD700` | Yüksek sıcaklık, orta riskli işlemler. |
| **Arka Plan** | Pure Black | `#000000` | Ana gövde. |
| **Derinlik** | Slate 950 | `#020617` | Kartlar ve panel içi alanlar. |
| **Metin (Başlık)** | Pure White | `#FFFFFF` | Ana başlıklar (drop-shadow efektli). |
| **Metin (Sub)** | White/80 | `rgba(255,255,255,0.8)` | Alt başlıklar, açıklamalar. |

---

## 3. Geometri ve Yapı (Geometry)

ADB_UI standart "kart" görünümünü de-fragmante eder.

- **Köşeler:** Standart `border-radius` kullanımı kesinlikle yasaktır (0px).
- **Clipped Corners:** Panel ve butonlarda sağ üst ve sol alt köşeler `calc(100% - 12px)` oranında 45 derece kesilir.
- **Grid System:** Tüm arayüz 40x40 piksellik bir teknik ızgara üzerine oturur.
- **Layout Consistency:** Tüm ana modüller (Settings, Monitor, Backup, vb.) içeriklerine sol kenardan `24px` (`p-6`) mesafede başlar.

---

## 4. Tipografi (Typography)

| Font | Kullanım | Karakteristik |
| :--- | :--- | :--- |
| **JetBrains Mono** | Teknik Veri / Kod | Tabular-nums desteği, yüksek okunabilirlik. |
| **Space Grotesk** | Arayüz Etiketleri | Geometrik, modern ve net. |

### Global Header Standardı
Tüm modül başlıkları (BACKUP, TERMINAL, SETTINGS vb.) aşağıdaki standartları takip eder:
- **Font:** `font-space`
- **Weight:** `font-black`
- **Size:** `text-2xl`
- **Tracking:** `tracking-[0.2em]`
- **Effect:** `drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]`
- **Color:** `text-white`
- **Metin:** `UPPERCASE`

---

## 5. Görsel Efektler ve Animasyon (Visual Effects & Motion)

### A. Global Efektler
- **Scanlines:** Tüm ekran üzerinde dikey olarak akan, `%5` opaklıkta "tarama çizgileri".
- **CRT Glow:** Aktif metinlerde ve ana ikonlarda hafif bir "glow" (pus) efekti.
- **Laser-Scan:** Üzerine gelinen öğelerin içinden yukarıdan aşağıya akan tek piksellik bir lazer hattı.
- **Technical Grid:** Arka planda sabit duran, %10 opaklıkta kareli teknik ızgara.

### B. Animasyon Standartları
- **Panel Girişleri:** `animate-in fade-in slide-in-from-right-4 duration-300` (Staggered Reveal).
- **Buton Hover:** `transition-all duration-150` (Anında tepki).
- **Loading:** `animate-spin` yerine, teknik `ping` veya `pulse` efektleri ile birleştirilmiş ikonlar.
- **Glitch:** Kritik hata anlarında panel hafifçe titrer ve renk sapması (chromatic aberration) yaşar.

---

## 6. Bileşen Kütüphanesi (Component Library)

### A. HUD_Header (Global Module Header)
Modüllerin en üstünde yer alan standart başlık alanı.
- **Container:** `p-6 border-b border-terminal-green/20`
- **Yapı:** Sol tarafta ikon + başlık, hemen altında açıklayıcı alt metin (subtitle).
- **Subtitle:** `text-[10px] text-white/80 font-mono tracking-widest uppercase`
- **Sağ Alan:** Modüle özgü aksiyonlar veya "About" kartı.

### B. Settings_Dashboard
Tek parça, sidebar'sız yapılandırma ekranı.
- **Layout:** Bento Grid (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6`).
- **Kartlar:** `border border-terminal-green/20 bg-black/40`.
- **Köşeler:** `clip-path` ile kesilmiş köşeler.

### C. Filter_Button (Sidebar Navigation)
Yan menülerde veri filtrelemek için kullanılan, **states (durum)** tabanlı poligonel buton.
*Detaylar v1.8 ile aynı, sadece padding ve hizalama 24px grid ile uyumlu hale getirildi.*

---

## 7. Tailwind Utility Referansı

Tasarım dilini uygulamak için sık kullanılan özel sınıflar:

| Utility | Açıklama |
| :--- | :--- |
| `font-space` | Space Grotesk font ailesi (Başlıklar). |
| `font-mono` | JetBrains Mono font ailesi (Veriler). |
| `tracking-widest` | 0.25em harf aralığı (Etiketler). |
| `p-6` | Global içerik padding standardı (24px). |
| `selection:bg-terminal-green/20` | Metin seçildiğinde neon yeşil vurgu. |
| `drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]` | Header beyaz glow efekti. |

---
*Bu döküman EasyADB kod tabanı için v2.0 standartlarını tanımlar.*
