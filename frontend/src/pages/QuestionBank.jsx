import React, { useState, useEffect } from 'react';
import { getQuestions, getAllQuestions, deleteQuestion, updateQuestion } from '../api';
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
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [editForm, setEditForm] = useState({ text: '', tags: '', keywords: '', source_pdf: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const loadQuestions = async () => {
    setLoading(true);
    setError('');
    try {
      const [myData, allData] = await Promise.all([
        getQuestions(),
        getAllQuestions()
      ]);
      // Sort questions by created_at descending (newest first)
      setMyQuestions((myData.questions || []).sort(sortByNewest));
      setAllQuestions((allData.questions || []).sort(sortByNewest));
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

  const openEditModal = (question) => {
    setEditingQuestion(question);
    setEditForm({
      text: question.text || '',
      tags: question.tags || '',
      keywords: question.keywords || '',
      source_pdf: question.source_pdf || ''
    });
    setSaveError('');
  };

  const closeEditModal = () => {
    setEditingQuestion(null);
    setEditForm({ text: '', tags: '', keywords: '', source_pdf: '' });
    setSaveError('');
  };

  const handleEditFormChange = (field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveEdit = async () => {
    if (!editingQuestion) return;
    
    setSaving(true);
    setSaveError('');
    
    try {
      await updateQuestion(editingQuestion.id, {
        text: editForm.text || null,
        tags: editForm.tags || null,
        keywords: editForm.keywords || null,
        source_pdf: editForm.source_pdf || null
      });
      
      closeEditModal();
      await loadQuestions();
    } catch (err) {
      setSaveError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
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
    const canEdit = user && question.user_id === user.id;

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

        {/* Action buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto', gap: '0.5rem' }}>
          {canEdit && (
            <button
              onClick={() => openEditModal(question)}
              style={{
                padding: '0.5rem 1rem',
                background: 'transparent',
                color: '#007bff',
                border: '1px solid #007bff',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#007bff';
                e.currentTarget.style.color = 'white';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#007bff';
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              Edit
            </button>
          )}
          {showDeleteButton && (
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
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', paddingBottom: '1.5rem' }}>
      {/* Header with Create button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ margin: 0 }}>Question Bank</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={() => window.location.hash = 'create-question'}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold'
            }}
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
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '1rem'
            }}
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
                  borderRadius: '4px',
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
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Create Your First Question
                  </button>
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                  gap: '4rem 1.5rem'
                }}>
                  {myQuestions.map(question => renderQuestionCard(question, true))}
                </div>
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
                  borderRadius: '4px',
                  textAlign: 'center',
                  color: '#666'
                }}>
                  <p>No questions found in the system.</p>
                </div>
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
            )}
          </div>
        </>
      )}

      {/* Edit Modal */}
      {editingQuestion && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEditModal();
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '1.5rem',
              width: '90%',
              maxWidth: '550px',
              maxHeight: '85vh',
              overflow: 'auto',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#333' }}>
                Edit Question #{editingQuestion.id}
              </h3>
              <button
                onClick={closeEditModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#999',
                  padding: '0.25rem',
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>

            {saveError && (
              <div style={{
                padding: '0.75rem',
                background: '#f8d7da',
                border: '1px solid #f5c6cb',
                borderRadius: '6px',
                color: '#721c24',
                marginBottom: '1rem',
                fontSize: '0.875rem'
              }}>
                {saveError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '500', color: '#444', fontSize: '0.875rem' }}>
                  Question Text
                </label>
                <textarea
                  value={editForm.text}
                  onChange={(e) => handleEditFormChange('text', e.target.value)}
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '0.95rem',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s ease'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#007bff'}
                  onBlur={(e) => e.target.style.borderColor = '#ddd'}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '500', color: '#444', fontSize: '0.875rem' }}>
                  Tags
                </label>
                <input
                  type="text"
                  value={editForm.tags}
                  onChange={(e) => handleEditFormChange('tags', e.target.value)}
                  placeholder="e.g., math, algebra, calculus"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '0.95rem',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s ease'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#007bff'}
                  onBlur={(e) => e.target.style.borderColor = '#ddd'}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '500', color: '#444', fontSize: '0.875rem' }}>
                  Keywords
                </label>
                <input
                  type="text"
                  value={editForm.keywords}
                  onChange={(e) => handleEditFormChange('keywords', e.target.value)}
                  placeholder="e.g., derivative, integration"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '0.95rem',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s ease'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#007bff'}
                  onBlur={(e) => e.target.style.borderColor = '#ddd'}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: '500', color: '#444', fontSize: '0.875rem' }}>
                  Source PDF
                </label>
                <input
                  type="text"
                  value={editForm.source_pdf}
                  onChange={(e) => handleEditFormChange('source_pdf', e.target.value)}
                  placeholder="e.g., chapter1.pdf"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '0.95rem',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s ease'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#007bff'}
                  onBlur={(e) => e.target.style.borderColor = '#ddd'}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={closeEditModal}
                disabled={saving}
                style={{
                  padding: '0.65rem 1.25rem',
                  background: '#f8f9fa',
                  color: '#666',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  transition: 'all 0.2s ease'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                style={{
                  padding: '0.65rem 1.25rem',
                  background: saving ? '#6c757d' : '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s ease'
                }}
              >
                {saving ? (
                  <>
                    <span style={{
                      display: 'inline-block',
                      width: '14px',
                      height: '14px',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: 'white',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite'
                    }} />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}
