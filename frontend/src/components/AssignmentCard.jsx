import React from 'react';

const PACIFIC_TIMEZONE = 'America/Los_Angeles';

function parseAssignmentDate(dateStr) {
  if (!dateStr) return null;
  const hasTimezone = /[zZ]|[+-]\d{2}:\d{2}$/.test(dateStr);
  return new Date(hasTimezone ? dateStr : `${dateStr}Z`);
}

function formatAssignmentDate(dateStr) {
  const parsedDate = parseAssignmentDate(dateStr);
  if (!parsedDate) return 'Not set';
  return parsedDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PACIFIC_TIMEZONE,
    timeZoneName: 'short'
  });
}

export default function AssignmentCard({
  assignment,
  onClick,
  onDelete,
  onReleaseNow,
  showReleaseNow = false,
  releasing = false,
  showSubmitted = false,
  submitted = false,
  submissionTimestamp = null,
  showResubmit = false,
  onResubmit,
}) {
  const submittedCardStyle = showSubmitted && submitted ? {
    border: '1px solid #10b981',
    boxShadow: '0 2px 10px rgba(16,185,129,0.18)'
  } : {};

  const formattedSubmissionTimestamp = submissionTimestamp
    ? formatAssignmentDate(submissionTimestamp)
    : 'Not submitted';

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '12px',
        padding: '1rem 1.125rem',
        border: '1px solid #e5e7eb',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
        ...submittedCardStyle
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        if (showSubmitted && submitted) {
          e.currentTarget.style.borderColor = '#059669';
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(16,185,129,0.25)';
        } else {
          e.currentTarget.style.borderColor = '#d1d5db';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        if (showSubmitted && submitted) {
          e.currentTarget.style.borderColor = '#10b981';
          e.currentTarget.style.boxShadow = '0 2px 10px rgba(16,185,129,0.18)';
        } else {
          e.currentTarget.style.borderColor = '#e5e7eb';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
        }
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            {showSubmitted && submitted && (
              <span style={{
                width: '20px',
                height: '20px',
                borderRadius: '999px',
                background: '#10b981',
                color: 'white',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.72rem',
                fontWeight: 700
              }}>
                ✓
              </span>
            )}
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>
              {assignment.title}
            </h3>
            <span style={{
              padding: '0.25rem 0.6rem',
              background: '#eef2ff',
              color: '#4f46e5',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 600
            }}>
              {assignment.type}
            </span>
          </div>

          {assignment.description && (
            <p style={{ margin: '0 0 0.75rem 0', color: '#6b7280', fontSize: '0.9rem' }}>
              {assignment.description}
            </p>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.5rem 1rem',
            fontSize: '0.82rem',
            color: '#4b5563'
          }}>
            <div><strong>Questions:</strong> {assignment.assignment_questions?.length || 0}</div>
            <div><strong>Release:</strong> {formatAssignmentDate(assignment.release_date)}</div>
            <div><strong>Due:</strong> {formatAssignmentDate(assignment.due_date_soft)}</div>
            {showSubmitted && (
              <div>
                <strong>Last Submitted:</strong>{' '}
                <span style={{ color: submitted ? '#059669' : '#6b7280', fontWeight: 600 }}>
                  {formattedSubmissionTimestamp}
                </span>
              </div>
            )}
          </div>
        </div>

        {(showReleaseNow || onDelete || showResubmit) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            {showResubmit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onResubmit?.();
                }}
                style={{
                  padding: '0.4rem 0.65rem',
                  background: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 600
                }}
                title="Re-open and re-submit this assignment"
              >
                Resubmit
              </button>
            )}
            {showReleaseNow && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReleaseNow?.();
                }}
                disabled={releasing}
                style={{
                  padding: '0.4rem 0.65rem',
                  background: releasing ? '#93c5fd' : '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: releasing ? 'not-allowed' : 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 600
                }}
                title="Release this assignment immediately"
              >
                {releasing ? 'Releasing...' : 'Release Now'}
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                style={{
                  width: '24px',
                  height: '24px',
                  padding: 0,
                  background: '#fee2e2',
                  color: '#dc2626',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                }}
                title="Delete assignment"
              >
                ✕
              </button>
            )}
            <div style={{ fontSize: '1.25rem', color: '#9ca3af' }}>›</div>
          </div>
        )}
      </div>
    </div>
  );
}
