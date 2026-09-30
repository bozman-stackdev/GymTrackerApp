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

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
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
