import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// Color palettes for keyword and tag bubbles
const KEYWORD_COLORS = ['#e3f2fd', '#f3e5f5', '#e8f5e9', '#fff3e0', '#fce4ec'];
const TAG_COLORS = ['#ffebee', '#e8eaf6', '#f1f8e9', '#fff8e1', '#fbe9e7'];

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
  const color = userInfo.icon_color || '#4f46e5';
  
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
        fontWeight: 'bold',
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
  showDeleteButton = false, 
  showEditButton = false,
  showRemoveButton = false,
  onDelete,
  onEdit,
  onRemove,
  compact = false,
  showUserIcon = true,
  questionNumber,
  editButtonLabel = 'Edit'
}) {
  let answerChoices = [];
  try {
    answerChoices = JSON.parse(question.answer_choices || '[]');
  } catch (e) {
    answerChoices = [];
  }

  const keywords = question.keywords ? question.keywords.split(',').map(k => k.trim()).filter(k => k) : [];
  const tags = question.tags ? question.tags.split(',').map(t => t.trim()).filter(t => t) : [];

  const handleEdit = () => {
    if (onEdit) {
      onEdit(question);
    } else {
      window.location.hash = `edit-question?id=${question.id}`;
    }
  };

  return (
    <div
      style={{
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: compact ? '1rem' : '1.25rem',
        background: 'white',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        breakInside: 'avoid',
        marginBottom: compact ? '0' : '1.5rem'
      }}
    >
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
          color: '#6b7280',
          background: '#e5e7eb',
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
        borderBottom: '1px solid #eee', 
        paddingRight: showUserIcon ? '50px' : '0',
        paddingTop: questionNumber ? '1.5rem' : '0'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {question.school && (
            <span style={{
              background: '#6f42c1',
              color: 'white',
              padding: '0.25rem 0.75rem',
              borderRadius: '4px',
              fontSize: '0.875rem',
              fontWeight: 'bold'
            }}>
              {question.school}
            </span>
          )}
          {question.course && (
            <span style={{
              background: '#007bff',
              color: 'white',
              padding: '0.25rem 0.75rem',
              borderRadius: '4px',
              fontSize: '0.875rem',
              fontWeight: 'bold'
            }}>
              {question.course}
            </span>
          )}
          {question.course_type && (
            <span style={{
              background: '#17a2b8',
              color: 'white',
              padding: '0.25rem 0.75rem',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}>
              {question.course_type}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {question.question_type && (
            <span style={{
              background: '#fd7e14',
              color: 'white',
              padding: '0.2rem 0.6rem',
              borderRadius: '4px',
              fontSize: '0.75rem'
            }}>
              {question.question_type.toUpperCase()}
            </span>
          )}
          {question.blooms_taxonomy && (
            <span style={{
              background: '#20c997',
              color: 'white',
              padding: '0.2rem 0.6rem',
              borderRadius: '4px',
              fontSize: '0.75rem'
            }}>
              Bloom's: {question.blooms_taxonomy}
            </span>
          )}
        </div>
        
        {question.title && (
          <div style={{ marginBottom: '0.9rem', marginTop: '0.35rem' }}>
            <h3 style={{
              margin: 0,
              fontSize: compact ? '1.25rem' : '1.5rem',
              fontWeight: 800,
              color: '#222',
              lineHeight: '1.35',
              letterSpacing: '-0.01em'
            }}>
              {question.title}
            </h3>
          </div>
        )}

        {keywords.length > 0 && (
          <div style={{ marginBottom: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            <strong style={{ fontSize: '0.75rem', color: '#666', marginRight: '0.25rem' }}>Keywords:</strong>
            {keywords.map((keyword, index) => (
              <span
                key={index}
                style={{
                  background: KEYWORD_COLORS[index % KEYWORD_COLORS.length],
                  color: '#333',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '12px',
                  fontSize: '0.7rem',
                  fontWeight: '500',
                  border: '1px solid rgba(0,0,0,0.1)'
                }}
              >
                {keyword}
              </span>
            ))}
          </div>
        )}
        {tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            <strong style={{ fontSize: '0.75rem', color: '#666', marginRight: '0.25rem' }}>Tags:</strong>
            {tags.map((tag, index) => (
              <span
                key={index}
                style={{
                  background: TAG_COLORS[index % TAG_COLORS.length],
                  color: '#333',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '12px',
                  fontSize: '0.7rem',
                  fontWeight: '500',
                  border: '1px solid rgba(0,0,0,0.1)'
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
                  code({node, inline, className, children, ...props}) {
                    return inline ? (
                      <code style={{
                        background: '#e9ecef',
                        padding: '0.2rem 0.4rem',
                        borderRadius: '3px',
                        fontSize: '0.9em',
                        fontFamily: 'monospace'
                      }} {...props}>
                        {children}
                      </code>
                    ) : (
                      <pre style={{
                        background: '#2d2d2d',
                        color: '#f8f8f2',
                        padding: '1rem',
                        borderRadius: '4px',
                        overflow: 'auto',
                        fontSize: '0.875rem',
                        border: '1px solid #444',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                      }}>
                        <code className={className} style={{ fontFamily: 'monospace' }} {...props}>
                          {children}
                        </code>
                      </pre>
                    );
                  },
                  p({children}) {
                    return <p style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', lineHeight: '1.5' }}>{children}</p>;
                  }
                }}
              >
                {question.text}
              </ReactMarkdown>
            );
          } catch (error) {
            console.error('Error rendering markdown:', error);
            return <p style={{ margin: 0, fontSize: '1rem', lineHeight: '1.5' }}>{question.text}</p>;
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
              border: '1px solid #ddd',
              borderRadius: '4px',
              objectFit: 'contain'
            }} 
          />
        </div>
      )}

      {/* Answer choices */}
      {answerChoices.length > 0 && (
        <div style={{ marginBottom: compact ? '0.75rem' : '1rem' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#333' }}>
            Answer Choices:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {answerChoices.map((choice, index) => {
              const isCorrect = choice === question.correct_answer;
              return (
                <div
                  key={index}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '4px',
                    border: isCorrect ? '2px solid #28a745' : '1px solid #ddd',
                    background: isCorrect ? '#d4edda' : '#f8f9fa',
                    fontSize: '0.875rem',
                    position: 'relative'
                  }}
                >
                  {choice}
                  {isCorrect && (
                    <span style={{
                      marginLeft: '0.5rem',
                      color: '#28a745',
                      fontWeight: 'bold',
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
      )}

      {/* Action buttons */}
      {(showDeleteButton || showEditButton || showRemoveButton) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
          {showEditButton && (
            <button
              onClick={handleEdit}
              style={{
                padding: '0.5rem 1rem',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 'bold'
              }}
            >
              {editButtonLabel}
            </button>
          )}
          {showRemoveButton && onRemove && (
            <button
              onClick={() => onRemove(question.id)}
              style={{
                padding: '0.5rem 1rem',
                background: '#f59e0b',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 'bold'
              }}
            >
              Remove
            </button>
          )}
          {showDeleteButton && onDelete && (
            <button
              onClick={() => onDelete(question.id)}
              style={{
                padding: '0.5rem 1rem',
                background: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 'bold'
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
