import { ApplicationCommandOptionType } from 'discord.js';
import { searchAndQueue, queues, playNext, destroyQueue } from './client.js';

// Slash komutlarının tanımları
export const commandsData = [
  {
    name: 'play',
    description: 'Şarkı arar veya YouTube/Spotify/Soundcloud linkini çalar.',
    options: [
      {
        name: 'şarkı',
        type: ApplicationCommandOptionType.String,
        description: 'Şarkı adı, youtube linki, spotify linki vb.',
        required: true
      }
    ]
  },
  {
    name: 'skip',
    description: 'Çalan şarkıyı geçerek sıradakine atlar.'
  },
  {
    name: 'stop',
    description: 'Müziği tamamen durdurur, sırayı temizler ve kanaldan ayrılır.'
  },
  {
    name: 'queue',
    description: 'Mevcut müzik sırasını listeler.'
  },
  {
    name: 'pause',
    description: 'Çalan şarkıyı duraklatır.'
  },
  {
    name: 'resume',
    description: 'Duraklatılmış şarkıyı devam ettirir.'
  },
  {
    name: 'volume',
    description: 'Ses seviyesini ayarlar.',
    options: [
      {
        name: 'seviye',
        type: ApplicationCommandOptionType.Integer,
        description: 'Ses seviyesi (0 - 100 arası)',
        required: true,
        min_value: 0,
        max_value: 100
      }
    ]
  },
  {
    name: 'loop',
    description: 'Tekrarlama modunu değiştirir.',
    options: [
      {
        name: 'mod',
        type: ApplicationCommandOptionType.String,
        description: 'Tekrarlama modu seçin',
        required: true,
        choices: [
          { name: 'Kapat (Tekrarlama Yok)', value: 'none' },
          { name: 'Tek Şarkıyı Tekrarla', value: 'song' },
          { name: 'Tüm Sırayı Tekrarla', value: 'queue' }
        ]
      }
    ]
  },
  {
    name: 'nowplaying',
    description: 'Şu anda çalan şarkının bilgilerini gösterir.'
  },
  {
    name: 'panel',
    description: 'Web Admin Paneli bağlantısını ve doğrulama yönergelerini gönderir.'
  }
];

// Komutları Discord API'sine kaydetme (Global)
export async function registerCommands(client) {
  try {
    console.log('Slash komutları kaydediliyor...');
    await client.application.commands.set(commandsData);
    console.log('Slash komutları başarıyla kaydedildi!');
  } catch (error) {
    console.error('Slash komutları kaydedilirken hata oluştu:', error);
  }
}

// Komut etkileşimlerini (interactions) işleme
export async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guildId, member, channel } = interaction;
  
  if (!guildId) {
    return interaction.reply({ content: 'Bu komut sadece sunucularda kullanılabilir!', ephemeral: true });
  }

  // Ses kanalı kontrolü gereken komutlar
  const voiceChannel = member.voice.channel;
  if (!voiceChannel && ['play', 'skip', 'stop', 'pause', 'resume', 'volume', 'loop'].includes(commandName)) {
    return interaction.reply({ content: '⚠️ Bu komutu kullanmak için bir ses kanalında olmalısınız!', ephemeral: true });
  }

  const queue = queues.get(guildId);

  // Play komutu
  if (commandName === 'play') {
    await interaction.deferReply();
    const query = interaction.options.getString('şarkı');
    
    await interaction.editReply(`🔍 **"${query}"** aranıyor...`);
    
    // Aramayı başlat ve kuyruğa ekle
    await searchAndQueue(query, guildId, voiceChannel.id, member.user.username, channel);
    return;
  }

  // Skip komutu
  if (commandName === 'skip') {
    if (!queue || !queue.isPlaying) {
      return interaction.reply({ content: '❌ Şu anda çalan bir şarkı yok!', ephemeral: true });
    }
    
    interaction.reply(`⏭️ **${queue.currentSong.title}** geçildi.`);
    playNext(guildId);
    return;
  }

  // Stop komutu
  if (commandName === 'stop') {
    if (!queue) {
      return interaction.reply({ content: '❌ Bot zaten aktif değil!', ephemeral: true });
    }
    
    destroyQueue(guildId);
    return interaction.reply('⏹️ Müzik durduruldu, sıradakiler temizlendi ve kanaldan ayrılındı.');
  }

  // Queue komutu
  if (commandName === 'queue') {
    if (!queue || (!queue.currentSong && queue.songs.length === 0)) {
      return interaction.reply('📭 Müzik kuyruğu şu anda boş.');
    }

    let embedText = `▶️ **Şu an Çalan:** ${queue.currentSong ? queue.currentSong.title : 'Hiçbiri'}\n\n`;
    
    if (queue.songs.length > 0) {
      embedText += `**Sıradaki Şarkılar:**\n`;
      const maxSongsToShow = 10;
      const displayedSongs = queue.songs.slice(0, maxSongsToShow);
      
      displayedSongs.forEach((song, idx) => {
        embedText += `**${idx + 1}.** ${song.title} (${song.duration}) - *İsteyen: ${song.requestedBy}*\n`;
      });
      
      if (queue.songs.length > maxSongsToShow) {
        embedText += `\n*...ve ${queue.songs.length - maxSongsToShow} şarkı daha var.*`;
      }
    } else {
      embedText += '*Sırada başka şarkı yok.*';
    }

    embedText += `\n\n🔁 Tekrar Modu: **${queue.loop === 'song' ? 'Tek Şarkı' : (queue.loop === 'queue' ? 'Tüm Sıra' : 'Kapalı')}** | 🔊 Ses Seviyesi: **%${queue.volume}**`;

    return interaction.reply({
      embeds: [{
        title: '🎵 Müzik Kuyruğu',
        description: embedText,
        color: 0x5865F2
      }]
    });
  }

  // Pause komutu
  if (commandName === 'pause') {
    if (!queue || !queue.isPlaying) {
      return interaction.reply({ content: '❌ Şu anda çalan bir şarkı yok!', ephemeral: true });
    }
    
    queue.audioPlayer.pause();
    queue.isPlaying = false;
    return interaction.reply('⏸️ Müzik duraklatıldı.');
  }

  // Resume komutu
  if (commandName === 'resume') {
    if (!queue) {
      return interaction.reply({ content: '❌ Aktif bir müzik oturumu yok!', ephemeral: true });
    }
    
    queue.audioPlayer.unpause();
    queue.isPlaying = true;
    return interaction.reply('▶️ Müzik devam ettiriliyor.');
  }

  // Volume komutu
  if (commandName === 'volume') {
    const level = interaction.options.getInteger('seviye');
    
    if (!queue) {
      return interaction.reply({ content: '❌ Aktif bir müzik oturumu yok!', ephemeral: true });
    }
    
    queue.volume = level;
    if (queue.stream) {
      queue.stream.volume.setVolume(level / 100);
    }
    
    return interaction.reply(`🔊 Ses seviyesi **%${level}** olarak ayarlandı.`);
  }

  // Loop komutu
  if (commandName === 'loop') {
    const mode = interaction.options.getString('mod');
    
    if (!queue) {
      return interaction.reply({ content: '❌ Aktif bir müzik oturumu yok!', ephemeral: true });
    }
    
    queue.loop = mode;
    
    const modeNames = {
      none: 'Kapalı (Tekrarlama Yok)',
      song: 'Tek Şarkıyı Tekrarla',
      queue: 'Tüm Sırayı Tekrarla'
    };
    
    return interaction.reply(`🔁 Tekrarlama modu değiştirildi: **${modeNames[mode]}**`);
  }

  // Nowplaying komutu
  if (commandName === 'nowplaying') {
    if (!queue || !queue.currentSong) {
      return interaction.reply('❌ Şu anda çalan bir şarkı yok.');
    }
    
    return interaction.reply({
      embeds: [{
        title: `🎶 Şu Anda Çalıyor`,
        description: `**[${queue.currentSong.title}](${queue.currentSong.url})**\n\n` +
                     `⏱️ **Süre:** ${queue.currentSong.duration}\n` +
                     `👤 **İsteyen:** ${queue.currentSong.requestedBy}`,
        thumbnail: { url: queue.currentSong.thumbnail },
        color: 0x5865F2
      }]
    });
  }

  // Panel komutu
  if (commandName === 'panel') {
    const host = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;
    return interaction.reply({
      embeds: [{
        title: '🖥️ Web Admin Paneli',
        description: `Botu kontrol etmek için web paneline erişebilirsiniz.\n\n` +
                     `🔗 **Web Paneli Linki:** ${host}\n\n` +
                     `**Nasıl Giriş Yapılır?**\n` +
                     `1. Siteye girin.\n` +
                     `2. Discord ID'nizi girin (\`${interaction.user.id}\`).\n` +
                     `3. Bot size DM'den tek kullanımlık bir giriş kodu gönderecektir.\n` +
                     `4. Kodu girip panele giriş yapın!`,
        color: 0x57F287
      }],
      ephemeral: true
    });
  }
}
