import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { getAssignmentGradingState, saveAssignmentGradingState, getAssignmentSubmissionStatus, getCourse, getUserById } from '../api';
import { CourseDashboardBackButton, CourseDashboardSpinnerState, dashboardPalette } from '../components/CourseDashboardUI';
import { buildHashWithFrom, getFromHash, navigateBackWithFallback, readHashParams } from '../utils/navigation';

function parseHash() {
  const hash = window.location.hash;
  const courseMatch = hash.match(/#course\/(\d+)/);
  const assignmentMatch = hash.match(/\/assignment\/(\d+)\/grade\/([^/?]+)/);
  const params = readHashParams(hash);
  return {
    courseId: courseMatch ? parseInt(courseMatch[1], 10) : null,
    assignmentId: assignmentMatch ? parseInt(assignmentMatch[1], 10) : null,
    studentId: assignmentMatch ? decodeURIComponent(assignmentMatch[2]) : null,
    fromHash: params.get('from') || '',
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

function buildStudentIdentity(studentId, studentInfo, rosterName) {
  const firstName = String(studentInfo?.first_name || '').trim();
  const lastName = String(studentInfo?.last_name || '').trim();
  const fullName = firstName && lastName
    ? `${firstName} ${lastName}`
    : String(rosterName || studentInfo?.email || studentId);

  return {
    student_id: studentId,
    student_name: fullName,
    student_first_name: firstName || fullName.split(' ').slice(0, -1).join(' ').trim(),
    student_last_name: lastName || fullName.split(' ').slice(-1)[0].trim(),
  };
}

function isStudentGraded(row) {
  return Boolean(row?.grade_submitted_at);
}

function compareStudentRows(a, b) {
  const aGraded = isStudentGraded(a);
  const bGraded = isStudentGraded(b);
  if (aGraded !== bGraded) return aGraded ? 1 : -1;

  const aLast = String(a?.student_last_name || '').trim().toLowerCase();
  const bLast = String(b?.student_last_name || '').trim().toLowerCase();
  if (aLast !== bLast) return aLast.localeCompare(bLast);

  const aFirst = String(a?.student_first_name || '').trim().toLowerCase();
  const bFirst = String(b?.student_first_name || '').trim().toLowerCase();
  if (aFirst !== bFirst) return aFirst.localeCompare(bFirst);

  const aName = String(a?.student_name || '').trim().toLowerCase();
  const bName = String(b?.student_name || '').trim().toLowerCase();
  if (aName !== bName) return aName.localeCompare(bName);

  return String(a?.student_id || '').localeCompare(String(b?.student_id || ''));
}

function buildStudentRows(studentIds, statusData, courseData, userInfoById) {
  const statusByStudent = new Map((statusData?.students || []).map((row) => [row.student_id, row]));

  return studentIds.map((sid) => {
    const identity = buildStudentIdentity(
      sid,
      userInfoById[sid],
      courseData?.student_name_by_id?.[sid]
    );
    const status = statusByStudent.get(sid) || {
      student_id: sid,
      submitted: false,
      submitted_at: null,
      timing_status: 'not_submitted',
      grade_submitted: false,
      grade_submitted_at: null,
      score_earned: null,
      score_total: null,
      score_percent: null,
    };

    return {
      ...identity,
      ...status,
    };
  }).sort(compareStudentRows);
}

function mergeStudentRows(existingRows, statusData) {
  const statusByStudent = new Map((statusData?.students || []).map((row) => [row.student_id, row]));
  return existingRows.map((row) => ({
    ...row,
    ...(statusByStudent.get(row.student_id) || {}),
  })).sort(compareStudentRows);
}

function formatStudentScore(row) {
  if (row?.score_earned == null || row?.score_total == null) return 'Needs grading';
  return `${Math.round(Number(row.score_earned) * 100) / 100}/${Math.round(Number(row.score_total) * 100) / 100}`;
}

function isQuestionCompleteDraft(question) {
  if (!question) return false;
  if (question.is_auto_graded) return true;
  if (!question.requires_manual_grading) return Boolean(question.is_fully_graded);
  const parts = question.rubric_parts || [];
  if (!parts.length) return Boolean(question.is_fully_graded);
  return parts.every((part) => part.selected_score != null);
}

function areAllQuestionsCompleteDraft(questions) {
  return (questions || []).every(isQuestionCompleteDraft);
}

function commentFieldKey(questionId, partIndex) {
  return `${questionId}:${partIndex}`;
}

export default function GradeAssignmentPage() {
  const currentHash = window.location.hash;
  const { courseId, assignmentId, studentId, fromHash } = parseHash();
  const [initialLoading, setInitialLoading] = useState(true);
  const [studentLoading, setStudentLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [statusData, setStatusData] = useState(null);
  const [studentRows, setStudentRows] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(studentId);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [saveState, setSaveState] = useState('updated');
  const [studentMenuOpen, setStudentMenuOpen] = useState(false);
  const latestQuestionsRef = useRef([]);
  const persistSequenceRef = useRef(0);
  const autoSaveTimerRef = useRef(null);
  const commentVersionRef = useRef({});
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, []);

  const setQuestions = (nextQuestionsOrUpdater) => {
    setData((prev) => {
      const previousQuestions = prev?.questions || [];
      const nextQuestions = typeof nextQuestionsOrUpdater === 'function'
        ? nextQuestionsOrUpdater(previousQuestions)
        : nextQuestionsOrUpdater;
      latestQuestionsRef.current = nextQuestions || [];
      return { ...(prev || {}), questions: nextQuestions || [] };
    });
  };

  useEffect(() => {
    setSelectedStudentId(studentId);
  }, [studentId]);

  const loadStudentData = async (nextStudentId, { showLoading = true } = {}) => {
    if (!assignmentId || !nextStudentId) return;

    const requestId = persistSequenceRef.current + 1;
    persistSequenceRef.current = requestId;
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    if (showLoading) {
      setStudentLoading(true);
    }
    setError('');
    setStudentMenuOpen(false);
    setSaveState('updated');

    try {
      const response = await getAssignmentGradingState(assignmentId, nextStudentId);
      if (!mountedRef.current || requestId !== persistSequenceRef.current) return;
      setData(response);
      latestQuestionsRef.current = response?.questions || [];
      setQuestionIndex(0);
    } catch (err) {
      if (!mountedRef.current || requestId !== persistSequenceRef.current) return;
      setError(err.message || 'Failed to load grading view');
    } finally {
      if (mountedRef.current && requestId === persistSequenceRef.current) {
        setStudentLoading(false);
      }
    }
  };

  useEffect(() => {
    async function loadPageContext() {
      if (!assignmentId || !selectedStudentId) {
        setError('Missing assignment or student ID');
        setInitialLoading(false);
        setStudentLoading(false);
        return;
      }

      setInitialLoading(true);
      setStudentLoading(false);
      setError('');
      setStudentMenuOpen(false);
      setSaveState('updated');

      try {
        const [statuses, courseData] = await Promise.all([
          getAssignmentSubmissionStatus(assignmentId),
          courseId ? getCourse(courseId) : Promise.resolve(null),
        ]);

        const studentIds = courseData?.student_ids || [];
        const userInfoEntries = await Promise.all(
          studentIds.map(async (sid) => {
            try {
              return [sid, await getUserById(sid)];
            } catch {
              return [sid, null];
            }
          })
        );
        const userInfoById = Object.fromEntries(userInfoEntries);
        const nextStudentRows = buildStudentRows(studentIds, statuses, courseData, userInfoById);

        if (!mountedRef.current) return;

        setStatusData(statuses);
        setStudentRows(nextStudentRows);
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err.message || 'Failed to load grading view');
      } finally {
        if (mountedRef.current) {
          setInitialLoading(false);
        }
      }
    }

    loadPageContext();
  }, [assignmentId, courseId]);

  useEffect(() => {
    if (initialLoading || !selectedStudentId) return;
    loadStudentData(selectedStudentId, { showLoading: true });
  }, [initialLoading, selectedStudentId]);

  const questions = data?.questions || [];
  const currentQuestion = questions[questionIndex] || null;
  const assignmentTitle = data?.assignment_title || 'Assignment';
  const selectedStudentRow = studentRows.find((row) => row.student_id === selectedStudentId) || null;
  const studentDisplayName = selectedStudentRow?.student_name || selectedStudentId;
  const showSaveButton = questions.some((q) => q.requires_manual_grading);

  const persistDraft = async (nextQuestions) => {
    if (!assignmentId || !selectedStudentId) return;
    const requestId = persistSequenceRef.current + 1;
    const sentCommentVersions = { ...commentVersionRef.current };
    persistSequenceRef.current = requestId;
    setSaveState('updating');

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
        submit_grade: Boolean(data?.grade_submitted) || areAllQuestionsCompleteDraft(nextQuestions),
      };

      const updated = await saveAssignmentGradingState(assignmentId, selectedStudentId, payload);
      if (!mountedRef.current || requestId !== persistSequenceRef.current) return;

      setData((prev) => {
        const base = prev || {};
        const prevQuestions = base.questions || [];
        const latestQuestions = latestQuestionsRef.current || [];
        const updatedQuestions = updated.questions || [];
        const mergedQuestions = updatedQuestions.map((q, idx) => {
          const prevQ = prevQuestions[idx];
          const latestQ = latestQuestions.find((item) => item.question_id === q.question_id);
          if (!prevQ?.rubric_parts?.length) return q;
          return {
            ...q,
            rubric_parts: (q.rubric_parts || []).map((part) => {
              const prevPart = prevQ.rubric_parts?.find((item) => item.part_index === part.part_index);
              const latestPart = latestQ?.rubric_parts?.find((item) => item.part_index === part.part_index);
              const key = commentFieldKey(q.question_id, part.part_index);
              const latestVersion = commentVersionRef.current[key] || 0;
              const sentVersion = sentCommentVersions[key] || 0;
              if (latestPart && latestVersion >= sentVersion) {
                return { ...part, comment: latestPart.comment || '' };
              }
              if (prevPart && String(prevPart.comment || '').trim() !== '' && String(part.comment || '').trim() === '') {
                return { ...part, comment: prevPart.comment || '' };
              }
              return part;
            }),
          };
        });
        latestQuestionsRef.current = mergedQuestions;
        return { ...base, ...updated, questions: mergedQuestions };
      });

      const statuses = await getAssignmentSubmissionStatus(assignmentId);
      if (!mountedRef.current || requestId !== persistSequenceRef.current) return;

      setStatusData(statuses);
      setStudentRows((prevRows) => mergeStudentRows(prevRows, statuses));
      setQuestionIndex((idx) => Math.min(idx, (updated.questions || []).length - 1));
      setSaveState('updated');
    } catch (err) {
      if (!mountedRef.current || requestId !== persistSequenceRef.current) return;
      setError(err.message || 'Failed to save grading');
      setSaveState('updated');
    }
  };

  const scheduleAutoSave = (nextQuestions) => {
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    setSaveState('updating');
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      persistDraft(latestQuestionsRef.current);
    }, 700);
  };

  const flushAutoSave = async () => {
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    await persistDraft(latestQuestionsRef.current);
  };

  const updatePartScore = (partIndex, score) => {
    if (!currentQuestion) return;
    const nextQuestions = questions.map((q, idx) => {
      if (idx !== questionIndex) return q;
      return {
        ...q,
        rubric_parts: (q.rubric_parts || []).map((p) => (
          p.part_index === partIndex
            ? { ...p, selected_score: score, graded: true }
            : p
        )),
      };
    });
    setQuestions(nextQuestions);
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    persistDraft(nextQuestions);
  };

  const updatePartComment = (partIndex, comment) => {
    if (!currentQuestion) return;
    const key = commentFieldKey(currentQuestion.question_id, partIndex);
    commentVersionRef.current[key] = (commentVersionRef.current[key] || 0) + 1;
    const nextQuestions = questions.map((q, idx) => {
      if (idx !== questionIndex) return q;
      return {
        ...q,
        rubric_parts: (q.rubric_parts || []).map((p) => (
          p.part_index === partIndex ? { ...p, comment } : p
        )),
      };
    });
    setQuestions(nextQuestions);
    scheduleAutoSave(nextQuestions);
  };

  const isQuestionComplete = (question) => Boolean(question?.is_auto_graded || question?.is_fully_graded || isQuestionCompleteDraft(question));

  const navigateToStudent = async (nextStudentId) => {
    if (!nextStudentId || nextStudentId === selectedStudentId) {
      setStudentMenuOpen(false);
      return;
    }
    if (saveState === 'updating') {
      await flushAutoSave();
    }
    setStudentMenuOpen(false);
    setSelectedStudentId(nextStudentId);
    window.history.replaceState(null, '', buildHashWithFrom(`#course/${courseId}/assignment/${assignmentId}/grade/${encodeURIComponent(nextStudentId)}`, fromHash));
  };

  const styles = {
    container: { maxWidth: '1360px', margin: '0 auto', padding: '24px' },
    topBar: {
      display: 'grid',
      gridTemplateColumns: 'auto minmax(280px, 1.2fr) minmax(200px, 1fr) auto',
      alignItems: 'center',
      gap: '16px',
      marginBottom: '16px',
      background: dashboardPalette.white,
      padding: '16px',
      borderRadius: '8px',
      border: `1px solid ${dashboardPalette.border}`
    },
    headerInline: { display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, position: 'relative' },
    headerLabel: { fontSize: '0.92rem', color: dashboardPalette.muted, fontWeight: 700, whiteSpace: 'nowrap' },
    headerCenter: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.65rem', minWidth: 0 },
    headerRight: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap' },
    studentMenuButton: {
      minWidth: '220px',
      border: `1px solid ${dashboardPalette.border}`,
      borderRadius: '8px',
      background: dashboardPalette.white,
      padding: '10px 12px',
      textAlign: 'left',
      cursor: 'pointer'
    },
    studentMenuPanel: {
      position: 'absolute',
      top: '100%',
      left: '0',
      zIndex: 20,
      width: 'min(460px, calc(100vw - 5rem))',
      marginTop: '8px',
      background: dashboardPalette.white,
      border: `1px solid ${dashboardPalette.border}`,
      borderRadius: '8px',
      overflow: 'hidden'
    },
    studentMenuTable: { width: '100%', borderCollapse: 'collapse' },
    studentMenuCell: { padding: '12px 14px', fontSize: '0.88rem', borderBottom: `1px solid ${dashboardPalette.border}` },
    body: { display: 'grid', gridTemplateColumns: 'minmax(0, 2.5fr) minmax(320px, 0.95fr)', gap: '16px' },
    panel: { background: dashboardPalette.white, border: `1px solid ${dashboardPalette.border}`, borderRadius: '8px', padding: '16px' },
    h: { margin: 0, fontSize: '1.1rem', fontWeight: 700, color: dashboardPalette.navy },
    questionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' },
    questionNav: { display: 'flex', alignItems: 'center', gap: '0.65rem' },
    navButton: { borderRadius: '8px', padding: '0.45rem 0.8rem', cursor: 'pointer', fontWeight: 600, border: `1px solid ${dashboardPalette.border}` },
    gradeButton: {
      background: dashboardPalette.navy,
      color: dashboardPalette.white,
      border: `1px solid ${dashboardPalette.navy}`,
      borderRadius: '8px',
      padding: '0.55rem 0.9rem',
      cursor: 'pointer',
      fontWeight: 700,
      minWidth: '88px'
    },
    scoreChip: { display: 'inline-block', padding: '0.2rem 0.45rem', borderRadius: '6px', fontSize: '0.76rem', fontWeight: 700, border: `1px solid ${dashboardPalette.border}` },
    questionList: { marginTop: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' },
    saveText: { color: dashboardPalette.muted, fontWeight: 700, minWidth: '74px', textAlign: 'right' },
    loadingPanel: { background: dashboardPalette.white, border: `1px solid ${dashboardPalette.border}`, borderRadius: '8px', padding: '16px', color: dashboardPalette.muted },
  };

  const handleBack = () => {
    navigateBackWithFallback(`#course/${courseId}/assignment/${assignmentId}/view`, fromHash || getFromHash(currentHash));
  };

  if (initialLoading) return <div style={styles.container}><CourseDashboardBackButton onClick={handleBack} style={{ marginBottom: '16px' }}>Back</CourseDashboardBackButton><CourseDashboardSpinnerState style={{ padding: '24px 0' }} /></div>;
  if (!data && error) return <div style={styles.container}><CourseDashboardBackButton onClick={handleBack} style={{ marginBottom: '16px' }}>Back</CourseDashboardBackButton>{error}</div>;

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <CourseDashboardBackButton onClick={handleBack}>
          Back
        </CourseDashboardBackButton>

        <div style={styles.headerInline}>
          <span style={styles.headerLabel}>Student:</span>
          <div style={{ minWidth: 0, flex: 1, position: 'relative' }}>
            <button
              type="button"
              onClick={() => setStudentMenuOpen((open) => !open)}
              style={styles.studentMenuButton}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: dashboardPalette.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {studentDisplayName}
                </span>
                <span style={{ color: dashboardPalette.muted, fontWeight: 700 }}>{studentMenuOpen ? '▲' : '▼'}</span>
              </div>
            </button>
            {studentMenuOpen && (
              <div style={styles.studentMenuPanel}>
                <table style={styles.studentMenuTable}>
                  <thead>
                    <tr style={{ background: dashboardPalette.surface }}>
                      <th style={{ ...styles.studentMenuCell, textAlign: 'left', color: dashboardPalette.muted, fontSize: '0.78rem', fontWeight: 800 }}>Student</th>
                      <th style={{ ...styles.studentMenuCell, textAlign: 'left', color: dashboardPalette.muted, fontSize: '0.78rem', fontWeight: 800 }}>Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentRows.map((row) => {
                      const graded = isStudentGraded(row);
                      const isCurrent = row.student_id === selectedStudentId;
                      const rowBackground = graded
                        ? (isCurrent ? '#dcfce7' : '#f0fdf4')
                        : (isCurrent ? '#fee2e2' : '#fef2f2');
                      const rowTextColor = graded ? '#14532d' : '#991b1b';
                      return (
                        <tr
                          key={row.student_id}
                          onClick={() => navigateToStudent(row.student_id)}
                          style={{
                            background: rowBackground,
                            cursor: saveState === 'saving' ? 'not-allowed' : 'pointer',
                            opacity: saveState === 'saving' ? 0.65 : 1,
                          }}
                        >
                          <td style={{ ...styles.studentMenuCell, color: rowTextColor, fontWeight: 700 }}>
                            {row.student_name}
                          </td>
                          <td style={{ ...styles.studentMenuCell, color: rowTextColor, fontWeight: 700 }}>
                            {formatStudentScore(row)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div style={styles.headerCenter}>
          <span style={styles.headerLabel}>Assignment:</span>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: dashboardPalette.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assignmentTitle}</div>
        </div>

        <div style={styles.headerRight}>
          <strong>Total grade:</strong>
          {data ? `${Math.round(data.score_earned * 100) / 100}/${Math.round(data.score_total * 100) / 100}` : '...'}
          {statusData?.grade_released && (
            <span style={{ color: dashboardPalette.navy, fontWeight: 700 }}>Released</span>
          )}
          {showSaveButton && (
            <span style={styles.saveText}>{saveState === 'updating' ? 'Updating' : 'Updated'}</span>
          )}
        </div>
      </div>

      {data?.late_penalty_applied && (
        <div style={{ ...styles.loadingPanel, marginBottom: '16px', color: dashboardPalette.text }}>
          Late policy applied: raw score {Math.round(Number(data.raw_score_earned || 0) * 100) / 100}/{Math.round(Number(data.score_total || 0) * 100) / 100},
          penalty {Math.round(Number(data.late_penalty_points || 0) * 100) / 100} points
          ({Math.round(Number(data.late_penalty_fraction || 0) * 10000) / 100}%),
          final score {Math.round(Number(data.score_earned || 0) * 100) / 100}/{Math.round(Number(data.score_total || 0) * 100) / 100}.
        </div>
      )}

      {error && (
        <div style={{ ...styles.loadingPanel, marginBottom: '16px', color: dashboardPalette.dangerText, border: `1px solid ${dashboardPalette.dangerBorder}`, background: dashboardPalette.dangerBg }}>
          {error}
        </div>
      )}

      {studentLoading || !data || !currentQuestion ? (
        <CourseDashboardSpinnerState style={{ padding: '20px 0' }} spinnerStyle={{ width: '20px', height: '20px' }} />
      ) : (
      <div style={styles.body}>
        <div style={styles.panel}>
          <div style={styles.questionHeader}>
            <h3 style={styles.h}>{`Q${questionIndex + 1}) ${currentQuestion.question_title}`}</h3>
            <div style={styles.questionNav}>
              <button
                type="button"
                onClick={() => setQuestionIndex((idx) => Math.max(0, idx - 1))}
                disabled={questionIndex === 0}
                style={{
                  ...styles.navButton,
                  background: dashboardPalette.white,
                  color: dashboardPalette.text,
                  cursor: questionIndex === 0 ? 'not-allowed' : 'pointer',
                  opacity: questionIndex === 0 ? 0.6 : 1,
                }}
              >
                Previous
              </button>
              {questionIndex < questions.length - 1 && (
                <button
                  type="button"
                  onClick={() => setQuestionIndex((idx) => Math.min(questions.length - 1, idx + 1))}
                  style={{
                    ...styles.navButton,
                    background: dashboardPalette.navy,
                    color: dashboardPalette.white,
                    border: `1px solid ${dashboardPalette.navy}`,
                  }}
                >
                  Next →
                </button>
              )}
            </div>
          </div>

          {currentQuestion.question_text ? (
            <div style={{ marginBottom: '16px', padding: '12px', background: dashboardPalette.surface, borderRadius: '8px', border: `1px solid ${dashboardPalette.border}` }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: dashboardPalette.muted, marginBottom: '0.4rem' }}>Question</div>
              <div style={{ color: dashboardPalette.text, fontSize: '0.95rem', lineHeight: 1.5 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {currentQuestion.question_text}
                </ReactMarkdown>
              </div>
            </div>
          ) : null}

          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: dashboardPalette.muted, marginBottom: '0.35rem' }}>Student answer</div>
          {currentQuestion.question_type === 'coding' ? (
            <pre style={{ whiteSpace: 'pre-wrap', color: '#e5e7eb', background: '#0f172a', padding: '0.9rem', borderRadius: '8px', overflowX: 'auto' }}>
              {(() => {
                try {
                  const parsed = JSON.parse(currentQuestion.student_answer || '{}');
                  return parsed?.source_code || '';
                } catch {
                  return currentQuestion.student_answer || '';
                }
              })()}
            </pre>
          ) : (
            <p style={{ whiteSpace: 'pre-wrap', color: dashboardPalette.text }}>{asDisplayAnswer(currentQuestion.student_answer)}</p>
          )}

          {currentQuestion.coding_result && (
            <div style={{ marginTop: '16px', border: `1px solid ${dashboardPalette.border}`, borderRadius: '8px', padding: '14px', background: dashboardPalette.surface }}>
              <div style={{ fontWeight: 700, color: dashboardPalette.navy, marginBottom: '0.6rem' }}>
                {`Autograder: ${String(currentQuestion.coding_result.verdict || '').replaceAll('_', ' ')}`}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                {(currentQuestion.coding_result.tests || []).map((test, idx) => (
                  <div key={`${test.name}-${idx}`} style={{ border: `1px solid ${dashboardPalette.border}`, borderRadius: '8px', padding: '0.7rem', background: dashboardPalette.white }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <strong>{test.name || `Test ${idx + 1}`}</strong>
                      <span style={{ color: test.status === 'passed' ? '#166534' : '#991b1b', fontWeight: 700 }}>
                        {test.status === 'passed' ? 'Passed' : 'Failed'}
                      </span>
                    </div>
                    {test.description && <div style={{ color: dashboardPalette.muted, fontSize: '0.84rem', marginTop: '0.2rem' }}>{test.description}</div>}
                    {test.message && <div style={{ color: dashboardPalette.text, fontSize: '0.84rem', marginTop: '0.2rem' }}>{test.message}</div>}
                    {(test.expected_output || test.received_output) && (
                      <div style={{ marginTop: '0.3rem', display: 'grid', gap: '0.25rem', fontSize: '0.82rem', color: dashboardPalette.muted }}>
                        {test.expected_output && <div><strong>Expected:</strong> {test.expected_output}</div>}
                        {test.received_output && <div><strong>Received:</strong> {test.received_output}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {currentQuestion.coding_result.compile_output && (
                <pre style={{ whiteSpace: 'pre-wrap', color: '#e5e7eb', background: '#0f172a', padding: '0.9rem', borderRadius: '8px', overflowX: 'auto', marginTop: '0.75rem' }}>
                  {currentQuestion.coding_result.compile_output}
                </pre>
              )}
              {currentQuestion.coding_result.runtime_output && (
                <pre style={{ whiteSpace: 'pre-wrap', color: '#e5e7eb', background: '#0f172a', padding: '0.9rem', borderRadius: '8px', overflowX: 'auto', marginTop: '0.75rem' }}>
                  {currentQuestion.coding_result.runtime_output}
                </pre>
              )}
            </div>
          )}

          {currentQuestion.requires_manual_grading && (
            <div style={{ marginTop: '1rem' }}>
              <h3 style={{ ...styles.h, marginBottom: '0.75rem' }}>Rubric</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                {(currentQuestion.rubric_parts || []).map((part) => (
                  <div key={part.part_index} style={{ border: `1px solid ${dashboardPalette.border}`, borderRadius: '8px', padding: '12px', background: dashboardPalette.surface }}>
                    <div style={{ marginBottom: '0.5rem' }}>
                      <strong>{part.label}</strong>
                    </div>
                    {(part.level_criteria && part.level_criteria.length > 0) ? (
                      <div style={{ marginBottom: '0.6rem', fontSize: '0.875rem', color: dashboardPalette.text, lineHeight: 1.5 }}>
                        {part.level_criteria.map((level) => (
                          <div key={level.points} style={{ marginBottom: '0.25rem' }}>
                            <span style={{ fontWeight: 700, color: dashboardPalette.navy }}>+{level.points}:</span>
                            {' '}{level.criteria || '-'}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                      {(part.options || []).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => updatePartScore(part.part_index, opt)}
                          style={{
                            border: `1px solid ${Number(part.selected_score) === Number(opt) ? dashboardPalette.navy : dashboardPalette.border}`,
                            borderRadius: '6px',
                            padding: '0.3rem 0.55rem',
                            cursor: 'pointer',
                            background: Number(part.selected_score) === Number(opt) ? dashboardPalette.navy : dashboardPalette.white,
                            color: Number(part.selected_score) === Number(opt) ? dashboardPalette.white : dashboardPalette.text,
                            fontWeight: 700,
                          }}
                        >
                          {`+${opt}`}
                        </button>
                      ))}
                    </div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: dashboardPalette.muted, marginBottom: '0.25rem' }}>Comment (optional)</label>
                    <textarea
                      value={part.comment || ''}
                      placeholder="Enter comment..."
                      onChange={(e) => updatePartComment(part.part_index, e.target.value)}
                      style={{ width: '100%', minHeight: '56px', border: `1px solid ${dashboardPalette.border}`, borderRadius: '8px', padding: '0.5rem', boxSizing: 'border-box', color: dashboardPalette.text, background: dashboardPalette.white }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={styles.panel}>
          <h3 style={styles.h}>Questions</h3>
          <div style={styles.questionList}>
            {questions.map((question, idx) => {
              const complete = isQuestionComplete(question);
              const isSelected = idx === questionIndex;
              const displayScore = complete
                ? `${Math.round(question.earned_points * 100) / 100}/${Math.round(question.max_points * 100) / 100}`
                : 'Needs grading';

              return (
                <button
                  key={question.question_id}
                  type="button"
                  onClick={() => setQuestionIndex(idx)}
                  style={{
                    width: '100%',
                    border: `1px solid ${isSelected ? dashboardPalette.navy : dashboardPalette.border}`,
                    background: isSelected ? dashboardPalette.surface : dashboardPalette.white,
                    borderRadius: '8px',
                    padding: '0.7rem 0.75rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.6rem' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.83rem', fontWeight: 800, color: isSelected ? dashboardPalette.navy : dashboardPalette.muted }}>
                        {`Q${idx + 1}`}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: dashboardPalette.text, fontWeight: 600, lineHeight: 1.35 }}>
                        {question.question_title}
                      </div>
                    </div>
                    <span style={{ ...styles.scoreChip, background: complete ? dashboardPalette.surface : dashboardPalette.white, color: complete ? dashboardPalette.navy : dashboardPalette.muted, flexShrink: 0 }}>
                      {displayScore}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
