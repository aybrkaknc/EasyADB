# EasyADB Yol Haritası

## v0.2.0 (tamamlandı)

Sıfırdan yeniden yazım. Ayrıntılar için [REFACTOR_PLAN.md](REFACTOR_PLAN.md).

- [x] Tek ADB istemcisi, tipli hatalar, üretilen TypeScript tipleri
- [x] Birden fazla cihaz, cihaz seçici, bağlantı rehberi
- [x] Klasör tabanlı hızlı yedekleme, SHA-256, izinlerin yedeklenmesi, toplu geri yükleme, `.easybckp` dışa/içe aktarma
- [x] UAD-NG tabanlı debloat, profiller
- [x] Kablosuz hata ayıklama: eşleştirme kodu, QR, IP, `adb tcpip`
- [x] Canlı çıktılı terminal, sideload, APK kurma
- [x] Dosya yöneticisi, logcat, performans
- [x] İngilizce ve Türkçe arayüz, klavye kısayolları, tepsi, bildirimler
- [x] Sidecar ADB, `.msi` kurulum paketi, CI

## Sonraki sürümler

### Dosya yöneticisi
- [ ] Sürükle-bırak ile yükleme
- [ ] Resim ve APK önizlemeleri

### Logcat
- [ ] Uygulama veya PID filtresi

### Kurulum
- [ ] Bölünmüş ve çoklu APK kurma
- [ ] Sürükle-bırak ile APK/ZIP kurma

### Erişilebilirlik
- [ ] Yüksek kontrast modu

## Fikirler (planlanmadı)

Bu maddeler açıkça istenmeden geliştirmeye alınmaz.

- Wi-Fi (SMB veya FTP) ile alınan yedekleri bilgisayara taşıma
- Daha fazla özelliğe erişim için yardımcı bir Android uygulaması
