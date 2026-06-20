import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { getImageSignedUrl, getQuestionsBatch } from '../api';
import { buildQuestionAnalyticsContext, trackEvent } from '../analytics';

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
  courseId = null,
  assignmentId = null,
  assignmentTitle = 'Assignment',
  assignmentType = 'Assignment',
  onClose,
  isPreviewMode = true,
  showCorrectAnswers = false,
  closeButtonText = 'Back to Course',
  secondaryActionText = '',
  onSecondaryAction = null,
  initialAnswers,
  initialQuestionIndex,
  initialSubmitted,
  forceReadOnly = false,
  readOnlyMessage = '',
  showStatusBanner = true,
  showHeader = true,
  onAnswersChange,
  onQuestionChange,
  inline = false, //new prop
  onSubmit,
  isSubmitting = false,
  submitButtonText = 'Submit Assignment',
  showPrevNextButtons = true,
  onIntegrityEventBatch = null
}) {
  const [currentIndex, setCurrentIndex] = useState(Number.isInteger(initialQuestionIndex) ? initialQuestionIndex : 0);
  const [answers, setAnswers] = useState(initialAnswers || {});
  const [submitted, setSubmitted] = useState(Boolean(initialSubmitted));
  const [imageUrls, setImageUrls] = useState({});
  const [subQuestionsCache, setSubQuestionsCache] = useState({});
  const [subQuestionsLoading, setSubQuestionsLoading] = useState({});
  const isReadOnly = submitted || forceReadOnly;
  const integrityBufferRef = useRef([]);
  const lastInputRef = useRef({});
  const recentPasteRef = useRef({});
  const telemetryEnabledRef = useRef(false);
  const questionViewedAtRef = useRef(Date.now());
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
  telemetryEnabledRef.current = !isPreviewMode && !isReadOnly && typeof onIntegrityEventBatch === 'function';

  const getTelemetryContext = (question, partId = null) => ({
    question_key: question ? String(getQuestionKey(question) || question.id || '') : null,
    part_id: partId == null ? null : String(partId),
  });

  const telemetryFieldKey = (question, partId = null) => {
    const context = getTelemetryContext(question, partId);
    return `${context.question_key || 'unknown'}:${context.part_id || 'main'}`;
  };

  const flushIntegrityEvents = useCallback(() => {
    if (!telemetryEnabledRef.current || typeof onIntegrityEventBatch !== 'function') return;
    const events = integrityBufferRef.current.splice(0, integrityBufferRef.current.length);
    if (!events.length) return;
    void Promise.resolve(onIntegrityEventBatch(events)).catch((err) => {
      console.error('Integrity event flush failed:', err);
      integrityBufferRef.current = [...events, ...integrityBufferRef.current].slice(0, 100);
    });
  }, [onIntegrityEventBatch]);

  const queueIntegrityEvent = useCallback((eventType, context = {}, metadata = {}) => {
    if (!telemetryEnabledRef.current) return;
    integrityBufferRef.current.push({
      event_type: eventType,
      question_key: context.question_key || null,
      part_id: context.part_id || null,
      metadata: {
        ...metadata,
      },
      client_created_at: new Date().toISOString(),
    });
    if (integrityBufferRef.current.length >= 20) {
      flushIntegrityEvents();
    }
  }, [flushIntegrityEvents]);

  useEffect(() => {
    if (!telemetryEnabledRef.current) return undefined;
    const timer = window.setInterval(flushIntegrityEvents, 10000);
    const handleVisibilityChange = () => {
      queueIntegrityEvent(document.hidden ? 'visibility_hidden' : 'visibility_visible');
      if (document.hidden) flushIntegrityEvents();
    };
    const handleBlur = () => queueIntegrityEvent('blur');
    const handleFocus = () => queueIntegrityEvent('focus');
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      flushIntegrityEvents();
    };
  }, [flushIntegrityEvents, queueIntegrityEvent]);

  const recordTextInput = (question, partId, previousValue, nextValue) => {
    if (!telemetryEnabledRef.current) return;
    const fieldKey = telemetryFieldKey(question, partId);
    const now = Date.now();
    const previousText = String(previousValue ?? '');
    const nextText = String(nextValue ?? '');
    const deltaChars = nextText.length - previousText.length;
    const lastInput = lastInputRef.current[fieldKey];
    const timeSinceLastInputMs = lastInput ? now - lastInput.at : null;
    const recentPaste = recentPasteRef.current[fieldKey];
    const hasRecentPaste = Boolean(recentPaste && now - recentPaste.at < 700);
    const charsPerSecond = timeSinceLastInputMs && timeSinceLastInputMs > 0
      ? Math.abs(deltaChars) / (timeSinceLastInputMs / 1000)
      : 0;

    if (!hasRecentPaste && Math.abs(deltaChars) > 300) {
      queueIntegrityEvent('large_delta', getTelemetryContext(question, partId), {
        delta_chars: Math.abs(deltaChars),
        answer_length_before: previousText.length,
        answer_length_after: nextText.length,
        time_since_last_input_ms: timeSinceLastInputMs,
      });
    }
    if (!hasRecentPaste && deltaChars > 20 && charsPerSecond > 25) {
      queueIntegrityEvent('rapid_input', getTelemetryContext(question, partId), {
        delta_chars: deltaChars,
        chars_per_second: Math.round(charsPerSecond * 10) / 10,
        time_since_last_input_ms: timeSinceLastInputMs,
      });
    }
    lastInputRef.current[fieldKey] = { at: now, length: nextText.length };
  };

  const textTelemetryProps = (question, partId, currentValue) => ({
    onPaste: (event) => {
      if (!telemetryEnabledRef.current) return;
      const pastedText = event.clipboardData?.getData('text') || '';
      const fieldKey = telemetryFieldKey(question, partId);
      recentPasteRef.current[fieldKey] = { at: Date.now(), length: pastedText.length };
      queueIntegrityEvent('paste', getTelemetryContext(question, partId), {
        paste_length: pastedText.length,
        answer_length_before: String(currentValue ?? '').length,
      });
    },
    onCopy: () => {
      queueIntegrityEvent('copy', getTelemetryContext(question, partId), {
        selection_length: Number(window.getSelection?.()?.toString?.().length || 0),
      });
    },
    onCut: () => {
      queueIntegrityEvent('cut', getTelemetryContext(question, partId), {
        selection_length: Number(window.getSelection?.()?.toString?.().length || 0),
      });
    },
  });

  // Fetch sub-questions for multipart questions
  useEffect(() => {
    if (!currentQuestion) return;
    const qtype = (currentQuestion.question_type || '').toLowerCase();
    if (qtype !== 'multipart') return;
    if (subQuestionsCache[currentQuestion.id] !== undefined) return;
    const ids = (() => {
      try { return JSON.parse(currentQuestion.answer_choices || '[]'); } catch { return []; }
    })().filter(id => typeof id === 'number');
    if (!ids.length) {
      setSubQuestionsCache(prev => ({ ...prev, [currentQuestion.id]: [] }));
      return;
    }
    setSubQuestionsLoading(prev => ({ ...prev, [currentQuestion.id]: true }));
    getQuestionsBatch(ids)
      .then(data => setSubQuestionsCache(prev => ({ ...prev, [currentQuestion.id]: data.questions || [] })))
      .catch(() => setSubQuestionsCache(prev => ({ ...prev, [currentQuestion.id]: [] })))
      .finally(() => setSubQuestionsLoading(prev => ({ ...prev, [currentQuestion.id]: false })));
  }, [currentQuestion?.id, currentQuestion?.question_type]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const getQuestionContent = (question) => {
    if (!question?.content) return null;
    try {
      const parsed = typeof question.content === 'string' ? JSON.parse(question.content) : question.content;
      if (parsed && Array.isArray(parsed.parts)) return parsed;
    } catch (e) {
      return null;
    }
    return null;
  };

  const getQuestionKey = (question) => question?.qid || question?.id;

  const analyticsContextForQuestion = (question, metadata = {}) => buildQuestionAnalyticsContext(question, {
    course_id: courseId,
    assignment_id: assignmentId,
    metadata: {
      question_index: currentIndex,
      question_count: totalQuestions,
      ...metadata,
    },
  });

  const leaveQuestionForAnalytics = (question, reason = 'navigation') => {
    if (!question || isPreviewMode) return;
    const now = Date.now();
    const durationMs = Math.max(0, now - questionViewedAtRef.current);
    trackEvent('question_left', analyticsContextForQuestion(question, {
      duration_ms: durationMs,
      active_seconds: Math.round(durationMs / 1000),
      action: reason,
    }));
  };

  useEffect(() => {
    if (!currentQuestion || isPreviewMode) return undefined;
    questionViewedAtRef.current = Date.now();
    trackEvent('question_viewed', analyticsContextForQuestion(currentQuestion));
    return () => {
      leaveQuestionForAnalytics(currentQuestion, 'unmount');
    };
  }, [currentQuestion?.id, currentQuestion?.qid, isPreviewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnswerSelect = (questionId, answer) => {
    if (isReadOnly) return;
    const question = questions.find((q) => q.id === questionId) || currentQuestion;
    const choices = (() => {
      try { return JSON.parse(question?.answer_choices || '[]'); } catch { return []; }
    })();
    trackEvent('question_choice_selected', analyticsContextForQuestion(question, {
      choice_index: choices.findIndex((choice) => String(choice) === String(answer)),
      answer_length: String(answer || '').length,
    }));
    trackEvent('question_answer_changed', analyticsContextForQuestion(question, {
      answer_length: String(answer || '').length,
    }));
    setAnswers(prev => {
      const next = {
        ...prev,
        [questionId]: answer
      };
      if (onAnswersChange) onAnswersChange(next);
      return next;
    });
  };

  const handlePartAnswer = (question, partId, answer) => {
    if (isReadOnly) return;
    trackEvent('question_part_answer_changed', buildQuestionAnalyticsContext(question, {
      course_id: courseId,
      assignment_id: assignmentId,
      part_id: partId,
      metadata: {
        question_index: currentIndex,
        question_count: totalQuestions,
        part_type: typeof answer,
        answer_length: typeof answer === 'string' ? answer.length : 0,
      },
    }));
    const questionKey = getQuestionKey(question);
    setAnswers(prev => {
      const existing = (typeof prev[questionKey] === 'object' && prev[questionKey] !== null) ? prev[questionKey] : {};
      const next = {
        ...prev,
        [questionKey]: {
          ...existing,
          [partId]: answer
        }
      };
      if (onAnswersChange) onAnswersChange(next);
      return next;
    });
  };

  const handleCodingAnswer = (question, partId, patch) => {
    if (isReadOnly) return;
    if (Object.prototype.hasOwnProperty.call(patch, 'language')) {
      trackEvent('question_code_language_changed', buildQuestionAnalyticsContext(question, {
        course_id: courseId,
        assignment_id: assignmentId,
        part_id: partId,
        metadata: {
          question_index: currentIndex,
          question_count: totalQuestions,
          language: patch.language,
        },
      }));
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'code')) {
      trackEvent('question_code_changed', buildQuestionAnalyticsContext(question, {
        course_id: courseId,
        assignment_id: assignmentId,
        part_id: partId,
        metadata: {
          question_index: currentIndex,
          question_count: totalQuestions,
          code_length: String(patch.code || '').length,
          language: patch.language,
        },
      }));
    }
    const questionKey = getQuestionKey(question);
    setAnswers(prev => {
      const existingQuestion = (typeof prev[questionKey] === 'object' && prev[questionKey] !== null) ? prev[questionKey] : {};
      const existingPart = (typeof existingQuestion[partId] === 'object' && existingQuestion[partId] !== null) ? existingQuestion[partId] : {};
      const next = {
        ...prev,
        [questionKey]: {
          ...existingQuestion,
          [partId]: {
            ...existingPart,
            ...patch
          }
        }
      };
      if (onAnswersChange) onAnswersChange(next);
      return next;
    });
  };

  const handleTextAnswer = (questionId, text) => {
    if (isReadOnly) return;
    const question = questions.find((q) => q.id === questionId) || currentQuestion;
    const answerLength = typeof text === 'string' ? text.length : JSON.stringify(text || {}).length;
    trackEvent('question_text_changed', analyticsContextForQuestion(question, {
      answer_length: answerLength,
    }));
    trackEvent('question_answer_changed', analyticsContextForQuestion(question, {
      answer_length: answerLength,
    }));
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
      queueIntegrityEvent('navigation_jump', getTelemetryContext(currentQuestion), {
        from_question_index: currentIndex,
        to_question_index: nextIndex,
      });
      trackEvent('question_nav_previous', analyticsContextForQuestion(currentQuestion, {
        from_index: currentIndex,
        to_index: nextIndex,
      }));
      setCurrentIndex(nextIndex);
      if (onQuestionChange) onQuestionChange(nextIndex);
    }
  };

  const handleNext = () => {
    if (currentIndex < totalQuestions - 1) {
      const nextIndex = currentIndex + 1;
      queueIntegrityEvent('navigation_jump', getTelemetryContext(currentQuestion), {
        from_question_index: currentIndex,
        to_question_index: nextIndex,
      });
      trackEvent('question_nav_next', analyticsContextForQuestion(currentQuestion, {
        from_index: currentIndex,
        to_index: nextIndex,
      }));
      setCurrentIndex(nextIndex);
      if (onQuestionChange) onQuestionChange(nextIndex);
    }
  };

  const handlePrimaryAction = () => {
    if (isSubmitAction) {
      queueIntegrityEvent('submit', getTelemetryContext(currentQuestion), {
        question_index: currentIndex,
        answered_count: getAnsweredCount(),
      });
      flushIntegrityEvents();
      onSubmit();
      return;
    }
    flushIntegrityEvents();
    if (onClose) onClose();
  };

  const isQuestionAnswered = (question) => {
    const value = answers[getQuestionKey(question)] ?? answers[question.id];
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (typeof value === 'object') {
      return Object.values(value).some((partValue) => typeof partValue === 'string' ? partValue.trim() !== '' : partValue !== undefined && partValue !== null);
    }
    return true;
  };

  const getAnsweredCount = () => {
    return questions.filter((q) => isQuestionAnswered(q)).length;
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
      top: '72px',
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
    secondaryButton: {
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
    notSubmittedBanner: {
      background: '#dc2626',
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
  const wrapperStyle = inline 
    ? { background: '#f3f4f6', height: '100%', overflowY: 'auto' } 
    : styles.overlay;
  const containerStyle = inline
    ? { ...styles.container, maxWidth: '100%', padding: '1rem' }
    : styles.container;

  if (questions.length === 0) {
    return (
      <div style={wrapperStyle}>
        <div style={containerStyle}>
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
  const questionContent = getQuestionContent(currentQuestion);
  const structuredParts = questionContent?.parts || [];
  const hasStructuredParts = structuredParts.length > 0;
  const questionType = currentQuestion.question_type?.toLowerCase();
  const isMultipart = questionType === 'multipart';
  const isMCQ = !isMultipart && (questionType === 'mcq' || questionType === 'true_false' ||
    (answerChoices.length > 0 && typeof answerChoices[0] === 'string'));
  const isFreeResponse = questionType === 'fr';
  const isShortAnswer = questionType === 'short_answer';
  const rubricParts = (isFreeResponse || isShortAnswer) && answerChoices.length > 0 && typeof answerChoices[0] === 'object' 
    ? answerChoices : [];
  const selectedAnswer = answers[getQuestionKey(currentQuestion)] ?? answers[currentQuestion.id];
  const isLastQuestion = currentIndex === totalQuestions - 1;
  const showFinishPreviewButton = isLastQuestion && isPreviewMode && onClose;
  const showNavigationFooter = showPrevNextButtons || showFinishPreviewButton;

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
        {!isPreviewMode && onClose && (
          <div style={styles.assignmentBanner}>
            <div style={styles.bannerText}>
              Assignment
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {secondaryActionText && onSecondaryAction && (
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
              )}
              <button
                style={{
                  ...styles.closeButton,
                  ...(isSubmitAction
                    ? { background: '#10b981' }
                    : {})
                }}
                onClick={handlePrimaryAction}
                disabled={isSubmitting}
                onMouseEnter={(e) => {
                  if (isSubmitting) return;
                  e.currentTarget.style.background = isSubmitAction
                    ? '#059669'
                    : 'rgba(255,255,255,0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isSubmitAction
                    ? '#10b981'
                    : 'rgba(255,255,255,0.2)';
                }}
              >
                {primaryButtonText}
              </button>
            </div>
          </div>
        )}

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
                const isAnswered = isQuestionAnswered(q);
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
	                      queueIntegrityEvent('navigation_jump', getTelemetryContext(currentQuestion), {
	                        from_question_index: currentIndex,
	                        to_question_index: idx,
	                      });
                      trackEvent('question_nav_jump', analyticsContextForQuestion(currentQuestion, {
                        from_index: currentIndex,
                        to_index: idx,
                        to_question_id: q.id,
                        to_question_qid: q.qid || String(q.id),
                      }));
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
              {questionContent?.stem || currentQuestion.text}
            </ReactMarkdown>
          </div>

          {/* Question Image */}
          {imageUrls[currentQuestion.id] && (
            <img
	              src={imageUrls[currentQuestion.id]}
	              alt="Question illustration"
	              style={styles.questionImage}
              onLoad={() => trackEvent('question_image_loaded', analyticsContextForQuestion(currentQuestion))}
              onError={() => trackEvent('question_image_failed', analyticsContextForQuestion(currentQuestion, { error: 'image_failed' }))}
	            />
          )}

          {/* Answer Section */}
          <div style={styles.answerSection}>
            {hasStructuredParts && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {structuredParts.map((part, idx) => {
                  const partAnswer = selectedAnswer && typeof selectedAnswer === 'object'
                    ? selectedAnswer[part.part_id]
                    : (idx === 0 ? selectedAnswer : '');
                  const choices = Array.isArray(part.choices) ? part.choices : [];
                  const isAuto = part.type === 'mcq' || part.type === 'true_false';
                  const isText = part.type === 'free_response' || part.type === 'short_answer';
                  const isCoding = part.type === 'coding';
                  const maxPoints = part.points ?? (Array.isArray(part.rubric) && part.rubric.length
                    ? Math.max(...part.rubric.map(level => Number(level.points) || 0))
                    : 1);
                  const coding = part.coding || {};
                  const allowedLanguages = Array.isArray(coding.allowed_languages) && coding.allowed_languages.length
                    ? coding.allowed_languages
                    : ['python'];
                  const codingAnswer = (partAnswer && typeof partAnswer === 'object') ? partAnswer : {};
                  const selectedLanguage = codingAnswer.language || allowedLanguages[0];
                  const starterCode = coding.starter_code_by_language?.[selectedLanguage] || '';
                  const codeValue = codingAnswer.code ?? starterCode;

                  return (
                    <div key={part.part_id || idx} style={{
                      borderTop: idx > 0 ? '1px solid #e5e7eb' : 'none',
                      paddingTop: idx > 0 ? '1.25rem' : 0
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '0.65rem' }}>
                        <div style={{ fontWeight: 700, color: '#374151' }}>
                          {part.label || `Part ${String.fromCharCode(65 + idx)}`}
                        </div>
                        {isPreviewMode && (
                          <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                            {maxPoints} pts
                          </span>
                        )}
                      </div>
                      {part.prompt && (
                        <div style={{ marginBottom: '0.75rem', color: '#1f2937' }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}
                            components={{ p: ({children}) => <p style={{ margin: '0 0 0.5rem 0' }}>{children}</p> }}
                          >
                            {part.prompt}
                          </ReactMarkdown>
                        </div>
                      )}
                      {isAuto && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {choices.map((choice, choiceIndex) => {
                            const value = choice.id || choice.text;
                            const isSelected = partAnswer === value || partAnswer === choice.text;
                            return (
                              <button
                                key={choice.id || choiceIndex}
                                type="button"
                                onClick={() => handlePartAnswer(currentQuestion, part.part_id, value)}
                                disabled={isReadOnly}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.75rem',
                                  padding: '0.75rem 1rem',
                                  borderRadius: '8px',
                                  cursor: isReadOnly ? 'default' : 'pointer',
                                  border: isSelected ? '2px solid #4f46e5' : '2px solid #e5e7eb',
                                  background: isSelected ? '#eef2ff' : 'white',
                                  textAlign: 'left',
                                  fontSize: '0.95rem'
                                }}
                              >
                                <span style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '50%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: isSelected ? '#4f46e5' : '#f3f4f6',
                                  color: isSelected ? 'white' : '#6b7280',
                                  fontWeight: 700,
                                  fontSize: '0.8rem',
                                  flexShrink: 0
                                }}>
                                  {choice.id || String.fromCharCode(65 + choiceIndex)}
                                </span>
                                <span>{choice.text}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {isText && isPreviewMode && Array.isArray(part.rubric) && part.rubric.length > 0 && (
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                          Rubric (instructors only):
                          {part.rubric.map((level, levelIndex) => (
                            <div key={levelIndex} style={{ marginTop: '0.2rem' }}>
                              <span style={{ fontWeight: 700 }}>+{level.points}:</span> {level.criteria || '-'}
                            </div>
                          ))}
                        </div>
                      )}
                      {isText && (
                        <textarea
                          style={{ ...styles.textArea, minHeight: part.type === 'short_answer' ? '90px' : '130px' }}
                          placeholder={`Enter your response for ${part.label || `Part ${String.fromCharCode(65 + idx)}`}...`}
                          value={partAnswer || ''}
                          onChange={(e) => {
                            recordTextInput(currentQuestion, part.part_id, partAnswer || '', e.target.value);
                            handlePartAnswer(currentQuestion, part.part_id, e.target.value);
                          }}
                          {...textTelemetryProps(currentQuestion, part.part_id, partAnswer || '')}
                          disabled={isReadOnly}
                          onFocus={(e) => e.target.style.borderColor = '#4f46e5'}
                          onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                        />
                      )}
                      {isCoding && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <label style={{ fontWeight: 700, color: '#374151' }}>Language</label>
                            <select
                              value={selectedLanguage}
                              disabled={isReadOnly}
                              onChange={(e) => {
                                const nextLanguage = e.target.value;
                                const nextStarter = coding.starter_code_by_language?.[nextLanguage] || '';
                                handleCodingAnswer(currentQuestion, part.part_id, {
                                  language: nextLanguage,
                                  code: codingAnswer.code ?? nextStarter
                                });
                              }}
                              style={{ padding: '0.55rem 0.7rem', border: '2px solid #e5e7eb', borderRadius: '8px', background: 'white' }}
                            >
                              {allowedLanguages.map((language) => (
                                <option key={language} value={language}>{language === 'cpp' ? 'C++' : 'Python'}</option>
                              ))}
                            </select>
                          </div>
                          <textarea
                            style={{ ...styles.textArea, minHeight: '260px', fontFamily: 'monospace', fontSize: '0.92rem' }}
                            placeholder="Write your solution here..."
                            value={codeValue}
                            onChange={(e) => {
                              recordTextInput(currentQuestion, part.part_id, codeValue, e.target.value);
                              handleCodingAnswer(currentQuestion, part.part_id, { language: selectedLanguage, code: e.target.value });
                            }}
                            {...textTelemetryProps(currentQuestion, part.part_id, codeValue)}
                            disabled={isReadOnly}
                            onFocus={(e) => e.target.style.borderColor = '#4f46e5'}
                            onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                          />
                          {(coding.tests || []).filter(test => test.visibility === 'visible').length > 0 && (
                            <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                              <div style={{ background: '#f8fafc', padding: '0.6rem 0.75rem', fontWeight: 700, color: '#374151' }}>Sample tests</div>
                              {(coding.tests || []).filter(test => test.visibility === 'visible').map((test, testIndex) => (
                                <div key={testIndex} style={{ padding: '0.75rem', borderTop: testIndex > 0 ? '1px solid #e5e7eb' : 'none' }}>
                                  <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>{test.name || `Sample ${testIndex + 1}`}</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                    <div>
                                      <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 700 }}>{test.mode === 'python_harness' ? 'Check' : 'Input'}</div>
                                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', background: '#f3f4f6', padding: '0.55rem', borderRadius: '6px' }}>{test.mode === 'python_harness' ? (test.harness || 'Python harness') : (test.input || '(empty)')}</pre>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 700 }}>Expected output</div>
                                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', background: '#f3f4f6', padding: '0.55rem', borderRadius: '6px' }}>{test.expected_output || '(empty)'}</pre>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!hasStructuredParts && isMCQ && (
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
                          <span style={{ marginLeft: 'auto', color: '#10b981' }}>✓</span>
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

            {!hasStructuredParts && isShortAnswer && rubricParts.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={styles.answerLabel}>Your answer:</div>
                  {isPreviewMode && (
                    <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {rubricParts.reduce((sum, p) => {
                        const levels = p.rubric_levels || [];
                        const maxPts = levels.length > 0 ? Math.max(...levels.map(l => parseInt(l.points) || 0)) : (parseInt(p.points) || 0);
                        return sum + maxPts;
                      }, 0)} points total
                    </span>
                  )}
                </div>
                {isPreviewMode && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem', fontWeight: '600' }}>
                      Grading rubric (visible to instructors only):
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                      {rubricParts.flatMap((part, partIdx) => {
                        const levels = part.rubric_levels || [];
                        if (levels.length > 0) {
                          return levels.map((l, i) => (
                            <div key={`${partIdx}-${i}`} style={{ fontSize: '0.8rem', color: '#4b5563', padding: '0.5rem', background: '#f9fafb', borderRadius: '4px' }}>
                              <span style={{ fontWeight: '600' }}>+{l.points || 0} pts:</span> {l.criteria || '—'}
                            </div>
                          ));
                        }
                        return (
                          <div key={partIdx} style={{ fontSize: '0.8rem', color: '#4b5563', padding: '0.5rem', background: '#f9fafb', borderRadius: '4px' }}>
                            <span style={{ fontWeight: '600' }}>+{part.points || 0} pts:</span> {part.rubric_text || '—'}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <textarea
                  style={styles.textArea}
                  placeholder="Enter your short answer..."
                  value={selectedAnswer || ''}
                  onChange={(e) => {
                    recordTextInput(currentQuestion, null, selectedAnswer || '', e.target.value);
                    handleTextAnswer(currentQuestion.id, e.target.value);
                  }}
                  {...textTelemetryProps(currentQuestion, null, selectedAnswer || '')}
                  disabled={isReadOnly}
                  onFocus={(e) => e.target.style.borderColor = '#4f46e5'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                />
              </>
            )}

            {!hasStructuredParts && isFreeResponse && rubricParts.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={styles.answerLabel}>Your response:</div>
                  {isPreviewMode && (
                    <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
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
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
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
                          recordTextInput(currentQuestion, idx, partAnswer || '', e.target.value);
                          const newParts = typeof selectedAnswer === 'object' ? { ...selectedAnswer } : {};
                          newParts[idx] = e.target.value;
                          handleTextAnswer(currentQuestion.id, newParts);
                        }}
                        {...textTelemetryProps(currentQuestion, idx, partAnswer || '')}
                        disabled={isReadOnly}
                        onFocus={(e) => e.target.style.borderColor = '#4f46e5'}
                        onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                      />
                    </div>
                  );
                })}
              </>
            )}

            {!hasStructuredParts && (isFreeResponse || isShortAnswer) && rubricParts.length === 0 && (
              <>
                <div style={styles.answerLabel}>Your response:</div>
                <textarea
                  style={styles.textArea}
                  placeholder="Type your answer here..."
                  value={selectedAnswer || ''}
                  onChange={(e) => {
                    recordTextInput(currentQuestion, null, selectedAnswer || '', e.target.value);
                    handleTextAnswer(currentQuestion.id, e.target.value);
                  }}
                  {...textTelemetryProps(currentQuestion, null, selectedAnswer || '')}
                  disabled={isReadOnly}
                  onFocus={(e) => e.target.style.borderColor = '#4f46e5'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                />
              </>
            )}

            {!hasStructuredParts && isMultipart && (() => {
              const subQs = subQuestionsCache[currentQuestion.id] || [];
              const loadingSubQs = subQuestionsLoading[currentQuestion.id];
              const containerAns = answers[currentQuestion.id];
              const subAnswers = (typeof containerAns === 'object' && containerAns !== null) ? containerAns : {};

              if (loadingSubQs) {
                return <div style={{ color: '#6b7280', padding: '1rem 0' }}>Loading sub-questions...</div>;
              }

              if (!subQs.length) {
                return <div style={{ color: '#9ca3af', padding: '1rem 0' }}>No sub-questions found.</div>;
              }

              return (
                <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
                  {subQs.map((subQ, idx) => {
                    const subType = (subQ.question_type || '').toLowerCase();
                    const subChoices = (() => { try { return JSON.parse(subQ.answer_choices || '[]'); } catch { return []; } })();
                    const subIsMCQ = subType === 'mcq' || subType === 'true_false' || (subChoices.length > 0 && typeof subChoices[0] === 'string');
                    const subIsText = subType === 'fr' || subType === 'short_answer';
                    const subAns = subAnswers[subQ.id];

                    const handleSubSelect = (val) => {
                      if (isReadOnly) return;
                      setAnswers(prev => {
                        const existing = (typeof prev[currentQuestion.id] === 'object' && prev[currentQuestion.id] !== null) ? prev[currentQuestion.id] : {};
                        const next = { ...prev, [currentQuestion.id]: { ...existing, [subQ.id]: val } };
                        if (onAnswersChange) onAnswersChange(next);
                        return next;
                      });
                    };

                    return (
                      <div key={subQ.id} style={{
                        borderBottom: idx < subQs.length - 1 ? '1px solid #e5e7eb' : 'none',
                        paddingBottom: '1.5rem',
                        marginBottom: '1.5rem',
                      }}>
                        <div style={{ fontWeight: '600', color: '#374151', marginBottom: '0.5rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Part {String.fromCharCode(65 + idx)}
                        </div>
                        {subQ.title && (
                          <div style={{ fontWeight: '600', fontSize: '1rem', marginBottom: '0.5rem' }}>{subQ.title}</div>
                        )}
                        <div style={{ marginBottom: '0.75rem', color: '#1f2937' }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}
                            components={{ p: ({children}) => <p style={{ margin: '0 0 0.5rem 0' }}>{children}</p> }}
                          >
                            {subQ.text}
                          </ReactMarkdown>
                        </div>
                        {subIsMCQ && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {subChoices.map((choice, cIdx) => {
                              const isSelected = subAns === choice;
                              return (
                                <button key={cIdx}
                                  onClick={() => handleSubSelect(choice)}
                                  disabled={isReadOnly}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                                    padding: '0.75rem 1rem', borderRadius: '8px', cursor: isReadOnly ? 'default' : 'pointer',
                                    border: isSelected ? '2px solid #4f46e5' : '2px solid #e5e7eb',
                                    background: isSelected ? '#eef2ff' : 'white',
                                    textAlign: 'left', fontSize: '0.95rem',
                                  }}
                                >
                                  <span style={{
                                    width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: isSelected ? '#4f46e5' : '#f3f4f6', color: isSelected ? 'white' : '#6b7280',
                                    fontWeight: '600', fontSize: '0.8rem', flexShrink: 0,
                                  }}>
                                    {String.fromCharCode(65 + cIdx)}
                                  </span>
                                  <span>{choice}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {subIsText && (
                          <textarea
                            style={{ ...styles.textArea, minHeight: '80px' }}
                            placeholder="Type your answer..."
                            value={typeof subAns === 'string' ? subAns : ''}
                            onChange={(e) => {
                              recordTextInput(currentQuestion, subQ.id, typeof subAns === 'string' ? subAns : '', e.target.value);
                              handleSubSelect(e.target.value);
                            }}
                            {...textTelemetryProps(currentQuestion, subQ.id, typeof subAns === 'string' ? subAns : '')}
                            disabled={isReadOnly}
                            onFocus={(e) => e.target.style.borderColor = '#4f46e5'}
                            onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {!isMCQ && !isFreeResponse && !isShortAnswer && !isMultipart && (
              <>
                <div style={styles.answerLabel}>Your answer:</div>
                <textarea
                  style={styles.textArea}
                  placeholder="Type your answer here..."
                  value={selectedAnswer || ''}
                  onChange={(e) => {
                    recordTextInput(currentQuestion, null, selectedAnswer || '', e.target.value);
                    handleTextAnswer(currentQuestion.id, e.target.value);
                  }}
                  {...textTelemetryProps(currentQuestion, null, selectedAnswer || '')}
                  disabled={isReadOnly}
                  onFocus={(e) => e.target.style.borderColor = '#4f46e5'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
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
                  onMouseEnter={(e) => e.currentTarget.style.background = '#059669'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#10b981'}
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
                  if (!isLastQuestion) e.currentTarget.style.background = '#4338ca';
                }}
                onMouseLeave={(e) => {
                  if (!isLastQuestion) e.currentTarget.style.background = '#4f46e5';
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
