/**
 * One-time enrichment script — pulls phone, website, hours from OpenStreetMap (free, no API key).
 * Run: node server/enrich-spots.mjs
 */
import Database from 'better-sqlite3';
import { setTimeout as sleep } from 'timers/promises';

const db = new Database('server/spots.db');
const UA = 'ChicagoEatsLedger/1.0 (personal project)';

// ── OSM opening_hours → app format ─────────────────────────────────────────
const DAY_ABBR = { Mo: 'monday', Tu: 'tuesday', We: 'wednesday', Th: 'thursday', Fr: 'friday', Sa: 'saturday', Su: 'sunday' };
const DAY_ORDER = ['Mo','Tu','We','Th','Fr','Sa','Su'];

function to12h(t) {
  const [hStr, mStr] = t.split(':');
  let h = parseInt(hStr), m = parseInt(mStr);
  const period = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${String(m).padStart(2,'0')} ${period}`;
}

function expandDayRange(range) {
  // "Mo-Fr" → ['Mo','Tu','We','Th','Fr']
  if (range.includes('-')) {
    const [start, end] = range.split('-');
    const si = DAY_ORDER.indexOf(start), ei = DAY_ORDER.indexOf(end);
    if (si === -1 || ei === -1) return [range];
    return DAY_ORDER.slice(si, ei + 1);
  }
  return [range];
}

function parseOsmHours(ohStr) {
  if (!ohStr) return null;
  const result = {};
  // Split on semicolons — each rule looks like "Mo-Fr 09:00-21:00" or "Sa,Su 10:00-22:00" or "Mo off"
  const rules = ohStr.split(/\s*;\s*/);
  for (const rule of rules) {
    const m = rule.match(/^([A-Za-z,\-]+)\s+(.+)$/);
    if (!m) continue;
    const daysPart = m[1];
    const timePart = m[2].trim();
    // expand comma-separated day groups e.g. "Mo-Fr,Su"
    const dayGroups = daysPart.split(',');
    const days = dayGroups.flatMap(expandDayRange);
    for (const d of days) {
      const key = DAY_ABBR[d];
      if (!key) continue;
      if (timePart === 'off' || timePart === 'closed') {
        result[key] = 'Closed';
      } else {
        const tm = timePart.match(/(\d{2}:\d{2})-(\d{2}:\d{2})/);
        if (tm) result[key] = `${to12h(tm[1])} – ${to12h(tm[2])}`;
      }
    }
  }
  // Special case: "24/7"
  if (ohStr.trim() === '24/7') {
    for (const key of Object.values(DAY_ABBR)) result[key] = '12:00 AM – 11:59 PM';
  }
  return Object.keys(result).length ? result : null;
}

// ── Fetch helpers ───────────────────────────────────────────────────────────
async function nominatim(name, address) {
  const q = encodeURIComponent(`${name} ${address}`);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=3&addressdetails=0`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const data = await res.json();
  // Prefer amenity hits
  return data.find(r => r.class === 'amenity') || data[0] || null;
}

async function overpassTags(osmType, osmId) {
  const typeChar = osmType === 'node' ? 'node' : osmType === 'way' ? 'way' : 'relation';
  const query = `[out:json];${typeChar}(${osmId});out;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  const data = await res.json();
  return data.elements?.[0]?.tags || null;
}

// ── Main ────────────────────────────────────────────────────────────────────
const spots = db.prepare('SELECT id, name, address, phone, website, hours FROM spots').all();
const update = db.prepare('UPDATE spots SET phone=?, website=?, hours=? WHERE id=?');

console.log(`\nEnriching ${spots.length} spots via OpenStreetMap…\n`);

let enriched = 0;
for (const spot of spots) {
  console.log(`[${spot.name}]`);

  // 1) Find on Nominatim
  let hit;
  try {
    hit = await nominatim(spot.name, spot.address);
  } catch (e) {
    console.log(`  ✗ Nominatim error: ${e.message}`);
    await sleep(1200);
    continue;
  }

  if (!hit) {
    console.log('  ✗ Not found on OSM');
    await sleep(1200);
    continue;
  }
  console.log(`  ✓ Found: ${hit.display_name.slice(0, 70)}`);

  // 2) Get detailed tags from Overpass
  await sleep(800); // be polite to Overpass
  let tags;
  try {
    tags = await overpassTags(hit.osm_type, hit.osm_id);
  } catch (e) {
    console.log(`  ✗ Overpass error: ${e.message}`);
    await sleep(1200);
    continue;
  }

  if (!tags) {
    console.log('  ✗ No tags found');
    await sleep(1200);
    continue;
  }

  // 3) Extract fields
  const phone   = tags['phone'] || tags['contact:phone'] || spot.phone || '';
  const website = tags['website'] || tags['contact:website'] || tags['url'] || spot.website || '';
  const ohStr   = tags['opening_hours'];
  const parsedHours = parseOsmHours(ohStr);

  // Merge with existing hours (don't overwrite if already set and OSM has nothing)
  let existingHours = null;
  try { existingHours = spot.hours ? JSON.parse(spot.hours) : null; } catch {}
  const finalHours = parsedHours || existingHours;

  // 4) Update DB
  const phoneClean   = phone.trim();
  const websiteClean = website.trim();
  const hoursJson    = finalHours ? JSON.stringify(finalHours) : spot.hours;

  update.run(phoneClean, websiteClean, hoursJson, spot.id);
  enriched++;

  if (phoneClean)   console.log(`  📞 phone: ${phoneClean}`);
  if (websiteClean) console.log(`  🌐 website: ${websiteClean}`);
  if (parsedHours)  console.log(`  🕐 hours: ${Object.keys(parsedHours).length} days`);
  if (!phoneClean && !websiteClean && !parsedHours) console.log('  ⚠ OSM found the place but has no contact/hours data');

  await sleep(1200); // Nominatim rate limit: 1 req/sec
}

console.log(`\nDone — enriched ${enriched}/${spots.length} spots.\n`);
db.close();
