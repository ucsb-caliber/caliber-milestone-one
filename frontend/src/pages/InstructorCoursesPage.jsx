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

export default function InstructorCoursesPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [searchQuery, setSearchQuery] = useState('');
  const [pinnedIds, setPinnedIds] = useState([]);

  const getErrorMessage = (err, fallback) => {
    if (!err) return fallback;
    if (typeof err === 'string') return err;
    if (typeof err.message === 'string') return err.message;
    if (typeof err.detail === 'string') return err.detail;
    if (typeof err.error === 'string') return err.error;
    return fallback;
  };

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const coursesData = await getCourses();
      const normalizedCourses = (coursesData?.courses || []).map((course) => ({
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
        setError(getErrorMessage(pinErr, 'Failed to load pinned courses'));
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load data. Please check your connection.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id]);

  const togglePin = async (id) => {
    const normalizedCourseId = Number(id);
    const isCurrentlyPinned = pinnedIds.includes(normalizedCourseId);
    const nextPinned = !isCurrentlyPinned;

    setPinnedIds((prev) =>
      nextPinned
        ? Array.from(new Set([...prev, normalizedCourseId]))
        : prev.filter((p) => p !== normalizedCourseId)
    );

    try {
      await setCoursePinned(normalizedCourseId, nextPinned);
    } catch (err) {
      setPinnedIds((prev) =>
        isCurrentlyPinned
          ? Array.from(new Set([...prev, normalizedCourseId]))
          : prev.filter((p) => p !== normalizedCourseId)
      );
      setError(getErrorMessage(err, 'Failed to update course pin'));
    }
  };

  const processedCourses = useMemo(() => {
    if (!Array.isArray(courses)) return [];

    const query = searchQuery.toLowerCase();
    const filtered = courses.filter((course) => {
      const name = (course.course_name || '').toLowerCase();
      const school = (course.school_name || '').toLowerCase();
      return name.includes(query) || school.includes(query);
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

  const styles = {
    container: {
      maxWidth: '1300px',
      margin: '0 auto',
      padding: '40px 20px',
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
    },
    helper: {
      margin: '8px 0 0 0',
      color: '#475569',
      fontSize: '0.95rem',
    },
    controls: { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '28px' },
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
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '24px' },
    errorBanner: {
      padding: '16px',
      borderRadius: '12px',
      background: '#fef2f2',
      border: '1px solid #fecaca',
      color: '#991b1b',
      fontSize: '0.9rem',
      marginBottom: '24px',
      fontWeight: '500',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    sectionLabel: {
      fontSize: '0.75rem',
      fontWeight: '800',
      color: '#94a3b8',
      textTransform: 'uppercase',
      marginBottom: '20px',
      display: 'block',
    },
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Instructor Courses</h1>
          <p style={styles.helper}>Course creation and roster management now live on the Platform home page.</p>
        </div>
      </header>

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
        <button
          onClick={loadData}
          style={{ ...styles.select, backgroundImage: 'none', padding: '12px' }}
          title="Refresh courses"
        >
          <RefreshIcon />
        </button>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <span>❌</span> {error}
          <button
            onClick={() => setError('')}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '100px', color: '#94a3b8' }}>Loading your courses...</div>
      ) : processedCourses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '16px', background: '#f8fafc' }}>
          <h3 style={{ margin: '0 0 8px 0', color: '#334155' }}>No Courses Found</h3>
          <p style={{ margin: 0 }}>
            {searchQuery ? 'No courses match your current search.' : 'Create and manage courses from the Platform home page.'}
          </p>
        </div>
      ) : (
        <>
          {pinnedCourses.length > 0 && (
            <div style={{ marginBottom: '48px' }}>
              <span style={styles.sectionLabel}>Pinned Courses</span>
              <div style={styles.grid}>
                {pinnedCourses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    isPinned={true}
                    onPin={() => togglePin(course.id)}
                    onOpen={() => {
                      window.location.hash = `course/${course.id}`;
                    }}
                    isInstructor={false}
                    allUsers={[]}
                  />
                ))}
              </div>
            </div>
          )}

          <span style={styles.sectionLabel}>Your Courses</span>
          <div style={styles.grid}>
            {otherCourses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                isPinned={false}
                onPin={() => togglePin(course.id)}
                onOpen={() => {
                  window.location.hash = `course/${course.id}`;
                }}
                isInstructor={false}
                allUsers={[]}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
