/**
 * Accounts + sync. The app talks ONLY to this interface; `supabase.ts` is the real backend and `memory.ts` a fake
 * one (unit tests, end-to-end tests). The phone stays the working copy: the server is a synced copy (see sync.ts).
 */

/** What is synced. Everything else (workout in progress, backup dates, sample flag) stays on the phone. */
export type RecordKind = 'session' | 'exercise' | 'routine' | 'equipment' | 'profile';

export interface SyncRecord {
  kind: RecordKind;
  id: string;
  data: unknown;
}

export interface RecordRef {
  kind: RecordKind;
  id: string;
}

/** A record as the server has it. Deletions are kept as "tombstones" so other phones learn about them. */
export interface RemoteRecord extends SyncRecord {
  deleted: boolean;
  /** Server time of the last change: the pull cursor. */
  updatedAt: string;
}

export interface Account {
  id: string;
  email: string;
  displayName: string;
}

export type SignUpResult =
  | { status: 'signed-in'; account: Account }
  /** Email confirmation is on: a code was emailed, finish with confirmSignUp. */
  | { status: 'check-email' };

export interface Backend {
  /** The account signed in on this device, if any (kept between app launches). */
  currentAccount(): Promise<Account | null>;
  /** Signed in / out elsewhere (e.g. the session expired). Returns an unsubscribe function. */
  onAccountChange(listener: (account: Account | null) => void): () => void;

  signUp(email: string, password: string, displayName: string): Promise<SignUpResult>;
  confirmSignUp(email: string, code: string): Promise<Account>;
  signIn(email: string, password: string): Promise<Account>;
  signOut(): Promise<void>;
  /** Emails a code. Codes (not links) work inside the installed app, where email links would open the browser. */
  sendPasswordReset(email: string): Promise<void>;
  resetPassword(email: string, code: string, newPassword: string): Promise<Account>;
  /** Deletes the account and everything stored for it on the server. */
  deleteAccount(): Promise<void>;

  /** Records changed after `since` (all of them when null), oldest first, and the new cursor. */
  pull(since: string | null): Promise<{ records: RemoteRecord[]; cursor: string | null }>;
  push(upserts: SyncRecord[], deletes: RecordRef[]): Promise<void>;
}

/** A failure with a message that can be shown to the user as-is. */
export class BackendError extends Error {}

export const OFFLINE_MESSAGE = 'No connection. Check your internet and try again.';
