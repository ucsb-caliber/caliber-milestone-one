import React, { useState, useEffect } from 'react';
import { getCourse, updateCourse, getAllUsers, getUserInfo, deleteAssignment } from '../api';
import { useAuth } from '../AuthContext';

export default function CourseDashboard() {
  const { user } = useAuth();
  const [course, setCourse] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isInstructor, setIsInstructor] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({
    course_name: '',
    school_name: '',
    student_ids: []
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const getCourseIdFromHash = () => {
    const hash = window.location.hash;
    const match = hash.match(/#course\/(\d+)/);
    return match ? parseInt(match[1]) : null;
  };

  const courseId = getCourseIdFromHash();
  const backToCoursesHash = isAdmin && !isInstructor ? '#admin/courses' : '#courses';
  const canViewAssignments = isInstructor || isAdmin;

  useEffect(() => {
    async function loadData() {
      if (!courseId) {
        setError('No course ID specified');
        setLoading(false);
        return;
      }

      try {
        const [courseData, usersData, userInfo] = await Promise.all([
          getCourse(courseId),
          getAllUsers(),
          getUserInfo()
        ]);
      
        // Normalizing Supabase data mapping
        const enrolledList = courseData.course_students || courseData.students || [];
        const studentIds = enrolledList.map(s => s.student_id || s.user_id || s.id);
      
        setCourse({
          ...courseData,
          student_ids: studentIds 
        });
      
        setAllUsers(usersData.users || []);
        
        const currentUserId = user?.user_id || user?.id;
        setIsInstructor(courseData.instructor_id === currentUserId);
        setIsAdmin(Boolean(userInfo?.admin));
        
        setFormData({
          course_name: courseData.course_name || '',
          school_name: courseData.school_name || '',
          student_ids: studentIds
        });
      } catch (err) {
        setError(err.message || 'Failed to load course');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [courseId, user]);

  const getUserDisplayName = (u) => {
    if (!u) return 'Unknown User';
    if (u.first_name && u.last_name) return `${u.first_name} ${u.last_name}`;
    return u.email || u.user_id || 'Unnamed';
  };

  const getInstructorName = () => {
    if (!course?.instructor_id) return 'Unknown';
    const instructor = allUsers.find(u => u.user_id === course.instructor_id);
    return instructor ? getUserDisplayName(instructor) : 'Unknown Instructor';
  };

  const getStudentInfo = (studentId) => {
    const student = allUsers.find(u => u.user_id === studentId);
    return student ? getUserDisplayName(student) : `Student (${studentId})`;
  };

  const handleSave = async () => {
    if (!formData.course_name.trim()) {
      setSaveError('Course name is required');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const updated = await updateCourse(courseId, formData);
      setCourse(updated);
      setShowEditModal(false);
    } catch (err) {
      setSaveError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const styles = {
    container: { maxWidth: '1000px', margin: '0 auto', padding: '2rem', fontFamily: 'Inter, sans-serif' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' },
    title: { margin: 0, fontSize: '2.25rem', fontWeight: '800', color: '#111827' },
    section: { background: 'white', borderRadius: '16px', padding: '1.75rem', marginBottom: '1.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', border: '1px solid #f3f4f6' },
    assignmentCard: { 
        padding: '1.5rem', 
        background: '#ffffff', 
        borderRadius: '12px', 
        border: '1px solid #e5e7eb', 
        marginBottom: '1.5rem', 
        position: 'relative',
        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
    },
    // This fixes your "Jumbled Text" problem
    assignmentDescription: { 
        whiteSpace: 'pre-wrap', 
        lineHeight: '1.6', 
        color: '#4b5563', 
        fontSize: '0.95rem',
        margin: '1rem 0' 
    },
    // This fixes your "Overlapping Bubbles" problem
    tagContainer: { 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: '8px', 
        marginTop: '10px' 
    },
    tag: { background: '#f3f4f6', padding: '4px 10px', borderRadius: '16px', fontSize: '0.75rem', color: '#374151' },
    modal: { position: 'fixed', inset: 0, background: 'rgba(17, 24, 39, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modalContent: { background: 'white', padding: '2rem', borderRadius: '16px', maxWidth: '500px', width: '90%' },
    btnPrimary: { padding: '0.75rem 1.5rem', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }
  };

  if (loading) return <div style={styles.container}><p>Loading course data...</p></div>;
  if (error || !course) return <div style={styles.container}><p>{error || 'Course not found'}</p></div>;

  return (
    <div style={styles.container}>
      <a href={backToCoursesHash} style={{ color: '#4f46e5', textDecoration: 'none', fontSize: '0.875rem' }}>← Back to Courses</a>

      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{course.course_name}</h1>
          <p style={{ color: '#6b7280' }}>{course.school_name || 'UCSB'}</p>
        </div>
        {isInstructor && <button style={styles.btnPrimary} onClick={() => setShowEditModal(true)}>Settings & Roster</button>}
      </div>

      <div style={styles.section}>
        <h2 style={{ marginBottom: '1.5rem' }}>📝 Assignments</h2>
        {course.assignments?.length > 0 ? (
          course.assignments.map(assign => (
            <div key={assign.id} style={styles.assignmentCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, color: '#111827' }}>{assign.title || 'Untitled Assignment'}</h3>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#4f46e5' }}>{assign.type?.toUpperCase()}</span>
              </div>
              
              <div style={styles.assignmentDescription}>
                {assign.description || 'No description provided.'}
              </div>

              <div style={styles.tagContainer}>
                {assign.keywords?.split(',').map((tag, i) => (
                  <span key={i} style={styles.tag}>{tag.trim()}</span>
                ))}
              </div>

              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => window.location.hash = `#course/${courseId}/assignment/${assign.id}/view`}
                  style={{ ...styles.btnPrimary, padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                >View Details</button>
              </div>
            </div>
          ))
        ) : (
          <p style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>No assignments published yet.</p>
        )}
      </div>

      <div style={styles.section}>
        <h2 style={{ fontSize: '1.1rem' }}>👥 Enrolled Students ({course.student_ids?.length || 0})</h2>
        <div style={styles.tagContainer}>
          {course.student_ids?.map(sid => (
            <span key={sid} style={styles.tag}>{getStudentInfo(sid)}</span>
          ))}
        </div>
      </div>

      {showEditModal && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h2>Edit Course</h2>
            <input 
                style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', borderRadius: '8px', border: '1px solid #d1d5db' }}
                value={formData.course_name} 
                onChange={e => setFormData({...formData, course_name: e.target.value})} 
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowEditModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleSave} style={styles.btnPrimary} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}