import React from 'react';
import { getCourses, getInstructorAnalytics } from '../api';
import {
  CourseDashboardErrorBanner,
  CourseDashboardHeader,
  CourseDashboardSpinnerState,
  CourseDashboardSelect,
  PageContainer,
  SurfaceCard,
  SurfaceLabel,
  dashboardPalette,
} from '../components/CourseDashboardUI';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(1)}%`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function getLetterGrade(scorePercent) {
  if (scorePercent == null || !Number.isFinite(Number(scorePercent))) return '—';
  const pct = Number(scorePercent);
  if (pct >= 93) return 'A';
  if (pct >= 90) return 'A-';
  if (pct >= 87) return 'B+';
  if (pct >= 83) return 'B';
  if (pct >= 80) return 'B-';
  if (pct >= 77) return 'C+';
  if (pct >= 73) return 'C';
  if (pct >= 70) return 'C-';
  if (pct >= 67) return 'D+';
  if (pct >= 63) return 'D';
  if (pct >= 60) return 'D-';
  return 'F';
}

function getGradeRank(scorePercent) {
  if (scorePercent == null || !Number.isFinite(Number(scorePercent))) return -1;
  return Number(scorePercent);
}

function MetricsBarGraph({ rows, getLabel, maxRows = 12 }) {
  const metrics = [
    { key: 'mean_score_percent', label: 'Mean', color: dashboardPalette.navy },
    { key: 'median_score_percent', label: 'Median', color: dashboardPalette.goldDark },
    { key: 'min_score_percent', label: 'Min', color: dashboardPalette.dangerText },
    { key: 'max_score_percent', label: 'Max', color: dashboardPalette.navyMid },
  ];
  const displayRows = (rows || []).slice(0, maxRows);
  if (!displayRows.length) {
    return <div style={{ color: dashboardPalette.muted, fontSize: '0.9rem' }}>No data available for bar graph.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap' }}>
        {metrics.map((metric) => (
          <div key={metric.key} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: dashboardPalette.muted, fontWeight: 700 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: metric.color, display: 'inline-block' }} />
            {metric.label}
          </div>
        ))}
      </div>
      {displayRows.map((row, idx) => (
        <div key={`${getLabel(row)}-${idx}`} style={{ border: `1px solid ${dashboardPalette.border}`, borderRadius: 8, padding: '0.45rem 0.55rem' }}>
          <div style={{ marginBottom: '0.32rem', fontWeight: 700, color: dashboardPalette.navy, fontSize: '0.85rem' }}>{getLabel(row)}</div>
          <div style={{ display: 'grid', gap: '0.26rem' }}>
            {metrics.map((metric) => {
              const val = row[metric.key] == null || !Number.isFinite(Number(row[metric.key])) ? 0 : Number(row[metric.key]);
              return (
                <div key={metric.key} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 56px', alignItems: 'center', gap: '0.45rem' }}>
                  <span style={{ fontSize: '0.74rem', color: dashboardPalette.muted, fontWeight: 700 }}>{metric.label}</span>
                  <div style={{ height: 10, borderRadius: 999, background: dashboardPalette.border, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${clamp(val, 0, 100)}%`, background: metric.color }} />
                  </div>
                  <span style={{ fontSize: '0.74rem', color: dashboardPalette.text, fontWeight: 700, textAlign: 'right' }}>{formatPercent(val)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function scoreColorMeta(scorePercent) {
  if (scorePercent == null || !Number.isFinite(Number(scorePercent))) {
    return { background: dashboardPalette.surface, color: dashboardPalette.text, border: dashboardPalette.border };
  }
  const normalized = clamp(Number(scorePercent) / 100, 0, 1);
  if (normalized >= 0.5) {
    const intensity = clamp((normalized - 0.5) * 2, 0, 1);
    const greenLight = [220, 252, 231];
    const greenDark = [22, 163, 74];
    const rgb = greenLight.map((v, idx) => Math.round(v + (greenDark[idx] - v) * intensity));
    return {
      background: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
      color: intensity > 0.45 ? '#f0fdf4' : '#14532d',
      border: intensity > 0.35 ? '#166534' : '#86efac',
    };
  }
  const intensity = clamp((0.5 - normalized) * 2, 0, 1);
  const redLight = [254, 226, 226];
  const redDark = [185, 28, 28];
  const rgb = redLight.map((v, idx) => Math.round(v + (redDark[idx] - v) * intensity));
  return {
    background: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
    color: intensity > 0.35 ? '#fef2f2' : '#7f1d1d',
    border: intensity > 0.35 ? '#991b1b' : '#fecaca',
  };
}

function summaryScoreColorMeta(scorePercent) {
  if (scorePercent == null || !Number.isFinite(Number(scorePercent))) {
    return {
      background: '#f8fafc',
      color: '#0f172a',
      labelColor: '#475569',
      border: '#dbe4ee',
    };
  }

  const normalized = clamp(Number(scorePercent) / 100, 0, 1);
  if (normalized >= 0.5) {
    const intensity = clamp((normalized - 0.5) * 2, 0, 1);
    const greenStart = [246, 250, 247];
    const greenEnd = [220, 243, 229];
    const borderStart = [209, 226, 216];
    const borderEnd = [134, 183, 153];
    const backgroundRgb = greenStart.map((value, idx) => Math.round(value + (greenEnd[idx] - value) * intensity));
    const borderRgb = borderStart.map((value, idx) => Math.round(value + (borderEnd[idx] - value) * intensity));
    return {
      background: `rgb(${backgroundRgb[0]}, ${backgroundRgb[1]}, ${backgroundRgb[2]})`,
      color: '#14532d',
      labelColor: '#166534',
      border: `rgb(${borderRgb[0]}, ${borderRgb[1]}, ${borderRgb[2]})`,
    };
  }

  const intensity = clamp((0.5 - normalized) * 2, 0, 1);
  const redStart = [255, 248, 247];
  const redEnd = [250, 228, 226];
  const borderStart = [245, 218, 215];
  const borderEnd = [229, 159, 151];
  const backgroundRgb = redStart.map((value, idx) => Math.round(value + (redEnd[idx] - value) * intensity));
  const borderRgb = borderStart.map((value, idx) => Math.round(value + (borderEnd[idx] - value) * intensity));
  return {
    background: `rgb(${backgroundRgb[0]}, ${backgroundRgb[1]}, ${backgroundRgb[2]})`,
    color: '#7f1d1d',
    labelColor: '#991b1b',
    border: `rgb(${borderRgb[0]}, ${borderRgb[1]}, ${borderRgb[2]})`,
  };
}

function StatCard({ label, value, scorePercent = null }) {
  const colorMeta = summaryScoreColorMeta(scorePercent);
  return (
    <div
      style={{
        padding: '0.8rem 0.95rem',
        borderRadius: 8,
        border: `1px solid ${colorMeta.border}`,
        background: colorMeta.background,
        minHeight: 84,
      }}
    >
      <div style={{ fontSize: '0.8rem', color: colorMeta.labelColor, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ marginTop: '0.35rem', fontSize: '1.35rem', fontWeight: 800, color: colorMeta.color }}>
        {value}
      </div>
    </div>
  );
}

function ScoreBandBarChart({ data }) {
  const bars = (data || []).map((item) => ({
    label: item.band_label,
    count: Number(item.count || 0),
  }));
  const maxCount = Math.max(...bars.map((item) => item.count), 1);
  const chartWidth = 560;
  const chartHeight = 220;
  const barWidth = 76;
  const gap = 22;

  return (
    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ width: '100%', height: 240 }}>
      <line x1="42" y1="180" x2="535" y2="180" stroke="#94a3b8" strokeWidth="1" />
      {bars.map((bar, idx) => {
        const x = 56 + idx * (barWidth + gap);
        const height = maxCount > 0 ? (bar.count / maxCount) * 130 : 0;
        const y = 180 - height;
        const scoreHint = (bar.count / maxCount) * 100;
        const fill = scoreColorMeta(scoreHint).background;
        return (
          <g key={bar.label}>
            <rect x={x} y={y} width={barWidth} height={height} fill={fill} rx="8" />
            <text x={x + barWidth / 2} y={y - 8} textAnchor="middle" style={{ fill: dashboardPalette.navy, fontSize: 12, fontWeight: 700 }}>
              {bar.count}
            </text>
            <text x={x + barWidth / 2} y={198} textAnchor="middle" style={{ fill: dashboardPalette.muted, fontSize: 12, fontWeight: 600 }}>
              {bar.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function TrendSeriesChart({ rows }) {
  const series = (rows || []).filter((row) => row.average_score_percent != null);
  if (!series.length) {
    return <div style={{ color: dashboardPalette.muted, fontSize: '0.9rem' }}>No trend data available for this filter.</div>;
  }
  const width = 560;
  const height = 240;
  const left = 40;
  const right = 22;
  const top = 18;
  const bottom = 38;
  const graphWidth = width - left - right;
  const graphHeight = height - top - bottom;
  const maxX = Math.max(series.length - 1, 1);
  const toPoint = (value, index) => {
    const x = left + (index / maxX) * graphWidth;
    const y = top + ((100 - Number(value || 0)) / 100) * graphHeight;
    return { x, y };
  };
  const polyline = series
    .map((point, index) => toPoint(point.average_score_percent || 0, index))
    .map((point) => `${point.x},${point.y}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 250 }}>
      <line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} stroke="#94a3b8" strokeWidth="1" />
      <line x1={left} y1={top} x2={left} y2={height - bottom} stroke="#94a3b8" strokeWidth="1" />
      <polyline points={polyline} fill="none" stroke={dashboardPalette.navy} strokeWidth="3" />
      {series.map((point, index) => {
        const { x, y } = toPoint(point.average_score_percent || 0, index);
        const colorMeta = scoreColorMeta(point.average_score_percent || 0);
        const label = String(point.bucket_label || '').trim();
        const shortLabel = label.length > 10 ? `${label.slice(0, 10)}…` : label;
        return (
          <g key={`${label}-${index}`}>
            <circle cx={x} cy={y} r="4.5" fill={colorMeta.background} stroke="#1e3a8a" />
            <title>{`${label}: ${formatPercent(point.average_score_percent)}`}</title>
            <text x={x} y={height - 14} textAnchor="middle" style={{ fill: dashboardPalette.muted, fontSize: 10 }}>
              {shortLabel}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Analytics() {
  const [courses, setCourses] = React.useState([]);
  const [courseId, setCourseId] = React.useState('');
  const [assignmentId, setAssignmentId] = React.useState('all');
  const [dateRange, setDateRange] = React.useState('30d');
  const [loadingCourses, setLoadingCourses] = React.useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = React.useState(false);
  const [error, setError] = React.useState('');
  const [analytics, setAnalytics] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    async function loadCourses() {
      setLoadingCourses(true);
      setError('');
      try {
        const response = await getCourses();
        if (cancelled) return;
        const list = (response?.courses || []).slice();
        setCourses(list);
        if (list.length) {
          setCourseId(String(list[0].id));
        } else {
          setCourseId('');
        }
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Failed to load courses');
      } finally {
        if (!cancelled) setLoadingCourses(false);
      }
    }
    loadCourses();
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    if (!courseId) {
      setAnalytics(null);
      return;
    }
    let cancelled = false;
    async function loadAnalytics() {
      setLoadingAnalytics(true);
      setError('');
      try {
        const data = await getInstructorAnalytics(courseId, {
          assignmentId: assignmentId === 'all' ? null : assignmentId,
          dateRange,
        });
        if (cancelled) return;
        setAnalytics(data);
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Failed to load analytics');
        setAnalytics(null);
      } finally {
        if (!cancelled) setLoadingAnalytics(false);
      }
    }
    loadAnalytics();
    return () => { cancelled = true; };
  }, [courseId, assignmentId, dateRange]);

  const summary = analytics?.summary || {};
  const perStudentRows = analytics?.per_student_trend || [];
  const riskRows = analytics?.students_at_risk || [];
  const promptRows = analytics?.per_prompt_summary || [];
  const trendSeries = analytics?.trend_series || [];
  const [assignmentQuestionView, setAssignmentQuestionView] = React.useState('table');
  const [studentTrendView, setStudentTrendView] = React.useState('table');
  const [assignmentSummaryView, setAssignmentSummaryView] = React.useState('table');
  const [assignmentQuestionSort, setAssignmentQuestionSort] = React.useState({ key: 'assignment_title', direction: 'asc' });
  const [studentTrendSort, setStudentTrendSort] = React.useState({ key: 'average_score_percent', direction: 'desc' });
  const [assignmentSummarySort, setAssignmentSummarySort] = React.useState({ key: 'assignment_title', direction: 'asc' });
  const tableHeaderCell = {
    textAlign: 'left',
    fontSize: '0.75rem',
    fontWeight: 700,
    color: dashboardPalette.muted,
    padding: '0.6rem 0.55rem',
    borderBottom: `1px solid ${dashboardPalette.border}`,
    whiteSpace: 'nowrap',
  };

  const toggleSort = React.useCallback((setter, key) => {
    setter((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      const defaultDirection = key === 'assignment_title' || key === 'student_name' || key === 'student_id' ? 'asc' : 'desc';
      return { key, direction: defaultDirection };
    });
  }, []);

  const sortRows = React.useCallback((rows, sortConfig) => {
    const { key, direction } = sortConfig;
    const factor = direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const aVal = a?.[key];
      const bVal = b?.[key];

      if (key === 'grade') {
        const aGrade = getGradeRank(a?.average_score_percent);
        const bGrade = getGradeRank(b?.average_score_percent);
        if (aGrade !== bGrade) return (aGrade - bGrade) * factor;
        return String(a?.student_name || '').localeCompare(String(b?.student_name || ''));
      }

      if (typeof aVal === 'number' || typeof bVal === 'number') {
        const na = (aVal == null || !Number.isFinite(Number(aVal))) ? Number.NEGATIVE_INFINITY : Number(aVal);
        const nb = (bVal == null || !Number.isFinite(Number(bVal))) ? Number.NEGATIVE_INFINITY : Number(bVal);
        if (na !== nb) return (na - nb) * factor;
        return String(a?.student_name || a?.assignment_title || '').localeCompare(String(b?.student_name || b?.assignment_title || ''));
      }

      const sa = String(aVal || '');
      const sb = String(bVal || '');
      const cmp = sa.localeCompare(sb);
      if (cmp !== 0) return cmp * factor;
      return String(a?.student_name || a?.assignment_title || '').localeCompare(String(b?.student_name || b?.assignment_title || ''));
    });
  }, []);

  const renderSortableHeader = React.useCallback((label, key, sortConfig, setter, extraStyles = {}) => {
    const isActive = sortConfig.key === key;
    const arrow = isActive ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '';
    return (
      <th style={{ ...tableHeaderCell, ...extraStyles }}>
        <button
          type="button"
          onClick={() => toggleSort(setter, key)}
          style={{
            border: 'none',
            background: 'transparent',
            padding: 0,
            margin: 0,
            color: dashboardPalette.muted,
            fontSize: '0.75rem',
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {label} {arrow}
        </button>
      </th>
    );
  }, [tableHeaderCell, toggleSort]);

  const sortedPerStudentRows = React.useMemo(() => {
    return sortRows(perStudentRows, studentTrendSort);
  }, [perStudentRows, studentTrendSort, sortRows]);
  const assignmentQuestionScoreRows = React.useMemo(() => {
    return [...(analytics?.assignment_question_score_summary || [])];
  }, [analytics?.assignment_question_score_summary]);
  const perAssignmentSummaryRows = React.useMemo(() => {
    const belowByAssignment = new Map();
    for (const row of promptRows) {
      const key = Number(row.assignment_id);
      const count = Number(row.submission_count || 0);
      const below = Number(row.below_target_percent || 0);
      if (!belowByAssignment.has(key)) {
        belowByAssignment.set(key, { weightedSum: 0, total: 0 });
      }
      const agg = belowByAssignment.get(key);
      if (count > 0) {
        agg.weightedSum += below * count;
        agg.total += count;
      }
    }
    const rows = assignmentQuestionScoreRows.map((row) => {
      const agg = belowByAssignment.get(Number(row.assignment_id));
      const below_target_percent = agg && agg.total > 0 ? agg.weightedSum / agg.total : null;
      return {
        ...row,
        below_target_percent,
      };
    });
    const assignmentOrder = new Map((analytics?.assignment_options || []).map((option, index) => [Number(option.id), index]));
    rows.sort((a, b) => {
      const ai = assignmentOrder.has(Number(a.assignment_id)) ? assignmentOrder.get(Number(a.assignment_id)) : Number.MAX_SAFE_INTEGER;
      const bi = assignmentOrder.has(Number(b.assignment_id)) ? assignmentOrder.get(Number(b.assignment_id)) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return String(a.assignment_title).localeCompare(String(b.assignment_title));
    });
    return rows;
  }, [assignmentQuestionScoreRows, promptRows, analytics?.assignment_options]);
  const sortedAssignmentQuestionRows = React.useMemo(() => {
    return sortRows(assignmentQuestionScoreRows, assignmentQuestionSort);
  }, [assignmentQuestionScoreRows, assignmentQuestionSort, sortRows]);
  const sortedPerAssignmentSummaryRows = React.useMemo(() => {
    return sortRows(perAssignmentSummaryRows, assignmentSummarySort);
  }, [perAssignmentSummaryRows, assignmentSummarySort, sortRows]);

  const averageLabel = formatPercent(summary.average_overall_grade_percent);
  const headerCourseName = analytics?.course_name || courses.find((course) => String(course.id) === String(courseId))?.course_name || 'Analytics';

  return (
    <PageContainer maxWidth="1480px">
      <CourseDashboardHeader
        title="Instructor Analytics"
        subtitle="Course-level performance insights with score trends, at-risk detection, and assignment analytics."
      />

      <SurfaceCard style={{ marginBottom: '1rem', padding: '0.85rem' }}>
        <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: dashboardPalette.text, fontWeight: 700 }}>
            <SurfaceLabel style={{ marginBottom: 0 }}>Course</SurfaceLabel>
            <CourseDashboardSelect
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setAssignmentId('all');
              }}
              disabled={loadingCourses}
            >
              {!courses.length ? <option value="">No courses</option> : null}
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.course_name} ({course.course_code})
                </option>
              ))}
            </CourseDashboardSelect>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: dashboardPalette.text, fontWeight: 700 }}>
            <SurfaceLabel style={{ marginBottom: 0 }}>Assignment</SurfaceLabel>
            <CourseDashboardSelect
              value={assignmentId}
              onChange={(e) => setAssignmentId(e.target.value)}
              disabled={!analytics && loadingAnalytics}
            >
              <option value="all">All assignments</option>
              {(analytics?.assignment_options || []).map((option) => (
                <option key={option.id} value={option.id}>{option.title}</option>
              ))}
            </CourseDashboardSelect>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: dashboardPalette.text, fontWeight: 700 }}>
            <SurfaceLabel style={{ marginBottom: 0 }}>Date Range</SurfaceLabel>
            <CourseDashboardSelect
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All time</option>
            </CourseDashboardSelect>
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ width: '100%', border: `1px solid ${dashboardPalette.border}`, borderRadius: 8, padding: '0.45rem 0.55rem', background: dashboardPalette.white }}>
              <SurfaceLabel style={{ marginBottom: 0 }}>Current scope</SurfaceLabel>
              <div style={{ marginTop: '0.3rem', fontWeight: 700, color: dashboardPalette.navy, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {headerCourseName}
              </div>
            </div>
          </div>
        </div>
      </SurfaceCard>

      {error ? (
        <CourseDashboardErrorBanner>{error}</CourseDashboardErrorBanner>
      ) : null}

      {loadingAnalytics || loadingCourses ? (
        <CourseDashboardSpinnerState style={{ padding: '16px 0' }} />
      ) : null}

      {!loadingAnalytics && analytics ? (
        <>
          <div style={{ marginBottom: '1rem', display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
            <StatCard label="Average Overall Grade" value={averageLabel} scorePercent={summary.average_overall_grade_percent} />
            <StatCard label="Median Grade" value={formatPercent(summary.median_score_percent)} scorePercent={summary.median_score_percent} />
            <StatCard label="Maximum Grade" value={formatPercent(summary.max_score_percent)} scorePercent={summary.max_score_percent} />
            <StatCard label="Minimum Grade" value={formatPercent(summary.min_score_percent)} scorePercent={summary.min_score_percent} />
            <StatCard label="Grade Std Dev" value={formatPercent(summary.stddev_score_percent)} scorePercent={summary.stddev_score_percent == null ? null : (100 - Number(summary.stddev_score_percent))} />
          </div>

          <SurfaceCard style={{ overflowX: 'auto', marginBottom: '1rem', padding: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1.05rem', color: dashboardPalette.navy }}>Average question score by assignment</h2>
              <label style={{ fontSize: '0.78rem', color: dashboardPalette.muted, fontWeight: 700 }}>
                View{' '}
                <CourseDashboardSelect value={assignmentQuestionView} onChange={(e) => setAssignmentQuestionView(e.target.value)} style={{ minWidth: '120px', height: '32px', marginLeft: '0.2rem', padding: '0 8px' }}>
                  <option value="table">Table</option>
                  <option value="bar">Bar graph</option>
                </CourseDashboardSelect>
              </label>
            </div>
            <p style={{ margin: '0.35rem 0 0.55rem 0', color: dashboardPalette.muted, fontSize: '0.86rem' }}>
              Weighted average question score for each assignment in the current filter scope.
            </p>
            {assignmentQuestionView === 'table' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr>
                  {renderSortableHeader('Assignment', 'assignment_title', assignmentQuestionSort, setAssignmentQuestionSort)}
                  {renderSortableHeader('Mean', 'mean_score_percent', assignmentQuestionSort, setAssignmentQuestionSort)}
                  {renderSortableHeader('Median', 'median_score_percent', assignmentQuestionSort, setAssignmentQuestionSort)}
                  {renderSortableHeader('Min', 'min_score_percent', assignmentQuestionSort, setAssignmentQuestionSort)}
                  {renderSortableHeader('Max', 'max_score_percent', assignmentQuestionSort, setAssignmentQuestionSort)}
                  {renderSortableHeader('Std Dev', 'stddev_score_percent', assignmentQuestionSort, setAssignmentQuestionSort)}
                </tr>
              </thead>
              <tbody>
                {sortedAssignmentQuestionRows.map((row) => {
                  const scoreMeta = scoreColorMeta(row.mean_score_percent);
                  return (
                    <tr key={row.assignment_id} style={{ borderBottom: `1px solid ${dashboardPalette.border}` }}>
                      <td style={{ padding: '0.58rem 0.55rem', fontWeight: 700, color: dashboardPalette.navy }}>{row.assignment_title}</td>
                      <td style={{ padding: '0.58rem 0.55rem' }}>
                        <span style={{ padding: '0.18rem 0.48rem', borderRadius: 999, border: `1px solid ${scoreMeta.border}`, background: scoreMeta.background, color: scoreMeta.color, fontWeight: 700 }}>
                          {formatPercent(row.mean_score_percent)}
                        </span>
                      </td>
                      <td style={{ padding: '0.58rem 0.55rem', color: dashboardPalette.text }}>{formatPercent(row.median_score_percent)}</td>
                      <td style={{ padding: '0.58rem 0.55rem', color: dashboardPalette.text }}>{formatPercent(row.min_score_percent)}</td>
                      <td style={{ padding: '0.58rem 0.55rem', color: dashboardPalette.text }}>{formatPercent(row.max_score_percent)}</td>
                      <td style={{ padding: '0.58rem 0.55rem', color: dashboardPalette.text }}>{formatPercent(row.stddev_score_percent)}</td>
                    </tr>
                  );
                })}
                {!sortedAssignmentQuestionRows.length ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '0.7rem 0.55rem', color: dashboardPalette.muted }}>No assignment question-score data available.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            ) : (
              <MetricsBarGraph
                rows={sortedAssignmentQuestionRows}
                getLabel={(row) => row.assignment_title}
                maxRows={12}
              />
            )}
          </SurfaceCard>

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', marginBottom: '1rem' }}>
            <SurfaceCard style={{ padding: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.05rem', color: dashboardPalette.navy }}>Class-level score distribution</h2>
              <p style={{ margin: '0.35rem 0 0.4rem 0', color: dashboardPalette.muted, fontSize: '0.86rem' }}>
                Score bands for filtered submissions.
              </p>
              <ScoreBandBarChart data={analytics.score_distribution} />
            </SurfaceCard>
            <SurfaceCard style={{ padding: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.05rem', color: dashboardPalette.navy }}>Grade trend over time</h2>
              <p style={{ margin: '0.35rem 0 0.4rem 0', color: dashboardPalette.muted, fontSize: '0.86rem' }}>
                Trend line of average grade percentages over time.
              </p>
              <TrendSeriesChart rows={trendSeries} />
            </SurfaceCard>
          </div>

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(280px, 0.85fr) minmax(0, 2fr)', marginBottom: '1rem' }}>
            <SurfaceCard style={{ padding: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.05rem', color: dashboardPalette.navy }}>Students at risk</h2>
              <p style={{ margin: '0.35rem 0 0.55rem 0', color: dashboardPalette.muted, fontSize: '0.86rem' }}>
                Students with 2+ consecutive submissions below 70%.
              </p>
              {!riskRows.length ? (
                <div style={{ color: '#166534', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '0.6rem' }}>
                  No students currently meet at-risk criteria.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {riskRows.map((row) => {
                    const colorMeta = scoreColorMeta(row.latest_score_percent);
                    return (
                      <div key={row.student_id} style={{ border: `1px solid ${colorMeta.border}`, background: colorMeta.background, borderRadius: 10, padding: '0.55rem 0.65rem' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.student_name}</div>
                        <div style={{ marginTop: '0.18rem', fontSize: '0.82rem', color: colorMeta.color }}>
                          Low-score streak: {row.consecutive_low_score_streak}
                        </div>
                        <div style={{ marginTop: '0.18rem', fontSize: '0.82rem', color: colorMeta.color }}>
                          Latest score: {formatPercent(row.latest_score_percent)} | Last submission: {formatDate(row.latest_submission_date)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SurfaceCard>

            <SurfaceCard style={{ padding: '0.75rem', overflowX: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem', color: dashboardPalette.navy }}>Per-student trend table</h2>
                <label style={{ fontSize: '0.78rem', color: dashboardPalette.muted, fontWeight: 700 }}>
                  View{' '}
                  <CourseDashboardSelect value={studentTrendView} onChange={(e) => setStudentTrendView(e.target.value)} style={{ minWidth: '120px', height: '32px', marginLeft: '0.2rem', padding: '0 8px' }}>
                    <option value="table">Table</option>
                    <option value="bar">Bar graph</option>
                  </CourseDashboardSelect>
                </label>
              </div>
              <p style={{ margin: '0.35rem 0 0.55rem 0', color: dashboardPalette.muted, fontSize: '0.86rem' }}>
                Submission count, average score, and latest activity per student.
              </p>
              {studentTrendView === 'table' ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1060 }}>
                <thead>
                  <tr>
                    {renderSortableHeader('Student', 'student_name', studentTrendSort, setStudentTrendSort)}
                    {renderSortableHeader('Submissions', 'submission_count', studentTrendSort, setStudentTrendSort)}
                    {renderSortableHeader('Grade', 'grade', studentTrendSort, setStudentTrendSort)}
                    {renderSortableHeader('Avg Score', 'average_score_percent', studentTrendSort, setStudentTrendSort)}
                    {renderSortableHeader('Median', 'median_score_percent', studentTrendSort, setStudentTrendSort)}
                    {renderSortableHeader('Min', 'min_score_percent', studentTrendSort, setStudentTrendSort)}
                    {renderSortableHeader('Max', 'max_score_percent', studentTrendSort, setStudentTrendSort)}
                    {renderSortableHeader('Std Dev', 'stddev_score_percent', studentTrendSort, setStudentTrendSort)}
                    {renderSortableHeader('Last Submission', 'last_submission_date', studentTrendSort, setStudentTrendSort)}
                  </tr>
                </thead>
                <tbody>
                  {sortedPerStudentRows.map((row) => {
                    const colorMeta = scoreColorMeta(row.average_score_percent);
                    return (
                      <tr key={row.student_id} style={{ borderBottom: `1px solid ${dashboardPalette.border}` }}>
                        <td style={{ padding: '0.58rem 0.55rem', fontWeight: 700, color: dashboardPalette.navy }}>{row.student_name}</td>
                        <td style={{ padding: '0.58rem 0.55rem', color: dashboardPalette.text }}>{row.submission_count}</td>
                        <td style={{ padding: '0.58rem 0.55rem', color: dashboardPalette.text, fontWeight: 700 }}>
                          {getLetterGrade(row.average_score_percent)}
                        </td>
                        <td style={{ padding: '0.58rem 0.55rem' }}>
                          <span style={{ padding: '0.18rem 0.48rem', borderRadius: 999, border: `1px solid ${colorMeta.border}`, background: colorMeta.background, color: colorMeta.color, fontWeight: 700 }}>
                            {formatPercent(row.average_score_percent)}
                          </span>
                        </td>
                        <td style={{ padding: '0.58rem 0.55rem', color: dashboardPalette.text }}>{formatPercent(row.median_score_percent)}</td>
                        <td style={{ padding: '0.58rem 0.55rem', color: dashboardPalette.text }}>{formatPercent(row.min_score_percent)}</td>
                        <td style={{ padding: '0.58rem 0.55rem', color: dashboardPalette.text }}>{formatPercent(row.max_score_percent)}</td>
                        <td style={{ padding: '0.58rem 0.55rem', color: dashboardPalette.text }}>{formatPercent(row.stddev_score_percent)}</td>
                        <td style={{ padding: '0.58rem 0.55rem', color: dashboardPalette.text }}>{formatDate(row.last_submission_date)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              ) : (
                <MetricsBarGraph
                  rows={sortedPerStudentRows}
                  getLabel={(row) => row.student_name}
                  maxRows={16}
                />
              )}
            </SurfaceCard>
          </div>

          <SurfaceCard style={{ padding: '0.75rem', overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1.05rem', color: dashboardPalette.navy }}>Per-assignment summary</h2>
              <label style={{ fontSize: '0.78rem', color: dashboardPalette.muted, fontWeight: 700 }}>
                View{' '}
                <CourseDashboardSelect value={assignmentSummaryView} onChange={(e) => setAssignmentSummaryView(e.target.value)} style={{ minWidth: '120px', height: '32px', marginLeft: '0.2rem', padding: '0 8px' }}>
                  <option value="table">Table</option>
                  <option value="bar">Bar graph</option>
                </CourseDashboardSelect>
              </label>
            </div>
            <p style={{ margin: '0.35rem 0 0.55rem 0', color: dashboardPalette.muted, fontSize: '0.86rem' }}>
              Assignment-level score stats and below-target rates.
            </p>
            {assignmentSummaryView === 'table' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1040 }}>
              <thead>
                <tr>
                  {renderSortableHeader('Assignment', 'assignment_title', assignmentSummarySort, setAssignmentSummarySort)}
                  {renderSortableHeader('Submissions', 'submission_count', assignmentSummarySort, setAssignmentSummarySort)}
                  {renderSortableHeader('Mean Score', 'mean_score_percent', assignmentSummarySort, setAssignmentSummarySort)}
                  {renderSortableHeader('Median', 'median_score_percent', assignmentSummarySort, setAssignmentSummarySort)}
                  {renderSortableHeader('Min', 'min_score_percent', assignmentSummarySort, setAssignmentSummarySort)}
                  {renderSortableHeader('Max', 'max_score_percent', assignmentSummarySort, setAssignmentSummarySort)}
                  {renderSortableHeader('Std Dev', 'stddev_score_percent', assignmentSummarySort, setAssignmentSummarySort)}
                  {renderSortableHeader('% Below 70%', 'below_target_percent', assignmentSummarySort, setAssignmentSummarySort)}
                </tr>
              </thead>
              <tbody>
                {sortedPerAssignmentSummaryRows.map((row) => {
                  const scoreMeta = scoreColorMeta(row.mean_score_percent);
                  const flaggedMeta = scoreColorMeta(100 - Number(row.below_target_percent || 0));
                  return (
                    <tr key={row.assignment_id} style={{ borderBottom: `1px solid ${dashboardPalette.border}` }}>
                      <td style={{ padding: '0.58rem 0.55rem', fontWeight: 700, color: dashboardPalette.navy }}>{row.assignment_title}</td>
                      <td style={{ padding: '0.58rem 0.55rem', color: dashboardPalette.text }}>{row.submission_count}</td>
                      <td style={{ padding: '0.58rem 0.55rem' }}>
                        <span style={{ padding: '0.18rem 0.48rem', borderRadius: 999, border: `1px solid ${scoreMeta.border}`, background: scoreMeta.background, color: scoreMeta.color, fontWeight: 700 }}>
                          {formatPercent(row.mean_score_percent)}
                        </span>
                      </td>
                      <td style={{ padding: '0.58rem 0.55rem', color: dashboardPalette.text }}>{formatPercent(row.median_score_percent)}</td>
                      <td style={{ padding: '0.58rem 0.55rem', color: dashboardPalette.text }}>{formatPercent(row.min_score_percent)}</td>
                      <td style={{ padding: '0.58rem 0.55rem', color: dashboardPalette.text }}>{formatPercent(row.max_score_percent)}</td>
                      <td style={{ padding: '0.58rem 0.55rem', color: dashboardPalette.text }}>{formatPercent(row.stddev_score_percent)}</td>
                      <td style={{ padding: '0.58rem 0.55rem' }}>
                        <span style={{ padding: '0.18rem 0.48rem', borderRadius: 999, border: `1px solid ${flaggedMeta.border}`, background: flaggedMeta.background, color: flaggedMeta.color, fontWeight: 700 }}>
                          {formatPercent(row.below_target_percent)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            ) : (
              <MetricsBarGraph
                rows={sortedPerAssignmentSummaryRows}
                getLabel={(row) => row.assignment_title}
                maxRows={12}
              />
            )}
          </SurfaceCard>
        </>
      ) : null}
    </PageContainer>
  );
}
