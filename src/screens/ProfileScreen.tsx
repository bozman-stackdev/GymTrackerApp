import { useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { saveProfile } from '../data/actions';
import { createStarterData, createSampleData } from '../data/seed';
import { exportBackup, readBackupFile } from '../data/backup';
import { relativeDay } from '../logic/history';
import { feedbackUrl } from '../services/feedback';
import { useStore } from '../data/store';
import { validateProfile } from '../data/validate';
import { fromDisplay, toDisplay, type Units } from '../logic/units';
import { useProgress } from '../data/useProgress';
import { AchievementList, LevelBar, PersonalBestList, streakText } from '../components/ProgressWidgets';
import { ACHIEVEMENTS } from '../logic/game/achievements';
import type { Experience, Goal, Profile, Sex } from '../types';

const UNITS: [Units, string][] = [['kg', 'kg'], ['lb', 'lb']];
const SEXES: [Sex, string][] = [['male', 'Male'], ['female', 'Female'], ['other', 'Other'], ['', 'Prefer not to say']];
const EXPERIENCE: [Experience, string][] = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']];
const GOALS: [Goal, string][] = [['strength', 'Strength'], ['muscle', 'Build muscle'], ['general', 'General fitness']];

export function ProfileScreen() {
  const { data, update, replace } = useStore();
  const progress = useProgress();
  const [p, setP] = useState<Profile>(data.profile);
  const [saved, setSaved] = useState(false);
  const change = <K extends keyof Profile>(key: K, value: Profile[K]) => { setP({ ...p, [key]: value }); setSaved(false); };
  const num = (v: string) => (v === '' ? null : Number(v));

  const units: Units = p.units ?? 'kg';
  const errors = validateProfile(p);
  const valid = Object.keys(errors).length === 0;
  const bmi = valid && p.heightCm && p.weightKg ? p.weightKg / (p.heightCm / 100) ** 2 : null;
  const restoreInput = useRef<HTMLInputElement>(null);
  const [dataMessage, setDataMessage] = useState<string | null>(null);

  const exportNow = () => {
    exportBackup(data, update);
    setDataMessage('Backup saved. Keep the file somewhere safe (e.g. cloud drive).');
  };
  const restore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const backup = await readBackupFile(file);
      if (!confirm(`Replace ALL data on this phone with this backup (${backup.sessions.length} workouts)?`)) return;
      replace(backup);
      setP(backup.profile);
      setDataMessage(`Restored ${backup.sessions.length} workouts.`);
    } catch (err) {
      setDataMessage(err instanceof Error ? err.message : 'Could not read that file.');
    }
  };

  const reset = (sample: boolean) => {
    const msg = sample ? 'Replace ALL your data with sample data?' : 'Delete ALL your data (history, routines, profile)?';
    if (!confirm(msg)) return;
    const fresh = sample ? createSampleData() : createStarterData();
    replace(fresh);
    setP(fresh.profile);
  };

  return (
    <Screen title="Profile">
      <h2>Progress</h2>
      <div className="card stack" data-testid="progress">
        <LevelBar level={progress.level} />
        <div className="row small between">
          <span>{streakText(progress.streakWeeks)}</span>
          <span data-testid="challenges-count">🎯 {progress.stats.challengesCompleted} challenges</span>
        </div>
      </div>
      <details className="card">
        <summary><strong>Achievements</strong> <span className="muted small">{progress.achievements.length} / {ACHIEVEMENTS.length}</span></summary>
        <div style={{ marginTop: 12 }}><AchievementList unlocked={progress.achievements.map((a) => a.id)} /></div>
      </details>
      <details className="card">
        <summary><strong>Personal bests</strong> <span className="muted small">{progress.personalBests.length}</span></summary>
        <div style={{ marginTop: 8 }}><PersonalBestList bests={progress.personalBests} /></div>
      </details>

      <h2>About you</h2>
      <label className="field">
        Name
        <input className="input" value={p.name} maxLength={60} aria-invalid={!!errors.name} onChange={(e) => change('name', e.target.value)} />
        {errors.name && <span className="field-error">{errors.name}</span>}
      </label>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <NumberField label="Age" value={p.age} error={errors.age} onChange={(v) => change('age', num(v))} />
        <NumberField label="Height (cm)" value={p.heightCm} error={errors.heightCm} onChange={(v) => change('heightCm', num(v))} />
        <NumberField label={`Weight (${units})`} value={p.weightKg === null ? null : Math.round(toDisplay(p.weightKg, units) * 10) / 10}
          error={errors.weightKg} onChange={(v) => change('weightKg', v === '' ? null : fromDisplay(Number(v), units))} decimal />
      </div>
      {bmi && <p className="muted small flush">BMI {bmi.toFixed(1)}</p>}

      <Chips label="Units" options={UNITS} value={units} onChange={(v) => change('units', v)} />
      <Chips label="Sex" options={SEXES} value={p.sex} onChange={(v) => change('sex', v)} />
      <Chips label="Experience" options={EXPERIENCE} value={p.experience} onChange={(v) => change('experience', v)} />
      <Chips label="Goal" options={GOALS} value={p.goal} onChange={(v) => change('goal', v)} />

      <button className="btn primary huge" disabled={!valid} onClick={() => { update((d) => saveProfile(d, { ...p, name: p.name.trim() })); setSaved(true); }}>
        {saved ? '✓ Saved' : 'Save'}
      </button>

      <h2>Feedback</h2>
      <a className="btn block" href={feedbackUrl()} target="_blank" rel="noopener noreferrer" data-testid="feedback">💬 Send feedback</a>
      <p className="muted small flush">Includes the app version and device type only - never your workouts.</p>

      <h2>Data</h2>
      <p className="muted small flush">
        Everything is stored only on this phone, in this browser. Export a backup now and then, or before changing phones.
        On iPhone, add the app to your Home Screen: Safari may clear data of websites you haven't opened for a week.
      </p>
      <button className="btn block" onClick={exportNow}>Export backup</button>
      {data.backup?.lastExportAt && <p className="muted small center flush">Last backup {relativeDay(data.backup.lastExportAt)}</p>}
      <input ref={restoreInput} type="file" accept="application/json,.json" hidden data-testid="profile-restore-input" onChange={(e) => restore(e.target.files?.[0])} />
      <button className="btn block" onClick={() => restoreInput.current?.click()}>Restore backup</button>
      {dataMessage && <p className="small center" role="status">{dataMessage}</p>}
      <button className="btn block ghost" onClick={() => reset(true)}>Load sample data</button>
      <button className="btn block ghost danger" onClick={() => reset(false)}>Start fresh (delete all)</button>
    </Screen>
  );
}

function NumberField({ label, value, error, onChange, decimal }: {
  label: string; value: number | null; error?: string; onChange: (v: string) => void; decimal?: boolean;
}) {
  return (
    <label className="field grow">
      {label}
      <input className="input" inputMode={decimal ? 'decimal' : 'numeric'} type="number" value={value ?? ''} aria-invalid={!!error} onChange={(e) => onChange(e.target.value)} />
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

function Chips<T extends string>({ label, options, value, onChange }: { label: string; options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <span className="muted small">{label}</span>
      <div className="chips">
        {options.map(([v, text]) => (
          <button key={v || 'none'} className={`chip${value === v ? ' on' : ''}`} aria-pressed={value === v} onClick={() => onChange(v)}>{text}</button>
        ))}
      </div>
    </div>
  );
}
