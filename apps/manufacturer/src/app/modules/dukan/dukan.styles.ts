/** Online Dukan — world-class admin design system.
 *  Scoped under `.dukan-scope` (applied via ViewEncapsulation.None on the shell)
 *  so all child page components inherit these classes. Class names match the
 *  existing page templates, so restyling here upgrades every page at once. */
export const DUKAN_STYLES = `
:root{
  --bg:#F5F6F9; --panel:#FFFFFF; --panel2:#FFF8E8; --line:#E7E9EF; --line2:#EEF0F4;
  --ink:#151A24; --muted:#6A7384; --faint:#9AA2B1;
  --brand:#16294F; --brand2:#23427E; --accent:#E1232A; --accent2:#F04438;
  --gold:#C28E1B; --green:#16A34A; --amber:#F2A60C;
  --radius:16px; --radius-sm:11px;
  --shadow:0 1px 2px rgba(16,24,40,.04),0 8px 24px rgba(16,24,40,.06);
  --shadow-lg:0 12px 36px rgba(16,24,40,.12);
  --ring:0 0 0 4px rgba(22,41,79,.12);
}
.dukan-scope *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.dukan-scope{font-family:'Inter','DM Sans',system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--ink);min-height:100%;-webkit-font-smoothing:antialiased;letter-spacing:-.01em}
.dukan-scope button{font-family:inherit;cursor:pointer}
.dukan-scope a{color:inherit;text-decoration:none}
.dukan-scope .hidden{display:none!important}

/* ---------- Forms ---------- */
.dukan-scope input, .dukan-scope select, .dukan-scope textarea{
  font-family:inherit;font-size:14px;padding:12px 14px;border:1.5px solid var(--line);
  border-radius:12px;background:#fff;width:100%;color:var(--ink);transition:border-color .15s,box-shadow .15s;outline:none}
.dukan-scope input::placeholder,.dukan-scope textarea::placeholder{color:var(--faint)}
.dukan-scope input:focus, .dukan-scope select:focus, .dukan-scope textarea:focus{border-color:var(--brand);box-shadow:var(--ring)}
.dukan-scope label{font-size:11px;font-weight:700;color:var(--muted);display:block;margin:12px 0 6px;text-transform:uppercase;letter-spacing:.05em}
.dukan-scope .formgrid{display:grid;grid-template-columns:1fr 1fr;gap:2px 16px}

/* ---------- Buttons ---------- */
.dukan-scope .btn{background:linear-gradient(180deg,var(--brand2),var(--brand));color:#fff;border:none;
  padding:12px 20px;border-radius:12px;font-weight:700;font-size:14px;letter-spacing:0;
  box-shadow:0 2px 6px rgba(22,41,79,.25);transition:transform .12s,box-shadow .15s,filter .15s}
.dukan-scope .btn:hover{filter:brightness(1.07);box-shadow:0 6px 16px rgba(22,41,79,.3)}
.dukan-scope .btn:active{transform:translateY(1px)}
.dukan-scope .btn.sm{padding:8px 13px;font-size:12.5px;border-radius:9px;box-shadow:none}
.dukan-scope .btn.ghost{background:#fff;color:var(--brand);border:1.5px solid var(--line);box-shadow:none}
.dukan-scope .btn.ghost:hover{filter:none;border-color:var(--brand);background:#F7F9FC}
.dukan-scope .btn.accent{background:linear-gradient(180deg,var(--accent2),var(--accent));box-shadow:0 2px 6px rgba(225,35,42,.3)}
.dukan-scope .btn.danger{background:#fff;color:var(--accent);border:1.5px solid #F3CFCC;box-shadow:none}
.dukan-scope .btn.danger:hover{background:#FEF3F2;filter:none}
.dukan-scope .btn:disabled{opacity:.55;cursor:not-allowed}

/* ---------- Cards ---------- */
.dukan-scope .card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);transition:box-shadow .2s,transform .2s}
.dukan-scope .content .card:hover,.dukan-scope .card.hover:hover{box-shadow:var(--shadow-lg);transform:translateY(-2px)}
.dukan-scope .grid{display:grid;gap:18px}
.dukan-scope .cards{grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.dukan-scope .stats{grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}

/* ---------- Stat tiles (premium gradients; override any inline bg) ---------- */
.dukan-scope .stat{padding:20px;border-radius:var(--radius);color:#fff;position:relative;overflow:hidden;
  box-shadow:0 10px 24px rgba(16,24,40,.14);transition:transform .2s,box-shadow .2s}
.dukan-scope .stat:hover{transform:translateY(-4px);box-shadow:0 18px 36px rgba(16,24,40,.2)}
.dukan-scope .stat::after{content:'';position:absolute;right:-30px;bottom:-30px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.10)}
.dukan-scope .stat::before{content:'';position:absolute;right:30px;top:-34px;width:70px;height:70px;border-radius:50%;background:rgba(255,255,255,.07)}
.dukan-scope .stat h4{font-size:12.5px;font-weight:600;opacity:.92;position:relative;z-index:1;letter-spacing:.01em}
.dukan-scope .stat .v{font-size:30px;font-weight:800;margin-top:8px;position:relative;z-index:1;letter-spacing:-.02em}
.dukan-scope .stat-ic{font-size:22px;opacity:.95;position:relative;z-index:1}
.dukan-scope .stat .trend-up,.dukan-scope .trend-up{display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:800;background:rgba(255,255,255,.22);padding:3px 9px;border-radius:20px;margin-top:8px;position:relative;z-index:1}
.dukan-scope .stats .stat:nth-child(4n+1){background:linear-gradient(135deg,#1E3A6E,#16294F)!important;color:#fff!important}
.dukan-scope .stats .stat:nth-child(4n+2){background:linear-gradient(135deg,#F2A60C,#D98308)!important;color:#fff!important}
.dukan-scope .stats .stat:nth-child(4n+3){background:linear-gradient(135deg,#14B8A6,#0E8C7F)!important;color:#fff!important}
.dukan-scope .stats .stat:nth-child(4n+4){background:linear-gradient(135deg,#7C5CFC,#5B3FD6)!important;color:#fff!important}
.dukan-scope .stats .stat:nth-child(4n+2) h4{opacity:.95}

/* ---------- Product card ---------- */
.dukan-scope .prod{overflow:hidden;display:flex;flex-direction:column}
.dukan-scope .prod .ph{height:160px;background:linear-gradient(135deg,var(--panel2),#fff);display:flex;align-items:center;justify-content:center;
  font-size:40px;color:var(--gold);border-bottom:1px solid var(--line)}
.dukan-scope .prod .body{padding:14px;flex:1;display:flex;flex-direction:column}
.dukan-scope .prod .nm{font-weight:700;font-size:14px;line-height:1.3}
.dukan-scope .prod .cd{font-size:11px;color:var(--muted);margin:2px 0 8px}
.dukan-scope .price{display:flex;align-items:baseline;gap:8px}
.dukan-scope .price .mrp{text-decoration:line-through;color:var(--muted);font-size:12.5px}
.dukan-scope .price .rt{font-size:18px;font-weight:800;color:var(--brand)}

/* ---------- Badges ---------- */
.dukan-scope .badge{font-size:10.5px;font-weight:800;padding:3px 9px;border-radius:20px;letter-spacing:.02em}
.dukan-scope .badge.off{background:#E7F8EE;color:var(--green)}
.dukan-scope .badge.combo{background:#FEF3C7;color:#92600A}
.dukan-scope .badge.low{background:#FEECEB;color:var(--accent)}

/* ---------- Bits ---------- */
.dukan-scope .row{display:flex;align-items:center;gap:10px}
.dukan-scope .sec-head{font-size:17px;font-weight:800;margin:24px 0 14px;display:flex;align-items:center;gap:10px;letter-spacing:-.02em}
.dukan-scope .sec-head .pill{font-size:11px;font-weight:800;background:var(--brand);color:#fff;padding:4px 12px;border-radius:20px}
.dukan-scope .tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13.5px}
.dukan-scope .tbl th, .dukan-scope .tbl td{text-align:left;padding:13px 14px;border-bottom:1px solid var(--line2)}
.dukan-scope .tbl th{color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;background:#FAFBFC}
.dukan-scope .tbl tbody tr{transition:background .12s}
.dukan-scope .tbl tbody tr:hover{background:#FAFBFD}
.dukan-scope .empty{text-align:center;padding:48px 24px;color:var(--muted)}
.dukan-scope .qty{display:flex;align-items:center;gap:8px}
.dukan-scope .qty button{width:32px;height:32px;border-radius:9px;border:1.5px solid var(--line);background:#fff;font-weight:800;color:var(--brand)}
.dukan-scope .chip{background:#EEF2F8;border:1px solid var(--line);color:var(--brand);font-size:12.5px;font-weight:700;padding:8px 13px;border-radius:10px}
.dukan-scope .chip-pick{font-size:12.5px;font-weight:700;padding:7px 13px;border-radius:20px;cursor:pointer;border:1.5px solid var(--line);user-select:none;transition:.12s}
.dukan-scope .chip-pick:hover{border-color:var(--brand);background:#F5F8FC}
.dukan-scope .stars-lg{display:flex;gap:3px;font-size:24px;color:var(--amber);line-height:1}
.dukan-scope .stars-lg.pick span{cursor:pointer;transition:transform .1s}
.dukan-scope .stars-lg.pick span:hover{transform:scale(1.15)}

/* ---------- Toggle switch ---------- */
.dukan-scope .sw{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;user-select:none}
.dukan-scope .sw input{display:none}
.dukan-scope .sw-track{width:40px;height:22px;border-radius:20px;background:var(--line);position:relative;transition:.2s;flex-shrink:0}
.dukan-scope .sw-track::after{content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.dukan-scope .sw input:checked + .sw-track{background:var(--brand)}
.dukan-scope .sw input:checked + .sw-track::after{transform:translateX(18px)}

/* ---------- Header + horizontal tabs (Bazaar Link style) ---------- */
.dukan-scope .dk-tabs{display:flex;gap:4px;border-bottom:1.5px solid var(--line);overflow-x:auto;margin:8px 0 22px;scrollbar-width:none}
.dukan-scope .dk-tabs::-webkit-scrollbar{display:none}
.dukan-scope .dk-tab{padding:11px 16px;font-size:13.5px;font-weight:600;color:var(--muted);border-bottom:2.5px solid transparent;white-space:nowrap;text-decoration:none;display:inline-flex;gap:7px;align-items:center;background:none;border-top:0;border-left:0;border-right:0;cursor:pointer;transition:color .12s;margin-bottom:-1.5px;border-radius:8px 8px 0 0}
.dukan-scope .dk-tab:hover{color:var(--brand);background:#EEF2F8}
.dukan-scope .dk-tab.dk-tab-on{color:var(--brand);border-bottom-color:var(--accent);font-weight:800}

/* ---------- Login (buyer) ---------- */
.dukan-scope .shell{display:flex;min-height:100%}
.dukan-scope .login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;
  background:radial-gradient(1200px 600px at 50% -10%,#DBEAFE,transparent),var(--bg)}
.dukan-scope .login-card{width:100%;max-width:410px;padding:30px}
.dukan-scope .logo-box{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px;text-align:center;margin-bottom:20px;
  font-weight:800;font-size:28px;color:var(--ink);box-shadow:var(--shadow)}
.dukan-scope .logo-box small{display:block;font-size:12px;letter-spacing:4px;color:var(--gold);font-weight:700}
.dukan-scope .toggle{display:flex;background:#EEF2F8;border-radius:12px;padding:5px;margin-bottom:18px}
.dukan-scope .toggle button{flex:1;padding:11px;border:none;background:none;font-weight:700;color:var(--muted);border-radius:9px;transition:.15s}
.dukan-scope .toggle button.on{background:linear-gradient(180deg,var(--brand2),var(--brand));color:#fff}
.dukan-scope .foot{text-align:center;font-size:11.5px;color:var(--muted);margin-top:18px}
.dukan-scope .pin-row{display:flex;gap:8px;justify-content:center;margin-top:4px}
.dukan-scope .pin-box{width:46px;height:52px;text-align:center;font-size:22px;font-weight:800;padding:0;border:1.5px solid var(--line);border-radius:11px}
.dukan-scope .pin-box:focus{border-color:var(--brand);box-shadow:var(--ring)}
.dukan-scope .remember{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);margin-top:14px;cursor:pointer;user-select:none}
.dukan-scope .remember input{width:auto;margin:0}

/* ---------- Lightbox ---------- */
.dukan-scope .lb-overlay{position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:300;display:flex;align-items:center;justify-content:center;overflow:hidden}
.dukan-scope .lb-img{max-width:92vw;max-height:82vh;border-radius:8px;transition:transform .08s ease-out;touch-action:none;user-select:none;-webkit-user-drag:none}
.dukan-scope .lb-bar{position:fixed;top:16px;right:16px;display:flex;gap:8px;z-index:301}
.dukan-scope .lb-bar button{width:42px;height:42px;border-radius:10px;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:18px;font-weight:800;cursor:pointer;backdrop-filter:blur(4px)}
.dukan-scope .lb-bar button:hover{background:rgba(255,255,255,.28)}
.dukan-scope .lb-bar button:nth-child(2){width:auto;padding:0 12px;font-size:13px}
.dukan-scope .lb-hint{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.7);font-size:12px;text-align:center}

/* ---------- Toasts ---------- */
.dukan-scope .toast-wrap{position:fixed;right:18px;bottom:18px;z-index:200;display:flex;flex-direction:column;gap:10px;max-width:340px}
.dukan-scope .toast{display:flex;align-items:center;gap:10px;background:#161B26;color:#fff;padding:13px 17px;border-radius:13px;
  font-size:13.5px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.25);border-left:4px solid var(--green);animation:dkToastIn .25s ease}
.dukan-scope .toast-info{border-left-color:var(--brand2)}
.dukan-scope .toast-error{border-left-color:var(--accent)}
@keyframes dkToastIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}

/* ---------- Layout fit (render inside Anjaninex content area) ---------- */
.dukan-scope.shell, .dukan-scope .shell{min-height:auto;width:100%;max-width:100%;overflow-x:hidden}
.dukan-scope .main{flex:1 1 0%;min-width:0;max-width:100%;display:flex;flex-direction:column}
.dukan-scope .content{padding:0;max-width:100%;width:100%}

/* ---------- Responsive ---------- */
@media(max-width:760px){
  .dukan-scope .formgrid{grid-template-columns:1fr}
  .dukan-scope .grid{grid-template-columns:1fr !important}
}

/* ---------- Print ---------- */
@media print{
  body *{visibility:hidden}
  .dukan-scope .printable, .dukan-scope .printable *{visibility:visible}
  .dukan-scope .printable{position:absolute;left:0;top:0;width:100%;box-shadow:none;border:none}
  .dukan-scope .no-print, .dukan-scope .dk-tabs{display:none !important}
}
`;
