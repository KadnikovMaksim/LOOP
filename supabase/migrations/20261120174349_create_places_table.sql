/*
# Create places table for collaborative travel guide

1. New Tables
- `places`
  - `id` (uuid, primary key, default gen_random_uuid())
  - `title` (text, not null) — name of the attraction/place
  - `description` (text, not null) — history / why it's special
  - `category` (text, not null) — one of: monument, scenic, cafe, hidden_gem
  - `lat` (double precision, not null) — latitude
  - `lng` (double precision, not null) — longitude
  - `image_url` (text, nullable) — photo of the place (storage URL or data URL)
  - `is_user_submitted` (boolean, default false) — distinguishes seeded vs user-added places
  - `created_at` (timestamptz, default now())
2. Security
- Enable RLS on `places`.
- Grant SELECT, INSERT, UPDATE, DELETE to `anon` and `authenticated` — the app has no sign-in, so all visitors read and write shared place data.
- Four per-verb policies (select/insert/update/delete) scoped `TO anon, authenticated` with `USING/CHECK (true)` because this is an intentionally public, collaborative single-tenant dataset.
3. Seed Data
- Insert 8 sample attractions (Prague landmarks) with lat/lng, title, history, and category. Seed rows use explicit fixed ids so the migration is idempotent and replayable on a fresh database rebuild.
*/

CREATE TABLE IF NOT EXISTS places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN ('monument', 'scenic', 'cafe', 'hidden_gem')),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  image_url text,
  is_user_submitted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE places ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON places TO anon, authenticated;

DROP POLICY IF EXISTS "public_select_places" ON places;
CREATE POLICY "public_select_places" ON places
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_insert_places" ON places;
CREATE POLICY "public_insert_places" ON places
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "public_update_places" ON places;
CREATE POLICY "public_update_places" ON places
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public_delete_places" ON places;
CREATE POLICY "public_delete_places" ON places
  FOR DELETE TO anon, authenticated USING (true);

INSERT INTO places (id, title, description, category, lat, lng, image_url, is_user_submitted) VALUES
  ('11111111-1111-1111-1111-111111111101',
   'Old Town Square',
   'The heart of Prague since the 12th century, when it served as the central marketplace for merchants from across Europe. Surrounded by Gothic, Renaissance, and Baroque facades, the square has witnessed coronations, executions, and uprisings. The medieval Astronomical Clock, installed in 1410, still draws crowds every hour as the twelve apostles parade past its windows.',
   'monument', 50.0875, 14.4214,
   'https://images.pexels.com/photos/1128410/pexels-photo-1128410.jpeg?auto=compress&cs=tinysrgb&w=800', false),
  ('11111111-1111-1111-1111-111111111102',
   'Charles Bridge',
   'Commissioned by Charles IV in 1357 on exactly 9 July at 5:31 am — a date chosen by royal astrologers for its palindromic numerology. For centuries it was the only crossing over the Vltava, making Prague the nexus of trade between Eastern and Western Europe. The 30 baroque statues lining its parapets were added between 1683 and 1714, and legend says egg yolks were mixed into the mortar for strength.',
   'monument', 50.0865, 14.4114,
   'https://images.pexels.com/photos/1930970/pexels-photo-1930970.jpeg?auto=compress&cs=tinysrgb&w=800', false),
  ('11111111-1111-1111-1111-111111111103',
   'Prague Castle & St. Vitus',
   'The largest ancient castle complex in the world, perched above the city since around 880 AD. It has been the seat of Bohemian kings, Holy Roman Emperors, and Czech presidents. St. Vitus Cathedral within its walls took nearly 600 years to complete, and its stained glass — including a famous window by Alphonse Mucha — bathes the nave in jewel-toned light.',
   'monument', 50.0903, 14.4032,
   'https://images.pexels.com/photos/1461942/pexels-photo-1461942.jpeg?auto=compress&cs=tinysrgb&w=800', false),
  ('11111111-1111-1111-1111-111111111104',
   'Letná Park Beer Garden',
   'A sprawling hilltop park offering the classic panoramic postcard view of the red rooftops of the Old Town and the Vltava''s bridges. The park was once occupied by the world''s largest Stalin monument — dynamited in 1962 — and later by a giant metronome that now stands in its place. Locals consider the tree-shaded beer garden here the finest sunset spot in the city.',
   'scenic', 50.0968, 14.4123,
   'https://images.pexels.com/photos/2837909/pexels-photo-2837909.jpeg?auto=compress&cs=tinysrgb&w=800', false),
  ('11111111-1111-1111-1111-111111111105',
   'Petrín Hill & Observation Tower',
   'A leafy hill of orchards and rose gardens climbed by locals via a funicular railway running since 1891. At its summit stands a steel tower built in 1891 as a 60-metre miniature of the Eiffel Tower — climb its 299 steps for views stretching to Snezka on clear days. The hill also hides the Hunger Wall, a 14th-century fortification built partly to provide work for the poor during a famine.',
   'scenic', 50.0822, 14.3976,
   'https://images.pexels.com/photos/2610643/pexels-photo-2610643.jpeg?auto=compress&cs=tinysrgb&w=800', false),
  ('11111111-1111-1111-1111-111111111106',
   'Café Slavia',
   'Open since 1884 directly opposite the National Theatre, this grand Art Deco cafe has been the lounge of Czech dissidents, poets, and playwrights. Vaclav Havel wrote here, and during communism the cafe''s windows became a vantage point for watching the city across the river. Order the famous Slavia cake and sit in the same leather booths where the intellectual resistance once plotted.',
   'cafe', 50.0804, 14.4128,
   'https://images.pexels.com/photos/1855214/pexels-photo-1855214.jpeg?auto=compress&cs=tinysrgb&w=800', false),
  ('11111111-1111-1111-1111-111111111107',
   'Vyšehrad Fortress Gardens',
   'A quiet headland fortress south of the centre, older than Prague Castle itself according to legend — the princess Libuše is said to have prophesied the city''s glory from these cliffs. Its basilica holds the tombs of the nation''s greatest artists and scientists in the Slavín cemetery. The ramparts offer the best free sunset views over the river, far from the crowds.',
   'hidden_gem', 50.0645, 14.4180,
   'https://images.pexels.com/photos/2119713/pexels-photo-2119713.jpeg?auto=compress&cs=tinysrgb&w=800', false),
  ('11111111-1111-1111-1111-111111111108',
   'Národní kavárna & Jan Palach Garden',
   'Tucked behind the National Museum, this small riverside garden honours Jan Palach, the student who set himself alight in January 1969 to protest the Soviet occupation. The garden''s linden trees and simple memorial are easily missed, yet the spot carries a profound weight of the nation''s history. A contemplative pause most walking tours rush past.',
   'hidden_gem', 50.0789, 14.4300,
   'https://images.pexels.com/photos/3454150/pexels-photo-3454150.jpeg?auto=compress&cs=tinysrgb&w=800', false)
ON CONFLICT (id) DO NOTHING;
