-- 73: Multi-tenant Voice Agent config. Har firm ka apna AI phone agent —
-- naam, script (prompt), awaaz, bhasha. SIRF Anjaninex super-admin set karta hai
-- (admin panel -> Firms -> Voice Agent). Firm khud edit nahi karti.
-- Sarvam + Gemini keys CENTRAL rehti hain (bridge .env me), yaha sirf per-firm behaviour.

CREATE TABLE IF NOT EXISTS platform.voice_agents (
    firm_id        uuid PRIMARY KEY REFERENCES platform.firms(id) ON DELETE CASCADE,
    enabled        boolean DEFAULT false,
    agent_name     text DEFAULT 'Riddhi',
    first_message  text DEFAULT 'Namaste! Main Riddhi bol rahi hoon. Aapki kya madad kar sakti hoon?',
    system_prompt  text DEFAULT 'Tum ek friendly hindi phone assistant ho. Chhote saral vaakya me garmjoshi se baat karo. Ek baar me ek sawaal. Jo nahi pata saaf bolo ki main confirm karke bata deti hoon. Jhoothi jaankari mat do.',
    language       text DEFAULT 'hi-IN',          -- hi-IN | en-IN | gu-IN | ...
    voice_speaker  text DEFAULT 'anushka',        -- Sarvam Bulbul speaker
    exotel_number  text,                          -- is firm ka ExoPhone (routing + display)
    updated_at     timestamptz DEFAULT now(),
    updated_by     uuid
);

CREATE INDEX IF NOT EXISTS idx_voice_agents_number ON platform.voice_agents(exotel_number);

-- Bridge (namokara_app se connect karta) ko read chahiye. Admin controller ko read+write.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'namokara_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON platform.voice_agents TO namokara_app;
  END IF;
END $$;
