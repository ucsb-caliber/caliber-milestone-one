import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { getQuestion, updateQuestion, uploadImage, getImageSignedUrl } from '../api';

export default function EditQuestion() {
  // Get question ID and returnTo from URL hash (e.g., #edit-question?id=123&returnTo=...)
  const getQuestionId = () => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.split('?')[1] || '');
    return params.get('id');
  };

  const getReturnTo = () => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.split('?')[1] || '');
    const returnTo = params.get('returnTo');
    return returnTo ? decodeURIComponent(returnTo) : null;
  };

  const [questionId] = useState(getQuestionId());
  const [returnTo] = useState(getReturnTo());
  const [formData, setFormData] = useState({
    title: '',
    text: '',
    school: '',
    course: '',
    course_type: '',
    question_type: '',
    blooms_taxonomy: '',
    keywords: '',
    tags: '',
    answer_choices: ['', '', '', ''],
    correct_answer: '',
    rubric_parts: [{ part_label: 'Part A', points: 10, rubric_text: '' }],
    short_answer_expected: ''
  });
  const [originalImageUrl, setOriginalImageUrl] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageInputRef, setImageInputRef] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Load existing question data
  useEffect(() => {
    async function loadQuestion() {
      if (!questionId) {
        setError('No question ID provided');
        setLoading(false);
        return;
      }

      try {
        const question = await getQuestion(questionId);
        
        // Parse answer choices
        let answerChoices = [];
        let rubricParts = [{ part_label: 'Part A', points: 10, rubric_text: '' }];
        
        try {
          const parsed = JSON.parse(question.answer_choices || '[]');
          
          // Check if it's rubric parts (array of objects) or answer choices (array of strings)
          if (parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0].part_label !== undefined) {
            // Migrate old format (points, rubric_text) to new format (rubric_levels)
            rubricParts = parsed.map(p => {
              if (p.rubric_levels && p.rubric_levels.length > 0) {
                return p;
              }
              return {
                part_label: p.part_label || 'Part A',
                rubric_levels: [{ points: p.points ?? 10, criteria: p.rubric_text || '' }]
              };
            });
            answerChoices = ['', '', '', ''];
          } else if (question.question_type === 'short_answer' && question.correct_answer && question.correct_answer !== 'rubric') {
            rubricParts = [{
              part_label: 'Part A',
              rubric_levels: [
                { points: 6, criteria: 'correct answer with valid explanation' },
                { points: 3, criteria: 'incorrect answer with understandable explanation' },
                { points: 0, criteria: 'incorrect answer and explanation' }
              ]
            }];
            answerChoices = ['', '', '', ''];
          } else {
            // It's regular answer choices
            answerChoices = parsed;
          }
        } catch (e) {
          answerChoices = [];
        }
        
        // For True/False, always use exactly ['True', 'False']
        if (question.question_type === 'true_false') {
          answerChoices = ['True', 'False'];
        }
        
        // Ensure at least 4 answer choice slots for MCQ (not True/False)
        while (answerChoices.length < 4 && question.question_type !== 'true_false') {
          answerChoices.push('');
        }

        setFormData({
          title: question.title || '',
          text: question.text || '',
          school: question.school || 'UCSB',
          course: question.course || '',
          course_type: question.course_type || '',
          question_type: question.question_type || '',
          blooms_taxonomy: question.blooms_taxonomy || '',
          keywords: question.keywords || '',
          tags: question.tags || '',
          answer_choices: answerChoices,
          correct_answer: question.question_type === 'short_answer' ? '' : (question.correct_answer || ''),
          rubric_parts: rubricParts,
          short_answer_expected: ''
        });

        // Load existing image if present
        if (question.image_url) {
          setOriginalImageUrl(question.image_url);
          try {
            const signedUrl = await getImageSignedUrl(question.image_url);
            if (signedUrl) {
              setImagePreview(signedUrl);
            }
          } catch (imgError) {
            console.error('Failed to load image preview:', imgError);
          }
        }
      } catch (err) {
        setError(err.message || 'Failed to load question');
      } finally {
        setLoading(false);
      }
    }

    loadQuestion();
  }, [questionId]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      // When switching to True/False, lock answer choices to True and False only
      if (name === 'question_type' && value === 'true_false') {
        next.answer_choices = ['True', 'False'];
        next.correct_answer = '';
      }
      return next;
    });
  };

  const handleTextareaKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart, selectionEnd, value } = e.target;
      const newValue = value.substring(0, selectionStart) + '  ' + value.substring(selectionEnd);
      
      setFormData(prev => ({
        ...prev,
        text: newValue
      }));
      
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

  // Part = sub-question. Rubric = grading levels for that part.
  const addPart = () => {
    const nextLabel = `Part ${String.fromCharCode(65 + formData.rubric_parts.length)}`;
    setFormData(prev => ({
      ...prev,
      rubric_parts: [...prev.rubric_parts, { 
        part_label: nextLabel, 
        rubric_levels: [{ points: 6, criteria: '' }, { points: 3, criteria: '' }, { points: 0, criteria: '' }] 
      }]
    }));
  };

  const removePart = (index) => {
    if (formData.rubric_parts.length <= 1) {
      setError('Must have at least 1 part');
      return;
    }
    const newParts = formData.rubric_parts.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, rubric_parts: newParts }));
  };

  const updatePartLabel = (partIndex, value) => {
    const newParts = [...formData.rubric_parts];
    newParts[partIndex] = { ...newParts[partIndex], part_label: value };
    setFormData(prev => ({ ...prev, rubric_parts: newParts }));
  };

  const addRubricLevel = (partIndex) => {
    const newParts = [...formData.rubric_parts];
    const part = newParts[partIndex];
    const levels = part.rubric_levels || [];
    newParts[partIndex] = { ...part, rubric_levels: [...levels, { points: 0, criteria: '' }] };
    setFormData(prev => ({ ...prev, rubric_parts: newParts }));
  };

  const removeRubricLevel = (partIndex, levelIndex) => {
    const newParts = [...formData.rubric_parts];
    const levels = (newParts[partIndex].rubric_levels || []).filter((_, i) => i !== levelIndex);
    if (levels.length < 1) return;
    newParts[partIndex] = { ...newParts[partIndex], rubric_levels: levels };
    setFormData(prev => ({ ...prev, rubric_parts: newParts }));
  };

  const updateRubricLevel = (partIndex, levelIndex, field, value) => {
    const newParts = [...formData.rubric_parts];
    const levels = [...(newParts[partIndex].rubric_levels || [])];
    levels[levelIndex] = { ...levels[levelIndex], [field]: field === 'points' ? (parseInt(value) || 0) : value };
    newParts[partIndex] = { ...newParts[partIndex], rubric_levels: levels };
    setFormData(prev => ({ ...prev, rubric_parts: newParts }));
  };

  const getPartTotalPoints = (part) => {
    const levels = part.rubric_levels || [];
    return levels.length > 0 ? Math.max(...levels.map(l => parseInt(l.points) || 0)) : 0;
  };

  // Check if question type needs answer choices
  const needsAnswerChoices = () => {
    return ['mcq', 'true_false'].includes(formData.question_type);
  };

  // Check if question type is True/False (locked to exactly True/False)
  const isTrueFalse = () => {
    return formData.question_type === 'true_false';
  };

  // Check if question type is free response
  const isFreeResponse = () => {
    return formData.question_type === 'fr';
  };

  // Check if question type is short answer
  const isShortAnswer = () => {
    return formData.question_type === 'short_answer';
  };

  // Check if question type needs rubric (both FR and Short Answer)
  const needsRubric = () => {
    return formData.question_type === 'fr' || formData.question_type === 'short_answer';
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        setImageFile(null);
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) {
        setError('Image size must be less than 5MB');
        setImageFile(null);
        return;
      }
      
      setError('');
      setImageFile(file);
      
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
    setOriginalImageUrl(null);
    if (imageInputRef) {
      imageInputRef.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);

    // Validation
    if (!formData.title.trim()) {
      setError('Question title is required');
      setSaving(false);
      return;
    }

    if (!formData.text.trim()) {
      setError('Question text is required');
      setSaving(false);
      return;
    }

    // Type-specific validation
    if (needsAnswerChoices()) {
      const validAnswers = formData.answer_choices.filter(a => a.trim());
      if (validAnswers.length < 2) {
        setError('Must have at least 2 answer choices');
        setSaving(false);
        return;
      }

      if (!formData.correct_answer.trim()) {
        setError('Correct answer is required');
        setSaving(false);
        return;
      }

      if (!formData.answer_choices.some(choice => choice.trim() === formData.correct_answer)) {
        setError('Correct answer must be one of the answer choices');
        setSaving(false);
        return;
      }
    }

    if (needsRubric()) {
      const validParts = formData.rubric_parts.filter(p => {
        const levels = p.rubric_levels || [];
        return levels.some(l => (l.criteria && l.criteria.trim()) || (parseInt(l.points) || 0) > 0);
      });
      if (validParts.length === 0) {
        setError('Each part needs at least one rubric level with points or criteria');
        setSaving(false);
        return;
      }
    }

    try {
      let imageUrl = originalImageUrl;
      
      // Upload new image if one was selected
      if (imageFile) {
        try {
          imageUrl = await uploadImage(imageFile);
        } catch (uploadError) {
          setError(`Failed to upload image: ${uploadError.message}`);
          setSaving(false);
          return;
        }
      }

      // Prepare answer choices based on question type
      let answerChoicesData = '[]';
      let correctAnswerData = '';
      
      if (needsAnswerChoices()) {
        const validAnswers = isTrueFalse() ? ['True', 'False'] : formData.answer_choices.filter(a => a.trim());
        answerChoicesData = JSON.stringify(validAnswers);
        correctAnswerData = formData.correct_answer;
      } else if (needsRubric()) {
        answerChoicesData = JSON.stringify(formData.rubric_parts);
        correctAnswerData = 'rubric';
      }

      await updateQuestion(questionId, {
        title: formData.title,
        text: formData.text,
        school: formData.school,
        course: formData.course,
        course_type: formData.course_type,
        question_type: formData.question_type,
        blooms_taxonomy: formData.blooms_taxonomy,
        keywords: formData.keywords,
        tags: formData.tags,
        answer_choices: answerChoicesData,
        correct_answer: correctAnswerData,
        image_url: imageUrl
      });

      setSuccess(true);
      
      // Redirect to return URL or question bank after a brief delay
      setTimeout(() => {
        window.location.hash = returnTo || 'questions';
      }, 1500);
    } catch (err) {
      setError(err.message || 'Failed to update question');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', textAlign: 'center' }}>
        <p>Loading question...</p>
      </div>
    );
  }

  if (!questionId) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{
          padding: '1rem',
          background: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '4px',
          color: '#721c24',
          marginBottom: '1rem'
        }}>
          No question ID provided. Please select a question to edit from the Question Bank.
        </div>
        <a href="#questions" style={{ color: '#007bff', textDecoration: 'none' }}>
          ← Back to Question Bank
        </a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2>Edit Question</h2>
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
          Question updated successfully! Redirecting to question bank...
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Question Title *
          </label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '1rem'
            }}
            placeholder="e.g. Invert a Linked List, Analyze Time Complexity, etc."
          />
        </div>

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

        {/* Answer Choices - for MCQ and True/False */}
        {needsAnswerChoices() && (
          <>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                {isTrueFalse() ? 'Select the correct answer' : 'Answer Choices *'}
              </label>
              {isTrueFalse() ? (
                /* True/False: locked to exactly True and False, no add/remove */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {['True', 'False'].map((choice) => (
                    <div key={choice} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="radio"
                        name="correct-choice"
                        checked={formData.correct_answer === choice}
                        onChange={() => setFormData(prev => ({ ...prev, correct_answer: choice }))}
                        style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                      />
                      <span style={{ flex: 1, padding: '0.75rem', fontSize: '1rem' }}>{choice}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
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
              )}
            </div>

            {!isTrueFalse() && (
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
            )}
          </>
        )}

        {/* Parts & Rubric - for Free Response and Short Answer */}
        {needsRubric() && (
          <div>
            <div style={{ 
              padding: '0.75rem 1rem', 
              background: '#eff6ff', 
              border: '1px solid #bfdbfe', 
              borderRadius: '6px', 
              marginBottom: '1rem' 
            }}>
              <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e40af', marginBottom: '0.25rem' }}>
                📋 Parts vs Rubric
              </div>
              <div style={{ fontSize: '0.8rem', color: '#1e3a8a' }}>
                <strong>Parts</strong> = Sub-questions (Part A, Part B). <strong>Rubric</strong> = Grading levels for each part (+6, +3, +0).
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <label style={{ fontWeight: 'bold' }}>Question Parts</label>
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                Total: {formData.rubric_parts.reduce((sum, p) => sum + getPartTotalPoints(p), 0)} points
              </span>
            </div>
            
            {formData.rubric_parts.map((part, partIndex) => {
              const levels = part.rubric_levels || [];
              return (
                <div key={partIndex} style={{ 
                  background: '#f8fafc', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '8px', 
                  padding: '1rem', 
                  marginBottom: '1rem' 
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <input
                      type="text"
                      value={part.part_label}
                      onChange={(e) => updatePartLabel(partIndex, e.target.value)}
                      style={{ width: '120px', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', fontWeight: '600' }}
                      placeholder="Part A"
                    />
                    {formData.rubric_parts.length > 1 && (
                      <button type="button" onClick={() => removePart(partIndex)} style={{ padding: '0.5rem 0.75rem', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.875rem' }}>
                        Remove Part
                      </button>
                    )}
                  </div>
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569', marginBottom: '0.5rem' }}>
                      Rubric for {part.part_label || `Part ${partIndex + 1}`}:
                    </div>
                    {levels.map((level, levelIndex) => (
                      <div key={levelIndex} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem' }}>+</span>
                        <input type="number" value={level.points} onChange={(e) => updateRubricLevel(partIndex, levelIndex, 'points', e.target.value)} style={{ width: '50px', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', textAlign: 'center' }} min="0" />
                        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>pts</span>
                        <input type="text" value={level.criteria || ''} onChange={(e) => updateRubricLevel(partIndex, levelIndex, 'criteria', e.target.value)} placeholder="e.g., correct answer with valid explanation" style={{ flex: 1, padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }} />
                        {levels.length > 1 && (
                          <button type="button" onClick={() => removeRubricLevel(partIndex, levelIndex)} style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}>✕</button>
                        )}
                      </div>
                    ))}
                    <button type="button" onClick={() => addRubricLevel(partIndex)} style={{ padding: '0.4rem 0.75rem', background: '#e2e8f0', color: '#475569', border: '1px dashed #94a3b8', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                      + Add rubric level
                    </button>
                  </div>
                </div>
              );
            })}
            
            <button type="button" onClick={addPart} style={{ padding: '0.5rem 1rem', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              + Add Another Part
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '0.75rem 2rem',
              background: saving ? '#6c757d' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold'
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => window.location.hash = returnTo || 'questions'}
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
