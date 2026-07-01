import Database from 'better-sqlite3';
const db = new Database('server/spots.db');
const u = db.prepare('UPDATE spots SET reservation_url=? WHERE id=?');

const reservations = [
  ['hopleaf',          'https://www.exploretock.com/hopleaf'],
  ['bayan-ko-diner',   'https://www.opentable.com/r/bayan-ko-diner-chicago'],
  ['parachute',        'mailto:reservations@parachuterestaurant.com'],
  ['le-bouchon',       'https://www.exploretock.com/lebouchonofchicago'],
  ['gibsons',          'https://www.opentable.com/r/gibsons-bar-and-steakhouse-chicago'],
  ['maple-ash',        'https://resy.com/cities/chicago-il/venues/maple-and-ash-chicago'],
  ['alinea',           'https://www.exploretock.com/alinea'],
  ['galit',            'https://resy.com/cities/chicago-il/venues/galit'],
  ['pequods',          'https://www.pequodspizza.com'],
  ['andros-taverna',   'https://www.opentable.com/r/andros-taverna-chicago'],
  ['daisies',          'https://www.opentable.com/r/daisies-chicago'],
  ['giant',            'https://resy.com/cities/chicago-il/venues/giant'],
  ['lula-cafe',        'https://www.opentable.com/r/lula-cafe'],
  ['rpm-steak',        'https://www.opentable.com/rpm-steak'],
  ['rpm-italian',      'https://www.opentable.com/rpm-italian'],
  ['sushi-san',        'https://www.opentable.com/r/sushi-san-chicago'],
  ['lou-malnatis-rn',  'https://www.opentable.com/r/lou-malnatis-river-north-chicago'],
  ['la-scarola',       'https://www.opentable.com/r/la-scarola-chicago'],
  ['boeufhaus',        'https://www.opentable.com/r/boeufhaus'],
  ['avec',             'https://www.opentable.com/r/avec-west-loop-chicago'],
  ['girl-goat',        'https://www.opentable.com/r/girl-and-the-goat-chicago'],
  ['monteverde',       'https://resy.com/cities/chicago-il/venues/monteverde-restaurant-and-pastificio'],
  ['nobu-chicago',     'https://www.opentable.com/r/nobu-chicago-2'],
  ['sepia',            'https://www.opentable.com/r/sepia-chicago'],
  ['smyth',            'https://www.exploretock.com/smyth'],
  ['publican',         'https://www.opentable.com/r/the-publican-chicago'],
  ['mott-st',          'https://www.opentable.com/mott-street'],
  ['taxim',            'https://www.opentable.com/taxim'],
];

reservations.forEach(([id, url]) => {
  const info = db.prepare('SELECT name FROM spots WHERE id=?').get(id);
  if (!info) { console.log(`✗ Not found: ${id}`); return; }
  u.run(url, id);
  console.log(`✓ ${info.name}`);
});

console.log('\nDone.');
db.close();
