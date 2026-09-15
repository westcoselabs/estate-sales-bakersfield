-- Static synthetic fixtures, executed only by the restricted isolated-schema
-- benchmark harness. Keep triggers and foreign keys enabled throughout.
CREATE FUNCTION benchmark_id(prefix integer, n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT (lpad(prefix::text, 8, '0') || '-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;
-- @statement
CREATE TEMP TABLE benchmark_rows ON COMMIT DROP AS
SELECT n, benchmark_id(1,n) AS user_id, benchmark_id(2,n) AS organizer_id,
  benchmark_id(3,n) AS event_id, benchmark_id(4,n) AS photo_id,
  benchmark_id(5,n) AS approval_id, benchmark_id(6,n) AS payment_id,
  benchmark_id(7,n) AS publication_id, benchmark_id(8,n) AS source_record_id,
  benchmark_id(9,n) AS candidate_id, benchmark_id(10,n) AS observation_id,
  benchmark_id(11,n) AS listing_id, lpad(to_hex(n),12,'0') AS public_id,
  CASE WHEN n % 2 = 0 THEN 'ESTATE_SALE' ELSE 'YARD_SALE' END::event_type AS event_type,
  CASE WHEN n % 10 = 0 THEN 'APPROXIMATE_LOCATION' WHEN n % 10 = 1 THEN 'HIDDEN_UNTIL_START' ELSE 'EXACT_ADDRESS' END::address_privacy_mode AS privacy_mode,
  CASE WHEN n % 11 = 0 THEN 'Delano' ELSE 'Bakersfield' END AS city,
  '2030-05-01T15:00:00Z'::timestamptz + (n % 45 - 10) * interval '1 day' AS starts_at,
  '2030-05-01T21:00:00Z'::timestamptz + (n % 45 - 10) * interval '1 day' AS ends_at,
  (35.1 + (n % 65) * 0.01)::numeric(9,6) AS latitude,
  (-119.4 + (n % 75) * 0.01)::numeric(9,6) AS longitude
FROM generate_series(1,current_setting('benchmark.listings')::integer) AS n;
-- @statement
ALTER TABLE benchmark_rows ADD COLUMN canonical_path text, ADD COLUMN payload jsonb;
-- @statement
UPDATE benchmark_rows SET canonical_path = CASE WHEN event_type = 'ESTATE_SALE' THEN '/estate-sales/' ELSE '/yard-sales/' END || 'benchmark-sale-' || public_id;
-- @statement
UPDATE benchmark_rows SET payload = jsonb_build_object(
  'eventType',event_type,'title','Synthetic benchmark sale ' || n,
  'description','Synthetic inventory for isolated performance measurement only.',
  'localStartsAt',to_char(starts_at AT TIME ZONE 'America/Los_Angeles','YYYY-MM-DD"T"HH24:MI'),
  'localEndsAt',to_char(ends_at AT TIME ZONE 'America/Los_Angeles','YYYY-MM-DD"T"HH24:MI'),
  'startsAt',to_char(starts_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'endsAt',to_char(ends_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'timezone','America/Los_Angeles','addressLine1',n || ' Benchmark Street','addressLine2',NULL,
  'city',city,'region','CA','postalCode','93301','countryCode','US','privacyMode',privacy_mode);
-- @statement
INSERT INTO users (id,display_name,email,normalized_email,password_hash,email_verified_at,role,updated_at)
SELECT benchmark_id(1,n),'Benchmark user ' || n,'benchmark-' || n || '@example.invalid',
  'benchmark-' || n || '@example.invalid','unusable-synthetic-benchmark-hash',CURRENT_TIMESTAMP,
  CASE WHEN n=1 THEN 'SUPER_ADMIN' ELSE 'USER' END::user_role,CURRENT_TIMESTAMP
FROM generate_series(1,current_setting('benchmark.users')::integer) AS n;
-- @statement
INSERT INTO organizer_profiles(id,user_id,display_name,contact_name,contact_email,status,updated_at)
SELECT organizer_id,user_id,'Benchmark organizer ' || n,'Fixture owner','benchmark-' || n || '@example.invalid','COMPLETE',CURRENT_TIMESTAMP
FROM benchmark_rows WHERE n <= current_setting('benchmark.listings')::integer / 2;
-- @statement
INSERT INTO events(id,organizer_id,public_id,slug,title,description,event_type,local_starts_at,local_ends_at,starts_at,ends_at,timezone,privacy_mode,workflow_state)
SELECT event_id,organizer_id,public_id,'benchmark-sale',payload->>'title',payload->>'description',event_type,
  payload->>'localStartsAt',payload->>'localEndsAt',starts_at,ends_at,'America/Los_Angeles',privacy_mode,'PREVIEW_READY'
FROM benchmark_rows WHERE n <= current_setting('benchmark.listings')::integer / 2;
-- @statement
INSERT INTO event_locations(event_id,address_line_1,city,region,postal_code,country_code,normalized_address,latitude,longitude,coordinates,timezone,provider_place_id,provider_name,resolution_source,confirmation_status,confirmed_by_user_id,confirmed_at,public_zone,precision,confidence,validation_status,updated_at)
SELECT event_id,payload->>'addressLine1',city,'CA','93301','US',payload->>'addressLine1',latitude,longitude,
  public.ST_SetSRID(public.ST_MakePoint(longitude,latitude),4326)::public.geography,
  'America/Los_Angeles','benchmark-' || n,'fixture','ORGANIZER_AUTOCOMPLETE','CONFIRMED',user_id,CURRENT_TIMESTAMP,'bakersfield','exact',1,'VERIFIED',CURRENT_TIMESTAMP
FROM benchmark_rows WHERE n <= current_setting('benchmark.listings')::integer / 2;
-- @statement
INSERT INTO event_photos(id,event_id,status,sort_order,dashboard_thumbnail_key,listing_card_key,gallery_key,cover_display_key,dashboard_thumbnail_hash,listing_card_hash,gallery_hash,cover_display_hash,source_content_type,source_size,width,height,ready_at,updated_at)
SELECT photo_id,event_id,'READY',0,'benchmark/' || n || '/thumb','benchmark/' || n || '/card','benchmark/' || n || '/gallery','benchmark/' || n || '/cover',repeat('a',64),repeat('a',64),repeat('a',64),repeat('a',64),'image/jpeg',100000,1600,1200,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM benchmark_rows WHERE n <= current_setting('benchmark.listings')::integer / 2;
-- @statement
INSERT INTO event_approvals(id,event_id,organizer_id,accepted_by_user_id,content_revision,approval_digest,terms_version,terms_accepted_at,approved_at)
SELECT approval_id,event_id,organizer_id,user_id,1,repeat('a',64),'benchmark-fixture-v1',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM benchmark_rows WHERE n <= current_setting('benchmark.listings')::integer / 2;
-- @statement
UPDATE events AS e SET workflow_state='APPROVED_FOR_PAYMENT',approval_status='APPROVED',approved_revision=1,approval_digest=repeat('a',64),approved_at=CURRENT_TIMESTAMP,terms_version='benchmark-fixture-v1',terms_accepted_at=CURRENT_TIMESTAMP,terms_accepted_by_user_id=b.user_id,current_approval_id=b.approval_id,cover_photo_id=b.photo_id
FROM benchmark_rows AS b WHERE e.id=b.event_id;
-- @statement
INSERT INTO payment_attempts(id,event_id,organizer_id,user_id,approval_id,approved_revision,approved_digest,attempt_generation,environment,stripe_checkout_session_id,stripe_price_id,expected_amount,expected_currency,checkout_state,payment_state,fulfillment_state,expires_at,paid_at,fulfilled_at,updated_at)
SELECT payment_id,event_id,organizer_id,user_id,approval_id,1,repeat('a',64),1,'test','cs_test_benchmark_' || n,'price_test_benchmark',100,'usd','COMPLETE','PAID','FULFILLED',CURRENT_TIMESTAMP + interval '1 hour',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM benchmark_rows WHERE n <= current_setting('benchmark.listings')::integer / 2;
-- @statement
INSERT INTO event_publications(id,event_id,payment_attempt_id,approved_revision,approval_digest,public_id,canonical_path,snapshot,published_at)
SELECT publication_id,event_id,payment_id,1,repeat('a',64),public_id,canonical_path,
  jsonb_build_object('schema','estate-sales-publication-v1','privacyMode',privacy_mode,
    'projection',jsonb_build_object('title',payload->>'title','description',payload->>'description','eventType',event_type,'path',canonical_path,
      'startsAt',payload->>'startsAt','endsAt',payload->>'endsAt','timezone','America/Los_Angeles','localStartsAt',payload->>'localStartsAt','localEndsAt',payload->>'localEndsAt',
      'address',CASE WHEN privacy_mode='APPROXIMATE_LOCATION' THEN jsonb_build_object('kind','APPROXIMATE','city',city,'region','CA','countryCode','US','label','Bakersfield area')
        ELSE jsonb_build_object('kind','EXACT','addressLine1',payload->>'addressLine1','addressLine2',NULL,'city',city,'region','CA','postalCode','93301','countryCode','US') END,
      'organizer',jsonb_build_object('displayName','Benchmark organizer ' || n,'websiteUrl',NULL,'contactEmail',NULL),
      'coverPhotoUrl','/media/' || photo_id || '/cover',
      'gallery',jsonb_build_array(jsonb_build_object('id',photo_id,'url','/media/' || photo_id || '/gallery','position',0)))),CURRENT_TIMESTAMP
FROM benchmark_rows WHERE n <= current_setting('benchmark.listings')::integer / 2;
-- @statement
INSERT INTO listing_import_sources(id,key,name,allowed_hosts,enabled,production_allowed,updated_at)
VALUES(benchmark_id(13,1),'benchmark-fixture','Synthetic benchmark source',ARRAY['example.invalid'],true,false,CURRENT_TIMESTAMP);
-- @statement
INSERT INTO listing_import_batches(id,source_id,admin_actor_user_id,transport,contract_version,parser_version,ingestor_run_id,ingestor_instance_id,request_digest,payload_digest,status,total_rows,candidate_rows,invalid_rows,exact_duplicate_rows,source_changed_rows,identity_conflict_rows,completed_at)
SELECT benchmark_id(12,batch),benchmark_id(13,1),benchmark_id(1,1),'MANUAL_JSON','benchmark-v1','benchmark-v1','run-' || batch,'benchmark',repeat('b',64),repeat('b',64),'COMPLETED',count(*)::integer,count(*)::integer,0,0,0,0,CURRENT_TIMESTAMP
FROM (SELECT ((n-current_setting('benchmark.listings')::integer/2-1)/200)+1 AS batch FROM benchmark_rows WHERE n>current_setting('benchmark.listings')::integer/2) AS batches GROUP BY batch;
-- @statement
INSERT INTO listing_source_records(id,source_id,source_listing_id,canonical_source_url,first_seen_at,last_seen_at,last_content_hash,updated_at)
SELECT source_record_id,benchmark_id(13,1),'benchmark-' || n,'https://example.invalid/sales/' || n,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,repeat('b',64),CURRENT_TIMESTAMP
FROM benchmark_rows WHERE n>current_setting('benchmark.listings')::integer/2;
-- @statement
INSERT INTO listing_import_rows(id,batch_id,row_number,source_record_id,status,input_json,normalized_json,content_hash)
SELECT observation_id,benchmark_id(12,((n-current_setting('benchmark.listings')::integer/2-1)/200)+1),((n-current_setting('benchmark.listings')::integer/2-1)%200)+1,source_record_id,'CANDIDATE_CREATED',payload,payload,repeat('b',64)
FROM benchmark_rows WHERE n>current_setting('benchmark.listings')::integer/2;
-- @statement
INSERT INTO listing_import_candidates(id,source_record_id,creation_observation_id,latest_observation_id,current_payload,normalized_title,normalized_address,normalized_city,normalized_postal_code,starts_at,ends_at,latitude,longitude,coordinates,location_provider_place_id,location_provider_name,location_resolution_source,location_confirmation_status,location_confirmed_by_user_id,location_confirmed_at,status,reviewed_by_user_id,reviewed_at,updated_at)
SELECT candidate_id,source_record_id,observation_id,observation_id,payload,lower(payload->>'title'),lower(payload->>'addressLine1'),lower(city),'93301',starts_at,ends_at,latitude,longitude,
  public.ST_SetSRID(public.ST_MakePoint(longitude,latitude),4326)::public.geography,
  'benchmark-' || n,'fixture','ADMIN_GEOCODING','CONFIRMED',benchmark_id(1,1),CURRENT_TIMESTAMP,'APPROVED',benchmark_id(1,1),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM benchmark_rows WHERE n>current_setting('benchmark.listings')::integer/2;
-- @statement
INSERT INTO external_listings(id,candidate_id,primary_source_record_id,public_id,slug,canonical_path,event_type,title,description,local_starts_at,local_ends_at,starts_at,ends_at,timezone,privacy_mode,attribution,published_at,updated_at)
SELECT listing_id,candidate_id,source_record_id,public_id,'benchmark-sale',canonical_path,event_type,payload->>'title',payload->>'description',payload->>'localStartsAt',payload->>'localEndsAt',starts_at,ends_at,'America/Los_Angeles',privacy_mode,
  jsonb_build_object('schema','external-listing-attribution.v1','sourceId',benchmark_id(13,1),'sourceKey','benchmark-fixture','sourceName','Synthetic benchmark source','sourceListingId','benchmark-' || n,'sourceUrl','https://example.invalid/sales/' || n),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM benchmark_rows WHERE n>current_setting('benchmark.listings')::integer/2;
-- @statement
INSERT INTO external_listing_locations(listing_id,address_line_1,city,region,postal_code,country_code,normalized_address,latitude,longitude,coordinates,timezone,provider_place_id,provider_name,resolution_source,confirmation_status,confirmed_by_user_id,confirmed_at,public_zone,precision,confidence,validation_status,updated_at)
SELECT listing_id,payload->>'addressLine1',city,'CA','93301','US',payload->>'addressLine1',latitude,longitude,
  public.ST_SetSRID(public.ST_MakePoint(longitude,latitude),4326)::public.geography,
  'America/Los_Angeles','benchmark-' || n,'fixture','ADMIN_GEOCODING','CONFIRMED',benchmark_id(1,1),CURRENT_TIMESTAMP,'bakersfield','exact',1,'VERIFIED',CURRENT_TIMESTAMP
FROM benchmark_rows WHERE n>current_setting('benchmark.listings')::integer/2;
-- @statement
UPDATE listing_import_batches SET sealed_at=CURRENT_TIMESTAMP WHERE source_id=benchmark_id(13,1);
