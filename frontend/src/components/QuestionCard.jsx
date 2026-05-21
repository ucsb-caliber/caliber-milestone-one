import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { getQuestionCodingConfig, isCodingQuestion } from '../utils/coding';
import { dashboardPalette } from './CourseDashboardUI';

const KEYWORD_COLORS = [dashboardPalette.navyLight, '#eaf1f8', '#eef4fa', '#fff3cc', '#f4f7fb'];
const TAG_COLORS = ['#eef4fa', '#f4f7fb', '#fff3cc', '#eaf1f8', dashboardPalette.navyLight];

const actionButtonBase = {
  padding: '0.375rem 0.75rem',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontWeight: '600',
  transition: 'border-color 0.15s ease, background-color 0.15s ease',
};

const actionButtonStyles = {
  primary: {
    ...actionButtonBase,
    background: dashboardPalette.navy,
    color: dashboardPalette.white,
    border: `1px solid ${dashboardPalette.navy}`,
  },
  secondary: {
    ...actionButtonBase,
    background: dashboardPalette.white,
    color: dashboardPalette.text,
    border: `1px solid ${dashboardPalette.border}`,
  },
  accent: {
    ...actionButtonBase,
    background: dashboardPalette.gold,
    color: dashboardPalette.navy,
    border: `1px solid ${dashboardPalette.goldDark}`,
  },
  danger: {
    ...actionButtonBase,
    background: dashboardPalette.white,
    color: dashboardPalette.dangerText,
    border: `1px solid ${dashboardPalette.dangerBorder}`,
  },
};

const compactMenuButtonStyle = {
  width: '32px',
  height: '32px',
  borderRadius: '8px',
  border: `1px solid ${dashboardPalette.border}`,
  background: dashboardPalette.white,
  color: dashboardPalette.muted,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1rem',
  lineHeight: 1
};

const compactMenuPanelStyle = {
  position: 'absolute',
  right: 0,
  bottom: 'calc(100% + 8px)',
  minWidth: '180px',
  background: dashboardPalette.white,
  border: `1px solid ${dashboardPalette.border}`,
  borderRadius: '8px',
  padding: '0.35rem',
  zIndex: 20
};

const compactMenuItemStyle = {
  width: '100%',
  padding: '0.5rem 0.65rem',
  border: 'none',
  borderRadius: '6px',
  background: 'transparent',
  color: dashboardPalette.text,
  textAlign: 'left',
  fontSize: '0.82rem',
  fontWeight: 600,
  cursor: 'pointer'
};

const stripMarkdown = (value = '') =>
  value
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_>#~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const truncateText = (value, maxLength) => {
  if (!value || value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}...`;
};

const formatRelativeEditTime = (value) => {
  if (!value) return 'recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'recently';

  const diffMs = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < hour) {
    const minutes = Math.max(1, Math.floor(diffMs / minute));
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (diffMs < day) {
    const hours = Math.max(1, Math.floor(diffMs / hour));
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (diffMs < day * 2) {
    return 'yesterday';
  }
  if (diffMs < day * 7) {
    const days = Math.max(2, Math.floor(diffMs / day));
    return `${days} days ago`;
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
};

const getCompactBadges = (question, tags, keywords) => {
  const items = [];
  if (question.course) items.push(question.course);
  tags.forEach((tag) => items.push(tag));
  keywords.forEach((keyword) => items.push(keyword));
  if (items.length === 0 && question.question_type) items.push(question.question_type);
  return items
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index)
    .slice(0, 3);
};

// User Icon Component
const UserIcon = ({ userInfo, size = 40 }) => {
  if (!userInfo) return null;

  const getInitials = () => {
    if (userInfo.initials) return userInfo.initials;
    if (userInfo.first_name && userInfo.last_name) {
      return `${userInfo.first_name[0]}${userInfo.last_name[0]}`.toUpperCase();
    }
    if (userInfo.email) {
      return userInfo.email.substring(0, 2).toUpperCase();
    }
    return 'U';
  };

  const getName = () => {
    if (userInfo.first_name && userInfo.last_name) {
      return `${userInfo.first_name} ${userInfo.last_name}`;
    }
    return userInfo.email || userInfo.user_id;
  };

  const shape = userInfo.icon_shape || 'circle';
  const color = userInfo.icon_color || dashboardPalette.navy;

  const getShapeStyles = () => {
    if (shape === 'circle') {
      return { borderRadius: '50%' };
    } else if (shape === 'square') {
      return { borderRadius: '4px' };
    } else if (shape === 'hex') {
      return {
        clipPath: 'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0% 50%)'
      };
    }
    return { borderRadius: '50%' };
  };

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: color,
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${size / 2.5}px`,
        fontWeight: 700,
        ...getShapeStyles(),
        flexShrink: 0
      }}
      title={getName()}
      aria-label={`Question created by ${getName()}`}
      role="img"
    >
      {getInitials()}
    </div>
  );
};

/**
 * QuestionCard - A reusable component to display a question
 * 
 * Props:
 * - question: The question object
 * - userInfo: The user info object for displaying the creator icon (optional)
 * - imageUrl: The signed URL for the question image (optional)
 * - showDeleteButton: Whether to show the delete button (default: false)
 * - showEditButton: Whether to show the edit button (default: false)
 * - showRemoveButton: Whether to show the remove button for assignments (default: false)
 * - onDelete: Callback when delete button is clicked
 * - onEdit: Callback when edit button is clicked
 * - onRemove: Callback when remove button is clicked (for assignments)
 * - compact: Whether to use compact view (default: false)
 * - showUserIcon: Whether to show the user icon (default: true)
 * - questionNumber: Optional question number to display (e.g., "Q1")
 * - editButtonLabel: Custom label for edit button (default: "Edit")
 */
export default function QuestionCard({
  question,
  userInfo,
  imageUrl,
  dragHandleProps,
  showDeleteButton = false,
  showEditButton = false,
  showRemoveButton = false,
  showStudentViewButton = false,
  showVariantButton = false,
  showApproveButton = false,
  actionLoading = false,
  variantLoading = false,
  onDelete,
  onEdit,
  onRemove,
  onStudentView,
  onGenerateVariant,
  onApproveDraft,
  compact = false,
  showUserIcon = true,
  questionNumber,
  editButtonLabel = 'Edit', 
  showCourseType = true, 
  showSchool = true, 
  showKeywords = true,
  scale = 1,
}) {
  let answerChoices = [];
  try {
    answerChoices = JSON.parse(question.answer_choices || '[]');
  } catch (e) {
    answerChoices = [];
  }

  const formatChoiceForDisplay = (choice) => {
    if (choice === null || choice === undefined) return '';
    if (typeof choice === 'string' || typeof choice === 'number' || typeof choice === 'boolean') {
      return String(choice);
    }
    if (Array.isArray(choice)) {
      return choice.map((item) => formatChoiceForDisplay(item)).filter(Boolean).join(', ');
    }
    if (typeof choice === 'object') {
      if (choice.part_label || choice.rubric_levels) {
        const part = choice.part_label ? `Part ${choice.part_label}` : 'Part';
        const levelsCount = Array.isArray(choice.rubric_levels) ? choice.rubric_levels.length : 0;
        return `${part} rubric (${levelsCount} levels)`;
      }
      try {
        return JSON.stringify(choice);
      } catch (e) {
        return '[Object]';
      }
    }
    return String(choice);
  };

  const keywords = question.keywords ? question.keywords.split(',').map(k => k.trim()).filter(k => k) : [];
  const tags = question.tags ? question.tags.split(',').map(t => t.trim()).filter(t => t) : [];
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef(null);

  const handleEdit = (e) => {
    if (e) e.stopPropagation();
    if (onEdit) {
      onEdit(question);
    } else {
      const returnTo = encodeURIComponent(window.location.hash.replace(/^#/, '') || 'questions');
      window.location.hash = `edit-question?id=${question.id}&returnTo=${returnTo}`;
    }
  };

  React.useEffect(() => {
    if (!menuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [menuOpen]);

  const hasActions =
    showStudentViewButton ||
    showVariantButton ||
    showApproveButton ||
    showDeleteButton ||
    showEditButton ||
    showRemoveButton;

  const compactTitle = question.title || truncateText(stripMarkdown(question.text || ''), 62) || 'Untitled Question';
  const compactExcerpt = truncateText(stripMarkdown(question.text || ''), question.title ? 138 : 110);
  const compactBadges = getCompactBadges(question, tags, keywords);
  const compactEditedLabel = formatRelativeEditTime(question.updated_at || question.created_at);
  const compactMenuActions = [
    showEditButton ? {
      label: editButtonLabel,
      disabled: actionLoading,
      onClick: () => handleEdit(),
    } : null,
    showStudentViewButton ? {
      label: 'Student View',
      onClick: () => onStudentView?.(question),
    } : null,
    showVariantButton && onGenerateVariant ? {
      label: variantLoading ? 'Generating...' : 'Generate Variant',
      disabled: actionLoading || variantLoading,
      onClick: () => onGenerateVariant(question),
    } : null,
    showApproveButton && onApproveDraft ? {
      label: 'Approve',
      disabled: actionLoading,
      onClick: () => onApproveDraft(question),
    } : null,
    showRemoveButton && onRemove ? {
      label: 'Remove',
      disabled: actionLoading,
      onClick: () => onRemove(question.id),
      tone: 'danger',
    } : null,
    showDeleteButton && onDelete ? {
      label: 'Delete',
      disabled: actionLoading,
      onClick: () => onDelete(question.id),
      tone: 'danger',
    } : null,
  ].filter(Boolean);

  if (compact) {
    return (
      <div
        style={{
          border: `1px solid ${dashboardPalette.border}`,
          borderRadius: '8px',
          padding: '1.25rem 1.25rem 1rem',
          background: dashboardPalette.white,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          minHeight: '272px',
          height: '100%'
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              color: dashboardPalette.navy,
              fontSize: '1rem',
              fontWeight: 700,
              lineHeight: 1.35,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}
          >
            {compactTitle}
          </h3>
          <p
            style={{
              margin: '0.9rem 0 0',
              color: dashboardPalette.text,
              fontSize: '0.95rem',
              lineHeight: 1.55,
              minHeight: '4.65rem',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}
          >
            {compactExcerpt || 'No description available.'}
          </p>
        </div>

        <div style={{ marginTop: '1.25rem' }}>
          {compactBadges.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
              {compactBadges.map((badge, index) => (
                <span
                  key={`${badge}-${index}`}
                  style={{
                    background: index % 2 === 0 ? dashboardPalette.surface : '#eef4fa',
                    color: dashboardPalette.muted,
                    padding: '0.38rem 0.6rem',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    lineHeight: 1,
                    border: `1px solid ${dashboardPalette.border}`
                  }}
                >
                  {badge}
                </span>
              ))}
            </div>
          ) : (
            <div style={{ height: '1rem', marginBottom: '1rem' }} />
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.75rem',
              paddingTop: '0.85rem',
              borderTop: `1px solid ${dashboardPalette.border}`,
              position: 'relative'
            }}
          >
            <span style={{ color: dashboardPalette.muted, fontSize: '0.88rem', lineHeight: 1.4 }}>
              Last edited {compactEditedLabel}
            </span>
            {hasActions ? (
              <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuOpen((open) => !open);
                  }}
                  style={compactMenuButtonStyle}
                  aria-label="Open question actions"
                >
                  ⋮
                </button>
                {menuOpen ? (
                  <div style={compactMenuPanelStyle}>
                    {compactMenuActions.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (item.disabled) return;
                          setMenuOpen(false);
                          item.onClick();
                        }}
                        disabled={item.disabled}
                        style={{
                          ...compactMenuItemStyle,
                          color: item.tone === 'danger' ? dashboardPalette.dangerText : dashboardPalette.text,
                          opacity: item.disabled ? 0.6 : 1,
                          cursor: item.disabled ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        border: `1px solid ${dashboardPalette.border}`,
        borderRadius: '8px',
        padding: compact ? '1rem' : '1.25rem',
        background: dashboardPalette.white,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        breakInside: 'avoid',
        marginBottom: '0',
        overflow: 'hidden',
        height: '100%', 
        zoom: scale,
      }}
    >

      {/* Drag Handle - Add this as the FIRST element */}
      {dragHandleProps && (
        <div 
          {...dragHandleProps}
          style={{
            padding: '0.75rem',
            cursor: 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: dashboardPalette.surface,
            borderBottom: `1px solid ${dashboardPalette.border}`,
            fontSize: '1.2rem',
            color: dashboardPalette.muted,
            userSelect: 'none',
            touchAction: 'none' // Prevent scrolling on touch devices
          }}
        >
          <span style={{ letterSpacing: '-2px', fontWeight: 'bold' }}>⋮⋮</span>
        </div>
      )}

      {/* User Icon in top right corner */}
      {showUserIcon && userInfo && (
        <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
          <UserIcon userInfo={userInfo} size={compact ? 32 : 40} />
        </div>
      )}

      {/* Question number badge if provided */}
      {questionNumber && (
        <div style={{
          position: 'absolute',
          top: '1rem',
          left: '1rem',
          fontSize: '0.75rem',
          fontWeight: '600',
          color: dashboardPalette.muted,
          background: dashboardPalette.surface,
          border: `1px solid ${dashboardPalette.border}`,
          padding: '0.125rem 0.5rem',
          borderRadius: '4px'
        }}>
          {questionNumber}
        </div>
      )}

      {/* Header with school, course, and metadata */}
      <div style={{
        marginBottom: compact ? '0.75rem' : '1rem',
        paddingBottom: '0.75rem',
        borderBottom: `1px solid ${dashboardPalette.border}`,
        paddingRight: showUserIcon ? '50px' : '0',
        paddingTop: questionNumber ? '1.5rem' : '0'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {showSchool && question.school && (
            <span style={{
              background: dashboardPalette.surface,
              color: dashboardPalette.text,
              padding: '0.25rem 0.65rem',
              borderRadius: '6px',
              border: `1px solid ${dashboardPalette.border}`,
              fontSize: '0.8rem',
              fontWeight: 600
            }}>
              {question.school}
            </span>
          )}
          {question.course && (
            <span style={{
              background: dashboardPalette.navyLight,
              color: dashboardPalette.navy,
              padding: '0.25rem 0.65rem',
              borderRadius: '6px',
              border: `1px solid ${dashboardPalette.border}`,
              fontSize: '0.8rem',
              fontWeight: 600
            }}>
              {question.course}
            </span>
          )}
          {showCourseType && question.course_type && (
            <span style={{
              background: dashboardPalette.surface,
              color: dashboardPalette.muted,
              padding: '0.25rem 0.65rem',
              borderRadius: '6px',
              border: `1px solid ${dashboardPalette.border}`,
              fontSize: '0.8rem',
              fontWeight: 600
            }}>
              {question.course_type}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {question.question_type && (
            <span style={{
              background: dashboardPalette.gold,
              color: dashboardPalette.navy,
              padding: '0.2rem 0.55rem',
              borderRadius: '6px',
              border: `1px solid ${dashboardPalette.goldDark}`,
              fontSize: '0.75rem',
              fontWeight: 700
            }}>
              {question.question_type}
            </span>
          )}
          {question.blooms_taxonomy && (
            <span style={{
              background: dashboardPalette.surface,
              color: dashboardPalette.text,
              padding: '0.2rem 0.55rem',
              borderRadius: '6px',
              border: `1px solid ${dashboardPalette.border}`,
              fontSize: '0.75rem',
              fontWeight: 600
            }}>
              Bloom's: {question.blooms_taxonomy}
            </span>
          )}
        </div>

        {question.title && (
          <div style={{ marginBottom: '0.9rem', marginTop: '0.35rem' }}>
            <h3 style={{
              margin: 0,
              fontSize: compact ? '1.1rem' : '1.3rem',
              fontWeight: 700,
              color: dashboardPalette.navy,
              lineHeight: '1.35',
            }}>
              {question.title}
            </h3>
          </div>
        )}

        {showKeywords && keywords.length > 0 && (
          <div style={{ marginBottom: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            <strong style={{ fontSize: '0.75rem', color: dashboardPalette.muted, marginRight: '0.25rem' }}>Keywords:</strong>
            {keywords.map((keyword, index) => (
              <span
                key={index}
                style={{
                  background: KEYWORD_COLORS[index % KEYWORD_COLORS.length],
                  color: dashboardPalette.text,
                  padding: '0.2rem 0.55rem',
                  borderRadius: '6px',
                  fontSize: '0.7rem',
                  fontWeight: '500',
                  border: `1px solid ${dashboardPalette.border}`
                }}
              >
                {keyword}
              </span>
            ))}
          </div>
        )}
        {tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            <strong style={{ fontSize: '0.75rem', color: dashboardPalette.muted, marginRight: '0.25rem' }}>Tags:</strong>
            {tags.map((tag, index) => (
              <span
                key={index}
                style={{
                  background: TAG_COLORS[index % TAG_COLORS.length],
                  color: dashboardPalette.text,
                  padding: '0.2rem 0.55rem',
                  borderRadius: '6px',
                  fontSize: '0.7rem',
                  fontWeight: '500',
                  border: `1px solid ${dashboardPalette.border}`
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Question text with markdown rendering */}
      <div style={{ marginBottom: compact ? '0.75rem' : '1rem' }}>
        {(() => {
          try {
            return (
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  code({ node, inline, className, children, ...props }) {
                    return inline ? (
                      <code style={{
                        background: dashboardPalette.surface,
                        padding: '0.2rem 0.4rem',
                        borderRadius: '3px',
                        fontSize: '0.9em',
                        fontFamily: 'monospace',
                        color: dashboardPalette.text
                      }} {...props}>
                        {children}
                      </code>
                    ) : (
                      <pre style={{
                        background: dashboardPalette.surface,
                        color: dashboardPalette.text,
                        padding: '1rem',
                        borderRadius: '8px',
                        overflow: 'auto',
                        fontSize: '0.875rem',
                        border: `1px solid ${dashboardPalette.border}`,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                      }}>
                        <code className={className} style={{ fontFamily: 'monospace' }} {...props}>
                          {children}
                        </code>
                      </pre>
                    );
                  },
                  p({ children }) {
                    return <p style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', lineHeight: '1.5', color: dashboardPalette.text }}>{children}</p>;
                  }
                }}
              >
                {question.text}
              </ReactMarkdown>
            );
          } catch (error) {
            console.error('Error rendering markdown:', error);
            return <p style={{ margin: 0, fontSize: '1rem', lineHeight: '1.5', color: dashboardPalette.text }}>{question.text}</p>;
          }
        })()}
      </div>

      {/* Image if present */}
      {(question.image_url && imageUrl) && (
        <div style={{ marginBottom: compact ? '0.75rem' : '1rem' }}>
          <img
            src={imageUrl}
            alt="Question illustration"
            style={{
              maxWidth: '100%',
              height: 'auto',
              maxHeight: compact ? '200px' : '300px',
              border: `1px solid ${dashboardPalette.border}`,
              borderRadius: '8px',
              objectFit: 'contain'
            }}
          />
        </div>
      )}

      {/* Answer section - varies by question type */}
      {(() => {
        const questionType = question.question_type?.toLowerCase();
        const isMCQ = questionType === 'mcq' || questionType === 'true_false';
        const isFR = questionType === 'fr';
        const isShortAnswer = questionType === 'short_answer';
        const isCoding = isCodingQuestion(questionType);

        // For MCQ/True-False: show answer choices
        if (isMCQ && answerChoices.length > 0) {
          return (
            <div style={{ marginBottom: compact ? '0.75rem' : '1rem' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: '700', marginBottom: '0.5rem', color: dashboardPalette.navy }}>
                Answer Choices:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {answerChoices.map((choice, index) => {
                  const choiceDisplay = formatChoiceForDisplay(choice);
                  const isCorrect = choiceDisplay === String(question.correct_answer ?? '');
                  return (
                    <div
                      key={index}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '8px',
                        border: isCorrect ? `1px solid ${dashboardPalette.goldDark}` : `1px solid ${dashboardPalette.border}`,
                        background: isCorrect ? '#fff9e6' : dashboardPalette.surface,
                        fontSize: '0.875rem',
                        position: 'relative',
                        color: dashboardPalette.text
                      }}
                    >
                      {choiceDisplay}
                      {isCorrect && (
                        <span style={{
                          marginLeft: '0.5rem',
                          color: dashboardPalette.navy,
                          fontWeight: 700,
                          fontSize: '0.75rem'
                        }}>
                          ✓ Correct
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        // For Free Response and Short Answer: show rubric parts
        // For Short Answer: show inline input + valid answers (new format)
if (isShortAnswer) {
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

  return (
    <div style={{ marginBottom: compact ? '0.75rem' : '1rem' }}>
      {/* Inline answer input */}
      <div style={{ marginBottom: '0.75rem' }}>
        <label style={{
          display: 'block',
          fontSize: '0.8rem',
          fontWeight: 700,
          color: dashboardPalette.muted,
          marginBottom: '0.4rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }}>
          Your answer
          {restriction !== 'any' && (
            <span style={{
              marginLeft: '0.5rem',
              fontSize: '0.7rem',
              fontWeight: 600,
              background: dashboardPalette.navyLight,
              color: dashboardPalette.navy,
              padding: '1px 6px',
              borderRadius: '4px',
              textTransform: 'none',
              letterSpacing: 0
            }}>
              {restriction === 'numbers' ? 'numbers only' : 'letters only'}
            </span>
          )}
        </label>
        <input
          type={inputType}
          placeholder="Type your answer here…"
          style={{
            width: '100%',
            maxWidth: '360px',
            padding: '0.5rem 0.75rem',
            borderRadius: '8px',
            border: `1px solid ${dashboardPalette.border}`,
            fontSize: '0.95rem',
            color: dashboardPalette.text,
            background: dashboardPalette.white,
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
      </div>

      {/* Valid answers — instructor view */}
      {saConfig?.valid_answers?.length > 0 && (
        <div style={{
          padding: '0.65rem 0.75rem',
          background: dashboardPalette.surface,
          border: `1px solid ${dashboardPalette.border}`,
          borderRadius: '8px',
          fontSize: '0.82rem'
        }}>
          <div style={{ fontWeight: 700, color: dashboardPalette.navy, marginBottom: '0.4rem' }}>
            Valid answers:
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
    </div>
  );
}

// For Short Answer: show inline input + valid answers (new format)
if (isFR && answerChoices.length > 0 && typeof answerChoices[0] === 'object') {
  const getPartMaxPoints = (p) => {
    const levels = p.rubric_levels || [];
    if (levels.length > 0) return Math.max(...levels.map(l => parseInt(l.points) || 0));
    return parseInt(p.points) || 0;
  };
  const totalPoints = answerChoices.reduce((sum, p) => sum + getPartMaxPoints(p), 0);
  return (
    <div style={{ marginBottom: compact ? '0.75rem' : '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div style={{ fontSize: '0.875rem', fontWeight: '700', color: dashboardPalette.navy }}>
          Parts & Rubric ({answerChoices.length} parts):
        </div>
        <span style={{ fontSize: '0.75rem', color: dashboardPalette.muted, fontWeight: '600' }}>
          {totalPoints} pts total
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {answerChoices.map((part, index) => {
          const levels = part.rubric_levels || [];
          const maxPts = levels.length > 0 ? Math.max(...levels.map(l => parseInt(l.points) || 0)) : (parseInt(part.points) || 0);
          return (
            <div
              key={index}
              style={{
                padding: '0.75rem',
                borderRadius: '8px',
                border: `1px solid ${dashboardPalette.border}`,
                background: dashboardPalette.surface,
                fontSize: '0.875rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ fontWeight: '600', color: dashboardPalette.text }}>
                  {part.part_label || `Part ${index + 1}`}
                </span>
                <span style={{ background: dashboardPalette.white, color: dashboardPalette.navy, padding: '2px 8px', borderRadius: '6px', border: `1px solid ${dashboardPalette.border}`, fontSize: '0.75rem', fontWeight: '600' }}>
                  {maxPts} pts max
                </span>
              </div>
              {levels.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  {levels.map((l, i) => (
                    <div key={i} style={{ fontSize: '0.8rem', color: dashboardPalette.muted, lineHeight: 1.3 }}>
                      <span style={{ fontWeight: '600', color: dashboardPalette.navy }}>+{l.points || 0}:</span> {l.criteria || '—'}
                    </div>
                  ))}
                </div>
              ) : part.rubric_text && (
                <p style={{ margin: 0, color: dashboardPalette.muted, fontSize: '0.8rem', lineHeight: 1.4 }}>{part.rubric_text}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

        if (isCoding) {
          const codingConfig = getQuestionCodingConfig(question);
          return (
            <div style={{ marginBottom: compact ? '0.75rem' : '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: '700', color: dashboardPalette.navy }}>
                  Coding Question
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <span style={{ background: dashboardPalette.navyLight, color: dashboardPalette.navy, padding: '2px 8px', borderRadius: '6px', border: `1px solid ${dashboardPalette.border}`, fontSize: '0.75rem', fontWeight: '700' }}>C++</span>
                  <span style={{ background: '#fff9e6', color: dashboardPalette.navy, padding: '2px 8px', borderRadius: '6px', border: `1px solid ${dashboardPalette.goldDark}`, fontSize: '0.75rem', fontWeight: '700' }}>{`${codingConfig.points || 1} pts`}</span>
                </div>
              </div>
              {codingConfig.function_signature && (
                <div style={{ fontSize: '0.84rem', color: dashboardPalette.text, marginBottom: '0.5rem', fontFamily: 'monospace' }}>
                  {codingConfig.function_signature}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {(codingConfig.visible_tests || []).map((test, index) => (
                  <div key={`${test.name}-${index}`} style={{ padding: '0.6rem 0.75rem', borderRadius: '8px', background: dashboardPalette.surface, border: `1px solid ${dashboardPalette.border}`, fontSize: '0.82rem' }}>
                    <div style={{ fontWeight: '700', color: dashboardPalette.text }}>{test.name || `Sample ${index + 1}`}</div>
                    {test.description && <div style={{ marginTop: '0.2rem', color: dashboardPalette.muted }}>{test.description}</div>}
                    {(test.input || test.output) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', marginTop: '0.45rem' }}>
                        <div style={{ background: dashboardPalette.white, border: `1px solid ${dashboardPalette.border}`, borderRadius: '8px', padding: '0.45rem 0.5rem' }}>
                          <div style={{ color: dashboardPalette.muted, fontSize: '0.7rem', fontWeight: '700', marginBottom: '0.2rem' }}>Input</div>
                          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: dashboardPalette.text }}>{test.input || '—'}</pre>
                        </div>
                        <div style={{ background: dashboardPalette.white, border: `1px solid ${dashboardPalette.border}`, borderRadius: '8px', padding: '0.45rem 0.5rem' }}>
                          <div style={{ color: dashboardPalette.muted, fontSize: '0.7rem', fontWeight: '700', marginBottom: '0.2rem' }}>Expected Output</div>
                          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: dashboardPalette.text }}>{test.output || '—'}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        }

        // Fallback for questions without specific type or old MCQ data
        if (answerChoices.length > 0 && typeof answerChoices[0] === 'string') {
          return (
            <div style={{ marginBottom: compact ? '0.75rem' : '1rem' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: '700', marginBottom: '0.5rem', color: dashboardPalette.navy }}>
                Answer Choices:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {answerChoices.map((choice, index) => {
                  const choiceDisplay = formatChoiceForDisplay(choice);
                  const isCorrect = choiceDisplay === String(question.correct_answer ?? '');
                  return (
                    <div
                      key={index}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '8px',
                        border: isCorrect ? `1px solid ${dashboardPalette.goldDark}` : `1px solid ${dashboardPalette.border}`,
                        background: isCorrect ? '#fff9e6' : dashboardPalette.surface,
                        fontSize: '0.875rem',
                        position: 'relative',
                        color: dashboardPalette.text
                      }}
                    >
                      {choiceDisplay}
                      {isCorrect && (
                        <span style={{
                          marginLeft: '0.5rem',
                          color: dashboardPalette.navy,
                          fontWeight: 700,
                          fontSize: '0.75rem'
                        }}>
                          ✓ Correct
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        return null;
      })()}

      {/* Action buttons */}
      {(showStudentViewButton || showVariantButton || showApproveButton || showDeleteButton || showEditButton || showRemoveButton) && (
        <div 
          onPointerDown={(e) => e.stopPropagation()}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem' }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {showStudentViewButton && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onStudentView) onStudentView(question);
                }}
                style={actionButtonStyles.secondary}
              >
                Student View
              </button>
            )}
            {showVariantButton && onGenerateVariant && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerateVariant(question);
                }}
                disabled={actionLoading || variantLoading}
                style={{ ...actionButtonStyles.secondary, color: dashboardPalette.navy, opacity: (actionLoading || variantLoading) ? 0.6 : 1, cursor: (actionLoading || variantLoading) ? 'not-allowed' : 'pointer' }}
              >
                {variantLoading ? 'Generating...' : 'Generate Variant'}
              </button>
            )}
            {showApproveButton && onApproveDraft && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onApproveDraft(question);
                }}
                disabled={actionLoading}
                style={{ ...actionButtonStyles.accent, opacity: actionLoading ? 0.6 : 1, cursor: actionLoading ? 'not-allowed' : 'pointer' }}
              >
                Approve
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            {showEditButton && (
              <button
                onClick={handleEdit}
                disabled={actionLoading}
                style={{ ...actionButtonStyles.primary, opacity: actionLoading ? 0.6 : 1, cursor: actionLoading ? 'not-allowed' : 'pointer' }}
              >
                {editButtonLabel}
              </button>
            )}
            {showRemoveButton && onRemove && (
                <button
                  onClick={(e) => {
                  e.stopPropagation();
                  onRemove(question.id);
                }}
                  disabled={actionLoading}
                  style={{ ...actionButtonStyles.danger, opacity: actionLoading ? 0.6 : 1, cursor: actionLoading ? 'not-allowed' : 'pointer' }}
              >
                Remove
              </button>
            )}
            {showDeleteButton && onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(question.id);
                }}
                style={actionButtonStyles.danger}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
