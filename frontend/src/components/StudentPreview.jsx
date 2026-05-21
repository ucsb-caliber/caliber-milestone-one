import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { getImageSignedUrl, runCodingQuestion } from '../api';
import CodeEditor from './CodeEditor';
import { getQuestionCodingConfig, isCodingQuestion } from '../utils/coding';
import { dashboardPalette } from './CourseDashboardUI';
import useBodyScrollLock from '../hooks/useBodyScrollLock';

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
  secondaryActionText = '',
  onSecondaryAction = null,
  assignmentBannerLeading,
  assignmentBannerActions,
  initialAnswers,
  initialQuestionIndex,
  initialSubmitted,
  forceReadOnly = false,
  readOnlyMessage = '',
  showStatusBanner = true,
  showHeader = true,
  onAnswersChange,
  onQuestionChange,
  assignmentId = null,
  inline = false, //new prop
  onSubmit,
  isSubmitting = false,
  submitButtonText = 'Submit Assignment',
  showPrevNextButtons = true
}) {
  useBodyScrollLock(!inline);

  const [currentIndex, setCurrentIndex] = useState(Number.isInteger(initialQuestionIndex) ? initialQuestionIndex : 0);
  const [answers, setAnswers] = useState(initialAnswers || {});
  const [submitted, setSubmitted] = useState(Boolean(initialSubmitted));
  const [imageUrls, setImageUrls] = useState({});
  const [codingRuns, setCodingRuns] = useState({});
  const [runningCodingId, setRunningCodingId] = useState(null);
  const [codingRunError, setCodingRunError] = useState('');
  const isReadOnly = submitted || forceReadOnly;
  const isSubmitAction = !isPreviewMode && !isReadOnly && typeof onSubmit === 'function';
  const primaryButtonText = isSubmitAction
    ? (isSubmitting
      ? (submitButtonText === 'Resubmit Assignment' ? 'Resubmitting...' : 'Submitting...')
      : submitButtonText)
    : closeButtonText;

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
          const signedUrl = /^(data:|blob:|https?:\/\/)/.test(question.image_url)
            ? question.image_url
            : await getImageSignedUrl(question.image_url);
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

  const getCodingConfig = (question) => getQuestionCodingConfig(question);

  const getCodingAnswerPayload = (questionId) => {
    const raw = answers[questionId];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return {
        language: String(raw.language || 'cpp'),
        source_code: String(raw.source_code || ''),
      };
    }
    return {
      language: 'cpp',
      source_code: typeof raw === 'string' ? raw : '',
    };
  };

  const handleAnswerSelect = (questionId, answer) => {
    if (isReadOnly) return;
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
    if (isReadOnly) return;
    setAnswers(prev => {
      const next = {
        ...prev,
        [questionId]: text
      };
      if (onAnswersChange) onAnswersChange(next);
      return next;
    });
  };

  const handleCodingAnswer = (questionId, sourceCode) => {
    if (isReadOnly) return;
    setAnswers((prev) => {
      const previous = prev[questionId];
      const next = {
        ...prev,
        [questionId]: {
          language: 'cpp',
          ...(previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {}),
          source_code: sourceCode,
        }
      };
      if (onAnswersChange) onAnswersChange(next);
      return next;
    });
  };

  const handleRunCoding = async (question) => {
    if (!assignmentId || isReadOnly) return;
    const answerPayload = getCodingAnswerPayload(question.id);
    setCodingRunError('');
    setRunningCodingId(question.id);
    try {
      const result = await runCodingQuestion(assignmentId, question.id, {
        language: 'cpp',
        source_code: answerPayload.source_code || getCodingConfig(question).starter_code || '',
      });
      setCodingRuns((prev) => ({ ...prev, [question.id]: result }));
    } catch (error) {
      setCodingRunError(error.message || 'Failed to run code');
    } finally {
      setRunningCodingId(null);
    }
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
    const question = questions.find((item) => item.id === questionId);
    const value = answers[questionId];
    if (value === undefined || value === null) return false;
    if (question && isCodingQuestion(question.question_type)) {
      const codingConfig = getCodingConfig(question);
      const payload = getCodingAnswerPayload(questionId);
      const code = String(payload.source_code || '').trim();
      return code !== '' && code !== String(codingConfig.starter_code || '').trim();
    }
    if (typeof value === 'string') return value.trim() !== '';
    return true;
  };

  const getAnsweredCount = () => {
    return questions.filter((q) => isQuestionAnswered(q.id)).length;
  };

  // Get type badge color
  const getTypeBadgeStyle = (type) => {
    const colors = {
      'Homework': { bg: dashboardPalette.surface, color: dashboardPalette.navy },
      'Quiz': { bg: '#fff7e0', color: '#8a5a00' },
      'Lab': { bg: '#eef6f0', color: '#215b39' },
      'Exam': { bg: '#fef2f2', color: '#b91c1c' },
      'Reading': { bg: '#eef4fa', color: dashboardPalette.navyMid },
      'Other': { bg: dashboardPalette.surface, color: dashboardPalette.muted }
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
      background: dashboardPalette.surface,
      zIndex: 1000,
      overflowY: 'auto',
      overflowX: 'hidden',
      overscrollBehavior: 'contain',
      WebkitOverflowScrolling: 'touch',
      touchAction: 'pan-y'
    },
    container: {
      maxWidth: '960px',
      margin: '0 auto',
      padding: '24px',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column'
    },
    previewBanner: {
      background: dashboardPalette.white,
      color: dashboardPalette.text,
      padding: '0.75rem 1rem',
      borderRadius: '8px',
      marginBottom: '1.5rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      border: `1px solid ${dashboardPalette.border}`
    },
    assignmentBanner: {
      background: dashboardPalette.white,
      color: dashboardPalette.text,
      padding: '0.75rem 1rem',
      borderRadius: '8px',
      marginBottom: '1.5rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      border: `1px solid ${dashboardPalette.border}`
    },
    bannerText: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      fontWeight: '600'
    },
    closeButton: {
      padding: '0.5rem 1rem',
      background: dashboardPalette.white,
      color: dashboardPalette.text,
      border: `1px solid ${dashboardPalette.border}`,
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: '600'
    },
    secondaryButton: {
      padding: '0.5rem 1rem',
      background: dashboardPalette.white,
      color: dashboardPalette.text,
      border: `1px solid ${dashboardPalette.border}`,
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: '600'
    },
    header: {
      background: dashboardPalette.white,
      borderRadius: '8px',
      padding: '1rem 1.25rem',
      marginBottom: '1rem',
      border: `1px solid ${dashboardPalette.border}`
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
      color: dashboardPalette.navy
    },
    typeBadge: {
      padding: '0.375rem 0.75rem',
      borderRadius: '8px',
      fontSize: '0.82rem',
      fontWeight: '600',
      border: `1px solid ${dashboardPalette.border}`
    },
    progressSection: {
      marginTop: '1rem'
    },
    progressInfo: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: '0.5rem',
      fontSize: '0.875rem',
      color: dashboardPalette.muted
    },
    progressBar: {
      height: '8px',
      background: dashboardPalette.border,
      borderRadius: '4px',
      overflow: 'hidden'
    },
    progressFill: {
      height: '100%',
      background: dashboardPalette.navy,
      borderRadius: '4px'
    },
    questionCard: {
      background: dashboardPalette.white,
      borderRadius: '8px',
      padding: '1.5rem',
      marginBottom: '1rem',
      border: `1px solid ${dashboardPalette.border}`,
      flex: 1
    },
    questionNumber: {
      fontSize: '0.875rem',
      fontWeight: '600',
      color: dashboardPalette.muted,
      marginBottom: '0.5rem'
    },
    questionTitle: {
      fontSize: '1.15rem',
      fontWeight: '700',
      color: dashboardPalette.navy,
      marginBottom: '1rem'
    },
    questionText: {
      fontSize: '0.98rem',
      lineHeight: '1.6',
      color: dashboardPalette.text,
      marginBottom: '1.5rem'
    },
    questionImage: {
      maxWidth: '100%',
      height: 'auto',
      maxHeight: '400px',
      borderRadius: '8px',
      border: `1px solid ${dashboardPalette.border}`,
      marginBottom: '1.5rem',
      objectFit: 'contain'
    },
    answerSection: {
      marginTop: '1.5rem'
    },
    answerLabel: {
      fontSize: '0.875rem',
      fontWeight: '600',
      color: dashboardPalette.text,
      marginBottom: '1rem'
    },
    choiceButton: {
      width: '100%',
      padding: '0.9rem 1rem',
      marginBottom: '0.6rem',
      border: `1px solid ${dashboardPalette.border}`,
      borderRadius: '8px',
      background: dashboardPalette.white,
      cursor: 'pointer',
      textAlign: 'left',
      fontSize: '0.95rem',
      color: dashboardPalette.text,
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem'
    },
    choiceButtonSelected: {
      border: `1px solid ${dashboardPalette.navy}`,
      background: '#eef4fa'
    },
    choiceButtonCorrect: {
      border: '1px solid #86efac',
      background: '#eef6f0'
    },
    choiceButtonIncorrect: {
      border: '1px solid #fecaca',
      background: '#fef2f2'
    },
    choiceIndicator: {
      width: '24px',
      height: '24px',
      borderRadius: '8px',
      border: `1px solid ${dashboardPalette.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '0.75rem',
      fontWeight: '600',
      flexShrink: 0
    },
    choiceIndicatorSelected: {
      border: `1px solid ${dashboardPalette.navy}`,
      background: dashboardPalette.navy,
      color: dashboardPalette.white
    },
    textArea: {
      width: '100%',
      minHeight: '150px',
      padding: '1rem',
      border: `1px solid ${dashboardPalette.border}`,
      borderRadius: '8px',
      fontSize: '0.95rem',
      fontFamily: 'inherit',
      resize: 'vertical',
      boxSizing: 'border-box'
    },
    codeMetaRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '1rem',
      flexWrap: 'wrap',
      marginBottom: '0.85rem'
    },
    codeBadgeRow: {
      display: 'flex',
      gap: '0.5rem',
      flexWrap: 'wrap'
    },
    codeBadge: {
      background: dashboardPalette.surface,
      color: dashboardPalette.navy,
      borderRadius: '8px',
      padding: '0.35rem 0.6rem',
      fontSize: '0.8rem',
      fontWeight: '700',
      border: `1px solid ${dashboardPalette.border}`
    },
    runButton: {
      border: `1px solid ${dashboardPalette.navy}`,
      background: dashboardPalette.navy,
      color: dashboardPalette.white,
      borderRadius: '8px',
      padding: '0.7rem 1rem',
      fontSize: '0.85rem',
      fontWeight: '700',
      cursor: 'pointer'
    },
    codingResultPanel: {
      marginTop: '1rem',
      border: `1px solid ${dashboardPalette.border}`,
      background: dashboardPalette.surface,
      borderRadius: '8px',
      padding: '1rem'
    },
    codingResultHeading: {
      fontSize: '0.9rem',
      fontWeight: '700',
      color: dashboardPalette.navy,
      marginBottom: '0.75rem'
    },
    codingOutput: {
      background: '#0f172a',
      color: '#e2e8f0',
      borderRadius: '8px',
      padding: '0.9rem',
      fontSize: '0.85rem',
      overflowX: 'auto',
      whiteSpace: 'pre-wrap',
      marginTop: '0.75rem'
    },
    sampleIOGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '0.6rem',
      marginTop: '0.6rem'
    },
    sampleIOCard: {
      background: dashboardPalette.white,
      border: `1px solid ${dashboardPalette.border}`,
      borderRadius: '8px',
      padding: '0.55rem 0.65rem'
    },
    sampleIOLabel: {
      color: dashboardPalette.muted,
      fontSize: '0.76rem',
      fontWeight: '700',
      marginBottom: '0.25rem'
    },
    sampleIOValue: {
      color: dashboardPalette.text,
      fontSize: '0.84rem',
      whiteSpace: 'pre-wrap',
      fontFamily: 'monospace',
      margin: 0
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
      background: dashboardPalette.white,
      border: `1px solid ${dashboardPalette.border}`,
      color: dashboardPalette.text
    },
    navButtonNext: {
      background: dashboardPalette.navy,
      border: `1px solid ${dashboardPalette.navy}`,
      color: dashboardPalette.white
    },
    navButtonDisabled: {
      opacity: 0.5,
      cursor: 'not-allowed'
    },
    submitButton: {
      padding: '0.75rem 2rem',
      background: dashboardPalette.navy,
      color: dashboardPalette.white,
      border: `1px solid ${dashboardPalette.navy}`,
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '0.95rem',
      fontWeight: '600',
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
      borderRadius: '8px',
      border: `1px solid ${dashboardPalette.border}`,
      background: dashboardPalette.white,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '0.75rem',
      fontWeight: '600',
      color: dashboardPalette.muted
    },
    questionDotCurrent: {
      border: `1px solid ${dashboardPalette.navy}`,
      background: dashboardPalette.navy,
      color: dashboardPalette.white
    },
    questionDotAnswered: {
      border: `1px solid ${dashboardPalette.navy}`,
      background: '#eef4fa',
      color: dashboardPalette.navy
    },
    submittedBanner: {
      background: dashboardPalette.white,
      color: '#215b39',
      padding: '0.85rem 1rem',
      borderRadius: '8px',
      marginBottom: '1rem',
      textAlign: 'center',
      fontWeight: '600',
      border: '1px solid #86efac'
    },
    notSubmittedBanner: {
      background: dashboardPalette.white,
      color: dashboardPalette.dangerText,
      padding: '0.85rem 1rem',
      borderRadius: '8px',
      marginBottom: '1rem',
      textAlign: 'center',
      fontWeight: '600',
      border: `1px solid ${dashboardPalette.dangerBorder}`
    },
    emptyState: {
      textAlign: 'center',
      padding: '4rem 2rem',
      color: dashboardPalette.muted
    }
  };
  const wrapperStyle = inline
    ? {
      background: dashboardPalette.surface,
      height: '100%',
      overflowY: 'auto',
      overscrollBehavior: 'contain',
      WebkitOverflowScrolling: 'touch',
      touchAction: 'pan-y'
    }
    : styles.overlay;
  const containerStyle = inline
    ? { ...styles.container, maxWidth: '100%', padding: '1rem' }
    : styles.container;

  if (questions.length === 0) {
    return (
      <div style={styles.overlay}>
        <div style={styles.container}>
          {isPreviewMode && (
            <div style={styles.previewBanner}>
              <div style={styles.bannerText}>
                Preview Mode - This is how students will see the assignment
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
          {assignmentBannerNode}
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
  const questionType = currentQuestion.question_type?.toLowerCase();
  const isMCQ = questionType === 'mcq' || questionType === 'true_false' ||
    (answerChoices.length > 0 && typeof answerChoices[0] === 'string');
  const isFreeResponse = questionType === 'fr';
  const isShortAnswer = questionType === 'short_answer';
  const isCoding = isCodingQuestion(questionType);
  const codingConfig = isCoding ? getCodingConfig(currentQuestion) : null;
  const rubricParts = isFreeResponse && Array.isArray(answerChoices) && answerChoices.length > 0 && typeof answerChoices[0] === 'object'
    ? answerChoices : [];
  const selectedAnswer = answers[currentQuestion.id];
  const selectedCodingAnswer = isCoding ? getCodingAnswerPayload(currentQuestion.id) : { language: 'cpp', source_code: '' };
  const codeEditorValue = isCoding
    ? (selectedCodingAnswer.source_code || codingConfig?.starter_code || '')
    : '';
  const currentCodingRun = codingRuns[currentQuestion.id];
  const isLastQuestion = currentIndex === totalQuestions - 1;
  const showFinishPreviewButton = isLastQuestion && isPreviewMode && onClose;
  const showNavigationFooter = showPrevNextButtons || showFinishPreviewButton;
  const defaultAssignmentBannerActions = (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      {secondaryActionText && onSecondaryAction ? (
        <button
          style={styles.secondaryButton}
          onClick={onSecondaryAction}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
          }}
        >
          {secondaryActionText}
        </button>
      ) : null}
      <button
        style={{
          ...styles.closeButton,
          ...(isSubmitAction
            ? { background: dashboardPalette.navy, color: dashboardPalette.white, border: `1px solid ${dashboardPalette.navy}` }
            : {})
        }}
        onClick={isSubmitAction ? onSubmit : onClose}
        disabled={isSubmitting}
        onMouseEnter={(e) => {
          if (isSubmitting) return;
          e.currentTarget.style.background = isSubmitAction
            ? dashboardPalette.navyMid
            : dashboardPalette.surface;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isSubmitAction
            ? dashboardPalette.navy
            : dashboardPalette.white;
        }}
      >
        {primaryButtonText}
      </button>
    </div>
  );
  const assignmentBannerNode = !isPreviewMode && onClose ? (
    <div style={styles.assignmentBanner}>
      {assignmentBannerLeading ?? <div style={styles.bannerText}>Assignment</div>}
      {assignmentBannerActions !== undefined ? assignmentBannerActions : defaultAssignmentBannerActions}
    </div>
  ) : null;

  return (
    <div style={wrapperStyle}>
      <div style={containerStyle}>
        {/* Preview Mode Banner */}
        {isPreviewMode && (
          <div style={styles.previewBanner}>
            <div style={styles.bannerText}>
              Preview Mode - This is how students will see the assignment
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
        {assignmentBannerNode}

        {/* Submitted Banner */}
        {showStatusBanner && (submitted || forceReadOnly) && (
          <div style={forceReadOnly && !submitted ? styles.notSubmittedBanner : styles.submittedBanner}>
            {forceReadOnly && !submitted
              ? (readOnlyMessage || 'Assignment Was Not Submitted')
              : `✓ ${isPreviewMode ? 'Preview Complete' : 'Assignment Submitted'}`}
          </div>
        )}

        {/* Header with Progress */}
        {showHeader && (
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
        )}

        {/* Question Card */}
        <div style={styles.questionCard}>
          {showHeader && <div style={styles.questionNumber}>Question {currentIndex + 1}</div>}

          {currentQuestion.title && (
            <div style={styles.questionTitle}>{currentQuestion.title}</div>
          )}

          {/* Question Text with Markdown */}
          <div style={styles.questionText}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                p: ({ children }) => <p style={{ margin: '0 0 0.75rem 0' }}>{children}</p>,
                code: ({ node, inline, className, children, ...props }) => {
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
            {isMCQ && (
              <>
                <div style={styles.answerLabel}>Select your answer:</div>
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
                        disabled={isReadOnly}
                        onMouseEnter={(e) => {
                          if (!isReadOnly && !isSelected) {
                            e.currentTarget.style.borderColor = '#a5b4fc';
                            e.currentTarget.style.background = '#f5f3ff';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isReadOnly && !isSelected) {
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
                          <span style={{ marginLeft: 'auto', color: dashboardPalette.navy }}>✓</span>
                        )}
                        {showResult && showCorrectAnswers && !isCorrect && isSelected && (
                          <span style={{ marginLeft: 'auto', color: '#ef4444' }}>✗</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {isShortAnswer && (() => {
              // Parse short answer config (new format: object with valid_answers)
              // vs old format (array of rubric parts)
              let saConfig = null;
              if (
                answerChoices &&
                !Array.isArray(answerChoices) &&
                typeof answerChoices === 'object' &&
                answerChoices.valid_answers
              ) {
                saConfig = answerChoices;
              }

              const restriction = saConfig?.input_restriction || 'any';
              const inputType = restriction === 'numbers' ? 'number' : 'text';
              const inputPattern = restriction === 'letters' ? '[A-Za-z]*' : undefined;

              return (
                <>
                  <div style={styles.answerLabel}>
                    Your answer:
                    {restriction !== 'any' && (
                      <span style={{
                        marginLeft: '0.5rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: dashboardPalette.navyLight,
                        color: dashboardPalette.navy,
                        padding: '1px 6px',
                        borderRadius: '4px',
                      }}>
                        {restriction === 'numbers' ? 'numbers only' : 'letters only'}
                      </span>
                    )}
                  </div>

                  <input
                    type={inputType}
                    pattern={inputPattern}
                    placeholder="Type your answer here…"
                    value={selectedAnswer || ''}
                    onChange={(e) => handleTextAnswer(currentQuestion.id, e.target.value)}
                    disabled={isReadOnly}
                    onFocus={(e) => e.target.style.borderColor = dashboardPalette.navy}
                    onBlur={(e) => e.target.style.borderColor = dashboardPalette.border}
                    style={{
                      width: '100%',
                      maxWidth: '420px',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '8px',
                      border: `1px solid ${dashboardPalette.border}`,
                      fontSize: '0.95rem',
                      color: dashboardPalette.text,
                      background: isReadOnly ? dashboardPalette.surface : dashboardPalette.white,
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />

                  {/* Valid answers — shown in preview/instructor mode only */}
                  {isPreviewMode && saConfig?.valid_answers?.length > 0 && (
                    <div style={{
                      marginTop: '0.85rem',
                      padding: '0.65rem 0.75rem',
                      background: dashboardPalette.surface,
                      border: `1px solid ${dashboardPalette.border}`,
                      borderRadius: '8px',
                      fontSize: '0.82rem'
                    }}>
                      <div style={{ fontWeight: 700, color: dashboardPalette.navy, marginBottom: '0.4rem' }}>
                        Valid answers (instructor view):
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {saConfig.valid_answers.map((ans, i) => (
                          <span
                            key={i}
                            style={{
                              background: dashboardPalette.navyLight,
                              color: dashboardPalette.navy,
                              padding: '0.2rem 0.6rem',
                              borderRadius: '6px',
                              border: `1px solid ${dashboardPalette.border}`,
                              fontWeight: 600,
                              fontSize: '0.8rem',
                            }}
                          >
                            {ans.value}
                            {!ans.case_sensitive && (
                              <span style={{ opacity: 0.6, fontWeight: 400, marginLeft: '4px' }}>(any case)</span>
                            )}
                          </span>
                        ))}
                      </div>
                      {saConfig.points != null && (
                        <div style={{ marginTop: '0.5rem', color: dashboardPalette.muted, fontSize: '0.78rem' }}>
                          {saConfig.points} point{saConfig.points !== 1 ? 's' : ''} for a correct match
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}

            {isFreeResponse && rubricParts.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={styles.answerLabel}>Your response:</div>
                  {isPreviewMode && (
                    <span style={{ fontSize: '0.875rem', color: dashboardPalette.muted }}>
                      {rubricParts.reduce((sum, p) => {
                        const levels = p.rubric_levels || [];
                        const maxPts = levels.length > 0 ? Math.max(...levels.map(l => parseInt(l.points) || 0)) : (parseInt(p.points) || 0);
                        return sum + maxPts;
                      }, 0)} points total
                    </span>
                  )}
                </div>
                {rubricParts.map((part, idx) => {
                  const partAnswer = typeof selectedAnswer === 'object' ? selectedAnswer?.[idx] : '';
                  const levels = part.rubric_levels || [];
                  const maxPts = levels.length > 0 ? Math.max(...levels.map(l => parseInt(l.points) || 0)) : (parseInt(part.points) || 0);
                  return (
                    <div key={idx} style={{ marginBottom: '1.5rem' }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '600', color: '#374151' }}>
                          {part.part_label || `Part ${String.fromCharCode(65 + idx)}`}
                        </span>
                        {isPreviewMode && (
                          <span style={{
                            background: '#e0f2fe',
                            color: '#0369a1',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: '600'
                          }}>
                            {maxPts} pts max
                          </span>
                        )}
                      </div>
                      {isPreviewMode && levels.length > 0 && (
                        <div style={{ fontSize: '0.75rem', color: dashboardPalette.muted, marginBottom: '0.5rem' }}>
                          Rubric (instructors only):
                          {levels.map((l, i) => (
                            <div key={i} style={{ marginBottom: '0.2rem' }}><span style={{ fontWeight: '600' }}>+{l.points}:</span> {l.criteria || '—'}</div>
                          ))}
                        </div>
                      )}
                      <textarea
                        style={{ ...styles.textArea, minHeight: '100px' }}
                        placeholder={`Enter your response for ${part.part_label || `Part ${String.fromCharCode(65 + idx)}`}...`}
                        value={partAnswer || ''}
                        onChange={(e) => {
                          const newParts = typeof selectedAnswer === 'object' ? { ...selectedAnswer } : {};
                          newParts[idx] = e.target.value;
                          handleTextAnswer(currentQuestion.id, newParts);
                        }}
                        disabled={isReadOnly}
                        onFocus={(e) => e.target.style.borderColor = dashboardPalette.navy}
                        onBlur={(e) => e.target.style.borderColor = dashboardPalette.border}
                      />
                    </div>
                  );
                })}
              </>
            )}

            {isCoding && codingConfig && (
              <>
                <div style={styles.codeMetaRow}>
                  <div>
                    <div style={styles.answerLabel}>Your C++ solution:</div>
                    <div style={styles.codeBadgeRow}>
                      <span style={styles.codeBadge}>C++</span>
                      {codingConfig.function_signature && (
                        <span style={{ ...styles.codeBadge, background: dashboardPalette.white, color: dashboardPalette.navyMid }}>
                          {codingConfig.function_signature}
                        </span>
                      )}
                      <span style={{ ...styles.codeBadge, background: '#fff7ed', color: '#c2410c' }}>
                        {`${codingConfig.points || 1} pts`}
                      </span>
                    </div>
                  </div>
                  {!isPreviewMode && assignmentId && (
                    <button
                      type="button"
                      style={{ ...styles.runButton, opacity: runningCodingId === currentQuestion.id ? 0.7 : 1 }}
                      onClick={() => handleRunCoding(currentQuestion)}
                      disabled={isReadOnly || runningCodingId === currentQuestion.id}
                    >
                      {runningCodingId === currentQuestion.id ? 'Running...' : 'Run Code'}
                    </button>
                  )}
                </div>

                {(codingConfig.visible_tests || []).length > 0 && (
                  <div style={{ marginBottom: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {(codingConfig.visible_tests || []).map((test, idx) => (
                      <div key={`${test.name}-${idx}`} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem' }}>
                        <div style={{ fontWeight: '700', color: '#111827', fontSize: '0.9rem' }}>{test.name || `Sample ${idx + 1}`}</div>
                        {test.description && (
                          <div style={{ color: '#475569', fontSize: '0.85rem', marginTop: '0.25rem' }}>{test.description}</div>
                        )}
                        {(test.input || test.output) && (
                          <div style={styles.sampleIOGrid}>
                            <div style={styles.sampleIOCard}>
                              <div style={styles.sampleIOLabel}>Input</div>
                              <pre style={styles.sampleIOValue}>{test.input || '—'}</pre>
                            </div>
                            <div style={styles.sampleIOCard}>
                              <div style={styles.sampleIOLabel}>Expected Output</div>
                              <pre style={styles.sampleIOValue}>{test.output || '—'}</pre>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <CodeEditor
                  language="cpp"
                  height={inline ? '280px' : '360px'}
                  readOnly={isReadOnly}
                  value={codeEditorValue}
                  onChange={(nextCode) => handleCodingAnswer(currentQuestion.id, nextCode)}
                />

                {codingRunError && (
                  <div style={{ marginTop: '0.75rem', color: '#b91c1c', fontWeight: '600' }}>{codingRunError}</div>
                )}

                {currentCodingRun && (
                  <div style={styles.codingResultPanel}>
                    <div style={styles.codingResultHeading}>
                      {`Run Result: ${String(currentCodingRun.verdict || '').replaceAll('_', ' ') || 'complete'}`}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                      {(currentCodingRun.tests || []).map((test, idx) => (
                        <div key={`${test.name}-${idx}`} style={{ border: '1px solid #dbeafe', borderRadius: '8px', padding: '0.75rem', background: 'white' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                            <strong style={{ color: '#111827' }}>{test.name || `Test ${idx + 1}`}</strong>
                            <span style={{ color: test.status === 'passed' ? '#047857' : '#b91c1c', fontWeight: '700' }}>
                              {test.status === 'passed' ? 'Passed' : 'Failed'}
                            </span>
                          </div>
                          {test.description && (
                            <div style={{ color: '#475569', fontSize: '0.85rem', marginTop: '0.25rem' }}>{test.description}</div>
                          )}
                          {test.message && (
                            <div style={{ color: '#334155', fontSize: '0.85rem', marginTop: '0.35rem' }}>{test.message}</div>
                          )}
                          {(test.input || test.expected_output || test.received_output) && (
                            <div style={styles.sampleIOGrid}>
                              <div style={styles.sampleIOCard}>
                                <div style={styles.sampleIOLabel}>Input</div>
                                <pre style={styles.sampleIOValue}>{test.input || '—'}</pre>
                              </div>
                              <div style={styles.sampleIOCard}>
                                <div style={styles.sampleIOLabel}>Expected</div>
                                <pre style={styles.sampleIOValue}>{test.expected_output || '—'}</pre>
                              </div>
                              <div style={{ ...styles.sampleIOCard, gridColumn: '1 / -1' }}>
                                <div style={styles.sampleIOLabel}>Received</div>
                                <pre style={styles.sampleIOValue}>{test.received_output || (test.status === 'passed' ? 'Matched expected output' : '—')}</pre>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {currentCodingRun.compile_output && (
                      <pre style={styles.codingOutput}>{currentCodingRun.compile_output}</pre>
                    )}
                    {currentCodingRun.runtime_output && (
                      <pre style={styles.codingOutput}>{currentCodingRun.runtime_output}</pre>
                    )}
                  </div>
                )}
              </>
            )}

            {isFreeResponse && rubricParts.length === 0 && (

              <>
                <div style={styles.answerLabel}>Your response:</div>
                <textarea
                  style={styles.textArea}
                  placeholder="Type your answer here..."
                  value={selectedAnswer || ''}
                  onChange={(e) => handleTextAnswer(currentQuestion.id, e.target.value)}
                  disabled={isReadOnly}
                  onFocus={(e) => e.target.style.borderColor = dashboardPalette.navy}
                  onBlur={(e) => e.target.style.borderColor = dashboardPalette.border}
                />
              </>
            )}

            {!isMCQ && !isFreeResponse && !isShortAnswer && !isCoding && (
              <>
                <div style={styles.answerLabel}>Your answer:</div>
                <textarea
                  style={styles.textArea}
                  placeholder="Type your answer here..."
                  value={selectedAnswer || ''}
                  onChange={(e) => handleTextAnswer(currentQuestion.id, e.target.value)}
                  disabled={isReadOnly}
                  onFocus={(e) => e.target.style.borderColor = dashboardPalette.navy}
                  onBlur={(e) => e.target.style.borderColor = dashboardPalette.border}
                />
              </>
            )}
          </div>
        </div>

        {/* Navigation */}
        {showNavigationFooter && (
          <div style={{
            ...styles.navigation,
            justifyContent: showPrevNextButtons ? 'space-between' : 'center'
          }}>
            {showPrevNextButtons && (
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
            )}

            <div style={{ display: 'flex', gap: '1rem' }}>
              {showFinishPreviewButton && (
                <button
                  style={styles.submitButton}
                  onClick={onClose}
                  onMouseEnter={(e) => e.currentTarget.style.background = dashboardPalette.navyMid}
                  onMouseLeave={(e) => e.currentTarget.style.background = dashboardPalette.navy}
                >
                  Finish Preview
                </button>
              )}
            </div>

            {showPrevNextButtons && (
              <button
                style={{
                  ...styles.navButton,
                  ...styles.navButtonNext,
                  ...(isLastQuestion ? styles.navButtonDisabled : {})
                }}
                onClick={handleNext}
                disabled={isLastQuestion}
                onMouseEnter={(e) => {
                  if (!isLastQuestion) e.currentTarget.style.background = dashboardPalette.navyMid;
                }}
                onMouseLeave={(e) => {
                  if (!isLastQuestion) e.currentTarget.style.background = dashboardPalette.navy;
                }}
              >
                Next →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
