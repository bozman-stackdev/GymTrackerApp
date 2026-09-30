import { useState } from 'react';

/** Big rep buttons around the target: tapping one logs the set. "More" reveals the full range. */
export function RepPad({ target, disabled, label, onPick }: { target: number; disabled: boolean; label: string; onPick: (reps: number) => void }) {
  const [all, setAll] = useState(false);
  const start = Math.max(1, target - 4);
  const numbers = all ? Array.from({ length: 30 }, (_, i) => i + 1) : Array.from({ length: 8 }, (_, i) => start + i);

  return (
    <div>
      <div className="stepper-label">{label}</div>
      <div className={`rep-pad${all ? ' all' : ''}`}>
        {numbers.map((n) => (
          <button key={n} className={`rep-btn${n === target ? ' target' : ''}`} disabled={disabled} onClick={() => onPick(n)} aria-label={`${n} reps`}>
            {n}
          </button>
        ))}
        <button className="rep-btn more" onClick={() => setAll(!all)}>{all ? 'Less' : 'More'}</button>
      </div>
    </div>
  );
}
