import React, { useMemo } from 'react';

/**
 * Stats computed only from students who submitted on time or late (excludes not_submitted).
 * - Assignments graded / to be graded
 * - Average, median, min, max, standard deviation of score_percent for graded submissions.
 */
function computeGradingStats(rows, totalPoints) {
  const submitted = (rows || []).filter(
    (r) => r.timing_status === 'on_time' || r.timing_status === 'late'
  );
  const graded = submitted.filter(
    (r) => Boolean(r.grade_submitted) && r.score_earned != null && r.score_total != null
  );
  const toBeGraded = submitted.length - graded.length;

  const percents = graded
    .map((r) => {
      if (r.score_total != null && Number(r.score_total) > 0 && r.score_earned != null) {
        return (Number(r.score_earned) / Number(r.score_total)) * 100;
      }
      return r.score_percent != null ? Number(r.score_percent) : null;
    })
    .filter((p) => p != null && Number.isFinite(p));

  const n = percents.length;
  if (n === 0) {
    return {
      submittedCount: submitted.length,
      gradedCount: 0,
      toBeGradedCount: toBeGraded,
      average: null,
      median: null,
      min: null,
      max: null,
      stdDev: null,
    };
  }

  const sum = percents.reduce((a, b) => a + b, 0);
  const average = sum / n;
  const sorted = [...percents].sort((a, b) => a - b);
  const median = n % 2 === 1
    ? sorted[Math.floor(n / 2)]
    : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const variance = percents.reduce((acc, p) => acc + (p - average) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  return {
    submittedCount: submitted.length,
    gradedCount: graded.length,
    toBeGradedCount: toBeGraded,
    average,
    median,
    min,
    max,
    stdDev,
  };
}

function formatNum(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 100) / 100}%`;
}

export default function AssignmentGradingStats({ submissionStatusRows, assignmentTotalPoints }) {
  const stats = useMemo(
    () => computeGradingStats(submissionStatusRows, assignmentTotalPoints),
    [submissionStatusRows, assignmentTotalPoints]
  );

  const cardStyle = {
    padding: '0.6rem 0.85rem',
    borderRadius: '8px',
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    minWidth: '0',
  };
  const labelStyle = { fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' };
  const valueStyle = { fontSize: '1rem', fontWeight: 700, color: '#0f172a' };

  return (
    <div style={{ marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 0.75rem 0', fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
        Grading statistics
      </h2>
      <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
        Based only on submissions that were <strong>on time</strong> or <strong>late</strong> (not submitted excluded).
      </p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: '0.75rem',
      }}>
        <div style={cardStyle}>
          <div style={labelStyle}>Submitted</div>
          <div style={valueStyle}>{stats.submittedCount}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Graded</div>
          <div style={valueStyle}>{stats.gradedCount}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>To be graded</div>
          <div style={valueStyle}>{stats.toBeGradedCount}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Average</div>
          <div style={valueStyle}>{formatNum(stats.average)}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Median</div>
          <div style={valueStyle}>{formatNum(stats.median)}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Minimum</div>
          <div style={valueStyle}>{formatNum(stats.min)}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Maximum</div>
          <div style={valueStyle}>{formatNum(stats.max)}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Std deviation</div>
          <div style={valueStyle}>{formatNum(stats.stdDev)}</div>
        </div>
      </div>
    </div>
  );
}
