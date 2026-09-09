//DEVELOPER : @IpinXD
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const crypto = require('crypto');

// ====== KONFIGURASI ======
// Token bot sengaja diletakkan langsung di index.js sesuai permintaan.
const TOKEN = '8632556883:AAEsYmPCyQm-k-6osnVMsY9ufQWXbpE0N0k';
const OWNER_USERNAME = 'IpinXD'; // ditampilkan di pesan start & tombol Dev
const DEV_CHANNEL_USERNAME = 'privateUpin'; // tombol Ch Dev & Wajib Join
// ID Telegram numerik owner bot (BUKAN username). Command khusus owner cuma bisa dipake ID ini.
const OWNER_ID = 1495914495; // GANTI ke ID Telegram lo, misal: 7903965113
const LOG_CHANNEL_ID = -1003585378693; // Semua log monitoring channel dikirim ke sini

// URL Foto Terpisah
const START_PHOTO_URL = 'https://files.catbox.moe/62owvk.jpg'; // Foto untuk menu /start
const GIVEAWAY_PHOTO_URL = 'https://files.catbox.moe/hzfuyw.jpg'; // Banner khusus buat pesan giveaway

const PHOTO_PATH = path.join(__dirname, 'logo.jpg');
const CHANNELS_FILE = path.join(__dirname, 'channels.json'); // penyimpanan daftar channel yang dipantau
const USERS_FILE = path.join(__dirname, 'user.json'); // penyimpanan daftar user yang /start bot di PV
const STATS_FILE = path.join(__dirname, 'stats.json'); // statistik follower harian per channel
const DEFAULT_TEMPLATE = `<blockquote>╓──────≪≪◈≫≫──────╖\n           𝗧𝗥𝗔𝗡𝗦𝗔𝗞𝗦𝗜 𝗗𝗢𝗡𝗘\n╙──────≪≪◈≫≫──────╜</blockquote>\n\n<blockquote expandable>➥ Produk : {produk}\n➥ Nominal : {harga}\n➥ Payment: {payment}\n➥ Keterangan: <b>{status}</b>\n➥ Tanggal : {tanggal}\n➥ ID Transaksi : <code>{trx}</code></blockquote>\n<blockquote>─────────────────────\nTerimakasih Sudah Berbelanja Disini🔥\n───────────────────</blockquote>`;
// ==========================

if (!TOKEN || TOKEN === 'PASTE_BOT_TOKEN_DI_SINI') {
  console.error('❌ Masukkan token bot langsung ke konstanta TOKEN di index.js.');
  process.exit(1);
}
function isOwner(userId) {
  return OWNER_ID && Number(userId) === Number(OWNER_ID);
}

// ====== Fungsi Cek Wajib Join Channel ======
async function checkMembership(userId) {
  const REQUIRED_CHANNELS = ['@privateUpin', '@jastebcahnom'];
  const validStatuses = ['member', 'administrator', 'creator'];
  try {
    const results = await Promise.all(REQUIRED_CHANNELS.map(async (channel) => {
      try {
        const chatMember = await bot.getChatMember(channel, userId);
        return { channel, joined: validStatuses.includes(chatMember.status) };
      } catch (e) {
        console.error(`Gagal cek membership ${channel}:`, e.message);
        return { channel, joined: false };
      }
    }));
    return results.every((item) => item.joined);
  } catch (e) {
    console.error('Gagal cek membership:', e.message);
    return false;
  }
}

// ====== Penyimpanan daftar channel ======
let channels = new Map(); // key: chat.id (string) -> { id, title, username, uniqueId, ownerId, addedById }

function makeChannelUniqueId() {
  return `VANILLA-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function ensureChannelRecord(chat, ownerId = null, addedById = null) {
  const key = String(chat.id);
  const existing = channels.get(key) || {};
  const channel = {
    ...existing,
    id: chat.id,
    title: chat.title || existing.title || '',
    username: chat.username || existing.username || '',
    type: chat.type || existing.type || 'channel',
    uniqueId: existing.uniqueId ? String(existing.uniqueId).replace(/^CH-/i, 'VANILLA-') : makeChannelUniqueId(),
    ...(ownerId ? { ownerId: Number(ownerId) } : {}),
    ...(addedById ? { addedById: Number(addedById) } : {})
  };
  channels.set(key, channel);
  return channel;
}

function loadChannels() {
  try {
    if (fs.existsSync(CHANNELS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf8'));
      const migrated = data.map((c) => ({
        ...c,
        uniqueId: c.uniqueId ? String(c.uniqueId).replace(/^CH-/i, 'VANILLA-') : makeChannelUniqueId(),
        // Data lama belum punya owner/penanggung jawab. Karena file ini adalah
        // database milik bot saat upgrade, channel lama dikaitkan ke OWNER_ID
        // agar tidak hilang dari /mych. Channel baru selalu memakai ID user yang menambah bot.
        ownerId: c.ownerId ? Number(c.ownerId) : null,
        addedById: c.addedById ? Number(c.addedById) : null
      }));
      channels = new Map(migrated.map((c) => [String(c.id), c]));
      if (JSON.stringify(migrated) !== JSON.stringify(data)) {
        saveChannels();
      }
      console.log(`📂 ${channels.size} channel dimuat dari channels.json`);
    }
  } catch (e) {
    console.error('Gagal load channels.json:', e.message);
  }
}

function saveChannels() {
  try {
    fs.writeFileSync(CHANNELS_FILE, JSON.stringify(Array.from(channels.values()), null, 2));
  } catch (e) {
    console.error('Gagal simpan channels.json:', e.message);
  }
}

loadChannels();

// ====== Penyimpanan daftar user (user.json) ======
let users = new Map(); // key: user.id (string) -> { id, username, first_name }

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      users = new Map(data.map((u) => [String(u.id), u]));
      console.log(`📂 ${users.size} user dimuat dari user.json`);
    }
  } catch (e) {
    console.error('Gagal load user.json:', e.message);
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(Array.from(users.values()), null, 2));
  } catch (e) {
    console.error('Gagal simpan user.json:', e.message);
  }
}

loadUsers();

let stats = {
  channels: {}, // chatId -> { ownerId, daily: { "YYYY-MM-DD": { joined, left } }, posts: { count, views } }
};

function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
      if (data && typeof data === 'object') stats = data;
    }
  } catch (e) {
    console.error('Gagal load stats.json:', e.message);
  }
}

function saveStats() {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
  } catch (e) {
    console.error('Gagal simpan stats.json:', e.message);
  }
}

function jakartaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function ensureChannelStats(chatId, ownerId = null) {
  const key = String(chatId);
  if (!stats.channels[key]) {
    stats.channels[key] = { ownerId: ownerId || null, daily: {}, posts: { count: 0, views: 0 } };
  }
  if (!stats.channels[key].posts) stats.channels[key].posts = { count: 0, views: 0 };
  if (!stats.channels[key].daily) stats.channels[key].daily = {};
  if (ownerId && !stats.channels[key].ownerId) {
    stats.channels[key].ownerId = Number(ownerId);
  }
  return stats.channels[key];
}

function recordFollowerEvent(chatId, type, ownerId = null) {
  const ch = ensureChannelStats(chatId, ownerId);
  const day = jakartaDateKey();
  if (!ch.daily[day]) ch.daily[day] = { joined: 0, left: 0 };
  if (type === 'joined') ch.daily[day].joined++;
  if (type === 'left') ch.daily[day].left++;
  saveStats();
}

function getMemberHistory(chatId, userId) {
  const ch = ensureChannelStats(chatId, null);
  if (!ch.memberHistory) ch.memberHistory = {};
  const key = String(userId);
  if (!ch.memberHistory[key]) ch.memberHistory[key] = { joined: 0, left: 0, rejoinCount: 0, currentlyOut: false };
  return ch.memberHistory[key];
}

function recordMemberHistory(chatId, userId, type) {
  const history = getMemberHistory(chatId, userId);
  if (type === 'joined') {
    if (history.joined > 0 && history.currentlyOut) history.rejoinCount = Number(history.rejoinCount || 0) + 1;
    history.joined = Number(history.joined || 0) + 1;
    history.currentlyOut = false;
  } else if (type === 'left') {
    history.left = Number(history.left || 0) + 1;
    history.currentlyOut = true;
  }
  saveStats();
  return history;
}

function setDefaultChannel(userId, chat) {
  const u = users.get(String(userId)) || { id: Number(userId), username: '', first_name: '' };
  u.defaultChannelId = chat.id;
  users.set(String(userId), u);

  const channel = ensureChannelRecord(chat, userId);
  channel.ownerId = Number(userId);
  channels.set(String(chat.id), channel);

  ensureChannelStats(chat.id, userId).ownerId = Number(userId);
  saveUsers();
  saveChannels();
  saveStats();
}

function getUserOwnedChannels(userId) {
  const id = Number(userId);
  return Array.from(channels.values()).filter(c =>
    Number(c.ownerId) === id || Number(c.addedById) === id
  );
}

function fmtNumber(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

function clampPercent(n) { return Number.isFinite(n) ? n.toFixed(2) : '0.00'; }
function getDaily(data, dateKey) { return data.daily?.[dateKey] || { joined: 0, left: 0 }; }
function dateKeyOffset(days) { return jakartaDateKey(new Date(Date.now() - days * 86400000)); }
function sumDays(data, days) {
  let joined = 0, left = 0;
  for (let i = 0; i < days; i++) { const d = getDaily(data, dateKeyOffset(i)); joined += d.joined; left += d.left; }
  return { joined, left, net: joined - left };
}
function bestGrowthDay(data, days = 30) {
  let best = null;
  for (let i = 0; i < days; i++) {
    const key = dateKeyOffset(i); const d = getDaily(data, key); const net = d.joined - d.left;
    if (!best || net > best.net) best = { key, net, joined: d.joined, left: d.left };
  }
  return best || { key: jakartaDateKey(), net: 0, joined: 0, left: 0 };
}
function growthPercent(data, days, memberCount) {
  const period = sumDays(data, days);
  return memberCount ? (period.net / memberCount) * 100 : 0;
}
function getTemplate(user) { return user?.testiTemplate || DEFAULT_TEMPLATE; }
function nextTransactionId(user) {
  const key = jakartaDateKey();
  user.transactionSeq = user.transactionSeq || {};
  user.transactionSeq[key] = Number(user.transactionSeq[key] || 0) + 1;
  return `TRX-${key.replace(/-/g, '')}-${String(user.transactionSeq[key]).padStart(3, '0')}`;
}
function renderTemplate(template, values) {
  return template.replace(/\{(produk|harga|payment|status|tanggal|trx)\}/g, (_, k) => values[k] ?? '');
}

function buildStatusText(userId, channelRows) {
  const today = jakartaDateKey();
  let text = `<blockquote>📊 <b>STATUS & STATISTIK CHANNEL</b>\n📅 <b>${today}</b> (Asia/Jakarta)</blockquote>\n\n`;
  const summaries = [];

  for (const ch of channelRows) {
    const data = ensureChannelStats(ch.id, userId);
    const t = getDaily(data, today);
    const d7 = sumDays(data, 7);
    const d30 = sumDays(data, 30);
    const pct7 = growthPercent(data, 7, ch.memberCount);
    const pct30 = growthPercent(data, 30, ch.memberCount);
    const bestDay = bestGrowthDay(data, 30);
    const trend = d7.net > 0 ? '📈 NAIK' : d7.net < 0 ? '📉 TURUN' : '➡️ STABIL';
    summaries.push({ ch, data, d7, net: d7.net });
    text += `<blockquote>📢 <b>${escHtml(ch.title || ch.username || String(ch.id))}</b>\n` +
      `🆔 <code>${ch.id}</code>\n` +
      `👥 Member saat ini: <b>${fmtNumber(ch.memberCount)}</b>\n\n` +
      `🟢 Member masuk hari ini: <b>+${fmtNumber(t.joined)}</b>\n` +
      `🔴 Member keluar hari ini: <b>-${fmtNumber(t.left)}</b>\n` +
      `📈 Pertumbuhan: <b>${d7.net >= 0 ? '+' : ''}${fmtNumber(d7.net)}</b> ${trend}\n` +
      `📊 7 hari: <b>${d7.net >= 0 ? '+' : ''}${fmtNumber(d7.net)}</b> (${clampPercent(pct7)}%)\n` +
      `📊 30 hari: <b>${d30.net >= 0 ? '+' : ''}${fmtNumber(d30.net)}</b> (${clampPercent(pct30)}%)\n` +
      `🏆 Hari pertumbuhan tertinggi: <b>${bestDay.key}</b> (${bestDay.net >= 0 ? '+' : ''}${fmtNumber(bestDay.net)})\n` +
      `🏆 Views postingan: <b>${fmtNumber(data.posts?.views)}</b>\n` +
      `📝 Total postingan terpantau: <b>${fmtNumber(data.posts?.count)}</b></blockquote>\n`;
  }

  if (summaries.length) {
    const best = [...summaries].sort((a,b) => b.net - a.net)[0];
    const up = summaries.filter(x => x.net > 0).length;
    const down = summaries.filter(x => x.net < 0).length;
    text += `<blockquote>🏆 <b>RINGKASAN</b>\n` +
      `🏅 Channel pertumbuhan tertinggi: <b>${escHtml(best.ch.title || String(best.ch.id))}</b> (+${fmtNumber(best.net)})\n` +
      `📈 Channel naik: <b>${up}</b>\n` +
      `📉 Channel turun: <b>${down}</b></blockquote>`;
  }
  text += `\n<blockquote>ℹ️ Data masuk/keluar dan views postingan dihitung sejak bot mulai menerima update. Data historis yang tidak pernah diterima bot tidak dapat dipulihkan.</blockquote>`;
  return text;
}

loadStats();

const bot = new TelegramBot(TOKEN, {
  polling: {
    interval: 1000,
    autoStart: true,
    params: {
      allowed_updates: JSON.stringify(['message', 'channel_post', 'chat_member', 'my_chat_member', 'callback_query'])
    }
  }
});

console.log('🤖 Bot sedang mencoba terhubung ke Telegram...');

let BOT_USERNAME = null;

bot.getMe()
  .then((me) => {
    BOT_USERNAME = me.username;
    console.log(`✅ Bot aktif sebagai @${me.username}`);
    console.log('👀 Bot akan otomatis memantau channel apapun tempat bot dijadikan admin.');
    if (!OWNER_ID) {
      console.log('⚠️  OWNER_ID belum diisi — command khusus owner belum bisa dipakai siapa pun.');
    }
  })
  .catch((err) => {
    console.error('❌ Gagal konek ke Telegram. Cek kembali TOKEN bot Anda.');
    console.error(err.message);
    process.exit(1);
  });

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ====== Penyimpanan Sesi Balas Chat ======
const activeReplies = new Map();
const activeUserReplies = new Map();
// Sesi giveaway yang sedang menunggu hadiah/link dari pembuat.
// Satu giveaway hanya menerima satu pesan hadiah; pesan itu tidak pernah diposting ke channel.
const pendingGiveaways = new Map();

async function createAndSendBackup(targetChatId = OWNER_ID, reason = 'manual') {
  const backupFileName = `backup_${Date.now()}.zip`;
  const backupPath = path.join(__dirname, backupFileName);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(backupPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', async () => {
      try {
        await bot.sendDocument(targetChatId, backupPath, {
          caption: `📦 <b>AUTO BACKUP SYSTEM</b>\n` +
            `Alasan: <b>${escHtml(reason)}</b>\n` +
            `Ukuran: <b>${archive.pointer()} bytes</b>`,
          parse_mode: 'HTML'
        });
        fs.unlinkSync(backupPath);
        resolve();
      } catch (err) {
        try { if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath); } catch (_) {}
        reject(err);
      }
    });

    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);

    archive.file(path.join(__dirname, 'index.js'), { name: 'index.js' });
    if (fs.existsSync(CHANNELS_FILE)) archive.file(CHANNELS_FILE, { name: 'channels.json' });
    if (fs.existsSync(USERS_FILE)) archive.file(USERS_FILE, { name: 'user.json' });
    if (fs.existsSync(STATS_FILE)) archive.file(STATS_FILE, { name: 'stats.json' });
    if (fs.existsSync(PHOTO_PATH)) archive.file(PHOTO_PATH, { name: 'logo.jpg' });
    if (fs.existsSync(path.join(__dirname, 'package.json'))) archive.file(path.join(__dirname, 'package.json'), { name: 'package.json' });

    archive.finalize();
  });
}

function autoBackup(reason) {
  createAndSendBackup(OWNER_ID, reason).catch((e) => {
    console.error(`Auto backup gagal (${reason}):`, e.message);
  });
}

async function sendMonitoringLog(text, options = {}) {
  try {
    await bot.sendMessage(LOG_CHANNEL_ID, text, { parse_mode: 'HTML', ...options });
  } catch (e) {
    console.error('Gagal kirim log monitoring:', e.message);
  }
}

// Log member channel dikirim ke channel monitoring milik masing-masing channel,
// BUKAN ke LOG_CHANNEL_ID. LOG_CHANNEL_ID khusus log global seperti user baru /start.
async function sendChannelMonitoringLog(chatId, text, options = {}) {
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...options });
  } catch (e) {
    console.error(`Gagal kirim log monitoring ke channel ${chatId}:`, e.message);
  }
}

// ====== Pesan /start di PV (Dengan Wajib Join @privateUpin) ======
bot.onText(/^\/start/, async (msg) => {
  if (msg.chat.type !== 'private') return;

  const userId = msg.from.id;
  const userIdStr = String(userId);

  const isJoined = await checkMembership(userId);

  if (!isJoined) {
    const joinKeyboard = {
      inline_keyboard: [
        [{ text: '📢 JOIN @privateUpin', url: 'https://t.me/privateUpin', style: "danger" }],
        [{ text: '📢 JOIN @jastebcahnom', url: 'https://t.me/jastebcahnom', style: "danger" }],
        [{ text: '🔄 Cek Status Gabung', callback_data: 'check_join', style: "success" }]
      ]
    };
    
    return bot.sendMessage(
      msg.chat.id,
      `⚠️ <b>AKSES DIBATASI!</b>\n\n` +
      `Untuk menggunakan bot ini, kamu wajib bergabung ke <b>2 channel</b> berikut:\n` +
      `• <b>@privateUpin</b>\n` +
      `• <b>@jastebcahnom</b>\n\n` +
      `Silakan join keduanya, lalu tekan tombol <b>Cek Status Gabung</b>.`,
      { parse_mode: 'HTML', reply_markup: joinKeyboard }
    );
  }

  if (!users.has(userIdStr)) {
    users.set(userIdStr, {
      id: msg.from.id,
      username: msg.from.username || '',
      first_name: msg.from.first_name || ''
    });
    saveUsers();
    await sendMonitoringLog(
      `<blockquote>🆕 <b>USER BARU START BOT</b>

` +
      `👤 <b>User:</b> ${msg.from.username ? '@' + escHtml(msg.from.username) : escHtml(msg.from.first_name || String(msg.from.id))}
` +
      `🆔 <b>User ID:</b> <code>${msg.from.id}</code>
` +
      `🕒 <b>Waktu:</b> ${waktuSekarang()} WIB</blockquote>`
    );
    autoBackup(`user baru: ${msg.from.id}`);
  }

  let keyboardRows = [
    [
      { text: '𝗧𝗤𝗧𝗤', callback_data: 'menu_tqtq', style: 'primary' },
      { text: '𝗧𝗢𝗢𝗟𝗦', callback_data: 'menu_tools', style: 'primary' }
    ],
    [
      { text: '𝗢𝗪𝗡𝗘𝗥', callback_data: 'menu_owner_info', style: 'primary' },
      { text: '𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗦𝗜', callback_data: 'menu_info', style: 'primary' }
    ]
  ];
  if (isOwner(msg.from.id)) {
    keyboardRows.push([{ text: '𝗢𝗪𝗡𝗘𝗥 𝗠𝗘𝗡𝗨', callback_data: 'owner_menu', style: 'danger' }]);
  }
  keyboardRows.push([{ text: '➕ 𝗠𝗔𝗦𝗨𝗞𝗞𝗔𝗡 𝗕𝗢𝗧 𝗞𝗘 𝗖𝗛𝗔𝗡𝗡𝗘𝗟', url: `https://t.me/${BOT_USERNAME}?startchannel&admin=invite_users+restrict_members+post_messages` }]);

  const keyboard = { inline_keyboard: keyboardRows };

  const teks =
    `<blockquote>『  ＭＯＮＩＴＯＲＩＮＧ ＳＹＳＴＥＭ  』</blockquote>
` +
    `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬

` +
    `<blockquote><b>BOT MONITORING BY @${OWNER_USERNAME} TELAH AKTIF</b></blockquote>

` +
    `<blockquote>Masukin bot ini ke channel lo, jadiin admin, Abis itu bot bakal mantengin siapa aja yang masuk sama keluar dari channel lo — otomatis, gak perlu setting apa-apa lagi.</blockquote>

` +
    `🆔 <b>ID Telegram Lo</b>
<code>${msg.from.id}</code>

` +
    `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
` +
    `<blockquote><i>Powered by @${OWNER_USERNAME}</i></blockquote>`;

  if (START_PHOTO_URL) {
    bot.sendPhoto(msg.chat.id, START_PHOTO_URL, {
      caption: teks,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }).catch(() => {
      bot.sendMessage(msg.chat.id, teks, { parse_mode: 'HTML', reply_markup: keyboard });
    });
  } else {
    bot.sendMessage(msg.chat.id, teks, { parse_mode: 'HTML', reply_markup: keyboard });
  }
});


// ====== Command /setch ======
bot.onText(/^\/setch(?:@\w+)?\s+(-?\d+)$/i, async (msg, match) => {
  if (msg.chat.type !== 'private') return;

  const userId = msg.from.id;
  const chatId = Number(match[1]);

  try {
    const chat = await bot.getChat(chatId);
    if (chat.type !== 'channel') {
      return bot.sendMessage(msg.chat.id, '⚠️ ID yang diberikan bukan ID channel.');
    }

    const requester = await bot.getChatMember(chatId, userId);
    if (!['administrator', 'creator'].includes(requester.status)) {
      return bot.sendMessage(msg.chat.id, '⛔ Kamu harus menjadi admin channel tersebut untuk memakai /setch.');
    }

    const botMember = await bot.getChatMember(chatId, (await bot.getMe()).id);
    if (!['administrator', 'creator'].includes(botMember.status)) {
      return bot.sendMessage(msg.chat.id, '⛔ Jadikan bot sebagai admin channel tersebut terlebih dahulu.');
    }

    if (!users.has(String(userId))) {
      users.set(String(userId), {
        id: userId,
        username: msg.from.username || '',
        first_name: msg.from.first_name || '',
        moderator: true
      });
    } else {
      const u = users.get(String(userId));
      u.moderator = true;
      u.username = msg.from.username || u.username || '';
      u.first_name = msg.from.first_name || u.first_name || '';
    }

    // Pastikan channel tercatat dan menjadi channel default user.
    setDefaultChannel(userId, {
      id: chat.id,
      title: chat.title || '',
      username: chat.username || '',
      type: chat.type
    });

    await bot.sendMessage(
      msg.chat.id,
      `<blockquote>✅ <b>CHANNEL DEFAULT BERHASIL DISET</b>\n\n` +
      `📢 Channel: <b>${escHtml(chat.title || chat.username || String(chat.id))}</b>\n` +
      `🆔 ID: <code>${chat.id}</code>\n\n` +
      `Sekarang /status dan /testi bisa digunakan.</blockquote>`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ <b>Gagal set channel.</b>\nPastikan ID channel benar dan bot sudah menjadi admin.\n\n<code>${escHtml(e.message || 'Unknown error')}</code>`,
      { parse_mode: 'HTML' }
    );
  }
});

// ====== Command /masuk ======
// Manual recovery: menerima ID Telegram channel atau ID unik internal (CH-XXXXXXXX).
bot.onText(/^\/masuk(?:@\w+)?\s+(.+)$/i, async (msg, match) => {
  if (msg.chat.type !== 'private') return;

  const input = String(match[1] || '').trim();
  if (!input) return bot.sendMessage(msg.chat.id, '⚠️ Masukkan ID channel atau ID unik channel.');

  try {
    let channel = null;
    const numericId = /^-?\d+$/.test(input) ? Number(input) : null;

    if (numericId !== null) {
      channel = channels.get(String(numericId)) || null;
      if (!channel) {
        channel = { id: numericId };
      }
    } else {
      channel = Array.from(channels.values()).find(c => String(c.uniqueId || '').toUpperCase() === input.toUpperCase());
      if (!channel) {
        return bot.sendMessage(msg.chat.id, '❌ ID unik channel tidak ditemukan di database bot. Gunakan ID channel Telegram jika channel belum pernah tersimpan.');
      }
    }

    const chat = await bot.getChat(channel.id);
    if (chat.type !== 'channel') {
      return bot.sendMessage(msg.chat.id, '⚠️ ID yang diberikan bukan ID channel.');
    }

    const me = await bot.getMe();
    const botMember = await bot.getChatMember(chat.id, me.id);
    if (!['administrator', 'creator'].includes(botMember.status)) {
      return bot.sendMessage(msg.chat.id, '⛔ Bot belum menjadi admin di channel tersebut. Jadikan bot admin terlebih dahulu.');
    }

    // Cari creator asli channel dari daftar administrator.
    const admins = await bot.getChatAdministrators(chat.id);
    const creator = admins.find(a => a.status === 'creator');
    if (!creator?.user?.id) {
      return bot.sendMessage(msg.chat.id, '❌ Owner/creator channel tidak dapat ditemukan. Pastikan bot memiliki akses admin yang diperlukan.');
    }

    // User yang menjalankan /masuk dicatat sebagai pemilik/penanggung jawab channel
    // di database bot, sehingga channel langsung muncul di /mych miliknya.
    const ownerId = Number(msg.from.id);
    const ownerUser = users.get(String(ownerId)) || {
      id: ownerId,
      username: msg.from.username || '',
      first_name: msg.from.first_name || ''
    };
    ownerUser.username = msg.from.username || ownerUser.username || '';
    ownerUser.first_name = msg.from.first_name || ownerUser.first_name || '';
    ownerUser.moderator = true;
    users.set(String(ownerId), ownerUser);

    const savedChannel = ensureChannelRecord(chat, ownerId, ownerId);
    ensureChannelStats(chat.id, ownerId).ownerId = ownerId;

    if (!ownerUser.defaultChannelId) ownerUser.defaultChannelId = chat.id;

    saveUsers();
    saveChannels();
    saveStats();

    await bot.sendMessage(msg.chat.id,
      `<blockquote>✅ <b>CHANNEL BERHASIL DISINKRONKAN</b>\n\n` +
      `📢 Channel: <b>${escHtml(chat.title || chat.username || String(chat.id))}</b>\n` +
      `🆔 ID Channel: <code>${chat.id}</code>\n` +
      `🔑 ID Unik: <code>${savedChannel.uniqueId}</code>\n\n` +
      `👤 Owner: <b>${escHtml(creator.user.username ? '@' + creator.user.username : creator.user.first_name || String(ownerId))}</b>\n` +
      `🛡 Status: <b>Moderator</b>\n` +
      `⭐ Default: <b>${ownerUser.defaultChannelId == chat.id ? 'Ya' : 'Tidak'}</b>\n\n` +
      `Database channel sudah diperbarui.</blockquote>`,
      { parse_mode: 'HTML' }
    );

    if (ownerId !== msg.from.id) {
      bot.sendMessage(ownerId,
        `<blockquote>🆕 <b>CHANNEL BERHASIL DISINKRONKAN</b>\n\n` +
        `📢 ${escHtml(chat.title || chat.username || String(chat.id))}\n` +
        `🔑 ID Unik: <code>${savedChannel.uniqueId}</code>\n\n` +
        `Kamu otomatis terdaftar sebagai moderator channel ini.</blockquote>`,
        { parse_mode: 'HTML' }
      ).catch(() => {});
    }
  } catch (e) {
    await bot.sendMessage(msg.chat.id,
      `❌ <b>Gagal menjalankan /masuk.</b>\nPastikan ID benar dan bot masih menjadi admin channel.\n\n<code>${escHtml(e.message || 'Unknown error')}</code>`,
      { parse_mode: 'HTML' }
    );
  }
});

// ====== Command /settemplate ======
// Reply pesan yang berisi template, atau /settemplate untuk melihat panduan.
bot.onText(/^\/settemplate(?:@\w+)?(?:\s+([\s\S]+))?$/i, async (msg, match) => {
  if (msg.chat.type !== 'private') return;
  const user = users.get(String(msg.from.id));
  if (!user || !user.defaultChannelId) return bot.sendMessage(msg.chat.id, '⚠️ Set channel default dulu dengan /setch ID_CHANNEL.');
  let template = match[1]?.trim();
  if (!template && msg.reply_to_message) template = msg.reply_to_message.text || msg.reply_to_message.caption;
  if (!template) {
    return bot.sendMessage(msg.chat.id, `<blockquote>🆕 <b>SET TEMPLATE TESTI</b>\n\nReply pesan template lalu ketik <code>/settemplate</code>.\n\nPlaceholder: <code>{produk}</code> <code>{harga}</code> <code>{payment}</code> <code>{status}</code> <code>{tanggal}</code> <code>{trx}</code>\n\nTemplate saat ini:\n${escHtml(getTemplate(user))}</blockquote>`, { parse_mode: 'HTML' });
  }
  user.testiTemplate = template;
  saveUsers();
  await bot.sendMessage(msg.chat.id, '✅ Template testi berhasil disimpan.');
});

// ====== Command /mych ======
bot.onText(/^\/mych(?:@\w+)?$/i, async (msg) => {
  if (msg.chat.type !== 'private') return;
  const list = getUserOwnedChannels(msg.from.id);
  if (!list.length) return bot.sendMessage(msg.chat.id, '⚠️ Belum ada channel yang terdeteksi. Jadikan bot admin di channel terlebih dahulu.');
  let text = '<blockquote>📋 <b>CHANNEL TERHUBUNG</b>\n\n';
  for (const ch of list) {
    let botStatus = '❓';
    try { const me = await bot.getMe(); const cm = await bot.getChatMember(ch.id, me.id); botStatus = ['administrator','creator'].includes(cm.status) ? '🟢 Bot Admin' : '🔴 Bot bukan admin'; } catch (_) { botStatus = '🔴 Tidak bisa diakses'; }
    const def = users.get(String(msg.from.id))?.defaultChannelId == ch.id ? ' ⭐ DEFAULT' : '';
    text += `📢 <b>${escHtml(ch.title || ch.username || String(ch.id))}</b>${def}\n🆔 <code>${ch.id}</code>\n🔑 <code>${escHtml(ch.uniqueId || 'BELUM ADA')}</code>\n${botStatus}\n\n`;
  }
  text += '</blockquote>';
  bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML' });
});

// ====== Command /status ======
bot.onText(/^\/status(?:@\w+)?$/i, async (msg) => {
  if (msg.chat.type !== 'private') return;

  const userId = msg.from.id;
  const user = users.get(String(userId));
  const ownedChannels = getUserOwnedChannels(userId);

  if (!user || (!user.moderator && ownedChannels.length === 0)) {
    return bot.sendMessage(
      msg.chat.id,
      '⛔ Kamu belum terdaftar sebagai moderator. Tambahkan bot sebagai admin di channel milikmu terlebih dahulu.'
    );
  }

  const defaultChannelId = user.defaultChannelId;
  if (!defaultChannelId) {
    return bot.sendMessage(
      msg.chat.id,
      `<blockquote>⚠️ <b>CHANNEL DEFAULT BELUM DISET</b>\n\n` +
      `Gunakan:\n<code>/setch -100xxxxxxxxxx</code>\n\n` +
      `Bot wajib menjadi admin di channel tersebut.</blockquote>`,
      { parse_mode: 'HTML' }
    );
  }

  if (ownedChannels.length === 0) {
    return bot.sendMessage(msg.chat.id, '⚠️ Belum ada channel yang terhubung ke akunmu.');
  }

  const rows = [];
  for (const ch of ownedChannels) {
    try {
      const memberCount = await bot.getChatMemberCount(ch.id);
      rows.push({ ...ch, memberCount });
    } catch (e) {
      rows.push({ ...ch, memberCount: 0 });
    }
  }

  const text = buildStatusText(userId, rows);
  await bot.sendMessage(msg.chat.id, text, {
    parse_mode: 'HTML',
    disable_web_page_preview: true
  });
});

// ====== Command /testi ======
// Format: /testi Nama Barang:Harga:Payment
// Wajib dikirim sebagai reply ke foto/video.
bot.onText(/^\/testi(?:@\w+)?\s+([^:]+):([^:]+):([\s\S]+)$/i, async (msg, match) => {
  if (msg.chat.type !== 'private') return;

  const userId = msg.from.id;
  const user = users.get(String(userId));
  const defaultChannelId = user && user.defaultChannelId;

  if (!defaultChannelId) {
    return bot.sendMessage(
      msg.chat.id,
      `<blockquote>⚠️ <b>CHANNEL DEFAULT BELUM DISET</b>\n\n` +
      `Gunakan <code>/setch ID_CHANNEL</code> terlebih dahulu.</blockquote>`,
      { parse_mode: 'HTML' }
    );
  }

  if (!msg.reply_to_message) {
    return bot.sendMessage(msg.chat.id, '⚠️ /testi harus dikirim sebagai reply ke foto atau video.');
  }

  const media = msg.reply_to_message;
  if (!media.photo && !media.video) {
    return bot.sendMessage(msg.chat.id, '⚠️ Pesan yang direply harus berupa foto atau video.');
  }

  const produk = match[1].trim();
  const harga = match[2].trim();
  const payment = match[3].trim();

  const tanggal = new Date().toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const trx = nextTransactionId(user);
  saveUsers();
  const caption = renderTemplate(getTemplate(user), {
    produk: escHtml(produk),
    harga: escHtml(harga),
    payment: escHtml(payment),
    status: 'DONE',
    tanggal,
    trx
  });

  try {
    await bot.copyMessage(defaultChannelId, msg.chat.id, media.message_id, {
      caption,
      parse_mode: 'HTML'
    });

    await bot.sendMessage(
      msg.chat.id,
      `✅ <b>TESTI BERHASIL DIKIRIM</b>\n📢 Channel ID: <code>${defaultChannelId}</code>`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {
    await bot.sendMessage(
      msg.chat.id,
      `❌ <b>Gagal mengirim testi.</b>\n\n<code>${escHtml(e.message || 'Unknown error')}</code>`,
      { parse_mode: 'HTML' }
    );
  }
});

// ====== Command /bc (Broadcast ke semua user dengan tombol balas) ======
bot.onText(/^\/bc(?:\s+(.+))?/, async (msg, match) => {
  if (msg.chat.type !== 'private') return;
  if (!isOwner(msg.from.id)) return;

  let pesanBroadcast = match[1];

  if (!pesanBroadcast && msg.reply_to_message) {
    pesanBroadcast = msg.reply_to_message.text || msg.reply_to_message.caption;
  }

  if (!pesanBroadcast) {
    return;
  }

  const daftarUser = Array.from(users.values());
  if (daftarUser.length === 0) {
    bot.sendMessage(msg.chat.id, '⚠️ Belum ada user yang tersimpan di user.json.');
    return;
  }

  let statusMsg = await bot.sendMessage(msg.chat.id, `⏳ Memulai broadcast ke ${daftarUser.length} user...`);
  
  let sukses = 0;
  let gagal = 0;

  for (const u of daftarUser) {
    try {
      const finalBroadcastText = 
        `<blockquote>📢 <b>BROADCAST DARI IWAW</b>\n` +
        `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
        `${pesanBroadcast}\n\n` +
        `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` +
        `💬 <i>Silakan klik tombol di bawah untuk membalas pesan ini.</i></blockquote>`;

      const broadcastKeyboard = {
        inline_keyboard: [
          [{ text: '💬 Balas Pesan Ini', callback_data: 'user_reply_mode' }]
        ]
      };

      await bot.sendMessage(u.id, finalBroadcastText, { parse_mode: 'HTML', reply_markup: broadcastKeyboard });
      sukses++;
    } catch (e) {
      gagal++;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  bot.editMessageText(
    `📢 <b>BROADCAST SELESAI</b>\n\n` +
    `✅ Berhasil terkirim: <b>${sukses}</b> user\n` +
    `❌ Gagal terkirim: <b>${gagal}</b> user\n` +
    `👥 Total target: <b>${daftarUser.length}</b> user`,
    {
      chat_id: msg.chat.id,
      message_id: statusMsg.message_id,
      parse_mode: 'HTML'
    }
  );
});

// ====== Command /bcuser (Kirim pesan ke 1 user tertentu dengan tombol balas) ======
bot.onText(/^\/bcuser(?:\s+(\d+))?(?:\s+([\s\S]+))?/, async (msg, match) => {
  if (msg.chat.type !== 'private') return;
  if (!isOwner(msg.from.id)) return;

  let targetId = match[1];
  let pesanUser = match[2];

  if ((!targetId || !pesanUser) && msg.reply_to_message) {
    if (!targetId) {
      return;
    }
    pesanUser = msg.reply_to_message.text || msg.reply_to_message.caption;
  }

  if (!targetId || !pesanUser) {
    return;
  }

  const finalUserText = 
    `<blockquote>📢 <b>BROADCAST DARI IWAW</b>\n` +
    `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
    `${pesanUser}\n\n` +
    `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` +
    `💬 <i>Silakan klik tombol di bawah untuk membalas pesan ini.</i></blockquote>`;

  const userKeyboard = {
    inline_keyboard: [
      [{ text: '💬 Balas Pesan Ini', callback_data: 'user_reply_mode' }]
    ]
  };

  try {
    await bot.sendMessage(targetId, finalUserText, { parse_mode: 'HTML', reply_markup: userKeyboard });
    bot.sendMessage(msg.chat.id, `✅ Pesan berhasil dikirim ke user ID <code>${targetId}</code>.`, { parse_mode: 'HTML' });
  } catch (e) {
    bot.sendMessage(msg.chat.id, `❌ Gagal mengirim pesan ke user ID <code>${targetId}</code>.\nError: ${escHtml(e.message)}`, { parse_mode: 'HTML' });
  }
});

// ====== Command untuk melihat channel ======
bot.onText(/^\/channels|^\/listch/, (msg) => {
  if (msg.chat.type !== 'private') return;
  if (!isOwner(msg.from.id)) return;

  const daftar = Array.from(channels.values());
  const listTeks = daftar.length
    ? daftar.map((c, i) => `${i + 1}. <b>${escHtml(c.title || c.username || c.id)}</b>${c.username ? ` (@${escHtml(c.username)})` : ''}\n   ID: <code>${c.id}</code>`).join('\n\n')
    : '<i>Belum ada channel yang memasukkan bot ini sebagai admin.</i>';

  const teks =
    `<blockquote>📋 <b>DAFTAR CHANNEL BOT</b>\n` +
    `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` +
    `Total channel: <b>${daftar.length}</b>\n\n` +
    `${listTeks}</blockquote>`;

  bot.sendMessage(msg.chat.id, teks, { parse_mode: 'HTML' });
});

// ====== Command /backup ======
bot.onText(/^\/backup/, async (msg) => {
  if (msg.chat.type !== 'private') return;
  if (!isOwner(msg.from.id)) return;

  const waitMsg = await bot.sendMessage(msg.chat.id, '📦 Sedang membuat file backup zip...');
  try {
    await createAndSendBackup(msg.chat.id, 'manual /backup');
    bot.deleteMessage(msg.chat.id, waitMsg.message_id).catch(() => {});
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Gagal mengirim file backup: ${escHtml(err.message)}`);
  }
});

// ====== Command /giveaway /ga ======
async function mulaiGiveaway(msg, input) {
  const parts = input.split('|').map(p => p.trim());
  const targetChannelId = parts[0];
  const winnerCount = parseInt(parts[1]) || 1;
  // Batas peserta bersifat OPSIONAL.
  // Format 3 bagian: target | pemenang | teks = tanpa batas peserta (manual draw).
  // Format 4 bagian: target | pemenang | maxPeserta | teks = auto-draw saat kuota tercapai.
  let maxParticipants = null;
  let gaText;
  if (parts.length >= 4 && /^\d+$/.test(parts[2])) {
    maxParticipants = parseInt(parts[2]);
    gaText = parts.slice(3).join(' | ');
  } else {
    gaText = parts.slice(2).join(' | ');
  }

  if (!targetChannelId || !gaText || winnerCount < 1 || (maxParticipants !== null && maxParticipants < 1)) {
    await bot.sendMessage(msg.chat.id, '⚠️ ID Channel, jumlah pemenang, atau teks/hadiah giveaway belum lengkap!', { parse_mode: 'HTML' });
    return;
  }

  try {
    const ownedChannel = getUserOwnedChannels(msg.from.id).find(c => String(c.id) === String(targetChannelId) || String(c.uniqueId || '').toUpperCase() === String(targetChannelId).toUpperCase());
    if (!ownedChannel) {
      await bot.sendMessage(msg.chat.id,
        `<blockquote>⛔ <b>CHANNEL BELUM TERHUBUNG</b>

` +
        `Lu belum menghubungkan channel ini ke bot.
` +
        `Masukkan bot sebagai <b>admin</b> di channel tersebut terlebih dahulu. Setelah terdeteksi, giveaway baru bisa digunakan.

` +
        `Contoh:
<code>/giveaway -1001234567890 | 1 | 10 | Giveaway 10 orang</code></blockquote>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    const chatMember = await bot.getChatMember(targetChannelId, (await bot.getMe()).id);
    if (!['administrator', 'creator'].includes(chatMember.status)) {
      await bot.sendMessage(msg.chat.id, '❌ Bot harus menjadi admin di channel/grup tujuan untuk mengirim giveaway.', { parse_mode: 'HTML' });
      return;
    }
  } catch (e) {
    await bot.sendMessage(msg.chat.id, `❌ Gagal mengakses tujuan <code>${escHtml(targetChannelId)}</code>. Pastikan ID benar dan bot sudah menjadi admin.`, { parse_mode: 'HTML' });
    return;
  }

  // Simpan konfigurasi dulu. Hadiah/link akan diminta di pesan berikutnya dan TIDAK diposting ke channel.
  pendingGiveaways.set(String(msg.from.id), {
    creatorId: msg.from.id,
    creatorChatId: msg.chat.id,
    targetChannelId,
    winnerCount,
    maxParticipants,
    gaText,
    createdAt: Date.now()
  });

  await bot.sendMessage(
    msg.chat.id,
    `<blockquote>🎁 <b>DATA GIVEAWAY DITERIMA</b></blockquote>\n` +
    `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
    `Sekarang kirim <b>hadiah/file/link</b> yang mau diberikan ke pemenang.\n\n` +
    (maxParticipants ? `👥 Batas peserta: <b>${maxParticipants} orang</b>. Setelah jumlah ini tercapai, pemenang akan <b>diacak otomatis</b>.\n\n` : '') +
    `📦 Bisa: ZIP, JS, HTML, PY, PDF, foto, video, audio, sticker, file Telegram lainnya, <b>link</b>, teks dengan hyperlink, blockquote, atau pesan Telegram lainnya.\n\n` +
    `🔒 <b>Pesan hadiah tidak akan ditampilkan di channel.</b> Bot hanya menyimpannya untuk dikirim langsung ke pemenang.\n\n` +
    `Kalau giveaway <b>tidak punya hadiah file/link/pesan tambahan</b>, langsung kirim <code>/done</code>.\n` +
    `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`,
    { parse_mode: 'HTML' }
  );
}

bot.onText(/^\/(?:giveaway|ga)(?:\s+([\s\S]+))?/, async (msg, match) => {
  if (msg.chat.type !== 'private') return;

  const isJoined = await checkMembership(msg.from.id);
  if (!isJoined) {
    return bot.sendMessage(msg.chat.id, '⚠️ Kamu harus bergabung ke channel @privateUpin terlebih dahulu sebelum menggunakan fitur giveaway. Ketik /start');
  }

  const input = match[1];
  if (!input) {
    return bot.sendMessage(msg.chat.id,
      `<blockquote>⚠️ <b>Format Giveaway</b>\n\n` +
      `<code>/giveaway [id_channel] | [jumlah_pemenang] | [pesan/hadiah]</code>\n\n` +
      `Contoh tanpa batas peserta (max opsional, bisa diundi manual):\n<code>/giveaway -1003585378693 | 1 | ikan kerapu</code>\n\n` +
      `Contoh dengan batas 10 peserta (otomatis acak):\n<code>/giveaway -1003585378693 | 1 | 10 | ikan kerapu</code>\n\n` +
      `Setelah command dikirim, bot akan meminta <b>file/link/pesan hadiah</b>. Kalau tidak ada, kirim <code>/done</code>.</blockquote>`,
      { parse_mode: 'HTML' }
    );
  }

  if (pendingGiveaways.has(String(msg.from.id))) {
    return bot.sendMessage(msg.chat.id, '⚠️ Kamu masih punya giveaway yang menunggu hadiah. Kirim file/link/pesan hadiahnya atau <code>/done</code> dulu.', { parse_mode: 'HTML' });
  }

  await mulaiGiveaway(msg, input);
});

async function publishPendingGiveaway(pending, hadiahMessage = null) {
  const { creatorId, creatorChatId, targetChannelId, winnerCount, maxParticipants, gaText } = pending;

  let chatInfo = null;
  try { chatInfo = await bot.getChat(targetChannelId); } catch (_) {}

  const gaId = Date.now();
  const judulChannel = chatInfo ? (chatInfo.title || targetChannelId) : targetChannelId;
  const gaTeks = buildGaMessage({ text: gaText, winnerCount, participants: new Map() });
  let sentMsg;
  let pakaiFoto = !!GIVEAWAY_PHOTO_URL && gaTeks.length <= 1024;

  if (pakaiFoto) {
    try {
      sentMsg = await bot.sendPhoto(targetChannelId, GIVEAWAY_PHOTO_URL, {
        caption: gaTeks,
        parse_mode: 'HTML',
        reply_markup: buildGaKeyboard(gaId, null)
      });
    } catch (_) { pakaiFoto = false; }
  }
  if (!sentMsg) {
    sentMsg = await bot.sendMessage(targetChannelId, gaTeks, {
      parse_mode: 'HTML',
      reply_markup: buildGaKeyboard(gaId, null)
    });
  }

  let shareUrl = null;
  if (chatInfo && chatInfo.username) {
    const postUrl = `https://t.me/${chatInfo.username}/${sentMsg.message_id}`;
    shareUrl = `https://t.me/share/url?url=${encodeURIComponent(postUrl)}&text=${encodeURIComponent('🎁 Ada giveaway nih, gas ikutan!')}`;
    await bot.editMessageReplyMarkup(buildGaKeyboard(gaId, shareUrl), {
      chat_id: targetChannelId,
      message_id: sentMsg.message_id
    }).catch(() => {});
  }

  let pinBerhasil = true;
  try { await bot.pinChatMessage(targetChannelId, sentMsg.message_id, { disable_notification: true }); }
  catch (_) { pinBerhasil = false; }

  if (!global.activeGiveaways) global.activeGiveaways = new Map();
  global.activeGiveaways.set(String(gaId), {
    channelId: targetChannelId,
    channelTitle: judulChannel,
    channelUsername: chatInfo ? (chatInfo.username || '') : '',
    shareUrl,
    messageId: sentMsg.message_id,
    hasPhoto: pakaiFoto,
    winnerCount,
    maxParticipants,
    participants: new Map(),
    text: gaText,
    ended: false,
    creatorId,
    hadiahMessageId: hadiahMessage ? hadiahMessage.message_id : null,
    hadiahChatId: hadiahMessage ? hadiahMessage.chat.id : null
  });

  const rollKeyboard = {
    inline_keyboard: [[{ text: '🎲 Acak Pemenang', callback_data: `ga_roll:${gaId}`, style: 'danger' }]]
  };

  await bot.sendMessage(
    creatorChatId,
    `✅ <b>Giveaway berhasil dikirim!</b>\n` +
    `📢 Tujuan: <b>${escHtml(judulChannel)}</b>\n` +
    `👥 Batas peserta: ${maxParticipants ? `<b>${maxParticipants}</b>` : 'tidak dibatasi'}\n` +
    `🎁 Hadiah: ${hadiahMessage ? '✅ tersimpan secara privat' : 'ℹ️ tidak ada hadiah tambahan'}\n` +
    `📌 Pin: ${pinBerhasil ? '✅ berhasil' : '⚠️ gagal'}\n` +
    `🆔 ID Giveaway: <code>${gaId}</code>`,
    { parse_mode: 'HTML', reply_markup: rollKeyboard }
  );
}

// /done menyelesaikan giveaway tanpa hadiah tambahan.
bot.onText(/^\/done(?:@\w+)?$/, async (msg) => {
  if (msg.chat.type !== 'private') return;
  const pending = pendingGiveaways.get(String(msg.from.id));
  if (!pending) return bot.sendMessage(msg.chat.id, 'ℹ️ Tidak ada giveaway yang sedang menunggu file/link.');

  pendingGiveaways.delete(String(msg.from.id));
  try {
    await publishPendingGiveaway(pending, null);
  } catch (e) {
    pendingGiveaways.set(String(msg.from.id), pending);
    await bot.sendMessage(msg.chat.id, `❌ Gagal mengirim giveaway: ${escHtml(e.message)}`, { parse_mode: 'HTML' });
  }
});

// ====== Sistem Pesan User & Owner ======
bot.on('message', async (msg) => {
  if (msg.chat.type !== 'private') return;
  if (msg.text && msg.text.startsWith('/')) return;

  const userId = msg.from.id;

  // Jika user sedang menunggu hadiah giveaway, pesan berikutnya dijadikan hadiah.
  // Tidak diteruskan ke channel; hanya message_id yang disimpan untuk dikirim ke pemenang.
  const pendingGiveaway = pendingGiveaways.get(String(userId));
  if (pendingGiveaway) {
    // Command /done ditangani handler khusus di atas.
    if (!(msg.text && /^\/done(?:@\w+)?$/i.test(msg.text.trim()))) {
      pendingGiveaways.delete(String(userId));
      try {
        await publishPendingGiveaway(pendingGiveaway, msg);
        await bot.sendMessage(msg.chat.id, '✅ Hadiah/link sudah diamankan. Giveaway diposting tanpa menampilkan hadiah tersebut di channel.', { parse_mode: 'HTML' });
      } catch (e) {
        pendingGiveaways.set(String(userId), pendingGiveaway);
        await bot.sendMessage(msg.chat.id, `❌ Gagal membuat giveaway: ${escHtml(e.message)}`, { parse_mode: 'HTML' });
      }
    }
    return;
  }

  // 1. Jika yang mengetik adalah OWNER
  if (isOwner(userId)) {
    let targetUserId = null;

    if (msg.reply_to_message) {
      const replied = msg.reply_to_message;
      
      if (replied.forward_from) {
        targetUserId = replied.forward_from.id;
      } else if (replied.caption && replied.caption.includes('User ID:')) {
        const matchId = replied.caption.match(/User ID:\s*<code>(\d+)<\/code>/);
        if (matchId) targetUserId = matchId[1];
      } else if (replied.text && replied.text.includes('User ID:')) {
        const matchId = replied.text.match(/User ID:\s*<code>(\d+)<\/code>/);
        if (matchId) targetUserId = matchId[1];
      }
    }

    if (!targetUserId && activeReplies.has(userId)) {
      targetUserId = activeReplies.get(userId);
    }

    if (targetUserId) {
      try {
        await bot.sendMessage(targetUserId, msg.text || '[Pesan Media dari Owner]', { parse_mode: 'HTML' });
        await bot.sendMessage(userId, `✅ Balasan berhasil dikirim ke user ID <code>${targetUserId}</code>.`, { parse_mode: 'HTML' });
      } catch (e) {
        await bot.sendMessage(userId, `❌ Gagal mengirim balasan ke user: ${escHtml(e.message)}`);
      }
    }
    return;
  }

  // 2. Jika yang mengetik adalah USER BIASA
  const u = msg.from;

  if (activeUserReplies.has(userId)) {
    activeUserReplies.delete(userId);

    const forwardInfo = 
      `📩 <b>PESAN BALASAN DARI USER</b>\n` +
      `━━━━━━━━━━━━━━━\n` +
      `👤 Nama: <b>${escHtml([u.first_name, u.last_name].filter(Boolean).join(' ') || 'Tanpa Nama')}</b>\n` +
      `📛 Username: ${u.username ? `@${escHtml(u.username)}` : '<i>Tidak ada</i>'}\n` +
      `🆔 User ID: <code>${u.id}</code>\n` +
      `━━━━━━━━━━━━━━━`;

    const ownerReplyKeyboard = {
      inline_keyboard: [
        [{ text: '💬 Balas Chat Ini', callback_data: `set_reply:${u.id}` }]
      ]
    };

    try {
      await bot.sendMessage(OWNER_ID, forwardInfo, { parse_mode: 'HTML' });
      await bot.forwardMessage(OWNER_ID, msg.chat.id, msg.message_id, { reply_markup: ownerReplyKeyboard });
      await bot.sendMessage(msg.chat.id, '✅ Balasan berhasil terkirim ke owner!', { parse_mode: 'HTML' });
    } catch (e) {}
    return;
  }

  const userInfo = 
    `📩 <b>PESAN DARI USER</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    `👤 Nama: <b>${escHtml([u.first_name, u.last_name].filter(Boolean).join(' ') || 'Tanpa Nama')}</b>\n` +
    `📛 Username: ${u.username ? `@${escHtml(u.username)}` : '<i>Tidak ada</i>'}\n` +
    `🆔 User ID: <code>${u.id}</code>\n` +
    `━━━━━━━━━━━━━━━`;

  const ownerReplyKeyboard = {
    inline_keyboard: [
      [{ text: '💬 Balas Chat Ini', callback_data: `set_reply:${u.id}` }]
    ]
  };

  try {
    await bot.sendMessage(OWNER_ID, userInfo, { parse_mode: 'HTML' });
    await bot.forwardMessage(OWNER_ID, msg.chat.id, msg.message_id, { reply_markup: ownerReplyKeyboard });
    
    await bot.sendMessage(msg.chat.id, '✅ Pesan terkirim ke owner!', { parse_mode: 'HTML' });
  } catch (e) {
    console.error('Gagal meneruskan pesan user ke owner:', e.message);
  }
});

bot.on('my_chat_member', async (update) => {
  try {
    const chat = update.chat;
    if (!['group', 'supergroup', 'channel'].includes(chat.type)) return;

    const oldStatus = update.old_chat_member.status;
    const newStatus = update.new_chat_member.status;
    const statusAktif = ['member', 'administrator', 'creator'];
    const ditambahkan = statusAktif.includes(newStatus) && !statusAktif.includes(oldStatus);

    if (chat.type === 'channel') {
      const key = String(chat.id);
      if (statusAktif.includes(newStatus)) {
        const existing = channels.get(key) || {};
        const addedById = ditambahkan && update.from ? Number(update.from.id) : existing.addedById || null;
        const ownerId = existing.ownerId || addedById || null;
        ensureChannelRecord(chat, ownerId, addedById);
        ensureChannelStats(chat.id, ownerId);
        if (ownerId) stats.channels[key].ownerId = Number(ownerId);
        if (ditambahkan && ownerId) {
          const u = users.get(String(ownerId)) || { id: ownerId, username: update.from?.username || '', first_name: update.from?.first_name || '' };
          u.moderator = true;
          if (!u.defaultChannelId) u.defaultChannelId = chat.id;
          users.set(String(ownerId), u);
          saveUsers();
          bot.sendMessage(ownerId, `<blockquote>🆕 <b>CHANNEL TERDETEKSI OTOMATIS</b>\n\n📢 ${escHtml(chat.title || String(chat.id))}\n🆔 <code>${chat.id}</code>\n\nBot sudah mendeteksi kamu sebagai moderator. ${u.defaultChannelId == chat.id ? 'Channel ini otomatis dijadikan channel default.' : 'Gunakan /setch jika ingin menjadikannya default.'}\n\nFitur baru: /status • /testi • /settemplate • /mych</blockquote>`, { parse_mode: 'HTML' }).catch(() => {});
        }
      } else {
        const removedChannel = channels.get(key) || {};
        channels.delete(key);
        if (ditambahkan === false) {
          const actor = update.from || {};
          const actorName = actor.username ? `@${escHtml(actor.username)}` : escHtml(actor.first_name || `ID ${actor.id || '-'}`);
          await sendMonitoringLog(
            `<blockquote>🔴 <b>BOT KELUAR DARI CHANNEL</b>

` +
            `📢 <b>Channel:</b> ${namaChannelLink(chat)}
` +
            `🆔 <b>ID Channel:</b> <code>${chat.id}</code>
` +
            `${removedChannel.uniqueId ? `🔑 <b>ID Unik:</b> <code>${removedChannel.uniqueId}</code>
` : ''}` +
            `👤 <b>Aksi oleh:</b> ${actorName}
` +
            `🆔 <b>User ID:</b> <code>${actor.id || '-'}</code>
` +
            `🕒 <b>Waktu:</b> ${waktuSekarang()} WIB</blockquote>`
          );
        }
      }
      saveChannels();
      saveStats();
    }

    // Saat bot baru ditambahkan ke channel, orang yang menambahkan bot
    // dicatat sebagai pemilik/moderator sistem untuk command /status.
    if (ditambahkan) {
      if (update.from && update.from.id) {
        const ownerId = Number(update.from.id);
        const u = users.get(String(ownerId)) || {
          id: ownerId,
          username: update.from.username || '',
          first_name: update.from.first_name || ''
        };
        u.username = update.from.username || u.username || '';
        u.first_name = update.from.first_name || u.first_name || '';
        u.moderator = true;
        users.set(String(ownerId), u);
        saveUsers();
        ensureChannelStats(chat.id, ownerId).ownerId = ownerId;
        saveStats();
      }
      const actor = update.from || {};
      const actorName = actor.username ? `@${escHtml(actor.username)}` : escHtml(actor.first_name || `ID ${actor.id || '-'}`);
      const channelRecord = channels.get(String(chat.id));
      if (chat.type === 'channel' && channelRecord) {
        await sendMonitoringLog(
          `<blockquote>🆕 <b>BOT DITAMBAHKAN KE CHANNEL</b>

` +
          `📢 <b>Channel:</b> ${namaChannelLink(chat)}
` +
          `🆔 <b>ID Channel:</b> <code>${chat.id}</code>
` +
          `🔑 <b>ID Unik:</b> <code>${channelRecord.uniqueId}</code>

` +
          `👤 <b>User yang menambahkan:</b> ${actorName}
` +
          `🆔 <b>User ID:</b> <code>${actor.id || '-'}</code>
` +
          `🛡 <b>Status:</b> Moderator
` +
          `🕒 <b>Waktu:</b> ${waktuSekarang()} WIB</blockquote>`
        );
      }
      autoBackup(`bot ditambahkan ke ${chat.type}: ${chat.title || chat.id}`);
    }
  } catch (e) {
    console.error('my_chat_member error:', e.message);
  }
});

function namaUser(user) {
  if (user.username) return `@${escHtml(user.username)}`;
  return escHtml([user.first_name, user.last_name].filter(Boolean).join(' ') || `ID ${user.id}`);
}

function mentionSnapshot(u) {
  if (u.username) {
    return `<a href="https://t.me/${u.username}">@${escHtml(u.username)}</a>`;
  }
  const nama = escHtml(u.first_name || `User ${u.id}`);
  return `<a href="tg://user?id=${u.id}">${nama}</a>`;
}

function namaChannelLink(chat) {
  const judul = escHtml(chat.title || chat.username || chat.id);
  return `<b>${judul}</b>`;
}

function buildGaKeyboard(gaId, shareUrl) {
  const rows = [
    [{ text: '🎉 IKUT GIVEAWAY 🎉', callback_data: `ga_join:${gaId}`, style: "success" }],
    [{ text: '🤖 WAJIB START BOT DULU', url: BOT_USERNAME ? `https://t.me/${BOT_USERNAME}?start=giveaway_${gaId}` : 'https://t.me/', style: "primary" }],
    [{ text: '👥 Cek Peserta', callback_data: `ga_count:${gaId}`, style: "success" }]
  ];
  if (shareUrl) {
    rows.push([{ text: '📤 Bagikan Giveaway', url: shareUrl }]);
  }
  return { inline_keyboard: rows };
}

function buildGaMessage(ga) {
  return (
    `<blockquote>🎁✨ <b>G I V E A W A Y   T I M E</b> ✨🎁</blockquote>\n` +
    `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
    `<blockquote>${ga.text}</blockquote>\n\n` +
    `<blockquote>🏆 <b>Jumlah Pemenang:</b> ${ga.winnerCount} Orang\n` +
    `👥 <b>Total Peserta:</b> ${ga.participants.size}${ga.maxParticipants ? ` / ${ga.maxParticipants}` : ''} Orang\n\n` +
    `👇 <i>Pencet tombol di bawah buat ikutan, jangan lupa share biar temen lo juga bisa ikutan!</i></blockquote>\n` +
    `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`
  );
}

function waktuSekarang() {
  return new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
}

function buildKeyboard(user, chat) {
  const rows = [];
  if (user.username) {
    rows.push([{ text: '👤 Buka Profil', url: `https://t.me/${user.username}`, style: "primary" }]);
  } else {
    rows.push([{ text: '👤 Buka Profil (via ID)', url: `tg://user?id=${user.id}`, style: "primary" }]);
  }
  rows.push([
    { text: '🚫 Ban dari Channel', callback_data: `ban:${chat.id}:${user.id}`, style: "danger" },
    { text: '✅ Unban', callback_data: `unban:${chat.id}:${user.id}`, style: "success" }
  ]);
  rows.push([
    { text: '🔍 Cek Detail', callback_data: `info:${chat.id}:${user.id}`, style: "primary" }
  ]);
  return { inline_keyboard: rows };
}

function buildBannedKeyboard(user, chat) {
  return {
    inline_keyboard: [
      [{ text: '♻️ Unban User', callback_data: `unban:${chat.id}:${user.id}`, style: 'success' }],
      [{ text: '🔍 Cek Detail', callback_data: `info:${chat.id}:${user.id}`, style: 'primary' }]
    ]
  };
}

bot.on('channel_post', (msg) => {
  try {
    const key = String(msg.chat.id);
    const ch = channels.get(key);
    if (!ch) return;
    const data = ensureChannelStats(msg.chat.id, ch.ownerId || null);
    data.posts.count = Number(data.posts.count || 0) + 1;
    data.posts.views = Number(data.posts.views || 0) + Number(msg.views || 0);
    saveStats();
  } catch (e) { console.error('channel_post stats error:', e.message); }
});

bot.on('chat_member', async (update) => {
  try {
    const chat = update.chat;
    if (chat.type !== 'channel') return;

    const oldStatus = update.old_chat_member.status;
    const newStatus = update.new_chat_member.status;
    const user = update.new_chat_member.user;

    const statusMasuk = ['member', 'administrator', 'creator'];
    const statusKeluar = ['left', 'kicked'];

    const joined = statusMasuk.includes(newStatus) && !statusMasuk.includes(oldStatus);
    const left = statusKeluar.includes(newStatus) && !statusKeluar.includes(oldStatus);
    if (!joined && !left) return;

    const channel = channels.get(String(chat.id));
    const channelOwnerId = channel?.ownerId || stats.channels[String(chat.id)]?.ownerId || null;

    if (joined) recordFollowerEvent(chat.id, 'joined', channelOwnerId);
    if (left) recordFollowerEvent(chat.id, 'left', channelOwnerId);

    const history = recordMemberHistory(chat.id, user.id, joined ? 'joined' : 'left');
    const nama = namaUser(user);
    const label = joined ? '<blockquote>🟢 <b>MEMBER BARU MASUK NIH</b></blockquote>' : '<blockquote>🔴 <b>ADA YANG KABUR DARI CHANNEL</b></blockquote>';
    const aksi = joined ? 'gabung ke' : 'cabut dari';
    const namaLengkap = escHtml([user.first_name, user.last_name].filter(Boolean).join(' ') || '-');
    const namaChannel = escHtml(chat.title || chat.username || String(chat.id));
    const rejoinCount = Number(history.rejoinCount || 0);
    let keterangan = '';
    if (joined) {
      keterangan = rejoinCount === 0
        ? 'baru join'
        : `rejoin ${rejoinCount}/3`;
    } else {
      keterangan = 'member keluar';
    }
    const rejoinInfo = `\n🛡️ <b>Keterangan:</b> ${keterangan}`;

    const teks =
      `${label}\n` +
      `━━━━━━━━━━━━━━━\n` +
      `<blockquote>${nama} baru aja <b>${aksi}</b> channel ini\n\n` +
      `🆔 <b>User ID</b>\n<code>${user.id}</code>\n\n` +
      `📛 <b>Username</b>\n${user.username ? `@${escHtml(user.username)}` : '<i>gak punya username</i>'}\n\n` +
      `👤 <b>Nama Lengkap</b>\n<code>${namaLengkap}</code>\n\n` +
      `📢 <b>Channel</b>\n<b>${namaChannel}</b>\n` +
      `${rejoinInfo}\n\n` +
      `🕒 <b>Waktu</b>\n<code>${waktuSekarang()} WIB</code></blockquote>\n` +
      `━━━━━━━━━━━━━━━\n` +
      `<i>Create By : @${BOT_USERNAME || OWNER_USERNAME}</i>`;

    // Rejoin ke-3 otomatis diban. Join pertama tidak dihitung sebagai rejoin.
    if (joined && history.rejoinCount >= 3) {
      let banOk = false;
      try {
        await bot.banChatMember(chat.id, user.id);
        banOk = true;
      } catch (e) {
        await sendChannelMonitoringLog(chat.id, 
          `<blockquote>⚠️ <b>AUTO BAN GAGAL</b>\n\n` +
          `👤 User: ${nama}\n🆔 <code>${user.id}</code>\n` +
          `📢 Channel: <b>${namaChannel}</b>\n` +
          `🔁 Rejoin: <b>${history.rejoinCount}/3</b>\n\n`
          `Error: <code>${escHtml(e.message || 'Unknown error')}</code></blockquote>\n` +
          `<i>Create By : @${BOT_USERNAME || OWNER_USERNAME}</i>`
        );
      }
      if (banOk) {
        await sendChannelMonitoringLog(chat.id, 
          `<blockquote>🚫 <b>AUTO BAN — REJOIN TERLALU SERING</b>\n\n` +
          `👤 User: ${nama}\n🆔 <code>${user.id}</code>\n` +
          `📢 Channel: <b>${namaChannel}</b>\n` +
          `🛡️ Keterangan: <b>rejoin 3/3</b>\n\n` +
          `User otomatis diban karena sudah join/rejoin 3 kali.</blockquote>\n` +
          `<i>Create By : @${BOT_USERNAME || OWNER_USERNAME}</i>`,
          { reply_markup: buildBannedKeyboard(user, chat) }
        );
      }
    } else {
      await sendChannelMonitoringLog(chat.id, teks, { reply_markup: buildKeyboard(user, chat) });
    }

  } catch (err) {
    console.error('chat_member error:', err.message);
  }
});

async function finalizeGiveaway(ga, query = null) {
  if (!ga || ga.ended || ga.rolling) return false;
  if (ga.participants.size === 0) return false;

  ga.rolling = true;
  ga.ended = true;

  const pesertaArr = Array.from(ga.participants.values());
  const tempArr = [...pesertaArr];
  const winners = [];
  const count = Math.min(ga.winnerCount, tempArr.length);
  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * tempArr.length);
    winners.push(tempArr.splice(randomIndex, 1)[0]);
  }

  const winnerTextList = winners.map((w, i) => `${i + 1}. ${mentionSnapshot(w)} (<code>${w.id}</code>)`);
  const namaChannelHasil = ga.channelUsername
    ? `<a href="https://t.me/${ga.channelUsername}">${escHtml(ga.channelTitle)}</a>`
    : `<b>${escHtml(ga.channelTitle)}</b>`;

  try {
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
      chat_id: ga.channelId,
      message_id: ga.messageId
    });
  } catch (_) {}

  const finalResultMessage =
    `<blockquote>🎉 <b>GIVEAWAY BERAKHIR & PEMENANG DIUNDI!</b> 🎉</blockquote>\n` +
    `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
    `<blockquote>${ga.text}</blockquote>\n\n` +
    `📢 <b>Channel:</b> ${namaChannelHasil}\n\n` +
    `<blockquote>🏆 <b>SELAMAT KEPADA PEMENANG:</b>\n\n${winnerTextList.join('\\n')}\n\n` +
    `✨ <i>Hadiah akan dikirim langsung oleh bot ke chat pemenang.</i></blockquote>\n` +
    `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`;

  try {
    const hasilMsg = await bot.sendMessage(ga.channelId, finalResultMessage, { parse_mode: 'HTML' });
    try { await bot.pinChatMessage(ga.channelId, hasilMsg.message_id, { disable_notification: true }); } catch (_) {}

    if (ga.hadiahMessageId && ga.hadiahChatId) {
      for (const winner of winners) {
        try {
          await bot.copyMessage(winner.id, ga.hadiahChatId, ga.hadiahMessageId);
          await bot.sendMessage(winner.id, '🎁 <b>Hadiah giveaway kamu!</b> Hadiah sudah dikirim otomatis karena target peserta telah tercapai.', { parse_mode: 'HTML' });
        } catch (deliveryError) {
          try {
            await bot.sendMessage(ga.creatorId,
              `⚠️ Hadiah gagal dikirim ke pemenang <code>${winner.id}</code>. Pastikan dia sudah START bot.\nError: ${escHtml(deliveryError.message)}`,
              { parse_mode: 'HTML' }
            );
          } catch (_) {}
        }
      }
    }

    if (query) {
      await bot.answerCallbackQuery(query.id, { text: '🎲 Berhasil mengacak pemenang!' }).catch(() => {});
      await bot.sendMessage(query.message.chat.id,
        `✅ Pemenang giveaway berhasil diundi & diumumkan di channel!\n` +
        `📌 Giveaway selesai dan hadiah sudah diproses.`,
        { parse_mode: 'HTML' }
      ).catch(() => {});
    } else {
      await bot.sendMessage(ga.creatorId,
        `🎲 <b>Giveaway otomatis selesai!</b>\\n` +
        `👥 Target <b>${ga.maxParticipants}</b> peserta sudah tercapai.\n` +
        `🏆 Pemenang: <b>${winners.length}</b> orang.\n` +
        `🎁 Hadiah: ${ga.hadiahMessageId ? '✅ dikirim otomatis' : 'ℹ️ tidak ada hadiah tambahan'}`,
        { parse_mode: 'HTML' }
      ).catch(() => {});
    }
    return true;
  } catch (e) {
    ga.ended = false;
    console.error('Gagal finalize giveaway:', e.message);
    if (query) await bot.answerCallbackQuery(query.id, { text: 'Gagal ngirim pesan hasil.', show_alert: true }).catch(() => {});
    return false;
  } finally {
    ga.rolling = false;
  }
}

bot.on('callback_query', async (query) => {
  const data = query.data;
  const userId = query.from.id;

  if (data === 'user_reply_mode') {
    activeUserReplies.set(userId, true);
    await bot.answerCallbackQuery(query.id, { text: '✍️ Silakan ketik balasan Anda di chat ini.', show_alert: true });
    await bot.sendMessage(query.message.chat.id, '✍️ <b>Mode Balas Aktif</b>\nSilakan ketik pesan/balasan Anda, dan pesan tersebut akan langsung dikirim ke owner.', { parse_mode: 'HTML' });
    return;
  }

  async function editMenu(text, keyboard) {
    try {
      if (query.message.photo) {
        await bot.editMessageCaption(text, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      } else {
        await bot.editMessageText(text, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: keyboard,
          disable_web_page_preview: true
        });
      }
    } catch (_) {}
  }

  if (data === 'menu_tools') {
    await bot.answerCallbackQuery(query.id);
    const text = `<blockquote>🛠️ <b>TOOLS MENU</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
      `📊 <b>/status</b> — Statistik channel\n` +
      `Contoh: <code>/status</code>\n\n` +
      `📢 <b>/mych</b> — Lihat channel yang terhubung\n` +
      `Contoh: <code>/mych</code>\n\n` +
      `🎯 <b>/setch</b> — Set channel default\n` +
      `Contoh: <code>/setch -1001234567890</code>\n\n` +
      `🧾 <b>/testi</b> — Kirim testimoni\n` +
      `Contoh: reply foto/video lalu <code>/testi Produk:50000:DANA</code>\n\n` +
      `🎨 <b>/settemplate</b> — Custom template testi\n` +
      `Contoh: reply template lalu <code>/settemplate</code>\n\n` +
      `🎁 <b>/giveaway</b> — Buat giveaway di channel yang sudah terhubung\n` +
      `Contoh: <code>/giveaway -1001234567890 | 1 | 10 | Giveaway 10 orang</code>\n\n` +
      `🔁 <b>ANTI-SPAM REJOIN</b> — Jika member rejoin sampai 3 kali, bot otomatis ban (bot wajib admin).</blockquote>`;
    await editMenu(text, { inline_keyboard: [[{ text: '🔙 Kembali ke Menu Utama', callback_data: 'menu_home', style: 'primary' }]] });
    return;
  }

  if (data === 'menu_owner_info') {
    await bot.answerCallbackQuery(query.id);
    const text = `<blockquote>👑 <b>OWNER</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
      `👤 Developer: <b>@${OWNER_USERNAME}</b>\n` +
      `🆔 ID: <code>${OWNER_ID}</code>\n\n` +
      `Bot monitoring ini dikembangkan dan dikelola oleh @${OWNER_USERNAME}.</blockquote>`;
    await editMenu(text, { inline_keyboard: [[{ text: '🔙 Kembali ke Menu Utama', callback_data: 'menu_home', style: 'primary' }]] });
    return;
  }

  if (data === 'menu_info') {
    await bot.answerCallbackQuery(query.id);
    const text = `<blockquote>ℹ️ <b>INFORMASI SYSTEM</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
      `🟢 <b>Auto Monitoring</b> — aktif setelah bot dijadikan admin channel.\n` +
      `🟢 <b>Member Log</b> — setiap member masuk/keluar dicatat.\n` +
      `🛡️ <b>Anti-Spam</b> — rejoin ke-3 otomatis diban.\n` +
      `🧾 <b>Testi</b> — otomatis memakai ID transaksi + WM.\n` +
      `🎁 <b>Giveaway</b> — hanya bisa dipakai untuk channel yang sudah terhubung ke akun pembuat.\n` +
      `📦 <b>Backup</b> — sistem backup otomatis tetap berjalan.</blockquote>`;
    await editMenu(text, { inline_keyboard: [[{ text: '🔙 Kembali ke Menu Utama', callback_data: 'menu_home', style: 'primary' }]] });
    return;
  }

  if (data === 'menu_tqtq') {
    const tqtqText = 
      `<blockquote>✨ <b>CREDITS &amp; THANK TO</b> ✨\n` +
      `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
      `⪼ <a href="https://t.me/IpinXD">@IpinXD</a> ( Developer )\n` +
      `⪼ <a href="https://t.me/VANNZScyutt">@VANNZScyutt</a> ( friend )\n` +
      `⪼ <a href="https://t.me/AVTARITET0111">@AVTARITET0111</a> ( friend )\n\n` +
      `⪼ <a href="https://t.me/HanzzStorev1">@HanzzStorev1</a> ( friend )\n\n` +
      `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬</blockquote>`;

    const backKeyboard = {
      inline_keyboard: [
        [{ text: '🔙 Kembali ke Menu Utama', callback_data: 'menu_home', style: "primary" }]
      ]
    };

    await bot.answerCallbackQuery(query.id);
    try {
      if (query.message.photo) {
        await bot.editMessageCaption(tqtqText, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: backKeyboard
        });
      } else {
        await bot.editMessageText(tqtqText, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: backKeyboard,
          disable_web_page_preview: true
        });
      }
    } catch (e) {}
    return;
  }

  if (data === 'menu_home') {
    let keyboardRows = [
      [
        { text: '𝗧𝗤𝗧𝗤', callback_data: 'menu_tqtq', style: 'primary' },
        { text: '𝗧𝗢𝗢𝗟𝗦', callback_data: 'menu_tools', style: 'primary' }
      ],
      [
        { text: '𝗢𝗪𝗡𝗘𝗥', callback_data: 'menu_owner_info', style: 'primary' },
        { text: '𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗦𝗜', callback_data: 'menu_info', style: 'primary' }
      ]
    ];
    if (isOwner(userId)) keyboardRows.push([{ text: '𝗢𝗪𝗡𝗘𝗥 𝗠𝗘𝗡𝗨', callback_data: 'owner_menu', style: 'danger' }]);
    keyboardRows.push([{ text: '➕ 𝗠𝗔𝗦𝗨𝗞𝗞𝗔𝗡 𝗕𝗢𝗧 𝗞𝗘 𝗖𝗛𝗔𝗡𝗡𝗘𝗟', url: `https://t.me/${BOT_USERNAME}?startchannel&admin=invite_users+restrict_members+post_messages` }]);

    const keyboard = { inline_keyboard: keyboardRows };

    const teks =
      `<blockquote>『  ＭＯＮＩＴＯＲＩＮＧ ＳＹＳＴＥＭ  』</blockquote>
` +
      `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬

` +
      `<blockquote><b>BOT MONITORING BY @${OWNER_USERNAME} TELAH AKTIF</b></blockquote>

` +
      `<blockquote>Masukin bot ini ke channel lo, jadiin admin, Abis itu bot bakal mantengin siapa aja yang masuk sama keluar dari channel lo — otomatis, gak perlu setting apa-apa lagi.</blockquote>

` +
      `🆔 <b>ID Telegram Lo</b>
<code>${userId}</code>

` +
      `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
` +
      `<blockquote><i>Powered by @${OWNER_USERNAME}</i></blockquote>`;

    await bot.answerCallbackQuery(query.id);
    try {
      if (query.message.photo) {
        await bot.editMessageCaption(teks, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      } else {
        await bot.editMessageText(teks, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      }
    } catch (e) {}
    return;
  }

  if (data.startsWith('set_reply:')) {
    if (!isOwner(userId)) {
      await bot.answerCallbackQuery(query.id, { text: '⛔ Khusus owner!', show_alert: true });
      return;
    }
    const targetUserId = data.split(':')[1];
    activeReplies.set(userId, targetUserId);
    await bot.answerCallbackQuery(query.id, { text: `✅ Sesi aktif ke User ID: ${targetUserId}` });
    await bot.sendMessage(query.message.chat.id, `✍️ <b>Mode Balas Aktif</b>\nPesan teks selanjutnya akan otomatis dikirim ke User ID: <code>${targetUserId}</code>`, { parse_mode: 'HTML' });
    return;
  }

  if (data === 'check_join') {
    const isJoined = await checkMembership(userId);

    if (isJoined) {
      await bot.answerCallbackQuery(query.id, { text: '✅ Terima kasih sudah bergabung! Silakan kirim /start ulang.', show_alert: true });
      bot.sendMessage(query.message.chat.id, '🎉 Verifikasi berhasil! Ketik /start untuk membuka menu utama bot.');
    } else {
      await bot.answerCallbackQuery(query.id, { text: '❌ Kamu belum bergabung di semua channel wajib: @privateUpin dan @jastebcahnom!', show_alert: true });
    }
    return;
  }

  if (data.startsWith('ga_join:')) {
    const gaId = data.split(':')[1];
    if (!global.activeGiveaways || !global.activeGiveaways.has(gaId)) {
      await bot.answerCallbackQuery(query.id, { text: '❌ Giveaway sudah tidak aktif.', show_alert: true });
      return;
    }
    const ga = global.activeGiveaways.get(gaId);
    if (ga.ended) {
      await bot.answerCallbackQuery(query.id, { text: '❌ Giveaway sudah berakhir!', show_alert: true });
      return;
    }

    const pesertaId = String(userId);

    // Pemenang harus bisa menerima hadiah lewat DM. Jadi user wajib sudah /start bot.
    if (!users.has(pesertaId)) {
      await bot.answerCallbackQuery(query.id, {
        text: '⚠️ Kamu wajib START bot dulu agar kalau menang hadiah bisa dikirim ke chat kamu.',
        show_alert: true
      });
      return;
    }

    if (ga.participants.has(pesertaId)) {
      await bot.answerCallbackQuery(query.id, { text: '⚠️ Kamu sudah terdaftar!', show_alert: true });
    } else if (ga.maxParticipants && ga.participants.size >= ga.maxParticipants) {
      await bot.answerCallbackQuery(query.id, { text: '⚠️ Kuota peserta sudah penuh!', show_alert: true });
      return;
    } else {
      ga.participants.set(pesertaId, {
        id: userId,
        username: query.from.username || '',
        first_name: query.from.first_name || ''
      });
      await bot.answerCallbackQuery(query.id, { text: '✅ Berhasil ikut giveaway! 🎉', show_alert: true });

      try {
        if (ga.hasPhoto) {
          await bot.editMessageCaption(buildGaMessage(ga), {
            chat_id: ga.channelId,
            message_id: ga.messageId,
            parse_mode: 'HTML',
            reply_markup: buildGaKeyboard(gaId, ga.shareUrl)
          });
        } else {
          await bot.editMessageText(buildGaMessage(ga), {
            chat_id: ga.channelId,
            message_id: ga.messageId,
            parse_mode: 'HTML',
            reply_markup: buildGaKeyboard(gaId, ga.shareUrl)
          });
        }
      } catch (e) {}

      // Jika batas peserta sudah tercapai, langsung acak otomatis tanpa tombol manual.
      if (ga.maxParticipants && ga.participants.size >= ga.maxParticipants) {
        await finalizeGiveaway(ga);
      }
    }
    return;
  }

  if (data.startsWith('ga_count:')) {
    const gaId = data.split(':')[1];
    if (!global.activeGiveaways || !global.activeGiveaways.has(gaId)) {
      await bot.answerCallbackQuery(query.id, { text: '❌ Giveaway tidak ditemukan.', show_alert: true });
      return;
    }
    const ga = global.activeGiveaways.get(gaId);
    await bot.answerCallbackQuery(query.id, { text: `👥 Total peserta saat ini: ${ga.participants.size} orang.`, show_alert: true });
    return;
  }

  if (data.startsWith('ga_roll:')) {
    const gaId = data.split(':')[1];
    if (!global.activeGiveaways || !global.activeGiveaways.has(gaId)) {
      await bot.answerCallbackQuery(query.id, { text: '❌ Giveaway sudah tidak aktif.', show_alert: true });
      return;
    }
    const ga = global.activeGiveaways.get(gaId);

    if (!isOwner(userId) && userId !== ga.creatorId) {
      await bot.answerCallbackQuery(query.id, { text: '⛔ Khusus pembuat giveaway atau owner!', show_alert: true });
      return;
    }
    if (ga.ended) {
      await bot.answerCallbackQuery(query.id, { text: '⚠️ Sudah di acak sebelumnya!', show_alert: true });
      return;
    }
    if (ga.participants.size === 0) {
      await bot.answerCallbackQuery(query.id, { text: '⚠️ Tidak ada peserta.', show_alert: true });
      return;
    }
    await finalizeGiveaway(ga, query);
    return;
  }

  if (query.data === 'owner_menu') {
    if (!isOwner(userId)) {
      await bot.answerCallbackQuery(query.id, { text: '⛔ Khusus owner!', show_alert: true });
      return;
    }
    const daftarCh = channels.size;
    const daftarUsr = users.size;
    const teksMenu =
      `<blockquote>🛠️ <b>PANEL MENU ADMIN BOT</b>\n` +
      `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` +
      `📊 Total Channel Terdaftar: <b>${daftarCh}</b>\n` +
      `👥 Total User Bot (user.json): <b>${daftarUsr}</b>\n\n` +
      `<b>Daftar Perintah Admin:</b>\n` +
      `• /bc [pesan] — Broadcast ke seluruh user\n` +
      `• /bcuser [id] [pesan] — Kirim pesan ke user tertentu\n` +
      `• /channels — Lihat daftar channel bot\n` +
      `• /backup — Backup file bot ke zip\n` +
      `• /giveaway [id_ch] | [jumlah] | [pesan] — Buat Giveaway\n` +
      `• Setelah /giveaway: kirim file/link/pesan hadiah, atau /done jika tanpa hadiah</blockquote>`;

    await bot.answerCallbackQuery(query.id);
    await editMenu(teksMenu, { inline_keyboard: [
      [{ text: '📦 Backup', callback_data: 'owner_backup', style: 'primary' }],
      [{ text: '🔙 Kembali ke Menu Utama', callback_data: 'menu_home', style: 'primary' }]
    ] });
    return;
  }

  if (data === 'owner_backup') {
    if (!isOwner(userId)) {
      await bot.answerCallbackQuery(query.id, { text: '⛔ Khusus owner!', show_alert: true });
      return;
    }
    await bot.answerCallbackQuery(query.id, { text: '📦 Backup sedang dibuat...' });
    createAndSendBackup(userId, 'manual dari Owner Menu').catch(() => {});
    return;
  }

  const parts = query.data.split(':');
  const action = parts[0];
  const chatId = parts[1];
  const targetUserId = parts[2];

  try {
    const pengklik = await bot.getChatMember(chatId, userId);
    const isAdmin = ['administrator', 'creator'].includes(pengklik.status);
    if (!isAdmin) {
      await bot.answerCallbackQuery(query.id, { text: '⛔ Lo bukan admin channel ini.', show_alert: true });
      return;
    }
  } catch (e) {
    await bot.answerCallbackQuery(query.id, { text: 'Gagal verifikasi.', show_alert: true }).catch(() => {});
    return;
  }

  if (action === 'info') {
    try {
      const member = await bot.getChatMember(chatId, targetUserId);
      const u = member.user;
      const teks =
        `📋 <b>DETAIL USER</b>\n` +
        `━━━━━━━━━━━━━━━\n` +
        `🆔 <code>${u.id}</code>\n` +
        `📛 ${u.username ? `@${escHtml(u.username)}` : '-'}\n` +
        `👤 <code>${escHtml([u.first_name, u.last_name].filter(Boolean).join(' '))}</code>\n` +
        `📌 Status: <b>${escHtml(member.status)}</b>\n` +
        `━━━━━━━━━━━━━━━`;
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(query.message.chat.id, teks, { parse_mode: 'HTML' });
    } catch (e) {
      bot.answerCallbackQuery(query.id, { text: 'Gagal ambil data', show_alert: true }).catch(() => {});
    }
    return;
  }

  if (action === 'ban') {
    try {
      await bot.banChatMember(chatId, targetUserId);
      await bot.answerCallbackQuery(query.id, { text: 'Berhasil di-ban.' });
      await bot.sendMessage(query.message.chat.id, `🚫 <b>User</b> <code>${targetUserId}</code> di-ban.`, { parse_mode: 'HTML' });
    } catch (e) {
      bot.answerCallbackQuery(query.id, { text: 'Gagal ban', show_alert: true }).catch(() => {});
    }
    return;
  }

  if (action === 'unban') {
    try {
      await bot.unbanChatMember(chatId, targetUserId, { only_if_banned: true });

      // Reset siklus anti-spam supaya setelah unban user bisa join lagi
      // dan dihitung ulang dari awal sebagai "baru join".
      const history = getMemberHistory(chatId, targetUserId);
      history.joined = 0;
      history.left = 0;
      history.rejoinCount = 0;
      history.currentlyOut = false;
      saveStats();

      await bot.answerCallbackQuery(query.id, { text: 'Berhasil di-unban. User bisa join lagi.' });
      await bot.sendMessage(
        query.message.chat.id,
        `♻️ <b>User</b> <code>${targetUserId}</code> berhasil di-unban.\n` +
        `User sekarang bisa join lagi dan hitungan rejoin sudah di-reset.`,
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      bot.answerCallbackQuery(query.id, { text: 'Gagal unban', show_alert: true }).catch(() => {});
    }
    return;
  }
});

bot.on('polling_error', (err) => {});
process.on('unhandledRejection', (reason) => {});
process.on('SIGINT', () => {
  bot.stopPolling().finally(() => process.exit(0));
});
