# ADB_UI Specification (v1.8) ⚡

> **Kod Adı:** TECHNICAL_COMMAND_HUD
> **Vizyon:** Android ekosistemi için tasarlanmış, askeri sınıf HUD (Heads-Up Display) estetiği ile modern teknik verimliliği birleştiren profesyonel bir tasarım dili.

---

## 1. Tasarım Felsefesi (Philosophy)

ADB_UI, "Safe Harbor" (Güvenli Liman) tasarımlarını (yuvarlak köşeler, pastel renkler, yumuşak gölgeler) reddeder. Onun yerine:
- **Teknik Hassasiyet:** Her piksel bir veri noktasıdır.
- **Acımasız Verimlilik:** Görsellik her zaman işlevselliği ve veri görünürlüğünü destekler.
- **İçgüdüsel Geri Bildirim (Visceral Feedback):** Sistem durumu renk ve hareketle anında kullanıcıya hissettirilir.
- **Unified Headers:** Arama kutusu, sayaçlar ve aksiyon butonları tek bir kompakt "Unified Command Header" satırında birleştirilir.

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

### A. HUD_Panel (Main Container)
Main content area container.
- **Background:** `bg-zinc-950/30`
- **Border:** `border-terminal-green/20`
- **Clip Path:** Yok (Full width) veya sağ alt köşe kesik.

---

### B. Filter_Button (Sidebar Navigation)
Yan menülerde veri filtrelemek için kullanılan, **states (durum)** tabanlı poligonel buton.

**Clip-Path Geometrisi:**
```css
clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
/* Sol alt ve sağ üst köşeler 8px içeri kesilir */
```

**Varyasyonlar (Variants):**

#### 1. Standard Variant (User Apps / All / Disabled)
Güvenli ve standart işlemler için kullanılır.
- **Base Style:** `bg-transparent border-transparent text-zinc-500`
- **Hover State:** `hover:bg-white/5 hover:border-white/10 hover:text-zinc-300`
- **Active State:** 
  - Bg/Border: `bg-terminal-green/10 border-terminal-green/50`
  - Text: `text-white`
  - Icon: `text-terminal-green`
  - Count Badge: `text-terminal-green`
  - **Effect:** Buton içinde `%10` opaklıkta, yukarıdan aşağı akan yeşil `bg-terminal-green` scanline overlay.

#### 2. Danger Variant (System Apps)
Riskli sistem bileşenlerini filtrelerken kullanıcıyı uyarmak için kullanılır.
- **Active State:**
  - Bg/Border: `bg-red-950/30 border-red-500/50`
  - Text: `text-red-100`
  - Icon: `text-red-500`
  - Count Badge: `text-red-400`
  - **Effect:** Buton içinde `%10` opaklıkta, yukarıdan aşağı akan kırmızı `bg-red-500` scanline overlay.

**Micro-Interactions:**
- **Icon Hover:** Buton tamamına değil, sadece üzerine gelindiğinde ikonun rengi `zinc-600` > `zinc-400` geçişi yapar (pasif durumlarda).
- **Click:** Tıklandığı an `border-opacity` anlık olarak `%100` olur.

---

### C. Unified_Command_Header
Listelerin üzerinde yer alan, 3 bölümlü kompakt kontrol satırı.

- **Yapı:** `flex items-center justify-between p-4 border-b border-terminal-green/20 bg-zinc-950/20`
- **Sol (Stats):** Modül ikonu + Başlık + Sayaç (Örn: `TOTAL PKGS 145`).
- **Sağ (Actions):** `Select All` butonu (Checkbox) + `Refresh` butonu.

---

### D. System_Warning_Modal
Kritik işlemler için tam ekran kalkanı.

- **Overlay:** `absolute inset-0 z-50 bg-black/80 backdrop-blur-sm`
- **Card:** `bg-zinc-950 border border-red-500/50 p-6 shadow-[0_0_50px_rgba(239,68,68,0.2)]`
- **Top Bar:** Kartın en üstünde 4px kalınlığında `bg-red-500` şeridi.
- **Animation:** `animate-in fade-in duration-200` + İkon üzerinde `animate-pulse`.

---

### E. List_Item (Package/File Row)
Veri listelemek için kullanılan satır bileşeni.

- **Container:** `flex items-center p-3 mb-1 border border-transparent hover:border-terminal-green/20 hover:bg-white/5 transition-all cursor-pointer group select-none`
- **Selected State:** `bg-terminal-green/5 border-terminal-green/30`
- **Checkbox:** 
  - Pasif: `border-zinc-700 group-hover:border-terminal-green/50`
  - Aktif: `border-terminal-green bg-terminal-green` (İçinde siyah tik işareti).

---

## 7. Tailwind Utility Referansı

Tasarım dilini uygulamak için sık kullanılan özel sınıflar:

| Utility | Açıklama |
| :--- | :--- |
| `font-space` | Space Grotesk font ailesi (Başlıklar). |
| `font-mono` | JetBrains Mono font ailesi (Veriler). |
| `tracking-widest` | 0.25em harf aralığı (Etiketler). |
| `scrollbar-thin` | İnce kaydırma çubuğu. |
| `selection:bg-terminal-green/20` | Metin seçildiğinde neon yeşil vurgu. |
| `drop-shadow-[0_0_8px_rgba(0,255,65,0.6)]` | Neon glow efekti. |

---
*Bu döküman EasyADB kod tabanı için v1.8 standartlarını tanımlar.*
