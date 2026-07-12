# CREDIL — Payment & Trust Index
### Vyapaar Setu / Anjaninex — Network Score Card (CIBIL-style) — Product Spec / Blueprint

> **CREDIL** = **CRED**it **I**ndex **L**ink. A network-wide trust/payment score (300–900) for
> Buyers, Suppliers and Agencies across the Anjaninex network, computed centrally from all firms'
> transaction data, and delivered as a **paid, consent-verified, admin-approved report**.

---

## 1. Vision & Why it's a moat
- Anjaninex ke paas ek unique asset hai: **multiple firms** ek hi party (same GST) ke saath transactions record karti hain.
- Kisi akeli firm ko sirf apni deal dikhti hai; **Anjaninex ko poore network ka behaviour dikhta hai**.
- Is data ko ek **CREDIL Score (300–900) + report** me convert karna = "trade CIBIL" — strong network-effect moat + naya **revenue stream** (pay-per-report).

## 2. Naming & Branding
- Product brand: **CREDIL**
- Tagline / framing: **"Payment & Trust Index"** (NOT "credit report").
  - Reason: "credit bureau" India me RBI/CICRA-regulated hai. "Trust/Payment/Reputation Index" framing + **consent-based** design isko legally safe rakhta hai.
- Score band: **300–900** (jaise CIBIL — familiar).
- ⚠️ Launch se pehle: **trademark search** (CREDIL vs CIBIL similarity) + **legal review**.

## 3. Entity Types (kiska score)
| Entity | Score kis pe based | Data source |
|---|---|---|
| **Buyer** | Payment behaviour | orders, bills, receipts, cheque bounces, GR returns |
| **Agency** | Payment + commission + dispute + **buyer portfolio quality** | commission bills, payments, disputes, **us agency ke buyers ka CREDIL** |
| **Supplier** | Fulfillment behaviour (payment nahi) | orders, bills, delivery, quality, GR returns |

## 4. Identity & Groups
- **Primary key = GST number** (cross-firm unique). Same GST across firms = same party.
- **PAN** se auto-group suggest: alag GST par same PAN/owner = sister firms (ek group).
- **Company Group**: ek owner ki multiple firms ko ek group me link kiya ja sake.
  - Auto-suggest (same PAN/owner/phone) **+ manual confirm**.
  - Group ka **combined score** (member firms ka weighted aggregate) bhi milta hai.
- Request ke waqt requester **multiple firms tick** karke group ki ek saath report maang sake.

## 5. Score Model (300–900)

### 5a. Buyer / Agency (payment-focused)
| Sub-score | Signal | Direction |
|---|---|---|
| **Pay Score** | payment timeliness, avg days-to-pay, overdue outstanding | on-time = + |
| **Default Score** | cheque bounce, payment default | bounce/default = − |
| **Trade Score** | GR returns, disputes, cancellations ratio | high returns = − |
| **Volume / Tenure** | business size, kitne saal, kitni firms ke saath | zyada/purana = + |

### 5b. Supplier (fulfillment-focused)
| Sub-score | Signal | Direction |
|---|---|---|
| **Delivery Score** | maal time pe (promised date vs actual dispatch) | on-time = + |
| **Quality Score** | GR-return reason (quality/wrong/short) + optional buyer rating | complaints = − |
| **Order-Integrity / Rate** | jo order tha wahi maal, **bina rate confirm kiye maal thokna = rate-dispute** | mismatch/rate-issue = − |
| **Returns / GR** | wapas aaya maal ratio | high = − |
| **Volume / Tenure** | regular business, saal, firms | zyada/purana = + |

- Har sub-score ko **0–100** normalise karo, phir **weighted total → 300–900** map.
- **Weights configurable** (Anjaninex admin panel se tune ho sakein).
- **"Insufficient data"** threshold: jab tak kaafi firms/transactions ka data na ho, actual score na dikhao — "Not enough data" state (galat score se bharosa toot jaata hai).

### 5c. Agency — extra factor: **Buyer Portfolio Score** (network/graph signal)
- Agency buyer ke payment ki guarantee/brokering karti hai → **agency ka risk = uske buyers ka risk**.
- Us agency ke through jo buyers deal karte hain, unke **CREDIL ka weighted average** = Buyer Portfolio Score.
  - Achhe buyers (high score, time pe pay) → agency score **+** (up).
  - Defaulter / low-score / bahut GR-return wale buyers → agency score **−** (down).
- Weight by business volume (bade buyer ka zyada asar). Naye/insufficient-data buyers ko neutral maano.
- Isse ek **graph score** banta hai (agency <-> buyers) — jaise PageRank; achhe partners aapki saakh badhate hain.

### 5d. Agency RED FLAG — Commission-bill dormancy (hidden buyer-default detector)
- **Trade mechanic:** commission **supplier** deta hai agency ko; agency supplier ko **commission bill** deti hai.
- Agar agency ka **buyer default** kar jaye, to agency commission bill **nahi banati** — kyunki bill diya to supplier us commission ko agency ki (del-credere) liability me se **kaat lega**.
- **Rule:** agar kisi supplier-buyer relation (jahan pehle regular commission aati thi) me **12 mahine tak koi commission bill na bane**, to ye **hidden buyer-default ka strong signal** hai.
- **Report me RED FLAG + ALERT:** *"Is agency ka buyer default to nahi ho gaya? (12 mahine se commission bill nahi bani)"*
- **Score:** prolonged commission-dormancy = strong **negative** (Agency Pay/Trade dono pe asar).
- **Auto-alert:** jaise hi 12-mahine dormancy detect ho, us party ki report subscribe karne walon ko notification.

### 5e. RED FLAG — Long-pending bill (direct default signal)
- **Buyer + Supplier dono angle:** system me us party ka koi **bill 12 mahine se pending (unpaid)** hai → **RED FLAG** report me.
- **Cross-firm:** kisi bhi firm ka bill us GST pe **12+ mahine overdue** = red flag (network me chhupega nahi).
- 5d (indirect: commission-dormancy) ka **direct complement**.
- **Rule-based:** outstanding age >= 12 months (aur configurable threshold). Simple SQL — reliable + fast, **AI ki zaroorat nahi**.

## 6. Central Calculation Engine (Anjaninex panel)
- Poori calculation **Anjaninex side** (super-admin) me — firms ko raw formula/data expose nahi hota.
- **Score events**: har relevant transaction (payment on-time/late, cheque bounce, GR, delivery-late, rate-dispute) ek **score_event** row banaye (party_gst, firm_id, type, weight, date).
- **Nightly/near-real-time job** har party ka score recompute kare score_events se.
- Score + factor breakdown **cache** table me (fast lookup + report generation).

## 6b. AI usage — kaha AI, kaha simple rule
- **Threshold/number rules → SQL (no AI):** 12-mahine pending bill, commission-dormancy, on-time %, GR ratio, overdue days. Ye reliable + sasta SQL se; AI overkill + risky.
- **AI genuinely useful (existing Gemini/Claude keys se):**
  - **Report narrative** — score + factors ko ek human-readable summary + risk explanation me: *"Ye party 3 firms ke saath deal karti hai, generally ~45 din me pay karti hai, par pichle saal 2 cheque bounce hue."*
  - **Anomaly / fraud pattern** — network graph me coordinated default, shell-firm, circular-billing patterns detect.
  - **Free-text classify** — GR-return reason / notes ko signals me convert.
- **Principle:** *numbers rules se, kahani aur pattern AI se.*

## 7. Consent + OTP Flow (per report request)
1. Report **maangne wala user** target party ka **GST no.** daale + **components tick** kare (5a/5b me se).
2. System **automatically** us GST ke **registered mobile** (system me verified) pe **OTP** bheje. *(OTP channel: WhatsApp via wabanow — sasta + reliable; fallback SMS.)*
3. Requester **wahi OTP** (party se le kar) daale → **consent proof**.
4. Request **Anjaninex admin ke "Report Requests" queue** me jaye.
5. Anjaninex admin **verify** kare: OTP kis number pe gaya, wo us GST ka **sahi registered number** hai kya → **confirm hone ke baad hi Approve**.
6. Approve hote hi report **auto-generate** → requester ke panel me delivered.

- Party platform pe na ho → us party ka mobile jab pehli baar kisi firm ne add kiya tha wahi; ya ek **"verify mobile"** step (OTP-verify) taaki wo "registered" ban jaye.
- Group request: har member firm/GST ka apna OTP-consent (ya group owner ka verified number) — spec me lock: **owner-level OTP** simplest.

## 8. Pricing & Payment (à-la-carte)
- Requester tick kare kaunse sub-scores/sections chahiye → **price us hisaab se** (per-component) ya **"Full CREDIL Report" bundle rate**.
- Payment: **Razorpay** (already live) — OTP-consent verify hone ke **baad** pay (taaki bina consent paisa na kate), phir admin approve.
- Anjaninex admin panel se **rate card** (per component + full report) editable.

## 9. Admin Approval + Delivery
- **Anjaninex admin → "Report Requests"** queue (payment-approval jaisa hi pattern):
  - Columns: requesting firm, target GST/group, components, OTP-verified?, paid?, date.
  - **Approve / Reject** buttons + **bell notification + red-dot** (jaisa abhi banaya).
- **Approve → sab automatic**:
  - Report **PDF generate** (CREDIL score gauge + sub-scores + payment/behaviour summary + red flags + group summary).
  - **Requesting firm ke panel me "My Reports"** me aa jaye — **view + PDF download**.
  - Firm ko **bell notification** bhi.

## 10. Feature ON/OFF per firm (Anjaninex admin)
- Anjaninex admin → firm management me **CREDIL ON/OFF toggle** (jaise module enable/disable / addon services).
- ON firm ko hi **sidebar me "CREDIL" button** dikhe.
- Entitlement: `firm.credil_enabled` flag (admin-controlled).

## 11. UI Surfaces
**Firm side (agency now; supplier/buyer Phase 2):** sidebar **"CREDIL"** button →
- **Request Report** — GST daalo + components tick + OTP + pay.
- **My Reports** — approved reports (view + PDF download).
- **Groups** — apni/known sister-firms group banao (optional).

**Anjaninex admin side:**
- **Report Requests** — approval queue (verify OTP recipient → approve → auto-deliver).
- **CREDIL Settings** — score weights, rate card, per-firm ON/OFF, min-data threshold.
- **Disputes** — party apni report challenge kare to review.

## 12. Data Model (tables — sketch)
- `credil.party_identity` — gst (PK), pan, name, registered_mobile, mobile_verified, group_id
- `credil.groups` — id, owner_name, created_by
- `credil.group_members` — group_id, gst
- `credil.score_events` — id, party_gst, firm_id, event_type, sub_score, weight, amount, event_date
- `credil.scores` — party_gst (or group_id), entity_type, total_score, pay/default/trade/delivery/quality/... sub_scores, data_points, computed_at
- `credil.report_requests` — id, requesting_firm_id, target_gst/group_id, components(jsonb), otp_hash, otp_sent_to, otp_verified, amount, payment_ref, status(pending/otp_ok/paid/approved/rejected/delivered), pdf_url, requested_at, approved_by
- `firms.credil_enabled` (boolean, admin toggle)

## 13. New Data-Capture Points (needed for Supplier score)
- **Order**: `expected_delivery_date` field → on-time delivery compute.
- **GR / Return**: `reason` (quality / wrong-goods / short / rate-dispute).
- **Order close**: optional **star-rating** (buyer → supplier) for quality.
- Baaki (payments, returns, volume, tenure) already orders/bills/receipts/GR se derive hote hain.

## 14. Legal / Privacy Guardrails
- **Consent-based** (OTP per report) — sabse bada safeguard; party khud authorize karti hai.
- **"Trust/Payment Index"** framing (not "credit report") — regulatory risk kam.
- **Anonymised reporting**: report me "kis firm ne kya report kiya" **expose na karo** — sirf aggregate score + summary (reporter firm ki protection + retaliation se bacha).
- **Dispute/correction** system (party challenge kar sake).
- **T&C consent**: firms onboarding pe consent den ki unka anonymised transaction-signal network score me use hoga.
- **Min-data threshold** taaki galat/gaming score na dikhe.
- ⚠️ **Legal review + trademark check** before public launch.

## 15. Phasing
- **Phase 1 (abhi — sirf agency app hai):** Agency + Buyer score agency ke apne transaction data se (payments, commission, cheque, GR). CREDIL engine + request/consent/pay/approve/PDF flow + admin toggle. *(Note: "network-wide" tab tak strong hoga jab zyada firms data den — early me "insufficient data" common.)*
- **Phase 2 (4–5 mahine — supplier/buyer modules ban jaayen):** Supplier score (delivery/quality/rate) + naye capture points (expected date, GR reason, rating). Data volume badhne se network score meaningful.
- **Phase 3 (later):** Disputes portal, auto-group detection, alerts ("aapki party ka score gir gaya"), API for lenders.

## 16. Open Decisions (finalize before build)
- [ ] Exact **weights** per sub-score (start with sensible defaults, tune later).
- [ ] **Rate card** — per-component price vs full-report bundle price.
- [ ] OTP channel default: **WhatsApp (wabanow)** vs SMS.
- [ ] Group OTP: **owner-level single OTP** vs per-firm OTP.
- [ ] "Bina bole maal / rate-issue" — confirmed as **negative** (rate-dispute) in supplier score.
- [ ] Min-data threshold number (e.g., >= N firms or >= M transactions).

---
*Draft v1 — Vyapaar Setu / Anjaninex. CREDIL (Payment & Trust Index). Legal review pending before public launch.*
