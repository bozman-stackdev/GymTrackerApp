/**
 * Offline-first sync between this phone and the account.
 *
 * The phone is the working copy. For every synced record we remember the fingerprint of the version the server has
 * (`SyncState.synced`). A sync then:
 *   1. pulls what changed on the server since last time and applies it - unless this phone changed the same record
 *      since the last sync (then this phone's version wins and is uploaded in step 2);
 *   2. uploads what changed here (new or edited records) and tombstones for records deleted here.
 *
 * Records are matched by id (workouts already have unique ids), so the same workout is never duplicated.
 * When a phone first meets an account, the account's version wins for records both have (e.g. an edited routine).
 *
 * Safety: if one sync would delete many records on the server (e.g. after "restore backup" with an old file), the
 * deletions are not sent: those records are downloaded again instead. Deleting a few at a time works normally.
 */
import { createStarterData } from '../../data/seed';
import { parseAppData } from '../../data/validate';
import type { AppData, Profile } from '../../types';
import type { Backend, RecordKind, RecordRef, RemoteRecord, SyncRecord } from './types';

export interface SyncState {
  accountId: string;
  /** Server time up to which changes have been pulled (null = never). */
  cursor: string | null;
  /** key ("kind:id") → fingerprint of the version the server has. */
  synced: Record<string, string>;
}

export type PatchOp = { op: 'put'; record: SyncRecord } | { op: 'remove'; ref: RecordRef };

export interface SyncResult {
  /** Changes from the server, to apply to the phone's data with applyPatch. */
  patch: PatchOp[];
  state: SyncState;
  uploaded: number;
  downloaded: number;
  /** Records the safety rule downloaded again instead of deleting them on the server. */
  restored: number;
}

export const SYNC_CONFIG = {
  /** Pull a little before the cursor, so a change committed late on the server is never missed (re-applying is harmless). */
  overlapMs: 10_000,
  /** One sync may delete at most this many records on the server... */
  maxDeletes: 10,
  /** ...unless they are less than this share of everything synced. */
  maxDeleteShare: 0.25,
};

const LISTS = { session: 'sessions', exercise: 'exercises', routine: 'routines', equipment: 'equipment' } as const;
type ListKind = keyof typeof LISTS;

export const recordKey = (kind: RecordKind, id: string) => `${kind}:${id}`;

/** The synced part of the app's data. The workout in progress stays on the phone until it's finished. */
export function toRecords(data: AppData): SyncRecord[] {
  return [
    ...data.sessions.filter((s) => s.finishedAt).map((s) => ({ kind: 'session' as const, id: s.id, data: s })),
    ...data.exercises.map((e) => ({ kind: 'exercise' as const, id: e.id, data: e })),
    ...data.routines.map((r) => ({ kind: 'routine' as const, id: r.id, data: r })),
    ...data.equipment.map((m) => ({ kind: 'equipment' as const, id: m.id, data: m })),
    { kind: 'profile' as const, id: 'me', data: data.profile },
  ];
}

/** JSON with sorted keys, so the same content always gives the same text (the server may reorder keys). */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : stableStringify(v))).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Short fingerprint of a record's content (cyrb53). Only used to notice changes, not for security. */
export function fingerprint(data: unknown): string {
  const text = stableStringify(data);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const localFingerprints = (data: AppData) => new Map(toRecords(data).map((r) => [recordKey(r.kind, r.id), fingerprint(r.data)]));

/** A server record is used only if it passes the same checks as a backup file. */
export function isValidRecord(r: SyncRecord): boolean {
  const empty = { version: 1, profile: {}, exercises: [], routines: [], sessions: [], equipment: [] };
  try {
    if (r.kind === 'profile') {
      const p = r.data as Partial<Profile> | null;
      return !!p && typeof p === 'object' && typeof p.name === 'string';
    }
    parseAppData({ ...empty, [LISTS[r.kind]]: [r.data] });
    return (r.data as { id?: unknown }).id === r.id;
  } catch {
    return false;
  }
}

/** Applies server changes to the phone's data. Idempotent: applying the same patch twice changes nothing more. */
export function applyPatch(data: AppData, patch: PatchOp[]): AppData {
  let next = data;
  for (const p of patch) {
    if (p.op === 'put' && p.record.kind === 'profile') {
      next = { ...next, profile: p.record.data as Profile };
    } else if (p.op === 'put') {
      const list = LISTS[p.record.kind as ListKind];
      const items = next[list] as { id: string }[];
      const item = p.record.data as { id: string };
      const i = items.findIndex((x) => x.id === item.id);
      next = { ...next, [list]: i >= 0 ? items.map((x, j) => (j === i ? item : x)) : [...items, item] };
    } else if (p.ref.kind !== 'profile') {
      const list = LISTS[p.ref.kind as ListKind];
      next = { ...next, [list]: (next[list] as { id: string }[]).filter((x) => x.id !== p.ref.id) };
    }
  }
  return next;
}

/** Step 1: which server changes to take. Returns the patch and the updated "what the server has" map. */
export function planRemote(data: AppData, remote: RemoteRecord[], synced: Record<string, string>) {
  const local = localFingerprints(data);
  const next = { ...synced };
  const patch: PatchOp[] = [];
  for (const r of remote) {
    if (!r.deleted && !isValidRecord(r)) continue; // never let bad server data in
    const key = recordKey(r.kind, r.id);
    const localFp = local.get(key);
    const remoteFp = r.deleted ? undefined : fingerprint(r.data);
    const changedHere = key in synced && localFp !== synced[key];
    if (remoteFp) next[key] = remoteFp;
    else delete next[key];
    if (changedHere || localFp === remoteFp) continue; // keep this phone's version / already the same
    patch.push(r.deleted ? { op: 'remove', ref: { kind: r.kind, id: r.id } } : { op: 'put', record: { kind: r.kind, id: r.id, data: r.data } });
  }
  return { patch, synced: next };
}

/** Step 2: what changed on this phone compared with the server. */
export function diffLocal(data: AppData, synced: Record<string, string>) {
  const records = toRecords(data);
  const present = new Set(records.map((r) => recordKey(r.kind, r.id)));
  const upserts = records.filter((r) => fingerprint(r.data) !== synced[recordKey(r.kind, r.id)]);
  const deletes: RecordRef[] = Object.keys(synced)
    .filter((key) => !present.has(key))
    .map((key) => {
      const [kind, ...id] = key.split(':');
      return { kind: kind as RecordKind, id: id.join(':') };
    });
  return { upserts, deletes };
}

/** True when this phone has changes the server doesn't have yet (cheap enough to check after every edit). */
export function hasLocalChanges(data: AppData, synced: Record<string, string>): boolean {
  const { upserts, deletes } = diffLocal(data, synced);
  return upserts.length > 0 || deletes.length > 0;
}

const withOverlap = (cursor: string | null) =>
  cursor && !Number.isNaN(Date.parse(cursor)) ? new Date(Date.parse(cursor) - SYNC_CONFIG.overlapMs).toISOString() : null;

/**
 * One full sync. `getData` returns the phone's current data (it may change while the network calls run).
 * Throws on network/server errors; nothing is lost then, the next sync simply retries.
 */
export async function syncOnce(backend: Backend, getData: () => AppData, state: SyncState): Promise<SyncResult> {
  const pulled = await backend.pull(withOverlap(state.cursor));
  let { patch, synced } = planRemote(getData(), pulled.records, state.synced);
  let cursor = pulled.cursor ?? state.cursor;
  let merged = applyPatch(getData(), patch);
  let { upserts, deletes } = diffLocal(merged, synced);

  let restored = 0;
  const syncedCount = Object.keys(synced).length;
  if (deletes.length > SYNC_CONFIG.maxDeletes && deletes.length > syncedCount * SYNC_CONFIG.maxDeleteShare) {
    // Too many deletions at once: probably not what the user meant. Download those records again instead.
    for (const d of deletes) delete synced[recordKey(d.kind, d.id)];
    const full = await backend.pull(null);
    const again = planRemote(merged, full.records, synced);
    restored = again.patch.filter((p) => p.op === 'put').length;
    patch = [...patch, ...again.patch];
    synced = again.synced;
    cursor = full.cursor ?? cursor;
    merged = applyPatch(merged, again.patch);
    ({ upserts, deletes } = diffLocal(merged, synced));
    deletes = [];
  }

  // Sanity check before anything is uploaded or applied: the merged data must still be valid app data.
  parseAppData(merged);
  if (upserts.length || deletes.length) await backend.push(upserts, deletes);
  for (const r of upserts) synced[recordKey(r.kind, r.id)] = fingerprint(r.data);
  for (const d of deletes) delete synced[recordKey(d.kind, d.id)];

  return {
    patch,
    state: { accountId: state.accountId, cursor, synced },
    uploaded: upserts.length + deletes.length,
    downloaded: patch.length,
    restored,
  };
}

/**
 * Starting data for a phone that has nothing of its own yet (first launch, or sample data) when logging in.
 * A new account starts like "Start my own"; an existing one starts empty and its data arrives with the first sync.
 */
export async function dataFromAccount(backend: Backend, displayName: string): Promise<AppData> {
  const { records } = await backend.pull(null);
  const base = createStarterData();
  if (!records.some((r) => !r.deleted)) return { ...base, profile: { ...base.profile, name: displayName } };
  return { ...base, routines: [] };
}

// ---------- Remembering the sync state on this phone (separate from AppData, so it's never in a backup file) ----------

const KEY = 'gymtracker:sync';

export function loadSyncState(accountId: string, storage: Storage = localStorage): SyncState {
  try {
    const s = JSON.parse(storage.getItem(KEY) ?? 'null') as SyncState | null;
    if (s && s.accountId === accountId && typeof s.synced === 'object' && s.synced) return s;
  } catch { /* unreadable: start over (a fresh sync merges by id, so nothing is duplicated) */ }
  return { accountId, cursor: null, synced: {} };
}

export function saveSyncState(state: SyncState | null, storage: Storage = localStorage): void {
  try {
    if (state) storage.setItem(KEY, JSON.stringify(state));
    else storage.removeItem(KEY);
  } catch { /* storage full: the next sync re-checks everything */ }
}
