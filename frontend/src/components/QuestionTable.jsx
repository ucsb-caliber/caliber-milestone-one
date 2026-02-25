import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
 * Wraps a <tr> with drag-and-drop sortable behaviour from @dnd-kit.
 * Uses a render prop so drag listeners can be scoped to just the handle cell,
 * preventing buttons and other interactive elements from triggering a drag.
 */
function SortableRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    backgroundColor: isDragging ? '#f9fafb' : 'transparent',
    cursor: 'grab',
  };

  return (
    <tr ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </tr>
  );
}

/**
 * Table Row Component
 */
const TableRow = ({
  questionNumber,
  question,
  userInfo,
  canDelete,
  onDelete,
  showQID,
  showCourseType,
  showEditButton,
  showRemoveButton,
  onEdit,
  onRemove,
  actionLoading,
  hasActions,
  isDraggable,
}) => {
  const qid = getQID(question);

  const handleEdit = () => {
    if (onEdit) {
      onEdit(question);
    } else {
      window.location.hash = `edit-question?id=${question.id}`;
    }
  };

  // renderCells accepts dragListeners which are applied only to the handle <td>.
  // When not draggable, dragListeners is an empty object and the handle cell is omitted.
  const renderCells = () => (
    <>
      {questionNumber && (
        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
          <span style={{
            fontSize: '0.75rem',
            fontWeight: '600',
            color: '#6b7280',
            background: '#e5e7eb',
            padding: '0.125rem 0.5rem',
            borderRadius: '4px'
          }}>
            {questionNumber}
          </span>
        </td>
      )}
      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
        <UserProfileIcon userInfo={userInfo} />
      </td>
      {showQID && (
        <td style={{ padding: '0.75rem 1rem' }}>
          <a
            href={`#question-${question.id}`}
            onClick={(e) => e.preventDefault()}
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
      )}
      <td style={{ padding: '0.75rem 1rem', color: '#111827', fontSize: '0.875rem' }}>
        {question.title || 'Untitled'}
      </td>
      <td style={{ padding: '0.75rem 1rem' }}>
        <Badge value={question.course} color="#dbeafe" />
      </td>
      {showCourseType && (
        <td style={{ padding: '0.75rem 1rem' }}>
          <Badge value={question.course_type} color="#e0e7ff" />
        </td>
      )}
      <td style={{ padding: '0.75rem 1rem' }}>
        <Badge value={question.blooms_taxonomy} color="#fce7f3" />
      </td>
      <td style={{ padding: '0.75rem 1rem' }}>
        <Badge value={question.question_type} color="#fef3c7" />
      </td>
      <td style={{ padding: '0.75rem 1rem' }}>
        <TagList tagsString={question.tags} />
      </td>
      {hasActions && (
        <td 
          onPointerDown={(e) => e.stopPropagation()}
          style={{ padding: '0.75rem 1rem', textAlign: 'center' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
            {showEditButton && (
              <button
                onClick={handleEdit}
                disabled={actionLoading}
                style={{
                  padding: '0.375rem 0.75rem',
                  background: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  opacity: actionLoading ? 0.6 : 1,
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={(e) => { if (!actionLoading) e.currentTarget.style.backgroundColor = '#4338ca'; }}
                onMouseLeave={(e) => { if (!actionLoading) e.currentTarget.style.backgroundColor = '#4f46e5'; }}
              >
                Edit
              </button>
            )}
            {showRemoveButton && onRemove && (
              <button
                onClick={() => onRemove(question.id)}
                disabled={actionLoading}
                style={{
                  padding: '0.375rem 0.75rem',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  opacity: actionLoading ? 0.6 : 1,
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={(e) => { if (!actionLoading) e.currentTarget.style.backgroundColor = '#c82333'; }}
                onMouseLeave={(e) => { if (!actionLoading) e.currentTarget.style.backgroundColor = '#dc3545'; }}
              >
                Remove
              </button>
            )}
            {canDelete && onDelete && (
              <button
                onClick={() => onDelete(question.id)}
                disabled={actionLoading}
                style={{
                  padding: '0.375rem 0.75rem',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  opacity: actionLoading ? 0.6 : 1,
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={(e) => { if (!actionLoading) e.currentTarget.style.backgroundColor = '#c82333'; }}
                onMouseLeave={(e) => { if (!actionLoading) e.currentTarget.style.backgroundColor = '#dc3545'; }}
              >
                Delete
              </button>
            )}
          </div>
        </td>
      )}
    </>
  );

  if (isDraggable) {
    return (
      <SortableRow id={question.id}>
        {renderCells()}
      </SortableRow>
    );
  }

  return (
    <tr
      style={{
        borderBottom: '1px solid #e5e7eb',
        transition: 'background-color 0.15s ease'
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
    >
      {renderCells()}
    </tr>
  );
};

/**
 * QuestionTable - Main table component for displaying questions
 *
 * @param {Array}    questions        - Array of questions to display
 * @param {Object}   userInfoCache    - Object mapping user IDs to user info
 * @param {Object}   user             - Current logged-in user
 * @param {boolean}  showQID          - Show QID column (default: true)
 * @param {boolean}  showCourseType   - Show Course Type column (default: true)
 * @param {boolean}  showEditButton   - Show Edit button for all rows (default: false)
 * @param {boolean}  showRemoveButton - Show Remove button for all rows (default: false)
 * @param {function} onDelete         - Callback when delete button is clicked
 * @param {function} onEdit           - Callback(question) when edit button is clicked
 * @param {function} onRemove         - Callback(questionId) when remove button is clicked
 * @param {boolean}  actionLoading    - Disables all buttons while true (default: false)
 * @param {boolean}  isDraggable      - Enables drag-and-drop row reordering (default: false)
 *                                      Requires wrapping this component in a DndContext +
 *                                      SortableContext (verticalListSortingStrategy) in the parent.
 */
export default function QuestionTable({
  showQuestionNumber = false,
  questions,
  userInfoCache,
  user,
  showQID = true,
  showCourseType = true,
  showEditButton = false,
  showRemoveButton = false,
  onDelete,
  onEdit,
  onRemove,
  actionLoading = false,
  isDraggable = false,
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

  const hasDeletableQuestions = user &&
    questions.some(q => q.user_id === user.id);

  const hasActions = showEditButton || showRemoveButton || hasDeletableQuestions;
  const hasQID = !!showQID;
  const hasCourseType = !!showCourseType;
  const hasQuestionNumber = !!showQuestionNumber;

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
              {hasQuestionNumber && (
                <th style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'center',
                  fontWeight: '600',
                  color: '#374151',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
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
              {hasQID && (
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
              {hasCourseType && (
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
              {hasActions && (
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
            {questions.map((question, index) => {
              const canDelete = user && question.user_id === user.id;
              const userInfo = userInfoCache[question.user_id];
              return (
                <TableRow
                  key={question.id}
                  questionNumber={hasQuestionNumber ? `Q${index + 1}` : null}
                  question={question}
                  userInfo={userInfo}
                  canDelete={canDelete}
                  onDelete={onDelete}
                  showQID={hasQID}
                  showCourseType={hasCourseType}
                  showEditButton={showEditButton}
                  showRemoveButton={showRemoveButton}
                  onEdit={onEdit}
                  onRemove={onRemove}
                  actionLoading={actionLoading}
                  hasActions={hasActions}
                  isDraggable={isDraggable}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}