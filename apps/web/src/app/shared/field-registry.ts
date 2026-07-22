// =============================================================================
// FIELD REGISTRY — har screen ke fields ka catalog
// =============================================================================
// Har firm ki apni zarurat hoti hai: kisi ko "Incentive %" chahiye, kisi ko
// nahi; koi "Sub Agent" ko "Dalal" bolta hai. Pehle har farmaish par code
// badalna + deploy karna padta tha. Ab ye catalog aur firm ki settings mil kar
// screen banate hain.
//
// NAYA FIELD JODNA:
//   1. Yahan ek line jodo (defaultOff: true rakhna — kisi ki screen achanak
//      na badle; jisko chahiye wo Settings se on kar lega)
//   2. Us field ke div par  *fld="'screen.key'"  laga do
//   Bas. Uska tick har firm ke Settings page me apne aap aa jayega.
// =============================================================================

export interface FieldDef {
  /** screen ke andar unique — DB me yahi jata hai, isliye badalna mat */
  key: string;
  /** default naam; firm apna naam rakh sakti hai */
  label: string;
  /** band nahi ho sakta — iske bina screen ka matlab hi nahi rehta */
  locked?: boolean;
  /** shuru me band (jisko chahiye wo on karega) */
  defaultOff?: boolean;
  /** shuru se hi "zaroori" (required) */
  defaultRequired?: boolean;
  /** Settings page me chhota sa samjhane wala note */
  hint?: string;
}

export interface ScreenDef {
  /** DB me jata hai — badalna mat */
  key: string;
  /** Settings page me dikhne wala naam */
  name: string;
  /** poori screen band ho sakti hai ya nahi (Master menu se gayab) */
  canDisable?: boolean;
  fields: FieldDef[];
}

export const FIELD_REGISTRY: ScreenDef[] = [
  // ---------------------------------------------------------------------------
  // BILL ENTRY — Trading › Bill › New/Edit
  // Hisaab wale fields (CD, Disc, Fold, TCS...) chhupane par unki value 0 maani
  // jati hai — NET AMT ka hisaab sahi rehta hai, bas wo kat-kut nahi lagti.
  // Computed fields (GROSS/TAXABLE/NET) locked hain. % + Amount ki jodi ek tick.
  // ---------------------------------------------------------------------------
  {
    key: 'bill_entry',
    name: 'Bill Entry',
    fields: [
      { key: 'entry_date',      label: 'Entry Date',        hint: 'Auto — aaj ki date' },
      { key: 'supplier_info',   label: 'Supplier GSTIN/PAN/Address box', hint: 'Supplier chunne par info box' },
      { key: 'buyer_info',      label: 'Buyer GSTIN/PAN/Address box' },
      { key: 'case_parcel',     label: 'Case/Parcel/Bale' },
      { key: 'cd',              label: 'CD % + Amount' },
      { key: 'normal_disc',     label: 'Normal Disc % + Amount' },
      { key: 'exhibition_disc', label: 'Exhibition Disc % + Amount', defaultOff: true },
      { key: 'sweet_ls',        label: 'Sweet / L.S',       defaultOff: true },
      { key: 'fold',            label: 'Fold Less % + Amount', defaultOff: true, hint: 'Textile — gross se less' },
      { key: 'bank_charge',     label: 'Bank Charge',       defaultOff: true },
      { key: 'interest',        label: 'Interest Amt',      defaultOff: true },
      { key: 'insurance',       label: 'Insurance',         defaultOff: true },
      { key: 'payment_terms',   label: 'Payment Terms' },
      { key: 'tcs',             label: 'TCS Amt',           defaultOff: true },
      { key: 'order_status',    label: 'Order Status' },
      { key: 'transporter_info',label: 'Transporter GST/Mobile' },
      { key: 'lr_date',         label: 'LR Date' },
      { key: 'eway',            label: 'E-Way Bill No + Date' },
      { key: 'remark',          label: 'Remark' }
    ]
  },
  // ---------------------------------------------------------------------------
  // ORDER ENTRY — Trading › Order › New/Edit
  // ---------------------------------------------------------------------------
  {
    key: 'order_entry',
    name: 'Order Entry',
    fields: [
      { key: 'supplier_info',   label: 'Supplier GSTIN/PAN/Address box' },
      { key: 'buyer_info',      label: 'Buyer GSTIN/PAN/Address box' },
      { key: 'cd',              label: 'CD % + Amount' },
      { key: 'normal_disc',     label: 'Normal Disc % + Amount' },
      { key: 'exhibition_disc', label: 'Exhibition Disc % + Amount', defaultOff: true },
      { key: 'supplier_order_no', label: 'Supplier Order No.' },
      { key: 'supplier_group',  label: 'Supplier Group',    defaultOff: true, hint: 'Firm pakki na ho to group' },
      { key: 'transporter',     label: 'Transporter' },
      { key: 'transporter_info',label: 'Transporter GST/Mobile' },
      { key: 'order_status',    label: 'Order Status' },
      { key: 'remark',          label: 'Remark' },
      { key: 'insurance',       label: 'Insurance',         defaultOff: true }
    ]
  },
  // ---------------------------------------------------------------------------
  // PAYMENT / RECEIPT — Trading › Payment › New Receipt (bills wali table ke columns)
  // Column chhupane par uski value 0 rehti hai — NET AMT ka hisaab sahi banta hai,
  // bas wo kat-kut lagti nahi. GROSS/TAX/NET/PENDING jaise core columns lock hain
  // (registry me hain hi nahi, isliye kabhi nahi chhupenge).
  // ---------------------------------------------------------------------------
  {
    key: 'payment_receipt',
    name: 'Payment / Receipt',
    fields: [
      { key: 'rate_diff', label: 'Rate Diff column' },
      { key: 'dis',       label: 'DIS% + DIS AMT columns' },
      { key: 'interest',  label: 'Interest column',  defaultOff: true },
      { key: 'adj_amt',   label: 'ADJ AMT column',   defaultOff: true },
      { key: 'packing',   label: 'Packing column' },
      { key: 'other',     label: 'Other column',     defaultOff: true },
      { key: 'gst_mode',  label: 'Before/After GST toggle', hint: 'Kat-kut GST se pehle ya baad' },
      { key: 'comm_amt',  label: 'Comm Amt column' },
      { key: 'timing',    label: 'Pay Terms / Due Date / Early-Late columns', hint: 'Payment LATE aayi ya JALDI wala hisaab' }
    ]
  },
  // ---------------------------------------------------------------------------
  // GR ENTRY — Trading › GR › New (goods return)
  // ---------------------------------------------------------------------------
  {
    key: 'gr_entry',
    name: 'GR Entry (Goods Return)',
    fields: [
      { key: 'transport',   label: 'Transport Name' },
      { key: 'lr_no',       label: 'Transport / LR No.' },
      { key: 'remark',      label: 'Remark / Note' },
      { key: 'effect_mode', label: 'GR Effect on Bill', hint: 'Direct adjustment ya credit note' }
    ]
  },
  // ---------------------------------------------------------------------------
  // COMMISSION GENERATE — Trading › Commission › Generate
  // ---------------------------------------------------------------------------
  {
    key: 'commission_generate',
    name: 'Commission Generate',
    fields: [
      { key: 'buyer_filter', label: 'Buyer filter', hint: 'Sirf ek buyer ke bills par commission' },
      { key: 'gst_pct',      label: 'GST %' },
      { key: 'invoice_date', label: 'Invoice Date' }
    ]
  },
  // ---------------------------------------------------------------------------
  // PARTY MASTER — Trading › Master › Parties (new/edit form)
  // Naam/GST/Mobile/City jaise pehchan wale field locked hain — inke bina party
  // ka record hi adhoora hai. Baaki sab firm apni marzi se on/off kare.
  // ---------------------------------------------------------------------------
  {
    key: 'party_master',
    name: 'Party Master',
    fields: [
      { key: 'gstin',           label: 'GSTIN' },
      { key: 'pan',             label: 'PAN Number',        defaultOff: true },
      { key: 'wa_supplier',     label: 'WhatsApp – Supplier' },
      { key: 'wa_buyer',        label: 'WhatsApp – Buyer' },
      { key: 'group',           label: 'Group (Sister Firms)' },
      { key: 'purchase_disc',   label: 'Purchase Disc %',   hint: 'Supplier ka committed disc' },
      { key: 'supplier_type',   label: 'Supplier Type' },
      { key: 'buyer_type',      label: 'Buyer Type' },
      { key: 'wa_extra_role',   label: 'Extra WA – Role',   defaultOff: true },
      { key: 'wa_extra',        label: 'WhatsApp – Extra',  defaultOff: true },
      { key: 'udyam',           label: 'Udyam Aadhaar No',  defaultOff: true },
      { key: 'msme_type',       label: 'MSME Type',         defaultOff: true },
      { key: 'buyer_agent',     label: 'Buyer Agent',       defaultOff: true, hint: 'Payment guarantee wala agent' },
      { key: 'agent_share_pct', label: 'Agent Share %',     defaultOff: true },
      { key: 'sub_agent',       label: 'Sub Agent',         defaultOff: true },
      { key: 'sub_agent_pct',   label: 'Sub Agent %',       defaultOff: true },
      { key: 'incentive_pct',   label: 'Incentive %',       defaultOff: true, hint: 'Kuch firms deti hain, kuch nahi' },
      { key: 'address',         label: 'Address' },
      { key: 'pincode',         label: 'Pin Code',          hint: 'City/State apne aap bhar jate hain' },
      { key: 'email',           label: 'Email',             defaultOff: true },
      { key: 'branch',          label: 'Branch' },
      { key: 'contact_person',  label: 'Contact Person',    defaultOff: true },
      { key: 'contact_mobile',  label: 'Contact Mobile',    defaultOff: true },
      { key: 'landline',        label: 'Office / Landline', defaultOff: true },
      { key: 'rating',          label: 'Rating',            defaultOff: true },
      { key: 'stars',           label: 'Stars (1-5)',       defaultOff: true },
      { key: 'avg_pay_days',    label: 'Avg Pay Days (Buyer)', defaultOff: true },
      { key: 'return_rate',     label: 'Return Rate %',     defaultOff: true },
      { key: 'commission_pct',  label: 'Commission %' },
      { key: 'flag_note',       label: 'Flag / Special Note', defaultOff: true },
      { key: 'discounts',       label: 'Discounts % (Normal/Special/Exhibition)' },
      { key: 'credit_limit',    label: 'Credit Limit (₹)' },
      { key: 'credit_days',     label: 'Credit Days' },
      { key: 'opening_balance', label: 'Opening Balance' }
    ]
  },
  // ---------------------------------------------------------------------------
  // GROUP MASTER (Sister Firms) — Core Master › Group Master
  // ---------------------------------------------------------------------------
  {
    key: 'group_master',
    name: 'Group Master (Sister Firms)',
    canDisable: true,
    fields: [
      { key: 'owner_name',      label: 'Owner Name',      locked: true },
      { key: 'mobile',          label: 'Mobile No',       locked: true },
      { key: 'whatsapp',        label: 'WhatsApp No' },
      { key: 'party_type',      label: 'Party Type',      locked: true },
      { key: 'buyer_type',      label: 'Buyer Type' },
      { key: 'address1',        label: 'Address 1' },
      { key: 'address2',        label: 'Address 2',       defaultOff: true, hint: 'Godown / branch ka pata' },
      { key: 'pincode',         label: 'Pincode',         hint: 'City/State apne aap bhar jate hain' },
      { key: 'city',            label: 'City' },
      { key: 'state',           label: 'State' },
      { key: 'commission_pct',  label: 'Commission %' },
      { key: 'payment_terms',   label: 'Payment Terms' },
      { key: 'purchase_disc',   label: 'Purchase Disc %', hint: 'Supplier ka committed disc' },
      { key: 'normal_disc',     label: 'Normal Disc %' },
      { key: 'special_disc',    label: 'Special Disc %',  defaultOff: true },
      { key: 'exhibition_disc', label: 'Exhibition Disc %', defaultOff: true, hint: 'Mele ke dinon ka alag disc' },
      { key: 'exhibition_from', label: 'Exhibition From', defaultOff: true },
      { key: 'exhibition_to',   label: 'Exhibition To',   defaultOff: true },
      { key: 'credit_limit',    label: 'Credit Limit (₹)' },
      { key: 'credit_days',     label: 'Credit Days' },
      { key: 'supplier_type',   label: 'Supplier Type' },
      { key: 'email',           label: 'Email',           defaultOff: true },
      { key: 'wa_supplier',     label: 'WhatsApp — Supplier', defaultOff: true },
      { key: 'wa_buyer',        label: 'WhatsApp — Buyer',    defaultOff: true },
      { key: 'wa_extra',        label: 'Extra WhatsApp',      defaultOff: true },
      { key: 'wa_extra_role',   label: 'Extra WA — Role',     defaultOff: true },
      { key: 'sub_agent',       label: 'Sub Agent',       defaultOff: true, hint: 'Beech ka dalal' },
      { key: 'sub_agent_pct',   label: 'Sub Agent %',     defaultOff: true },
      { key: 'incentive_pct',   label: 'Incentive %',     defaultOff: true, hint: 'Kuch firms deti hain, kuch nahi' },
      { key: 'agent_share_pct', label: 'Agent Share %',   defaultOff: true }
    ]
  }
];

/** screen key → ScreenDef */
export const SCREEN_BY_KEY = new Map(FIELD_REGISTRY.map(s => [s.key, s]));

/** 'group_master.incentive_pct' → { screen, field } */
export function splitFieldPath(path: string): { screen: string; field: string } {
  const i = path.indexOf('.');
  return i < 0
    ? { screen: '', field: path }
    : { screen: path.slice(0, i), field: path.slice(i + 1) };
}

export function findField(screen: string, field: string): FieldDef | undefined {
  return SCREEN_BY_KEY.get(screen)?.fields.find(f => f.key === field);
}
