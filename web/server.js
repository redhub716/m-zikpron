import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import os from 'os';
import path from 'path';
import { client, queues, searchAndQueue, playNext, destroyQueue } from '../bot/client.js';
import { getAllowedUsers, addAllowedUser, removeAllowedUser, getSettings, updateSettings } from '../config.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_for_music_bot';

// Aktif doğrulama kodları (userId -> { code, expires })
const activeCodes = new Map();

// Express ve Sunucu Tanımları
const app = express();
app.use(express.json());

// Statik Dosyalar (Web Dashboard Ön Yüzü)
const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, 'web', 'public')));

// JWT Kimlik Doğrulama Middleware'i
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ success: false, message: 'Erişim engellendi. Token yok.' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: 'Geçersiz veya süresi dolmuş token.' });
    req.user = user;
    next();
  });
}

// --- API ROTASI: GİRİŞ VE GÜVENLİK ---

// 1. Giriş Kod Talebi (Discord DM ile gönderim)
app.post('/api/auth/request-code', async (req, res) => {
  const { userId } = req.body;
  
  if (!userId) {
    return res.status(400).json({ success: false, message: 'Discord ID gereklidir.' });
  }
  
  const allowed = getAllowedUsers();
  if (!allowed.includes(userId)) {
    return res.status(403).json({ success: false, message: 'Bu Discord ID web paneline erişmek için yetkilendirilmemiş.' });
  }
  
  try {
    // 6 haneli rastgele kod üret
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    activeCodes.set(userId, {
      code,
      expires: Date.now() + 5 * 60 * 1000 // 5 dakika geçerli
    });
    
    // Discord kullanıcısını bul ve DM gönder
    const discordUser = await client.users.fetch(userId);
    await discordUser.send({
      embeds: [{
        title: '🔒 Web Panel Giriş Doğrulaması',
        description: `Müzik Botu Web Admin Paneline giriş yapmak için tek kullanımlık kodunuz:\n\n` +
                     `🔑 **\`${code}\`**\n\n` +
                     `*Bu kod 5 dakika geçerlidir. Giriş talebini siz yapmadıysanız bu mesajı dikkate almayın.*`,
        color: 0xE74C3C,
        timestamp: new Date()
      }]
    });
    
    return res.json({ success: true, message: 'Doğrulama kodu Discord DM üzerinden gönderildi.' });
  } catch (err) {
    console.error('Doğrulama kodu gönderme hatası:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Kod gönderilemedi. Bot ile DM geçmişiniz olduğundan ve sunucu ayarlarında "Doğrudan Mesajlara İzin Ver" seçeneğinin açık olduğundan emin olun!' 
    });
  }
});

// 2. Kodu Doğrula ve JWT üret
app.post('/api/auth/verify', (req, res) => {
  const { userId, code } = req.body;
  
  if (!userId || !code) {
    return res.status(400).json({ success: false, message: 'Discord ID ve doğrulama kodu gereklidir.' });
  }
  
  const activeCodeData = activeCodes.get(userId);
  
  if (!activeCodeData) {
    return res.status(400).json({ success: false, message: 'Giriş talebi bulunamadı. Lütfen önce kod isteyin.' });
  }
  
  if (Date.now() > activeCodeData.expires) {
    activeCodes.delete(userId);
    return res.status(400).json({ success: false, message: 'Doğrulama kodunun süresi dolmuş.' });
  }
  
  if (activeCodeData.code !== code) {
    return res.status(400).json({ success: false, message: 'Hatalı kod girdiniz.' });
  }
  
  // Başarılı doğrulama
  activeCodes.delete(userId);
  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
  
  return res.json({ success: true, token, userId });
});

// --- API ROTASI: BOT BİLGİLERİ VE KONTROL ---

// 3. Genel Bot Durumu (Sunucular vb.)
app.get('/api/bot/status', authenticateToken, async (req, res) => {
  try {
    const guilds = client.guilds.cache.map(g => {
      const queue = queues.get(g.id);
      return {
        id: g.id,
        name: g.name,
        icon: g.iconURL() || 'https://cdn.discordapp.com/embed/avatars/0.png',
        memberCount: g.memberCount,
        isPlaying: queue ? queue.isPlaying : false,
        activeChannel: queue ? queue.voiceChannelId : null
      };
    });
    
    return res.json({
      success: true,
      bot: {
        username: client.user.username,
        avatar: client.user.avatarURL() || 'https://cdn.discordapp.com/embed/avatars/0.png',
        tag: client.user.tag,
        guildCount: client.guilds.cache.size,
        ping: client.ws.ping,
        uptime: client.uptime
      },
      guilds
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Belirli bir sunucunun müzik sırasını al
app.get('/api/bot/queue/:guildId', authenticateToken, (req, res) => {
  const { guildId } = req.params;
  const queue = queues.get(guildId);
  
  if (!queue) {
    return res.json({
      success: true,
      queue: {
        songs: [],
        currentSong: null,
        isPlaying: false,
        volume: getSettings().defaultVolume || 50,
        loop: 'none',
        voiceChannelId: null
      }
    });
  }
  
  return res.json({
    success: true,
    queue: {
      songs: queue.songs,
      currentSong: queue.currentSong,
      isPlaying: queue.isPlaying,
      volume: queue.volume,
      loop: queue.loop,
      voiceChannelId: queue.voiceChannelId
    }
  });
});

// 5. Şarkı Ekle (Kuyruğa veya Çalma)
app.post('/api/bot/queue/:guildId/add', authenticateToken, async (req, res) => {
  const { guildId } = req.params;
  const { query, voiceChannelId } = req.body;
  
  if (!query || !voiceChannelId) {
    return res.status(400).json({ success: false, message: 'Arama sorgusu ve Ses Kanalı ID gereklidir.' });
  }
  
  try {
    // Botun bağlı olabileceği ses kanalını kontrol et veya katıl
    await searchAndQueue(query, guildId, voiceChannelId, `Web Admin (${req.user.userId})`, null);
    return res.json({ success: true, message: 'Şarkı başarıyla işlendi.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Bot Kontrol Komutları (Play, Pause, Skip, Stop, Volume, Loop, Clear)
app.post('/api/bot/control/:guildId', authenticateToken, async (req, res) => {
  const { guildId } = req.params;
  const { action, value } = req.body;
  
  const queue = queues.get(guildId);
  if (!queue && action !== 'play_query') {
    return res.status(404).json({ success: false, message: 'Bu sunucuda aktif bir müzik oturumu yok.' });
  }
  
  try {
    switch (action) {
      case 'play':
        queue.audioPlayer.unpause();
        queue.isPlaying = true;
        break;
      case 'pause':
        queue.audioPlayer.pause();
        queue.isPlaying = false;
        break;
      case 'skip':
        playNext(guildId);
        break;
      case 'stop':
        destroyQueue(guildId);
        break;
      case 'volume':
        const vol = parseInt(value);
        if (isNaN(vol) || vol < 0 || vol > 100) {
          return res.status(400).json({ success: false, message: 'Geçersiz ses seviyesi (0-100).' });
        }
        queue.volume = vol;
        if (queue.stream) {
          queue.stream.volume.setVolume(vol / 100);
        }
        break;
      case 'loop':
        if (!['none', 'song', 'queue'].includes(value)) {
          return res.status(400).json({ success: false, message: 'Geçersiz tekrar modu.' });
        }
        queue.loop = value;
        break;
      case 'clear':
        queue.songs = [];
        break;
      case 'remove_song':
        const idx = parseInt(value);
        if (!isNaN(idx) && idx >= 0 && idx < queue.songs.length) {
          queue.songs.splice(idx, 1);
        } else {
          return res.status(400).json({ success: false, message: 'Geçersiz şarkı indeksi.' });
        }
        break;
      default:
        return res.status(400).json({ success: false, message: 'Bilinmeyen işlem.' });
    }
    
    // Değişikliği tüm WS abonelerine bildir
    if (queues.has(guildId)) {
      if (wsBroadcastCallback) wsBroadcastCallback(guildId);
    }
    
    return res.json({ success: true, message: 'Komut uygulandı.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// --- API ROTASI: GÜVENLİK AYARLARI ---

// 7. İzin Verilen Kullanıcıları Getir
app.get('/api/settings/security', authenticateToken, async (req, res) => {
  const allowedIds = getAllowedUsers();
  
  // Discord API'den kullanıcı detaylarını (username, avatar) alarak gönder
  const usersDetails = await Promise.all(
    allowedIds.map(async (id) => {
      try {
        const u = await client.users.fetch(id);
        return {
          id,
          username: u.username,
          avatar: u.avatarURL() || 'https://cdn.discordapp.com/embed/avatars/0.png',
          tag: u.tag
        };
      } catch (err) {
        return {
          id,
          username: `Bilinmeyen Kullanıcı (${id})`,
          avatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
          tag: id
        };
      }
    })
  );
  
  return res.json({ success: true, users: usersDetails });
});

// 8. İzin Verilen Kullanıcı Ekle
app.post('/api/settings/security/add', authenticateToken, async (req, res) => {
  const { userId } = req.body;
  if (!userId || !/^\d{17,19}$/.test(userId)) {
    return res.status(400).json({ success: false, message: 'Geçersiz Discord ID formatı.' });
  }
  
  try {
    // Discord üzerinde böyle bir kullanıcı var mı kontrol et
    await client.users.fetch(userId);
    const added = addAllowedUser(userId);
    if (!added) {
      return res.status(400).json({ success: false, message: 'Bu kullanıcı zaten izinli listesinde.' });
    }
    return res.json({ success: true, message: 'Kullanıcı başarıyla eklendi.' });
  } catch (err) {
    return res.status(400).json({ success: false, message: 'Discord üzerinde böyle bir kullanıcı bulunamadı!' });
  }
});

// 9. İzin Verilen Kullanıcı Sil
app.post('/api/settings/security/remove', authenticateToken, (req, res) => {
  const { userId } = req.body;
  
  if (userId === req.user.userId) {
    return res.status(400).json({ success: false, message: 'Kendinizi listeden silemezsiniz!' });
  }
  
  const removed = removeAllowedUser(userId);
  if (!removed) {
    return res.status(400).json({ success: false, message: 'Kullanıcı listeden silinemedi (Kurucu silinemez veya bulunamadı).' });
  }
  return res.json({ success: true, message: 'Kullanıcı başarıyla listeden kaldırıldı.' });
});

// 10. Sesli Kanal Listesini Getir (Belirli bir sunucu için)
app.get('/api/bot/channels/:guildId', authenticateToken, (req, res) => {
  const { guildId } = req.params;
  const guild = client.guilds.cache.get(guildId);
  
  if (!guild) {
    return res.status(404).json({ success: false, message: 'Sunucu bulunamadı.' });
  }
  
  // Sesli kanalları filtrele
  const voiceChannels = guild.channels.cache
    .filter(c => c.type === 2 || c.type === 13) // GuildVoice ve GuildStageVoice
    .map(c => ({
      id: c.id,
      name: c.name
    }));
    
  return res.json({ success: true, channels: voiceChannels });
});

// --- YARDIMCI VE YAYIN SERVER BAŞLANGICI ---

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// HTTP -> WS Yükseltmesi
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// WS İstemcileri (ws -> authenticated userId)
const authenticatedWsClients = new Map();

wss.on('connection', (ws) => {
  let isAuth = false;
  let activeGuildId = null;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'auth') {
        jwt.verify(data.token, JWT_SECRET, (err, decoded) => {
          if (err) {
            ws.send(JSON.stringify({ type: 'error', message: 'WebSocket yetkilendirmesi başarısız.' }));
            ws.close();
          } else {
            isAuth = true;
            authenticatedWsClients.set(ws, decoded.userId);
            ws.send(JSON.stringify({ type: 'authorized' }));
            
            // İlk bağlantıda sistem istatistiklerini gönder
            sendSystemStats(ws);
          }
        });
      }
      
      if (!isAuth) return;
      
      if (data.type === 'subscribe') {
        activeGuildId = data.guildId;
        // Sunucu kuyruk bilgisini hemen gönder
        sendQueueUpdate(ws, activeGuildId);
      }
      
    } catch (e) {
      console.error('WS Mesaj işleme hatası:', e);
    }
  });
  
  ws.on('close', () => {
    authenticatedWsClients.delete(ws);
  });
});

// Belirli bir sunucunun kuyruk bilgisini tek bir WS istemcisine yolla
function sendQueueUpdate(ws, guildId) {
  if (ws.readyState !== 1) return;
  const queue = queues.get(guildId);
  
  ws.send(JSON.stringify({
    type: 'queue_update',
    guildId,
    queue: queue ? {
      songs: queue.songs,
      currentSong: queue.currentSong,
      isPlaying: queue.isPlaying,
      volume: queue.volume,
      loop: queue.loop,
      voiceChannelId: queue.voiceChannelId
    } : {
      songs: [],
      currentSong: null,
      isPlaying: false,
      volume: getSettings().defaultVolume || 50,
      loop: 'none',
      voiceChannelId: null
    }
  }));
}

// Sunucunun müzik durumunu dinleyen tüm WS istemcilerine yayınla
function broadcastQueueUpdate(guildId) {
  wss.clients.forEach(ws => {
    if (authenticatedWsClients.has(ws) && ws.readyState === 1) {
      sendQueueUpdate(ws, guildId);
    }
  });
}

// Bot client'a WS yayın metodunu bağla
setWsBroadcastCallback(broadcastQueueUpdate);

// Tek bir WS istemcisine sistem kaynaklarını gönder
function sendSystemStats(ws) {
  if (ws.readyState !== 1) return;
  
  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  const usedMem = totalMem - freeMem;
  const ramUsagePercent = Math.round((usedMem / totalMem) * 100);
  
  // CPU Yükü hesaplama
  const cpus = os.cpus();
  let totalIdle = 0, totalTick = 0;
  cpus.forEach(cpu => {
    for (type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });
  
  const cpuUsagePercent = Math.round(((totalTick - totalIdle) / totalTick) * 100) || 5;

  ws.send(JSON.stringify({
    type: 'system_stats',
    stats: {
      ramUsage: ramUsagePercent,
      cpuUsage: cpuUsagePercent,
      ramRaw: `${(usedMem / 1024 / 1024 / 1024).toFixed(2)} GB / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
      cpuCount: cpus.length,
      platform: os.platform(),
      uptime: os.uptime()
    }
  }));
}

// Her 5 saniyede bir tüm bağlı arayüzlere Sistem Durumunu gönder
setInterval(() => {
  wss.clients.forEach(ws => {
    if (authenticatedWsClients.has(ws) && ws.readyState === 1) {
      sendSystemStats(ws);
    }
  });
}, 5000);

// Sunucuyu Başlatma
export function startWebServer(port) {
  server.listen(port, () => {
    console.log(`🚀 Web Admin Paneli HTTP ve WebSocket sunucusu aktif: Port ${port}`);
  });
}
