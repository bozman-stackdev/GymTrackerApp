import { AuthError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { friendly, normalizeSupabaseUrl } from './supabase';
import { BackendError, OFFLINE_MESSAGE } from './types';

describe('Supabase errors become messages a user can act on', () => {
  it.each([
    ['invalid_credentials', 'Email or password is wrong.'],
    ['email_not_confirmed', 'Confirm your email first: enter the code we sent you.'],
    ['user_already_exists', "There's already an account with this email. Log in instead."],
    ['otp_expired', 'That code is wrong or has expired.'],
    ['weak_password', 'Choose a longer password (at least 8 characters).'],
    ['over_email_send_rate_limit', 'Too many attempts. Please wait a few minutes and try again.'],
  ])('%s', (code, message) => {
    const err = friendly(new AuthError('raw', 400, code));
    expect(err).toBeInstanceOf(BackendError);
    expect(err.message).toBe(message);
  });

  it('no connection (fetch failed, or an auth error without a status)', () => {
    expect(friendly(new TypeError('Failed to fetch')).message).toBe(OFFLINE_MESSAGE);
    expect(friendly(new AuthError('fetch failed')).message).toBe(OFFLINE_MESSAGE);
  });

  it('database errors and unknown auth errors keep a hint of the cause', () => {
    expect(friendly({ message: 'permission denied for table records' }).message).toBe("Couldn't sync: permission denied for table records");
    expect(friendly(new AuthError('Something odd', 500, 'unexpected_failure')).message).toContain('Something odd');
    const mine = new BackendError('already friendly');
    expect(friendly(mine)).toBe(mine);
  });
});

describe('the project URL is forgiving about copy-paste slips', () => {
  it.each([
    ['https://abcdefghijklmnopqrst.supabase.co', 'https://abcdefghijklmnopqrst.supabase.co'],
    ['  https://abcdefghijklmnopqrst.supabase.co/  ', 'https://abcdefghijklmnopqrst.supabase.co'],
    ['https://abcdefghijklmnopqrst.supabase.co/rest/v1/', 'https://abcdefghijklmnopqrst.supabase.co'],
    ['abcdefghijklmnopqrst.supabase.co', 'https://abcdefghijklmnopqrst.supabase.co'],
    ['https://supabase.com/dashboard/project/abcdefghijklmnopqrst/settings/api', 'https://abcdefghijklmnopqrst.supabase.co'],
    ['abcdefghijklmnopqrst', 'https://abcdefghijklmnopqrst.supabase.co'],
  ])('%s', (raw, expected) => {
    expect(normalizeSupabaseUrl(raw)).toBe(expected);
  });

  it('an unreachable server is named in the message', () => {
    expect(friendly(new TypeError('Load failed'), 'abc.supabase.co').message).toBe(
      "Couldn't reach the account server (abc.supabase.co). Check your internet and try again.");
  });
});
