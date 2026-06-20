import React, { useEffect, useMemo, useState } from 'react';
import { getAssignmentAnalytics, getCourseAnalytics, getCourses } from '../api';

function formatPercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  return `${Math.round(Number(value) * 10) / 10}%`;
}

function formatSeconds(value) {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  const seconds = Math.round(Number(value));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

function formatDate(value) {
  if (!value) return '--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '--';
  return parsed.toLocaleString();
}

function StatCard({ label, value, tone = 'neutral' }) {
  const tones = {
    neutral: ['#f8fafc', '#0f172a', '#e2e8f0'],
    good: ['#ecfdf5', '#065f46', '#a7f3d0'],
    warn: ['#fffbeb', '#92400e', '#fde68a'],
    bad: ['#fef2f2', '#991b1b', '#fecaca'],
  };
  const [bg, color, border] = tones[tone] || tones.neutral;
  return (
    <div style={{ background: bg, color, border: `1px solid ${border}`, borderRadius: 8, padding: '0.85rem 1rem', minWidth: 0 }}>
      <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 800, opacity: 0.78 }}>{label}</div>
      <div style={{ marginTop: '0.3rem', fontSize: '1.35rem', fontWeight: 850 }}>{value ?? '--'}</div>
    </div>
  );
}

function Bar({ value, max = 100, color = '#2563eb' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (Number(value || 0) / max) * 100)) : 0;
  return (
    <div style={{ width: '100%', height: 8, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color }} />
    </div>
  );
}

export default function Analytics() {
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [courseAnalytics, setCourseAnalytics] = useState(null);
  const [assignmentAnalytics, setAssignmentAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadCourses() {
      setLoading(true);
      setError('');
      try {
        const data = await getCourses();
        const nextCourses = data.courses || [];
        if (cancelled) return;
        setCourses(nextCourses);
        const firstCourse = nextCourses[0];
        if (firstCourse?.id) setSelectedCourseId(String(firstCourse.id));
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load courses');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadCourses();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedCourseId) return;
    let cancelled = false;
    async function loadCourseAnalytics() {
      setLoading(true);
      setError('');
      setCourseAnalytics(null);
      setAssignmentAnalytics(null);
      try {
        const data = await getCourseAnalytics(selectedCourseId);
        if (cancelled) return;
        setCourseAnalytics(data);
        const firstAssignment = data.assignments?.[0];
        setSelectedAssignmentId(firstAssignment ? String(firstAssignment.assignment_id) : '');
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadCourseAnalytics();
    return () => { cancelled = true; };
  }, [selectedCourseId]);

  useEffect(() => {
    if (!selectedAssignmentId) {
      setAssignmentAnalytics(null);
      return;
    }
    let cancelled = false;
    async function loadAssignmentAnalytics() {
      setDetailLoading(true);
      setError('');
      try {
        const data = await getAssignmentAnalytics(selectedAssignmentId);
        if (!cancelled) setAssignmentAnalytics(data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load assignment analytics');
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }
    loadAssignmentAnalytics();
    return () => { cancelled = true; };
  }, [selectedAssignmentId]);

  const selectedCourse = courses.find((course) => String(course.id) === String(selectedCourseId));
  const assignmentOptions = courseAnalytics?.assignments || [];
  const overviewMap = useMemo(() => {
    const map = new Map();
    (courseAnalytics?.overview || []).forEach((metric) => map.set(metric.label, metric.value));
    return map;
  }, [courseAnalytics]);

  const styles = {
    container: { maxWidth: '1400px', margin: '0 auto', padding: '0.25rem 0.5rem 1.75rem', color: '#0f172a' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' },
    title: { margin: 0, fontSize: '2.1rem', fontWeight: 850, lineHeight: 1.05 },
    subtitle: { margin: '0.45rem 0 0 0', color: '#475569', fontSize: '0.95rem' },
    controls: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' },
    select: { minWidth: 220, padding: '0.55rem 0.7rem', border: '1px solid #cbd5e1', borderRadius: 8, background: 'white', color: '#0f172a', fontWeight: 650 },
    section: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', marginBottom: '1rem', boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)' },
    sectionTitle: { margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 800 },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' },
    tableWrap: { overflowX: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' },
    th: { textAlign: 'left', padding: '0.65rem', borderBottom: '1px solid #cbd5e1', color: '#475569', whiteSpace: 'nowrap' },
    td: { padding: '0.65rem', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' },
    muted: { color: '#64748b' },
    error: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 8, padding: '0.85rem 1rem', marginBottom: '1rem' },
  };

  if (loading && !courseAnalytics) {
    return <div style={styles.container}><p style={styles.muted}>Loading analytics...</p></div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Analytics</h1>
          <p style={styles.subtitle}>Granular student engagement, per-question performance, and grading workflow signals.</p>
        </div>
        <div style={styles.controls}>
          <select value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)} style={styles.select}>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>{course.course_name || `Course ${course.id}`}</option>
            ))}
          </select>
          <select value={selectedAssignmentId} onChange={(e) => setSelectedAssignmentId(e.target.value)} style={styles.select} disabled={!assignmentOptions.length}>
            {assignmentOptions.length ? assignmentOptions.map((assignment) => (
              <option key={assignment.assignment_id} value={assignment.assignment_id}>{assignment.title}</option>
            )) : <option value="">No assignments</option>}
          </select>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>{selectedCourse?.course_name || courseAnalytics?.course_name || 'Course'} overview</h2>
        <div style={styles.grid}>
          <StatCard label="Assignments" value={overviewMap.get('Assignments') ?? 0} />
          <StatCard label="Students" value={overviewMap.get('Students') ?? 0} />
          <StatCard label="Assignment opens" value={overviewMap.get('Assignment opens') ?? 0} />
          <StatCard label="Submissions" value={overviewMap.get('Submissions') ?? 0} tone="good" />
          <StatCard label="Grading backlog" value={overviewMap.get('Grading backlog') ?? 0} tone={overviewMap.get('Grading backlog') ? 'warn' : 'good'} />
          <StatCard label="Average score" value={formatPercent(overviewMap.get('Average score'))} />
        </div>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Assignment health</h2>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Assignment', 'Opened', 'Started', 'Submitted', 'Late', 'Missing', 'Graded', 'Avg score', 'Median active'].map((header) => (
                  <th key={header} style={styles.th}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(courseAnalytics?.assignments || []).map((assignment) => (
                <tr key={assignment.assignment_id} onClick={() => setSelectedAssignmentId(String(assignment.assignment_id))} style={{ cursor: 'pointer', background: String(selectedAssignmentId) === String(assignment.assignment_id) ? '#f8fafc' : 'transparent' }}>
                  <td style={styles.td}><strong>{assignment.title}</strong></td>
                  <td style={styles.td}>{assignment.opened_count} / {assignment.enrolled_count}<Bar value={assignment.opened_count} max={assignment.enrolled_count} /></td>
                  <td style={styles.td}>{assignment.started_count}</td>
                  <td style={styles.td}>{assignment.submitted_count}</td>
                  <td style={styles.td}>{assignment.late_count}</td>
                  <td style={styles.td}>{assignment.missing_count}</td>
                  <td style={styles.td}>{assignment.graded_count}</td>
                  <td style={styles.td}>{formatPercent(assignment.average_score_percent)}</td>
                  <td style={styles.td}>{formatSeconds(assignment.median_active_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {assignmentAnalytics && (
        <>
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>{assignmentAnalytics.assignment.title} funnel</h2>
            <div style={styles.grid}>
              {assignmentAnalytics.funnel.map((step, index) => (
                <div key={step.label}>
                  <StatCard label={step.label} value={step.count} tone={index >= 3 ? 'good' : 'neutral'} />
                  <div style={{ marginTop: '0.45rem' }}>
                    <Bar value={step.count} max={assignmentAnalytics.funnel[0]?.count || 1} color={index >= 3 ? '#059669' : '#2563eb'} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Needs attention</h2>
            {assignmentAnalytics.needs_attention?.length ? (
              <div style={styles.grid}>
                {assignmentAnalytics.needs_attention.slice(0, 8).map((item, index) => (
                  <StatCard key={`${item.type}-${index}`} label={item.type.replaceAll('_', ' ')} value={typeof item.value === 'number' ? Math.round(item.value * 10) / 10 : item.value} tone="warn" />
                ))}
              </div>
            ) : (
              <p style={styles.muted}>No major analytics flags for this assignment yet.</p>
            )}
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Per-question analytics {detailLoading ? '...' : ''}</h2>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {['Question', 'Type', 'Views', 'Students', 'Avg time', 'Answer changes', 'Skip', 'Return', 'Avg score', 'Weak spots'].map((header) => (
                      <th key={header} style={styles.th}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(assignmentAnalytics.questions || []).map((question) => (
                    <tr key={question.question_qid || question.question_id}>
                      <td style={styles.td}><strong>{question.title}</strong><div style={styles.muted}>{question.question_qid}</div></td>
                      <td style={styles.td}>{question.question_type || '--'}</td>
                      <td style={styles.td}>{question.views}</td>
                      <td style={styles.td}>{question.unique_students}</td>
                      <td style={styles.td}>{formatSeconds(question.avg_active_seconds)}</td>
                      <td style={styles.td}>{question.answer_changes}</td>
                      <td style={styles.td}>{formatPercent(question.skip_rate)}</td>
                      <td style={styles.td}>{formatPercent(question.return_rate)}</td>
                      <td style={styles.td}>{formatPercent(question.average_score_percent)}</td>
                      <td style={styles.td}>
                        {(question.common_wrong_choices || []).slice(0, 2).map((choice) => <div key={choice.choice}>Wrong: {choice.choice} ({choice.count})</div>)}
                        {(question.weakest_rubric_parts || []).slice(0, 2).map((part) => <div key={part.label}>Rubric: {part.label} {formatPercent(part.average_score_percent)}</div>)}
                        {(question.failed_tests || []).slice(0, 2).map((test) => <div key={test.name}>Test: {test.name} ({test.failed_count})</div>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Student drilldown</h2>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {['Student', 'First open', 'Last activity', 'Active time', 'Viewed', 'Unanswered', 'Status', 'Score'].map((header) => (
                      <th key={header} style={styles.th}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(assignmentAnalytics.students || []).map((student) => (
                    <tr key={student.student_id}>
                      <td style={styles.td}>{student.student_id}</td>
                      <td style={styles.td}>{formatDate(student.first_opened_at)}</td>
                      <td style={styles.td}>{formatDate(student.last_activity_at)}</td>
                      <td style={styles.td}>{formatSeconds(student.active_seconds)}</td>
                      <td style={styles.td}>{student.questions_viewed}</td>
                      <td style={styles.td}>{student.unanswered_count}</td>
                      <td style={styles.td}>{student.timing_status}</td>
                      <td style={styles.td}>{formatPercent(student.score_percent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
