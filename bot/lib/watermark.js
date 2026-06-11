// Photo par watermark stamp (sharp se).
// Format: NAAM(3 letter) + MOBILE(first 4) + date-time + rate.
const sharp = require('sharp');

// XML/SVG ke liye text safe karo.
function esc(s) {
  return String(s || '').replace(/[<>&'"]/g, c => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ));
}

// Watermark line banao: "ANJ 9876 · 02-Jun 15:30 · ₹699/mtr"
function buildLabel({ name, phone, rate, unit }) {
  const nm = String(name || '').replace(/\s+/g, '').slice(0, 3).toUpperCase() || 'NAM';
  const ph = String(phone || '').replace(/\D/g, '').slice(0, 4);   // first 4 digit
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  const dt = `${pad(d.getDate())}-${mon} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const rt = rate ? `₹${rate}${unit ? '/' + unit : ''}` : '';
  return [nm, ph, dt, rt].filter(Boolean).join(' · ');
}

// buffer (image) + {name, phone, rate, unit} -> watermarked buffer.
async function watermark(buffer, info) {
  // Purane callers code string bhej dete the — bhi chal jaye.
  const label = typeof info === 'string' ? info : buildLabel(info || {});

  const img = sharp(buffer);
  const meta = await img.metadata();
  const w = meta.width || 800;
  const h = meta.height || 800;

  const barH = Math.max(40, Math.round(h * 0.07));
  const fontSize = Math.round(barH * 0.42);
  // Patti solid-si (0.92) — taaki forward hone par bhi detect ho sake.
  const svg = `
    <svg width="${w}" height="${h}">
      <rect x="0" y="${h - barH}" width="${w}" height="${barH}" fill="rgba(45,16,64,0.92)"/>
      <text x="14" y="${h - Math.round(barH * 0.34)}" font-family="sans-serif"
            font-size="${fontSize}" fill="#ffffff" font-weight="bold">Namokara · ${esc(label)}</text>
    </svg>`;

  return await img
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 85 })
    .toBuffer();
}

// Photo me humari watermark patti hai kya? (neeche ki patti ka color check — koi AI nahi).
// Buyer humari bheji photo wapas bheje to "buyer" pakda jaye.
async function hasWatermark(buffer) {
  try {
    const img = sharp(buffer);
    const meta = await img.metadata();
    const w = meta.width, h = meta.height;
    if (!w || !h) return false;

    const barH = Math.max(20, Math.round(h * 0.07));
    const { data, info } = await img
      .extract({ left: 0, top: h - barH, width: w, height: barH })
      .removeAlpha().raw().toBuffer({ resolveWithObject: true });

    const ch = info.channels || 3;
    let r = 0, g = 0, b = 0; const px = info.width * info.height;
    for (let i = 0; i < data.length; i += ch) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
    r /= px; g /= px; b /= px;

    const avg = (r + g + b) / 3;
    const dark = avg < 115;                 // patti gehri purple hai
    const purplish = (b >= g - 5) && (r >= g - 5);  // blue & red, green se zyada (purple)
    return dark && purplish;
  } catch (e) {
    return false;
  }
}

module.exports = { watermark, buildLabel, hasWatermark };
