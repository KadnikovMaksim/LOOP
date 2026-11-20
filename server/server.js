import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 4000;

// SQLite database (file-based, persists in server/wandermap.db)
const db = new Database(path.join(__dirname, 'wandermap.db'));

// Create the places table if it doesn't exist
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

// Lightweight migration for databases created before the import fields existed.
function migrate() {
  const existing = new Set(db.prepare('PRAGMA table_info(places)').all().map((c) => c.name));
  const columns = [
    ['osm_id', 'TEXT'],
    ['address', 'TEXT'],
    ['source', "TEXT DEFAULT 'manual'"],
    ['wikipedia', 'TEXT'],
    ['wikidata', 'TEXT'],
    ['updated_at', 'TEXT'],
  ];
  for (const [name, type] of columns) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE places ADD COLUMN ${name} ${type}`);
      console.log(`Migration: added column ${name}`);
    }
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_places_osm ON places(osm_id) WHERE osm_id IS NOT NULL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_places_category ON places(category)');
}

migrate();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// GET all places (ordered by created_at ascending)
app.get('/api/places', (_req, res) => {
  try {
    const rows = db
      .prepare('SELECT * FROM places ORDER BY created_at ASC')
      .all();
    res.json(rows.map(normalizePlace));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load places' });
  }
});

// GET a single place by id
app.get('/api/places/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM places WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Place not found' });
    res.json(normalizePlace(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load place' });
  }
});

// POST a new place
app.post('/api/places', (req, res) => {
  try {
    const { title, description, category, lat, lng, image_url } = req.body;

    if (!title || !description || !category || lat == null || lng == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const id = `place-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const created_at = new Date().toISOString();

    db.prepare(
      `INSERT INTO places (id, title, description, category, lat, lng, image_url, is_user_submitted, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(id, title, description, category, lat, lng, image_url ?? null, created_at);

    const row = db.prepare('SELECT * FROM places WHERE id = ?').get(id);
    res.status(201).json(normalizePlace(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save place' });
  }
});

// DELETE a place by id
app.delete('/api/places/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM places WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Place not found' });
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete place' });
  }
});

// DELETE all places (handy for a clean slate)
app.delete('/api/places', (_req, res) => {
  try {
    const info = db.prepare('DELETE FROM places').run();
    res.json({ deleted: info.changes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to clear places' });
  }
});

function normalizePlace(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    lat: row.lat,
    lng: row.lng,
    image_url: row.image_url,
    is_user_submitted: Boolean(row.is_user_submitted),
    created_at: row.created_at,
    osm_id: row.osm_id ?? null,
    address: row.address ?? null,
    source: row.source ?? 'manual',
    wikipedia: row.wikipedia ?? null,
    wikidata: row.wikidata ?? null,
    updated_at: row.updated_at ?? null,
  };
}

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
