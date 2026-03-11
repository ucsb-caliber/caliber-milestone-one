import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { getAssignment, getQuestionsBatch, updateAssignment, createQuestion, getUserById, getCourse, getAssignmentSubmissionStatus, releaseAssignmentGrades } from '../api';
import QuestionCard from '../components/QuestionCard';
import QuestionTable from '../components/QuestionTable';
import StudentPreview from '../components/StudentPreview';
import AssignmentGradingStats from '../components/AssignmentGradingStats';

import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const PACIFIC_TIMEZONE = 'America/Los_Angeles';

function parseAssignmentDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr);
}

const DateTimeline = ({ assignment }) => {
  const now = new Date();

  const release = parseAssignmentDate(assignment.release_date);
  const softDue = parseAssignmentDate(assignment.due_date_soft);
  const hardDue = parseAssignmentDate(assignment.due_date_hard);

  const formatDate = (d) =>
    d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: PACIFIC_TIMEZONE
    }) +
    '\n' +
    d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: PACIFIC_TIMEZONE,
      timeZoneName: 'short'
    });

  const getTimeLeft = (date) => {
    if (!date) return null;
    const diffMs = date - now;
    const secondMs = 1000;
    const minuteMs = 60 * secondMs;
    const hourMs = 60 * minuteMs;
    const dayMs = 24 * hourMs;
    const weekMs = 7 * dayMs;

    if (diffMs <= 0) return { value: 0, unit: 'seconds' };

    if (diffMs >= weekMs) {
      return { value: Math.ceil(diffMs / weekMs), unit: 'weeks' };
    }
    if (diffMs >= dayMs) {
      return { value: Math.ceil(diffMs / dayMs), unit: 'days' };
    }
    if (diffMs >= hourMs) {
      return { value: Math.ceil(diffMs / hourMs), unit: 'hours' };
    }
    if (diffMs >= minuteMs) {
      return { value: Math.ceil(diffMs / minuteMs), unit: 'minutes' };
    }
    return { value: Math.max(1, Math.ceil(diffMs / secondMs)), unit: 'seconds' };
  };

  const start = release || now;
  const end = hardDue || softDue || now;
  const totalMs = end - start;
  const elapsedMs = now - start;
  const todayPct = totalMs > 0 ? Math.min(Math.max((elapsedMs / totalMs) * 100, 0), 100) : 0;

  const getPct = (date) => {
    if (!date || totalMs <= 0) return 0;
    return Math.min(Math.max(((date - start) / totalMs) * 100, 0), 100);
  };

  const softPct = getPct(softDue);
  const hardPct = getPct(hardDue);
  const softPassed = Boolean(softDue && now > softDue);
  const hardPassed = Boolean(hardDue && now > hardDue);
  const hasDistinctHardDue = Boolean(hardDue && softDue && hardDue.getTime() !== softDue.getTime());

  const countdownTarget = hardPassed ? null : (softPassed ? hardDue : softDue);
  const countdown = getTimeLeft(countdownTarget);
  const countdownLabel = (() => {
    if (hardPassed) return 'Submissions closed';
    if (!countdown) return 'No due date';
    if (countdown.value === 0) return 'Due now';
    if (softPassed && hardDue) {
      return countdown.unit === 'weeks'
        ? `Late submissions due in ${countdown.value}w`
        : countdown.unit === 'days'
          ? `Late submissions due in ${countdown.value}d`
          : countdown.unit === 'hours'
            ? `Late submissions due in ${countdown.value}h`
            : countdown.unit === 'minutes'
              ? `Late submissions due in ${countdown.value}m`
              : `Late submissions due in ${countdown.value}s`;
    }
    return countdown.unit === 'weeks'
      ? `${countdown.value}w left`
      : countdown.unit === 'days'
        ? `${countdown.value}d left`
        : countdown.unit === 'hours'
          ? `${countdown.value}h left`
          : countdown.unit === 'minutes'
            ? `${countdown.value}m left`
            : `${countdown.value}s left`;
  })();

  return (
    <div>
      <div style={{ position: 'relative', padding: '1rem 4rem 0rem' }}>
        <div style={{
          position: 'relative',
          height: '6px',
          background: '#e5e7eb',
          borderRadius: '999px',
          margin: '1.5rem 0 2.5rem'
        }}>
          {/* Filled progress */}
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${todayPct}%`,
            borderRadius: '999px',
            background: '#4f46e5'
          }} />

          {/* Soft due marker */}
          {softDue && (
            <div style={{
              position: 'absolute',
              left: `${softPct}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#4f46e5',
              border: '2px solid white',
              boxShadow: '0 0 0 1px rgba(79,70,229,0.35)'
            }} />
          )}

          {/* Hard due marker */}
          {hasDistinctHardDue && (
            <div style={{
              position: 'absolute',
              left: `${hardPct}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#0f172a',
              border: '2px solid white',
              boxShadow: '0 0 0 1px rgba(15,23,42,0.35)'
            }} />
          )}

          {/* Today marker */}
          <div style={{ position: 'absolute', left: `${todayPct}%`, top: '50%', transform: 'translate(-50%, -50%)', zIndex: 3 }}>
            {/* Tooltip */}
            <div style={{
              position: 'absolute',
              bottom: '18px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#f3f4f6',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              padding: '0.15rem 0.5rem',
              fontSize: '0.7rem',
              fontWeight: '600',
              color: '#374151',
              whiteSpace: 'nowrap',
              textAlign: 'center'
            }}>
              <div style={{
                fontSize: '0.75rem',
                fontWeight: '500',
                color: hardPassed ? '#b91c1c' : (softPassed ? '#b45309' : '#6acc20')
              }}>
                {countdownLabel}
              </div>
              <div style={{
                position: 'absolute',
                bottom: '-5px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '4px solid transparent',
                borderRight: '4px solid transparent',
                borderTop: '5px solid #e5e7eb'
              }} />
            </div>
            <div style={{
              width: '14px', height: '14px',
              borderRadius: '50%',
              background: '#4f46e5',
              border: '3px solid #4f46e5',
              boxShadow: '0 0 0 3px rgba(79,70,229,0.2)'
            }} />
          </div>
        </div>

        {/* Labels row */}
        <div style={{ position: 'relative', height: '60px' }}>
          {release && (
            <div style={{ position: 'absolute', left: '0%', top: '-1.5rem', transform: 'translateX(-50%)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#111827', marginBottom: '0.15rem' }}>Release Date</div>
              <div style={{ whiteSpace: 'pre-line', fontSize: '0.75rem', color: '#9ca3af' }}>{formatDate(release)}</div>
            </div>
          )}
          {softDue && (
            <div style={{ position: 'absolute', left: `${softPct}%`, top: '-1.5rem', transform: 'translateX(-50%)', textAlign: 'center' }}>
              <div style={{ minWidth: 'max-content', fontSize: '0.8rem', fontWeight: '600', color: '#111827', marginBottom: '0.15rem' }}>Due Date</div>
              <div style={{ minWidth: 'max-content', whiteSpace: 'pre-line', fontSize: '0.75rem', color: '#9ca3af' }}>{formatDate(softDue)}</div>
            </div>
          )}
          {hasDistinctHardDue && (
            <div style={{ position: 'absolute', left: `${hardPct}%`, top: '-1.5rem', transform: 'translateX(-50%)', textAlign: 'center' }}>
              <div style={{ minWidth: 'max-content', fontSize: '0.8rem', fontWeight: '600', color: '#111827', marginBottom: '0.15rem' }}>Late Submissions Due</div>
              <div style={{ minWidth: 'max-content', whiteSpace: 'pre-line', fontSize: '0.75rem', color: '#9ca3af' }}>{formatDate(hardDue)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function SortableCard({ id, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    backgroundColor: isDragging ? '#f9fafb' : 'transparent',
    cursor: 'grab',
    width: '100%',
    minWidth: 0,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

export default function AssignmentView() {
  const { user } = useAuth();
  const [assignment, setAssignment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [userInfoCache, setUserInfoCache] = useState({});
  const [showPreview, setShowPreview] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // 'card' or 'table'
  const [submissionStatusRows, setSubmissionStatusRows] = useState([]);
  const [submissionStatusLoading, setSubmissionStatusLoading] = useState(false);
  const [submissionStatusError, setSubmissionStatusError] = useState('');
  const [assignmentPhase, setAssignmentPhase] = useState('');
  const [assignmentTotalPoints, setAssignmentTotalPoints] = useState(0);
  const [allStudentsGraded, setAllStudentsGraded] = useState(false);
  const [gradeReleased, setGradeReleased] = useState(false);
  const [releasingGrades, setReleasingGrades] = useState(false);

  // Parse URL hash to get course ID and assignment ID
  const parseHash = () => {
    const hash = window.location.hash;
    const courseMatch = hash.match(/#course\/(\d+)/);
    const assignmentMatch = hash.match(/\/assignment\/(\d+)\/view/);
    
    return {
      courseId: courseMatch ? parseInt(courseMatch[1]) : null,
      assignmentId: assignmentMatch ? parseInt(assignmentMatch[1]) : null
    };
  };

  const { courseId, assignmentId } = parseHash();

  const reorderQuestions = (list, startIndex, endIndex) => {
    const result = Array.from(list);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    return result;
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;

    setActionLoading(true);
    try {
      const reorderedQuestions = reorderQuestions(
        questions,
        result.source.index,
        result.destination.index
      );
      
      setQuestions(reorderedQuestions);
      
      const updatedQuestionIds = reorderedQuestions.map(q => q.id);
      
      const updatedAssignment = await updateAssignment(assignmentId, {
        ...assignment,
        assignment_questions: updatedQuestionIds
      });
      
      setAssignment(updatedAssignment);
    } catch (err) {
      alert('Failed to reorder questions: ' + (err.message || 'Unknown error'));
      window.location.reload();
    } finally {
      setActionLoading(false);
    }
  };

  // Load assignment and questions data
  useEffect(() => {
    async function loadData() {
      if (!assignmentId) {
        setError('No assignment ID specified');
        setLoading(false);
        return;
      }

      try {
        // Load assignment data
        const assignmentData = await getAssignment(assignmentId);
        setAssignment(assignmentData);

        // Load questions for this assignment in a single batch request
        if (assignmentData.assignment_questions && assignmentData.assignment_questions.length > 0) {
          console.log('Loading questions:', assignmentData.assignment_questions);
          const result = await getQuestionsBatch(assignmentData.assignment_questions);
          console.log('Loaded questions:', result.questions);
          setQuestions(result.questions);

          // Fetch user info for all question authors
          const uniqueUserIds = [...new Set(result.questions.map(q => q.user_id).filter(Boolean))];
          const userPromises = uniqueUserIds.map(async (userId) => {
            try {
              const userInfo = await getUserById(userId);
              return { userId, userInfo };
            } catch (error) {
              console.error(`Failed to fetch user ${userId}:`, error);
              return { userId, userInfo: null };
            }
          });
          
          const users = await Promise.all(userPromises);
          const userMap = {};
          users.forEach(({ userId, userInfo }) => {
            if (userInfo) {
              userMap[userId] = userInfo;
            }
          });
          setUserInfoCache(userMap);
        }
      } catch (err) {
        setError(err.message || 'Failed to load assignment');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [assignmentId]);

  useEffect(() => {
    async function loadSubmissionStatus() {
      if (!assignment || assignment.instructor_id !== user?.id) {
        setSubmissionStatusRows([]);
        setAssignmentPhase('');
        setAllStudentsGraded(false);
        setGradeReleased(false);
        return;
      }

      setSubmissionStatusLoading(true);
      setSubmissionStatusError('');
      try {
        const [courseData, statusData] = await Promise.all([
          getCourse(assignment.course_id),
          getAssignmentSubmissionStatus(assignment.id),
        ]);

        const studentIds = courseData?.student_ids || [];
        const statusByStudent = new Map((statusData?.students || []).map((row) => [row.student_id, row]));

        const studentsWithStatus = await Promise.all(
          studentIds.map(async (studentId) => {
            let displayName = studentId;
            try {
              const studentInfo = await getUserById(studentId);
              if (studentInfo?.first_name && studentInfo?.last_name) {
                displayName = `${studentInfo.first_name} ${studentInfo.last_name}`;
              } else {
                displayName = studentInfo?.email || studentId;
              }
            } catch {
              displayName = studentId;
            }

            const status = statusByStudent.get(studentId) || {
              student_id: studentId,
              submitted: false,
              submitted_at: null,
              timing_status: 'not_submitted',
            };

            return {
              ...status,
              student_name: displayName,
            };
          })
        );

        setSubmissionStatusRows(studentsWithStatus);
        setAssignmentPhase(statusData?.assignment_phase || '');
        setAssignmentTotalPoints(Number(statusData?.assignment_total_points || 0));
        setAllStudentsGraded(Boolean(statusData?.all_students_graded));
        setGradeReleased(Boolean(statusData?.grade_released));
      } catch (err) {
        setSubmissionStatusError(err.message || 'Failed to load student submission status');
      } finally {
        setSubmissionStatusLoading(false);
      }
    }

    loadSubmissionStatus();
  }, [assignment, user?.id]);

  // Handle removing a question from the assignment
  const handleRemoveQuestion = async (questionId) => {
    if (!assignment || actionLoading) return;
    
    const confirmed = window.confirm('Are you sure you want to remove this question from the assignment?');
    if (!confirmed) return;

    setActionLoading(true);
    try {
      // Filter out the question from the assignment
      const updatedQuestionIds = assignment.assignment_questions.filter(id => id !== questionId);
      
      // Update the assignment
      const updatedAssignment = await updateAssignment(assignmentId, {
        ...assignment,
        assignment_questions: updatedQuestionIds
      });
      
      // Update local state
      setAssignment(updatedAssignment);
      setQuestions(questions.filter(q => q.id !== questionId));
    } catch (err) {
      alert('Failed to remove question: ' + (err.message || 'Unknown error'));
    } finally {
      setActionLoading(false);
    }
  };

  // Handle editing a question
  // If user owns the question, edit directly. Otherwise, create a copy to preserve original.
  const handleEditQuestion = async (question) => {
    if (actionLoading) return;
    
    // Check if user owns this question (their original or a copy they already made)
    const userOwnsQuestion = question.user_id === user?.id;
    
    if (userOwnsQuestion) {
      // User owns this question - edit directly
      window.location.hash = `edit-question?id=${question.id}&returnTo=${encodeURIComponent(`#course/${courseId}/assignment/${assignmentId}/view`)}`;
      return;
    }
    
    // User doesn't own this question - need to create a copy
    const confirmed = window.confirm(
      'Editing this question will create a new version to preserve the original in the question bank. Continue?'
    );
    if (!confirmed) return;

    setActionLoading(true);
    try {
      // Create a copy of the question with a modified title
      const copyData = {
        title: question.title ? `${question.title} (Modified)` : 'Untitled (Modified)',
        text: question.text,
        tags: question.tags || '',
        keywords: question.keywords || '',
        school: question.school || '',
        course: question.course || '',
        course_type: question.course_type || '',
        question_type: question.question_type || '',
        blooms_taxonomy: question.blooms_taxonomy || '',
        answer_choices: question.answer_choices || '[]',
        correct_answer: question.correct_answer || '',
        source_pdf: question.source_pdf || '',
        image_url: question.image_url || ''
      };

      // Create the new question (copy)
      const newQuestion = await createQuestion(copyData);
      
      // Update the assignment to replace the old question ID with the new one
      const updatedQuestionIds = assignment.assignment_questions.map(id => 
        id === question.id ? newQuestion.id : id
      );
      
      const updatedAssignment = await updateAssignment(assignmentId, {
        ...assignment,
        assignment_questions: updatedQuestionIds
      });
      
      // Update local state with the new question
      setAssignment(updatedAssignment);
      setQuestions(questions.map(q => q.id === question.id ? newQuestion : q));
      
      // Navigate to edit the newly created question
      // Include return URL so user can come back
      window.location.hash = `edit-question?id=${newQuestion.id}&returnTo=${encodeURIComponent(`#course/${courseId}/assignment/${assignmentId}/view`)}`;
    } catch (err) {
      alert('Failed to create question copy: ' + (err.message || 'Unknown error'));
      setActionLoading(false);
    }
  };

  // Format date for display
  const formatDate = (dateStr) => {
    const parsedDate = parseAssignmentDate(dateStr);
    if (!parsedDate) return 'Not set';
    return parsedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: PACIFIC_TIMEZONE,
      timeZoneName: 'short'
    });
  };

  const formatSubmissionDate = (dateStr) => {
    const parsedDate = parseAssignmentDate(dateStr);
    if (!parsedDate) return 'Not submitted';
    return parsedDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: PACIFIC_TIMEZONE,
      timeZoneName: 'short'
    });
  };

  const getSubmissionPillStyle = (timingStatus) => {
    if (timingStatus === 'on_time') {
      return { bg: '#d1fae5', color: '#065f46', label: 'On Time' };
    }
    if (timingStatus === 'late') {
      return { bg: '#fef3c7', color: '#92400e', label: 'Late' };
    }
    return { bg: '#fee2e2', color: '#b91c1c', label: 'Not Submitted' };
  };

  const fallbackQuestionCountPoints = Math.max(0, Number(assignment?.assignment_questions?.length || 0));
  const effectiveTotalPoints = assignmentTotalPoints > 0 ? assignmentTotalPoints : fallbackQuestionCountPoints;

  const getSubmittedGradeStyle = (percent) => {
    const safePercent = Number(percent || 0);
    if (safePercent >= 99.999) return { bg: '#166534', color: '#ecfdf5' }; // dark green
    if (safePercent >= 80) return { bg: '#86efac', color: '#14532d' }; // light green
    if (safePercent >= 70) return { bg: '#fde68a', color: '#92400e' }; // yellow
    if (safePercent >= 60) return { bg: '#fdba74', color: '#9a3412' }; // orange
    return { bg: '#fca5a5', color: '#7f1d1d' }; // red
  };

  // Get type badge color
  const getTypeBadgeStyle = (type) => {
    const colors = {
      'Homework': { bg: '#eef2ff', color: '#4f46e5' },
      'Quiz': { bg: '#fef3c7', color: '#d97706' },
      'Lab': { bg: '#d1fae5', color: '#059669' },
      'Exam': { bg: '#fee2e2', color: '#dc2626' },
      'Reading': { bg: '#e0e7ff', color: '#4338ca' },
      'Other': { bg: '#f3f4f6', color: '#6b7280' }
    };
    return colors[type] || colors['Other'];
  };

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
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '2rem'
    },
    titleSection: {
      flex: 1
    },
    title: {
      margin: '0 0 0.75rem 0',
      fontSize: '2rem',
      fontWeight: '700',
      color: '#111827'
    },
    typeBadge: {
      display: 'inline-block',
      padding: '0.375rem 0.75rem',
      borderRadius: '6px',
      fontSize: '0.875rem',
      fontWeight: '600'
    },
    editButton: {
      padding: '0.75rem 1.5rem',
      background: '#4f46e5',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: '600',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      transition: 'background 0.15s'
    },
    section: {
      background: 'white',
      borderRadius: '12px',
      padding: '1.5rem',
      marginBottom: '1.5rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    },
    sectionTitle: {
      margin: '0 0 1rem 0',
      fontSize: '1.25rem',
      fontWeight: '600',
      color: '#111827',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem'
    },
    infoGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '1rem'
    },
    infoCard: {
      background: '#f9fafb',
      padding: '1rem',
      borderRadius: '8px'
    },
    infoLabel: {
      fontSize: '0.75rem',
      fontWeight: '600',
      color: '#6b7280',
      textTransform: 'uppercase',
      marginBottom: '0.25rem'
    },
    infoValue: {
      fontSize: '1rem',
      color: '#111827',
      fontWeight: '500'
    },
    description: {
      fontSize: '1rem',
      color: '#374151',
      lineHeight: '1.6',
      whiteSpace: 'pre-wrap'
    },
    questionsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
      gap: '4rem 1.5rem'
    },
    emptyState: {
      textAlign: 'center',
      padding: '3rem',
      background: '#f9fafb',
      borderRadius: '12px',
      border: '2px dashed #d1d5db'
    },
    emptyTitle: {
      margin: '0 0 0.5rem 0',
      fontSize: '1.125rem',
      fontWeight: '600',
      color: '#374151'
    },
    emptyText: {
      margin: 0,
      color: '#6b7280'
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
    },
    submissionTable: {
      width: '100%',
      borderCollapse: 'collapse'
    },
    submissionRow: {
      borderBottom: '1px solid #f3f4f6'
    },
    submissionCell: {
      padding: '0.75rem 0.5rem',
      fontSize: '0.9rem',
      color: '#374151'
    },
    submissionHeaderCell: {
      textAlign: 'left',
      padding: '0.5rem',
      fontSize: '0.75rem',
      fontWeight: '700',
      letterSpacing: '0.03em',
      textTransform: 'uppercase',
      color: '#6b7280'
    },
    gradeButton: {
      border: 'none',
      borderRadius: '8px',
      background: '#4f46e5',
      color: 'white',
      padding: '0.35rem 0.7rem',
      fontSize: '0.78rem',
      fontWeight: '700',
      cursor: 'pointer'
    },
    autoGradeText: {
      fontSize: '0.84rem',
      fontWeight: '700',
      color: '#374151'
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
          onClick={() => window.location.hash = courseId ? `#course/${courseId}` : '#courses'}
          onMouseEnter={(e) => e.currentTarget.style.background = '#e5e7eb'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#f3f4f6'}
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
          onClick={() => window.location.hash = courseId ? `#course/${courseId}` : '#courses'}
        >
          ← Back to Course
        </button>
        <div style={styles.errorBox}>Assignment not found</div>
      </div>
    );
  }

  const canEditAssignment = assignment.instructor_id === user?.id;
  const typeBadgeColors = getTypeBadgeStyle(assignment.type);
  const canShowReleaseControls = canEditAssignment && assignmentPhase === 'ungraded' && !gradeReleased;
  const canReleaseGrades = canShowReleaseControls && allStudentsGraded && !releasingGrades;

  return (
    <div style={styles.container}>
      {/* Back Button */}
      <button 
        style={styles.backButton}
        onClick={() => window.location.hash = courseId ? `#course/${courseId}` : '#courses'}
        onMouseEnter={(e) => e.currentTarget.style.background = '#e5e7eb'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#f3f4f6'}
      >
        ← Back to Course
      </button>

      {/* Header with Title and Edit Button */}
      <div style={styles.header}>
        <div style={styles.titleSection}>
          <h1 style={styles.title}>{assignment.title}</h1>
          <span style={{
            ...styles.typeBadge,
            background: typeBadgeColors.bg,
            color: typeBadgeColors.color
          }}>
            {assignment.type}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            style={{
              padding: '0.75rem 1.5rem',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'background 0.15s'
            }}
            onClick={() => setShowPreview(true)}
            onMouseEnter={(e) => e.currentTarget.style.background = '#059669'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#10b981'}
          >
            Student Preview
          </button>
          {canEditAssignment && (
            <button
                style={styles.editButton}
                onClick={() => window.location.hash = `#course/${courseId}/assignment/${assignmentId}/edit`}
                onMouseEnter={(e) => e.currentTarget.style.background = '#4338ca'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#4f46e5'}
              >
                ✏️ Edit Assignment
              </button>
          )}
        </div>
      </div>
    </div>

      {/* Assignment Details */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Assignment Details</h2>
        
        <DateTimeline assignment={assignment} />

        {assignment.description && (
          <div style={{ marginTop: '0rem' }}>
            <div style={styles.infoLabel}>Description</div>
            <p style={styles.description}>{assignment.description}</p>
          </div>
        )}
      </div>

      {canEditAssignment && (
        <div style={styles.section}>
          <AssignmentGradingStats
            submissionStatusRows={submissionStatusRows}
            assignmentTotalPoints={assignmentTotalPoints}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: canShowReleaseControls || gradeReleased ? '0.75rem' : 0 }}>
            <h2 style={styles.sectionTitle}>Student Submission Status</h2>
            {canShowReleaseControls && (
              <button
                type="button"
                onClick={async () => {
                  if (!assignment?.id || !canReleaseGrades) return;
                  setReleasingGrades(true);
                  try {
                    await releaseAssignmentGrades(assignment.id);
                    const statusData = await getAssignmentSubmissionStatus(assignment.id);
                    setGradeReleased(Boolean(statusData?.grade_released));
                    setAllStudentsGraded(Boolean(statusData?.all_students_graded));
                    const statusByStudent = new Map((statusData?.students || []).map((row) => [row.student_id, row]));
                    setSubmissionStatusRows((prev) => prev.map((row) => {
                      const s = statusByStudent.get(row.student_id);
                      return s ? { ...row, ...s } : row;
                    }));
                  } catch (err) {
                    alert(err.message || 'Failed to release grades');
                  } finally {
                    setReleasingGrades(false);
                  }
                }}
                disabled={!canReleaseGrades}
                style={{
                  background: canReleaseGrades ? 'linear-gradient(90deg, #4f46e5 0%, #ec4899 100%)' : '#cbd5e1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.55rem 0.95rem',
                  cursor: canReleaseGrades ? 'pointer' : 'not-allowed',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  opacity: canReleaseGrades ? 1 : 0.8,
                }}
              >
                {releasingGrades ? 'Releasing...' : 'Release Grades'}
              </button>
            )}
          </div>
          {canShowReleaseControls && (
            <div style={{
              marginBottom: '0.9rem',
              padding: '0.75rem 0.9rem',
              background: allStudentsGraded ? '#ecfdf5' : '#eef2ff',
              color: allStudentsGraded ? '#065f46' : '#3730a3',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600
            }}>
              {allStudentsGraded
                ? 'All student submissions are graded. You can now release grades.'
                : 'Student submissions still need to be graded before grades can be released.'}
            </div>
          )}
          {gradeReleased && (
            <div style={{
              marginBottom: '0.9rem',
              padding: '0.75rem 0.9rem',
              background: '#ecfdf5',
              color: '#065f46',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600
            }}>
              Grades have been released for this assignment.
            </div>
          )}

          {submissionStatusLoading ? (
            <p style={{ margin: 0, color: '#6b7280' }}>Loading student statuses...</p>
          ) : submissionStatusError ? (
            <div style={styles.errorBox}>{submissionStatusError}</div>
          ) : submissionStatusRows.length === 0 ? (
            <p style={{ margin: 0, color: '#6b7280' }}>No enrolled students found.</p>
          ) : (
            <table style={styles.submissionTable}>
              <thead>
                <tr style={styles.submissionRow}>
                  <th style={styles.submissionHeaderCell}>Student</th>
                  <th style={styles.submissionHeaderCell}>Status</th>
                  <th style={styles.submissionHeaderCell}>Submitted At</th>
                  <th style={styles.submissionHeaderCell}>Grade</th>
                </tr>
              </thead>
              <tbody>
                {submissionStatusRows.map((row) => {
                  const pill = getSubmissionPillStyle(row.timing_status);
                  const canGrade = row.timing_status === 'on_time' || row.timing_status === 'late';
                  const hasSubmittedGrade = Boolean(row.grade_submitted) && row.score_earned != null && row.score_total != null;
                  return (
                    <tr key={row.student_id} style={styles.submissionRow}>
                      <td style={styles.submissionCell}>{row.student_name}</td>
                      <td style={styles.submissionCell}>
                        <span style={{
                          background: pill.bg,
                          color: pill.color,
                          borderRadius: '999px',
                          padding: '0.2rem 0.55rem',
                          fontSize: '0.78rem',
                          fontWeight: '700'
                        }}>
                          {pill.label}
                        </span>
                      </td>
                      <td style={styles.submissionCell}>{formatSubmissionDate(row.submitted_at)}</td>
                      <td style={styles.submissionCell}>
                        {hasSubmittedGrade ? (
                          gradeReleased ? (
                            <span style={{
                              display: 'inline-block',
                              borderRadius: '999px',
                              padding: '0.25rem 0.6rem',
                              fontSize: '0.8rem',
                              fontWeight: '700',
                              ...(getSubmittedGradeStyle(row.score_percent))
                            }}>
                              {`${Math.round(Number(row.score_earned) * 100) / 100} / ${Math.round(Number(row.score_total) * 100) / 100}`}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                window.location.hash = `#course/${courseId}/assignment/${assignmentId}/grade/${encodeURIComponent(row.student_id)}`;
                              }}
                              style={{
                                display: 'inline-block',
                                border: 'none',
                                borderRadius: '999px',
                                padding: '0.25rem 0.6rem',
                                fontSize: '0.8rem',
                                fontWeight: '700',
                                cursor: 'pointer',
                                background: 'transparent',
                                ...(getSubmittedGradeStyle(row.score_percent))
                              }}
                              title="Click to edit grade"
                            >
                              {`${Math.round(Number(row.score_earned) * 100) / 100} / ${Math.round(Number(row.score_total) * 100) / 100}`}
                            </button>
                          )
                        ) : canGrade ? (
                          <button
                            type="button"
                            style={styles.gradeButton}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              window.location.hash = `#course/${courseId}/assignment/${assignmentId}/grade/${encodeURIComponent(row.student_id)}`;
                            }}
                          >
                            Grade
                          </button>
                        ) : (
                          <span style={styles.autoGradeText}>
                            {assignmentPhase === 'ungraded'
                              ? `${0} / ${effectiveTotalPoints}`
                              : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Questions Section */}
      <div style={styles.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600', color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Questions ({questions.length})
            {actionLoading && <span style={{ fontSize: '0.875rem', color: '#6b7280', marginLeft: '0.5rem' }}>Saving...</span>}
          </h2>

          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '8px', padding: '0.25rem', gap: '0.25rem' }}>
            <button
              onClick={() => setViewMode('table')}
              style={{
                padding: '0.5rem 1rem',
                background: viewMode === 'table' ? 'white' : 'transparent',
                color: viewMode === 'table' ? '#111827' : '#6b7280',
                border: 'none', borderRadius: '6px', cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: viewMode === 'table' ? '600' : '500',
                boxShadow: viewMode === 'table' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >Table View</button>
            <button
              onClick={() => setViewMode('card')}
              style={{
                padding: '0.5rem 1rem',
                background: viewMode === 'card' ? 'white' : 'transparent',
                color: viewMode === 'card' ? '#111827' : '#6b7280',
                border: 'none', borderRadius: '6px', cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: viewMode === 'card' ? '600' : '500',
                boxShadow: viewMode === 'card' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >Card View</button>
          </div>
        </div>
        {questions.length > 0 && (
          <p style={{ margin: '-0.25rem 0 1rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
            Drag and drop questions to reorder them in this assignment.
          </p>
        )}

        {questions.length > 0 ? (
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={async ({ active, over }) => {
              if (!over || active.id === over.id) return;

              const oldIndex = questions.findIndex(q => q.id === active.id);
              const newIndex = questions.findIndex(q => q.id === over.id);

              const newOrder = [...questions];
              const [moved] = newOrder.splice(oldIndex, 1);
              newOrder.splice(newIndex, 0, moved);

              setQuestions(newOrder);

              setActionLoading(true);
              try {
                const updatedQuestionIds = newOrder.map(q => q.id);
                
                const updatedAssignment = await updateAssignment(assignmentId, {
                  ...assignment,
                  assignment_questions: updatedQuestionIds
                });
                
                setAssignment(updatedAssignment);
              } catch (err) {
                alert('Failed to reorder questions: ' + (err.message || 'Unknown error'));
                window.location.reload();
              } finally {
                setActionLoading(false);
              }
            }}
          >
            <SortableContext
              items={questions.map(q => q.id)}
              strategy={viewMode === 'card' ? rectSortingStrategy : verticalListSortingStrategy}
            >
              {viewMode === 'card' ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
                    gap: '1.5rem',
                    alignItems: 'stretch',
                  }}
                >
                  {questions.map((question, index) => (
                    <SortableCard key={question.id} id={question.id}>
                      <QuestionCard
                        question={question}
                        userInfo={userInfoCache[question.user_id]}
                        questionNumber={`Q${index + 1}`}
                        showUserIcon
                        showDeleteButton={false}
                        showEditButton
                        showRemoveButton
                        onEdit={handleEditQuestion}
                        onRemove={handleRemoveQuestion}
                        actionLoading={actionLoading}
                        compact={false}
                        showSchool={false}
                        showKeywords={false}
                        showCourseType={false}
                        scale={0.95}
                      />
                    </SortableCard>
                  ))}
                </div>
              ) : (
                <QuestionTable
                  questions={questions}
                  userInfoCache={userInfoCache}
                  showEditButton={canEditAssignment}
                  showRemoveButton={canEditAssignment}
                  showDeleteButton={false}
                  onEdit={handleEditQuestion}
                  onRemove={handleRemoveQuestion}
                  actionLoading={actionLoading}
                  showQuestionNumber={true}
                  showQID={false}
                  showCourseType={false}
                  isDraggable={true}  // Add this prop
                />
              )}
            </SortableContext>
          </DndContext>
        ) : (
          <div style={styles.emptyState}>
            <h3 style={styles.emptyTitle}>No Questions Added</h3>
            <p style={styles.emptyText}>
              {canEditAssignment
                ? 'Edit this assignment to add questions from the question bank.'
                : 'No questions have been added to this assignment yet.'}
            </p>
          </div>
        )}
      </div>

      {/* Student Preview Modal */}
      {showPreview && (
        <StudentPreview
          questions={questions}
          assignmentTitle={assignment.title}
          assignmentType={assignment.type}
          onClose={() => setShowPreview(false)}
          isPreviewMode={true}
          showCorrectAnswers={true}
          showPrevNextButtons={false}
        />
      )}
    </div>
  );
}
