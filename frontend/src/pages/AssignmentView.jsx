import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { getAssignment, getQuestionsBatch, updateAssignment, createQuestion, getUserById } from '../api';
import QuestionCard from '../components/QuestionCard';

export default function AssignmentView() {
  const { user } = useAuth();
  const [assignment, setAssignment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [userInfoCache, setUserInfoCache] = useState({});

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
    if (!dateStr) return 'Not set';
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
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
    questionCard: {
      background: '#f9fafb',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      padding: '1.25rem',
      transition: 'all 0.15s'
    },
    questionTitle: {
      margin: '0 0 0.5rem 0',
      fontSize: '1rem',
      fontWeight: '600',
      color: '#111827'
    },
    questionText: {
      margin: '0 0 0.75rem 0',
      fontSize: '0.875rem',
      color: '#6b7280',
      display: '-webkit-box',
      WebkitLineClamp: 3,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden'
    },
    questionMeta: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '0.5rem'
    },
    tag: {
      padding: '0.25rem 0.5rem',
      background: '#e5e7eb',
      borderRadius: '4px',
      fontSize: '0.75rem',
      color: '#374151'
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
        <button
          style={styles.editButton}
          onClick={() => window.location.hash = `#course/${courseId}/assignment/${assignmentId}/edit`}
          onMouseEnter={(e) => e.currentTarget.style.background = '#4338ca'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#4f46e5'}
        >
          ✏️ Edit Assignment
        </button>
      </div>

      {/* Assignment Details */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>📋 Assignment Details</h2>
        
        <div style={styles.infoGrid}>
          <div style={styles.infoCard}>
            <div style={styles.infoLabel}>Release Date</div>
            <div style={styles.infoValue}>{formatDate(assignment.release_date)}</div>
          </div>
          <div style={styles.infoCard}>
            <div style={styles.infoLabel}>Due Date (Soft)</div>
            <div style={styles.infoValue}>{formatDate(assignment.due_date_soft)}</div>
          </div>
          <div style={styles.infoCard}>
            <div style={styles.infoLabel}>Due Date (Hard)</div>
            <div style={styles.infoValue}>{formatDate(assignment.due_date_hard)}</div>
          </div>
          <div style={styles.infoCard}>
            <div style={styles.infoLabel}>Questions</div>
            <div style={styles.infoValue}>{assignment.assignment_questions?.length || 0} questions</div>
          </div>
        </div>

        {assignment.description && (
          <div style={{ marginTop: '1.5rem' }}>
            <div style={styles.infoLabel}>Description</div>
            <p style={styles.description}>{assignment.description}</p>
          </div>
        )}
      </div>

      {/* Questions Section */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>
          📝 Questions ({questions.length})
          {actionLoading && <span style={{ fontSize: '0.875rem', color: '#6b7280', marginLeft: '0.5rem' }}>Saving...</span>}
        </h2>

        {questions.length > 0 ? (
          <div style={styles.questionsGrid}>
            {questions.map((question, index) => (
              <QuestionCard
                key={question.id}
                question={question}
                userInfo={userInfoCache[question.user_id]}
                questionNumber={`Q${index + 1}`}
                showUserIcon={true}
                showDeleteButton={false}
                showEditButton={true}
                showRemoveButton={true}
                onEdit={handleEditQuestion}
                onRemove={handleRemoveQuestion}
              />
            ))}
          </div>
        ) : (
          <div style={styles.emptyState}>
            <h3 style={styles.emptyTitle}>No Questions Added</h3>
            <p style={styles.emptyText}>
              Edit this assignment to add questions from the question bank.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
