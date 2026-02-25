import React, { useEffect, useState } from 'react';
import { getAdminCoursesOverview } from '../api';
import CourseCard from '../components/CourseCard';

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCourses = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAdminCoursesOverview();
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
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>All Courses</h1>
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

      {error && <div style={styles.errorBanner}>{error}</div>}

      {loading ? (
        <p>Loading courses...</p>
      ) : courses.length === 0 ? (
        <div style={styles.emptyState}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#374151' }}>No Courses Found</h3>
          <p style={{ margin: 0 }}>There are no courses in the system yet.</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              isInstructor={false}
              allUsers={[]}
              showStudentsList={true}
              assignmentCountOverride={course.assignment_count}
              studentNameById={course.student_name_by_id || {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}
