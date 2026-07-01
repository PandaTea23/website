/**
 * Insert ~40 well-known Chicago restaurants with OSM enrichment.
 * Run: node server/insert-restaurants.mjs
 */
import Database from 'better-sqlite3';
import { setTimeout as sleep } from 'timers/promises';

const db = new Database('server/spots.db');
const UA = 'ChicagoEatsLedger/1.0 (personal project)';

// ── OSM helpers (same as enrich-spots.mjs) ─────────────────────────────────
const DAY_ABBR  = { Mo:'monday', Tu:'tuesday', We:'wednesday', Th:'thursday', Fr:'friday', Sa:'saturday', Su:'sunday' };
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
  const rules = ohStr.split(/\s*;\s*/);
  for (const rule of rules) {
    const m = rule.match(/^([A-Za-z,\-]+)\s+(.+)$/);
    if (!m) continue;
    const dayGroups = m[1].split(',');
    const days = dayGroups.flatMap(expandDayRange);
    const timePart = m[2].trim();
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
  if (ohStr.trim() === '24/7') {
    for (const key of Object.values(DAY_ABBR)) result[key] = '12:00 AM – 11:59 PM';
  }
  return Object.keys(result).length ? result : null;
}

function fmtPhone(raw) {
  if (!raw) return '';
  const digits = raw.replace(/\D/g,'');
  if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  return raw.trim();
}

async function osmLookup(name, address) {
  const q = encodeURIComponent(`${name} ${address} Chicago`);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=3&addressdetails=0`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const data = await res.json();
  return data.find(r => r.class === 'amenity') || data[0] || null;
}

async function osmTags(osmType, osmId) {
  const tc = osmType === 'node' ? 'node' : osmType === 'way' ? 'way' : 'relation';
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(`[out:json];${tc}(${osmId});out;`)}`,
  });
  const data = await res.json();
  return data.elements?.[0]?.tags || null;
}

// ── Curated restaurant list ─────────────────────────────────────────────────
// Each entry has known-accurate base data; OSM enrichment fills phone/website/hours
const restaurants = [
  // West Loop / Fulton Market
  { id:'girl-goat',      name:"Girl & the Goat",        neighborhood:'West Loop',    address:'809 W Randolph St, Chicago, IL 60607',      tags:['American','Small Plates','Pork'], category:'restaurant', price:'$$$', phone:'(312) 492-6262', website:'https://www.girlandthegoat.com', hours:{ monday:'Closed', tuesday:'4:30 PM – 10:00 PM', wednesday:'4:30 PM – 10:00 PM', thursday:'4:30 PM – 10:00 PM', friday:'4:30 PM – 11:00 PM', saturday:'4:30 PM – 11:00 PM', sunday:'4:30 PM – 10:00 PM' } },
  { id:'avec',           name:"Avec",                   neighborhood:'West Loop',    address:'615 W Randolph St, Chicago, IL 60661',      tags:['Mediterranean','Small Plates','Wine Bar'], category:'restaurant', price:'$$$', phone:'(312) 377-2002', website:'https://www.avecrestaurant.com', hours:{ monday:'Closed', tuesday:'3:30 PM – 10:00 PM', wednesday:'3:30 PM – 10:00 PM', thursday:'3:30 PM – 10:00 PM', friday:'3:30 PM – 11:00 PM', saturday:'3:30 PM – 11:00 PM', sunday:'3:30 PM – 10:00 PM' } },
  { id:'au-cheval',      name:"Au Cheval",               neighborhood:'West Loop',    address:'800 W Randolph St, Chicago, IL 60607',      tags:['American','Burgers','Brunch'], category:'restaurant', price:'$$', phone:'(312) 929-4580', website:'https://aucheval.tumblr.com', hours:{ monday:'10:00 AM – 10:00 PM', tuesday:'10:00 AM – 10:00 PM', wednesday:'10:00 AM – 10:00 PM', thursday:'10:00 AM – 10:00 PM', friday:'10:00 AM – 11:00 PM', saturday:'10:00 AM – 11:00 PM', sunday:'10:00 AM – 10:00 PM' } },
  { id:'publican',       name:"The Publican",            neighborhood:'West Loop',    address:'837 W Fulton Market, Chicago, IL 60607',    tags:['American','Beer','Pork','Brunch'], category:'restaurant', price:'$$$', phone:'(312) 733-9555', website:'https://www.thepublicanrestaurant.com', hours:{ monday:'Closed', tuesday:'Closed', wednesday:'5:00 PM – 10:00 PM', thursday:'5:00 PM – 10:00 PM', friday:'5:00 PM – 11:00 PM', saturday:'10:00 AM – 2:30 PM', sunday:'10:00 AM – 2:30 PM' } },
  { id:'monteverde',     name:"Monteverde",              neighborhood:'West Loop',    address:'1020 W Madison St, Chicago, IL 60607',      tags:['Italian','Pasta','Wine'], category:'restaurant', price:'$$$', phone:'(312) 888-3041', website:'https://www.monteverderestaurant.com', hours:{ monday:'Closed', tuesday:'5:00 PM – 10:00 PM', wednesday:'5:00 PM – 10:00 PM', thursday:'5:00 PM – 10:00 PM', friday:'5:00 PM – 11:00 PM', saturday:'5:00 PM – 11:00 PM', sunday:'5:00 PM – 9:00 PM' } },
  { id:'smyth',          name:"Smyth",                  neighborhood:'West Loop',    address:'177 N Ada St, Chicago, IL 60661',           tags:['Contemporary','Tasting Menu','Fine Dining'], category:'restaurant', price:'$$$$', phone:'(773) 913-3773', website:'https://www.smythandtheloyalist.com', hours:{ monday:'Closed', tuesday:'Closed', wednesday:'5:00 PM – 9:30 PM', thursday:'5:00 PM – 9:30 PM', friday:'5:00 PM – 9:30 PM', saturday:'5:00 PM – 9:30 PM', sunday:'Closed' } },
  { id:'nobu-chicago',   name:"Nobu Chicago",           neighborhood:'West Loop',    address:'155 N Paulina St, Chicago, IL 60612',       tags:['Japanese','Sushi','Omakase'], category:'restaurant', price:'$$$$', phone:'(312) 888-2500', website:'https://www.noburestaurants.com/chicago', hours:{ monday:'5:30 PM – 10:30 PM', tuesday:'5:30 PM – 10:30 PM', wednesday:'5:30 PM – 10:30 PM', thursday:'5:30 PM – 10:30 PM', friday:'5:30 PM – 11:30 PM', saturday:'5:30 PM – 11:30 PM', sunday:'5:30 PM – 10:30 PM' } },
  { id:'sepia',          name:"Sepia",                  neighborhood:'West Loop',    address:'123 N Jefferson St, Chicago, IL 60661',     tags:['American','Contemporary','Wine'], category:'restaurant', price:'$$$', phone:'(312) 441-1920', website:'https://www.sepiachicago.com', hours:{ monday:'Closed', tuesday:'5:00 PM – 9:30 PM', wednesday:'5:00 PM – 9:30 PM', thursday:'5:00 PM – 9:30 PM', friday:'5:00 PM – 10:00 PM', saturday:'5:00 PM – 10:00 PM', sunday:'5:00 PM – 9:00 PM' } },

  // River North
  { id:'rpm-italian',    name:"RPM Italian",             neighborhood:'River North',  address:'52 W Illinois St, Chicago, IL 60654',       tags:['Italian','Pasta','Upscale'], category:'restaurant', price:'$$$', phone:'(312) 222-1888', website:'https://www.rpmrestaurants.com/rpm-italian', hours:{ monday:'5:00 PM – 10:00 PM', tuesday:'5:00 PM – 10:00 PM', wednesday:'5:00 PM – 10:00 PM', thursday:'5:00 PM – 10:00 PM', friday:'11:30 AM – 11:00 PM', saturday:'5:00 PM – 11:00 PM', sunday:'5:00 PM – 9:00 PM' } },
  { id:'sushi-san',      name:"Sushi-san",               neighborhood:'River North',  address:'63 W Grand Ave, Chicago, IL 60654',          tags:['Japanese','Sushi','Omakase'], category:'restaurant', price:'$$$', phone:'(312) 828-0575', website:'https://sushisan.com', hours:{ monday:'Closed', tuesday:'5:00 PM – 10:00 PM', wednesday:'5:00 PM – 10:00 PM', thursday:'5:00 PM – 10:00 PM', friday:'5:00 PM – 11:00 PM', saturday:'5:00 PM – 11:00 PM', sunday:'4:00 PM – 9:00 PM' } },
  { id:'eataly-chicago', name:"Eataly Chicago",          neighborhood:'River North',  address:'43 E Ohio St, Chicago, IL 60611',            tags:['Italian','Market','Pizza','Pasta'], category:'restaurant', price:'$$', phone:'(312) 521-8700', website:'https://www.eataly.com/us_en/stores/chicago', hours:{ monday:'11:00 AM – 10:00 PM', tuesday:'11:00 AM – 10:00 PM', wednesday:'11:00 AM – 10:00 PM', thursday:'11:00 AM – 10:00 PM', friday:'11:00 AM – 11:00 PM', saturday:'11:00 AM – 11:00 PM', sunday:'11:00 AM – 10:00 PM' } },
  { id:'portillos',      name:"Portillo's",              neighborhood:'River North',  address:'100 W Ontario St, Chicago, IL 60654',       tags:['American','Hot Dogs','Italian Beef','Chicago Classic'], category:'restaurant', price:'$', phone:'(312) 587-8910', website:'https://www.portillos.com', hours:{ monday:'10:30 AM – 11:00 PM', tuesday:'10:30 AM – 11:00 PM', wednesday:'10:30 AM – 11:00 PM', thursday:'10:30 AM – 11:00 PM', friday:'10:30 AM – 12:00 AM', saturday:'10:30 AM – 12:00 AM', sunday:'10:30 AM – 11:00 PM' } },
  { id:'lou-malnatis-rn',name:"Lou Malnati's Pizzeria",  neighborhood:'River North',  address:'439 N Wells St, Chicago, IL 60654',          tags:['Pizza','Deep Dish','Chicago Classic'], category:'restaurant', price:'$$', phone:'(312) 828-9800', website:'https://www.loumalnatis.com', hours:{ monday:'11:00 AM – 11:00 PM', tuesday:'11:00 AM – 11:00 PM', wednesday:'11:00 AM – 11:00 PM', thursday:'11:00 AM – 11:00 PM', friday:'11:00 AM – 12:00 AM', saturday:'11:00 AM – 12:00 AM', sunday:'11:00 AM – 11:00 PM' } },

  // Lincoln Park
  { id:'alinea',         name:"Alinea",                  neighborhood:'Lincoln Park', address:'1723 N Halsted St, Chicago, IL 60614',      tags:['Contemporary','Tasting Menu','Fine Dining','Molecular'], category:'restaurant', price:'$$$$', phone:'(312) 867-0110', website:'https://www.alinearestaurant.com', hours:{ monday:'Closed', tuesday:'Closed', wednesday:'5:00 PM – 9:30 PM', thursday:'5:00 PM – 9:30 PM', friday:'5:00 PM – 10:00 PM', saturday:'5:00 PM – 10:00 PM', sunday:'5:00 PM – 9:30 PM' } },
  { id:'galit',          name:"Galit",                   neighborhood:'Lincoln Park', address:'2429 N Lincoln Ave, Chicago, IL 60614',     tags:['Middle Eastern','Israeli','Vegetarian-Friendly'], category:'restaurant', price:'$$', phone:'(773) 360-8755', website:'https://www.galitrestaurant.com', hours:{ monday:'Closed', tuesday:'5:00 PM – 10:00 PM', wednesday:'5:00 PM – 10:00 PM', thursday:'5:00 PM – 10:00 PM', friday:'5:00 PM – 11:00 PM', saturday:'5:00 PM – 11:00 PM', sunday:'5:00 PM – 9:00 PM' } },
  { id:'pequods',        name:"Pequod's Pizza",          neighborhood:'Lincoln Park', address:'2207 N Clybourn Ave, Chicago, IL 60614',    tags:['Pizza','Deep Dish','Chicago Classic'], category:'restaurant', price:'$', phone:'(773) 327-1512', website:'https://www.pequodspizza.com', hours:{ monday:'11:00 AM – 2:00 AM', tuesday:'11:00 AM – 2:00 AM', wednesday:'11:00 AM – 2:00 AM', thursday:'11:00 AM – 2:00 AM', friday:'11:00 AM – 2:00 AM', saturday:'11:00 AM – 2:00 AM', sunday:'12:00 PM – 12:00 AM' } },

  // Gold Coast
  { id:'maple-ash',      name:"Maple & Ash",             neighborhood:'Gold Coast',   address:'8 W Maple St, Chicago, IL 60610',           tags:['Steakhouse','Seafood','Upscale'], category:'restaurant', price:'$$$$', phone:'(312) 944-8888', website:'https://www.mapleandash.com', hours:{ monday:'5:00 PM – 10:00 PM', tuesday:'5:00 PM – 10:00 PM', wednesday:'5:00 PM – 10:00 PM', thursday:'5:00 PM – 10:00 PM', friday:'5:00 PM – 11:00 PM', saturday:'5:00 PM – 11:00 PM', sunday:'5:00 PM – 9:00 PM' } },
  { id:'gibsons',        name:"Gibsons Bar & Steakhouse",neighborhood:'Gold Coast',   address:'1028 N Rush St, Chicago, IL 60611',          tags:['Steakhouse','Classic','Bar'], category:'restaurant', price:'$$$$', phone:'(312) 266-8999', website:'https://www.gibsonssteakhouse.com', hours:{ monday:'11:00 AM – 12:00 AM', tuesday:'11:00 AM – 12:00 AM', wednesday:'11:00 AM – 12:00 AM', thursday:'11:00 AM – 12:00 AM', friday:'11:00 AM – 1:00 AM', saturday:'11:00 AM – 1:00 AM', sunday:'11:00 AM – 12:00 AM' } },

  // Wicker Park / Ukrainian Village / Bucktown
  { id:'big-star',       name:"Big Star",                neighborhood:'Wicker Park',  address:'1531 N Damen Ave, Chicago, IL 60622',       tags:['Mexican','Tacos','Bar','Whiskey'], category:'restaurant', price:'$', phone:'(773) 235-4039', website:'https://www.bigstarchicago.com', hours:{ monday:'3:00 PM – 2:00 AM', tuesday:'3:00 PM – 2:00 AM', wednesday:'3:00 PM – 2:00 AM', thursday:'3:00 PM – 2:00 AM', friday:'12:00 PM – 2:00 AM', saturday:'12:00 PM – 2:00 AM', sunday:'12:00 PM – 2:00 AM' } },
  { id:'doves-luncheonette',name:"Dove's Luncheonette", neighborhood:'Wicker Park',  address:'1545 N Damen Ave, Chicago, IL 60622',       tags:['Mexican','Breakfast','Brunch','Diner'], category:'restaurant', price:'$$', phone:'(773) 645-4060', website:'https://www.doveschicago.com', hours:{ monday:'9:00 AM – 3:00 PM', tuesday:'9:00 AM – 3:00 PM', wednesday:'9:00 AM – 3:00 PM', thursday:'9:00 AM – 3:00 PM', friday:'9:00 AM – 3:00 PM', saturday:'9:00 AM – 3:00 PM', sunday:'9:00 AM – 3:00 PM' } },
  { id:'mott-st',        name:"Mott St",                 neighborhood:'Wicker Park',  address:'1401 N Ashland Ave, Chicago, IL 60622',     tags:['Asian','Fusion','Small Plates'], category:'restaurant', price:'$$', phone:'(773) 687-9977', website:'https://www.mottst.com', hours:{ monday:'Closed', tuesday:'5:00 PM – 10:00 PM', wednesday:'5:00 PM – 10:00 PM', thursday:'5:00 PM – 10:00 PM', friday:'5:00 PM – 11:00 PM', saturday:'5:00 PM – 11:00 PM', sunday:'5:00 PM – 9:00 PM' } },
  { id:'taxim',          name:"Taxim",                   neighborhood:'Wicker Park',  address:'1558 N Milwaukee Ave, Chicago, IL 60622',   tags:['Greek','Mediterranean','Wine'], category:'restaurant', price:'$$$', phone:'(773) 252-1558', website:'https://www.taximchicago.com', hours:{ monday:'Closed', tuesday:'5:00 PM – 10:00 PM', wednesday:'5:00 PM – 10:00 PM', thursday:'5:00 PM – 10:00 PM', friday:'5:00 PM – 11:00 PM', saturday:'10:30 AM – 2:00 PM', sunday:'10:30 AM – 2:00 PM' } },
  { id:'boeufhaus',      name:"Boeufhaus",               neighborhood:'Ukrainian Village', address:'1012 N Western Ave, Chicago, IL 60622', tags:['French','Steakhouse','Wine'], category:'restaurant', price:'$$$', phone:'(773) 661-2116', website:'https://www.boeufhaus.com', hours:{ monday:'Closed', tuesday:'5:00 PM – 10:00 PM', wednesday:'5:00 PM – 10:00 PM', thursday:'5:00 PM – 10:00 PM', friday:'5:00 PM – 11:00 PM', saturday:'5:00 PM – 11:00 PM', sunday:'Closed' } },
  { id:'le-bouchon',     name:"Le Bouchon",              neighborhood:'Bucktown',     address:'1958 N Damen Ave, Chicago, IL 60647',       tags:['French','Bistro','Wine'], category:'restaurant', price:'$$$', phone:'(773) 862-6600', website:'https://www.lebouchonofchicago.com', hours:{ monday:'Closed', tuesday:'5:30 PM – 10:00 PM', wednesday:'5:30 PM – 10:00 PM', thursday:'5:30 PM – 10:00 PM', friday:'5:30 PM – 11:00 PM', saturday:'5:30 PM – 11:00 PM', sunday:'5:00 PM – 9:00 PM' } },

  // Logan Square
  { id:'lula-cafe',      name:"Lula Cafe",               neighborhood:'Logan Square', address:'2537 N Kedzie Blvd, Chicago, IL 60647',    tags:['Farm-to-Table','American','Brunch'], category:'restaurant', price:'$$', phone:'(773) 489-9554', website:'https://www.lulacafe.com', hours:{ monday:'Closed', tuesday:'9:00 AM – 2:00 PM', wednesday:'9:00 AM – 10:00 PM', thursday:'9:00 AM – 10:00 PM', friday:'9:00 AM – 10:00 PM', saturday:'9:00 AM – 10:00 PM', sunday:'9:00 AM – 10:00 PM' } },
  { id:'daisies',        name:"Daisies",                 neighborhood:'Logan Square', address:'2523 N Milwaukee Ave, Chicago, IL 60647',   tags:['Italian','Pasta','Vegetarian'], category:'restaurant', price:'$$', phone:'(773) 697-2947', website:'https://www.daisies.com', hours:{ monday:'Closed', tuesday:'Closed', wednesday:'5:00 PM – 10:00 PM', thursday:'5:00 PM – 10:00 PM', friday:'5:00 PM – 10:30 PM', saturday:'10:00 AM – 2:30 PM', sunday:'10:00 AM – 2:30 PM' } },
  { id:'giant',          name:"Giant",                   neighborhood:'Logan Square', address:'3209 W Armitage Ave, Chicago, IL 60647',    tags:['American','Small Plates','Bar'], category:'restaurant', price:'$$', phone:'(773) 252-0997', website:'https://www.giantrestaurant.com', hours:{ monday:'Closed', tuesday:'Closed', wednesday:'5:00 PM – 10:00 PM', thursday:'5:00 PM – 10:00 PM', friday:'5:00 PM – 11:00 PM', saturday:'5:00 PM – 11:00 PM', sunday:'5:00 PM – 9:00 PM' } },
  { id:'billy-sunday',   name:"Billy Sunday",            neighborhood:'Logan Square', address:'3143 W Logan Blvd, Chicago, IL 60647',     tags:['Cocktails','American','Bar'], category:'restaurant', price:'$$', phone:'(773) 661-2485', website:'https://www.billy-sunday.com', hours:{ monday:'4:00 PM – 12:00 AM', tuesday:'4:00 PM – 12:00 AM', wednesday:'4:00 PM – 12:00 AM', thursday:'4:00 PM – 2:00 AM', friday:'4:00 PM – 2:00 AM', saturday:'2:00 PM – 2:00 AM', sunday:'2:00 PM – 12:00 AM' } },

  // Avondale
  { id:'parachute',      name:"Parachute",               neighborhood:'Avondale',     address:'3500 N Elston Ave, Chicago, IL 60618',      tags:['American','Small Plates','Farm-to-Table'], category:'restaurant', price:'$$', phone:'(773) 654-1460', website:'https://www.parachuterestaurant.com', hours:{ monday:'Closed', tuesday:'Closed', wednesday:'5:00 PM – 10:00 PM', thursday:'5:00 PM – 10:00 PM', friday:'5:00 PM – 11:00 PM', saturday:'10:00 AM – 2:00 PM', sunday:'10:00 AM – 2:00 PM' } },
  { id:'honey-butter',   name:"Honey Butter Fried Chicken", neighborhood:'Avondale', address:'3361 N Elston Ave, Chicago, IL 60618',      tags:['Fried Chicken','American','Casual'], category:'restaurant', price:'$', phone:'(773) 478-4000', website:'https://www.honeybutter.com', hours:{ monday:'Closed', tuesday:'Closed', wednesday:'11:00 AM – 9:00 PM', thursday:'11:00 AM – 9:00 PM', friday:'11:00 AM – 10:00 PM', saturday:'11:00 AM – 10:00 PM', sunday:'11:00 AM – 9:00 PM' } },

  // Andersonville
  { id:'hopleaf',        name:"Hopleaf Bar",             neighborhood:'Andersonville', address:'5148 N Clark St, Chicago, IL 60640',       tags:['Belgian','Beer','Bar','Sandwiches'], category:'restaurant', price:'$$', phone:'(773) 334-9851', website:'https://www.hopleaf.com', hours:{ monday:'3:00 PM – 2:00 AM', tuesday:'3:00 PM – 2:00 AM', wednesday:'3:00 PM – 2:00 AM', thursday:'3:00 PM – 2:00 AM', friday:'3:00 PM – 2:00 AM', saturday:'12:00 PM – 3:00 AM', sunday:'12:00 PM – 2:00 AM' } },
  { id:'andros-taverna', name:"Andros Taverna",          neighborhood:'Lincoln Square', address:'5006 N Lincoln Ave, Chicago, IL 60625',    tags:['Greek','Mediterranean','Seafood'], category:'restaurant', price:'$$$', phone:'(773) 942-7011', website:'https://www.androstaverna.com', hours:{ monday:'Closed', tuesday:'5:00 PM – 10:00 PM', wednesday:'5:00 PM – 10:00 PM', thursday:'5:00 PM – 10:00 PM', friday:'5:00 PM – 11:00 PM', saturday:'10:30 AM – 2:30 PM', sunday:'10:30 AM – 2:30 PM' } },

  // Irving Park / Pulaski
  { id:'smoque-bbq',     name:"Smoque BBQ",              neighborhood:'Irving Park',  address:'3800 N Pulaski Rd, Chicago, IL 60641',      tags:['BBQ','American','Casual'], category:'restaurant', price:'$', phone:'(773) 545-7427', website:'https://www.smoquechicago.com', hours:{ monday:'Closed', tuesday:'11:00 AM – 9:00 PM', wednesday:'11:00 AM – 9:00 PM', thursday:'11:00 AM – 9:00 PM', friday:'11:00 AM – 10:00 PM', saturday:'11:00 AM – 10:00 PM', sunday:'11:00 AM – 9:00 PM' } },

  // Chinatown (supplements to existing)
  { id:'lao-sze-chuan',  name:"Lao Sze Chuan",          neighborhood:'Chinatown',    address:'2172 S Archer Ave, Chicago, IL 60616',      tags:['Chinese','Sichuan','Spicy'], category:'restaurant', price:'$$', phone:'(312) 326-5040', website:'https://www.laoszechuanchicago.com', hours:{ monday:'11:00 AM – 11:00 PM', tuesday:'11:00 AM – 11:00 PM', wednesday:'11:00 AM – 11:00 PM', thursday:'11:00 AM – 11:00 PM', friday:'11:00 AM – 12:00 AM', saturday:'11:00 AM – 12:00 AM', sunday:'11:00 AM – 11:00 PM' } },
  { id:'qxy-dumplings',  name:"Qing Xiang Yuan Dumplings", neighborhood:'Chinatown', address:'2002 S Wentworth Ave, Chicago, IL 60616',   tags:['Chinese','Dumplings','Casual'], category:'restaurant', price:'$', phone:'(312) 799-1118', website:'', hours:{ monday:'10:00 AM – 9:00 PM', tuesday:'10:00 AM – 9:00 PM', wednesday:'10:00 AM – 9:00 PM', thursday:'10:00 AM – 9:00 PM', friday:'10:00 AM – 10:00 PM', saturday:'10:00 AM – 10:00 PM', sunday:'10:00 AM – 9:00 PM' } },

  // Pilsen
  { id:'duseks',         name:"Dusek's Board & Beer",    neighborhood:'Pilsen',       address:'1227 W 18th St, Chicago, IL 60608',         tags:['American','Beer','Bar'], category:'restaurant', price:'$$', phone:'(312) 526-3851', website:'https://www.dusekschicago.com', hours:{ monday:'Closed', tuesday:'4:00 PM – 11:00 PM', wednesday:'4:00 PM – 11:00 PM', thursday:'4:00 PM – 11:00 PM', friday:'4:00 PM – 12:00 AM', saturday:'11:00 AM – 12:00 AM', sunday:'11:00 AM – 9:00 PM' } },
  { id:'carnitas-uruapan', name:"Carnitas Uruapan",      neighborhood:'Pilsen',       address:'1725 W 18th St, Chicago, IL 60608',         tags:['Mexican','Carnitas','Casual'], category:'restaurant', price:'$', phone:'(312) 226-2654', website:'', hours:{ monday:'8:00 AM – 8:00 PM', tuesday:'8:00 AM – 8:00 PM', wednesday:'8:00 AM – 8:00 PM', thursday:'8:00 AM – 8:00 PM', friday:'8:00 AM – 8:00 PM', saturday:'8:00 AM – 8:00 PM', sunday:'8:00 AM – 8:00 PM' } },

  // Hyde Park
  { id:'virtue-restaurant', name:"Virtue Restaurant",   neighborhood:'Hyde Park',    address:'1462 E 53rd St, Chicago, IL 60615',         tags:['Southern','Soul Food','American'], category:'restaurant', price:'$$', phone:'(773) 947-8831', website:'https://www.virtuerestaurant.com', hours:{ monday:'Closed', tuesday:'Closed', wednesday:'5:00 PM – 10:00 PM', thursday:'5:00 PM – 10:00 PM', friday:'11:00 AM – 10:00 PM', saturday:'10:00 AM – 10:00 PM', sunday:'10:00 AM – 9:00 PM' } },

  // Streeterville / Magnificent Mile
  { id:'rpm-steak',      name:"RPM Steak",               neighborhood:'River North',  address:'66 W Kinzie St, Chicago, IL 60654',          tags:['Steakhouse','Upscale','Contemporary'], category:'restaurant', price:'$$$$', phone:'(312) 284-4990', website:'https://www.rpmrestaurants.com/rpm-steak', hours:{ monday:'5:00 PM – 10:00 PM', tuesday:'5:00 PM – 10:00 PM', wednesday:'5:00 PM – 10:00 PM', thursday:'5:00 PM – 10:00 PM', friday:'5:00 PM – 11:00 PM', saturday:'5:00 PM – 11:00 PM', sunday:'5:00 PM – 9:00 PM' } },

  // Near North Side / Old Town
  { id:'salpicon',       name:"Salpicón",                neighborhood:'Old Town',     address:'1252 N Wells St, Chicago, IL 60610',         tags:['Mexican','Upscale','Wine'], category:'restaurant', price:'$$$', phone:'(312) 988-7811', website:'https://www.salpicon.com', hours:{ monday:'Closed', tuesday:'5:00 PM – 10:00 PM', wednesday:'5:00 PM – 10:00 PM', thursday:'5:00 PM – 10:00 PM', friday:'5:00 PM – 11:00 PM', saturday:'5:00 PM – 11:00 PM', sunday:'5:00 PM – 9:00 PM' } },
  { id:'ginos-east',     name:"Gino's East",             neighborhood:'River North',  address:'162 E Superior St, Chicago, IL 60611',       tags:['Pizza','Deep Dish','Chicago Classic'], category:'restaurant', price:'$$', phone:'(312) 266-3337', website:'https://www.ginoseast.com', hours:{ monday:'11:00 AM – 10:00 PM', tuesday:'11:00 AM – 10:00 PM', wednesday:'11:00 AM – 10:00 PM', thursday:'11:00 AM – 10:00 PM', friday:'11:00 AM – 11:00 PM', saturday:'11:00 AM – 11:00 PM', sunday:'11:00 AM – 10:00 PM' } },

  // Bridgeport
  { id:'nana-chicago',   name:"Nana",                    neighborhood:'Bridgeport',   address:'3267 S Halsted St, Chicago, IL 60608',      tags:['Brunch','American','Organic'], category:'restaurant', price:'$$', phone:'(312) 929-2486', website:'https://www.nana-chicago.com', hours:{ monday:'Closed', tuesday:'Closed', wednesday:'9:00 AM – 2:00 PM', thursday:'9:00 AM – 2:00 PM', friday:'9:00 AM – 2:00 PM', saturday:'9:00 AM – 3:00 PM', sunday:'9:00 AM – 3:00 PM' } },
];

// ── DB setup ────────────────────────────────────────────────────────────────
const existingIds = new Set(
  db.prepare('SELECT id FROM spots').all().map(r => r.id)
);

const insert = db.prepare(`
  INSERT INTO spots (id, name, neighborhood, address, tags, category, phone, website, hours, price, owner_rating)
  VALUES (@id, @name, @neighborhood, @address, @tags, @category, @phone, @website, @hours, @price, @owner_rating)
`);

let inserted = 0, skipped = 0, enriched = 0;

for (const r of restaurants) {
  if (existingIds.has(r.id)) {
    console.log(`⤴  Skip (exists): ${r.name}`);
    skipped++;
    continue;
  }

  // Try OSM enrichment (phone/website/hours override if OSM has better data)
  let phone = r.phone || '';
  let website = r.website || '';
  let hours = r.hours || null;

  try {
    const hit = await osmLookup(r.name, r.address);
    await sleep(600);
    if (hit) {
      const tags = await osmTags(hit.osm_type, hit.osm_id);
      await sleep(600);
      if (tags) {
        const osmPhone = fmtPhone(tags['phone'] || tags['contact:phone'] || '');
        const osmWebsite = tags['website'] || tags['contact:website'] || tags['url'] || '';
        const osmHours = parseOsmHours(tags['opening_hours']);
        if (osmPhone)   { phone   = osmPhone;   }
        if (osmWebsite) { website = osmWebsite; }
        if (osmHours)   { hours   = osmHours;   enriched++; }
        console.log(`  ✓ OSM enriched: ${r.name}${osmHours ? ' (+hours)' : ''}`);
      }
    }
  } catch (e) {
    console.log(`  ⚠ OSM skip for ${r.name}: ${e.message}`);
    await sleep(800);
  }

  insert.run({
    id: r.id,
    name: r.name,
    neighborhood: r.neighborhood,
    address: r.address,
    tags: JSON.stringify(r.tags),
    category: r.category || 'restaurant',
    phone: phone,
    website: website,
    hours: hours ? JSON.stringify(hours) : null,
    price: r.price || '$$',
    owner_rating: null,
  });

  inserted++;
  console.log(`✓ Inserted: ${r.name} (${r.neighborhood})`);
}

console.log(`\nDone — inserted ${inserted}, skipped ${skipped}, OSM hours for ${enriched}.\n`);
db.close();
