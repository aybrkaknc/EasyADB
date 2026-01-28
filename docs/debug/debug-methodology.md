# 🛡️ EasyADB Debug Metodolojisi ve Teknik Standartlar

> **Versiyon:** 1.0  
> **Son Güncelleme:** 28 Ocak 2026

Bu döküman, EasyADB projesinde hata ayıklama (debug), refactoring ve kod geliştirme süreçlerinde uyulması gereken zorunlu teknik standartları ve metodolojileri tanımlar.

---

## 🔬 1. Sistematik Debug Protokolü (4-Faz)

Her debug görevi kesinlikle bu sırayla işletilir:

### Faz 1: Reproduce (Yeniden Üretme)
Hatayı izole bir ortamda tekrar oluşturamıyorsan, düzeltemezsin.
- **Hedef:** Hata senaryosunu adım adım (Step-by-step) belirle.
- **Çıktı:** Manual Test Case.

### Faz 2: Isolate (İzole Etme)
Sorunun kaynağını daralt.
- Frontend mi Backend mi?
- Veri akışında nerede kopuyor?
- **Tool:** `console.log`, `Right Click -> Inspect`, Rust `println!`.

### Faz 3: Understand (Anlama)
Kök nedeni (Root Cause) bul. "Yama" yapma, nedeni çöz.
- **Soru:** "Bu fonksiyon neden bu çıktıyı verdi?"
- **Yöntem:** 5 Whys (5 Neden) analizi.

### Faz 4: Fix & Verify (Düzelt ve Doğrula)
- **Kural:** Önce en küçük, en güvenli düzeltmeyi uygula.
- **Doğrulama:** Faz 1'deki test senaryosunu tekrar çalıştır.

---

## 🚨 2. Öncelik Matrisi (Priority Logic)

Bug'lar ve görevler şu sıraya göre işlenir:

| Seviye | Tanım | Örnek | Aksiyon |
|:---:|-------|-------|---------|
| **🔴 P0** | **Critical / Blocker** | Uygulama çöküyor, veri kaybı, ana özellik çalışmıyor. | **HEMEN** düzeltilmeli. Başka iş yapılmaz. |
| **🟠 P1** | **High / Major** | Özellik çalışıyor ama yanlış çalışıyor veya UX çok kötü. | P0 biter bitmez yapılmalı. |
| **🟡 P2** | **Medium / UX** | Görsel hatalar, eksik bildirimler, kötü isimlendirme. | P1 sonrası planlanır. |
| **🟢 P3** | **Low / Polish** | Kod temizliği, optimizasyon, dokümantasyon, refactor. | Boş zamanlarda veya özellik bitiminde yapılır. |

---

## 🧱 3. Kod ve Mimari Standartları

### A. State Yönetimi
- **Single Source of Truth:** Bir veri (örn: seçili paketler) tek bir hook veya context'te tutulmalı.
- **Custom Hooks:** Business logic asla UI component'i içinde olmamalı. `useBackupOperations` gibi hook'lara taşınmalı.

### B. Hata Yönetimi (Error Handling)
- **Sessiz Hata Yok:** `catch(e) { console.log(e) }` YASAKTIR.
- **Kullanıcı Bildirimi:** Hata varsa kullanıcıya **Alert** veya **Notification** ile bildirilmeli.
- **Global Error Dialog:** Ciddi hatalar `AlertDialog` (Cyberpunk style) ile gösterilmeli.

### C. Tip Güvenliği (TypeScript)
- **No `any`:** `any` tipi kullanımı kesinlikle yasaktır. Her zaman interface/type tanımlanmalı.
- **Sync:** Backend (Rust struct) ve Frontend (TS interface) tipleri senkronize tutulmalı ve üzerine yorum eklenmeli.

### D. Magic Numbers
- Kod içinde anlamsız sayılar (örn: `1024`, `500`) olmamalı. Bunlar `const` olarak isimlendirilmeli.

---

## 🧪 4. Test Standartları

- **Manual Test:** Her P seviyesi düzeltme için kullanıcıya manual bir test adımları sunulmalı.
- **Regression Test:** Refactoring sonrası eski özelliklerin bozulmadığı kontrol edilmeli.

---

## 📝 5. Dokümantasyon

- **CHANGELOG:** Kullanıcıya yansıyan veya mimariyi değiştiren her işlem `CHANGELOG.md` dosyasına işlenmeli.
- **JSDoc/RustDoc:** Karmaşık fonksiyonların üzerine ne yaptığı, parametreleri ve dönüş değerleri yazılmalı.
