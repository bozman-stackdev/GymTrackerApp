import { AuthError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { friendly } from './supabase';
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
