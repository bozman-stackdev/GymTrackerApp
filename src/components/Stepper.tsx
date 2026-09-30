import { useEffect, useState } from 'react';
import { fromDisplay, getUnits, snapWeight, toDisplay } from '../logic/units';

/**
 * Big −/+ control with a tappable number in the middle for typing an exact value.
 * With `weight`, `value`/`step`/`min`/`max` are in kg and the control shows and accepts the user's units (kg or lb).
 */
export function Stepper({ label, value, step, min = 0, max = Infinity, decimals = false, suffix, weight = false, onChange }: {
  label: string;
  value: number;
  step: number;
  min?: number;
  max?: number;
  decimals?: boolean;
  suffix?: string;
  weight?: boolean;
  onChange: (value: number) => void;
}) {
  const show = (v: number) => (weight ? Math.round(toDisplay(v) * 10) / 10 : v);
  const shown = show(value);
  // Keep the typed text separately so the user can clear the field and type a new number.
  const [text, setText] = useState(String(shown));
  useEffect(() => setText(String(shown)), [shown]);

  // Clamp to the allowed range, so a typo (e.g. 800 instead of 80) can't go beyond it.
  const set = (displayValue: number) => {
    const raw = weight ? fromDisplay(displayValue) : displayValue;
    const clamped = Math.min(max, Math.max(min, raw));
    onChange(weight ? snapWeight(clamped) : Math.round(clamped * 100) / 100);
  };
  const displayStep = weight ? show(step) : step;
  const unit = weight ? getUnits() : suffix;

  return (
    <div>
      <div className="stepper-label">{label}{unit ? ` (${unit})` : ''}</div>
      <div className="stepper">
        <button type="button" aria-label={`Less ${label}`} disabled={value <= min} onClick={() => set(shown - displayStep)}>−</button>
        <input
          aria-label={label}
          inputMode={decimals || weight ? 'decimal' : 'numeric'}
          value={text}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value.replace(',', '.'));
            if (e.target.value !== '' && Number.isFinite(n)) set(n);
          }}
          onBlur={() => setText(String(shown))}
        />
        <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => set(shown + displayStep)}>+</button>
      </div>
    </div>
  );
}
