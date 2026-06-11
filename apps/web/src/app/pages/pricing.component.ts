import { Component, computed, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

interface Plan {
  code: string;
  name: string;
  icon: string;
  tagline: string;
  monthlyInr: number;
  annualInr: number;        // already discounted (~17% off)
  popular?: boolean;
  badge?: string;
  cta: string;
  ctaLink: string;
  features: string[];
  notIncluded?: string[];
  limits: { users: string; branches: string; ai: string };
}

const PLANS: Plan[] = [
  {
    code: 'starter',
    name: '🥉 Starter',
    icon: '🥉',
    tagline: 'Chhote brokers · 1-2 person firms',
    monthlyInr: 999,
    annualInr: 9999,
    cta: 'Start Free Trial',
    ctaLink: '/signup?plan=starter',
    limits: { users: '3', branches: '1', ai: 'No AI' },
    features: [
      '🛒 Trading (Orders + Bills + Payments)',
      '📒 Accounting (Vouchers + Ledgers)',
      '📊 5 Core Reports',
      '💵 Wallet (recharge)',
      '📞 Email support'
    ],
    notIncluded: ['🤖 AI Bill Scan', '🏭 Bazaar Link', '👥 HR Module', '📈 Advanced Reports']
  },
  {
    code: 'growth',
    name: '🥈 Growth',
    icon: '🥈',
    tagline: 'Growing trading firms',
    monthlyInr: 2499,
    annualInr: 24999,
    popular: true,
    badge: '⭐ MOST POPULAR',
    cta: 'Start Free Trial',
    ctaLink: '/signup?plan=growth',
    limits: { users: '10', branches: '3', ai: '100 scans/mo' },
    features: [
      'Everything in Starter +',
      '🤖 AI Bill Scan (100 scans/mo)',
      '📈 All 13 Reports (advanced)',
      '🏭 Bazaar Link (Supplier Directory)',
      '💰 Commission Module',
      '💵 ₹500 wallet credit free monthly',
      '📞 Email + WhatsApp support'
    ],
    notIncluded: ['👥 HR Module', '🏷️ White Label', '🔗 API Access']
  },
  {
    code: 'business',
    name: '🥇 Business',
    icon: '🥇',
    tagline: 'Multi-branch with staff',
    monthlyInr: 4999,
    annualInr: 49999,
    cta: 'Start Free Trial',
    ctaLink: '/signup?plan=business',
    limits: { users: 'Unlimited', branches: 'Unlimited', ai: 'Unlimited' },
    features: [
      'Everything in Growth +',
      '👥 HR Module (Staff + Attendance + Selfie + Live Location + Leave + Payroll)',
      '🤖 Unlimited AI Scans',
      '👤 Unlimited Users',
      '🏢 Unlimited Branches',
      '💵 ₹1,500 wallet credit monthly',
      '⚡ Priority WhatsApp/phone support'
    ],
    notIncluded: ['🏷️ White Label', '🔗 API Access']
  },
  {
    code: 'enterprise',
    name: '💎 Enterprise',
    icon: '💎',
    tagline: 'Large firms · custom needs',
    monthlyInr: 9999,
    annualInr: 99999,
    cta: 'Contact Sales',
    ctaLink: 'mailto:sales@anjaninex.com?subject=Enterprise%20Inquiry',
    limits: { users: 'Unlimited', branches: 'Unlimited', ai: 'Unlimited' },
    features: [
      'Everything in Business +',
      '🏷️ White Label (apna logo + colors)',
      '🔗 API Access for integrations',
      '📊 Custom reports',
      '👤 Dedicated account manager',
      '🛡️ SLA: 99.9% uptime',
      '💵 ₹5,000 wallet credit monthly',
      '🏢 On-premise option available'
    ]
  }
];

const ADDONS = [
  { icon: '🤖', name: '+AI Pack', desc: '500 extra AI scans', price: 499 },
  { icon: '👤', name: '+Extra User', desc: 'If exceeded plan limit', price: 99 },
  { icon: '🏢', name: '+Extra Branch', desc: 'If exceeded plan limit', price: 299 },
  { icon: '📦', name: '+Bazaar Link', desc: 'Standalone (for Starter)', price: 999 },
  { icon: '👨‍💼', name: '+HR Module', desc: 'Standalone (for Growth)', price: 1999 },
  { icon: '💬', name: '+WhatsApp Pro', desc: 'Bulk messages + templates', price: 499 },
  { icon: '📧', name: '+Email/SMS Pack', desc: 'Bulk auto-reminders', price: 299 }
];

const FAQS = [
  { q: 'Kya 14-day free trial available hai?', a: 'Haan, har plan me 14 din ka free trial hai. Credit card optional.' },
  { q: 'Annual billing me kitna discount?', a: 'Annual billing me 2 months free (~17% off vs monthly).' },
  { q: 'Plan kabhi bhi upgrade/downgrade kar sakte hai?', a: 'Haan, kabhi bhi. Upgrade turant active hota hai, downgrade next cycle se.' },
  { q: 'AI scan ka pricing kya hai?', a: 'Plan me included quota hai. Beyond quota: ₹0.15 per scan (auto-debit from wallet) OR +AI Pack ₹499 for 500 scans.' },
  { q: 'Data security?', a: 'Multi-tenant PostgreSQL with RLS. JWT auth. HttpOnly cookies. ISO 27001 hosting (AWS Mumbai).' },
  { q: 'Refund policy?', a: 'Pehle 30 din me cancel karo to full refund. Beyond that, pro-rated refund for unused months.' },
  { q: 'GST invoice milegi?', a: 'Haan, har payment ke saath proper GST invoice automatically email ho jata hai.' },
  { q: 'Support kaise milta hai?', a: 'Starter: Email (24hr). Growth: Email + WhatsApp (4hr). Business+: Priority phone + WhatsApp (1hr).' }
];

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DecimalPipe],
  template: `
    <div class="bg-gradient-to-b from-[#faf5ff] via-white to-[#faf5ff] min-h-screen">

      <!-- Top nav (minimal — public page) -->
      <header class="bg-white border-b border-purple-100 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <a routerLink="/" class="font-display font-black text-xl text-[#2d1040]">
          Namo<span class="text-[#dc2626]">kara</span>
        </a>
        <div class="flex gap-3 text-sm">
          <a routerLink="/login" class="px-4 py-2 text-[#5c1a8b] font-semibold hover:bg-purple-50 rounded-lg">Login</a>
          <a routerLink="/signup" class="px-4 py-2 bg-gradient-to-r from-[#4a1080] to-[#5c1a8b] text-white font-bold rounded-lg hover:shadow-lg">Start Free Trial</a>
        </div>
      </header>

      <!-- Hero -->
      <section class="max-w-6xl mx-auto px-6 py-12 text-center">
        <h1 class="font-display font-black text-5xl text-[#2d1040] mb-4">
          Simple, transparent pricing
        </h1>
        <p class="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
          Apke business ke hisab se plan choose karein. 14 din free trial, koi credit card nahi.
        </p>

        <!-- Monthly / Annual toggle -->
        <div class="inline-flex items-center gap-3 bg-white border-2 border-purple-200 rounded-full p-1.5 shadow-sm">
          <button (click)="billing.set('monthly')"
                  [class.toggle-active]="billing() === 'monthly'"
                  class="px-6 py-2 rounded-full text-sm font-bold transition">Monthly</button>
          <button (click)="billing.set('annual')"
                  [class.toggle-active]="billing() === 'annual'"
                  class="px-6 py-2 rounded-full text-sm font-bold transition flex items-center gap-2">
            Annual
            <span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">SAVE 17%</span>
          </button>
        </div>
      </section>

      <!-- 4 Plan cards -->
      <section class="max-w-7xl mx-auto px-6 grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        @for (plan of plans; track plan.code) {
          <div class="plan-card" [class.plan-popular]="plan.popular">
            @if (plan.badge) {
              <div class="plan-badge">{{ plan.badge }}</div>
            }
            <div class="text-center mb-4">
              <div class="text-4xl mb-2">{{ plan.icon }}</div>
              <div class="text-xl font-black text-[#2d1040]">{{ plan.name }}</div>
              <div class="text-xs text-gray-500 mt-1">{{ plan.tagline }}</div>
            </div>

            <div class="text-center mb-6">
              <div class="text-4xl font-black text-[#5c1a8b]">
                ₹{{ displayPrice(plan) | number:'1.0-0' }}
              </div>
              <div class="text-xs text-gray-500 mt-1">
                {{ billing() === 'monthly' ? 'per month' : 'per year' }}
              </div>
              @if (billing() === 'annual') {
                <div class="text-xs text-green-600 font-bold mt-1">
                  ₹{{ savings(plan) | number:'1.0-0' }} saved vs monthly
                </div>
              }
            </div>

            <!-- Quick limits -->
            <div class="grid grid-cols-3 gap-2 mb-5 text-center text-xs">
              <div class="bg-purple-50 rounded p-2">
                <div class="font-bold text-[#5c1a8b]">{{ plan.limits.users }}</div>
                <div class="text-gray-500">Users</div>
              </div>
              <div class="bg-purple-50 rounded p-2">
                <div class="font-bold text-[#5c1a8b]">{{ plan.limits.branches }}</div>
                <div class="text-gray-500">Branches</div>
              </div>
              <div class="bg-purple-50 rounded p-2">
                <div class="font-bold text-[#5c1a8b]">{{ plan.limits.ai }}</div>
                <div class="text-gray-500">AI</div>
              </div>
            </div>

            <!-- CTA -->
            <a [href]="plan.ctaLink" class="plan-cta" [class.plan-cta-popular]="plan.popular">
              {{ plan.cta }}
            </a>

            <!-- Features -->
            <div class="mt-5 pt-5 border-t border-purple-100">
              <div class="text-xs font-bold text-gray-500 uppercase mb-3">What's included:</div>
              <ul class="space-y-2">
                @for (f of plan.features; track f) {
                  <li class="text-sm flex items-start gap-2">
                    <span class="text-green-600 font-bold flex-shrink-0">✓</span>
                    <span>{{ f }}</span>
                  </li>
                }
                @for (n of (plan.notIncluded ?? []); track n) {
                  <li class="text-sm flex items-start gap-2 text-gray-400">
                    <span class="flex-shrink-0">✕</span>
                    <span class="line-through">{{ n }}</span>
                  </li>
                }
              </ul>
            </div>
          </div>
        }
      </section>

      <!-- Add-ons -->
      <section class="max-w-6xl mx-auto px-6 mb-16">
        <div class="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-8">
          <h2 class="text-center font-display font-black text-3xl text-[#2d1040] mb-2">🎁 Add-ons (à la carte)</h2>
          <p class="text-center text-gray-600 mb-6">Apne plan me extra cheez chahiye? Bas add-on lo.</p>
          <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
            @for (a of addons; track a.name) {
              <div class="bg-white rounded-lg p-4 shadow-sm border border-purple-100 hover:shadow-md transition">
                <div class="text-2xl mb-2">{{ a.icon }}</div>
                <div class="font-bold text-[#2d1040]">{{ a.name }}</div>
                <div class="text-xs text-gray-600 mb-2">{{ a.desc }}</div>
                <div class="text-lg font-black text-[#5c1a8b]">₹{{ a.price | number:'1.0-0' }}<span class="text-xs text-gray-500 font-normal">/mo</span></div>
              </div>
            }
          </div>
        </div>
      </section>

      <!-- Comparison table -->
      <section class="max-w-6xl mx-auto px-6 mb-16">
        <h2 class="text-center font-display font-black text-3xl text-[#2d1040] mb-2">Detailed comparison</h2>
        <p class="text-center text-gray-600 mb-8">Saare features sath me dekho</p>
        <div class="bg-white rounded-2xl shadow-lg overflow-hidden border border-purple-100">
          <table class="w-full text-sm">
            <thead class="bg-gradient-to-r from-[#4a1080] to-[#5c1a8b] text-white">
              <tr>
                <th class="text-left p-4">Feature</th>
                <th class="p-4 text-center">Starter</th>
                <th class="p-4 text-center">Growth</th>
                <th class="p-4 text-center">Business</th>
                <th class="p-4 text-center">Enterprise</th>
              </tr>
            </thead>
            <tbody class="text-gray-700">
              <tr class="border-b"><td class="p-3 font-semibold">🛒 Trading</td><td class="text-center p-3">✅</td><td class="text-center p-3">✅</td><td class="text-center p-3">✅</td><td class="text-center p-3">✅</td></tr>
              <tr class="border-b bg-purple-50/30"><td class="p-3 font-semibold">📒 Accounting</td><td class="text-center p-3">✅</td><td class="text-center p-3">✅</td><td class="text-center p-3">✅</td><td class="text-center p-3">✅</td></tr>
              <tr class="border-b"><td class="p-3 font-semibold">📊 Reports (Core 5)</td><td class="text-center p-3">✅</td><td class="text-center p-3">✅</td><td class="text-center p-3">✅</td><td class="text-center p-3">✅</td></tr>
              <tr class="border-b bg-purple-50/30"><td class="p-3 font-semibold">📈 Reports (Advanced 8)</td><td class="text-center p-3 text-gray-400">—</td><td class="text-center p-3">✅</td><td class="text-center p-3">✅</td><td class="text-center p-3">✅</td></tr>
              <tr class="border-b"><td class="p-3 font-semibold">🤖 AI Bill Scan</td><td class="text-center p-3 text-gray-400">—</td><td class="text-center p-3">100/mo</td><td class="text-center p-3 font-bold text-green-600">∞</td><td class="text-center p-3 font-bold text-green-600">∞</td></tr>
              <tr class="border-b bg-purple-50/30"><td class="p-3 font-semibold">🏭 Bazaar Link</td><td class="text-center p-3 text-gray-400">—</td><td class="text-center p-3">✅</td><td class="text-center p-3">✅</td><td class="text-center p-3">✅</td></tr>
              <tr class="border-b"><td class="p-3 font-semibold">💰 Commission Module</td><td class="text-center p-3 text-gray-400">—</td><td class="text-center p-3">✅</td><td class="text-center p-3">✅</td><td class="text-center p-3">✅</td></tr>
              <tr class="border-b bg-purple-50/30"><td class="p-3 font-semibold">👥 HR Module</td><td class="text-center p-3 text-gray-400">—</td><td class="text-center p-3 text-gray-400">—</td><td class="text-center p-3">✅</td><td class="text-center p-3">✅</td></tr>
              <tr class="border-b"><td class="p-3 font-semibold">🏷️ White Label</td><td class="text-center p-3 text-gray-400">—</td><td class="text-center p-3 text-gray-400">—</td><td class="text-center p-3 text-gray-400">—</td><td class="text-center p-3">✅</td></tr>
              <tr class="border-b bg-purple-50/30"><td class="p-3 font-semibold">🔗 API Access</td><td class="text-center p-3 text-gray-400">—</td><td class="text-center p-3 text-gray-400">—</td><td class="text-center p-3 text-gray-400">—</td><td class="text-center p-3">✅</td></tr>
              <tr class="border-b"><td class="p-3 font-semibold">👤 Max Users</td><td class="text-center p-3">3</td><td class="text-center p-3">10</td><td class="text-center p-3 font-bold text-green-600">∞</td><td class="text-center p-3 font-bold text-green-600">∞</td></tr>
              <tr class="border-b bg-purple-50/30"><td class="p-3 font-semibold">🏢 Max Branches</td><td class="text-center p-3">1</td><td class="text-center p-3">3</td><td class="text-center p-3 font-bold text-green-600">∞</td><td class="text-center p-3 font-bold text-green-600">∞</td></tr>
              <tr><td class="p-3 font-semibold">📞 Support</td><td class="text-center p-3 text-xs">Email</td><td class="text-center p-3 text-xs">Email + WA</td><td class="text-center p-3 text-xs">Priority</td><td class="text-center p-3 text-xs">Dedicated CSM</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- FAQs -->
      <section class="max-w-4xl mx-auto px-6 mb-16">
        <h2 class="text-center font-display font-black text-3xl text-[#2d1040] mb-8">Frequently asked questions</h2>
        <div class="space-y-3">
          @for (faq of faqs; track faq.q; let i = $index) {
            <div class="bg-white border border-purple-100 rounded-lg overflow-hidden">
              <button (click)="toggleFaq(i)" class="w-full text-left px-5 py-4 flex justify-between items-center hover:bg-purple-50">
                <span class="font-bold text-[#2d1040]">{{ faq.q }}</span>
                <span class="text-2xl text-[#5c1a8b]">{{ openFaq() === i ? '−' : '+' }}</span>
              </button>
              @if (openFaq() === i) {
                <div class="px-5 pb-4 text-sm text-gray-700">{{ faq.a }}</div>
              }
            </div>
          }
        </div>
      </section>

      <!-- Bottom CTA -->
      <section class="bg-gradient-to-r from-[#4a1080] to-[#5c1a8b] text-white py-16 px-6 text-center">
        <h2 class="font-display font-black text-4xl mb-4">Ready to grow your business?</h2>
        <p class="text-xl mb-8 opacity-90">14 din free trial · No credit card · Cancel anytime</p>
        <div class="flex gap-4 justify-center flex-wrap">
          <a routerLink="/signup" class="bg-white text-[#5c1a8b] px-8 py-4 rounded-xl font-black text-lg hover:shadow-2xl transition">
            🚀 Start Free Trial
          </a>
          <a href="mailto:sales@anjaninex.com" class="border-2 border-white text-white px-8 py-4 rounded-xl font-black text-lg hover:bg-white hover:text-[#5c1a8b] transition">
            💬 Talk to Sales
          </a>
        </div>
      </section>

      <!-- Footer -->
      <footer class="bg-[#2d1040] text-white/70 text-center py-8 text-sm">
        © 2026 Anjaninex · Made in India 🇮🇳
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .toggle-active { background: linear-gradient(135deg, #4a1080, #5c1a8b); color: #fff; }

    .plan-card {
      background: #fff; border: 2px solid #ddc8f5; border-radius: 16px;
      padding: 28px 24px; position: relative;
      box-shadow: 0 4px 14px rgba(92,26,139,.06);
      transition: transform .2s, box-shadow .2s;
    }
    .plan-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(92,26,139,.18); }
    .plan-popular {
      border-color: #5c1a8b; border-width: 3px;
      background: linear-gradient(180deg, #faf5ff 0%, #fff 30%);
      transform: scale(1.03);
    }
    .plan-popular:hover { transform: scale(1.03) translateY(-4px); }
    .plan-badge {
      position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
      background: linear-gradient(135deg, #4a1080, #5c1a8b); color: #fff;
      padding: 6px 14px; border-radius: 20px; font-size: 10px; font-weight: 800;
      letter-spacing: 1px; white-space: nowrap;
    }

    .plan-cta {
      display: block; text-align: center; padding: 12px;
      background: #fff; color: #5c1a8b; border: 2px solid #5c1a8b;
      border-radius: 10px; font-weight: 800; font-size: 14px;
      text-decoration: none; transition: all .15s;
    }
    .plan-cta:hover { background: #5c1a8b; color: #fff; }
    .plan-cta-popular {
      background: linear-gradient(135deg, #4a1080, #5c1a8b); color: #fff;
    }
    .plan-cta-popular:hover { background: linear-gradient(135deg, #3a0a64, #4a1080); transform: translateY(-2px); }

    /* ===== MOBILE (<=640px) ===== */
    @media (max-width: 640px) {
      .plan-card { padding: 22px 16px; }
      .plan-popular { transform: none; }
      .plan-popular:hover { transform: translateY(-4px); }
      table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
    }
  `]
})
export class PricingPageComponent {
  plans = PLANS;
  addons = ADDONS;
  faqs = FAQS;

  billing = signal<'monthly' | 'annual'>('monthly');
  openFaq = signal<number | null>(null);

  displayPrice(plan: Plan): number {
    return this.billing() === 'annual' ? plan.annualInr : plan.monthlyInr;
  }
  savings(plan: Plan): number {
    return (plan.monthlyInr * 12) - plan.annualInr;
  }
  toggleFaq(i: number) {
    this.openFaq.set(this.openFaq() === i ? null : i);
  }
}
