-- ============================================================================
-- DEMO SEED — 1000 varieties (with rate + photo) for demo suppliers
-- Photo placeholder image (picsum.photos) — display ke liye internet chahiye.
-- d_no 'DV-%' tag se pehchaan; dobara chalao to skip.
-- PEHLE chalao: DEMO-seed-suppliers-buyers.sql + migration 30 (varieties tables).
-- Category ke liye sirf naam use hota hai (category_id NULL) — categories table par depend nahi.
-- ============================================================================

DO $$
DECLARE
  v_firm uuid;
  ns int;
BEGIN
  SELECT id INTO v_firm FROM platform.firms ORDER BY created_at LIMIT 1;
  IF v_firm IS NULL THEN RAISE EXCEPTION 'Koi firm nahi mili.'; END IF;

  SELECT count(*) INTO ns FROM suppliers.supplier_profiles sp
    JOIN core.contacts c ON c.id = sp.contact_id
   WHERE sp.firm_id = v_firm AND c.source_module = 'demo_seed';
  IF ns = 0 THEN RAISE EXCEPTION 'Pehle DEMO-seed-suppliers-buyers.sql chalao (demo suppliers chahiye).'; END IF;

  IF EXISTS (SELECT 1 FROM suppliers.varieties WHERE firm_id = v_firm AND d_no LIKE 'DV-%') THEN
    RAISE NOTICE 'Demo varieties pehle se hain — skip.';
    RETURN;
  END IF;

  WITH demo_sup AS (
    SELECT sp.id, row_number() over (ORDER BY sp.id) AS rn
    FROM suppliers.supplier_profiles sp
    JOIN core.contacts c ON c.id = sp.contact_id
    WHERE sp.firm_id = v_firm AND c.source_module = 'demo_seed'
  ),
  ins AS (
    INSERT INTO suppliers.varieties (firm_id, supplier_id, category_id, category_name, name, d_no)
    SELECT v_firm, ds.id, NULL,
           (ARRAY['Cotton','Silk','Dupatta','Kurti','Dress Material','Saree','Lehenga','Suit Material','Bedsheet','Net'])[1+(i%10)],
           (ARRAY['Cotton','Silk','Rayon','Viscose','Georgette','Chiffon','Net','Linen','Crepe','Modal'])[1+(i%10)] || ' ' ||
           (ARRAY['60-60','40-40','plain','printed','dyed','jacquard','embroidered','solid'])[1+(i%8)] || ' #' || i,
           'DV-' || i
    FROM generate_series(1,1000) AS g(i)
    JOIN demo_sup ds ON ds.rn = 1 + (i % ns)
    RETURNING id
  ),
  vlist AS (SELECT id, row_number() over () AS rn FROM ins),
  add_rate AS (
    INSERT INTO suppliers.variety_rates (variety_id, rate, unit)
    SELECT id, (80 + (rn % 50) * 10)::numeric, (ARRAY['mtr','pcs','kg'])[1+(rn%3)]
    FROM vlist
    RETURNING 1
  )
  INSERT INTO suppliers.variety_photos (variety_id, url, is_primary)
  SELECT id, 'https://picsum.photos/seed/nam' || rn || '/400/400', TRUE
  FROM vlist;

  RAISE NOTICE 'Demo varieties done: 1000 (with rate + photo).';
END $$;

SELECT
  (SELECT COUNT(*) FROM suppliers.varieties     WHERE d_no LIKE 'DV-%') AS demo_varieties,
  (SELECT COUNT(*) FROM suppliers.variety_rates vr JOIN suppliers.varieties v ON v.id=vr.variety_id WHERE v.d_no LIKE 'DV-%') AS demo_rates,
  (SELECT COUNT(*) FROM suppliers.variety_photos vp JOIN suppliers.varieties v ON v.id=vp.variety_id WHERE v.d_no LIKE 'DV-%') AS demo_photos;
