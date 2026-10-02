import { useState } from 'react';
import { Link } from 'react-router-dom';
import { activitiesFor, KIND_LABEL } from '../logic/activities';
import type { ActivityKind, EntryKind } from '../types';
import { Icon } from './Icon';
import { KIND_ICON } from './activityUi';

const KINDS: ActivityKind[] = ['cardio', 'warmup', 'cooldown'];

/** "Add to workout: Exercise · Cardio · Warm-up · Cool-down" as one small segmented row. */
export function KindTabs({ value, onChange }: { value: EntryKind; onChange: (k: EntryKind) => void }) {
  return (
    <div className="kind-tabs" role="tablist" aria-label="Add to workout">
      <button role="tab" aria-selected={value === 'strength'} className={`kind-tab${value === 'strength' ? ' on' : ''}`} onClick={() => onChange('strength')}>
        <Icon name="dumbbell" size={18} /> Exercise
      </button>
      {KINDS.map((k) => (
        <button key={k} role="tab" aria-selected={value === k} className={`kind-tab${value === k ? ' on' : ''}`} onClick={() => onChange(k)}>
          <Icon name={KIND_ICON[k]} size={18} /> {KIND_LABEL[k]}
        </button>
      ))}
    </div>
  );
}

/** Between exercises in a workout: quick links to add cardio, a warm-up or a cool-down. */
export function AddActivityRow() {
  return (
    <div className="row add-activity-row">
      {KINDS.map((k) => (
        <Link key={k} to={`/workout/add?kind=${k}`} className="btn grow">
          <Icon name={KIND_ICON[k]} size={18} /> {KIND_LABEL[k]}
        </Link>
      ))}
    </div>
  );
}

/** The activities for a kind (cardio first for cardio, stretching/mobility first for warm-ups and cool-downs). */
export function ActivityPicker({ kind, onPick }: { kind: ActivityKind; onPick: (activityId: string, name?: string) => void }) {
  const [otherName, setOtherName] = useState<string | null>(null);
  if (otherName !== null) {
    return (
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (otherName.trim()) onPick('other', otherName.trim()); }}>
        <label className="field">
          What is it?
          <input className="input" value={otherName} maxLength={40} placeholder={kind === 'cardio' ? 'e.g. Boxing' : 'e.g. Hip circles'}
            onChange={(e) => setOtherName(e.target.value)} />
        </label>
        <button type="submit" className="btn primary block" disabled={!otherName.trim()}>Add</button>
        <button type="button" className="btn ghost block" onClick={() => setOtherName(null)}>Back to the list</button>
      </form>
    );
  }
  return (
    <div className="list" data-testid="activity-picker">
      {activitiesFor(kind).map((a) => (
        <button key={a.id} className="list-item" onClick={() => (a.id === 'other' ? setOtherName('') : onPick(a.id))}>
          <span className="grow title">{a.id === 'other' ? 'Other…' : a.name}</span>
          <Icon name="chevronRight" className="muted" />
        </button>
      ))}
    </div>
  );
}
