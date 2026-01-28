# Faz 4a: Gelişmiş Komut Geçmişi - Uygulama Raporu

## 1. Mevcut Durum Analizi

### İlgili Dosyalar
- **Logic:** `src/hooks/useTerminal.ts`
- **UI:** `src/components/modules/TerminalModule.tsx`

### Tespit Edilen Eksiklikler
1.  **Eksik Input Log:** Sistem şu anda sadece çıktıları (Output Log) tutuyor. Kullanıcının yazdığı komutları (Input History) saklayan ayrı bir mekanizma yok.
2.  **Navigasyon Yok:** Standart terminallerde olan `Yukarı/Aşağı` ok tuşları ile geçmişte gezinme özelliği kodlanmamış.
3.  **Kalıcılık Yok:** Tarayıcı yenilendiğinde veya uygulama kapatıldığında geçmiş siliniyor (State tabanlı).
4.  **UX Çakışması:** `ArrowDown` (Aşağı Ok) tuşu şu anda "Otomatik Tamamlama" (Autocomplete) için kullanılıyor. Bu durum, standart terminal alışkanlıklarına (Aşağı ok ile son komuta dönme) ters düşüyor.

---

## 2. Hedeflenen Özellikler

- **Kalıcı Geçmiş (Persistency):** Uygulama kapatılıp açılsa bile son yazılan komutlar hatırlanmalı (`localStorage`).
- **Navigasyon:** `ArrowUp` ile önceki komuta, `ArrowDown` ile sonraki komuta geçiş yapılabilmeli.
- **Akıllı Yönetim:** Boş komutlar veya peş peşe yazılan aynı komutlar geçmişi kirletmemeli.
- **Global Geçmiş:** Sekmeler arası ortak bir komut geçmişi kullanılmalı (Bash history mantığı).

---

## 3. Uygulama Planı

### Adım 1: Backend Logic (`useTerminal.ts`)
- `commandHistory` adında yeni bir state eklenecek (`string[]`).
- `localStorage` entegrasyonu ile bu liste senkronize edilecek (Sayfa yenilense de veri kalacak).
- `addToHistory(cmd)` fonksiyonu:
    - Yeni komutu listenin başına ekler.
    - Mükerrer (duplicate) kayıtları engeller.
    - Maksimum 50 komutluk bir sınır koyar.

### Adım 2: Frontend UI (`TerminalModule.tsx`)
- `historyPointer` state'i eklenecek (Geçmişte nerede olduğumuzu tutan sayaç).
- `handleKeyDown` fonksiyonu güncellenecek:
    - **ArrowUp:** Pointer'ı artırır -> Input'a geçmişteki ilgili komutu yazar.
    - **ArrowDown:** Pointer'ı azaltır -> Input'a daha yeni komutu yazar veya temizler.
    - **Tab / ArrowRight:** Mevcut `ArrowDown` (Autocomplete) özelliği bu tuşlara taşınacak.

---

## 4. Önerilen Tuş Atamaları (Key Bindings)

| Tuş | Mevcut İşlev | Yeni/Önerilen İşlev |
| :--- | :--- | :--- |
| **Arrow Up (Yukarı)** | (Yok) | **Önceki Komut** (History Back) |
| **Arrow Down (Aşağı)** | Autocomplete | **Sonraki Komut** (History Forward) |
| **Tab** | (Yok) | **Autocomplete** (Ghost Text Tamamlama) |
| **Arrow Right (Sağ)** | İmleç Hareketi | **Autocomplete** (Alternatif) |

---

## 5. Onay Bekleyen Konular
Kodlamaya başlamadan önce şu konularda onayınız beklenmektedir:
1.  Otomatik tamamlama (Ghost text) için `Tab` tuşuna geçiş uygun mudur?
2.  Komut geçmişi limiti 50 adet yeterli midir?
