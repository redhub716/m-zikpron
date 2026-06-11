import { Client, GatewayIntentBits, ActivityType } from 'discord.js';
import { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  AudioPlayerStatus, 
  VoiceConnectionStatus,
  getVoiceConnection
} from '@discordjs/voice';
import play from 'play-dl';
import { getSettings } from '../config.js';

// Discord İstemcisi oluşturulması
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

// Sunucu bazlı müzik kuyrukları
// guildId -> { voiceConnection, audioPlayer, songs: [], volume: 50, loop: 'none', textChannel, isPlaying: false, currentSong: null, stream: null }
export const queues = new Map();

// WebSocket sunucusu referansı (realtime güncellemeleri göndermek için)
let wsBroadcastCallback = null;
export function setWsBroadcastCallback(callback) {
  wsBroadcastCallback = callback;
}

function broadcastUpdate(guildId) {
  if (wsBroadcastCallback) {
    wsBroadcastCallback(guildId);
  }
}

// Ses kanalına bağlanma
export function connectToVoice(guildId, voiceChannelId, textChannel = null) {
  let queue = queues.get(guildId);
  
  const connection = joinVoiceChannel({
    channelId: voiceChannelId,
    guildId: guildId,
    adapterCreator: client.guilds.cache.get(guildId).voiceAdapterCreator,
    selfDeaf: true
  });

  if (!queue) {
    const settings = getSettings();
    const player = createAudioPlayer();
    
    queue = {
      voiceConnection: connection,
      audioPlayer: player,
      songs: [],
      volume: settings.defaultVolume || 50,
      loop: 'none', // none, song, queue
      textChannel: textChannel,
      isPlaying: false,
      currentSong: null,
      stream: null,
      voiceChannelId: voiceChannelId
    };
    
    queues.set(guildId, queue);
    
    connection.subscribe(player);
    setupPlayerListeners(guildId, player);
    setupConnectionListeners(guildId, connection);
  } else {
    queue.voiceConnection = connection;
    queue.voiceChannelId = voiceChannelId;
  }
  
  return queue;
}

// Oyuncu olay dinleyicileri
function setupPlayerListeners(guildId, player) {
  player.on(AudioPlayerStatus.Idle, () => {
    const queue = queues.get(guildId);
    if (!queue) return;
    
    queue.isPlaying = false;
    const finishedSong = queue.currentSong;
    queue.currentSong = null;
    
    if (queue.loop === 'song' && finishedSong) {
      // Tekrar çalan şarkıyı başa ekle
      queue.songs.unshift(finishedSong);
    } else if (queue.loop === 'queue' && finishedSong) {
      // Şarkıyı kuyruğun sonuna ekle
      queue.songs.push(finishedSong);
    }
    
    // Sıradaki şarkıya geç
    playNext(guildId);
  });
  
  player.on('error', error => {
    console.error(`[Guild ${guildId}] Oynatıcı Hatası:`, error);
    if (queue.textChannel) {
      queue.textChannel.send(`⚠️ Şarkı çalınırken bir hata oluştu: ${error.message}`);
    }
    playNext(guildId);
  });
}

// Bağlantı olay dinleyicileri
function setupConnectionListeners(guildId, connection) {
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      // Geçici bir kopma mı yoksa bilinçli mi anlamak için 5 saniye bekle
      await Promise.race([
        new Promise(resolve => setTimeout(resolve, 5000)),
        new Promise(resolve => {
          connection.once(VoiceConnectionStatus.Destroyed, () => resolve(true));
          connection.once(VoiceConnectionStatus.Ready, () => resolve(false));
        })
      ]);
      
      // Hala bağlı değilse temizle
      if (connection.state.status === VoiceConnectionStatus.Disconnected) {
        destroyQueue(guildId);
      }
    } catch (e) {
      console.error('Bağlantı koptuktan sonra temizleme hatası:', e);
    }
  });
}

// Kuyruğu yok et / Odadan çık
export function destroyQueue(guildId) {
  const queue = queues.get(guildId);
  if (!queue) return;
  
  try {
    queue.audioPlayer.stop();
    queue.voiceConnection.destroy();
  } catch (e) {}
  
  queues.delete(guildId);
  broadcastUpdate(guildId);
}

// Sıradaki şarkıyı çal
export async function playNext(guildId) {
  const queue = queues.get(guildId);
  if (!queue) return;
  
  if (queue.songs.length === 0) {
    queue.isPlaying = false;
    queue.currentSong = null;
    if (queue.textChannel) {
      queue.textChannel.send('🎵 Çalma sırası bitti.');
    }
    broadcastUpdate(guildId);
    return;
  }
  
  const song = queue.songs.shift();
  queue.currentSong = song;
  queue.isPlaying = true;
  
  try {
    let stream;
    let streamType;
    
    if (song.url.includes('youtube.com') || song.url.includes('youtu.be')) {
      const result = await play.stream(song.url);
      stream = result.stream;
      streamType = result.type;
    } else if (song.url.includes('soundcloud.com')) {
      const result = await play.stream(song.url);
      stream = result.stream;
      streamType = result.type;
    } else {
      // Varsayılan arama/oynatma
      const result = await play.stream(song.url);
      stream = result.stream;
      streamType = result.type;
    }
    
    const resource = createAudioResource(stream, {
      inputType: streamType,
      inlineVolume: true
    });
    
    resource.volume.setVolume(queue.volume / 100);
    queue.stream = resource;
    queue.audioPlayer.play(resource);
    
    if (queue.textChannel) {
      queue.textChannel.send(`▶️ Şimdi Çalıyor: **${song.title}** - *İsteyen: ${song.requestedBy}*`);
    }
    
    broadcastUpdate(guildId);
  } catch (err) {
    console.error('Şarkı çalma hatası:', err);
    if (queue.textChannel) {
      queue.textChannel.send(`❌ **${song.title}** oynatılamadı. Sıradakine geçiliyor...`);
    }
    playNext(guildId);
  }
}

// Arama işlemini yapan yardımcı fonksiyon (Önce SoundCloud, sonra YouTube fallback)
export async function searchMusic(query) {
  // 1. SoundCloud Araması Dene (Render üzerinde engelsiz ve çok hızlıdır)
  try {
    console.log(`🔍 SoundCloud araması başlatıldı: "${query}"`);
    const scResults = await play.search(query, { limit: 1, source: { soundcloud: 'tracks' } });
    if (scResults && scResults.length > 0) {
      const track = scResults[0];
      // Süre formatlama (saniye ise mm:ss yap)
      let duration = track.durationRaw;
      if (!duration && track.durationInSec) {
        const m = Math.floor(track.durationInSec / 60);
        const s = track.durationInSec % 60;
        duration = `${m}:${s < 10 ? '0' + s : s}`;
      }
      
      return {
        title: track.name || track.title,
        url: track.url,
        duration: duration || '0:00',
        thumbnail: track.thumbnail || track.artwork_url || (track.thumbnails && track.thumbnails[0]?.url) || ''
      };
    }
  } catch (err) {
    console.warn(`⚠️ SoundCloud araması hata verdi, YouTube deneniyor:`, err.message);
  }

  // 2. YouTube Araması Dene (Fallback)
  try {
    console.log(`🔍 YouTube araması başlatıldı (Yedek): "${query}"`);
    const ytResults = await play.search(query, { limit: 1 });
    if (ytResults && ytResults.length > 0) {
      const video = ytResults[0];
      return {
        title: video.title,
        url: video.url,
        duration: video.durationRaw || '0:00',
        thumbnail: video.thumbnails[0]?.url || ''
      };
    }
  } catch (err) {
    console.error(`❌ YouTube araması da başarısız oldu:`, err.message);
  }

  return null;
}

// Arama yap ve kuyruğa ekle
export async function searchAndQueue(query, guildId, voiceChannelId, requestedBy, textChannel = null) {
  let queue = queues.get(guildId);
  if (!queue) {
    queue = connectToVoice(guildId, voiceChannelId, textChannel);
  }
  
  let songInfo = null;
  
  try {
    // Spotify kontrolü
    if (play.is_sp_link(query)) {
      if (play.is_sp_link(query) === 'track') {
        const spData = await play.spotify(query);
        const searchResult = await searchMusic(`${spData.name} ${spData.artists[0].name}`);
        if (searchResult) {
          songInfo = {
            title: `${spData.name} - ${spData.artists.map(a => a.name).join(', ')}`,
            url: searchResult.url,
            duration: searchResult.duration,
            thumbnail: spData.thumbnail?.url || searchResult.thumbnail || '',
            requestedBy: requestedBy
          };
        }
      } else if (play.is_sp_link(query) === 'playlist' || play.is_sp_link(query) === 'album') {
        const spPlaylist = await play.spotify(query);
        const tracks = await spPlaylist.all_tracks();
        
        let addedCount = 0;
        if (textChannel) textChannel.send(`🔍 Spotify listesinden şarkılar alınıyor, lütfen bekleyin...`);
        
        for (const track of tracks.slice(0, 50)) { // Render CPU sınırları ve hız için ilk 50 şarkıyı sınırla
          try {
            const searchResult = await searchMusic(`${track.name} ${track.artists[0].name}`);
            if (searchResult) {
              queue.songs.push({
                title: `${track.name} - ${track.artists.map(a => a.name).join(', ')}`,
                url: searchResult.url,
                duration: searchResult.duration,
                thumbnail: track.thumbnail?.url || searchResult.thumbnail || '',
                requestedBy: requestedBy
              });
              addedCount++;
              
              if (!queue.isPlaying && queue.songs.length === 1) {
                // İlk şarkı eklendiğinde hemen çalmaya başla
                playNext(guildId);
              }
            }
          } catch (e) {
            console.error('Spotify track arama hatası:', e);
          }
        }
        
        if (textChannel) textChannel.send(`✅ Spotify listesinden **${addedCount}** şarkı sıraya eklendi.`);
        broadcastUpdate(guildId);
        return;
      }
    } 
    // YouTube / SoundCloud / Direkt link kontrolü
    else if (query.startsWith('http')) {
      if (query.includes('youtube.com/playlist') || query.includes('list=')) {
        const playlist = await play.playlist_info(query, { incomplete: true });
        const videos = await playlist.all_videos();
        
        for (const video of videos) {
          queue.songs.push({
            title: video.title,
            url: video.url,
            duration: video.durationRaw || '0:00',
            thumbnail: video.thumbnails[0]?.url || '',
            requestedBy: requestedBy
          });
          
          if (!queue.isPlaying && queue.songs.length === 1) {
            playNext(guildId);
          }
        }
        
        if (textChannel) textChannel.send(`✅ Oynatma listesinden **${videos.length}** şarkı sıraya eklendi.`);
        broadcastUpdate(guildId);
        return;
      } else {
        const info = await play.video_info(query).catch(async () => {
          // SoundCloud veya diğer linkler
          if (query.includes('soundcloud.com')) {
            return await play.soundcloud(query);
          }
          return null;
        });
        
        if (info) {
          songInfo = {
            title: info.title || info.name,
            url: info.url || query,
            duration: info.durationRaw || '0:00',
            thumbnail: info.thumbnails ? info.thumbnails[0]?.url : (info.thumbnail?.url || ''),
            requestedBy: requestedBy
          };
        }
      }
    } 
    // Metin araması (Önce SoundCloud, sonra YouTube)
    else {
      const searchResult = await searchMusic(query);
      if (searchResult) {
        songInfo = {
          title: searchResult.title,
          url: searchResult.url,
          duration: searchResult.duration,
          thumbnail: searchResult.thumbnail,
          requestedBy: requestedBy
        };
      }
    }
    
    if (!songInfo) {
      if (textChannel) textChannel.send(`❌ Herhangi bir sonuç bulunamadı: **${query}**`);
      return;
    }
    
    queue.songs.push(songInfo);
    
    if (textChannel) {
      if (queue.isPlaying && queue.currentSong) {
        textChannel.send(`📝 **${songInfo.title}** sıraya eklendi. (Sıradaki Pozisyon: #${queue.songs.length})`);
      }
    }
    
    if (!queue.isPlaying && !queue.currentSong) {
      await playNext(guildId);
    } else {
      broadcastUpdate(guildId);
    }
    
  } catch (err) {
    console.error('Arama ve sıraya ekleme hatası:', err);
    if (textChannel) {
      textChannel.send(`⚠️ Arama yapılırken bir hata oluştu: ${err.message}`);
    }
  }
}
