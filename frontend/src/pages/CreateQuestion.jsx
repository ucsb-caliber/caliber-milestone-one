import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { createQuestion, uploadImage, getUserInfo } from '../api';
import { useAuth } from '../AuthContext';
import StudentPreview from '../components/StudentPreview';

export default function CreateQuestion() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    title: '',
    text: '',
    school: '',
    course: '',
    course_type: '',
    question_type: 'mcq',
    blooms_taxonomy: '',
    keywords: '',
    tags: '',
    answer_choices: ['', '', '', ''],
    correct_answer: '',
    is_verified: true,
    rubric_parts: [{ part_label: 'Part A', rubric_levels: [{ points: 6, criteria: '' }, { points: 3, criteria: '' }, { points: 0, criteria: '' }] }],
    short_answer_expected: '',
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageInputRef, setImageInputRef] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [viewMode, setViewMode] = useState('edit');//edit preview and split 
  const [profileSchool, setProfileSchool] = useState('');

  // Auto-save to LocalStorage whenever formData changes
  useEffect(() => {
    if (formData.title || formData.text) {
      localStorage.setItem('question_draft', JSON.stringify(formData));
    }
  }, [formData]);

  // Load draft on initial component mount
  useEffect(() => {
    const savedDraft = localStorage.getItem('question_draft');
    if (!savedDraft) return;
    try {
      const parsedDraft = JSON.parse(savedDraft);
      if (window.confirm('Found an unsaved draft. Would you like to restore it?')) {
        setFormData(parsedDraft);
      } else {
        localStorage.removeItem('question_draft');
      }
    } catch (e) {
      localStorage.removeItem('question_draft');
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadUserSchool() {
      if (!user) return;
      try {
        const info = await getUserInfo();
        if (active) {
          setProfileSchool((info?.school_name || '').trim());
        }
      } catch (e) {
        if (active) {
          setProfileSchool('');
        }
      }
    }
    loadUserSchool();
    return () => { active = false; };
  }, [user]);

  const resolvedUserSchool = (profileSchool || user?.user_metadata?.school_name || '').trim();

  useEffect(() => {
    if (!resolvedUserSchool) return;
    setFormData((prev) => {
      if ((prev.school || '').trim()) return prev;
      return { ...prev, school: resolvedUserSchool };
    });
  }, [resolvedUserSchool]);

  const styles = {
    container: {
      backgroundColor: '#f4f7f9',
      minHeight: '75vh',
      borderRadius: '1rem',
      padding: '40px 20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    },
    wrapper: { maxWidth: '1200px', margin: '0 auto' },
    header: { marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
    grid: { display: 'grid', gridTemplateColumns: '1fr 350px', gap: '24px', alignItems: 'start' },
    card: {
      background: 'white',
      borderRadius: '12px',
      padding: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      marginBottom: '16px',
      border: '1px solid #e1e4e8'
    },
    label: { display: 'block', fontSize: '14px', fontWeight: '600', color: '#4a5568', marginBottom: '8px' },
    input: {
      width: '100%',
      padding: '12px',
      borderRadius: '8px',
      border: '1px solid #cbd5e0',
      fontSize: '16px',
      boxSizing: 'border-box',
      outline: 'none',
      transition: 'border-color 0.2s'
    },
    errorBanner: {
      padding: '16px',
      backgroundColor: '#fff5f5',
      border: '1px solid #feb2b2',
      borderRadius: '8px',
      color: '#c53030',
      marginBottom: '24px',
      fontSize: '14px',
      fontWeight: '500'
    },
    successBanner: {
      padding: '16px',
      backgroundColor: '#f0fff4',
      border: '1px solid #9ae6b4',
      borderRadius: '8px',
      color: '#276749',
      marginBottom: '24px',
      fontSize: '14px',
      fontWeight: '500'
    },
    sidebarSection: { marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #edf2f7' },
    primaryBtn: {
      backgroundColor: '#0066ff',
      color: 'white',
      padding: '12px 24px',
      borderRadius: '8px',
      border: 'none',
      fontWeight: 'bold',
      cursor: 'pointer',
      transition: 'background 0.2s'
    },
    secondaryBtn: {
      backgroundColor: 'white',
      color: '#4a5568',
      padding: '12px 24px',
      borderRadius: '8px',
      border: '1px solid #cbd5e0',
      fontWeight: 'bold',
      cursor: 'pointer'
    },
    choiceRow: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' },
    radio: { width: '20px', height: '20px', cursor: 'pointer' },
    badge: {
      fontSize: '11px',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      backgroundColor: '#ebf4ff',
      color: '#0066ff',
      padding: '4px 8px',
      borderRadius: '4px',
      marginBottom: '8px',
      display: 'inline-block'
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      // When switching to True/False, lock answer choices to True and False only
      if (name === 'question_type' && value === 'true_false') {
        next.answer_choices = ['True', 'False'];
        next.correct_answer = '';
      }
      // When switching to Short Answer, collapse to single part (no multiple parts for short answer)
      if (name === 'question_type' && value === 'short_answer') {
        const firstPart = next.rubric_parts?.[0] || { part_label: 'Part A', rubric_levels: [{ points: 6, criteria: '' }, { points: 3, criteria: '' }, { points: 0, criteria: '' }] };
        next.rubric_parts = [firstPart];
      }
      return next;
    });
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
    setFormData(prev => ({ ...prev, answer_choices: newAnswers }));
  };

  const setCorrectAnswer = (value) => {
    setFormData(prev => ({ ...prev, correct_answer: value }));
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

  // Part = sub-question/section. Rubric = grading levels for that part.
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
    if (!formData.title.trim()) {
      setError('Question title is required');
      setLoading(false);
      return;
    }

    if (!formData.text.trim()) {
      setError('Question text is required');
      setLoading(false);
      return;
    }

    // Type-specific validation
    if (needsAnswerChoices()) {
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
    }

    if (needsRubric()) {
      const validParts = formData.rubric_parts.filter(p => {
        const levels = p.rubric_levels || [];
        return levels.some(l => (l.criteria && l.criteria.trim()) || (parseInt(l.points) || 0) > 0);
      });
      if (validParts.length === 0) {
        setError('Each part needs at least one rubric level with points or criteria');
        setLoading(false);
        return;
      }
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

      // Prepare answer choices based on question type
      let answerChoicesData = '[]';
      let correctAnswerData = '';

      if (needsAnswerChoices()) {
        const validAnswers = isTrueFalse() ? ['True', 'False'] : formData.answer_choices.filter(a => a.trim());
        answerChoicesData = JSON.stringify(validAnswers);
        correctAnswerData = formData.correct_answer;
      } else if (needsRubric()) {
        // Store rubric parts for both free response and short answer
        answerChoicesData = JSON.stringify(formData.rubric_parts);
        correctAnswerData = 'rubric';
      }

      await createQuestion({
        title: formData.title,
        text: formData.text,
        school: formData.school,
        user_school: resolvedUserSchool || 'Unknown University',
        course: formData.course,
        course_type: formData.course_type,
        question_type: formData.question_type,
        blooms_taxonomy: formData.blooms_taxonomy,
        keywords: formData.keywords,
        tags: formData.tags,
        answer_choices: answerChoicesData,
        correct_answer: correctAnswerData,
        image_url: imageUrl,
        is_verified: true
      });

      localStorage.removeItem('question_draft'); // Clear the draft after successful publish

      setSuccess(true);
      // Reset form
      setFormData({
        title: '',
        text: '',
        school: resolvedUserSchool || '',
        course: '',
        course_type: '',
        question_type: 'mcq',
        blooms_taxonomy: '',
        keywords: '',
        tags: '',
        answer_choices: ['', '', '', ''],
        correct_answer: '',
        rubric_parts: [{ part_label: 'Part A', rubric_levels: [{ points: 6, criteria: '' }, { points: 3, criteria: '' }, { points: 0, criteria: '' }] }],
        short_answer_expected: ''
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

  const renderMetadataCard = () => (
    <div style={styles.card}>
      <h3 style={{
        marginTop: 0,
        fontSize: '16px',
        marginBottom: '16px'
      }}>Question Metadata</h3>
      <div style={styles.sidebarSection}>
        <label style={styles.label}>School</label>
        <input type="text" name="school" value={formData.school} onChange={handleInputChange} style={styles.input} />
      </div>
      <div style={styles.sidebarSection}>
        <label style={styles.label}>Course Info</label>
        <input type="text" name="course" value={formData.course} placeholder="Name" style={{ ...styles.input, marginBottom: '8px' }} onChange={handleInputChange} />
        <input type="text" name="course_type" value={formData.course_type} placeholder="Type" style={{ ...styles.input, marginBottom: '8px' }} onChange={handleInputChange} />
      </div>
      <div style={styles.sidebarSection}>
        <label style={styles.label}>Question Type</label>
        <select name="question_type" value={formData.question_type} onChange={handleInputChange} style={{ ...styles.input, marginBottom: '8px' }}>
          <option value="mcq">Multiple Choice (MCQ)</option>
          <option value="fr">Free Response (FR)</option>
          <option value="short_answer">Short Answer</option>
          <option value="true_false">True/False</option>
        </select>
        <input type="text" name="keywords" value={formData.keywords} placeholder="Keywords" style={styles.input} onChange={handleInputChange} />
      </div>
      <div style={styles.sidebarSection}>
        <label style={styles.label}>Bloom's Taxonomy</label>
        <select name="blooms_taxonomy" value={formData.blooms_taxonomy} style={styles.input} onChange={handleInputChange}>
          <option value="">Select Level</option>
          <option value="Remembering">Remembering</option>
          <option value="Understanding">Understanding</option>
          <option value="Applying">Applying</option>
          <option value="Analyzing">Analyzing</option>
          <option value="Evaluating">Evaluating</option>
          <option value="Creating">Creating</option>
        </select>
      </div>
      <div style={styles.sidebarSection}>
        <label style={styles.label}>Tags</label>
        <input type="text" name="tags" value={formData.tags} placeholder="midterm, chapter-1" style={styles.input} onChange={handleInputChange} />
      </div>
      <div>
        <label style={styles.label}>Image (optional)</label>
        <div style={{
          border: '2px dashed #cbd5e0',
          borderRadius: '8px',
          padding: '20px',
          textAlign: 'center',
          cursor: 'pointer'
        }}>
          <input type="file" accept="image/*" onChange={handleImageChange} ref={setImageInputRef} />
          {imagePreview && (
            <div style={{
              marginTop: '1rem',
              position: 'relative'
            }}>
              <img src={imagePreview} alt="Preview" style={{ maxWidth: '100%', borderRadius: '4px' }} />
              <button type="button" onClick={removeImage} style={{ position: 'absolute', top: '5px', right: '5px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>✕</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.wrapper}>

        {/* Header */}
        <header style={styles.header}>
          <div>
            <h1 style={{ margin: 0, fontSize: '28px', color: '#1a202c' }}>Create New Question</h1>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" style={styles.secondaryBtn} onClick={() => window.location.hash = 'questions'}>Cancel</button>
            <button type="submit" onClick={handleSubmit} style={styles.primaryBtn} disabled={loading}>
              {loading ? 'Saving...' : 'Publish Question'}
            </button>
          </div>
        </header>

        {/* Validation Message */}
        {error && <div style={styles.errorBanner}>⚠️ {error}</div>}

        <form onSubmit={handleSubmit} style={{
          display: 'grid',
          // Dynamically adjust grid: 1:1 for Split View, 1:Sidebar for others
          gridTemplateColumns: viewMode === 'split' ? '1fr 1fr' : '1fr 350px',
          gap: '24px',
          alignItems: 'start'
        }}>

          {/* Main Column (Left Side) */}
          <div style={{ width: '100%' }}>

            {/* Title Card */}
            <div style={styles.card}>
              <label style={styles.label}>Question Title</label>
              <input
                type="text"
                name="title"
                placeholder="e.g., Analysis of Merge Sort"
                style={{ ...styles.input, fontSize: '20px', fontWeight: '500', border: 'none', borderBottom: '2px solid #edf2f7', borderRadius: 0, padding: '8px 0' }}
                value={formData.title}
                onChange={handleInputChange}
              />
            </div>

            {/* Editor Card */}
            <div style={styles.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <label style={styles.label}>Question Body</label>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ display: 'flex', background: '#f7fafc', padding: '2px', borderRadius: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setViewMode('edit')}
                      style={{ ...
                        styles.secondaryBtn, 
                        padding: '4px 12px', 
                        border: 'none', 
                        background: viewMode === 'edit' ? 'white' : 'transparent', 
                        boxShadow: viewMode === 'edit' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
                       }}>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('preview')}
                      style={{ ...
                        styles.secondaryBtn, 
                        padding: '4px 12px',
                        border: 'none', 
                        background: viewMode === 'preview' ? 'white' : 'transparent', 
                        boxShadow: viewMode === 'preview' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' 
                        }}>
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('split')}
                      style={{ ...
                      styles.secondaryBtn, 
                      padding: '4px 12px', 
                      border: 'none', 
                      background: viewMode === 'split' ? 'white' : 'transparent', 
                      boxShadow: viewMode === 'split' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' 
                      }}>
                      Student View
                    </button>
                  </div>
                </div>
              </div>

              {viewMode === 'preview' ? (
                <div style={{ ...
                styles.input, 
                minHeight: '300px', 
                padding: '12px', 
                border: '1px solid #edf2f7', 
                borderRadius: '8px', 
                overflow: 'auto' }}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      code({ node, inline, className, children, ...props }) {
                        return inline ? (
                          <code style={{ 
                            background: '#e9ecef', 
                            padding: '0.2rem 0.4rem', 
                            borderRadius: '3px', 
                            fontSize: '0.9em', 
                            fontFamily: 'monospace' 
                          }} 
                            {...props}>{children}</code>
                        ) : (
                          <pre style={{ 
                            background: '#2d2d2d', 
                            color: '#f8f8f2', 
                            padding: '1rem', 
                            borderRadius: '4px',
                             overflow: 'auto', 
                             fontSize: '0.875rem' 
                            }}>
                            <code className={className} {...props}>{children}</code>
                          </pre>
                        );
                      },
                      p({ children }) { return <p 
                        style={{ 
                          margin: '0 0 0.5rem 0', 
                          fontSize: '1rem', 
                          lineHeight: '1.5'
                         }}>
                          {children}</p>; }
                    }}
                  >
                    {formData.text || "*Nothing to preview yet...*"}
                  </ReactMarkdown>
                </div>
              ) : (
                <textarea
                  name="text"
                  value={formData.text}
                  onChange={handleInputChange}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder="Supports Markdown & LaTeX: $E=mc^2$"
                  style={{ ...
                    styles.input, 
                    minHeight: '300px', 
                    padding: '12px', 
                    fontFamily: 'monospace', 
                    lineHeight: '1.5' 
                  }}
                />
              )}
            </div>

            {/* Answer Section */}
            {needsAnswerChoices() && (
              <div style={styles.card}>
                <label style={styles.label}>
                  {isTrueFalse() ? 'Select the correct answer' : 'Answer Choices (Select the correct one)'}
                </label>
                {isTrueFalse() ? (
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '12px' 
                    }}>
                    {['True', 'False'].map((choice) => (
                      <div key={choice} style={styles.choiceRow}>
                        <input type="radio" name="correct-choice" style={styles.radio} checked={formData.correct_answer === choice} onChange={() => setCorrectAnswer(choice)} />
                        <span style={{ 
                          flex: 1, 
                          padding: '12px', 
                          fontSize: '16px', 
                          color: '#1a202c' 
                          }}>{choice}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {formData.answer_choices.map((choice, index) => (
                      <div key={index} style={styles.choiceRow}>
                        <input type="radio" name="correct-choice" style={styles.radio} checked={formData.correct_answer === choice && choice !== ''} onChange={() => setCorrectAnswer(choice)} />
                        <input type="text" value={choice} placeholder={`Option ${index + 1}`} style={styles.input} onChange={(e) => handleAnswerChange(index, e.target.value)} />
                        {formData.answer_choices.length > 2 && (
                          <button type="button" style={{ 
                            border: 'none', 
                            background: 'none', 
                            color: '#e53e3e', 
                            cursor: 'pointer' 
                          }} onClick={() => removeAnswerChoice(index)}>✕</button>
                        )}
                      </div>
                    ))}
                    <button type="button" style={{ ...
                      styles.secondaryBtn,
                      width: '100%', 
                      marginTop: '12px', 
                      borderStyle: 'dashed' 
                      }} onClick={addAnswerChoice}>+ Add Another Option</button>
                  </>
                )}
              </div>
            )}

            {/* Rubric Builder */}
            {needsRubric() && (
              <div style={styles.card}>
                {isFreeResponse() && (
                  <div style={{
                    padding: '12px 16px', 
                    background: '#eff6ff',
                     border: '1px solid #bfdbfe', 
                     borderRadius: '8px', 
                     marginBottom: '20px' 
                     }}>
                    <div style={{ 
                      fontSize: '14px', 
                      fontWeight: '600', 
                      color: '#1e40af', 
                      marginBottom: '6px' 
                      }}>
                        📋 Parts vs Rubric</div>
                    <ul style={{ 
                      margin: 0, 
                      paddingLeft: '20px', 
                      fontSize: '13px', 
                      color: '#1e3a8a', 
                      lineHeight: 1.6 
                      }}>
                      <li><strong>Parts</strong> = Sub-questions.</li>
                      <li><strong>Rubric</strong> = Grading criteria per part.</li>
                    </ul>
                  </div>
                )}

                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  marginBottom: '16px' 
                  }}>
                  <label style={styles.label}>{isFreeResponse() ? 'Question Parts' : 'Grading Rubric'}</label>
                  <span style={{ 
                    fontSize: '14px', 
                    color: '#6b7280' 
                    }}>Total: {formData.rubric_parts.reduce((sum, p) => sum + getPartTotalPoints(p), 0)} points</span>
                </div>

                {formData.rubric_parts.map((part, partIndex) => (
                  <div key={partIndex} style={{ 
                    background: '#f8fafc', 
                    border: '1px solid #e2e8f0', 
                    borderRadius: '8px', 
                    padding: '16px', 
                    marginBottom: '16px' 
                    }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      marginBottom: '12px' 
                      }}>
                      {isFreeResponse() ? (
                        <input type="text" value={part.part_label} onChange={(e) => updatePartLabel(partIndex, e.target.value)} style={{ ...styles.input, width: '140px', fontWeight: '600', background: 'white' }} placeholder="Part A" />
                      ) : (
                        <span style={{ fontWeight: '600', color: '#374151' }}>Grading levels</span>
                      )}
                      {isFreeResponse() && formData.rubric_parts.length > 1 && (
                        <button type="button" style={{ 
                          border: 'none', 
                          background: '#fee2e2', 
                          color: '#dc2626', 
                          cursor: 'pointer', 
                          padding: '6px 12px', 
                          borderRadius: '6px', 
                          fontSize: '13px' 
                        }} onClick={() => removePart(partIndex)}>Remove Part</button>
                      )}
                    </div>

                    <div style={{ 
                      marginTop: '12px', 
                      paddingTop: '12px', 
                      borderTop: '1px solid #e2e8f0' 
                      }}>
                      {part.rubric_levels.map((level, levelIndex) => (
                        <div key={levelIndex} style={{ 
                          display: 'flex', 
                          alignItems: 'flex-start', 
                          gap: '12px', 
                          marginBottom: '10px', 
                          background: 'white', 
                          padding: '10px 12px', 
                          borderRadius: '6px', 
                          border: '1px solid #e2e8f0' 
                          }}>
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px', 
                            flexShrink: 0 
                            }}>
                            <span style={{ fontWeight: '600' }}>+</span>
                            <input type="number" value={level.points} onChange={(e) => updateRubricLevel(partIndex, levelIndex, 'points', e.target.value)} style={{ ...styles.input, width: '56px', textAlign: 'center' }} min="0" />
                            <span style={{ fontSize: '13px' }}>pts</span>
                          </div>
                          <input type="text" value={level.criteria} onChange={(e) => updateRubricLevel(partIndex, levelIndex, 'criteria', e.target.value)} placeholder="Criteria..." style={{ ...styles.input, flex: 1 }} />
                          {part.rubric_levels.length > 1 && (
                            <button type="button" style={{ 
                              border: 'none', 
                              background: 'none', 
                              color: '#94a3b8', 
                              cursor: 'pointer'
                            }} onClick={() => removeRubricLevel(partIndex, levelIndex)}>✕</button>
                          )}
                        </div>
                      ))}
                      <button type="button" style={{ ...
                        styles.secondaryBtn, 
                        padding: '8px 14px',
                        fontSize: '13px', 
                        borderStyle: 'dashed' 
                        }} onClick={() => addRubricLevel(partIndex)}>+ Add level</button>
                    </div>
                  </div>
                ))}

                {isFreeResponse() && (
                  <button type="button" style={{ ...
                  styles.secondaryBtn,
                  width: '100%', 
                  borderStyle: 'dashed', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '8px'
                  }} onClick={addPart}>
                    <span style={{ fontSize: '18px' }}>+</span> Add Another Part
                  </button>
                )}
              </div>
            )}

            {viewMode === 'split' && renderMetadataCard()}
          </div>

          {/* Sidebar / Split View (Right Column) */}
          <aside style={{ 
            position: 'sticky',
            top: '20px' }}>
            {viewMode === 'split' ? (
              /* --- SPLIT VIEW PREVIEW --- */
              <div style={styles.card}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'center', 
                  marginBottom: '16px' 
                  }}>
                  <h3 style={{ 
                    margin: 0, 
                    fontSize: '14px', 
                    color: '#64748b', 
                    textTransform: 'uppercase' 
                    }}>Student View</h3>
                </div>
                <div style={{ 
                  border: '1px solid #edf2f7', 
                  borderRadius: '8px', 
                  background: '#f8fafc', 
                  overflow: 'hidden' 
                  }}>
                  <StudentPreview
                    inline={true}
                    isPreviewMode={false}
                    forceReadOnly={true}
                    showStatusBanner={false}
                    showPrevNextButtons={false}
                    assignmentTitle={formData.title || "Untitled Question"}
                    questions={[{
                      id: 'live-preview',
                      title: formData.title,
                      text: formData.text,
                      question_type: formData.question_type,
                      answer_choices: (formData.question_type === 'mcq' || formData.question_type === 'true_false')
                        ? JSON.stringify(formData.answer_choices)
                        : JSON.stringify(formData.rubric_parts),
                      correct_answer: formData.correct_answer
                    }]}
                  />
                </div>
              </div>
            ) : renderMetadataCard()}
          </aside>
        </form>
      </div>
    </div>
  );
}
