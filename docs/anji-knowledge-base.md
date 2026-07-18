# Vyapaar Setu — Anji Knowledge Base (User Help Guide)

Vyapaar Setu ek textile agency (aadhat/broker) ERP hai — Anjaninex ka product. Website: vyaparsetu.anjaninex.com. Agency supplier (mill/manufacturer) aur buyer ke beech kaam karti hai — order book karti hai, supplier ke bill ki entry karti hai, payment collect karke hisaab rakhti hai, commission kamati hai.

---

## LOGIN & MULTI-FIRM

- Login: username, email ya mobile number + password se.
- Ek owner ki kai firms ho to: login me MOBILE NUMBER dalo — "Kaunsi firm kholein?" popup aayega.
- Firm badalna: upar top bar me 🏬 firm switcher — click karke doosri firm chuno. (Ye tabhi dikhta hai jab aapke logins me same phone/email ho.)
- Password bhool gaye: firm admin Team page se reset kar sakta hai.
- Page purana/kharab dikhe: Ctrl+Shift+R dabao (hard refresh). Phone me: app band karke dobara kholo.

## ORDER KAISE BANAYE (Trading → Order Add)

1. Trading me jao → Order Add.
2. Supplier search karo (naam ya GST se) — list me sirf supplier-type parties aati hain. Nayi party ho to "+ New" dabao.
3. Buyer chuno — list me sirf buyer-type parties.
4. Items bharo: naam, qty, unit (PCS/MTR), rate, RD (per-unit discount), GST%.
5. Adjustments me: CD (Cash Discount) — Before GST ya After GST; Supplier Discount (Normal/Exhibition — Party Master se apne aap aata hai); Transporter; Payment Terms.
6. Save karo — Order No apne aap milta hai (jaise Surat Ho-035).
- "Scan Order" button: order ki photo ya PDF upload karo — AI padh kar sab bhar deta hai.
- Group par order: supplier search me purple GROUP option chuno — firm baad me bill par pakki hogi.

## BILL ENTRY KAISE KARE (Trading → Bill Entry)

1. Trading → Bill Entry (+ New Bill Entry).
2. Order No dropdown se order chuno — supplier, buyer, items sab auto-fill. (Dropdown me sirf chune hue supplier/buyer ke unbilled orders dikhte hain.)
3. Supplier Bill No aur Supplier Bill Date zaroor bharo (bill par chhapa number).
4. Amount Details:
   - CD (Cash Discount): % dalo, amount apne aap; Before GST = GST kam base par lagta hai.
   - Supplier Discount: Normal/Exhibition % Party Master se auto aate hain, badal sakte ho.
   - Fold Less: gross me se SABSE PEHLE katta hai, bacha balance par discount lagta hai.
   - Sweet/L.S, Interest, Insurance: total me judte hain. Bank Charge: minus hota hai. TCS: judta hai.
   - Case/Parcel: bill ke total case/parcel ka number.
5. GST hamesha discount ke BAAD wale amount par lagta hai (SGST/CGST ya IGST inter-state par).
6. Save Bill Entry — accounting voucher apne aap ban jata hai.
- "Scan Bill": bill ki photo/PDF (multi-page bhi) upload karo — AI items, GST, discount (Disc/Less/CD/Vatav), Fold sab padh leta hai. Mobile camera ki photo bhi chalti hai.
- Bill calculation example: Gross 10,000 → Fold 2% = 200 → balance 9,800 → CD 5% = 490 → discounts ke baad GST → + charges − bank charge → Net.

## GR (GOODS RETURN)

- Trading → GR → New GR. Bill no dalo (supplier bill no ya entry no) — bill auto-select.
- Return items aur amount bharo. Approve hone par bill ke pending me adjust ho jata hai.

## PAYMENT RECEIPT (Trading → Payment)

1. Trading → Payment → New Receipt.
2. Supplier aur Buyer chuno — unke beech ke UNPAID bills apne aap aa jate hain (supplier ka bill no dikhta hai).
3. Bill No box me supplier bill no type karo to bill turant mil jata hai.
4. Bills tick karo, amount/mode (cash/cheque/UPI/bank) bharo, save.
- Cheque diya ho to Cheque Register me dikhta hai.

## PARTY MASTER (Trading → Master → Parties)

- Party type: Supplier Only / Buyer Only / Both. Both wali party dono jagah dikhti hai.
- Har party me: GST, PAN, phone, WhatsApp, address, credit limit, credit days, commission %, aur 3 discounts (Normal/Exhibition/Special) — ye discounts Order/Bill me apne aap bhar jate hain.
- Ek party sirf EK group me reh sakti hai.

## GROUP MASTER — SISTER FIRMS (Trading → Master → Group Master)

- Pehle group ka naam banao (➕ Banao) — turant left list me aa jata hai.
- Group Master detail bharo: owner name, mobile, WhatsApp, address, city, pincode, state, commission %, payment terms, 3 discounts.
- Firms tick karke Save Group — group ki detail SAB sister firms me apne aap sync ho jati hai.
- Group Report: Reports → Groups — group ki saari firms, outstanding, bills (supplier bill no, items, paid, unpaid), City Wise tab bhi.

## REPORTS (sidebar → Reports)

- Sales Register: saare sales bills GST ke saath. Outstanding/Aging: kis party ka kitna baaki, kitne din se.
- Supplier vs Buyer: paid/unpaid/partly-paid. GST report. GR report. On Time/Late: kaun buyer time par deta hai.
- Order vs Bill: kaunsa order billed hua. Party Wise: supplier/buyer/city wise — party expand karke Print ya WhatsApp karo to SIRF usi party ki detail jati hai.
- Sab reports me supplier ka bill no dikhta hai (jaise 2885/GST), agency ka internal no fallback hai.
- Bill list / Order list me har row ke aage ▸ button — dabao to andar ke items aur amounts dikh jate hain.

## PARTY CHAT (sidebar → Party Chat)

- Apni party (buyer/supplier) se WhatsApp jaisi chat — party ko login NAHI chahiye.
- "🔗 Chat link bhejo" se party ko WhatsApp par link jata hai; wo mobile number + OTP se chat kholti hai.
- Photo, document, location, contact bhej sakte ho. Message delete: select karke Delete for everyone (apne message) ya Delete for me.
- Naya message aate hi sidebar me hara badge — kholte hi hat jata hai.

## COMPLAINT BOX (sidebar → Complaint Box)

- Koi problem ya sujhav ho to yahan se seedha Anjaninex team ko bhejo. Photo bhi laga sakte ho.
- Reply isi me aata hai — Team Vyapaar Setu ke naam se. Blue tick = padh liya.

## HR (sidebar → HR)

- Staff banao, login se link karo (Staff form me "Login User" dropdown).
- Staff mobile se check-in/check-out karta hai (selfie ke saath). In/Out Report me pura mahina, PDF/Excel download.
- Live Map: field staff ki live location dikhti hai (staff ke phone me location "Allow all the time" honi chahiye).

## PLANS & WALLET

- Plans page: apna plan, usage (users, branches, AI scans kitne bache), Monthly/Yearly price.
- Plan kharido: wallet me paise hon to wahi se, warna payment gateway (UPI/card) se — payment hote hi plan lag jata hai. Receipt PDF download hota hai (GST no dal sakte ho).
- AI scan limit mahine ki hoti hai — Scan button par likha aata hai kitne bache.

## ONLINE DUKAN

- Apni online shop — customer ko link bhejo, wo bina login catalog dekh kar order karta hai. Orders, billing, reviews sab andar milte hain.

## IMPORT & MIGRATION

- Purane software/Excel se parties, items, bills lana ho to Import & Migration section — ya Complaint Box me bolo, team madad karti hai.

## COMMON PROBLEMS (Troubleshooting)

- "Purana data dikh raha hai / button kaam nahi kar raha": Ctrl+Shift+R (hard refresh). Phone: app band karke dobara kholo, ya browser me site data clear karo.
- "Scan me photo too large": ab photo apne aap chhoti hoti hai — fir bhi aaye to dobara photo lo.
- "Party search me nahi mil rahi": dekho party ka type sahi hai — Supplier field me sirf Supplier/Both dikhti hain, Buyer field me sirf Buyer/Both.
- "Order dropdown khali hai": jo supplier/buyer chuna hai uska koi unbilled order nahi — pehle order banao.
- "OTP nahi aaya (Party Chat)": number Party Master me saved wahi hona chahiye; test mode me OTP screen par bhi dikhta hai.
- Login nahi ho raha: password galat ya account inactive — firm admin se Team page par check karwao.
- Bill ka total galat lage: Edit karke dobara Save karo — naya calculation lag jata hai.

## KEYBOARD TIPS

- Search dropdowns me ↑↓ arrow se upar-niche, Enter se select.
- Chat me Enter = send, Shift+Enter = nayi line.

## SUPPORT

- App me: Complaint Box (sabse tez).
- Email: support@anjaninex.com
