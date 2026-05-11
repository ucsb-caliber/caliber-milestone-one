export function readHashParams(hash = window.location.hash) {
  const hashValue = String(hash || '');
  const queryIndex = hashValue.indexOf('?');
  return new URLSearchParams(queryIndex >= 0 ? hashValue.slice(queryIndex + 1) : '');
}

export function getFromHash(hash = window.location.hash) {
  return readHashParams(hash).get('from') || '';
}

export function buildHashWithParams(baseHash, updates = {}) {
  const normalizedBase = String(baseHash || '').replace(/^#/, '');
  const [route, query = ''] = normalizedBase.split('?');
  const params = new URLSearchParams(query);

  Object.entries(updates).forEach(([key, value]) => {
    if (value == null || value === '') {
      params.delete(key);
      return;
    }
    params.set(key, String(value));
  });

  const nextQuery = params.toString();
  return `#${route}${nextQuery ? `?${nextQuery}` : ''}`;
}

export function buildHashWithFrom(baseHash, fromHash = window.location.hash) {
  return buildHashWithParams(baseHash, {
    from: fromHash || '',
  });
}

export function navigateBackWithFallback(fallbackHash, fromHash = getFromHash()) {
  window.location.hash = fromHash || fallbackHash;
}
