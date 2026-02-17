import React, { useEffect, useState } from 'react';
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
  const [progressTick, setProgressTick] = useState(0);
  const [progressReady, setProgressReady] = useState(false);
  const [isInstructorPreview, setIsInstructorPreview] = useState(false);

  const parseHash = () => {
    const hash = window.location.hash;
    const courseMatch = hash.match(/#student-course\/(\d+)/);
    const assignmentMatch = hash.match(/\/assignment\/(\d+)/);

    return {
      courseId: courseMatch ? parseInt(courseMatch[1], 10) : null,
      assignmentId: assignmentMatch ? parseInt(assignmentMatch[1], 10) : null
    };
  };

  const { courseId, assignmentId } = parseHash();

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
          const loadedSubmitted = Boolean(progressData?.submitted);
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
  }, [assignmentId, user?.id]);

  useEffect(() => {
    if (!assignmentId || !progressReady) return;
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
  }, [assignmentId, progressReady, progressTick, liveAnswers, liveQuestionIndex]);

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
      onClose={() => {
        window.location.hash = courseId ? `#student-course/${courseId}` : '#student-courses';
      }}
      initialAnswers={initialAnswers}
      initialQuestionIndex={initialQuestionIndex}
      initialSubmitted={initialSubmitted}
      onAnswersChange={(answers) => {
        setLiveAnswers(answers || {});
        setProgressTick((prev) => prev + 1);
      }}
      onQuestionChange={(index) => {
        setLiveQuestionIndex(index || 0);
        setProgressTick((prev) => prev + 1);
      }}
      onSubmit={async (answers) => {
        if (isInstructorPreview) return;
        setLiveAnswers(answers || {});
        try {
          await saveAssignmentProgress(assignmentId, {
            answers: answers || {},
            current_question_index: liveQuestionIndex,
            submitted: true
          });
          setInitialSubmitted(true);
        } catch (err) {
          console.error('Submit save failed:', err);
        }
      }}
    />
  );
}
