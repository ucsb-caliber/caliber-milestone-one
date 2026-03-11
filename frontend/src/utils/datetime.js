export const PACIFIC_TIMEZONE = 'America/Los_Angeles';

function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

function hasExplicitTimezone(value) {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
}

export function parseScheduleDate(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return isValidDate(parsed) ? parsed : null;
}

export function parseUtcTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return isValidDate(value) ? value : null;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = hasExplicitTimezone(raw) ? raw : `${raw}Z`;
  const parsed = new Date(normalized);
  return isValidDate(parsed) ? parsed : null;
}

export function formatPacificDateTime(
  value,
  {
    kind = 'schedule',
    weekday,
    month = 'short',
    day = 'numeric',
    year = 'numeric',
    hour = '2-digit',
    minute = '2-digit',
    timeZoneName = 'short',
  } = {}
) {
  const parsed = kind === 'event' ? parseUtcTimestamp(value) : parseScheduleDate(value);
  if (!parsed) return null;
  return parsed.toLocaleString('en-US', {
    weekday,
    month,
    day,
    year,
    hour,
    minute,
    timeZone: PACIFIC_TIMEZONE,
    timeZoneName,
  });
}
