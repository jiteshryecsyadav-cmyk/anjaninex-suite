# Sarvam + Gemini + Exotel Voice Bridge

Poora **Indian stack** voice agent — ElevenLabs se ~50% sasta (~₹3–5/min).

```
Exotel (phone)  →  Sarvam STT (Saarika)  →  Gemini 2.0 Flash  →  Sarvam TTS (Bulbul)  →  Exotel
```

Ek Python WebSocket server hai. Exotel Voicebot applet isse connect hota hai.

---

## Kya chahiye
- **Sarvam API key** — https://dashboard.sarvam.ai (STT + TTS ke liye)
- **Gemini API key** — https://aistudio.google.com/apikey (LLM ke liye, Flash sasta)
- Ek **subdomain** jaise `voice.tumhardomain.com` → VPS IP pe A-record
- VPS pe **Python 3.10+** + nginx (SSL ke liye)

> Exotel ko **valid `wss://` (CA-signed SSL)** chahiye — self-signed nahi chalega. Let's Encrypt free hai.

---

## VPS pe deploy (Hostinger)

### 1. Code + Python setup
```bash
cd /var/www/anjaninex/voice-bridge
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Config (.env)
```bash
cp .env.example .env
nano .env      # SARVAM_API_KEY + GEMINI_API_KEY bharo, prompt/first message set karo
```

### 3. systemd service (background me chale)
```bash
sudo tee /etc/systemd/system/voice-bridge.service > /dev/null << 'EOF'
[Unit]
Description=Sarvam-Gemini Exotel Voice Bridge
After=network.target

[Service]
WorkingDirectory=/var/www/anjaninex/voice-bridge
EnvironmentFile=/var/www/anjaninex/voice-bridge/.env
ExecStart=/var/www/anjaninex/voice-bridge/venv/bin/python bridge.py
Restart=always
User=root

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now voice-bridge
sudo systemctl status voice-bridge --no-pager
curl http://localhost:10002/health      # {"ok":true,...} aana chahiye
```

### 4. Subdomain + SSL + nginx (wss proxy)
Pehle DNS me `voice.tumhardomain.com` → VPS IP (A record). Phir:
```bash
sudo tee /etc/nginx/sites-available/voice-bridge << 'EOF'
server {
    listen 80;
    server_name voice.tumhardomain.com;
    location / {
        proxy_pass http://127.0.0.1:10002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
EOF
sudo ln -s /etc/nginx/sites-available/voice-bridge /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Free SSL
sudo certbot --nginx -d voice.tumhardomain.com --non-interactive --agree-tos -m tumhara@email.com --redirect
```

### 5. Exotel Voicebot applet me URL daalo
Exotel → apna Voicebot flow (VYAPAAR SETU) → Voicebot applet ke box me:
```
wss://voice.tumhardomain.com/media
```
Save → flow ko ExoPhone number pe assign → **call karke test**.

---

## Logs / debug
```bash
sudo journalctl -u voice-bridge -f      # live logs: [user] ... [anji] ...
```

## Tune karna
`.env` me:
- `FIRST_MESSAGE` / `SYSTEM_PROMPT` — anji kya bole, kaise bole
- `TTS_SPEAKER` — Sarvam ki alag awaaz (anushka, meera, ...)
- `LANGUAGE` — `hi-IN`, `en-IN`, `gu-IN`, etc.
- `SILENCE_MS` — anji jaldi kaat de to badhao (jaise 900)
- `VAD_THRESHOLD` — shor wale mahaul me badhao (jaise 800)

Badalne ke baad: `sudo systemctl restart voice-bridge`

---

## Cost (approx)
| Item | Rate |
|---|---|
| Sarvam STT | ~₹0.5–1 / min audio |
| Gemini 2.0 Flash | ~₹0.2–0.5 / min (bahut sasta) |
| Sarvam TTS | ~₹1–2 / min bola gaya |
| Exotel line | ~₹0.6–1 / min |
| **Total** | **~₹3–5 / min** |

ElevenLabs (~₹8-9/min) ke muqable ~50–60% sasta. Koi premium subscription nahi — sirf API usage.
