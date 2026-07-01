import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const RATING_COLOR = (r) => {
  if (r == null) return '#888';
  if (r >= 9) return '#2d7a3a';
  if (r >= 7) return '#5b8c2a';
  if (r >= 5) return '#b07d1a';
  return '#b03a2a';
};

export default function MapView({ spots, onSpotClick, starredIds = new Set(), toggleStar }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]); // [{spot, marker}]
  const hasFitBounds = useRef(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current, {
      center: [41.8781, -87.6298],
      zoom: 12,
      zoomControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapRef.current);
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach(({ marker }) => marker.remove());
    markersRef.current = [];

    const validSpots = spots.filter(s => s.lat != null && s.lng != null);
    validSpots.forEach(spot => {
      const starred = starredIds.has(spot.id);
      const color = starred ? '#a98a3a' : RATING_COLOR(spot.ownerRating);
      const border = starred ? '2.5px solid #f2ead9' : '2px solid white';
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:${starred ? 34 : 28}px;height:${starred ? 34 : 28}px;border-radius:50%;
          background:${color};border:${border};
          box-shadow:0 1px 6px rgba(0,0,0,0.4);
          display:flex;align-items:center;justify-content:center;
          color:white;font-size:${starred ? 11 : 10}px;font-weight:700;font-family:monospace;
          cursor:pointer;
        ">${starred ? '★' : (spot.ownerRating != null ? spot.ownerRating : '?')}</div>`,
        iconSize: [starred ? 34 : 28, starred ? 34 : 28],
        iconAnchor: [starred ? 17 : 14, starred ? 17 : 14],
      });

      const marker = L.marker([spot.lat, spot.lng], { icon })
        .addTo(mapRef.current)
        .bindPopup(`
          <div style="min-width:160px;font-family:sans-serif">
            <strong style="font-size:0.95rem">${spot.name}</strong><br/>
            <span style="color:#666;font-size:0.8rem">${spot.neighborhood}</span>
            ${spot.category ? `<br/><span style="font-size:0.78rem;color:#8b5a2b">${spot.category}</span>` : ''}
            ${spot.ownerRating != null ? `<br/><span style="font-size:0.82rem">⭐ ${spot.ownerRating}/10</span>` : ''}
            ${spot.address ? `<br/><span style="font-size:0.78rem;color:#666">${spot.address}</span>` : ''}
            <br/>
            <div style="display:flex;gap:6px;margin-top:8px">
              <button onclick="window.__mapSpotClick('${spot.id}')" style="
                flex:1;padding:5px 8px;background:#2a2420;color:white;
                border:none;border-radius:6px;font-size:0.8rem;cursor:pointer;
              ">View details</button>
              <button id="map-star-${spot.id}" onclick="window.__mapStarToggle('${spot.id}')" style="
                padding:5px 10px;border:1px solid #ccc;border-radius:6px;
                font-size:0.85rem;cursor:pointer;background:white;
              ">${starredIds.has(spot.id) ? '★' : '☆'}</button>
            </div>
          </div>
        `, { maxWidth: 220 });

      marker.on('popupopen', () => {
        const btn = document.getElementById(`map-star-${spot.id}`);
        if (btn) {
          const starred = window.__mapStarredIds?.has(spot.id);
          btn.textContent = starred ? '★' : '☆';
          btn.style.background = starred ? '#2a2420' : 'white';
          btn.style.color = starred ? 'white' : 'inherit';
        }
      });

      markersRef.current.push({ spot, marker });
    });

    if (validSpots.length > 0 && !hasFitBounds.current) {
      const group = L.featureGroup(markersRef.current.map(m => m.marker));
      mapRef.current.fitBounds(group.getBounds().pad(0.1));
      hasFitBounds.current = true;
    }
  }, [spots, starredIds]);

  useEffect(() => {
    window.__mapSpotClick = (id) => {
      if (onSpotClick) onSpotClick(id);
      mapRef.current?.closePopup();
    };
    return () => { delete window.__mapSpotClick; };
  }, [onSpotClick]);

  useEffect(() => {
    window.__mapStarredIds = starredIds;
    window.__mapStarToggle = (id) => {
      if (toggleStar) toggleStar(id);
      // update button immediately without waiting for re-render
      setTimeout(() => {
        const btn = document.getElementById(`map-star-${id}`);
        if (btn) {
          const starred = window.__mapStarredIds?.has(id);
          btn.textContent = starred ? '★' : '☆';
          btn.style.background = starred ? '#2a2420' : 'white';
          btn.style.color = starred ? 'white' : 'inherit';
        }
      }, 0);
    };
    return () => { delete window.__mapStarToggle; delete window.__mapStarredIds; };
  }, [starredIds, toggleStar]);

  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 100);
    return () => clearTimeout(t);
  });

  const handleSearch = (e) => {
    const q = e.target.value;
    setQuery(q);
    if (!q.trim()) { setResults([]); setShowResults(false); return; }
    const lower = q.toLowerCase();
    const matches = spots.filter(s =>
      s.lat != null &&
      [s.name, s.neighborhood, s.address, s.category, ...(s.tags || [])].some(f => f?.toLowerCase().includes(lower))
    ).slice(0, 8);
    setResults(matches);
    setShowResults(true);
  };

  const selectResult = (spot) => {
    setQuery(spot.name);
    setShowResults(false);
    if (!mapRef.current) return;
    mapRef.current.setView([spot.lat, spot.lng], 16, { animate: true });
    const entry = markersRef.current.find(m => m.spot.id === spot.id);
    if (entry) entry.marker.openPopup();
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Search overlay */}
      <div style={{
        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
        zIndex: 1000, width: 'min(90%, 360px)',
      }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={query}
            onChange={handleSearch}
            onFocus={() => query && setShowResults(true)}
            placeholder="Search restaurants on map…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 36px 10px 14px',
              borderRadius: 10, border: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              fontSize: '0.9rem', outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults([]); setShowResults(false); }} style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '1rem', color: '#888', lineHeight: 1,
            }}>×</button>
          )}
        </div>

        {showResults && results.length > 0 && (
          <div style={{
            marginTop: 4, background: 'white', borderRadius: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)', overflow: 'hidden',
          }}>
            {results.map(spot => (
              <button
                key={spot.id}
                onClick={() => selectResult(spot)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '10px 14px', border: 'none', background: 'none',
                  cursor: 'pointer', borderBottom: '1px solid rgba(0,0,0,0.06)',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f0eb'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{spot.name}</div>
                <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 1 }}>
                  {spot.neighborhood}{spot.category ? ` · ${spot.category}` : ''}
                </div>
              </button>
            ))}
          </div>
        )}

        {showResults && query && results.length === 0 && (
          <div style={{
            marginTop: 4, background: 'white', borderRadius: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            padding: '10px 14px', fontSize: '0.85rem', color: '#888',
          }}>
            No spots found
          </div>
        )}
      </div>

      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 400 }} />
    </div>
  );
}
