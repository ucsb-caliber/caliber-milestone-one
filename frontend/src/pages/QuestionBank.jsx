import React, { useState, useEffect } from 'react';
import { getQuestions, getAllQuestions, deleteQuestion, getUserById } from '../api';
import { useAuth } from '../AuthContext';

// Color palettes for keyword and tag bubbles
const KEYWORD_COLORS = ['#e3f2fd', '#f3e5f5', '#e8f5e9', '#fff3e0', '#fce4ec'];
const TAG_COLORS = ['#ffebee', '#e8eaf6', '#f1f8e9', '#fff8e1', '#fbe9e7'];

// Sort function for newest-first ordering
const sortByNewest = (a, b) => new Date(b.created_at) - new Date(a.created_at);

export default function QuestionBank() {
  const { user } = useAuth();
  const [myQuestions, setMyQuestions] = useState([]);
  const [allQuestions, setAllQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [myQuestionsCollapsed, setMyQuestionsCollapsed] = useState(false);
  const [allQuestionsCollapsed, setAllQuestionsCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState('card'); // 'card' or 'table'
  const [userMap, setUserMap] = useState({}); // Map of user_id to user info

  const loadQuestions = async () => {
    setLoading(true);
    setError('');
    try {
      const [myData, allData] = await Promise.all([
        getQuestions(),
        getAllQuestions()
      ]);
      // Sort questions by created_at descending (newest first)
      const sortedMyQuestions = (myData.questions || []).sort(sortByNewest);
      const sortedAllQuestions = (allData.questions || []).sort(sortByNewest);
      setMyQuestions(sortedMyQuestions);
      setAllQuestions(sortedAllQuestions);

      // Fetch user info for all unique user IDs
      const allUserIds = new Set([
        ...sortedMyQuestions.map(q => q.user_id),
        ...sortedAllQuestions.map(q => q.user_id)
      ]);
      
      const userInfoPromises = Array.from(allUserIds).map(async (userId) => {
        try {
          const userInfo = await getUserById(userId);
          return [userId, userInfo];
        } catch (err) {
          console.error(`Failed to fetch user ${userId}:`, err);
          return [userId, null];
        }
      });

      const userInfoResults = await Promise.all(userInfoPromises);
      const userMapObj = {};
      userInfoResults.forEach(([userId, userInfo]) => {
        if (userInfo) {
          userMapObj[userId] = userInfo;
        }
      });
      setUserMap(userMapObj);
    } catch (err) {
      setError(err.message || 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, []);

  const handleDelete = async (questionId) => {
    try {
      await deleteQuestion(questionId);
      setDeleteConfirm(null);
      await loadQuestions();
    } catch (err) {
      setError(err.message || 'Failed to delete question');
    }
  };

  // Render user profile icon
  const renderUserProfile = (userId) => {
    const userInfo = userMap[userId];
    if (!userInfo) {
      return (
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: '#e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6b7280',
          fontSize: '0.75rem',
          fontWeight: '600'
        }}>
          ?
        </div>
      );
    }

    const getInitials = () => {
      if (userInfo.initials) return userInfo.initials.toUpperCase();
      if (userInfo.first_name && userInfo.last_name) {
        return `${userInfo.first_name[0]}${userInfo.last_name[0]}`.toUpperCase();
      }
      if (userInfo.email) {
        const emailPart = userInfo.email.split('@')[0];
        return emailPart.slice(0, 2).toUpperCase();
      }
      return 'U';
    };

    const shapeStyle =
      userInfo.icon_shape === 'square'
        ? { borderRadius: '8px' }
        : userInfo.icon_shape === 'hex'
          ? { clipPath: 'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0% 50%)' }
          : { borderRadius: '50%' };

    return (
      <div
        style={{
          width: '32px',
          height: '32px',
          background: userInfo.icon_color || '#4f46e5',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.75rem',
          fontWeight: '600',
          ...shapeStyle
        }}
        title={`${userInfo.first_name || ''} ${userInfo.last_name || ''}`.trim() || userInfo.email || 'User'}
      >
        {getInitials()}
      </div>
    );
  };

  // Generate QID from question (use title slugified or ID)
  const getQID = (question) => {
    if (question.title) {
      return question.title.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || `question-${question.id}`;
    }
    return `question-${question.id}`;
  };

  // Render a single value as a badge/button
  const renderBadge = (value, color = '#e5e7eb') => {
    if (!value || !value.trim()) {
      return <span style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '0.875rem' }}>-</span>;
    }
    
    return (
      <span
        style={{
          background: color,
          color: '#374151',
          padding: '0.35rem 0.75rem',
          borderRadius: '6px',
          fontSize: '0.75rem',
          fontWeight: '500',
          border: '1px solid rgba(0,0,0,0.08)',
          whiteSpace: 'nowrap',
          display: 'inline-block'
        }}
      >
        {value}
      </span>
    );
  };

  // Render tags as colored badges
  const renderTags = (tagsString) => {
    if (!tagsString || !tagsString.trim()) {
      return <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>-</span>;
    }
    const tags = tagsString.split(',').map(t => t.trim()).filter(t => t);
    if (tags.length === 0) {
      return <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>-</span>;
    }
    
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
        {tags.map((tag, index) => (
          <span
            key={index}
            style={{
              background: TAG_COLORS[index % TAG_COLORS.length],
              color: '#333',
              padding: '0.2rem 0.5rem',
              borderRadius: '12px',
              fontSize: '0.7rem',
              fontWeight: '500',
              border: '1px solid rgba(0,0,0,0.1)',
              whiteSpace: 'nowrap'
            }}
          >
            {tag}
          </span>
        ))}
      </div>
    );
  };

  // Render table row
  const renderTableRow = (question, showDeleteButton = true) => {
    const qid = getQID(question);
    
    return (
      <tr
        key={question.id}
        style={{
          borderBottom: '1px solid #e5e7eb',
          transition: 'background-color 0.15s ease'
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
          {renderUserProfile(question.user_id)}
        </td>
        <td style={{ padding: '0.75rem 1rem' }}>
          <a
            href={`#question-${question.id}`}
            onClick={(e) => {
              e.preventDefault();
              // Could navigate to question detail or scroll to it
            }}
            style={{
              color: '#0066cc',
              textDecoration: 'none',
              fontWeight: '400',
              fontSize: '0.875rem',
              cursor: 'pointer',
              fontFamily: 'monospace'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.textDecoration = 'underline';
              e.currentTarget.style.color = '#0052a3';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.textDecoration = 'none';
              e.currentTarget.style.color = '#0066cc';
            }}
          >
            {qid}
          </a>
        </td>
        <td style={{ padding: '0.75rem 1rem', color: '#111827', fontSize: '0.875rem' }}>
          {question.title || 'Untitled'}
        </td>
        <td style={{ padding: '0.75rem 1rem' }}>
          {renderBadge(question.course, '#dbeafe')}
        </td>
        <td style={{ padding: '0.75rem 1rem' }}>
          {renderBadge(question.course_type, '#e0e7ff')}
        </td>
        <td style={{ padding: '0.75rem 1rem' }}>
          {renderBadge(question.blooms_taxonomy, '#fce7f3')}
        </td>
        <td style={{ padding: '0.75rem 1rem' }}>
          {renderBadge(question.question_type, '#fef3c7')}
        </td>
        <td style={{ padding: '0.75rem 1rem' }}>
          {renderTags(question.tags)}
        </td>
        {showDeleteButton && (
          <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
            <button
              onClick={() => setDeleteConfirm(question.id)}
              style={{
                padding: '0.375rem 0.75rem',
                background: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                transition: 'background-color 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#c82333'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#dc3545'}
            >
              Delete
            </button>
          </td>
        )}
      </tr>
    );
  };

  // Render table view
  const renderTableView = (questions, showDeleteButton = true) => {
    if (questions.length === 0) {
      return (
        <div style={{
          padding: '3rem',
          background: '#f9fafb',
          borderRadius: '8px',
          textAlign: 'center',
          color: '#6b7280'
        }}>
          <p style={{ margin: 0, fontSize: '1rem' }}>No questions found.</p>
        </div>
      );
    }

    // Check if any question can be deleted (for showing Actions column)
    const hasDeletableQuestions = user && 
      questions.some(q => q.user_id === user.id);

    return (
      <div style={{
        background: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.875rem'
          }}>
            <thead>
              <tr style={{
                background: '#f9fafb',
                borderBottom: '1px solid #e5e7eb'
              }}>
                <th style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#374151',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Creator
                </th>
                <th style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#374151',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  QID
                </th>
                <th style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#374151',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Title
                </th>
                <th style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#374151',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Course
                </th>
                <th style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#374151',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Course Type
                </th>
                <th style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#374151',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Blooms Taxonomy
                </th>
                <th style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#374151',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Question Type
                </th>
                <th style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#374151',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Tags
                </th>
                {hasDeletableQuestions && (
                  <th style={{
                    padding: '0.75rem 1rem',
                    textAlign: 'center',
                    fontWeight: '600',
                    color: '#374151',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {questions.map(question => {
                // User can delete their own questions regardless of showDeleteButton flag
                const canDelete = user && question.user_id === user.id;
                return renderTableRow(question, canDelete);
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderQuestionCard = (question, showDeleteButton = true) => {
    let answerChoices = [];
    try {
      answerChoices = JSON.parse(question.answer_choices || '[]');
    } catch (e) {
      answerChoices = [];
    }

    // Split keywords and tags into arrays
    const keywords = question.keywords ? question.keywords.split(',').map(k => k.trim()).filter(k => k) : [];
    const tags = question.tags ? question.tags.split(',').map(t => t.trim()).filter(t => t) : [];

    return (
      <div
        key={question.id}
        style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '1.25rem',
          background: 'white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          position: 'relative'
        }}
      >
        {/* Header with course, keywords, tags */}
        <div style={{ marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #eee' }}>
          {question.course && (
            <div style={{ marginBottom: '0.5rem' }}>
              <span style={{
                background: '#007bff',
                color: 'white',
                padding: '0.25rem 0.75rem',
                borderRadius: '4px',
                fontSize: '0.875rem',
                fontWeight: 'bold'
              }}>
                {question.course}
              </span>
            </div>
          )}
          {keywords.length > 0 && (
            <div style={{ marginBottom: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              <strong style={{ fontSize: '0.75rem', color: '#666', marginRight: '0.25rem' }}>Keywords:</strong>
              {keywords.map((keyword, index) => (
                <span
                  key={index}
                  style={{
                    background: KEYWORD_COLORS[index % KEYWORD_COLORS.length],
                    color: '#333',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '12px',
                    fontSize: '0.7rem',
                    fontWeight: '500',
                    border: '1px solid rgba(0,0,0,0.1)'
                  }}
                >
                  {keyword}
                </span>
              ))}
            </div>
          )}
          {tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              <strong style={{ fontSize: '0.75rem', color: '#666', marginRight: '0.25rem' }}>Tags:</strong>
              {tags.map((tag, index) => (
                <span
                  key={index}
                  style={{
                    background: TAG_COLORS[index % TAG_COLORS.length],
                    color: '#333',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '12px',
                    fontSize: '0.7rem',
                    fontWeight: '500',
                    border: '1px solid rgba(0,0,0,0.1)'
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Question text */}
        <div style={{ marginBottom: '1rem', flex: 1 }}>
          <p style={{ margin: 0, fontSize: '1rem', lineHeight: '1.5', fontWeight: '500' }}>
            {question.text}
          </p>
        </div>

        {/* Answer choices */}
        {answerChoices.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#333' }}>
              Answer Choices:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {answerChoices.map((choice, index) => {
                const isCorrect = choice === question.correct_answer;
                return (
                  <div
                    key={index}
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: '4px',
                      border: isCorrect ? '2px solid #28a745' : '1px solid #ddd',
                      background: isCorrect ? '#d4edda' : '#f8f9fa',
                      fontSize: '0.875rem',
                      position: 'relative'
                    }}
                  >
                    {choice}
                    {isCorrect && (
                      <span style={{
                        marginLeft: '0.5rem',
                        color: '#28a745',
                        fontWeight: 'bold',
                        fontSize: '0.75rem'
                      }}>
                        ✓ Correct
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Delete button in bottom corner - only show if permitted */}
        {showDeleteButton && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
            <button
              onClick={() => setDeleteConfirm(question.id)}
              style={{
                padding: '0.5rem 1rem',
                background: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 'bold'
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', paddingBottom: '1.5rem' }}>
      {/* Header with Create button and View Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ margin: 0 }}>Question Bank</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {/* View Toggle */}
          <div style={{
            display: 'flex',
            background: '#f3f4f6',
            borderRadius: '8px',
            padding: '0.25rem',
            gap: '0.25rem'
          }}>
            <button
              onClick={() => setViewMode('card')}
              style={{
                padding: '0.5rem 1rem',
                background: viewMode === 'card' ? 'white' : 'transparent',
                color: viewMode === 'card' ? '#111827' : '#6b7280',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: viewMode === 'card' ? '600' : '500',
                boxShadow: viewMode === 'card' ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              Card View
            </button>
            <button
              onClick={() => setViewMode('table')}
              style={{
                padding: '0.5rem 1rem',
                background: viewMode === 'table' ? 'white' : 'transparent',
                color: viewMode === 'table' ? '#111827' : '#6b7280',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: viewMode === 'table' ? '600' : '500',
                boxShadow: viewMode === 'table' ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              Table View
            </button>
          </div>
          <button
            onClick={() => window.location.hash = 'create-question'}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '600',
              transition: 'background-color 0.15s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#218838'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#28a745'}
          >
            + Create New Question
          </button>
          <button
            onClick={loadQuestions}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: '500',
              opacity: loading ? 0.6 : 1,
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#0056b3')}
            onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = '#007bff')}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {loading && <p>Loading questions...</p>}

      {error && (
        <div style={{
          padding: '1rem',
          background: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '4px',
          color: '#721c24',
          marginBottom: '1rem'
        }}>
          {error}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '8px',
            maxWidth: '400px',
            width: '90%'
          }}>
            <h3 style={{ marginTop: 0 }}>Confirm Delete</h3>
            <p>Are you sure you want to delete this question? This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <>
          {/* My Questions Section */}
          <div style={{ marginBottom: '4rem' }}>
            <h3 
              onClick={() => setMyQuestionsCollapsed(!myQuestionsCollapsed)}
              style={{ 
                marginBottom: '1rem',
                paddingBottom: '0.5rem',
                borderBottom: '2px solid #007bff',
                color: '#333',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                userSelect: 'none'
              }}
            >
              <span style={{ 
                transition: 'transform 0.2s',
                transform: myQuestionsCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                display: 'inline-block'
              }}>
                ▼
              </span>
              My Questions ({myQuestions.length})
            </h3>
            {!myQuestionsCollapsed && (
              myQuestions.length === 0 ? (
                <div style={{
                  padding: '2rem',
                  background: '#f8f9fa',
                  borderRadius: '8px',
                  textAlign: 'center',
                  color: '#666'
                }}>
                  <p>You haven't created any questions yet.</p>
                  <button
                    onClick={() => window.location.hash = 'create-question'}
                    style={{
                      marginTop: '1rem',
                      padding: '0.5rem 1rem',
                      background: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: '500'
                    }}
                  >
                    Create Your First Question
                  </button>
                </div>
              ) : (
                viewMode === 'table' ? (
                  renderTableView(myQuestions, true)
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                    gap: '4rem 1.5rem'
                  }}>
                    {myQuestions.map(question => renderQuestionCard(question, true))}
                  </div>
                )
              )
            )}
          </div>

          {/* All Questions Section */}
          <div>
            <h3 
              onClick={() => setAllQuestionsCollapsed(!allQuestionsCollapsed)}
              style={{ 
                marginBottom: '1rem',
                paddingBottom: '0.5rem',
                borderBottom: '2px solid #28a745',
                color: '#333',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                userSelect: 'none'
              }}
            >
              <span style={{ 
                transition: 'transform 0.2s',
                transform: allQuestionsCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                display: 'inline-block'
              }}>
                ▼
              </span>
              All Questions ({allQuestions.length})
            </h3>
            {!allQuestionsCollapsed && (
              allQuestions.length === 0 ? (
                <div style={{
                  padding: '2rem',
                  background: '#f8f9fa',
                  borderRadius: '8px',
                  textAlign: 'center',
                  color: '#666'
                }}>
                  <p>No questions found in the system.</p>
                </div>
              ) : (
                viewMode === 'table' ? (
                  renderTableView(allQuestions, false)
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                    gap: '4rem 1.5rem'
                  }}>
                    {allQuestions.map(question => {
                      // Only show delete button if this question belongs to the current user
                      const canDelete = user && question.user_id === user.id;
                      return renderQuestionCard(question, canDelete);
                    })}
                  </div>
                )
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
