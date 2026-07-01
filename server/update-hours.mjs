/**
 * Apply corrected closing times + special fixes from user research.
 * Run: node server/update-hours.mjs
 */
import Database from 'better-sqlite3';

const db = new Database('server/spots.db');

function getHours(id) {
  const row = db.prepare('SELECT hours FROM spots WHERE id=?').get(id);
  if (!row) return {};
  try { return JSON.parse(row.hours || '{}'); } catch { return {}; }
}

// Keep existing open time, just replace the closing time.
// Pass 'Closed' to mark the day closed.
// Pass an array [openTime, closeTime] to set both (for days previously Closed).
function applyClose(hours, dayCloses) {
  const result = { ...hours };
  for (const [day, val] of Object.entries(dayCloses)) {
    if (val === 'Closed') {
      result[day] = 'Closed';
    } else if (Array.isArray(val)) {
      result[day] = `${val[0]} – ${val[1]}`;
    } else {
      const cur = result[day];
      if (cur && cur !== 'Closed') {
        const open = cur.split(/\s*[–\-]\s*/)[0].trim();
        result[day] = `${open} – ${val}`;
      }
      // If day was Closed/missing and only a close time is given, skip (can't infer open)
    }
  }
  return result;
}

const setHours = db.prepare('UPDATE spots SET hours=? WHERE id=?');

function update(id, dayCloses) {
  const row = db.prepare('SELECT name FROM spots WHERE id=?').get(id);
  if (!row) { console.log(`✗ Not found: ${id}`); return; }
  const h = applyClose(getHours(id), dayCloses);
  setHours.run(JSON.stringify(h), id);
  console.log(`✓ ${row.name}`);
}

// ── 1. Permanently closed — delete ─────────────────────────────────────────
console.log('\n── Removing permanently closed spots ──');
['salpicon', 'duseks'].forEach(id => {
  const row = db.prepare('SELECT name FROM spots WHERE id=?').get(id);
  if (row) { db.prepare('DELETE FROM spots WHERE id=?').run(id); console.log(`✗ Deleted: ${row.name}`); }
});

// ── 2. Bad Butter — moved to Bucktown ──────────────────────────────────────
console.log('\n── Bad Butter relocation ──');
db.prepare(`UPDATE spots SET
  address='1655 W Cortland St, Chicago, IL 60622',
  neighborhood='Bucktown',
  lat=41.9178, lng=-87.6785
WHERE id='bad-butter'`).run();
update('bad-butter', {
  monday: 'Closed', tuesday: 'Closed', wednesday: 'Closed',
  thursday: ['7:00 AM', '2:00 PM'],
  friday:   ['7:00 AM', '2:00 PM'],
  saturday: ['8:00 AM', '2:00 PM'],
  sunday:   ['8:00 AM', '2:00 PM'],
});

// ── 3. Andros Taverna — actually in Logan Square ────────────────────────────
db.prepare("UPDATE spots SET neighborhood='Logan Square' WHERE id='andros-taverna'").run();
console.log('\n── Andros Taverna → Logan Square ──');

// ── 4. Closing time updates ─────────────────────────────────────────────────
console.log('\n── Updating closing times ──');

// Andersonville
update('hopleaf', {
  monday: '11:00 PM', tuesday: '11:00 PM', wednesday: '11:00 PM',
  thursday: '11:00 PM', friday: '12:00 AM', saturday: '12:00 AM', sunday: '11:00 PM',
});

// Avondale
update('bayan-ko-diner', {
  monday: '10:00 PM', tuesday: '10:00 PM', wednesday: '10:00 PM',
  thursday: '10:00 PM', friday: '10:00 PM', saturday: '10:00 PM', sunday: '10:00 PM',
});
update('honey-butter', {
  monday: 'Closed', tuesday: 'Closed',
  wednesday: '8:30 PM', thursday: '8:30 PM',
  friday: '9:00 PM', saturday: '9:00 PM', sunday: '8:30 PM',
});
update('parachute', {
  monday: 'Closed', tuesday: 'Closed',
  wednesday: '11:00 PM', thursday: '11:00 PM',
  friday: '12:00 AM', saturday: '12:00 AM', sunday: '10:00 PM',
});

// Bucktown
update('le-bouchon', {
  monday: ['5:30 PM', '10:00 PM'], // was Closed, now open Mon
  tuesday: '10:00 PM', wednesday: '10:00 PM', thursday: '10:00 PM',
  friday: '11:00 PM', saturday: '11:00 PM', sunday: 'Closed',
});

// Chinatown
update('lao-sze-chuan', {
  monday: '11:45 PM', tuesday: '11:45 PM', wednesday: '11:45 PM',
  thursday: '11:45 PM', friday: '11:45 PM', saturday: '11:45 PM', sunday: '11:45 PM',
});
update('1782264498519-l8wwpk', { // MingHin
  monday: '12:00 AM', tuesday: '12:00 AM', wednesday: '12:00 AM',
  thursday: '12:00 AM', friday: '12:00 AM', saturday: '12:00 AM', sunday: '12:00 AM',
});
update('qxy-dumplings', {
  monday: '9:00 PM', tuesday: '9:00 PM', wednesday: '9:00 PM',
  thursday: '9:00 PM', friday: '10:00 PM', saturday: '10:00 PM', sunday: '9:00 PM',
});

// Gold Coast
update('gibsons', {
  monday: '12:00 AM', tuesday: '12:00 AM', wednesday: '12:00 AM',
  thursday: '12:00 AM', friday: '12:00 AM', saturday: '12:00 AM', sunday: '12:00 AM',
});
update('maple-ash', {
  monday: '10:00 PM', tuesday: '10:00 PM', wednesday: '10:00 PM',
  thursday: '10:00 PM', friday: '11:00 PM', saturday: '11:00 PM', sunday: '10:00 PM',
});

// Hyde Park
update('virtue-restaurant', {
  monday: 'Closed',
  tuesday: '9:00 PM', wednesday: '9:00 PM', thursday: '9:00 PM',
  friday: '10:00 PM', saturday: '10:00 PM', sunday: '9:00 PM',
});

// Irving Park
update('smoque-bbq', {
  monday: 'Closed',
  tuesday: '8:00 PM', wednesday: '8:00 PM', thursday: '8:00 PM',
  friday: '9:00 PM', saturday: '9:00 PM', sunday: '8:00 PM',
});

// Lincoln Park
update('alinea', {
  monday: 'Closed', tuesday: 'Closed',
  wednesday: '10:00 PM', thursday: '10:00 PM',
  friday: '10:00 PM', saturday: '10:00 PM', sunday: '10:00 PM',
});
update('galit', {
  monday: 'Closed', sunday: 'Closed',
  tuesday: '9:00 PM', wednesday: '9:00 PM', thursday: '9:00 PM',
  friday: '9:30 PM', saturday: '9:30 PM',
});
update('pequods', {
  monday: ['11:00 AM', '2:00 AM'], tuesday: ['11:00 AM', '2:00 AM'],
  wednesday: ['11:00 AM', '2:00 AM'], thursday: ['11:00 AM', '2:00 AM'],
  friday: ['11:00 AM', '2:00 AM'], saturday: ['11:00 AM', '2:00 AM'],
  sunday: ['12:00 PM', '12:00 AM'],
});

// Logan Square (Andros moved here already)
update('andros-taverna', {
  friday: '11:00 PM', saturday: '10:00 PM', sunday: '10:00 PM',
});
update('billy-sunday', {
  monday: '12:00 AM', tuesday: '12:00 AM', wednesday: '12:00 AM',
  thursday: '11:00 PM', friday: '2:00 AM', saturday: '2:00 AM', sunday: '11:00 PM',
});
update('daisies', {
  monday: 'Closed', tuesday: 'Closed',
  wednesday: '10:00 PM', thursday: '10:00 PM',
  friday: '11:00 PM', saturday: '11:00 PM', sunday: 'Closed',
});
update('giant', {
  monday: 'Closed', tuesday: 'Closed', sunday: 'Closed',
  wednesday: '10:00 PM', thursday: '10:00 PM',
  friday: '11:00 PM', saturday: '11:00 PM',
});
update('lula-cafe', {
  monday: 'Closed', tuesday: 'Closed',
  wednesday: '10:00 PM', thursday: '10:00 PM',
  friday: '10:00 PM', saturday: '10:00 PM', sunday: '10:00 PM',
});

// Pilsen
update('carnitas-uruapan', {
  monday: '5:00 PM', tuesday: '5:00 PM', wednesday: '5:00 PM',
  thursday: '5:00 PM', friday: '5:00 PM', saturday: '5:00 PM', sunday: '5:00 PM',
});

// River North
update('eataly-chicago', {
  monday: '10:00 PM', tuesday: '10:00 PM', wednesday: '10:00 PM',
  thursday: '10:00 PM', friday: '11:00 PM', saturday: '11:00 PM', sunday: '10:00 PM',
});
update('ginos-east', {
  monday: '10:00 PM', tuesday: '10:00 PM', wednesday: '10:00 PM',
  thursday: '10:00 PM', friday: '11:00 PM', saturday: '11:00 PM', sunday: '10:00 PM',
});
update('lou-malnatis-rn', {
  monday: '11:00 PM', tuesday: '11:00 PM', wednesday: '11:00 PM',
  thursday: '11:00 PM', friday: '12:00 AM', saturday: '12:00 AM', sunday: '11:00 PM',
});
update('portillos', {
  monday: '1:00 AM', tuesday: '1:00 AM', wednesday: '1:00 AM',
  thursday: '1:00 AM', friday: '1:00 AM', saturday: '1:00 AM', sunday: '1:00 AM',
});
update('purple-pig', {
  monday: '11:00 PM', tuesday: '11:00 PM', wednesday: '11:00 PM',
  thursday: '11:00 PM', friday: '12:00 AM', saturday: '12:00 AM', sunday: '11:00 PM',
});
update('rpm-italian', {
  monday: '9:30 PM', tuesday: '9:30 PM', wednesday: '9:30 PM',
  thursday: '9:30 PM', friday: '10:30 PM', saturday: '10:30 PM', sunday: '9:30 PM',
});
update('rpm-steak', {
  monday: '9:00 PM', tuesday: '9:00 PM', wednesday: '9:00 PM',
  thursday: '9:00 PM', friday: '11:00 PM', saturday: '10:00 PM', sunday: '9:00 PM',
});
update('sushi-san', {
  monday: 'Closed',
  tuesday: '10:00 PM', wednesday: '10:00 PM', thursday: '10:00 PM',
  friday: '11:00 PM', saturday: '11:00 PM', sunday: '10:00 PM',
});

// River West
update('la-scarola', {
  monday: 'Closed',
  tuesday: '11:00 PM', wednesday: '11:00 PM', thursday: '11:00 PM',
  friday: '11:00 PM', saturday: '11:00 PM', sunday: '10:00 PM',
});

// Ukrainian Village
update('boeufhaus', {
  monday: 'Closed', tuesday: 'Closed', sunday: 'Closed',
  wednesday: '9:00 PM', thursday: '9:00 PM',
  friday: '10:00 PM', saturday: '10:00 PM',
});

// West Loop
update('au-cheval', {
  monday: '1:00 AM', tuesday: '1:00 AM', wednesday: '1:00 AM',
  thursday: '1:00 AM', friday: '1:00 AM', saturday: '1:00 AM', sunday: '12:00 AM',
});
update('avec', {
  monday: 'Closed',
  tuesday: '10:00 PM', wednesday: '10:00 PM', thursday: '10:00 PM',
  friday: '11:00 PM', saturday: '11:00 PM', sunday: '10:00 PM',
});
update('girl-goat', {
  monday: 'Closed',
  tuesday: '11:00 PM', wednesday: '11:00 PM', thursday: '11:00 PM',
  friday: '12:00 AM', saturday: '12:00 AM', sunday: '10:00 PM',
});
update('monteverde', {
  monday: 'Closed', sunday: 'Closed',
  tuesday: '9:30 PM', wednesday: '9:30 PM', thursday: '9:30 PM',
  friday: '10:30 PM', saturday: '10:30 PM',
});
update('nobu-chicago', {
  monday: '10:00 PM', tuesday: '10:00 PM', wednesday: '10:00 PM',
  thursday: '10:00 PM', friday: '11:00 PM', saturday: '11:00 PM', sunday: '10:00 PM',
});
update('sepia', {
  monday: '9:00 PM', tuesday: '9:00 PM', wednesday: '9:00 PM',
  thursday: '9:00 PM', friday: '10:00 PM', saturday: '10:00 PM', sunday: 'Closed',
});
update('smyth', {
  monday: 'Closed', tuesday: 'Closed', sunday: 'Closed',
  wednesday: '9:00 PM', thursday: '9:00 PM',
  friday: '9:00 PM', saturday: '9:00 PM',
});
update('publican', {
  monday: 'Closed', tuesday: 'Closed',
  wednesday: '9:00 PM', thursday: '9:00 PM',
  friday: '10:00 PM', saturday: '10:00 PM', sunday: '9:00 PM',
});

// Wicker Park
update('big-star', {
  monday: '10:00 PM', tuesday: '10:00 PM', wednesday: '10:00 PM',
  thursday: '10:00 PM', friday: '11:00 PM', saturday: '11:00 PM', sunday: '10:00 PM',
});
update('doves-luncheonette', {
  thursday: '9:00 PM', friday: '9:00 PM',
  // other days keep existing 3pm close
});
update('mott-st', {
  monday: 'Closed',
  tuesday: '9:00 PM', wednesday: '9:00 PM', thursday: '9:00 PM',
  friday: '10:00 PM', saturday: '10:00 PM', sunday: '9:00 PM',
});
update('taxim', {
  monday: 'Closed',
  tuesday: '10:00 PM', wednesday: '10:00 PM', thursday: '10:00 PM',
  friday: '11:00 PM', saturday: '10:00 PM', sunday: '10:00 PM',
});

console.log('\nAll done.\n');
db.close();
