# ADB_UI Specification (v1.0) ⚡

> **Kod Adı:** TERMINAL_COMMAND_HUD
> **Vizyon:** Android ekosistemi için tasarlanmış, askeri sınıf HUD (Heads-Up Display) estetiği ile modern teknik verimliliği birleştiren radikal bir tasarım dili.

---

## 1. Tasarım Felsefesi (Philosophy)

ADB_UI, "Safe Harbor" (Güvenli Liman) tasarımlarını (yuvarlak köşeler, pastel renkler, yumuşak gölgeler) reddeder. Onun yerine:
- **Teknik Hassasiyet:** Her piksel bir veri noktasıdır.
- **Acımasız Verimlilik:** Görsellik her zaman işlevselliği ve veri görünürlüğünü destekler.
- **İçgüdüsel Geri Bildirim (Visceral Feedback):** Sistem durumu renk ve hareketle anında kullanıcıya hissettirilir.

---

## 2. Renk Sistemi (Color Palette)

| Kategorisi | İsim | HEX | Fonksiyon |
| :--- | :--- | :--- | :--- |
| **Ana Renk** | Neon Green | `#00FF41` | Standart durumlar, başarılar, ana hatlar. |
| **Vurgu** | Acid Green | `#AAFF00` | Etkileşimli öğeler (hover), seçili durumlar. |
| **Kritik** | Signal Red | `#FF3131` | Hatalar, kritik pil, tehlikeli modüller. |
| **Uyarı** | Heat Orange | `#FFD700` | Yüksek sıcaklık, orta riskli işlemler. |
| **Arka Plan** | Pure Black | `#000000` | Ana gövde. |
| **Derinlik** | Slate 950 | `#020617` | Kartlar ve panel içi alanlar. |

---

## 3. Geometri ve Yapı (Geometry)

ADB_UI standart "kart" görünümünü de-fragmante eder.

- **Köşeler:** Standart `border-radius` kullanımı kesinlikle yasaktır (0px).
- **Clipped Corners:** Panel ve butonlarda sağ üst ve sol alt köşeler `calc(100% - 12px)` oranında 45 derece kesilir.
- **Grid System:** Tüm arayüz 40x40 piksellik bir teknik ızgara üzerine oturur.
- **Borders:** Çerçeveler 1px kalınlığında ve `%20-30` opaklığında olmalıdır. Hover anında opaklık `%100`'e çıkar.

---

## 4. Tipografi (Typography)

| Font | Kullanım | Karakteristik |
| :--- | :--- | :--- |
| **JetBrains Mono** | Teknik Veri / Kod | Tabular-nums desteği, yüksek okunabilirlik. |
| **Space Grotesk** | Arayüz Etiketleri | Geometrik, modern ve net. |

- **Yazım Kuralı:** Tüm başlıklar ve etiketler `UPPERCASE` ve `tracking-widest` (geniş karakter aralığı) ile yazılır.

---

## 5. Görsel Efektler ve Derinlik (Visual Effects)

- **Scanlines:** Tüm ekran üzerinde dikey olarak akan, `%5` opaklıkta "tarama çizgileri".
- **CRT Glow:** Aktif metinlerde ve ana ikonlarda hafif bir "glow" (pus) efekti.
- **Laser-Scan:** Üzerine gelinen öğelerin içinden yukarıdan aşağıya akan tek piksellik bir lazer hattı.
- **Technical Grid:** Arka planda sabit duran, `%10` opaklıkta kareli teknik ızgara.

---

## 6. Animasyon Dili (Motion Graphics)

- **Giriş:** Tüm paneller "staggered reveal" (birbirini izleyen) şekilde, `spring` fiziği ile sahneye girer.
- **Glitch:** Kritik hata anlarında panel hafifçe titrer ve renk sapması (chromatic aberration) yaşar.
- **Pulse:** Canlı veri akışını temsil eden `ping` efektli durum ışıkları.

---

## 7. Bileşen Standartları (Components)

### A. HUD_Panel
Sağa doğru açılan ve köşeleri kesik, çerçevesi parlayan ana konteynerler.
### B. Bit-Indicator
Veri doluluğunu gösteren, bölünmüş 12-24 piksellik led çubuk tarzı barlar.
### C. Action_Rail
İkonların dikey olarak dizildiği, aktif öğenin solunda parlayan bir çizgi bırakan navigasyon çubuğu.

---
*Bu döküman EasyADB tasarım standartlarının mutlak rehberidir.*

## 8. Görsel Mükemmeliyet ve Tipografi (Visual Excellence)

### A. Yüksek Kaliteli Metin İşleme (Text Rendering)
- **Global Reset:** Tüm metinlerde `text-rendering: optimizeLegibility` kullanılmalıdır.
- **Yumuşatma:** Siyah arka plan üzerinde metinlerin keskinliğini korumak için `-webkit-font-smoothing: antialiased` zorunludur.
- **Kontrast Kuralı:** "Ölü Griler"den (örn: `white/20`) kaçınılmalıdır. Bunun yerine "Neon Tinted" (örn: `terminal-green/60`) veya yüksek kontrastlı `zinc-500` tercih edilmelidir.

### B. Hiyerarşik Kontrast (HUD Rule)
- **Birincil Veriler:** Saf beyaz veya parlak yeşil (#00ff41) kullanılmalı ve hafif bir `drop-shadow` (glow) ile vurgulanmalıdır.
- **İkincil Etiketler:** Opaklık %50-60 aralığında tutulmalıdır.
- **Karakter Aralığı:** Küçük fontlarda (9px-11px) karakterlerin birbirine girmemesi için `tracking-widest` (0.2em+) kullanılmalıdır.

### C. Katmanlı Paneller (Depth)
- **Arka Planlar:** Kartlar ve yan menüler `bg-zinc-950/40` gibi hafif tonlarla ana siyah zeminden (pure black) fiziksel olarak ayrılmalıdır.
- **Sınırlar (Borders):** Etkileşimli öğeler hover anında `terminal-green/20` seviyesinden `terminal-green/60` seviyesine yumuşak bir geçiş sağlamalıdır.
