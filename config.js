import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const DATA_FILE = path.join(process.cwd(), 'data.json');

// Varsayılan ayarlar
const defaults = {
  allowedUsers: process.env.ALLOWED_USERS 
    ? process.env.ALLOWED_USERS.split(',').map(id => id.trim()) 
    : ['392468815323201547'],
  settings: {
    prefix: '!',
    defaultVolume: 50,
    keepAlive: true
  }
};

let currentConfig = { ...defaults };

// Ayarları dosyadan yükle
export function loadConfig() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const fileData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      // Dosyadaki verileri varsayılanlarla birleştir
      currentConfig = {
        allowedUsers: Array.from(new Set([...defaults.allowedUsers, ...(fileData.allowedUsers || [])])),
        settings: { ...defaults.settings, ...(fileData.settings || {}) }
      };
    } else {
      saveConfig();
    }
  } catch (err) {
    console.error('Config yükleme hatası:', err);
  }
  return currentConfig;
}

// Ayarları dosyaya kaydet
export function saveConfig() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(currentConfig, null, 2), 'utf8');
  } catch (err) {
    console.error('Config kaydetme hatası:', err);
  }
}

// İzin verilen kullanıcı listesini al
export function getAllowedUsers() {
  return currentConfig.allowedUsers;
}

// Kullanıcı ekle
export function addAllowedUser(userId) {
  if (!userId || currentConfig.allowedUsers.includes(userId)) return false;
  currentConfig.allowedUsers.push(userId);
  saveConfig();
  return true;
}

// Kullanıcı sil
export function removeAllowedUser(userId) {
  // İlk kurucu ID'sini silmeye izin verme (emniyet kemeri)
  const ownerId = '392468815323201547';
  if (userId === ownerId) return false;
  
  const index = currentConfig.allowedUsers.indexOf(userId);
  if (index === -1) return false;
  
  currentConfig.allowedUsers.splice(index, 1);
  saveConfig();
  return true;
}

// Bot ayarlarını al
export function getSettings() {
  return currentConfig.settings;
}

// Bot ayarlarını güncelle
export function updateSettings(newSettings) {
  currentConfig.settings = { ...currentConfig.settings, ...newSettings };
  saveConfig();
  return currentConfig.settings;
}

// Başlangıçta yükle
loadConfig();
