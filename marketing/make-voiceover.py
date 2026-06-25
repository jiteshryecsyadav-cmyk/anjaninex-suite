#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Anjaninex Walkthrough voiceover — Hindi + Gujarati, dono (male + female).
Banta hai:
  voiceover/female/      voiceover/male/        (Hindi)
  voiceover/guj-female/  voiceover/guj-male/    (Gujarati)

CHALAO (PowerShell, marketing folder me):
  cd "G:\\Indian B2B SaaS platform\\marketing"
  $env:SARVAM_API_KEY="aapki_sarvam_key"
  python make-voiceover.py

Gujarati lines Sarvam Translate (mayura) se khud ban jati hain.
Pace dhima rakha hai (0.88) taaki O C R saaf bole.
"""
import os, base64, json, urllib.request, pathlib

API_KEY = os.environ.get("SARVAM_API_KEY","").strip()
TTS="https://api.sarvam.ai/text-to-speech"
TR ="https://api.sarvam.ai/translate"
PACE=0.88   # dhima => saaf

# Hindi master lines ("O C R" ko 'ओ सी आर' likha taaki letter-by-letter saaf bole)
LINES=[
 "नमस्ते! ये है अंजनिनेक्स बिज़नेस सूट। आपके पूरे बिज़नेस के लिए एक ही ऐप — बिल, हिसाब, व्हाट्सऐप और ओ सी आर टेक्नोलॉजी, जो मेड इन इंडिया है। सब एक जगह। चलिए देखते हैं।",
 "डैशबोर्ड पर एक ही नज़र में सब कुछ — टोटल सेल, आपका कमीशन, कितना पैसा आया, और गुड्स रिटर्न। सब लाइव।",
 "यहाँ सेल का ग्राफ, पेमेंट बाकी होने के अलर्ट, और कई ब्रांच हों तो हर ब्रांच अलग — सब मिल जाएगा।",
 "ट्रेडिंग में सबसे पहले ऑर्डर। खरीदार का ऑर्डर बनाइए और ट्रैक कीजिए।",
 "बिल बनाना? बस बिल की फोटो खींचिए — ओ सी आर टेक्नोलॉजी, जो मेड इन इंडिया है, खुद पार्टी, आइटम, जीएसटी और टोटल पढ़ कर भर देती है। मिनटों का काम सेकंडों में।",
 "माल वापस आया? गुड्स रिटर्न की एंट्री कीजिए — बिल से जुड़ी, हिसाब अपने आप ठीक।",
 "पेमेंट एंट्री — खरीदार ने सप्लायर को कितना दिया, दोनों का खाता अपने आप अपडेट।",
 "और सबसे ज़रूरी — कमीशन। हर डील पर आपका कमीशन यहीं बनता और ट्रैक होता है।",
 "सेल, बाकी पैसा, जीएसटी, कमीशन — हर रिपोर्ट तैयार। कई ब्रांच हों तो हर ब्रांच अलग देखिए।",
 "अब कमाल की चीज़ — बाज़ार लिंक। पूरा काम व्हाट्सऐप पर।",
 "सप्लायर व्हाट्सऐप पर रेट और डिज़ाइन की फोटो भेजता है।",
 "सिस्टम उस फोटो पर अपना वॉटरमार्क और एक ट्रैक कोड लगा देता है, ताकि माल पहचाना जा सके।",
 "फिर बॉट वही रेट उस आइटम के सभी मैचिंग खरीदारों को अपने आप भेज देता है।",
 "खरीदार वही फोटो भेजकर ऑर्डर करता है। बॉट ट्रैक कोड से पहचान लेता है कि माल किस सप्लायर का था, और उस सप्लायर को ऑर्डर का मैसेज भेज देता है।",
 "एजेंट को बस एक एंट्री करनी है, बाकी पूरा काम अपने आप। स्टाफ के घंटों का काम मिनटों में, समय और गलती दोनों बचती है।",
 "एचआर में स्टाफ चेक-इन और चेक-आउट सेल्फी के साथ, और दिन भर की लाइव लोकेशन नक्शे पर।",
 "सैलरी शीट अपने आप बन जाती है — हाज़िरी से बेसिक, पीएफ, ईएसआई और नेट, सब कैलकुलेट।",
 "और अकाउंटिंग? हर बिल, पेमेंट और कमीशन का वाउचर अपने आप बन जाता है — लेजर, पी एंड एल और बैलेंस शीट तैयार। अलग अकाउंटेंट की ज़रूरत नहीं।",
 "और अंजी — हर पेज पर आपका हेल्पर। कहीं अटकें तो अंजी आपकी भाषा में बता देता है क्या करना है।",
 "अंजनिनेक्स बिज़नेस सूट — आपका पूरा बिज़नेस, एक ऐप में। आज ही शुरू कीजिए। ट्रेड डॉट अंजनिनेक्स डॉट कॉम।",
]

# (folder, speaker, target_lang, translate_to_gujarati?)
JOBS=[
 ("female",     "anushka",  "hi-IN", False),
 ("male",       "abhilash", "hi-IN", False),
 ("guj-female", "anushka",  "gu-IN", True),
 ("guj-male",   "abhilash", "gu-IN", True),
]

if not API_KEY:
    raise SystemExit('SARVAM_API_KEY set nahi hai.  PowerShell:  $env:SARVAM_API_KEY="aapki_key"')

def post(url, body):
    req=urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), method="POST")
    req.add_header("api-subscription-key", API_KEY); req.add_header("Content-Type","application/json")
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode("utf-8"))

def to_guj(text):
    try:
        d=post(TR, {"input":text,"source_language_code":"hi-IN","target_language_code":"gu-IN","model":"mayura:v1","mode":"formal"})
        return d.get("translated_text") or text
    except Exception as e:
        print("   translate fail:",e); return text

def synth(text, speaker, lang):
    d=post(TTS, {"text":text,"target_language_code":lang,"speaker":speaker,"model":"bulbul:v2",
                 "pitch":0.08,"pace":PACE,"speech_sample_rate":22050})
    a=d.get("audios") or []
    return base64.b64decode(a[0]) if a else None

base=pathlib.Path("voiceover")
for folder, speaker, lang, guj in JOBS:
    out=base/folder; out.mkdir(parents=True, exist_ok=True)
    print(f"\n=== {folder} ({speaker}, {lang}, pace {PACE}) ===")
    for i,hi in enumerate(LINES,1):
        try:
            text = to_guj(hi) if guj else hi
            wav  = synth(text, speaker, lang)
            if not wav: print(f"  slide-{i:02d}: koi audio nahi"); continue
            (out/f"slide-{i:02d}.wav").write_bytes(wav)
            print(f"  OK {folder}/slide-{i:02d}.wav ({len(wav)//1024} KB)")
        except Exception as e:
            print(f"  ERR slide-{i:02d}: {e}")

print("\nHO GAYA! voiceover me 4 folder: female, male, guj-female, guj-male.")
print("Claude ko bolo 'ho gaya' -> 4 video ban jayenge (Hindi M/F + Gujarati M/F).")
