# 🔍 Logcat Analiz Paneli Uygulama Planı

Bu modül, Android cihazdan gelen sistem loglarını gerçek zamanlı olarak izleme, filtreleme ve analiz etme imkanı sağlayacak.

## 1. Mimari Yapı ve Gereksinimler

### **A. Backend (Rust/Tauri)**
- **`stream_logcat`**: `adb logcat` komutunu sürekli bir stream olarak çalıştıran ve her satırı Tauri eventleri üzerinden frontend'e ileten yapı.
- **`logcat_control`**: Log akışını durdurma (pause), devam ettirme (resume) ve buffer'ı temizleme (clear) komutları.
- **`logcat_export`**: Mevcut log buffer'ını bir `.txt` veya `.log` dosyası olarak bilgisayara kaydetme.

### **B. Frontend (React + Tailwind)**
- **`LogcatModule.tsx`**: Ana izleme ekranı.
- **`useLogcat.ts`**: Log buffer'ını yöneten, filtreleme mantığını yürüten ve performans optimizasyonlarını (virtual list) içeren custom hook.
- **UI Bileşenleri**:
    - **LogStream**: Yüksek performanslı, renk kodlu log satırları.
    - **LevelFilter**: Verbose, Debug, Info, Warning, Error seviyelerine göre anlık filtreleme.
    - **SearchBox**: Loglar içinde regex veya düz metin arama.
    - **ControlBar**: Play/Pause, Clear, Export ve Autoscroll butonları.

---

## 2. Uygulama Aşamaları (Fazlar)

### **Faz 1: Gerçek Zamanlı Akış (Streaming)**
- `adb logcat` çıktısını Tauri üzerinden React state'ine bağlama.
- Log satırlarını parse ederek zaman damgası, PID, Tag ve Mesaj bloklarına ayırma.
- Performans için `react-window` veya benzeri bir "virtualized list" yapısı kurma (binlerce satır log için kritik).

### **Faz 2: Filtreleme ve Renklendirme**
- Log seviyelerine göre (örn: Error = Kırmızı, Warning = Sarı) renklendirme.
- Sol tarafta hızlı Tag filtreleme listesi.
- Belirli bir pakete (Package Name) göre logları izole etme özelliği.

### **Faz 3: Arama ve Analiz**
- Regex desteği ile anlık arama ve eşleşen kelimelerin vurgulanması (highlight).
- Log satırına tıklandığında detaylı görünüm (Stacktrace analizi için).

### **Faz 4: Kayıt ve Dışa Aktarma**
- İzleme sırasında logları arka planda bir dosyaya yazma (Live Logging).
- Mevcut görünümü dışa aktarma.

---

## 3. Teknik Zorluklar ve Çözümler
- **Performans**: Saniyede yüzlerce satır log gelebilir. Çözüm: Virtualized list kullanmak ve state güncellemelerini debounce etmek.
- **Buffer Yönetimi**: Hafızayı şişirmemek için maksimum satır sayısı (örn: 5000 satır) sınırı koymak ve eski logları otomatik temizlemek.
