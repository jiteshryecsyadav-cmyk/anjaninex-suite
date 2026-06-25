#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sirf slide-01 aur slide-05 dobara banata hai (Sarvam word hata diya), char folder me.
CHALAO:
  cd "G:\\Indian B2B SaaS platform\\marketing"
  $env:SARVAM_API_KEY="aapki_key"
  python fix-ocr-voice.py
"""
import os, base64, json, urllib.request, pathlib
API_KEY=os.environ.get("SARVAM_API_KEY","").strip()
TTS="https://api.sarvam.ai/text-to-speech"; TR="https://api.sarvam.ai/translate"; PACE=0.88
if not API_KEY: raise SystemExit('SARVAM_API_KEY set nahi hai.')
LINES={ 1:"नमस्ते! ये है अंजनिनेक्स बिज़नेस सूट। आपके पूरे बिज़नेस के लिए एक ही ऐप — बिल, हिसाब, व्हाट्सऐप और ओ सी आर टेक्नोलॉजी, जो मेड इन इंडिया है। सब एक जगह। चलिए देखते हैं।",
        5:"बिल बनाना? बस बिल की फोटो खींचिए — ओ सी आर टेक्नोलॉजी, जो मेड इन इंडिया है, खुद पार्टी, आइटम, जीएसटी और टोटल पढ़ कर भर देती है। मिनटों का काम सेकंडों में।"}
JOBS=[("female","anushka","hi-IN",False),("male","abhilash","hi-IN",False),
      ("guj-female","anushka","gu-IN",True),("guj-male","abhilash","gu-IN",True)]
def post(u,b):
    r=urllib.request.Request(u,data=json.dumps(b).encode(),method="POST")
    r.add_header("api-subscription-key",API_KEY); r.add_header("Content-Type","application/json")
    return json.loads(urllib.request.urlopen(r,timeout=90).read().decode())
def guj(t):
    try: return post(TR,{"input":t,"source_language_code":"hi-IN","target_language_code":"gu-IN","model":"mayura:v1","mode":"formal"}).get("translated_text") or t
    except Exception as e: print("  tr fail",e); return t
base=pathlib.Path("voiceover")
for folder,spk,lang,g in JOBS:
    out=base/folder; out.mkdir(parents=True,exist_ok=True)
    for i,hi in LINES.items():
        txt=guj(hi) if g else hi
        d=post(TTS,{"text":txt,"target_language_code":lang,"speaker":spk,"model":"bulbul:v2","pitch":0.08,"pace":PACE,"speech_sample_rate":22050})
        a=d.get("audios") or []
        if a: (out/f"slide-{i:02d}.wav").write_bytes(base64.b64decode(a[0])); print(f"OK {folder}/slide-{i:02d}.wav")
        else: print(f"FAIL {folder}/slide-{i:02d}")
print("\nHO GAYA! ab Claude ko bolo 'ho gaya'")
