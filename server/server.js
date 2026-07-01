import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cors from 'cors';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 4174;

const DB_FILE   = path.resolve(__dirname, 'spots.db');
const PLANS_FILE = path.resolve(__dirname, 'plans.json');

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');  // safe concurrent reads
db.pragma('foreign_keys = ON');

// Create base table (without new columns — ALTER TABLE handles those below)
db.exec(`
  CREATE TABLE IF NOT EXISTS spots (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    neighborhood TEXT NOT NULL,
    address      TEXT NOT NULL DEFAULT '',
    lat          REAL,
    lng          REAL,
    tags         TEXT NOT NULL DEFAULT '[]',
    owner_note   TEXT NOT NULL DEFAULT '',
    substack_url TEXT NOT NULL DEFAULT '',
    owner_rating REAL,
    photo_url    TEXT NOT NULL DEFAULT '',
    price        TEXT NOT NULL DEFAULT '',
    last_visited TEXT NOT NULL DEFAULT '',
    visit_type   TEXT NOT NULL DEFAULT '',
    order_dishes TEXT NOT NULL DEFAULT '[]',
    skip_dishes  TEXT NOT NULL DEFAULT '[]',
    reviews      TEXT NOT NULL DEFAULT '[]',
    hours        TEXT NOT NULL DEFAULT '{}',
    created_at   INTEGER NOT NULL DEFAULT 0
  );
`);

// Run column migrations before creating indexes that reference new columns
const cols = db.prepare("PRAGMA table_info(spots)").all().map(c => c.name);
if (!cols.includes('category')) {
  db.exec("ALTER TABLE spots ADD COLUMN category TEXT NOT NULL DEFAULT ''");
  console.log('Migrated: added category column');
}
if (!cols.includes('best_for')) {
  db.exec("ALTER TABLE spots ADD COLUMN best_for TEXT NOT NULL DEFAULT '[]'");
  console.log('Migrated: added best_for column');
}
if (!cols.includes('phone')) {
  db.exec("ALTER TABLE spots ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
  console.log('Migrated: added phone column');
}
if (!cols.includes('website')) {
  db.exec("ALTER TABLE spots ADD COLUMN website TEXT NOT NULL DEFAULT ''");
  console.log('Migrated: added website column');
}
if (!cols.includes('reservation_url')) {
  db.exec("ALTER TABLE spots ADD COLUMN reservation_url TEXT NOT NULL DEFAULT ''");
  console.log('Migrated: added reservation_url column');
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_spots_neighborhood ON spots(neighborhood);
  CREATE INDEX IF NOT EXISTS idx_spots_created_at  ON spots(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_spots_category     ON spots(category);
`);

// Row ↔ JS object helpers
// ---------------------------------------------------------------------------

const rowToSpot = (row) => ({
  id:          row.id,
  name:        row.name,
  neighborhood: row.neighborhood,
  address:     row.address,
  lat:         row.lat ?? null,
  lng:         row.lng ?? null,
  tags:        JSON.parse(row.tags),
  category:    row.category || '',
  bestFor:      JSON.parse(row.best_for || '[]'),
  phone:        row.phone || '',
  website:      row.website || '',
  reservationUrl: row.reservation_url || '',
  ownerNote:    row.owner_note,
  substackUrl: row.substack_url,
  ownerRating: row.owner_rating ?? null,
  photoUrl:    row.photo_url,
  price:       row.price,
  lastVisited: row.last_visited,
  visitType:   row.visit_type,
  orderDishes: JSON.parse(row.order_dishes),
  skipDishes:  JSON.parse(row.skip_dishes),
  reviews:     JSON.parse(row.reviews),
  hours:       JSON.parse(row.hours),
  createdAt:   row.created_at,
});

// ---------------------------------------------------------------------------
// Seed initial spots (runs only when DB is empty)
// ---------------------------------------------------------------------------

const initialSpots = [
  {
    id: 'bad-butter', name: 'Bad Butter', neighborhood: 'West Loop',
    address: '835 W Randolph St, Chicago, IL 60607', lat: 41.884, lng: -87.6503,
    tags: ['Pastries / Brunch'], ownerNote: 'Soft almond croissants and small-batch espresso in a sunlit corner.',
    substackUrl: '', ownerRating: 9.5,
    photoUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=500&q=80',
    reviews: [], hours: { monday: '7:00 AM – 3:00 PM', tuesday: '7:00 AM – 3:00 PM', wednesday: '7:00 AM – 3:00 PM', thursday: '7:00 AM – 3:00 PM', friday: '7:00 AM – 3:00 PM', saturday: '8:00 AM – 4:00 PM', sunday: '8:00 AM – 4:00 PM' }, createdAt: 1700000000000,
  },
  {
    id: 'purple-pig', name: 'Purple Pig', neighborhood: 'River North',
    address: '500 N Michigan Ave, Chicago, IL 60611', lat: 41.8909, lng: -87.6244,
    tags: ['Mediterranean / Wine'], ownerNote: 'Shareable plates, house-cured meats, and a buzzy wine list.',
    substackUrl: '', ownerRating: 9.2,
    photoUrl: 'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=500&q=80',
    reviews: [], hours: { monday: '11:30 AM – 12:00 AM', tuesday: '11:30 AM – 12:00 AM', wednesday: '11:30 AM – 12:00 AM', thursday: '11:30 AM – 12:00 AM', friday: '11:30 AM – 1:00 AM', saturday: '11:30 AM – 1:00 AM', sunday: '11:30 AM – 11:00 PM' }, createdAt: 1700000001000,
  },
  {
    id: 'heytea', name: 'HeyTea', neighborhood: 'Chinatown',
    address: '2163 S China Pl, Chicago, IL 60616', lat: 41.8528, lng: -87.6321,
    tags: ['Tea / Drinks'], ownerNote: 'Creamy cheesy tea and floral fruit blends for a vibrant sip.',
    substackUrl: '', ownerRating: 8.0,
    photoUrl: 'https://images.unsplash.com/photo-1510626176961-4b1e58d0cf9b?auto=format&fit=crop&w=500&q=80',
    reviews: [], hours: { monday: '11:00 AM – 9:00 PM', tuesday: '11:00 AM – 9:00 PM', wednesday: '11:00 AM – 9:00 PM', thursday: '11:00 AM – 9:00 PM', friday: '11:00 AM – 10:00 PM', saturday: '10:00 AM – 10:00 PM', sunday: '10:00 AM – 9:00 PM' }, createdAt: 1700000002000,
  },
  {
    id: 'bayan-ko-diner', name: 'Bayan Ko Diner', neighborhood: 'Avondale',
    address: '2801 W Diversey Ave, Chicago, IL 60647', lat: 41.9315, lng: -87.6998,
    tags: ['Filipino'], ownerNote: 'Classic lumpia, tocino, and generous diner-style breakfasts.',
    substackUrl: '', ownerRating: 9.5,
    photoUrl: 'https://images.unsplash.com/photo-1551218808-94e220e084d2?auto=format&fit=crop&w=500&q=80',
    reviews: [], hours: { monday: '8:00 AM – 3:00 PM', tuesday: '8:00 AM – 3:00 PM', wednesday: '8:00 AM – 3:00 PM', thursday: '8:00 AM – 3:00 PM', friday: '8:00 AM – 3:00 PM', saturday: '8:00 AM – 4:00 PM', sunday: '8:00 AM – 4:00 PM' }, createdAt: 1700000003000,
  },
  {
    id: 'la-scarola', name: 'La Scarola', neighborhood: 'River West',
    address: '721 W Grand Ave, Chicago, IL 60654', lat: 41.8913, lng: -87.6471,
    tags: ['Italian'], ownerNote: 'Old-school red sauce and family-style portions. Cash only, always worth the wait.',
    substackUrl: '', ownerRating: 9.0,
    photoUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=500&q=80',
    reviews: [], hours: { monday: '5:00 PM – 10:00 PM', tuesday: '5:00 PM – 10:00 PM', wednesday: '5:00 PM – 10:00 PM', thursday: '5:00 PM – 10:00 PM', friday: '5:00 PM – 11:00 PM', saturday: '5:00 PM – 11:00 PM', sunday: '' }, createdAt: 1700000004000,
  },
];

const insertSpot = db.prepare(`
  INSERT OR IGNORE INTO spots
    (id, name, neighborhood, address, lat, lng, tags, owner_note, substack_url,
     owner_rating, photo_url, price, last_visited, visit_type, order_dishes,
     skip_dishes, reviews, hours, created_at)
  VALUES
    (@id, @name, @neighborhood, @address, @lat, @lng, @tags, @ownerNote, @substackUrl,
     @ownerRating, @photoUrl, @price, @lastVisited, @visitType, @orderDishes,
     @skipDishes, @reviews, @hours, @createdAt)
`);

const seedDb = db.transaction((spots) => {
  for (const s of spots) {
    insertSpot.run({
      ...s,
      tags:        JSON.stringify(s.tags || []),
      orderDishes: JSON.stringify(s.orderDishes || []),
      skipDishes:  JSON.stringify(s.skipDishes || []),
      reviews:     JSON.stringify(s.reviews || []),
      hours:       JSON.stringify(s.hours || {}),
      price:       s.price || '',
      lastVisited: s.lastVisited || '',
      visitType:   s.visitType || '',
    });
  }
});

// Seed only if table is empty, then migrate any existing data.json
if (db.prepare('SELECT COUNT(*) as n FROM spots').get().n === 0) {
  const DATA_FILE = path.resolve(__dirname, 'data.json');
  if (fs.existsSync(DATA_FILE)) {
    // Migrate existing JSON data
    const existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const migrated = existing.map(s => {
      const tags = Array.isArray(s.tags) ? s.tags : (s.tag ? [s.tag] : []);
      return { ...s, tags, price: s.price || '', lastVisited: s.lastVisited || '', visitType: s.visitType || '' };
    });
    seedDb(migrated);
    console.log(`Migrated ${migrated.length} spots from data.json → spots.db`);
  } else {
    seedDb(initialSpots);
    console.log('Seeded initial spots into spots.db');
  }
}

// ---------------------------------------------------------------------------
// Plans (kept as JSON — plans are few and short-lived)
// ---------------------------------------------------------------------------

const getPlans = () => {
  if (!fs.existsSync(PLANS_FILE)) return {};
  return JSON.parse(fs.readFileSync(PLANS_FILE, 'utf8'));
};

const savePlan = (id, plan) => {
  const plans = getPlans();
  plans[id] = plan;
  fs.writeFileSync(PLANS_FILE, JSON.stringify(plans, null, 2));
};

// ---------------------------------------------------------------------------
// Geocoding
// ---------------------------------------------------------------------------

const geocodeAddress = async (address) => {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'ChicagoEatsLedger/1.0 (1104vincentwu@gmail.com)' } });
    const data = await res.json();
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (e) {
    console.error('Geocoding failed', e);
  }
  return { lat: null, lng: null };
};

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(cors());
app.use(express.json());
app.use(express.static(path.resolve(__dirname, '../dist')));

const OWNER_KEY = process.env.OWNER_KEY;
if (!OWNER_KEY) {
  console.error('ERROR: OWNER_KEY is not set in .env — write routes are disabled');
}

const requireOwner = (req, res, next) => {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!OWNER_KEY || token !== OWNER_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// ---------------------------------------------------------------------------
// Owner verify
// ---------------------------------------------------------------------------

app.get('/api/owner/verify', requireOwner, (req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------------------
// Spots API
// ---------------------------------------------------------------------------

app.get('/api/spots', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM spots ORDER BY created_at DESC').all();
    res.set('Cache-Control', 'public, max-age=30');
    res.json(rows.map(rowToSpot));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unable to read spots' });
  }
});

app.post('/api/spots', requireOwner, async (req, res) => {
  const { name, neighborhood, address, tags, category, bestFor, phone, website, reservationUrl,
          ownerNote, substackUrl, ownerRating, photoUrl, hours,
          price, lastVisited, visitType, orderDishes, skipDishes } = req.body;
  if (!name || !neighborhood || !tags?.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const spot = {
      id:          `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      neighborhood,
      address:     address || '',
      lat:         null,
      lng:         null,
      tags:        JSON.stringify(Array.isArray(tags) ? tags.filter(t => t.trim()) : [tags]),
      category:       category || '',
      bestFor:        JSON.stringify(Array.isArray(bestFor) ? bestFor : []),
      phone:          phone || '',
      website:        website || '',
      reservationUrl: reservationUrl || '',
      ownerNote:      ownerNote || '',
      substackUrl: substackUrl || '',
      ownerRating: ownerRating != null ? Math.min(10, Math.max(0, Number(ownerRating))) : null,
      photoUrl:    photoUrl || '',
      price:       price || '',
      lastVisited: lastVisited || '',
      visitType:   visitType || '',
      orderDishes: JSON.stringify(Array.isArray(orderDishes) ? orderDishes : []),
      skipDishes:  JSON.stringify(Array.isArray(skipDishes) ? skipDishes : []),
      reviews:     JSON.stringify([]),
      hours:       JSON.stringify(hours || {}),
      createdAt:   Date.now(),
    };
    db.prepare(`
      INSERT INTO spots
        (id, name, neighborhood, address, lat, lng, tags, category, best_for, phone, website, reservation_url,
         owner_note, substack_url, owner_rating, photo_url, price, last_visited, visit_type,
         order_dishes, skip_dishes, reviews, hours, created_at)
      VALUES
        (@id, @name, @neighborhood, @address, @lat, @lng, @tags, @category, @bestFor, @phone, @website, @reservationUrl,
         @ownerNote, @substackUrl, @ownerRating, @photoUrl, @price, @lastVisited, @visitType,
         @orderDishes, @skipDishes, @reviews, @hours, @createdAt)
    `).run(spot);
    const inserted = db.prepare('SELECT * FROM spots WHERE id = ?').get(spot.id);
    res.json(rowToSpot(inserted));
    if (address) {
      geocodeAddress(address).then(({ lat, lng }) => {
        if (lat != null) db.prepare('UPDATE spots SET lat = ?, lng = ? WHERE id = ?').run(lat, lng, spot.id);
      }).catch(() => {});
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unable to add spot' });
  }
});

app.post('/api/spots/:id/review', (req, res) => {
  const { rating, comment } = req.body;
  const { id } = req.params;
  const browserId = req.headers['x-browser-id'] || null;
  if (rating == null || !id) return res.status(400).json({ error: 'Missing rating' });
  try {
    const row = db.prepare('SELECT reviews FROM spots WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Spot not found' });
    const reviews = JSON.parse(row.reviews);
    if (browserId && reviews.some(r => r.browserId === browserId)) {
      return res.status(409).json({ error: 'You have already reviewed this spot.' });
    }
    reviews.push({ rating: Number(rating), comment: comment ? comment.trim() : '', browserId, createdAt: Date.now() });
    db.prepare('UPDATE spots SET reviews = ? WHERE id = ?').run(JSON.stringify(reviews), id);
    const updated = db.prepare('SELECT * FROM spots WHERE id = ?').get(id);
    res.json(rowToSpot(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unable to save review' });
  }
});

app.patch('/api/spots/:id', requireOwner, async (req, res) => {
  const { id } = req.params;
  const { name, neighborhood, address, tags, category, bestFor, phone, website, reservationUrl,
          photoUrl, hours, ownerRating, ownerNote, substackUrl,
          price, lastVisited, visitType, orderDishes, skipDishes } = req.body;
  try {
    const row = db.prepare('SELECT * FROM spots WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Spot not found' });
    const spot = rowToSpot(row);

    const newAddress = address !== undefined ? address.trim() : spot.address;
    const addressChanged = newAddress && newAddress !== spot.address;
    const missingCoords = spot.lat == null || spot.lng == null;
    let lat = spot.lat, lng = spot.lng, geocodeFailed = false;
    if (newAddress && (addressChanged || missingCoords)) {
      try { ({ lat, lng } = await geocodeAddress(newAddress)); } catch (_) { geocodeFailed = true; }
      if (lat == null) geocodeFailed = true;
    }

    db.prepare(`
      UPDATE spots SET
        name         = ?,
        neighborhood = ?,
        address      = ?,
        lat          = ?,
        lng          = ?,
        tags         = ?,
        category         = ?,
        best_for         = ?,
        phone            = ?,
        website          = ?,
        reservation_url  = ?,
        owner_note       = ?,
        substack_url = ?,
        owner_rating = ?,
        photo_url    = ?,
        price        = ?,
        last_visited = ?,
        visit_type   = ?,
        order_dishes = ?,
        skip_dishes  = ?,
        hours        = ?
      WHERE id = ?
    `).run(
      name !== undefined ? (name.trim() || spot.name) : spot.name,
      neighborhood !== undefined ? (neighborhood.trim() || spot.neighborhood) : spot.neighborhood,
      newAddress,
      lat, lng,
      Array.isArray(tags) ? JSON.stringify(tags.filter(t => t.trim())) : row.tags,
      category !== undefined ? category : spot.category,
      Array.isArray(bestFor) ? JSON.stringify(bestFor) : JSON.stringify(spot.bestFor || []),
      phone !== undefined ? phone : spot.phone,
      website !== undefined ? website : spot.website,
      reservationUrl !== undefined ? reservationUrl : spot.reservationUrl,
      ownerNote !== undefined ? ownerNote : spot.ownerNote,
      substackUrl !== undefined ? substackUrl : spot.substackUrl,
      ownerRating !== undefined ? (ownerRating !== '' ? Math.min(10, Math.max(0, Number(ownerRating))) : null) : spot.ownerRating,
      photoUrl !== undefined ? photoUrl : spot.photoUrl,
      price !== undefined ? price : spot.price,
      lastVisited !== undefined ? lastVisited : spot.lastVisited,
      visitType !== undefined ? visitType : spot.visitType,
      Array.isArray(orderDishes) ? JSON.stringify(orderDishes) : row.order_dishes,
      Array.isArray(skipDishes)  ? JSON.stringify(skipDishes)  : row.skip_dishes,
      hours !== undefined ? JSON.stringify(hours) : row.hours,
      id
    );

    const updated = db.prepare('SELECT * FROM spots WHERE id = ?').get(id);
    res.json({ ...rowToSpot(updated), geocodeFailed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unable to update spot' });
  }
});

app.delete('/api/spots/:id/review', requireOwner, (req, res) => {
  const { id } = req.params;
  const { createdAt } = req.body;
  if (!createdAt) return res.status(400).json({ error: 'Missing createdAt' });
  try {
    const row = db.prepare('SELECT reviews FROM spots WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Spot not found' });
    const reviews = JSON.parse(row.reviews).filter(r => r.createdAt !== createdAt);
    db.prepare('UPDATE spots SET reviews = ? WHERE id = ?').run(JSON.stringify(reviews), id);
    const updated = db.prepare('SELECT * FROM spots WHERE id = ?').get(id);
    res.json(rowToSpot(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unable to delete review' });
  }
});

app.delete('/api/spots/:id', requireOwner, (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM spots WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unable to delete spot' });
  }
});

// ---------------------------------------------------------------------------
// Plans API
// ---------------------------------------------------------------------------

app.get('/api/plans/:id', (req, res) => {
  const plans = getPlans();
  const plan = plans[req.params.id];
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  res.json(plan);
});

app.post('/api/plans', (req, res) => {
  const id = Math.random().toString(36).slice(2, 8);
  const plan = { id, ...req.body, createdAt: Date.now() };
  savePlan(id, plan);
  res.json({ id });
});

// ---------------------------------------------------------------------------
// Frontend routing
// ---------------------------------------------------------------------------

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(port, () => {
  console.log(`Server started on http://localhost:${port}`);
});
