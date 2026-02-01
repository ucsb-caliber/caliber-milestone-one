import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { getQuestions, getAllQuestions, deleteQuestion, getImageSignedUrl, getUserById } from '../api';
import { useAuth } from '../AuthContext';

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
      // True hexagon using clip-path
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

// Color palettes for keyword and tag bubbles
const KEYWORD_COLORS = ['#e3f2fd', '#f3e5f5', '#e8f5e9', '#fff3e0', '#fce4ec'];
const TAG_COLORS = ['#ffebee', '#e8eaf6', '#f1f8e9', '#fff8e1', '#fbe9e7'];

// Sort function for newest-first ordering
const sortByNewest = (a, b) => new Date(b.created_at) - new Date(a.created_at);

export default function QuestionBank() {
  const { user } = useAuth();
  const [myQuestions, setMyQuestions] = useState([]);
  const [allQuestions, setAllQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [myQuestionsCollapsed, setMyQuestionsCollapsed] = useState(false);
  const [allQuestionsCollapsed, setAllQuestionsCollapsed] = useState(false);
  const [imageUrls, setImageUrls] = useState({}); // Cache for signed URLs
  const [userInfoCache, setUserInfoCache] = useState({}); // Cache for user info

  // Pagination stuff
  const [myQuestionsPage, setMyQuestionsPage] = useState(1);
  const [allQuestionsPage, setAllQuestionsPage] = useState(1);
  const [pageInput, setPageInput] = useState(allQuestionsPage);
  const [myPageInput, setMyPageInput] = useState(myQuestionsPage);
  const itemsPerPage = 6;

  useEffect(() => {
    setPageInput(allQuestionsPage);
  }, [allQuestionsPage]);

  useEffect(() => {
    setMyPageInput(myQuestionsPage);
  }, [myQuestionsPage]);

  const loadQuestions = async () => {
    setLoading(true);
    setError('');
    try {
      const [myData, allData] = await Promise.all([
        getQuestions(),
        getAllQuestions()
      ]);

      // Filter for verified questions only and sort by newest first
      const verifiedMyQuestions = (myData.questions || [])
        .filter(q => q.is_verified === true)
        .sort(sortByNewest);

      const verifiedAllQuestions = (allData.questions || [])
        .filter(q => q.is_verified === true)
        .sort(sortByNewest);
      
      setMyQuestions(verifiedMyQuestions);
      setAllQuestions(verifiedAllQuestions);
      
      // Generate signed URLs for all questions with images
      const allQuestionsWithImages = [...verifiedMyQuestions, ...verifiedAllQuestions].filter(q => q.image_url);
      const urlPromises = allQuestionsWithImages.map(async (q) => {
        const signedUrl = await getImageSignedUrl(q.image_url);
        return { id: q.id, url: signedUrl };
      });
      
      const urls = await Promise.all(urlPromises);
      const urlMap = {};
      urls.forEach(({ id, url }) => {
        if (url) {
          urlMap[id] = url;
        }
      });
      setImageUrls(urlMap);
      
      // Fetch user info for all questions
      const uniqueUserIds = [...new Set([...verifiedMyQuestions, ...verifiedAllQuestions].map(q => q.user_id))];
      const userPromises = uniqueUserIds.map(async (userId) => {
        try {
          const userInfo = await getUserById(userId);
          return { userId, userInfo };
        } catch (error) {
          console.error(`Failed to fetch user ${userId}:`, error);
          return { userId, userInfo: null };
        }
      });
      
      const users = await Promise.all(userPromises);
      const userMap = {};
      users.forEach(({ userId, userInfo }) => {
        if (userInfo) {
          userMap[userId] = userInfo;
        }
      });
      setUserInfoCache(userMap);
    } catch (err) {
      setError(err.message || 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, []);

  const handleDelete = async (questionId) => {
    try {
      await deleteQuestion(questionId);
      setDeleteConfirm(null);
      await loadQuestions();
    } catch (err) {
      setError(err.message || 'Failed to delete question');
    }
  };

  const renderQuestionCard = (question, showDeleteButton = true) => {
    let answerChoices = [];
    try {
      answerChoices = JSON.parse(question.answer_choices || '[]');
    } catch (e) {
      answerChoices = [];
    }

    const keywords = question.keywords ? question.keywords.split(',').map(k => k.trim()).filter(k => k) : [];
    const tags = question.tags ? question.tags.split(',').map(t => t.trim()).filter(t => t) : [];
    const userInfo = userInfoCache[question.user_id];

    return (
      <div
        key={question.id}
        style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '1.25rem',
          background: 'white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          breakInside: 'avoid',
          marginBottom: '1.5rem'
        }}
      >
        {/* User Icon in top right corner */}
        <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
          <UserIcon userInfo={userInfo} size={40} />
        </div>

        {/* Header with school, course, and metadata */}
        <div style={{ marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #eee', paddingRight: '50px' }}>
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

          {/* Question title sits just above keywords */}
          
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
                fontSize: '1.5rem',
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
        <div style={{ marginBottom: '1rem' }}>
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
                          border: '1px solid #444'
                        }}>
                          <code className={className} {...props}>
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
        {question.image_url && imageUrls[question.id] && (
          <div style={{ marginBottom: '1rem' }}>
            <img 
              src={imageUrls[question.id]} 
              alt="Question illustration" 
              style={{ 
                maxWidth: '100%', 
                height: 'auto',
                maxHeight: '300px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                objectFit: 'contain'
              }} 
            />
          </div>
        )}

        {/* Answer choices */}
        {answerChoices.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
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

        {showDeleteButton && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
            <button
              onClick={() => setDeleteConfirm(question.id)}
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
          </div>
        )}
      </div>
    );
  };

  // Fix paginated slices
  const paginatedMyQuestions = myQuestions.slice(
    (myQuestionsPage - 1) * itemsPerPage,
    myQuestionsPage * itemsPerPage
  );
  const paginatedAllQuestions = allQuestions.slice(
    (allQuestionsPage - 1) * itemsPerPage,
    allQuestionsPage * itemsPerPage
  );

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', paddingBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ margin: 0 }}>Question Bank</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={() => window.location.hash = 'create-question'}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold'
            }}
          >
            + Create New Question
          </button>
          <button
            onClick={loadQuestions}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '1rem'
            }}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {loading && <p>Loading questions...</p>}

      {error && (
        <div style={{
          padding: '1rem',
          background: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '4px',
          color: '#721c24',
          marginBottom: '1rem'
        }}>
          {error}
        </div>
      )}

      {deleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '8px',
            maxWidth: '400px',
            width: '90%'
          }}>
            <h3 style={{ marginTop: 0 }}>Confirm Delete</h3>
            <p>Are you sure you want to delete this question? This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <>
          {/* My Questions Section */}
          <div style={{ marginBottom: '4rem' }}>
            <h3 
              onClick={() => setMyQuestionsCollapsed(!myQuestionsCollapsed)}
              style={{ 
                marginBottom: '1rem',
                paddingBottom: '0.5rem',
                borderBottom: '2px solid #007bff',
                color: '#333',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                userSelect: 'none'
              }}
            >
              <span style={{ 
                transition: 'transform 0.2s',
                transform: myQuestionsCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                display: 'inline-block'
              }}>
                ▼
              </span>
              My Questions ({myQuestions.length})
            </h3>
            {!myQuestionsCollapsed && (
              myQuestions.length === 0 ? (
                <div style={{
                  padding: '2rem',
                  background: '#f8f9fa',
                  borderRadius: '4px',
                  textAlign: 'center',
                  color: '#666'
                }}>
                  <p>You haven't created any questions yet.</p>
                  <button
                    onClick={() => window.location.hash = 'create-question'}
                    style={{
                      marginTop: '1rem',
                      padding: '0.5rem 1rem',
                      background: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Create Your First Question
                  </button>
                </div>
              ) : (
                <div>
                  {/* My Questions Pagination */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '15px' }}>
                    <button
                      onClick={() => setMyQuestionsPage(prev => Math.max(prev - 1, 1))}
                      style={{
                        padding: '0.5rem 0.75rem',
                        background: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: myQuestionsPage === 1 ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold'
                      }}
                      disabled={myQuestionsPage === 1}
                    >
                      ←
                    </button>
                    <span>
                      Page
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={myPageInput}
                        onChange={(e) => {
                          const onlyDigits = e.target.value.replace(/\D/g, "");
                          setMyPageInput(onlyDigits);
                        }}
                        onBlur={() => {
                          const maxPage = Math.ceil(myQuestions.length / itemsPerPage);
                          const num = Number(myPageInput);
                          if (num >= 1 && num <= maxPage) setMyQuestionsPage(num);
                          else setMyPageInput(myQuestionsPage);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const maxPage = Math.ceil(myQuestions.length / itemsPerPage);
                            const num = Number(myPageInput);
                            if (num >= 1 && num <= maxPage) setMyQuestionsPage(num);
                            else setMyPageInput(myQuestionsPage);
                          }
                        }}
                        style={{ width: "30px", margin: "0 6px", textAlign: "center" }}
                      />
                      of {Math.ceil(myQuestions.length / itemsPerPage)}
                    </span>
                    <button
                      onClick={() => setMyQuestionsPage(prev => Math.min(prev + 1, Math.ceil(myQuestions.length / itemsPerPage)))}
                      style={{
                        padding: '0.5rem 0.75rem',
                        background: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: myQuestionsPage === Math.ceil(myQuestions.length / itemsPerPage) ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold'
                      }}
                      disabled={myQuestionsPage === Math.ceil(myQuestions.length / itemsPerPage)}
                    >
                      →
                    </button>
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                    gap: '4rem 1.5rem'
                  }}>
                    {paginatedMyQuestions.map(question => renderQuestionCard(question, true))}
                  </div>
                </div>
              )
            )}
          </div>

          {/* All Questions Section - unchanged */}
          <div>
            <h3 
              onClick={() => setAllQuestionsCollapsed(!allQuestionsCollapsed)}
              style={{ 
                marginBottom: '1rem',
                paddingBottom: '0.5rem',
                borderBottom: '2px solid #28a745',
                color: '#333',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                userSelect: 'none'
              }}
            >
              <span style={{ 
                transition: 'transform 0.2s',
                transform: allQuestionsCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                display: 'inline-block'
              }}>
                ▼
              </span>
              All Questions ({allQuestions.length})
            </h3>
            {!allQuestionsCollapsed && (
              allQuestions.length === 0 ? (
                <div style={{
                  padding: '2rem',
                  background: '#f8f9fa',
                  borderRadius: '4px',
                  textAlign: 'center',
                  color: '#666'
                }}>
                  <p>No questions found in the system.</p>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '15px' }}>
                    <button
                      onClick={() => setAllQuestionsPage(prev => Math.max(prev - 1, 1))}
                      style={{
                        padding: '0.5rem 0.75rem',
                        background: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: allQuestionsPage === 1 ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold'
                      }}
                      disabled={allQuestionsPage === 1}
                    >
                      ←
                    </button>
                    <span>
                      Page
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={pageInput}
                        onChange={(e) => {
                          const onlyDigits = e.target.value.replace(/\D/g, "");
                          setPageInput(onlyDigits);
                        }}
                        onBlur={() => {
                          const maxPage = Math.ceil(allQuestions.length / itemsPerPage);
                          const num = Number(pageInput);
                          if (num >= 1 && num <= maxPage) setAllQuestionsPage(num);
                          else setPageInput(allQuestionsPage);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const maxPage = Math.ceil(allQuestions.length / itemsPerPage);
                            const num = Number(pageInput);
                            if (num >= 1 && num <= maxPage) setAllQuestionsPage(num);
                            else setPageInput(allQuestionsPage);
                          }
                        }}
                        style={{ width: "30px", margin: "0 6px", textAlign: "center" }}
                      />
                      of {Math.ceil(allQuestions.length / itemsPerPage)}
                    </span>
                    <button
                      onClick={() => setAllQuestionsPage(prev => Math.min(prev + 1, Math.ceil(allQuestions.length / itemsPerPage)))}
                      style={{
                        padding: '0.5rem 0.75rem',
                        background: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: allQuestionsPage === Math.ceil(allQuestions.length / itemsPerPage) ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold'
                      }}
                      disabled={allQuestionsPage === Math.ceil(allQuestions.length / itemsPerPage)}
                    >
                      →
                    </button>
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                    gap: '4rem 1.5rem'
                  }}>
                    {paginatedAllQuestions.map(question => {
                      const canDelete = user && question.user_id === user.id;
                      return renderQuestionCard(question, canDelete);
                    })}
                  </div>
                </div>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
