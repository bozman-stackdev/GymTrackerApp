import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AccountForm, type AccountMode } from '../components/AccountForm';
import { Screen } from '../components/Screen';
import { useAccount } from '../data/account';
import { useStore } from '../data/store';

/** /account?mode=signup|login - optional account for backup and sync. */
export function AccountScreen() {
  const [params] = useSearchParams();
  const { data } = useStore();
  const { available, account, connect } = useAccount();
  const navigate = useNavigate();
  if (!available || account) return <Navigate to="/profile" replace />;

  const mode = params.get('mode') === 'signup' ? 'signup' : 'login';
  return (
    <Screen title="Account" back>
      <AccountForm
        key={mode} // a new ?mode= link starts the form over
        initialMode={mode as AccountMode}
        note={data.isSample ? 'The sample data is not saved to an account: it will be replaced by your account.' : undefined}
        onSignedIn={async (a) => {
          await connect(a);
          navigate('/profile', { replace: true });
        }}
      />
    </Screen>
  );
}
