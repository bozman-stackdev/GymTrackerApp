import { describe, expect, it } from 'vitest';
import { deleteSession, editSet, finishWorkout, logSet, saveRoutine, startWorkout } from '../../data/actions';
import { createSampleData, createStarterData } from '../../data/seed';
import type { AppData } from '../../types';
import { memoryBackend, memoryServer } from './memory';
import { applyPatch, dataFromAccount, fingerprint, loadSyncState, saveSyncState, stableStringify, syncOnce, toRecords, type SyncState } from './sync';
import { BackendError, type Backend } from './types';
import { S } from '../../test/helpers';

/** A phone: its data, its sync state and its connection to the shared server. */
class Phone {
  state: SyncState;
  constructor(public backend: Backend, public data: AppData, accountId: string) {
    this.state = { accountId, cursor: null, synced: {} };
  }
  async sync() {
    const r = await syncOnce(this.backend, () => this.data, this.state);
    this.data = applyPatch(this.data, r.patch);
    this.state = r.state;
    return r;
  }
}

const realData = (): AppData => {
  const { isSample: _s, ...d } = createSampleData();
  return d;
};
const ids = (d: AppData) => d.sessions.map((s) => s.id).sort();

async function twoPhones() {
  const server = memoryServer();
  const a = memoryBackend(server);
  const signedUp = await a.signUp('Alex@Example.com', 'password1', 'Alex');
  if (signedUp.status !== 'signed-in') throw new Error('expected sign-in');
  const phoneA = new Phone(a, realData(), signedUp.account.id);
  await phoneA.sync(); // first phone uploads everything

  const b = memoryBackend(server);
  const account = await b.signIn('alex@example.com', 'password1');
  const phoneB = new Phone(b, await dataFromAccount(b, 'Alex'), account.id);
  await phoneB.sync(); // second phone downloads everything
  return { server, phoneA, phoneB };
}

describe('sync between two phones', () => {
  it('first phone uploads everything; a second phone gets the same data', async () => {
    const { phoneA, phoneB } = await twoPhones();
    expect(phoneA.data.sessions.length).toBeGreaterThan(10);
    expect(ids(phoneB.data)).toEqual(ids(phoneA.data));
    expect(phoneB.data.routines.map((r) => r.id).sort()).toEqual(phoneA.data.routines.map((r) => r.id).sort());
    expect(phoneB.data.equipment).toHaveLength(phoneA.data.equipment.length);
    expect(phoneB.data.profile).toEqual(phoneA.data.profile);
    // Nothing to do on the next sync (the overlap re-pull changes nothing).
    expect(await phoneB.sync()).toMatchObject({ uploaded: 0, downloaded: 0 });
    expect(await phoneA.sync()).toMatchObject({ uploaded: 0, downloaded: 0 });
  });

  it('a new account starts with the starter routines and the display name', async () => {
    const server = memoryServer();
    const b = memoryBackend(server);
    await b.signUp('new@example.com', 'password1', 'Sam');
    const d = await dataFromAccount(b, 'Sam');
    expect(d.profile.name).toBe('Sam');
    expect(d.routines.map((r) => r.id)).toEqual(['push', 'pull', 'legs']);
  });

  it('new workouts, deletions and edits travel both ways; the workout in progress stays on the phone', async () => {
    const { phoneA, phoneB } = await twoPhones();
    const set = { reps: 10, weightKg: 50 };

    phoneA.data = startWorkout(phoneA.data, phoneA.data.routines[0]);
    phoneA.data = logSet(phoneA.data, 0, set);
    expect(await phoneA.sync()).toMatchObject({ uploaded: 0 }); // in progress: not uploaded
    phoneA.data = finishWorkout(phoneA.data);
    const newId = phoneA.data.sessions.at(-1)!.id;
    expect(await phoneA.sync()).toMatchObject({ uploaded: 1 });
    await phoneB.sync();
    expect(ids(phoneB.data)).toContain(newId);

    // B fixes a set in that workout, then deletes another workout.
    phoneB.data = editSet(phoneB.data, newId, 0, 0, { reps: 12, weightKg: 50 });
    const gone = phoneB.data.sessions[0].id;
    phoneB.data = deleteSession(phoneB.data, gone);
    expect(await phoneB.sync()).toMatchObject({ uploaded: 2 });
    await phoneA.sync();
    expect(ids(phoneA.data)).not.toContain(gone);
    expect(S(phoneA.data.sessions.find((s) => s.id === newId)!.entries[0]).sets[0].reps).toBe(12);
  });

  it('when both phones changed the same routine, the phone that syncs last keeps its version everywhere', async () => {
    const { phoneA, phoneB } = await twoPhones();
    const push = phoneA.data.routines.find((r) => r.id === 'push')!;
    phoneA.data = saveRoutine(phoneA.data, { ...push, name: 'Push (A)' });
    phoneB.data = saveRoutine(phoneB.data, { ...push, name: 'Push (B)' });
    await phoneA.sync();
    await phoneB.sync(); // B changed it since its last sync: B's version wins and is uploaded
    await phoneA.sync();
    expect(phoneA.data.routines.find((r) => r.id === 'push')!.name).toBe('Push (B)');
    expect(phoneB.data.routines.find((r) => r.id === 'push')!.name).toBe('Push (B)');
  });

  it('a phone meeting an account for the first time takes the account version of items both have', async () => {
    const { server, phoneA } = await twoPhones();
    const push = phoneA.data.routines.find((r) => r.id === 'push')!;
    phoneA.data = saveRoutine(phoneA.data, { ...push, name: 'My push day' });
    await phoneA.sync();
    // A third phone with its own (starter) data logs in: merge, account wins on "push", its own workouts are kept.
    const c = memoryBackend(server);
    const account = await c.signIn('alex@example.com', 'password1');
    let own = startWorkout(createStarterData(), undefined);
    own = finishWorkout(logSet({ ...own, activeWorkout: { ...own.activeWorkout!, session: { ...own.activeWorkout!.session, entries: [{ exerciseId: 'leg-press', targetSets: 3, sets: [] }] } } }, 0, { reps: 8, weightKg: 100 }));
    const phoneC = new Phone(c, own, account.id);
    await phoneC.sync();
    expect(phoneC.data.routines.find((r) => r.id === 'push')!.name).toBe('My push day');
    expect(phoneC.data.sessions.length).toBe(phoneA.data.sessions.length + 1);
    await phoneA.sync();
    expect(phoneA.data.sessions.length).toBe(phoneC.data.sessions.length); // C's own workout reached A
  });

  it('safety: wiping the phone (or restoring an old backup) does not wipe the account - the data comes back', async () => {
    const { server, phoneA } = await twoPhones();
    const before = ids(phoneA.data);
    phoneA.data = createStarterData(); // e.g. "Start fresh" without logging out
    const r = await phoneA.sync();
    expect(r.restored).toBeGreaterThan(10);
    expect(ids(phoneA.data)).toEqual(before);
    expect(server.read().records.filter((x) => x.kind === 'session' && !x.deleted)).toHaveLength(before.length);
  });

  it('deleting a few workouts at a time is fine', async () => {
    const { server, phoneA } = await twoPhones();
    const [x, y] = phoneA.data.sessions;
    phoneA.data = deleteSession(deleteSession(phoneA.data, x.id), y.id);
    expect(await phoneA.sync()).toMatchObject({ uploaded: 2, restored: 0 });
    expect(server.read().records.filter((r) => r.deleted).map((r) => r.id).sort()).toEqual([x.id, y.id].sort());
  });

  it('ignores invalid records from the server instead of breaking the app', async () => {
    const { phoneA, phoneB } = await twoPhones();
    await phoneA.backend.push([{ kind: 'session', id: 'bad', data: { id: 'bad', entries: 'nope' } }], []);
    const before = phoneB.data;
    await phoneB.sync();
    expect(ids(phoneB.data)).toEqual(ids(before));
  });

  it('offline: the sync fails with a friendly message and the phone keeps its data', async () => {
    const { server, phoneA } = await twoPhones();
    server.offline = true;
    const before = phoneA.data;
    await expect(phoneA.sync()).rejects.toBeInstanceOf(BackendError);
    expect(phoneA.data).toBe(before);
  });

  it('deleting the account removes its data from the server', async () => {
    const { server, phoneA } = await twoPhones();
    await phoneA.backend.deleteAccount();
    expect(server.read().records).toHaveLength(0);
    expect(server.read().users).toHaveLength(0);
    expect(await phoneA.backend.currentAccount()).toBeNull();
  });
});

describe('sync building blocks', () => {
  it('fingerprints ignore key order (the server may reorder keys)', () => {
    expect(stableStringify({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: undefined } })).toBe('{"a":{"d":[1,{"x":1,"y":2}]},"b":1}');
    expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1 }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
  });

  it('only finished workouts, exercises, routines, machines and the profile are synced', () => {
    const d = startWorkout(realData(), undefined);
    const kinds = new Set(toRecords(d).map((r) => r.kind));
    expect([...kinds].sort()).toEqual(['equipment', 'exercise', 'profile', 'routine', 'session']);
    expect(toRecords(d).some((r) => r.id === d.activeWorkout!.session.id)).toBe(false);
  });

  it('sync state belongs to one account', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } as Storage;
    saveSyncState({ accountId: 'a', cursor: '2026-01-01T00:00:00.000Z', synced: { 'session:1': 'x' } }, storage);
    expect(loadSyncState('a', storage).synced).toEqual({ 'session:1': 'x' });
    expect(loadSyncState('b', storage)).toEqual({ accountId: 'b', cursor: null, synced: {} });
    saveSyncState(null, storage);
    expect(loadSyncState('a', storage).cursor).toBeNull();
  });
});
