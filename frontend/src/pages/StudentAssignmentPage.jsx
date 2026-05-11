import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getAssignment, getQuestionsBatch, getAssignmentProgress, saveAssignmentProgress } from '../api';
import StudentPreview from '../components/StudentPreview';
import StudentGradeReport from '../components/StudentGradeReport';
import { useAuth } from '../AuthContext';
import { parseScheduleDate } from '../utils/datetime';
import {
  CourseDashboardBackButton,
  CourseDashboardPrimaryButton,
  CourseDashboardSecondaryButton,
  CourseDashboardSpinnerState,
  dashboardPalette
} from '../components/CourseDashboardUI';

function buildStudentAssignmentHash({
  courseId,
  assignmentId,
  resubmitRequested = false,
  readOnlyRequested = false,
  viewGradeRequested = false,
  fromHash = ''
}) {
  const params = new URLSearchParams();
  if (resubmitRequested) params.set('resubmit', '1');
  if (readOnlyRequested) params.set('readonly', '1');
  if (viewGradeRequested) params.set('view', 'grade');
  if (fromHash) params.set('from', fromHash);
  const query = params.toString();
  return query
    ? `#student-course/${courseId}/assignment/${assignmentId}?${query}`
    : `#student-course/${courseId}/assignment/${assignmentId}`;
}

export default function StudentAssignmentPage() {
  const { user } = useAuth();
  const [hashVersion, setHashVersion] = useState(0);
  const [assignment, setAssignment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [initialAnswers, setInitialAnswers] = useState({});
  const [initialQuestionIndex, setInitialQuestionIndex] = useState(0);
  const [initialSubmitted, setInitialSubmitted] = useState(false);
  const [liveAnswers, setLiveAnswers] = useState({});
  const [liveQuestionTimeMs, setLiveQuestionTimeMs] = useState({});
  const [liveQuestionIndex, setLiveQuestionIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [progressReady, setProgressReady] = useState(false);
  const [isInstructorPreview, setIsInstructorPreview] = useState(false);
  const [wasPreviouslySubmitted, setWasPreviouslySubmitted] = useState(false);
  const [readOnlyUnsubmitted, setReadOnlyUnsubmitted] = useState(false);
  const isSubmittingOnExitRef = useRef(false);
  const latestProgressRef = useRef({ answers: {}, questionIndex: 0, questionTimeMs: {} });
  const skipUnmountSubmitRef = useRef(false);
  const activeQuestionTimerRef = useRef({ questionId: null, startedAtMs: 0 });

  const parseHash = (hash) => {
    const courseMatch = hash.match(/#student-course\/(\d+)/);
    const assignmentMatch = hash.match(/\/assignment\/(\d+)/);
    const queryIndex = hash.indexOf('?');
    const params = new URLSearchParams(queryIndex >= 0 ? hash.slice(queryIndex + 1) : '');
    const resubmitRequested = params.get('resubmit') === '1';
    const readOnlyRequested = params.get('readonly') === '1';
    const viewGradeRequested = params.get('view') === 'grade';
    const fromHash = params.get('from') || '';

    return {
      courseId: courseMatch ? parseInt(courseMatch[1], 10) : null,
      assignmentId: assignmentMatch ? parseInt(assignmentMatch[1], 10) : null,
      resubmitRequested,
      readOnlyRequested,
      viewGradeRequested,
      fromHash,
    };
  };

  useEffect(() => {
    const handleHashChange = () => {
      setHashVersion((value) => value + 1);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const currentHash = React.useMemo(() => window.location.hash, [hashVersion]);
  const { courseId, assignmentId, resubmitRequested, readOnlyRequested, viewGradeRequested, fromHash } = parseHash(currentHash);
  const hardDueDate = parseScheduleDate(assignment?.due_date_hard);
  const isSubmissionClosed = Boolean(hardDueDate && Date.now() > hardDueDate.getTime());

  useEffect(() => {
    async function loadData() {
      if (!assignmentId) {
        setError('No assignment ID specified');
        setLoading(false);
        return;
      }

      try {
        setProgressReady(false);
        const assignmentData = await getAssignment(assignmentId);
        setAssignment(assignmentData);

        const instructorPreview = user?.id === assignmentData.instructor_id;
        setIsInstructorPreview(instructorPreview);

        if (instructorPreview) {
          setInitialAnswers({});
          setInitialQuestionIndex(0);
          setInitialSubmitted(false);
          setWasPreviouslySubmitted(false);
          setReadOnlyUnsubmitted(false);
          setLiveAnswers({});
          setLiveQuestionTimeMs({});
          setLiveQuestionIndex(0);
          setProgressReady(false);
        } else {
          const progressData = await getAssignmentProgress(assignmentId);
          const loadedAnswers = progressData?.answers || {};
          const loadedQuestionTimeMs = progressData?.question_time_ms || {};
          const loadedIndex = progressData?.current_question_index || 0;
          const hasPriorSubmission = Boolean(progressData?.submitted || progressData?.submitted_at);
          const hardDue = parseScheduleDate(assignmentData?.due_date_hard);
          const canResubmitBeforeHardDue = !hardDue || Date.now() <= hardDue.getTime();
          const allowResubmitMode = hasPriorSubmission && resubmitRequested && canResubmitBeforeHardDue;
          const loadedSubmitted = hasPriorSubmission && !allowResubmitMode;
          const hardDuePassed = Boolean(hardDue && Date.now() > hardDue.getTime());
          const forceReadOnlyUnsubmitted = !hasPriorSubmission && (readOnlyRequested || hardDuePassed);
          const shouldStartOnFirstQuestion = hasPriorSubmission || forceReadOnlyUnsubmitted;
          const initialIndexForSession = shouldStartOnFirstQuestion ? 0 : loadedIndex;

          setWasPreviouslySubmitted(hasPriorSubmission);
          setInitialAnswers(loadedAnswers);
          setInitialQuestionIndex(initialIndexForSession);
          setInitialSubmitted(loadedSubmitted);
          setReadOnlyUnsubmitted(forceReadOnlyUnsubmitted);
          setLiveAnswers(loadedAnswers);
          setLiveQuestionTimeMs(loadedQuestionTimeMs);
          setLiveQuestionIndex(initialIndexForSession);
          setProgressReady(true);
        }

        if (assignmentData.assignment_questions && assignmentData.assignment_questions.length > 0) {
          const result = await getQuestionsBatch(assignmentData.assignment_questions);
          setQuestions(result.questions || []);
        } else {
          setQuestions([]);
        }
      } catch (err) {
        setError(err.message || 'Failed to load assignment');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [assignmentId, readOnlyRequested, resubmitRequested, user?.id]);

  const isReadOnlyView = initialSubmitted || readOnlyUnsubmitted || isSubmissionClosed;

  const getQuestionTimeSnapshot = useCallback(() => {
    const baseTimes = { ...(liveQuestionTimeMs || {}) };
    const active = activeQuestionTimerRef.current;
    if (active?.questionId != null && active.startedAtMs > 0) {
      const elapsedMs = Math.max(0, Date.now() - active.startedAtMs);
      baseTimes[String(active.questionId)] = Math.max(0, Number(baseTimes[String(active.questionId)] || 0) + elapsedMs);
    }
    return baseTimes;
  }, [liveQuestionTimeMs]);

  useEffect(() => {
    if (!progressReady || !questions.length || isInstructorPreview || isReadOnlyView || isSubmissionClosed) {
      activeQuestionTimerRef.current = { questionId: null, startedAtMs: 0 };
      return;
    }

    const activeQuestion = questions[liveQuestionIndex];
    if (!activeQuestion?.id) {
      activeQuestionTimerRef.current = { questionId: null, startedAtMs: 0 };
      return;
    }

    const now = Date.now();
    const nextQuestionId = String(activeQuestion.id);
    const current = activeQuestionTimerRef.current;
    if (current?.questionId != null && current.startedAtMs > 0 && String(current.questionId) !== nextQuestionId) {
      const elapsedMs = Math.max(0, now - current.startedAtMs);
      if (elapsedMs > 0) {
        setLiveQuestionTimeMs((prev) => {
          const next = { ...(prev || {}) };
          const prevMs = Math.max(0, Number(next[String(current.questionId)] || 0));
          next[String(current.questionId)] = prevMs + elapsedMs;
          return next;
        });
      }
    }

    if (String(current?.questionId) !== nextQuestionId) {
      activeQuestionTimerRef.current = { questionId: nextQuestionId, startedAtMs: now };
    }
  }, [progressReady, questions, liveQuestionIndex, isInstructorPreview, isReadOnlyView, isSubmissionClosed]);

  useEffect(() => {
    latestProgressRef.current = {
      answers: liveAnswers || {},
      questionIndex: liveQuestionIndex || 0,
      questionTimeMs: getQuestionTimeSnapshot(),
    };
  }, [liveAnswers, liveQuestionIndex, getQuestionTimeSnapshot]);

  useEffect(() => {
    if (!assignmentId || !progressReady || isInstructorPreview || isReadOnlyView || resubmitRequested || isSubmissionClosed) return;
    const timer = setTimeout(async () => {
      try {
        await saveAssignmentProgress(assignmentId, {
          answers: liveAnswers,
          question_time_ms: getQuestionTimeSnapshot(),
          current_question_index: liveQuestionIndex
        });
      } catch (err) {
        console.error('Autosave failed:', err);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [assignmentId, isReadOnlyView, progressReady, isInstructorPreview, liveAnswers, liveQuestionIndex, resubmitRequested, isSubmissionClosed, getQuestionTimeSnapshot]);

  const saveDraftOnExit = useCallback(async () => {
    if (isInstructorPreview || !assignmentId || !progressReady || isSubmittingOnExitRef.current) {
      return null;
    }
    isSubmittingOnExitRef.current = true;
    try {
      const savedProgress = await saveAssignmentProgress(assignmentId, {
        answers: latestProgressRef.current.answers || {},
        question_time_ms: latestProgressRef.current.questionTimeMs || {},
        current_question_index: latestProgressRef.current.questionIndex || 0
      });
      return savedProgress;
    } catch (err) {
      console.error('Exit save failed:', err);
      return null;
    } finally {
      isSubmittingOnExitRef.current = false;
    }
  }, [assignmentId, isInstructorPreview, progressReady]);

  const submitAssignment = useCallback(async () => {
    if (submitting || isReadOnlyView || !assignmentId || !progressReady || isInstructorPreview) return;
    if (isSubmissionClosed) {
      setReadOnlyUnsubmitted(true);
      return;
    }

    setSubmitting(true);
    try {
      const savedProgress = await saveAssignmentProgress(assignmentId, {
        answers: latestProgressRef.current.answers || {},
        question_time_ms: latestProgressRef.current.questionTimeMs || {},
        current_question_index: latestProgressRef.current.questionIndex || 0,
        submitted: true
      });

      skipUnmountSubmitRef.current = true;
      if (courseId) {
        if (savedProgress?.submitted_at) {
          const submissionType = wasPreviouslySubmitted ? 'resubmitted' : 'submitted';
          const submittedAt = encodeURIComponent(savedProgress.submitted_at);
          const safeAssignmentTitle = encodeURIComponent(assignment?.title || 'Assignment');
          window.location.hash = `#student-course/${courseId}?submission=${submissionType}&submitted_at=${submittedAt}&assignment_title=${safeAssignmentTitle}`;
        } else {
          window.location.hash = `#student-course/${courseId}`;
        }
      } else {
        window.location.hash = '#student-courses';
      }
    } catch (err) {
      console.error('Submit failed:', err);
      setError(err.message || 'Failed to submit assignment');
    } finally {
      setSubmitting(false);
    }
  }, [assignment?.title, assignmentId, courseId, isReadOnlyView, isInstructorPreview, progressReady, submitting, wasPreviouslySubmitted, isSubmissionClosed]);

  const cancelResubmission = useCallback(() => {
    // Do not trigger unmount auto-submit when cancelling resubmission.
    skipUnmountSubmitRef.current = true;
    if (courseId) {
      window.location.hash = `#student-course/${courseId}`;
    } else {
      window.location.hash = '#student-courses';
    }
  }, [courseId]);

  const fallbackBackHash = courseId ? `#student-course/${courseId}` : '#student-courses';
  const gradeViewFallbackHash = assignmentId && courseId
    ? buildStudentAssignmentHash({ courseId, assignmentId, readOnlyRequested, fromHash: fallbackBackHash })
    : fallbackBackHash;

  const navigateBack = useCallback(async ({ saveDraft = false, fallbackHash = fallbackBackHash } = {}) => {
    skipUnmountSubmitRef.current = true;
    if (saveDraft) {
      await saveDraftOnExit();
    }
    window.location.hash = fromHash || fallbackHash;
  }, [fallbackBackHash, fromHash, saveDraftOnExit]);

  useEffect(() => () => {
    if (
      skipUnmountSubmitRef.current ||
      isInstructorPreview ||
      isReadOnlyView ||
      !assignmentId ||
      !progressReady ||
      isSubmittingOnExitRef.current
    ) {
      return;
    }
    isSubmittingOnExitRef.current = true;
    void saveAssignmentProgress(assignmentId, {
      answers: latestProgressRef.current.answers || {},
      question_time_ms: latestProgressRef.current.questionTimeMs || {},
      current_question_index: latestProgressRef.current.questionIndex || 0
    }).catch((err) => {
      console.error('Unmount save failed:', err);
    }).finally(() => {
      isSubmittingOnExitRef.current = false;
    });
  }, [assignmentId, isReadOnlyView, isInstructorPreview, progressReady]);

  const styles = {
    container: {
      maxWidth: '1000px',
      margin: '0 auto',
      padding: '24px'
    },
    topBarActions: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      flexWrap: 'wrap'
    },
    errorBox: {
      background: dashboardPalette.dangerBg,
      color: dashboardPalette.dangerText,
      padding: '12px 14px',
      borderRadius: '8px',
      marginBottom: '16px',
      border: `1px solid ${dashboardPalette.dangerBorder}`
    },
    loadingState: {
      textAlign: 'center',
      padding: '32px 0',
      color: dashboardPalette.muted
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <CourseDashboardBackButton onClick={() => { void navigateBack(); }} style={{ marginBottom: '16px' }}>
          Back
        </CourseDashboardBackButton>
        <div style={styles.loadingState}>
          <CourseDashboardSpinnerState style={{ padding: '8px 0' }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <CourseDashboardBackButton onClick={() => { void navigateBack(); }} style={{ marginBottom: '16px' }}>
          Back
        </CourseDashboardBackButton>
        <div style={styles.errorBox}>{error}</div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div style={styles.container}>
        <CourseDashboardBackButton onClick={() => { void navigateBack(); }} style={{ marginBottom: '16px' }}>
          Back
        </CourseDashboardBackButton>
        <div style={styles.errorBox}>Assignment not found</div>
      </div>
    );
  }

  const gradeReleased = Boolean(assignment.grade_released);
  const showGradeReport = gradeReleased && viewGradeRequested && !isInstructorPreview;

  if (showGradeReport) {
    return (
      <StudentGradeReport
        assignmentId={assignmentId}
        courseId={courseId}
        assignmentTitle={assignment.title}
        onBack={() => {
          void navigateBack({ fallbackHash: gradeViewFallbackHash });
        }}
      />
    );
  }

  return (
    <>
      {gradeReleased && !isInstructorPreview && (
        <div style={{
          maxWidth: '1000px', margin: '0 auto 16px auto', padding: '12px 16px',
          background: dashboardPalette.white,
          border: `1px solid ${dashboardPalette.border}`,
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}>
          <span style={{ fontWeight: 600, color: dashboardPalette.text, fontSize: '0.95rem' }}>
            Grades have been released for this assignment.
          </span>
          <button
            type="button"
            onClick={() => {
              window.location.hash = buildStudentAssignmentHash({
                courseId,
                assignmentId,
                readOnlyRequested,
                viewGradeRequested: true,
                fromHash: currentHash
              });
            }}
            style={{
              border: `1px solid ${dashboardPalette.navy}`,
              borderRadius: '8px',
              background: dashboardPalette.navy,
              color: dashboardPalette.white,
              padding: '0 14px',
              height: '38px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.875rem',
            }}
          >
            View your grade
          </button>
        </div>
      )}
      <StudentPreview
        assignmentId={assignmentId}
        questions={questions}
        assignmentTitle={assignment.title}
        assignmentType={assignment.type}
      isPreviewMode={false}
      showCorrectAnswers={false}
      closeButtonText="Back"
      assignmentBannerLeading={
        <CourseDashboardBackButton
          onClick={() => {
            void navigateBack({ saveDraft: !isReadOnlyView });
          }}
        >
          Back
        </CourseDashboardBackButton>
      }
      assignmentBannerActions={
        !isReadOnlyView ? (
          <div style={styles.topBarActions}>
            {resubmitRequested ? (
              <CourseDashboardSecondaryButton onClick={cancelResubmission}>
                Cancel
              </CourseDashboardSecondaryButton>
            ) : null}
            <CourseDashboardPrimaryButton onClick={submitAssignment} disabled={submitting}>
              {submitting
                ? (resubmitRequested ? 'Resubmitting...' : 'Submitting...')
                : (resubmitRequested ? 'Resubmit Assignment' : 'Submit Assignment')}
            </CourseDashboardPrimaryButton>
          </div>
        ) : null
      }
      onClose={async () => {
        await navigateBack({ saveDraft: !isReadOnlyView });
      }}
      initialAnswers={initialAnswers}
      initialQuestionIndex={initialQuestionIndex}
      initialSubmitted={initialSubmitted}
      forceReadOnly={readOnlyUnsubmitted}
      readOnlyMessage={isSubmissionClosed ? 'Assignment Closed' : (readOnlyUnsubmitted ? 'Assignment Was Not Submitted' : '')}
      onAnswersChange={(answers) => {
        setLiveAnswers(answers || {});
      }}
      onQuestionChange={(index) => {
        setLiveQuestionIndex(index || 0);
      }}
      onSubmit={submitAssignment}
      isSubmitting={submitting}
      submitButtonText={resubmitRequested ? 'Resubmit Assignment' : 'Submit Assignment'}
    />
    </>
  );
}
