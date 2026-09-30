/**
 * Backup = the whole AppData as a JSON file. The only way (for now) to move data to a new phone or keep it safe
 * if the browser clears its storage. Import is validated by parseAppData, so a wrong file is refused, not half-loaded.
 */
import type { AppData } from '../types';
import { DataError, parseAppData } from './validate';

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
