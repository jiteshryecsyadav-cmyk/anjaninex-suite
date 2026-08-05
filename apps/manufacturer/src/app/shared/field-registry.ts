// =============================================================================
// FIELD REGISTRY — manufacturer ki har screen ke fields ka catalog
// =============================================================================
// Har karkhane ki apni aadat hoti hai. Kisi ke yahan "Lot number" jaan hai,
// kisi ne kabhi likha hi nahi. Koi mill ke code ko "Dealer Code" bolta hai,
// koi "Article No.". Pehle har farmaish par code badalna + deploy karna padta
// tha. Ab ye catalog aur firm ki settings mil kar screen banate hain.
//
// NAYA FIELD JODNA:
//   1. Yahan ek line jodo — `defaultOff: true` rakhna, taaki kisi ki chalti
//      hui screen achanak na badle; jisko chahiye wo Settings se on kar lega
//   2. Us field ke div par  *fld="'screen.key'"  laga do
//      aur label ki jagah  {{ cfg.label('screen.key') }}
//   Bas. Uska tick har firm ke "Screen & Fields" me apne aap aa jayega.
//
// ⚠️ `key` DB me jata hai — ek baar bana diya to badalna mat, warna jis firm
//    ne use band kiya tha wo dobara khul jayega.
//
// (Agency app ka registry alag hai — usme bill/order/commission wale fields
//  hain. Keys alag hain, isliye ek hi firm dono app chalaye to bhi takraav
//  nahi hota.)
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
  /** Kis hisse ki screen hai — Settings page me isi se group banta hai */
  group: string;
  fields: FieldDef[];
}

export const FIELD_REGISTRY: ScreenDef[] = [
  // ───────────────────────── SALES ─────────────────────────
  {
    key: 'mfg_sales_order', name: 'Sales Order', group: 'Sales & Delivery',
    fields: [
      { key: 'party',      label: 'Customer', locked: true },
      { key: 'order_date', label: 'Tareekh',  locked: true },
      { key: 'godown',     label: 'Godown' },
      { key: 'agent',      label: 'Agent', hint: 'Jo grahak laaya' },
      { key: 'due_at',     label: 'Kab tak dena hai' },
      { key: 'buyer_ref',  label: 'Grahak ka order no.',
        hint: 'Wo isi number se poochta hai, hamare SO se nahi' },
      { key: 'transport',  label: 'Transport' },
      { key: 'note',       label: 'Note' },
      { key: 'ratio_box',  label: 'Ratio se lines banao',
        hint: '"60 piece, S:1 M:2 L:1" wala hisab. Band karoge to lines haath se bharni padengi' },
      { key: 'colour',     label: 'Rang (line par)' },
      { key: 'size',       label: 'Size (line par)' }
    ]
  },
  {
    key: 'mfg_challan', name: 'Delivery Challan', group: 'Sales & Delivery',
    fields: [
      { key: 'party',     label: 'Customer', locked: true },
      { key: 'godown',    label: 'Godown',   locked: true, hint: 'Stock yahin se ghatega' },
      { key: 'so_link',   label: 'Kis order ka maal hai',
        hint: 'Band karoge to baki lines apne aap nahi bharengi' },
      { key: 'transport', label: 'Transport' },
      { key: 'lr_no',     label: 'LR / builty no.' },
      { key: 'vehicle',   label: 'Gaadi number' },
      { key: 'packages',  label: 'Kitne gathar', hint: 'Grahak piece nahi, gathar ginta hai' },
      { key: 'note',      label: 'Note' },
      { key: 'colour',    label: 'Rang (line par)' },
      { key: 'size',      label: 'Size (line par)' }
    ]
  },
  {
    key: 'mfg_invoice', name: 'Tax Invoice', group: 'Sales & Delivery',
    fields: [
      { key: 'party',         label: 'Customer',        locked: true },
      { key: 'bill_date',     label: 'Bill ki tareekh', locked: true },
      { key: 'discount',      label: 'Discount' },
      { key: 'other_charges', label: 'Anya kharcha', hint: 'Packing, bhada waghera' },
      { key: 'round_off',     label: 'Round off' },
      { key: 'eway',          label: 'E-Way bill no. + tareekh' },
      { key: 'lr_no',         label: 'LR / builty no.' },
      { key: 'po_number',     label: 'Grahak ka PO number' },
      { key: 'notes',         label: 'Note' }
    ]
  },
  {
    key: 'mfg_sreturn', name: 'Sales Return', group: 'Sales & Delivery',
    fields: [
      { key: 'party',     label: 'Customer', locked: true },
      { key: 'godown',    label: 'Godown',   locked: true, hint: 'Maal yahan wapas chadhega' },
      { key: 'bill',      label: 'Kis bill ka maal hai' },
      { key: 'reason',    label: 'Kyon wapas aaya', defaultRequired: true },
      { key: 'effect',    label: 'Paisa kaise (bill me kate / credit note)' },
      { key: 'transport', label: 'Transport' },
      { key: 'remark',    label: 'Note' }
    ]
  },

  // ───────────────────────── PURCHASE ─────────────────────────
  {
    key: 'mfg_po', name: 'Purchase Order', group: 'Purchase & Inwards',
    fields: [
      { key: 'party',       label: 'Supplier', locked: true },
      { key: 'order_date',  label: 'Tareekh',  locked: true },
      { key: 'godown',      label: 'Godown' },
      { key: 'agent',       label: 'Agent / dalal' },
      { key: 'due_at',      label: 'Kab tak' },
      { key: 'transport',   label: 'Transport' },
      { key: 'note',        label: 'Note' },
      { key: 'dealer_code', label: 'Mill ka code',
        hint: 'Mill ke yahan is maal ka apna number — unse baat karte waqt yahi bolte hain' },
      { key: 'lot_no',      label: 'Lot number' },
      { key: 'colour',      label: 'Rang (line par)' },
      { key: 'size',        label: 'Size (line par)' }
    ]
  },
  {
    key: 'mfg_inward', name: 'Purchase Inward', group: 'Purchase & Inwards',
    fields: [
      { key: 'party',   label: 'Supplier', locked: true },
      { key: 'godown',  label: 'Godown',   locked: true, hint: 'Stock yahin badhega' },
      { key: 'po_link', label: 'Kis order ka maal hai',
        hint: 'Band karoge to baki lines apne aap nahi bharengi' },
      { key: 'supplier_challan', label: 'Unka challan no.',
        hint: 'Milaan me sabse zyada isi ki zarurat padti hai', defaultRequired: true },
      { key: 'lr_no',       label: 'LR / builty no.' },
      { key: 'transport',   label: 'Transport' },
      { key: 'dealer_code', label: 'Mill ka code' },
      { key: 'lot_no',      label: 'Lot number' },
      { key: 'note',        label: 'Note' },
      { key: 'colour',      label: 'Rang (line par)' },
      { key: 'size',        label: 'Size (line par)' }
    ]
  },
  {
    key: 'mfg_preturn', name: 'Purchase Return', group: 'Purchase & Inwards',
    fields: [
      { key: 'party',       label: 'Supplier', locked: true },
      { key: 'godown',      label: 'Godown',   locked: true },
      { key: 'inward_link', label: 'Kis inward ka maal hai',
        hint: 'Chunoge to "itna hi wapas ja sakta hai" ki rok lag jayegi' },
      { key: 'reason',      label: 'Kyon wapas ja raha hai', defaultRequired: true },
      { key: 'note',        label: 'Note' },
      { key: 'colour',      label: 'Rang (line par)' },
      { key: 'size',        label: 'Size (line par)' }
    ]
  },

  // ───────────────────────── PRODUCTION ─────────────────────────
  {
    key: 'mfg_jobslip', name: 'Job Slip', group: 'Manage Production',
    fields: [
      { key: 'karigar',   label: 'Karigar', locked: true },
      { key: 'job_type',  label: 'Kaam',    locked: true },
      { key: 'lot_no',    label: 'Lot number' },
      { key: 'godown',    label: 'Godown', hint: 'Isi se material ghatega' },
      { key: 'due_at',    label: 'Kab tak' },
      { key: 'note',      label: 'Note' },
      { key: 'rejected',  label: 'Kharab nikle (maal aane par)',
        hint: 'Inki majoori nahi banti' }
    ]
  },

  // ───────────────────────── MASTERS / STOCK ─────────────────────────
  {
    key: 'mfg_karigar', name: 'Karigar', group: 'Masters',
    fields: [
      { key: 'name',      label: 'Poora naam', locked: true },
      { key: 'mobile',    label: 'Mobile',     locked: true },
      { key: 'job_type',  label: 'Kaam kaunsa karta hai', locked: true },
      { key: 'firm_name', label: 'Firm ka naam' },
      { key: 'city',      label: 'Shehar' },
      { key: 'state',     label: 'Rajya' },
      { key: 'address',   label: 'Pata' },
      { key: 'gst',       label: 'GST', defaultOff: true },
      { key: 'pan',       label: 'PAN', defaultOff: true }
    ]
  },
  {
    key: 'mfg_design', name: 'Design / Material', group: 'Manage Stock',
    fields: [
      { key: 'name',        label: 'Naam', locked: true },
      { key: 'code',        label: 'Code' },
      { key: 'unit',        label: 'Unit' },
      { key: 'rate',        label: 'Rate' },
      { key: 'hsn',         label: 'HSN' },
      { key: 'tax',         label: 'GST %' },
      { key: 'min_stock',   label: 'Stock itne se kam ho to batao',
        hint: 'Isse neeche jaye to Dashboard par chetavni' },
      { key: 'colour_hint', label: 'Rang ka nishaan' },
      { key: 'set_pieces',  label: 'Set me kitne piece' },
      { key: 'min_order',   label: 'Kam se kam order (MOQ)' },
      { key: 'tags',        label: 'Tag' },
      { key: 'note',        label: 'Note' }
    ]
  },
  {
    key: 'mfg_party', name: 'Customer / Supplier', group: 'Masters',
    fields: [
      { key: 'name',        label: 'Naam', locked: true },
      { key: 'contact',     label: 'Baat kisse karni hai' },
      { key: 'mobile',      label: 'Mobile' },
      { key: 'gst',         label: 'GST' },
      { key: 'pan',         label: 'PAN' },
      { key: 'city',        label: 'Shehar' },
      { key: 'state',       label: 'Rajya' },
      { key: 'address',     label: 'Pata' },
      { key: 'discount',    label: 'Chhoot %' },
      { key: 'credit_days', label: 'Kitne din ka udhaar' },
      { key: 'udyam_type',  label: 'Udyam type', defaultOff: true },
      { key: 'udyam_no',    label: 'Udyam number', defaultOff: true }
    ]
  },
  {
    key: 'mfg_godown', name: 'Office / Godown', group: 'Masters',
    fields: [
      { key: 'name',    label: 'Jagah ka naam', locked: true },
      { key: 'mobile',  label: 'Mobile',        locked: true },
      { key: 'pincode', label: 'Pincode' },
      { key: 'city',    label: 'Shehar' },
      { key: 'state',   label: 'Rajya' },
      { key: 'address', label: 'Pata' }
    ]
  },
  {
    key: 'mfg_agent', name: 'Agent', group: 'Masters',
    fields: [
      { key: 'name',   label: 'Agent ka naam', locked: true },
      { key: 'mobile', label: 'Mobile',        locked: true },
      { key: 'agency', label: 'Agency ka naam' },
      { key: 'city',   label: 'Shehar' },
      { key: 'state',  label: 'Rajya' },
      { key: 'gst',    label: 'GST', defaultOff: true },
      { key: 'pan',    label: 'PAN', defaultOff: true }
    ]
  }
];

// ── madad ──

export const SCREEN_BY_KEY = new Map<string, ScreenDef>(
  FIELD_REGISTRY.map(s => [s.key, s])
);

/** 'mfg_sales_order.agent' → { screen: 'mfg_sales_order', field: 'agent' } */
export function splitFieldPath(path: string): { screen: string; field: string } {
  const i = path.indexOf('.');
  return i < 0 ? { screen: path, field: '' }
               : { screen: path.slice(0, i), field: path.slice(i + 1) };
}

export function findField(screen: string, field: string): FieldDef | undefined {
  return SCREEN_BY_KEY.get(screen)?.fields.find(f => f.key === field);
}

/** Settings page ke liye — hisse ke hisaab se screens. */
export function screensByGroup(): { group: string; screens: ScreenDef[] }[] {
  const out: { group: string; screens: ScreenDef[] }[] = [];
  for (const s of FIELD_REGISTRY) {
    let g = out.find(x => x.group === s.group);
    if (!g) { g = { group: s.group, screens: [] }; out.push(g); }
    g.screens.push(s);
  }
  return out;
}
