# -*- coding: utf-8 -*-
# Anjaninex — world-class visiting card + tri-fold brochure (company overview).
import base64, os, cairosvg

BASE = "/sessions/busy-focused-pascal/mnt/Indian B2B SaaS platform"
OUT  = os.path.join(BASE, "marketing", "brand")
os.makedirs(OUT, exist_ok=True)
LOGO_URI = "data:image/jpeg;base64," + base64.b64encode(
    open(os.path.join(BASE, "apps/web/public/anjaninex-logo.jpeg"), "rb").read()).decode()

NAVY="#16294F"; NAVY2="#0E1B36"; RED="#E1232A"; GOLD="#C9A14A"
CREAM="#F6F1E7"; INK="#1B2640"; GREY="#6A789200"; GREY="#6A7892"

P1N="Kapil Sharma"; P1P="+91 96642 50416"
P2N="Jitesh Yadav"; P2P="+91 95115 40583"
EMAIL="support@anjaninex.com"; WEB="trade.anjaninex.com"
ADDR1="Ramtalai, Next to DPS School, inside Surajpol Gate,"
ADDR2="Gumanpura, Kota, Rajasthan"

def E(s): return s.replace("&","&amp;")
def render(parts, name):
    svg="".join(parts)
    open(os.path.join(OUT,name+".svg"),"w",encoding="utf-8").write(svg)
    cairosvg.svg2png(bytestring=svg.encode(),write_to=os.path.join(OUT,name+".png"),scale=2.0)
    cairosvg.svg2pdf(bytestring=svg.encode(),write_to=os.path.join(OUT,name+".pdf"))
    print("ok",name)

def T(x,y,s,size,fill,weight="400",anchor="start",ls="0",font="Arial"):
    return (f'<text x="{x}" y="{y}" font-family="{font}" font-size="{size}" font-weight="{weight}" '
            f'letter-spacing="{ls}" fill="{fill}" text-anchor="{anchor}">{E(s)}</text>')

DEFS=(f'<defs>'
      f'<linearGradient id="nv" x1="0" y1="0" x2="1" y2="1">'
      f'<stop offset="0" stop-color="{NAVY}"/><stop offset="1" stop-color="{NAVY2}"/></linearGradient>'
      f'<filter id="sh" x="-20%" y="-20%" width="140%" height="140%">'
      f'<feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#000" flood-opacity="0.18"/></filter>'
      f'</defs>')

# ===================== VISITING CARD 90x54mm -> 1063x638 =====================
W,H=1063,638
cf=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',DEFS]
cf.append(f'<rect width="{W}" height="{H}" fill="url(#nv)"/>')
# faint watermark logo
cf.append(f'<image href="{LOGO_URI}" x="{W-470}" y="{H-470}" width="560" height="560" opacity="0.05"/>')
# red corner accent (top-right)
cf.append(f'<path d="M {W} 0 L {W} 220 Q {W-300} 120 {W-360} 0 Z" fill="{RED}"/>')
cf.append(f'<circle cx="{W-70}" cy="60" r="14" fill="{GOLD}"/>')
# white logo chip (soft shadow) on left
cf.append(f'<rect x="64" y="170" width="300" height="300" rx="34" fill="#ffffff" filter="url(#sh)"/>')
cf.append(f'<image href="{LOGO_URI}" x="84" y="190" width="260" height="260" preserveAspectRatio="xMidYMid meet"/>')
# wordmark + tagline
cf.append(f'<text x="404" y="300" font-family="Arial" font-size="78" font-weight="800" fill="#fff">Anjani<tspan fill="{RED}">nex</tspan></text>')
cf.append(f'<rect x="406" y="330" width="250" height="3" fill="{GOLD}"/>')
cf.append(T(406,372,"BUSINESS  SUITE",28,CREAM,"700",ls="6"))
cf.append(T(406,430,"Trade · Accounts · GST · Automation",24,"#c8d2e6"))
# bottom thin bar
cf.append(f'<rect x="0" y="{H-10}" width="{W}" height="10" fill="{RED}"/>')
cf.append(f'<rect x="0" y="{H-10}" width="{W*0.4}" height="10" fill="{GOLD}"/>')
cf.append('</svg>')
render(cf,"visiting-card-FRONT")

cb=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',DEFS]
cb.append(f'<rect width="{W}" height="{H}" fill="{CREAM}"/>')
cb.append(f'<rect x="0" y="0" width="16" height="{H}" fill="{RED}"/>')
cb.append(f'<rect x="16" y="0" width="9" height="{H}" fill="{NAVY}"/>')
cb.append(f'<image href="{LOGO_URI}" x="{W-300}" y="46" width="240" height="150" preserveAspectRatio="xMidYMid meet"/>')
cb.append(f'<text x="74" y="118" font-family="Arial" font-size="56" font-weight="800" fill="{NAVY}">Anjani<tspan fill="{RED}">nex</tspan></text>')
cb.append(T(76,156,"Business Software · Bharat ke vyapariyon ke liye",22,GREY))
cb.append(f'<rect x="74" y="184" width="120" height="4" fill="{GOLD}"/>')
def L(x,y,t): return T(x,y,t,21,RED,"800",ls="1")
def V(x,y,t,sz=29,fl=INK): return T(x,y,t,sz,fl)
cb.append(L(74,262,"CONTACT"))
cb.append(V(74,322,P1N,29,NAVY)); cb.append(V(360,322,P1P,29))
cb.append(V(74,378,P2N,29,NAVY)); cb.append(V(360,378,P2P,29))
cb.append(L(74,444,"EMAIL"));   cb.append(V(230,444,EMAIL,27))
cb.append(L(74,498,"WEBSITE")); cb.append(V(230,498,WEB,27))
cb.append(L(74,552,"ADDRESS")); cb.append(V(230,548,ADDR1,22)); cb.append(V(230,580,ADDR2,22))
cb.append('</svg>')
render(cb,"visiting-card-BACK")

# ===================== BROCHURE tri-fold A4 landscape 3508x2480 =====================
BW,BH=3508,2480; P=BW/3.0; cx=P
c0=P/2; c1=P+P/2; c2=2*P+P/2

def H2(cxx,t,sub):
    return (T(cxx,250,t,66,NAVY,"800","middle")
            + f'<rect x="{cxx-110}" y="290" width="220" height="6" fill="{GOLD}"/>'
            + T(cxx,358,sub,38,GREY,"400","middle"))
def B(x,y,t):
    return (f'<circle cx="{x+12}" cy="{y-14}" r="10" fill="{RED}"/>'
            + T(x+46,y,t,43,INK))

o=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{BW}" height="{BH}" viewBox="0 0 {BW} {BH}">',DEFS]
o.append(f'<rect width="{BW}" height="{BH}" fill="{CREAM}"/>')
o.append(f'<line x1="{P}" y1="0" x2="{P}" y2="{BH}" stroke="#ddd6c6" stroke-dasharray="14 14"/>')
o.append(f'<line x1="{2*P}" y1="0" x2="{2*P}" y2="{BH}" stroke="#ddd6c6" stroke-dasharray="14 14"/>')
# Cover (center)
o.append(f'<rect x="{cx}" y="0" width="{P}" height="{BH}" fill="url(#nv)"/>')
o.append(f'<image href="{LOGO_URI}" x="{cx+P/2-340}" y="{BH-520}" width="680" height="680" opacity="0.05"/>')
o.append(f'<path d="M{cx+P} 0 L{cx+P} 460 Q{cx+P-520} 250 {cx+P-660} 0 Z" fill="{RED}"/>')
o.append(f'<rect x="{cx+P/2-200}" y="430" width="400" height="400" rx="50" fill="#fff" filter="url(#sh)"/>')
o.append(f'<image href="{LOGO_URI}" x="{cx+P/2-175}" y="455" width="350" height="350" preserveAspectRatio="xMidYMid meet"/>')
o.append(T(cx+P/2,1080,"Anjaninex",132,"#fff","800","middle"))
o.append(f'<rect x="{cx+P/2-150}" y="1120" width="300" height="5" fill="{GOLD}"/>')
o.append(T(cx+P/2,1210,"BUSINESS  SUITE",56,CREAM,"700","middle",ls="8"))
o.append(T(cx+P/2,1320,"Trade · Accounts · GST · Automation",50,"#c8d2e6","400","middle"))
o.append(T(cx+P/2,2360,WEB,46,GOLD,"700","middle"))
# Back panel (left) — Get in touch
o.append(T(c0,250,"Get in touch",64,NAVY,"800","middle"))
o.append(f'<rect x="{c0-110}" y="290" width="220" height="6" fill="{GOLD}"/>')
o.append(T(150,470,"CONTACT",34,RED,"800",ls="1"))
o.append(T(150,535,P1N,46,NAVY,"700")); o.append(T(150,592,P1P,46,INK))
o.append(T(150,672,P2N,46,NAVY,"700")); o.append(T(150,729,P2P,46,INK))
o.append(T(150,829,"EMAIL",34,RED,"800",ls="1"));   o.append(T(150,889,EMAIL,44,INK))
o.append(T(150,984,"WEBSITE",34,RED,"800",ls="1")); o.append(T(150,1044,WEB,44,INK))
o.append(T(150,1139,"ADDRESS",34,RED,"800",ls="1"))
o.append(T(150,1199,ADDR1,36,GREY)); o.append(T(150,1252,ADDR2,36,GREY))
o.append(f'<image href="{LOGO_URI}" x="{c0-190}" y="1740" width="380" height="380" preserveAspectRatio="xMidYMid meet"/>')
o.append(T(c0,2250,"Made in India",38,GREY,"400","middle"))
# Flap (right, red) tagline
o.append(f'<rect x="{2*P}" y="0" width="{P}" height="{BH}" fill="{RED}"/>')
o.append(f'<circle cx="{c2}" cy="640" r="70" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="4"/>')
o.append(T(c2,1130,"Aapka",98,"#fff","800","middle"))
o.append(T(c2,1262,"poora business",98,"#fff","800","middle"))
o.append(T(c2,1394,"ek jagah.",98,CREAM,"800","middle"))
o.append(T(c2,1560,"Free Trial · 15 din",52,"#ffe9c7","700","middle"))
o.append('</svg>')
render(o,"brochure-OUTSIDE")

i=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{BW}" height="{BH}" viewBox="0 0 {BW} {BH}">',DEFS]
i.append(f'<rect width="{BW}" height="{BH}" fill="#ffffff"/>')
i.append(f'<rect x="0" y="0" width="{BW}" height="130" fill="url(#nv)"/>')
i.append(f'<line x1="{P}" y1="0" x2="{P}" y2="{BH}" stroke="#ece6d8" stroke-dasharray="14 14"/>')
i.append(f'<line x1="{2*P}" y1="0" x2="{2*P}" y2="{BH}" stroke="#ece6d8" stroke-dasharray="14 14"/>')
# Panel 1 — About
i.append(H2(c0,"Hum kaun hain","About Anjaninex"))
for k,ln in enumerate(["Anjaninex Bharat ke chhote evam","madhyam vyapariyon ke liye simple,",
    "powerful business software banati","hai — jisse trading, hisaab-kitaab","aur GST sab ek jagah aasaani se chale."]):
    i.append(T(120,500+k*64,ln,43,INK))
i.append(T(c0,1010,"Hamara mission",50,RED,"800","middle"))
for k,ln in enumerate(["Har vyapari ke paas badi company","jaisa software ho — sasta, saaf","aur apni bhasha me."]):
    i.append(T(120,1110+k*60,ln,42,GREY))
i.append(f'<image href="{LOGO_URI}" x="{c0-190}" y="1720" width="380" height="380" preserveAspectRatio="xMidYMid meet"/>')
# Panel 2 — What we offer
i.append(H2(c1,"Kya milta hai","Anjaninex Business Suite"))
feats=["Trading — Orders, Bills, Payments, GR","Accounting — Vouchers, Ledgers, P&L, BS",
 "GST — auto CGST/SGST/IGST + reports","OCR Bill Scan — photo se auto entry",
 "WhatsApp Bot — rate broadcast + orders","Reports — Sales, Outstanding, Top parties",
 "HR — Attendance, Payroll, Live location","Bazaar Link — supplier-buyer directory",
 "Multi-branch + Team roles & permissions","Voice Assistant — Hindi/Gujarati madad"]
for k,f in enumerate(feats): i.append(B(P+120,500+k*82,f))
i.append(f'<rect x="{P+120}" y="1380" width="{P-240}" height="430" rx="24" fill="{CREAM}"/>')
i.append(T(c1,1490,"Cloud based",50,NAVY,"800","middle"))
i.append(T(c1,1565,"Mobile + Computer dono par",40,GREY,"400","middle"))
i.append(T(c1,1630,"Roz ka backup · Poori security",40,GREY,"400","middle"))
i.append(T(c1,1720,WEB,44,RED,"800","middle"))
# Panel 3 — Why + contact
i.append(H2(c2,"Kyun chunein","Why Anjaninex"))
whys=["Aasaan — Hindi/Hinglish, training nahi","Sasta — chhote vyapari ke budget me",
 "Tezi — minute me bill, scan se entry","Safe — aapka data sirf aapka",
 "Support — WhatsApp/phone par madad","Made in India — desi team, desi soch"]
for k,w in enumerate(whys): i.append(B(2*P+120,500+k*82,w))
i.append(T(c2,1160,"Aaj hi shuru karein",56,NAVY,"800","middle"))
i.append(f'<rect x="{c2-340}" y="1230" width="680" height="120" rx="60" fill="{RED}"/>')
i.append(T(c2,1310,"Free Trial — 15 din",50,"#fff","800","middle"))
i.append(T(c2,1470,P1N+" · "+P1P,42,NAVY,"700","middle"))
i.append(T(c2,1535,P2N+" · "+P2P,42,NAVY,"700","middle"))
i.append(T(c2,1615,EMAIL,42,INK,"400","middle"))
i.append(T(c2,1680,WEB,42,INK,"400","middle"))
i.append(T(c2,1760,ADDR1,30,GREY,"400","middle"))
i.append(T(c2,1805,ADDR2,30,GREY,"400","middle"))
i.append(f'<image href="{LOGO_URI}" x="{c2-160}" y="1880" width="320" height="320" preserveAspectRatio="xMidYMid meet"/>')
i.append('</svg>')
render(i,"brochure-INSIDE")
print("DONE")
