import { useEffect, useRef, useState } from 'react';
import type { SetLog } from '../types';
import { Stepper } from './Stepper';

/**
 * Small bottom sheet to fix a logged set: change weight/reps, or delete it.
 * Values are in kg; the weight Stepper shows the user's units (see units.ts).
 */
export function SetEditor({ title, set, usesWeight, weightStep, onSave, onDelete, onClose }: {
  title: string;
  set: SetLog;
  usesWeight: boolean;
  weightStep: number;
  onSave: (patch: { reps: number; weightKg: number }) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [reps, setReps] = useState(set.reps);
  const [weight, setWeight] = useState(set.weightKg);
  const first = useRef<HTMLButtonElement>(null);
  // Parents pass a new onClose on every render: keep the latest without re-running the effect below
  // (which would move focus back to Cancel while the user is typing).
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="sheet-layer">
      {/* Tapping outside the sheet closes it. A real button, so it isn't a mystery click target; Cancel is the keyboard way. */}
      <button type="button" className="sheet-backdrop" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between">
          <strong>{title}</strong>
          <button ref={first} className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
        {usesWeight && <Stepper label="Weight" value={weight} step={weightStep} decimals weight onChange={setWeight} />}
        <Stepper label="Reps" value={reps} step={1} min={1} max={100} onChange={setReps} />
        <button className="btn primary huge" onClick={() => onSave({ reps, weightKg: usesWeight ? weight : 0 })}>Save</button>
        <button className="btn ghost danger block" onClick={onDelete}>Delete this set</button>
      </div>
    </div>
  );
}
