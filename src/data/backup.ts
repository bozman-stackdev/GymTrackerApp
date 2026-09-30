/**
 * Backup = the whole AppData as a JSON file. The only way (for now) to move data to a new phone or keep it safe
 * if the browser clears its storage. Import is validated by parseAppData, so a wrong file is refused, not half-loaded.
 */
import type { AppData } from '../types';
import { DataError, parseAppData } from './validate';

const DAY = 86_400_000;

export function backupFileName(now = new Date()): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `gym-tracker-backup-${d}.json`;
}

export function serializeBackup(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

export function parseBackup(text: string): AppData {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new DataError("This file isn't a Gym Tracker backup.");
  }
  return parseAppData(json);
}

export async function readBackupFile(file: File): Promise<AppData> {
  if (file.size > 20 * 1024 * 1024) throw new DataError('This file is too big to be a Gym Tracker backup.');
  return parseBackup(await file.text());
}

/** Saves text as a file (on phones this opens the share/save sheet). */
export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const BACKUP_REMINDER = { minWorkouts: 3, everyDays: 14, snoozeDays: 7 };

/** Gentle reminder: 3+ workouts not backed up and 14+ days since the last export (or first workout). Never mid-workout. */
export function needsBackupReminder(data: AppData, now = new Date(), cfg = BACKUP_REMINDER): boolean {
  if (data.isSample || data.activeWorkout) return false;
  const { lastExportAt, remindAfter } = data.backup ?? {};
  if (remindAfter && now.getTime() < Date.parse(remindAfter)) return false;
  const finished = data.sessions.filter((s) => s.finishedAt);
  const notBackedUp = finished.filter((s) => !lastExportAt || s.finishedAt! > lastExportAt);
  if (notBackedUp.length < cfg.minWorkouts) return false;
  const since = lastExportAt ?? finished.map((s) => s.startedAt).sort()[0];
  return now.getTime() - Date.parse(since) >= cfg.everyDays * DAY;
}

export function markBackedUp(data: AppData, now = new Date()): AppData {
  return { ...data, backup: { lastExportAt: now.toISOString() } };
}

export function snoozeBackupReminder(data: AppData, now = new Date(), cfg = BACKUP_REMINDER): AppData {
  return { ...data, backup: { ...data.backup, remindAfter: new Date(now.getTime() + cfg.snoozeDays * DAY).toISOString() } };
}

/** Downloads a backup and records it (so the reminder resets). */
export function exportBackup(data: AppData, update: (fn: (d: AppData) => AppData) => void): void {
  downloadText(backupFileName(), serializeBackup(data));
  update((d) => markBackedUp(d));
}
