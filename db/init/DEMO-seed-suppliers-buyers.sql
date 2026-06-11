-- ============================================================================
-- DEMO SEED — 100 suppliers + 100 buyers (textile/fabric)
-- Unified schema: core.contacts (with wa_supplier/wa_buyer) + AD profiles.
-- pgAdmin me poora chalao (F5). source_module='demo_seed' tag se baad me delete ho sakte.
-- Dobara chalाo to skip ho jayega (guard).
-- ============================================================================

DO $$
DECLARE
  v_firm uuid;
  fn   text[] := ARRAY['Aanya','Shree','Krishna','Ganesh','Laxmi','Marwar','Kashi','Banaras','Royal','Heritage',
                       'Riddhi','Siddhi','Om','Shyam','Radha','Govind','Mahaveer','Jain','Agarwal','Bhandari',
                       'Chandan','Deepak','Ekta','Surya','Ganga','Yamuna','Nandini','Tirupati','Saanvi','Vraj'];
  sup  text[] := ARRAY['Textiles','Fabrics','Mills','Synthetics','Weaves','Sarees','Creations','Prints','Looms','Mfg Co'];
  buy  text[] := ARRAY['Boutique','Collections','Garments','Retail','Emporium','Fashion','Traders','Stores','Designs','Wholesale'];
  cty  text[] := ARRAY['Surat','Mumbai','Jaipur','Bhopal','Ahmedabad','Delhi','Indore','Ludhiana','Kolkata','Bengaluru'];
  stt  text[] := ARRAY['Gujarat','Maharashtra','Rajasthan','Madhya Pradesh','Gujarat','Delhi','Madhya Pradesh','Punjab','West Bengal','Karnataka'];
  sc   text[] := ARRAY['24','27','08','23','24','07','23','03','19','29'];  -- GST state codes (cty ke saath)
BEGIN
  SELECT id INTO v_firm FROM platform.firms ORDER BY created_at LIMIT 1;
  IF v_firm IS NULL THEN RAISE EXCEPTION 'Koi firm nahi mili platform.firms me'; END IF;

  IF EXISTS (SELECT 1 FROM core.contacts WHERE firm_id = v_firm AND source_module = 'demo_seed') THEN
    RAISE NOTICE 'Demo data pehle se hai — skip.';
    RETURN;
  END IF;

  -- ---------- 100 SUPPLIERS ----------
  WITH ins AS (
    INSERT INTO core.contacts
      (id, firm_id, display_name, legal_name, entity_type, phone_primary, wa_supplier,
       email_primary, gst_number, pan_number, addresses, flags, source_module, created_at, updated_at)
    SELECT
      gen_random_uuid(), v_firm,
      fn[1+(i%30)] || ' ' || sup[1+(i%10)],
      fn[1+(i%30)] || ' ' || sup[1+(i%10)] || ' Pvt Ltd',
      'proprietorship',
      '98' || lpad(i::text, 8, '0'),
      '98' || lpad(i::text, 8, '0'),
      lower(fn[1+(i%30)]) || i || '@example.com',
      sc[1+(i%10)] || 'ABCDE' || lpad(i::text,4,'0') || 'F1Z5',   -- valid 15-char GSTIN
      'ABCDE' || lpad(i::text,4,'0') || 'F',
      jsonb_build_array(jsonb_build_object(
        'type','billing','line1','Shop ' || i || ', Textile Market',
        'city', cty[1+(i%10)], 'state', stt[1+(i%10)], 'pincode','395002')),
      '{"is_supplier":true}'::jsonb,
      'demo_seed', now(), now()
    FROM generate_series(1,100) g(i)
    RETURNING id
  )
  INSERT INTO suppliers.supplier_profiles
    (id, firm_id, contact_id, supplier_code, business_type, categories, rate_unit, is_active, created_at, updated_at)
  SELECT gen_random_uuid(), v_firm, id,
         'SUP-D' || lpad((row_number() over ())::text, 3, '0'),
         'trader', '[]'::jsonb, 'mtr', TRUE, now(), now()
  FROM ins;

  -- ---------- 100 BUYERS ----------
  WITH ins AS (
    INSERT INTO core.contacts
      (id, firm_id, display_name, legal_name, entity_type, phone_primary, wa_buyer,
       email_primary, gst_number, pan_number, addresses, flags, source_module, created_at, updated_at)
    SELECT
      gen_random_uuid(), v_firm,
      fn[1+(i%30)] || ' ' || buy[1+(i%10)],
      fn[1+(i%30)] || ' ' || buy[1+(i%10)],
      'proprietorship',
      '87' || lpad(i::text, 8, '0'),
      '87' || lpad(i::text, 8, '0'),
      'buyer' || i || '@example.com',
      sc[1+(i%10)] || 'BUYER' || lpad(i::text,4,'0') || 'G1Z5',   -- valid 15-char GSTIN
      'BUYER' || lpad(i::text,4,'0') || 'G',
      jsonb_build_array(jsonb_build_object(
        'type','billing','line1','Showroom ' || i,
        'city', cty[1+(i%10)], 'state', stt[1+(i%10)], 'pincode','110006')),
      '{"is_buyer_dir":true}'::jsonb,
      'demo_seed', now(), now()
    FROM generate_series(1,100) g(i)
    RETURNING id
  )
  INSERT INTO suppliers.buyer_profiles
    (id, firm_id, contact_id, buyer_code, buyer_type, categories,
     budget_min, budget_max, budget_unit, is_active, created_at, updated_at)
  SELECT gen_random_uuid(), v_firm, id,
         'BUY-D' || lpad((rn)::text, 3, '0'),
         (ARRAY['retailer','wholesaler','boutique','designer','reseller'])[1+(rn%5)],
         '[]'::jsonb,
         (50 + (rn%5)*50)::numeric,                       -- min: 50,100,150,200,250
         (50 + (rn%5)*50 + 250 + (rn%4)*150)::numeric,    -- max: min+250 .. +700
         'mtr', TRUE, now(), now()
  FROM (SELECT id, row_number() over () AS rn FROM ins) q;

  RAISE NOTICE 'Demo seed done: 100 suppliers + 100 buyers.';
END $$;

SELECT
  (SELECT COUNT(*) FROM suppliers.supplier_profiles sp JOIN core.contacts c ON c.id=sp.contact_id WHERE c.source_module='demo_seed') AS demo_suppliers,
  (SELECT COUNT(*) FROM suppliers.buyer_profiles bp JOIN core.contacts c ON c.id=bp.contact_id WHERE c.source_module='demo_seed') AS demo_buyers;
