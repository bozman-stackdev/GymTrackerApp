/**
 * The ONLY module that touches browser storage.
 * To move to a real database / native storage later, replace these two functions.
 */
import type { AppData } from '../types';
import { createSampleData } from './seed';

const KEY = 'gymtracker:data';

export function loadData(storage: Storage = localStorage): AppData {
  const raw = storage.getItem(KEY);
  try {
    if (raw) return migrate(JSON.parse(raw));
  } catch (err) {
    // Keep a copy so unreadable data is never silently lost when we save over it.
    storage.setItem(`${KEY}:backup-${Date.now()}`, raw ?? '');
    console.error('Could not read saved data, starting with sample data', err);
  }
  return createSampleData();
}

export function saveData(data: AppData, storage: Storage = localStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify(data));
  } catch (err) {
    // Most likely the ~5 MB quota is full (e.g. too many photos).
    console.error('Could not save data', err);
    alert('Could not save - browser storage is full. Try removing exercise photos.');
  }
}

/** Upgrade older saved shapes to the current one. Add a case whenever AppData.version changes. */
function migrate(data: AppData): AppData {
  if (data.version !== 1) throw new Error(`Unknown data version ${String(data.version)}`);
  return data;
}
