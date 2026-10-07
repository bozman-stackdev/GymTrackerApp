/**
 * Accounts + sync. The app talks ONLY to this interface; `supabase.ts` is the real backend and `memory.ts` a fake
 * one (unit tests, end-to-end tests). The phone stays the working copy: the server is a synced copy (see sync.ts).
 */

import type { LeaderboardRecord, LeaderboardResult } from '../../logic/leaderboard/rank';
import type { DayPoints, LeaderboardPeriod } from '../../logic/leaderboard/score';

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

  /** `leaderboard`: the user ticked "Show me on the leaderboard". */
  signUp(email: string, password: string, displayName: string, leaderboard?: boolean): Promise<SignUpResult>;
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

  // ---------- Public profile and leaderboard (docs/LEADERBOARD.md) ----------
  getPublicProfile(): Promise<PublicProfile>;
  updatePublicProfile(change: Partial<PublicProfile>): Promise<PublicProfile>;
  /** Sets the account's leaderboard points for these days; `removeDays` no longer have any. */
  publishLeaderboard(days: DayPoints[], removeDays: string[]): Promise<void>;
  /** Removes all of the account's leaderboard points (when it stops being visible). */
  clearLeaderboard(): Promise<void>;
  /** The board as this account sees it. `today` is the phone's local date (YYYY-MM-DD). */
  leaderboard(period: LeaderboardPeriod, today: string): Promise<LeaderboardResult>;
  leaderboardRecord(today: string): Promise<LeaderboardRecord>;
  /** Development tools of the fake backend only (never present in the published app). */
  dev?: DevTools;
}

/** What other people may see: the display name, and only if the user chose to appear on the leaderboard. */
export interface PublicProfile {
  displayName: string;
  leaderboardVisible: boolean;
}

export type DevScenario = 'default' | 'first' | 'top10' | 'top100' | 'bottom' | 'movingUp' | 'movingDown' | 'noActivity' | 'hidden' | 'empty';

export interface DevTools {
  scenarios: { id: DevScenario; label: string }[];
  scenario(): DevScenario;
  setScenario(s: DevScenario): void;
}

export type { DayPoints, LeaderboardPeriod } from '../../logic/leaderboard/score';
export type { LeaderboardRecord, LeaderboardResult, LeaderboardRow } from '../../logic/leaderboard/rank';

/** A failure with a message that can be shown to the user as-is. */
export class BackendError extends Error {}

export const OFFLINE_MESSAGE = 'No connection. Check your internet and try again.';
