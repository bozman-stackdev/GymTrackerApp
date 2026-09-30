import { useRef, useState } from 'react';
import { useAppState } from '../data/store';
import { readBackupFile } from '../data/backup';
import { createSampleData, createStarterData } from '../data/seed';

/** First run (or unreadable data): start your own, explore the sample, or restore a backup. */
export function WelcomeScreen() {
  const { replace, loadError } = useAppState();
  const file = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const restore = async (f: File | undefined) => {
    if (!f) return;
    try {
      replace(await readBackupFile(f));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read that file.');
    }
  };

  return (
    <main className="screen full welcome">
      <div className="welcome-hero">
        <div className="welcome-icon" aria-hidden>🏋️</div>
        <h1>Gym Tracker</h1>
        <p className="muted">Spend less time tracking your workout and more time doing it.</p>
      </div>

      {loadError && (
        <div className="alert" role="alert">
          Your saved data couldn't be read ({loadError}). A copy was kept on this device. You can restore a backup below.
        </div>
      )}

      <button className="btn primary huge" onClick={() => replace(createStarterData())}>Start my own</button>
      <p className="muted small center welcome-note">Includes 3 starter routines (Push, Pull, Legs) you can edit.</p>

      <button className="btn block" onClick={() => replace(createSampleData())}>Try with sample data</button>
      <p className="muted small center welcome-note">5 weeks of example workouts, to see challenges and progress.</p>

      <input ref={file} type="file" accept="application/json,.json" hidden data-testid="restore-input" onChange={(e) => restore(e.target.files?.[0])} />
      <button className="btn ghost block" onClick={() => file.current?.click()}>Restore a backup</button>
      {importError && <p className="warn center" role="alert">{importError}</p>}

      <p className="muted small center">
        Everything stays on this phone. No account needed.
        <br />Tip: add the app to your Home Screen, so your phone keeps your data (and it opens like an app).
      </p>
    </main>
  );
}
