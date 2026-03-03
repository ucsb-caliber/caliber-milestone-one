import React, { useEffect, useState } from 'react';
import { getCourses, getPinnedCourseIds, setCoursePinned } from '../api';
import CourseCard from '../components/CourseCard';
import { useAuth } from '../AuthContext';

export default function StudentCoursesPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pinnedIds, setPinnedIds] = useState([]);

  const loadCourses = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getCourses();
      const normalizedCourses = (data.courses || []).map((course) => ({
        ...course,
        id: Number(course.id),
      }));
      setCourses(normalizedCourses);

      try {
        const pinnedCourseIds = await getPinnedCourseIds();
        const normalizedPinned = Array.isArray(pinnedCourseIds)
          ? pinnedCourseIds.map((id) => Number(id))
          : [];
        setPinnedIds(normalizedPinned);
      } catch (pinErr) {
        setPinnedIds([]);
        setError(pinErr.message || 'Failed to load pinned courses');
      }
    } catch (err) {
      setError(err.message || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  const togglePin = async (courseId) => {
    const normalizedCourseId = Number(courseId);
    const isCurrentlyPinned = pinnedIds.includes(normalizedCourseId);
    const nextPinned = !isCurrentlyPinned;

    setPinnedIds((prev) =>
      nextPinned
        ? Array.from(new Set([...prev, normalizedCourseId]))
        : prev.filter((id) => id !== normalizedCourseId)
    );

    try {
      await setCoursePinned(normalizedCourseId, nextPinned);
    } catch (err) {
      setPinnedIds((prev) =>
        isCurrentlyPinned
          ? Array.from(new Set([...prev, normalizedCourseId]))
          : prev.filter((id) => id !== normalizedCourseId)
      );
      setError(err.message || 'Failed to update course pin');
    }
  };

  const pinnedCourses = courses.filter((course) => pinnedIds.includes(course.id));
  const otherCourses = courses.filter((course) => !pinnedIds.includes(course.id));

  useEffect(() => {
    if (user?.id) {
      loadCourses();
    }
  }, [user?.id]);

  const styles = {
    container: {
      maxWidth: '1400px',
      margin: '0 auto',
      paddingBottom: '2rem',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '1rem',
      gap: '0.9rem',
      flexWrap: 'wrap',
    },
    title: {
      margin: 0,
      fontSize: '1.75rem',
      fontWeight: '700',
      color: '#111827',
    },
    helperText: {
      margin: 0,
      color: '#64748b',
      fontSize: '0.92rem',
    },
    refreshButton: {
      padding: '0.75rem 1.5rem',
      background: '#007bff',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '1rem',
      fontWeight: '500',
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
      gap: '1.5rem',
    },
    emptyState: {
      padding: '4rem',
      background: '#f9fafb',
      borderRadius: '12px',
      textAlign: 'center',
      color: '#6b7280',
    },
    errorBanner: {
      padding: '1rem',
      background: '#fef2f2',
      border: '1px solid #fecaca',
      borderRadius: '8px',
      color: '#dc2626',
      marginBottom: '1rem',
      fontSize: '0.875rem',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Courses</h1>
          <p style={styles.helperText}>Join and manage course enrollment from the Platform home page.</p>
        </div>
        <button
          onClick={loadCourses}
          disabled={loading}
          style={{
            ...styles.refreshButton,
            opacity: loading ? 0.6 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
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
        <>
          {pinnedCourses.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '14px', display: 'block' }}>
                Pinned Courses
              </span>
              <div style={styles.grid}>
                {pinnedCourses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    isPinned={true}
                    onPin={() => togglePin(course.id)}
                    isInstructor={false}
                    allUsers={[]}
                    onOpen={() => {
                      window.location.hash = `student-course/${course.id}`;
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '14px', display: 'block' }}>
            Your Courses
          </span>
          <div style={styles.grid}>
            {otherCourses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                isPinned={false}
                onPin={() => togglePin(course.id)}
                isInstructor={false}
                allUsers={[]}
                onOpen={() => {
                  window.location.hash = `student-course/${course.id}`;
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
