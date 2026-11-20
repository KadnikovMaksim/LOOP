/**
 * Converts a regional OSM .pbf extract into the Overpass-like JSON dump used by
 * fetch-osm.js.
 *
 *   node pbf-to-raw.js [input.pbf] [output.json]
 *
 * Defaults: data/volga.osm.pbf -> data/saratov-osm-raw.json
 *
 * Only objects inside the Saratov bounding box with the tags we care about are
 * kept. Ways get a `center` computed from their member nodes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const parseOSM = require('osm-pbf-parser');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INPUT = process.argv[2] ?? path.join(__dirname, 'data', 'volga.osm.pbf');
const OUTPUT = process.argv[3] ?? path.join(__dirname, 'data', 'saratov-osm-raw.json');

// Saratov bounding box: south, west, north, east
const SOUTH = 51.47;
const WEST = 45.85;
const NORTH = 51.62;
const EAST = 46.2;

const inBox = (lat, lon) => lat >= SOUTH && lat <= NORTH && lon >= WEST && lon <= EAST;

function isRelevant(tags) {
  if (!tags) return false;
  if (tags.tourism === 'museum' || tags.tourism === 'gallery' || tags.tourism === 'viewpoint') return true;
  if (tags.historic === 'monument' || tags.historic === 'memorial') return true;
  if (tags.leisure === 'park' || tags.leisure === 'garden') return true;
  return false;
}

if (!fs.existsSync(INPUT)) {
  console.error(`Input file not found: ${INPUT}`);
  process.exit(1);
}

const sizeMb = (fs.statSync(INPUT).size / 1024 / 1024).toFixed(0);
console.log(`Reading ${INPUT} (${sizeMb} MB)...`);

const nodes = new Map(); // id -> [lat, lon] for nodes inside the bbox
const relevantNodes = [];
const relevantWays = [];

let scanned = 0;

const stream = fs.createReadStream(INPUT);
const parser = parseOSM();

parser.on('data', (batch) => {
  for (const item of batch) {
    scanned += 1;

    if (item.type === 'node') {
      const tags = item.tags;
      const inside = inBox(item.lat, item.lon);
      if (inside) nodes.set(item.id, [item.lat, item.lon]);
      if (inside && isRelevant(tags)) {
        relevantNodes.push({ type: 'node', id: item.id, lat: item.lat, lon: item.lon, tags });
      }
    } else if (item.type === 'way') {
      if (isRelevant(item.tags)) relevantWays.push(item);
    }
  }

  if (scanned % 2_000_000 < batch.length) {
    console.log(`  scanned ${(scanned / 1_000_000).toFixed(1)}M objects...`);
  }
});

parser.on('error', (err) => {
  console.error('PBF parse error:', err.message);
  process.exit(1);
});

stream.on('error', (err) => {
  console.error('Read error:', err.message);
  process.exit(1);
});

parser.on('end', () => {
  console.log(`Nodes in bbox: ${nodes.size}. Relevant nodes: ${relevantNodes.length}, ways: ${relevantWays.length}.`);

  const elements = [...relevantNodes];

  for (const way of relevantWays) {
    let sumLat = 0;
    let sumLon = 0;
    let count = 0;
    for (const ref of way.refs ?? []) {
      const coords = nodes.get(ref);
      if (!coords) continue;
      sumLat += coords[0];
      sumLon += coords[1];
      count += 1;
    }
    if (count === 0) continue;
    elements.push({
      type: 'way',
      id: way.id,
      center: { lat: sumLat / count, lon: sumLon / count },
      tags: way.tags,
    });
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({ elements }), 'utf8');
  console.log(`Wrote ${elements.length} elements to ${OUTPUT}`);
});

stream.pipe(parser);