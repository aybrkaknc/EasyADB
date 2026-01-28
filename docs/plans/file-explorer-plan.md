# 📂 Dosya Gezgini (File Explorer) Uygulama Planı

Bu modül, kullanıcının cihazdaki dosyaları bir Windows Gezgini rahatlığıyla yönetmesini sağlayacak.

## 1. Mimari Yapı ve Gereksinimler

### **A. Backend (Rust/Tauri)**
Mevcut ADB mekanizmamızı kullanarak yeni komutlar ekleyeceğiz:
- **`list_files`**: `ls -la` komutunu parse ederek dosya izinleri, sahibi, boyutu ve tarihini döndüren fonksiyon.
- **`transfer_file`**: `adb push` ve `adb pull` işlemlerini yürüten, ilerleme durumunu (progress) frontend'e raporlayan stream yapısı.
- **`shell_exec`**: Klasör oluşturma (`mkdir`), silme (`rm -rf`), taşıma (`mv`) ve izin değiştirme (`chmod`) gibi işlemler.

### **B. Frontend (React + Tailwind)**
- **`FileExplorerModule.tsx`**: Ana bileşen.
- **`useFileExplorer.ts`**: Navigasyon geçmişini, mevcut dizini (CWD) ve dosya listesini yöneten custom hook.
- **UI Bileşenleri**:
    - **Breadcrumbs**: `/sdcard/Download/` gibi dizinler arası hızlı geçiş.
    - **FileTable**: Dosya tipi ikonları (Image, Video, APK, Folder).
    - **ActionToolbar**: Yeni klasör, Yenile, Yükle/İndir butonları.
    - **TransferHUD**: Dosya transferi sırasında altta beliren progress bar.

---

## 2. Uygulama Aşamaları (Fazlar)

### **Faz 1: Navigasyon ve Listeleme (Temel Ekosistem)**
- Cihazın `/sdcard/` dizinini varsayılan olarak aç.
- Klasörlere çift tıklayarak içeri girme ve geri gelme mantığı.
- Dosya boyutu ve tarihlerini insan tarafından okunabilir (human-readable) formata dönüştür.

### **Faz 2: Dosya İşlemleri (Modifikasyon)**
- **Dosya Silme**: Silme işleminden önce onay kutusu.
- **Dosya/Klasör Yeniden Adlandırma**: Inline edit desteği.
- **Yeni Klasör**: Hızlı klasör oluşturma.

### **Faz 3: Veri Transferi (Push & Pull)**
- **Sürükle-Bırak (Drag & Drop)**: Bilgisayardan dosyayı explorer'a bırakınca otomatik `adb push`.
- **İndirme (Pull)**: Dosyaya sağ tıklayıp PC'ye kaydetme.
- **Progress Monitoring**: Büyük dosyalarda transfer yüzdesini gösterme.

### **Faz 4: UI/UX ve Performans**
- **Grid/List Görünümü**: Galeri hissi için ızgara görünümü.
- **Hızlı Arama**: Mevcut klasör içinde anlık filtreleme.
- **Mime-type Tanıma**: APK'lar için özel ikon, resimler için (mümkünse) ufak önizlemeler.
