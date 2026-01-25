import React, { useState, useEffect } from 'react';
import { getQuestions, getAllQuestions, deleteQuestion } from '../api';

export default function QuestionBank() {
  const [myQuestions, setMyQuestions] = useState([]);
  const [allQuestions, setAllQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const loadQuestions = async () => {
    setLoading(true);
    setError('');
    try {
      const [myData, allData] = await Promise.all([
        getQuestions(),
        getAllQuestions()
      ]);
      setMyQuestions(myData.questions || []);
      setAllQuestions(allData.questions || []);
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

  const renderQuestionCard = (question) => {
    let answerChoices = [];
    try {
      answerChoices = JSON.parse(question.answer_choices || '[]');
    } catch (e) {
      answerChoices = [];
    }

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
          {question.keywords && (
            <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>
              <strong>Keywords:</strong> {question.keywords}
            </div>
          )}
          {question.tags && (
            <div style={{ fontSize: '0.75rem', color: '#666' }}>
              <strong>Tags:</strong> {question.tags}
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

        {/* Delete button in bottom corner */}
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
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
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
          <div style={{ marginBottom: '3rem' }}>
            <h3 style={{ 
              marginBottom: '1rem',
              paddingBottom: '0.5rem',
              borderBottom: '2px solid #007bff',
              color: '#333'
            }}>
              My Questions ({myQuestions.length})
            </h3>
            {myQuestions.length === 0 ? (
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
                gap: '1.5rem'
              }}>
                {myQuestions.map(renderQuestionCard)}
              </div>
            )}
          </div>

          {/* All Questions Section */}
          <div>
            <h3 style={{ 
              marginBottom: '1rem',
              paddingBottom: '0.5rem',
              borderBottom: '2px solid #28a745',
              color: '#333'
            }}>
              All Questions ({allQuestions.length})
            </h3>
            {allQuestions.length === 0 ? (
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
                gap: '1.5rem'
              }}>
                {allQuestions.map(renderQuestionCard)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
