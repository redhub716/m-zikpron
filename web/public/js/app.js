// --- GLOBAL DEĞİŞKENLER VE DURUM YÖNETİMİ ---
let token = localStorage.getItem('token');
let userId = localStorage.getItem('userId');
let activeGuildId = null;
let currentQueueData = null;
let ws = null;
let reconnectInterval = null;

// Şarkı süresini istemci tarafında saniye saniye artırmak için sayaç
let songProgressTimer = null;
let currentProgressSec = 0;
let totalDurationSec = 0;

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', () => {
  // Lucide ikonlarını yükle
  lucide.createIcons();
  
  // Renk Temasını Başlat
  initTheme();
  
  // İlk ekran kontrolü
  checkAuth();
  
  // Olay Dinleyicileri (Event Listeners) Kaydet
  setupEventListeners();
});

// --- KİMLİK DOĞRULAMA (AUTH) İŞLEMLERİ ---

function checkAuth() {
  if (token && userId) {
    // Token doğrulamak için bot durumunu çekmeyi dene
    fetchBotStatus()
      .then(data => {
        if (data.success) {
          showDashboard(data);
        } else {
          logout();
        }
      })
      .catch(() => {
        // Sunucu kapalı olabilir veya token geçersizdir, temizleyip giriş ekranına alalım
        logout();
      });
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-container').classList.remove('hidden');
  document.getElementById('dashboard-container').classList.add('hidden');
  closeWebSocket();
}

function showDashboard(statusData) {
  document.getElementById('login-container').classList.add('hidden');
  document.getElementById('dashboard-container').classList.remove('hidden');
  
  // Bot temel bilgilerini yerleştir
  const bot = statusData.bot;
  document.getElementById('bot-name').innerText = bot.tag;
  document.getElementById('bot-avatar').src = bot.avatar;
  
  // Sunucu listesini select kutusuna doldur
  populateGuildSelect(statusData.guilds);
  
  // Ana sayfa metriklerini güncelle
  updateHomeStats(statusData);
  
  // Real-time WebSocket bağlantısını başlat
  initWebSocket();
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('userId');
  token = null;
  userId = null;
  showLogin();
}

// --- VERİ ÇEKME & API AĞ İSTEKLERİ ---

async function apiRequest(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(endpoint, options);
  
  // 401 veya 403 ise oturumu sonlandır
  if (response.status === 401 || response.status === 403) {
    logout();
    throw new Error('Oturum sonlandırıldı.');
  }
  
  return await response.json();
}

function fetchBotStatus() {
  return apiRequest('/api/bot/status');
}

// --- EVENT LISTENERS (OLAY DİNLEYİCİLERİ) ---

function setupEventListeners() {
  // 1. Giriş Kod Talebi Formu
  const authRequestForm = document.getElementById('auth-request-form');
  authRequestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputId = document.getElementById('discord-id').value.trim();
    const btn = document.getElementById('btn-request-code');
    const msgEl = document.getElementById('auth-message');
    
    if (!inputId) return;
    
    setLoading(btn, true, 'Kod Gönderiliyor...');
    msgEl.classList.add('hidden');
    
    try {
      const res = await apiRequest('/api/auth/request-code', 'POST', { userId: inputId });
      
      if (res.success) {
        userId = inputId;
        localStorage.setItem('userId', userId);
        
        // Formları değiştir
        authRequestForm.classList.add('hidden');
        document.getElementById('auth-verify-form').classList.remove('hidden');
        
        showMsg(msgEl, 'success', res.message);
      } else {
        showMsg(msgEl, 'error', res.message);
      }
    } catch (err) {
      showMsg(msgEl, 'error', err.message || 'Kod gönderilirken ağ hatası oluştu.');
    } finally {
      setLoading(btn, false, 'Kod Gönder', 'send');
    }
  });

  // 2. Kod Doğrulama Formu
  const authVerifyForm = document.getElementById('auth-verify-form');
  authVerifyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('verify-code').value.trim();
    const btn = document.getElementById('btn-verify-code');
    const msgEl = document.getElementById('auth-message');
    
    if (!code || !userId) return;
    
    setLoading(btn, true, 'Doğrulanıyor...');
    msgEl.classList.add('hidden');
    
    try {
      const res = await apiRequest('/api/auth/verify', 'POST', { userId, code });
      
      if (res.success) {
        token = res.token;
        localStorage.setItem('token', token);
        
        showMsg(msgEl, 'success', 'Giriş Başarılı! Yönlendiriliyorsunuz...');
        setTimeout(() => {
          authVerifyForm.classList.add('hidden');
          authRequestForm.classList.remove('hidden');
          document.getElementById('verify-code').value = '';
          document.getElementById('discord-id').value = '';
          msgEl.classList.add('hidden');
          checkAuth();
        }, 1500);
      } else {
        showMsg(msgEl, 'error', res.message);
      }
    } catch (err) {
      showMsg(msgEl, 'error', err.message || 'Doğrulama sırasında hata oluştu.');
    } finally {
      setLoading(btn, false, 'Giriş Yap', 'log-in');
    }
  });

  // Giriş geri butonu
  document.getElementById('btn-back').addEventListener('click', () => {
    document.getElementById('auth-verify-form').classList.add('hidden');
    document.getElementById('auth-request-form').classList.remove('hidden');
    document.getElementById('auth-message').classList.add('hidden');
  });

  // Çıkış yap butonu
  document.getElementById('btn-logout').addEventListener('click', logout);

  // 3. Menü Değişikliği (Tab Değişimi)
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabName = item.getAttribute('data-tab');
      
      // Nav sınıflarını güncelle
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      // Tab panellerini güncelle
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      document.getElementById(`tab-${tabName}`).classList.add('active');
      
      // Başlıkları güncelle
      updatePageTitles(tabName);
      
      // Sekmeye özel veri yüklemelerini tetikle
      if (tabName === 'security') {
        loadSecuritySettings();
      }
    });
  });

  // 4. Sunucu Seçimi Değiştiğinde
  const guildSelect = document.getElementById('guild-select');
  guildSelect.addEventListener('change', () => {
    activeGuildId = guildSelect.value;
    if (ws && ws.readyState === 1) {
      // Yeni sunucunun müzik durumunu dinle
      ws.send(JSON.stringify({ type: 'subscribe', guildId: activeGuildId }));
    }
    
    // Ses kanallarını yükle (Arama kartı için)
    loadVoiceChannels(activeGuildId);
  });

  // 5. Müzik Kontrolleri
  document.getElementById('btn-play-pause').addEventListener('click', () => {
    if (!activeGuildId || !currentQueueData) return;
    const action = currentQueueData.isPlaying ? 'pause' : 'play';
    controlBot(action);
  });

  document.getElementById('btn-skip').addEventListener('click', () => {
    if (!activeGuildId) return;
    controlBot('skip');
  });

  document.getElementById('btn-stop').addEventListener('click', () => {
    if (!activeGuildId) return;
    controlBot('stop');
  });

  // Tekrar modu
  document.getElementById('btn-loop-mode').addEventListener('click', () => {
    if (!activeGuildId || !currentQueueData) return;
    let nextMode = 'none';
    if (currentQueueData.loop === 'none') nextMode = 'song';
    else if (currentQueueData.loop === 'song') nextMode = 'queue';
    
    controlBot('loop', nextMode);
  });

  // Ses Barı
  const volumeSlider = document.getElementById('volume-slider');
  volumeSlider.addEventListener('input', (e) => {
    const vol = e.target.value;
    document.getElementById('volume-val').innerText = `%${vol}`;
    updateVolumeIcon(vol);
  });
  
  // Ses değiştirme bittiğinde (Veritabanını yormamak için change olayında istek atıyoruz)
  volumeSlider.addEventListener('change', (e) => {
    if (!activeGuildId) return;
    controlBot('volume', e.target.value);
  });

  // 6. Şarkı Arama ve Çalma Formu
  const searchForm = document.getElementById('search-music-form');
  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeGuildId) return alert('Lütfen önce bir sunucu seçin!');
    
    const query = document.getElementById('search-query').value.trim();
    const voiceChannelId = document.getElementById('vc-select').value;
    const btn = searchForm.querySelector('button[type="submit"]');
    
    if (!query || !voiceChannelId) return;
    
    setLoading(btn, true, 'Aranıyor...');
    
    try {
      const res = await apiRequest(`/api/bot/queue/${activeGuildId}/add`, 'POST', { query, voiceChannelId });
      if (res.success) {
        document.getElementById('search-query').value = '';
      } else {
        alert(res.message);
      }
    } catch (err) {
      alert('Şarkı sıraya eklenemedi: ' + err.message);
    } finally {
      setLoading(btn, false, 'Sıraya Ekle', 'music-2');
    }
  });

  // Sırayı temizle
  document.getElementById('btn-clear-queue').addEventListener('click', () => {
    if (!activeGuildId || !confirm('Oynatma sırasını tamamen temizlemek istiyor musunuz?')) return;
    controlBot('clear');
  });

  // 7. Yeni Yönetici Ekleme Formu
  const addAdminForm = document.getElementById('add-admin-form');
  addAdminForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newId = document.getElementById('new-admin-id').value.trim();
    const btn = addAdminForm.querySelector('button[type="submit"]');
    const msgEl = document.getElementById('security-message');
    
    if (!newId) return;
    
    setLoading(btn, true, 'Ekleniyor...');
    msgEl.classList.add('hidden');
    
    try {
      const res = await apiRequest('/api/settings/security/add', 'POST', { userId: newId });
      if (res.success) {
        document.getElementById('new-admin-id').value = '';
        showMsg(msgEl, 'success', res.message);
        loadSecuritySettings(); // Listeyi yenile
      } else {
        showMsg(msgEl, 'error', res.message);
      }
    } catch (err) {
      showMsg(msgEl, 'error', err.message || 'Kullanıcı eklenirken hata oluştu.');
    } finally {
      setLoading(btn, false, 'Yetkilendir', 'plus');
    }
  });

  // --- Renk Teması Seçici Etkinlikleri (Yeni) ---
  document.querySelectorAll('.theme-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const theme = dot.getAttribute('data-theme');
      applyTheme(theme);
    });
  });

  // --- Hızlı Şarkı Çalma Buton Etkinlikleri (Yeni) ---
  document.querySelectorAll('.btn-quick').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!activeGuildId) return alert('Lütfen önce bir sunucu seçin!');
      
      const query = btn.getAttribute('data-query');
      const voiceChannelSelect = document.getElementById('vc-select');
      const voiceChannelId = voiceChannelSelect.value;
      
      if (!voiceChannelId) {
        return alert('Lütfen botun katılacağı bir ses kanalı seçin!');
      }
      
      // Arama kutusuna doldur ve formu tetikle
      document.getElementById('search-query').value = query;
      
      // Arama butonunu bul ve tıkla
      const searchForm = document.getElementById('search-music-form');
      const submitBtn = searchForm.querySelector('button[type="submit"]');
      submitBtn.click();
    });
  });
}

// --- TEMA YÖNETİM FONKSİYONLARI (Yeni) ---
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'purple';
  applyTheme(savedTheme);
}

function applyTheme(themeName) {
  // Önceki sınıfları temizle
  document.body.classList.remove('theme-purple', 'theme-cyan', 'theme-pink', 'theme-green');
  
  // Yeni temayı ekle (Mor varsayılan olduğu için eklemeye gerek yok)
  if (themeName !== 'purple') {
    document.body.classList.add(`theme-${themeName}`);
  }
  
  // Aktif noktayı görsel olarak güncelle
  document.querySelectorAll('.theme-dot').forEach(dot => {
    if (dot.getAttribute('data-theme') === themeName) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
  
  localStorage.setItem('theme', themeName);
}

// --- DİNAMİK ARAYÜZ YARDIMCILARI ---

function setLoading(button, isLoading, text = '', iconName = '') {
  if (isLoading) {
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> <span>${text}</span>`;
  } else {
    button.disabled = false;
    let iconHtml = iconName ? `<i data-lucide="${iconName}"></i>` : '';
    button.innerHTML = `<span>${text}</span> ${iconHtml}`;
    if (iconName) lucide.createIcons();
  }
}

function showMsg(element, type, text) {
  element.innerText = text;
  element.className = `alert ${type}`;
  element.classList.remove('hidden');
}

function updatePageTitles(tabName) {
  const title = document.getElementById('page-title-text');
  const subtitle = document.getElementById('page-subtitle-text');
  
  if (tabName === 'home') {
    title.innerText = 'Genel Bakış';
    subtitle.innerText = 'Botun anlık durumunu ve sistem kaynaklarını inceleyin.';
  } else if (tabName === 'music') {
    title.innerText = 'Müzik Kontrolü';
    subtitle.innerText = 'Aktif sunucunun şarkılarını çalın, duraklatın ve sırayı yönetin.';
  } else if (tabName === 'security') {
    title.innerText = 'Güvenlik & Yetki';
    subtitle.innerText = 'Paneli yönetebilecek yetkili Discord ID\'lerini düzenleyin.';
  }
}

// --- VERİ YERLEŞTİRME VE GÜNCELLEME ---

function populateGuildSelect(guilds) {
  const select = document.getElementById('guild-select');
  select.innerHTML = '';
  
  if (guilds.length === 0) {
    select.innerHTML = '<option value="" disabled selected>Sunucu bulunamadı</option>';
    return;
  }
  
  guilds.forEach((g, index) => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.innerText = g.name;
    // İlk sunucuyu varsayılan seç
    if (index === 0) {
      opt.selected = true;
      activeGuildId = g.id;
    }
    select.appendChild(opt);
  });
  
  // Seçilen sunucunun ses kanallarını çek
  loadVoiceChannels(activeGuildId);
}

function updateHomeStats(statusData) {
  const bot = statusData.bot;
  document.getElementById('stat-guilds').innerText = bot.guildCount;
  document.getElementById('bot-ping').innerText = `${bot.ping} ms`;
  
  // Uptime çevirme
  const uptimeMs = bot.uptime;
  const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((uptimeMs / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((uptimeMs / (1000 * 60)) % 60);
  
  let uptimeStr = '';
  if (days > 0) uptimeStr += `${days}g `;
  if (hours > 0 || days > 0) uptimeStr += `${hours}s `;
  uptimeStr += `${minutes}dk`;
  
  document.getElementById('stat-uptime').innerText = uptimeStr;
  
  // Aktif müzik çalan kanal sayısı
  const activePlaying = statusData.guilds.filter(g => g.isPlaying).length;
  document.getElementById('stat-playing-count').innerText = `${activePlaying} Sunucu`;
}

// Ses kanallarını yükle
async function loadVoiceChannels(guildId) {
  if (!guildId) return;
  const select = document.getElementById('vc-select');
  
  try {
    const res = await apiRequest(`/api/bot/channels/${guildId}`);
    select.innerHTML = '';
    
    if (res.success && res.channels.length > 0) {
      res.channels.forEach(ch => {
        const opt = document.createElement('option');
        opt.value = ch.id;
        opt.innerText = ch.name;
        select.appendChild(opt);
      });
    } else {
      select.innerHTML = '<option value="" disabled selected>Ses kanalı bulunamadı!</option>';
    }
  } catch (err) {
    console.error('Ses kanalı çekme hatası:', err);
  }
}

// --- WEBSOCKET BAĞLANTISI (REALTIME GÜNCELLEME) ---

function initWebSocket() {
  closeWebSocket(); // Varsa eskiyi temizle
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const wsUrl = `${protocol}//${host}`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('🔌 WebSocket Bağlantısı Kuruldu.');
    // Yetkilendirme gönder
    ws.send(JSON.stringify({ type: 'auth', token }));
    
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === 'authorized') {
        console.log('🔑 WS Yetkilendirmesi Başarılı.');
        // Şu an seçili sunucunun müzik verisini abone ol
        if (activeGuildId) {
          ws.send(JSON.stringify({ type: 'subscribe', guildId: activeGuildId }));
        }
      }
      
      else if (data.type === 'system_stats') {
        updateSystemStatsUI(data.stats);
      }
      
      else if (data.type === 'queue_update' && data.guildId === activeGuildId) {
        updatePlayerAndQueueUI(data.queue);
      }
      
    } catch (e) {
      console.error('WS mesaj işleme hatası:', e);
    }
  };
  
  ws.onclose = () => {
    console.log('❌ WebSocket Bağlantısı Koptu. Yeniden deneniyor...');
    if (!reconnectInterval) {
      reconnectInterval = setInterval(initWebSocket, 5000);
    }
  };
}

function closeWebSocket() {
  if (ws) {
    ws.onclose = null; // Kendi kendine tetiklemeyi önle
    ws.close();
    ws = null;
  }
}

// --- SİSTEM KAYNAK GÜNCELLEMELERİ ---

function updateSystemStatsUI(stats) {
  // RAM ve CPU Dairesel Çubuk Değişimi
  updateProgressRing('cpu', stats.cpuUsage);
  updateProgressRing('ram', stats.ramUsage);
  
  // Metin Bilgileri
  document.getElementById('ram-raw').innerText = stats.ramRaw;
  document.getElementById('sys-platform').innerText = stats.platform;
  document.getElementById('sys-cpu-cores').innerText = `${stats.cpuCount} Çekirdek`;
}

function updateProgressRing(type, percent) {
  const circle = document.getElementById(`${type}-circle`);
  const textVal = document.getElementById(`${type}-val`);
  
  // Radius 50 için çevre: 2 * PI * r = 314
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  
  circle.style.strokeDasharray = `${circumference} ${circumference}`;
  const offset = circumference - (percent / 100) * circumference;
  circle.style.strokeDashoffset = offset;
  
  textVal.innerText = `${percent}%`;
}

// --- MÜZİK OYNATICI VE SIRA GÜNCELLEMELERİ (API & UI) ---

function updatePlayerAndQueueUI(queue) {
  currentQueueData = queue;
  
  // 1. Oynatıcı Kartı Durumu
  const playerCard = document.querySelector('.player-card');
  const songTitle = document.getElementById('player-song-title');
  const songRequester = document.getElementById('player-song-requester');
  const playIcon = document.getElementById('play-icon');
  const albumArt = document.getElementById('player-album-art');
  const bgArt = document.getElementById('player-bg-art');
  
  // Ses seviyesini güncelle (Görsel sürükleme sırasında çakışmamak için sadece dış güncelleme)
  const volumeSlider = document.getElementById('volume-slider');
  if (document.activeElement !== volumeSlider) {
    volumeSlider.value = queue.volume;
    document.getElementById('volume-val').innerText = `%${queue.volume}`;
    updateVolumeIcon(queue.volume);
  }

  // Döngü modu rozeti
  const loopBadge = document.getElementById('loop-badge');
  const loopBtn = document.getElementById('btn-loop-mode');
  if (queue.loop === 'song') {
    loopBadge.innerText = 'ŞARKI';
    loopBtn.classList.add('active-loop');
  } else if (queue.loop === 'queue') {
    loopBadge.innerText = 'SIRAYLA';
    loopBtn.classList.add('active-loop');
  } else {
    loopBadge.innerText = 'KAPALI';
    loopBtn.classList.remove('active-loop');
  }

  // Çalıyor/Duraklatıldı görselleştiricisi
  if (queue.isPlaying) {
    playerCard.classList.add('playing');
    playIcon.setAttribute('data-lucide', 'pause');
  } else {
    playerCard.classList.remove('playing');
    playIcon.setAttribute('data-lucide', 'play');
  }
  lucide.createIcons();

  // Şarkı Bilgileri Yerleşimi
  if (queue.currentSong) {
    songTitle.innerText = queue.currentSong.title;
    songRequester.innerText = `İsteyen: ${queue.currentSong.requestedBy}`;
    albumArt.src = queue.currentSong.thumbnail || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=300&h=300&auto=format&fit=crop';
    bgArt.style.backgroundImage = `url('${queue.currentSong.thumbnail || ''}')`;
    
    // Süre Çubuğu Başlangıç Değerlerini Ayarla
    document.getElementById('total-time').innerText = queue.currentSong.duration;
    
    // Saniye çevirmece
    totalDurationSec = parseDurationToSeconds(queue.currentSong.duration);
    
    // Eğer çalmaya yeni başlandıysa veya şarkı değiştiyse süreyi sıfırla/eşitle
    if (queue.isPlaying) {
      startProgressCounter();
    } else {
      stopProgressCounter();
    }
  } else {
    songTitle.innerText = 'Oynatılan Şarkı Yok';
    songRequester.innerText = 'Aktif çalma oturumu bulunamadı.';
    albumArt.src = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=300&h=300&auto=format&fit=crop';
    bgArt.style.backgroundImage = 'none';
    document.getElementById('current-time').innerText = '0:00';
    document.getElementById('total-time').innerText = '0:00';
    document.getElementById('song-progress').style.width = '0%';
    stopProgressCounter();
  }

  // 2. Müzik Kuyruğu Listesi Oluştur
  const queueList = document.getElementById('queue-list-el');
  const clearBtn = document.getElementById('btn-clear-queue');
  queueList.innerHTML = '';
  
  if (queue.songs.length === 0) {
    queueList.innerHTML = `
      <li class="queue-empty">
        <i data-lucide="disc"></i>
        <p>Sırada bekleyen şarkı yok.</p>
      </li>
    `;
    clearBtn.classList.add('hidden');
    lucide.createIcons();
    return;
  }
  
  clearBtn.classList.remove('hidden');
  
  queue.songs.forEach((song, idx) => {
    const li = document.createElement('li');
    li.className = 'queue-item';
    li.innerHTML = `
      <span class="queue-index">#${idx + 1}</span>
      <img src="${song.thumbnail || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=60&h=60&auto=format&fit=crop'}" alt="Şarkı Resmi">
      <div class="queue-item-details">
        <h4 class="queue-item-title" title="${song.title}">${song.title}</h4>
        <div class="queue-item-meta">Süre: ${song.duration} | İsteyen: ${song.requestedBy}</div>
      </div>
      <button class="btn-remove-queue" onclick="removeQueueSong(${idx})" title="Sıradan Çıkar">
        <i data-lucide="trash-2"></i>
      </button>
    `;
    queueList.appendChild(li);
  });
  
  lucide.createIcons();
}

// İstemci tarafında süre çubuğu ilerletme (Performans için WS yerine bu kullanılır)
function startProgressCounter() {
  stopProgressCounter();
  
  // Süreyi sunucudan anlık alamadığımız için sıfırdan başlarız, 
  // ancak şarkı değiştiğinde veya yeniden senkronizasyonda bu değer güncellenir.
  songProgressTimer = setInterval(() => {
    if (currentProgressSec < totalDurationSec) {
      currentProgressSec++;
      
      // Süre etiketini güncelle
      document.getElementById('current-time').innerText = formatSecondsToTime(currentProgressSec);
      
      // Çubuk doluluğunu güncelle
      const percent = (currentProgressSec / totalDurationSec) * 100;
      document.getElementById('song-progress').style.width = `${percent}%`;
    } else {
      stopProgressCounter();
    }
  }, 1000);
}

function stopProgressCounter() {
  if (songProgressTimer) {
    clearInterval(songProgressTimer);
    songProgressTimer = null;
  }
  // Eğer şarkı yoksa tamamen sıfırla
  if (!currentQueueData || !currentQueueData.currentSong) {
    currentProgressSec = 0;
  }
}

// Şarkı süresini (03:45 veya 1:24:00) saniyeye çevirme
function parseDurationToSeconds(durStr) {
  if (!durStr) return 0;
  const parts = durStr.split(':').map(Number);
  if (parts.length === 3) {
    // Saat:Dakika:Saniye
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // Dakika:Saniye
    return parts[0] * 60 + parts[1];
  }
  return parseInt(durStr) || 0;
}

// Saniyeyi Dakika:Saniye formatına çevirme
function formatSecondsToTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  const mStr = m.toString();
  const sStr = s < 10 ? `0${s}` : s.toString();
  
  if (h > 0) {
    const mPad = m < 10 ? `0${m}` : m.toString();
    return `${h}:${mPad}:${sStr}`;
  }
  return `${mStr}:${sStr}`;
}

function updateVolumeIcon(vol) {
  const icon = document.getElementById('volume-icon');
  if (vol == 0) icon.setAttribute('data-lucide', 'volume-x');
  else if (vol < 40) icon.setAttribute('data-lucide', 'volume');
  else if (vol < 80) icon.setAttribute('data-lucide', 'volume-1');
  else icon.setAttribute('data-lucide', 'volume-2');
  lucide.createIcons();
}

// Bot Müzik Kontrol İsteği Gönder (Play, Pause, vb.)
async function controlBot(action, value = null) {
  if (!activeGuildId) return;
  try {
    const res = await apiRequest(`/api/bot/control/${activeGuildId}`, 'POST', { action, value });
    if (!res.success) {
      alert(res.message);
    }
  } catch (err) {
    console.error('Kontrol hatası:', err);
  }
}

// Kuyruktan belirli şarkıyı sil
window.removeQueueSong = function(index) {
  if (!activeGuildId) return;
  controlBot('remove_song', index);
};

// --- GÜVENLİK SEKME YÖNETİMİ ---

async function loadSecuritySettings() {
  const container = document.getElementById('admin-list-el');
  container.innerHTML = '<div class="admin-item-skeleton">Kullanıcılar Yükleniyor...</div>';
  
  try {
    const res = await apiRequest('/api/settings/security');
    container.innerHTML = '';
    
    if (res.success && res.users.length > 0) {
      res.users.forEach(u => {
        const div = document.createElement('div');
        div.className = 'admin-item';
        div.innerHTML = `
          <div class="admin-item-info">
            <img src="${u.avatar}" alt="${u.username} avatar">
            <div class="admin-item-meta">
              <span class="admin-item-name">${u.username}</span>
              <span class="admin-item-id">ID: ${u.id}</span>
            </div>
          </div>
          <button class="btn-remove-admin" onclick="removeAdmin('${u.id}')" title="Yetkiyi Kaldır">
            <i data-lucide="user-x"></i>
          </button>
        `;
        container.appendChild(div);
      });
      lucide.createIcons();
    } else {
      container.innerHTML = '<div class="admin-item-skeleton">İzinli kullanıcı bulunamadı!</div>';
    }
  } catch (err) {
    container.innerHTML = `<div class="admin-item-skeleton text-danger">Yükleme hatası: ${err.message}</div>`;
  }
}

window.removeAdmin = async function(adminId) {
  if (!confirm(`Bu kullanıcının web paneline erişim yetkisini iptal etmek istediğinize emin misiniz?`)) return;
  const msgEl = document.getElementById('security-message');
  msgEl.classList.add('hidden');
  
  try {
    const res = await apiRequest('/api/settings/security/remove', 'POST', { userId: adminId });
    if (res.success) {
      loadSecuritySettings(); // Listeyi yenile
    } else {
      showMsg(msgEl, 'error', res.message);
    }
  } catch (err) {
    showMsg(msgEl, 'error', err.message || 'Yetki kaldırılırken hata oluştu.');
  }
};
