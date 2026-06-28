/** Ported KALINDI global styles, scoped under `.dukan-scope` and rebranded for Online Dukan.
 *  Applied via ViewEncapsulation.None on the dukan shell components so child
 *  page components (rendered inside the shell) inherit these classes. */
export const DUKAN_STYLES = `
:root{--bg:#F4F5F7; --panel:#FFFFFF; --panel2:#FEF6DC; --line:#E4E7EC;
  --ink:#1F2430; --muted:#6B7280;
  --orange:#3A4252; --deep:#272D3A; --yellow:#3A4252; --gold:#B8860B;
  --green:#2E9E5B; --radius:14px; --shadow:0 6px 24px rgba(0,0,0,.10);}
.dukan-scope *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.dukan-scope{font-family:'DM Sans',system-ui,sans-serif;background:var(--bg);color:var(--ink);min-height:100vh}
.dukan-scope button{font-family:inherit;cursor:pointer}
.dukan-scope input, .dukan-scope select, .dukan-scope textarea{font-family:inherit;font-size:14px;padding:11px 13px;border:1px solid var(--line);border-radius:10px;background:#fff;width:100%;color:var(--ink)}
.dukan-scope label{font-size:12.5px;font-weight:600;color:var(--muted);display:block;margin:10px 0 5px}
.dukan-scope a{color:inherit;text-decoration:none}
.dukan-scope .hidden{display:none!important}
.dukan-scope .shell{display:flex;min-height:100vh}
.dukan-scope .sidebar{width:240px;background:linear-gradient(180deg,var(--orange),var(--yellow));flex-shrink:0;
  position:sticky;top:0;height:100vh;display:flex;flex-direction:column;color:#fff}
.dukan-scope .brand{padding:22px;font-family:Georgia,serif;font-size:22px;font-weight:800;letter-spacing:.5px}
.dukan-scope .brand small{display:block;font-family:'DM Sans';font-size:11px;font-weight:800;color:#FBBF24;letter-spacing:3px}
.dukan-scope .nav{flex:1;padding:8px 12px}
.dukan-scope .nav-item{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:10px;
  color:rgba(255,255,255,.88);font-size:14px;font-weight:600;margin-bottom:3px;transition:.15s;width:100%;background:none;border:none;text-align:left}
.dukan-scope .nav-item:hover{background:rgba(255,255,255,.16);color:#fff}
.dukan-scope .nav-item.on{background:rgba(255,255,255,.18);color:#fff;border:1px solid rgba(251,191,36,.6);border-left:4px solid #FBBF24}
.dukan-scope .nav-item .ic{font-size:17px;width:20px;text-align:center}
.dukan-scope .sidebar-foot{padding:12px;border-top:1px solid rgba(255,255,255,.2)}
.dukan-scope .logout-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:13px;border:none;
  border-radius:14px;font-size:14px;font-weight:800;letter-spacing:1px;color:#2A2300;
  background:#F2C200;
  box-shadow:0 4px 0 #B8860B,0 8px 16px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.4)}
.dukan-scope .logout-btn:active{transform:translateY(3px)}
.dukan-scope .main{flex:1;display:flex;flex-direction:column;min-width:0}
.dukan-scope .topbar{display:flex;align-items:center;gap:14px;padding:16px 24px;color:#fff;
  background:linear-gradient(90deg,var(--orange),var(--yellow));position:sticky;top:0;z-index:20}
.dukan-scope .topbar .tt{font-size:16px;font-weight:800}
.dukan-scope .topbar .ts{font-size:12px;opacity:.9}
.dukan-scope .topbar .actions{margin-left:auto;display:flex;gap:10px;align-items:center}
.dukan-scope .chip{background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.35);color:#fff;font-size:12.5px;
  font-weight:700;padding:8px 13px;border-radius:10px}
.dukan-scope .content{padding:22px;max-width:1100px;width:100%}
.dukan-scope .btn{background:#F2C200;color:#2A2300;border:none;
  padding:11px 18px;border-radius:10px;font-weight:700;font-size:14px}
.dukan-scope .btn.sm{padding:7px 12px;font-size:12.5px;border-radius:8px}
.dukan-scope .btn.ghost{background:#fff;color:var(--deep);border:1px solid var(--line)}
.dukan-scope .btn.danger{background:#fff;color:#c0392b;border:1px solid #f0c8c2}
.dukan-scope .card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}
.dukan-scope .grid{display:grid;gap:16px}
.dukan-scope .cards{grid-template-columns:repeat(auto-fill,minmax(210px,1fr))}
.dukan-scope .stats{grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
.dukan-scope .stat{padding:18px;border-radius:var(--radius);color:#fff;position:relative;overflow:hidden;
  box-shadow:0 8px 22px rgba(0,0,0,.12);transition:transform .2s,box-shadow .2s}
.dukan-scope .stat:hover{transform:translateY(-4px);box-shadow:0 14px 30px rgba(0,0,0,.18)}
.dukan-scope .stat::after{content:'';position:absolute;right:-24px;bottom:-24px;width:90px;height:90px;border-radius:50%;background:rgba(255,255,255,.08)}
.dukan-scope .stat::before{content:'';position:absolute;right:24px;top:-30px;width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,.06)}
.dukan-scope .stat h4{font-size:13px;font-weight:600;opacity:.92;position:relative;z-index:1}
.dukan-scope .stat .v{font-size:28px;font-weight:800;margin-top:6px;position:relative;z-index:1}
.dukan-scope .stat-ic{font-size:22px;opacity:.9;position:relative;z-index:1}
.dukan-scope .trend-up{display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:800;background:rgba(255,255,255,.22);padding:2px 8px;border-radius:20px;margin-top:6px;position:relative;z-index:1}
.dukan-scope .card{transition:box-shadow .2s,transform .2s}
.dukan-scope .content .card:hover{box-shadow:0 10px 28px rgba(0,0,0,.10)}
.dukan-scope .prod{overflow:hidden;display:flex;flex-direction:column}
.dukan-scope .prod .ph{height:150px;background:linear-gradient(135deg,var(--panel2),#fff);display:flex;align-items:center;justify-content:center;
  font-size:38px;color:var(--gold);border-bottom:1px solid var(--line)}
.dukan-scope .prod .body{padding:12px;flex:1;display:flex;flex-direction:column}
.dukan-scope .prod .nm{font-weight:700;font-size:14px;line-height:1.3}
.dukan-scope .prod .cd{font-size:11px;color:var(--muted);margin:2px 0 8px}
.dukan-scope .price{display:flex;align-items:baseline;gap:8px}
.dukan-scope .price .mrp{text-decoration:line-through;color:var(--muted);font-size:12.5px}
.dukan-scope .price .rt{font-size:18px;font-weight:800;color:var(--deep)}
.dukan-scope .badge{font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:20px}
.dukan-scope .badge.off{background:#e7f7ed;color:var(--green)}
.dukan-scope .badge.combo{background:#FEF3C7;color:#92600A}
.dukan-scope .badge.low{background:#fdeaea;color:#c0392b}
.dukan-scope .row{display:flex;align-items:center;gap:10px}
.dukan-scope .sec-head{font-size:16px;font-weight:800;margin:22px 0 12px;display:flex;align-items:center;gap:10px}
.dukan-scope .sec-head .pill{font-size:11px;font-weight:800;background:#FBBF24;color:#5C3D00;padding:3px 11px;border-radius:20px}
.dukan-scope .tbl{width:100%;border-collapse:collapse;font-size:13.5px}
.dukan-scope .tbl th, .dukan-scope .tbl td{text-align:left;padding:11px 12px;border-bottom:1px solid var(--line)}
.dukan-scope .tbl th{color:var(--muted);font-size:12px;font-weight:700}
.dukan-scope .empty{text-align:center;padding:40px;color:var(--muted)}
.dukan-scope .qty{display:flex;align-items:center;gap:8px}
.dukan-scope .qty button{width:30px;height:30px;border-radius:8px;border:1px solid var(--line);background:#fff;font-weight:800;color:var(--deep)}
.dukan-scope .formgrid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
.dukan-scope .login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;
  background:radial-gradient(1200px 600px at 50% -10%,#DBEAFE,transparent),var(--bg)}
.dukan-scope .login-card{width:100%;max-width:400px;padding:28px}
.dukan-scope .logo-box{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px;text-align:center;margin-bottom:20px;
  font-family:Georgia,serif;font-size:30px;font-weight:800;color:var(--ink);box-shadow:var(--shadow)}
.dukan-scope .logo-box small{display:block;font-family:'DM Sans';font-size:12px;letter-spacing:4px;color:var(--gold);font-weight:700}
.dukan-scope .toggle{display:flex;background:var(--panel2);border-radius:12px;padding:5px;margin-bottom:18px}
.dukan-scope .toggle button{flex:1;padding:11px;border:none;background:none;font-weight:700;color:var(--muted);border-radius:9px}
.dukan-scope .toggle button.on{background:linear-gradient(90deg,var(--orange),var(--yellow));color:#fff}
.dukan-scope .foot{text-align:center;font-size:11.5px;color:var(--muted);margin-top:18px}
.dukan-scope .pin-row{display:flex;gap:8px;justify-content:center;margin-top:4px}
.dukan-scope .pin-box{width:44px;height:50px;text-align:center;font-size:22px;font-weight:800;padding:0;border:1.5px solid var(--line);border-radius:10px}
.dukan-scope .pin-box:focus{border-color:var(--orange);outline:none;box-shadow:0 0 0 3px rgba(58,66,82,.12)}
.dukan-scope .remember{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);margin-top:14px;cursor:pointer;user-select:none}
.dukan-scope .remember input{width:auto;margin:0}

@media(max-width:760px){
  .dukan-scope .sidebar{position:fixed;left:0;top:0;z-index:50;transform:translateX(-100%);transition:.25s}
  .dukan-scope .sidebar.open{transform:translateX(0)}
  .dukan-scope .formgrid{grid-template-columns:1fr}
  .dukan-scope .content{padding:16px}
  .dukan-scope .grid{grid-template-columns:1fr !important}
}
.dukan-scope .chip-pick{font-size:12.5px;font-weight:700;padding:6px 12px;border-radius:20px;cursor:pointer;border:1px solid var(--line);user-select:none}
.dukan-scope .chip-pick:hover{filter:brightness(.97)}
.dukan-scope .stars-lg{display:flex;gap:3px;font-size:24px;color:#F2C200;line-height:1}
.dukan-scope .stars-lg.pick span{cursor:pointer;transition:transform .1s}
.dukan-scope .stars-lg.pick span:hover{transform:scale(1.15)}
.dukan-scope .sw{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;user-select:none}
.dukan-scope .sw input{display:none}
.dukan-scope .sw-track{width:38px;height:21px;border-radius:20px;background:var(--line);position:relative;transition:.2s;flex-shrink:0}
.dukan-scope .sw-track::after{content:'';position:absolute;top:2px;left:2px;width:17px;height:17px;border-radius:50%;background:#fff;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.dukan-scope .sw input:checked + .sw-track{background:var(--orange)}
.dukan-scope .sw input:checked + .sw-track::after{transform:translateX(17px)}
.dukan-scope .lb-overlay{position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:300;display:flex;align-items:center;justify-content:center;overflow:hidden}
.dukan-scope .lb-img{max-width:92vw;max-height:82vh;border-radius:8px;transition:transform .08s ease-out;touch-action:none;user-select:none;-webkit-user-drag:none}
.dukan-scope .lb-bar{position:fixed;top:16px;right:16px;display:flex;gap:8px;z-index:301}
.dukan-scope .lb-bar button{width:42px;height:42px;border-radius:10px;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:18px;font-weight:800;cursor:pointer;backdrop-filter:blur(4px)}
.dukan-scope .lb-bar button:hover{background:rgba(255,255,255,.28)}
.dukan-scope .lb-bar button:nth-child(2){width:auto;padding:0 12px;font-size:13px}
.dukan-scope .lb-hint{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.7);font-size:12px;text-align:center}
.dukan-scope .toast-wrap{position:fixed;right:18px;bottom:18px;z-index:200;display:flex;flex-direction:column;gap:10px;max-width:320px}
.dukan-scope .toast{display:flex;align-items:center;gap:10px;background:#1f2937;color:#fff;padding:12px 16px;border-radius:12px;
  font-size:13.5px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.25);border-left:4px solid #2E9E5B;
  animation:toastIn .25s ease}
.dukan-scope .toast-info{border-left-color:#3A4252}
.dukan-scope .toast-error{border-left-color:#c0392b}
@keyframes toastIn{from{opacity:0;transform:translateY(12px)}
.dukan-scope to{opacity:1;transform:none}
.dukan-scope }
@media(max-width:760px){.toast-wrap{left:12px;right:12px;bottom:12px;max-width:none}
.dukan-scope }


@media print{body *{visibility:hidden}
.dukan-scope .printable, .dukan-scope .printable *{visibility:visible}
.dukan-scope .printable{position:absolute;left:0;top:0;width:100%;box-shadow:none;border:none}
.dukan-scope .no-print, .dukan-scope .sidebar, .dukan-scope .topbar{display:none !important}

/* ===== LAYOUT FIX — dukan shell must fit INSIDE the Anjaninex content area =====
   (admin pages render inside the Anjaninex shell which already has its own outer
   sidebar; the dukan full-width 100vh shell was overflowing horizontally and
   pushing content off-screen → page looked blank). */
.dukan-scope.shell, .dukan-scope .shell{ min-height:auto; width:100%; max-width:100%; overflow-x:hidden; }
.dukan-scope .sidebar{ position:relative; top:auto; height:auto; align-self:stretch; }
.dukan-scope .main{ flex:1 1 0%; min-width:0; max-width:100%; }
.dukan-scope .topbar{ position:relative; }
.dukan-scope .content{ max-width:100%; }
/* Horizontal tab nav (Bazaar Link style) — replaces inner vertical sidebar */
.dukan-scope .dk-tabs{display:flex;gap:2px;border-bottom:1px solid #E4E7EC;overflow-x:auto;margin:6px 0 18px}
.dukan-scope .dk-tab{padding:10px 16px;font-size:13.5px;font-weight:600;color:#6B7280;border-bottom:2px solid transparent;white-space:nowrap;text-decoration:none;display:inline-flex;gap:6px;align-items:center;background:none;border-top:0;border-left:0;border-right:0;cursor:pointer}
.dukan-scope .dk-tab:hover{color:#16294F}
.dukan-scope .dk-tab.dk-tab-on{color:#16294F;border-bottom-color:#E1232A;font-weight:800}
@media print{
  .dukan-scope .no-print, .dukan-scope .sidebar, .dukan-scope .topbar{display:none !important}
}
`;
