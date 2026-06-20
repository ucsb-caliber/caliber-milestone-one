import { API_BASE, sendAnalyticsEvents } from './api';

const SESSION_STORAGE_KEY = 'caliber-analytics-session-id';
const FLUSH_INTERVAL_MS = 8000;
const MAX_BATCH_SIZE = 25;

const ALLOWED_METADATA_KEYS = new Set([
  'action',
  'answer_length',
  'answered_count',
  'attempt_count',
  'choice_index',
  'code_length',
  'duration_ms',
  'active_seconds',
  'error',
  'error_category',
  'from_index',
  'from_question_id',
  'from_question_qid',
  'hard_due_passed',
  'is_resubmit',
  'language',
  'next_index',
  'part_type',
  'question_count',
  'question_index',
  'question_type',
  'status',
  'submitted',
  'test_failed_count',
  'test_passed_count',
  'to_index',
  'to_question_id',
  'to_question_qid',
  'visible',
]);

let buffer = [];
let flushTimer = null;

function randomId(prefix) {
  const cryptoObj = window.crypto || window.msCrypto;
  if (cryptoObj?.randomUUID) return `${prefix}-${cryptoObj.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getAnalyticsSessionId() {
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const next = randomId('session');
    sessionStorage.setItem(SESSION_STORAGE_KEY, next);
    return next;
  } catch {
    return randomId('session');
  }
}

function sanitizeMetadata(metadata = {}) {
  const cleaned = {};
  if (!metadata || typeof metadata !== 'object') return cleaned;
  Object.entries(metadata).forEach(([key, value]) => {
    if (!ALLOWED_METADATA_KEYS.has(key)) return;
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
      cleaned[key] = value;
    }
  });
  return cleaned;
}

export function buildQuestionAnalyticsContext(question, extra = {}) {
  if (!question) return extra;
  return {
    ...extra,
    question_id: question.id,
    question_qid: question.qid || String(question.id),
    metadata: {
      question_type: question.question_type || '',
      ...extra.metadata,
    },
  };
}

export function trackEvent(eventName, context = {}) {
  if (!eventName || typeof window === 'undefined') return;
  const event = {
    client_event_id: randomId('event'),
    session_id: getAnalyticsSessionId(),
    event_name: eventName,
    course_id: context.course_id ?? context.courseId ?? null,
    assignment_id: context.assignment_id ?? context.assignmentId ?? null,
    question_id: context.question_id ?? context.questionId ?? null,
    question_qid: context.question_qid ?? context.questionQid ?? null,
    part_id: context.part_id ?? context.partId ?? null,
    route: context.route || window.location.hash || window.location.pathname,
    metadata: sanitizeMetadata(context.metadata || {}),
    occurred_at: new Date().toISOString(),
  };
  buffer.push(event);
  if (buffer.length >= MAX_BATCH_SIZE) {
    void flushAnalytics();
  } else {
    scheduleFlush();
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushAnalytics();
  }, FLUSH_INTERVAL_MS);
}

export async function flushAnalytics(options = {}) {
  if (flushTimer) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, MAX_BATCH_SIZE);
  try {
    await sendAnalyticsEvents(batch, { keepalive: options.keepalive });
  } catch (error) {
    if (!options.dropOnFailure) {
      buffer = [...batch, ...buffer].slice(0, 200);
      scheduleFlush();
    }
  }
}

function flushWithBeacon() {
  if (!navigator.sendBeacon || buffer.length === 0) {
    void flushAnalytics({ keepalive: true, dropOnFailure: true });
    return;
  }
  const batch = buffer.splice(0, MAX_BATCH_SIZE);
  const blob = new Blob([JSON.stringify({ events: batch })], { type: 'application/json' });
  const sent = navigator.sendBeacon(`${API_BASE}/api/analytics/events`, blob);
  if (!sent) {
    buffer = [...batch, ...buffer].slice(0, 200);
    void flushAnalytics({ keepalive: true, dropOnFailure: true });
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushWithBeacon);
  document.addEventListener('visibilitychange', () => {
    trackEvent(document.hidden ? 'visibility_hidden' : 'visibility_visible', {
      metadata: { visible: !document.hidden },
    });
    if (document.hidden) flushWithBeacon();
  });
}
