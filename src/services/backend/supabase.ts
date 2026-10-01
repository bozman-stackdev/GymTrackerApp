/**
 * The real backend: Supabase (hosted Postgres + login). Set up with supabase/schema.sql; see docs/ACCOUNTS.md.
 *
 * Security: the key in the app is the public ("publishable"/anon) key. What a user can read or write is enforced by
 * the database's row-level security: only their own rows. Passwords are handled by Supabase Auth, never by us.
 */
import { createClient, isAuthError, type User } from '@supabase/supabase-js';
import { BackendError, OFFLINE_MESSAGE, type Account, type Backend, type RemoteRecord } from './types';

const PAGE = 1000;

/** Supabase errors → messages a user can act on. */
export function friendly(error: unknown, host?: string): BackendError {
  if (error instanceof BackendError) return error;
  if (isAuthError(error)) {
    switch (error.code) {
      case 'invalid_credentials': return new BackendError('Email or password is wrong.');
      case 'email_not_confirmed': return new BackendError('Confirm your email first: enter the code we sent you.');
      case 'user_already_exists':
      case 'email_exists': return new BackendError("There's already an account with this email. Log in instead.");
      case 'otp_expired': return new BackendError('That code is wrong or has expired.');
      case 'weak_password': return new BackendError('Choose a longer password (at least 8 characters).');
      case 'same_password': return new BackendError('Choose a password different from your old one.');
      case 'email_address_invalid': return new BackendError('Check the email address.');
      case 'over_request_rate_limit':
      case 'over_email_send_rate_limit': return new BackendError('Too many attempts. Please wait a few minutes and try again.');
    }
    if (error.status === undefined || error.status === 0) return offline(host);
    return new BackendError(`Something went wrong (${error.message}). Please try again.`);
  }
  if (error instanceof TypeError) return offline(host); // fetch failed
  const message = (error as { message?: string } | null)?.message;
  return new BackendError(message ? `Couldn't sync: ${message}` : 'Something went wrong. Please try again.');
}
/** Names the server, so a wrong address in the settings is easy to spot (it's public anyway). */
const offline = (host?: string) =>
  new BackendError(host ? `Couldn't reach the account server (${host}). Check your internet and try again.` : OFFLINE_MESSAGE);

/**
 * The project URL as Supabase expects it: https://<project>.supabase.co, nothing after it.
 * Forgives common copy-paste slips: the dashboard link, a bare project code, a missing https://, paths like /rest/v1.
 */
export function normalizeSupabaseUrl(raw: string): string {
  const text = raw.trim();
  const fromDashboard = text.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (fromDashboard) return `https://${fromDashboard[1].toLowerCase()}.supabase.co`;
  if (/^[a-z0-9]{15,40}$/i.test(text)) return `https://${text.toLowerCase()}.supabase.co`;
  try {
    return new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`).origin;
  } catch {
    return text;
  }
}

const toAccount = (u: User): Account => ({
  id: u.id,
  email: u.email ?? '',
  displayName: typeof u.user_metadata?.display_name === 'string' ? u.user_metadata.display_name : '',
});

export function supabaseBackend(rawUrl: string, key: string): Backend {
  const url = normalizeSupabaseUrl(rawUrl);
  const host = new URL(url).host;
  const sb = createClient(url, key.trim(), {
    // Codes are typed into the app, so no tokens in URLs (they would clash with the app's #/routes).
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'gymtracker:auth' },
  });

  const run = async <R extends { data: unknown; error: unknown }>(fn: () => PromiseLike<R>): Promise<R['data']> => {
    let result: R;
    try { result = await fn(); } catch (err) { throw friendly(err, host); }
    if (result.error) throw friendly(result.error, host);
    return result.data;
  };
  const userId = async () => {
    const { session } = await run(() => sb.auth.getSession());
    if (!session) throw new BackendError('Please log in again.');
    return session.user.id;
  };

  return {
    async currentAccount() {
      const { session } = await run(() => sb.auth.getSession());
      return session ? toAccount(session.user) : null;
    },
    onAccountChange(listener) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => listener(session ? toAccount(session.user) : null));
      return () => data.subscription.unsubscribe();
    },

    async signUp(email, password, displayName) {
      const data = await run(() => sb.auth.signUp({ email: email.trim(), password, options: { data: { display_name: displayName } } }));
      if (data.session) return { status: 'signed-in', account: toAccount(data.session.user) };
      // With email confirmation on, Supabase answers the same whether or not the email is already registered
      // (so nobody can find out who has an account). Either way: "check your email".
      return { status: 'check-email' };
    },
    async confirmSignUp(email, code) {
      const data = await run(() => sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' }));
      if (!data.user) throw new BackendError('That code is wrong or has expired.');
      return toAccount(data.user);
    },
    async signIn(email, password) {
      const data = await run(() => sb.auth.signInWithPassword({ email: email.trim(), password }));
      if (!data.user) throw new BackendError('Email or password is wrong.');
      return toAccount(data.user);
    },
    async signOut() {
      // Local: this phone only. Never fails because of a dead connection.
      await sb.auth.signOut({ scope: 'local' }).catch(() => {});
    },
    async sendPasswordReset(email) {
      await run(() => sb.auth.resetPasswordForEmail(email.trim()));
    },
    async resetPassword(email, code, newPassword) {
      const data = await run(() => sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' }));
      if (!data.user) throw new BackendError('That code is wrong or has expired.');
      const updated = await run(() => sb.auth.updateUser({ password: newPassword }));
      return toAccount(updated.user ?? data.user);
    },
    async deleteAccount() {
      await run(async () => await sb.rpc('delete_my_account'));
      await sb.auth.signOut({ scope: 'local' }).catch(() => {});
    },

    async pull(since) {
      const uid = await userId();
      const records: RemoteRecord[] = [];
      for (let from = 0; ; from += PAGE) {
        const rows = await run(async () => {
          let q = sb.from('records').select('kind,id,data,deleted,updated_at').eq('user_id', uid)
            .order('updated_at').order('kind').order('id').range(from, from + PAGE - 1);
          if (since) q = q.gt('updated_at', since);
          return await q;
        });
        for (const r of rows ?? []) {
          records.push({ kind: r.kind as RemoteRecord['kind'], id: r.id as string, data: r.data, deleted: !!r.deleted, updatedAt: r.updated_at as string });
        }
        if (!rows || rows.length < PAGE) break;
      }
      return { records, cursor: records.at(-1)?.updatedAt ?? since };
    },
    async push(upserts, deletes) {
      const uid = await userId();
      const rows = [
        ...upserts.map((r) => ({ user_id: uid, kind: r.kind, id: r.id, data: r.data, deleted: false })),
        ...deletes.map((r) => ({ user_id: uid, kind: r.kind, id: r.id, data: null, deleted: true })),
      ];
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        await run(async () => await sb.from('records').upsert(chunk, { onConflict: 'user_id,kind,id' }));
      }
    },
  };
}
