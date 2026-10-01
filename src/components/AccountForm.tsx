import { useState, type FormEvent } from 'react';
import { useAccount } from '../data/account';
import { accountEmails, BackendError, type Account } from '../services/backend';

export type AccountMode = 'signup' | 'login' | 'confirm' | 'forgot' | 'reset';

export const PASSWORD_MIN = 8;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sign up / log in / confirm with a code / reset a forgotten password. Calls onSignedIn when done. */
export function AccountForm({ initialMode = 'login', onSignedIn, note }: {
  initialMode?: AccountMode;
  onSignedIn: (account: Account) => Promise<void> | void;
  /** Shown above the button, e.g. "your sample data will be replaced". */
  note?: string;
}) {
  const { backend } = useAccount();
  const [mode, setMode] = useState<AccountMode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const go = (m: AccountMode) => { setMode(m); setError(null); setInfo(null); setCode(''); };
  const needsPassword = mode === 'signup' || mode === 'login' || mode === 'reset';
  const problem =
    (mode === 'signup' && !name.trim() && 'Add a display name') ||
    (mode === 'signup' && name.trim().length > 30 && 'Keep the display name under 30 characters') ||
    (!EMAIL.test(email.trim()) && 'Enter your email address') ||
    (needsPassword && password.length < PASSWORD_MIN && `Password: at least ${PASSWORD_MIN} characters`) ||
    ((mode === 'confirm' || mode === 'reset') && !/^\d{6,10}$/.test(code.trim()) && 'Enter the code from the email') ||
    null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (problem || busy) return;
    setBusy(true);
    setError(null);
    try {
      const b = await backend();
      let account: Account | null = null;
      if (mode === 'signup') {
        const r = await b.signUp(email, password, name.trim());
        if (r.status === 'signed-in') account = r.account;
        else { go('confirm'); setInfo(`We emailed a code to ${email.trim()}. Enter it below.`); }
      } else if (mode === 'login') {
        account = await b.signIn(email, password);
      } else if (mode === 'confirm') {
        account = await b.confirmSignUp(email, code);
      } else if (mode === 'forgot') {
        await b.sendPasswordReset(email);
        go('reset');
        setPassword('');
        setInfo(`If ${email.trim()} has an account, we've emailed it a code.`);
      } else {
        account = await b.resetPassword(email, code, password);
      }
      if (account) await onSignedIn(account);
    } catch (err) {
      if (!(err instanceof BackendError)) console.error(err); // expected ones (wrong password…) are shown, not logged
      setError(err instanceof BackendError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const title = { signup: 'Create account', login: 'Log in', confirm: 'Confirm your email', forgot: 'Forgot password', reset: 'Choose a new password' }[mode];
  const button = { signup: 'Create account', login: 'Log in', confirm: 'Confirm', forgot: 'Email me a code', reset: 'Save new password' }[mode];

  return (
    <form className="stack" onSubmit={submit} noValidate data-testid="account-form">
      <h2 className="flush">{title}</h2>
      {info && <p className="small flush" role="status">{info}</p>}

      {mode === 'signup' && (
        <div className="account-field">
          <label className="field">
            Display name
            <input className="input" value={name} maxLength={30} autoComplete="nickname" placeholder="e.g. Alex" aria-describedby="name-hint" onChange={(e) => setName(e.target.value)} />
          </label>
          <span id="name-hint" className="muted small">Shown to friends in leaderboards later. Not your email.</span>
        </div>
      )}
      {mode !== 'confirm' && mode !== 'reset' && (
        <label className="field">
          Email
          <input className="input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      )}
      {(mode === 'confirm' || mode === 'reset') && (
        <label className="field">
          Code from the email
          <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        </label>
      )}
      {needsPassword && (
        <div className="account-field">
          <label htmlFor="account-password" className="field-label">{mode === 'reset' ? 'New password' : 'Password'}</label>
          <div className="row">
            <input id="account-password" className="input grow" type={showPassword ? 'text' : 'password'} value={password}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} aria-describedby={mode !== 'login' ? 'password-hint' : undefined}
              onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="btn ghost" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {mode !== 'login' && <span id="password-hint" className="muted small">At least {PASSWORD_MIN} characters.</span>}
        </div>
      )}

      {mode === 'signup' && (
        <p className="muted small flush" data-testid="privacy-note">
          Your workouts, routines, machines and profile are saved to your account so you can use them on any phone.
          Photos are never saved. You can delete your account and everything in it at any time (Profile → Account).
        </p>
      )}
      {note && (mode === 'login' || mode === 'signup') && <p className="small flush">{note}</p>}
      {error && <p className="field-error flush" role="alert">{error}</p>}

      <button type="submit" className="btn primary huge" disabled={busy || !!problem}>{busy ? 'Please wait…' : button}</button>
      {problem && (email || password || name || code) && <p className="muted small center flush">{problem}</p>}

      <div className="stack account-links">
        {/* Without an email service a reset code can't be sent: no button that can only fail. */}
        {mode === 'login' && accountEmails && <button type="button" className="btn ghost" onClick={() => go('forgot')}>Forgot password?</button>}
        {mode === 'login' && <button type="button" className="btn ghost" onClick={() => go('signup')}>New here? Create an account</button>}
        {mode === 'signup' && <button type="button" className="btn ghost" onClick={() => go('login')}>I already have an account</button>}
        {(mode === 'confirm' || mode === 'forgot' || mode === 'reset') && <button type="button" className="btn ghost" onClick={() => go('login')}>Back to log in</button>}
      </div>
    </form>
  );
}
