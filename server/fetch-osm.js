/**
 * One-time (re-runnable) downloader for Saratov POIs.
 *
 *   node fetch-osm.js
 *
 * Downloads museums, monuments/memorials, parks/gardens and viewpoints from
 * OpenStreetMap (Overpass API), enriches them with Russian Wikipedia summaries
 * and Wikimedia Commons images, and writes server/data/saratov.json.
 *
 * The resulting JSON is a local "dump": importing it never touches the network.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, 'data', 'saratov.json');
const RAW_FILE = path.join(__dirname, 'data', 'saratov-osm-raw.json');

// Saratov city bounding box: south,west,north,east
const BBOX = '51.47,45.85,51.62,46.20';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];
const USER_AGENT = 'WandermapProject/1.0 (educational project)';

const QUERY = `[out:json][timeout:180];
(
  nwr["tourism"~"^(museum|gallery)$"](${BBOX});
  nwr["historic"~"^(monument|memorial)$"](${BBOX});
  nwr["leisure"~"^(park|garden)$"](${BBOX});
  nwr["tourism"="viewpoint"](${BBOX});
);
out center tags;`;

// Smaller per-category queries are much more likely to succeed when Overpass is busy.
const SUBQUERIES = [
  ['museums', `nwr["tourism"~"^(museum|gallery)$"](${BBOX});`],
  ['monuments', `nwr["historic"~"^(monument|memorial)$"](${BBOX});`],
  ['parks', `nwr["leisure"~"^(park|garden)$"](${BBOX});`],
  ['viewpoints', `nwr["tourism"="viewpoint"](${BBOX});`],
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function overpass(query) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': USER_AGENT,
          },
          body: new URLSearchParams({ data: query }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!Array.isArray(json.elements)) throw new Error('Malformed response');
        return json;
      } catch (err) {
        lastError = err;
        console.warn(`  ${endpoint} failed: ${err.message}`);
      }
    }
    await sleep(1500);
  }
  throw lastError ?? new Error('All Overpass endpoints failed');
}

/** Downloads each category separately so a busy Overpass server can still answer. */
async function downloadAll() {
  const merged = [];
  const seen = new Set();
  for (const [name, body] of SUBQUERIES) {
    console.log(`Downloading ${name}...`);
    const query = `[out:json][timeout:120];\n(\n  ${body}\n);\nout center tags;`;
    const data = await overpass(query);
    let added = 0;
    for (const element of data.elements ?? []) {
      const key = `${element.type}/${element.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(element);
      added += 1;
    }
    console.log(`  ${added} objects`);
    await sleep(800);
  }

  const dump = { elements: merged };
  fs.mkdirSync(path.dirname(RAW_FILE), { recursive: true });
  fs.writeFileSync(RAW_FILE, JSON.stringify(dump), 'utf8');
  console.log(`Raw dump saved to ${RAW_FILE} (${merged.length} objects)`);
  return dump;
}

function mapCategory(tags) {
  if (tags.tourism === 'museum' || tags.tourism === 'gallery') return 'museum';
  if (tags.historic === 'monument' || tags.historic === 'memorial') return 'monument';
  if (tags.leisure === 'park' || tags.leisure === 'garden') return 'park';
  if (tags.tourism === 'viewpoint') return 'scenic';
  return 'hidden_gem';
}

function buildAddress(tags) {
  const street = tags['addr:street'];
  const number = tags['addr:housenumber'];
  if (street && number) return `${street}, ${number}`;
  if (street) return street;
  return null;
}

function ruWikiTitle(tags) {
  const tag = tags.wikipedia;
  if (!tag) return null;
  const idx = tag.indexOf(':');
  if (idx === -1) return null;
  const lang = tag.slice(0, idx);
  if (lang !== 'ru') return null;
  return tag.slice(idx + 1);
}

/** Fetches short Wikipedia intros for a list of Russian article titles. */
async function fetchExtracts(titles) {
  const map = new Map();
  const unique = [...new Set(titles)];
  for (let i = 0; i < unique.length; i += 20) {
    const batch = unique.slice(i, i + 20);
    const url =
      'https://ru.wikipedia.org/w/api.php?' +
      new URLSearchParams({
        action: 'query',
        prop: 'extracts',
        exintro: '1',
        explaintext: '1',
        exsentences: '3',
        redirects: '1',
        format: 'json',
        origin: '*',
        titles: batch.join('|'),
      }).toString();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) continue;
      const data = await res.json();
      const pages = data?.query?.pages ?? {};
      for (const page of Object.values(pages)) {
        if (page?.title && typeof page.extract === 'string' && page.extract.trim()) {
          map.set(page.title, page.extract.trim());
        }
      }
    } catch {
      /* enrichment is best-effort */
    }
    await sleep(250);
  }
  return map;
}

/** Resolves Wikidata P18 (image) claims into Wikimedia Commons URLs. */
async function fetchImages(wikidataIds) {
  const map = new Map();
  const unique = [...new Set(wikidataIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 40) {
    const batch = unique.slice(i, i + 40);
    const url =
      'https://www.wikidata.org/w/api.php?' +
      new URLSearchParams({
        action: 'wbgetentities',
        ids: batch.join('|'),
        props: 'claims',
        format: 'json',
        origin: '*',
      }).toString();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) continue;
      const data = await res.json();
      for (const [id, entity] of Object.entries(data?.entities ?? {})) {
        const file = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
        if (typeof file === 'string' && file) {
          map.set(
            id,
            `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=800`,
          );
        }
      }
    } catch {
      /* enrichment is best-effort */
    }
    await sleep(250);
  }
  return map;
}

function cleanDescription(text) {
  return text
    .replace(/\[\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}

async function main() {
  const useRaw = process.argv.includes('--raw');

  let data;
  if (useRaw) {
    if (!fs.existsSync(RAW_FILE)) {
      console.error(`Raw dump not found: ${RAW_FILE}`);
      process.exit(1);
    }
    console.log(`Reading raw Overpass dump from ${RAW_FILE}...`);
    const text = fs.readFileSync(RAW_FILE, 'utf8').trim();
    if (!text.startsWith('{')) {
      console.error('Raw dump is not valid JSON. Re-download it first.');
      process.exit(1);
    }
    data = JSON.parse(text);
  } else {
    console.log('Downloading Saratov POIs from Overpass...');
    data = await downloadAll();
  }
  const elements = data.elements ?? [];
  console.log(`Received ${elements.length} OSM objects.`);

  const seen = new Set();
  const items = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    const title = (tags['name:ru'] || tags.name || '').trim();
    if (!title) continue;

    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    // Deduplicate by name + rough coordinate (OSM often has node+way duplicates).
    const key = `${title.toLowerCase()}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      osm_id: `${el.type}/${el.id}`,
      title,
      description: cleanDescription(tags['description:ru'] || tags.description || ''),
      category: mapCategory(tags),
      lat,
      lng,
      address: buildAddress(tags),
      image_url: null,
      wikipedia: tags.wikipedia ?? null,
      wikidata: tags.wikidata ?? null,
      _wikiTitle: ruWikiTitle(tags),
    });
  }

  console.log(`Kept ${items.length} named places. Fetching Wikipedia summaries...`);
  const extracts = await fetchExtracts(items.map((i) => i._wikiTitle).filter(Boolean));

  // Wikipedia titles may differ after redirects; match by title and by exact key.
  for (const item of items) {
    if (!item._wikiTitle) continue;
    const extract = extracts.get(item._wikiTitle);
    if (extract) item.description = cleanDescription(extract);
  }

  console.log('Fetching Wikimedia Commons images...');
  const images = await fetchImages(items.map((i) => i.wikidata).filter(Boolean));
  for (const item of items) {
    if (item.wikidata && images.has(item.wikidata)) item.image_url = images.get(item.wikidata);
  }

  // Fallback description so every place has something readable.
  for (const item of items) {
    if (!item.description) {
      const label = {
        museum: 'Музей',
        monument: 'Памятник',
        park: 'Парк',
        scenic: 'Смотровая площадка',
        hidden_gem: 'Достопримечательность',
      }[item.category] ?? 'Достопримечательность';
      item.description = item.address
        ? `${label} в Саратове, ${item.address}.`
        : `${label} в Саратове.`;
    }
    delete item._wikiTitle;
  }

  items.sort((a, b) => a.title.localeCompare(b.title, 'ru'));

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(items, null, 2), 'utf8');

  const byCategory = items.reduce((acc, i) => {
    acc[i.category] = (acc[i.category] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Saved ${items.length} places to ${OUT_FILE}`);
  console.log('By category:', byCategory);
}

main().catch((err) => {
  console.error('Download failed:', err.message);
  process.exit(1);
});