-- =================================================================
-- DEMO DATA — Indian B2B SaaS (Complete)
-- Run this in pgAdmin Query Tool on namokara_dev DB
--
-- Creates:
--   100 SUPPLIERS  (trading.party_profiles party_type='seller'
--                  + suppliers.supplier_profiles with categories,
--                    photos, rates, ratings)
--   100 BUYERS     (trading.party_profiles party_type='buyer')
--    25 TRANSPORTERS
--    10 SUPPLIER CATEGORIES (Saree, Suit Material, Kurti, etc.)
--   200 ORDERS/BILLS with 2-5 lines each
--    20 ITEMS (textile catalog)
--    ~250 SUPPLIER PHOTOS (2-3 per supplier with rates)
--    ~300 SUPPLIER RATES
--
-- Auto-detects first firm + head-office branch.
-- Safe to re-run — uses ON CONFLICT throughout.
-- =================================================================

DO $$
DECLARE
  v_firm_id     UUID;
  v_branch_id   UUID;
  v_admin_id    UUID;
  v_contact_id  UUID;
  v_party_id    UUID;
  v_supplier_profile_id UUID;
  v_bill_id     UUID;
  v_item_ids    UUID[];
  v_buyer_ids   UUID[];
  v_seller_ids  UUID[];
  v_seller_contact_ids UUID[];   -- track contact ids for suppliers seeding
  v_category_ids UUID[];
  v_category_names TEXT[] := ARRAY[
    'Saree','Suit Material','Kurti','Dress Material','Silk','Cotton',
    'Lehenga','Dupatta','Bedsheet','Curtain'
  ];
  v_category_icons TEXT[] := ARRAY[
    '👗','🧵','👚','🪡','✨','🌾','💃','🧣','🛏️','🪟'
  ];
  v_business_types TEXT[] := ARRAY['manufacturer','trader','wholesaler','broker'];
  v_rate_units TEXT[] := ARRAY['mtr','pcs','kg','doz'];
  v_first_names TEXT[] := ARRAY[
    'Aarav','Vihaan','Aditya','Vivaan','Arjun','Sai','Reyansh','Krishna','Ishaan','Shaurya',
    'Ananya','Aaradhya','Diya','Pari','Anika','Saanvi','Aanya','Myra','Riya','Aaru',
    'Rajesh','Suresh','Mahesh','Ramesh','Dinesh','Mukesh','Yogesh','Hitesh','Naresh','Hemant',
    'Priya','Sunita','Kavita','Anita','Vandana','Pooja','Neha','Rekha','Manju','Geeta',
    'Vijay','Sanjay','Ajay','Akshay','Amit','Anil','Sunil','Ashok','Manoj','Ravi'
  ];
  v_last_names TEXT[] := ARRAY[
    'Sharma','Verma','Yadav','Singh','Kumar','Gupta','Agarwal','Mishra','Tiwari','Patel',
    'Shah','Mehta','Joshi','Chauhan','Saxena','Bansal','Goyal','Mittal','Khanna','Kapoor',
    'Sinha','Jain','Bhatia','Malhotra','Chopra','Arora','Kothari','Maheshwari','Soni','Rathi'
  ];
  v_business_suffix TEXT[] := ARRAY[
    'Textiles','Fabrics','Mills','Industries','Enterprises','Trading Co','Exports',
    'Garments','Apparels','Silk House','Cotton Mills','Sarees','Designer Studio','Imports',
    'Brothers','& Sons','International','Group','Pvt Ltd','Agency'
  ];
  v_indian_cities JSONB := '[
    {"city":"Mumbai","state":"Maharashtra","gst":"27","pin":"400001"},
    {"city":"Delhi","state":"Delhi","gst":"07","pin":"110001"},
    {"city":"Bengaluru","state":"Karnataka","gst":"29","pin":"560001"},
    {"city":"Hyderabad","state":"Telangana","gst":"36","pin":"500001"},
    {"city":"Ahmedabad","state":"Gujarat","gst":"24","pin":"380001"},
    {"city":"Chennai","state":"Tamil Nadu","gst":"33","pin":"600001"},
    {"city":"Kolkata","state":"West Bengal","gst":"19","pin":"700001"},
    {"city":"Pune","state":"Maharashtra","gst":"27","pin":"411001"},
    {"city":"Surat","state":"Gujarat","gst":"24","pin":"395001"},
    {"city":"Jaipur","state":"Rajasthan","gst":"08","pin":"302001"},
    {"city":"Lucknow","state":"Uttar Pradesh","gst":"09","pin":"226001"},
    {"city":"Kanpur","state":"Uttar Pradesh","gst":"09","pin":"208001"},
    {"city":"Nagpur","state":"Maharashtra","gst":"27","pin":"440001"},
    {"city":"Indore","state":"Madhya Pradesh","gst":"23","pin":"452001"},
    {"city":"Bhopal","state":"Madhya Pradesh","gst":"23","pin":"462001"},
    {"city":"Coimbatore","state":"Tamil Nadu","gst":"33","pin":"641001"},
    {"city":"Ludhiana","state":"Punjab","gst":"03","pin":"141001"},
    {"city":"Agra","state":"Uttar Pradesh","gst":"09","pin":"282001"},
    {"city":"Varanasi","state":"Uttar Pradesh","gst":"09","pin":"221001"},
    {"city":"Rajkot","state":"Gujarat","gst":"24","pin":"360001"}
  ]'::jsonb;
  v_items_seed JSONB := '[
    {"code":"COT-001","name":"Cotton Plain","hsn":"52083900","unit":"MTR","rate":120,"tax":5},
    {"code":"COT-002","name":"Cotton Print","hsn":"52084900","unit":"MTR","rate":150,"tax":5},
    {"code":"DSN-2080","name":"Design 2080","hsn":"63062200","unit":"MTR","rate":250,"tax":5},
    {"code":"DSN-3030","name":"Design 3030","hsn":"63062200","unit":"PCS","rate":447,"tax":5},
    {"code":"KAR-100","name":"Karina","hsn":"63062200","unit":"PCS","rate":447,"tax":5},
    {"code":"KUR-RED","name":"Kurti Red","hsn":"61091000","unit":"PCS","rate":550,"tax":12},
    {"code":"KUR-BLU","name":"Kurti Blue","hsn":"61091000","unit":"PCS","rate":550,"tax":12},
    {"code":"SAR-001","name":"Saree Designer","hsn":"58041000","unit":"PCS","rate":1250,"tax":12},
    {"code":"SAR-002","name":"Saree Silk Bridal","hsn":"58041000","unit":"PCS","rate":3500,"tax":12},
    {"code":"SIK-001","name":"Silk Premium","hsn":"50071000","unit":"MTR","rate":850,"tax":5},
    {"code":"SIK-002","name":"Silk Banarasi","hsn":"50071000","unit":"MTR","rate":1200,"tax":5},
    {"code":"DUP-001","name":"Dupatta Plain","hsn":"62141000","unit":"PCS","rate":280,"tax":5},
    {"code":"DUP-002","name":"Dupatta Embroidered","hsn":"62141000","unit":"PCS","rate":750,"tax":5},
    {"code":"LEH-001","name":"Lehenga Set","hsn":"62114200","unit":"PCS","rate":4500,"tax":12},
    {"code":"SUI-001","name":"Salwar Suit","hsn":"62041200","unit":"PCS","rate":1800,"tax":12},
    {"code":"BEDS-01","name":"Bedsheet Cotton","hsn":"63022100","unit":"PCS","rate":650,"tax":5},
    {"code":"CUR-001","name":"Curtain Fabric","hsn":"63031200","unit":"MTR","rate":320,"tax":5},
    {"code":"TOW-001","name":"Towel Cotton","hsn":"63026000","unit":"PCS","rate":180,"tax":5},
    {"code":"BAG-001","name":"Cotton Bag","hsn":"42022200","unit":"PCS","rate":95,"tax":5},
    {"code":"SCAR-01","name":"Stole/Scarf","hsn":"62141000","unit":"PCS","rate":420,"tax":5}
  ]'::jsonb;
  v_photo_urls TEXT[] := ARRAY[
    'https://images.unsplash.com/photo-1583391733956-6c78276477e1?w=400',
    'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400',
    'https://images.unsplash.com/photo-1599577180589-0a0b6b7e4d9c?w=400',
    'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400',
    'https://images.unsplash.com/photo-1605518215584-d8ce93e92e3a?w=400',
    'https://images.unsplash.com/photo-1604881991720-f91add269bed?w=400',
    'https://images.unsplash.com/photo-1551803091-e20673f15770?w=400',
    'https://images.unsplash.com/photo-1606923829579-0cb981a83e2e?w=400'
  ];
  v_design_names TEXT[] := ARRAY[
    'Design 2080','Design 3030','Karina','Anarkali','Heritage','Premium','Royal','Silk Touch',
    'Classic','Modern','Banarasi','Bandhani','Chanderi','Tussar','Kanjivaram','Patola',
    'Cotton Blend','Pure Silk','Designer Print','Festival Special'
  ];
  v_category_pick_count INT;
  v_pick_idx INT;
  v_picked_cats JSONB;
  v_city JSONB;
  v_name TEXT;
  v_legal TEXT;
  v_gst_no TEXT;
  v_phone TEXT;
  v_email TEXT;
  v_bill_no TEXT;
  v_party_id_pick UUID;
  v_subtotal NUMERIC;
  v_tax NUMERIC;
  v_total NUMERIC;
  v_paid NUMERIC;
  v_status TEXT;
  v_status_dist INT;
  v_bill_date DATE;
  v_line_count INT;
  v_item JSONB;
  v_qty NUMERIC;
  v_rate NUMERIC;
  v_line_amt NUMERIC;
  v_line_taxable NUMERIC;
  v_line_total NUMERIC;
  i INT;
  j INT;
BEGIN
  -- 1. Detect firm + branch ----------------------------------------
  -- Pick the firm that has at least one branch (skips seed/dev firms with no data)
  SELECT f.id INTO v_firm_id
    FROM platform.firms f
    WHERE EXISTS (SELECT 1 FROM core.branches b WHERE b.firm_id = f.id)
    ORDER BY (SELECT COUNT(*) FROM core.branches WHERE firm_id = f.id) DESC,
             f.created_at
    LIMIT 1;
  IF v_firm_id IS NULL THEN
    RAISE EXCEPTION 'No firm with branches found. Please create at least one branch first.';
  END IF;
  RAISE NOTICE 'Using firm: %', v_firm_id;

  SELECT id INTO v_branch_id FROM core.branches
    WHERE firm_id = v_firm_id ORDER BY is_head_office DESC NULLS LAST, created_at LIMIT 1;
  IF v_branch_id IS NULL THEN RAISE EXCEPTION 'No branch found.'; END IF;
  RAISE NOTICE 'Using branch: %', v_branch_id;

  SELECT id INTO v_admin_id FROM core.users
    WHERE firm_id = v_firm_id ORDER BY created_at LIMIT 1;
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'No user found for firm. Create a user first.';
  END IF;
  RAISE NOTICE 'Using admin user: %', v_admin_id;

  -- 2. CLEANUP previous demo data (source_module = 'demo-seed') --
  -- This makes script idempotent — safe to re-run cleanly.
  DELETE FROM trading.bill_lines WHERE bill_id IN (
    SELECT b.id FROM trading.bills b
    JOIN trading.party_profiles p ON b.party_id = p.id
    JOIN core.contacts c ON p.contact_id = c.id
    WHERE c.source_module = 'demo-seed'
  );
  DELETE FROM trading.bills WHERE party_id IN (
    SELECT p.id FROM trading.party_profiles p
    JOIN core.contacts c ON p.contact_id = c.id
    WHERE c.source_module = 'demo-seed'
  );
  DELETE FROM suppliers.photos WHERE supplier_id IN (
    SELECT sp.id FROM suppliers.supplier_profiles sp
    JOIN core.contacts c ON sp.contact_id = c.id
    WHERE c.source_module = 'demo-seed'
  );
  DELETE FROM suppliers.rates WHERE supplier_id IN (
    SELECT sp.id FROM suppliers.supplier_profiles sp
    JOIN core.contacts c ON sp.contact_id = c.id
    WHERE c.source_module = 'demo-seed'
  );
  DELETE FROM suppliers.supplier_profiles WHERE contact_id IN (
    SELECT id FROM core.contacts WHERE source_module = 'demo-seed'
  );
  DELETE FROM trading.party_profiles WHERE contact_id IN (
    SELECT id FROM core.contacts WHERE source_module = 'demo-seed'
  );
  DELETE FROM core.contacts WHERE source_module = 'demo-seed';
  -- Transporters — keep manually-created ones, delete only demo (have no source_module)
  -- Use a heuristic: delete transporters with email ending in @example.com
  DELETE FROM core.transporters
    WHERE firm_id = v_firm_id AND email LIKE '%@example.com';
  RAISE NOTICE 'Cleanup done — previous demo data removed';

  -- 3. Seed items --------------------------------------------------
  v_item_ids := ARRAY[]::UUID[];
  FOR i IN 0 .. jsonb_array_length(v_items_seed) - 1 LOOP
    v_item := v_items_seed -> i;
    INSERT INTO trading.items (firm_id, code, name, hsn_sac, unit, default_rate, tax_rate, is_active)
    VALUES (
      v_firm_id, v_item ->> 'code', v_item ->> 'name', v_item ->> 'hsn',
      v_item ->> 'unit', (v_item ->> 'rate')::numeric, (v_item ->> 'tax')::numeric, TRUE
    )
    ON CONFLICT (firm_id, code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_party_id;
    v_item_ids := array_append(v_item_ids, v_party_id);
  END LOOP;
  RAISE NOTICE 'Seeded % items', array_length(v_item_ids, 1);

  -- 3. Seed SUPPLIER CATEGORIES ------------------------------------
  v_category_ids := ARRAY[]::UUID[];
  FOR i IN 1 .. array_length(v_category_names, 1) LOOP
    INSERT INTO suppliers.categories (firm_id, name, slug, icon, color, is_system, sort_order)
    VALUES (
      v_firm_id, v_category_names[i],
      lower(replace(v_category_names[i], ' ', '-')),
      v_category_icons[i],
      (ARRAY['#DC2626','#1B2E5C','#10B981','#F59E0B','#7C3AED','#EC4899','#0EA5E9','#F97316','#84CC16','#06B6D4'])[i],
      TRUE, i
    )
    ON CONFLICT (firm_id, name) DO UPDATE SET icon = EXCLUDED.icon
    RETURNING id INTO v_party_id;
    v_category_ids := array_append(v_category_ids, v_party_id);
  END LOOP;
  RAISE NOTICE 'Seeded % supplier categories', array_length(v_category_ids, 1);

  -- 4. 100 SUPPLIERS (trading sellers + supplier directory) --------
  v_seller_ids := ARRAY[]::UUID[];
  v_seller_contact_ids := ARRAY[]::UUID[];

  FOR i IN 1 .. 100 LOOP
    v_city  := v_indian_cities -> ((random() * 19)::int);
    v_name  := v_first_names[1 + (random() * (array_length(v_first_names,1)-1))::int]
            || ' ' || v_business_suffix[1 + (random() * (array_length(v_business_suffix,1)-1))::int];
    v_legal := v_name || ' Pvt Ltd';
    v_gst_no := (v_city ->> 'gst')
              || 'AAAPB' || lpad((1000 + (random()*8999)::int)::text, 4, '0') || 'C1Z' || ((random()*9)::int);
    v_phone := '9' || lpad((100000000 + (random()*899999999)::bigint)::text, 9, '0');
    v_email := lower(replace(v_name, ' ', '')) || '@example.com';

    -- Contact (shared between trading.party + suppliers.supplier_profile)
    INSERT INTO core.contacts (firm_id, display_name, legal_name, entity_type,
      phone_primary, email_primary, gst_number, pan_number, addresses, source_module)
    VALUES (
      v_firm_id, v_name, v_legal, 'company', v_phone, v_email, v_gst_no, substr(v_gst_no, 3, 10),
      jsonb_build_array(jsonb_build_object(
        'line1', (10 + (random()*990)::int)::text || ', Industrial Area',
        'city', v_city ->> 'city', 'state', v_city ->> 'state', 'pincode', v_city ->> 'pin'
      )),
      'demo-seed'
    )
    ON CONFLICT (firm_id, gst_number) DO UPDATE SET display_name = EXCLUDED.display_name
    RETURNING id INTO v_contact_id;
    v_seller_contact_ids := array_append(v_seller_contact_ids, v_contact_id);

    -- Trading party (seller)
    INSERT INTO trading.party_profiles (firm_id, contact_id, party_code, party_type,
      credit_limit, credit_days, commission_rate, opening_balance, opening_type,
      credit_rating, is_active)
    VALUES (
      v_firm_id, v_contact_id, 'SUP-' || lpad(i::text, 4, '0'), 'seller',
      0, 30, 0, 0, 'Dr',
      CASE WHEN i % 4 = 0 THEN 'A' WHEN i % 4 = 1 THEN 'B' WHEN i % 4 = 2 THEN 'A' ELSE 'C' END,
      TRUE
    )
    ON CONFLICT (firm_id, contact_id) DO UPDATE SET party_type = 'seller'
    RETURNING id INTO v_party_id;
    v_seller_ids := array_append(v_seller_ids, v_party_id);

    -- Suppliers directory profile (with categories, business type, ratings, etc.)
    -- Pick 1-3 random categories for this supplier
    v_category_pick_count := 1 + (random() * 2)::int;
    v_picked_cats := '[]'::jsonb;
    FOR j IN 1 .. v_category_pick_count LOOP
      v_pick_idx := 1 + (random() * (array_length(v_category_ids,1)-1))::int;
      v_picked_cats := v_picked_cats || to_jsonb(v_category_ids[v_pick_idx]::text);
    END LOOP;

    INSERT INTO suppliers.supplier_profiles (firm_id, contact_id, supplier_code,
      business_type, categories, rate_unit, wa_phone,
      reliability_score, min_order_value, delivery_lead_days, is_active)
    VALUES (
      v_firm_id, v_contact_id, 'SUP-' || lpad(i::text, 4, '0'),
      v_business_types[1 + (random() * 3)::int],
      v_picked_cats,
      v_rate_units[1 + (random() * 3)::int],
      v_phone,
      (3.0 + random() * 2.0)::numeric(3,2),       -- 3.00-5.00 rating
      (10000 + (random() * 90000)::int),           -- ₹10k-₹1L min order
      2 + (random() * 12)::int,                    -- 2-14 days lead time
      TRUE
    )
    ON CONFLICT (firm_id, contact_id) DO UPDATE SET
      business_type = EXCLUDED.business_type,
      categories = EXCLUDED.categories,
      reliability_score = EXCLUDED.reliability_score
    RETURNING id INTO v_supplier_profile_id;

    -- Add 1-3 photos per supplier with rates
    FOR j IN 1 .. (1 + (random() * 2)::int) LOOP
      INSERT INTO suppliers.photos (firm_id, supplier_id, storage_url,
        title, rate, rate_unit, sort_order)
      VALUES (
        v_firm_id, v_supplier_profile_id,
        v_photo_urls[1 + (random() * (array_length(v_photo_urls,1)-1))::int],
        v_design_names[1 + (random() * (array_length(v_design_names,1)-1))::int]
          || ' #' || (100 + (random()*900)::int)::text,
        (150 + (random() * 4000)::int),
        (ARRAY['mtr','pcs','kg'])[1 + (random()*2)::int],
        j
      );
    END LOOP;

    -- Add 2-3 rates per supplier (per category)
    FOR j IN 1 .. (2 + (random() * 1)::int) LOOP
      v_pick_idx := 1 + (random() * (array_length(v_category_ids,1)-1))::int;
      INSERT INTO suppliers.rates (firm_id, supplier_id, category_id, category_name,
        rate, rate_unit, min_qty, source)
      VALUES (
        v_firm_id, v_supplier_profile_id, v_category_ids[v_pick_idx],
        v_category_names[v_pick_idx],
        (200 + (random() * 3000)::int),
        v_rate_units[1 + (random() * 3)::int],
        (10 + (random() * 90)::int),
        'manual'
      );
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Created % suppliers (trading + suppliers directory + photos + rates)',
    array_length(v_seller_ids, 1);

  -- 5. 100 BUYERS --------------------------------------------------
  v_buyer_ids := ARRAY[]::UUID[];
  FOR i IN 1 .. 100 LOOP
    v_city  := v_indian_cities -> ((random() * 19)::int);
    v_name  := v_last_names[1 + (random() * (array_length(v_last_names,1)-1))::int]
            || ' ' || v_business_suffix[1 + (random() * (array_length(v_business_suffix,1)-1))::int];
    v_legal := v_name;
    v_gst_no := (v_city ->> 'gst')
              || 'AABCB' || lpad((1000 + (random()*8999)::int)::text, 4, '0') || 'D1Z' || ((random()*9)::int);
    v_phone := '8' || lpad((100000000 + (random()*899999999)::bigint)::text, 9, '0');
    v_email := lower(replace(v_name, ' ', '')) || '@example.com';

    INSERT INTO core.contacts (firm_id, display_name, legal_name, entity_type,
      phone_primary, email_primary, gst_number, pan_number, addresses, source_module)
    VALUES (
      v_firm_id, v_name, v_legal, 'company', v_phone, v_email, v_gst_no, substr(v_gst_no, 3, 10),
      jsonb_build_array(jsonb_build_object(
        'line1', 'Shop No ' || (1 + (random()*200)::int)::text || ', Market Road',
        'city', v_city ->> 'city', 'state', v_city ->> 'state', 'pincode', v_city ->> 'pin'
      )),
      'demo-seed'
    )
    ON CONFLICT (firm_id, gst_number) DO UPDATE SET display_name = EXCLUDED.display_name
    RETURNING id INTO v_contact_id;

    INSERT INTO trading.party_profiles (firm_id, contact_id, party_code, party_type,
      credit_limit, credit_days, commission_rate, opening_balance, opening_type,
      credit_rating, is_active)
    VALUES (
      v_firm_id, v_contact_id, 'BUY-' || lpad(i::text, 4, '0'), 'buyer',
      CASE WHEN random() < 0.3 THEN 0 ELSE (500000 + (random() * 4500000)::int) END,
      CASE WHEN random() < 0.2 THEN 15 WHEN random() < 0.5 THEN 30
           WHEN random() < 0.75 THEN 45 WHEN random() < 0.9 THEN 60 ELSE 90 END,
      CASE WHEN random() < 0.5 THEN 0 ELSE (random() * 5)::numeric(5,2) END,
      0, 'Dr',
      CASE WHEN i % 5 = 0 THEN 'A' WHEN i % 5 = 1 THEN 'B'
           WHEN i % 5 = 2 THEN 'A' WHEN i % 5 = 3 THEN 'C' ELSE 'B' END,
      TRUE
    )
    ON CONFLICT (firm_id, contact_id) DO UPDATE SET party_type = 'buyer'
    RETURNING id INTO v_party_id;
    v_buyer_ids := array_append(v_buyer_ids, v_party_id);
  END LOOP;
  RAISE NOTICE 'Created % buyers', array_length(v_buyer_ids, 1);

  -- 6. 25 TRANSPORTERS --------------------------------------------
  FOR i IN 1 .. 25 LOOP
    v_city := v_indian_cities -> ((random() * 19)::int);
    v_name := (ARRAY['Royal','Speed','Express','Fast','Sure','Bharat','National','Indian','Quick','Safe',
                     'Reliable','Premium','Star','Gold','Silver','Diamond','Crown','Heritage','Modern','Apex',
                     'Continental','Global','Universal','Supreme','Elite'])[i]
            || ' ' || (ARRAY['Transport','Roadways','Logistics','Freight','Carriers','Cargo','Movers','Lines'])
                     [1 + (random() * 7)::int];
    v_phone := '9' || lpad((100000000 + (random()*899999999)::bigint)::text, 9, '0');

    INSERT INTO core.transporters (firm_id, firm_name, contact_person, mobile,
      gst_no, pan, city, state, pincode, email,
      avg_delivery_days, damage_rate, rating, stars, is_active)
    VALUES (
      v_firm_id, v_name,
      v_first_names[1 + (random() * (array_length(v_first_names,1)-1))::int]
        || ' ' || v_last_names[1 + (random() * (array_length(v_last_names,1)-1))::int],
      v_phone,
      (v_city ->> 'gst') || 'AAATT' || lpad((1000 + (random()*8999)::int)::text, 4, '0') || 'E1Z' || ((random()*9)::int),
      'AAATT' || lpad((1000 + (random()*8999)::int)::text, 4, '0') || 'E',
      v_city ->> 'city', v_city ->> 'state', v_city ->> 'pin',
      lower(replace(v_name, ' ', '')) || '@example.com',
      2 + (random() * 8)::int, (random() * 5)::numeric(5,2),
      CASE WHEN i % 4 = 0 THEN 'A+' WHEN i % 4 = 1 THEN 'A' WHEN i % 4 = 2 THEN 'B' ELSE 'C' END,
      3 + (random() * 2)::int, TRUE
    );
  END LOOP;
  RAISE NOTICE 'Created 25 transporters';

  -- 7. 200 BILLS --------------------------------------------------
  FOR i IN 1 .. 200 LOOP
    v_party_id_pick := v_buyer_ids[1 + (random() * 99)::int];
    v_bill_date     := CURRENT_DATE - ((random() * 180)::int);
    v_bill_no       := 'BL/' || to_char(v_bill_date, 'YYYY') || '/' || lpad(i::text, 5, '0');
    v_line_count    := 2 + (random() * 3)::int;
    v_subtotal      := 0;
    v_tax           := 0;

    INSERT INTO trading.bills (firm_id, branch_id, bill_type, bill_no, bill_date,
      party_id, subtotal, taxable_amount, cgst, sgst, igst, total, paid_amount, status,
      created_by)
    VALUES (
      v_firm_id, v_branch_id, 'sales', v_bill_no, v_bill_date,
      v_party_id_pick, 0, 0, 0, 0, 0, 0, 0, 'pending',
      v_admin_id
    )
    RETURNING id INTO v_bill_id;

    FOR j IN 1 .. v_line_count LOOP
      v_item := v_items_seed -> ((random() * 19)::int);
      v_qty  := 1 + (random() * 50)::int;
      v_rate := (v_item ->> 'rate')::numeric;
      v_line_amt := v_qty * v_rate;
      v_line_taxable := v_line_amt;
      v_line_total := v_line_amt + (v_line_amt * (v_item ->> 'tax')::numeric / 100);

      INSERT INTO trading.bill_lines (bill_id, item_id, item_name, hsn_sac, qty, unit,
        rate, tax_rate, taxable_amount, total_amount, sort_order)
      VALUES (
        v_bill_id, NULL, v_item ->> 'name', v_item ->> 'hsn',
        v_qty, v_item ->> 'unit', v_rate, (v_item ->> 'tax')::numeric,
        v_line_taxable, v_line_total, j
      );

      v_subtotal := v_subtotal + v_line_amt;
      v_tax := v_tax + (v_line_amt * (v_item ->> 'tax')::numeric / 100);
    END LOOP;

    v_total := v_subtotal + v_tax;
    v_status_dist := (random() * 10)::int;
    IF v_status_dist < 3 THEN
      v_paid := v_total; v_status := 'paid';
    ELSIF v_status_dist < 6 THEN
      v_paid := (v_total * (0.3 + random() * 0.5))::numeric(14,2); v_status := 'partial';
    ELSE
      v_paid := 0; v_status := 'pending';
    END IF;

    UPDATE trading.bills SET
      subtotal = v_subtotal, taxable_amount = v_subtotal,
      cgst = v_tax / 2, sgst = v_tax / 2,
      total = v_total, paid_amount = v_paid, status = v_status
    WHERE id = v_bill_id;
  END LOOP;
  RAISE NOTICE 'Created 200 bills with lines';

  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '✅ COMPLETE DEMO DATA SEED DONE!';
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '   Trading Suppliers (sellers):  100';
  RAISE NOTICE '   Trading Buyers:               100';
  RAISE NOTICE '   Transporters:                  25';
  RAISE NOTICE '   Items:                         20';
  RAISE NOTICE '   Bills:                        200';
  RAISE NOTICE '   Supplier Categories:           10';
  RAISE NOTICE '   Supplier Directory profiles:  100';
  RAISE NOTICE '   Supplier Photos:           ~200-300';
  RAISE NOTICE '   Supplier Rates:            ~200-300';
  RAISE NOTICE '════════════════════════════════════════';
END $$;
