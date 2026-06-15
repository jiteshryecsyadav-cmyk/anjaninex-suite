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
const pino = require('pino');
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

// Bheje gaye messages ka store (id -> content). Ye ZAROORI hai: jab recipient bot ka
// reply decrypt nahi kar pata to wo "retry receipt" bhejta hai; getMessage isi store se
// message lautata hai taaki bot dobara bhej sake. Iske bina recipient pe "Waiting for
// this message" atak jaata hai. (Last 500 messages yaad rakho, memory leak na ho.)
const sentMsgStore = new Map();
function storeSent(sent) {
  try {
    if (sent?.key?.id && sent.message) {
      sentMsgStore.set(sent.key.id, sent.message);
      if (sentMsgStore.size > 500) sentMsgStore.delete(sentMsgStore.keys().next().value);
    }
  } catch {}
}

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

  if (msg.image) storeSent(await sock.sendMessage(jid, { image: msg.image, caption: msg.caption || '' }));
  else if (msg.text) storeSent(await sock.sendMessage(jid, { text: msg.text }));
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
    browser: Browsers.ubuntu('Chrome'),
    logger: pino({ level: 'warn' }),          // kam shor (session crypto dumps band)
    defaultQueryTimeoutMs: 60000,             // init-queries timeout se bachne ke liye
    // FIX "Waiting for this message": retry-receipt aane par bot dobara bhej sake
    getMessage: async (key) => sentMsgStore.get(key.id) || undefined
  });

  sock.ev.on('creds.update', saveCreds);

  // PAIRING CODE option: agar WA_PAIR_NUMBER .env me set hai to QR ke bajaye 8-char
  // code milega — WhatsApp → Linked Devices → Link a Device → "Link with phone number" →
  // ye code daalo. Number international format me bina + (jaise 919511540583).
  const PAIR_NUMBER = (process.env.WA_PAIR_NUMBER || '').replace(/\D/g, '');
  let pairingRequested = false;

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      if (PAIR_NUMBER && !pairingRequested && !sock.authState.creds.registered) {
        pairingRequested = true;
        try {
          const code = await sock.requestPairingCode(PAIR_NUMBER);
          const pretty = code.match(/.{1,4}/g)?.join('-') || code;
          console.log('\n========================================');
          console.log('🔢 WhatsApp PAIRING CODE: ' + pretty);
          console.log('   WhatsApp → Linked Devices → Link a Device →');
          console.log('   "Link with phone number instead" → ye code daalo');
          console.log('========================================\n');
        } catch (e) { console.error('pairing code fail:', e.message); }
      } else {
        console.log('\n📱 WhatsApp se ye QR scan karein (Linked Devices):\n');
        qrcode.generate(qr, { small: true });
      }
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
        if (reply && reply.text) storeSent(await sock.sendMessage(jid, { text: reply.text }));
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
