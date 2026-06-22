import React, { useState } from 'react';
import QuestionCard from './QuestionCard';
import StudentPreview from './StudentPreview';
import { getImageSignedUrl } from '../api';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { dashboardPalette } from './CourseDashboardUI';
import useBodyScrollLock from '../hooks/useBodyScrollLock';

const TAG_COLORS = [dashboardPalette.navyLight, '#eaf1f8', '#eef4fa', '#fff3cc', '#f4f7fb'];

const actionButtonBase = {
  padding: '0.375rem 0.75rem',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontWeight: '600',
  whiteSpace: 'nowrap',
};

const actionButtonStyles = {
  edit: {
    ...actionButtonBase,
    background: dashboardPalette.navy,
    color: dashboardPalette.white,
    border: `1px solid ${dashboardPalette.navy}`,
  },
  variant: {
    ...actionButtonBase,
    background: dashboardPalette.white,
    color: dashboardPalette.navy,
    border: `1px solid ${dashboardPalette.border}`,
  },
  approve: {
    ...actionButtonBase,
    background: dashboardPalette.gold,
    color: dashboardPalette.navy,
    border: `1px solid ${dashboardPalette.goldDark}`,
  },
  delete: {
    ...actionButtonBase,
    background: dashboardPalette.white,
    color: dashboardPalette.dangerText,
    border: `1px solid ${dashboardPalette.dangerBorder}`,
  },
  social: {
    ...actionButtonBase,
    background: dashboardPalette.white,
    color: dashboardPalette.text,
    border: `1px solid ${dashboardPalette.border}`,
  },
  copy: {
    ...actionButtonBase,
    background: '#ecfdf5',
    color: '#166534',
    border: '1px solid #bbf7d0',
  },
};

const getQID = (question) => {
  return String(question.qid || question.assigned_qid || `Q${question.id}`);
};

const getVersion = (question) => {
  return question.assigned_version || question.version || 1;
};

const formatDraftState = (question) => {
  if (question.is_assignment_snapshot) return 'snapshot';
  return question.draft_state || (question.is_verified === false ? 'draft' : 'ready');
};

const formatVisibility = (question) => {
  if (question.is_assignment_snapshot) return 'snapshot';
  const visibility = question.visibility || 'local';
  if (visibility === 'private') return 'local';
  return visibility;
};

const formatOrigin = (question) => {
  if (question.is_assignment_snapshot) return 'assignment';
  return question.origin || 'manual';
};

const getSourceParts = (question) => {
  return [
    question.source_repo,
    question.source_path,
    question.source_commit
  ].filter(Boolean);
};

const formatSourceLabel = (question) => {
  const sourceParts = getSourceParts(question);
  if (sourceParts.length === 0) return '';
  const [repo, path, commit] = sourceParts;
  const shortCommit = commit ? String(commit).slice(0, 8) : '';
  return [repo, path, shortCommit].filter(Boolean).join(' / ');
};

const MetaChip = ({ children, title, monospace = false }) => (
  <span
    title={title}
    style={{
      fontSize: '0.68rem',
      color: '#374151',
      background: '#f3f4f6',
      border: '1px solid #e5e7eb',
      borderRadius: '4px',
      padding: '0.05rem 0.3rem',
      textTransform: monospace ? 'none' : 'capitalize',
      fontFamily: monospace ? 'monospace' : 'inherit',
      whiteSpace: 'nowrap'
    }}
  >
    {children}
  </span>
);

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
        background: dashboardPalette.border,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: dashboardPalette.muted,
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
        background: userInfo.icon_color || dashboardPalette.navy,
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
const Badge = ({ value, color = dashboardPalette.border }) => {
  const text = typeof value === 'string' ? value : (value == null ? '' : String(value));
  if (!text.trim()) {
    return <span style={{ color: dashboardPalette.muted, fontStyle: 'italic', fontSize: '0.875rem' }}>-</span>;
  }


  return (
    <span
      style={{
        background: color,
        color: dashboardPalette.text,
        padding: '0.3rem 0.65rem',
        borderRadius: '6px',
        fontSize: '0.75rem',
        fontWeight: '500',
        border: `1px solid ${dashboardPalette.border}`,
        whiteSpace: 'nowrap',
        display: 'inline-block'
      }}
    >
      {text}
    </span>
  );
};

/**
 * Render tags as colored badges
 */
const TagList = ({ tagsString }) => {
  const text = typeof tagsString === 'string' ? tagsString : (tagsString == null ? '' : String(tagsString));
  if (!text.trim()) {
    return <span style={{ color: dashboardPalette.muted, fontStyle: 'italic' }}>-</span>;
  }
  const tags = text.split(',').map(t => t.trim()).filter(t => t);
  if (tags.length === 0) {
    return <span style={{ color: dashboardPalette.muted, fontStyle: 'italic' }}>-</span>;
  }


  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
      {tags.map((tag, index) => (
        <span
          key={index}
          style={{
            background: TAG_COLORS[index % TAG_COLORS.length],
            color: dashboardPalette.text,
            padding: '0.2rem 0.5rem',
            borderRadius: '6px',
            fontSize: '0.7rem',
            fontWeight: '500',
            border: `1px solid ${dashboardPalette.border}`,
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
    backgroundColor: isDragging ? dashboardPalette.surface : 'transparent',
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
  onPreview,

  selectable = false,
  selected = false,
  onToggle,
  showQID,
  showCourseType,
  showBloomsTaxonomy,
  showTags,
  showEditButton,
  showRemoveButton,
  showVariantButton,
  showApproveButton,
  showLikeButton,
  showCommentsButton,
  showCopyButton,
  onEdit,
  onRemove,
  onGenerateVariant,
  onApproveDraft,
  onLike,
  onOpenComments,
  onCopy,
  actionLoading,
  variantLoading,
  hasActions,
  isDraggable,
}) => {
  const qid = getQID(question);
  const sourceLabel = formatSourceLabel(question);
  const sourceTitle = getSourceParts(question).join('\n');
  const isLocked = (question.visibility || '').toLowerCase() === 'locked';

  const handleEdit = () => {
    if (onEdit) {
      onEdit(question);
    } else {
      const returnTo = encodeURIComponent(window.location.hash.replace(/^#/, '') || 'questions');
      window.location.hash = `edit-question?id=${question.id}&returnTo=${returnTo}`;
    }
  };

  // renderCells accepts dragListeners which are applied only to the handle <td>.
  // When not draggable, dragListeners is an empty object and the handle cell is omitted.
  const renderCells = () => (
    <>
      {selectable && (
        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(question.id)}
            onClick={(e) => e.stopPropagation()}
            style={{ cursor: 'pointer' }}
          />
        </td>
      )}
      {questionNumber && (
        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
          <span style={{
            fontSize: '0.75rem',
            fontWeight: '600',
            color: dashboardPalette.muted,
            background: dashboardPalette.surface,
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
            href={`#question-${question.id || question.qid}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPreview(question);
            }}
            style={{
              color: dashboardPalette.navy,
              textDecoration: 'none',
              fontWeight: '400',
              fontSize: '0.875rem',
              cursor: 'pointer',
              fontFamily: 'monospace'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.textDecoration = 'underline';
              e.currentTarget.style.color = dashboardPalette.navyMid;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.textDecoration = 'none';
              e.currentTarget.style.color = dashboardPalette.navy;
            }}
          >
            {qid}
          </a>
          <div style={{ marginTop: '0.3rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            <MetaChip title="Version" monospace>
              v{getVersion(question)}
            </MetaChip>
            <MetaChip title="Draft state">
              {formatDraftState(question).replace('_', ' ')}
            </MetaChip>
            <MetaChip title="Visibility">
              {formatVisibility(question).replace('_', ' ')}
            </MetaChip>
            <MetaChip title="Origin">
              {formatOrigin(question).replace('_', ' ')}
            </MetaChip>
          </div>
          {sourceLabel && (
            <div
              title={sourceTitle}
              style={{
                marginTop: '0.25rem',
                maxWidth: '220px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: '#6b7280',
                fontFamily: 'monospace',
                fontSize: '0.68rem'
              }}
            >
              {sourceLabel}
            </div>
          )}
          <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            <MetaChip title="Likes">Likes {question.likes_count || 0}</MetaChip>
            <MetaChip title="Comments">Comments {question.comments_count || 0}</MetaChip>
            {question.copied_from_qid && (
              <MetaChip title="Copied from" monospace>from {question.copied_from_qid}</MetaChip>
            )}
          </div>
        </td>
      )}
      <td style={{ padding: '0.75rem 1rem', color: dashboardPalette.text, fontSize: '0.875rem' }}>
        {question.title || 'Untitled'}
      </td>
      <td style={{ padding: '0.75rem 1rem' }}>
        <Badge value={question.course} color={dashboardPalette.navyLight} />
      </td>
      {showCourseType && (
        <td style={{ padding: '0.75rem 1rem' }}>
          <Badge value={question.course_type} color="#eaf1f8" />
        </td>
      )}
      {showBloomsTaxonomy && (
        <td style={{ padding: '0.75rem 1rem' }}>
          <Badge value={question.blooms_taxonomy} color="#eef4fa" />
        </td>
      )}
      <td style={{ padding: '0.75rem 1rem' }}>
        <Badge value={question.question_type} color="#fff3cc" />
      </td>
      {showTags && (
        <td style={{ padding: '0.75rem 1rem' }}>
          <TagList tagsString={question.tags} />
        </td>
      )}
      {hasActions && (
        <td 
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{ padding: '0.75rem 1rem', textAlign: 'center' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
            {showEditButton && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit();
                }}
                disabled={actionLoading}
                style={{ ...actionButtonStyles.edit, opacity: actionLoading ? 0.6 : 1, cursor: actionLoading ? 'not-allowed' : 'pointer' }}
              >
                Edit
              </button>
            )}
            {showVariantButton && onGenerateVariant && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerateVariant(question);
                }}
                disabled={actionLoading || variantLoading}
                style={{ ...actionButtonStyles.variant, opacity: (actionLoading || variantLoading) ? 0.6 : 1, cursor: (actionLoading || variantLoading) ? 'not-allowed' : 'pointer' }}
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
                style={{ ...actionButtonStyles.approve, opacity: actionLoading ? 0.6 : 1, cursor: actionLoading ? 'not-allowed' : 'pointer' }}
              >
                Approve
              </button>
            )}
            {showLikeButton && onLike && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onLike(question);
                }}
                disabled={actionLoading}
                style={{
                  ...actionButtonStyles.social,
                  background: question.liked_by_me ? '#fee2e2' : actionButtonStyles.social.background,
                  color: question.liked_by_me ? '#991b1b' : actionButtonStyles.social.color,
                  border: question.liked_by_me ? '1px solid #fecaca' : actionButtonStyles.social.border,
                  opacity: actionLoading ? 0.6 : 1,
                  cursor: actionLoading ? 'not-allowed' : 'pointer'
                }}
              >
                Like {question.likes_count || 0}
              </button>
            )}
            {showCommentsButton && onOpenComments && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenComments(question);
                }}
                style={actionButtonStyles.social}
              >
                Comments {question.comments_count || 0}
              </button>
            )}
            {showCopyButton && onCopy && !isLocked && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy(question);
                }}
                disabled={actionLoading}
                style={{ ...actionButtonStyles.copy, opacity: actionLoading ? 0.6 : 1, cursor: actionLoading ? 'not-allowed' : 'pointer' }}
              >
                Add to Mine
              </button>
            )}
            {showRemoveButton && onRemove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(question.id);
                }}
                disabled={actionLoading}
                style={{ ...actionButtonStyles.delete, padding: '0.3rem 0.6rem', fontSize: '0.75rem', opacity: actionLoading ? 0.6 : 1, cursor: actionLoading ? 'not-allowed' : 'pointer' }}
              >
                Remove
              </button>
            )}
            {canDelete && onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(question.id);
                }}
                disabled={actionLoading}
                style={{ ...actionButtonStyles.delete, opacity: actionLoading ? 0.6 : 1, cursor: actionLoading ? 'not-allowed' : 'pointer' }}
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
        borderBottom: `1px solid ${dashboardPalette.border}`,
        transition: 'background-color 0.15s ease, border-color 0.15s ease',
        cursor: 'pointer'
      }}
      onClick={() => onPreview(question)}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = dashboardPalette.surface}
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
 * @param {boolean}  showBloomsTaxonomy - Show Bloom's Taxonomy column (default: true)
 * @param {boolean}  showTags         - Show Tags column (default: true)
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
  onDelete,

  showQID = true,
  showCourseType = true,
  showBloomsTaxonomy = true,
  showTags = true,
  showEditButton = false,
  showRemoveButton = false,
  showVariantButton = false,
  showApproveButton = false,
  onEdit,
  onRemove,
  onGenerateVariant,
  onApproveDraft,
  onLike,
  onOpenComments,
  onCopy,
  actionLoading = false,
  variantLoadingId = null,
  isDraggable = false,

  selectable = false,
  selectedQuestionIds = [],
  onToggleQuestion = () => { },
  showActions = true
}) {
  const [previewQuestion, setPreviewQuestion] = useState(null);
  const [previewImageUrl, setPreviewImageUrl] = useState(null);
  const [previewMode, setPreviewMode] = useState('details');
  const previewIsLocked = (previewQuestion?.visibility || '').toLowerCase() === 'locked';
  useBodyScrollLock(Boolean(previewQuestion));

  const handlePreview = async (question) => {
    setPreviewQuestion(question);
    setPreviewImageUrl(null);
    setPreviewMode('details');

    if (!question?.image_url) return;

    const signedUrl = await getImageSignedUrl(question.image_url);
    setPreviewImageUrl(signedUrl || null);
  };

  const closePreview = () => {
    setPreviewQuestion(null);
    setPreviewImageUrl(null);
    setPreviewMode('details');
  };

  if (questions.length === 0) {
    return (
      <div style={{
        padding: '3rem',
        background: dashboardPalette.white,
        border: `1px solid ${dashboardPalette.border}`,
        borderRadius: '8px',
        textAlign: 'center',
        color: dashboardPalette.muted
      }}>
        <p style={{ margin: 0, fontSize: '1rem' }}>No questions found.</p>
      </div>
    );
  }

  // Check if any question can be deleted (for showing Actions column)
  const currentUserId = user?.id || user?.user_id;
  const hasDeletableQuestions = showActions && currentUserId &&
    questions.some(q => q.user_id === currentUserId);

  const hasVariantActions = showActions && showVariantButton;
  const hasApproveActions = showActions && showApproveButton;
  const hasSocialActions = showActions && (onLike || onOpenComments || onCopy);
  const hasActions = showEditButton || showRemoveButton || hasVariantActions || hasApproveActions || hasSocialActions || hasDeletableQuestions;
  const hasQID = !!showQID;
  const hasCourseType = !!showCourseType;
  const hasBloomsTaxonomy = !!showBloomsTaxonomy;
  const hasTags = !!showTags;
  const hasQuestionNumber = !!showQuestionNumber;

  return (
    <div style={{
      background: dashboardPalette.white,
      borderRadius: '8px',
      border: `1px solid ${dashboardPalette.border}`,
      overflow: 'hidden',
      maxWidth: '100%'
    }}>
      <div
        style={{
          overflowX: 'auto',
          overflowY: 'hidden',
          maxWidth: '100%',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <table style={{
          width: '100%',
          minWidth: hasBloomsTaxonomy || hasTags ? '1180px' : '980px',
          borderCollapse: 'collapse',
          fontSize: '0.875rem',
          tableLayout: 'auto'
        }}>
          <thead>
            <tr style={{
              background: dashboardPalette.surface,
              borderBottom: `1px solid ${dashboardPalette.border}`
            }}>
              {hasQuestionNumber && (
                <th style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'center',
                  fontWeight: '600',
                  color: dashboardPalette.muted,
                  fontSize: '0.75rem',
                  whiteSpace: 'nowrap'
                }}>
                </th>
              )}

              {selectable && (
                <th style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'center',
                  fontWeight: '600',
                  color: dashboardPalette.muted,
                  fontSize: '0.75rem',
                  whiteSpace: 'nowrap'
                }}>
                  Select
                </th>
              )}


              <th style={{
                padding: '0.75rem 1rem',
                textAlign: 'left',
                fontWeight: '600',
                color: dashboardPalette.muted,
                fontSize: '0.75rem'
              }}>
                Author
              </th>
              {hasQID && (
                <th style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: dashboardPalette.muted,
                  fontSize: '0.75rem'
                }}>
                  QID
                </th>
              )}
              <th style={{
                padding: '0.75rem 1rem',
                textAlign: 'left',
                fontWeight: '600',
                color: dashboardPalette.muted,
                fontSize: '0.75rem'
              }}>
                Title
              </th>
              <th style={{
                padding: '0.75rem 1rem',
                textAlign: 'left',
                fontWeight: '600',
                color: dashboardPalette.muted,
                fontSize: '0.75rem'
              }}>
                Course
              </th>
              {hasCourseType && (
                <th style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: dashboardPalette.muted,
                  fontSize: '0.75rem'
                }}>
                  Course Type
                </th>
              )}
              {hasBloomsTaxonomy && (
                <th style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: dashboardPalette.muted,
                  fontSize: '0.75rem'
                }}>
                  Bloom's Taxonomy
                </th>
              )}
              <th style={{
                padding: '0.75rem 1rem',
                textAlign: 'left',
                fontWeight: '600',
                color: dashboardPalette.muted,
                fontSize: '0.75rem'
              }}>
                Question Type
              </th>
              {hasTags && (
                <th style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: dashboardPalette.muted,
                  fontSize: '0.75rem'
                }}>
                  Tags
                </th>
              )}
              {hasActions && (
                <th style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'center',
                  fontWeight: '600',
                  color: dashboardPalette.muted,
                  fontSize: '0.75rem'
                }}>
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {questions.map((question, index) => {
              const canDelete = showActions && currentUserId && question.user_id === currentUserId;
              const isMine = currentUserId && (question.user_id === currentUserId);
              const userInfo = userInfoCache[question.original_author_user_id || question.owner_user_id || question.user_id] || userInfoCache[question.user_id];
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
                  showBloomsTaxonomy={hasBloomsTaxonomy}
                  showTags={hasTags}
                  showEditButton={showEditButton && canDelete}
                  showRemoveButton={showRemoveButton}
                  showVariantButton={hasVariantActions}
                  showApproveButton={hasApproveActions}
                  showLikeButton={Boolean(showActions && onLike)}
                  showCommentsButton={Boolean(showActions && onOpenComments)}
                  showCopyButton={Boolean(showActions && onCopy && !isMine)}
                  onEdit={onEdit}
                  onRemove={onRemove}
                  onGenerateVariant={onGenerateVariant}
                  onApproveDraft={onApproveDraft}
                  onLike={onLike}
                  onOpenComments={onOpenComments}
                  onCopy={onCopy}
                  actionLoading={actionLoading}
                  variantLoading={variantLoadingId === question.id}
                  hasActions={hasActions}
                  isDraggable={isDraggable}
                  onPreview={handlePreview}

                  selectable={selectable}
                  selected={selectedQuestionIds.includes(question.id)}
                  onToggle={onToggleQuestion}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {previewQuestion && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1200,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            overflowY: 'auto',
            overflowX: 'hidden',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            padding: '1rem'
          }}
          onClick={closePreview}
        >
          <div
            style={{
              width: 'min(1000px, 100%)',
              background: 'transparent'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', gap: '0.75rem' }}>
              <div style={{ display: 'inline-flex', gap: '0.25rem', padding: '0.2rem', borderRadius: '8px', background: dashboardPalette.surface, border: `1px solid ${dashboardPalette.border}` }}>
                <button
                  type="button"
                  onClick={() => setPreviewMode('details')}
                  style={{
                    padding: '0.4rem 0.65rem',
                    border: `1px solid ${previewMode === 'details' ? dashboardPalette.border : 'transparent'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '0.82rem',
                    background: previewMode === 'details' ? dashboardPalette.white : 'transparent',
                    color: previewMode === 'details' ? dashboardPalette.text : dashboardPalette.muted
                  }}
                >
                  Question Card
                </button>
                {!previewIsLocked && (
                  <button
                    type="button"
                    onClick={() => setPreviewMode('student')}
                    style={{
                      padding: '0.4rem 0.65rem',
                      border: `1px solid ${previewMode === 'student' ? dashboardPalette.border : 'transparent'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '0.82rem',
                      background: previewMode === 'student' ? dashboardPalette.white : 'transparent',
                      color: previewMode === 'student' ? dashboardPalette.text : dashboardPalette.muted
                    }}
                  >
                    Student View
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={closePreview}
                style={{
                  padding: '0.5rem 0.75rem',
                  border: `1px solid ${dashboardPalette.border}`,
                  background: dashboardPalette.white,
                  color: dashboardPalette.text,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Close
              </button>
            </div>

            {previewMode === 'details' ? (
              <QuestionCard
                question={previewQuestion}
                userInfo={userInfoCache[previewQuestion.original_author_user_id || previewQuestion.owner_user_id || previewQuestion.user_id] || userInfoCache[previewQuestion.user_id]}
                imageUrl={previewImageUrl}
                showDeleteButton={false}
                showEditButton={false}
                showRemoveButton={false}
              />
            ) : (
              <div style={{ border: `1px solid ${dashboardPalette.border}`, borderRadius: '8px', overflowY: 'auto', background: dashboardPalette.surface, height: '78vh', maxHeight: '78vh' }}>
                <StudentPreview
                  inline={true}
                  isPreviewMode={false}
                  forceReadOnly={true}
                  showStatusBanner={false}
                  showHeader={false}
                  showPrevNextButtons={false}
                  assignmentTitle={previewQuestion.title || 'Untitled Question'}
                  assignmentType={previewQuestion.question_type?.toUpperCase() || 'Question'}
                  questions={[previewQuestion]}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
