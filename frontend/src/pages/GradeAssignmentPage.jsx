import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { getAssignmentGradingState, saveAssignmentGradingState, getAssignmentSubmissionStatus } from '../api';

function parseHash() {
  const hash = window.location.hash;
  const courseMatch = hash.match(/#course\/(\d+)/);
  const assignmentMatch = hash.match(/\/assignment\/(\d+)\/grade\/([^/?]+)/);
  return {
    courseId: courseMatch ? parseInt(courseMatch[1], 10) : null,
    assignmentId: assignmentMatch ? parseInt(assignmentMatch[1], 10) : null,
    studentId: assignmentMatch ? decodeURIComponent(assignmentMatch[2]) : null,
  };
}

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

export default function GradeAssignmentPage() {
  const { courseId, assignmentId, studentId } = parseHash();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [statusData, setStatusData] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);

  useEffect(() => {
    async function load() {
      if (!assignmentId || !studentId) {
        setError('Missing assignment or student ID');
        setLoading(false);
        return;
      }
      try {
        const [response, statuses] = await Promise.all([
          getAssignmentGradingState(assignmentId, studentId),
          getAssignmentSubmissionStatus(assignmentId),
        ]);
        setData(response);
        setStatusData(statuses);
        setQuestionIndex(0);
      } catch (err) {
        setError(err.message || 'Failed to load grading view');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [assignmentId, studentId]);

  const questions = data?.questions || [];
  const currentQuestion = questions[questionIndex] || null;

  const questionGradesPayload = useMemo(() => {
    return questions
      .filter((q) => q.requires_manual_grading)
      .map((q) => ({
        question_id: q.question_id,
        question_comment: q.question_comment || '',
        parts: (q.rubric_parts || [])
          .filter((p) => p.selected_score != null)
          .map((p) => ({
            part_index: p.part_index,
            score: Number(p.selected_score),
            comment: p.comment || '',
          })),
      }));
  }, [questions]);

  const persistDraft = async (nextQuestions, submitGrade = false) => {
    if (!assignmentId || !studentId) return;
    setSaving(true);
    try {
      const payload = {
        question_grades: nextQuestions
          .filter((q) => q.requires_manual_grading)
          .map((q) => ({
            question_id: q.question_id,
            question_comment: q.question_comment || '',
            parts: (q.rubric_parts || [])
              .filter((p) => p.selected_score != null)
              .map((p) => ({
                part_index: p.part_index,
                score: Number(p.selected_score),
                comment: p.comment || '',
              })),
          })),
        submit_grade: submitGrade,
      };
      const updated = await saveAssignmentGradingState(assignmentId, studentId, payload);
      setData((prev) => {
        const base = prev || {};
        const prevQuestions = base.questions || [];
        const updatedQuestions = updated.questions || [];
        const mergedQuestions = updatedQuestions.map((q, qIdx) => {
          const prevQ = prevQuestions[qIdx];
          if (!prevQ?.rubric_parts?.length) return q;
          return {
            ...q,
            rubric_parts: (q.rubric_parts || []).map((p) => {
              const prevP = prevQ.rubric_parts?.find((r) => r.part_index === p.part_index);
              if (prevP && String(prevP.comment || '').trim() !== '' && String(p.comment || '').trim() === '')
                return { ...p, comment: prevP.comment || '' };
              return p;
            }),
          };
        });
        return { ...base, ...updated, questions: mergedQuestions };
      });
      const statuses = await getAssignmentSubmissionStatus(assignmentId);
      setStatusData(statuses);
      setQuestionIndex((idx) => Math.min(idx, (updated.questions || []).length - 1));
    } catch (err) {
      setError(err.message || 'Failed to save grading');
    } finally {
      setSaving(false);
    }
  };

  const updatePartScore = (partIndex, score) => {
    if (!currentQuestion) return;
    const nextQuestions = questions.map((q, idx) => {
      if (idx !== questionIndex) return q;
      return {
        ...q,
        rubric_parts: (q.rubric_parts || []).map((p) =>
          p.part_index === partIndex
            ? { ...p, selected_score: score, graded: true }
            : p
        ),
      };
    });
    setData((prev) => ({ ...prev, questions: nextQuestions }));
    persistDraft(nextQuestions, false);
  };

  const updatePartComment = (partIndex, comment) => {
    if (!currentQuestion) return;
    setData((prev) => {
      const nextQuestions = (prev?.questions || []).map((q, idx) => {
        if (idx !== questionIndex) return q;
        return {
          ...q,
          rubric_parts: (q.rubric_parts || []).map((p) =>
            p.part_index === partIndex ? { ...p, comment } : p
          ),
        };
      });
      return { ...prev, questions: nextQuestions };
    });
  };

  const onCommentBlur = () => {
    persistDraft(questions, false);
  };

  const canMoveNext = !currentQuestion
    ? false
    : currentQuestion.is_auto_graded || currentQuestion.is_fully_graded;

  const styles = {
    container: { maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' },
    topBar: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: '1rem', background: 'white', padding: '0.8rem 1rem',
      borderRadius: '10px', border: '1px solid #e5e7eb'
    },
    body: { display: 'grid', gridTemplateColumns: '2.3fr 1.4fr 0.9fr', gap: '1rem' },
    panel: { background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1rem' },
    h: { margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#111827' },
    gradeButton: {
      background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px',
      padding: '0.55rem 0.9rem', cursor: 'pointer', fontWeight: 700
    },
    scoreChip: { display: 'inline-block', padding: '0.2rem 0.45rem', borderRadius: '6px', fontSize: '0.76rem', fontWeight: 700 },
  };

  if (loading) return <div style={styles.container}>Loading grading view...</div>;
  if (error) return <div style={styles.container}>{error}</div>;
  if (!data || !currentQuestion) return <div style={styles.container}>No grading data found.</div>;

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => { window.location.hash = `#course/${courseId}/assignment/${assignmentId}/view`; }}
            style={{ border: 'none', background: '#f3f4f6', borderRadius: '8px', padding: '0.45rem 0.75rem', cursor: 'pointer' }}
          >
            ← Back
          </button>
          <strong>Grading {studentId}</strong>
          <span style={{ color: '#6b7280' }}>{data.assignment_title}</span>
        </div>
        <div>
          <strong>Total grade: </strong>
          {`${Math.round(data.score_earned * 100) / 100}/${Math.round(data.score_total * 100) / 100}`}
          {statusData?.grade_released && (
            <span style={{ marginLeft: '0.6rem', color: '#065f46', fontWeight: 700 }}>Released</span>
          )}
          {data.all_questions_fully_graded && (
            <button
              type="button"
              style={{ ...styles.gradeButton, marginLeft: '1rem' }}
              onClick={() => persistDraft(questions, true)}
              disabled={saving}
            >
              {saving
                ? (data.grade_submitted ? 'Updating...' : 'Submitting...')
                : (data.grade_submitted ? 'Update grade' : 'Submit grade')}
            </button>
          )}
        </div>
      </div>

      <div style={styles.body}>
        <div style={styles.panel}>
          <h3 style={styles.h}>{`Q${questionIndex + 1}) ${currentQuestion.question_title}`}</h3>
          {currentQuestion.question_text ? (
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6b7280', marginBottom: '0.4rem' }}>Question</div>
              <div style={{ color: '#374151', fontSize: '0.95rem', lineHeight: 1.5 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {currentQuestion.question_text}
                </ReactMarkdown>
              </div>
            </div>
          ) : null}
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6b7280', marginBottom: '0.35rem' }}>Student answer</div>
          <p style={{ whiteSpace: 'pre-wrap', color: '#374151' }}>{asDisplayAnswer(currentQuestion.student_answer)}</p>
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between' }}>
            <button
              type="button"
              onClick={() => setQuestionIndex((i) => Math.max(0, i - 1))}
              disabled={questionIndex === 0}
              style={{ border: 'none', background: '#f3f4f6', borderRadius: '8px', padding: '0.45rem 0.8rem', cursor: 'pointer' }}
            >
              Previous
            </button>
            {questionIndex < questions.length - 1 && canMoveNext && (
              <button
                type="button"
                onClick={() => setQuestionIndex((i) => Math.min(questions.length - 1, i + 1))}
                style={{ border: 'none', background: '#86efac', borderRadius: '8px', padding: '0.45rem 0.8rem', cursor: 'pointer', fontWeight: 700 }}
              >
                Next →
              </button>
            )}
          </div>
        </div>

        <div style={styles.panel}>
          <h3 style={styles.h}>Rubric</h3>
          {currentQuestion.is_auto_graded ? (
            <div style={{ marginTop: '0.75rem' }}>
              <p style={{ margin: '0.4rem 0', color: '#065f46', fontWeight: 700 }}>Auto-graded ({currentQuestion.earned_points}/{currentQuestion.max_points})</p>
              <p style={{ margin: 0, color: '#6b7280' }}>MCQ and T/F are graded automatically.</p>
            </div>
          ) : (
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              {(currentQuestion.rubric_parts || []).map((part) => (
                <div key={part.part_index} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <strong>{part.label}</strong>
                    <span style={{ color: '#6b7280' }}>{`max ${part.max_points}`}</span>
                  </div>
                  {(part.level_criteria && part.level_criteria.length > 0) ? (
                    <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: '#374151', lineHeight: 1.5 }}>
                      {part.level_criteria.map((level) => (
                        <div key={level.points} style={{ marginBottom: '0.25rem' }}>
                          <span style={{ fontWeight: 700, color: '#111827' }}>+{level.points}:</span>
                          {' '}{level.criteria || '—'}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
                    {(part.options || []).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => updatePartScore(part.part_index, opt)}
                        style={{
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0.25rem 0.5rem',
                          cursor: 'pointer',
                          background: Number(part.selected_score) === Number(opt) ? '#2563eb' : '#f3f4f6',
                          color: Number(part.selected_score) === Number(opt) ? 'white' : '#111827',
                          fontWeight: 700,
                        }}
                      >
                        {`+${opt}`}
                      </button>
                    ))}
                  </div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem' }}>Comment (optional)</label>
                  <textarea
                    value={part.comment || ''}
                    placeholder="Enter comment..."
                    onChange={(e) => updatePartComment(part.part_index, e.target.value)}
                    onBlur={onCommentBlur}
                    style={{ width: '100%', minHeight: '56px', border: '1px solid #d1d5db', borderRadius: '6px', padding: '0.5rem', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>
          )}

          {questions.some((q) => q.requires_manual_grading) && (
            <button
              type="button"
              style={{ ...styles.gradeButton, marginTop: '1rem', width: '100%', background: '#6b7280' }}
              onClick={() => persistDraft(questions, false)}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>

        <div style={styles.panel}>
          <h3 style={styles.h}>Grades</h3>
          <div style={{ marginTop: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {questions.map((q, idx) => {
              const isUngradedFrq = q.requires_manual_grading && !q.is_fully_graded;
              const displayScore = isUngradedFrq
                ? '—'
                : `${Math.round(q.earned_points * 100) / 100}/${Math.round(q.max_points * 100) / 100}`;
              return (
              <button
                key={q.question_id}
                type="button"
                onClick={() => setQuestionIndex(idx)}
                style={{
                  border: idx === questionIndex ? '1px solid #2563eb' : '1px solid #e5e7eb',
                  background: idx === questionIndex ? '#eff6ff' : 'white',
                  borderRadius: '8px',
                  padding: '0.45rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.83rem', fontWeight: 700 }}>{`Q${idx + 1}`}</span>
                  <span style={{ ...styles.scoreChip, background: '#f3f4f6', color: '#374151' }}>
                    {displayScore}
                  </span>
                </div>
              </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
