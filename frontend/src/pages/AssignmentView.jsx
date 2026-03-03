import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { getAssignment, getQuestionsBatch, updateAssignment, createQuestion, getUserById } from '../api';
import QuestionCard from '../components/QuestionCard';
import QuestionTable from '../components/QuestionTable';
import StudentPreview from '../components/StudentPreview';

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
    const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffMs < 0) return { value: Math.abs(diffDays), unit: 'days', overdue: true };
    if (diffDays <= 1) return { value: diffHours, unit: 'hours', overdue: false };
    return { value: diffDays, unit: 'days', overdue: false };
  };

  const start = release || now;
  const end = softDue || now;
  const totalMs = end - start;
  const elapsedMs = now - start;
  const todayPct = totalMs > 0 ? Math.min(Math.max((elapsedMs / totalMs) * 100, 0), 100) : 0;

  const getPct = (date) => {
    if (!date || totalMs <= 0) return 0;
    return Math.min(Math.max(((date - start) / totalMs) * 100, 0), 100);
  };

  const softPct = getPct(softDue);

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
              {softDue && (() => {
                const t = getTimeLeft(softDue);
                const color = t.overdue ? '#dc2626' : t.unit === 'hours' ? '#f7832a' : '#6acc20';
                const label = t.overdue
                  ? `${t.value}d overdue`
                  : t.value === 0 ? 'Due now'
                  : `${t.value}${t.unit === 'hours' ? 'h' : 'd'} left`;
                return (
                  <div style={{ fontSize: '0.75rem', fontWeight: '500', color }}>
                    {label}
                  </div>
                );
              })()}
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
  const [viewMode, setViewMode] = useState('card'); // 'card' or 'table'

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

      {/* Questions Section */}
      <div style={styles.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600', color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Questions ({questions.length})
            {actionLoading && <span style={{ fontSize: '0.875rem', color: '#6b7280', marginLeft: '0.5rem' }}>Saving...</span>}
          </h2>

          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '8px', padding: '0.25rem', gap: '0.25rem' }}>
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
        />
      )}
    </div>
  );
}
