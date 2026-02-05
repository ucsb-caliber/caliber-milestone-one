import React, { useState, useEffect } from 'react';
import { getCourse, updateCourse, getAllUsers, getUserInfo } from '../api';
import { useAuth } from '../AuthContext';

export default function CourseDashboard() {
  const { user } = useAuth();
  const [course, setCourse] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isInstructor, setIsInstructor] = useState(false);
  
  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    course_name: '',
    school_name: '',
    student_ids: []
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Get course ID from URL hash (e.g., #course/123)
  const getCourseIdFromHash = () => {
    const hash = window.location.hash;
    const match = hash.match(/#course\/(\d+)/);
    return match ? parseInt(match[1]) : null;
  };

  const courseId = getCourseIdFromHash();

  // Load course data
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

        setCourse(courseData);
        setAllUsers(usersData.users || []);
        setIsInstructor(courseData.instructor_id === user?.id);
        
        // Initialize form data
        setFormData({
          course_name: courseData.course_name || '',
          school_name: courseData.school_name || '',
          student_ids: courseData.student_ids || []
        });
      } catch (err) {
        setError(err.message || 'Failed to load course');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [courseId, user]);

  // Get user display name
  const getUserDisplayName = (u) => {
    if (u.first_name && u.last_name) {
      return `${u.first_name} ${u.last_name}`;
    }
    return u.email || u.user_id;
  };

  // Get instructor info
  const getInstructorName = () => {
    if (!course?.instructor_id) return 'Unknown';
    const instructor = allUsers.find(u => u.user_id === course.instructor_id);
    return instructor ? getUserDisplayName(instructor) : 'Unknown';
  };

  // Get student info
  const getStudentInfo = (studentId) => {
    const student = allUsers.find(u => u.user_id === studentId);
    return student ? getUserDisplayName(student) : studentId;
  };

  // Available students (non-teachers, excluding current user)
  const availableStudents = allUsers.filter(u => !u.teacher && u.user_id !== user?.id);

  // Toggle student selection
  const toggleStudent = (studentId) => {
    setFormData(prev => ({
      ...prev,
      student_ids: prev.student_ids.includes(studentId)
        ? prev.student_ids.filter(id => id !== studentId)
        : [...prev.student_ids, studentId]
    }));
  };

  // Save changes
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
      setIsEditing(false);
    } catch (err) {
      setSaveError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Cancel editing
  const handleCancel = () => {
    setFormData({
      course_name: course.course_name || '',
      school_name: course.school_name || '',
      student_ids: course.student_ids || []
    });
    setIsEditing(false);
    setSaveError('');
  };

  const styles = {
    container: {
      maxWidth: '1000px',
      margin: '0 auto',
      padding: '2rem'
    },
    backLink: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.5rem',
      color: '#4f46e5',
      textDecoration: 'none',
      fontSize: '0.875rem',
      fontWeight: '500',
      marginBottom: '1.5rem',
      cursor: 'pointer'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '2rem'
    },
    title: {
      margin: 0,
      fontSize: '2rem',
      fontWeight: '700',
      color: '#111827'
    },
    subtitle: {
      margin: '0.5rem 0 0 0',
      fontSize: '1rem',
      color: '#6b7280'
    },
    editBtn: {
      padding: '0.75rem 1.5rem',
      background: '#4f46e5',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: '600'
    },
    section: {
      background: 'white',
      borderRadius: '12px',
      padding: '1.5rem',
      marginBottom: '1.5rem',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      border: '1px solid #e5e7eb'
    },
    sectionTitle: {
      margin: '0 0 1rem 0',
      fontSize: '1.125rem',
      fontWeight: '600',
      color: '#111827',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem'
    },
    infoRow: {
      display: 'flex',
      padding: '0.75rem 0',
      borderBottom: '1px solid #f3f4f6'
    },
    infoLabel: {
      width: '140px',
      fontWeight: '600',
      color: '#374151'
    },
    infoValue: {
      color: '#6b7280',
      flex: 1
    },
    studentGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: '0.75rem'
    },
    studentCard: {
      padding: '0.75rem 1rem',
      background: '#f9fafb',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem'
    },
    studentAvatar: {
      width: '36px',
      height: '36px',
      borderRadius: '50%',
      background: '#4f46e5',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: '600',
      fontSize: '0.875rem'
    },
    placeholderSection: {
      background: '#f9fafb',
      borderRadius: '12px',
      padding: '3rem',
      textAlign: 'center',
      border: '2px dashed #d1d5db'
    },
    placeholderTitle: {
      margin: '0 0 0.5rem 0',
      fontSize: '1.25rem',
      fontWeight: '600',
      color: '#374151'
    },
    placeholderText: {
      margin: 0,
      color: '#6b7280'
    },
    formGroup: {
      marginBottom: '1rem'
    },
    label: {
      display: 'block',
      marginBottom: '0.5rem',
      fontWeight: '600',
      color: '#374151'
    },
    input: {
      width: '100%',
      padding: '0.75rem',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      fontSize: '1rem',
      boxSizing: 'border-box'
    },
    studentList: {
      maxHeight: '200px',
      overflow: 'auto',
      border: '1px solid #e5e7eb',
      borderRadius: '8px'
    },
    studentItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.75rem',
      borderBottom: '1px solid #f3f4f6',
      cursor: 'pointer',
      transition: 'background 0.15s'
    },
    checkbox: {
      width: '18px',
      height: '18px',
      cursor: 'pointer'
    },
    buttonGroup: {
      display: 'flex',
      gap: '0.75rem',
      marginTop: '1.5rem'
    },
    saveBtn: {
      padding: '0.75rem 1.5rem',
      background: '#4f46e5',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: '600'
    },
    cancelBtn: {
      padding: '0.75rem 1.5rem',
      background: '#f3f4f6',
      color: '#374151',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: '600'
    },
    error: {
      background: '#fef2f2',
      color: '#dc2626',
      padding: '0.75rem 1rem',
      borderRadius: '8px',
      marginBottom: '1rem'
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <p style={{ textAlign: 'center', color: '#6b7280' }}>Loading course...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <a href="#courses" style={styles.backLink}>← Back to Courses</a>
        <div style={styles.error}>{error}</div>
      </div>
    );
  }

  if (!course) {
    return (
      <div style={styles.container}>
        <a href="#courses" style={styles.backLink}>← Back to Courses</a>
        <p>Course not found</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <a href="#courses" style={styles.backLink}>← Back to Courses</a>

      {/* Header */}
      <div style={styles.header}>
        <div>
          {isEditing ? (
            <input
              type="text"
              value={formData.course_name}
              onChange={(e) => setFormData({ ...formData, course_name: e.target.value })}
              style={{ ...styles.input, fontSize: '1.5rem', fontWeight: '700' }}
              placeholder="Course Name"
            />
          ) : (
            <h1 style={styles.title}>{course.course_name}</h1>
          )}
          <p style={styles.subtitle}>
            {isEditing ? (
              <input
                type="text"
                value={formData.school_name}
                onChange={(e) => setFormData({ ...formData, school_name: e.target.value })}
                style={{ ...styles.input, marginTop: '0.5rem' }}
                placeholder="School Name (optional)"
              />
            ) : (
              course.school_name || 'No school specified'
            )}
          </p>
        </div>
        {isInstructor && !isEditing && (
          <button 
            style={styles.editBtn}
            onClick={() => setIsEditing(true)}
          >
            Edit Course
          </button>
        )}
      </div>

      {saveError && <div style={styles.error}>{saveError}</div>}

      {/* Course Info Section */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>
          📚 Course Information
        </h2>
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>Instructor</span>
          <span style={styles.infoValue}>{getInstructorName()}</span>
        </div>
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>Students</span>
          <span style={styles.infoValue}>{course.student_ids?.length || 0} enrolled</span>
        </div>
        <div style={{ ...styles.infoRow, borderBottom: 'none' }}>
          <span style={styles.infoLabel}>Course ID</span>
          <span style={styles.infoValue}>{course.id}</span>
        </div>
      </div>

      {/* Students Section */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>
          👥 Enrolled Students ({course.student_ids?.length || 0})
        </h2>
        
        {isEditing ? (
          <div>
            <p style={{ margin: '0 0 1rem 0', color: '#6b7280', fontSize: '0.875rem' }}>
              Click to select/deselect students ({formData.student_ids.length} selected)
            </p>
            {availableStudents.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>No students available to add.</p>
            ) : (
              <div style={styles.studentList}>
                {availableStudents.map(u => (
                  <div
                    key={u.user_id}
                    style={{
                      ...styles.studentItem,
                      background: formData.student_ids.includes(u.user_id) ? '#eef2ff' : 'transparent'
                    }}
                    onClick={() => toggleStudent(u.user_id)}
                  >
                    <input
                      type="checkbox"
                      checked={formData.student_ids.includes(u.user_id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleStudent(u.user_id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={styles.checkbox}
                    />
                    <span style={{ fontSize: '0.875rem', color: '#374151' }}>
                      {getUserDisplayName(u)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {course.student_ids?.length > 0 ? (
              <div style={styles.studentGrid}>
                {course.student_ids.map(studentId => {
                  const student = allUsers.find(u => u.user_id === studentId);
                  const initials = student?.first_name && student?.last_name
                    ? `${student.first_name[0]}${student.last_name[0]}`
                    : '?';
                  return (
                    <div key={studentId} style={styles.studentCard}>
                      <div style={styles.studentAvatar}>
                        {initials.toUpperCase()}
                      </div>
                      <span style={{ fontSize: '0.875rem', color: '#374151' }}>
                        {getStudentInfo(studentId)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: '#6b7280', margin: 0 }}>No students enrolled yet.</p>
            )}
          </>
        )}
      </div>

      {/* Edit Actions */}
      {isEditing && (
        <div style={styles.buttonGroup}>
          <button
            style={styles.saveBtn}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            style={styles.cancelBtn}
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Assignments Section - Placeholder */}
      <div style={{ ...styles.section, marginTop: isEditing ? '2rem' : '0' }}>
        <h2 style={styles.sectionTitle}>
          📝 Assignments
        </h2>
        <div style={styles.placeholderSection}>
          <h3 style={styles.placeholderTitle}>Assignments Coming Soon</h3>
          <p style={styles.placeholderText}>
            This section will allow you to create, manage, and track assignments for this course.
          </p>
        </div>
      </div>
    </div>
  );
}
