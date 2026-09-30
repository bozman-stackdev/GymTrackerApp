import { useState } from 'react';
import { Screen } from '../components/Screen';
import { saveProfile } from '../data/actions';
import { createEmptyData, createSampleData } from '../data/seed';
import { useStore } from '../data/store';
import type { Experience, Goal, Profile, Sex } from '../types';

const SEXES: [Sex, string][] = [['male', 'Male'], ['female', 'Female'], ['other', 'Other'], ['', 'Prefer not to say']];
const EXPERIENCE: [Experience, string][] = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']];
const GOALS: [Goal, string][] = [['strength', 'Strength'], ['muscle', 'Build muscle'], ['general', 'General fitness']];

export function ProfileScreen() {
  const { data, update, replace } = useStore();
  const [p, setP] = useState<Profile>(data.profile);
  const [saved, setSaved] = useState(false);
  const change = <K extends keyof Profile>(key: K, value: Profile[K]) => { setP({ ...p, [key]: value }); setSaved(false); };
  const num = (v: string) => (v === '' ? null : Number(v));

  const bmi = p.heightCm && p.weightKg ? p.weightKg / (p.heightCm / 100) ** 2 : null;

  const reset = (sample: boolean) => {
    const msg = sample ? 'Replace ALL your data with sample data?' : 'Delete ALL your data (history, routines, profile)?';
    if (!confirm(msg)) return;
    const fresh = sample ? createSampleData() : createEmptyData();
    replace(fresh);
    setP(fresh.profile);
  };

  return (
    <Screen title="Profile">
      <label className="field">
        Name
        <input className="input" value={p.name} onChange={(e) => change('name', e.target.value)} />
      </label>
      <div className="row">
        <NumberField label="Age" value={p.age} onChange={(v) => change('age', num(v))} />
        <NumberField label="Height (cm)" value={p.heightCm} onChange={(v) => change('heightCm', num(v))} />
        <NumberField label="Weight (kg)" value={p.weightKg} onChange={(v) => change('weightKg', num(v))} decimal />
      </div>
      {bmi && <p className="muted small" style={{ margin: 0 }}>BMI {bmi.toFixed(1)}</p>}

      <Chips label="Sex" options={SEXES} value={p.sex} onChange={(v) => change('sex', v)} />
      <Chips label="Experience" options={EXPERIENCE} value={p.experience} onChange={(v) => change('experience', v)} />
      <Chips label="Goal" options={GOALS} value={p.goal} onChange={(v) => change('goal', v)} />

      <button className="btn primary huge" onClick={() => { update((d) => saveProfile(d, p)); setSaved(true); }}>
        {saved ? '✓ Saved' : 'Save'}
      </button>

      <h2>Data</h2>
      <p className="muted small" style={{ margin: 0 }}>Everything is stored only on this device, in this browser.</p>
      <button className="btn block" onClick={() => reset(true)}>Load sample data</button>
      <button className="btn block danger" onClick={() => reset(false)}>Start fresh (delete all)</button>
    </Screen>
  );
}

function NumberField({ label, value, onChange, decimal }: { label: string; value: number | null; onChange: (v: string) => void; decimal?: boolean }) {
  return (
    <label className="field grow">
      {label}
      <input className="input" inputMode={decimal ? 'decimal' : 'numeric'} type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Chips<T extends string>({ label, options, value, onChange }: { label: string; options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <span className="muted small">{label}</span>
      <div className="chips">
        {options.map(([v, text]) => (
          <button key={v || 'none'} className={`chip${value === v ? ' on' : ''}`} onClick={() => onChange(v)}>{text}</button>
        ))}
      </div>
    </div>
  );
}
