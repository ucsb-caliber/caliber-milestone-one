import React, { useState, useEffect } from 'react';
import { getQuestions } from '../api';

export default function QuestionBank() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadQuestions = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getQuestions();
      setQuestions(data.questions || []);
    } catch (err) {
      setError(err.message || 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, []);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>Question Bank</h2>
        <button
          onClick={loadQuestions}
          disabled={loading}
          style={{
            padding: '0.5rem 1rem',
            background: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {loading && <p>Loading questions...</p>}

      {error && (
        <div style={{
          padding: '1rem',
          background: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '4px',
          color: '#721c24'
        }}>
          {error}
        </div>
      )}

      {!loading && !error && questions.length === 0 && (
        <div style={{
          padding: '2rem',
          background: '#f8f9fa',
          borderRadius: '4px',
          textAlign: 'center',
          color: '#666'
        }}>
          <p>No questions found. Upload a PDF to get started!</p>
          <a href="#home" style={{ color: '#007bff', textDecoration: 'none' }}>
            Go to Upload Page →
          </a>
        </div>
      )}

      {!loading && questions.length > 0 && (
        <div>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            Total questions: <strong>{questions.length}</strong>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {questions.map((question) => (
              <div
                key={question.id}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '1rem',
                  background: 'white',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                <div style={{ marginBottom: '0.5rem' }}>
                  <span style={{
                    background: '#007bff',
                    color: 'white',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 'bold'
                  }}>
                    #{question.id}
                  </span>
                  {question.source_pdf && (
                    <span style={{
                      marginLeft: '0.5rem',
                      color: '#666',
                      fontSize: '0.875rem'
                    }}>
                      from {question.source_pdf}
                    </span>
                  )}
                </div>

                <p style={{ margin: '0.5rem 0', fontSize: '1rem', lineHeight: '1.5' }}>
                  {question.text}
                </p>

                <div style={{
                  marginTop: '0.75rem',
                  display: 'flex',
                  gap: '1rem',
                  fontSize: '0.875rem',
                  color: '#666'
                }}>
                  {question.tags && (
                    <div>
                      <strong>Tags:</strong> {question.tags}
                    </div>
                  )}
                  {question.keywords && (
                    <div>
                      <strong>Keywords:</strong> {question.keywords}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#999' }}>
                  Created: {formatDate(question.created_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
