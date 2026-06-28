import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { environment } from '../../../environments/environment';
import { Category, Product, CartLine, Order, Seller, Review, Buyer, Address } from './models';

/**
 * DukanService — ported from the KALINDI `DataService`, rebranded "Online Dukan"
 * and adapted for the Anjaninex web app.
 *
 * API base: `${environment.apiUrl}/api/dukan`
 *
 * Two auth realms:
 *  - ADMIN (firm owner managing the dukan): already logged into Anjaninex.
 *    Admin/seller calls reuse the Anjaninex JWT from `AuthService.accessToken()`.
 *  - BUYER (storefront customer): separate phone+PIN login. Buyer token is stored
 *    separately in localStorage ('dukan_buyer_token') and sent on buyer/order/review calls.
 *
 * NOTE: this service uses `fetch` (ported as-is) rather than HttpClient, so the
 * Anjaninex auth interceptor does NOT run for these calls — tokens are attached
 * manually below.
 */
@Injectable({ providedIn: 'root' })
export class DukanService {
  private router = inject(Router);
  private auth = inject(AuthService);
  private readonly API = `${environment.apiUrl}/api/dukan`;

  readonly DELIVERY = 49;
  readonly GST_PCT = 5;

  // ---- Buyer auth / session (storefront) ----
  buyerToken = signal<string>('');
  role = signal<'buyer' | null>(null);
  buyerName = signal<string>('');
  currentBuyerId = signal<string | null>(null);
  currentBuyer = signal<Buyer | null>(null);
  addresses = computed<Address[]>(() => this.currentBuyer()?.addresses ?? []);

  // ---- Server-backed data ----
  seller = signal<Seller>({ name: 'Online Dukan', upi: 'dukan@upi', acc: '', ifsc: '', bank: '', city: '', gst: '', rating: 4.6 });
  categories = signal<Category[]>([]);
  products = signal<Product[]>([]);
  orders = signal<Order[]>([]);
  reviews = signal<Record<string, Review>>({});

  // ---- Cart (local per device) ----
  cart = signal<CartLine[]>([]);

  // ---- Image lightbox ----
  lightbox = signal<string | null>(null);
  openImage(url: string | null | undefined) { if (url) this.lightbox.set(url); }
  closeImage() { this.lightbox.set(null); }

  // ---- Geo ----
  geo: Record<string, { cities: string[]; pins: string[] }> = {
    'Rajasthan': { cities: ['Jaipur', 'Kota', 'Udaipur', 'Jodhpur'], pins: ['302001', '324001', '313001', '342001'] },
    'Gujarat': { cities: ['Surat', 'Ahmedabad', 'Rajkot', 'Vadodara'], pins: ['395001', '380001', '360001', '390001'] },
    'Maharashtra': { cities: ['Mumbai', 'Pune', 'Nagpur', 'Nashik'], pins: ['400001', '411001', '440001', '422001'] },
    'Delhi': { cities: ['New Delhi', 'Dwarka', 'Rohini', 'Saket'], pins: ['110001', '110075', '110085', '110017'] },
    'Madhya Pradesh': { cities: ['Indore', 'Bhopal', 'Gwalior', 'Jabalpur'], pins: ['452001', '462001', '474001', '482001'] },
    'Uttar Pradesh': { cities: ['Lucknow', 'Kanpur', 'Noida', 'Agra'], pins: ['226001', '208001', '201301', '282001'] },
  };
  states(): string[] { return Object.keys(this.geo); }
  readonly indiaStates = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh', 'Andaman and Nicobar Islands', 'Dadra and Nagar Haveli and Daman and Diu', 'Lakshadweep'];
  allStatesList(): string[] { return this.indiaStates; }
  private matchState(input: string): string | null {
    const s = (input || '').toLowerCase().trim(); if (!s) return null;
    const keys = this.states();
    return keys.find(k => k.toLowerCase() === s) || keys.find(k => k.toLowerCase().startsWith(s)) || keys.find(k => k.toLowerCase().includes(s)) || null;
  }
  citiesForState(input: string): string[] { const k = this.matchState(input); return k ? this.geo[k].cities : []; }
  pinsForState(input: string): string[] { const k = this.matchState(input); return k ? this.geo[k].pins : []; }

  private booted = false;

  constructor() {
    try {
      const tok = localStorage.getItem('dukan_buyer_token');
      const sess = JSON.parse(localStorage.getItem('dukan_buyer_session') || 'null');
      const crt = JSON.parse(localStorage.getItem('dukan_cart') || '[]');
      if (Array.isArray(crt)) this.cart.set(crt);
      if (tok && sess) { this.buyerToken.set(tok); this.role.set('buyer'); this.buyerName.set(sess.name); this.currentBuyerId.set(sess.buyerId ?? null); }
    } catch { /* ignore */ }
  }

  /** Lazy boot — call from any dukan shell so we don't fire requests app-wide. */
  boot() {
    if (this.booted) return;
    this.booted = true;
    this.refreshPublic();
    this.refreshPrivate();
  }

  // ---- API helper ----
  // `auth` mode picks which bearer token to attach:
  //   'admin'  → Anjaninex JWT (firm owner managing the dukan)
  //   'buyer'  → storefront buyer token
  //   'public' → no token
  private async req<T>(method: string, path: string, body?: any, mode: 'admin' | 'buyer' | 'public' = 'public'): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (mode === 'admin') {
      const t = this.auth.accessToken();
      if (t) headers['Authorization'] = 'Bearer ' + t;
    } else if (mode === 'buyer') {
      if (this.buyerToken()) headers['Authorization'] = 'Bearer ' + this.buyerToken();
    }
    const res = await fetch(this.API + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    if (!res.ok) { let msg = 'Error ' + res.status; try { msg = (await res.json()).error || msg; } catch { } throw new Error(msg); }
    try { return await res.json() as T; } catch { return null as any; }
  }
  private saveCart() { localStorage.setItem('dukan_cart', JSON.stringify(this.cart())); }

  // ---- Data refresh ----
  async refreshPublic() {
    try {
      const [cats, prods, sel, rev] = await Promise.all([
        this.req<Category[]>('GET', '/categories', undefined, 'admin'),
        this.req<Product[]>('GET', '/products', undefined, 'admin'),
        this.req<Seller>('GET', '/seller', undefined, 'admin'),
        this.req<Record<string, Review>>('GET', '/reviews', undefined, 'admin'),
      ]);
      if (cats) this.categories.set(cats);
      if (prods) this.products.set(prods);
      if (sel) this.seller.set(sel);
      if (rev) this.reviews.set(rev);
    } catch { /* offline */ }
  }
  async refreshPrivate() {
    try {
      // Buyer (storefront) sees only their own orders; admin sees firm orders.
      if (this.role() === 'buyer') {
        const ords = await this.req<Order[]>('GET', '/orders', undefined, 'buyer');
        if (ords) this.orders.set(ords);
        const me = await this.req<Buyer>('GET', '/buyer/me', undefined, 'buyer');
        if (me) this.currentBuyer.set(me);
      } else {
        const ords = await this.req<Order[]>('GET', '/orders', undefined, 'admin');
        if (ords) this.orders.set(ords);
      }
    } catch { /* token invalid */ }
  }
  refresh() { this.refreshPublic(); this.refreshPrivate(); }

  // ---- Buyer auth (storefront) ----
  private persistBuyer(remember: boolean) {
    if (remember) {
      localStorage.setItem('dukan_buyer_token', this.buyerToken());
      localStorage.setItem('dukan_buyer_session', JSON.stringify({ name: this.buyerName(), buyerId: this.currentBuyerId() }));
    } else { localStorage.removeItem('dukan_buyer_token'); localStorage.removeItem('dukan_buyer_session'); }
  }
  async loginBuyer(idOrName: string, pin: string, remember = true): Promise<boolean> {
    try {
      const r = await this.req<{ token: string; buyer: Buyer }>('POST', '/auth/login', { idOrName, pin });
      this.buyerToken.set(r.token); this.role.set('buyer'); this.currentBuyer.set(r.buyer);
      this.currentBuyerId.set(r.buyer.id); this.buyerName.set(`${r.buyer.name} (${r.buyer.id})`);
      this.persistBuyer(remember); await this.refreshPrivate(); return true;
    } catch { return false; }
  }
  async signup(name: string, phone: string, pin: string, remember = true): Promise<string | null> {
    try {
      const r = await this.req<{ token: string; buyer: Buyer }>('POST', '/auth/signup', { name, phone, pin });
      this.buyerToken.set(r.token); this.role.set('buyer'); this.currentBuyer.set(r.buyer);
      this.currentBuyerId.set(r.buyer.id); this.buyerName.set(`${r.buyer.name} (${r.buyer.id})`);
      this.persistBuyer(remember); return r.buyer.id;
    } catch (e: any) { this.toast(e?.message || 'Signup failed', 'error'); return null; }
  }
  rememberSession(on: boolean) { this.persistBuyer(on); }
  logoutBuyer() {
    this.buyerToken.set(''); this.role.set(null); this.currentBuyer.set(null); this.currentBuyerId.set(null);
    localStorage.removeItem('dukan_buyer_token'); localStorage.removeItem('dukan_buyer_session');
  }

  // ---- Helpers ----
  catName(id: string): string { return this.categories().find(c => c.id === id)?.name ?? '—'; }
  find(id: string): Product | undefined { return this.products().find(p => p.id === id); }
  qtyOf(id: string): number { return this.cart().find(l => l.id === id)?.qty ?? 0; }
  discPct(mrp: number, rate: number): number { return mrp > rate ? Math.round((mrp - rate) / mrp * 100) : 0; }
  totalSpent = computed(() => this.orders().reduce((s, o) => s + o.total, 0));
  cartCount = computed(() => this.cart().reduce((s, l) => s + l.qty, 0));

  // ---- Cart ----
  add(id: string) { const c = [...this.cart()]; const l = c.find(x => x.id === id); if (l) l.qty++; else c.push({ id, qty: 1 }); this.cart.set(c); this.saveCart(); }
  setQty(id: string, qty: number) { let c = [...this.cart()]; if (qty <= 0) c = c.filter(l => l.id !== id); else { const l = c.find(x => x.id === id); if (l) l.qty = qty; } this.cart.set(c); this.saveCart(); }
  remove(id: string) { this.cart.set(this.cart().filter(l => l.id !== id)); this.saveCart(); }
  cartSubtotal(): number { return this.cart().reduce((s, l) => { const p = this.find(l.id); return s + (p ? p.rate * l.qty : 0); }, 0); }
  cartGst(): number { return this.cart().reduce((s, l) => { const p = this.find(l.id); return s + ((p && p.gstInc !== false && p.gst) ? Math.round(p.rate * l.qty * p.gst / 100) : 0); }, 0); }
  cartTotal(): number { return this.cart().length ? this.cartSubtotal() + this.DELIVERY + this.cartGst() : 0; }

  async placeOrder(receiver: string, address: string, opts?: { gst?: boolean; delivery?: boolean }): Promise<Order> {
    const items = this.cart().map(l => ({ id: l.id, qty: l.qty }));
    const o = await this.req<Order>('POST', '/orders', { items, receiver, address, includeGst: opts?.gst !== false, includeDelivery: opts?.delivery !== false }, 'buyer');
    this.orders.set([o, ...this.orders()]); this.cart.set([]); this.saveCart();
    this.toast(`Order ${o.id} placed — ₹${o.total} ✅`);
    this.osNotify('New Order — Online Dukan', `${o.id} · ₹${o.total} · ${receiver}`);
    return o;
  }

  // ---- Admin: categories/products/seller ----
  newCatId(): string { let n = 1; const ids = new Set(this.categories().map(c => c.id)); while (ids.has('CAT' + n)) n++; return 'CAT' + n; }
  newProductId(combo: boolean): string { return (combo ? 'C' : 'P') + Date.now().toString().slice(-5); }

  saveCategory(cat: Category) {
    const exists = this.categories().some(c => c.id === cat.id);
    const list = exists ? this.categories().map(c => c.id === cat.id ? cat : c) : [...this.categories(), cat];
    this.categories.set(list);
    (exists ? this.req('PUT', '/categories/' + cat.id, cat, 'admin') : this.req('POST', '/categories', cat, 'admin'))
      .then(() => this.toast('Category saved ✓')).catch(e => this.toast(e.message, 'error'));
  }
  delCategory(id: string) { this.categories.set(this.categories().filter(c => c.id !== id)); this.products.set(this.products().filter(p => p.catId !== id)); this.req('DELETE', '/categories/' + id, undefined, 'admin').then(() => this.toast('Category + uske products deleted', 'info')).catch(() => { }); }

  saveProduct(p: Product) {
    const exists = this.products().some(x => x.id === p.id);
    const list = exists ? this.products().map(x => x.id === p.id ? p : x) : [...this.products(), p];
    this.products.set(list);
    (exists ? this.req('PUT', '/products/' + p.id, p, 'admin') : this.req('POST', '/products', p, 'admin'))
      .then(() => this.toast('Product saved ✓')).catch(e => this.toast(e.message, 'error'));
  }
  delProduct(id: string) { this.products.set(this.products().filter(p => p.id !== id)); this.req('DELETE', '/products/' + id, undefined, 'admin').then(() => this.toast('Product deleted', 'info')).catch(() => { }); }

  saveSeller(s: Partial<Seller>) { this.seller.set({ ...this.seller(), ...s }); this.req('PUT', '/seller', s, 'admin').then(() => this.toast('Saved ✓')).catch(e => this.toast(e.message, 'error')); }

  // ---- Buyer: profile / pin / addresses ----
  updateProfile(p: Partial<Buyer>) {
    const b = this.currentBuyer(); if (b) this.currentBuyer.set({ ...b, ...p });
    this.req('PUT', '/buyer/profile', p, 'buyer').then(() => this.toast('Profile updated ✓')).catch(e => this.toast(e.message, 'error'));
  }
  async changePin(oldPin: string, newPin: string): Promise<boolean> {
    try { await this.req('PUT', '/buyer/pin', { oldPin, newPin }, 'buyer'); this.toast('PIN change ho gaya ✓'); return true; }
    catch { return false; }
  }
  addAddress(a: Omit<Address, 'id'>) { this.req<Address[]>('POST', '/buyer/address', a, 'buyer').then(list => { this.patchAddresses(list); this.toast('Address added ✓'); }).catch(e => this.toast(e.message, 'error')); }
  updateAddress(a: Address) { this.req<Address[]>('PUT', '/buyer/address/' + a.id, a, 'buyer').then(list => { this.patchAddresses(list); this.toast('Address updated ✓'); }).catch(e => this.toast(e.message, 'error')); }
  deleteAddress(id: string) { this.req<Address[]>('DELETE', '/buyer/address/' + id, undefined, 'buyer').then(list => { this.patchAddresses(list); this.toast('Address removed', 'info'); }).catch(() => { }); }
  setDefaultAddress(id: string) { this.req<Address[]>('PUT', '/buyer/address/' + id + '/default', undefined, 'buyer').then(list => this.patchAddresses(list)).catch(() => { }); }
  private patchAddresses(list: Address[]) { const b = this.currentBuyer(); if (b) this.currentBuyer.set({ ...b, addresses: list }); }
  defaultAddress(): Address | null { return this.addresses().find(a => a.isDefault) ?? this.addresses()[0] ?? null; }

  // ---- Reviews ----
  avgRating = computed(() => { const v = Object.values(this.reviews()).map(r => r.stars); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length) : 0; });
  allReviews = computed(() => Object.entries(this.reviews()).map(([id, r]) => ({ id, ...r })).reverse());
  submitReview(orderId: string, stars: number, text: string) {
    const ex = this.reviews()[orderId];
    this.reviews.set({ ...this.reviews(), [orderId]: { stars, text: text.trim(), date: new Date().toISOString(), buyer: this.buyerName(), reply: ex?.reply, replyDate: ex?.replyDate } });
    this.req('POST', '/reviews', { orderId, stars, text }, 'buyer').then(() => this.toast('Review submit ho gaya ⭐')).catch(e => this.toast(e.message, 'error'));
  }
  replyReview(orderId: string, text: string) {
    const r = this.reviews()[orderId]; if (!r) return;
    this.reviews.set({ ...this.reviews(), [orderId]: { ...r, reply: text.trim(), replyDate: new Date().toISOString() } });
    this.req('POST', '/reviews/' + orderId + '/reply', { text }, 'admin').then(() => this.toast('Reply posted ✓')).catch(e => this.toast(e.message, 'error'));
  }

  // ---- Amount in words ----
  amountInWords(n: number): string {
    n = Math.round(n); if (n === 0) return 'Zero Rupees';
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = (x: number): string => x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : '');
    const three = (x: number): string => (x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x));
    let res = ''; const cr = Math.floor(n / 10000000); n %= 10000000; const lk = Math.floor(n / 100000); n %= 100000; const th = Math.floor(n / 1000); n %= 1000;
    if (cr) res += three(cr) + ' Crore '; if (lk) res += three(lk) + ' Lakh '; if (th) res += three(th) + ' Thousand '; if (n) res += three(n);
    return res.trim() + ' Rupees';
  }

  // ---- Notifications ----
  toasts = signal<{ id: number; msg: string; type: 'info' | 'success' | 'error' }[]>([]);
  private toastSeq = 0;
  toast(msg: string, type: 'info' | 'success' | 'error' = 'success') {
    const id = ++this.toastSeq; this.toasts.set([...this.toasts(), { id, msg, type }]);
    setTimeout(() => this.toasts.set(this.toasts().filter(t => t.id !== id)), 3500);
  }
  enableNotifications() { if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch(() => { }); }
  private osNotify(title: string, body: string) { try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, { body, icon: '/icon-192.png' }); } catch { } }
}
