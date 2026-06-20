import React from 'react';
import { clearOidcLoginStateForRetry, getOidcLoginError, useAuth } from '../AuthContext';

export default function Auth() {
  const { signIn } = useAuth();
  const kickedOffRef = React.useRef(false);
  const [oidcError, setOidcError] = React.useState(() => getOidcLoginError());

  React.useEffect(() => {
    if (oidcError) return;
    if (kickedOffRef.current) return;
    kickedOffRef.current = true;
    signIn();
  }, [oidcError, signIn]);

  const retrySignIn = () => {
    clearOidcLoginStateForRetry();
    setOidcError('');
    kickedOffRef.current = false;
  };

  if (oidcError) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#4b5563' }}>
        <h2 style={{ color: '#111827', marginBottom: '0.75rem' }}>Sign in could not be completed</h2>
        <p style={{ margin: '0 auto 1rem', maxWidth: 620 }}>
          Caliber received an OIDC callback error and paused automatic retries.
        </p>
        <p style={{ margin: '0 auto 1.5rem', maxWidth: 620, fontSize: '0.9rem' }}>
          {oidcError}
        </p>
        <button
          type="button"
          onClick={retrySignIn}
          style={{
            border: 0,
            borderRadius: 6,
            background: '#2563eb',
            color: 'white',
            cursor: 'pointer',
            fontWeight: 700,
            padding: '0.75rem 1rem',
          }}
        >
          Try sign in again
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#4b5563' }}>
      Redirecting to sign in...
    </div>
  );
}
