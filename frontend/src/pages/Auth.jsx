import React from 'react';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { clearOidcLoginStateForRetry, getOidcLoginError, useAuth } from '../AuthContext';
import { dashboardPalette } from '../components/CourseDashboardUI';

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
      <div className="caliber-auth-screen">
        <div className="caliber-auth-card">
          <div className="caliber-auth-mark" style={{ background: dashboardPalette.dangerBg, color: dashboardPalette.dangerText }}>
            <AlertCircle size={22} aria-hidden="true" />
          </div>
          <h2>Sign in could not be completed</h2>
          <p>
            Caliber received an OIDC callback error and paused automatic retries.
          </p>
          <p className="caliber-auth-detail">
            {oidcError}
          </p>
          <button
            type="button"
            onClick={retrySignIn}
            className="caliber-auth-button"
          >
            Try sign in again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="caliber-auth-screen">
      <div className="caliber-auth-card">
        <div className="caliber-auth-mark">
          <Sparkles size={22} aria-hidden="true" />
        </div>
        <h1>Caliber</h1>
        <p>Opening your course workspace.</p>
        <div className="caliber-auth-loading">
          <Loader2 size={18} aria-hidden="true" />
          Redirecting to sign in
        </div>
      </div>
    </div>
  );
}
