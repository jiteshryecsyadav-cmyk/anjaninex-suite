# Namokara WhatsApp Bot

Alag Node.js app jo aapke WhatsApp number ko supplier↔buyer broker bana deta hai.
Suite ke **isi PostgreSQL** se baat karta hai (alag DB nahi). **Koi AI / API key nahi** — sab pure logic (regex + state machine + SQL).

## Ye kya karta hai

1. **Registration** — naya number "Hi" bheje → bot puche Supplier ya Buyer → naam → city → `core.contacts` + profile me save.
2. **Supplier photo** → bot dekhta hai number kis ka hai.
   - Caption me "Rate 699" likha ho → rate utha le. (rule: "rate/price/rs/₹/@" ke aage digit)
   - Na likha ho → bot khud puche "Rate kya hai?"
3. **Watermark** — photo par `naam(3) · mobile(first 4) · date-time · ₹rate` chhap jata hai.
4. **Auto-broadcast** — rate set hote hi system matching **buyers** dhundta hai (buyer master ka `budget_min ≤ rate ≤ budget_max` + category) aur sab ko photo + code bhej deta hai.
5. **Order flow** — buyer photo ka code `ORDER NAM-...` bheje → bot "Order confirm? yes/no" → "Quantity?" → supplier ko order jaye → supplier "yes/no" → buyer ko result. Order `wa.orders` me save (AD order list me dikhega).

## Setup (ek baar)

1. **DB migrations chalao** (pgAdmin me, F5):
   - `db/init/24-whatsapp-bot.sql`  (agar pehle nahi chalaya)
   - `db/init/25-wa-orders.sql`  ← **naya**

2. **Node packages install** (bot folder me) — `sharp` (watermark) ke liye zaroori:
   ```powershell
   cd "G:\Indian B2B SaaS platform\bot"
   npm install
   ```

3. **Config** — `.env` me values:
   - `PGPASSWORD` — postgres password
   - `FIRM_ID` — `SELECT id, name FROM platform.firms;`
   - (AI key ki **zarurat nahi** — agar `.env` me hai to ignore ho jayegi)
   - optional: `BROADCAST_DELAY_MS` (default 1200) — buyers ko bhejne ke beech delay

4. **Bot chalao**:
   ```powershell
   npm start
   ```
   Pehli baar QR aayega → WhatsApp → Linked Devices → Link a Device → scan.
   "✅ WhatsApp connected!" ke baad ready.

## Test

- Naye number se "Hi" → registration test.
- Registered **supplier** se fabric photo + "Rate 699" → watermark + matching buyers ko auto-bhej.
- Photo bina rate ke → bot "Rate kya hai?" puchega → "699" bhejo.
- **Buyer** ko aayi photo ka code `ORDER NAM-Sxxxxx-R699` bhejo → order flow chalu.

## Note

- Bot 24/7 chalna chahiye (alag terminal/server).
- **Auto-broadcast warning:** bahut buyers ko bina permission photo jaati hai → WhatsApp number ban ka risk. `BROADCAST_DELAY_MS` se thoda bacha hai, par dhyan rakhein.
- Session `./auth` me save — dobara QR nahi.
