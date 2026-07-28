# Vyapaar Setu → PLAY STORE ka poora nuskha (TWA)

Humari live PWA ko hi Android app me lapet kar Play Store par — code wahi, har web-deploy
khud app me pahunchta hai. Kul kharcha: $25 (ek-baar). Kul samay: ~2-3 din + Google review.

## 🔴 SABSE PEHLE (Play se pehle ZAROORI)
- **OTP testing-mode band karo**: abhi WhatsApp-provider OFF hone par OTP screen par hi
  dikh jata hai (`otpPreview`). Production: sadmin → `wa_provider_settings` enable = asli
  WhatsApp/SMS se OTP. Iske bina Play par mat jao.

## KADAM 1 — Play Console account (user ka kaam, ~30 min)
- https://play.google.com/console → **Organization (business)** account banao — $25.
  (Personal account par naya niyam: 12 testers × 14 din closed-testing pehle — business par nahi.)
- Business detail: Anjaninex; verification me D-U-N-S/documents lag sakte hain.

## KADAM 2 — App banana (is folder se, kisi bhi machine par)
```bash
npm i -g @bubblewrap/cli
cd deploy-kit/playstore
bubblewrap init --manifest=https://vyaparsetu.anjaninex.com/manifest.webmanifest
#  → pehli baar JDK + Android SDK khud download karega (haan bolte jao)
#  → sawalon ke jawab isi folder ke twa-manifest.json jaise rakho
#    (packageId: com.anjaninex.vyaparsetu · signing key NAYA banwao, alias: vyaparsetu)
#  ⚠️ android.keystore + password TIJORI me rakho — kho gaya to app ka update kabhi nahi de paoge.
#    Keystore ko git me COMMIT MAT karna.
bubblewrap build
#  → banega: app-release-bundle.aab  (yehi Play par jata hai)
```

## KADAM 3 — Domain verify (assetlinks) — iske bina app me upar URL-bar dikhega
```bash
# SHA256 fingerprint nikalo (build ke baad):
keytool -list -v -keystore android.keystore -alias vyaparsetu | grep SHA256
```
- Is folder ke `assetlinks.json` me `REPLACE_WITH_SHA256` ki jagah wo fingerprint daalo
  (colon wale format me hi, jaise `AA:BB:...`).
- Server par chadhao:
```bash
scp assetlinks.json root@srv1541519.hstgr.cloud:/var/www/anjaninex-web/.well-known/assetlinks.json
# check: https://vyaparsetu.anjaninex.com/.well-known/assetlinks.json khul kar JSON dikhe
```
- NOTE: Play Console me "Play App Signing" ON karoge (recommended) to Google ka APNA
  certificate lagta hai — Console → Setup → App integrity me jo SHA256 dikhe, use bhi
  assetlinks ke `sha256_cert_fingerprints` array me JOD do (dono rakho).

## KADAM 4 — Play Console me listing
- App create → naam **Vyapaar Setu** → upload `app-release-bundle.aab` (Internal testing pehle).
- **Store listing** (draft neeche 'listing.md' me likha hai — copy/paste).
- Icon 512: `https://vyaparsetu.anjaninex.com/icons/icon-512.png` download karke lagao.
- Feature graphic 1024×500 + 4-6 phone screenshots (app ke asli screen — chat, bazaar, dashboard).
- **Privacy policy URL**: `https://vyaparsetu.anjaninex.com/privacy` (live hai ✓)

## KADAM 5 — Data Safety form (sach-sach yehi bharna)
- Collects: **Phone number** (account/OTP), **Photos** (user-uploaded, app functionality),
  **Name/Business info** (account), **Financial info: purchase history** (billing records).
- Shared with third parties: **No** (data sirf humare server par).
- Encrypted in transit: **Yes** (HTTPS). · Deletion request: **Yes** (firm se sampark).
- Data NOT sold. Koi ads nahi.

## KADAM 6 — Review & release
- Internal testing → khud install karke chalao → phir Production me "Release".
- Review aam taur par 1-7 din. Reject ho to wajah padh kar yahin theek karenge.

## Aage (Play ke BAAD)
- Capacitor wrap → PUSH NOTIFICATIONS (band app me message ki ghanti) → phir in-app calling.
- Party-side "VS Chat" ki alag listing chahiye ho to alag packageId se doosri TWA.
