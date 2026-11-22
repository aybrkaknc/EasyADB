<a id="readme-top"></a>

<p align="center">
  <a href="README.md">English</a>
</p>

[![Katkıda Bulunanlar][contributors-shield]][contributors-url]
[![Fork'lar][forks-shield]][forks-url]
[![Yıldızlar][stars-shield]][stars-url]
[![Sorunlar][issues-shield]][issues-url]



<br />
<div align="center">
  <h3 align="center">EasyADB</h3>

  <p align="center">
    ADB komutu yazmadan Android cihazları ADB üzerinden yedeklemek, geri yüklemek, gereksiz uygulamalardan arındırmak ve yönetmek için masaüstü arayüzü.
    <br />
    <a href="https://github.com/aybrkaknc/EasyADB/issues/new?labels=bug">Hata Bildir</a>
    |
    <a href="https://github.com/aybrkaknc/EasyADB/issues/new?labels=enhancement">Özellik İste</a>
  </p>
</div>



<details>
  <summary>İçindekiler</summary>
  <ol>
    <li>
      <a href="#proje-hakkında">Proje Hakkında</a>
      <ul>
        <li><a href="#kullanılan-teknolojiler">Kullanılan Teknolojiler</a></li>
      </ul>
    </li>
    <li>
      <a href="#başlarken">Başlarken</a>
      <ul>
        <li><a href="#gereksinimler">Gereksinimler</a></li>
        <li><a href="#kurulum">Kurulum</a></li>
      </ul>
    </li>
    <li><a href="#kullanım">Kullanım</a></li>
    <li><a href="#yol-haritası">Yol Haritası</a></li>
    <li><a href="#katkıda-bulunma">Katkıda Bulunma</a></li>
    <li><a href="#lisans">Lisans</a></li>
    <li><a href="#iletişim">İletişim</a></li>
    <li><a href="#teşekkürler">Teşekkürler</a></li>
  </ol>
</details>



## Proje Hakkında

ROM'ları sık sık değiştiriyorum. Telefonu yedeklemek genellikle önce telefona yedek almak (SwiftBackup gibi uygulamalarla) ve sonra büyük dosyaları USB ile bilgisayara kopyalamak demek. EasyADB bu ara adımı ortadan kaldırıyor.

EasyADB ile:
- Uygulamaları ve verileri **doğrudan** bilgisayarınızdaki depolamaya yedekleyebilirsiniz.
- Yedekleri tek tıkla cihaza geri yükleyebilirsiniz.
- Gereksiz uygulamaları kaldırabilir, dosya yükleyebilir ve cihazı arayüzden inceleyebilirsiniz.

<p align="right">(<a href="#readme-top">başa dön</a>)</p>



### Kullanılan Teknolojiler

[![Tauri][tauri-shield]][tauri-url]
[![Rust][rust-shield]][rust-url]
[![React][react-shield]][react-url]
[![TypeScript][typescript-shield]][typescript-url]
[![Vite][vite-shield]][vite-url]

<p align="right">(<a href="#readme-top">başa dön</a>)</p>



## Başlarken

EasyADB'yi yerel olarak çalıştırmak için bu adımları izleyin.

### Gereksinimler

* Node.js (LTS)
  ```sh
  winget install OpenJS.NodeJS.LTS
  ```
* Rust (stable), rustup ile kurulmuş
  ```sh
  winget install Rustlang.Rustup
  ```
* Windows için Tauri 2 gereksinimleri (WebView2 ve MSVC derleme araçları). Ayrıntılar için [Tauri gereksinimleri rehberine](https://v2.tauri.app/start/prerequisites/) bakın.

ADB uygulamanın içine gömülü olduğu için ayrıca kurmanız gerekmez.

### Kurulum

1. Depoyu klonlayın
   ```sh
   git clone https://github.com/aybrkaknc/EasyADB.git
   ```
2. Proje klasörüne girin
   ```sh
   cd EasyADB
   ```
3. NPM paketlerini kurun
   ```sh
   npm install
   ```
4. Uygulamayı geliştirme modunda başlatın
   ```sh
   npm run tauri dev
   ```
5. Sürüm derlemesi oluşturun (isteğe bağlı)
   ```sh
   npm run tauri build
   ```
6. Testleri çalıştırın (isteğe bağlı)
   ```sh
   npm test
   ```

<p align="right">(<a href="#readme-top">başa dön</a>)</p>



## Kullanım

* **Doğrudan Yedekleme ve Geri Yükleme:** APK'ları, bölünmüş APK'ları (App Bundle), OBB dosyalarını ve root erişimi varsa uygulama verilerini doğrudan bilgisayarınıza aktarır. `.easybckp` yedeklerini tek tıkla geri yükleyebilirsiniz.
* **Akıllı Debloater:** Sistem ve kullanıcı paketlerini ayırır, toplu olarak kaldırmanızı veya devre dışı bırakmanızı sağlar, gerektiğinde yeniden etkinleştirir. Güvenlik listesi (UAD-NG temelli), kritik paketlere dokunmadan önce uyarır.
* **Terminal:** Komut geçmişi, kelime önerileri ve paket adı tamamlama özellikleri olan bir ADB terminali.
* **Sideload:** ZIP/OTA/ROM dosyalarını yükler ve APK'ları ilerleme çubuğuyla kurar. Recovery, Sideload ve Bootloader modlarını algılar.
* **Performans ve Donanım:** CPU, RAM ve pil durumunu canlı izler; SoC, ekran ve işletim sistemi bilgilerini gösterir.
* **Akıllı Hata Analizi:** ADB hatalarını anlaşılır açıklamalara ve önerilen çözümlere çevirir.

_Sistem paketlerini kaldırmak cihazınızın çalışmamasına neden olabilir. İşlem yapmadan önce yedek alın ve uyarıları okuyun._

<p align="right">(<a href="#readme-top">başa dön</a>)</p>



## Yol Haritası

- [ ] **Faz 1: Bağlantı ve Dağıtım (sıradaki)**
    - [ ] Kablosuz hata ayıklama sihirbazı (QR kod veya IP ile)
    - [ ] `.exe` ve `.msi` olarak paketleme (taşınabilir mod)
    - [ ] Debloat profillerini içe/dışa aktarma
- [ ] **Faz 2: Dosya Yöneticisi (planlandı)**
    - [ ] Canlı klasör gezintisi
    - [ ] Dosya ve klasör oluşturma, silme, taşıma ve yeniden adlandırma
    - [ ] Sürükle-bırak ile ilerleme takibli gönderme/alma
    - [ ] Resim ve APK dosyaları için önizleme
- [ ] **Faz 3: Sistem Günlüğü (Logcat) Görüntüleyici (planlandı)**
    - [ ] Gerçek zamanlı, sanallaştırılmış log akışı
    - [ ] Seviye ve etikete göre filtreleme
    - [ ] Regex destekli arama ve vurgulama
    - [ ] Oturum dışa aktarma

Önerilen özelliklerin ve bilinen sorunların tam listesi için [açık sorunlara](https://github.com/aybrkaknc/EasyADB/issues) bakın.

<p align="right">(<a href="#readme-top">başa dön</a>)</p>



## Katkıda Bulunma

Katkılarınızı memnuniyetle karşılıyoruz. Bir öneriniz varsa depoyu fork'layıp bir pull request açabilir ya da "enhancement" etiketiyle bir sorun açabilirsiniz.

1. Projeyi Fork'layın
2. Özellik dalınızı oluşturun (`git checkout -b feature/HarikaOzellik`)
3. Değişikliklerinizi commit'leyin (`git commit -m 'Ekle: HarikaOzellik'`)
4. Dalı push'layın (`git push origin feature/HarikaOzellik`)
5. Pull Request açın

<p align="right">(<a href="#readme-top">başa dön</a>)</p>



## Lisans

Bu proje için henüz bir lisans seçilmedi.

<p align="right">(<a href="#readme-top">başa dön</a>)</p>



## İletişim

Ayberk - [@aybrkaknc](https://github.com/aybrkaknc)

Proje Bağlantısı: [https://github.com/aybrkaknc/EasyADB](https://github.com/aybrkaknc/EasyADB)

<p align="right">(<a href="#readme-top">başa dön</a>)</p>



## Teşekkürler

* [Best-README-Template](https://github.com/othneildrew/Best-README-Template) - othneildrew
* [Universal Android Debloater Next Generation](https://github.com/Universal-Debloater-Alliance/universal-android-debloater-next-generation) - debloat güvenlik listesi
* [Tauri](https://tauri.app/), [React](https://react.dev/) ve [Android Platform Tools](https://developer.android.com/tools/releases/platform-tools)

<p align="right">(<a href="#readme-top">başa dön</a>)</p>



<!-- MARKDOWN LINKS AND IMAGES -->
[contributors-shield]: https://img.shields.io/github/contributors/aybrkaknc/EasyADB.svg?style=for-the-badge
[contributors-url]: https://github.com/aybrkaknc/EasyADB/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/aybrkaknc/EasyADB.svg?style=for-the-badge
[forks-url]: https://github.com/aybrkaknc/EasyADB/network/members
[stars-shield]: https://img.shields.io/github/stars/aybrkaknc/EasyADB.svg?style=for-the-badge
[stars-url]: https://github.com/aybrkaknc/EasyADB/stargazers
[issues-shield]: https://img.shields.io/github/issues/aybrkaknc/EasyADB.svg?style=for-the-badge
[issues-url]: https://github.com/aybrkaknc/EasyADB/issues
[tauri-shield]: https://img.shields.io/badge/Tauri_2-24C8DB?style=for-the-badge&logo=tauri&logoColor=white
[tauri-url]: https://tauri.app/
[rust-shield]: https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white
[rust-url]: https://www.rust-lang.org/
[react-shield]: https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[react-url]: https://react.dev/
[typescript-shield]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[typescript-url]: https://www.typescriptlang.org/
[vite-shield]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[vite-url]: https://vitejs.dev/
