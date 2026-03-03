import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  clearOidcTokens,
  getValidAccessToken,
  isDirectOidcEnabled,
  loadOidcTokens,
  storeOidcTokens,
} from './oidcTokens';

const AuthContext = createContext({});
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
const PORTAL_BASE_URL = (import.meta.env.VITE_PORTAL_BASE_URL || '').replace(/\/$/, '');
const AUTH_USER_STORAGE_KEY = 'caliber-auth-user';
const OIDC_ISSUER = (import.meta.env.VITE_OIDC_ISSUER || '').replace(/\/$/, '');
const OIDC_CLIENT_ID = (import.meta.env.VITE_OIDC_CLIENT_ID || 'portal').trim();
const OIDC_SCOPES = (import.meta.env.VITE_OIDC_SCOPES || 'openid profile email').trim();
const OIDC_STATE_STORAGE_KEY = 'caliber-oidc-state';
const OIDC_PKCE_VERIFIER_STORAGE_KEY = 'caliber-oidc-pkce-verifier';
const OIDC_POST_LOGIN_HASH_STORAGE_KEY = 'caliber-oidc-post-login-hash';

function portalUrl(path) {
  return PORTAL_BASE_URL ? `${PORTAL_BASE_URL}${path}` : path;
}

function getPortalLoginPath() {
  return '/login?next=%2Fcaliber%2F%23student-courses';
}

function getPortalLogoutPath() {
  return '/logout?next=%2Fcaliber%2F%3Flogged_out%3D1';
}

function getOidcRedirectUri() {
  const configured = (import.meta.env.VITE_OIDC_REDIRECT_URI || '').trim();
  if (configured) return configured;
  return `${window.location.origin}${window.location.pathname}`;
}

function getOidcPostLogoutRedirectUri() {
  const configured = (import.meta.env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI || '').trim();
  if (configured) return configured;
  return `${window.location.origin}${window.location.pathname}?logged_out=1`;
}

function base64UrlEncode(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomUrlSafeString(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function pkceChallengeFromVerifier(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

function clearOidcRequestState() {
  sessionStorage.removeItem(OIDC_STATE_STORAGE_KEY);
  sessionStorage.removeItem(OIDC_PKCE_VERIFIER_STORAGE_KEY);
}

async function startDirectOidcLogin() {
  if (!isDirectOidcEnabled()) return;

  const state = randomUrlSafeString(24);
  const verifier = randomUrlSafeString(64);
  const challenge = await pkceChallengeFromVerifier(verifier);

  sessionStorage.setItem(OIDC_STATE_STORAGE_KEY, state);
  sessionStorage.setItem(OIDC_PKCE_VERIFIER_STORAGE_KEY, verifier);

  const params = new URLSearchParams({
    client_id: OIDC_CLIENT_ID,
    response_type: 'code',
    scope: OIDC_SCOPES,
    redirect_uri: getOidcRedirectUri(),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  window.location.assign(`${OIDC_ISSUER}/protocol/openid-connect/auth?${params.toString()}`);
}

async function handleDirectOidcCallbackIfPresent() {
  if (!isDirectOidcEnabled()) return;

  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  if (error) {
    clearOidcTokens();
    clearOidcRequestState();
    throw new Error(params.get('error_description') || error);
  }

  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) return;

  const expectedState = sessionStorage.getItem(OIDC_STATE_STORAGE_KEY);
  const verifier = sessionStorage.getItem(OIDC_PKCE_VERIFIER_STORAGE_KEY);
  if (!expectedState || !verifier || state !== expectedState) {
    clearOidcTokens();
    clearOidcRequestState();
    throw new Error('Invalid OIDC callback state');
  }

  const tokenPayload = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: OIDC_CLIENT_ID,
    code,
    redirect_uri: getOidcRedirectUri(),
    code_verifier: verifier,
  });

  const response = await fetch(`${OIDC_ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenPayload.toString(),
  });

  if (!response.ok) {
    clearOidcTokens();
    clearOidcRequestState();
    throw new Error('OIDC code exchange failed');
  }

  const tokenData = await response.json();
  storeOidcTokens({
    ...tokenData,
    expires_at: Math.floor(Date.now() / 1000) + Number(tokenData.expires_in || 0),
  });

  clearOidcRequestState();

  const cleanedUrl = new URL(window.location.href);
  ['code', 'state', 'session_state', 'iss', 'error', 'error_description'].forEach((key) => {
    cleanedUrl.searchParams.delete(key);
  });
  const cleanPath = `${cleanedUrl.pathname}${cleanedUrl.search}${cleanedUrl.hash}`;
  window.history.replaceState({}, '', cleanPath);

  const postLoginHash = sessionStorage.getItem(OIDC_POST_LOGIN_HASH_STORAGE_KEY);
  sessionStorage.removeItem(OIDC_POST_LOGIN_HASH_STORAGE_KEY);
  if (postLoginHash && window.location.hash !== postLoginHash) {
    window.location.hash = postLoginHash;
  }
}

// Helper function to check if test mode is enabled
function isTestModeEnabled() {
  return localStorage.getItem('test-mode') === 'true';
}

function getTestUser() {
  return {
    id: 'test-user-1',
    user_id: 'test-user-1',
    email: 'test-user-1@example.com',
    authenticated: true,
    auth_provider: 'test-mode',
  };
}

function storeAuthUser(user) {
  if (!user) {
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    return;
  }
  localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
}

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function fetchKeycloakUser() {
  const headers = {};
  let usedBearerToken = false;
  if (isTestModeEnabled()) {
    headers.Authorization = 'Bearer test-token-1';
  } else {
    const accessToken = await getValidAccessToken();
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
      usedBearerToken = true;
    }
  }

  let response = await fetch(`${API_BASE}/api/user`, {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  // If Bearer auth fails, clear cached OIDC tokens and retry once with cookie-only auth.
  // This prevents redirect loops when stale browser token storage conflicts with a valid
  // portal session cookie.
  if (response.status === 401 && usedBearerToken) {
    clearOidcTokens();
    response = await fetch(`${API_BASE}/api/user`, {
      method: 'GET',
      headers: {},
      credentials: 'include',
    });
  }

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Unable to fetch authenticated user');
  }

  const payload = await response.json();
  return {
    id: payload.user_id,
    user_id: payload.user_id,
    email: payload.email || '',
    first_name: payload.first_name || '',
    last_name: payload.last_name || '',
    authenticated: true,
    auth_provider: 'keycloak',
  };
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check if test mode should be enabled (check for URL param or localStorage)
  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      const storedUser = loadStoredUser();
      if (storedUser) {
        setUser(storedUser);
      }

      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('test-mode') === 'true') {
        localStorage.setItem('test-mode', 'true');
        const testUser = getTestUser();
        if (!cancelled) {
          setUser(testUser);
          storeAuthUser(testUser);
          setLoading(false);
        }
        return;
      }

      if (isTestModeEnabled()) {
        const testUser = getTestUser();
        if (!cancelled) {
          setUser(testUser);
          storeAuthUser(testUser);
          setLoading(false);
        }
        return;
      }

      try {
        try {
          await handleDirectOidcCallbackIfPresent();
        } catch (callbackErr) {
          // Continue with cookie-based auth fallback even if direct OIDC callback handling fails.
          console.error('OIDC callback handling failed; falling back to cookie auth:', callbackErr);
          clearOidcTokens();
          clearOidcRequestState();
        }

        const nextUser = await fetchKeycloakUser();
        if (!cancelled) {
          setUser(nextUser);
          storeAuthUser(nextUser);
        }
      } catch (err) {
        console.error('Failed to load Keycloak session:', err);
        if (!cancelled) {
          setUser(null);
          storeAuthUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshUser = async () => {
    if (isTestModeEnabled()) {
      const testUser = getTestUser();
      setUser(testUser);
      storeAuthUser(testUser);
      setLoading(false);
      return testUser;
    }

    setLoading(true);
    try {
      const nextUser = await fetchKeycloakUser();
      setUser(nextUser);
      storeAuthUser(nextUser);
      return nextUser;
    } finally {
      setLoading(false);
    }
  };

  const signIn = async () => {
    if (isDirectOidcEnabled()) {
      sessionStorage.setItem(
        OIDC_POST_LOGIN_HASH_STORAGE_KEY,
        window.location.hash || '#student-courses',
      );
      await startDirectOidcLogin();
      return;
    }

    window.location.assign(portalUrl(getPortalLoginPath()));
  };

  const signUp = async () => {
    await signIn();
  };

  const signOut = async () => {
    if (isTestModeEnabled()) {
      localStorage.removeItem('test-mode');
      setUser(null);
      storeAuthUser(null);
      return;
    }

    if (isDirectOidcEnabled()) {
      const tokens = loadOidcTokens();
      setUser(null);
      storeAuthUser(null);
      clearOidcTokens();
      clearOidcRequestState();
      sessionStorage.removeItem(OIDC_POST_LOGIN_HASH_STORAGE_KEY);

      const params = new URLSearchParams({
        client_id: OIDC_CLIENT_ID,
        post_logout_redirect_uri: getOidcPostLogoutRedirectUri(),
      });
      if (tokens?.id_token) {
        params.set('id_token_hint', tokens.id_token);
      }

      window.location.assign(`${OIDC_ISSUER}/protocol/openid-connect/logout?${params.toString()}`);
      return;
    }

    setUser(null);
    storeAuthUser(null);
    window.location.assign(portalUrl(getPortalLogoutPath()));
  };

  const value = {
    user,
    loading,
    refreshUser,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
