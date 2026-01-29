import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css'; // Import KaTeX CSS for LaTeX rendering
import { createQuestion, uploadImage } from '../api';

export default function CreateQuestion() {
  const [formData, setFormData] = useState({
    text: '',
    school: 'UCSB',
    course: '',
    course_type: '',
    question_type: '',
    blooms_taxonomy: '',
    keywords: '',
    tags: '',
    answer_choices: ['', '', '', ''],
    correct_answer: ''
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageInputRef, setImageInputRef] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleTextareaKeyDown = (e) => {
    // Enable Tab key for indentation in markdown editor
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart, selectionEnd, value } = e.target;
      const newValue = value.substring(0, selectionStart) + '  ' + value.substring(selectionEnd);
      
      setFormData(prev => ({
        ...prev,
        text: newValue
      }));
      
      // Set cursor position after the inserted spaces
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = selectionStart + 2;
      }, 0);
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

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        setImageFile(null);
        setImagePreview(null);
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('Image size must be less than 5MB');
        setImageFile(null);
        setImagePreview(null);
        return;
      }
      
      // Clear any previous errors
      setError('');
      setImageFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    // Clear the file input
    if (imageInputRef) {
      imageInputRef.value = '';
    }
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
      let imageUrl = null;
      
      // Upload image first if one is selected
      if (imageFile) {
        try {
          imageUrl = await uploadImage(imageFile);
        } catch (uploadError) {
          setError(`Failed to upload image: ${uploadError.message}`);
          setLoading(false);
          return;
        }
      }
      
      await createQuestion({
        text: formData.text,
        school: formData.school,
        course: formData.course,
        course_type: formData.course_type,
        question_type: formData.question_type,
        blooms_taxonomy: formData.blooms_taxonomy,
        keywords: formData.keywords,
        tags: formData.tags,
        answer_choices: JSON.stringify(validAnswers),
        correct_answer: formData.correct_answer,
        image_url: imageUrl
      });

      setSuccess(true);
      // Reset form
      setFormData({
        text: '',
        school: 'UCSB',
        course: '',
        course_type: '',
        question_type: '',
        blooms_taxonomy: '',
        keywords: '',
        tags: '',
        answer_choices: ['', '', '', ''],
        correct_answer: ''
      });
      setImageFile(null);
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <label style={{ fontWeight: 'bold' }}>
              Question Text * <span style={{ fontSize: '0.875rem', fontWeight: 'normal', color: '#666' }}>(Supports Markdown, LaTeX, and code blocks)</span>
            </label>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              aria-pressed={showPreview}
              aria-label={showPreview ? 'Switch to edit mode' : 'Switch to preview mode'}
              style={{
                padding: '0.5rem 1rem',
                background: showPreview ? '#6c757d' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              {showPreview ? 'Edit' : 'Preview'}
            </button>
          </div>
          <textarea
            name="text"
            value={formData.text}
            onChange={handleInputChange}
            onKeyDown={handleTextareaKeyDown}
            required
            rows={8}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '1rem',
              fontFamily: 'monospace',
              display: showPreview ? 'none' : 'block'
            }}
            placeholder="Enter your question here... Use **bold**, *italic*, `code`, $math$, etc."
          />
          {showPreview && (
            <div style={{
              width: '100%',
              minHeight: '200px',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '1rem',
              background: '#f8f9fa'
            }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  code({node, inline, className, children, ...props}) {
                    return inline ? (
                      <code style={{
                        background: '#e9ecef',
                        padding: '0.2rem 0.4rem',
                        borderRadius: '3px',
                        fontSize: '0.9em'
                      }} {...props}>
                        {children}
                      </code>
                    ) : (
                      <pre style={{
                        background: '#2d2d2d',
                        color: '#f8f8f2',
                        padding: '1rem',
                        borderRadius: '4px',
                        overflow: 'auto'
                      }}>
                        <code className={className} {...props}>
                          {children}
                        </code>
                      </pre>
                    );
                  }
                }}
              >
                {formData.text || '*Preview will appear here...*'}
              </ReactMarkdown>
            </div>
          )}
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            School
          </label>
          <select
            name="school"
            value={formData.school}
            onChange={handleInputChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '1rem'
            }}
          >
            <option value="UCSB">UCSB</option>
          </select>
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
              fontSize: '1rem'
            }}
            placeholder="e.g., intro CS, intermediate CS, linear algebra"
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Question Type
          </label>
          <select
            name="question_type"
            value={formData.question_type}
            onChange={handleInputChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '1rem'
            }}
          >
            <option value="">Select question type</option>
            <option value="mcq">Multiple Choice (MCQ)</option>
            <option value="fr">Free Response (FR)</option>
            <option value="short_answer">Short Answer</option>
            <option value="true_false">True/False</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Bloom's Taxonomy Level
          </label>
          <select
            name="blooms_taxonomy"
            value={formData.blooms_taxonomy}
            onChange={handleInputChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '1rem'
            }}
          >
            <option value="">Select Bloom's level</option>
            <option value="Remembering">Remembering</option>
            <option value="Understanding">Understanding</option>
            <option value="Applying">Applying</option>
            <option value="Analyzing">Analyzing</option>
            <option value="Evaluating">Evaluating</option>
            <option value="Creating">Creating</option>
          </select>
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
          <label htmlFor="image-upload" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Image (optional)
          </label>
          <input
            id="image-upload"
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            ref={(ref) => setImageInputRef(ref)}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '1rem'
            }}
          />
          {imagePreview && (
            <div style={{ marginTop: '1rem', position: 'relative', display: 'inline-block' }}>
              <img 
                src={imagePreview} 
                alt="Preview" 
                style={{ 
                  maxWidth: '300px', 
                  maxHeight: '300px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }} 
              />
              <button
                type="button"
                onClick={removeImage}
                style={{
                  position: 'absolute',
                  top: '0.5rem',
                  right: '0.5rem',
                  padding: '0.5rem',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Remove
              </button>
            </div>
          )}
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
