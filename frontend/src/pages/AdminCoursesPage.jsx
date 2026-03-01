import React, { useEffect, useState, useMemo } from 'react';
import { getAdminCoursesOverview } from '../api';
import CourseCard from '../components/CourseCard';

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#94a3b8' }}>
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const RefreshIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2v6h-6"></path>
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
    <path d="M3 22v-6h6"></path>
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
  </svg>
);

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');

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

  const processedCourses = useMemo(() => {
    if (!Array.isArray(courses)) return [];
    let filtered = courses.filter(c => {
      const name = (c.course_name || '').toLowerCase();
      const school = (c.school_name || '').toLowerCase();
      const search = searchQuery.toLowerCase();
      return name.includes(search) || school.includes(search);
    });

    if (sortBy === 'name') {
      filtered.sort((a, b) => (a.course_name || '').localeCompare(b.course_name || ''));
    } else if (sortBy === 'students') {
      filtered.sort((a, b) => (b.student_ids?.length || 0) - (a.student_ids?.length || 0));
    }
    return filtered;
  }, [courses, searchQuery, sortBy]);

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
    }, 
    searchBar: { 
      flexGrow: 1, 
      maxWidth: '400px', 
      padding: '12px 16px', 
      borderRadius: '12px', 
      border: '2px solid #e2e8f0', 
      fontSize: '1rem', 
      outline: 'none' 
    },
    controls: { 
      display: 'flex', 
      gap: '12px', 
      alignItems: 'center', 
      marginBottom: '32px' 
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
      backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`, 
      backgroundRepeat: 'no-repeat', 
      backgroundPosition: 'right 12px center', 
      backgroundSize: '16px', 
      outline: 'none' 
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>All Courses</h1>
      </div>

      <div style={styles.controls}>
        <input style={styles.searchBar} placeholder="Search courses..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        <select style={styles.select} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="name">Sort by Name</option>
          <option value="students">Sort by Size</option>
        </select>
        <button onClick={loadCourses} style={{ ...styles.select, backgroundImage: 'None', padding: '12px' }} title="Refresh dashboard"><RefreshIcon /></button>
      </div>

      {error && <div style={styles.errorBanner}>{error}</div>}

      {loading ? (
        <p>Loading courses...</p>
      ) : processedCourses.length === 0 ? (
        <div style={styles.emptyState}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#374151' }}>No Courses Found</h3>
          <p style={{ margin: 0 }}>There are no courses in the system yet.</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {processedCourses.map((course) => (
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
