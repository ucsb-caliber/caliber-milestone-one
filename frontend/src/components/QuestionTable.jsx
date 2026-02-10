import React from 'react';

// Color palette for tag bubbles
const TAG_COLORS = ['#ffebee', '#e8eaf6', '#f1f8e9', '#fff8e1', '#fbe9e7'];

/**
 * Generate QID from question (use title slugified or ID)
 */
const getQID = (question) => {
  if (question.title) {
    return question.title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `question-${question.id}`;
  }
  return `question-${question.id}`;
};

/**
 * Render user profile icon
 */
const UserProfileIcon = ({ userInfo }) => {
  if (!userInfo) {
    return (
      <div style={{
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: '#e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6b7280',
        fontSize: '0.75rem',
        fontWeight: '600'
      }}>
        ?
      </div>
    );
  }

  const getInitials = () => {
    if (userInfo.initials) return userInfo.initials.toUpperCase();
    if (userInfo.first_name && userInfo.last_name) {
      return `${userInfo.first_name[0]}${userInfo.last_name[0]}`.toUpperCase();
    }
    if (userInfo.email) {
      const emailPart = userInfo.email.split('@')[0];
      return emailPart.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  const shapeStyle =
    userInfo.icon_shape === 'square'
      ? { borderRadius: '8px' }
      : userInfo.icon_shape === 'hex'
        ? { clipPath: 'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0% 50%)' }
        : { borderRadius: '50%' };

  return (
    <div
      style={{
        width: '32px',
        height: '32px',
        background: userInfo.icon_color || '#4f46e5',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.75rem',
        fontWeight: '600',
        ...shapeStyle
      }}
      title={`${userInfo.first_name || ''} ${userInfo.last_name || ''}`.trim() || userInfo.email || 'User'}
    >
      {getInitials()}
    </div>
  );
};

/**
 * Render a single value as a badge
 */
const Badge = ({ value, color = '#e5e7eb' }) => {
  if (!value || !value.trim()) {
    return <span style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '0.875rem' }}>-</span>;
  }

  return (
    <span
      style={{
        background: color,
        color: '#374151',
        padding: '0.35rem 0.75rem',
        borderRadius: '6px',
        fontSize: '0.75rem',
        fontWeight: '500',
        border: '1px solid rgba(0,0,0,0.08)',
        whiteSpace: 'nowrap',
        display: 'inline-block'
      }}
    >
      {value}
    </span>
  );
};

/**
 * Render tags as colored badges
 */
const TagList = ({ tagsString }) => {
  if (!tagsString || !tagsString.trim()) {
    return <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>-</span>;
  }
  const tags = tagsString.split(',').map(t => t.trim()).filter(t => t);
  if (tags.length === 0) {
    return <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>-</span>;
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
      {tags.map((tag, index) => (
        <span
          key={index}
          style={{
            background: TAG_COLORS[index % TAG_COLORS.length],
            color: '#333',
            padding: '0.2rem 0.5rem',
            borderRadius: '12px',
            fontSize: '0.7rem',
            fontWeight: '500',
            border: '1px solid rgba(0,0,0,0.1)',
            whiteSpace: 'nowrap'
          }}
        >
          {tag}
        </span>
      ))}
    </div>
  );
};

/**
 * Table Row Component
 */
const TableRow = ({
  question,
  userInfo,
  canDelete,
  onDelete,

  selectable = false,
  selected = false,
  onToggle

}) => {
  const qid = getQID(question);

  return (
    <tr
      style={{
        borderBottom: '1px solid #e5e7eb',
        transition: 'background-color 0.15s ease'
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
    >

      {selectable && (
        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(question.id)}
            style={{ cursor: 'pointer' }}
          />
        </td>
      )}


      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
        <UserProfileIcon userInfo={userInfo} />
      </td>
      <td style={{ padding: '0.75rem 1rem' }}>
        <a
          href={`#question-${question.id}`}
          onClick={(e) => {
            e.preventDefault();
            // Could navigate to question detail or scroll to it
          }}
          style={{
            color: '#0066cc',
            textDecoration: 'none',
            fontWeight: '400',
            fontSize: '0.875rem',
            cursor: 'pointer',
            fontFamily: 'monospace'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.textDecoration = 'underline';
            e.currentTarget.style.color = '#0052a3';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.textDecoration = 'none';
            e.currentTarget.style.color = '#0066cc';
          }}
        >
          {qid}
        </a>
      </td>
      <td style={{ padding: '0.75rem 1rem', color: '#111827', fontSize: '0.875rem' }}>
        {question.title || 'Untitled'}
      </td>
      <td style={{ padding: '0.75rem 1rem' }}>
        <Badge value={question.course} color="#dbeafe" />
      </td>
      <td style={{ padding: '0.75rem 1rem' }}>
        <Badge value={question.course_type} color="#e0e7ff" />
      </td>
      <td style={{ padding: '0.75rem 1rem' }}>
        <Badge value={question.blooms_taxonomy} color="#fce7f3" />
      </td>
      <td style={{ padding: '0.75rem 1rem' }}>
        <Badge value={question.question_type} color="#fef3c7" />
      </td>
      <td style={{ padding: '0.75rem 1rem' }}>
        <TagList tagsString={question.tags} />
      </td>
      {canDelete && (
        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
          <button
            onClick={() => onDelete(question.id)}
            style={{
              padding: '0.375rem 0.75rem',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              transition: 'background-color 0.15s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#c82333'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#dc3545'}
          >
            Delete
          </button>
        </td>
      )}
    </tr>
  );
};

/**
 * QuestionTable - Main table component for displaying questions
 * 
 * @param {Array} questions - Array of questions to display
 * @param {Object} userInfoCache - Object mapping user IDs to user info
 * @param {Object} user - Current logged-in user
 * @param {function} onDelete - Callback when delete button is clicked
 */
export default function QuestionTable({
  questions,
  userInfoCache,
  user,
  onDelete,

  selectable = false,
  selectedQuestionIds = [],
  onToggleQuestion = () => { }
}) {
  if (questions.length === 0) {
    return (
      <div style={{
        padding: '3rem',
        background: '#f9fafb',
        borderRadius: '8px',
        textAlign: 'center',
        color: '#6b7280'
      }}>
        <p style={{ margin: 0, fontSize: '1rem' }}>No questions found.</p>
      </div>
    );
  }

  // Check if any question can be deleted (for showing Actions column)
  const hasDeletableQuestions = user &&
    questions.some(q => q.user_id === user.id);

  return (
    <div style={{
      background: 'white',
      borderRadius: '8px',
      border: '1px solid #e5e7eb',
      overflow: 'hidden'
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.875rem'
        }}>
          <thead>
            <tr style={{
              background: '#f9fafb',
              borderBottom: '1px solid #e5e7eb'
            }}>

              {selectable && (
                <th style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'center',
                  fontWeight: '600',
                  color: '#374151',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Select
                </th>
              )}


              <th style={{
                padding: '0.75rem 1rem',
                textAlign: 'left',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Creator
              </th>
              <th style={{
                padding: '0.75rem 1rem',
                textAlign: 'left',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                QID
              </th>
              <th style={{
                padding: '0.75rem 1rem',
                textAlign: 'left',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Title
              </th>
              <th style={{
                padding: '0.75rem 1rem',
                textAlign: 'left',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Course
              </th>
              <th style={{
                padding: '0.75rem 1rem',
                textAlign: 'left',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Course Type
              </th>
              <th style={{
                padding: '0.75rem 1rem',
                textAlign: 'left',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Blooms Taxonomy
              </th>
              <th style={{
                padding: '0.75rem 1rem',
                textAlign: 'left',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Question Type
              </th>
              <th style={{
                padding: '0.75rem 1rem',
                textAlign: 'left',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Tags
              </th>
              {hasDeletableQuestions && (
                <th style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'center',
                  fontWeight: '600',
                  color: '#374151',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {questions.map(question => {
              // User can delete their own questions
              const canDelete = user && question.user_id === user.id;
              const userInfo = userInfoCache[question.user_id];
              return (
                <TableRow
                  key={question.id}
                  question={question}
                  userInfo={userInfo}
                  canDelete={canDelete}
                  onDelete={onDelete}

                  selectable={selectable}
                  selected={selectedQuestionIds.includes(question.id)}
                  onToggle={onToggleQuestion}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
