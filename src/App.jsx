import { useEffect, useMemo, useRef, useState } from 'react';
import PlanRoute from './PlanRoute.jsx';
import MapView from './MapView.jsx';


function BackToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!visible) return null;
  return (
    <button className="back-to-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top">
      ↑
    </button>
  );
}

const mkId = () => Math.random().toString(36).slice(2, 8);

const CATEGORIES = ['Restaurant', 'Bar', 'Bakery', 'Coffee & Tea', 'Ice Cream & Dessert'];
const BEST_FOR = ['Date night', 'Solo', 'Group', 'Family', 'Late night', 'Outdoor seating', 'Quick bite', 'Business lunch', 'Special occasion'];

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const INITIAL_HOURS = { sunday: '', monday: '', tuesday: '', wednesday: '', thursday: '', friday: '', saturday: '' };

const INITIAL_FORM = {
  name: '', neighborhood: '', address: '', tags: [],
  category: '',
  bestFor: [],
  phone: '', website: '', reservationUrl: '',
  ownerNote: '', substackUrl: '', ownerRating: '', photoUrl: '',
  price: '',
  lastVisited: '',
  visitType: '',
  orderDishes: [],
  skipDishes: [],
  hours: { ...INITIAL_HOURS },
};

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const fmtLastVisited = (val) => {
  if (!val) return '';
  // YYYY-MM from <input type="month">
  const iso = val.match(/^(\d{4})-(\d{2})$/);
  if (iso) {
    const name = MONTH_NAMES[parseInt(iso[2], 10) - 1];
    return name ? `${name} ${iso[1]}` : val;
  }
  // M/D/YYYY or M/YYYY fallback (Safari / legacy stored values)
  const mdy = val.match(/^(\d{1,2})(?:\/\d{1,2})?\/(\d{4})$/);
  if (mdy) {
    const name = MONTH_NAMES[parseInt(mdy[1], 10) - 1];
    return name ? `${name} ${mdy[2]}` : val;
  }
  return val;
};

const normalizeTimeToken = (t) => {
  t = t.trim();
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!m) return t;
  const h = m[1];
  const min = m[2] || '00';
  const period = m[3].toUpperCase();
  return `${h}:${min} ${period}`;
};

const normalizeHoursStr = (s) => {
  if (!s?.trim()) return s;
  const parts = s.trim().split(/\s*[–\-]\s*/);
  if (parts.length !== 2) return s;
  return `${normalizeTimeToken(parts[0])} – ${normalizeTimeToken(parts[1])}`;
};

const parseTimeStr = (s) => {
  const m = s.trim().match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const p = m[3].toUpperCase();
  if (p === 'PM' && h !== 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return h * 60 + min;
};

const checkOpenNow = (spot) => {
  const today = DAYS[new Date().getDay()];
  const hoursStr = spot.hours?.[today];
  if (!hoursStr) return false;
  const parts = hoursStr.split(/\s*[–\-]\s*/);
  if (parts.length !== 2) return false;
  let open = parseTimeStr(parts[0]);
  let close = parseTimeStr(parts[1]);
  if (open === null || close === null) return false;
  if (close <= open) close += 1440; // midnight-crossing: treat close as next-day
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return (nowMins >= open && nowMins < close) ||
         (nowMins + 1440 >= open && nowMins + 1440 < close);
};

const haversine = (lat1, lng1, lat2, lng2) => {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const COMMUNITY_THRESHOLD = 1;

const communityAvg = (reviews) => {
  if (!reviews?.length) return null;
  return reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
};

function App() {
  const [activeTab, setActiveTab] = useState(() =>
    new URLSearchParams(window.location.search).has('plan') ? 'plan' : 'ledger'
  );
  const [largeText, setLargeText] = useState(() => {
    const stored = localStorage.getItem('largeText');
    return stored !== null ? stored === '1' : true; // default ON
  });
  useEffect(() => {
    document.documentElement.classList.toggle('large-text', largeText);
    localStorage.setItem('largeText', largeText ? '1' : '0');
  }, [largeText]);

  const [starredIds, setStarredIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('starredSpots') || '[]')); }
    catch { return new Set(); }
  });

  const [planItems, setPlanItems] = useState(() => {
    try {
      const saved = localStorage.getItem('planItems');
      if (saved) return JSON.parse(saved);
      const starred = new Set(JSON.parse(localStorage.getItem('starredSpots') || '[]'));
      return [...starred].map(id => ({ id: mkId(), type: 'spot', spotId: id, mode: 'flexible', duration: 60 }));
    } catch { return []; }
  });
  useEffect(() => {
    localStorage.setItem('planItems', JSON.stringify(planItems));
  }, [planItems]);

  const toggleStar = (id) => {
    setStarredIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setPlanItems(pi => pi.filter(i => !(i.type === 'spot' && i.spotId === id)));
      } else {
        next.add(id);
        setPlanItems(pi => {
          if (pi.some(i => i.type === 'spot' && i.spotId === id)) return pi;
          return [...pi, { id: mkId(), type: 'spot', spotId: id, mode: 'flexible', duration: 60 }];
        });
      }
      localStorage.setItem('starredSpots', JSON.stringify([...next]));
      return next;
    });
  };
  const [ownerKey, setOwnerKey] = useState(() => localStorage.getItem('ownerKey') || '');
  const isOwner = !!ownerKey;
  const isOwnerMode = useMemo(() => new URLSearchParams(window.location.search).has('owner'), []);

  const [hasSeenTripHint, setHasSeenTripHint] = useState(() => localStorage.getItem('seenTripHint') === '1');
  const dismissTripHint = () => { setHasSeenTripHint(true); localStorage.setItem('seenTripHint', '1'); };

  const browserId = (() => {
    let id = localStorage.getItem('browserId');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('browserId', id); }
    return id;
  })();
  const [showPasscode, setShowPasscode] = useState(false);
  const [passcodeValue, setPasscodeValue] = useState('');

  const authHeaders = ownerKey
    ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerKey}` }
    : { 'Content-Type': 'application/json' };

  const [spots, setSpots] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [viewMode, setViewMode] = useState('neighborhood');
  const [collapsedAreas, setCollapsedAreas] = useState({});
  const [showFilters, setShowFilters] = useState(false);

  const [openNowFilter, setOpenNowFilter] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedNeighborhood, setSelectedNeighborhood] = useState('');
  const [selectedPrice, setSelectedPrice] = useState('');
  const [selectedBestFor, setSelectedBestFor] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [mapJumpName, setMapJumpName] = useState('');
  const [expandedReviewForms, setExpandedReviewForms] = useState(new Set());
  const [tagInput, setTagInput] = useState('');
  const [dishInputs, setDishInputs] = useState({ order: '', skip: '' });

  const [editingCardId, setEditingCardId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [editTagInput, setEditTagInput] = useState('');
  const [editDishInputs, setEditDishInputs] = useState({ order: '', skip: '' });

  const [userLocation, setUserLocation] = useState(null);
  const [locationInput, setLocationInput] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('');
  const [photoPreviewBroken, setPhotoPreviewBroken] = useState(false);
  const photoDebounceRef = useRef(null);
  const editingCardRef = useRef(null);

  const [showCuisineDropdown, setShowCuisineDropdown] = useState(false);
  const [cuisineSearch, setCuisineSearch] = useState('');
  const cuisineDropdownRef = useRef(null);

  const [reviewDrafts, setReviewDrafts] = useState({});
  const [expandedReviews, setExpandedReviews] = useState(new Set());
  const [reviewSorts, setReviewSorts] = useState({});
  const [pendingDeleteReview, setPendingDeleteReview] = useState(null);
  const [brokenPhotos, setBrokenPhotos] = useState(new Set());
  const [toast, setToast] = useState('');

  const showToast = (msg) => { setToast(msg); window.setTimeout(() => setToast(''), 2500); };

  const deleteReview = async (spotId, createdAt) => {
    try {
      const res = await fetch(`/api/spots/${spotId}/review`, {
        method: 'DELETE',
        headers: authHeaders,
        body: JSON.stringify({ createdAt }),
      });
      const updated = await res.json();
      setSpots(prev => prev.map(s => s.id === spotId ? updated : s));
      setPendingDeleteReview(null);
      showToast('Review removed.');
    } catch { showToast('Unable to remove review.'); }
  };

  const toggleReviews = (spotId) => setExpandedReviews(prev => {
    const next = new Set(prev);
    next.has(spotId) ? next.delete(spotId) : next.add(spotId);
    return next;
  });

  const handleLogin = async () => {
    const key = passcodeValue.trim();
    if (!key) return;
    try {
      const res = await fetch('/api/owner/verify', {
        headers: { 'Authorization': `Bearer ${key}` },
      });
      if (res.ok) {
        setOwnerKey(key);
        localStorage.setItem('ownerKey', key);
        setShowPasscode(false);
        setPasscodeValue('');
        showToast('Owner mode on.');
      } else {
        showToast('Wrong key.');
      }
    } catch {
      showToast('Could not verify key.');
    }
  };

  const handleLogout = () => {
    setOwnerKey('');
    localStorage.removeItem('ownerKey');
    showToast('Owner mode off.');
  };

  useEffect(() => {
    fetch('/api/spots')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => setSpots(data))
      .catch(() => setLoadError(true))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!showCuisineDropdown) return;
    const handler = (e) => {
      if (cuisineDropdownRef.current && !cuisineDropdownRef.current.contains(e.target))
        setShowCuisineDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCuisineDropdown]);

  const fetchSuggestions = (query) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`);
        const data = await res.json();
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch { setSuggestions([]); }
    }, 350);
  };

  const selectSuggestion = (s) => {
    setLocationInput(s.display_name);
    setUserLocation({ lat: parseFloat(s.lat), lng: parseFloat(s.lon) });
    setViewMode('nearest');
    setSuggestions([]);
    setShowSuggestions(false);
    showToast('Location set.');
  };

  const useGPS = (onSuccess) => {
    if (!navigator.geolocation) return showToast('Geolocation not supported.');
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        showToast('Location set.');
        onSuccess?.();
      },
      () => showToast('Could not access GPS.')
    );
  };

  const geocodeInput = async () => {
    if (!locationInput.trim()) return;
    setLocationLoading(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationInput)}&format=json&limit=1`);
      const data = await res.json();
      if (data.length > 0) {
        setUserLocation({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
        setViewMode('nearest');
        showToast('Location set.');
      } else {
        showToast('Address not found.');
      }
    } catch { showToast('Could not find location.'); }
    finally { setLocationLoading(false); }
  };

  const allTags = useMemo(() => [...new Set(spots.flatMap(s => s.tags || []).filter(Boolean))].sort(), [spots]);
  const allNeighborhoods = useMemo(() => [...new Set(spots.map(s => s.neighborhood).filter(Boolean))].sort(), [spots]);
  // All dishes across all spots, deduplicated case-insensitively (canonical casing = first seen)
  const normalizeDish = (val) => val.replace(/\b\w/g, c => c.toUpperCase());

  const hasFiltersActive = openNowFilter || selectedTags.length > 0 || selectedCategory || selectedNeighborhood || selectedPrice || selectedBestFor.length > 0 || searchQuery.trim();
  const clearAllFilters = () => {
    setOpenNowFilter(false);
    setSelectedTags([]);
    setSelectedCategory('');
    setSelectedNeighborhood('');
    setSelectedPrice('');
    setSelectedBestFor([]);
    setSearchQuery('');
  };
  const activeFilterSummary = [
    ...selectedTags,
    selectedCategory,
    selectedNeighborhood,
    selectedPrice,
    ...selectedBestFor,
    openNowFilter ? 'Open now' : '',
  ].filter(Boolean).join(', ');

  const filteredSpots = useMemo(() => {
    let result = [...spots];
    if (openNowFilter) result = result.filter(checkOpenNow);
    if (selectedCategory) result = result.filter(s => s.category === selectedCategory);
    if (selectedTags.length > 0) result = result.filter(s => selectedTags.some(t => (s.tags || []).includes(t)));
    if (selectedNeighborhood) result = result.filter(s => s.neighborhood === selectedNeighborhood);
    if (selectedPrice) result = result.filter(s => s.price === selectedPrice);
    if (selectedBestFor.length > 0) result = result.filter(s => selectedBestFor.some(b => (s.bestFor || []).includes(b)));
    const q = searchQuery.trim().toLowerCase();
    if (q) result = result.filter(s =>
      [s.name, s.neighborhood, s.address, s.category, ...(s.tags || []), ...(s.orderDishes || []), ...(s.skipDishes || [])].some(f => f?.toLowerCase().includes(q))
    );
    return result;
  }, [spots, openNowFilter, selectedCategory, selectedTags, selectedNeighborhood, selectedPrice, selectedBestFor, searchQuery]);

  const sortedSpots = useMemo(() => {
    const result = [...filteredSpots];
    if (viewMode === 'newest') return result.sort((a, b) => b.createdAt - a.createdAt);
    if (viewMode === 'nearest' && userLocation) {
      return result.sort((a, b) => {
        const aD = a.lat != null ? haversine(userLocation.lat, userLocation.lng, a.lat, a.lng) : Infinity;
        const bD = b.lat != null ? haversine(userLocation.lat, userLocation.lng, b.lat, b.lng) : Infinity;
        return aD - bD;
      });
    }
    // "Top rated" sorts by Vincent's Rating (ownerRating) — editorial-driven site,
    // community average is frequently N/A and is not the primary curation signal.
    return result.sort((a, b) => {
      const aR = a.ownerRating ?? -1;
      const bR = b.ownerRating ?? -1;
      return bR - aR;
    });
  }, [filteredSpots, viewMode, userLocation]);


  const neighborhoodGroups = useMemo(() => {
    if (viewMode !== 'neighborhood') return null;
    const groups = {};
    sortedSpots.forEach(spot => {
      const n = spot.neighborhood || 'Other';
      if (!groups[n]) groups[n] = [];
      groups[n].push(spot);
    });
    return groups;
  }, [sortedSpots, viewMode]);

  const toggleTag = (tag) =>
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleHoursChange = (day) => (e) => setForm(prev => ({ ...prev, hours: { ...prev.hours, [day]: e.target.value } }));

  const addDish = (listKey, inputKey) => {
    const val = normalizeDish(dishInputs[inputKey].trim());
    if (!val) return;
    setForm(prev => ({ ...prev, [listKey]: [...prev[listKey], val] }));
    setDishInputs(prev => ({ ...prev, [inputKey]: '' }));
  };
  const removeDish = (listKey, idx) =>
    setForm(prev => ({ ...prev, [listKey]: prev[listKey].filter((_, i) => i !== idx) }));

  const updateDraft = (spotId, field, value) =>
    setReviewDrafts(prev => ({ ...prev, [spotId]: { rating: 10, comment: '', ...prev[spotId], [field]: value } }));

  const postSpot = async (e) => {
    e.preventDefault();
    // Flush any tag typed but not yet committed
    const finalTags = tagInput.trim() && !form.tags.includes(tagInput.trim())
      ? [...form.tags, tagInput.trim()] : form.tags;
    if (!isOwner || !form.name.trim() || !form.neighborhood.trim()) return;
    if (!finalTags.length) { showToast('Add at least one cuisine tag.'); return; }
    const payload = {
      name: form.name.trim(), neighborhood: form.neighborhood.trim(),
      address: form.address.trim(), tags: finalTags,
      category: form.category,
      bestFor: form.bestFor,
      phone: form.phone.trim(), website: form.website.trim(), reservationUrl: form.reservationUrl.trim(),
      ownerNote: form.ownerNote.trim(), substackUrl: form.substackUrl.trim(),
      ownerRating: form.ownerRating !== '' ? Number(form.ownerRating) : null,
      photoUrl: form.photoUrl.trim(), hours: form.hours,
      price: form.price,
      lastVisited: form.lastVisited,
      visitType: form.visitType,
      orderDishes: form.orderDishes,
      skipDishes: form.skipDishes,
    };
    try {
      const res = await fetch('/api/spots', { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
      const next = await res.json();
      setSpots(prev => [next, ...prev]);
      setForm({ ...INITIAL_FORM, hours: { ...INITIAL_HOURS } });
      setTagInput('');
      setDishInputs({ order: '', skip: '' });
      setPhotoPreviewUrl('');
      setPhotoPreviewBroken(false);
      // Keep form open for batch entry — user can close manually
      showToast('Spot added! Form ready for another.');
    } catch { showToast('Unable to add spot.'); }
  };

  const deleteSpot = async (spotId) => {
    if (!isOwner || !window.confirm('Delete this spot?')) return;
    try {
      await fetch(`/api/spots/${spotId}`, { method: 'DELETE', headers: authHeaders });
      setSpots(prev => prev.filter(s => s.id !== spotId));
      showToast('Spot deleted.');
    } catch { showToast('Unable to delete.'); }
  };

  const submitReview = async (spotId) => {
    const draft = reviewDrafts[spotId] || {};
    const rating = Math.min(10, Math.max(0, Number(draft.rating ?? 10)));
    const comment = (draft.comment || '').trim();
    try {
      const res = await fetch(`/api/spots/${spotId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Browser-Id': browserId },
        body: JSON.stringify({ rating, comment }),
      });
      if (!res.ok) { const e = await res.json(); showToast(e.error || 'Unable to save review.'); return; }
      const updated = await res.json();
      setSpots(prev => prev.map(s => s.id === spotId ? updated : s));
      setReviewDrafts(prev => ({ ...prev, [spotId]: { rating: 10, comment: '' } }));
      showToast('Review saved!');
    } catch { showToast('Unable to save review.'); }
  };

  const startEdit = (spot) => {
    setEditingCardId(spot.id);
    window.setTimeout(() => editingCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    setEditDraft({
      name: spot.name || '',
      neighborhood: spot.neighborhood || '',
      address: spot.address || '',
      tags: [...(spot.tags || [])],
      category: spot.category || '',
      bestFor: [...(spot.bestFor || [])],
      hours: { ...INITIAL_HOURS, ...(spot.hours || {}) },
      ownerRating: spot.ownerRating ?? '',
      ownerNote: spot.ownerNote || '',
      phone: spot.phone || '',
      website: spot.website || '',
      reservationUrl: spot.reservationUrl || '',
      substackUrl: spot.substackUrl || '',
      price: spot.price || '',
      lastVisited: spot.lastVisited || '',
      visitType: spot.visitType || '',
      orderDishes: [...(spot.orderDishes || [])],
      skipDishes: [...(spot.skipDishes || [])],
    });
    setEditDishInputs({ order: '', skip: '' });
  };

  const cancelEdit = (originalSpot) => {
    const changed = originalSpot && (
      editDraft.name !== (originalSpot.name || '') ||
      editDraft.neighborhood !== (originalSpot.neighborhood || '') ||
      editDraft.ownerNote !== (originalSpot.ownerNote || '') ||
      editDraft.ownerRating !== String(originalSpot.ownerRating ?? '')
    );
    if (changed && !window.confirm('Discard unsaved changes?')) return;
    setEditingCardId(null); setEditDraft({}); setEditTagInput('');
  };

  const saveCardEdit = async (spotId) => {
    // Flush any dish text typed but not yet committed with Enter
    const draft = { ...editDraft };
    if (editTagInput.trim() && !draft.tags?.includes(editTagInput.trim())) {
      draft.tags = [...(draft.tags || []), editTagInput.trim()];
    }
    if (editDishInputs.order.trim()) {
      draft.orderDishes = [...draft.orderDishes, editDishInputs.order.trim()];
    }
    if (editDishInputs.skip.trim()) {
      draft.skipDishes = [...draft.skipDishes, editDishInputs.skip.trim()];
    }
    try {
      const res = await fetch(`/api/spots/${spotId}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error('save failed');
      const updated = await res.json();
      const { geocodeFailed, ...spotData } = updated;
      setSpots(prev => prev.map(s => s.id === spotId ? spotData : s));
      setEditingCardId(null);
      setEditDraft({});
      setEditTagInput('');
      setEditDishInputs({ order: '', skip: '' });
      showToast(geocodeFailed ? 'Changes saved — address could not be geocoded.' : 'Changes saved.');
    } catch { showToast('Unable to save changes.'); }
  };

  const addEditDish = (listKey, inputKey) => {
    const val = normalizeDish(editDishInputs[inputKey].trim());
    if (!val) return;
    setEditDraft(prev => ({ ...prev, [listKey]: [...prev[listKey], val] }));
    setEditDishInputs(prev => ({ ...prev, [inputKey]: '' }));
  };

  const removeEditDish = (listKey, idx) =>
    setEditDraft(prev => ({ ...prev, [listKey]: prev[listKey].filter((_, i) => i !== idx) }));

  const todayDay = DAYS[new Date().getDay()];

  const renderCard = (spot, index) => {
    const hasPhoto = spot.photoUrl && !brokenPhotos.has(spot.id);
    const isBroken = brokenPhotos.has(spot.id) || !spot.photoUrl;
    const avg = communityAvg(spot.reviews);
    const count = spot.reviews?.length || 0;
    const draft = reviewDrafts[spot.id] || { rating: 10, comment: '' };
    const distance = userLocation && spot.lat != null
      ? haversine(userLocation.lat, userLocation.lng, spot.lat, spot.lng)
      : null;
    const openNow = checkOpenNow(spot);
    const hasHours = spot.hours && DAYS.some(d => spot.hours[d]);
    const isExpanded = expandedReviews.has(spot.id);
    const reviewSort = reviewSorts[spot.id] || 'recent';
    const sortedReviews = [...spot.reviews].sort((a, b) =>
      reviewSort === 'highest' ? b.rating - a.rating :
      reviewSort === 'lowest'  ? a.rating - b.rating :
      b.createdAt - a.createdAt
    );
    // Only compute isEditing when owner mode is active — never exposes edit state to visitors
    const isEditing = isOwner && editingCardId === spot.id;

    return (
      <li key={spot.id} ref={isEditing ? editingCardRef : null} className={`entry-card${isEditing ? ' is-editing' : ''}${!hasPhoto ? ' no-photo' : ''}`}>
        {/* LEFT COLUMN: photo + ratings stacked */}
        <div className="card-left">
          {hasPhoto
            ? <div className="card-photo">
                <img src={spot.photoUrl} alt={spot.name} onError={() => setBrokenPhotos(p => new Set(p).add(spot.id))} />
              </div>
            : <div className="card-photo card-photo--empty" />
          }
          <div className="ratings-block">
              <div className="rating-line">
                <span className="rating-label">⭐ Vincent</span>
                {spot.ownerRating != null
                  ? <span className="rating-value owner-value">
                      {Number(spot.ownerRating).toFixed(1)}<span className="rating-denom">/10</span>
                    </span>
                  : null
                }
              </div>
              <div className="rating-line">
                <span className="rating-label">Community</span>
                {count >= COMMUNITY_THRESHOLD
                  ? <span className="rating-value">
                      {avg.toFixed(1)}<span className="rating-denom">/10</span>
                      <span className="rating-vote-count">({count} votes)</span>
                    </span>
                  : <span className="rating-na">
                      N/A
                      <span className="rating-na-reason">needs {COMMUNITY_THRESHOLD - count} more</span>
                    </span>
                }
              </div>
            </div>
        </div>

        {/* RIGHT COLUMN: all other content */}
        <div className="card-body">
          <div className="card-header">
            <div className="card-title-block" style={{ flex: 1, minWidth: 0 }}>
              {viewMode !== 'neighborhood' && !isEditing && <span className="rank-num">#{index + 1}</span>}
              {isEditing ? (
                <input
                  className="edit-input edit-name-input"
                  value={editDraft.name}
                  onChange={e => setEditDraft(p => ({ ...p, name: e.target.value }))}
                  placeholder="Spot name"
                />
              ) : (
                <h2 className="card-name" title={spot.name}>
                  {spot.name}
                  {spot.createdAt > 0 && (Date.now() - spot.createdAt < 14 * 24 * 60 * 60 * 1000) && (
                    <span className="new-badge">New</span>
                  )}
                </h2>
              )}
            </div>
            <div className="card-header-right">
              <button
                className={`star-btn${starredIds.has(spot.id) ? ' starred' : ''}`}
                onClick={() => toggleStar(spot.id)}
                title={starredIds.has(spot.id) ? 'Remove from plan' : 'Save to plan'}
              >
                <span>{starredIds.has(spot.id) ? '✓' : '＋'}</span>
                <span className="star-label">{starredIds.has(spot.id) ? 'Saved to Plan' : 'Save to Plan'}</span>
              </button>
              {isOwner && !isEditing && (
                <button className="edit-card-btn" onClick={() => startEdit(spot)} title="Edit">✎</button>
              )}
              {isOwner && (
                <button className="delete-btn" onClick={() => deleteSpot(spot.id)} title="Delete spot">✕</button>
              )}
            </div>
          </div>

          {isEditing ? (
            <div className="edit-meta-row">
              <input
                className="edit-input"
                value={editDraft.neighborhood}
                onChange={e => setEditDraft(p => ({ ...p, neighborhood: e.target.value }))}
                placeholder="Neighborhood"
              />
              <input
                className="edit-input"
                value={editDraft.address}
                onChange={e => setEditDraft(p => ({ ...p, address: e.target.value }))}
                placeholder="Address"
              />
            </div>
          ) : (
            <>
              <div className="card-location-row">
                {viewMode !== 'neighborhood' && <span className="neighborhood-label">▸ {spot.neighborhood}</span>}
                {distance != null && <span className="distance-badge">{distance < 0.1 ? '<0.1' : distance.toFixed(1)} mi</span>}
              </div>
              {spot.address && <div className="card-address">{spot.address}</div>}
            </>
          )}

          {/* Chips row: tags + price editable in edit mode */}
          <div className="card-chips">
            {isEditing ? (
              <>
                <div className="edit-tags-row">
                  {editDraft.tags?.map((t, i) => (
                    <span key={i} className="cuisine-chip cuisine-chip--editable">
                      {t}
                      <button type="button" className="dish-chip-remove"
                        onClick={() => setEditDraft(p => ({ ...p, tags: p.tags.filter((_, j) => j !== i) }))}>×</button>
                    </span>
                  ))}
                  <input
                    list="tag-options"
                    className="tag-inline-input"
                    value={editTagInput}
                    onChange={e => setEditTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        const val = editTagInput.trim().replace(/,$/, '');
                        if (val && !editDraft.tags?.includes(val)) {
                          setEditDraft(p => ({ ...p, tags: [...(p.tags || []), val] }));
                          setEditTagInput('');
                        }
                      }
                    }}
                    placeholder="Add cuisine…"
                  />
                  {editTagInput.trim() && (
                    <button type="button" className="dish-add-btn" onClick={() => {
                      const val = editTagInput.trim();
                      if (val && !editDraft.tags?.includes(val)) {
                        setEditDraft(p => ({ ...p, tags: [...(p.tags || []), val] }));
                        setEditTagInput('');
                      }
                    }}>+</button>
                  )}
                </div>
                <select className="edit-select"
                  value={editDraft.category || ''}
                  onChange={e => setEditDraft(p => ({ ...p, category: e.target.value }))}>
                  <option value="">No category</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="edit-select edit-price-select"
                  value={editDraft.price}
                  onChange={e => setEditDraft(p => ({ ...p, price: e.target.value }))}>
                  <option value="">No price</option>
                  <option value="$">$</option>
                  <option value="$$">$$</option>
                  <option value="$$$">$$$</option>
                  <option value="$$$$">$$$$</option>
                </select>
                <div className="best-for-chips" style={{ marginTop: 6 }}>
                  {BEST_FOR.map(b => (
                    <button key={b} type="button"
                      className={`best-for-chip${(editDraft.bestFor || []).includes(b) ? ' active' : ''}`}
                      onClick={() => setEditDraft(p => ({ ...p, bestFor: (p.bestFor || []).includes(b) ? p.bestFor.filter(x => x !== b) : [...(p.bestFor || []), b] }))}
                    >{b}</button>
                  ))}
                </div>
              </>
            ) : (
              spot.tags?.map((t, i) => <span key={i} className="cuisine-chip">{t}</span>)
            )}
            {!isEditing && (
              <>
              {spot.category && <span className="category-chip">{spot.category.charAt(0).toUpperCase() + spot.category.slice(1)}</span>}
              {spot.price && <span className="price-chip">{spot.price}</span>}
              {spot.bestFor?.map(b => <span key={b} className="best-for-badge">{b}</span>)}
              </>
            )}
            {!isEditing && hasHours && (
              <span className={openNow ? 'status-chip open' : 'status-chip closed'}>
                {openNow ? 'Open now' : (spot.hours[todayDay] ? 'Closed now' : 'Closed today')}
              </span>
            )}
          </div>

          {/* Visit info: last visited date only — visit type is internal metadata */}
          {!isEditing && spot.lastVisited && (
            <div className="visit-info">
              <span>Last visited {fmtLastVisited(spot.lastVisited)}</span>
            </div>
          )}

          {/* Owner section: note, substack, dishes — all editable in edit mode */}
          {isEditing ? (
            <div className="owner-section edit-owner-section">

              {/* ── ESSENTIALS: rating + my take ── */}
              <div className="edit-essentials-row">
                <div className="edit-field-group edit-field-group--inline">
                  <span className="edit-field-label">Rating</span>
                  <input type="number" min="0" max="10" step="0.1"
                    className="edit-rating-input"
                    value={editDraft.ownerRating}
                    onChange={e => setEditDraft(p => ({ ...p, ownerRating: e.target.value }))}
                    onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setEditDraft(p => ({ ...p, ownerRating: String(Math.min(10, Math.max(0, v))) })); }}
                    placeholder="—"
                  />
                  <span className="edit-field-sublabel">/10</span>
                </div>
              </div>
              <textarea className="edit-textarea edit-take-textarea"
                value={editDraft.ownerNote}
                onChange={e => setEditDraft(p => ({ ...p, ownerNote: e.target.value }))}
                placeholder="Your take on this place…"
                rows={2}
              />

              {/* ── DISHES ── */}
              <div className="edit-dishes-row">
                <div className="edit-dish-col">
                  <span className="edit-field-label edit-field-label--order">Order this</span>
                  <div className="dish-input-row">
                    {editDraft.orderDishes?.map((d, i) => (
                      <span key={i} className="dish-chip order">{d}<button type="button" className="dish-chip-remove" onClick={() => removeEditDish('orderDishes', i)}>×</button></span>
                    ))}
                    <input className="dish-inline-input"                      value={editDishInputs.order}
                      onChange={e => setEditDishInputs(p => ({ ...p, order: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEditDish('orderDishes', 'order'); } }}
                      placeholder="Add dish…"
                    />
                    {editDishInputs.order.trim() && <button type="button" className="dish-add-btn" onClick={() => addEditDish('orderDishes', 'order')}>+</button>}
                  </div>
                </div>
                <div className="edit-dish-col">
                  <span className="edit-field-label edit-field-label--skip">Skip this</span>
                  <div className="dish-input-row">
                    {editDraft.skipDishes?.map((d, i) => (
                      <span key={i} className="dish-chip skip">{d}<button type="button" className="dish-chip-remove" onClick={() => removeEditDish('skipDishes', i)}>×</button></span>
                    ))}
                    <input className="dish-inline-input"                      value={editDishInputs.skip}
                      onChange={e => setEditDishInputs(p => ({ ...p, skip: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEditDish('skipDishes', 'skip'); } }}
                      placeholder="Add dish…"
                    />
                    {editDishInputs.skip.trim() && <button type="button" className="dish-add-btn" onClick={() => addEditDish('skipDishes', 'skip')}>+</button>}
                  </div>
                </div>
              </div>

              {/* ── OPTIONAL DETAILS (collapsed) ── */}
              <details className="edit-section edit-section--extra">
                <summary className="edit-section-summary">More details</summary>
                <div className="edit-section-body">
                  <div className="edit-inline-row">
                    <div className="edit-field-group">
                      <span className="edit-field-label">Last visited</span>
                      <input type="month" className="edit-input"
                        value={editDraft.lastVisited}
                        onChange={e => setEditDraft(p => ({ ...p, lastVisited: e.target.value }))} />
                    </div>
                    <div className="edit-field-group">
                      <span className="edit-field-label">Visit type</span>
                      <select className="edit-select"
                        value={editDraft.visitType}
                        onChange={e => setEditDraft(p => ({ ...p, visitType: e.target.value }))}>
                        <option value="">—</option>
                        <option value="one-time">One-time</option>
                        <option value="regular">Regular</option>
                      </select>
                    </div>
                  </div>
                  <div className="edit-field-group">
                    <span className="edit-field-label">Best for</span>
                    <div className="best-for-chips">
                      {BEST_FOR.map(b => (
                        <button key={b} type="button"
                          className={`best-for-chip${(editDraft.bestFor || []).includes(b) ? ' active' : ''}`}
                          onClick={() => setEditDraft(p => ({ ...p, bestFor: (p.bestFor || []).includes(b) ? p.bestFor.filter(x => x !== b) : [...(p.bestFor || []), b] }))}
                        >{b}</button>
                      ))}
                    </div>
                  </div>
                  <div className="edit-inline-row">
                    <div className="edit-field-group">
                      <span className="edit-field-label">Phone</span>
                      <input type="tel" className="edit-input"
                        value={editDraft.phone || ''}
                        onChange={e => setEditDraft(p => ({ ...p, phone: e.target.value }))}
                        placeholder="(312) 555-0000"
                      />
                    </div>
                    <div className="edit-field-group">
                      <span className="edit-field-label">Website</span>
                      <input type="url" className="edit-input"
                        value={editDraft.website || ''}
                        onChange={e => setEditDraft(p => ({ ...p, website: e.target.value }))}
                        placeholder="https://…"
                      />
                    </div>
                  </div>
                  <div className="edit-inline-row">
                    <div className="edit-field-group">
                      <span className="edit-field-label">Reservation link</span>
                      <input type="url" className="edit-input"
                        value={editDraft.reservationUrl || ''}
                        onChange={e => setEditDraft(p => ({ ...p, reservationUrl: e.target.value }))}
                        placeholder="Resy, OpenTable…"
                      />
                    </div>
                    <div className="edit-field-group">
                      <span className="edit-field-label">Substack link</span>
                      <input type="url" className="edit-input"
                        value={editDraft.substackUrl}
                        onChange={e => setEditDraft(p => ({ ...p, substackUrl: e.target.value }))}
                        placeholder="https://…"
                      />
                    </div>
                  </div>
                </div>
              </details>

              <details className="edit-section edit-section--extra">
                <summary className="edit-section-summary">Hours</summary>
                <div className="edit-section-body">
                  <div className="edit-hours-grid">
                    {DAYS.map(day => (
                      <div key={day} className="edit-hours-row">
                        <span className="edit-hours-day">{day.charAt(0).toUpperCase() + day.slice(1, 3)}</span>
                        <input
                          className="edit-input edit-hours-input"
                          value={editDraft.hours?.[day] ?? ''}
                          onChange={e => setEditDraft(p => ({ ...p, hours: { ...p.hours, [day]: e.target.value } }))}
                          onBlur={e => {
                            const norm = normalizeHoursStr(e.target.value);
                            if (norm !== e.target.value)
                              setEditDraft(p => ({ ...p, hours: { ...p.hours, [day]: norm } }));
                          }}
                          placeholder="9:00 AM – 10:00 PM"
                        />
                        <button type="button" className="closed-shortcut-btn"
                          onClick={() => setEditDraft(p => ({ ...p, hours: { ...p.hours, [day]: 'Closed' } }))}>
                          Closed
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </details>

              <div className="edit-action-bar">
                <button className="edit-save-btn" onClick={() => saveCardEdit(spot.id)}>Save</button>
                <button className="edit-cancel-btn" onClick={() => cancelEdit(spot)}>Cancel</button>
              </div>
            </div>
          ) : (
            (spot.phone || spot.website || spot.reservationUrl || spot.ownerNote || spot.substackUrl || spot.orderDishes?.length > 0 || spot.skipDishes?.length > 0) && (
              <div className="owner-section">
                {(spot.phone || spot.website || spot.reservationUrl) && (
                  <div className="spot-links">
                    {spot.phone && <a href={`tel:${spot.phone}`} className="spot-link-chip">📞 {spot.phone}</a>}
                    {spot.website && <a href={spot.website} className="spot-link-chip" target="_blank" rel="noopener noreferrer">🌐 Website</a>}
                    {spot.reservationUrl && <a href={spot.reservationUrl} className="spot-link-chip reservation" target="_blank" rel="noopener noreferrer">📅 Reserve</a>}
                  </div>
                )}
                {spot.ownerNote && <>
                  <span className="owner-take-label">My take</span>
                  <p className="owner-note">"{spot.ownerNote}"</p>
                </>}
                {spot.substackUrl && (
                  <a href={spot.substackUrl} className="substack-link" target="_blank" rel="noopener noreferrer">
                    Read my full review →
                  </a>
                )}
                {spot.orderDishes?.length > 0 && (
                  <div className="dish-row">
                    <span className="dish-row-label order">Order this:</span>
                    <div className="dish-chips">
                      {spot.orderDishes.map((d, i) => <span key={i} className="dish-chip order">{d}</span>)}
                    </div>
                  </div>
                )}
                {spot.skipDishes?.length > 0 && (
                  <div className="dish-row">
                    <span className="dish-row-label skip">Skip this:</span>
                    <div className="dish-chips">
                      {spot.skipDishes.map((d, i) => <span key={i} className="dish-chip skip">{d}</span>)}
                    </div>
                  </div>
                )}
              </div>
            )
          )}

          {hasHours && (
            <details className="hours-details">
              <summary>
                Hours
                {spot.hours[todayDay] && <span className="today-hours"> — today {spot.hours[todayDay]}</span>}
              </summary>
              <ul className="hours-list">
                {DAYS.map(day => (
                  <li key={day} className={day === todayDay ? 'today' : ''}>
                    <span className="day-name">{day.charAt(0).toUpperCase() + day.slice(1, 3)}</span>
                    <span>{spot.hours[day] || 'Closed'}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="community-section">
            {spot.reviews?.some(r => r.browserId === browserId) ? (
              <div className="already-reviewed-note">✓ You've already reviewed this spot.</div>
            ) : expandedReviewForms.has(spot.id) ? (
            <div className="review-form">
              <input
                type="number" min="0" max="10" step="0.1"
                className="rating-num-input"
                value={draft.rating ?? 10}
                onChange={e => updateDraft(spot.id, 'rating', e.target.value)}
              />
              <span className="rating-slash">/10</span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <textarea
                  className="comment-input"
                  placeholder="Share your experience (optional)..."
                  maxLength={500}
                  rows={3}
                  value={draft.comment || ''}
                  onChange={e => updateDraft(spot.id, 'comment', e.target.value)}
                  style={{ resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <button
                className="review-btn"
                onClick={() => submitReview(spot.id)}
              >Rate</button>
            </div>
            ) : (
              <button
                className="review-form-toggle-btn"
                onClick={() => setExpandedReviewForms(prev => { const n = new Set(prev); n.add(spot.id); return n; })}
              >Rate this place ▾</button>
            )}

            {count > 0 ? (
              <div className="community-comments-block">
                <button className="community-toggle-btn" onClick={() => toggleReviews(spot.id)}>
                  {count} {count === 1 ? 'community review' : 'community reviews'} {isExpanded ? '▾' : '▸'}
                </button>
                {isExpanded && (
                  <>
                    <div className="review-sort-pills">
                      {[['recent', 'Recent'], ['highest', 'Highest'], ['lowest', 'Lowest']].map(([key, label]) => (
                        <button
                          key={key}
                          className={`review-sort-pill${reviewSort === key ? ' active' : ''}`}
                          onClick={() => setReviewSorts(prev => ({ ...prev, [spot.id]: key }))}
                        >{label}</button>
                      ))}
                    </div>
                    <ul className="review-list">
                      {sortedReviews.map((r, i) => {
                        const isPending = pendingDeleteReview?.spotId === spot.id && pendingDeleteReview?.createdAt === r.createdAt;
                        return (
                          <li key={i} className="review-item">
                            <span className="review-score">{Number(r.rating).toFixed(1)}</span>
                            {r.comment && <span className="review-comment">{r.comment}</span>}
                            <span className="review-date">{new Date(r.createdAt).toLocaleDateString()}</span>
                            {isOwner && (isPending ? (
                              <span className="review-confirm">
                                Delete?
                                <button className="review-confirm-yes" onClick={() => deleteReview(spot.id, r.createdAt)}>Yes</button>
                                <button className="review-confirm-no" onClick={() => setPendingDeleteReview(null)}>No</button>
                              </span>
                            ) : (
                              <button className="review-delete-btn" title="Remove review" onClick={() => setPendingDeleteReview({ spotId: spot.id, createdAt: r.createdAt })}>×</button>
                            ))}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            ) : (
              <span className="no-reviews-cta">Be the first to rate this spot!</span>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="ledger-shell">
      <datalist id="tag-options">
        {allTags.map(t => <option key={t} value={t} />)}
      </datalist>
      <datalist id="neighborhood-options">
        {allNeighborhoods.map(n => <option key={n} value={n} />)}
      </datalist>
      <header className="ledger-header">
        <div>
          <h1>Chicago Eats Ledger</h1>
          <p>My picks for Chicago's best spots — plan your crawl in one tap.</p>
        </div>
        <div className="header-right">
          <button
            className={`font-size-toggle${largeText ? ' active' : ''}`}
            onClick={() => setLargeText(v => !v)}
            title={largeText ? 'Switch to normal text size' : 'Switch to larger text size'}
          >
            {largeText ? 'Aa−' : 'Aa+'}
          </button>
          {isOwnerMode && (isOwner ? (
            <button className="owner-btn active" onClick={handleLogout}>Owner ✓</button>
          ) : showPasscode ? (
            <div className="passcode-row">
              <input
                type="password" placeholder="Passcode" value={passcodeValue} autoFocus
                onChange={e => setPasscodeValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
              <button onClick={handleLogin}>Go</button>
              <button onClick={() => { setShowPasscode(false); setPasscodeValue(''); }}>✕</button>
            </div>
          ) : (
            <button className="owner-btn" onClick={() => setShowPasscode(true)}>Owner</button>
          ))}
        </div>
      </header>

      <div className="tab-bar">
        <button className={`tab-btn${activeTab === 'ledger' ? ' active' : ''}`} onClick={() => setActiveTab('ledger')}>
          Ledger
        </button>
        <button className={`tab-btn${activeTab === 'plan' ? ' active' : ''}`} onClick={() => setActiveTab('plan')}>
          Plan a Route{starredIds.size > 0 && <span className="tab-badge">{starredIds.size}</span>}
        </button>
        <button className={`tab-btn${activeTab === 'map' ? ' active' : ''}`} onClick={() => setActiveTab('map')}>
          Map
        </button>
      </div>

      {activeTab === 'plan' && (
        <PlanRoute spots={spots} userLocation={userLocation} setUserLocation={setUserLocation} starredIds={starredIds} toggleStar={toggleStar} planItems={planItems} setPlanItems={setPlanItems} />
      )}

      {activeTab === 'map' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
          <div className="map-hint">📍 Tap a pin to see the restaurant. Use the Ledger tab to filter by neighborhood or cuisine first.</div>
          <div style={{ flex: 1 }}>
          <MapView
            spots={filteredSpots}
            starredIds={starredIds}
            toggleStar={toggleStar}
            onSpotClick={(id) => {
              const spot = spots.find(s => s.id === id);
              if (spot) { setSearchQuery(spot.name); setMapJumpName(spot.name); }
              setActiveTab('ledger');
            }}
          />
          </div>
        </div>
      )}


      {activeTab === 'ledger' && <>
      {mapJumpName && (
        <div className="map-jump-banner">
          <span>📍 Showing <strong>{mapJumpName}</strong> from map</span>
          <button onClick={() => { setSearchQuery(''); setMapJumpName(''); }}>✕ Clear</button>
        </div>
      )}
      {!hasSeenTripHint && (
        <div className="trip-hint-banner">
          <span>Tap <strong>Save to Plan</strong> on any restaurant, then go to <strong>Plan a Route</strong> to build your day.</span>
          <button className="trip-hint-dismiss" onClick={dismissTripHint}>Got it</button>
        </div>
      )}
      <div className="controls">
        <div className="controls-top">
          <div className="search-input-wrapper">
            <span className="search-icon" aria-hidden="true">🔍</span>
            <input
              type="text"
              className="ledger-search-input"
              placeholder="Name, cuisine, dish, or neighborhood…"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setMapJumpName(''); }}
            />
            {searchQuery && (
              <button className="search-clear-btn" onClick={() => { setSearchQuery(''); setMapJumpName(''); }}>✕</button>
            )}
          </div>
          <button
            type="button"
            className={`filter-toggle-btn${showFilters || hasFiltersActive ? ' active' : ''}`}
            onClick={() => setShowFilters(v => !v)}
          >
            {hasFiltersActive ? `Filters (${[openNowFilter, selectedNeighborhood, selectedPrice, selectedCategory, ...selectedTags, ...selectedBestFor].filter(Boolean).length})` : 'Filters'} {showFilters ? '▴' : '▾'}
          </button>
        </div>

        {showFilters && (
          <div className="filter-panel">
            <div className="filter-panel-row">
              <label className="open-now-label">
                <input type="checkbox" checked={openNowFilter} onChange={e => setOpenNowFilter(e.target.checked)} />
                Open now
              </label>
              <select className="neighborhood-select" value={selectedNeighborhood} onChange={e => setSelectedNeighborhood(e.target.value)}>
                <option value="">All neighborhoods</option>
                {allNeighborhoods.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div className="filter-panel-row">
              <span className="control-label">Price</span>
              <div className="price-filter-chips">
                {['$', '$$', '$$$', '$$$$'].map(p => (
                  <button key={p} type="button"
                    className={`tag-filter-chip price-pill${selectedPrice === p ? ' active' : ''}`}
                    onClick={() => setSelectedPrice(prev => prev === p ? '' : p)}
                  >{p}</button>
                ))}
              </div>
            </div>

            <div className="filter-panel-row">
              <span className="control-label">Sort by</span>
              <div className="sort-pill" role="group" aria-label="View mode">
                {[
                  { key: 'neighborhood', label: 'Neighborhood' },
                  { key: 'top', label: 'Top rated' },
                  { key: 'newest', label: 'Newest' },
                  { key: 'nearest', label: 'Nearest' },
                ].map(({ key, label }) => (
                  <button key={key} type="button"
                    className={viewMode === key ? 'active' : ''}
                    onClick={() => {
                      if (key === 'nearest' && !userLocation) {
                        useGPS(() => setViewMode('nearest'));
                      } else {
                        setViewMode(key);
                      }
                    }}
                  >{label}</button>
                ))}
              </div>
            </div>

            <div className="filter-panel-row">
              <span className="control-label">Near me</span>
              <div className="location-bar">
                <div className="location-wrapper"
                  onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setShowSuggestions(false); }}
                >
                  <input type="text" className="location-input" autoComplete="off"
                    value={locationInput} placeholder="Your address…"
                    onChange={e => { setLocationInput(e.target.value); fetchSuggestions(e.target.value); }}
                    onKeyDown={e => e.key === 'Enter' && geocodeInput()}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  />
                  {showSuggestions && (
                    <ul className="suggestions-dropdown">
                      {suggestions.map(s => (
                        <li key={s.place_id} className="suggestion-item" tabIndex={-1} onMouseDown={() => selectSuggestion(s)}>
                          {s.display_name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <button className="location-btn" onClick={geocodeInput} disabled={locationLoading || !locationInput.trim()}>
                  {locationLoading ? '...' : 'Set'}
                </button>
                <button className="location-btn" onClick={useGPS}>📍 GPS</button>
                {userLocation && <span className="location-set">✓</span>}
              </div>
            </div>

            <div className="filter-panel-row">
              <span className="control-label">Best for</span>
              <div className="best-for-chips">
                {BEST_FOR.map(b => (
                  <button key={b} type="button"
                    className={`best-for-chip${selectedBestFor.includes(b) ? ' active' : ''}`}
                    onClick={() => setSelectedBestFor(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b])}
                  >{b}</button>
                ))}
              </div>
            </div>

            <div className="filter-panel-row cuisine-filter-row">
              <div className="cuisine-filter-wrap" ref={cuisineDropdownRef}>
                <button
                  type="button"
                  className={`cuisine-filter-btn${selectedTags.length > 0 ? ' has-active' : ''}`}
                  onClick={() => { setShowCuisineDropdown(v => !v); setCuisineSearch(''); }}
                >
                  Cuisine{selectedTags.length > 0 ? ` (${selectedTags.length})` : ''} ▾
                </button>
                {selectedTags.map(tag => (
                  <span key={tag} className="active-cuisine-chip">
                    {tag}
                    <button type="button" className="active-cuisine-remove" onClick={() => toggleTag(tag)}>×</button>
                  </span>
                ))}
                {showCuisineDropdown && (
                  <div className="cuisine-dropdown">
                    <input
                      autoFocus
                      type="text"
                      className="cuisine-dropdown-search"
                      placeholder="Search cuisines…"
                      value={cuisineSearch}
                      onChange={e => setCuisineSearch(e.target.value)}
                    />
                    <ul className="cuisine-option-list">
                      {allTags
                        .filter(t => !cuisineSearch || t.toLowerCase().includes(cuisineSearch.toLowerCase()))
                        .map(tag => (
                          <li key={tag}>
                            <label className="cuisine-option">
                              <input
                                type="checkbox"
                                checked={selectedTags.includes(tag)}
                                onChange={() => toggleTag(tag)}
                              />
                              <span>{tag}</span>
                            </label>
                          </li>
                        ))
                      }
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {hasFiltersActive && (
              <button type="button" className="clear-filters-btn" onClick={clearAllFilters}>
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {isOwner && (
        <div className="add-section">
          <button className="add-toggle" onClick={() => setShowAddForm(v => !v)}>
            {showAddForm ? '▴ Close form' : '＋ Add a spot'}
          </button>
          {showAddForm && (
            <form className="add-form" onSubmit={postSpot}>
              <div className="form-grid">
                <label className="field"><span>Spot name</span><input value={form.name} onChange={handleChange('name')} required /></label>
                <label className="field"><span>Neighborhood</span><input list="neighborhood-options" value={form.neighborhood} onChange={handleChange('neighborhood')} required /></label>
                <label className="field field-full"><span>Address</span><input value={form.address} onChange={handleChange('address')} placeholder="123 W Randolph St, Chicago, IL 60606" /></label>
                <div className="field">
                  <span>Tags / Cuisines <span style={{ color: 'var(--red)', fontWeight: 700 }}>*</span></span>
                  <div className="dish-input-row">
                    {form.tags.map((t, i) => (
                      <span key={i} className="cuisine-chip cuisine-chip--editable">
                        {t}
                        <button type="button" className="dish-chip-remove"
                          onClick={() => setForm(p => ({ ...p, tags: p.tags.filter((_, j) => j !== i) }))}>×</button>
                      </span>
                    ))}
                    <input
                      list="tag-options"
                      className="dish-inline-input"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          const val = tagInput.trim().replace(/,$/, '');
                          if (val && !form.tags.includes(val)) {
                            setForm(p => ({ ...p, tags: [...p.tags, val] }));
                            setTagInput('');
                          }
                        }
                      }}
                      placeholder="Add cuisine…"
                    />
                    {tagInput.trim() && (
                      <button type="button" className="dish-add-btn" onClick={() => {
                        const val = tagInput.trim();
                        if (val && !form.tags.includes(val)) {
                          setForm(p => ({ ...p, tags: [...p.tags, val] }));
                          setTagInput('');
                        }
                      }}>+</button>
                    )}
                  </div>
                </div>
                <label className="field"><span>Category</span>
                  <select value={form.category} onChange={handleChange('category')}>
                    <option value="">— select —</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="field"><span>Price</span>
                  <select value={form.price} onChange={handleChange('price')}>
                    <option value="">—</option>
                    <option value="$">$ (under $15)</option>
                    <option value="$$">$$ ($15–$35)</option>
                    <option value="$$$">$$$ ($35–$100)</option>
                    <option value="$$$$">$$$$ ($100+)</option>
                  </select>
                </label>
                <div className="field">
                  <span>Best for</span>
                  <div className="best-for-chips">
                    {BEST_FOR.map(b => (
                      <button key={b} type="button"
                        className={`best-for-chip${form.bestFor.includes(b) ? ' active' : ''}`}
                        onClick={() => setForm(p => ({ ...p, bestFor: p.bestFor.includes(b) ? p.bestFor.filter(x => x !== b) : [...p.bestFor, b] }))}
                      >{b}</button>
                    ))}
                  </div>
                </div>
                <label className="field">
                  <span>My rating <span style={{ fontWeight: 400, opacity: 0.5 }}>(0–10)</span></span>
                  <input type="number" min="0" max="10" step="0.1"
                    value={form.ownerRating} onChange={handleChange('ownerRating')}
                    onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setForm(p => ({ ...p, ownerRating: String(Math.min(10, Math.max(0, v))) })); }}
                  />
                </label>
                <label className="field"><span>Last visited</span><input type="month" value={form.lastVisited} onChange={handleChange('lastVisited')} /></label>
                <label className="field"><span>Visit type</span>
                  <select value={form.visitType} onChange={handleChange('visitType')}>
                    <option value="">—</option>
                    <option value="one-time">One-time</option>
                    <option value="regular">Regular</option>
                  </select>
                </label>
                <label className="field"><span>Photo URL</span>
                  <input value={form.photoUrl} onChange={e => {
                    handleChange('photoUrl')(e);
                    const val = e.target.value.trim();
                    clearTimeout(photoDebounceRef.current);
                    photoDebounceRef.current = setTimeout(() => { setPhotoPreviewUrl(val); setPhotoPreviewBroken(false); }, 600);
                  }} />
                  {photoPreviewUrl && !photoPreviewBroken && (
                    <img src={photoPreviewUrl} alt="preview" className="photo-preview-thumb"
                      onError={() => setPhotoPreviewBroken(true)} />
                  )}
                  {photoPreviewUrl && photoPreviewBroken && (
                    <span className="photo-preview-broken">⚠ URL not loading</span>
                  )}
                </label>
                <label className="field"><span>Phone</span><input type="tel" value={form.phone} onChange={handleChange('phone')} placeholder="(312) 555-0000" /></label>
                <label className="field"><span>Website</span><input type="url" value={form.website} onChange={handleChange('website')} placeholder="https://…" /></label>
                <label className="field"><span>Reservation link</span><input type="url" value={form.reservationUrl} onChange={handleChange('reservationUrl')} placeholder="Resy, OpenTable, etc." /></label>
                <label className="field field-full"><span>My review note</span><textarea value={form.ownerNote} onChange={handleChange('ownerNote')} placeholder="Your take on this place..." /></label>
                <label className="field field-full"><span>Substack link</span><input value={form.substackUrl} onChange={handleChange('substackUrl')} placeholder="https://..." /></label>

                <div className="field field-full dish-input-field">
                  <span>Order this (press Enter to add)</span>
                  <div className="dish-input-row">
                    {form.orderDishes.map((d, i) => (
                      <span key={i} className="dish-chip order">
                        {d}
                        <button type="button" className="dish-chip-remove" onClick={() => removeDish('orderDishes', i)}>×</button>
                      </span>
                    ))}
                    <input
                      className="dish-inline-input"
                                           value={dishInputs.order}
                      onChange={e => setDishInputs(p => ({ ...p, order: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDish('orderDishes', 'order'); } }}
                      placeholder="e.g. Almond croissant"
                    />
                  </div>
                </div>

                <div className="field field-full dish-input-field">
                  <span>Skip this (press Enter to add)</span>
                  <div className="dish-input-row">
                    {form.skipDishes.map((d, i) => (
                      <span key={i} className="dish-chip skip">
                        {d}
                        <button type="button" className="dish-chip-remove" onClick={() => removeDish('skipDishes', i)}>×</button>
                      </span>
                    ))}
                    <input
                      className="dish-inline-input"
                                           value={dishInputs.skip}
                      onChange={e => setDishInputs(p => ({ ...p, skip: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDish('skipDishes', 'skip'); } }}
                      placeholder="e.g. Drip coffee"
                    />
                  </div>
                </div>
              </div>
              <details className="hours-form-section" open>
                <summary>Add opening hours (optional)</summary>
                <div className="hours-form-grid">
                  {DAYS.map(day => (
                    <label key={day} className="field">
                      <span>{day.charAt(0).toUpperCase() + day.slice(1, 3)}</span>
                      <input
                        value={form.hours[day]}
                        onChange={handleHoursChange(day)}
                        onBlur={e => {
                          const norm = normalizeHoursStr(e.target.value);
                          if (norm !== e.target.value)
                            setForm(prev => ({ ...prev, hours: { ...prev.hours, [day]: norm } }));
                        }}
                        placeholder="9:00 AM – 10:00 PM"
                      />
                    </label>
                  ))}
                </div>
              </details>
              <div className="form-actions">
                <button type="submit" className="primary">Add spot</button>
              </div>
            </form>
          )}
        </div>
      )}

      {!loaded && !loadError && <p className="status-msg">Loading ledger...</p>}

      {loadError && (
        <div className="load-error">
          <div className="load-error-icon">⚠</div>
          <h2>Can't reach the server</h2>
          <p>The ledger couldn't load. Make sure the server is running, then refresh the page.</p>
          <button className="load-error-btn" onClick={() => window.location.reload()}>Refresh</button>
        </div>
      )}

      {loaded && filteredSpots.length === 0 && (
        <p className="status-msg">
          {searchQuery.trim()
            ? `No matches for "${searchQuery.trim()}"${activeFilterSummary ? ` — also filtered by: ${activeFilterSummary}` : ''}`
            : `No spots match the current filters${activeFilterSummary ? `: ${activeFilterSummary}` : ''}.`
          }
        </p>
      )}

      {loaded && viewMode === 'neighborhood' && neighborhoodGroups && (
        <div className="neighborhood-groups">
          {Object.keys(neighborhoodGroups).sort().map(name => (
            <section key={name} className="neighborhood-section">
              <div className="neighborhood-heading-row">
                <button
                  className="neighborhood-heading"
                  onClick={() => setCollapsedAreas(prev => ({ ...prev, [name]: !prev[name] }))}
                  aria-expanded={!collapsedAreas[name]}
                >
                  <span className="area-name">{name}</span>
                  <span className="area-count">{neighborhoodGroups[name].length} spot{neighborhoodGroups[name].length !== 1 ? 's' : ''}</span>
                  <span className="collapse-icon">{collapsedAreas[name] ? '▸' : '▾'}</span>
                </button>
                <button
                  className="plan-neighborhood-btn"
                  onClick={() => {
                    const top = spots
                      .filter(s => s.neighborhood === name && s.ownerRating != null)
                      .sort((a, b) => b.ownerRating - a.ownerRating)
                      .slice(0, 5);
                    if (top.length === 0) { showToast('No rated spots in this area yet.'); return; }
                    let added = 0;
                    top.forEach(s => { if (!starredIds.has(s.id)) { toggleStar(s.id); added++; } });
                    setActiveTab('plan');
                    showToast(added > 0 ? `Added ${added} spot${added !== 1 ? 's' : ''} to your crawl.` : 'All top spots already saved — switched to plan.');
                  }}
                >Plan crawl →</button>
              </div>
              {!collapsedAreas[name] && (
                <ul className="entry-list">
                  {neighborhoodGroups[name].map((spot, i) => renderCard(spot, i))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {loaded && viewMode !== 'neighborhood' && (
        <ul className="entry-list">
          {sortedSpots.map((spot, i) => renderCard(spot, i))}
        </ul>
      )}
      </>}

      {toast && <div className="toast">{toast}</div>}
      <BackToTop />
    </div>
  );
}

export default App;
