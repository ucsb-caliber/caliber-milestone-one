import { clearOidcTokens, isDirectOidcEnabled } from './oidcTokens';

const AUTH_USER_STORAGE_KEY = 'caliber-auth-user';
const OIDC_STATE_STORAGE_KEY = 'caliber-oidc-state';
const OIDC_PKCE_VERIFIER_STORAGE_KEY = 'caliber-oidc-pkce-verifier';
const OIDC_POST_LOGIN_HASH_STORAGE_KEY = 'caliber-oidc-post-login-hash';
const PORTAL_BASE_URL = (import.meta.env.VITE_PORTAL_BASE_URL || '').replace(/\/$/, '');
const PORTAL_LOGIN_PATH = '/login?next=%2Fcaliber%2F%23student-courses';

let authRecoveryInProgress = false;

function portalUrl(path) {
  return PORTAL_BASE_URL ? `${PORTAL_BASE_URL}${path}` : path;
}

function clearLocalAuthState() {
  localStorage.removeItem('test-mode');
  localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  clearOidcTokens();
  sessionStorage.removeItem(OIDC_STATE_STORAGE_KEY);
  sessionStorage.removeItem(OIDC_PKCE_VERIFIER_STORAGE_KEY);
  sessionStorage.removeItem(OIDC_POST_LOGIN_HASH_STORAGE_KEY);
}

function buildCleanAppLocation() {
  const url = new URL(window.location.href);
  ['code', 'state', 'session_state', 'iss', 'error', 'error_description', 'logged_out'].forEach((key) => {
    url.searchParams.delete(key);
  });
  if (!url.hash) {
    url.hash = '#student-courses';
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function triggerAuthRecovery(reason = 'auth-failure') {
  if (typeof window === 'undefined') return;
  if (authRecoveryInProgress) return;
  authRecoveryInProgress = true;

  try {
    console.warn(`Auth recovery triggered: ${reason}`);
  } catch {
    // no-op
  }

  clearLocalAuthState();

  if (isDirectOidcEnabled()) {
    window.location.assign(buildCleanAppLocation());
    return;
  }

  window.location.assign(portalUrl(PORTAL_LOGIN_PATH));
}
