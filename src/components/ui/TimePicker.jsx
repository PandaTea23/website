import { useEffect, useRef } from 'react';

const ITEM_H = 36;

function Drum({ items, value, onChange }) {
  const ref = useRef(null);
  const ignoreScroll = useRef(false);

  useEffect(() => {
    const idx = items.indexOf(value);
    if (idx < 0 || !ref.current) return;
    ignoreScroll.current = true;
    ref.current.scrollTop = idx * ITEM_H;
    setTimeout(() => { ignoreScroll.current = false; }, 80);
  }, [value, items]);

  const onScroll = () => {
    if (ignoreScroll.current || !ref.current) return;
    const idx = Math.round(ref.current.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    if (items[clamped] !== value) onChange(items[clamped]);
  };

  return (
    <div className="drum-col">
      <div className="drum-scroll" ref={ref} onScroll={onScroll}>
        <div style={{ height: ITEM_H }} />
        {items.map(item => (
          <div key={item} className={`drum-item${item === value ? ' selected' : ''}`}
            onClick={() => onChange(item)}>
            {item}
          </div>
        ))}
        <div style={{ height: ITEM_H }} />
      </div>
      <div className="drum-mask drum-mask-top" />
      <div className="drum-mask drum-mask-bot" />
      <div className="drum-selected-bar" />
    </div>
  );
}

const HOURS   = ['12','1','2','3','4','5','6','7','8','9','10','11'];
const MINUTES = ['00','15','30','45'];
const PERIODS = ['AM','PM'];

export default function TimePicker({ value, onChange }) {
  const [h24str, mStr] = (value || '12:00').split(':');
  const h24   = Number(h24str);
  const hour12 = String(h24 % 12 || 12);
  const minute  = String(Math.round(Number(mStr) / 15) * 15).padStart(2, '0');
  const period  = h24 >= 12 ? 'PM' : 'AM';

  const emit = (newH12, newMin, newPeriod) => {
    const h24out = Number(newH12) % 12 + (newPeriod === 'PM' ? 12 : 0);
    onChange(`${String(h24out).padStart(2,'0')}:${newMin}`);
  };

  return (
    <div className="drum-picker">
      <Drum items={HOURS}   value={hour12} onChange={v => emit(v, minute, period)} />
      <span className="drum-colon">:</span>
      <Drum items={MINUTES} value={minute} onChange={v => emit(hour12, v, period)} />
      <Drum items={PERIODS} value={period} onChange={v => emit(hour12, minute, v)} />
    </div>
  );
}
