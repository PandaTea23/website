# Vincent Wu — Personal Website Context

Use this file to understand the site before helping with design, layout, or feature work.

---

## Who This Is For

**Owner:** Vincent Wu  
**Email:** 1104vincentwu@gmail.com  
**LinkedIn:** linkedin.com/in/vinwu1  
**Current role:** Growth & Product at PlatePost (food tech startup)  
**Goal:** Use this site as a personal brand / portfolio targeting food tech companies and collaborators — not a traditional developer portfolio, but a living proof of passion for food and tech.

---

## What the Site Is

A personal food site that serves three purposes at once:

1. **The Ledger** — Vincent's personal shortlist of Chicago restaurants worth visiting, with a route planning tool for food crawls
2. **Writing** — Essays about food, culture, restaurants, and identity
3. **About** — Who Vincent is, his work in food tech, contact info

The core idea: the site itself IS the portfolio. A recruiter at a food startup lands here and immediately understands who Vincent is — someone who built something real about food, thinks deeply about it, and works in the space.

---

## Design Aesthetic & Tone

**Feel:** Editorial, warm, personal — like a handwritten ledger meets a food magazine  
**Not:** A generic developer portfolio, a startup landing page, or a Yelp clone

### Color Palette
| Variable | Value | Usage |
|---|---|---|
| `--cream` | `#f2ead9` | Page background |
| `--ink` | `#2a2420` | Primary text |
| `--red` | `#b5402e` | Accent, links, active states |
| `--gold` | `#a98a3a` | Stars, saved indicators |
| `--tan` | `#6e4f2c` | Secondary accents |
| `--border` | `rgba(42,36,32,0.18)` | Borders |
| `--paper` | light cream | Card backgrounds |

### Typography
- **Body / UI:** `Courier Prime` (monospace) — gives a typewriter / ledger feel throughout
- **Headings / Names:** `Special Elite` (cursive) — worn, editorial, personality
- **Tone in copy:** Direct, personal, not corporate. First person. No buzzwords.

### Visual Language
- Receipt-style dashed borders and rules on the Ledger/Plan tabs
- Cards with subtle hover states
- Warm cream background throughout — never white
- Red accents for interactive elements and emphasis
- The "Plan a Route" itinerary literally looks like a paper receipt

---

## Site Structure

### Tabs (left to right in nav)
1. **Ledger** — the main restaurant list
2. **Plan a Route** — food crawl route planner
3. **Map** — map view of all spots
4. **Writing** — blog/essays
5. **About** — bio and contact

---

## The Ledger Tab

Vincent's personal restaurant guide for Chicago. He is the sole editor/owner.

**What each entry shows:**
- Restaurant name, neighborhood, price range
- Tags (cuisine types)
- Vincent's rating (0–10) with a short personal note
- Community rating (averaged from visitor reviews)
- Dishes to order / dishes to skip
- Hours, address, phone, website, reservation link
- Photo

**Sorting options:** Top Rated, Recently Added, By Neighborhood, Nearest  
**Filters:** Cuisine tags, neighborhood, price range, search (name/dish/cuisine)  
**Neighborhoods are collapsed by default** — click to expand, or click "Plan crawl →" to auto-add that neighborhood's top spots to the route planner

**Owner-only features** (accessed via `?owner=1` in URL + passcode):
- Add new restaurants via a form
- Edit any restaurant inline on its card
- Delete restaurants

---

## The Plan a Route Tab

A food crawl planner. Users pick restaurants, set a start location and time, and get an optimized itinerary.

**Flow:**
1. Select spots from the checklist (or star them on the Ledger — starring auto-adds to plan)
2. Set starting location, date, time, travel mode
3. Get a receipt-style itinerary with travel times, stop durations, warnings for closed spots
4. Optimize button reorders flexible stops for efficiency
5. "Start Crawl" button activates live mode — check off stops as you visit them
6. Share plan / Navigate / Download buttons

**Key detail:** Starring a restaurant on the Ledger automatically adds it to the plan. Unstarring removes it. The star count appears as a badge on the Plan tab.

---

## The Writing Tab

A blog/essay section. List view shows:
- Header image
- Title (Special Elite font)
- Subtitle (italic, muted)
- Date
- "Read →" link

Clicking opens the full article. Back button returns to list.

**Posts are stored in `src/posts.js`** — a simple JS array. To publish a new essay, add an object to that array with: `id`, `title`, `subtitle`, `date`, `image` (URL), `paragraphs` (array of strings, one per paragraph).

**Planned essay topics:**
- The intentionality of restaurants (table sizes, lighting, menu decisions as signals)
- Food as stability and security — emotional relationship with food
- Food as a way to share life experiences

---

## The About Tab

Clean, minimal. Not receipt-styled — intentionally different from the Ledger.

**Content:**
- Name: Vincent Wu
- Tagline: Growth & Product · PlatePost · Chicago
- Bio: "I'm Vincent — I work in food tech, write about food, and built a tool to find it. Growth and product at PlatePost by day, documenting Chicago one meal at a time by night. The Ledger is my personal shortlist of spots worth visiting. The blog is where I think out loud about food, culture, and everything in between."
- Food quote: "Food brings people together, and allows us to share our life experiences in a single bite."
- Contact: email + LinkedIn

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite |
| Backend | Express.js (Node) |
| Database | SQLite via `better-sqlite3` |
| Maps | Leaflet.js + Nominatim (geocoding) |
| Routing | OSRM (travel time matrix) |
| Hosting | Railway |
| Fonts | Google Fonts — Courier Prime, Special Elite |

**Key files:**
- `src/App.jsx` — main app, all Ledger logic, tab routing
- `src/PlanRoute.jsx` — route planner
- `src/Writing.jsx` — blog list + article view
- `src/About.jsx` — about page
- `src/posts.js` — blog posts array (edit this to publish essays)
- `src/styles.css` — all styles, single file
- `server/server.js` — Express API + SQLite
- `server/spots.db` — the database (not in git)

---

## Owner / Auth

- Visit `yoursite.com?owner=1` to show the Owner button
- Enter the passcode (stored in `.env` as `OWNER_KEY`)
- Stays logged in via `localStorage` — no re-entry needed per session

---

## Design Principles to Preserve

1. **Warm, not cold** — cream background, serif/monospace fonts, never clinical white or sans-serif minimal
2. **Personal, not corporate** — first person, editorial voice, Vincent's name on things
3. **Simple enough for a 65-year-old** — big tap targets, labeled buttons, no mystery icons
4. **Receipt aesthetic on Ledger/Plan, clean on Writing/About** — don't force the receipt style everywhere
5. **Red is the action color** — all interactive/important elements use `--red`
6. **Don't over-engineer** — this is a personal site, not a SaaS product. Keep additions simple.

---

## What's Planned Next

- Custom domain (vincentwu.me or similar)
- First real essay published in Writing tab
- PWA support (installable on phone)
- Eventually: migrate DB to Supabase when scaling is needed
