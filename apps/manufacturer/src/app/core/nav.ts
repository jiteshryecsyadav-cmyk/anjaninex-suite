/**
 * Poore app ka menu — EK hi jagah.
 *
 * Pehle sidebar ki apni list thi. Nayi screen jodte waqt do jagah badalna
 * padta tha aur ek din dono alag ho jate. Ab sidebar aur andar wali horizontal
 * patti dono yahi padhte hain — jo yahan hai wahi dikhta hai.
 */

export interface NavTab {
  /** Poora rasta — /sales/order jaisa. */
  path: string;
  icon: string;
  label: string;
  perm: string;
  /** Abhi bana nahi — patti me dikhta hai par khulta nahi (roadmap saaf rahe). */
  soon?: boolean;
}

export interface NavSection {
  /** Route data me yahi jaata hai. */
  key: string;
  title: string;
  icon: string;
  /** Sidebar ka rasta — /sales jaisa. */
  path: string;
  tabs: NavTab[];
}

export const SECTIONS: NavSection[] = [
  {
    // Dashboard ke andar koi tab nahi — patti dikhti hi nahi. Har kisi ko
    // khulta hai, isliye permission par nahi baandha.
    key: 'dashboard', title: 'Dashboard', icon: '📊', path: '/dashboard', tabs: []
  },
  {
    key: 'sales', title: 'Sales & Delivery', icon: '🧾', path: '/sales',
    tabs: [
      { path: '/sales/order',   icon: '📄', label: 'Sales Order',      perm: 'sales.order.view.place' },
      { path: '/sales/challan', icon: '🚚', label: 'Delivery Challan', perm: 'sales.challan.view.place' },
      { path: '/sales/invoice', icon: '🧮', label: 'Tax Invoice',      perm: 'sales.invoice.view.place' },
      { path: '/sales/return',  icon: '↩️', label: 'Sales Return',     perm: 'sales.sreturn.view.place' }
    ]
  },
  {
    key: 'purchase', title: 'Purchase & Inwards', icon: '🛒', path: '/purchase',
    tabs: [
      { path: '/purchase/po',     icon: '🛍️', label: 'Purchase Order',  perm: 'purchase.po.view.place' },
      { path: '/purchase/inward', icon: '📥', label: 'Purchase Inward', perm: 'purchase.inward.view.place' },
      { path: '/purchase/return', icon: '↪️', label: 'Purchase Return', perm: 'purchase.preturn.view.place' }
    ]
  },
  {
    key: 'production', title: 'Manage Production', icon: '🏭', path: '/production',
    tabs: [
      { path: '/production/jobslip', icon: '✂️', label: 'Job Slips',          perm: 'production.jobslip.view.place' },
      { path: '/production/khata',   icon: '📒', label: 'Karigar Khata Book', perm: 'production.khata.view.place',   soon: true },
      { path: '/production/lots',    icon: '🔍', label: 'Track Jobslip Lots', perm: 'production.jobslip.view.place', soon: true }
    ]
  },
  {
    key: 'stock', title: 'Manage Stock', icon: '📦', path: '/stock',
    tabs: [
      { path: '/stock/items',    icon: '🎨', label: 'Design / Material', perm: 'stock.design.view.firm' },
      { path: '/stock/opening',  icon: '🏁', label: 'Opening Stock',     perm: 'stock.design.edit.firm', soon: true },
      { path: '/stock/transfer', icon: '🔀', label: 'Stock Transfer',    perm: 'stock.design.edit.firm', soon: true }
    ]
  },
  {
    key: 'masters', title: 'Masters', icon: '👥', path: '/masters',
    tabs: [
      { path: '/masters/karigars',  icon: '🧑‍🏭', label: 'Karigars',          perm: 'masters.karigar.view.firm' },
      { path: '/masters/customers', icon: '🏢', label: 'Customers',         perm: 'masters.customer.view.firm' },
      { path: '/masters/suppliers', icon: '🚛', label: 'Suppliers',         perm: 'masters.supplier.view.firm' },
      { path: '/masters/agents',    icon: '🤝', label: 'Agents',            perm: 'masters.agent.view.firm' },
      { path: '/masters/godowns',   icon: '🏬', label: 'Offices / Godowns', perm: 'masters.office.view.firm' },
      { path: '/masters/team',      icon: '🧑‍💼', label: 'Team & Role',       perm: 'masters.team.view.firm', soon: true }
    ]
  },
  {
    key: 'reports', title: 'Reports', icon: '📊', path: '/reports',
    tabs: [
      { path: '/reports/sales',       icon: '📈', label: 'Bikri ki report', perm: 'reports.sales.view.firm',       soon: true },
      { path: '/reports/stock',       icon: '📦', label: 'Stock report',    perm: 'reports.stock.view.firm',       soon: true },
      { path: '/reports/outstanding', icon: '💰', label: 'Bakaya / udhaar', perm: 'reports.outstanding.view.firm', soon: true }
    ]
  },
  {
    // Ye paanch firm-level cheezein hain — trading module se nahi bandhi.
    // Wahi screen, wahi API jo agency app me chalti hai; manufacturer ko bhi
    // wallet bharna hota hai, plan badalna hota hai aur Credil dekhna hota hai.
    // Permission par nahi baandha — ye har user ke apne kaam ki hain.
    key: 'firm', title: 'Firm & Sewa', icon: '⭐', path: '/firm',
    tabs: [
      { path: '/firm/wallet',     icon: '👛', label: 'Wallet',        perm: '' },
      { path: '/firm/plans',      icon: '💼', label: 'Plans',         perm: '' },
      { path: '/firm/credil',     icon: '📈', label: 'CREDIL',        perm: '' },
      { path: '/firm/party-chat', icon: '💬', label: 'Party Chat',    perm: '' },
      { path: '/firm/complaints', icon: '📢', label: 'Complaint Box', perm: '' }
    ]
  },
  // Ye teen apne aap me poore module hain (andar apni hi navigation hai),
  // isliye sidebar me seedhi line — patti ke andar nahi thoosa.
  {
    key: 'hr', title: 'HR / Staff', icon: '👨‍💼', path: '/hr',
    tabs: [{ path: '/hr', icon: '👨‍💼', label: 'HR', perm: 'hr.attendance.viewown.self' }]
  },
  {
    key: 'bazaar', title: 'Bazaar Link', icon: '🛍️', path: '/suppliers',
    tabs: [{ path: '/suppliers', icon: '🛍️', label: 'Bazaar Link', perm: 'suppliers.directory.view.firm' }]
  },
  {
    key: 'dukan', title: 'Online Dukan', icon: '🏪', path: '/dukan/admin',
    tabs: [{ path: '/dukan/admin', icon: '🏪', label: 'Online Dukan', perm: '' }]
  }
];

/** Khali `perm` ka matlab — ye pardah sabke liye khula hai. */
export function tabKhulta(t: NavTab, can: (p: string) => boolean): boolean {
  return !t.perm || can(t.perm);
}

export function findSection(key: string): NavSection | undefined {
  return SECTIONS.find(s => s.key === key);
}
