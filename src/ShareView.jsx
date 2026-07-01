import { useEffect, useMemo, useState } from 'react';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const TRAVEL_SPEEDS = { driving: 0.25, walking: 0.05, bus: 0.133, train: 0.30 };
const MODES = { driving: '🚗 Drive', walking: '🚶 Walk', bus: '🚌 Bus', train: '🚇 Train' };
const TRAVEL_LABELS = { driving: 'drive', walking: 'walk', bus: 'by bus', train: 'by train' };

const haversine = (lat1, lng1, lat2, lng2) => {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

const formatTime = (mins) => {
  const total = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
};

const formatDuration = (mins) =>
  mins < 60 ? `${mins} min` : mins % 60 === 0 ? `${mins / 60}h` : `${Math.floor(mins / 60)}h ${mins % 60}m`;

const resolveLegMode = (dist, travelMode) => {
  if (dist < 0.5) return 'walking';
  if (dist >= 3) return ['bus', 'train'].includes(travelMode) ? travelMode : 'driving';
  return travelMode;
};

const scheduleItems = (startCoord, startMins, planItems, spots, travelMode, dayOfWeek, endCoord) => {
  const spotById = Object.fromEntries(spots.map(s => [s.id, s]));
  const result = [];
  let currentCoord = startCoord || null;
  let currentTime = startMins;

  for (const item of planItems) {
    if (item.type === 'placeholder') {
      const dur = Math.max(1, Number(item.duration) || 30);
      result.push({
        type: 'placeholder', id: item.id, label: item.label || 'Break',
        duration: dur, travelMins: 0,
        arrivalMins: currentTime, entryMins: currentTime, departureMins: currentTime + dur,
      });
      currentTime += dur;
      continue;
    }

    const spot = spotById[item.spotId];
    if (!spot) continue;

    const dist = spot.lat != null && currentCoord
      ? haversine(currentCoord.lat, currentCoord.lng, spot.lat, spot.lng) : 0;
    const legMode = resolveLegMode(dist, travelMode);
    const travelMins = Math.max(0, Math.round(dist / TRAVEL_SPEEDS[legMode]));
    const earliestArrival = currentTime + travelMins;
    const stayMins = Math.max(1, Number(item.duration) || 60);
    const fixedMins = item.mode === 'fixed' && item.fixedTime ? hhmm24ToMins(item.fixedTime) : null;

    let gapBefore = 0, isLateForFixed = false;
    if (fixedMins != null) {
      if (earliestArrival <= fixedMins) gapBefore = fixedMins - earliestArrival;
      else isLateForFixed = true;
    }
    const scheduledEntry = fixedMins != null && !isLateForFixed ? fixedMins : earliestArrival;

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
      travelMins, dist, gapBefore, arrivalMins: earliestArrival, entryMins, departureMins,
      stayMins, waitMins, status, openMins, closeMins, isLateForFixed, legMode,
    });

    if (spot.lat != null) currentCoord = { lat: spot.lat, lng: spot.lng };
    currentTime = departureMins;
  }

  if (endCoord && currentCoord && result.length > 0) {
    const dist = haversine(currentCoord.lat, currentCoord.lng, endCoord.lat, endCoord.lng);
    const legMode = resolveLegMode(dist, travelMode);
    const travelMins = Math.max(0, Math.round(dist / TRAVEL_SPEEDS[legMode]));
    result.push({ type: 'return', travelMins, dist, arrivalMins: currentTime + travelMins, legMode });
  }

  return result;
};

const statusIcon = (s) => ({ ok: '✓', 'no-hours': '', 'not-open-yet': '⏳', 'closes-early': '⚠', closed: '✕', 'late-for-fixed': '⚠' }[s] ?? '');

const statusLabel = (item) => {
  if (item.status === 'ok') return item.openMins != null ? `Open · closes ${formatTime(item.closeMins)}` : 'Hours not listed';
  if (item.status === 'no-hours') return 'Hours not listed — call ahead';
  if (item.status === 'not-open-yet') return `Opens at ${formatTime(item.openMins)} — waiting ${formatDuration(item.waitMins)}`;
  if (item.status === 'closes-early') return `Closes at ${formatTime(item.closeMins)} — only ${formatDuration(item.closeMins - item.entryMins)} of your ${formatDuration(item.stayMins)} stay fits`;
  if (item.status === 'closed') return `Closed — opens ${formatTime(item.openMins)}`;
  if (item.status === 'late-for-fixed') return `Late for fixed time (${formatTime(item.fixedMins)})`;
  return '';
};

export default function ShareView({ planId }) {
  const [plan, setPlan] = useState(null);
  const [spots, setSpots] = useState([]);
  const [error, setError] = useState(null);
  const [visitedIds, setVisitedIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`run-visited-${planId}`) || '[]')); }
    catch { return new Set(); }
  });
  const [runActive, setRunActive] = useState(() =>
    localStorage.getItem(`run-active-${planId}`) === 'true'
  );

  useEffect(() => {
    Promise.all([
      fetch(`/api/plans/${planId}`).then(r => r.ok ? r.json() : Promise.reject('not found')),
      fetch('/api/spots').then(r => r.json()),
    ]).then(([p, s]) => { setPlan(p); setSpots(s); })
      .catch(() => setError('Plan not found or has expired.'));
  }, [planId]);

  const toggleVisited = (id) => {
    setVisitedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem(`run-visited-${planId}`, JSON.stringify([...next]));
      return next;
    });
  };

  const startRun = () => {
    setRunActive(true);
    localStorage.setItem(`run-active-${planId}`, 'true');
  };

  const resetRun = () => {
    setRunActive(false);
    setVisitedIds(new Set());
    localStorage.removeItem(`run-active-${planId}`);
    localStorage.removeItem(`run-visited-${planId}`);
  };

  const scheduled = useMemo(() => {
    if (!plan || !spots.length) return [];
    const startCoord = plan.startLat != null ? { lat: plan.startLat, lng: plan.startLng } : null;
    const endCoord = !plan.endSameAsStart && plan.endLat != null ? { lat: plan.endLat, lng: plan.endLng } : startCoord;
    const planDate = plan.planDate || new Date().toISOString().slice(0, 10);
    const dayOfWeek = DAYS[new Date(planDate + 'T12:00:00').getDay()];
    return scheduleItems(startCoord, plan.startTimeMinutes ?? 720, plan.planItems ?? [], spots, plan.travelMode || 'driving', dayOfWeek, endCoord);
  }, [plan, spots]);

  const stopItems = scheduled.filter(i => i.type !== 'return');
  const returnItem = scheduled.find(i => i.type === 'return');
  const spotItems = stopItems.filter(i => i.type === 'spot');
  const startMins = plan?.startTimeMinutes ?? 720;

  const totals = useMemo(() => {
    if (!scheduled.length) return null;
    let totalTravel = 0, totalStay = 0, totalGap = 0, totalPlaceholder = 0;
    for (const item of scheduled) {
      if (item.type === 'spot') { totalTravel += item.travelMins; totalStay += item.stayMins; totalGap += item.gapBefore; }
      if (item.type === 'placeholder') totalPlaceholder += item.duration;
      if (item.type === 'return') totalTravel += item.travelMins;
    }
    const totalTime = totalTravel + totalStay + totalGap + totalPlaceholder;
    return { totalTravel, totalStay, totalGap, totalPlaceholder, totalTime };
  }, [scheduled]);

  const visitedCount = spotItems.filter(i => visitedIds.has(i.planItemId)).length;
  const allDone = spotItems.length > 0 && visitedCount === spotItems.length;

  if (error) return (
    <div className="ledger-shell" style={{ textAlign: 'center', paddingTop: 60 }}>
      <p style={{ fontSize: '1.1rem', opacity: 0.6 }}>{error}</p>
      <a href="/" style={{ color: 'var(--red)', fontSize: '0.9rem' }}>← Back to Chicago Eats Ledger</a>
    </div>
  );

  if (!plan) return (
    <div className="ledger-shell" style={{ textAlign: 'center', paddingTop: 60 }}>
      <p style={{ opacity: 0.5 }}>Loading plan…</p>
    </div>
  );

  const dateLabel = plan.planDate
    ? new Date(plan.planDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : null;

  return (
    <div className="ledger-shell">
      <header className="ledger-header">
        <div>
          <h1>Chicago Eats Ledger</h1>
          <p>Shared Food Run · {dateLabel}</p>
        </div>
        <a href="/" className="owner-btn" style={{ textDecoration: 'none' }}>← Full Ledger</a>
      </header>

      {/* Run mode bar */}
      {!runActive ? (
        <div className="share-run-bar">
          <span className="share-run-hint">{spotItems.length} stop{spotItems.length !== 1 ? 's' : ''} · {totals ? formatDuration(totals.totalTime) : '—'} total</span>
          <button className="share-start-btn" onClick={startRun}>▶ Start Run</button>
        </div>
      ) : (
        <div className="share-run-bar share-run-bar--active">
          <span className="share-run-hint">
            {allDone ? '🎉 All done!' : `${visitedCount} / ${spotItems.length} visited`}
          </span>
          <button className="share-reset-btn" onClick={resetRun}>Reset</button>
        </div>
      )}

      <div className="receipt share-receipt">
        <div className="receipt-top">
          <div className="receipt-store">CHICAGO EATS LEDGER</div>
          <div className="receipt-store-sub">shared food run</div>
          {dateLabel && <div className="receipt-sub">{dateLabel}</div>}
        </div>

        <div className="receipt-rule">- - - - - - - - - - - - - - - - - - - - - -</div>

        {plan.startLabel && (
          <div className="rcpt-start-row">
            <span className="rcpt-col-label">START</span>
            <span className="rcpt-col-main">{plan.startLabel}</span>
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
            const spot = spots.find(s => s.id === item.spotId);

            return (
              <li key={item.planItemId}
                className={`receipt-stop-item share-stop${item.status !== 'ok' && item.status !== 'no-hours' ? ' has-warning' : ''}${visited ? ' share-stop--visited' : ''}`}>
                {item.travelMins > 0 && (
                  <div className="travel-leg">
                    <span className="travel-arrow">↓</span>
                    <span className="travel-desc">
                      {MODES[item.legMode].split(' ')[0]} {formatDuration(item.travelMins)} {TRAVEL_LABELS[item.legMode]}
                      {item.dist > 0.05 && ` · ≈${item.dist.toFixed(1)} mi`}
                    </span>
                  </div>
                )}
                {item.gapBefore > 0 && (
                  <div className="receipt-gap-line">— {formatDuration(item.gapBefore)} free —</div>
                )}
                <div className="stop-line">
                  {runActive && (
                    <button
                      className={`share-check-btn${visited ? ' checked' : ''}`}
                      onClick={() => toggleVisited(item.planItemId)}
                      title={visited ? 'Mark unvisited' : 'Mark visited'}
                    >{visited ? '✓' : '○'}</button>
                  )}
                  {!runActive && <span className="stop-idx">{i + 1}.</span>}
                  <div className="stop-info">
                    <div className="stop-name-row">
                      <span className="stop-name-line">{item.name}</span>
                    </div>
                    {item.address && <div className="stop-addr">{item.address}</div>}
                    <div className="stop-timing">
                      {formatTime(item.entryMins)} – {formatTime(item.departureMins)}
                      <span className="stop-stay-note"> ({formatDuration(item.stayMins)} stay{item.waitMins > 0 ? ` + ${formatDuration(item.waitMins)} wait` : ''})</span>
                    </div>
                    <div className={`stop-status-line stop-status-${item.status}`}>
                      {statusIcon(item.status)} {statusLabel(item)}
                    </div>
                    {spot?.ownerNote && (
                      <div className="share-owner-note">"{spot.ownerNote}"</div>
                    )}
                    {spot?.orderDishes?.length > 0 && (
                      <div className="share-dishes">
                        <span className="share-dish-label">Order: </span>
                        {spot.orderDishes.map((d, i) => <span key={i} className="dish-chip order">{d}</span>)}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}

          {returnItem && (
            <li className="receipt-stop-item">
              <div className="travel-leg">
                <span className="travel-arrow">↓</span>
                <span className="travel-desc">
                  {MODES[returnItem.legMode].split(' ')[0]} {formatDuration(returnItem.travelMins)} {TRAVEL_LABELS[returnItem.legMode]}
                  {returnItem.dist > 0.05 && ` · ≈${returnItem.dist.toFixed(1)} mi`}
                </span>
              </div>
              <div className="receipt-end-row">
                <span className="rcpt-col-label">{plan.endSameAsStart ? 'HOME' : 'END'}</span>
                <span className="rcpt-col-main">{plan.endSameAsStart ? (plan.startLabel || 'Starting point') : (plan.endLabel || 'End point')}</span>
                <span className="rcpt-col-time">{formatTime(returnItem.arrivalMins)}</span>
              </div>
            </li>
          )}
        </ul>

        {totals && (
          <>
            <div className="receipt-rule">- - - - - - - - - - - - - - - - - - - - - -</div>
            <div className="receipt-totals">
              <div className="rcpt-total-row"><span>STOPS</span><span>{spotItems.length}</span></div>
              <div className="rcpt-total-row"><span>TRAVEL TIME</span><span>{formatDuration(totals.totalTravel)}</span></div>
              <div className="rcpt-total-row"><span>TIME AT SPOTS</span><span>{formatDuration(totals.totalStay)}</span></div>
              {totals.totalGap > 0 && <div className="rcpt-total-row"><span>FREE TIME</span><span>{formatDuration(totals.totalGap)}</span></div>}
              <div className="receipt-rule">- - - - - - - - - - - - - - - - - - - - - -</div>
              <div className="rcpt-total-row grand-total"><span>TOTAL TRIP</span><span>{formatDuration(totals.totalTime)}</span></div>
              <div className="rcpt-total-row">
                <span>{returnItem ? (plan.endSameAsStart ? 'HOME BY' : 'ARRIVE AT') : 'TRIP ENDS'}</span>
                <span>{formatTime(startMins + totals.totalTime)}</span>
              </div>
            </div>
          </>
        )}

        <div className="receipt-footer-rule">═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═</div>
        <div className="receipt-footer-text">chicago eats ledger · plan your city</div>
        <div className="receipt-plan-id">plan #{planId}</div>
      </div>
    </div>
  );
}
