# 🎵 Discord Müzik Botu & Web Admin Paneli

Bu proje, şık ve modern (glassmorphism temalı) bir web yönetim paneline sahip, gelişmiş bir Discord Müzik Botudur. Botunuzu web paneli üzerinden canlı kontrol edebilir, çalma sırasını yönetebilir, sistem kaynaklarını izleyebilir ve güvenlik yetkilendirmeleri yapabilirsiniz.

---

## 🚀 Öne Çıkan Özellikler

- **Gelişmiş Ses Desteği:** YouTube, Spotify ve SoundCloud aramalarını/linklerini (oynatma listeleri dahil) yüksek ses kalitesiyle çalar.
- **Canlı Web Admin Paneli:** Şık karanlık mod tasarımı, yumuşak renk geçişleri ve glassmorphic kartlar.
- **Gerçek Zamanlı Senkronizasyon:** WebSocket bağlantısı sayesinde web paneli ve Discord sunucusu arasındaki müzik durumu anlık olarak senkronize edilir.
- **Sıfır Yapılandırmalı Güvenlik:** Web paneline giriş yaparken hesabınızın Discord ID'sini girersiniz, bot size Discord DM üzerinden tek kullanımlık 6 haneli doğrulama kodu gönderir.
- **Sistem İzleme:** Canlı CPU ve RAM kullanım grafikleri.
- **Yönetici Yönetimi:** Web panelinden yeni yöneticiler ekleyebilir veya kaldırabilirsiniz.
- **7/24 Aktif Kalma:** Render üzerinde ücretsiz barındırmada botun uykuya dalmasını engelleyen Keep-Alive (kendi kendini pingleyen) mekanizması.

---

## 🛠️ Yerel (Local) Kurulum Adımları

1. **Gereksinimler:** Bilgisayarınızda [Node.js](https://nodejs.org/) (v18.0.0 veya üstü) kurulu olmalıdır.
2. **Kodu İndirin:** Proje dosyalarını bilgisayarınızda bir klasöre çıkarın.
3. **Bağımlılıkları Kurun:** Terminali (PowerShell veya CMD) açıp proje dizininde şu komutu çalıştırın:
   ```bash
   npm install
   ```
4. **Yapılandırma (.env):** Klasördeki `.env` dosyasını bir metin editörüyle açın:
   - `DISCORD_TOKEN` kısmına Discord Developer Portal'dan aldığınız bot tokenini yazın.
   - `JWT_SECRET` kısmına rastgele şifreli bir kelime yazın (örn: `benim_ozel_sifrem_482`).
   - `ALLOWED_USERS` kısmında sizin Discord ID'niz (`392468815323201547`) zaten ekli durumdadır.
5. **Uygulamayı Başlatın:**
   ```bash
   npm start
   ```
6. **Web Paneline Giriş:** Tarayıcınızda `http://localhost:3000` adresine gidin. ID'nizi girip Discord DM'nize gelen kodu yazarak panele erişin!

---

## 🤖 Discord Botunu Oluşturma ve Ayarlama

1. [Discord Developer Portal](https://discord.com/developers/applications) adresine gidin.
2. **New Application** butonuna tıklayın ve bir isim verin.
3. Soldaki menüden **Bot** sekmesine gidin:
   - **Reset Token** butonuna basarak bot tokeninizi kopyalayın ve `.env` dosyasındaki `DISCORD_TOKEN` kısmına yapıştırın.
   - **Privileged Gateway Intents** başlığı altındaki şu 3 seçeneği kesinlikle **aktif (Açık)** yapın:
     - ☑️ **Presence Intent**
     - ☑️ **Server Members Intent**
     - ☑️ **Message Content Intent**
   - Ayarları kaydedin.
4. **Botu Sunucunuza Davet Etme (OAuth2):**
   - Sol menüden **OAuth2** -> **URL Generator** sekmesine gidin.
   - **Scopes** kısmından sadece `bot` ve `applications.commands` seçeneklerini işaretleyin.
   - Altında açılan **Bot Permissions** kısmından şu yetkileri seçin:
     - `Send Messages`, `Read Message History`, `Connect`, `Speak`, `Use Voice Activity`.
   - Sayfanın en altında oluşan davet linkini kopyalayıp tarayıcınızda açarak botu Discord sunucunuza ekleyin.
5. **ÖNEMLİ (DM Ayarı):** Giriş kodunun size ulaşabilmesi için botun sunucusunda sağ tıklayıp Gizlilik Ayarlarından **"Sunucu üyelerinden gelen doğrudan mesajlara (DM) izin ver"** ayarının açık olduğundan emin olun.

---

## 🐙 GitHub'a Yükleme Adımları

Botu Render'a bağlamak için bir GitHub deposuna yüklemeniz gerekir:

1. Bilgisayarınızda Git yüklü olduğundan emin olun.
2. Proje klasöründe terminali açıp şu komutları sırasıyla çalıştırın:
   ```bash
   git init
   git add .
   git commit -m "İlk Commit - Müzik Botu & Web Panel"
   ```
   *(Not: `.gitignore` dosyası `.env` ve `data.json` dosyalarının GitHub'a yüklenmesini otomatik engeller).*
3. GitHub hesabınızda yeni ve **Private (Gizli)** veya Public bir depo (repository) oluşturun.
4. GitHub'ın size verdiği bağlantı komutlarını terminale yapıştırıp kodları yükleyin:
   ```bash
   git branch -M main
   git remote add origin https://github.com/KULLANICI_ADINIZ/DEPO_ADINIZ.git
   git push -u origin main
   ```

---

## ☁️ Render Üzerinde 7/24 Ücretsiz Yayınlama (Deploy)

Render, Node.js projelerini ücretsiz olarak yayınlamanıza olanak tanır. Botunuzu 7/24 aktif tutmak için şu adımları izleyin:

1. [Render.com](https://render.com/) adresine üye olun ve giriş yapın.
2. **New +** butonuna tıklayıp **Web Service** seçeneğini seçin.
3. GitHub hesabınızı bağlayın ve müzik botu deponuzu seçin.
4. **Yapılandırma Bilgileri:**
   - **Name:** Botunuza bir isim verin (örn: `beatbot-panel`).
   - **Region:** Size en yakın konumu seçin (Frankfurt/Europe önerilir).
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free` (Ücretsiz plan)
5. **Çevre Değişkenleri (Environment Variables):**
   Sayfanın altındaki **Advanced** butonuna tıklayıp **Add Environment Variable** diyerek şunları ekleyin:
   - `DISCORD_TOKEN` = *(Discord bot tokeniniz)*
   - `JWT_SECRET` = *(Rastgele belirlediğiniz JWT şifresi)*
   - `ALLOWED_USERS` = `392468815323201547` *(veya izin vermek istediğiniz ID'ler)*
   - `RENDER_EXTERNAL_URL` = *(Bunu boş bırakın, Render servis kurulduktan sonra size bir URL verecektir (örn: `https://beatbot.onrender.com`). Servis oluştuktan sonra bu çevre değişkenini ekleyip Render panelinden web sitenizin URL'sini buraya yapıştırırsanız, bot kendi kendini 10 dakikada bir pingleyerek Render'ın uykuya geçmesini (spin-down) engeller).*
6. **Create Web Service** butonuna basın. Birkaç dakika içinde kurulum tamamlanacak ve siteniz aktif olacaktır!

---

## 🛠️ Sık Karşılaşılan Sorunlar ve Çözümleri

#### 1. Bot Ses Kanalına Giriyor ama Ses Gelmiyor / Şarkı Çalmıyor
- Projenin `package.json` dosyasında `ffmpeg-static` yüklüdür. Bot ses dosyalarını oynatmak için bunu otomatik algılar. Sorun devam ederse, terminalinizde ffmpeg'in düzgün kurulduğunu doğrulayın. Ayrıca ses kanalının izinlerinin bota açık olduğundan emin olun.

#### 2. Giriş Yaparken Kod Discord DM'den Gelmiyor
- Discord hesabınızın DM kutusunun yabancılara/botlara açık olup olmadığını kontrol edin (Kullanıcı Ayarları -> Gizlilik ve Güvenlik -> "Sunucu Üyelerinden Gelen Doğrudan Mesajlara İzin Ver").
- Botun aktif ve çevrimiçi olduğundan emin olun.

#### 3. Render Sitesi İlk Açılışta Geç Yükleniyor
- Ücretsiz Render planları 15 dakika işlem yapılmadığında uykuya geçer. İlk istek geldiğinde uyanması 30-50 saniye sürebilir. Uyanık kalması için `RENDER_EXTERNAL_URL` değişkenini eklediğinizden emin olun veya web panelinizi ücretsiz bir [UptimeRobot](https://uptimerobot.com/) hesabı oluşturup oraya ekleyerek 5 dakikada bir pingletebilirsiniz.
