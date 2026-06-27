/**
 * Assistant — per-page help content in 3 languages (Hinglish / English / Gujarati).
 * No AI: hand-written, detailed guide + troubleshooting FAQ per page. Mic/typed input is
 * keyword-matched against the page's steps + FAQs to speak the best answer.
 *
 * Add a new page = add an entry. URL is matched by longest prefix (after normalizing
 * /:id/edit -> /new and trailing /:id -> base).
 *
 * Likhne ka tareeka (har page): intro = page kis kaam ka. steps = shuru se ant tak
 * pura kaam kaise. faqs = aam dikkatein + "kaha hai / kaise karu / kaam nahi kar raha".
 */

export type Lang = 'hinglish' | 'english' | 'gujarati';

export interface HelpPage {
  title: string;
  intro: string;
  steps: string[];
  faqs: { q: string; a: string }[];
}
export interface HelpEntry {
  match: string;
  hinglish: HelpPage;
  english: HelpPage;
  gujarati: HelpPage;
}

export const LANG_LABEL: Record<Lang, string> = {
  hinglish: 'Hinglish',
  english: 'English',
  gujarati: 'ગુજરાતી',
};
export const LANG_BCP: Record<Lang, string> = {
  hinglish: 'hi-IN',
  english: 'en-IN',
  gujarati: 'gu-IN',
};

export const HELP_PAGES: HelpEntry[] = [
  // ---------------- DASHBOARD ----------------
  {
    match: '/',
    hinglish: {
      title: 'Dashboard (Home)',
      intro: 'Ye aapka home page hai — yahan ek nazar me aaj ka pura business dikhta hai: total sales, commission, paisa jo aaya, GR returns, aur sales/order ka graph. Upar tabs (Sales, Payments, Operations, Parties) se alag-alag view milte hain, aur "This Week / This Month / Quarter / Full Year" se time period badal sakte ho.',
      steps: [
        'Upar 4 KPI cards dekho — Total Sales, Commission, Received (jo paisa aaya), aur GR Returns. Har card par % change bhi dikhta hai.',
        'Cards ke upar wale tabs (Sales / Payments / Operations / Parties) dabao — alag-alag numbers dikhenge.',
        'Time chuno: This Week, This Month, Quarter ya Full Year — saare numbers usi period ke ho jayenge.',
        'Dayi taraf "All Branches" dropdown se ek branch ka data alag dekh sakte ho.',
        '"Monthly Sales Trend" graph me Sale / Comm / GR toggle se line badal sakte ho.',
        'Peeli Insight patti me zaroori alert dikhta hai (jaise overdue payment) — "View detailed analysis" par click karke detail dekho.',
        'Kisi bhi kaam ke liye left sidebar se module kholo (Trading, Accounting, Reports, Bazaar Link, HR...).',
      ],
      faqs: [
        { q: 'sales kaha dikhe', a: 'Sabse pehle KPI card "Total Sales" me aaj/period ka total dikhta hai, aur neeche "Monthly Sales Trend" graph me poora trend.' },
        { q: 'numbers galat ya purane lag rahe', a: 'Upar time filter (This Week/Month/Quarter/Full Year) aur branch dropdown check karo — ho sakta hai galat period ya branch chuna ho. Sahi chuno, number update ho jayega.' },
        { q: 'branch ka alag data kaise dekhu', a: 'Upar dayi taraf "All Branches" dropdown se apni branch chuno — sirf usi branch ke numbers dikhenge.' },
        { q: 'naya bill kaise banau', a: 'Left sidebar me Trading → Bills → "New Bill Entry" button dabao.' },
        { q: 'outstanding ya pending kya hai', a: 'Outstanding = jo paisa party se aana baaki hai. Detail ke liye Reports → Outstanding kholo. Card par "pending" likha amount wahi baaki paisa hai.' },
        { q: 'insight/alert par click karu to kya hoga', a: 'Wo aapko us cheez ki detail report par le jayega (jaise overdue bill ki list), taaki turant action le sako.' },
        { q: 'graph samajh nahi aa raha', a: 'Graph mahine-dar-mahine sales dikhata hai. Upar Sale/Comm/GR toggle se line badlo — har line alag cheez (sales, commission, return) batati hai.' },
      ],
    },
    english: {
      title: 'Dashboard (Home)',
      intro: 'Your home page — see the whole business at a glance: total sales, commission, money received, GR returns, and a sales/order graph. Tabs on top (Sales, Payments, Operations, Parties) switch the view, and This Week / Month / Quarter / Full Year change the time period.',
      steps: [
        'Read the 4 KPI cards on top — Total Sales, Commission, Received, and GR Returns, each with a % change.',
        'Use the tabs above the cards (Sales / Payments / Operations / Parties) to switch the numbers shown.',
        'Pick a period: This Week, This Month, Quarter or Full Year — all numbers update to that period.',
        'Use the "All Branches" dropdown on the right to see one branch only.',
        'In the "Monthly Sales Trend" graph, toggle Sale / Comm / GR to change the line.',
        'The yellow Insight strip shows important alerts (e.g. overdue payment) — click "View detailed analysis".',
        'Open any module from the left sidebar (Trading, Accounting, Reports, Bazaar Link, HR...).',
      ],
      faqs: [
        { q: 'where do i see sales', a: 'Total sales is in the "Total Sales" KPI card, with the full trend in the "Monthly Sales Trend" graph below.' },
        { q: 'numbers look wrong or old', a: 'Check the time filter (Week/Month/Quarter/Year) and branch dropdown on top — you may have the wrong period/branch selected.' },
        { q: 'how to see one branch', a: 'Use the "All Branches" dropdown on the top right and pick your branch.' },
        { q: 'how to make a new bill', a: 'Sidebar → Trading → Bills → "New Bill Entry".' },
        { q: 'what is outstanding/pending', a: 'Outstanding is money still due from a party. See Reports → Outstanding for details.' },
        { q: 'what does the insight link do', a: 'It takes you to the detailed report for that item (e.g. the overdue bills list) so you can act on it.' },
      ],
    },
    gujarati: {
      title: 'ડેશબોર્ડ (હોમ)',
      intro: 'આ તમારું હોમ પેજ છે — એક નજરમાં આખો બિઝનેસ દેખાય: કુલ વેચાણ, કમિશન, આવેલા પૈસા, GR રિટર્ન અને વેચાણ/ઓર્ડર ગ્રાફ. ઉપરના ટેબ અને This Week/Month/Quarter/Year થી સમય બદલાય.',
      steps: [
        'ઉપરના 4 KPI કાર્ડ જુઓ — Total Sales, Commission, Received, GR Returns (દરેક પર % ફેરફાર).',
        'કાર્ડ ઉપરના ટેબ (Sales/Payments/Operations/Parties) દબાવી વ્યૂ બદલો.',
        'સમય પસંદ કરો: This Week, This Month, Quarter કે Full Year — બધા આંકડા તે મુજબ બદલાશે.',
        'જમણે "All Branches" ડ્રોપડાઉનથી એક જ બ્રાન્ચનો ડેટા જુઓ.',
        '"Monthly Sales Trend" ગ્રાફમાં Sale/Comm/GR ટોગલથી લાઇન બદલો.',
        'પીળી Insight પટ્ટીમાં અગત્યનું એલર્ટ આવે — "View detailed analysis" દબાવો.',
        'ડાબી સાઇડબારથી કોઈપણ મોડ્યુલ ખોલો.',
      ],
      faqs: [
        { q: 'વેચાણ ક્યાં દેખાય', a: 'Total Sales કાર્ડમાં અને નીચે "Monthly Sales Trend" ગ્રાફમાં દેખાય છે.' },
        { q: 'આંકડા ખોટા/જૂના લાગે', a: 'ઉપરનું ટાઇમ ફિલ્ટર અને બ્રાન્ચ ડ્રોપડાઉન તપાસો — કદાચ ખોટો સમય/બ્રાન્ચ પસંદ છે.' },
        { q: 'નવું બિલ કેવી રીતે બનાવું', a: 'સાઇડબારમાં Trading → Bills → "New Bill Entry" દબાવો.' },
        { q: 'બાકી રકમ શું છે', a: 'પાર્ટી પાસેથી હજુ આવવાના પૈસા. વિગત માટે Reports → Outstanding જુઓ.' },
      ],
    },
  },

  // ---------------- BILL ENTRY ----------------
  {
    match: '/trading/bills/new',
    hinglish: {
      title: 'Bill Entry (Naya Bill)',
      intro: 'Yahan supplier ka purchase bill enter karte hain. Do tareeke hain — ya to "Scan Bill" se bill ki photo/PDF daal kar OCR khud sab fields bhar deta hai, ya manually ek-ek field khud bhar lo. Bharne ke baad neeche Submit dabane se bill save ho jata hai.',
      steps: [
        'Sabse upar "Scan Bill" dabao, bill ka photo ya PDF chuno — OCR khud Supplier, items, rate, GST, total sab bhar dega. Phir ek baar check kar lo.',
        'Supplier box me naam ya GST se search karo aur supplier chuno. Naya supplier ho to "+ New" se add karo.',
        'Supplier Bill No. aur Bill Date bharo (ye zaroori * fields hain — bill par jo number/date chhapi hai wahi).',
        'Item rows me item ka naam, qty (jitna maal), rate aur GST% bharo — har row ka amount aur poora total apne aap ban jayega.',
        'Zaroorat ho to Transport / e-Way details bharo (agar e-Way No diya hai par date khali, to bill ki date hi le li jayegi).',
        'Sabse neeche total, GST aur grand total check karo — sahi ho to "Submit" dabao. Bill save ho jayega aur list me aa jayega.',
      ],
      faqs: [
        { q: 'bill scan kaise kare', a: 'Upar "Scan Bill" dabao, bill ki photo ya PDF upload karo — OCR sab fields bhar dega. Phir achhe se check karke Submit karo.' },
        { q: 'scan ne galat ya aadhi value bhari', a: 'Koi baat nahi — jo field galat hai usme click karke khud sahi kar lo, baaki sab waise hi rehne do. Phir Submit. Photo saaf aur seedhi ho to scan zyada sahi aata hai.' },
        { q: 'scan ne items nahi uthaye', a: 'Bill ki photo dhundhli ya tedhi ho sakti hai. Behtar photo se dobara scan karo, ya item rows manually bhar lo (naam, qty, rate, GST%).' },
        { q: 'supplier nahi mil raha', a: 'Supplier box me naam ke kuch akshar ya GST number type karo. Phir bhi na mile to naya hai — "+ New" se turant add karo.' },
        { q: 'gst kaise lagta hai', a: 'Aapki firm aur supplier same state ke hain to CGST+SGST, alag state ke hain to IGST — system khud sahi laga deta hai.' },
        { q: 'entry date aur bill date me fark', a: 'Entry Date = aaj ki date (jab aap entry kar rahe ho), apne aap aati hai. Supplier Bill Date = bill par chhapi hui date — wo aapko bharni hai.' },
        { q: 'total galat aa raha', a: 'Har row ka qty × rate aur GST% check karo. Discount field ho to wo bhi dekho. Ek row galat hone se grand total badal jata hai.' },
        { q: 'bill submit nahi ho raha', a: 'Supplier, Supplier Bill No, Bill Date aur kam se kam 1 item zaroori hai. Laal (*) wale khaali field bharo, phir Submit.' },
      ],
    },
    english: {
      title: 'Bill Entry (New Bill)',
      intro: 'Enter a supplier purchase bill here. Two ways — use "Scan Bill" to upload a photo/PDF so OCR fills all fields, or fill each field manually. Click Submit at the bottom to save.',
      steps: [
        'Click "Scan Bill" on top and choose the bill photo/PDF — OCR fills Supplier, items, rate, GST and total. Then review it.',
        'Search the Supplier box by name or GST and pick the supplier. If new, add via "+ New".',
        'Fill Supplier Bill No. and Bill Date (required *) — exactly as printed on the bill.',
        'In item rows enter name, qty, rate and GST% — each row amount and the grand total compute automatically.',
        'Fill Transport / e-Way details if needed (if e-Way No has no date, the bill date is used).',
        'Check the total, GST and grand total at the bottom, then click "Submit". The bill is saved and appears in the list.',
      ],
      faqs: [
        { q: 'how to scan a bill', a: 'Click "Scan Bill", upload the photo or PDF — OCR fills all fields. Review carefully, then Submit.' },
        { q: 'scan filled wrong values', a: 'Just click the wrong field and correct it; leave the rest. A clear, straight photo scans better.' },
        { q: 'scan missed the items', a: 'The photo may be blurry/tilted. Re-scan with a clearer photo, or fill the item rows manually.' },
        { q: 'supplier not found', a: 'Type a few letters of the name or the GST. If still not found, add it with "+ New".' },
        { q: 'how is gst applied', a: 'Same state as your firm = CGST+SGST, different state = IGST — applied automatically.' },
        { q: 'entry date vs bill date', a: 'Entry Date = today (auto). Supplier Bill Date = the date printed on the bill (you fill it).' },
        { q: 'total is wrong', a: 'Check qty × rate and GST% in each row, plus any discount. One wrong row changes the grand total.' },
        { q: 'cannot submit', a: 'Supplier, Supplier Bill No, Bill Date and at least 1 item are required. Fill the (*) fields and Submit.' },
        { q: 'Does scan store or remember my data? Is it safe?', a: 'The scan only reads the bill and extracts data — nothing else. It does not store your data; Anjaninex has full security. Your data is completely safe.' },
      ],
    },
    gujarati: {
      title: 'બિલ એન્ટ્રી (નવું બિલ)',
      intro: 'અહીં સપ્લાયરનું ખરીદ બિલ દાખલ કરો. બે રીત — "Scan Bill" થી ફોટો/PDF મૂકો ને OCR બધું ભરી દે, અથવા જાતે ભરો. નીચે Submit દબાવો.',
      steps: [
        'ઉપર "Scan Bill" દબાવી બિલનો ફોટો/PDF પસંદ કરો — OCR બધા ફિલ્ડ ભરી દેશે. પછી તપાસો.',
        'Supplier બોક્સમાં નામ/GST થી શોધી પસંદ કરો. નવો હોય તો "+ New".',
        'Supplier Bill No. અને Bill Date ભરો (જરૂરી *) — બિલ પર છપાયા મુજબ.',
        'આઇટમ રોમાં નામ, જથ્થો, ભાવ, GST% ભરો — ટોટલ આપમેળે થશે.',
        'જરૂર હોય તો Transport/e-Way ભરો (e-Way No હોય પણ તારીખ ન હોય તો બિલની તારીખ વપરાશે).',
        'નીચે ટોટલ/GST તપાસી "Submit" દબાવો — બિલ સેવ થઈ જશે.',
      ],
      faqs: [
        { q: 'બિલ સ્કેન કેવી રીતે', a: 'ઉપર "Scan Bill" દબાવી ફોટો/PDF અપલોડ કરો — OCR ભરી દેશે. તપાસીને Submit.' },
        { q: 'સ્કેન ખોટું ભર્યું', a: 'જે ફિલ્ડ ખોટું હોય ત્યાં ક્લિક કરી સુધારો, બાકી રહેવા દો. સાફ ફોટો સારો સ્કેન આપે.' },
        { q: 'સપ્લાયર મળતો નથી', a: 'નામ/GST ટાઇપ કરો; ન મળે તો "+ New" થી ઉમેરો.' },
        { q: 'GST કેવી રીતે લાગે', a: 'એક જ રાજ્ય હોય તો CGST+SGST, બીજા રાજ્યનું હોય તો IGST આપમેળે.' },
        { q: 'સબમિટ થતું નથી', a: 'સપ્લાયર, Supplier Bill No, Bill Date અને ઓછામાં ઓછું 1 આઇટમ જરૂરી છે.' },
        { q: 'સ્કેન મારો ડેટા સ્ટોર કરે? સુરક્ષિત?', a: 'સ્કેન ફક્ત બિલ વાંચીને ડેટા કાઢે — સ્ટોર નહીં. Anjaninex પૂરી સિક્યુરિટી રાખે છે. ડેટા સુરક્ષિત છે.' },
      ],
    },
  },

  // ---------------- BILLS LIST ----------------
  {
    match: '/trading/bills',
    hinglish: {
      title: 'Bills List',
      intro: 'Yahan aapke saare purchase bills ek table me dikhte hain — date, supplier, supplier bill no, amount aur GST ke saath. Yahin se search, filter, print, edit aur naya bill bana sakte ho.',
      steps: [
        'Upar date range aur party (supplier) filter laga kar bill dhundo.',
        'Search box me supplier ka naam ya bill number type karke turant dhundo.',
        'Kisi bill ki row par click karo — uski poori detail khulegi, wahin se print bhi kar sakte ho.',
        'Naya bill banane ke liye upar "New Bill Entry" button dabao.',
        'Neeche pagination (10 / 50 / 100) aur arrows se zyada bills dekho.',
      ],
      faqs: [
        { q: 'bill kaise dhundu', a: 'Upar date aur party filter lagao, ya search box me supplier naam/bill number type karo.' },
        { q: 'bill edit kaise kare', a: 'Bill ki row par click karo, detail khulegi, wahan Edit option se badlav karke save karo.' },
        { q: 'bill print kaise', a: 'Bill kholo aur Print button dabao — PDF/print ready ho jayega.' },
        { q: 'supplier bill no kaha dikhega', a: 'List me "SUPP. BILL NO" column me supplier ke bill ka number dikhta hai.' },
        { q: 'naya bill kaise', a: 'Upar "New Bill Entry" button se naya bill banao.' },
        { q: 'puraana bill nahi mil raha', a: 'Date range bada karo (jaise Full Year) — ho sakta hai wo bill chuni hui date ke bahar ho.' },
      ],
    },
    english: {
      title: 'Bills List',
      intro: 'All purchase bills in one table — date, supplier, supplier bill no, amount and GST. Search, filter, print, edit and create new bills from here.',
      steps: [
        'Filter by date range and party (supplier) on top.',
        'Type a supplier name or bill number in the search box to find quickly.',
        'Click a bill row to open its full detail and print.',
        'Click "New Bill Entry" on top to add a new bill.',
        'Use pagination (10 / 50 / 100) and arrows below to see more.',
      ],
      faqs: [
        { q: 'how to find a bill', a: 'Use the date and party filters, or type a name/bill number in search.' },
        { q: 'how to edit a bill', a: 'Click the bill row, open detail, choose Edit, change and save.' },
        { q: 'how to print a bill', a: 'Open the bill and click Print.' },
        { q: 'cannot find an old bill', a: 'Widen the date range (e.g. Full Year) — it may be outside the selected dates.' },
      ],
    },
    gujarati: {
      title: 'બિલ્સ યાદી',
      intro: 'બધા ખરીદ બિલ એક ટેબલમાં — તારીખ, સપ્લાયર, બિલ નં, રકમ, GST. અહીંથી શોધો, ફિલ્ટર, પ્રિન્ટ, એડિટ અને નવું બિલ.',
      steps: [
        'ઉપર તારીખ રેન્જ અને પાર્ટી ફિલ્ટરથી બિલ શોધો.',
        'સર્ચ બોક્સમાં સપ્લાયર નામ/બિલ નંબર ટાઇપ કરો.',
        'બિલની રો પર ક્લિક કરી વિગત/પ્રિન્ટ જુઓ.',
        'નવું બિલ બનાવવા "New Bill Entry" દબાવો.',
        'નીચે પેજિનેશન (10/50/100) થી વધુ જુઓ.',
      ],
      faqs: [
        { q: 'બિલ કેવી રીતે શોધું', a: 'ઉપર તારીખ/પાર્ટી ફિલ્ટર કે સર્ચ બોક્સ વાપરો.' },
        { q: 'બિલ એડિટ', a: 'બિલ ખોલી Edit પસંદ કરી બદલી સેવ કરો.' },
        { q: 'જૂનું બિલ મળતું નથી', a: 'તારીખ રેન્જ મોટી કરો (Full Year).' },
      ],
    },
  },

  // ---------------- ORDER ENTRY ----------------
  {
    match: '/trading/orders/new',
    hinglish: {
      title: 'Order Entry (Naya Order)',
      intro: 'Supplier ko bheja jaane wala order / purchase order (PO) yahan banate hain. "Scan Order" se PO ki photo/PDF daal kar fields auto-fill bhi ho jaate hain. Order No save par apne aap ban jata hai.',
      steps: [
        'Company aur Order Date select karo (date apne aap aaj ki aati hai, badal sakte ho).',
        'Supplier search karke chuno — naya ho to "+ New" se add karo.',
        'Item rows bharo — item naam, qty, rate aur GST%.',
        'Payment terms aur transporter detail bharo.',
        'Sab sahi ho to "Submit Order" dabao — order save ho jayega aur Order No mil jayega.',
      ],
      faqs: [
        { q: 'order number kaha hai', a: 'Order No save karte hi apne aap ban jata hai — pehle se bharne ki zaroorat nahi.' },
        { q: 'order scan kaise', a: 'Upar "Scan Order" dabao, PO ki photo/PDF daalo — OCR fields bhar dega. Phir check karke Submit.' },
        { q: 'order save nahi ho raha', a: 'Supplier aur kam se kam 1 item zaroori hai. Saare * (laal) field bharo, phir Submit Order.' },
        { q: 'bill aur order me fark', a: 'Order = aapne supplier ko maal mangwane ka request bheja. Bill = maal aane par uska purchase invoice. Order ko baad me bill se link kar sakte ho.' },
        { q: 'rate ya gst galat', a: 'Item row me click karke rate/GST% theek karo — total apne aap update ho jayega.' },
        { q: 'scan mera data safe rakhta hai?', a: 'Scan sirf order padh kar data nikaalta hai — store nahi karta. Anjaninex ne poori security laga rakhi hai, data safe hai.' },
      ],
    },
    english: {
      title: 'Order Entry (New Order)',
      intro: 'Create a purchase order (PO) to a supplier here. "Scan Order" can auto-fill from a photo/PDF. The Order No is generated automatically on save.',
      steps: [
        'Select Company and Order Date (defaults to today, editable).',
        'Search and choose the supplier (+ New if new).',
        'Fill item rows — name, qty, rate, GST%.',
        'Fill payment terms and transporter.',
        'Click "Submit Order" — it saves and gets an Order No.',
      ],
      faqs: [
        { q: 'where is the order number', a: 'It is generated automatically on save — no need to type it.' },
        { q: 'how to scan an order', a: 'Use "Scan Order" on top, upload the PO photo/PDF; OCR fills the fields. Review and Submit.' },
        { q: 'cannot save the order', a: 'Supplier and at least 1 item are required. Fill the (*) fields and Submit Order.' },
        { q: 'order vs bill', a: 'Order = your request to the supplier. Bill = the purchase invoice when goods arrive. You can link an order to a bill later.' },
        { q: 'Does scan keep my data safe?', a: 'The scan only reads the order to extract data — it does not store it. Anjaninex has full security; your data is safe.' },
      ],
    },
    gujarati: {
      title: 'ઓર્ડર એન્ટ્રી (નવો ઓર્ડર)',
      intro: 'સપ્લાયરને મોકલવાનો ઓર્ડર/PO અહીં બનાવો. "Scan Order" થી ઓટો-ફિલ થાય. Order No સેવ કરતી વખતે આપમેળે બને.',
      steps: [
        'કંપની અને ઓર્ડર તારીખ પસંદ કરો (આપમેળે આજની).',
        'સપ્લાયર શોધી પસંદ કરો (+ New નવા માટે).',
        'આઇટમ રો ભરો — નામ, જથ્થો, ભાવ, GST%.',
        'પેમેન્ટ ટર્મ્સ અને ટ્રાન્સપોર્ટર ભરો.',
        '"Submit Order" દબાવો — સેવ થઈ Order No મળશે.',
      ],
      faqs: [
        { q: 'ઓર્ડર નંબર ક્યાં', a: 'સેવ કરતી વખતે આપમેળે બને છે.' },
        { q: 'ઓર્ડર સ્કેન', a: '"Scan Order" થી PO ફોટો/PDF મૂકો; OCR ભરી દેશે.' },
        { q: 'સેવ થતું નથી', a: 'સપ્લાયર અને ઓછામાં ઓછું 1 આઇટમ જરૂરી.' },
        { q: 'સ્કેન ડેટા સુરક્ષિત?', a: 'સ્કેન ફક્ત ડેટા કાઢે, સ્ટોર નહીં. ડેટા સુરક્ષિત છે.' },
      ],
    },
  },

  // ---------------- ORDERS LIST ----------------
  {
    match: '/trading/orders',
    hinglish: {
      title: 'Orders List',
      intro: 'Saare orders ki list — status (pending/complete), supplier aur date ke saath. Yahin se naya order, search aur detail dekho.',
      steps: [
        'Date, party ya status (Pending/Complete) se filter karo.',
        'Order ki row par click karke detail dekho.',
        'Naya order banane ke liye "New Order" dabao.',
        'Pagination se zyada orders dekho.',
      ],
      faqs: [
        { q: 'pending order kaha', a: 'Status filter me "Pending" chuno, ya Reports → Pending Orders kholo.' },
        { q: 'order ko complete kaise mark karu', a: 'Order kholo aur uska status update karo, ya us order ke khilaaf bill bana do.' },
        { q: 'order nahi mil raha', a: 'Date range bada karo aur status filter "All" rakho.' },
      ],
    },
    english: {
      title: 'Orders List',
      intro: 'List of all orders with status, supplier and date. Create new orders, search and view details here.',
      steps: [
        'Filter by date, party or status (Pending/Complete).',
        'Click an order row to view details.',
        'Click "New Order" to add one.',
        'Use pagination to see more.',
      ],
      faqs: [
        { q: 'where are pending orders', a: 'Choose "Pending" in the status filter, or see Reports → Pending Orders.' },
        { q: 'how to mark an order complete', a: 'Open the order and update its status, or create a bill against it.' },
        { q: 'order not found', a: 'Widen the date range and set status filter to "All".' },
      ],
    },
    gujarati: {
      title: 'ઓર્ડર્સ યાદી',
      intro: 'બધા ઓર્ડરની યાદી — સ્ટેટસ, સપ્લાયર, તારીખ સાથે. નવો ઓર્ડર, શોધ અને વિગત અહીંથી.',
      steps: [
        'તારીખ/પાર્ટી/સ્ટેટસથી ફિલ્ટર કરો.',
        'ઓર્ડર પર ક્લિક કરી વિગત જુઓ.',
        'નવો ઓર્ડર: "New Order".',
      ],
      faqs: [
        { q: 'પેન્ડિંગ ઓર્ડર ક્યાં', a: 'સ્ટેટસ ફિલ્ટરમાં "Pending" પસંદ કરો.' },
        { q: 'ઓર્ડર મળતો નથી', a: 'તારીખ રેન્જ મોટી કરો, સ્ટેટસ "All" રાખો.' },
      ],
    },
  },

  // ---------------- PAYMENT / RECEIPT ----------------
  {
    match: '/trading/payments/new',
    hinglish: {
      title: 'Payment / Receipt Entry',
      intro: 'Party ko diya gaya paisa (Payment) ya party se mila paisa (Receipt) yahan enter karte hain. Isse us party ka outstanding (baaki hisaab) apne aap update ho jata hai.',
      steps: [
        'Type chuno: Payment (aapne diya) ya Receipt (aapko mila).',
        'Party search karke chuno.',
        'Amount bharo aur mode chuno — Cash / Bank / UPI / Cheque.',
        'Reference (cheque no, UPI ref) ho to bharo.',
        '"Save" dabao — entry save ho jayegi aur party ka hisaab update ho jayega.',
      ],
      faqs: [
        { q: 'payment aur receipt me fark', a: 'Payment = aapne party ko paisa diya. Receipt = party se aapko paisa mila.' },
        { q: 'outstanding kam kaise ho', a: 'Us party ki Receipt entry karne se uska outstanding (baaki paisa) utna kam ho jata hai.' },
        { q: 'galat entry ho gayi', a: 'Payments list me jaa kar us entry ko kholo aur edit/delete karo.' },
        { q: 'receipt print kaise', a: 'Save ke baad ya Payments list me entry kholo aur Print dabao.' },
        { q: 'party nahi mil rahi', a: 'Naam ke kuch akshar type karo. Party master me ho to aa jayegi; na ho to pehle party add karo.' },
      ],
    },
    english: {
      title: 'Payment / Receipt Entry',
      intro: 'Record money paid to a party (Payment) or received from a party (Receipt). This updates that party\'s outstanding automatically.',
      steps: [
        'Choose type: Payment (you paid) or Receipt (you received).',
        'Search and select the party.',
        'Enter amount and choose mode — Cash / Bank / UPI / Cheque.',
        'Add a reference (cheque no, UPI ref) if any.',
        'Click "Save" — the entry is saved and the party balance updates.',
      ],
      faqs: [
        { q: 'payment vs receipt', a: 'Payment = you paid the party. Receipt = you received from the party.' },
        { q: 'how does outstanding reduce', a: 'A Receipt for that party reduces its outstanding by the amount.' },
        { q: 'wrong entry', a: 'Open it in the Payments list and edit/delete.' },
        { q: 'how to print a receipt', a: 'Open the entry and click Print.' },
      ],
    },
    gujarati: {
      title: 'પેમેન્ટ / રસીદ એન્ટ્રી',
      intro: 'પાર્ટીને આપેલ (Payment) કે પાર્ટી પાસેથી મળેલ (Receipt) પૈસા અહીં દાખલ કરો. પાર્ટીનું બાકી આપમેળે અપડેટ થાય.',
      steps: [
        'પ્રકાર પસંદ કરો: Payment (આપ્યા) કે Receipt (મળ્યા).',
        'પાર્ટી શોધી પસંદ કરો.',
        'રકમ અને મોડ (Cash/Bank/UPI/Cheque) ભરો.',
        'રેફરન્સ હોય તો ભરો.',
        '"Save" દબાવો.',
      ],
      faqs: [
        { q: 'payment અને receipt ફરક', a: 'Payment = તમે આપ્યા. Receipt = પાર્ટી પાસેથી મળ્યા.' },
        { q: 'બાકી કેવી રીતે ઘટે', a: 'તે પાર્ટીની Receipt એન્ટ્રીથી બાકી ઘટે.' },
        { q: 'રસીદ પ્રિન્ટ', a: 'એન્ટ્રી ખોલી Print દબાવો.' },
      ],
    },
  },
  {
    match: '/trading/payments',
    hinglish: {
      title: 'Payments List',
      intro: 'Saare payment aur receipt entries ki list — date, party, amount aur mode ke saath.',
      steps: ['Date/party se filter karo.', 'Entry par click karke detail/print dekho.', 'Naya: "New Payment/Receipt".'],
      faqs: [
        { q: 'receipt print', a: 'Entry par click karke Print option choose karo.' },
        { q: 'entry edit/delete', a: 'Entry kholo, wahin Edit ya Delete ka option milega.' },
      ],
    },
    english: {
      title: 'Payments List',
      intro: 'List of all payment/receipt entries with date, party, amount and mode.',
      steps: ['Filter by date/party.', 'Click an entry to view/print.', 'New: "New Payment/Receipt".'],
      faqs: [
        { q: 'print receipt', a: 'Click the entry and choose Print.' },
        { q: 'edit/delete entry', a: 'Open the entry to find Edit or Delete.' },
      ],
    },
    gujarati: {
      title: 'પેમેન્ટ યાદી',
      intro: 'બધી પેમેન્ટ/રસીદ એન્ટ્રીની યાદી — તારીખ, પાર્ટી, રકમ, મોડ.',
      steps: ['તારીખ/પાર્ટીથી ફિલ્ટર.', 'એન્ટ્રી પર ક્લિક કરી પ્રિન્ટ.'],
      faqs: [{ q: 'રસીદ પ્રિન્ટ', a: 'એન્ટ્રી પર ક્લિક કરી Print પસંદ કરો.' }],
    },
  },

  // ---------------- GOODS RETURN ----------------
  {
    match: '/trading/gr',
    hinglish: {
      title: 'Goods Return (GR)',
      intro: 'Kharida hua maal supplier ko wapas karna ho to GR banate hain. Ye hamesha original bill se link hota hai, taaki return ka hisaab sahi rahe.',
      steps: [
        'Pehle supplier select karo.',
        '"Select Original Bill" se us supplier ka jis bill ka return karna hai wo chuno.',
        'Jo items/qty wapas ja rahe hain unhe bharo.',
        '"Save" karo — return amount apne aap calculate ho jayega aur party ka hisaab update ho jayega.',
      ],
      faqs: [
        { q: 'gr kya hai', a: 'GR (Goods Return) = kharida hua maal supplier ko wapas karna. Isse us bill/party ka hisaab kam ho jata hai.' },
        { q: 'original bill select nahi ho raha', a: 'Pehle supplier select karo — uske baad usi supplier ke bills list me se original bill chun paoge.' },
        { q: 'return amount galat', a: 'Wapas hone wali qty aur rate check karo — wahi se return amount banta hai.' },
        { q: 'pura bill return karna hai', a: 'Saari item rows ki poori qty daal do — pura bill return ho jayega.' },
      ],
    },
    english: {
      title: 'Goods Return (GR)',
      intro: 'Create a GR to return purchased goods to a supplier. It always links to the original bill so the accounting stays correct.',
      steps: [
        'Select the supplier first.',
        'Use "Select Original Bill" to pick the bill being returned.',
        'Enter the items/qty being returned.',
        'Click "Save" — the return amount is calculated and the party balance updates.',
      ],
      faqs: [
        { q: 'what is gr', a: 'GR (Goods Return) = returning purchased goods to the supplier; it reduces that bill/party balance.' },
        { q: 'cannot select original bill', a: 'Select the supplier first, then choose from that supplier\'s bills.' },
        { q: 'return amount is wrong', a: 'Check the returned qty and rate — they drive the return amount.' },
        { q: 'return the whole bill', a: 'Enter full qty on all rows to return the entire bill.' },
      ],
    },
    gujarati: {
      title: 'ગુડ્સ રિટર્ન (GR)',
      intro: 'ખરીદેલ માલ સપ્લાયરને પાછો કરવો હોય તો GR બનાવો — હંમેશા ઓરિજિનલ બિલ સાથે લિંક થાય.',
      steps: [
        'પહેલા સપ્લાયર પસંદ કરો.',
        '"Select Original Bill" થી તે બિલ પસંદ કરો.',
        'પાછા આવતા આઇટમ/જથ્થો ભરો.',
        '"Save" કરો — રિટર્ન રકમ ગણાઈ જશે.',
      ],
      faqs: [
        { q: 'GR શું છે', a: 'ખરીદેલ માલ સપ્લાયરને પાછો કરવો.' },
        { q: 'ઓરિજિનલ બિલ પસંદ થતું નથી', a: 'પહેલા સપ્લાયર પસંદ કરો, પછી તેના બિલમાંથી પસંદ કરો.' },
      ],
    },
  },

  // ---------------- COMMISSION ----------------
  {
    match: '/trading/commission',
    hinglish: {
      title: 'Commission',
      intro: 'Broker/dalali ki commission invoices yahan banate aur dekhte hain. Commission invoice par GST apne aap lagta hai aur invoice number auto-generate hota hai.',
      steps: [
        '"Generate" dabao naya commission invoice banane ke liye.',
        'Party (jise commission dena/lena hai) aur commission rate chuno.',
        'Amount aur GST apne aap calculate ho jayega.',
        'Invoice "Save" karo aur "Print" se nikal lo.',
      ],
      faqs: [
        { q: 'commission kaise banaye', a: 'Commission → Generate, party aur rate daal kar invoice banao, phir Save/Print.' },
        { q: 'commission invoice number', a: 'Save par apne aap ban jata hai — manually bharne ki zaroorat nahi.' },
        { q: 'gst commission par', a: 'Commission amount par GST system khud laga deta hai.' },
        { q: 'bulk commission', a: 'Generate screen me ek saath kai parties ke liye commission banaane ka option milta hai.' },
      ],
    },
    english: {
      title: 'Commission',
      intro: 'Create and view broker commission invoices here. GST is applied automatically and the invoice number auto-generates.',
      steps: [
        'Click "Generate" to create a new commission invoice.',
        'Choose the party and commission rate.',
        'Amount and GST are calculated automatically.',
        'Save the invoice and Print it.',
      ],
      faqs: [
        { q: 'how to make commission', a: 'Commission → Generate, enter party and rate, then Save/Print.' },
        { q: 'commission invoice number', a: 'Generated automatically on save.' },
        { q: 'gst on commission', a: 'GST is applied on the commission amount automatically.' },
      ],
    },
    gujarati: {
      title: 'કમિશન',
      intro: 'દલાલી કમિશન ઇન્વોઇસ અહીં બનાવો/જુઓ. GST આપમેળે, નંબર ઓટો.',
      steps: [
        '"Generate" થી નવું કમિશન ઇન્વોઇસ.',
        'પાર્ટી અને રેટ પસંદ કરો.',
        'રકમ/GST આપમેળે ગણાશે.',
        'Save અને Print કરો.',
      ],
      faqs: [
        { q: 'કમિશન કેવી રીતે', a: 'Commission → Generate, પાર્ટી/રેટ નાખી બનાવો.' },
        { q: 'કમિશન પર GST', a: 'આપમેળે લાગે છે.' },
      ],
    },
  },

  // ---------------- PARTIES ----------------
  {
    match: '/trading/parties',
    hinglish: {
      title: 'Parties (Supplier / Buyer)',
      intro: 'Aapke supplier aur buyer ki master list. Yahan se nayi party add karo, purani edit karo. Same GST ya phone par duplicate party banne se system rokta hai.',
      steps: [
        '"+ New" se nayi party add karo.',
        'Naam, GST, phone, WhatsApp aur address bharo.',
        'Supplier / Buyer / Both me se type chuno.',
        'Save karo — party master me aa jayegi aur bill/order me search par milegi.',
      ],
      faqs: [
        { q: 'nayi party kaise add kare', a: '"+ New" dabao, naam/GST/phone/address bharo aur Save karo.' },
        { q: 'party duplicate aa rahi', a: 'Same GST ya phone par party pehle se hai — naya banane ke bajaye wahi existing party use karo.' },
        { q: 'GST nahi hai party ka', a: 'GST khaali chhod sakte ho (URP — unregistered party). Bill par GST nahi lagega.' },
        { q: 'party edit/delete', a: 'Party ki row par click karke edit karo. Delete tabhi hoga jab us party ke khilaaf koi bill/entry na ho.' },
        { q: 'supplier aur buyer dono hai', a: 'Type me "Both" chuno — wo party supplier aur buyer dono ki tarah dikhegi.' },
      ],
    },
    english: {
      title: 'Parties (Supplier / Buyer)',
      intro: 'Master list of your suppliers and buyers. Add new, edit existing. The system blocks duplicates on the same GST or phone.',
      steps: [
        'Click "+ New" to add a party.',
        'Fill name, GST, phone, WhatsApp and address.',
        'Choose type — Supplier / Buyer / Both.',
        'Save — it appears in the master and in bill/order search.',
      ],
      faqs: [
        { q: 'how to add a party', a: 'Click "+ New", fill name/GST/phone/address and Save.' },
        { q: 'duplicate party warning', a: 'A party with the same GST/phone exists — use the existing one instead.' },
        { q: 'party has no GST', a: 'Leave GST blank (URP — unregistered party); no GST will apply on bills.' },
        { q: 'edit/delete a party', a: 'Click the row to edit. Delete works only if no bill/entry uses that party.' },
      ],
    },
    gujarati: {
      title: 'પાર્ટીઓ (સપ્લાયર/બાયર)',
      intro: 'સપ્લાયર/બાયરની માસ્ટર યાદી. ઉમેરો/એડિટ કરો. એક જ GST/ફોન પર ડુપ્લિકેટ રોકાય.',
      steps: [
        '"+ New" થી પાર્ટી ઉમેરો.',
        'નામ, GST, ફોન, WhatsApp, સરનામું ભરો.',
        'પ્રકાર પસંદ કરો — Supplier/Buyer/Both.',
        'Save કરો.',
      ],
      faqs: [
        { q: 'નવી પાર્ટી', a: '"+ New" દબાવી નામ/GST/ફોન ભરી Save.' },
        { q: 'ડુપ્લિકેટ ચેતવણી', a: 'સમાન GST/ફોન પહેલેથી છે — હાજર પાર્ટી વાપરો.' },
        { q: 'GST નથી', a: 'GST ખાલી રાખો (URP) — બિલ પર GST નહીં લાગે.' },
      ],
    },
  },

  // ---------------- ITEMS ----------------
  {
    match: '/trading/items',
    hinglish: {
      title: 'Items (Product Master)',
      intro: 'Aapke product/item ki master list — naam, HSN code, default rate aur GST%. Bill/order me item yahin se aata hai.',
      steps: ['"+ New" se item add karo.', 'Naam, HSN, default rate aur GST% bharo.', 'Save karo — ab bill/order me ye item search par milega.'],
      faqs: [
        { q: 'item add kaise', a: '"+ New" se naam, HSN aur GST% daal kar item banao.' },
        { q: 'HSN kya hai', a: 'HSN = GST ke liye product ka code. Bill par GST sahi lagne ke liye HSN bharo.' },
        { q: 'item ka rate har baar alag', a: 'Default rate yahan set karo; bill banate waqt us bill ke liye rate badal bhi sakte ho.' },
      ],
    },
    english: {
      title: 'Items (Product Master)',
      intro: 'Master list of your products — name, HSN code, default rate and GST%. Items in bills/orders come from here.',
      steps: ['Click "+ New".', 'Fill name, HSN, default rate and GST%.', 'Save — the item now appears in bill/order search.'],
      faqs: [
        { q: 'how to add an item', a: 'Use "+ New" to add name, HSN and GST%.' },
        { q: 'what is HSN', a: 'HSN is the product code for GST. Fill it so GST applies correctly.' },
        { q: 'rate differs each time', a: 'Set a default rate here; you can override it per bill.' },
      ],
    },
    gujarati: {
      title: 'આઇટમ્સ',
      intro: 'પ્રોડક્ટ માસ્ટર — નામ, HSN, ભાવ, GST%. બિલ/ઓર્ડરમાં આઇટમ અહીંથી આવે.',
      steps: ['"+ New" થી આઇટમ ઉમેરો.', 'નામ, HSN, ભાવ, GST% ભરો.', 'Save કરો.'],
      faqs: [
        { q: 'આઇટમ ઉમેરો', a: '"+ New" થી નામ, HSN, GST% નાખો.' },
        { q: 'HSN શું', a: 'GST માટે પ્રોડક્ટ કોડ — સાચો GST લાગે માટે ભરો.' },
      ],
    },
  },

  // ---------------- SUPPLIERS DIRECTORY (Bazaar Link) ----------------
  {
    match: '/suppliers',
    hinglish: {
      title: 'Bazaar Link (Supplier / Buyer Directory)',
      intro: 'Suppliers aur buyers ki detailed directory — har supplier ke andar product varieties, rate aur photos rakh sakte ho. Buyers, Appointments aur Match alag sections me hain.',
      steps: [
        'List me supplier dhundo ya "+ New" se naya add karo.',
        'Supplier kholo aur uske andar product varieties add karo — har variety ka rate aur photo bhi.',
        'Buyers section me buyer ki detail aur uski demand/budget rakho.',
        'Match section se kisi buyer ki demand ke hisaab se best suppliers dekho.',
        'Appointments me supplier/buyer se milne ka schedule rakho.',
      ],
      faqs: [
        { q: 'supplier ka catalog kaha', a: 'Supplier kholo → uske andar varieties, rate aur photo add karne ka option hai.' },
        { q: 'photo upload nahi ho rahi', a: 'Image file (JPG/PNG) honi chahiye aur size limit ke andar. Saaf photo chuno aur dobara try karo.' },
        { q: 'buyer kaha hai', a: 'Bazaar Link ke andar Buyers section/tab me jao.' },
        { q: 'match kaise kaam karta hai', a: 'Match buyer ki demand (variety, rate range) ko suppliers ke catalog se compare karke best supplier suggest karta hai.' },
        { q: 'bazaar link aur parties me fark', a: 'Parties = sirf naam/GST/phone (billing ke liye). Bazaar Link = us party ka detailed catalog, photo, demand aur matching.' },
      ],
    },
    english: {
      title: 'Bazaar Link (Supplier / Buyer Directory)',
      intro: 'Detailed directory of suppliers and buyers — keep product varieties, rates and photos inside each supplier. Buyers, Appointments and Match are separate sections.',
      steps: [
        'Find a supplier or add via "+ New".',
        'Open a supplier and add product varieties — each with rate and photo.',
        'In Buyers, record the buyer\'s demand/budget.',
        'Use Match to find best suppliers for a buyer\'s demand.',
        'Use Appointments to schedule meetings.',
      ],
      faqs: [
        { q: 'where is supplier catalog', a: 'Open a supplier → add varieties/rate/photo inside.' },
        { q: 'photo will not upload', a: 'Use a JPG/PNG within the size limit; pick a clear photo and retry.' },
        { q: 'how does match work', a: 'Match compares a buyer\'s demand with supplier catalogs to suggest the best supplier.' },
        { q: 'bazaar link vs parties', a: 'Parties = name/GST/phone for billing. Bazaar Link = detailed catalog, photos, demand and matching.' },
      ],
    },
    gujarati: {
      title: 'બઝાર લિંક (ડિરેક્ટરી)',
      intro: 'સપ્લાયર/બાયરની વિગતવાર ડિરેક્ટરી — દરેક સપ્લાયરમાં વેરાયટી, રેટ, ફોટા. Buyers, Appointments, Match અલગ.',
      steps: [
        'સપ્લાયર શોધો કે "+ New" થી ઉમેરો.',
        'સપ્લાયરમાં વેરાયટી, રેટ, ફોટા ઉમેરો.',
        'Buyers માં બાયરની માંગ/બજેટ રાખો.',
        'Match થી બાયર માટે શ્રેષ્ઠ સપ્લાયર જુઓ.',
      ],
      faqs: [
        { q: 'કેટલોગ ક્યાં', a: 'સપ્લાયર ખોલો → અંદર વેરાયટી/રેટ/ફોટા.' },
        { q: 'ફોટો અપલોડ થતો નથી', a: 'JPG/PNG સાઇઝ લિમિટમાં વાપરો, ફરી પ્રયત્ન કરો.' },
      ],
    },
  },

  // ---------------- IMPORT & MIGRATION ----------------
  {
    match: '/import',
    hinglish: {
      title: 'Import & Migration',
      intro: 'Purane data ko Excel se ek saath system me laane ke liye ye page hai — parties, items, opening balances aur bills bulk me import ho jaate hain.',
      steps: [
        'Tab chuno (Parties / Items / Bills / Opening Balance).',
        'Sample/template Excel download karo aur usi format me apna data bharo.',
        'Bhari hui Excel file upload karo.',
        'Preview me check karo ki data sahi padha gaya, phir Import confirm karo.',
        'Bills/opening balance import par zaroori voucher apne aap ban jaate hain.',
      ],
      faqs: [
        { q: 'import kaise kare', a: 'Tab chuno → template download karo → data bharo → upload → preview check → Import.' },
        { q: 'format galat error', a: 'Hamesha diye gaye template ke columns hi use karo — column ka naam/order badle to error aata hai.' },
        { q: 'kuch rows import nahi hui', a: 'Preview me un rows par error dikhega (jaise GST galat ya zaroori field khaali) — Excel me theek karke dobara upload karo.' },
        { q: 'opening balance kaise', a: 'Opening Balance tab me har party ka shuruaati baaki amount daalo — system uska voucher bana dega.' },
      ],
    },
    english: {
      title: 'Import & Migration',
      intro: 'Bring old data in bulk via Excel — parties, items, opening balances and bills import together.',
      steps: [
        'Pick a tab (Parties / Items / Bills / Opening Balance).',
        'Download the template Excel and fill your data in that format.',
        'Upload the filled file.',
        'Check the preview, then confirm Import.',
        'For bills/opening balances, the needed vouchers are created automatically.',
      ],
      faqs: [
        { q: 'how to import', a: 'Pick tab → download template → fill → upload → check preview → Import.' },
        { q: 'format error', a: 'Use the template columns exactly — renamed/reordered columns cause errors.' },
        { q: 'some rows did not import', a: 'The preview shows errors per row (e.g. bad GST or empty required field) — fix in Excel and re-upload.' },
        { q: 'how to set opening balance', a: 'In the Opening Balance tab, enter each party\'s starting due; a voucher is created.' },
      ],
    },
    gujarati: {
      title: 'ઇમ્પોર્ટ અને માઇગ્રેશન',
      intro: 'જૂનો ડેટા Excel થી બલ્કમાં લાવો — પાર્ટી, આઇટમ, ઓપનિંગ બેલેન્સ, બિલ્સ.',
      steps: [
        'ટેબ પસંદ કરો (Parties/Items/Bills/Opening Balance).',
        'ટેમ્પ્લેટ Excel ડાઉનલોડ કરી ડેટા ભરો.',
        'ફાઇલ અપલોડ કરો.',
        'પ્રિવ્યૂ તપાસી Import કરો.',
      ],
      faqs: [
        { q: 'ઇમ્પોર્ટ કેવી રીતે', a: 'ટેબ → ટેમ્પ્લેટ → ભરો → અપલોડ → પ્રિવ્યૂ → Import.' },
        { q: 'કેટલીક રો ન આવી', a: 'પ્રિવ્યૂમાં એરર જુઓ, Excel સુધારી ફરી અપલોડ.' },
      ],
    },
  },

  // ---------------- REPORTS ----------------
  {
    match: '/reports',
    hinglish: {
      title: 'Reports',
      intro: 'Business ke saare reports ek jagah — Sales Register, Outstanding, GST, Top Parties/Items, GR, Commission, On-Time, Pending Orders. Har report me date range aur filter laga kar data dekho, phir print/export karo.',
      steps: [
        'Left list (ya tabs) me se report chuno.',
        'Upar date range aur zaroori filter (party/branch) lagao.',
        'Data table check karo — column par click karke sort bhi kar sakte ho.',
        'Print ya Excel/PDF export button se report nikalo.',
      ],
      faqs: [
        { q: 'gst report', a: 'Reports → GST me CGST/SGST/IGST ka pura summary milega — return file karne ke kaam aata hai.' },
        { q: 'outstanding report', a: 'Reports → Outstanding (ya Party Outstanding) me kaun party kitna paisa baaki rakhe hai dikhta hai.' },
        { q: 'sales report', a: 'Reports → Sales Register me chuni hui date ka saara sales data milta hai.' },
        { q: 'report khaali aa rahi', a: 'Date range badlo (jaise Full Year) aur filter "All" rakho — ho sakta hai us period me data na ho.' },
        { q: 'report export kaise', a: 'Report upar Print ya Export (Excel/PDF) button dabao.' },
        { q: 'pending orders', a: 'Reports → Pending Orders me wo orders dikhte hain jinka abhi bill nahi bana.' },
      ],
    },
    english: {
      title: 'Reports',
      intro: 'All business reports in one place — Sales Register, Outstanding, GST, Top Parties/Items, GR, Commission, On-Time, Pending Orders. Apply date range and filters, then print/export.',
      steps: [
        'Pick a report from the left list/tabs.',
        'Apply date range and filters (party/branch) on top.',
        'Review the table — click a column to sort.',
        'Use Print or Export (Excel/PDF) to take it out.',
      ],
      faqs: [
        { q: 'gst report', a: 'Reports → GST shows the CGST/SGST/IGST summary for return filing.' },
        { q: 'outstanding report', a: 'Reports → Outstanding shows who owes how much.' },
        { q: 'sales report', a: 'Reports → Sales Register shows all sales for the selected dates.' },
        { q: 'report is empty', a: 'Widen the date range and set filters to "All" — there may be no data in that period.' },
        { q: 'how to export', a: 'Use the Print or Export (Excel/PDF) button on top.' },
      ],
    },
    gujarati: {
      title: 'રિપોર્ટ્સ',
      intro: 'બધા રિપોર્ટ એક જગ્યાએ — Sales, Outstanding, GST, Top Parties/Items, Pending Orders. તારીખ/ફિલ્ટર લગાવી જુઓ, પ્રિન્ટ/એક્સપોર્ટ કરો.',
      steps: [
        'ડાબી યાદીમાંથી રિપોર્ટ પસંદ કરો.',
        'ઉપર તારીખ રેન્જ/ફિલ્ટર લગાવો.',
        'ટેબલ તપાસો, કોલમ પર ક્લિક કરી સોર્ટ કરો.',
        'Print/Export કરો.',
      ],
      faqs: [
        { q: 'GST રિપોર્ટ', a: 'Reports → GST માં CGST/SGST/IGST સારાંશ.' },
        { q: 'બાકી રિપોર્ટ', a: 'Reports → Outstanding માં કોણ કેટલું બાકી.' },
        { q: 'રિપોર્ટ ખાલી', a: 'તારીખ રેન્જ મોટી કરો, ફિલ્ટર "All" રાખો.' },
      ],
    },
  },

  // ---------------- ACCOUNTING: VOUCHERS ----------------
  {
    match: '/accounting/vouchers',
    hinglish: {
      title: 'Voucher Entry',
      intro: 'Accounting vouchers yahan banate hain — Payment, Receipt, Contra aur Journal. Har voucher me debit aur credit barabar hone par hi save hota hai.',
      steps: [
        'Voucher type chuno (Payment / Receipt / Contra / Journal).',
        'Debit aur Credit account chuno aur amount bharo.',
        'Narration (kis cheez ka voucher) likho.',
        'Debit total = Credit total ho to "Save" dabao.',
      ],
      faqs: [
        { q: 'journal voucher kya hai', a: 'Journal me debit aur credit dono account aap khud chunte ho — adjustment entries ke liye.' },
        { q: 'contra kya hai', a: 'Contra = apne hi accounts ke beech paisa (jaise Cash se Bank ya Bank se Cash).' },
        { q: 'debit credit barabar nahi error', a: 'Voucher tabhi save hoga jab total debit = total credit ho. Amount check karke barabar karo.' },
        { q: 'voucher edit/delete', a: 'Voucher kholo, wahin Edit/Delete option milega (agar locked period na ho).' },
      ],
    },
    english: {
      title: 'Voucher Entry',
      intro: 'Create accounting vouchers — Payment, Receipt, Contra and Journal. A voucher saves only when debit equals credit.',
      steps: [
        'Choose voucher type (Payment / Receipt / Contra / Journal).',
        'Pick Debit and Credit accounts and enter amounts.',
        'Write a narration.',
        'When Debit total = Credit total, click "Save".',
      ],
      faqs: [
        { q: 'what is a journal voucher', a: 'In a journal you pick both debit and credit accounts manually — for adjustments.' },
        { q: 'what is contra', a: 'Contra = movement between your own accounts (Cash↔Bank).' },
        { q: 'debit credit not equal error', a: 'It saves only when total debit = total credit. Adjust the amounts.' },
      ],
    },
    gujarati: {
      title: 'વાઉચર એન્ટ્રી',
      intro: 'એકાઉન્ટિંગ વાઉચર — Payment, Receipt, Contra, Journal. ડેબિટ = ક્રેડિટ હોય તો જ સેવ.',
      steps: [
        'વાઉચર પ્રકાર પસંદ કરો.',
        'ડેબિટ/ક્રેડિટ એકાઉન્ટ અને રકમ ભરો.',
        'Narration લખો.',
        'ડેબિટ = ક્રેડિટ થાય તો Save.',
      ],
      faqs: [
        { q: 'જર્નલ વાઉચર', a: 'ડેબિટ/ક્રેડિટ બંને જાતે પસંદ — એડજસ્ટમેન્ટ માટે.' },
        { q: 'ડેબિટ ક્રેડિટ સરખા નથી', a: 'ટોટલ ડેબિટ = ક્રેડિટ થાય તો જ સેવ.' },
      ],
    },
  },

  // ---------------- ACCOUNTING: LEDGERS ----------------
  {
    match: '/accounting/ledgers',
    hinglish: {
      title: 'Ledgers',
      intro: 'Har account/party ka ledger — uske saare debit, credit aur final balance. Kisi party ka pura lene-den ek jagah dekhne ke liye.',
      steps: ['Account ya party chuno.', 'Date range lagao.', 'Saari entries (debit/credit) dekho — neeche closing balance milega.', 'Print/export kar sakte ho.'],
      faqs: [
        { q: 'party ka ledger', a: 'Ledgers me party chuno — uske saare lene-den aur balance dikhega.' },
        { q: 'balance galat lag raha', a: 'Date range poora karo (opening se aaj tak) — chhoti range se balance adhoora dikhta hai.' },
        { q: 'ledger print', a: 'Ledger kholne ke baad Print/Export button dabao.' },
      ],
    },
    english: {
      title: 'Ledgers',
      intro: 'Ledger for each account/party — all debits, credits and the final balance, to see one party\'s full activity in one place.',
      steps: ['Choose account/party.', 'Set date range.', 'View all entries; the closing balance shows at the bottom.', 'Print/export if needed.'],
      faqs: [
        { q: 'party ledger', a: 'Pick the party in Ledgers to see all transactions and balance.' },
        { q: 'balance looks wrong', a: 'Use the full date range (from opening) — a short range shows a partial balance.' },
      ],
    },
    gujarati: {
      title: 'ખાતાવહી',
      intro: 'દરેક એકાઉન્ટ/પાર્ટીની ખાતાવહી — ડેબિટ, ક્રેડિટ, બેલેન્સ.',
      steps: ['એકાઉન્ટ/પાર્ટી પસંદ કરો.', 'તારીખ રેન્જ લગાવો.', 'એન્ટ્રી જુઓ; નીચે બેલેન્સ.'],
      faqs: [
        { q: 'પાર્ટી ખાતાવહી', a: 'Ledgers માં પાર્ટી પસંદ કરી બધા વ્યવહાર જુઓ.' },
        { q: 'બેલેન્સ ખોટું', a: 'આખી તારીખ રેન્જ વાપરો.' },
      ],
    },
  },

  // ---------------- WALLET ----------------
  {
    match: '/wallet',
    hinglish: {
      title: 'Wallet & Plan',
      intro: 'Aapka plan, wallet balance aur OCR scan usage yahan dikhta hai. Recharge bhi yahin se hota hai. Bill scan jaise paid features ka paisa isi wallet se katta hai.',
      steps: [
        'Upar current plan, validity (kitne din baaki) aur wallet balance dekho.',
        'Is mahine kitne scan/usage hue ye dikhta hai.',
        'Balance kam ho to "Recharge" dabao aur UPI/Bank se payment karo.',
        'Payment ke baad balance apne aap update ho jata hai (manual approve ho to thoda time lagta hai).',
      ],
      faqs: [
        { q: 'recharge kaise kare', a: 'Wallet par "Recharge" dabao, amount chuno aur UPI/Bank se pay karo.' },
        { q: 'balance update nahi hua', a: 'Manual UPI/Bank payment admin approve karta hai — thoda ruk kar page reload karo. Phir bhi na ho to admin se kaho.' },
        { q: 'scan ka paisa kyun kata', a: 'Bill/Order scan ek paid service hai — har scan ka thoda charge wallet se katta hai. Wallet page par usage dikhta hai.' },
        { q: 'plan kab khatam ho raha', a: 'Wallet par validity/expiry date likhi hoti hai — uske pehle recharge/renew karo.' },
      ],
    },
    english: {
      title: 'Wallet & Plan',
      intro: 'Your plan, wallet balance and OCR scan usage. Recharge here too. Paid features like bill scan deduct from this wallet.',
      steps: [
        'See current plan, validity (days left) and wallet balance on top.',
        'View this month\'s scans/usage.',
        'If low, click "Recharge" and pay via UPI/Bank.',
        'Balance updates after payment (manual approvals take a little time).',
      ],
      faqs: [
        { q: 'how to recharge', a: 'Click "Recharge", choose an amount and pay via UPI/Bank.' },
        { q: 'balance not updated', a: 'Manual UPI/Bank payments need admin approval — wait and reload; contact admin if still pending.' },
        { q: 'why was i charged for a scan', a: 'Bill/order scan is a paid service; each scan deducts a small charge. See usage on the Wallet page.' },
      ],
    },
    gujarati: {
      title: 'વોલેટ અને પ્લાન',
      intro: 'પ્લાન, વોલેટ બેલેન્સ અને સ્કેન વપરાશ. રિચાર્જ પણ અહીંથી. પેઇડ ફીચર આ વોલેટમાંથી કપાય.',
      steps: [
        'પ્લાન, વેલિડિટી અને બેલેન્સ જુઓ.',
        'આ મહિને કેટલા સ્કેન થયા જુઓ.',
        'ઓછું હોય તો "Recharge" દબાવી UPI/Bank થી પે કરો.',
      ],
      faqs: [
        { q: 'રિચાર્જ કેવી રીતે', a: '"Recharge" દબાવી UPI/Bank થી પે કરો.' },
        { q: 'બેલેન્સ અપડેટ નથી', a: 'મેન્યુઅલ પેમેન્ટ એડમિન એપ્રૂવ કરે — થોડી વાર પછી રિલોડ કરો.' },
      ],
    },
  },

  // ---------------- TRANSPORTERS ----------------
  {
    match: '/masters/transporters',
    hinglish: {
      title: 'Transport Master',
      intro: 'Transporter ki list — naam, GST aur mobile. Bill/Order me transporter yahi se aata hai. CSV se bulk import bhi kar sakte ho.',
      steps: ['"+ New" se transporter add karo (naam, mobile, GST).', 'Bahut saare ek saath daalne ke liye CSV Import use karo.', 'Save ke baad bill/order me transporter search par milega.'],
      faqs: [
        { q: 'csv import kaise', a: 'Import button se CSV upload karo — naam, mobile, GST apne aap padh liye jaayenge.' },
        { q: 'transporter har firm me same?', a: 'Nahi, har firm ka apna transporter list alag hota hai.' },
        { q: 'transporter bill me nahi dikh raha', a: 'Pehle yahan add karo; phir bill/order ke transporter box me search karo.' },
      ],
    },
    english: {
      title: 'Transport Master',
      intro: 'Transporter list — name, GST and mobile. Bills/orders pick the transporter from here. Bulk CSV import is supported.',
      steps: ['Add via "+ New" (name, mobile, GST).', 'Use CSV Import for many at once.', 'After save, it appears in bill/order transporter search.'],
      faqs: [
        { q: 'how to csv import', a: 'Use Import to upload a CSV — name, mobile, GST are read automatically.' },
        { q: 'transporter not in bill', a: 'Add it here first, then search the transporter box in the bill/order.' },
      ],
    },
    gujarati: {
      title: 'ટ્રાન્સપોર્ટ માસ્ટર',
      intro: 'ટ્રાન્સપોર્ટર યાદી — નામ, GST, મોબાઇલ. CSV બલ્ક ઇમ્પોર્ટ પણ.',
      steps: ['"+ New" થી ઉમેરો.', 'બલ્ક માટે CSV Import.', 'બિલ/ઓર્ડરમાં અહીંથી આવે.'],
      faqs: [
        { q: 'CSV ઇમ્પોર્ટ', a: 'Import થી CSV અપલોડ કરો.' },
      ],
    },
  },

  // ---------------- CORE MASTER ----------------
  {
    match: '/core-master',
    hinglish: {
      title: 'Core Master',
      intro: 'Saare contacts (Trading + Bazaar Link + HR) ek hi jagah. Contact ka common data (naam, phone, WhatsApp, GST) yahan se badlo — wo har module me apne aap update ho jata hai. Ek hi jagah, ek hi sachchai.',
      steps: [
        'Contact dhundo (search) aur kholo.',
        'Common fields — naam, phone, 2 WhatsApp number, GST, address — badlo.',
        'Save karo — ye badlav Trading, Bazaar Link aur HR sab jagah dikh jayega.',
      ],
      faqs: [
        { q: 'core master kya hai', a: 'Ek hi jagah se contact ka common data manage karna, jo Trading/Bazaar Link/HR sab me same rehta hai — alag-alag jagah update karne ki zaroorat nahi.' },
        { q: 'WhatsApp number kyun 2', a: 'Ek supplier-side, ek buyer-side bot ke liye — dono number yahin se set hote hain.' },
        { q: 'yahan badla to bill me bhi badlega?', a: 'Haan, common fields ek hi source se aate hain — Core Master me badlo, bill/order me bhi wahi dikhega.' },
      ],
    },
    english: {
      title: 'Core Master',
      intro: 'All contacts (Trading + Bazaar Link + HR) in one place. Edit a contact\'s common data (name, phone, WhatsApp, GST) here — it updates everywhere. One place, one truth.',
      steps: [
        'Search and open a contact.',
        'Edit common fields — name, phone, 2 WhatsApp numbers, GST, address.',
        'Save — the change reflects across Trading, Bazaar Link and HR.',
      ],
      faqs: [
        { q: 'what is core master', a: 'Manage a contact\'s common data from one place, shared across Trading/Bazaar Link/HR — no need to update in many places.' },
        { q: 'why two WhatsApp numbers', a: 'One supplier-side, one buyer-side for the bot — both set here.' },
        { q: 'does editing here change bills', a: 'Yes — common fields come from one source, so the bill/order shows the updated value.' },
      ],
    },
    gujarati: {
      title: 'કોર માસ્ટર',
      intro: 'બધા સંપર્કો (Trading + Bazaar Link + HR) એક જગ્યાએ. કોમન ડેટા અહીંથી બદલો — બધે અપડેટ થાય.',
      steps: [
        'સંપર્ક શોધી ખોલો.',
        'નામ, ફોન, 2 WhatsApp, GST બદલો.',
        'Save — દરેક મોડ્યુલમાં દેખાશે.',
      ],
      faqs: [
        { q: 'કોર માસ્ટર શું', a: 'એક જ જગ્યાએથી કોમન ડેટા મેનેજ, જે બધે સરખો રહે.' },
        { q: '2 WhatsApp કેમ', a: 'એક સપ્લાયર-સાઇડ, એક બાયર-સાઇડ બોટ માટે.' },
      ],
    },
  },

  // ---------------- TEAM & SECURITY ----------------
  {
    match: '/team',
    hinglish: {
      title: 'Team & Security',
      intro: 'Branches, users (staff ke login), roles aur permissions yahan manage karte hain. Yahin se decide hota hai kaun staff kya kaam kar sakta hai.',
      steps: [
        'Branches me apni branch add/edit karo.',
        'Users me staff ko login (user id + password) do aur ek role choose karo.',
        'Roles me har role ki permissions on/off karo (kaun kya dekh/kar sake).',
        'Save karo — staff us role ke hisaab se hi app use kar payega.',
      ],
      faqs: [
        { q: 'naya user kaise banau', a: 'Team → Users → "+ New" se staff ka login banao, naam/email do aur role choose karo.' },
        { q: 'permission kaise set karu', a: 'Roles me jaake us role ke modules/actions on-off karo. User ko wahi role do.' },
        { q: 'password reset', a: 'User ki row me "Reset Password" se naya password set hota hai (purana kabhi dikhta nahi).' },
        { q: 'staff ko kuch dikhana nahi', a: 'Us role ki permission me wo module band kar do — phir us role wale staff ko wo nahi dikhega.' },
        { q: 'branch add', a: 'Team → Branches me "+ New" se branch banao, phir user ko us branch se jodo.' },
      ],
    },
    english: {
      title: 'Team & Security',
      intro: 'Manage branches, users (staff logins), roles and permissions here — this decides who can do what.',
      steps: [
        'Add/edit your branches.',
        'In Users, give staff a login (user id + password) and pick a role.',
        'In Roles, toggle each role\'s permissions (who can see/do what).',
        'Save — staff can use the app only per their role.',
      ],
      faqs: [
        { q: 'how to add a user', a: 'Team → Users → "+ New": create a login, set name/email and choose a role.' },
        { q: 'how to set permissions', a: 'In Roles, toggle modules/actions, then assign that role to the user.' },
        { q: 'reset password', a: 'Use "Reset Password" on the user row to set a new one (the old is never shown).' },
        { q: 'hide something from staff', a: 'Turn that module off in the role\'s permissions; staff with that role won\'t see it.' },
      ],
    },
    gujarati: {
      title: 'ટીમ અને સિક્યુરિટી',
      intro: 'બ્રાન્ચ, યુઝર (સ્ટાફ લોગિન), રોલ અને પરમિશન અહીં મેનેજ — કોણ શું કરી શકે તે નક્કી થાય.',
      steps: [
        'બ્રાન્ચ ઉમેરો/એડિટ કરો.',
        'Users માં સ્ટાફને લોગિન અને રોલ આપો.',
        'Roles માં પરમિશન on/off કરો.',
        'Save કરો.',
      ],
      faqs: [
        { q: 'નવો યુઝર', a: 'Team → Users → "+ New" થી લોગિન બનાવી રોલ આપો.' },
        { q: 'પાસવર્ડ રિસેટ', a: 'યુઝર રો માં "Reset Password" થી નવો સેટ થાય.' },
      ],
    },
  },
];

// Generic fallback when a page has no specific entry yet.
export const GENERIC_HELP: HelpEntry = {
  match: '',
  hinglish: {
    title: 'Madad',
    intro: 'Is page par koi cheez samajh na aaye to neeche ke common steps dekho, ya neeche box me apna sawaal type karo / 🎤 mic se pucho — main jawab bol kar bataaunga.',
    steps: [
      'List pages me upar filter/search box hota hai — usse record dhundo.',
      'Naya record banane ke liye "+ New" ya "Add" type button dhundo (aksar upar dayi taraf).',
      'Kisi row par click karke detail/edit kholo.',
      'Form me laal (*) wale field zaroori hote hain — wo bhar kar Save/Submit karo.',
      'Doosre kaam ke liye left sidebar se module badlo.',
    ],
    faqs: [
      { q: 'naya kaise banau', a: 'Page ke upar dayi taraf "+ New" ya "Add" button hota hai — usse naya record banao.' },
      { q: 'search kaise', a: 'Page ke upar search box ya filter se naam/number daal kar dhundo.' },
      { q: 'save nahi ho raha', a: 'Saare laal (*) wale zaroori field bharo — koi khaali hoga to save nahi hoga.' },
      { q: 'bill kaise banau', a: 'Trading → Bills → "New Bill Entry" par jao.' },
    ],
  },
  english: {
    title: 'Help',
    intro: 'If something here is unclear, see the common steps below, or type your question / use 🎤 mic — I will answer by voice.',
    steps: [
      'List pages have a filter/search box on top.',
      'Look for a "+ New" / "Add" button (usually top right) to create a record.',
      'Click a row to open detail/edit.',
      'Fields marked (*) are required — fill them and Save/Submit.',
      'Use the left sidebar to switch modules.',
    ],
    faqs: [
      { q: 'how to add new', a: 'There is usually a "+ New" or "Add" button at the top right.' },
      { q: 'how to search', a: 'Use the search box or filter at the top of the page.' },
      { q: 'cannot save', a: 'Fill all required (*) fields — an empty one blocks saving.' },
      { q: 'Does scan store or remember my data? Is it safe?', a: 'The scan only reads the bill/order to extract data — nothing else. It does not store your data; Anjaninex has full security. Your data is completely safe.' },
    ],
  },
  gujarati: {
    title: 'મદદ',
    intro: 'આ પેજ પર કંઈ સમજાય નહીં તો નીચે સ્ટેપ જુઓ, કે બોક્સમાં સવાલ ટાઇપ કરો / 🎤 માઇકથી પૂછો.',
    steps: [
      'યાદી પેજ પર ઉપર ફિલ્ટર/સર્ચ હોય છે.',
      'નવો રેકોર્ડ બનાવવા "+ New"/"Add" બટન શોધો.',
      'કોઈ રો પર ક્લિક કરી વિગત/એડિટ ખોલો.',
      '(*) વાળા ફિલ્ડ જરૂરી — ભરી Save/Submit કરો.',
      'સાઇડબારથી મોડ્યુલ બદલો.',
    ],
    faqs: [
      { q: 'નવું કેવી રીતે', a: 'ઉપર જમણે "+ New"/"Add" બટન હોય છે.' },
      { q: 'શોધ કેવી રીતે', a: 'ઉપર સર્ચ બોક્સ/ફિલ્ટર વાપરો.' },
      { q: 'સેવ થતું નથી', a: 'બધા (*) જરૂરી ફિલ્ડ ભરો.' },
      { q: 'સ્કેન ડેટા સુરક્ષિત?', a: 'સ્કેન ફક્ત ડેટા કાઢે, સ્ટોર નહીં. ડેટા સુરક્ષિત છે.' },
    ],
  },
};

/** Normalize URL then longest-prefix match. */
export function findHelp(url: string): HelpEntry {
  let clean = (url || '/').split('?')[0].split('#')[0];
  // /:id/edit -> /new ; trailing /:id (uuid/number) -> base
  clean = clean.replace(/\/[^/]+\/edit$/, '/new').replace(/\/[0-9a-fA-F-]{6,}$/, '');
  if (clean.length > 1 && clean.endsWith('/')) clean = clean.slice(0, -1);

  let best: HelpEntry | null = null;
  for (const e of HELP_PAGES) {
    const m = e.match;
    const hit = m === '/' ? (clean === '/' || clean === '') : (clean === m || clean.startsWith(m + '/') || clean.startsWith(m));
    if (hit && (!best || m.length > best.match.length)) best = e;
  }
  return best ?? GENERIC_HELP;
}
