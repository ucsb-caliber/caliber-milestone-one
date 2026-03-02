const OIDC_TOKEN_STORAGE_KEY = 'caliber-oidc-tokens';
const OIDC_CLOCK_SKEW_SECONDS = 30;
const OIDC_ISSUER = (import.meta.env.VITE_OIDC_ISSUER || '').replace(/\/$/, '');
const OIDC_CLIENT_ID = (import.meta.env.VITE_OIDC_CLIENT_ID || 'portal').trim();

let refreshPromise = null;

function decodeJwtClaims(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`;
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function nowEpochSeconds() {
  return Math.floor(Date.now() / 1000);
}

function normalizeTokenPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const accessToken = typeof raw.access_token === 'string' ? raw.access_token : '';
  if (!accessToken) return null;

  const refreshToken = typeof raw.refresh_token === 'string' ? raw.refresh_token : '';
  const idToken = typeof raw.id_token === 'string' ? raw.id_token : '';

  let expiresAt = Number(raw.expires_at || 0);
  if (!expiresAt) {
    const expiresIn = Number(raw.expires_in || 0);
    if (Number.isFinite(expiresIn) && expiresIn > 0) {
      expiresAt = nowEpochSeconds() + expiresIn;
    } else {
      const claims = decodeJwtClaims(accessToken);
      expiresAt = Number(claims?.exp || 0);
    }
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    id_token: idToken,
    expires_at: Number.isFinite(expiresAt) ? expiresAt : 0,
  };
}

function isAccessTokenFresh(tokens) {
  return Boolean(
    tokens?.access_token &&
      tokens?.expires_at &&
      tokens.expires_at > nowEpochSeconds() + OIDC_CLOCK_SKEW_SECONDS,
  );
}

export function isDirectOidcEnabled() {
  return Boolean(OIDC_ISSUER && OIDC_CLIENT_ID);
}

export function loadOidcTokens() {
  try {
    const raw = localStorage.getItem(OIDC_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    return normalizeTokenPayload(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function storeOidcTokens(tokens) {
  const normalized = normalizeTokenPayload(tokens);
  if (!normalized) {
    localStorage.removeItem(OIDC_TOKEN_STORAGE_KEY);
    return null;
  }
  localStorage.setItem(OIDC_TOKEN_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearOidcTokens() {
  localStorage.removeItem(OIDC_TOKEN_STORAGE_KEY);
}

async function refreshOidcTokens(currentTokens) {
  if (!isDirectOidcEnabled()) return null;
  const refreshToken = currentTokens?.refresh_token;
  if (!refreshToken) return null;

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: OIDC_CLIENT_ID,
    refresh_token: refreshToken,
  });

  try {
    const response = await fetch(`${OIDC_ISSUER}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      clearOidcTokens();
      return null;
    }

    const payload = await response.json();
    return storeOidcTokens({
      ...currentTokens,
      ...payload,
      refresh_token: payload.refresh_token || refreshToken,
      expires_at: nowEpochSeconds() + Number(payload.expires_in || 0),
    });
  } catch {
    clearOidcTokens();
    return null;
  }
}

export async function getValidAccessToken() {
  if (!isDirectOidcEnabled()) {
    return null;
  }

  const tokens = loadOidcTokens();
  if (!tokens) return null;

  if (isAccessTokenFresh(tokens)) {
    return tokens.access_token;
  }

  if (!tokens.refresh_token || !isDirectOidcEnabled()) {
    clearOidcTokens();
    return null;
  }

  if (!refreshPromise) {
    refreshPromise = refreshOidcTokens(tokens).finally(() => {
      refreshPromise = null;
    });
  }

  const refreshed = await refreshPromise;
  return refreshed?.access_token || null;
}
