import React, { useState } from 'react';
import { createQuestion } from '../api';

export default function CreateQuestion() {
  const [formData, setFormData] = useState({
    text: '',
    course: '',
    keywords: '',
    tags: '',
    answer_choices: ['', '', '', ''],
    correct_answer: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAnswerChange = (index, value) => {
    const newAnswers = [...formData.answer_choices];
    newAnswers[index] = value;
    setFormData(prev => ({
      ...prev,
      answer_choices: newAnswers
    }));
  };

  const addAnswerChoice = () => {
    setFormData(prev => ({
      ...prev,
      answer_choices: [...prev.answer_choices, '']
    }));
  };

  const removeAnswerChoice = (index) => {
    if (formData.answer_choices.length <= 2) {
      setError('Must have at least 2 answer choices');
      return;
    }
    const newAnswers = formData.answer_choices.filter((_, i) => i !== index);
    setFormData(prev => ({
      ...prev,
      answer_choices: newAnswers
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    // Validation
    if (!formData.text.trim()) {
      setError('Question text is required');
      setLoading(false);
      return;
    }

    const validAnswers = formData.answer_choices.filter(a => a.trim());
    if (validAnswers.length < 2) {
      setError('Must have at least 2 answer choices');
      setLoading(false);
      return;
    }

    if (!formData.correct_answer.trim()) {
      setError('Correct answer is required');
      setLoading(false);
      return;
    }

    if (!validAnswers.includes(formData.correct_answer)) {
      setError('Correct answer must be one of the answer choices');
      setLoading(false);
      return;
    }

    try {
      await createQuestion({
        text: formData.text,
        course: formData.course,
        keywords: formData.keywords,
        tags: formData.tags,
        answer_choices: JSON.stringify(validAnswers),
        correct_answer: formData.correct_answer
      });

      setSuccess(true);
      // Reset form
      setFormData({
        text: '',
        course: '',
        keywords: '',
        tags: '',
        answer_choices: ['', '', '', ''],
        correct_answer: ''
      });

      // Redirect to question bank after 2 seconds
      setTimeout(() => {
        window.location.hash = 'questions';
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to create question');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2>Create New Question</h2>
        <a href="#questions" style={{ color: '#007bff', textDecoration: 'none' }}>
          ← Back to Question Bank
        </a>
      </div>

      {error && (
        <div style={{
          padding: '1rem',
          marginBottom: '1rem',
          background: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '4px',
          color: '#721c24'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: '1rem',
          marginBottom: '1rem',
          background: '#d4edda',
          border: '1px solid #c3e6cb',
          borderRadius: '4px',
          color: '#155724'
        }}>
          Question created successfully! Redirecting to question bank...
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Question Text *
          </label>
          <textarea
            name="text"
            value={formData.text}
            onChange={handleInputChange}
            required
            rows={4}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '1rem',
              fontFamily: 'inherit'
            }}
            placeholder="Enter your question here..."
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Course
          </label>
          <input
            type="text"
            name="course"
            value={formData.course}
            onChange={handleInputChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '1rem'
            }}
            placeholder="e.g., CS 101, Math 205"
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Keywords (comma-separated)
          </label>
          <input
            type="text"
            name="keywords"
            value={formData.keywords}
            onChange={handleInputChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '1rem'
            }}
            placeholder="e.g., algorithm, data structure, sorting"
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Tags (comma-separated)
          </label>
          <input
            type="text"
            name="tags"
            value={formData.tags}
            onChange={handleInputChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '1rem'
            }}
            placeholder="e.g., midterm, important, chapter-3"
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Answer Choices *
          </label>
          {formData.answer_choices.map((answer, index) => (
            <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="text"
                value={answer}
                onChange={(e) => handleAnswerChange(index, e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '1rem'
                }}
                placeholder={`Answer choice ${index + 1}`}
              />
              {formData.answer_choices.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeAnswerChoice(index)}
                  style={{
                    padding: '0.75rem 1rem',
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '1rem'
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addAnswerChoice}
            style={{
              padding: '0.5rem 1rem',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              marginTop: '0.5rem'
            }}
          >
            + Add Answer Choice
          </button>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Correct Answer *
          </label>
          <select
            name="correct_answer"
            value={formData.correct_answer}
            onChange={handleInputChange}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '1rem'
            }}
          >
            <option value="">Select the correct answer</option>
            {formData.answer_choices.filter(a => a.trim()).map((answer, index) => (
              <option key={index} value={answer}>
                {answer}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '0.75rem 2rem',
              background: loading ? '#6c757d' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold'
            }}
          >
            {loading ? 'Creating...' : 'Create Question'}
          </button>
          <button
            type="button"
            onClick={() => window.location.hash = 'questions'}
            style={{
              padding: '0.75rem 2rem',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
