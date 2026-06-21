/* ============================================================================
 * Anjaninex Business Suite — k6 Load Test (500 concurrent users)
 * ----------------------------------------------------------------------------
 * Kya karta hai: login → real READ endpoints (bills/orders/parties/ledgers)
 * + ek WRITE (naya party create, unique data taaki duplicate-block na ho).
 * 500 virtual users (VU) tak ramp karta hai aur p95 response time, error rate,
 * throughput report karta hai.
 *
 * ⚠️ PRODUCTION par reads+writes MAT chalao — alag TEST instance par chalao
 *    (alag DB + API doosre port par). Setup README.md mein hai.
 *
 * Chalao:
 *   k6 run -e BASE_URL=http://127.0.0.1:5099 \
 *          -e USER=riddhi -e PASS=yourpass \
 *          -e BRANCH_ID=<branch-guid> \
 *          k6-loadtest.js
 *
 * Sirf READ test (production-safe) chahiye to: -e WRITE=0
 * ============================================================================ */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ---- Config (env se) ----
const BASE = __ENV.BASE_URL || 'http://127.0.0.1:5099';
const USER = __ENV.USER || 'riddhi';
const PASS = __ENV.PASS || '';
const BRANCH_ID = __ENV.BRANCH_ID || '';
const DO_WRITE = (__ENV.WRITE ?? '1') !== '0';   // WRITE=0 → sirf reads (safe)
const PEAK = parseInt(__ENV.PEAK || '500', 10);  // peak virtual users

// ---- Custom metrics ----
const loginFail = new Counter('login_failures');
const writeOk = new Counter('writes_created');
const apiErrors = new Counter('api_errors');
const readTrend = new Trend('read_ms', true);
const writeTrend = new Trend('write_ms', true);

// ---- Load profile: 0 → PEAK ramp, hold, ramp down ----
export const options = {
  scenarios: {
    ramp_to_peak: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: Math.round(PEAK * 0.2) },  // warm-up 20%
        { duration: '2m', target: Math.round(PEAK * 0.5) },  // 50%
        { duration: '2m', target: PEAK },                    // 100% (500)
        { duration: '3m', target: PEAK },                    // hold @ peak
        { duration: '1m', target: 0 },                       // ramp down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],     // <2% errors warna FAIL
    http_req_duration: ['p(95)<1500'],  // p95 < 1.5s warna FAIL
    read_ms: ['p(95)<1200'],
  },
};

// ---- Login ek baar setup() me; token sab VU share karte hain ----
// (Note: ye server throughput test karta hai. Alag-alag 500 real users
//  chahiye to README me "user pool" wala tareeka hai.)
export function setup() {
  const res = http.post(`${BASE}/api/auth/login`,
    JSON.stringify({ identifier: USER, password: PASS }),
    { headers: { 'Content-Type': 'application/json' } });

  const ok = check(res, { 'login 200': r => r.status === 200 });
  if (!ok) {
    loginFail.add(1);
    throw new Error(`Login fail (${res.status}): ${res.body}`);
  }
  const token = res.json('accessToken');
  if (!token) throw new Error('No accessToken in login response');
  return { token };
}

function authHeaders(token) {
  const h = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
  if (BRANCH_ID) h['X-Branch-Id'] = BRANCH_ID;
  return h;
}

export default function (data) {
  const headers = authHeaders(data.token);

  // ---------- READS (har user browsing kar raha) ----------
  group('reads', () => {
    const reqs = [
      ['bills',   `${BASE}/api/trading/bills?size=50`],
      ['orders',  `${BASE}/api/trading/orders?size=50`],
      ['parties', `${BASE}/api/trading/parties`],
      ['ledgers', `${BASE}/api/accounting/ledgers`],
    ];
    for (const [name, url] of reqs) {
      const r = http.get(url, { headers, tags: { ep: name } });
      readTrend.add(r.timings.duration);
      const ok = check(r, { [`${name} 2xx`]: x => x.status >= 200 && x.status < 300 });
      if (!ok) apiErrors.add(1);
      sleep(randomIntBetween(1, 3) / 10);   // 0.1–0.3s think-time
    }
  });

  // ---------- WRITE (naya party — unique, duplicate-safe) ----------
  if (DO_WRITE) {
    group('write_party', () => {
      const uniq = `${__VU}_${__ITER}_${Date.now()}`;
      const phone = `9${randomIntBetween(100000000, 999999999)}`;   // unique-ish 10-digit
      const body = {
        displayName: `LOADTEST_${uniq}`,   // prefix se baad me cleanup aasaan
        phone,
        gst: null, pan: null,
        address: 'Load Test', city: 'Surat', state: 'Gujarat', pincode: '395003',
        partyType: 'buyer',
        creditLimit: 0, creditDays: 30, commissionRate: 0,
        openingBalance: 0, openingType: 'Dr',
      };
      const r = http.post(`${BASE}/api/trading/parties`,
        JSON.stringify(body), { headers, tags: { ep: 'create_party' } });
      writeTrend.add(r.timings.duration);
      const ok = check(r, { 'party created 2xx': x => x.status >= 200 && x.status < 300 });
      if (ok) writeOk.add(1); else apiErrors.add(1);
    });
  }

  sleep(randomIntBetween(3, 8) / 10);   // 0.3–0.8s between iterations
}
