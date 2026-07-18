-- 75: Voice bridge LLM — OpenAI key add (Gemini free-tier quota 0 aa raha tha, isliye
-- OpenAI (gpt-4o-mini) ko option/primary banaya). Key set ho to bridge OpenAI use karta hai.
ALTER TABLE platform.voice_config ADD COLUMN IF NOT EXISTS openai_key text;
