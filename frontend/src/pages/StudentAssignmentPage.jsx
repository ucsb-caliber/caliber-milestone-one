import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getAssignment, getQuestionsBatch, getAssignmentProgress, saveAssignmentProgress } from '../api';
import StudentPreview from '../components/StudentPreview';
import { useAuth } from '../AuthContext';

function parseAssignmentDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr);
}

export default function StudentAssignmentPage() {
  const { user } = useAuth();
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

  const parseHash = () => {
    const hash = window.location.hash;
    const courseMatch = hash.match(/#student-course\/(\d+)/);
    const assignmentMatch = hash.match(/\/assignment\/(\d+)/);
    const resubmitRequested = hash.includes("resubmit=1");
    const readOnlyRequested = hash.includes("readonly=1");

    return {
      courseId: courseMatch ? parseInt(courseMatch[1], 10) : null,
      assignmentId: assignmentMatch ? parseInt(assignmentMatch[1], 10) : null,
      resubmitRequested,
      readOnlyRequested,
    };
  };

  const { courseId, assignmentId, resubmitRequested, readOnlyRequested } = parseHash();
  const hardDueDate = parseAssignmentDate(assignment?.due_date_hard);
  const isInterimPhase = Boolean(hardDueDate && Date.now() > hardDueDate.getTime());

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
          const hardDue = parseAssignmentDate(assignmentData?.due_date_hard);
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

  const isReadOnlyView = initialSubmitted || readOnlyUnsubmitted || isInterimPhase;

  useEffect(() => {
    latestProgressRef.current = {
      answers: liveAnswers || {},
      questionIndex: liveQuestionIndex || 0
    };
  }, [liveAnswers, liveQuestionIndex]);

  useEffect(() => {
    if (!assignmentId || !progressReady || isInstructorPreview || isReadOnlyView || resubmitRequested || isInterimPhase) return;
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
  }, [assignmentId, isReadOnlyView, progressReady, isInstructorPreview, liveAnswers, liveQuestionIndex, resubmitRequested, isInterimPhase]);

  const saveAndSubmitOnExit = useCallback(async () => {
    if (isInstructorPreview || isReadOnlyView || !assignmentId || !progressReady || isSubmittingOnExitRef.current || isInterimPhase) {
      return null;
    }
    isSubmittingOnExitRef.current = true;
    try {
      const savedProgress = await saveAssignmentProgress(assignmentId, {
        answers: latestProgressRef.current.answers || {},
        current_question_index: latestProgressRef.current.questionIndex || 0,
        submitted: true
      });
      return savedProgress;
    } catch (err) {
      console.error('Exit save failed:', err);
      return null;
    } finally {
      isSubmittingOnExitRef.current = false;
    }
  }, [assignmentId, isReadOnlyView, isInstructorPreview, progressReady, isInterimPhase]);

  const submitAssignment = useCallback(async () => {
    if (submitting || isReadOnlyView || !assignmentId || !progressReady || isInstructorPreview) return;
    if (isInterimPhase) {
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
    } finally {
      setSubmitting(false);
    }
  }, [assignment?.title, assignmentId, courseId, isReadOnlyView, isInstructorPreview, progressReady, submitting, wasPreviouslySubmitted, isInterimPhase]);

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
      current_question_index: latestProgressRef.current.questionIndex || 0,
      submitted: true
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

  return (
    <StudentPreview
      questions={questions}
      assignmentTitle={assignment.title}
      assignmentType={assignment.type}
      isPreviewMode={false}
      showCorrectAnswers={false}
      closeButtonText={isReadOnlyView ? 'Back to Course' : (resubmitRequested ? 'Resubmit Assignment' : 'Submit Assignment')}
      secondaryActionText={!isReadOnlyView && resubmitRequested ? 'Cancel' : ''}
      onSecondaryAction={!isReadOnlyView && resubmitRequested ? cancelResubmission : null}
      onClose={async () => {
        if (isReadOnlyView) {
          window.location.hash = courseId ? `#student-course/${courseId}` : '#student-courses';
          return;
        }
        const savedProgress = await saveAndSubmitOnExit();
        skipUnmountSubmitRef.current = true;
        if (courseId) {
          if (savedProgress?.submitted_at) {
            const submissionType = wasPreviouslySubmitted ? 'resubmitted' : 'submitted';
            const submittedAt = encodeURIComponent(savedProgress.submitted_at);
            const assignmentTitle = encodeURIComponent(assignment?.title || 'Assignment');
            window.location.hash = `#student-course/${courseId}?submission=${submissionType}&submitted_at=${submittedAt}&assignment_title=${assignmentTitle}`;
          } else {
            window.location.hash = `#student-course/${courseId}`;
          }
        } else {
          window.location.hash = '#student-courses';
        }
      }}
      initialAnswers={initialAnswers}
      initialQuestionIndex={initialQuestionIndex}
      initialSubmitted={initialSubmitted}
      forceReadOnly={readOnlyUnsubmitted}
      readOnlyMessage={isInterimPhase ? 'Assignment Closed (Interim Phase)' : (readOnlyUnsubmitted ? 'Assignment Was Not Submitted' : '')}
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
  );
}
