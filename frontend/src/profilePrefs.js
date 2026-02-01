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

export function getUserInitials(user, userInfo = null) {
  // If we have first and last name from backend, use those
  if (userInfo?.first_name && userInfo?.last_name) {
    return `${userInfo.first_name[0]}${userInfo.last_name[0]}`.toUpperCase();
  }
  
  // Fallback to email-based initials
  const email = user?.email || '';
  const display = (email.split('@')[0] || '').trim();
  if (!display) return 'U';
  return display.slice(0, 2).toUpperCase();
}

export function getDefaultProfilePrefs(user, userInfo = null) {
  return {
    displayName: user?.user_metadata?.full_name || user?.user_metadata?.name || '',
    iconShape: 'circle', // circle | square | hex
    color: '#4f46e5',
    initials: getUserInitials(user, userInfo),
  };
}

export function loadProfilePrefs(user, userInfo = null) {
  const defaults = getDefaultProfilePrefs(user, userInfo);
  if (!user) return defaults;

  const key = getProfilePrefsStorageKey(user);
  const raw = localStorage.getItem(key);
  if (!raw) return defaults;

  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== 'object') return defaults;

  return {
    ...defaults,
    ...parsed,
    // If initials are empty or not set, use default based on name
    initials: parsed.initials && parsed.initials.trim() ? parsed.initials : defaults.initials,
  };
}

export function saveProfilePrefs(user, prefs) {
  if (!user) return;
  const key = getProfilePrefsStorageKey(user);
  localStorage.setItem(key, JSON.stringify(prefs));
}

