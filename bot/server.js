// =============================================================================
// Namokara WhatsApp Bot — entry point
// Baileys se WhatsApp connect, message aaye to pipeline ko de.
// Run: npm install && npm start  (pehli baar QR scan karein WhatsApp se)
// =============================================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const qrcode = require('qrcode-terminal');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const { handleMessage } = require('./lib/pipeline');
const { watermark } = require('./lib/watermark');

const SESSION_DIR = process.env.WA_SESSION_DIR || './auth';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Save an image buffer to disk, return relative path.
async function saveImage(buffer, hash) {
  const file = path.join(UPLOAD_DIR, `${hash}-${Date.now()}.jpg`);
  fs.writeFileSync(file, buffer);
  return file;
}

let sock = null;

// Kisi bhi phone (10-digit) ko message bhejo — broadcast / order routing ke liye.
async function send(phone, msg) {
  if (!sock || !phone) return;
  const digits = String(phone).replace(/\D/g, '');
  const jid = (digits.length === 10 ? '91' + digits : digits) + '@s.whatsapp.net';

  // SAFETY: number WhatsApp pe hai ya nahi? Fake/invalid (demo) numbers skip karo —
  // warna WhatsApp spam samajh ke account ko restrict/ban kar sakta hai.
  try {
    const res = await sock.onWhatsApp(jid);
    if (!res || !res[0] || !res[0].exists) {
      console.log('[send] skip (not on WhatsApp):', digits);
      return;
    }
  } catch (e) { /* check fail ho to bhej do (legit number na chhoot jaye) */ }

  if (msg.image) await sock.sendMessage(jid, { image: msg.image, caption: msg.caption || '' });
  else if (msg.text) await sock.sendMessage(jid, { text: msg.text });
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  // WhatsApp ka latest web version fetch karo — warna "Connection 405" loop aata hai.
  const { version } = await fetchLatestBaileysVersion();
  console.log('Using WhatsApp Web version', version.join('.'));

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome')
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      console.log('\n📱 WhatsApp se ye QR scan karein (Linked Devices):\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') console.log('✅ WhatsApp connected! Bot ready.');
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const reconnect = code !== DisconnectReason.loggedOut;
      console.log(`⚠️ Connection closed (${code}). Reconnect: ${reconnect}`);
      if (reconnect) setTimeout(start, 3000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      try {
        if (!m.message || m.key.fromMe) continue;
        const jid = m.key.remoteJid || '';
        if (jid.endsWith('@g.us') || jid === 'status@broadcast') continue; // skip groups/status
        const fromPhone = jid.split('@')[0];

        // text
        const text = m.message.conversation
          || m.message.extendedTextMessage?.text
          || m.message.imageMessage?.caption
          || '';

        // image
        let imageBuffer = null;
        if (m.message.imageMessage) {
          const { downloadMediaMessage } = require('@whiskeysockets/baileys');
          imageBuffer = await downloadMediaMessage(m, 'buffer', {});
        }

        const reply = await handleMessage({ fromPhone, text, imageBuffer, saveImage, watermark, send });
        if (reply && reply.text) await sock.sendMessage(jid, { text: reply.text });
      } catch (e) {
        console.error('[msg] error:', e.message);
      }
    }
  });
}

// Tiny health + uploads server.
const app = express();
app.get('/health', (_req, res) => res.json({ ok: true, connected: !!sock?.user }));
// Suite me photo dikhane ke liye uploads serve karo (img tag, koi CORS issue nahi).
app.use('/uploads', express.static(UPLOAD_DIR));
app.listen(+(process.env.PORT || 5050), () =>
  console.log(`🤖 Bot health server on :${process.env.PORT || 5050}`));

start().catch(e => { console.error('Bot start fail:', e); process.exit(1); });
