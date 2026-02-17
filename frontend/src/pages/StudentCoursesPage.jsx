import React, { useEffect, useState } from 'react';
import { getCourses, joinCourseByCode } from '../api';
import CourseCard from '../components/CourseCard';

export default function StudentCoursesPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [courseCode, setCourseCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinSuccess, setJoinSuccess] = useState('');

  const loadCourses = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getCourses();
      setCourses(data.courses || []);
    } catch (err) {
      setError(err.message || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  const handleJoinCourse = async (e) => {
    e.preventDefault();
    setJoinError('');
    setJoinSuccess('');

    const normalizedCode = courseCode.trim().toUpperCase();
    if (!normalizedCode) {
      setJoinError('Please enter a course code');
      return;
    }

    setJoinLoading(true);
    try {
      const joinedCourse = await joinCourseByCode(normalizedCode);
      setJoinSuccess(`Joined ${joinedCourse.course_name}`);
      setCourseCode('');
      await loadCourses();
    } catch (err) {
      setJoinError(err.message || 'Failed to join course');
    } finally {
      setJoinLoading(false);
    }
  };

  const styles = {
    container: {
      maxWidth: '1400px',
      margin: '0 auto',
      paddingBottom: '2rem'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '2rem'
    },
    title: {
      margin: 0,
      fontSize: '1.75rem',
      fontWeight: '700',
      color: '#111827'
    },
    refreshButton: {
      padding: '0.75rem 1.5rem',
      background: '#007bff',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '1rem',
      fontWeight: '500'
    },
    joinButton: {
      padding: '0.75rem 1.5rem',
      background: '#4f46e5',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '1rem',
      fontWeight: '600'
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
      gap: '1.5rem'
    },
    emptyState: {
      padding: '4rem',
      background: '#f9fafb',
      borderRadius: '12px',
      textAlign: 'center',
      color: '#6b7280'
    },
    errorBanner: {
      padding: '1rem',
      background: '#fef2f2',
      border: '1px solid #fecaca',
      borderRadius: '8px',
      color: '#dc2626',
      marginBottom: '1rem',
      fontSize: '0.875rem'
    },
    modal: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    },
    modalContent: {
      background: 'white',
      borderRadius: '12px',
      padding: '1.5rem',
      width: 'min(480px, 90vw)',
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
    },
    input: {
      width: '100%',
      padding: '0.75rem',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      fontSize: '1rem',
      boxSizing: 'border-box',
      marginTop: '0.75rem'
    },
    helperText: {
      marginTop: '0.5rem',
      fontSize: '0.8rem',
      color: '#6b7280'
    },
    buttonRow: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '0.75rem',
      marginTop: '1rem'
    },
    cancelButton: {
      padding: '0.625rem 1rem',
      border: 'none',
      borderRadius: '8px',
      background: '#f3f4f6',
      color: '#374151',
      cursor: 'pointer'
    },
    joinSubmitButton: {
      padding: '0.625rem 1rem',
      border: 'none',
      borderRadius: '8px',
      background: '#4f46e5',
      color: 'white',
      cursor: 'pointer'
    },
    joinError: {
      marginTop: '0.75rem',
      color: '#dc2626',
      fontSize: '0.875rem'
    },
    joinSuccess: {
      marginTop: '0.75rem',
      color: '#059669',
      fontSize: '0.875rem'
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Courses</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => {
              setShowJoinModal(true);
              setJoinError('');
              setJoinSuccess('');
            }}
            style={styles.joinButton}
          >
            + Join Course
          </button>
          <button
            onClick={loadCourses}
            disabled={loading}
            style={{
              ...styles.refreshButton,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div style={styles.errorBanner}>{error}</div>}

      {loading ? (
        <p>Loading courses...</p>
      ) : courses.length === 0 ? (
        <div style={styles.emptyState}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#374151' }}>No Courses Found</h3>
          <p style={{ margin: 0 }}>You are not enrolled in any courses yet.</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              isInstructor={false}
              allUsers={[]}
              onViewDetails={(c) => {
                window.location.hash = `student-course/${c.id}`;
              }}
            />
          ))}
        </div>
      )}

      {showJoinModal && (
        <div style={styles.modal} onClick={(e) => {
          if (e.target === e.currentTarget && !joinLoading) {
            setShowJoinModal(false);
          }
        }}>
          <div style={styles.modalContent}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#111827' }}>Join Course</h2>
            <form onSubmit={handleJoinCourse}>
              <input
                type="text"
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value.toUpperCase())}
                placeholder="Enter course code (e.g. CS101_AB12CD)"
                style={styles.input}
                disabled={joinLoading}
              />
              <div style={styles.helperText}>
                Format: `CourseNameNoSpaces_RANDOM6`
              </div>
              {joinError && <div style={styles.joinError}>{joinError}</div>}
              {joinSuccess && <div style={styles.joinSuccess}>{joinSuccess}</div>}
              <div style={styles.buttonRow}>
                <button
                  type="button"
                  style={styles.cancelButton}
                  disabled={joinLoading}
                  onClick={() => setShowJoinModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    ...styles.joinSubmitButton,
                    opacity: joinLoading ? 0.7 : 1,
                    cursor: joinLoading ? 'not-allowed' : 'pointer'
                  }}
                  disabled={joinLoading}
                >
                  {joinLoading ? 'Joining...' : 'Join'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
