import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { getMyAssignmentGrade } from '../api';

function asDisplayAnswer(raw) {
  if (raw == null || raw === '') return 'No answer submitted';
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof parsed === 'string') return parsed;
    if (Array.isArray(parsed)) return parsed.join(', ');
    if (typeof parsed === 'object') {
      return Object.entries(parsed).map(([k, v]) => `Part ${k}: ${v}`).join('\n');
    }
  } catch {
    // keep raw
  }
  return String(raw);
}

export default function StudentGradeReport({ assignmentId, courseId, assignmentTitle, onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!assignmentId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    getMyAssignmentGrade(assignmentId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load grade');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [assignmentId]);

  const styles = {
    container: { maxWidth: '900px', margin: '0 auto', padding: '1.5rem' },
    backButton: {
      display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem',
      background: '#f3f4f6', border: 'none', borderRadius: '8px', cursor: 'pointer',
      fontSize: '0.875rem', color: '#374151', marginBottom: '1rem'
    },
    header: { marginBottom: '1.5rem' },
    title: { margin: '0 0 0.25rem 0', fontSize: '1.5rem', fontWeight: 700, color: '#111827' },
    subtitle: { margin: 0, fontSize: '0.95rem', color: '#6b7280' },
    totalCard: {
      background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
      border: '1px solid #93c5fd',
      borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.5rem'
    },
    totalLabel: { fontSize: '0.8rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' },
    totalValue: { fontSize: '1.75rem', fontWeight: 800, color: '#1e3a8a' },
    sectionTitle: { margin: '0 0 0.75rem 0', fontSize: '1.1rem', fontWeight: 700, color: '#111827' },
    questionCard: {
      background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1rem', marginBottom: '1rem'
    },
    questionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' },
    questionTitle: { margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' },
    scoreChip: { padding: '0.2rem 0.5rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700, background: '#f3f4f6', color: '#374151' },
    rubricBlock: { marginTop: '0.75rem', padding: '0.75rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' },
    rubricPart: { marginBottom: '0.5rem', fontSize: '0.875rem' },
    commentBlock: { marginTop: '0.5rem', padding: '0.5rem', background: '#fffbeb', borderLeft: '4px solid #f59e0b', borderRadius: '4px', fontSize: '0.875rem', color: '#78350f' },
    errorBox: { background: '#fee2e2', color: '#dc2626', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' },
  };

  if (loading) return <div style={styles.container}><p style={{ color: '#6b7280' }}>Loading your grade...</p></div>;
  if (error) return (
    <div style={styles.container}>
      <button type="button" style={styles.backButton} onClick={onBack}>← Back</button>
      <div style={styles.errorBox}>{error}</div>
    </div>
  );
  if (!data) return null;

  const questions = data.questions || [];
  const scorePercent = data.score_total > 0 ? Math.round((data.score_earned / data.score_total) * 100) : 0;

  return (
    <div style={styles.container}>
      <button type="button" style={styles.backButton} onClick={onBack}>
        ← Back to assignment
      </button>
      <div style={styles.header}>
        <h1 style={styles.title}>Your grade: {assignmentTitle}</h1>
        <p style={styles.subtitle}>Grades have been released. Below you can see your score, where points were earned or lost, and any comments from your teacher.</p>
      </div>

      <div style={styles.totalCard}>
        <div style={styles.totalLabel}>Total score</div>
        <div style={styles.totalValue}>
          {Math.round(data.score_earned * 100) / 100} / {Math.round(data.score_total * 100) / 100} ({scorePercent}%)
        </div>
      </div>

      <h2 style={styles.sectionTitle}>Question breakdown</h2>
      {questions.map((q, idx) => (
        <div key={q.question_id} style={styles.questionCard}>
          <div style={styles.questionHeader}>
            <h3 style={styles.questionTitle}>Q{idx + 1}) {q.question_title}</h3>
            <span style={styles.scoreChip}>{q.earned_points} / {q.max_points} pts</span>
          </div>
          {q.question_text && (
            <div style={{ fontSize: '0.875rem', color: '#4b5563', marginBottom: '0.5rem' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{q.question_text}</ReactMarkdown>
            </div>
          )}
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', marginBottom: '0.25rem' }}>Your answer</div>
          <p style={{ margin: '0 0 0.5rem 0', whiteSpace: 'pre-wrap', color: '#374151', fontSize: '0.9rem' }}>{asDisplayAnswer(q.student_answer)}</p>

          {q.is_auto_graded && (
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#065f46', fontWeight: 600 }}>Auto-graded (MCQ / T/F)</p>
          )}

          {!q.is_auto_graded && (q.rubric_parts || []).length > 0 && (
            <div style={styles.rubricBlock}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', marginBottom: '0.5rem' }}>Rubric & feedback</div>
              {(q.rubric_parts || []).map((part) => (
                <div key={part.part_index} style={styles.rubricPart}>
                  <strong>{part.label}</strong> (max {part.max_points} pts)
                  {(part.level_criteria && part.level_criteria.length > 0) && (
                    <div style={{ marginTop: '0.25rem', color: '#6b7280', fontSize: '0.8rem' }}>
                      {part.level_criteria.map((lev) => (
                        <div key={lev.points}>+{lev.points}: {lev.criteria || '—'}</div>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: '0.2rem', fontWeight: 600, color: '#1e40af' }}>
                    You received: {part.selected_score != null ? `+${part.selected_score}` : '—'} pts
                  </div>
                  {part.comment && (
                    <div style={styles.commentBlock}>
                      <strong>Teacher comment:</strong> {part.comment}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {q.question_comment && (
            <div style={{ ...styles.commentBlock, marginTop: '0.5rem' }}>
              <strong>Teacher comment (question):</strong> {q.question_comment}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
