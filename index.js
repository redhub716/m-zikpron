import dotenv from 'dotenv';
import ffmpeg from 'ffmpeg-static';
import { client } from './bot/client.js';
import { registerCommands, handleInteraction } from './bot/commands.js';
import { startWebServer } from './web/server.js';
import { getSettings } from './config.js';
import { ActivityType } from 'discord.js';

// .env dosyasını yükle
dotenv.config();

// FFMPEG static yolunu ayarla (Discord ses kitaplıkları için hayati önem taşır)
process.env.FFMPEG_PATH = ffmpeg;
console.log(`ℹ️ FFmpeg statik ikili dosyası yüklendi: ${ffmpeg}`);

// Web Sunucusunu Başlat
const PORT = process.env.PORT || 3000;
startWebServer(PORT);

// --- DISCORD BOT ETKİNLİKLERİ ---

// Bot hazır olduğunda
client.once('ready', async () => {
  console.log(`🤖 Discord Bot başarıyla giriş yaptı: ${client.user.tag}`);
  
  // Bot durumunu ayarla (Web paneli ve müzik)
  client.user.setPresence({
    activities: [{ 
      name: '🎵 Müziği Web Panelden Yönet!', 
      type: ActivityType.Listening 
    }],
    status: 'online',
  });

  // Slash komutlarını kaydet
  await registerCommands(client);
});

// Slash komutu etkileşimi geldiğinde
client.on('interactionCreate', async (interaction) => {
  try {
    await handleInteraction(interaction);
  } catch (error) {
    console.error('Komut çalıştırılırken hata oluştu:', error);
    const replyData = { content: '❌ Bu komut çalıştırılırken beklenmeyen bir hata oluştu!', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(replyData).catch(() => {});
    } else {
      await interaction.reply(replyData).catch(() => {});
    }
  }
});

// Hata yönetimi (Botun çökmesini engellemek için)
process.on('unhandledRejection', (reason, promise) => {
  console.error('Yakalanmayan Reddedilme (Unhandled Rejection):', promise, 'Sebep:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Yakalanmayan İstisna (Uncaught Exception):', error);
});

// Render için kendi kendini pingleyip 7/24 uyanık tutma mekanizması
const settings = getSettings();
if (settings.keepAlive) {
  const selfPingUrl = process.env.RENDER_EXTERNAL_URL;
  if (selfPingUrl) {
    console.log(`🌐 Keep-Alive aktif. Pinglenecek URL: ${selfPingUrl}`);
    setInterval(async () => {
      try {
        const response = await fetch(selfPingUrl);
        console.log(`🔄 Kendi kendine ping atıldı: Status ${response.status}`);
      } catch (e) {
        console.error('Kendi kendine ping hatası:', e.message);
      }
    }, 10 * 60 * 1000); // 10 dakikada bir ping at
  } else {
    console.log('ℹ️ Keep-Alive deaktif. RENDER_EXTERNAL_URL çevre değişkeni bulunamadı.');
  }
}

// Botu Başlat
const token = process.env.DISCORD_TOKEN;
if (!token || token === 'BOT_TOKENINIZI_BURAYA_YAZIN') {
  console.error('❌ HATA: .env dosyasında geçerli bir DISCORD_TOKEN bulunamadı!');
  console.error('Lütfen .env dosyasını açıp bot tokeninizi ekleyin ve uygulamayı tekrar başlatın.');
} else {
  client.login(token).catch(err => {
    console.error('❌ Bot giriş hatası! Tokeni doğru girdiğinizden emin olun:', err.message);
  });
}
