import { useEffect, useMemo, useRef, useState } from 'react';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const TRAVEL_SPEEDS = { driving: 0.25, walking: 0.05, bus: 0.133, train: 0.30 };
const MODES = { driving: '🚗 Drive', walking: '🚶 Walk', bus: '🚌 Bus', train: '🚇 Train' };
const TRAVEL_LABELS = { driving: 'drive', walking: 'walk', bus: 'by bus', train: 'by train' };
const DURATION_PRESETS = [30, 45, 60, 90, 120, 150, 180, 240];


const resolveLegMode = (dist, legModes, planItemId, defaultMode) => {
  if (legModes[planItemId]) return legModes[planItemId];
  if (dist < 0.5) return 'walking';
  if (dist >= 3) return ['bus', 'train'].includes(defaultMode) ? defaultMode : 'driving';
  return defaultMode;
};

const mkId = () => Math.random().toString(36).slice(2, 8);

const fmtDurLabel = (m) =>
  m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`;

const haversine = (lat1, lng1, lat2, lng2) => {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const fetchOsrmMatrix = async (coordList) => {
  const valid = coordList.filter(c => c?.lat != null && c?.lng != null);
  if (valid.length < 2) return null;
  const coordStr = valid.map(c => `${c.lng},${c.lat}`).join(';');
  try {
    const res = await fetch(
      `https://router.project-osrm.org/table/v1/driving/${coordStr}?annotations=duration,distance`,
      { headers: { 'User-Agent': 'ChicagoEatsLedger/1.0' } }
    );
    const data = await res.json();
    if (data.code !== 'Ok') return null;
    return { durations: data.durations, distances: data.distances, coords: valid };
  } catch { return null; }
};

const makeTravelFn = (matrix, defaultMode) => (fromCoord, toCoord, mode) => {
  const m = mode || defaultMode;
  const fallback = () => {
    if (!fromCoord?.lat || !toCoord?.lat) return 0;
    const d = haversine(fromCoord.lat, fromCoord.lng, toCoord.lat, toCoord.lng);
    return Math.max(0, Math.round(d / (TRAVEL_SPEEDS[m] || TRAVEL_SPEEDS.driving)));
  };
  if (!matrix || !fromCoord?.lat || !toCoord?.lat) return fallback();
  const fi = matrix.coords.findIndex(c => c.lat === fromCoord.lat && c.lng === fromCoord.lng);
  const ti = matrix.coords.findIndex(c => c.lat === toCoord.lat && c.lng === toCoord.lng);
  if (fi === -1 || ti === -1) return fallback();
  const secs = matrix.durations[fi][ti] || 0;
  const dist_m = matrix.distances?.[fi]?.[ti] || 0;
  if (m === 'walking') return Math.max(0, Math.round(dist_m / 80));
  if (m === 'bus')     return Math.max(0, Math.round((secs / 60) * 1.3));
  if (m === 'train')   return Math.max(0, Math.round((secs / 60) * 0.85));
  return Math.max(0, Math.round(secs / 60));
};

const parseHourStr = (s) => {
  if (!s) return null;
  const m = s.trim().match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const p = m[3].toUpperCase();
  if (p === 'PM' && h !== 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return h * 60 + min;
};

const hhmm24ToMins = (s) => {
  const [h, m] = (s || '10:00').split(':').map(Number);
  return h * 60 + m;
};

// Custom time picker: hour + minute text fields + big AM/PM toggle
// value: "HH:MM" (24-hour), onChange: (val: "HH:MM") => void
const TimePicker = ({ value, onChange, className = '' }) => {
  const [h24, m24] = (value || '10:00').split(':').map(Number);
  const isPM = h24 >= 12;
  const h12  = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;

  // Local draft strings so the user can freely delete/retype without being clamped mid-keystroke
  const [hourDraft, setHourDraft] = useState(null);
  const [minDraft,  setMinDraft]  = useState(null);

  const emit = (newH12, newMin, newPM) => {
    const h = (newH12 % 12) + (newPM ? 12 : 0);
    onChange(`${String(h).padStart(2, '0')}:${String(newMin).padStart(2, '0')}`);
  };

  const commitHour = (raw) => {
    setHourDraft(null);
    const v = parseInt(raw, 10);
    emit(isNaN(v) || v < 1 || v > 12 ? h12 : v, m24, isPM);
  };

  const commitMin = (raw) => {
    setMinDraft(null);
    const v = parseInt(raw, 10);
    emit(h12, isNaN(v) || v < 0 || v > 59 ? m24 : v, isPM);
  };

  const toggleAMPM = (wantPM) => {
    // commit any in-progress drafts first
    const h = hourDraft != null ? (parseInt(hourDraft, 10) || h12) : h12;
    const mn = minDraft != null ? (parseInt(minDraft, 10) ?? m24) : m24;
    emit(h, mn, wantPM);
  };

  const selectAll = (e) => {
    const el = e.currentTarget;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };

  return (
    <div className={`time-picker-widget ${className}`}>
      <span
        className="time-picker-num"
        contentEditable
        suppressContentEditableWarning
        inputMode="numeric"
        onFocus={e => { e.currentTarget.textContent = String(h12); selectAll(e); setHourDraft(String(h12)); }}
        onInput={e => setHourDraft(e.currentTarget.textContent)}
        onBlur={e => commitHour(e.currentTarget.textContent)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitHour(e.currentTarget.textContent); e.currentTarget.blur(); } }}
      >{hourDraft ?? h12}</span>
      <span className="time-picker-colon">:</span>
      <span
        className="time-picker-num"
        contentEditable
        suppressContentEditableWarning
        inputMode="numeric"
        onFocus={e => { e.currentTarget.textContent = String(m24).padStart(2, '0'); selectAll(e); setMinDraft(String(m24).padStart(2, '0')); }}
        onInput={e => setMinDraft(e.currentTarget.textContent)}
        onBlur={e => commitMin(e.currentTarget.textContent)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitMin(e.currentTarget.textContent); e.currentTarget.blur(); } }}
      >{minDraft ?? String(m24).padStart(2, '0')}</span>
      <div className="time-picker-ampm">
        <button type="button" className={`ampm-btn${!isPM ? ' active' : ''}`} onClick={() => toggleAMPM(false)}>AM</button>
        <button type="button" className={`ampm-btn${isPM  ? ' active' : ''}`} onClick={() => toggleAMPM(true)}>PM</button>
      </div>
    </div>
  );
};

const formatTime = (mins) => {
  const total = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
};

const formatDuration = (mins) => {
  mins = Math.round(mins);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

const getSpotDeadline = (spot, dayOfWeek) => {
  const hoursStr = spot.hours?.[dayOfWeek];
  if (!hoursStr || hoursStr.toLowerCase() === 'closed') return null;
  const parts = hoursStr.split(/\s*[–\-]\s*/);
  const openMins  = parseHourStr(parts[0]);
  let closeMins   = parseHourStr(parts[1]);
  if (openMins == null || closeMins == null) return null;
  if (closeMins <= openMins) closeMins += 1440;
  return { openMins, closeMins, mustArriveBy: closeMins - (spot.duration || 60) };
};

const scoreSpot = (spot, currentTime, currentCoord, dayOfWeek, travelFn, endCoord, remainingCount) => {
  if (!currentCoord || spot.lat == null) return 0;
  const travelMins  = travelFn(currentCoord, { lat: spot.lat, lng: spot.lng });
  const arrivalTime = currentTime + travelMins;
  const stayMins    = spot.duration || 60;
  const endBias     = endCoord ? haversine(spot.lat, spot.lng, endCoord.lat, endCoord.lng) / remainingCount : 0;
  let hoursPenalty  = 0;
  const dl = getSpotDeadline(spot, dayOfWeek);
  if (dl) {
    const effectiveEntry = arrivalTime < dl.openMins ? dl.openMins : arrivalTime;
    if (arrivalTime >= dl.closeMins) {
      hoursPenalty = 100000000;
    } else if (effectiveEntry + stayMins > dl.closeMins) {
      hoursPenalty = 50000000 + (effectiveEntry + stayMins - dl.closeMins) * 1000;
    } else if (arrivalTime < dl.openMins) {
      hoursPenalty = (dl.openMins - arrivalTime) * 1000;
    }
  }
  return travelMins + endBias + hoursPenalty;
};

const nearestNeighborHoursAware = (startCoord, startTimeMins, spots, travelFn, dayOfWeek, endCoord = null) => {
  if (!spots.length) return [];
  const unvisited = [...spots];
  const route = [];
  let current = startCoord;
  let currentTime = startTimeMins;

  while (unvisited.length > 0) {
    // Lookahead: find deadline-sensitive spots that would be missed if deferred
    // Strategy: if visiting ALL other remaining spots first (with minimum 5-min travel each)
    // would push us past the deadline, force this spot next.
    const urgentIdx = (() => {
      if (!current || unvisited.length < 2) return -1;
      let bestUrgent = -1;
      let tightestSlack = Infinity;
      for (let i = 0; i < unvisited.length; i++) {
        const spot = unvisited[i];
        const dl = getSpotDeadline(spot, dayOfWeek);
        if (!dl || spot.lat == null) continue;
        const travelNow = travelFn(current, { lat: spot.lat, lng: spot.lng });
        if (currentTime + travelNow >= dl.mustArriveBy) continue; // already missed
        // Minimum time to visit all other spots before this one (optimistic: 5 min travel each)
        const minTimeForOthers = unvisited.reduce((sum, other, j) => {
          if (j === i) return sum;
          return sum + (other.duration || 60) + 5;
        }, 0);
        const earliestIfDeferred = currentTime + minTimeForOthers + travelNow;
        if (earliestIfDeferred >= dl.mustArriveBy) {
          // Would miss if deferred — pick the most urgent one
          const slack = dl.mustArriveBy - (currentTime + travelNow);
          if (slack < tightestSlack) { tightestSlack = slack; bestUrgent = i; }
        }
      }
      return bestUrgent;
    })();

    let bestIdx = urgentIdx >= 0 ? urgentIdx : 0;
    if (urgentIdx < 0) {
      let bestScore = Infinity;
      for (let i = 0; i < unvisited.length; i++) {
        const score = scoreSpot(unvisited[i], currentTime, current, dayOfWeek, travelFn, endCoord, unvisited.length);
        if (score < bestScore) { bestScore = score; bestIdx = i; }
      }
    }

    const spot = unvisited.splice(bestIdx, 1)[0];
    route.push(spot);
    if (spot.lat != null) {
      const travelMins  = current ? travelFn(current, { lat: spot.lat, lng: spot.lng }) : 0;
      const arrivalTime = currentTime + travelMins;
      let entryTime     = arrivalTime;
      const dl = getSpotDeadline(spot, dayOfWeek);
      if (dl && arrivalTime < dl.openMins) entryTime = dl.openMins;
      currentTime = entryTime + (spot.duration || 60);
      current = { lat: spot.lat, lng: spot.lng };
    }
  }
  return route;
};

const optimizeFlexible = (planItems, startCoord, spots, travelMode, dayOfWeek, startMins, endCoord = null, travelFn = null) => {
  const fallbackFn = makeTravelFn(null, travelMode);
  const fn = travelFn || fallbackFn;
  const spotById = Object.fromEntries(spots.map(s => [s.id, s]));
  const result = [];
  let currentLoc = startCoord;
  let currentTime = startMins;
  let flexBuffer = [];
  let flexBufferStartTime = startMins;

  const flushBuffer = (isLast = false) => {
    if (!flexBuffer.length) return;
    const spotObjs = flexBuffer
      .map(i => ({ ...spotById[i.spotId], duration: i.duration }))
      .filter(s => s.id);
    const optimized = nearestNeighborHoursAware(
      currentLoc, flexBufferStartTime, spotObjs, fn, dayOfWeek, isLast ? endCoord : null
    );
    const bySpotId = Object.fromEntries(flexBuffer.map(i => [i.spotId, i]));
    optimized.forEach(spot => { const item = bySpotId[spot.id]; if (item) result.push(item); });
    let t = flexBufferStartTime;
    let prev = currentLoc;
    optimized.forEach(spot => {
      if (spot.lat != null && prev?.lat != null)
        t += fn(prev, { lat: spot.lat, lng: spot.lng });
      const hoursStr = spot.hours?.[dayOfWeek];
      if (hoursStr) {
        const parts = hoursStr.split(/\s*[–\-]\s*/);
        const openMins = parseHourStr(parts[0]);
        if (openMins != null && t < openMins) t = openMins;
      }
      t += spot.duration || 60;
      if (spot.lat != null) prev = spot;
    });
    const last = optimized[optimized.length - 1];
    if (last?.lat != null) currentLoc = { lat: last.lat, lng: last.lng };
    currentTime = t;
    flexBuffer = [];
  };

  for (const item of planItems) {
    if (item.type === 'spot' && item.mode === 'flexible') {
      if (!flexBuffer.length) flexBufferStartTime = currentTime;
      flexBuffer.push(item);
    } else {
      flushBuffer(false);
      result.push(item);
      if (item.type === 'spot') {
        const s = spotById[item.spotId];
        if (s?.lat != null) currentLoc = { lat: s.lat, lng: s.lng };
        const fixedMins = item.mode === 'fixed' && item.fixedTime ? hhmm24ToMins(item.fixedTime) : null;
        currentTime = Math.max(currentTime, fixedMins ?? currentTime) + (item.duration || 60);
      } else if (item.type === 'placeholder') {
        currentTime += item.duration || 30;
      }
    }
  }
  flushBuffer(true);
  return result;
};

const scheduleItems = (startCoord, startMins, planItems, spots, travelMode, dayOfWeek, endCoord, legModes = {}, travelFn = null) => {
  const spotById = Object.fromEntries(spots.map(s => [s.id, s]));
  const result = [];
  let currentCoord = startCoord || null;
  let currentTime = startMins;

  for (const item of planItems) {
    if (item.type === 'placeholder') {
      const dur = Math.max(1, Number(item.duration) || 30);
      result.push({
        type: 'placeholder', id: item.id, label: item.label || 'Break',
        duration: dur, travelMins: 0, gapBefore: 0,
        arrivalMins: currentTime, entryMins: currentTime, departureMins: currentTime + dur,
      });
      currentTime += dur;
      continue;
    }

    const spot = spotById[item.spotId];
    if (!spot) continue;

    const dist = spot.lat != null && currentCoord
      ? haversine(currentCoord.lat, currentCoord.lng, spot.lat, spot.lng) : 0;
    const legMode = resolveLegMode(dist, legModes, item.id, travelMode);
    const travelMins = travelFn
      ? travelFn(currentCoord, { lat: spot.lat, lng: spot.lng }, legMode)
      : Math.max(0, Math.round(dist / (TRAVEL_SPEEDS[legMode] || TRAVEL_SPEEDS.driving)));
    const earliestArrival = currentTime + travelMins;
    const stayMins = Math.max(1, Number(item.duration) || 60);
    const fixedMins = item.mode === 'fixed' && item.fixedTime ? hhmm24ToMins(item.fixedTime) : null;

    let arrivalMins = earliestArrival;
    let gapBefore = 0, isLateForFixed = false;

    if (fixedMins != null) {
      if (earliestArrival <= fixedMins) { gapBefore = fixedMins - earliestArrival; }
      else { isLateForFixed = true; }
    }

    const scheduledEntry = fixedMins != null && !isLateForFixed ? fixedMins : arrivalMins;

    const hoursStr = spot.hours?.[dayOfWeek];
    let status = hoursStr ? 'ok' : 'no-hours';
    let openMins = null, closeMins = null, waitMins = 0;

    if (hoursStr) {
      const parts = hoursStr.split(/\s*[–\-]\s*/);
      openMins = parseHourStr(parts[0]);
      closeMins = parseHourStr(parts[1]);
      if (openMins != null && closeMins != null) {
        const wraps = closeMins <= openMins;
        if (wraps) closeMins += 1440;
        // If trip crosses midnight, scheduledEntry may be <120 while openMins is e.g. 1380
        // Shift entry forward by a day so comparison works
        const entry = (wraps && scheduledEntry < openMins && scheduledEntry < closeMins - 1440)
          ? scheduledEntry + 1440 : scheduledEntry;
        if (entry >= closeMins) status = 'closed';
        else if (entry < openMins) { status = 'not-open-yet'; waitMins = openMins - entry; }
        else if (entry + stayMins > closeMins) status = 'closes-early';
      }
    }
    if (isLateForFixed) status = 'late-for-fixed';

    const entryMins = scheduledEntry + waitMins;
    const departureMins = entryMins + stayMins;

    result.push({
      type: 'spot', ...spot, planItemId: item.id, mode: item.mode, fixedMins,
      travelMins, dist, gapBefore, arrivalMins, entryMins, departureMins,
      stayMins, waitMins, status, openMins, closeMins, isLateForFixed, legMode,
    });

    if (spot.lat != null) currentCoord = { lat: spot.lat, lng: spot.lng };
    currentTime = departureMins;
  }

  if (endCoord && currentCoord && result.length > 0) {
    const dist = haversine(currentCoord.lat, currentCoord.lng, endCoord.lat, endCoord.lng);
    const retMode = resolveLegMode(dist, legModes, '__return__', travelMode);
    const retMins = travelFn
      ? travelFn(currentCoord, endCoord, retMode)
      : Math.max(0, Math.round(dist / (TRAVEL_SPEEDS[retMode] || TRAVEL_SPEEDS.driving)));
    result.push({ type: 'return', travelMins: retMins, dist, arrivalMins: currentTime + retMins, legMode: retMode });
  }

  return result;
};

function LocationField({ label, value, onChange, onFind, onGPS, coord, loading, suggestions, showSuggestions, onSelect, onHideSuggestions, placeholder, hideGPS }) {
  return (
    <div className="plan-location-field">
      <div className="setup-label">{label}</div>
      <div className="location-wrapper"
        onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) onHideSuggestions(); }}>
        <input
          type="text"
          className="location-input plan-location-input"
          autoComplete="off"
          placeholder={placeholder || 'Address or place…'}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onFind()}
          onFocus={() => suggestions.length > 0 && showSuggestions}
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul className="suggestions-dropdown">
            {suggestions.map(s => (
              <li key={s.place_id} className="suggestion-item" tabIndex={-1} onMouseDown={() => onSelect(s)}>
                {s.display_name}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="plan-location-actions">
        {!hideGPS && <button className="location-btn" onClick={onGPS}>📍 GPS</button>}
        <button className="location-btn" onClick={onFind} disabled={loading || !value.trim()}>
          {loading ? '…' : 'Find'}
        </button>
        {coord && <span className="location-set">✓ Set</span>}
      </div>
    </div>
  );
}


function DurationPicker({ value, onChange }) {
  return (
    <div className="dur-row">
      <span className="dur-label">Stay</span>
      <select
        className="dur-select"
        value={DURATION_PRESETS.includes(value) ? String(value) : String(value)}
        onChange={e => onChange(Number(e.target.value))}
      >
        {DURATION_PRESETS.map(p => <option key={p} value={String(p)}>{fmtDurLabel(p)}</option>)}
      </select>
    </div>
  );
}

const nominatimSearch = async (q) => {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`);
  return res.json();
};

export default function PlanRoute({ spots, userLocation, setUserLocation, starredIds = new Set(), toggleStar, planItems, setPlanItems }) {
  const [startLabel, setStartLabel] = useState('');
  const [startCoord, setStartCoord] = useState(null);
  const [startSuggestions, setStartSuggestions] = useState([]);
  const [showStartSuggestions, setShowStartSuggestions] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const startDebounceRef = useRef(null);

  const [endSameAsStart, setEndSameAsStart] = useState(true);
  const [endLabel, setEndLabel] = useState('');
  const [endCoord, setEndCoord] = useState(null);
  const [endSuggestions, setEndSuggestions] = useState([]);
  const [showEndSuggestions, setShowEndSuggestions] = useState(false);
  const [endLoading, setEndLoading] = useState(false);
  const endDebounceRef = useRef(null);

  const [startTimeStr, setStartTimeStr] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [planDate, setPlanDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [travelMode, setTravelMode] = useState('driving');
  const [shareId, setShareId] = useState(null);
  const [itineraryOpen, setItineraryOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [runActive, setRunActive] = useState(false);
  const [visitedIds, setVisitedIds] = useState(new Set());
  const [osrmMatrix, setOsrmMatrix] = useState(null);
  const osrmDebounceRef = useRef(null);

  const toggleVisited = (id) => {
    setVisitedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      if (shareId) localStorage.setItem(`run-visited-${shareId}`, JSON.stringify([...next]));
      return next;
    });
  };

  const startRun = () => {
    if (shareId) localStorage.setItem(`run-active-${shareId}`, 'true');
    setRunActive(true);
  };

  const resetRun = () => {
    if (shareId) {
      localStorage.removeItem(`run-active-${shareId}`);
      localStorage.removeItem(`run-visited-${shareId}`);
    }
    setRunActive(false);
    setVisitedIds(new Set());
  };
  const [toast, setToast] = useState('');
  const [planDragOverIdx, setPlanDragOverIdx] = useState(null);
  const planDragIdxRef = useRef(null);
  const [checklistSearch, setChecklistSearch] = useState('');
  const [checklistHood, setChecklistHood] = useState('');
  const [checklistPage, setChecklistPage] = useState(1);
  const CHECKLIST_PAGE_SIZE = 25;
  const [legModes, setLegModes] = useState({});
  const [hasSeenPlanHint, setHasSeenPlanHint] = useState(() => localStorage.getItem('seenPlanHint') === '1');
  const dismissPlanHint = () => { setHasSeenPlanHint(true); localStorage.setItem('seenPlanHint', '1'); };
  const [openLegPicker, setOpenLegPicker] = useState(null);

  const showToast = (msg) => { setToast(msg); window.setTimeout(() => setToast(''), 2500); };

  useEffect(() => {
    if (userLocation && !startCoord) { setStartCoord(userLocation); setStartLabel('My location'); }
  }, [userLocation]);

  const prevPlanLenRef = useRef(planItems.length);
  useEffect(() => {
    if (planItems.length > prevPlanLenRef.current && planItems.length > 0) {
      setItineraryOpen(true);
    }
    prevPlanLenRef.current = planItems.length;
  }, [planItems.length]);

  useEffect(() => {
    const planId = new URLSearchParams(window.location.search).get('plan');
    if (planId) loadPlan(planId);
  }, []);

  const makeDebounce = (debounceRef, setSuggestions, setShow) => (q) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setSuggestions([]); setShow(false); return; }
    debounceRef.current = setTimeout(async () => {
      try { const data = await nominatimSearch(q); setSuggestions(data); setShow(data.length > 0); }
      catch { setSuggestions([]); }
    }, 350);
  };

  const fetchStartSuggestions = useMemo(
    () => makeDebounce(startDebounceRef, setStartSuggestions, setShowStartSuggestions),
    []
  );
  const fetchEndSuggestions = useMemo(
    () => makeDebounce(endDebounceRef, setEndSuggestions, setShowEndSuggestions),
    []
  );

  const geocode = async (query, setCoord, onSuccess, setLoading) => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await nominatimSearch(query);
      if (data.length > 0) { setCoord({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }); onSuccess?.(); }
      else showToast('Address not found.');
    } catch { showToast('Could not find location.'); }
    finally { setLoading(false); }
  };

  const geocodeStart = () => geocode(startLabel, setStartCoord, () => showToast('Start point set.'), setStartLoading);
  const geocodeEnd   = () => geocode(endLabel,   setEndCoord,   () => showToast('End point set.'),   setEndLoading);

  const useGPS = () => {
    if (!navigator.geolocation) return showToast('Geolocation not supported.');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setStartCoord(c); setStartLabel('My location'); setUserLocation(c); showToast('Location set.');
      },
      () => showToast('Could not access GPS.')
    );
  };

  const loadPlan = async (planId) => {
    try {
      const res = await fetch(`/api/plans/${planId}`);
      if (!res.ok) return showToast('Plan not found.');
      const p = await res.json();
      if (p.planItems) setPlanItems(p.planItems);
      setStartLabel(p.startLabel || '');
      if (p.startLat != null) setStartCoord({ lat: p.startLat, lng: p.startLng });
      if (p.startTimeMinutes != null) {
        const h = Math.floor(p.startTimeMinutes / 60), m = p.startTimeMinutes % 60;
        setStartTimeStr(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
      if (p.planDate) setPlanDate(p.planDate);
      setTravelMode(p.travelMode || 'driving');
      if (p.endSameAsStart !== undefined) setEndSameAsStart(p.endSameAsStart);
      setEndLabel(p.endLabel || '');
      if (p.endLat != null) setEndCoord({ lat: p.endLat, lng: p.endLng });
      setShareId(planId);
      // Restore active run state from localStorage
      if (localStorage.getItem(`run-active-${planId}`) === 'true') {
        setRunActive(true);
        try {
          const saved = JSON.parse(localStorage.getItem(`run-visited-${planId}`) || '[]');
          setVisitedIds(new Set(saved));
        } catch {}
      }
    } catch { showToast('Could not load plan.'); }
  };

  const openInGoogleMaps = () => {
    const spotById = Object.fromEntries(spots.map(s => [s.id, s]));
    const stops = planItems
      .filter(i => i.type === 'spot')
      .map(i => spotById[i.spotId])
      .filter(s => s?.address);
    if (!stops.length) return showToast('Add stops with addresses first.');
    // Google Maps directions URL: /maps/dir/origin/stop1/stop2/.../destination
    const parts = [];
    if (startCoord && startLabel) parts.push(encodeURIComponent(startLabel));
    else if (startCoord) parts.push(`${startCoord.lat},${startCoord.lng}`);
    stops.forEach(s => parts.push(encodeURIComponent(s.address)));
    const endC = endSameAsStart ? startCoord : endCoord;
    const endL = endSameAsStart ? startLabel : endLabel;
    if (endC && endL && !endSameAsStart) parts.push(encodeURIComponent(endL));
    else if (endSameAsStart && parts.length > 0) parts.push(parts[0]); // return to start
    if (parts.length < 2) return showToast('Need at least a start and one stop.');
    const url = `https://www.google.com/maps/dir/${parts.join('/')}`;
    window.open(url, '_blank');
  };

  const downloadPlan = () => {
    if (!itinerary.length) return showToast('Build a plan first.');
    const spotById = Object.fromEntries(spots.map(s => [s.id, s]));
    // Build the chain: stop → travel leg → next stop (matching website receipt format)
    const stopOnlyItems = stopItems.filter(item => item.type !== 'placeholder');
    const lines = stopOnlyItems.map((item, i) => {
      const spot = spotById[planItems.find(p => p.id === item.planItemId)?.spotId];
      const mapsUrl = item.address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(item.address)}` : null;
      const travelBlock = (item.travelMins > 0 || i > 0)
        ? `<div class="dl-leg">
             <div class="dl-leg-arrow">↓</div>
             <div class="dl-leg-desc">
               <span class="dl-leg-main">${MODES[item.legMode]} · ${formatDuration(item.travelMins)}${item.dist > 0.05 ? ` · ≈${item.dist.toFixed(1)} mi` : ''}</span>
               <span class="dl-leg-times">${formatTime(item.arrivalMins - item.travelMins)} → ${formatTime(item.arrivalMins)}</span>
             </div>
           </div>`
        : '';
      return `
        ${travelBlock}
        <div class="dl-stop">
          <div class="dl-stop-num">${i + 1}</div>
          <div class="dl-stop-body">
            <div class="dl-stop-name">${item.name}</div>
            ${item.address ? `<div class="dl-stop-addr">${item.address}${mapsUrl ? ` <a href="${mapsUrl}">↗ Maps</a>` : ''}</div>` : ''}
            <div class="dl-stop-time">${formatTime(item.entryMins)} – ${formatTime(item.departureMins)} · ${formatDuration(item.stayMins)} stay${item.waitMins > 0 ? ` + ${formatDuration(item.waitMins)} wait` : ''}</div>
            ${spot?.phone ? `<div class="dl-spot-meta">📞 ${spot.phone}</div>` : ''}
            ${spot?.reservationUrl ? `<div class="dl-spot-meta"><a href="${spot.reservationUrl}">📅 Reserve a table</a></div>` : ''}
            ${spot?.website ? `<div class="dl-spot-meta"><a href="${spot.website}">🌐 Website</a></div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    const mapsUrl = (() => {
      const stopSpots = planItems.filter(i => i.type === 'spot').map(i => spotById[i.spotId]).filter(s => s?.address);
      if (!stopSpots.length) return null;
      const parts = [];
      if (startLabel) parts.push(encodeURIComponent(startLabel));
      stopSpots.forEach(s => parts.push(encodeURIComponent(s.address)));
      if (endSameAsStart && parts.length) parts.push(parts[0]);
      else if (endLabel) parts.push(encodeURIComponent(endLabel));
      return parts.length >= 2 ? `https://www.google.com/maps/dir/${parts.join('/')}` : null;
    })();

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chicago Eats — Route Plan</title>
<style>
  body { font-family: 'Georgia', serif; max-width: 540px; margin: 0 auto; padding: 24px 16px; color: #2a2420; background: #fff; }
  h1 { font-size: 1.3rem; text-align: center; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 2px; }
  .sub { text-align: center; color: #888; font-size: 0.82rem; margin-bottom: 20px; }
  .rule { border: none; border-top: 1px dashed #ccc; margin: 16px 0; }
  .dl-stop { display: flex; gap: 12px; margin: 14px 0 4px; }
  .dl-stop-num { font-size: 1.1rem; font-weight: 700; color: #8b5a2b; min-width: 24px; padding-top: 2px; }
  .dl-stop-name { font-weight: 700; font-size: 1rem; }
  .dl-stop-addr { font-size: 0.82rem; color: #666; margin-top: 2px; }
  .dl-stop-addr a { color: #8b5a2b; }
  .dl-stop-time { font-size: 0.82rem; margin-top: 3px; }
  .dl-spot-meta { font-size: 0.8rem; color: #555; margin-top: 2px; }
  .dl-spot-meta a { color: #8b5a2b; }
  .dl-leg { display: flex; align-items: flex-start; gap: 10px; padding: 6px 0 2px 8px; color: #666; }
  .dl-leg-arrow { font-size: 1.1rem; color: #aaa; line-height: 1; padding-top: 1px; }
  .dl-leg-desc { display: flex; flex-direction: column; font-size: 0.8rem; }
  .dl-leg-main { font-weight: 600; color: #555; }
  .dl-leg-times { color: #999; margin-top: 1px; }
  .totals { margin-top: 16px; font-size: 0.88rem; }
  .totals-row { display: flex; justify-content: space-between; padding: 3px 0; }
  .totals-row.grand { font-weight: 700; font-size: 1rem; border-top: 1px solid #ccc; margin-top: 6px; padding-top: 6px; }
  .nav-btn { display: block; text-align: center; margin: 20px auto 0; padding: 12px 24px; background: #2a2420; color: #fff; text-decoration: none; border-radius: 8px; font-size: 0.95rem; font-family: sans-serif; }
  .footer { text-align: center; color: #bbb; font-size: 0.75rem; margin-top: 28px; }
  @media print { .nav-btn { display: none; } }
</style></head><body>
<h1>Chicago Eats Ledger</h1>
<div class="sub">Route Plan · ${receiptDate} · Depart ${formatTime(startMins)}</div>
<hr class="rule">
${startLabel ? `<div style="font-size:0.85rem;margin-bottom:8px;color:#555;">📍 Starting from: <strong>${startLabel}</strong></div>` : ''}
${lines}
${returnItem ? `
<div class="dl-leg">
  <div class="dl-leg-arrow">↓</div>
  <div class="dl-leg-desc">
    <span class="dl-leg-main">${MODES[returnItem.legMode]} · ${formatDuration(returnItem.travelMins)}${returnItem.dist > 0.05 ? ` · ≈${returnItem.dist.toFixed(1)} mi` : ''}</span>
    <span class="dl-leg-times">${formatTime(returnItem.arrivalMins - returnItem.travelMins)} → ${formatTime(returnItem.arrivalMins)}</span>
  </div>
</div>
<div style="font-size:0.88rem;color:#555;margin-top:4px;padding-left:8px;">🏁 <strong>${endPointLabel}</strong></div>` : ''}
<hr class="rule">
${totals ? `<div class="totals">
  <div class="totals-row"><span>Stops</span><span>${spotCount}</span></div>
  <div class="totals-row"><span>Travel time</span><span>${formatDuration(totals.totalTravel)}</span></div>
  <div class="totals-row"><span>Time at spots</span><span>${formatDuration(totals.totalStay)}</span></div>
  <div class="totals-row grand"><span>Total trip</span><span>${formatDuration(totals.totalTime)}</span></div>
  <div class="totals-row"><span>${returnItem ? homeByLabel : 'Trip ends'}</span><span>${formatTime(startMins + totals.totalTime)}</span></div>
</div>` : ''}
${mapsUrl ? `<a class="nav-btn" href="${mapsUrl}" target="_blank">🗺 Open full route in Google Maps</a>` : ''}
<div class="footer">chicago eats ledger · plan your city</div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chicago-eats-plan-${receiptDate.replace(/\s/g, '-')}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Plan downloaded — open the file and print to save as PDF.');
  };

  const sharePlan = async () => {
    if (!planItems.length) return showToast('Add stops to your plan first.');
    const payload = {
      startLabel, startLat: startCoord?.lat ?? null, startLng: startCoord?.lng ?? null,
      startTimeMinutes: startMins, planDate, travelMode, planItems,
      endSameAsStart, endLabel, endLat: endCoord?.lat ?? null, endLng: endCoord?.lng ?? null,
    };
    try {
      const res = await fetch('/api/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const { id } = await res.json();
      const url = `${window.location.origin}/run/${id}`;
      setShareId(id);
      await navigator.clipboard.writeText(url).catch(() => {});
      setCopied(true); setTimeout(() => setCopied(false), 2200);
      showToast('Link copied!');
    } catch { showToast('Could not save plan.'); }
  };

  const selectedSpotIds = useMemo(
    () => new Set(planItems.filter(i => i.type === 'spot').map(i => i.spotId)),
    [planItems]
  );

  const toggleSpot = (spotId) => {
    if (selectedSpotIds.has(spotId)) {
      setPlanItems(prev => prev.filter(i => !(i.type === 'spot' && i.spotId === spotId)));
    } else {
      setPlanItems(prev => [...prev, { id: mkId(), type: 'spot', spotId, mode: 'flexible', duration: 60 }]);
      setItineraryOpen(true);
    }
  };

  const addPlaceholder = () =>
    setPlanItems(prev => [...prev, { id: mkId(), type: 'placeholder', label: 'Break', duration: 30 }]);
  const updateItem = (id, patch) => setPlanItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
  const removeItem = (id) => setPlanItems(prev => prev.filter(i => i.id !== id));

  const setLegMode = (planItemId, mode) => setLegModes(prev => ({ ...prev, [planItemId]: mode }));
  const resetLegMode = (planItemId) => setLegModes(prev => { const n = { ...prev }; delete n[planItemId]; return n; });
  const toggleLegPicker = (id) => setOpenLegPicker(prev => prev === id ? null : id);

  const onPlanDragStart = (e, idx, label) => {
    planDragIdxRef.current = idx;
    // Create a minimal ghost so only a name chip follows the cursor
    const ghost = document.createElement('div');
    ghost.textContent = label;
    ghost.style.cssText = 'position:fixed;top:-999px;left:-999px;padding:4px 12px;background:#fff;border:1px dashed #b5402e;border-radius:6px;font-family:Courier Prime,monospace;font-size:0.85rem;color:#2a2420;white-space:nowrap;pointer-events:none;';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 16);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  };

  const getDropIdx = (e, idx) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    return e.clientY < mid ? idx : idx + 1;
  };

  const onPlanDragOver = (e, idx) => {
    e.preventDefault();
    setPlanDragOverIdx(getDropIdx(e, idx));
  };

  const onPlanDrop = (e, idx) => {
    const from = planDragIdxRef.current;
    const insertAt = getDropIdx(e, idx);
    setPlanDragOverIdx(null);
    planDragIdxRef.current = null;
    if (from === null || from === insertAt || from === insertAt - 1) return;
    setPlanItems(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(from, 1);
      const target = insertAt > from ? insertAt - 1 : insertAt;
      arr.splice(target, 0, moved);
      return arr;
    });
  };

  const planDayOfWeek = useMemo(() => DAYS[new Date(planDate + 'T12:00:00').getDay()], [planDate]);
  const startMins     = useMemo(() => hhmm24ToMins(startTimeStr), [startTimeStr]);
  const spotById      = useMemo(() => Object.fromEntries(spots.map(s => [s.id, s])), [spots]);

  const checklistNeighborhoods = useMemo(() => {
    const hoods = [...new Set(spots.map(s => s.neighborhood).filter(Boolean))].sort();
    return hoods;
  }, [spots]);

  const filteredChecklistSpots = useMemo(() => {
    const q = checklistSearch.trim().toLowerCase();
    const matches = (s) => {
      if (checklistHood && s.neighborhood !== checklistHood) return false;
      if (!q) return true;
      return [s.name, s.neighborhood, s.category, ...(s.tags || [])].some(f => f?.toLowerCase().includes(q));
    };
    const selected   = spots.filter(s => selectedSpotIds.has(s.id) && matches(s));
    const unselected = spots.filter(s => !selectedSpotIds.has(s.id) && matches(s));
    return [...selected, ...unselected];
  }, [spots, selectedSpotIds, checklistSearch, checklistHood]);

  const effectiveEndCoord = useMemo(
    () => endSameAsStart ? startCoord : endCoord,
    [endSameAsStart, startCoord, endCoord]
  );

  useEffect(() => {
    clearTimeout(osrmDebounceRef.current);
    osrmDebounceRef.current = setTimeout(async () => {
      const seen = new Set();
      const coordList = [];
      const add = (c) => {
        if (!c?.lat || !c?.lng) return;
        const k = `${c.lat},${c.lng}`;
        if (seen.has(k)) return;
        seen.add(k);
        coordList.push({ lat: c.lat, lng: c.lng });
      };
      add(startCoord);
      for (const item of planItems) {
        if (item.type === 'spot') {
          const s = spots.find(sp => sp.id === item.spotId);
          if (s) add(s);
        }
      }
      add(effectiveEndCoord);
      const matrix = await fetchOsrmMatrix(coordList);
      setOsrmMatrix(matrix);
    }, 600);
  }, [planItems, spots, startCoord, effectiveEndCoord]);

  const travelFn = useMemo(
    () => makeTravelFn(osrmMatrix, travelMode),
    [osrmMatrix, travelMode]
  );

  const optimize = () => {
    const spotById = Object.fromEntries(spots.map(s => [s.id, s]));
    const firstSpot = planItems.find(i => i.type === 'spot');
    const firstSpotCoord = firstSpot ? spotById[firstSpot.spotId] : null;
    const origin = startCoord ?? (firstSpotCoord?.lat != null ? { lat: firstSpotCoord.lat, lng: firstSpotCoord.lng } : null);
    setPlanItems(prev => optimizeFlexible(prev, origin, spots, travelMode, planDayOfWeek, startMins, effectiveEndCoord, travelFn));
    setItineraryOpen(true);
    showToast('Stops re-ordered for hours & distance.');
  };

  const itinerary = useMemo(
    () => scheduleItems(startCoord, startMins, planItems, spots, travelMode, planDayOfWeek, effectiveEndCoord, legModes, travelFn),
    [startCoord, startMins, planItems, spots, travelMode, planDayOfWeek, effectiveEndCoord, legModes, travelFn]
  );

  const returnItem = useMemo(() => itinerary.find(i => i.type === 'return') ?? null, [itinerary]);
  const stopItems  = useMemo(() => itinerary.filter(i => i.type !== 'return'), [itinerary]);

  const totals = useMemo(() => {
    if (!stopItems.length) return null;
    const spotLegs = stopItems.filter(x => x.type === 'spot');
    const totalTravel = spotLegs.reduce((s, x) => s + x.travelMins, 0) + (returnItem?.travelMins ?? 0);
    const totalStay   = spotLegs.reduce((s, x) => s + x.stayMins, 0);
    const totalGap    = spotLegs.reduce((s, x) => s + x.gapBefore, 0);
    const totalPlaceholder = stopItems.filter(x => x.type === 'placeholder').reduce((s, x) => s + x.duration, 0);
    const end = returnItem
      ? returnItem.arrivalMins
      : (stopItems[stopItems.length - 1]?.departureMins ?? startMins);
    const byMode = {};
    spotLegs.forEach(x => { if (x.travelMins > 0) byMode[x.legMode] = (byMode[x.legMode] || 0) + x.travelMins; });
    if (returnItem?.travelMins > 0) byMode[returnItem.legMode] = (byMode[returnItem.legMode] || 0) + returnItem.travelMins;
    return { totalTravel, totalStay, totalGap, totalPlaceholder, totalTime: end - startMins, byMode };
  }, [stopItems, returnItem, startMins]);

  const statusIcon  = (s) => ({ ok: '✅', 'no-hours': '📋', 'not-open-yet': '⏳', 'closes-early': '⚠️', closed: '🚫', 'late-for-fixed': '⚠️' })[s] ?? '📋';
  const statusLabel = (stop) => {
    if (stop.status === 'ok')           return 'Open during your visit';
    if (stop.status === 'no-hours')     return 'Hours not listed';
    if (stop.status === 'not-open-yet')
      return `Opens at ${formatTime(stop.openMins)} — waiting ${formatDuration(stop.waitMins)}`;
    if (stop.status === 'closes-early') {
      const covered = stop.closeMins - stop.entryMins;
      return `Closes at ${formatTime(stop.closeMins)} — only ${formatDuration(covered)} of your ${formatDuration(stop.stayMins)} stay fits`;
    }
    if (stop.status === 'closed') {
      if (stop.openMins != null && stop.closeMins != null) {
        const lastEntry = stop.closeMins - stop.stayMins;
        return `Closed — open ${formatTime(stop.openMins)}–${formatTime(stop.closeMins)}, arrive by ${formatTime(lastEntry)} for a ${formatDuration(stop.stayMins)} visit`;
      }
      return 'Closed when you arrive';
    }
    if (stop.status === 'late-for-fixed') return `Late for fixed time (${formatTime(stop.fixedMins)})`;
    return '';
  };

  const hasWarnings  = stopItems.some(s => s.status && s.status !== 'ok' && s.status !== 'no-hours');
  const hasFlexible  = planItems.some(i => i.type === 'spot' && i.mode === 'flexible');
  // Spots that are truly impossible regardless of order (closed when arrived, or close too early for any stay)
  const impossibleSpots = useMemo(() => stopItems.filter(i => i.type === 'spot' && (i.status === 'closed' || i.status === 'closes-early')), [stopItems]);
  const receiptDate  = new Date(planDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const spotCount    = stopItems.filter(i => i.type === 'spot').length;
  const endPointLabel = endSameAsStart ? (startLabel || 'Starting point') : (endLabel || 'Ending point');
  const homeByLabel  = endSameAsStart ? 'HOME BY' : 'ARRIVE AT';
  const selectedFromChecklist   = filteredChecklistSpots.filter(s => selectedSpotIds.has(s.id));
  const unselectedFromChecklist = filteredChecklistSpots.filter(s => !selectedSpotIds.has(s.id));

  return (
    <div className="planner">
      <div className="planner-header">
        <h2 className="planner-title">Plan a Route</h2>
        <div className="planner-header-actions">
          {planItems.some(i => i.type === 'spot' && i.mode === 'flexible') && (
            <button className="planner-action-btn" onClick={optimize}>⟳ Optimize</button>
          )}
          <button className="planner-action-btn share" onClick={sharePlan} disabled={!planItems.length}>
            {copied ? '✓ Copied!' : '↗ Share plan'}
          </button>
          {!runActive && planItems.length > 0 && (
            <button className="planner-action-btn run-btn" onClick={startRun}>▶ Start Crawl</button>
          )}
          {runActive && (
            <button className="planner-action-btn run-btn run-btn--active" onClick={resetRun}>
              ✓ {visitedIds.size}/{stopItems.filter(i => i.type === 'spot').length} · End Run
            </button>
          )}
        </div>
      </div>

      {!hasSeenPlanHint && (
        <div className="planner-how-to">
          <span className="planner-how-step">1. Save restaurants on the <strong>Ledger</strong> tab</span>
          <span className="planner-how-arrow">→</span>
          <span className="planner-how-step">2. Check the boxes below &amp; set your date/time</span>
          <span className="planner-how-arrow">→</span>
          <span className="planner-how-step">3. Tap <strong>Optimize</strong> to get the best order</span>
          <button className="trip-hint-dismiss" onClick={dismissPlanHint} style={{ alignSelf: 'flex-end', marginTop: 4 }}>Got it</button>
        </div>
      )}

      <div className="planner-body">
        <div className="planner-setup" style={{ maxWidth: '100%' }}>

          <div className="setup-step">
            <div className="step-header">
              <span className="step-num">1</span>
              <span className="step-label">Your spots</span>
            </div>
            <div className="step-content">
              <div className="setup-block">
                <div className="setup-label">
                  Your plan
                  {planItems.length > 0 && <span className="selected-count"> — {planItems.length} item{planItems.length !== 1 ? 's' : ''}</span>}
                </div>
                {planItems.length === 0 ? (
                  <div className="plan-empty-state">
                    <p className="plan-empty-hint">Check spots below to add them to your plan.</p>
                    {starredIds.size > 0 && (
                      <button
                        className="restore-starred-btn"
                        onClick={() => {
                          const toAdd = [...starredIds].filter(id => !selectedSpotIds.has(id));
                          if (toAdd.length === 0) return;
                          setPlanItems(prev => [
                            ...prev,
                            ...toAdd.map(id => ({ id: mkId(), type: 'spot', spotId: id, mode: 'flexible', duration: 60 }))
                          ]);
                        }}
                      >★ Add your {starredIds.size} starred spot{starredIds.size !== 1 ? 's' : ''}</button>
                    )}
                  </div>
                ) : (
                  <>
                  {planItems.length > 1 && (
                    <div className="plan-reorder-hint">↕ Drag the cards to reorder your stops</div>
                  )}
                  <ul className="plan-order-list">
                    {planItems.map((item, idx) => (
                      <li
                        key={item.id}
                        className={`plan-order-item${planDragOverIdx === idx ? ' drag-over-top' : planDragOverIdx === idx + 1 ? ' drag-over-bottom' : ''}${item.type === 'placeholder' ? ' is-placeholder' : ''}${planDragIdxRef.current === idx ? ' is-dragging' : ''}`}
                        draggable
                        onDragStart={e => onPlanDragStart(e, idx, item.type === 'placeholder' ? (item.label || 'Break') : (spots.find(s => s.id === item.spotId)?.name || 'Stop'))}
                        onDragOver={e => onPlanDragOver(e, idx)}
                        onDragLeave={() => setPlanDragOverIdx(null)}
                        onDrop={e => onPlanDrop(e, idx)}
                        onDragEnd={() => { setPlanDragOverIdx(null); planDragIdxRef.current = null; }}
                      >
                        <span className="drag-handle" title="Drag to reorder">⠿</span>

                        {item.type === 'spot' ? (
                          <div className="poi-config">
                            <div className="poi-config-top">
                              <span className="poi-config-name">{spotById[item.spotId]?.name ?? '?'}</span>
                              <button className="remove-item-btn" onClick={() => removeItem(item.id)} title="Remove">✕</button>
                            </div>
                            <DurationPicker
                              value={item.duration}
                              onChange={dur => updateItem(item.id, { duration: dur })}
                            />
                            <div className="poi-config-bottom">
                              <div className="timing-mode-pill">
                                <button type="button" className={item.mode === 'flexible' ? 'active' : ''} onClick={() => updateItem(item.id, { mode: 'flexible' })}>Flexible</button>
                                <button type="button" className={item.mode === 'fixed' ? 'active' : ''} onClick={() => updateItem(item.id, { mode: 'fixed' })}>Fixed time</button>
                              </div>
                              {item.mode === 'fixed' && (
                                <TimePicker
                                  value={item.fixedTime || '12:00'}
                                  onChange={v => updateItem(item.id, { fixedTime: v })}
                                  className="fixed-time-picker"
                                />
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="placeholder-config">
                            <input
                              type="text"
                              className="placeholder-label-input"
                              value={item.label || ''}
                              onChange={e => updateItem(item.id, { label: e.target.value })}
                              placeholder="Label (e.g. Lunch, Errands)"
                            />
                            <DurationPicker
                              value={item.duration}
                              onChange={dur => updateItem(item.id, { duration: dur })}
                            />
                            <button className="remove-item-btn" onClick={() => removeItem(item.id)}>✕</button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  </>
                )}
              </div>

              <div className="setup-block">
                <div className="setup-label">Add spots</div>
                <div className="checklist-filters">
                  <input
                    type="text"
                    className="setup-input checklist-search-input"
                    placeholder="Search by name, cuisine..."
                    value={checklistSearch}
                    onChange={e => { setChecklistSearch(e.target.value); setChecklistPage(1); }}
                  />
                  {checklistSearch && (
                    <button className="checklist-clear-btn" onClick={() => { setChecklistSearch(''); setChecklistPage(1); }}>✕</button>
                  )}
                  {checklistNeighborhoods.length > 0 && (
                    <select
                      className="setup-input checklist-hood-select"
                      value={checklistHood}
                      onChange={e => { setChecklistHood(e.target.value); setChecklistPage(1); }}
                    >
                      <option value="">All neighborhoods</option>
                      {checklistNeighborhoods.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  )}
                </div>
                <ul className="spot-checklist">
                  <li className="spot-check-add-break" onClick={addPlaceholder}>
                    <span className="add-break-icon">＋</span>
                    <span>Add a break / placeholder</span>
                  </li>
                  {(() => {
                    const renderSpotRow = (spot) => {
                      const checked = selectedSpotIds.has(spot.id);
                      const dayHours = spot.hours?.[planDayOfWeek];
                      const closedToday = dayHours === '' || dayHours?.toLowerCase() === 'closed';
                      const noHoursToday = dayHours == null;
                      const isStarred = starredIds.has(spot.id);
                      return (
                        <li key={spot.id} className={`spot-check-item${checked ? ' checked' : ''}`}>
                          <label className="spot-check-label">
                            <input type="checkbox" checked={checked} onChange={() => toggleSpot(spot.id)} />
                            <span className="check-name">{spot.name}</span>
                            <span className="check-hood">{spot.neighborhood}</span>
                            {closedToday && <span className="check-closed-today">closed</span>}
                            {!closedToday && noHoursToday && <span className="check-no-hours">no hours</span>}
                          </label>
                          <button
                            className={`checklist-star-btn${isStarred ? ' starred' : ''}`}
                            onClick={() => toggleStar?.(spot.id)}
                          >{isStarred ? '★ Saved' : '☆ Save'}</button>
                        </li>
                      );
                    };

                    const otherUnselected   = unselectedFromChecklist;
                    const visibleOther      = otherUnselected.slice(0, checklistPage * CHECKLIST_PAGE_SIZE);
                    const hasMore           = otherUnselected.length > visibleOther.length;
                    const isFiltering       = checklistSearch.trim() || checklistHood;

                    return (<>
                      {selectedFromChecklist.length > 0 && (
                        <li className="checklist-section-divider checklist-starred-header">
                          <span>✓ In your plan ({selectedFromChecklist.length})</span>
                          <button
                            className="checklist-action-btn checklist-action-btn--danger"
                            onClick={() => selectedFromChecklist.forEach(s => toggleSpot(s.id))}
                          >Remove all</button>
                        </li>
                      )}
                      {selectedFromChecklist.map(renderSpotRow)}

                      {otherUnselected.length > 0 && (
                        <li className="checklist-section-divider">
                          {isFiltering ? `${otherUnselected.length} result${otherUnselected.length !== 1 ? 's' : ''}` :
                           selectedFromChecklist.length > 0 ? `All spots (${otherUnselected.length})` : `All spots (${otherUnselected.length})`}
                        </li>
                      )}
                      {visibleOther.map(renderSpotRow)}
                      {hasMore && (
                        <li className="checklist-load-more">
                          <button onClick={() => setChecklistPage(p => p + 1)}>
                            Show more ({otherUnselected.length - visibleOther.length} remaining)
                          </button>
                        </li>
                      )}
                      {filteredChecklistSpots.length === 0 && (
                        <li className="checklist-empty">No spots match — try a different search or neighborhood.</li>
                      )}
                    </>);
                  })()}
                </ul>
              </div>
            </div>
          </div>

          <div className="setup-step">
            <div className="step-header">
              <span className="step-num">2</span>
              <span className="step-label">Where</span>
            </div>
            <div className="step-content">
              <LocationField
                label="Starting point"
                value={startLabel}
                onChange={v => { setStartLabel(v); fetchStartSuggestions(v); }}
                onFind={geocodeStart}
                onGPS={useGPS}
                coord={startCoord}
                loading={startLoading}
                suggestions={startSuggestions}
                showSuggestions={showStartSuggestions}
                onSelect={s => { setStartLabel(s.display_name); setStartCoord({ lat: +s.lat, lng: +s.lon }); setStartSuggestions([]); setShowStartSuggestions(false); }}
                onHideSuggestions={() => setShowStartSuggestions(false)}
                placeholder="Your address or neighborhood…"
              />
              <label className="end-same-row">
                <input type="checkbox" checked={endSameAsStart} onChange={e => setEndSameAsStart(e.target.checked)} />
                <span>Return to starting point</span>
              </label>
              {!endSameAsStart && (
                <LocationField
                  label="Ending point"
                  value={endLabel}
                  onChange={v => { setEndLabel(v); fetchEndSuggestions(v); }}
                  onFind={geocodeEnd}
                  coord={endCoord}
                  loading={endLoading}
                  suggestions={endSuggestions}
                  showSuggestions={showEndSuggestions}
                  onSelect={s => { setEndLabel(s.display_name); setEndCoord({ lat: +s.lat, lng: +s.lon }); setEndSuggestions([]); setShowEndSuggestions(false); }}
                  onHideSuggestions={() => setShowEndSuggestions(false)}
                  placeholder="Ending address or place…"
                  hideGPS
                />
              )}
            </div>
          </div>

          <div className="setup-step">
            <div className="step-header">
              <span className="step-num">3</span>
              <span className="step-label">When</span>
            </div>
            <div className="step-content">
              <div className="setup-row">
                <div className="setup-block">
                  <div className="setup-label">Date</div>
                  <input type="date" className="setup-input" value={planDate} onChange={e => setPlanDate(e.target.value)} />
                </div>
                <div className="setup-block">
                  <div className="setup-label">Start time</div>
                  <TimePicker value={startTimeStr} onChange={setStartTimeStr} />
                </div>
              </div>
            </div>
          </div>

          <div className="setup-step">
            <div className="step-header">
              <span className="step-num">4</span>
              <span className="step-label">How to get there</span>
            </div>
            <div className="step-content">
              <div className="mode-pill">
                {Object.entries(MODES).map(([key, label]) => (
                  <button key={key} type="button" className={travelMode === key ? 'active' : ''} onClick={() => setTravelMode(key)} title={label}>{label.split(' ')[0]}</button>
                ))}
              </div>
              <span className="step-sublabel">Applied per leg unless overridden — short legs auto-suggest walking</span>
            </div>
          </div>

        </div>
      </div>

      {stopItems.length > 0 && (
        <details className="itinerary-details" open={itineraryOpen || !!shareId}
          onToggle={e => setItineraryOpen(e.currentTarget.open)}>
          <summary className="itinerary-details-summary">
            View Itinerary
            {totals && <span className="itinerary-summary-meta">{spotCount} stop{spotCount !== 1 ? 's' : ''} · {formatDuration(totals.totalTime)} total · ends {formatTime(startMins + totals.totalTime)}</span>}
          </summary>
          <div className="itinerary-details-body">
            <div className="receipt">
              <div className="receipt-top">
                <div className="receipt-store">CHICAGO EATS LEDGER</div>
                <div className="receipt-store-sub">Route Itinerary</div>
                <div className="receipt-sub">{receiptDate}</div>
                <div className="receipt-sub">Depart {formatTime(startMins)}</div>
                {impossibleSpots.length > 0 && (
                  <div className="receipt-alert receipt-alert--impossible">
                    <div className="receipt-alert-text">
                      <strong>Can't visit these in time:</strong>
                      <ul className="receipt-impossible-list">
                        {impossibleSpots.map(s => (
                          <li key={s.planItemId}>
                            <strong>{s.name}</strong> — {s.status === 'closed'
                              ? `closes at ${formatTime(s.closeMins)}, needed to arrive by ${formatTime(s.closeMins - s.stayMins)}`
                              : `only ${formatDuration(s.closeMins - s.entryMins)} available, need ${formatDuration(s.stayMins)}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {hasFlexible && (
                      <button className="receipt-reopt-btn" onClick={optimize}>↺ Re-optimize order</button>
                    )}
                  </div>
                )}
                {hasWarnings && impossibleSpots.length === 0 && (
                  <div className="receipt-alert">
                    <span className="receipt-alert-text">⚠ Schedule conflicts{!hasFlexible && ' — see details below'}</span>
                    {hasFlexible && (
                      <button className="receipt-reopt-btn" onClick={optimize}>↺ Re-optimize order</button>
                    )}
                  </div>
                )}
              </div>

              <div className="receipt-rule">- - - - - - - - - - - - - - - - - - - - - -</div>

              {startCoord && (
                <div className="receipt-start">
                  <span className="rcpt-col-label">START</span>
                  <span className="rcpt-col-main">{startLabel || 'Your location'}</span>
                  <span className="rcpt-col-time">{formatTime(startMins)}</span>
                </div>
              )}

              <ul className="receipt-stop-list">
                {stopItems.map((item, i) => {
                  if (item.type === 'placeholder') {
                    return (
                      <li key={item.id} className="receipt-placeholder-item">
                        <div className="placeholder-line">
                          <span className="placeholder-dash">▬</span>
                          <span className="placeholder-receipt-label">{item.label}</span>
                          <span className="placeholder-dur">({formatDuration(item.duration)})</span>
                          <span className="placeholder-times">{formatTime(item.arrivalMins)} – {formatTime(item.departureMins)}</span>
                        </div>
                      </li>
                    );
                  }

                  const visited = visitedIds.has(item.planItemId);
                  return (
                    <li key={item.planItemId} className={`receipt-stop-item${item.status !== 'ok' && item.status !== 'no-hours' ? ' has-warning' : ''}${visited ? ' share-stop--visited' : ''}`}>
                      {(item.travelMins > 0 || i > 0) && (<>
                        <div
                          className={`travel-leg clickable${openLegPicker === item.planItemId ? ' picker-open' : ''}`}
                          onClick={() => toggleLegPicker(item.planItemId)}
                        >
                          <span className="travel-arrow">↓</span>
                          <div className="travel-desc-col">
                            <span className="travel-desc">
                              {MODES[item.legMode].split(' ')[0]} {formatDuration(item.travelMins)} {TRAVEL_LABELS[item.legMode]}
                              {item.dist > 0.05 && ` · ≈${item.dist.toFixed(1)} mi`}
                            </span>
                            {item.travelMins > 0 && (
                              <span className="travel-times">
                                {formatTime(item.arrivalMins - item.travelMins)} → {formatTime(item.arrivalMins)}
                              </span>
                            )}
                          </div>
                          <span className="leg-picker-hint">▿</span>
                        </div>
                        {openLegPicker === item.planItemId && (
                          <div className="leg-mode-picker">
                            {Object.entries(MODES).map(([key, label]) => (
                              <button key={key}
                                className={`leg-mode-btn${item.legMode === key ? ' active' : ''}`}
                                onClick={e => { e.stopPropagation(); setLegMode(item.planItemId, key); setOpenLegPicker(null); }}
                                title={label}>{label.split(' ')[0]}</button>
                            ))}
                            {legModes[item.planItemId] && (
                              <button className="leg-mode-reset" title="Reset to auto"
                                onClick={e => { e.stopPropagation(); resetLegMode(item.planItemId); setOpenLegPicker(null); }}>↺ auto</button>
                            )}
                          </div>
                        )}
                      </>)}
                      {item.gapBefore > 0 && (
                        <div className="receipt-gap-line">— {formatDuration(item.gapBefore)} free —</div>
                      )}
                      <div className="stop-line">
                        {runActive
                          ? <button className={`share-check-btn${visited ? ' checked' : ''}`} onClick={() => toggleVisited(item.planItemId)}>{visited ? '✓' : '○'}</button>
                          : <span className="stop-idx">{i + 1}.</span>
                        }
                        <div className="stop-info">
                          <div className="stop-name-row">
                            <span className="stop-name-line">{item.name}</span>
                            {item.mode === 'fixed' ? <span className="fixed-anchor-badge">⚓ fixed</span> : <span className="fixed-anchor-badge" style={{ opacity: 0.45 }}>~ flex</span>}
                          </div>
                          {item.address && (
                            <div className="stop-addr">
                              {item.address}
                              <a
                                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(item.address)}`}
                                target="_blank" rel="noopener noreferrer"
                                className="stop-nav-link"
                              >↗ Maps</a>
                            </div>
                          )}
                          <div className="stop-timing">
                            {formatTime(item.entryMins)} – {formatTime(item.departureMins)}
                            <span className="stop-stay-note"> ({formatDuration(item.stayMins)} stay{item.waitMins > 0 ? ` + ${formatDuration(item.waitMins)} wait` : ''})</span>
                          </div>
                          <div className={`stop-status-line stop-status-${item.status}`}>
                            {statusIcon(item.status)} {statusLabel(item)}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}

                {returnItem && (
                  <li className="receipt-stop-item">
                    <div
                      className={`travel-leg clickable${openLegPicker === '__return__' ? ' picker-open' : ''}`}
                      onClick={() => toggleLegPicker('__return__')}
                    >
                      <span className="travel-arrow">↓</span>
                      <div className="travel-desc-col">
                        <span className="travel-desc">
                          {MODES[returnItem.legMode].split(' ')[0]} {formatDuration(returnItem.travelMins)} {TRAVEL_LABELS[returnItem.legMode]}
                          {returnItem.dist > 0.05 && ` · ≈${returnItem.dist.toFixed(1)} mi`}
                        </span>
                        {returnItem.travelMins > 0 && (
                          <span className="travel-times">
                            {formatTime(returnItem.arrivalMins - returnItem.travelMins)} → {formatTime(returnItem.arrivalMins)}
                          </span>
                        )}
                      </div>
                      <span className="leg-picker-hint">▿</span>
                    </div>
                    {openLegPicker === '__return__' && (
                      <div className="leg-mode-picker">
                        {Object.entries(MODES).map(([key, label]) => (
                          <button key={key}
                            className={`leg-mode-btn${returnItem.legMode === key ? ' active' : ''}`}
                            onClick={e => { e.stopPropagation(); setLegMode('__return__', key); setOpenLegPicker(null); }}
                            title={label}>{label.split(' ')[0]}</button>
                        ))}
                        {legModes['__return__'] && (
                          <button className="leg-mode-reset" title="Reset to auto"
                            onClick={e => { e.stopPropagation(); resetLegMode('__return__'); setOpenLegPicker(null); }}>↺ auto</button>
                        )}
                      </div>
                    )}
                    <div className="receipt-end-row">
                      <span className="rcpt-col-label">{endSameAsStart ? 'HOME' : 'END'}</span>
                      <span className="rcpt-col-main">{endPointLabel}</span>
                      <span className="rcpt-col-time">{formatTime(returnItem.arrivalMins)}</span>
                    </div>
                  </li>
                )}
              </ul>

              <div className="receipt-rule">- - - - - - - - - - - - - - - - - - - - - -</div>

              {totals && (
                <div className="receipt-totals">
                  <div className="rcpt-total-row"><span>STOPS</span><span>{spotCount}</span></div>
                  <div className="rcpt-total-row"><span>TRAVEL TIME</span><span>{formatDuration(totals.totalTravel)}</span></div>
                  {Object.keys(totals.byMode).length > 1 && (
                    <div className="rcpt-mode-breakdown">
                      {Object.entries(totals.byMode).map(([mode, mins]) => (
                        <span key={mode}>{MODES[mode].split(' ')[0]} {formatDuration(mins)}</span>
                      ))}
                    </div>
                  )}
                  <div className="rcpt-total-row"><span>TIME AT SPOTS</span><span>{formatDuration(totals.totalStay)}</span></div>
                  {totals.totalPlaceholder > 0 && <div className="rcpt-total-row"><span>BREAKS / OTHER</span><span>{formatDuration(totals.totalPlaceholder)}</span></div>}
                  {totals.totalGap > 0 && <div className="rcpt-total-row"><span>FREE TIME</span><span>{formatDuration(totals.totalGap)}</span></div>}
                  <div className="receipt-rule">- - - - - - - - - - - - - - - - - - - - - -</div>
                  <div className="rcpt-total-row grand-total"><span>TOTAL TRIP</span><span>{formatDuration(totals.totalTime)}</span></div>
                  <div className="rcpt-total-row">
                    <span>{returnItem ? homeByLabel : 'TRIP ENDS'}</span>
                    <span>{formatTime(startMins + totals.totalTime)}</span>
                  </div>
                </div>
              )}

              <div className="receipt-footer-rule">═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═</div>
              <div className="receipt-action-row">
                <button className="receipt-action-btn navigate" onClick={openInGoogleMaps}>
                  🗺 Navigate
                </button>
                <button className="receipt-action-btn download" onClick={downloadPlan}>
                  ⬇ Download Plan
                </button>
              </div>
              <div className="receipt-footer-text">chicago eats ledger · plan your city</div>
              <div className="receipt-footnote">≈ distances are straight-line estimates</div>
              {shareId && <div className="receipt-plan-id">plan #{shareId}</div>}
            </div>
          </div>
        </details>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
