import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { createQuestion, uploadImage } from '../api';

export default function CreateQuestion() {
  const [formData, setFormData] = useState({
    title: '',
    text: '',
    school: 'UCSB',
    course: '',
    course_type: '',
    question_type: 'mcq',
    blooms_taxonomy: '',
    keywords: '',
    tags: '',
    answer_choices: ['', '', '', ''],
    correct_answer: '',
    is_verified: true,
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageInputRef, setImageInputRef] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [viewMode, setViewMode] = useState('edit');

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
    setFormData(prev => ({ ...prev, [name]: value }));
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
        title: formData.title,
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
        image_url: imageUrl,
        is_verified: true
      });

      setSuccess(true);
      // Reset form
      setFormData({
        title: '',
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

        <form onSubmit={handleSubmit} style={styles.grid}>
          
          {/* Main Column */}
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
                <div style={{ display: 'flex', background: '#f7fafc', padding: '2px', borderRadius: '6px' }}>
                  <button 
                    type="button"
                    onClick={() => setViewMode('edit')}
                    style={{ ...styles.secondaryBtn, padding: '4px 12px', border: 'none', background: viewMode === 'edit' ? 'white' : 'transparent', boxShadow: viewMode === 'edit' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}>
                    Write
                  </button>
                  <button 
                    type="button"
                    onClick={() => setViewMode('preview')}
                    style={{ ...styles.secondaryBtn, padding: '4px 12px', border: 'none', background: viewMode === 'preview' ? 'white' : 'transparent', boxShadow: viewMode === 'preview' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}>
                    Preview
                  </button>
                </div>
              </div>

              {viewMode === 'edit' ? (
                <textarea
                  name="text"
                  value={formData.text}
                  onChange={handleInputChange}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder="Supports Markdown & LaTeX: $E=mc^2$"
                  style={{ ...styles.input, minHeight: '150px', padding: '12px', fontFamily: 'monospace', lineHeight: '1.5' }}
                />
              ) : (
                <div style={{ ...styles.input, minHeight: '150px', padding: '12px', border: '1px solid #edf2f7', borderRadius: '8px', overflow: 'auto' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {formData.text || "*Nothing to preview yet...*"}
                  </ReactMarkdown>
                </div>
              )}
            </div>

            {/* Answer Choices Card */}
            <div style={styles.card}>
              <label style={styles.label}>Answer Choices (Select the correct one)</label>
              {formData.answer_choices.map((choice, index) => (
                <div key={index} style={styles.choiceRow}>
                  <input 
                    type="radio" 
                    name="correct-choice" 
                    style={styles.radio}
                    checked={formData.correct_answer === choice && choice !== ''}
                    onChange={() => setCorrectAnswer(choice)}
                  />
                  <input
                    type="text"
                    value={choice}
                    placeholder={`Option ${index + 1}`}
                    style={styles.input}
                    onChange={(e) => handleAnswerChange(index, e.target.value)}
                  />
                  {formData.answer_choices.length > 2 && (
                    <button type="button" style={{ border: 'none', background: 'none', color: '#e53e3e', cursor: 'pointer' }} onClick={() => {removeAnswerChoice(index)}}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button type="button" style={{ ...styles.secondaryBtn, width: '100%', marginTop: '12px', borderStyle: 'dashed' }} onClick={() => {addAnswerChoice()}}>
                + Add Another Option
              </button>
            </div>
          </div>

          {/* Sidebar Column */}
          <aside>
            <div style={styles.card}>
              <h3 style={{ marginTop: 0, fontSize: '16px', marginBottom: '16px' }}>Question Metadata</h3>
              <div style={styles.sidebarSection}>
                <label style={styles.label}>School</label>
                <select
                  name="school"
                  value={formData.school}
                  onChange={handleInputChange}
                  style={styles.input}
                >
                  <option disabled>Select school</option>
                  <option value="UCB">UCB</option>
                  <option value="UCD">UCD</option>
                  <option value="UCI">UCI</option>
                  <option value="UCLA">UCLA</option>
                  <option value="UCM">UCM</option>
                  <option value="UCR">UCR</option>
                  <option value="UCSB">UCSB</option>
                  <option value="UCSC">UCSC</option>
                  <option value="UCSD">UCSD</option>
                </select>
              </div>

              <div style={styles.sidebarSection}>
                <label style={styles.label}>Course Info</label>
                <input type="text" name="course" placeholder="Name (e.g. CS101)" style={{ ...styles.input, marginBottom: '8px' }} onChange={handleInputChange} />
                <input type="text" name="course_type" placeholder="Type (e.g. Intro to Python)" style={{ ...styles.input, marginBottom: '8px' }} onChange={handleInputChange} />
              </div>

              <div style={styles.sidebarSection}>
                <label style={styles.label}>Question Type</label>
                <select
                  name="question_type"
                  value={formData.question_type}
                  onChange={handleInputChange}
                  style={{...styles.input, marginBottom: '8px'}}
                >
                  <option disabled>Select question type</option>
                  <option value="mcq">Multiple Choice (MCQ)</option>
                  <option value="fr">Free Response (FR)</option>
                  <option value="short_answer">Short Answer</option>
                  <option value="true_false">True/False</option>
                </select>
                <input type="text" name="keywords" value={formData.keywords} placeholder="Keywords (comma separated)" style={styles.input} onChange={handleInputChange} />
              </div>

              <div style={styles.sidebarSection}>
                <label style={styles.label}>Bloom's Taxonomy</label>
                <select name="blooms_taxonomy" style={styles.input} onChange={handleInputChange}>
                  <option value="">Select Bloom's level</option>
                  <option value="Remembering">Remembering</option>
                  <option value="Understanding">Understanding</option>
                  <option value="Applying">Applying</option>
                  <option value="Analyzing">Analyzing</option>
                  <option value="Evaluating">Evaluating</option>
                  <option value="Creating">Creating</option>
                </select>
              </div>

              <div style={styles.sidebarSection}>
                <label style={styles.label}>Tags (comma-separated)</label>
                <input type="text" name="tags" value={formData.tags} placeholder="midterm, important, chapter-3" style={styles.input} onChange={handleInputChange} />
              </div>

              <div>
                <label style={styles.label}>Image (optional)</label>
                <div style={{ border: '2px dashed #cbd5e0', borderRadius: '8px', padding: '20px', textAlign: 'center', cursor: 'pointer' }}>
                  {
                    <input
                      id="image-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      ref={(ref) => setImageInputRef(ref)}
                      style={{
                      }}
                    />}
                      {imagePreview && (
                      <div style={{ marginTop: '1rem', position: 'relative', display: 'inline-block' }}>
                        <img 
                          src={imagePreview} 
                          alt="Preview" 
                          style={{ 
                            maxWidth: '300px', 
                            width: '100%',
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
            </div>
            </div>
          </aside>
        </form>
      </div>
    </div>
  );
}
