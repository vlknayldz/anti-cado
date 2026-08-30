# Anti-Çado

Anti-Çado, Windows üzerinde Instagram ve X/Twitter özel mesajlarını Google Chrome arayüzü üzerinden izleyen, fare destekli bir terminal panelidir. Instagram ve X'te birebir sohbet veya grup sohbeti için ayrı kurallar kurulabilir. Her kural **Gönderi** ya da **Metin** yollar.

Uygulama yalnızca Google Chrome kullanır. Parolaları istemez veya ayar dosyasına kaydetmez; oturumlar uygulamaya özel Chrome profilinde tutulur.

> Uygulama platformların web arayüzünü kullandığı için Instagram veya X arayüzü değiştiğinde seçicilerin güncellenmesi gerekebilir. Yoğun otomatik gönderim hesap kısıtlamasına yol açabilir.

## Geliştirici kullanımı

```powershell
npm install
npm test
npm start
```

## Kullanıcı akışı

Uygulama açıldığında tam ekran panel gelir. Kural satırları ve alt düğmeler fareyle tıklanabilir; klavye kısayolları da her zaman kullanılabilir:

- Kural satırına tıklama veya `SPACE`: kuralı seç/seçimi kaldır
- `B`: seçili kuralı başlat
- `K`: seçili çalışan kuralı durdur
- `D`: çalışan tüm kuralları durdur
- `R`: kural listesini yenile
- `M`: klasik kural ekleme/düzenleme menüsünü aç (menüde `ESC` panele geri döner)
- `Q` veya `ESC`: panelden çık

Başlatma, durdurma ve paneli çalışan kurallarla kapatma işlemleri fareyle kullanılabilen **Evet/Hayır** penceresiyle ayrıca onaylanır.

1. **Hesap girişi yap (Instagram / X)** seçilir; platform belirlenir ve açılan Chrome penceresinde bir kez giriş yapılır.
2. **Yeni kural ekle** seçilir.
3. Platform, birebir/grup sohbeti, sohbet adı ve hedef kullanıcı girilir.
4. İçerik türü **Gönderi** veya **Metin** olarak seçilir. Gönderi seçilirse ilgili platformdaki gönderinin bağlantısı girilir.
5. Her yeni hedef mesaj geldiğinde kaç ayrı yanıt gönderileceği belirlenir. Birden fazlaysa yanıtların arasındaki süre saniye olarak girilir.
6. Instagram'da yanıtın gelen mesaja bağlı mı, normal sohbet mesajı mı olacağı seçilir. X özel mesajlarında normal sohbet mesajı kullanılır.
7. Kuralın kaç yeni hedef mesajı işleyeceği girilir: `1` yalnızca ilk yeni mesaj, `2–99998` ilk belirlenen sayıdaki yeni mesaj, `99999` sınırsız yeni mesaj demektir.
8. **Otomasyonu başlat** seçilir. Başlatılacak kurallar `1,3,5` biçiminde çoklu seçilir veya `T` ile tümü seçilir; ardından ek başlatma onayı verilir.
9. Çalışırken `B` ile henüz çalışmayan kurallar sonradan başlatılabilir, `K` ile yalnızca seçilen çalışan kurallar durdurulabilir. `D` veya `ESC` tüm otomasyonu durdurma isteğini açar. Her işlem ek onay ister; onay verilmezse mevcut çalışma sürer.

`99999` kendi kendine sonsuz gönderim başlatmaz. Kural her yeni hedef mesajı yalnızca bir kez işler; örneğin yanıt adedi `3`, işlenecek mesaj `99999` ise hedef kişinin her yeni mesajından sonra üç yanıt gönderilir ve sonra bir sonraki mesaj beklenir.

Tüm menülerde `ESC = geri` bilgisi görünür. Ana menünün altında kayıtlı kurallar sürekli özetlenir. Birden fazla Instagram/X hesabı, birebir sohbet, grup ve hedef kullanıcı için ayrı kurallar eklenebilir.

Aynı platformdaki farklı sohbet kuralları eş zamanlı izlenir. Farklı sohbetlere gönderimler paralel çalışabilir; aynı sohbet içindeki gönderimler mesaj kutusunun karışmaması için sıraya alınır.

Kural düzenlerken önce numaralı kural seçilir. Seçilen kuralın 10 alanı numaralı listelenir; yalnızca seçilen alan değiştirilir. `S` değişiklikleri kaydeder, `ESC` kaydetmeden geri döner.

## Windows paketi

```powershell
npm run package:win
```

Oluşan ZIP başka bir Windows bilgisayara taşınabilir. ZIP açıldıktan sonra `KURULUM.cmd` çalıştırılır. Hedef bilgisayarda Node.js gerekmez; Google Chrome kurulu olmalıdır.
