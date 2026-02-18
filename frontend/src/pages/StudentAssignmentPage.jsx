import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getAssignment, getQuestionsBatch, getAssignmentProgress, saveAssignmentProgress } from '../api';
import StudentPreview from '../components/StudentPreview';
import { useAuth } from '../AuthContext';

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
  const [progressReady, setProgressReady] = useState(false);
  const [isInstructorPreview, setIsInstructorPreview] = useState(false);
  const isSubmittingOnExitRef = useRef(false);
  const latestProgressRef = useRef({ answers: {}, questionIndex: 0 });
  const skipUnmountSubmitRef = useRef(false);

  const parseHash = () => {
    const hash = window.location.hash;
    const courseMatch = hash.match(/#student-course\/(\d+)/);
    const assignmentMatch = hash.match(/\/assignment\/(\d+)/);
    const resubmitRequested = hash.includes("resubmit=1");

    return {
      courseId: courseMatch ? parseInt(courseMatch[1], 10) : null,
      assignmentId: assignmentMatch ? parseInt(assignmentMatch[1], 10) : null,
      resubmitRequested
    };
  };

  const { courseId, assignmentId, resubmitRequested } = parseHash();

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
          setLiveAnswers({});
          setLiveQuestionIndex(0);
          setProgressReady(false);
        } else {
          const progressData = await getAssignmentProgress(assignmentId);
          const loadedAnswers = progressData?.answers || {};
          const loadedIndex = progressData?.current_question_index || 0;
          const hasPriorSubmission = Boolean(progressData?.submitted || progressData?.submitted_at);
          let loadedSubmitted = hasPriorSubmission;
          if (resubmitRequested && loadedSubmitted) {
            loadedSubmitted = false;
          }

          setInitialAnswers(loadedAnswers);
          setInitialQuestionIndex(loadedIndex);
          setInitialSubmitted(loadedSubmitted);
          setLiveAnswers(loadedAnswers);
          setLiveQuestionIndex(loadedIndex);
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
  }, [assignmentId, user?.id, resubmitRequested]);

  useEffect(() => {
    latestProgressRef.current = {
      answers: liveAnswers || {},
      questionIndex: liveQuestionIndex || 0
    };
  }, [liveAnswers, liveQuestionIndex]);

  useEffect(() => {
    if (!assignmentId || !progressReady || isInstructorPreview) return;
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
  }, [assignmentId, progressReady, isInstructorPreview, liveAnswers, liveQuestionIndex]);

  const saveAndSubmitOnExit = useCallback(async () => {
    const isReadOnlySubmittedView = initialSubmitted && !resubmitRequested;
    if (isInstructorPreview || isReadOnlySubmittedView || !assignmentId || !progressReady || isSubmittingOnExitRef.current) {
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
  }, [assignmentId, initialSubmitted, isInstructorPreview, progressReady, resubmitRequested]);

  useEffect(() => () => {
    const isReadOnlySubmittedView = initialSubmitted && !resubmitRequested;
    if (
      skipUnmountSubmitRef.current ||
      isInstructorPreview ||
      isReadOnlySubmittedView ||
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
  }, [assignmentId, initialSubmitted, isInstructorPreview, progressReady, resubmitRequested]);

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
      closeButtonText={resubmitRequested ? 'Resubmit Assignment' : 'Back to Course'}
      onClose={async () => {
        const savedProgress = await saveAndSubmitOnExit();
        skipUnmountSubmitRef.current = true;
        if (courseId) {
          if (savedProgress?.submitted_at) {
            const submissionType = resubmitRequested ? 'resubmitted' : 'submitted';
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
      onAnswersChange={(answers) => {
        setLiveAnswers(answers || {});
      }}
      onQuestionChange={(index) => {
        setLiveQuestionIndex(index || 0);
      }}
    />
  );
}
