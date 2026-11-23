# Security Policy / Güvenlik Politikası

## Supported versions

Only the latest release receives security fixes.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private reporting instead: open the [Security tab](https://github.com/aybrkaknc/EasyADB/security) of this repository and choose **Report a vulnerability**. Include the version, steps to reproduce and the impact you expect.

You will get an answer within seven days. Once a fix is released, the report is published with credit unless you prefer to stay anonymous.

Areas of special interest:

* Command injection into the device shell or the host
* Path traversal when importing or restoring backups
* Unsafe handling of backup files (tampered manifests, unexpected paths)

---

## Desteklenen sürümler

Güvenlik düzeltmeleri yalnızca en son sürüme gelir.

## Güvenlik açığı bildirme

Lütfen herkese açık bir issue açmayın. Bunun yerine GitHub'ın gizli bildirim özelliğini kullanın: bu deponun [Security sekmesini](https://github.com/aybrkaknc/EasyADB/security) açın ve **Report a vulnerability** seçeneğini seçin. Sürümü, yeniden üretme adımlarını ve beklediğiniz etkiyi yazın.

Yedi gün içinde yanıt alırsınız. Düzeltme yayınlandığında, anonim kalmak istemediğiniz sürece bildirim sizin adınızla yayınlanır.

Özellikle ilgilendiğimiz alanlar:

* Cihaz kabuğuna veya bilgisayara komut enjeksiyonu
* Yedek içe aktarırken veya geri yüklerken yol geçişi (path traversal)
* Yedek dosyalarının güvensiz işlenmesi (değiştirilmiş manifest, beklenmeyen yollar)
