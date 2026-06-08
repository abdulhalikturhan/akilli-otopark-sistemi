# Akıllı Otopark Yönetim Sistemi
Bu proje, "Programlama 2" dersi dönem projesi için geliştirilmiş, Nesne Yönelimli Programlama (OOP) prensiplerini merkeze alan bir Python konsol uygulamasıdır. Herhangi bir grafik arayüzü (GUI) veya web kütüphanesi kullanılmadan tamamen terminal üzerinden çalışmaktadır.

## Geliştiriciler
- **Abdülhalik Turhan**
- **Emirhan Çelik**
- **Miraç Kağan Toprak**

---
## Projenin Amacı ve Özellikleri
Akıllı Otopark Yönetim Sistemi, farklı tiplerdeki araçları otoparka kabul eden, içeride kalınan süreye göre fiyatlandırmayı aracın tipine ve tarifesine göre **dinamik bir şekilde** hesaplayan ve tüm bu işlemleri JSON formatında dosyalayarak (veri kalıcılığını sağlayarak) çalışan bir yazılımdır.

## Uygulanan OOP Prensipleri
Bu projede puanlama kriterlerindeki en önemli kısım olan OOP'nin temel 4 prensibi de kod içerisine entegre edilmiş olup ilgili yorum satırlarıyla detaylandırılmıştır:

1. **Soyutlama (Abstraction):**
   - `Arac` isimli soyut bir temel sınıf (Base Class) oluşturulmuştur. Otoparka fiziksel olarak "araç" diye bir konsept park edemez; Otomobil, Motosiklet veya Ticari Araç park eder. Bu nedenle `Arac` sınıfından doğrudan nesne üretimi yapılmaz.
   - `abc` modülü (Abstract Base Class) kullanılarak, `ucret_hesapla()` metodu soyut metot yapılmış ve alt sınıfların bu metodu kendi içlerinde tanımlamaları zorunlu kılınmıştır.

2. **Kalıtım (Inheritance):**
   - `Otomobil`, `Motosiklet` ve `TicariArac` sınıfları (alt sınıflar), temel `Arac` sınıfından miras alır. Böylece plaka ve giriş zamanı gibi ortak özellikler tekrara düşülmeden ana sınıftan otomatik devralınmıştır.

3. **Çok Biçimlilik (Polymorphism):**
   - Araçlar çıkış yaparken çağrılan `ucret_hesapla()` fonksiyonu her sınıfta farklı davranır.
   - Otomobil için hesaplama: **20 TL** / saat
   - Motosiklet için hesaplama: **10 TL** / saat
   - Ticari Araç için hesaplama: **35 TL** / saat
   - Otopark yönetim sınıfı, çıkış yapan aracın cinsini if-else bloklarıyla kontrol etmek yerine sadece `arac.ucret_hesapla(saat)` metodunu çağırır, doğasını sınıfların kendisi halleder.

4. **Kapsülleme (Encapsulation):**
   - Kod güvenliği için `Arac` içerisindeki plaka verisi (`__plaka`) ve `O
