const STORAGE_PREFIX = 'caliber.profilePrefs.v1';

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function getProfilePrefsStorageKey(user) {
  const keyPart = user?.id || user?.email || 'anonymous';
  return `${STORAGE_PREFIX}.${keyPart}`;
}

export function getUserInitials(user) {
  const email = user?.email || '';
  const display = (email.split('@')[0] || '').trim();
  if (!display) return 'U';
  return display.slice(0, 2).toUpperCase();
}

export function getDefaultProfilePrefs(user) {
  return {
    displayName: user?.user_metadata?.full_name || user?.user_metadata?.name || '',
    iconShape: 'circle', // circle | square | hex
    color: '#4f46e5',
    initials: getUserInitials(user),
  };
}

export function loadProfilePrefs(user) {
  const defaults = getDefaultProfilePrefs(user);
  if (!user) return defaults;

  const key = getProfilePrefsStorageKey(user);
  const raw = localStorage.getItem(key);
  if (!raw) return defaults;

  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== 'object') return defaults;

  return {
    ...defaults,
    ...parsed,
    // never let initials drift away from email unless user explicitly set them
    initials: parsed.initials || defaults.initials,
  };
}

export function saveProfilePrefs(user, prefs) {
  if (!user) return;
  const key = getProfilePrefsStorageKey(user);
  localStorage.setItem(key, JSON.stringify(prefs));
}

