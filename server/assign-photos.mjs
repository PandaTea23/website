/**
 * Assign Unsplash photo URLs to spots that have no photo.
 * Uses source.unsplash.com with cuisine-based keywords — free, no API key.
 * Run: node server/assign-photos.mjs
 */
import Database from 'better-sqlite3';

const db = new Database('server/spots.db');

// Map cuisine tags → Unsplash search keywords
const TAG_KEYWORDS = {
  // Asian
  'chinese':        'chinese food dim sum',
  'sichuan':        'chinese food noodles',
  'japanese':       'japanese food sushi',
  'sushi':          'sushi rolls omakase',
  'omakase':        'sushi omakase japan',
  'korean':         'korean food bibimbap',
  'thai':           'thai food curry',
  'vietnamese':     'vietnamese pho banh mi',
  'asian':          'asian food noodles',
  'fusion':         'fusion restaurant food',
  'dumplings':      'dumplings dim sum',

  // European
  'italian':        'italian pasta restaurant',
  'pasta':          'pasta italian food',
  'pizza':          'pizza restaurant',
  'deep dish':      'chicago deep dish pizza',
  'french':         'french bistro food',
  'mediterranean':  'mediterranean food hummus',
  'greek':          'greek food mezze',
  'spanish':        'spanish tapas food',
  'belgian':        'belgian beer food',

  // American
  'american':       'american restaurant food',
  'steakhouse':     'steak restaurant grill',
  'burgers':        'burger restaurant',
  'fried chicken':  'fried chicken crispy',
  'bbq':            'bbq barbecue ribs',
  'southern':       'southern soul food',
  'soul food':      'soul food cooking',
  'brunch':         'brunch food eggs',
  'breakfast':      'breakfast food cafe',
  'sandwiches':     'sandwich deli food',

  // Mexican / Latin
  'mexican':        'mexican food tacos',
  'tacos':          'tacos mexican street food',
  'carnitas':       'carnitas mexican pork',

  // Filipino
  'filipino':       'filipino food adobo',

  // Middle Eastern
  'middle eastern': 'middle eastern food falafel',
  'israeli':        'israeli food shakshuka',

  // Bar / Drinks
  'cocktails':      'cocktail bar drinks',
  'wine bar':       'wine bar restaurant',
  'wine':           'wine restaurant cellar',
  'beer':           'craft beer bar',
  'bar':            'restaurant bar food',
  'whiskey':        'whiskey bar cocktails',

  // Upscale / Special
  'fine dining':    'fine dining elegant restaurant',
  'tasting menu':   'tasting menu fine dining',
  'contemporary':   'contemporary restaurant elegant',
  'small plates':   'small plates tapas sharing',
  'farm-to-table':  'farm to table fresh food',
  'seafood':        'seafood restaurant fish',
  'market':         'food market italian',
  'tea / drinks':   'bubble tea drinks',
  'pastries / brunch': 'pastry bakery coffee',

  // Chicago classic
  'chicago classic': 'chicago food classic',
  'hot dogs':       'chicago hot dog',
  'italian beef':   'italian beef sandwich chicago',
};

const DEFAULT_KEYWORD = 'restaurant food dining';

function pickKeyword(tagsJson) {
  let tags = [];
  try { tags = JSON.parse(tagsJson || '[]'); } catch {}
  for (const tag of tags) {
    const key = tag.toLowerCase();
    for (const [match, kw] of Object.entries(TAG_KEYWORDS)) {
      if (key.includes(match)) return kw;
    }
  }
  return DEFAULT_KEYWORD;
}

// Use a fixed seed per spot ID so the image is stable across re-runs.
// source.unsplash.com doesn't support seeds, but we can pick from a pool of
// curated collection IDs to get variety without randomness.
// Format: https://source.unsplash.com/500x400/?{keywords}&sig={n}
// The `sig` param makes each spot get a consistent-ish image.
function hashId(str) {
  let h = 0;
  for (const c of str) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

const update = db.prepare("UPDATE spots SET photo_url = ? WHERE id = ?");
const spots  = db.prepare("SELECT id, tags FROM spots WHERE photo_url IS NULL OR photo_url = ''").all();

let count = 0;
for (const spot of spots) {
  const kw  = pickKeyword(spot.tags);
  const sig = hashId(spot.id) % 1000;
  const url = `https://source.unsplash.com/500x400/?${encodeURIComponent(kw)}&sig=${sig}`;
  update.run(url, spot.id);
  count++;
}

console.log(`Assigned photos to ${count} spots.`);
db.close();
