import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { getImageSignedUrl } from '../api';

/**
 * StudentPreview - A reusable component to display an assignment as students would see it
 * 
 * This component can be used for:
 * 1. Instructor preview mode (to see what students will see)
 * 2. Actual student assignment view (when building student-facing features)
 * 
 * Props:
 * - questions: Array of question objects to display
 * - assignmentTitle: Title of the assignment
 * - assignmentType: Type of assignment (Quiz, Homework, etc.)
 * - onClose: Callback when preview is closed (for modal mode)
 * - isPreviewMode: Whether this is a preview (shows "Preview Mode" banner)
 * - showCorrectAnswers: Whether to show correct answers after selection (default: false for students, true for instructors in review)
 */
export default function StudentPreview({
  questions = [],
  assignmentTitle = 'Assignment',
  assignmentType = 'Assignment',
  onClose,
  isPreviewMode = true,
  showCorrectAnswers = false,
  closeButtonText = 'Back to Course',
  initialAnswers,
  initialQuestionIndex,
  initialSubmitted,
  onAnswersChange,
  onQuestionChange
}) {
  const [currentIndex, setCurrentIndex] = useState(Number.isInteger(initialQuestionIndex) ? initialQuestionIndex : 0);
  const [answers, setAnswers] = useState(initialAnswers || {});
  const [submitted, setSubmitted] = useState(Boolean(initialSubmitted));
  const [imageUrls, setImageUrls] = useState({});

  useEffect(() => {
    if (initialAnswers === undefined) return;
    setAnswers(initialAnswers || {});
  }, [initialAnswers]);

  useEffect(() => {
    if (!Number.isInteger(initialQuestionIndex)) return;
    const maxIndex = Math.max(0, questions.length - 1);
    const nextIndex = Math.max(0, Math.min(initialQuestionIndex || 0, maxIndex));
    setCurrentIndex(nextIndex);
  }, [initialQuestionIndex, questions.length]);

  useEffect(() => {
    if (initialSubmitted === undefined) return;
    setSubmitted(Boolean(initialSubmitted));
  }, [initialSubmitted]);

  // Load signed URLs for images
  useEffect(() => {
    async function loadImageUrls() {
      const urls = {};
      for (const question of questions) {
        if (question.image_url) {
          const signedUrl = await getImageSignedUrl(question.image_url);
          if (signedUrl) {
            urls[question.id] = signedUrl;
          }
        }
      }
      setImageUrls(urls);
    }
    loadImageUrls();
  }, [questions]);

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const progress = totalQuestions > 0 ? ((currentIndex + 1) / totalQuestions) * 100 : 0;

  // Parse answer choices
  const getAnswerChoices = (question) => {
    try {
      return JSON.parse(question.answer_choices || '[]');
    } catch (e) {
      return [];
    }
  };

  const handleAnswerSelect = (questionId, answer) => {
    if (submitted) return;
    setAnswers(prev => {
      const next = {
        ...prev,
        [questionId]: answer
      };
      if (onAnswersChange) onAnswersChange(next);
      return next;
    });
  };

  const handleTextAnswer = (questionId, text) => {
    if (submitted) return;
    setAnswers(prev => {
      const next = {
        ...prev,
        [questionId]: text
      };
      if (onAnswersChange) onAnswersChange(next);
      return next;
    });
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      const nextIndex = currentIndex - 1;
      setCurrentIndex(nextIndex);
      if (onQuestionChange) onQuestionChange(nextIndex);
    }
  };

  const handleNext = () => {
    if (currentIndex < totalQuestions - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      if (onQuestionChange) onQuestionChange(nextIndex);
    }
  };

  const isQuestionAnswered = (questionId) => {
    const value = answers[questionId];
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.trim() !== '';
    return true;
  };

  const getAnsweredCount = () => {
    return questions.filter((q) => isQuestionAnswered(q.id)).length;
  };

  // Get type badge color
  const getTypeBadgeStyle = (type) => {
    const colors = {
      'Homework': { bg: '#eef2ff', color: '#4f46e5' },
      'Quiz': { bg: '#fef3c7', color: '#d97706' },
      'Lab': { bg: '#d1fae5', color: '#059669' },
      'Exam': { bg: '#fee2e2', color: '#dc2626' },
      'Reading': { bg: '#e0e7ff', color: '#4338ca' },
      'Other': { bg: '#f3f4f6', color: '#6b7280' }
    };
    return colors[type] || colors['Other'];
  };

  const typeBadge = getTypeBadgeStyle(assignmentType);

  const styles = {
    overlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: '#f3f4f6',
      zIndex: 1000,
      overflow: 'auto'
    },
    container: {
      maxWidth: '800px',
      margin: '0 auto',
      padding: '2rem',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column'
    },
    previewBanner: {
      background: '#4f46e5',
      color: 'white',
      padding: '0.75rem 1rem',
      borderRadius: '8px',
      marginBottom: '1.5rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      boxShadow: '0 2px 4px rgba(79, 70, 229, 0.3)'
    },
    assignmentBanner: {
      background: '#374151',
      color: 'white',
      padding: '0.75rem 1rem',
      borderRadius: '8px',
      marginBottom: '1.5rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      boxShadow: '0 2px 4px rgba(55, 65, 81, 0.3)'
    },
    bannerText: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      fontWeight: '600'
    },
    closeButton: {
      padding: '0.5rem 1rem',
      background: 'rgba(255,255,255,0.2)',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: '500',
      transition: 'background 0.15s'
    },
    header: {
      background: 'white',
      borderRadius: '12px',
      padding: '1.5rem',
      marginBottom: '1rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    },
    titleRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '1rem'
    },
    title: {
      margin: 0,
      fontSize: '1.5rem',
      fontWeight: '700',
      color: '#111827'
    },
    typeBadge: {
      padding: '0.375rem 0.75rem',
      borderRadius: '6px',
      fontSize: '0.875rem',
      fontWeight: '600'
    },
    progressSection: {
      marginTop: '1rem'
    },
    progressInfo: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: '0.5rem',
      fontSize: '0.875rem',
      color: '#6b7280'
    },
    progressBar: {
      height: '8px',
      background: '#e5e7eb',
      borderRadius: '4px',
      overflow: 'hidden'
    },
    progressFill: {
      height: '100%',
      background: '#4f46e5',
      borderRadius: '4px',
      transition: 'width 0.3s ease'
    },
    questionCard: {
      background: 'white',
      borderRadius: '12px',
      padding: '2rem',
      marginBottom: '1rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      flex: 1
    },
    questionNumber: {
      fontSize: '0.875rem',
      fontWeight: '600',
      color: '#6b7280',
      marginBottom: '0.5rem'
    },
    questionTitle: {
      fontSize: '1.25rem',
      fontWeight: '700',
      color: '#111827',
      marginBottom: '1rem'
    },
    questionText: {
      fontSize: '1rem',
      lineHeight: '1.7',
      color: '#374151',
      marginBottom: '1.5rem'
    },
    questionImage: {
      maxWidth: '100%',
      height: 'auto',
      maxHeight: '400px',
      borderRadius: '8px',
      border: '1px solid #e5e7eb',
      marginBottom: '1.5rem',
      objectFit: 'contain'
    },
    answerSection: {
      marginTop: '1.5rem'
    },
    answerLabel: {
      fontSize: '0.875rem',
      fontWeight: '600',
      color: '#374151',
      marginBottom: '1rem'
    },
    choiceButton: {
      width: '100%',
      padding: '1rem 1.25rem',
      marginBottom: '0.75rem',
      border: '2px solid #e5e7eb',
      borderRadius: '8px',
      background: 'white',
      cursor: 'pointer',
      textAlign: 'left',
      fontSize: '1rem',
      color: '#374151',
      transition: 'all 0.15s',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem'
    },
    choiceButtonSelected: {
      border: '2px solid #4f46e5',
      background: '#eef2ff'
    },
    choiceButtonCorrect: {
      border: '2px solid #10b981',
      background: '#d1fae5'
    },
    choiceButtonIncorrect: {
      border: '2px solid #ef4444',
      background: '#fee2e2'
    },
    choiceIndicator: {
      width: '24px',
      height: '24px',
      borderRadius: '50%',
      border: '2px solid #d1d5db',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '0.75rem',
      fontWeight: '600',
      flexShrink: 0
    },
    choiceIndicatorSelected: {
      border: '2px solid #4f46e5',
      background: '#4f46e5',
      color: 'white'
    },
    textArea: {
      width: '100%',
      minHeight: '150px',
      padding: '1rem',
      border: '2px solid #e5e7eb',
      borderRadius: '8px',
      fontSize: '1rem',
      fontFamily: 'inherit',
      resize: 'vertical',
      transition: 'border-color 0.15s',
      boxSizing: 'border-box'
    },
    navigation: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '1rem 0',
      marginTop: 'auto'
    },
    navButton: {
      padding: '0.75rem 1.5rem',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: '600',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      transition: 'all 0.15s'
    },
    navButtonPrev: {
      background: '#f3f4f6',
      border: 'none',
      color: '#374151'
    },
    navButtonNext: {
      background: '#4f46e5',
      border: 'none',
      color: 'white'
    },
    navButtonDisabled: {
      opacity: 0.5,
      cursor: 'not-allowed'
    },
    submitButton: {
      padding: '0.75rem 2rem',
      background: '#10b981',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '1rem',
      fontWeight: '600',
      transition: 'background 0.15s'
    },
    questionNav: {
      display: 'flex',
      gap: '0.5rem',
      flexWrap: 'wrap',
      justifyContent: 'center',
      marginTop: '1rem'
    },
    questionDot: {
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      border: '2px solid #e5e7eb',
      background: 'white',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '0.75rem',
      fontWeight: '600',
      color: '#6b7280',
      transition: 'all 0.15s'
    },
    questionDotCurrent: {
      border: '2px solid #4f46e5',
      background: '#4f46e5',
      color: 'white'
    },
    questionDotAnswered: {
      border: '2px solid #4f46e5',
      background: '#eef2ff',
      color: '#4f46e5'
    },
    submittedBanner: {
      background: '#10b981',
      color: 'white',
      padding: '1rem',
      borderRadius: '8px',
      marginBottom: '1rem',
      textAlign: 'center',
      fontWeight: '600'
    },
    emptyState: {
      textAlign: 'center',
      padding: '4rem 2rem',
      color: '#6b7280'
    }
  };

  if (questions.length === 0) {
    return (
      <div style={styles.overlay}>
        <div style={styles.container}>
          {isPreviewMode && (
            <div style={styles.previewBanner}>
              <div style={styles.bannerText}>
                👁️ Preview Mode - This is how students will see the assignment
              </div>
              {onClose && (
                <button
                  style={styles.closeButton}
                  onClick={onClose}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                >
                  Exit Preview
                </button>
              )}
            </div>
          )}
          {!isPreviewMode && onClose && (
            <div style={styles.assignmentBanner}>
              <div style={styles.bannerText}>
                Assignment
              </div>
              <button
                style={styles.closeButton}
                onClick={onClose}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
              >
                {closeButtonText}
              </button>
            </div>
          )}
          <div style={styles.emptyState}>
            <h2>No Questions</h2>
            <p>This assignment doesn't have any questions yet.</p>
            {onClose && (
              <button
                style={{ ...styles.navButton, ...styles.navButtonNext, marginTop: '1rem' }}
                onClick={onClose}
              >
                Go Back
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const answerChoices = getAnswerChoices(currentQuestion);
  const isMCQ = currentQuestion.question_type?.toLowerCase() === 'mcq' || answerChoices.length > 0;
  const selectedAnswer = answers[currentQuestion.id];
  const isLastQuestion = currentIndex === totalQuestions - 1;

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        {/* Preview Mode Banner */}
        {isPreviewMode && (
          <div style={styles.previewBanner}>
            <div style={styles.bannerText}>
              👁️ Preview Mode - This is how students will see the assignment
            </div>
            {onClose && (
              <button
                style={styles.closeButton}
                onClick={onClose}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
              >
                Exit Preview
              </button>
            )}
          </div>
        )}
        {!isPreviewMode && onClose && (
          <div style={styles.assignmentBanner}>
            <div style={styles.bannerText}>
              Assignment
            </div>
            <button
              style={styles.closeButton}
              onClick={onClose}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            >
              {closeButtonText}
            </button>
          </div>
        )}

        {/* Submitted Banner */}
        {submitted && (
          <div style={styles.submittedBanner}>
            ✓ {isPreviewMode ? 'Preview Complete' : 'Assignment Submitted'} - You answered {getAnsweredCount()} of {totalQuestions} questions
          </div>
        )}

        {/* Header with Progress */}
        <div style={styles.header}>
          <div style={styles.titleRow}>
            <h1 style={styles.title}>{assignmentTitle}</h1>
            <span style={{
              ...styles.typeBadge,
              background: typeBadge.bg,
              color: typeBadge.color
            }}>
              {assignmentType}
            </span>
          </div>
          
          <div style={styles.progressSection}>
            <div style={styles.progressInfo}>
              <span>Question {currentIndex + 1} of {totalQuestions}</span>
              <span>{getAnsweredCount()} answered</span>
            </div>
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${progress}%` }} />
            </div>
          </div>

          {/* Question Navigation Dots */}
          <div style={styles.questionNav}>
            {questions.map((q, idx) => {
              const isAnswered = isQuestionAnswered(q.id);
              const isCurrent = idx === currentIndex;
              return (
                <button
                  key={q.id}
                  style={{
                    ...styles.questionDot,
                    ...(isCurrent ? styles.questionDotCurrent : {}),
                    ...(!isCurrent && isAnswered ? styles.questionDotAnswered : {})
                  }}
                  onClick={() => {
                    setCurrentIndex(idx);
                    if (onQuestionChange) onQuestionChange(idx);
                  }}
                  title={`Question ${idx + 1}${isAnswered ? ' (answered)' : ''}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Question Card */}
        <div style={styles.questionCard}>
          <div style={styles.questionNumber}>Question {currentIndex + 1}</div>
          
          {currentQuestion.title && (
            <div style={styles.questionTitle}>{currentQuestion.title}</div>
          )}

          {/* Question Text with Markdown */}
          <div style={styles.questionText}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                p: ({children}) => <p style={{ margin: '0 0 0.75rem 0' }}>{children}</p>,
                code: ({node, inline, className, children, ...props}) => {
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
                      borderRadius: '8px',
                      overflow: 'auto',
                      fontSize: '0.875rem'
                    }}>
                      <code {...props}>{children}</code>
                    </pre>
                  );
                }
              }}
            >
              {currentQuestion.text}
            </ReactMarkdown>
          </div>

          {/* Question Image */}
          {imageUrls[currentQuestion.id] && (
            <img
              src={imageUrls[currentQuestion.id]}
              alt="Question illustration"
              style={styles.questionImage}
            />
          )}

          {/* Answer Section */}
          <div style={styles.answerSection}>
            <div style={styles.answerLabel}>
              {isMCQ ? 'Select your answer:' : 'Your answer:'}
            </div>

            {isMCQ ? (
              // Multiple Choice
              <div>
                {answerChoices.map((choice, idx) => {
                  const isSelected = selectedAnswer === choice;
                  const isCorrect = choice === currentQuestion.correct_answer;
                  const showResult = !isPreviewMode && (submitted || showCorrectAnswers) && isSelected;
                  
                  let buttonStyle = { ...styles.choiceButton };
                  let indicatorStyle = { ...styles.choiceIndicator };
                  
                  if (isSelected) {
                    buttonStyle = { ...buttonStyle, ...styles.choiceButtonSelected };
                    indicatorStyle = { ...indicatorStyle, ...styles.choiceIndicatorSelected };
                  }
                  
                  if (showResult && showCorrectAnswers) {
                    if (isCorrect) {
                      buttonStyle = { ...buttonStyle, ...styles.choiceButtonCorrect };
                    } else {
                      buttonStyle = { ...buttonStyle, ...styles.choiceButtonIncorrect };
                    }
                  }

                  return (
                    <button
                      key={idx}
                      style={buttonStyle}
                      onClick={() => handleAnswerSelect(currentQuestion.id, choice)}
                      disabled={submitted}
                      onMouseEnter={(e) => {
                        if (!submitted && !isSelected) {
                          e.currentTarget.style.borderColor = '#a5b4fc';
                          e.currentTarget.style.background = '#f5f3ff';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!submitted && !isSelected) {
                          e.currentTarget.style.borderColor = '#e5e7eb';
                          e.currentTarget.style.background = 'white';
                        }
                      }}
                    >
                      <span style={indicatorStyle}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span>{choice}</span>
                      {showResult && showCorrectAnswers && isCorrect && (
                        <span style={{ marginLeft: 'auto', color: '#10b981' }}>✓</span>
                      )}
                      {showResult && showCorrectAnswers && !isCorrect && isSelected && (
                        <span style={{ marginLeft: 'auto', color: '#ef4444' }}>✗</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              // Free Response
              <textarea
                style={styles.textArea}
                placeholder="Type your answer here..."
                value={selectedAnswer || ''}
                onChange={(e) => handleTextAnswer(currentQuestion.id, e.target.value)}
                disabled={submitted}
                onFocus={(e) => e.target.style.borderColor = '#4f46e5'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
            )}
          </div>
        </div>

        {/* Navigation */}
        <div style={styles.navigation}>
          <button
            style={{
              ...styles.navButton,
              ...styles.navButtonPrev,
              ...(currentIndex === 0 ? styles.navButtonDisabled : {})
            }}
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            onMouseEnter={(e) => {
              if (currentIndex > 0) e.currentTarget.style.background = '#e5e7eb';
            }}
            onMouseLeave={(e) => {
              if (currentIndex > 0) e.currentTarget.style.background = '#f3f4f6';
            }}
          >
            ← Previous
          </button>

          <div style={{ display: 'flex', gap: '1rem' }}>
            {isLastQuestion && isPreviewMode && onClose && (
              <button
                style={styles.submitButton}
                onClick={onClose}
                onMouseEnter={(e) => e.currentTarget.style.background = '#059669'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#10b981'}
              >
                Finish Preview
              </button>
            )}
          </div>

          <button
            style={{
              ...styles.navButton,
              ...styles.navButtonNext,
              ...(isLastQuestion ? styles.navButtonDisabled : {})
            }}
            onClick={handleNext}
            disabled={isLastQuestion}
            onMouseEnter={(e) => {
              if (!isLastQuestion) e.currentTarget.style.background = '#4338ca';
            }}
            onMouseLeave={(e) => {
              if (!isLastQuestion) e.currentTarget.style.background = '#4f46e5';
            }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
