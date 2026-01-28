import React, { useState } from 'react';
import { createQuestion } from '../api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

export default function CreateQuestion() {
  const [formData, setFormData] = useState({
    text: '',
    course: '',
    course_type: '',
    question_type: 'mcq',
    blooms_taxonomy: 'Remembering',
    image_file: null,
    keywords: '',
    tags: '',
    answer_choices: ['', '', '', ''],
    correct_answer: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        e.target.value = ''; // Reset file input
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('Image must be less than 5MB');
        e.target.value = ''; // Reset file input
        return;
      }
      setFormData(prev => ({
        ...prev,
        image_file: file
      }));
      // Create preview URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
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

    if (!formData.answer_choices.some(choice => choice.trim() === formData.correct_answer)) {
      setError('Correct answer must be one of the answer choices');
      setLoading(false);
      return;
    }

    try {
      await createQuestion({
        text: formData.text,
        course: formData.course,
        course_type: formData.course_type,
        question_type: formData.question_type,
        blooms_taxonomy: formData.blooms_taxonomy,
        image_file: formData.image_file,
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
        course_type: '',
        question_type: 'mcq',
        blooms_taxonomy: 'Remembering',
        image_file: null,
        keywords: '',
        tags: '',
        answer_choices: ['', '', '', ''],
        correct_answer: ''
      });
      setImagePreview(null);

      // Redirect to question bank
      window.location.hash = 'questions';
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
            Question Text (Markdown Supported) *
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              style={{
                padding: '0.25rem 1rem',
                background: !showPreview ? '#007bff' : '#e9ecef',
                color: !showPreview ? 'white' : '#495057',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              style={{
                padding: '0.25rem 1rem',
                background: showPreview ? '#007bff' : '#e9ecef',
                color: showPreview ? 'white' : '#495057',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Preview
            </button>
          </div>
          {!showPreview ? (
            <textarea
              name="text"
              value={formData.text}
              onChange={handleInputChange}
              required
              rows={6}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem',
                fontFamily: 'monospace',
                boxSizing: 'border-box'
              }}
              placeholder="Enter your question here... You can use **markdown** for _formatting_"
            />
          ) : (
            <div
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                minHeight: '150px',
                background: '#f8f9fa',
                boxSizing: 'border-box'
              }}
            >
              <ReactMarkdown 
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {formData.text || '*No content*'}
              </ReactMarkdown>
            </div>
          )}
          <small style={{ color: '#666', fontSize: '0.875rem' }}>
            Supports GitHub Flavored Markdown: **bold**, *italic*, `code`, tables, LaTeX math ($...$), etc.
          </small>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              UCSB Class Tag
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
                fontSize: '1rem',
                boxSizing: 'border-box'
              }}
              placeholder="e.g., CS16, CS24, MATH 3A"
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Course Type
            </label>
            <input
              type="text"
              name="course_type"
              value={formData.course_type}
              onChange={handleInputChange}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box'
              }}
              placeholder="e.g., intro CS, linear algebra"
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Question Type *
            </label>
            <select
              name="question_type"
              value={formData.question_type}
              onChange={handleInputChange}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box'
              }}
            >
              <option value="mcq">Multiple Choice (MCQ)</option>
              <option value="short_answer">Short Answer</option>
              <option value="fr">Free Response</option>
              <option value="true_false">True/False</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Bloom's Taxonomy Level *
            </label>
            <select
              name="blooms_taxonomy"
              value={formData.blooms_taxonomy}
              onChange={handleInputChange}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box'
              }}
            >
              <option value="Remembering">Remembering</option>
              <option value="Understanding">Understanding</option>
              <option value="Applying">Applying</option>
              <option value="Analyzing">Analyzing</option>
              <option value="Evaluating">Evaluating</option>
              <option value="Creating">Creating</option>
            </select>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Image Upload (optional)
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '1rem',
              boxSizing: 'border-box'
            }}
          />
          {imagePreview && (
            <div style={{ marginTop: '0.5rem' }}>
              <img 
                src={imagePreview} 
                alt="Preview" 
                style={{ 
                  maxWidth: '300px', 
                  maxHeight: '200px', 
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }} 
              />
            </div>
          )}
          <small style={{ color: '#666', fontSize: '0.875rem' }}>
            Upload an image to display with the question (max 5MB)
          </small>
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
              fontSize: '1rem',
              boxSizing: 'border-box'
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
              fontSize: '1rem',
              boxSizing: 'border-box'
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
                  fontSize: '1rem',
                  boxSizing: 'border-box'
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
              fontSize: '1rem',
              boxSizing: 'border-box'
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
