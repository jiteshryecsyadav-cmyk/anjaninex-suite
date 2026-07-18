"""
Sarvam + Gemini + Exotel Voice Bridge  (MULTI-TENANT)
=====================================================
Ek server, sab firms ke AI phone agents. Har call pe firm ki apni config
(naam, script, awaaz, bhasha) database se load hoti hai.

    Exotel (phone)  ->  Sarvam STT (Saarika)  ->  Gemini 2.0 Flash  ->  Sarvam TTS (Bulbul)  ->  Exotel

Config source (per firm): platform.voice_agents  (Anjaninex admin panel se set hoti hai)
Central keys (Anjaninex ki): SARVAM_API_KEY, GEMINI_API_KEY  (.env me)

Exotel Voicebot applet URL (har firm alag):
    wss://voice.anjaninex.com/media?firm_id=<FIRM_UUID>

Audio: 8kHz, 16-bit, mono, little-endian PCM (slin), base64.
"""

import asyncio
import base64
import io
import json
import os
import struct
import wave

import aiohttp
from aiohttp import web

try:
    import asyncpg
except ImportError:
    asyncpg = None

# ---------------------------------------------------------------------------
# Central config (Anjaninex ki keys — sab firms share karte hain)
# ---------------------------------------------------------------------------
SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
DATABASE_URL   = os.environ.get("DATABASE_URL", "")     # postgresql://user:pass@localhost:5432/namokara
PORT           = int(os.environ.get("PORT", "10002"))

STT_MODEL      = os.environ.get("STT_MODEL", "saarika:v2.5")
TTS_MODEL      = os.environ.get("TTS_MODEL", "bulbul:v2")
GEMINI_MODEL   = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")

# Fallback (agar DB me firm config na mile — single-tenant test ke liye)
DEF_NAME       = os.environ.get("AGENT_NAME", "Riddhi")
DEF_FIRST      = os.environ.get("FIRST_MESSAGE",
                    "Namaste! Main Riddhi bol rahi hoon. Aapki kya madad kar sakti hoon?")
DEF_PROMPT     = os.environ.get("SYSTEM_PROMPT",
                    "Tum ek friendly hindi phone assistant ho. Chhote saral vaakya me baat karo. "
                    "Ek baar me ek sawaal. Jo nahi pata saaf bolo. Jhoothi jaankari mat do.")
DEF_LANG       = os.environ.get("LANGUAGE", "hi-IN")
DEF_SPEAKER    = os.environ.get("TTS_SPEAKER", "anushka")

# Turn detection
SILENCE_MS     = int(os.environ.get("SILENCE_MS", "700"))
VAD_THRESHOLD  = int(os.environ.get("VAD_THRESHOLD", "500"))
MIN_SPEECH_MS  = int(os.environ.get("MIN_SPEECH_MS", "300"))

SAMPLE_RATE    = 8000
BYTES_PER_MS   = int(SAMPLE_RATE * 2 / 1000)
FRAME_MS       = 100

SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"
SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"
GEMINI_URL     = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"


# ---------------------------------------------------------------------------
# Audio helpers
# ---------------------------------------------------------------------------
def pcm_to_wav_bytes(pcm, rate=SAMPLE_RATE):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm)
    return buf.getvalue()


def wav_bytes_to_pcm(wav_bytes):
    try:
        with wave.open(io.BytesIO(wav_bytes), "rb") as w:
            return w.readframes(w.getnframes())
    except Exception:
        return wav_bytes


def rms(pcm):
    n = len(pcm) // 2
    if n == 0:
        return 0.0
    total = 0
    for s in struct.unpack("<%dh" % n, pcm[: n * 2]):
        total += s * s
    return (total / n) ** 0.5


def split_sentences(text, max_len=450):
    text = text.strip()
    if not text:
        return []
    parts, cur = [], ""
    for token in text.replace("।", "। ").split(" "):
        if len(cur) + len(token) + 1 > max_len:
            if cur:
                parts.append(cur.strip())
            cur = token
        else:
            cur = (cur + " " + token).strip()
    if cur:
        parts.append(cur.strip())
    return parts


# ---------------------------------------------------------------------------
# AI calls (per-call language/speaker/prompt lete hain)
# ---------------------------------------------------------------------------
async def sarvam_stt(session, pcm, language):
    form = aiohttp.FormData()
    form.add_field("file", pcm_to_wav_bytes(pcm), filename="a.wav", content_type="audio/wav")
    form.add_field("model", STT_MODEL)
    form.add_field("language_code", language)
    try:
        async with session.post(SARVAM_STT_URL, data=form,
                                headers={"api-subscription-key": SARVAM_API_KEY}, timeout=20) as r:
            data = await r.json()
            return (data.get("transcript") or "").strip()
    except Exception as e:
        print(f"[STT error] {e}", flush=True)
        return ""


async def gemini_reply(session, history, system_prompt):
    contents = [{"role": t["role"], "parts": [{"text": t["text"]}]} for t in history]
    body = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.6, "maxOutputTokens": 200},
    }
    try:
        async with session.post(GEMINI_URL, json=body,
                                params={"key": GEMINI_API_KEY}, timeout=20) as r:
            data = await r.json()
            cand = (data.get("candidates") or [{}])[0]
            parts = cand.get("content", {}).get("parts", [{}])
            return (parts[0].get("text") or "").strip()
    except Exception as e:
        print(f"[LLM error] {e}", flush=True)
        return "Maaf kijiye, thodi dikkat aa gayi. Kripya dobara boliye."


async def sarvam_tts(session, text, language, speaker):
    pcm = b""
    for chunk in split_sentences(text):
        body = {
            "inputs": [chunk], "target_language_code": language, "speaker": speaker,
            "model": TTS_MODEL, "pitch": 0, "pace": 1.0, "loudness": 1.0,
            "speech_sample_rate": SAMPLE_RATE, "enable_preprocessing": True,
        }
        try:
            async with session.post(SARVAM_TTS_URL, json=body,
                                    headers={"api-subscription-key": SARVAM_API_KEY}, timeout=20) as r:
                data = await r.json()
                for b64 in data.get("audios", []):
                    pcm += wav_bytes_to_pcm(base64.b64decode(b64))
        except Exception as e:
            print(f"[TTS error] {e}", flush=True)
    return pcm


# ---------------------------------------------------------------------------
# Per-firm config load (DB se)
# ---------------------------------------------------------------------------
async def load_config(pool, firm_id=None, to_number=None):
    """platform.voice_agents se firm ki config. Na mile to None."""
    if pool is None:
        return None
    try:
        async with pool.acquire() as conn:
            row = None
            if firm_id:
                row = await conn.fetchrow(
                    "SELECT * FROM platform.voice_agents WHERE firm_id = $1::uuid AND enabled", firm_id)
            if row is None and to_number:
                digits = "".join(c for c in to_number if c.isdigit())[-10:]
                if digits:
                    row = await conn.fetchrow(
                        "SELECT * FROM platform.voice_agents "
                        "WHERE regexp_replace(COALESCE(exotel_number,''),'\\D','','g') LIKE '%'||$1||'%' "
                        "AND enabled LIMIT 1", digits)
            if row:
                return {
                    "name": row["agent_name"] or DEF_NAME,
                    "first": row["first_message"] or DEF_FIRST,
                    "prompt": row["system_prompt"] or DEF_PROMPT,
                    "language": row["language"] or DEF_LANG,
                    "speaker": row["voice_speaker"] or DEF_SPEAKER,
                }
    except Exception as e:
        print(f"[DB error] {e}", flush=True)
    return None


def default_config():
    return {"name": DEF_NAME, "first": DEF_FIRST, "prompt": DEF_PROMPT,
            "language": DEF_LANG, "speaker": DEF_SPEAKER}


# ---------------------------------------------------------------------------
# Per-call session
# ---------------------------------------------------------------------------
class CallSession:
    def __init__(self, ws, http, stream_sid, cfg):
        self.ws = ws
        self.http = http
        self.stream_sid = stream_sid
        self.cfg = cfg
        self.history = []
        self.buffer = bytearray()
        self.speaking = False
        self.speech_ms = 0
        self.silence_ms = 0
        self.playing = False
        self.processing = False

    async def send_media(self, pcm):
        frame = FRAME_MS * BYTES_PER_MS
        self.playing = True
        try:
            for i in range(0, len(pcm), frame):
                if not self.playing:
                    break
                chunk = pcm[i:i + frame]
                await self.ws.send_str(json.dumps({
                    "event": "media", "stream_sid": self.stream_sid,
                    "media": {"payload": base64.b64encode(chunk).decode()}}))
                await asyncio.sleep(FRAME_MS / 1000.0)
        finally:
            self.playing = False

    async def stop_playback(self):
        if self.playing:
            self.playing = False
            try:
                await self.ws.send_str(json.dumps(
                    {"event": "clear", "stream_sid": self.stream_sid}))
            except Exception:
                pass

    async def say(self, text):
        if not text:
            return
        self.history.append({"role": "model", "text": text})
        pcm = await sarvam_tts(self.http, text, self.cfg["language"], self.cfg["speaker"])
        if pcm:
            asyncio.create_task(self.send_media(pcm))

    async def greet(self):
        await self.say(self.cfg["first"])

    def on_media(self, pcm):
        energy = rms(pcm)
        chunk_ms = len(pcm) / BYTES_PER_MS
        if self.playing and energy > VAD_THRESHOLD:
            asyncio.create_task(self.stop_playback())
        if energy > VAD_THRESHOLD:
            self.speaking = True
            self.speech_ms += chunk_ms
            self.silence_ms = 0
            self.buffer += pcm
        elif self.speaking:
            self.silence_ms += chunk_ms
            self.buffer += pcm
            if self.silence_ms >= SILENCE_MS:
                if self.speech_ms >= MIN_SPEECH_MS and not self.processing:
                    audio = bytes(self.buffer)
                    self.buffer = bytearray()
                    self.speaking = False; self.speech_ms = 0; self.silence_ms = 0
                    asyncio.create_task(self.handle_turn(audio))
                else:
                    self.buffer = bytearray()
                    self.speaking = False; self.speech_ms = 0; self.silence_ms = 0

    async def handle_turn(self, audio):
        self.processing = True
        try:
            text = await sarvam_stt(self.http, audio, self.cfg["language"])
            if not text:
                return
            print(f"[user] {text}", flush=True)
            self.history.append({"role": "user", "text": text})
            reply = await gemini_reply(self.http, self.history, self.cfg["prompt"])
            print(f"[{self.cfg['name']}] {reply}", flush=True)
            await self.say(reply)
        finally:
            self.processing = False


# ---------------------------------------------------------------------------
# WebSocket handler
# ---------------------------------------------------------------------------
async def ws_handler(request):
    ws = web.WebSocketResponse(heartbeat=20)
    await ws.prepare(request)
    http = request.app["http"]
    pool = request.app.get("pool")
    firm_id = request.query.get("firm_id")     # wss://.../media?firm_id=<uuid>
    call = None
    print(f"[ws] connected firm_id={firm_id}", flush=True)

    async for msg in ws:
        if msg.type != aiohttp.WSMsgType.TEXT:
            continue
        try:
            data = json.loads(msg.data)
        except Exception:
            continue
        event = data.get("event")

        if event == "start":
            start = data.get("start", {})
            sid = start.get("stream_sid") or data.get("stream_sid")
            to_number = start.get("to")
            cfg = await load_config(pool, firm_id=firm_id, to_number=to_number)
            if cfg is None:
                cfg = default_config()
                print("[warn] firm config nahi mili — default use ho raha hai", flush=True)
            print(f"[call start] from={start.get('from','?')} to={to_number} "
                  f"agent={cfg['name']} lang={cfg['language']}", flush=True)
            call = CallSession(ws, http, sid, cfg)
            await call.greet()

        elif event == "media" and call:
            payload = data.get("media", {}).get("payload")
            if payload:
                call.on_media(base64.b64decode(payload))

        elif event == "stop":
            print("[call stop]", flush=True)
            break

    if call:
        await call.stop_playback()
    print("[ws] closed", flush=True)
    return ws


async def health(request):
    pool = request.app.get("pool")
    return web.json_response({
        "ok": True,
        "sarvam_key_set": bool(SARVAM_API_KEY),
        "gemini_key_set": bool(GEMINI_API_KEY),
        "db_connected": pool is not None,
    })


async def load_central_keys(pool):
    """Sarvam + Gemini keys DB (platform.voice_config) se — admin panel se set hoti.
    DB me ho to env ko override karti hain (taaki admin UI se manage ho sake)."""
    global SARVAM_API_KEY, GEMINI_API_KEY
    if pool is None:
        return
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT sarvam_key, gemini_key FROM platform.voice_config WHERE id = 1")
        if row:
            if row["sarvam_key"]:
                SARVAM_API_KEY = row["sarvam_key"].strip()
            if row["gemini_key"]:
                GEMINI_API_KEY = row["gemini_key"].strip()
            print(f"[boot] Central keys DB se load: sarvam={'yes' if SARVAM_API_KEY else 'no'} "
                  f"gemini={'yes' if GEMINI_API_KEY else 'no'}", flush=True)
    except Exception as e:
        print(f"[boot] voice_config read fail (env keys use hongi): {e}", flush=True)


async def on_startup(app):
    app["http"] = aiohttp.ClientSession()
    app["pool"] = None
    if DATABASE_URL and asyncpg:
        try:
            app["pool"] = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=4)
            print("[boot] DB pool connected", flush=True)
            await load_central_keys(app["pool"])
        except Exception as e:
            print(f"[boot] DB connect fail (default config use hogi): {e}", flush=True)


async def on_cleanup(app):
    await app["http"].close()
    if app.get("pool"):
        await app["pool"].close()


def main():
    app = web.Application()
    app.add_routes([
        web.get("/health", health),
        web.get("/media", ws_handler),
        web.get("/", health),
    ])
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    print(f"[boot] Multi-tenant Sarvam+Gemini Exotel bridge on :{PORT}", flush=True)
    web.run_app(app, host="0.0.0.0", port=PORT)


if __name__ == "__main__":
    main()
