-- ============================================================================
-- Contour — DEMO / TEST DATA ONLY
-- ----------------------------------------------------------------------------
-- Do NOT run this against a production project.
-- Every row inserted here is prefixed [DEMO] in a human-readable column so it
-- can never be mistaken for a real user's trip.
--
-- Usage (psql):
--   \set demo_user_id '<an existing auth.users id>'
--   \i database/seed.sql
--
-- Usage (Supabase SQL editor): replace :'demo_user_id' below with a quoted uuid.
-- ============================================================================

begin;

do $seed$
declare
  v_user  uuid := current_setting('seed.demo_user_id', true)::uuid;
  v_trip  uuid;
  v_day   uuid;
begin
  if v_user is null then
    raise exception 'Set the user first:  select set_config(''seed.demo_user_id'', ''<uuid>'', false);';
  end if;

  -- ---- TRIP ----------------------------------------------------------------
  insert into public.trips (
    user_id, trip_name, source, destination, start_date, end_date,
    number_of_days, number_of_nights, travellers, travel_mode, trip_type,
    budget_type, budget_amount, food_preference, hotel_preference, interests,
    special_requirements, total_distance, estimated_total_cost, currency, status)
  values (
    v_user, '[DEMO] Rinchenpong Winter Ride', 'Kolkata', 'Rinchenpong, Sikkim',
    '2027-01-23', '2027-01-27', 5, 4, 4, 'Bike', 'Photography',
    'Moderate', 60000, 'Local Food', 'Homestay',
    '["Mountains","Photography","Nature","Culture"]'::jsonb,
    '[DEMO] Two 350cc motorcycles. Homestays with secure parking and hot water.',
    1430, 53240, 'INR', 'Planned')
  returning id into v_trip;

  -- ---- ROUTES --------------------------------------------------------------
  insert into public.routes (
    trip_id, route_order, from_location, to_location, distance_km, duration_minutes,
    recommended_breaks, fuel_stops, toll_estimate, fuel_estimate, fuel_cost, provider, verified)
  values
    (v_trip, 1, 'Kolkata', 'Siliguri',       565, 690, '["Palsit","Farakka","Dalkhola"]'::jsonb, '["Palsit","Farakka","Dalkhola"]'::jsonb, 0, 32.3, 3440, 'ai-estimate', false),
    (v_trip, 2, 'Siliguri', 'Rinchenpong',   135, 300, '["Coronation Bridge","Melli","Jorethang"]'::jsonb, '["Jorethang"]'::jsonb, 0,  7.7,  820, 'ai-estimate', false),
    (v_trip, 3, 'Rinchenpong', 'Local circuit', 62, 180, '["Kathok Lake","Pelling"]'::jsonb, '[]'::jsonb, 0,  3.5,  380, 'ai-estimate', false),
    (v_trip, 4, 'Rinchenpong', 'Malda',      330, 480, '["Jorethang","Siliguri bypass","Dalkhola"]'::jsonb, '["Jorethang","Siliguri"]'::jsonb, 0, 18.9, 2010, 'ai-estimate', false),
    (v_trip, 5, 'Malda', 'Kolkata',          338, 420, '["Farakka","Berhampore"]'::jsonb, '["Farakka","Berhampore"]'::jsonb, 0, 19.3, 2060, 'ai-estimate', false);

  -- ---- DAY 1 ---------------------------------------------------------------
  insert into public.itinerary_days (trip_id, day_number, date, title, location, summary, distance, travel_time_minutes, estimated_cost)
  values (v_trip, 1, '2027-01-23', '[DEMO] Kolkata to Siliguri', 'Siliguri, West Bengal',
          'Long highway day. Start before first light to clear the city; keep the last 80 km before dark.',
          565, 690, 11850)
  returning id into v_day;

  insert into public.itinerary_activities (
    day_id, activity_order, start_time, end_time, activity_name, activity_type,
    location, duration_minutes, distance_from_previous, travel_time_minutes,
    estimated_cost, priority, description, verified)
  values
    (v_day, 1, '05:30', '06:00', 'Pre-ride check', 'prep', 'Kolkata', 30, 0, 0, 0, 'Must Visit', 'Tyre pressure, chain lube, luggage straps, documents.', false),
    (v_day, 2, '06:00', '09:15', 'Departure to Bardhaman stretch', 'travel', 'NH-12', 195, 110, 195, 0, 'Must Visit', 'Clear the city before traffic builds.', false),
    (v_day, 3, '09:15', '10:00', 'Breakfast halt', 'food', 'Palsit area', 45, 0, 0, 720, 'Recommended', 'Highway dhaba stop, approx 180 per person.', false),
    (v_day, 4, '10:00', '13:15', 'Ride to Farakka', 'travel', 'NH-12', 195, 175, 195, 0, 'Must Visit', 'Fuel top-up before the barrage crossing.', false),
    (v_day, 5, '13:15', '14:15', 'Lunch and fuel stop', 'food', 'Farakka', 60, 0, 0, 1400, 'Recommended', 'Refuel both bikes here.', false),
    (v_day, 6, '14:15', '17:00', 'Farakka to Dalkhola', 'travel', 'NH-12 / NH-27', 165, 150, 165, 0, 'Must Visit', 'Truck-heavy section.', false),
    (v_day, 7, '17:00', '17:30', 'Tea and stretch', 'rest', 'Dalkhola', 30, 0, 0, 260, 'Optional', 'Mandatory on a day this long.', false),
    (v_day, 8, '17:30', '19:15', 'Final run into Siliguri', 'travel', 'NH-27', 105, 130, 105, 0, 'Must Visit', 'Last 40 km after dusk.', false),
    (v_day, 9, '19:15', '20:15', 'Hotel check-in', 'stay', 'Siliguri', 60, 0, 0, 4400, 'Must Visit', 'Two twin rooms, covered parking.', false),
    (v_day, 10, '20:15', '21:30', 'Dinner', 'food', 'Siliguri', 75, 0, 0, 1800, 'Recommended', 'Early dinner before the mountain day.', false);

  -- ---- DAY 2 ---------------------------------------------------------------
  insert into public.itinerary_days (trip_id, day_number, date, title, location, summary, distance, travel_time_minutes, estimated_cost)
  values (v_trip, 2, '2027-01-24', '[DEMO] Siliguri to Rinchenpong', 'Rinchenpong, West Sikkim',
          'Teesta valley, Coronation Bridge, then the climb through Jorethang to 1,700 m.',
          135, 300, 9400)
  returning id into v_day;

  insert into public.itinerary_activities (
    day_id, activity_order, start_time, end_time, activity_name, activity_type,
    location, duration_minutes, distance_from_previous, travel_time_minutes,
    estimated_cost, priority, description, verified)
  values
    (v_day, 1, '07:00', '07:45', 'Breakfast', 'food', 'Siliguri', 45, 0, 0, 900, 'Recommended', 'Few good stops before Jorethang.', false),
    (v_day, 2, '07:45', '09:00', 'Siliguri to Sevoke', 'travel', 'NH-10', 75, 32, 75, 0, 'Must Visit', 'Enter the Teesta corridor.', false),
    (v_day, 3, '09:00', '09:40', 'Coronation Bridge photo stop', 'sight', 'Sevoke', 40, 0, 0, 0, 'Must Visit', 'Park on the far side and walk back.', true),
    (v_day, 4, '09:40', '11:30', 'Teesta valley ride to Melli', 'travel', 'NH-10', 110, 38, 110, 0, 'Must Visit', 'Best riding of the trip.', false),
    (v_day, 5, '11:30', '12:30', 'Lunch at Jorethang', 'food', 'Jorethang', 60, 22, 45, 1200, 'Recommended', 'Last town-sized halt before the climb.', false),
    (v_day, 6, '12:30', '14:45', 'Climb to Rinchenpong', 'travel', 'Jorethang to Rinchenpong', 135, 43, 135, 0, 'Must Visit', '43 km of switchbacks, ride it slow.', false),
    (v_day, 7, '14:45', '15:45', 'Homestay check-in', 'stay', 'Rinchenpong', 60, 0, 0, 4400, 'Must Visit', 'Ask for a ridge-facing room.', false),
    (v_day, 8, '16:00', '17:20', 'Monastery and sunset', 'sight', 'Rinchenpong', 80, 2, 8, 0, 'Must Visit', 'Be in position by 16:40.', true),
    (v_day, 9, '19:30', '20:45', 'Dinner at the homestay', 'food', 'Rinchenpong', 75, 0, 0, 1400, 'Recommended', 'Order at check-in.', false);

  -- ---- DAY 3 ---------------------------------------------------------------
  insert into public.itinerary_days (trip_id, day_number, date, title, location, summary, distance, travel_time_minutes, estimated_cost)
  values (v_trip, 3, '2027-01-25', '[DEMO] Rinchenpong local circuit', 'Rinchenpong, West Sikkim',
          'No long riding. Sunrise on the ridge, monastery, lake, golden hour at the viewpoint.',
          62, 180, 7100)
  returning id into v_day;

  insert into public.itinerary_activities (
    day_id, activity_order, start_time, end_time, activity_name, activity_type,
    location, duration_minutes, distance_from_previous, travel_time_minutes,
    estimated_cost, priority, description, verified)
  values
    (v_day, 1, '05:45', '07:15', 'Sunrise on the ridge', 'sight', 'Rinchenpong ridge', 90, 3, 12, 0, 'Must Visit', 'Carry a tripod and gloves.', true),
    (v_day, 2, '07:30', '08:30', 'Breakfast', 'food', 'Rinchenpong', 60, 0, 0, 900, 'Recommended', 'Warm up before heading out.', false),
    (v_day, 3, '09:15', '10:30', 'Monastery interior', 'sight', 'Rinchenpong', 75, 2, 8, 0, 'Recommended', 'Ask before photographing inside.', true),
    (v_day, 4, '10:45', '12:15', 'Kathok Lake walk', 'sight', 'Kathok', 90, 4, 15, 0, 'Must Visit', 'Short forest path, flat and easy.', true),
    (v_day, 5, '12:30', '13:45', 'Lunch', 'food', 'Rinchenpong', 75, 5, 15, 1600, 'Recommended', 'Vegetarian options available.', false),
    (v_day, 6, '14:30', '16:00', 'Pelling Skywalk detour', 'sight', 'Pelling', 90, 18, 45, 800, 'Optional', 'Drop it if the group is tired.', true),
    (v_day, 7, '16:30', '17:30', 'Golden hour at the viewpoint', 'sight', 'Rinchenpong', 60, 18, 45, 0, 'Must Visit', 'The best light of the trip.', true),
    (v_day, 8, '19:30', '20:45', 'Dinner and route brief', 'food', 'Rinchenpong', 75, 0, 0, 1400, 'Recommended', 'Plan the 05:30 descent.', false);

  -- ---- DAY 4 ---------------------------------------------------------------
  insert into public.itinerary_days (trip_id, day_number, date, title, location, summary, distance, travel_time_minutes, estimated_cost)
  values (v_trip, 4, '2027-01-26', '[DEMO] Rinchenpong to Malda', 'Malda, West Bengal',
          'Descend early while the ghat road is empty. Malda breaks the return into two halves.',
          330, 480, 8900)
  returning id into v_day;

  insert into public.itinerary_activities (
    day_id, activity_order, start_time, end_time, activity_name, activity_type,
    location, duration_minutes, distance_from_previous, travel_time_minutes,
    estimated_cost, priority, description, verified)
  values
    (v_day, 1, '06:00', '06:30', 'Cold-start and load up', 'prep', 'Rinchenpong', 30, 0, 0, 0, 'Must Visit', 'Check brakes before a long descent.', false),
    (v_day, 2, '06:30', '09:00', 'Descent to Jorethang', 'travel', 'Rinchenpong to Jorethang', 150, 43, 150, 0, 'Must Visit', 'Engine-brake, do not ride the discs.', false),
    (v_day, 3, '09:00', '09:45', 'Breakfast and refuel', 'food', 'Jorethang', 45, 0, 0, 800, 'Recommended', 'Cheaper than on NH-10.', false),
    (v_day, 4, '09:45', '12:30', 'Teesta valley to Siliguri', 'travel', 'NH-10', 165, 97, 165, 0, 'Must Visit', 'Watch for landslide repair crews.', false),
    (v_day, 5, '12:30', '13:30', 'Lunch at the bypass', 'food', 'Siliguri', 60, 0, 0, 1400, 'Recommended', 'Do not go into town.', false),
    (v_day, 6, '13:30', '18:00', 'Siliguri to Malda', 'travel', 'NH-27 / NH-12', 270, 190, 270, 0, 'Must Visit', 'One break at Dalkhola.', false),
    (v_day, 7, '18:00', '19:00', 'Hotel check-in', 'stay', 'Malda', 60, 0, 0, 3600, 'Must Visit', 'Prioritise parking.', false),
    (v_day, 8, '19:30', '20:45', 'Dinner', 'food', 'Malda', 75, 0, 0, 1600, 'Recommended', 'Eat and sleep.', false);

  -- ---- DAY 5 ---------------------------------------------------------------
  insert into public.itinerary_days (trip_id, day_number, date, title, location, summary, distance, travel_time_minutes, estimated_cost)
  values (v_trip, 5, '2027-01-27', '[DEMO] Malda to Kolkata', 'Kolkata, West Bengal',
          'Final run down NH-12. Easy pace, one long lunch, home before evening traffic.',
          338, 420, 5990)
  returning id into v_day;

  insert into public.itinerary_activities (
    day_id, activity_order, start_time, end_time, activity_name, activity_type,
    location, duration_minutes, distance_from_previous, travel_time_minutes,
    estimated_cost, priority, description, verified)
  values
    (v_day, 1, '07:00', '07:45', 'Breakfast and check-out', 'food', 'Malda', 45, 0, 0, 800, 'Recommended', 'Settle the bill the night before.', false),
    (v_day, 2, '07:45', '11:30', 'Malda to Murshidabad', 'travel', 'NH-12', 225, 175, 225, 0, 'Must Visit', 'Cross Farakka before the truck queues.', false),
    (v_day, 3, '11:30', '12:45', 'Lunch and last fuel stop', 'food', 'Berhampore', 75, 0, 0, 1600, 'Recommended', 'Long lunch.', false),
    (v_day, 4, '12:45', '16:30', 'Berhampore to Kolkata', 'travel', 'NH-12', 225, 163, 225, 0, 'Must Visit', 'Inside the city before 17:00.', false),
    (v_day, 5, '16:30', '17:00', 'Arrival and odometer read', 'rest', 'Kolkata', 30, 0, 0, 0, 'Optional', 'Log the final distance.', false);

  -- ---- HOTELS (all unverified — price bands, not listings) -----------------
  insert into public.hotels (trip_id, location, hotel_name, category, address, price_per_night, facilities, source, verified, note)
  values
    (v_trip, 'Siliguri',    '[DEMO] Budget lodge near Sevoke Road',        'Budget',    'Sevoke Road corridor', 1600, '["Covered parking","Hot water","Wi-Fi"]'::jsonb, 'ai-estimate', false, 'Search this corridor on a booking app.'),
    (v_trip, 'Siliguri',    '[DEMO] Mid-range hotel, Hill Cart Road',      'Mid-Range', 'Hill Cart Road',       2600, '["Secure parking","Restaurant","24h check-in"]'::jsonb, 'ai-estimate', false, 'Best band for a late arrival.'),
    (v_trip, 'Siliguri',    '[DEMO] Premium business hotel',              'Premium',   'Pradhan Nagar',        4800, '["Valet parking","Gym","Buffet breakfast"]'::jsonb, 'ai-estimate', false, 'Overkill for one night.'),
    (v_trip, 'Rinchenpong', '[DEMO] Village homestay, ridge side',        'Budget',    'Rinchenpong village',  1800, '["Home-cooked meals","Bike parking"]'::jsonb, 'ai-estimate', false, 'Often phone bookings only.'),
    (v_trip, 'Rinchenpong', '[DEMO] Mountain-view homestay',              'Mid-Range', 'Rinchenpong',          2800, '["Range view","Meals included","Parking"]'::jsonb, 'ai-estimate', false, 'Confirm room orientation.'),
    (v_trip, 'Rinchenpong', '[DEMO] Boutique resort, Pelling side',       'Premium',   'Rinchenpong–Pelling',  6200, '["Heated rooms","Restaurant","Terrace"]'::jsonb, 'ai-estimate', false, 'Adds 20 minutes to every local leg.'),
    (v_trip, 'Malda',       '[DEMO] Station-area business hotel',         'Mid-Range', 'Near Malda Town',      1800, '["Parking","Restaurant"]'::jsonb, 'ai-estimate', false, 'Transit stop. Parking over everything.');

  -- ---- RESTAURANTS ---------------------------------------------------------
  insert into public.restaurants (trip_id, location, restaurant_name, meal, address, cuisine, price_range, signature_dishes, verified)
  values
    (v_trip, 'Palsit, NH-19', '[DEMO] Highway dhaba cluster',        'Breakfast', 'Palsit toll area',     'North Indian',        '150-220 per person', 'Aloo paratha, chhole, masala chai', false),
    (v_trip, 'Farakka',       '[DEMO] Barrage-side eateries',        'Lunch',     'NH-12 near barrage',   'Bengali',             '250-400 per person', 'Rice-dal-fish thali', false),
    (v_trip, 'Siliguri',      '[DEMO] Sevoke Road restaurant strip', 'Dinner',    'Sevoke Road',          'Multi-cuisine',       '350-550 per person', 'Momos, thukpa, tandoori', false),
    (v_trip, 'Jorethang',     '[DEMO] Market-side kitchens',         'Lunch',     'Jorethang bazaar',     'Sikkimese / Nepali',  '180-300 per person', 'Thukpa, momos, gundruk soup', false),
    (v_trip, 'Rinchenpong',   '[DEMO] Homestay kitchen',             'Dinner',    'Your homestay',        'Home-style Sikkimese','300-400 per person', 'Dal-bhat-tarkari, sel roti', false),
    (v_trip, 'Rinchenpong',   '[DEMO] Village tea shops',            'Snacks',    'Village centre',       'Local',               '60-120 per person',  'Butter tea, momos, thenthuk', false),
    (v_trip, 'Berhampore',    '[DEMO] NH-12 lunch stops',            'Lunch',     'NH-12',                'Bengali',             '250-400 per person', 'Bhetki fry, kosha mangsho', false);

  -- ---- SIGHTSEEING (real public landmarks — verified) ----------------------
  insert into public.sightseeing_places (trip_id, name, location, category, description, recommended_duration, entry_fee, best_time, priority, verified)
  values
    (v_trip, 'Coronation Bridge',            'Sevoke',            'Architecture', 'Single-arch bridge over the Teesta, built 1941.',            40, 0,   '08:30-10:00 for side light', 'Must Visit', true),
    (v_trip, 'Rinchenpong Monastery',        'Rinchenpong',       'Spiritual',    'Nyingma monastery from 1730 on the ridge above the village.', 75, 0,   'Early morning, or 16:30', 'Must Visit', true),
    (v_trip, 'Kathok Lake',                  'Kathok',            'Nature',       'Small sacred lake reached by a short forest path.',           90, 0,   '10:00-12:00', 'Must Visit', true),
    (v_trip, 'Rinchenpong ridge viewpoint',  'Rinchenpong',       'Photography',  'Sunrise and golden-hour spot facing the range.',              90, 0,   'Sunrise and 16:15', 'Must Visit', true),
    (v_trip, 'Pelling Skywalk',              'Pelling',           'Architecture', 'Glass-floored walkway above the Chenrezig statue.',           90, 200, 'Late afternoon', 'Optional', true),
    (v_trip, 'Teesta valley scenic stretch', 'NH-10',             'Photography',  '38 km of river-side riding with frequent pull-offs.',        110, 0,   '09:00-11:30', 'Must Visit', true);

  -- ---- BUDGET -------------------------------------------------------------
  insert into public.expenses (trip_id, category, description, estimated_amount, currency, expense_date, payment_method, notes)
  values
    (v_trip, 'Transportation',  '[DEMO] Fuel, both bikes, full trip', 8710,  'INR', '2027-01-23', 'UPI',   '1,430 km at 35 km/l'),
    (v_trip, 'Toll',            '[DEMO] Tolls and vehicle entry',      400,  'INR', '2027-01-23', 'Cash',  'Two-wheelers mostly exempt'),
    (v_trip, 'Hotel',           '[DEMO] 4 nights x 2 rooms',         17600,  'INR', '2027-01-23', 'Card',  'Mid-range band'),
    (v_trip, 'Food',            '[DEMO] 5 days x 4 travellers',      14000,  'INR', '2027-01-23', 'UPI',   '700 per person per day'),
    (v_trip, 'Activities',      '[DEMO] Entry fees and permits',      3200,  'INR', '2027-01-25', 'Cash',  'Skywalk, donations, vehicle permit'),
    (v_trip, 'Parking',         '[DEMO] Hotel and attraction parking',  900,  'INR', '2027-01-23', 'Cash',  null),
    (v_trip, 'Local Transport', '[DEMO] Shared jeeps',                 1500,  'INR', '2027-01-25', 'Cash',  null),
    (v_trip, 'Miscellaneous',   '[DEMO] Spares, chain lube, first aid', 2100, 'INR', '2027-01-22', 'Card',  null),
    (v_trip, 'Emergency Buffer','[DEMO] 10% contingency',              4830,  'INR', '2027-01-23', 'Card',  'Breakdown, weather delay, medical');

  -- ---- PACKING ------------------------------------------------------------
  insert into public.packing_items (trip_id, category, item_name, quantity, completed)
  values
    (v_trip, 'Documents',     'Driving licence + RC (originals)', 2, true),
    (v_trip, 'Documents',     'Bike insurance + PUC',             2, true),
    (v_trip, 'Documents',     'Photo ID for hotel check-in',      4, true),
    (v_trip, 'Documents',     'Printed itinerary + contacts',     1, false),
    (v_trip, 'Clothing',      'Thermal base layers',              4, true),
    (v_trip, 'Clothing',      'Riding jacket with armour',        2, true),
    (v_trip, 'Clothing',      'Waterproof over-gloves',           4, false),
    (v_trip, 'Clothing',      'Balaclava / neck warmer',          4, true),
    (v_trip, 'Weather Items', 'Rain suit',                        4, true),
    (v_trip, 'Weather Items', 'Sunscreen SPF50',                  1, false),
    (v_trip, 'Weather Items', 'Lip balm and moisturiser',         2, true),
    (v_trip, 'Electronics',   'Phone mount + USB charger',        2, true),
    (v_trip, 'Electronics',   'Power bank 20,000 mAh',            2, true),
    (v_trip, 'Electronics',   'Camera, spare batteries, tripod',  1, false),
    (v_trip, 'Bike Gear',     'Puncture kit + tyre inflator',     1, true),
    (v_trip, 'Bike Gear',     'Chain lube and tool roll',         1, true),
    (v_trip, 'Bike Gear',     'Spare clutch and brake levers',    1, false),
    (v_trip, 'Bike Gear',     'Bungee cords and dry bag',         4, true),
    (v_trip, 'Toiletries',    'Quick-dry towel and toiletries',   4, false),
    (v_trip, 'Travel Gear',   'First aid kit + medication',       1, false);

  -- ---- CHECKLIST ----------------------------------------------------------
  insert into public.trip_checklists (trip_id, label, done, item_order)
  values
    (v_trip, 'Homestays booked and confirmed by phone', true,  1),
    (v_trip, 'Bikes serviced — chain, brakes, tyres',   true,  2),
    (v_trip, 'Documents scanned to cloud',              true,  3),
    (v_trip, 'Fuel plan checked against pump locations',true,  4),
    (v_trip, 'Weather checked 48h before departure',    false, 5),
    (v_trip, 'Emergency contacts saved offline',        true,  6),
    (v_trip, 'Cash + UPI limits sorted',                false, 7),
    (v_trip, 'Offline maps downloaded for Sikkim',      false, 8),
    (v_trip, 'Packing completed',                       false, 9);

  -- ---- SAVED PLACES -------------------------------------------------------
  insert into public.saved_places (user_id, name, location, place_type, notes)
  values
    (v_user, '[DEMO] Rinchenpong ridge viewpoint', 'West Sikkim', 'Photography', 'Return in October for clearer air.'),
    (v_user, '[DEMO] Mountain-view homestay',      'West Sikkim', 'Hotel',       'Balcony rooms only. Book direct.'),
    (v_user, '[DEMO] Market-side kitchen',         'Jorethang',   'Restaurant',  'Cash only.'),
    (v_user, '[DEMO] Coronation Bridge',           'Sevoke, WB',  'Attraction',  'Side light before 10:00.');

  raise notice 'Seeded demo trip %', v_trip;
end
$seed$;

commit;

-- ----------------------------------------------------------------------------
-- To remove every demo row again:
--   delete from public.trips        where trip_name like '[DEMO]%';
--   delete from public.saved_places where name      like '[DEMO]%';
-- (trips cascades to all 8 child tables)
-- ----------------------------------------------------------------------------
