# Anti-Çado — Proje ve Devir Raporu

**Rapor tarihi:** 30 Ağustos 2026  
**Proje sürümü:** `0.6.5`  
**Proje klasörü:** `C:\Users\kullanici\Documents\AyyildizWorkspace\projects\anti-cado`  
**Durum:** Geliştirmeye devam edilebilir temiz kaynak kopyası

## 1. Kısa özet

Anti-Çado, Windows üzerinde Google Chrome'u kontrol ederek Instagram ve X/Twitter özel mesajlarını izleyen, belirlenen kullanıcıdan yeni mesaj geldiğinde önceden tanımlanmış metni veya gönderi bağlantısını otomatik gönderen bir Node.js terminal uygulamasıdır.

Uygulamanın iki kullanım yüzü vardır:

- Varsayılan açılışta fare ve klavye destekli tam ekran terminal paneli.
- Kural ekleme ve ayrıntılı düzenleme için klasik, soru-cevap biçimindeki CLI menüsü.

Mevcut sürümde:

- Instagram ve X/Twitter desteklenir.
- Birebir ve grup sohbetleri için kural oluşturulabilir.
- Hedef kullanıcı, sohbet ve platform kural başına seçilir.
- Yanıt içeriği düz metin veya ilgili platformdaki gönderi bağlantısı olabilir.
- Instagram'da normal mesaj veya gelen mesaja bağlı yanıt seçilebilir.
- X/Twitter'da gönderim normal özel mesaj olarak yapılır.
- Bir gelen mesaj için bir veya birden fazla ayrı yanıt gönderilebilir.
- Kuralın işleyeceği yeni mesaj sayısı sınırlandırılabilir; `99999` sınırsız yeni mesaj anlamına gelir.
- Birden fazla kural seçilerek birlikte başlatılabilir; çalışan kurallar tek tek durdurulabilir veya sonradan yeni kural başlatılabilir.
- Başlatma, durdurma ve çalışan paneli kapatma işlemlerinde ek onay alınır.
- Aynı kaynak mesaj tekrar tekrar işlenmez.

Bu klasör bir geliştirme/devir kopyasıdır. `node_modules`, üretilmiş `dist` paketi ve kullanıcının giriş yapmış Chrome profili bilinçli olarak klasöre alınmamıştır.

## 2. Yapılan çalışmaların gelişim özeti

Proje ilk olarak tek bir Instagram grup konuşmasında tek kullanıcıyı izleyip sabit bir gönderi gönderen basit otomasyon olarak başladı. Kullanım sırasında görülen sorunlara göre adım adım genişletildi:

1. Belirli bir kullanıcının her yeni mesajını izleme eklendi.
2. Aynı gönderiyi her tetiklemede üç ayrı mesaj olarak gönderme destekledi.
3. “Sınırsız” davranışının kendi kendine gönderim döngüsü olmadığı, yalnızca sınırsız sayıda **yeni gelen mesajı** beklediği model kuruldu.
4. Aynı kaynak mesajın tekrar algılanıp tekrar yanıtlanmasını engelleyen imza/tekilleştirme mekanizması eklendi.
5. Birebir ve grup sohbetleri ayrıldı; sohbet adı ve hedef kullanıcı kullanıcı tarafından girilebilir hale geldi.
6. Birden fazla Instagram kuralı ve ardından X/Twitter özel mesaj kuralları eklendi.
7. Yanıt içeriği “Gönderi” veya “Metin” olarak seçilebilir hale getirildi.
8. Instagram için gelen mesaja bağlı yanıt ile normal sohbet mesajı seçeneği eklendi.
9. Kural başına yanıt adedi, yanıtlar arası süre ve işlenecek mesaj sayısı ayrı alanlara dönüştürüldü.
10. Menülerin tamamında `ESC` ile geri dönüş, altta sürekli kural özeti ve alan bazında düzenleme eklendi.
11. Çalışma sırasında başka kural başlatma, seçili kuralı durdurma ve tümünü durdurma eklendi.
12. Başlatma/durdurma işlemleri için yanlış tıklamayı önleyen onay pencereleri eklendi.
13. Fare destekli tam ekran terminal paneli yapıldı.
14. Uygulama adı önce Anticado, sonra Anti-Çado olarak güncellendi.
15. Windows için Node.js içeren taşınabilir paket ve masaüstü kısayolu oluşturan kurulum betiği hazırlandı.
16. Fenerbahçe görseli için birkaç terminal yaklaşımı denendi. Son durumda JPEG/SIXEL kullanılmıyor; sağ üstte küçük ve sabit boyutlu, ANSI renkleri ve yarım blok karakterleriyle çizilmiş sarı-lacivert CLI amblemi bulunuyor.
17. Kaynaklar `AyyildizWorkspace\projects\anti-cado` klasörüne temiz biçimde aktarıldı. Aktarım sırasında 24 proje dosyasının kaynakla içerik karmaları eşleşti; bu rapor sonradan eklenmiştir.

## 3. Uygulama şu anda nasıl çalışıyor?

### 3.1 Genel çalışma akışı

```text
Kayıtlı kurallar
      ↓
Kullanıcı panelde çalışacak kuralları seçer ve onaylar
      ↓
Uygulama ayrı Chrome profiliyle Chrome'u CDP üzerinden açar
      ↓
Her sohbet için bir Chrome sekmesi açılır veya mevcut sekme paylaşılır
      ↓
Sayfadaki yeni mesajlar MutationObserver ile izlenir
      ↓
Yaklaşık her 750 ms'de yeni olay kuyruğu okunur
      ↓
Gönderen kullanıcı ve sohbetle eşleşen kurallar bulunur
      ↓
Olay imzası daha önce işlenmediyse kural kuyruğa alınır
      ↓
Metin veya bağlantı, ayarlanan adet ve aralıkla gönderilir
```

Chrome, `--remote-debugging-port` ve uygulamaya özel `--user-data-dir` ile başlatılır. Kod, Playwright'ın kendi Chromium'unu indirmez; bilgisayarda kurulu **Google Chrome** uygulamasına `playwright-core` ile bağlanır.

### 3.2 Yeni mesaj algılama

- Sohbet açıldığında sayfada zaten bulunan mesajlar ilk taramada yalnızca başlangıç durumu olarak işaretlenir; otomasyon eski mesajları topluca yanıtlamaz.
- Instagram ve X için ayrı DOM izleyicileri vardır.
- İzleyici, sayfaya eklenen mesaj satırlarını `MutationObserver` ile takip eder.
- Her mesaj için gönderen, metin, zaman/erişilebilirlik etiketleri ve varsa medya bağlantıları kullanılarak bir imza oluşturulur.
- Aynı içeriğe sahip iki ayrı mesajı ayırabilmek için görünüm içindeki tekrar sırası (`occurrence`) imzaya eklenir.
- Uygulama içindeki `RuleRunner` da ikinci bir tekilleştirme katmanı uygular; aynı imzayı aynı kural için yeniden çalıştırmaz.
- X birebir sohbette sağ taraftaki/gönderilmiş mesaj satırları hedef mesaj kabul edilmez.

Bu yaklaşım web arayüzünün mevcut DOM yapısına bağlıdır. Instagram veya X HTML yapısını değiştirdiğinde seçicilerin ve gönderen tespitinin yeniden uyarlanması gerekebilir.

### 3.3 Yanıt gönderme

- Kural “Metin” ise girilen metin, “Gönderi” ise doğrulanmış Instagram veya X/Twitter bağlantısı mesaj kutusuna yazılır.
- Instagram'da normal mesaj seçildiyse doğrudan gönderilir.
- Instagram'da bağlı yanıt seçildiyse kaynak mesaj satırı bulunur, üzerine gelinir, `Yanıtla/Reply` düğmesine basılır ve sonra içerik gönderilir.
- X/Twitter'da gönderim düğmesi bulunursa tıklanır; bulunamazsa `Enter` kullanılır.
- Mesaj kutusunda kullanıcı tarafından yazılmış bir taslak varsa otomasyon taslağı ezmez ve gönderimi hata ile durdurur.
- Gönderimden sonra mesaj kutusunda aynı içerik kalmışsa işlem doğrulanmamış sayılır ve hata kaydına yazılır.
- Bir tetiklemede birden fazla yanıt seçilmişse bunlar **ayrı mesajlar** halinde, belirlenen saniye aralığıyla gider.

### 3.4 Tekrar ayarlarının kesin anlamı

Uygulamada iki farklı sayı vardır; bunların birbirine karıştırılmaması gerekir:

| Alan | Anlamı | Örnek |
|---|---|---|
| Yanıt adedi (`copiesPerTrigger`) | Tek bir yeni hedef mesaj geldiğinde kaç ayrı cevap gönderileceği | `3` = o mesaja karşılık üç ayrı mesaj |
| İşlenecek mesaj (`repeatCount`) | Bu kuralın kaç farklı yeni hedef mesajı işleyeceği | `5` = hedef kişinin ilk beş yeni mesajını işle |

İşlenecek mesaj değerleri:

- `1`: Yalnızca ilk yeni hedef mesaj.
- `2–99998`: Belirtilen sayıda yeni hedef mesaj.
- `99999`: Kullanıcı kuralı durdurana kadar gelen sınırsız sayıda yeni hedef mesaj.

`99999`, mesaj gelmeden sürekli gönderim yapmak anlamına gelmez. Örneğin:

```text
Yanıt adedi: 3
İşlenecek mesaj: 99999
```

Bu ayar hedef kullanıcının **her yeni mesajında üç ayrı cevap** gönderir, sonra yeni bir hedef mesaj bekler. Kendi kendine sonsuz mesaj döngüsü oluşturmaz.

### 3.5 Eşzamanlı kurallar

- Kural anahtarı platform + sohbet türü + sohbet adına göre oluşturulur.
- Farklı sohbetler ayrı Chrome sekmelerinde izlenebilir ve gönderimleri paralel ilerleyebilir.
- Aynı sohbet için sonradan başlatılan kurallar mevcut sekmeye eklenir.
- Aynı sohbet içindeki gönderimler tek mesaj kutusunu karıştırmamak için sıraya alınır.
- Panelde her kuralın aktif/pasif çalışma durumu ayrı tutulur.
- Bir kural durdurulduğunda bekleyen sonraki kopyaları iptal edilir.
- Durdurulan kural yeniden başlatılırsa olay sayacı ve görülmüş olay kümesi o çalışma için sıfırlanır.

Operasyonel ayrıntı: Yalnızca seçili kurallar `K` ile durdurulduğunda Chrome oturumu hemen kapanmaz. `D` ile tümünü durdurmak veya panelden çıkmak oturumu tamamen kapatır. Bu, sonraki kuralı hızlı başlatmayı kolaylaştırır; ileride “aktif kural kalmadığında otomatik kapat” seçeneği eklenebilir.

## 4. Kullanıcı arayüzü

### 4.1 Fareli panel

`npm start` veya `node src/app.js` varsayılan olarak tam ekran paneli açar.

Panelde:

- Üst solda uygulama adı ve açıklama,
- Üst sağda 22 × 18 sanal pikselden üretilen küçük CLI Fenerbahçe amblemi,
- Ortada çalışan/seçili/toplam kural sayıları,
- Kural listesi,
- Altta canlı işlem günlüğü,
- En altta fareyle tıklanabilen komut düğmeleri bulunur.

Kısayollar:

| Fare/tuş | İşlem |
|---|---|
| Kural satırına tıklama / `SPACE` / `Enter` | Kuralı seç veya seçimi kaldır |
| `B` | Seçili ve açık kuralları başlat |
| `K` | Seçili çalışan kuralları durdur |
| `D` | Tüm çalışan kuralları durdur ve Chrome'u kapat |
| `R` | Kuralları ayar dosyasından yeniden yükle |
| `M` | Klasik kural ayarları menüsüne geç |
| `Q`, `ESC`, `Ctrl+C` | Panelden çık |

Başlatma, durdurma, tümünü durdurma ve çalışan kurallar varken panelden çıkma işlemleri `Evet/Hayır` penceresiyle onay ister.

Amblem gerçek JPEG değildir. Terminalde tutarlı çalışması için ANSI ön/arka plan renkleri ve `▀` karakteriyle çizilir. `assets\fenerbahce.jpg` yalnızca kullanılmayan referans görsel olarak kaynakta durur; çalışma zamanına veya Windows paketine kopyalanmaz.

### 4.2 Klasik kural menüsü

Panelde `M` seçildiğinde klasik menü açılır. Çalışan kural varsa önce durdurma ve paneli kapatma onayı alınır.

Klasik menü işlevleri:

1. Otomasyonu başlat.
2. Yeni kural ekle.
3. Kuralları ayrıntılı göster.
4. Kuralı düzenle.
5. Kuralı aç/kapat.
6. Kuralı sil.
7. Instagram veya X/Twitter hesabına giriş yap.
8. Çıkış.

Menü altında kayıtlı kurallar kısa özet halinde sürekli gösterilir. Alt menülerde `ESC = geri` bilgisi bulunur.

Kural düzenleme sırasında kuralın bütün alanları yeniden sorulmaz. Önce kural, ardından değiştirilecek alan numarası seçilir. Sadece o alan değiştirilir; `S` tüm değişiklikleri kaydeder, `ESC` kaydetmeden geri döner.

### 4.3 Doğrudan komutlar

```powershell
node src/app.js menu      # Fareli panel (varsayılan)
node src/app.js classic   # Klasik CLI menüsü
node src/app.js list      # Kayıtlı kuralları yazdır
node src/app.js login     # Hesap giriş akışı
node src/app.js start     # Tüm açık kuralları başlat; Ctrl+C ile durdur
```

Paket kurulduğunda aynı komutlar `Anti-Cado.cmd` üzerinden çalıştırılabilir.

## 5. Kural veri modeli

Her normalize edilmiş kuralın temel alanları şunlardır:

| Alan | Açıklama |
|---|---|
| `id` | Kuralın benzersiz kimliği |
| `enabled` | Kural panelden başlatılabilir mi? |
| `platform` | `instagram` veya `x` |
| `conversationType` | `direct` veya `group` |
| `conversationName` | Arayüzde görünen sohbet/grup adı |
| `senderUsername` | İzlenecek kullanıcı adı; başındaki `@` temizlenir ve küçük harfe çevrilir |
| `contentType` | `link` veya `text` |
| `messageContent` | Gönderilecek bağlantı ya da metin |
| `deliveryMode` | Instagram için `reply` veya `normal`; X için yalnızca `normal` |
| `copiesPerTrigger` | Bir yeni mesaj başına ayrı yanıt sayısı |
| `repeatIntervalSeconds` | Kopyalar arası saniye; birden çok kopyada en az 1 |
| `repeatMode` | Belirli sayıda veya durdurulana kadar |
| `repeatCount` | İşlenecek yeni mesaj sayısı; sınırsız seçimde kullanıcı değeri `99999` |

Bağlantı doğrulaması platforma özeldir:

- Instagram kuralında `instagram.com` bağlantısı gerekir.
- X/Twitter kuralında `x.com` veya `twitter.com` bağlantısı gerekir.
- Düz metin kurallarında URL zorunluluğu yoktur.

## 6. Oturum, ayar ve yerel veri

Varsayılan yerel veri klasörü:

```text
%LOCALAPPDATA%\Anti-Çado\
├── config.json
└── browser-profile\
```

- `config.json` sürüm 3 biçiminde kuralları saklar.
- `browser-profile` Instagram ve X oturum çerezlerini taşıyan uygulamaya özel Chrome profilidir.
- Parola uygulama ayarına yazılmaz.
- Ancak giriş yapılmış Chrome profili hassas oturum verisidir; paylaşılmamalı ve kaynak kontrolüne eklenmemelidir.
- Eski `%LOCALAPPDATA%\Anticado` ve `%LOCALAPPDATA%\InstagramGrupYanitlayici` ayarları için geriye uyumlu arama/göç desteği vardır.
- Test veya taşınabilir özel kullanım için `IG_GRUP_DATA_DIR` ortam değişkeni veri klasörünü değiştirebilir.
- Chrome başka yerde kuruluysa `IG_GRUP_CHROME_PATH` ile tam `chrome.exe` yolu verilebilir.

Bu proje klasörüne kullanıcının gerçek `config.json` dosyası veya `browser-profile` klasörü kopyalanmadı. Böylece hesap oturumları Claude'a devredilen kaynak koddan ayrı kalır.

## 7. Kaynak kod mimarisi

| Dosya | Sorumluluk |
|---|---|
| `src/app.js` | Komut yönlendirme, klasik menü, giriş ve klasik otomasyon döngüsü |
| `src/tui.js` | Fareli tam ekran panel, düğmeler, onay pencereleri, CLI amblemi |
| `src/automation-controller.js` | Panel ile tarayıcı oturumu/RuleRunner arasındaki çalışma denetleyicisi |
| `src/instagram.js` | Adı eski kalmış olsa da hem Instagram hem X için Chrome, sohbet bulma, DOM izleme ve gönderim katmanı |
| `src/rule-runner.js` | Mesaj tekilleştirme, işleme limiti ve kural başına sıralı çalışma |
| `src/rules.js` | Kural sabitleri, normalizasyon, doğrulama ve insan tarafından okunur özetler |
| `src/prompts.js` | Klasik CLI seçimleri, `ESC`, çoklu seçim, kural oluşturma ve alan bazlı düzenleme |
| `src/config-store.js` | Ayar yolu, eski ayar göçü, yükleme ve güvenli dosya yazımı |
| `scripts/build-portable.ps1` | Windows taşınabilir paket ve kurulum dosyalarını üretme |
| `scripts/inspect-*.js`, `scripts/watch-x-once.js` | Canlı DOM inceleme/geliştirme yardımcıları; normal kullanıcı akışının parçası değildir |
| `test/*.test.js` | Birim ve taklit oturum testleri |
| `assets/fenerbahce.jpg` | Kullanılmayan referans görsel |

Not: `src/instagram.js` dosya adı tarihsel nedenlerle böyle kaldı. Dosya artık iki platformu da yönetiyor. İleride `browser-session.js` veya platform adaptörlerine ayrılması okunabilirliği artırır.

## 8. Windows paketi ve kurulum

Geliştirme ortamında paket üretimi:

```powershell
npm ci
npm run package:win
```

Betik şu yapıyı üretir:

```text
dist\
├── Anti-Çado-Windows.zip
└── Anti-Çado\
    ├── Anti-Cado.cmd
    ├── KURULUM.cmd
    ├── KURULUM.ps1
    ├── runtime\node.exe
    ├── src\
    ├── node_modules\
    ├── package.json
    └── README.md
```

Kurulum akışı:

1. ZIP başka Windows bilgisayarda açılır.
2. `KURULUM.cmd` çalıştırılır.
3. Dosyalar `%LOCALAPPDATA%\Programs\Anti-Cado` klasörüne kopyalanır.
4. Masaüstünde `Anti-Çado.lnk` oluşturulur.
5. Pakette Node.js bulunduğu için hedef bilgisayara ayrıca Node.js kurulması gerekmez.
6. Hedef bilgisayarda Google Chrome kurulu olmalıdır.
7. İlk kullanımda uygulamanın menüsünden Instagram ve/veya X hesabına giriş yapılmalıdır.

Bu devir klasöründe `dist` yoktur. Son bilinen paket çalışma alanında şu konumda üretilmişti:

```text
C:\Users\kullanici\Documents\Codex\2026-08-25\ins\outputs\anti-cado\Anti-Çado-Windows.zip
```

Son bilinen SHA-256:

```text
612D6A63885759D37E8C58B8D2271C8FC85843EF6787357D3EF759BA1D9F0407
```

Yeni bir kod değişikliğinden sonra bu eski ZIP kullanılmamalı; hedef klasörde bağımlılıklar kurularak paket yeniden üretilmelidir.

## 9. Test ve doğrulama durumu

Kaynak proje taşınmadan hemen önce test paketi **29/29 başarılı** çalıştı. Kapsanan başlıca davranışlar:

- Dinamik kural başlatma ve tek tek durdurma.
- Kapalı kuralı başlatmama.
- Eski grup ayarlarının yeni sohbet modeline göçü.
- Bir mesaj için seçilen kopya sayısını gönderme.
- Farklı sohbetlerde ayrı sayfa, aynı sohbette mevcut sayfayı kullanma.
- Durdurulan kuralın kalan kopyalarını iptal etme.
- Aynı yeni mesajı yalnızca bir kez işleme.
- `99999` seçiminin kendi kendine döngü oluşturmaması.
- Durdurulan kuralı yeniden başlatabilme.
- `B`, `K`, `D`, `ESC` ve çoklu kural seçimi davranışları.
- Instagram/X bağlantı doğrulaması ve X'te bağlı yanıtı reddetme.
- CLI ambleminin renk, boyut ve sabit düzeni.
- Kural satırının fareyle tek tıkta seçilmesi.

Devir klasöründe bu rapor yazılırken aşağıdaki sözdizimi kontrolü başarıyla çalıştırıldı:

```powershell
npm run check
```

`node_modules` bilerek kopyalanmadığı için testler hedef klasörde henüz yeniden çalıştırılmadı. Claude veya sonraki geliştirici ilk olarak şunları çalıştırmalıdır:

```powershell
cd C:\Users\kullanici\Documents\AyyildizWorkspace\projects\anti-cado
npm ci
npm run check
npm test
```

Mevcut testler ağırlıklı olarak birim testleri ve taklit edilmiş tarayıcı nesneleridir. Gerçek Instagram/X web arayüzü üzerinde uçtan uca gönderim testi değildir.

## 10. Bilinen sınırlamalar ve riskler

1. **Web DOM bağımlılığı:** Instagram ve X seçicileri değişirse sohbet bulma, gönderen algılama, yanıt düğmesi veya mesaj kutusu bozulabilir.
2. **Canlı E2E doğrulama eksikliği:** Son panel/amblem/paket düzenlemelerinden sonra gerçek hesaba otomatik mesaj gönderen kontrollü uçtan uca test yapılmadı.
3. **Hesap kısıtlama riski:** Çok yüksek yanıt adedi veya kısa aralık platformların spam/rate-limit sistemlerini tetikleyebilir. Merkezi bir hız sınırı politikası yoktur; yalnızca kuralın kopyalar arası süresi vardır.
4. **Resmî API kullanılmıyor:** Sistem web arayüzünü otomatikleştirir. Platform kuralları ve hesap güvenliği kullanıcı tarafından ayrıca değerlendirilmelidir.
5. **Dil ve erişilebilirlik seçicileri:** Kod Türkçe/İngilizce bazı `Yanıtla/Reply`, `Ara/Search` etiketlerini destekler; başka arayüz dili sorun çıkarabilir.
6. **Görünür mesaj varsayımı:** Instagram'da bağlı yanıt verilecek kaynak mesaj DOM'dan kaybolmuşsa “kaynak mesaj artık ekranda değil” hatası oluşur.
7. **Sohbet adı eşleşmesi:** Sohbet adı arayüzde göründüğü gibi yazılmalıdır. Birebir sohbette kullanıcı adı yedek arama anahtarı olarak da denenir.
8. **Chrome zorunluluğu:** Edge veya paketli Chromium kullanılmaz. Chrome kurulu değilse uygulama başlamaz.
9. **Windows odaklılık:** Paketleme, kurulum yolları ve Chrome süreç kapatma kodu Windows için tasarlanmıştır.
10. **Kaynak kontrolü yok:** Bu klasörde şu anda `.git` dizini bulunmuyor. Değişiklik geçmişi ve geri alma için yeni bir Git deposu başlatılması düşünülebilir; bu rapor hazırlanırken otomatik olarak yapılmadı.
11. **Referans JPG kullanılmıyor:** Kullanıcı son aşamada terminalde gerçek JPEG gösterimini beğenmedi. Dosya kaynakta kalsa da mevcut panel onu göstermez.

## 11. Claude'a devir notları

### İlk yapılacaklar

```powershell
cd C:\Users\kullanici\Documents\AyyildizWorkspace\projects\anti-cado
npm ci
npm run check
npm test
npm start
```

### Geliştirirken korunması gereken davranışlar

- `99999` yalnızca sınırsız **gelecek hedef mesaj** demektir; zamanlayıcıyla kendi kendine mesaj üretmemelidir.
- Bir kaynak mesaj aynı kural için yalnızca bir kez işlenmelidir.
- Bir tetiklemede seçilen kopya sayısı kadar ayrı mesaj gitmelidir.
- Durdurma, kuyruğa alınmış sonraki kopyaları gerçekten iptal etmelidir.
- Farklı sohbetler paralel, aynı sohbet içindeki gönderimler sıralı kalmalıdır.
- Başlatma, durdurma ve çalışan paneli kapatma için onay korunmalıdır.
- `ESC` menülerde geri; çalışan panelde ise onaylı çıkış olmalıdır.
- Kullanıcının mesaj kutusundaki taslak metin kesinlikle ezilmemelidir.
- Giriş çerezleri ve `browser-profile` kaynak kod deposuna alınmamalıdır.
- X için `reply` modu açılmamalı; mevcut modelde yalnızca normal DM gönderimi vardır.

### Canlı test güvenliği

Gerçek hesapla test gerektiğinde:

1. Önce test hesabı ve test sohbeti kullanın.
2. Kuralı `copiesPerTrigger: 1`, `repeatCount: 1` ile başlatın.
3. Kullanıcıdan canlı mesaj göndermeden önce açık onay alın.
4. Gelen tek test mesajının yalnızca bir kez işlendiğini gözlemleyin.
5. Sonra çoklu kopya, durdurma ve paralel sohbet senaryolarını ayrı ayrı sınayın.
6. DOM inceleme betiklerini normal uygulamadan ayrı tutun; çıktılarda özel mesaj içeriği bırakmayın.

### Mantıklı sonraki teknik geliştirmeler

- Instagram ve X kodunu ayrı platform adaptörlerine bölmek.
- Seçicileri merkezi ve sürümlenebilir bir yapıya taşımak.
- Gerçek tarayıcıyla ancak gönderim yapmayan bir “sohbeti bul/izlemeyi doğrula” test modu eklemek.
- Kural başına günlük/saatlik güvenlik limiti eklemek.
- Aktif kural kalmadığında Chrome'u kapatma seçeneği eklemek.
- Logları yapılandırılmış dosyaya yazmak ve kişisel mesaj içeriğini maskelemek.
- Git deposu ve `.gitignore` oluşturmak (`node_modules`, `dist`, yerel veri ve tarayıcı profili hariç).
- Windows kurulum paketine sürüm bilgisi ve kaldırma seçeneği eklemek.

## 12. Mevcut durumun doğruluk sınırı

Bu rapor, `0.6.5` kaynak dosyalarının doğrudan incelenmesine, hedef klasörde başarıyla çalıştırılan sözdizimi kontrolüne ve taşınmadan önceki 29 başarılı teste dayanır. Şu anki kodun mimarisi ve amaçlanan davranışı ayrıntılı biçimde belgelenmiştir.

Bununla birlikte Instagram ve X sürekli değişen üçüncü taraf web arayüzleridir. Bu nedenle “kod ve birim testleri hazır” ile “bugünkü canlı platformda her seçici çalışıyor” aynı iddia değildir. Bir sonraki geliştirme turunda, kullanıcı onayıyla ve düşük riskli test değerleriyle kontrollü canlı doğrulama yapılmalıdır.
