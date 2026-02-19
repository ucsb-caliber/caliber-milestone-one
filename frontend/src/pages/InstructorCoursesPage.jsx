import React, { useState, useEffect, useMemo } from 'react';
import { getCourses, createCourse, updateCourse, deleteCourse, getAllUsers, getUserInfo } from '../api';
import CourseCard from '../components/CourseCard';
import { useAuth } from '../AuthContext';

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

export default function InstructorCoursesPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isTeacher, setIsTeacher] = useState(false);
  
  const [sortBy, setSortBy] = useState('name'); 
  const [searchQuery, setSearchQuery] = useState('');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);

  const [pinnedIds, setPinnedIds] = useState(() => {
    try {
      const saved = localStorage.getItem('pinned_courses');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to parse pinned courses:", e);
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('pinned_courses', JSON.stringify(pinnedIds));
  }, [pinnedIds]);
  
  const [formData, setFormData] = useState({
    course_name: '',
    school_name: '',
    student_ids: []
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    async function fetchUserInfo() {
      try {
        const info = await getUserInfo();
        setIsTeacher(info?.teacher === true);
      } catch (err) {
        setIsTeacher(false);
      }
    }
    if (user) fetchUserInfo();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [coursesData, usersData] = await Promise.all([
        getCourses(),
        getAllUsers()
      ]);
      setCourses(coursesData?.courses || []);
      setAllUsers(usersData?.users || []);
    } catch (err) {
      setError(err.message || 'Failed to load data. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
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

  const pinnedCourses = processedCourses.filter(c => pinnedIds.includes(c.id));
  const otherCourses = processedCourses.filter(c => !pinnedIds.includes(c.id));

  const togglePin = (id) => {
    setPinnedIds(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const resetForm = () => {
    setFormData({ course_name: '', school_name: '', student_ids: [] });
    setFormError('');
    setStudentSearchQuery('');
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const handleOpenEdit = (course) => {
    resetForm();
    setSelectedCourse(course);
    setFormData({
      course_name: course.course_name || '',
      school_name: course.school_name || '',
      student_ids: course.student_ids || []
    });
    setShowEditModal(true);
  };

  const handleCreateCourse = async (e) => {
    e.preventDefault();
    if (!formData.course_name.trim()) return setFormError('Course name is required');
    setFormLoading(true);
    setFormError('');
    try {
      await createCourse(formData);
      setShowCreateModal(false);
      resetForm();
      await loadData();
    } catch (err) { setFormError(err.message || 'Error creating course.'); }
    finally { setFormLoading(false); }
  };

  const handleEditCourse = async (e) => {
    e.preventDefault();
    if (!formData.course_name.trim()) return setFormError('Course name is required');
    setFormLoading(true);
    setFormError('');
    try {
      await updateCourse(selectedCourse.id, formData);
      setShowEditModal(false);
      resetForm();
      await loadData();
    } catch (err) { setFormError(err.message || 'Error updating course.'); }
    finally { setFormLoading(false); }
  };

  const handleDeleteCourse = async () => {
    setFormLoading(true);
    setError('');
    try {
      await deleteCourse(selectedCourse.id);
      setShowDeleteModal(false);
      setSelectedCourse(null);
      await loadData();
    } catch (err) { setError(err.message || 'Failed to delete course.'); }
    finally { setFormLoading(false); }
  };

  const toggleStudent = (studentId) => {
    setFormData(prev => ({
      ...prev,
      student_ids: prev.student_ids.includes(studentId)
        ? prev.student_ids.filter(id => id !== studentId)
        : [...prev.student_ids, studentId]
    }));
  };

  const getUserDisplayName = (u) => (u?.first_name && u?.last_name) ? `${u.first_name} ${u.last_name}` : (u?.email || u?.user_id || 'Unknown');

  const availableStudents = allUsers.filter(u => !u.teacher && u.user_id !== user?.id);

  const styles = {
    container: { maxWidth: '1300px', margin: '0 auto', padding: '40px 20px', minHeight: '100vh', fontFamily: 'Inter, system-ui, sans-serif' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px', gap: '20px', flexWrap: 'wrap' },
    title: { fontSize: '2.5rem', fontWeight: '800', margin: 0, color: '#0f172a', letterSpacing: '-0.025em' },
    createBtn: { transition: 'all 0.2s ease', padding: '14px 28px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '14px', fontWeight: '700', cursor: 'pointer'},
    controls: { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '32px' },
    searchBar: { flexGrow: 1, maxWidth: '400px', padding: '12px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '1rem', outline: 'none' },
    select: {padding: '12px 40px 12px 16px', borderRadius: '12px',border: '2px solid #e2e8f0', background: 'white', fontWeight: '600', color: '#475569', cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px', outline: 'none',},   
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '24px' },
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' },
    modalContent: { background: 'white', padding: '32px', borderRadius: '24px', maxWidth: '550px', width: '90%', maxHeight: '90vh', overflowY: 'auto' },
    formInput: { width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px', marginTop: '6px', fontSize: '1rem', boxSizing: 'border-box' },
    errorBanner: { padding: '16px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '0.9rem', marginBottom: '24px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' }
  };

  const renderFormModal = (isEdit) => {
    const filteredStudents = availableStudents.filter(u => {
      const search = studentSearchQuery.toLowerCase();
      return getUserDisplayName(u).toLowerCase().includes(search) || (u.email || '').toLowerCase().includes(search);
    });

    return (
      <div style={styles.modalOverlay} onClick={() => { setShowCreateModal(false); setShowEditModal(false); resetForm(); }}>
        <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
          <h2 style={{ margin: '0 0 24px 0', fontSize: '1.5rem', fontWeight: '800' }}>{isEdit ? "Course Settings" : "Create New Course"}</h2>
          
          {formError && (
            <div style={styles.errorBanner}>
              <span>⚠️</span> {formError}
            </div>
          )}

          <form onSubmit={isEdit ? handleEditCourse : handleCreateCourse}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontWeight: '700', fontSize: '0.9rem' }}>Course Name</label>
              <input style={styles.formInput} value={formData.course_name} onChange={e => setFormData({...formData, course_name: e.target.value})} />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontWeight: '700', fontSize: '0.9rem' }}>School Name</label>
              <input style={styles.formInput} value={formData.school_name} onChange={e => setFormData({...formData, school_name: e.target.value})} />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontWeight: '700', fontSize: '0.9rem', display: 'block', marginBottom: '8px' }}>Roster ({formData.student_ids.length})</label>
              <input style={{...styles.formInput, marginBottom: '10px'}} placeholder="Search students..." value={studentSearchQuery} onChange={e => setStudentSearchQuery(e.target.value)} />
              <div style={{ border: '1px solid #f1f5f9', borderRadius: '12px', maxHeight: '180px', overflowY: 'auto' }}>
                {filteredStudents.map(u => (
                  <div key={u.user_id} onClick={() => toggleStudent(u.user_id)} style={{ padding: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', background: formData.student_ids.includes(u.user_id) ? '#f0f7ff' : 'transparent' }}>
                    <input type="checkbox" checked={formData.student_ids.includes(u.user_id)} readOnly />
                    <span style={{ fontSize: '0.9rem' }}>{getUserDisplayName(u)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '30px' }}>
              <button type="button" onClick={() => { setShowCreateModal(false); setShowEditModal(false); resetForm(); }} style={{ marginLeft: 'auto', padding: '12px 20px', background: '#f1f5f9', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={formLoading} style={{ padding: '12px 24px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '700', cursor: 'pointer' }}>
                {formLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Instructor Dashboard</h1>
        </div>
        {isTeacher && (
          <button style={styles.createBtn} onClick={handleOpenCreate} onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(79, 70, 229, 0.3)'
            e.currentTarget.style.scale = 1.02
          }} onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = 'none'
            e.currentTarget.style.scale = 1
          }}>
            + Create New Course
          </button>
        )}
      </header>

      <div style={styles.controls}>
        <input style={styles.searchBar} placeholder="Search courses..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        <select style={styles.select} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="name">Sort by Name</option>
          <option value="students">Sort by Size</option>
        </select>
        <button onClick={loadData} style={{ ...styles.select, backgroundImage: 'None', padding: '12px' }} title="Refresh dashboard"><RefreshIcon /></button>
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
        <div style={{ textAlign: 'center', padding: '100px', color: '#94a3b8' }}>Loading your dashboard...</div>
      ) : (
        <>
          {pinnedCourses.length > 0 && (
            <div style={{ marginBottom: '48px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '20px', display: 'block' }}>Pinned Courses</span>
              <div style={styles.grid}>
                {pinnedCourses.map(c => (
                  <CourseCard 
                    key={c.id} 
                    course={c} 
                    isPinned={true} 
                    onPin={() => togglePin(c.id)} 
                    onOpen={() => window.location.hash = `course/${c.id}`}
                    onSettings={() => handleOpenEdit(c)}
                    onDelete={() => {
                      setSelectedCourse(c);
                      setShowDeleteModal(true);
                    }}
                    isInstructor={c.instructor_id === user?.id}
                  />
                ))}
              </div>
            </div>
          )}

          <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '20px', display: 'block' }}>Your Courses</span>
          <div style={styles.grid}>
            {otherCourses.map(c => (
              <CourseCard 
                key={c.id} 
                course={c} 
                isPinned={false} 
                onPin={() => togglePin(c.id)} 
                onOpen={() => window.location.hash = `course/${c.id}`}
                onSettings={() => handleOpenEdit(c)}
                onDelete={() => {
                  setSelectedCourse(c);
                  setShowDeleteModal(true);
                }}
                isInstructor={c.instructor_id === user?.id}
              />
            ))}
          </div>
        </>
      )}

      {showCreateModal && renderFormModal(false)}
      {showEditModal && renderFormModal(true)}
      {showDeleteModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h2 style={{ color: '#ef4444', margin: '0 0 16px 0' }}>Delete Course?</h2>
            
            {formError && <div style={{...styles.errorBanner, marginBottom: '16px'}}>{formError}</div>}

            <p>This will permanently delete <strong>{selectedCourse?.course_name}</strong>. This action is irreversible.</p>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => { setShowDeleteModal(false); setFormError(''); }} style={{ marginLeft: 'auto', padding: '12px 20px', background: '#f1f5f9', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDeleteCourse} disabled={formLoading} style={{ padding: '12px 24px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', opacity: formLoading ? 0.7 : 1 }}>
                {formLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}