/**
 * Anji Help Desk — per-page help content in 3 languages (Hinglish / English / Gujarati).
 * No AI: hand-written guide + FAQ per page. Mic input is keyword-matched against the
 * page's steps + FAQs to speak the best answer.
 *
 * Add a new page = add an entry. URL is matched by longest prefix (after normalizing
 * /:id/edit -> /new and trailing /:id -> base).
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
      title: 'Dashboard',
      intro: 'Ye aapka home page hai — business ki aaj ki summary, sales/order trend aur quick links.',
      steps: [
        'Upar KPI cards me total sales, orders, outstanding aur AI scans dikhte hain.',
        'Graph se sales/order ka trend dekho.',
        'Left sidebar se kisi bhi module me jao (Trading, Accounting, Reports...).',
        'Naya bill banane ke liye Trading → Bills → New Bill Entry.',
      ],
      faqs: [
        { q: 'sales kaha dikhe', a: 'Upar KPI cards me total sales dikhta hai, aur neeche graph me trend.' },
        { q: 'naya bill kaise banau', a: 'Sidebar me Trading → Bills → "New Bill Entry" button dabao.' },
        { q: 'outstanding kya hai', a: 'Outstanding = jo paisa abhi tak parties se aana baaki hai. Reports → Outstanding me detail milega.' },
      ],
    },
    english: {
      title: 'Dashboard',
      intro: 'Your home page — today\'s business summary, sales/order trends and quick links.',
      steps: [
        'KPI cards on top show total sales, orders, outstanding and AI scans.',
        'The graph shows your sales/order trend.',
        'Use the left sidebar to open any module (Trading, Accounting, Reports...).',
        'To make a new bill: Trading → Bills → New Bill Entry.',
      ],
      faqs: [
        { q: 'where do i see sales', a: 'Total sales is in the KPI cards on top, with the trend in the graph below.' },
        { q: 'how to make a new bill', a: 'Open Trading → Bills → "New Bill Entry" in the sidebar.' },
        { q: 'what is outstanding', a: 'Outstanding is money still due from parties. See Reports → Outstanding for details.' },
      ],
    },
    gujarati: {
      title: 'ડેશબોર્ડ',
      intro: 'આ તમારું હોમ પેજ છે — આજનો બિઝનેસ સારાંશ, વેચાણ/ઓર્ડર ટ્રેન્ડ અને ઝડપી લિંક્સ.',
      steps: [
        'ઉપરના KPI કાર્ડમાં કુલ વેચાણ, ઓર્ડર, બાકી રકમ અને AI સ્કેન દેખાય છે.',
        'ગ્રાફમાં વેચાણ/ઓર્ડરનો ટ્રેન્ડ જુઓ.',
        'ડાબી સાઇડબારથી કોઈપણ મોડ્યુલ ખોલો (ટ્રેડિંગ, એકાઉન્ટિંગ, રિપોર્ટ્સ...).',
        'નવું બિલ બનાવવા: ટ્રેડિંગ → બિલ્સ → New Bill Entry.',
      ],
      faqs: [
        { q: 'વેચાણ ક્યાં દેખાય', a: 'ઉપરના KPI કાર્ડમાં કુલ વેચાણ અને નીચે ગ્રાફમાં ટ્રેન્ડ દેખાય છે.' },
        { q: 'નવું બિલ કેવી રીતે બનાવું', a: 'સાઇડબારમાં ટ્રેડિંગ → બિલ્સ → "New Bill Entry" દબાવો.' },
        { q: 'બાકી રકમ શું છે', a: 'બાકી રકમ એટલે પાર્ટી પાસેથી હજુ આવવાના પૈસા. વિગત માટે રિપોર્ટ્સ → Outstanding જુઓ.' },
      ],
    },
  },

  // ---------------- BILL ENTRY ----------------
  {
    match: '/trading/bills/new',
    hinglish: {
      title: 'Bill Entry (Naya Bill)',
      intro: 'Yahan supplier ka purchase bill enter karte hain — manually ya AI Scan se auto-fill.',
      steps: [
        'Sabse upar "Scan Bill" se bill ka photo/PDF daalo — AI khud sab fields bhar dega.',
        'Supplier, Supplier Bill No aur Bill Date bharo (zaroori fields *).',
        'Item rows me naam, qty, rate, GST% bharo — total apne aap banega.',
        'Transport/e-Way details bharo (agar e-Way No hai par date nahi, to bill ki date hi lag jayegी).',
        'Niche "Submit" dabao — bill save ho jayega.',
      ],
      faqs: [
        { q: 'bill scan kaise kare', a: 'Upar "Scan Bill" button dabao, bill ka photo ya PDF upload karo — AI sab fields bhar dega. Phir check karke Submit.' },
        { q: 'supplier nahi mil raha', a: 'Supplier box me naam/GST se search karo. Naya ho to "+ New" se add karo.' },
        { q: 'gst kaise lagta hai', a: 'Same state ho to CGST+SGST, doosre state ka ho to IGST apne aap lagega.' },
        { q: 'entry date kya hai', a: 'Entry Date = aaj ki date (jab entry kar rahe ho), apne aap aati hai. Supplier Bill Date = bill par chhapi date.' },
        { q: 'eway bill date', a: 'Agar e-Way Bill No diya hai par date khali, to bill ki date hi e-Way date maan li jayegी.' },
        { q: 'AI scan mera data yaad rakhta hai? safe hai?', a: 'AI sirf bill ko padh kar uska data extract karta hai — bus, aur kuch nahi karta. Wo aapka data yaad ya store nahi rakhta, kyunki Anjaninex ne poori security laga rakhi hai. Aapka data bilkul safe hai.' },
      ],
    },
    english: {
      title: 'Bill Entry (New Bill)',
      intro: 'Enter a supplier purchase bill here — manually or auto-filled via AI Scan.',
      steps: [
        'Use "Scan Bill" on top to upload the bill photo/PDF — AI fills all fields.',
        'Fill Supplier, Supplier Bill No and Bill Date (required *).',
        'In item rows enter name, qty, rate, GST% — totals compute automatically.',
        'Fill transport/e-Way details (if e-Way No has no date, the bill date is used).',
        'Click "Submit" at the bottom to save.',
      ],
      faqs: [
        { q: 'how to scan a bill', a: 'Click "Scan Bill" on top, upload the bill photo or PDF — AI fills all fields. Review and Submit.' },
        { q: 'supplier not found', a: 'Search by name/GST in the Supplier box. If new, add it with "+ New".' },
        { q: 'how is gst applied', a: 'Same state = CGST+SGST, different state = IGST, applied automatically.' },
        { q: 'what is entry date', a: 'Entry Date = today (when you enter), auto-filled. Supplier Bill Date = the date printed on the bill.' },
        { q: 'eway bill date', a: 'If an e-Way Bill No is given but the date is empty, the bill date is used as the e-Way date.' },
        { q: 'Does AI scan store or remember my data? Is it safe?', a: 'The AI only reads the bill and extracts the data — nothing else. It does not remember or store your data, because Anjaninex has full security in place. Your data is completely safe.' },
      ],
    },
    gujarati: {
      title: 'બિલ એન્ટ્રી (નવું બિલ)',
      intro: 'અહીં સપ્લાયરનું ખરીદ બિલ દાખલ કરો — જાતે અથવા AI સ્કેનથી ઓટો-ફિલ.',
      steps: [
        'ઉપર "Scan Bill" થી બિલનો ફોટો/PDF મૂકો — AI બધા ફિલ્ડ ભરી દેશે.',
        'સપ્લાયર, Supplier Bill No અને Bill Date ભરો (જરૂરી *).',
        'આઇટમ રોમાં નામ, જથ્થો, ભાવ, GST% ભરો — ટોટલ આપમેળે થશે.',
        'ટ્રાન્સપોર્ટ/e-Way વિગત ભરો (e-Way No હોય પણ તારીખ ન હોય તો બિલની તારીખ વપરાશે).',
        'નીચે "Submit" દબાવો — બિલ સેવ થઈ જશે.',
      ],
      faqs: [
        { q: 'બિલ સ્કેન કેવી રીતે', a: 'ઉપર "Scan Bill" દબાવો, બિલનો ફોટો કે PDF અપલોડ કરો — AI બધું ભરી દેશે. પછી તપાસીને Submit.' },
        { q: 'સપ્લાયર મળતો નથી', a: 'સપ્લાયર બોક્સમાં નામ/GST થી શોધો. નવો હોય તો "+ New" થી ઉમેરો.' },
        { q: 'GST કેવી રીતે લાગે', a: 'એક જ રાજ્ય હોય તો CGST+SGST, બીજા રાજ્યનું હોય તો IGST આપમેળે લાગે.' },
        { q: 'AI સ્કેન મારો ડેટા યાદ રાખે છે? સુરક્ષિત છે?', a: 'AI ફક્ત બિલ વાંચીને ડેટા કાઢે છે — બસ, બીજું કંઈ નહીં. તે તમારો ડેટા યાદ કે સ્ટોર રાખતું નથી, કારણ કે Anjaninex એ પૂરી સિક્યુરિટી રાખી છે. તમારો ડેટા સંપૂર્ણ સુરક્ષિત છે.' },
      ],
    },
  },

  // ---------------- BILLS LIST ----------------
  {
    match: '/trading/bills',
    hinglish: {
      title: 'Bills List',
      intro: 'Saare purchase bills ki list — search, filter, print aur edit.',
      steps: [
        'Upar se date/party filter laga ke bills dhundo.',
        'Kisi bill par click karke detail/print dekho.',
        'Naya bill banane ke liye "New Bill Entry" dabao.',
        'Pagination (10/50/100) se zyada bills dekho.',
      ],
      faqs: [
        { q: 'bill kaise dhundu', a: 'Upar date aur party filter se search karo.' },
        { q: 'bill edit kaise kare', a: 'Bill par click karke edit option choose karo.' },
        { q: 'supplier bill no kaha dikhega', a: 'List me "SUPP. BILL NO" column me supplier ka invoice number dikhta hai.' },
      ],
    },
    english: {
      title: 'Bills List',
      intro: 'List of all purchase bills — search, filter, print and edit.',
      steps: [
        'Filter by date/party at the top to find bills.',
        'Click a bill to view details/print.',
        'Click "New Bill Entry" to add a new bill.',
        'Use pagination (10/50/100) to see more.',
      ],
      faqs: [
        { q: 'how to find a bill', a: 'Use the date and party filters at the top.' },
        { q: 'how to edit a bill', a: 'Click the bill and choose edit.' },
      ],
    },
    gujarati: {
      title: 'બિલ્સ યાદી',
      intro: 'બધા ખરીદ બિલની યાદી — શોધો, ફિલ્ટર, પ્રિન્ટ અને એડિટ.',
      steps: [
        'ઉપર તારીખ/પાર્ટી ફિલ્ટરથી બિલ શોધો.',
        'બિલ પર ક્લિક કરી વિગત/પ્રિન્ટ જુઓ.',
        'નવું બિલ બનાવવા "New Bill Entry" દબાવો.',
      ],
      faqs: [
        { q: 'બિલ કેવી રીતે શોધું', a: 'ઉપર તારીખ અને પાર્ટી ફિલ્ટર વાપરો.' },
      ],
    },
  },

  // ---------------- ORDER ENTRY ----------------
  {
    match: '/trading/orders/new',
    hinglish: {
      title: 'Order Entry (Naya Order)',
      intro: 'Supplier ko bheja gaya order/PO yahan banate hain. Scan Order se PO auto-fill bhi hota hai.',
      steps: [
        'Company aur Order Date select karo (date apne aap aaj ki aati hai).',
        'Supplier search karke choose karo (naya ho to + New).',
        'Item rows bharo — qty, rate, GST%.',
        'Payment terms aur transporter bharo, phir Submit Order.',
      ],
      faqs: [
        { q: 'order number kaha hai', a: 'Order No save par apne aap ban jata hai (Auto — save par milega).' },
        { q: 'order scan', a: 'Upar "Scan Order" se PO ka photo/PDF daalo, AI fields bhar dega.' },
        { q: 'order save nahi ho raha', a: 'Supplier aur kam se kam 1 item zaroori hai. Sab * fields bharo phir Submit.' },
        { q: 'AI scan mera data yaad rakhta hai? safe hai?', a: 'AI sirf order ko padh kar data extract karta hai — bus, aur kuch nahi karta. Wo aapka data yaad ya store nahi rakhta, kyunki Anjaninex ne poori security laga rakhi hai. Aapka data bilkul safe hai.' },
      ],
    },
    english: {
      title: 'Order Entry (New Order)',
      intro: 'Create a purchase order/PO to a supplier. Scan Order can auto-fill the PO.',
      steps: [
        'Select Company and Order Date (date defaults to today).',
        'Search and choose the supplier (+ New if new).',
        'Fill item rows — qty, rate, GST%.',
        'Fill payment terms and transporter, then Submit Order.',
      ],
      faqs: [
        { q: 'where is the order number', a: 'Order No is generated automatically on save.' },
        { q: 'order scan', a: 'Use "Scan Order" on top to upload the PO photo/PDF; AI fills the fields.' },
        { q: 'Does AI scan store or remember my data? Is it safe?', a: 'The AI only reads the order and extracts the data — nothing else. It does not remember or store your data, because Anjaninex has full security in place. Your data is completely safe.' },
      ],
    },
    gujarati: {
      title: 'ઓર્ડર એન્ટ્રી (નવો ઓર્ડર)',
      intro: 'સપ્લાયરને મોકલેલ ઓર્ડર/PO અહીં બનાવો. Scan Order થી ઓટો-ફિલ પણ થાય.',
      steps: [
        'કંપની અને ઓર્ડર તારીખ પસંદ કરો (તારીખ આપમેળે આજની).',
        'સપ્લાયર શોધી પસંદ કરો (+ New નવા માટે).',
        'આઇટમ રો ભરો — જથ્થો, ભાવ, GST%.',
        'પેમેન્ટ ટર્મ્સ અને ટ્રાન્સપોર્ટર ભરી Submit Order.',
      ],
      faqs: [
        { q: 'ઓર્ડર નંબર ક્યાં', a: 'Order No સેવ કરતી વખતે આપમેળે બને છે.' },
        { q: 'AI સ્કેન મારો ડેટા યાદ રાખે છે? સુરક્ષિત છે?', a: 'AI ફક્ત ઓર્ડર વાંચીને ડેટા કાઢે છે — બસ, બીજું કંઈ નહીં. તે તમારો ડેટા યાદ કે સ્ટોર રાખતું નથી, કારણ કે Anjaninex એ પૂરી સિક્યુરિટી રાખી છે. તમારો ડેટા સંપૂર્ણ સુરક્ષિત છે.' },
      ],
    },
  },

  // ---------------- ORDERS LIST ----------------
  {
    match: '/trading/orders',
    hinglish: {
      title: 'Orders List',
      intro: 'Saare orders ki list — status, search aur new order.',
      steps: ['Date/party/status se filter karo.', 'Order par click karke detail dekho.', 'Naya order: "New Order".'],
      faqs: [{ q: 'pending order kaha', a: 'Status filter me "Pending" choose karo, ya Reports → Pending Orders dekho.' }],
    },
    english: {
      title: 'Orders List',
      intro: 'List of all orders — status, search and new order.',
      steps: ['Filter by date/party/status.', 'Click an order to view details.', 'New order: "New Order".'],
      faqs: [{ q: 'where are pending orders', a: 'Choose "Pending" in the status filter, or see Reports → Pending Orders.' }],
    },
    gujarati: {
      title: 'ઓર્ડર્સ યાદી',
      intro: 'બધા ઓર્ડરની યાદી — સ્ટેટસ, શોધ અને નવો ઓર્ડર.',
      steps: ['તારીખ/પાર્ટી/સ્ટેટસથી ફિલ્ટર કરો.', 'ઓર્ડર પર ક્લિક કરી વિગત જુઓ.', 'નવો ઓર્ડર: "New Order".'],
      faqs: [{ q: 'પેન્ડિંગ ઓર્ડર ક્યાં', a: 'સ્ટેટસ ફિલ્ટરમાં "Pending" પસંદ કરો.' }],
    },
  },

  // ---------------- PAYMENTS ----------------
  {
    match: '/trading/payments/new',
    hinglish: {
      title: 'Payment / Receipt Entry',
      intro: 'Party ko diya ya party se mila paisa yahan enter karte hain.',
      steps: ['Type chuno: Payment (diya) ya Receipt (mila).', 'Party select karo.', 'Amount aur mode (Cash/Bank/UPI) bharo.', 'Save dabao.'],
      faqs: [
        { q: 'payment aur receipt me fark', a: 'Payment = aapne party ko paisa diya. Receipt = party se paisa mila.' },
        { q: 'outstanding kam kaise ho', a: 'Receipt entry karne se us party ka outstanding kam ho jata hai.' },
      ],
    },
    english: {
      title: 'Payment / Receipt Entry',
      intro: 'Record money paid to or received from a party.',
      steps: ['Choose type: Payment (paid) or Receipt (received).', 'Select party.', 'Enter amount and mode (Cash/Bank/UPI).', 'Click Save.'],
      faqs: [
        { q: 'payment vs receipt', a: 'Payment = you paid the party. Receipt = you received from the party.' },
      ],
    },
    gujarati: {
      title: 'પેમેન્ટ / રસીદ એન્ટ્રી',
      intro: 'પાર્ટીને આપેલ કે પાર્ટી પાસેથી મળેલ પૈસા અહીં દાખલ કરો.',
      steps: ['પ્રકાર પસંદ કરો: Payment (આપ્યા) કે Receipt (મળ્યા).', 'પાર્ટી પસંદ કરો.', 'રકમ અને મોડ (Cash/Bank/UPI) ભરો.', 'Save દબાવો.'],
      faqs: [{ q: 'payment અને receipt ફરક', a: 'Payment = તમે પાર્ટીને પૈસા આપ્યા. Receipt = પાર્ટી પાસેથી મળ્યા.' }],
    },
  },
  {
    match: '/trading/payments',
    hinglish: { title: 'Payments List', intro: 'Saare payment/receipt entries ki list.', steps: ['Date/party se filter karo.', 'Entry par click karke detail/print.'], faqs: [{ q: 'receipt print', a: 'Entry par click karke print option choose karo.' }] },
    english: { title: 'Payments List', intro: 'List of all payment/receipt entries.', steps: ['Filter by date/party.', 'Click an entry to view/print.'], faqs: [{ q: 'print receipt', a: 'Click the entry and choose print.' }] },
    gujarati: { title: 'પેમેન્ટ યાદી', intro: 'બધી પેમેન્ટ/રસીદ એન્ટ્રીની યાદી.', steps: ['તારીખ/પાર્ટીથી ફિલ્ટર.', 'એન્ટ્રી પર ક્લિક કરી પ્રિન્ટ.'], faqs: [{ q: 'રસીદ પ્રિન્ટ', a: 'એન્ટ્રી પર ક્લિક કરી પ્રિન્ટ પસંદ કરો.' }] },
  },

  // ---------------- GOODS RETURN ----------------
  {
    match: '/trading/gr',
    hinglish: {
      title: 'Goods Return (GR)',
      intro: 'Bill ka maal wapas karna ho to GR banate hain — original bill se link hota hai.',
      steps: ['"Select Original Bill" se jis bill ka return hai wo chuno.', 'Wapas hone wale items/qty bharo.', 'Save karo — return amount calculate ho jayega.'],
      faqs: [
        { q: 'original bill select nahi ho raha', a: 'Pehle supplier select karo, phir us supplier ke bills list me se original bill chuno.' },
        { q: 'gr kya hai', a: 'GR (Goods Return) = kharida hua maal supplier ko wapas karna.' },
      ],
    },
    english: {
      title: 'Goods Return (GR)',
      intro: 'Create a GR to return goods from a bill — it links to the original bill.',
      steps: ['Use "Select Original Bill" to pick the bill being returned.', 'Enter returned items/qty.', 'Save — return amount is calculated.'],
      faqs: [
        { q: 'cannot select original bill', a: 'Select the supplier first, then choose the original bill from that supplier\'s list.' },
        { q: 'what is gr', a: 'GR (Goods Return) = returning purchased goods to the supplier.' },
      ],
    },
    gujarati: {
      title: 'ગુડ્સ રિટર્ન (GR)',
      intro: 'બિલનો માલ પાછો કરવો હોય તો GR બનાવો — ઓરિજિનલ બિલ સાથે લિંક થાય.',
      steps: ['"Select Original Bill" થી જે બિલનું રિટર્ન છે તે પસંદ કરો.', 'પાછા આવતા આઇટમ/જથ્થો ભરો.', 'Save કરો — રિટર્ન રકમ ગણાઈ જશે.'],
      faqs: [{ q: 'ઓરિજિનલ બિલ પસંદ થતું નથી', a: 'પહેલા સપ્લાયર પસંદ કરો, પછી તે સપ્લાયરના બિલમાંથી પસંદ કરો.' }],
    },
  },

  // ---------------- COMMISSION ----------------
  {
    match: '/trading/commission',
    hinglish: {
      title: 'Commission',
      intro: 'Broker/dalali commission invoices yahan banate aur dekhte hain.',
      steps: ['"Generate" se naya commission invoice banao.', 'Supplier/party aur rate choose karo.', 'Invoice save aur print karo.'],
      faqs: [{ q: 'commission kaise banaye', a: 'Commission → Generate, party aur rate daal ke invoice banao.' }],
    },
    english: {
      title: 'Commission',
      intro: 'Create and view broker commission invoices here.',
      steps: ['Use "Generate" to make a new commission invoice.', 'Choose supplier/party and rate.', 'Save and print the invoice.'],
      faqs: [{ q: 'how to make commission', a: 'Commission → Generate, enter party and rate to create the invoice.' }],
    },
    gujarati: {
      title: 'કમિશન',
      intro: 'દલાલી કમિશન ઇન્વોઇસ અહીં બનાવો અને જુઓ.',
      steps: ['"Generate" થી નવું કમિશન ઇન્વોઇસ બનાવો.', 'પાર્ટી અને રેટ પસંદ કરો.', 'ઇન્વોઇસ સેવ અને પ્રિન્ટ કરો.'],
      faqs: [{ q: 'કમિશન કેવી રીતે', a: 'Commission → Generate, પાર્ટી અને રેટ નાખી ઇન્વોઇસ બનાવો.' }],
    },
  },

  // ---------------- PARTIES ----------------
  {
    match: '/trading/parties',
    hinglish: {
      title: 'Parties (Supplier/Buyer)',
      intro: 'Aapke supplier aur buyer ki master list. Yahan add/edit karte hain.',
      steps: ['"+ New" se nayi party add karo.', 'Naam, GST, phone, address bharo.', 'GST/phone duplicate ho to system warn karega.'],
      faqs: [
        { q: 'nayi party kaise add kare', a: '"+ New" dabao, naam/GST/phone bharo aur save karo.' },
        { q: 'party duplicate', a: 'Same GST ya phone par party pehle se ho to system rok dega — existing use karo.' },
      ],
    },
    english: {
      title: 'Parties (Supplier/Buyer)',
      intro: 'Master list of your suppliers and buyers. Add/edit here.',
      steps: ['Use "+ New" to add a party.', 'Fill name, GST, phone, address.', 'System warns on duplicate GST/phone.'],
      faqs: [
        { q: 'how to add a party', a: 'Click "+ New", fill name/GST/phone and save.' },
      ],
    },
    gujarati: {
      title: 'પાર્ટીઓ (સપ્લાયર/બાયર)',
      intro: 'તમારા સપ્લાયર અને બાયરની માસ્ટર યાદી. અહીં ઉમેરો/એડિટ કરો.',
      steps: ['"+ New" થી નવી પાર્ટી ઉમેરો.', 'નામ, GST, ફોન, સરનામું ભરો.', 'GST/ફોન ડુપ્લિકેટ હોય તો સિસ્ટમ ચેતવશે.'],
      faqs: [{ q: 'નવી પાર્ટી કેવી રીતે', a: '"+ New" દબાવો, નામ/GST/ફોન ભરી સેવ કરો.' }],
    },
  },

  // ---------------- ITEMS ----------------
  {
    match: '/trading/items',
    hinglish: { title: 'Items', intro: 'Aapke product/item ki master list (naam, HSN, GST%).', steps: ['"+ New" se item add karo.', 'Naam, HSN, default rate, GST% bharo.'], faqs: [{ q: 'item add', a: '"+ New" se naam, HSN aur GST% daal ke item banao.' }] },
    english: { title: 'Items', intro: 'Master list of your products/items (name, HSN, GST%).', steps: ['Use "+ New" to add an item.', 'Fill name, HSN, default rate, GST%.'], faqs: [{ q: 'add item', a: 'Use "+ New" to add name, HSN and GST%.' }] },
    gujarati: { title: 'આઇટમ્સ', intro: 'તમારા પ્રોડક્ટ/આઇટમની માસ્ટર યાદી (નામ, HSN, GST%).', steps: ['"+ New" થી આઇટમ ઉમેરો.', 'નામ, HSN, ભાવ, GST% ભરો.'], faqs: [{ q: 'આઇટમ ઉમેરો', a: '"+ New" થી નામ, HSN અને GST% નાખો.' }] },
  },

  // ---------------- SUPPLIERS DIRECTORY (AD) ----------------
  {
    match: '/suppliers',
    hinglish: {
      title: 'Supplier Directory (Active Directory)',
      intro: 'Suppliers aur buyers ki detailed directory — catalog, varieties, photos, appointments.',
      steps: ['List me supplier dhundo ya "+ New" se add karo.', 'Supplier me product varieties, rate aur photo add karo.', 'Buyers, Appointments aur Match alag tabs me hain.'],
      faqs: [
        { q: 'supplier ka catalog kaha', a: 'Supplier kholo → uske andar varieties/rate/photo add kar sakte ho.' },
        { q: 'buyer kaha hai', a: 'Sidebar/menu me Buyers section me jao.' },
      ],
    },
    english: {
      title: 'Supplier Directory (Active Directory)',
      intro: 'Detailed directory of suppliers and buyers — catalog, varieties, photos, appointments.',
      steps: ['Find a supplier or add via "+ New".', 'Add product varieties, rates and photos inside a supplier.', 'Buyers, Appointments and Match are separate tabs.'],
      faqs: [
        { q: 'where is supplier catalog', a: 'Open a supplier → add varieties/rate/photo inside.' },
      ],
    },
    gujarati: {
      title: 'સપ્લાયર ડિરેક્ટરી',
      intro: 'સપ્લાયર અને બાયરની વિગતવાર ડિરેક્ટરી — કેટલોગ, વેરાયટી, ફોટા, એપોઇન્ટમેન્ટ.',
      steps: ['સપ્લાયર શોધો કે "+ New" થી ઉમેરો.', 'સપ્લાયરમાં વેરાયટી, રેટ અને ફોટા ઉમેરો.', 'Buyers, Appointments અને Match અલગ ટેબમાં છે.'],
      faqs: [{ q: 'સપ્લાયર કેટલોગ ક્યાં', a: 'સપ્લાયર ખોલો → અંદર વેરાયટી/રેટ/ફોટા ઉમેરો.' }],
    },
  },

  // ---------------- REPORTS ----------------
  {
    match: '/reports',
    hinglish: {
      title: 'Reports',
      intro: 'Business ke saare reports — sales, outstanding, GST, top parties/items, pending orders.',
      steps: ['Left list se report chuno.', 'Upar date range/filter laga ke data dekho.', 'Export/print bhi kar sakte ho.'],
      faqs: [
        { q: 'gst report', a: 'Reports → GST me CGST/SGST/IGST summary milega.' },
        { q: 'outstanding report', a: 'Reports → Outstanding ya Party Outstanding me kaun kitna baaki hai dikhega.' },
        { q: 'sales report', a: 'Reports → Sales Register me saara sales data milega.' },
      ],
    },
    english: {
      title: 'Reports',
      intro: 'All business reports — sales, outstanding, GST, top parties/items, pending orders.',
      steps: ['Pick a report from the left.', 'Apply date range/filters on top.', 'Export/print as needed.'],
      faqs: [
        { q: 'gst report', a: 'Reports → GST shows the CGST/SGST/IGST summary.' },
        { q: 'outstanding report', a: 'Reports → Outstanding or Party Outstanding shows who owes how much.' },
      ],
    },
    gujarati: {
      title: 'રિપોર્ટ્સ',
      intro: 'બધા બિઝનેસ રિપોર્ટ — વેચાણ, બાકી, GST, ટોપ પાર્ટી/આઇટમ, પેન્ડિંગ ઓર્ડર.',
      steps: ['ડાબી યાદીમાંથી રિપોર્ટ પસંદ કરો.', 'ઉપર તારીખ/ફિલ્ટર લગાવો.', 'એક્સપોર્ટ/પ્રિન્ટ કરી શકો.'],
      faqs: [
        { q: 'GST રિપોર્ટ', a: 'Reports → GST માં CGST/SGST/IGST સારાંશ મળશે.' },
        { q: 'બાકી રિપોર્ટ', a: 'Reports → Outstanding માં કોણ કેટલું બાકી છે તે દેખાશે.' },
      ],
    },
  },

  // ---------------- ACCOUNTING: VOUCHERS ----------------
  {
    match: '/accounting/vouchers',
    hinglish: {
      title: 'Voucher Entry',
      intro: 'Accounting vouchers — payment, receipt, contra, journal.',
      steps: ['Voucher type chuno.', 'Debit/Credit accounts aur amount bharo (dono barabar hone chahiye).', 'Save karo.'],
      faqs: [{ q: 'journal voucher', a: 'Journal voucher me debit aur credit dono accounts manually choose karte hain.' }, { q: 'debit credit barabar nahi', a: 'Voucher tabhi save hoga jab total debit = total credit ho.' }],
    },
    english: {
      title: 'Voucher Entry',
      intro: 'Accounting vouchers — payment, receipt, contra, journal.',
      steps: ['Choose voucher type.', 'Enter debit/credit accounts and amount (must balance).', 'Save.'],
      faqs: [{ q: 'journal voucher', a: 'In a journal voucher you choose debit and credit accounts manually.' }, { q: 'debit credit not equal', a: 'A voucher saves only when total debit = total credit.' }],
    },
    gujarati: {
      title: 'વાઉચર એન્ટ્રી',
      intro: 'એકાઉન્ટિંગ વાઉચર — પેમેન્ટ, રસીદ, કોન્ટ્રા, જર્નલ.',
      steps: ['વાઉચર પ્રકાર પસંદ કરો.', 'ડેબિટ/ક્રેડિટ એકાઉન્ટ અને રકમ ભરો (સરખા હોવા જોઈએ).', 'Save કરો.'],
      faqs: [{ q: 'જર્નલ વાઉચર', a: 'જર્નલમાં ડેબિટ અને ક્રેડિટ બંને એકાઉન્ટ જાતે પસંદ કરો.' }],
    },
  },

  // ---------------- ACCOUNTING: LEDGERS ----------------
  {
    match: '/accounting/ledgers',
    hinglish: { title: 'Ledgers', intro: 'Har account/party ka ledger — debit, credit aur balance.', steps: ['Account/party chuno.', 'Date range laga ke entries dekho.', 'Balance niche dikhega.'], faqs: [{ q: 'party ka ledger', a: 'Ledgers me party choose karke uske saare lene-den dekho.' }] },
    english: { title: 'Ledgers', intro: 'Ledger for each account/party — debit, credit and balance.', steps: ['Choose account/party.', 'Set date range to view entries.', 'Balance shows at the bottom.'], faqs: [{ q: 'party ledger', a: 'In Ledgers, pick the party to see all its transactions.' }] },
    gujarati: { title: 'ખાતાવહી', intro: 'દરેક એકાઉન્ટ/પાર્ટીની ખાતાવહી — ડેબિટ, ક્રેડિટ, બેલેન્સ.', steps: ['એકાઉન્ટ/પાર્ટી પસંદ કરો.', 'તારીખ રેન્જ લગાવી એન્ટ્રી જુઓ.', 'બેલેન્સ નીચે દેખાશે.'], faqs: [{ q: 'પાર્ટી ખાતાવહી', a: 'Ledgers માં પાર્ટી પસંદ કરી બધા વ્યવહાર જુઓ.' }] },
  },

  // ---------------- WALLET ----------------
  {
    match: '/wallet',
    hinglish: {
      title: 'Wallet & Plan',
      intro: 'Aapka plan, balance aur AI scan usage. Recharge bhi yahan se.',
      steps: ['Current plan aur baaki din dekho.', 'AI scan kitne use hue ye dikhta hai.', 'Recharge ke liye button dabao (UPI/Bank).'],
      faqs: [
        { q: 'recharge kaise kare', a: 'Wallet page par Recharge button se UPI/Bank se payment karo.' },
        { q: 'plan kaisa hai', a: 'Wallet par current plan, validity aur limits dikhte hain.' },
      ],
    },
    english: {
      title: 'Wallet & Plan',
      intro: 'Your plan, balance and AI scan usage. Recharge here too.',
      steps: ['See current plan and days left.', 'View AI scans used.', 'Click recharge (UPI/Bank).'],
      faqs: [
        { q: 'how to recharge', a: 'On the Wallet page, use the Recharge button (UPI/Bank).' },
      ],
    },
    gujarati: {
      title: 'વોલેટ અને પ્લાન',
      intro: 'તમારો પ્લાન, બેલેન્સ અને AI સ્કેન વપરાશ. રિચાર્જ પણ અહીંથી.',
      steps: ['હાલનો પ્લાન અને બાકી દિવસ જુઓ.', 'AI સ્કેન કેટલા વપરાયા તે જુઓ.', 'રિચાર્જ માટે બટન દબાવો (UPI/Bank).'],
      faqs: [{ q: 'રિચાર્જ કેવી રીતે', a: 'વોલેટ પેજ પર Recharge બટનથી UPI/Bank.' }],
    },
  },

  // ---------------- TRANSPORTERS ----------------
  {
    match: '/masters/transporters',
    hinglish: {
      title: 'Transport Master',
      intro: 'Transporter list — naam, GST, mobile. CSV se bulk import bhi.',
      steps: ['"+ New" se transporter add karo.', 'Bulk ke liye CSV Import use karo.', 'Bill/Order me transporter yahan se aata hai.'],
      faqs: [
        { q: 'csv import kaise', a: 'Transport Master me Import button se CSV upload karo — naam, mobile, GST apne aap aa jayenge.' },
        { q: 'transporter sab firm me same', a: 'Nahi, har firm ka apna transporter list hota hai (alag-alag).' },
      ],
    },
    english: {
      title: 'Transport Master',
      intro: 'Transporter list — name, GST, mobile. Bulk CSV import too.',
      steps: ['Add via "+ New".', 'Use CSV Import for bulk.', 'Bills/Orders pick the transporter from here.'],
      faqs: [
        { q: 'how to csv import', a: 'Use the Import button to upload a CSV — name, mobile, GST are read automatically.' },
      ],
    },
    gujarati: {
      title: 'ટ્રાન્સપોર્ટ માસ્ટર',
      intro: 'ટ્રાન્સપોર્ટર યાદી — નામ, GST, મોબાઇલ. CSV થી બલ્ક ઇમ્પોર્ટ પણ.',
      steps: ['"+ New" થી ઉમેરો.', 'બલ્ક માટે CSV Import વાપરો.', 'બિલ/ઓર્ડરમાં ટ્રાન્સપોર્ટર અહીંથી આવે.'],
      faqs: [{ q: 'CSV ઇમ્પોર્ટ', a: 'Import બટનથી CSV અપલોડ કરો — નામ, મોબાઇલ, GST આપમેળે આવશે.' }],
    },
  },

  // ---------------- CORE MASTER ----------------
  {
    match: '/core-master',
    hinglish: {
      title: 'Core Master',
      intro: 'Saare contacts (Trading + AD + HR) ek jagah. Common data yahan se badlo — sab jagah update hoga.',
      steps: ['Contact dhundo aur kholo.', 'Naam, phone, WhatsApp, GST common fields badlo.', 'Save — har module me reflect hoga.'],
      faqs: [{ q: 'core master kya hai', a: 'Core Master = ek hi jagah se contact ka common data manage karna, jo Trading/AD/HR sab me same rehta hai.' }],
    },
    english: {
      title: 'Core Master',
      intro: 'All contacts (Trading + AD + HR) in one place. Edit common data here — updates everywhere.',
      steps: ['Find and open a contact.', 'Edit name, phone, WhatsApp, GST common fields.', 'Save — reflects in every module.'],
      faqs: [{ q: 'what is core master', a: 'Core Master manages a contact\'s common data from one place, shared across Trading/AD/HR.' }],
    },
    gujarati: {
      title: 'કોર માસ્ટર',
      intro: 'બધા સંપર્કો (Trading + AD + HR) એક જગ્યાએ. કોમન ડેટા અહીંથી બદલો — બધે અપડેટ થશે.',
      steps: ['સંપર્ક શોધી ખોલો.', 'નામ, ફોન, WhatsApp, GST બદલો.', 'Save — દરેક મોડ્યુલમાં દેખાશે.'],
      faqs: [{ q: 'કોર માસ્ટર શું', a: 'એક જ જગ્યાએથી સંપર્કનો કોમન ડેટા મેનેજ કરવો, જે બધે સરખો રહે.' }],
    },
  },

  // ---------------- TEAM & SECURITY ----------------
  {
    match: '/team',
    hinglish: {
      title: 'Team & Security',
      intro: 'Branches, users (staff logins), roles aur permissions yahan manage karo.',
      steps: ['Branch add/edit karo.', 'Staff ko login (user) do aur role choose karo.', 'Role me permissions set karo (kaun kya kar sake).'],
      faqs: [{ q: 'naya user kaise', a: 'Team → Users me "+ New" se staff ka login banao aur role do.' }, { q: 'permission kaise', a: 'Roles me jaake har role ki permissions on/off karo.' }],
    },
    english: {
      title: 'Team & Security',
      intro: 'Manage branches, users (staff logins), roles and permissions here.',
      steps: ['Add/edit branches.', 'Give staff a login (user) and pick a role.', 'Set permissions in roles (who can do what).'],
      faqs: [{ q: 'how to add a user', a: 'Team → Users → "+ New" to create a staff login and assign a role.' }],
    },
    gujarati: {
      title: 'ટીમ અને સિક્યુરિટી',
      intro: 'બ્રાન્ચ, યુઝર (સ્ટાફ લોગિન), રોલ અને પરમિશન અહીં મેનેજ કરો.',
      steps: ['બ્રાન્ચ ઉમેરો/એડિટ કરો.', 'સ્ટાફને લોગિન આપો અને રોલ પસંદ કરો.', 'રોલમાં પરમિશન સેટ કરો.'],
      faqs: [{ q: 'નવો યુઝર', a: 'Team → Users → "+ New" થી સ્ટાફ લોગિન બનાવો.' }],
    },
  },
];

// Generic fallback when a page has no specific entry yet.
export const GENERIC_HELP: HelpEntry = {
  match: '',
  hinglish: {
    title: 'Madad',
    intro: 'Is page par koi cheez samajh na aaye to neeche common madad dekho ya mic se sawaal pucho.',
    steps: [
      'List pages me upar filter/search hota hai.',
      'Naya record banane ke liye "+ New" type button dhundo.',
      'Kisi row par click karke detail/edit kholo.',
      'Sidebar se doosre module me jao.',
    ],
    faqs: [
      { q: 'naya kaise banau', a: 'Page ke upar dayi taraf "+ New" ya "Add" button hota hai, usse naya record banao.' },
      { q: 'search kaise', a: 'Page ke upar search box ya filter se dhundo.' },
      { q: 'bill kaise banau', a: 'Trading → Bills → New Bill Entry par jao.' },
      { q: 'AI scan mera data yaad rakhta hai? safe hai?', a: 'AI sirf bill/order ko padh kar data extract karta hai — bus, aur kuch nahi karta. Wo aapka data yaad ya store nahi rakhta, kyunki Anjaninex ne poori security laga rakhi hai. Aapka data bilkul safe hai.' },
    ],
  },
  english: {
    title: 'Help',
    intro: 'If something on this page is unclear, see the common help below or ask via mic.',
    steps: [
      'List pages have filter/search on top.',
      'Look for a "+ New"-style button to add a record.',
      'Click a row to open detail/edit.',
      'Use the sidebar to switch modules.',
    ],
    faqs: [
      { q: 'how to add new', a: 'There is usually a "+ New" or "Add" button at the top right.' },
      { q: 'how to search', a: 'Use the search box or filter at the top of the page.' },
      { q: 'Does AI scan store or remember my data? Is it safe?', a: 'The AI only reads the bill/order and extracts the data — nothing else. It does not remember or store your data, because Anjaninex has full security in place. Your data is completely safe.' },
    ],
  },
  gujarati: {
    title: 'મદદ',
    intro: 'આ પેજ પર કંઈ સમજાય નહીં તો નીચે સામાન્ય મદદ જુઓ કે માઇકથી પૂછો.',
    steps: [
      'યાદી પેજ પર ઉપર ફિલ્ટર/શોધ હોય છે.',
      'નવો રેકોર્ડ બનાવવા "+ New" બટન શોધો.',
      'કોઈ રો પર ક્લિક કરી વિગત/એડિટ ખોલો.',
      'સાઇડબારથી બીજા મોડ્યુલમાં જાઓ.',
    ],
    faqs: [
      { q: 'નવું કેવી રીતે', a: 'પેજની ઉપર જમણે "+ New" કે "Add" બટન હોય છે.' },
      { q: 'શોધ કેવી રીતે', a: 'પેજની ઉપર સર્ચ બોક્સ કે ફિલ્ટર વાપરો.' },
      { q: 'AI સ્કેન મારો ડેટા યાદ રાખે છે? સુરક્ષિત છે?', a: 'AI ફક્ત બિલ/ઓર્ડર વાંચીને ડેટા કાઢે છે — બસ, બીજું કંઈ નહીં. તે તમારો ડેટા યાદ કે સ્ટોર રાખતું નથી, કારણ કે Anjaninex એ પૂરી સિક્યુરિટી રાખી છે. તમારો ડેટા સંપૂર્ણ સુરક્ષિત છે.' },
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
