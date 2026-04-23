import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getAssignment, getQuestionsBatch, getAssignmentProgress, saveAssignmentProgress } from '../api';
import StudentPreview from '../components/StudentPreview';
import StudentGradeReport from '../components/StudentGradeReport';
import { useAuth } from '../AuthContext';
import { parseScheduleDate } from '../utils/datetime';

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
  const [liveQuestionIndex, setLiveQuestionIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [progressReady, setProgressReady] = useState(false);
  const [isInstructorPreview, setIsInstructorPreview] = useState(false);
  const [wasPreviouslySubmitted, setWasPreviouslySubmitted] = useState(false);
  const [readOnlyUnsubmitted, setReadOnlyUnsubmitted] = useState(false);
  const isSubmittingOnExitRef = useRef(false);
  const latestProgressRef = useRef({ answers: {}, questionIndex: 0 });
  const skipUnmountSubmitRef = useRef(false);

  const parseHash = (hash) => {
    const courseMatch = hash.match(/#student-course\/(\d+)/);
    const assignmentMatch = hash.match(/\/assignment\/(\d+)/);
    const resubmitRequested = hash.includes("resubmit=1");
    const readOnlyRequested = hash.includes("readonly=1");
    const viewGradeRequested = hash.includes("view=grade");

    return {
      courseId: courseMatch ? parseInt(courseMatch[1], 10) : null,
      assignmentId: assignmentMatch ? parseInt(assignmentMatch[1], 10) : null,
      resubmitRequested,
      readOnlyRequested,
      viewGradeRequested,
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
  const { courseId, assignmentId, resubmitRequested, readOnlyRequested, viewGradeRequested } = parseHash(currentHash);
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
          setLiveQuestionIndex(0);
          setProgressReady(false);
        } else {
          const progressData = await getAssignmentProgress(assignmentId);
          const loadedAnswers = progressData?.answers || {};
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

  useEffect(() => {
    latestProgressRef.current = {
      answers: liveAnswers || {},
      questionIndex: liveQuestionIndex || 0
    };
  }, [liveAnswers, liveQuestionIndex]);

  useEffect(() => {
    if (!assignmentId || !progressReady || isInstructorPreview || isReadOnlyView || resubmitRequested || isSubmissionClosed) return;
    const timer = setTimeout(async () => {
      try {
        await saveAssignmentProgress(assignmentId, {
          answers: liveAnswers,
          current_question_index: liveQuestionIndex
        });
      } catch (err) {
        console.error('Autosave failed:', err);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [assignmentId, isReadOnlyView, progressReady, isInstructorPreview, liveAnswers, liveQuestionIndex, resubmitRequested, isSubmissionClosed]);

  const saveDraftOnExit = useCallback(async () => {
    if (isInstructorPreview || !assignmentId || !progressReady || isSubmittingOnExitRef.current) {
      return null;
    }
    isSubmittingOnExitRef.current = true;
    try {
      const savedProgress = await saveAssignmentProgress(assignmentId, {
        answers: latestProgressRef.current.answers || {},
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
      padding: '2rem'
    },
    backButton: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.5rem 1rem',
      background: '#f3f4f6',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '0.875rem',
      color: '#374151',
      marginBottom: '1.5rem',
      transition: 'background 0.15s'
    },
    errorBox: {
      background: '#fee2e2',
      color: '#dc2626',
      padding: '1rem',
      borderRadius: '8px',
      marginBottom: '1rem'
    },
    loadingState: {
      textAlign: 'center',
      padding: '4rem',
      color: '#6b7280'
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingState}>
          <p>Loading assignment...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <button
          style={styles.backButton}
          onClick={() => {
            window.location.hash = courseId ? `#student-course/${courseId}` : '#student-courses';
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#e5e7eb';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#f3f4f6';
          }}
        >
          ← Back to Course
        </button>
        <div style={styles.errorBox}>{error}</div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div style={styles.container}>
        <button
          style={styles.backButton}
          onClick={() => {
            window.location.hash = courseId ? `#student-course/${courseId}` : '#student-courses';
          }}
        >
          ← Back to Course
        </button>
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
          const base = `#student-course/${courseId}/assignment/${assignmentId}`;
          const params = new URLSearchParams();
          if (readOnlyRequested) params.set('readonly', '1');
          window.location.hash = params.toString() ? `${base}?${params}` : base;
        }}
      />
    );
  }

  return (
    <>
      {gradeReleased && !isInstructorPreview && (
        <div style={{
          maxWidth: '1000px', margin: '0 auto 1rem auto', padding: '0.75rem 1.25rem',
          background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
          border: '1px solid #6ee7b7',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}>
          <span style={{ fontWeight: 600, color: '#065f46', fontSize: '0.95rem' }}>
            Grades have been released for this assignment.
          </span>
          <button
            type="button"
            onClick={() => {
              const base = `#student-course/${courseId}/assignment/${assignmentId}`;
              const sep = window.location.hash.includes('?') ? '&' : '?';
              window.location.hash = `${base}${sep}view=grade`;
            }}
            style={{
              border: 'none',
              borderRadius: '8px',
              background: '#059669',
              color: 'white',
              padding: '0.45rem 0.9rem',
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
      closeButtonText={isReadOnlyView ? 'Back to Course' : (resubmitRequested ? 'Resubmit Assignment' : 'Submit Assignment')}
      secondaryActionText={!isReadOnlyView && resubmitRequested ? 'Cancel' : ''}
      onSecondaryAction={!isReadOnlyView && resubmitRequested ? cancelResubmission : null}
      onClose={async () => {
        skipUnmountSubmitRef.current = true;
        if (isReadOnlyView) {
          window.location.hash = courseId ? `#student-course/${courseId}` : '#student-courses';
          return;
        }
        await saveDraftOnExit();
        if (courseId) {
          window.location.hash = `#student-course/${courseId}`;
        } else {
          window.location.hash = '#student-courses';
        }
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
