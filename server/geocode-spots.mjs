/**
 * Geocode all spots that lack lat/lng using Nominatim.
 * Also validates that the returned address roughly matches our stored address.
 * Run: node server/geocode-spots.mjs
 */
import Database from 'better-sqlite3';
import { setTimeout as sleep } from 'timers/promises';

const db = new Database('server/spots.db');
const UA = 'ChicagoEatsLedger/1.0 (personal project)';

const spots = db.prepare('SELECT id, name, address, lat, lng FROM spots WHERE lat IS NULL').all();
const update = db.prepare('UPDATE spots SET lat=?, lng=?, address=? WHERE id=?');

console.log(`Geocoding ${spots.length} spots...\n`);

let ok = 0, failed = 0, corrected = 0;

for (const spot of spots) {
  const q = encodeURIComponent(`${spot.name} ${spot.address}`);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=3&addressdetails=1&countrycodes=us`;

  let data;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    data = await res.json();
  } catch (e) {
    console.log(`✗ ${spot.name}: fetch error — ${e.message}`);
    failed++;
    await sleep(1200);
    continue;
  }

  // Prefer amenity hits, then any result
  const hit = data.find(r => r.class === 'amenity' || r.type === 'restaurant') || data[0];

  if (!hit) {
    // Try without the restaurant name (just address)
    const q2 = encodeURIComponent(spot.address);
    const res2 = await fetch(`https://nominatim.openstreetmap.org/search?q=${q2}&format=json&limit=1&countrycodes=us`, { headers: { 'User-Agent': UA } });
    const data2 = await res2.json();
    await sleep(600);
    if (data2[0]) {
      const h = data2[0];
      update.run(parseFloat(h.lat), parseFloat(h.lon), spot.address, spot.id);
      console.log(`⚠  ${spot.name}: name not in OSM, geocoded from address only (${parseFloat(h.lat).toFixed(4)}, ${parseFloat(h.lon).toFixed(4)})`);
      ok++;
    } else {
      console.log(`✗  ${spot.name}: not found — ${spot.address}`);
      failed++;
    }
    await sleep(1200);
    continue;
  }

  const lat = parseFloat(hit.lat);
  const lon = parseFloat(hit.lon);

  // Check if OSM has a better/corrected display_name for the street address
  const addr = hit.address || {};
  const osmStreet = [
    addr.house_number && addr.road ? `${addr.house_number} ${addr.road}` : null,
    addr.city || addr.town,
    addr.state,
    addr.postcode,
  ].filter(Boolean).join(', ');

  // Flag if lat/lng is far outside Chicago bounding box
  const inChicago = lat > 41.6 && lat < 42.1 && lon > -88.0 && lon < -87.5;
  if (!inChicago) {
    console.log(`✗  ${spot.name}: geocoded outside Chicago (${lat}, ${lon}) — skipping`);
    failed++;
    await sleep(1200);
    continue;
  }

  update.run(lat, lon, spot.address, spot.id);
  console.log(`✓  ${spot.name}: (${lat.toFixed(4)}, ${lon.toFixed(4)})`);
  ok++;

  await sleep(1200);
}

// Now separately verify known-tricky addresses by querying just the address
console.log('\n--- Address spot-checks ---');
const checks = [
  { id: 'nobu-chicago',   expected: '155 N Paulina St' },
  { id: 'smyth',          expected: '177 N Ada St' },
  { id: 'girl-goat',      expected: '809 W Randolph St' },
  { id: 'salpicon',       expected: '1252 N Wells St' },
  { id: 'daisies',        expected: '2523 N Milwaukee Ave' },
  { id: 'qxy-dumplings',  expected: '2002 S Wentworth Ave' },
];
for (const c of checks) {
  const row = db.prepare('SELECT name, address, lat, lng FROM spots WHERE id=?').get(c.id);
  if (!row) { console.log(`  ? ${c.id} not found`); continue; }
  const hasLatLng = row.lat !== null;
  const addrOk = row.address.includes(c.expected);
  console.log(`  ${hasLatLng ? '✓' : '✗'} ${row.name}: ${row.address} ${addrOk ? '' : '⚠ MISMATCH expected ' + c.expected}`);
}

console.log(`\nDone — geocoded ${ok}, failed ${failed}.\n`);
db.close();
