import React, { useEffect, useState, useMemo } from 'react';
import { getAdminCoursesOverview } from '../api';
import CourseCard from '../components/CourseCard';
import {
  CourseDashboardEmptyState,
  CourseDashboardErrorBanner,
  CourseDashboardGrid,
  CourseDashboardHeader,
  CourseDashboardIconButton,
  CourseDashboardInput,
  CourseDashboardLoadingState,
  CourseDashboardSection,
  CourseDashboardSelect,
  CourseDashboardStatCard,
  CourseDashboardStatGrid,
  CourseDashboardToolbar,
  PageContainer,
  RefreshIcon,
} from '../components/CourseDashboardUI';

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
    const search = searchQuery.trim().toLowerCase();
    const filtered = courses.filter((course) => {
      const name = (course.course_name || '').toLowerCase();
      const school = (course.school_name || '').toLowerCase();
      const code = (course.course_code || '').toLowerCase();
      return name.includes(search) || school.includes(search) || code.includes(search);
    });

    if (sortBy === 'name') {
      filtered.sort((a, b) => (a.course_name || '').localeCompare(b.course_name || ''));
    } else if (sortBy === 'students') {
      filtered.sort((a, b) => (b.student_ids?.length || 0) - (a.student_ids?.length || 0));
    } else if (sortBy === 'assignments') {
      filtered.sort((a, b) => (b.assignment_count || 0) - (a.assignment_count || 0));
    }

    return filtered;
  }, [courses, searchQuery, sortBy]);

  return (
    <PageContainer maxWidth="1200px">
      <CourseDashboardHeader
        title="All courses"
        subtitle="Review courses across the system."
        action={
          <CourseDashboardIconButton onClick={loadCourses} title="Refresh courses" aria-label="Refresh courses">
            <RefreshIcon />
          </CourseDashboardIconButton>
        }
      />

      {error ? <CourseDashboardErrorBanner>{error}</CourseDashboardErrorBanner> : null}

      <CourseDashboardStatGrid>
        <CourseDashboardStatCard value={courses.length} label="Courses" />
        <CourseDashboardStatCard value={courses.reduce((sum, course) => sum + (course.student_ids?.length || 0), 0)} label="Students" />
        <CourseDashboardStatCard value={courses.reduce((sum, course) => sum + (course.assignment_count || 0), 0)} label="Assignments" />
      </CourseDashboardStatGrid>

      <CourseDashboardToolbar>
        <CourseDashboardInput
          placeholder="Search courses"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <CourseDashboardSelect value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="name">Sort by name</option>
          <option value="students">Sort by students</option>
          <option value="assignments">Sort by assignments</option>
        </CourseDashboardSelect>
      </CourseDashboardToolbar>

      {loading ? (
        <CourseDashboardLoadingState>Loading courses...</CourseDashboardLoadingState>
      ) : processedCourses.length === 0 ? (
        <CourseDashboardEmptyState title="No courses found">
          {searchQuery ? 'No courses match the current search.' : 'There are no courses in the system yet.'}
        </CourseDashboardEmptyState>
      ) : (
        <CourseDashboardSection title="Courses">
          <CourseDashboardGrid>
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
          </CourseDashboardGrid>
        </CourseDashboardSection>
      )}
    </PageContainer>
  );
}
