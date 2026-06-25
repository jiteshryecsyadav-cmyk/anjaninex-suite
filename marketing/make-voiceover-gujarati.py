#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Anjaninex Walkthrough — GUJARATI voiceover (Sarvam bulbul:v2).
Dono awaaz: voiceover/gmale/slide-01.wav ... aur voiceover/gfemale/slide-01.wav ...

CHALAO (PowerShell, marketing folder me):
  cd "G:\\Indian B2B SaaS platform\\marketing"
  $env:SARVAM_API_KEY="aapki_sarvam_key"
  python make-voiceover-gujarati.py
"""
import os, base64, json, urllib.request, pathlib
API_KEY = os.environ.get("SARVAM_API_KEY", "").strip()
URL = "https://api.sarvam.ai/text-to-speech"
VOICES = [
    ("gfemale", "anushka",  0.12, 1.02),
    ("gmale",   "abhilash", 0.06, 1.02),
]
LINES = [
    "નમસ્તે! આ છે અંજનિનેક્સ બિઝનેસ સૂટ. તમારા આખા બિઝનેસ માટે એક જ એપ — બિલ, હિસાબ, વ્હોટ્સએપ અને ઓ સી આર ટેકનોલોજી, જે મેડ ઇન ઇન્ડિયા છે. બધું એક જ જગ્યાએ. ચાલો જોઈએ.",
    "ડેશબોર્ડ પર એક જ નજરમાં બધું — ટોટલ સેલ, તમારું કમિશન, કેટલા પૈસા આવ્યા, અને ગુડ્સ રિટર્ન. બધું લાઇવ.",
    "અહીં સેલનો ગ્રાફ, પેમેન્ટ બાકી હોવાના અલર્ટ, અને ઘણી બ્રાન્ચ હોય તો દરેક બ્રાન્ચ અલગ — બધું મળી જશે.",
    "ટ્રેડિંગમાં સૌથી પહેલા ઓર્ડર. ખરીદનારનો ઓર્ડર બનાવો અને ટ્રૅક કરો.",
    "બિલ બનાવવું છે? બસ બિલનો ફોટો પાડો — ઓ સી આર ટેકનોલોજી, જે મેડ ઇન ઇન્ડિયા છે, જાતે પાર્ટી, આઇટમ, જીએસટી અને ટોટલ વાંચીને ભરી દે છે. મિનિટોનું કામ સેકન્ડોમાં.",
    "માલ પાછો આવ્યો? ગુડ્સ રિટર્નની એન્ટ્રી કરો — બિલ સાથે જોડાયેલી, હિસાબ આપમેળે સાચો.",
    "પેમેન્ટ એન્ટ્રી — ખરીદનારે સપ્લાયરને કેટલું આપ્યું, બંનેનું ખાતું આપમેળે અપડેટ.",
    "અને સૌથી જરૂરી — કમિશન. દરેક ડીલ પર તમારું કમિશન અહીં જ બને છે અને ટ્રૅક થાય છે.",
    "સેલ, બાકી પૈસા, જીએસટી, કમિશન — દરેક રિપોર્ટ તૈયાર. ઘણી બ્રાન્ચ હોય તો દરેક બ્રાન્ચ અલગ જુઓ.",
    "હવે કમાલની વસ્તુ — બાઝાર લિંક. આખું કામ વ્હોટ્સએપ પર.",
    "સપ્લાયર વ્હોટ્સએપ પર રેટ અને ડિઝાઇનનો ફોટો મોકલે છે.",
    "સિસ્ટમ એ ફોટો પર પોતાનું વોટરમાર્ક અને એક ટ્રૅક કોડ લગાવી દે છે, જેથી માલ ઓળખી શકાય.",
    "પછી બોટ એ જ રેટ એ આઇટમના બધા મેચિંગ ખરીદનારોને આપમેળે મોકલી દે છે.",
    "ખરીદનાર એ જ ફોટો મોકલીને ઓર્ડર કરે છે. બોટ ટ્રૅક કોડ થી ઓળખી લે છે કે માલ કયા સપ્લાયરનો હતો, અને એ સપ્લાયરને ઓર્ડરનો મેસેજ મોકલી દે છે.",
    "એજન્ટે બસ એક એન્ટ્રી કરવાની છે, બાકી આખું કામ આપમેળે. સ્ટાફના કલાકોનું કામ મિનિટોમાં, સમય અને ભૂલ બંને બચે છે.",
    "એચઆરમાં સ્ટાફ ચેક-ઇન અને ચેક-આઉટ સેલ્ફી સાથે, અને આખા દિવસનું લાઇવ લોકેશન નકશા પર.",
    "સેલેરી શીટ આપમેળે બની જાય છે — હાજરી થી બેઝિક, પીએફ, ઈએસઆઈ અને નેટ, બધું કેલ્ક્યુલેટ.",
    "અને એકાઉન્ટિંગ? દરેક બિલ, પેમેન્ટ અને કમિશનનું વાઉચર આપમેળે બની જાય છે — લેજર, પી એન્ડ એલ અને બેલેન્સ શીટ તૈયાર. અલગ એકાઉન્ટન્ટની જરૂર નથી.",
    "અને અંજી — દરેક પેજ પર તમારો હેલ્પર. ક્યાંય અટકો તો અંજી ગુજરાતીમાં કહી દે છે શું કરવાનું છે.",
    "અંજનિનેક્સ બિઝનેસ સૂટ — તમારો આખો બિઝનેસ, એક એપમાં. આજે જ શરૂ કરો. ટ્રેડ ડોટ અંજનિનેક્સ ડોટ કોમ.",
]
if not API_KEY:
    raise SystemExit("SARVAM_API_KEY set nahi hai. PowerShell me:  $env:SARVAM_API_KEY=\"aapki_key\"")
def synth(text, speaker, pitch, pace):
    body = json.dumps({"text": text, "target_language_code": "gu-IN", "speaker": speaker,
        "model": "bulbul:v2", "pitch": pitch, "pace": pace, "speech_sample_rate": 22050}).encode("utf-8")
    req = urllib.request.Request(URL, data=body, method="POST")
    req.add_header("api-subscription-key", API_KEY); req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read().decode("utf-8"))
    a = data.get("audios") or []
    return base64.b64decode(a[0]) if a else None
base = pathlib.Path("voiceover")
for folder, speaker, pitch, pace in VOICES:
    out = base / folder; out.mkdir(parents=True, exist_ok=True)
    print(f"\n=== {folder} ({speaker}) ===")
    for i, text in enumerate(LINES, 1):
        try:
            wav = synth(text, speaker, pitch, pace)
            if not wav: print(f"  slide-{i:02d}: koi audio nahi"); continue
            (out / f"slide-{i:02d}.wav").write_bytes(wav)
            print(f"  OK {folder}/slide-{i:02d}.wav ({len(wav)//1024} KB)")
        except Exception as e:
            print(f"  ERR slide-{i:02d}: {e}")
print("\nHo gaya! voiceover/gmale aur voiceover/gfemale ban gaye.")
