import { useEffect, useState } from 'react';

/** Big −/+ control with a tappable number in the middle for typing an exact value. */
export function Stepper({ label, value, step, min = 0, decimals = false, suffix, onChange }: {
  label: string;
  value: number;
  step: number;
  min?: number;
  decimals?: boolean;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  // Keep the typed text separately so the user can clear the field and type a new number.
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const set = (v: number) => onChange(Math.max(min, Math.round(v * 100) / 100));

  return (
    <div>
      <div className="stepper-label">{label}{suffix ? ` (${suffix})` : ''}</div>
      <div className="stepper">
        <button type="button" aria-label={`Less ${label}`} onClick={() => set(value - step)}>−</button>
        <input
          aria-label={label}
          inputMode={decimals ? 'decimal' : 'numeric'}
          value={text}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value.replace(',', '.'));
            if (e.target.value !== '' && Number.isFinite(n)) set(n);
          }}
          onBlur={() => setText(String(value))}
        />
        <button type="button" aria-label={`More ${label}`} onClick={() => set(value + step)}>+</button>
      </div>
    </div>
  );
}
