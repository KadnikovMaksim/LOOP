/**
 * Merges per-category Overpass responses (data/part-*.json) into a single
 * Overpass-like dump at data/saratov-osm-raw.json.
 *
 *   node merge-parts.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
const outFile = path.join(dataDir, 'saratov-osm-raw.json');

const files = fs
  .readdirSync(dataDir)
  .filter((name) => /^part-.*\.json$/.test(name));

if (files.length === 0) {
  console.error('No part-*.json files found in', dataDir);
  process.exit(1);
}

const seen = new Set();
const elements = [];

for (const file of files) {
  const raw = fs.readFileSync(path.join(dataDir, file), 'utf8').trim();
  if (!raw.startsWith('{')) {
    console.warn(`Skipping ${file}: not valid JSON`);
    continue;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`Skipping ${file}: JSON parse error`);
    continue;
  }
  let added = 0;
  for (const element of parsed.elements ?? []) {
    const key = `${element.type}/${element.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    elements.push(element);
    added += 1;
  }
  console.log(`${file}: +${added}`);
}

fs.writeFileSync(outFile, JSON.stringify({ elements }), 'utf8');
console.log(`Wrote ${elements.length} unique elements to ${outFile}`);