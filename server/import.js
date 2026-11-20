/**
 * Bulk import of places from a local JSON dump.
 *
 * Usage:
 *   node import.js data/saratov.json
 *   node import.js data/saratov.json --replace   # delete all osm-sourced places first
 *
 * The dump format is an array of objects:
 * [
 *   {
 *     "osm_id": "node/123456",
 *     "title": "Саратовский областной музей краеведения",
 *     "description": "Музей в центре Саратова.",
 *     "category": "museum",
 *     "lat": 51.5336,
 *     "lng": 46.0343,
 *     "address": "ул. Лермонтова, 34",
 *     "image_url": null,
 *     "wikipedia": "ru:Саратовский областной музей краеведения",
 *     "wikidata": "Q123456"
 *   }
 * ]
 *
 * Import is idempotent: records are matched by osm_id and updated in place.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const file = process.argv[2];
const replace = process.argv.includes('--replace');

if (!file) {
  console.error('Usage: node import.js <path-to-json> [--replace]');
  process.exit(1);
}

const filePath = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const items = Array.isArray(raw) ? raw : raw.places;
if (!Array.isArray(items)) {
  console.error('Expected a JSON array of places (or { places: [...] }).');
  process.exit(1);
}

const db = new Database(path.join(__dirname, 'wandermap.db'));

// Ensure the schema matches the running server (safe to run repeatedly).
db.exec(`
  CREATE TABLE IF NOT EXISTS places (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    image_url TEXT,
    is_user_submitted INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    osm_id TEXT,
    address TEXT,
    source TEXT DEFAULT 'manual',
    wikipedia TEXT,
    wikidata TEXT,
    updated_at TEXT
  );
`);
const existing = new Set(db.prepare('PRAGMA table_info(places)').all().map((c) => c.name));
for (const [name, type] of [
  ['osm_id', 'TEXT'],
  ['address', 'TEXT'],
  ['source', "TEXT DEFAULT 'manual'"],
  ['wikipedia', 'TEXT'],
  ['wikidata', 'TEXT'],
  ['updated_at', 'TEXT'],
]) {
  if (!existing.has(name)) db.exec(`ALTER TABLE places ADD COLUMN ${name} ${type}`);
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_places_osm ON places(osm_id) WHERE osm_id IS NOT NULL');

if (replace) {
  const removed = db.prepare("DELETE FROM places WHERE source = 'osm'").run().changes;
  console.log(`Removed ${removed} previously imported OSM places.`);
}

const selectByOsm = db.prepare('SELECT id, title, description, category, lat, lng FROM places WHERE osm_id = ?');
const insert = db.prepare(`
  INSERT INTO places (id, title, description, category, lat, lng, image_url,
                      is_user_submitted, created_at, osm_id, address, source, wikipedia, wikidata, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'osm', ?, ?, ?)
`);
const update = db.prepare(`
  UPDATE places
     SET title = ?, description = ?, category = ?, lat = ?, lng = ?, image_url = ?,
         address = ?, wikipedia = ?, wikidata = ?, updated_at = ?
   WHERE osm_id = ?
`);

const now = new Date().toISOString();
let inserted = 0;
let updated = 0;
let skipped = 0;

const run = db.transaction((rows) => {
  for (const row of rows) {
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (!row.title || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      skipped += 1;
      continue;
    }

    const values = {
      title: String(row.title).trim(),
      description: String(row.description ?? '').trim(),
      category: row.category || 'hidden_gem',
      lat,
      lng,
      image_url: row.image_url ?? null,
      address: row.address ?? null,
      wikipedia: row.wikipedia ?? null,
      wikidata: row.wikidata ?? null,
      osm_id: row.osm_id ? String(row.osm_id) : null,
    };

    const existingRow = values.osm_id ? selectByOsm.get(values.osm_id) : null;

    if (existingRow) {
      update.run(
        values.title, values.description, values.category, values.lat, values.lng,
        values.image_url, values.address, values.wikipedia, values.wikidata, now,
        values.osm_id,
      );
      updated += 1;
    } else {
      const id = values.osm_id
        ? `osm-${values.osm_id.replace(/[^a-zA-Z0-9]/g, '-')}`
        : `place-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      insert.run(
        id, values.title, values.description, values.category, values.lat, values.lng,
        values.image_url, now, values.osm_id, values.address, values.wikipedia, values.wikidata, now,
      );
      inserted += 1;
    }
  }
});

run(items);

const total = db.prepare('SELECT COUNT(*) AS c FROM places').get().c;
console.log(`Imported: ${inserted} new, ${updated} updated, ${skipped} skipped. Total in DB: ${total}.`);
db.close();