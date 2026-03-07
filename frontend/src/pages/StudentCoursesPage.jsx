import React, { useEffect, useMemo, useState } from 'react';
import { getCourses, getPinnedCourseIds, setCoursePinned } from '../api';
import CourseCard from '../components/CourseCard';
import { useAuth } from '../AuthContext';

const RefreshIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2v6h-6"></path>
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
    <path d="M3 22v-6h6"></path>
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
  </svg>
);

export default function StudentCoursesPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pinnedIds, setPinnedIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');

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

  const processedCourses = useMemo(() => {
    if (!Array.isArray(courses)) return [];
    const search = searchQuery.trim().toLowerCase();
    const filtered = courses.filter((course) => {
      if (!search) return true;
      const name = (course.course_name || '').toLowerCase();
      const school = (course.school_name || '').toLowerCase();
      return name.includes(search) || school.includes(search);
    });

    if (sortBy === 'students') {
      filtered.sort((a, b) => (b.student_ids?.length || 0) - (a.student_ids?.length || 0));
    } else {
      filtered.sort((a, b) => (a.course_name || '').localeCompare(b.course_name || ''));
    }
    return filtered;
  }, [courses, searchQuery, sortBy]);

  const pinnedCourses = processedCourses.filter((course) => pinnedIds.includes(course.id));
  const otherCourses = processedCourses.filter((course) => !pinnedIds.includes(course.id));

  useEffect(() => {
    if (user?.id) {
      loadCourses();
    }
  }, [user?.id]);

  const styles = {
    container: {
      maxWidth: '1400px',
      margin: '0 auto',
      padding: '0.25rem 0.5rem 40px',
      minHeight: '100vh',
      fontFamily: 'Inter, system-ui, sans-serif',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginBottom: '20px',
      gap: '20px',
      flexWrap: 'wrap',
    },
    title: {
      fontSize: '2.3rem',
      fontWeight: '800',
      margin: 0,
      color: '#0f172a',
      letterSpacing: '-0.025em',
      lineHeight: 1.08,
    },
    helperText: {
      margin: '0.45rem 0 0 0',
      color: '#475569',
      fontSize: '0.95rem',
    },
    controls: {
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
      marginBottom: '28px',
    },
    searchBar: {
      flexGrow: 1,
      maxWidth: '420px',
      padding: '12px 16px',
      borderRadius: '12px',
      border: '2px solid #e2e8f0',
      fontSize: '1rem',
      outline: 'none',
    },
    select: {
      padding: '12px 40px 12px 16px',
      borderRadius: '12px',
      border: '2px solid #e2e8f0',
      background: 'white',
      fontWeight: '600',
      color: '#475569',
      cursor: 'pointer',
      appearance: 'none',
      backgroundImage:
        "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")",
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 12px center',
      backgroundSize: '16px',
      outline: 'none',
    },
    iconButton: {
      padding: '12px',
      borderRadius: '12px',
      border: '2px solid #e2e8f0',
      background: 'white',
      color: '#475569',
      cursor: 'pointer',
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
      </div>

      <div style={styles.controls}>
        <input
          style={styles.searchBar}
          placeholder="Search courses..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select style={styles.select} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="name">Sort by Name</option>
          <option value="students">Sort by Size</option>
        </select>
        <button onClick={loadCourses} style={styles.iconButton} title="Refresh dashboard" aria-label="Refresh dashboard">
          <RefreshIcon />
        </button>
      </div>

      {error && <div style={styles.errorBanner}>{error}</div>}

      {loading ? (
        <p>Loading courses...</p>
      ) : processedCourses.length === 0 ? (
        <div style={styles.emptyState}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#374151' }}>No Courses Found</h3>
          <p style={{ margin: 0 }}>
            {searchQuery ? 'No courses match your current search.' : 'You are not enrolled in any courses yet.'}
          </p>
        </div>
      ) : (
        <>
          {pinnedCourses.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: '800',
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  marginBottom: '14px',
                  display: 'block',
                }}
              >
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

          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: '800',
              color: '#94a3b8',
              textTransform: 'uppercase',
              marginBottom: '14px',
              display: 'block',
            }}
          >
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
