import React, { useState, useEffect } from 'react';
import { getCourses, createCourse, updateCourse, deleteCourse, getAllUsers, getUserInfo } from '../api';
import CourseCard from '../components/CourseCard';
import { useAuth } from '../AuthContext';

export default function InstructorCoursesPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isTeacher, setIsTeacher] = useState(false);
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    course_name: '',
    school_name: '',
    student_ids: []
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Check if current user is a teacher
  useEffect(() => {
    async function fetchUserInfo() {
      try {
        const info = await getUserInfo();
        setIsTeacher(info.teacher === true);
      } catch (err) {
        console.error('Failed to fetch user info:', err);
        setIsTeacher(false);
      }
    }
    if (user) {
      fetchUserInfo();
    }
  }, [user]);

  // Load courses and users
  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [coursesData, usersData] = await Promise.all([
        getCourses(),
        getAllUsers()
      ]);
      setCourses(coursesData.courses || []);
      setAllUsers(usersData.users || []);
    } catch (err) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Reset form
  const resetForm = () => {
    setFormData({
      course_name: '',
      school_name: '',
      student_ids: []
    });
    setFormError('');
  };

  // Handle create course
  const handleCreateCourse = async (e) => {
    e.preventDefault();
    if (!formData.course_name.trim()) {
      setFormError('Course name is required');
      return;
    }

    setFormLoading(true);
    setFormError('');
    try {
      await createCourse(formData);
      setShowCreateModal(false);
      resetForm();
      await loadData();
    } catch (err) {
      setFormError(err.message || 'Failed to create course');
    } finally {
      setFormLoading(false);
    }
  };

  // Handle edit course
  const handleEditCourse = async (e) => {
    e.preventDefault();
    if (!formData.course_name.trim()) {
      setFormError('Course name is required');
      return;
    }

    setFormLoading(true);
    setFormError('');
    try {
      await updateCourse(selectedCourse.id, formData);
      setShowEditModal(false);
      resetForm();
      setSelectedCourse(null);
      await loadData();
    } catch (err) {
      setFormError(err.message || 'Failed to update course');
    } finally {
      setFormLoading(false);
    }
  };

  // Handle delete course
  const handleDeleteCourse = async () => {
    setFormLoading(true);
    try {
      await deleteCourse(selectedCourse.id);
      setShowDeleteModal(false);
      setSelectedCourse(null);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to delete course');
    } finally {
      setFormLoading(false);
    }
  };

  // Open edit modal
  const openEditModal = (course) => {
    setSelectedCourse(course);
    setFormData({
      course_name: course.course_name,
      school_name: course.school_name || '',
      student_ids: course.student_ids || []
    });
    setShowEditModal(true);
  };

  // Open delete modal
  const openDeleteModal = (course) => {
    setSelectedCourse(course);
    setShowDeleteModal(true);
  };

  // Toggle student selection
  const toggleStudent = (studentId) => {
    setFormData(prev => ({
      ...prev,
      student_ids: prev.student_ids.includes(studentId)
        ? prev.student_ids.filter(id => id !== studentId)
        : [...prev.student_ids, studentId]
    }));
  };

  // Get display name for a user
  const getUserDisplayName = (u) => {
    if (u.first_name && u.last_name) {
      return `${u.first_name} ${u.last_name}`;
    }
    return u.email || u.user_id;
  };

  // Filter out teachers from student list (students only)
  const availableStudents = allUsers.filter(u => !u.teacher && u.user_id !== user?.id);

  // Styles
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
    createBtn: {
      padding: '0.75rem 1.5rem',
      background: '#4f46e5',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '1rem',
      fontWeight: '600',
      transition: 'background-color 0.15s'
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
    modal: {
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
    },
    modalContent: {
      background: 'white',
      padding: '2rem',
      borderRadius: '12px',
      maxWidth: '500px',
      width: '90%',
      maxHeight: '80vh',
      overflow: 'auto'
    },
    modalTitle: {
      margin: '0 0 1.5rem 0',
      fontSize: '1.25rem',
      fontWeight: '700'
    },
    formGroup: {
      marginBottom: '1rem'
    },
    label: {
      display: 'block',
      marginBottom: '0.5rem',
      fontWeight: '600',
      color: '#374151',
      fontSize: '0.875rem'
    },
    input: {
      width: '100%',
      padding: '0.75rem',
      border: '1px solid #d1d5db',
      borderRadius: '6px',
      fontSize: '1rem',
      boxSizing: 'border-box'
    },
    studentList: {
      maxHeight: '200px',
      overflowY: 'auto',
      border: '1px solid #d1d5db',
      borderRadius: '6px',
      padding: '0.5rem'
    },
    studentItem: {
      display: 'flex',
      alignItems: 'center',
      padding: '0.5rem',
      borderRadius: '4px',
      cursor: 'pointer',
      transition: 'background-color 0.15s'
    },
    checkbox: {
      marginRight: '0.75rem',
      width: '18px',
      height: '18px'
    },
    buttonGroup: {
      display: 'flex',
      gap: '0.75rem',
      justifyContent: 'flex-end',
      marginTop: '1.5rem'
    },
    cancelBtn: {
      padding: '0.75rem 1.5rem',
      background: '#f3f4f6',
      color: '#374151',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: '500'
    },
    submitBtn: {
      padding: '0.75rem 1.5rem',
      background: '#4f46e5',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: '600'
    },
    deleteBtn: {
      padding: '0.75rem 1.5rem',
      background: '#dc2626',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: '600'
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

  // Render create/edit modal
  const renderFormModal = (isEdit = false) => (
    <div style={styles.modal}>
      <div style={styles.modalContent}>
        <h2 style={styles.modalTitle}>
          {isEdit ? 'Edit Course' : 'Create New Course'}
        </h2>
        
        {formError && (
          <div style={styles.errorBanner}>{formError}</div>
        )}

        <form onSubmit={isEdit ? handleEditCourse : handleCreateCourse}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Course Name *</label>
            <input
              type="text"
              value={formData.course_name}
              onChange={(e) => setFormData({ ...formData, course_name: e.target.value })}
              style={styles.input}
              placeholder="e.g., Introduction to Computer Science"
              disabled={formLoading}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>School Name</label>
            <input
              type="text"
              value={formData.school_name}
              onChange={(e) => setFormData({ ...formData, school_name: e.target.value })}
              style={styles.input}
              placeholder="e.g., UCSB"
              disabled={formLoading}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              Add Students ({formData.student_ids.length} selected)
            </label>
            {availableStudents.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>
                No students available to add.
              </p>
            ) : (
              <div style={styles.studentList}>
                {availableStudents.map(u => (
                  <div
                    key={u.user_id}
                    style={{
                      ...styles.studentItem,
                      background: formData.student_ids.includes(u.user_id) ? '#eef2ff' : 'transparent'
                    }}
                    onClick={() => !formLoading && toggleStudent(u.user_id)}
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
                      disabled={formLoading}
                    />
                    <span style={{ fontSize: '0.875rem', color: '#374151' }}>
                      {getUserDisplayName(u)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={styles.buttonGroup}>
            <button
              type="button"
              onClick={() => {
                isEdit ? setShowEditModal(false) : setShowCreateModal(false);
                resetForm();
                setSelectedCourse(null);
              }}
              style={styles.cancelBtn}
              disabled={formLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                ...styles.submitBtn,
                opacity: formLoading ? 0.6 : 1,
                cursor: formLoading ? 'not-allowed' : 'pointer'
              }}
              disabled={formLoading}
            >
              {formLoading ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Course')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // Render delete confirmation modal
  const renderDeleteModal = () => (
    <div style={styles.modal}>
      <div style={styles.modalContent}>
        <h2 style={styles.modalTitle}>Delete Course</h2>
        <p style={{ color: '#374151', marginBottom: '1.5rem' }}>
          Are you sure you want to delete <strong>{selectedCourse?.course_name}</strong>? 
          This action cannot be undone and will remove all associated data.
        </p>
        <div style={styles.buttonGroup}>
          <button
            onClick={() => {
              setShowDeleteModal(false);
              setSelectedCourse(null);
            }}
            style={styles.cancelBtn}
            disabled={formLoading}
          >
            Cancel
          </button>
          <button
            onClick={handleDeleteCourse}
            style={{
              ...styles.deleteBtn,
              opacity: formLoading ? 0.6 : 1,
              cursor: formLoading ? 'not-allowed' : 'pointer'
            }}
            disabled={formLoading}
          >
            {formLoading ? 'Deleting...' : 'Delete Course'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Courses</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {isTeacher && (
            <button
              onClick={() => {
                resetForm();
                setShowCreateModal(true);
              }}
              style={styles.createBtn}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4338ca'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#4f46e5'}
            >
              + Create Course
            </button>
          )}
          <button
            onClick={loadData}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: '500',
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div style={styles.errorBanner}>{error}</div>
      )}

      {loading ? (
        <p>Loading courses...</p>
      ) : courses.length === 0 ? (
        <div style={styles.emptyState}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#374151' }}>No Courses Found</h3>
          <p style={{ margin: 0 }}>
            {isTeacher 
              ? "You haven't created any courses yet. Click 'Create Course' to get started."
              : "You're not enrolled in any courses yet."}
          </p>
        </div>
      ) : (
        <div style={styles.grid}>
          {courses.map(course => (
            <CourseCard
              key={course.id}
              course={course}
              isInstructor={course.instructor_id === user?.id}
              allUsers={allUsers}
              onEdit={course.instructor_id === user?.id ? openEditModal : null}
              onDelete={course.instructor_id === user?.id ? openDeleteModal : null}
              onViewDetails={(c) => window.location.hash = `course/${c.id}`}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreateModal && renderFormModal(false)}
      {showEditModal && renderFormModal(true)}
      {showDeleteModal && renderDeleteModal()}
    </div>
  );
}
