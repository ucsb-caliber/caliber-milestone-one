import React, { useEffect, useMemo, useState } from 'react';
import { getCourses, getPinnedCourseIds, setCoursePinned } from '../api';
import CourseCard from '../components/CourseCard';
import { useAuth } from '../AuthContext';
import { parseScheduleDate } from '../utils/datetime';
import {
  CourseDashboardEmptyState,
  CourseDashboardErrorBanner,
  CourseDashboardGrid,
  CourseDashboardHeader,
  CourseDashboardIconButton,
  CourseDashboardInput,
  CourseDashboardSpinnerState,
  CourseDashboardPrimaryButton,
  CourseDashboardSection,
  CourseDashboardSelect,
  CourseDashboardStatCard,
  CourseDashboardStatGrid,
  CourseDashboardToolbar,
  PageContainer,
  RefreshIcon,
} from '../components/CourseDashboardUI';
import { buildHashWithFrom } from '../utils/navigation';

function getNextDueAssignment(course) {
  const now = Date.now();
  return (course.assignments || [])
    .map((assignment) => {
      const dueDate = parseScheduleDate(assignment.due_date_soft) || parseScheduleDate(assignment.due_date_hard);
      return dueDate ? { assignment, dueDate } : null;
    })
    .filter(Boolean)
    .filter((item) => item.dueDate.getTime() >= now)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0] || null;
}

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

    const query = searchQuery.trim().toLowerCase();
    const filtered = courses.filter((course) => {
      const name = (course.course_name || '').toLowerCase();
      const school = (course.school_name || '').toLowerCase();
      const code = (course.course_code || '').toLowerCase();
      return name.includes(query) || school.includes(query) || code.includes(query);
    });

    if (sortBy === 'students') {
      filtered.sort((a, b) => (b.student_ids?.length || 0) - (a.student_ids?.length || 0));
    } else if (sortBy === 'assignments') {
      filtered.sort((a, b) => (b.assignments?.length || 0) - (a.assignments?.length || 0));
    } else {
      filtered.sort((a, b) => (a.course_name || '').localeCompare(b.course_name || ''));
    }

    return filtered;
  }, [courses, searchQuery, sortBy]);

  const pinnedCourses = processedCourses.filter((course) => pinnedIds.includes(course.id));
  const otherCourses = processedCourses.filter((course) => !pinnedIds.includes(course.id));

  const dashboardSummary = useMemo(() => ({
    totalCourses: courses.length,
    totalPinned: courses.filter((course) => pinnedIds.includes(course.id)).length,
    totalAssignments: courses.reduce((sum, course) => sum + (course.assignments?.length || 0), 0),
  }), [courses, pinnedIds]);

  return (
    <PageContainer maxWidth="1200px">
      <CourseDashboardHeader
        title="Courses"
        subtitle="Open a course to review assignments, rosters, and deadlines."
        action={
          <CourseDashboardPrimaryButton onClick={loadData}>
            <RefreshIcon />
            Refresh
          </CourseDashboardPrimaryButton>
        }
      />

      {error ? <CourseDashboardErrorBanner onDismiss={() => setError('')}>{error}</CourseDashboardErrorBanner> : null}

      <CourseDashboardStatGrid>
        <CourseDashboardStatCard value={dashboardSummary.totalCourses} label="Courses" />
        <CourseDashboardStatCard value={dashboardSummary.totalPinned} label="Pinned" />
        <CourseDashboardStatCard value={dashboardSummary.totalAssignments} label="Assignments" />
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
        <CourseDashboardIconButton onClick={loadData} title="Refresh courses" aria-label="Refresh courses">
          <RefreshIcon />
        </CourseDashboardIconButton>
      </CourseDashboardToolbar>

      {loading ? (
        <CourseDashboardSpinnerState style={{ padding: '12px 0' }} />
      ) : processedCourses.length === 0 ? (
        <CourseDashboardEmptyState title="No courses found">
          {searchQuery ? 'No courses match the current search.' : 'Create and manage courses from the Platform home page.'}
        </CourseDashboardEmptyState>
      ) : (
        <>
          {pinnedCourses.length > 0 ? (
            <CourseDashboardSection title="Pinned courses">
              <CourseDashboardGrid
                style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
              >
                {pinnedCourses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    isPinned={true}
                    onPin={() => togglePin(course.id)}
                    onOpen={() => {
                      window.location.hash = buildHashWithFrom(`course/${course.id}`);
                    }}
                    isInstructor={false}
                    allUsers={[]}
                    variant="dashboard"
                    nextDue={getNextDueAssignment(course)}
                  />
                ))}
              </CourseDashboardGrid>
            </CourseDashboardSection>
          ) : null}

          <CourseDashboardSection title={pinnedCourses.length > 0 ? 'All courses' : 'Your courses'}>
            <CourseDashboardGrid
              style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
            >
              {otherCourses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  isPinned={false}
                  onPin={() => togglePin(course.id)}
                  onOpen={() => {
                    window.location.hash = buildHashWithFrom(`course/${course.id}`);
                  }}
                  isInstructor={false}
                  allUsers={[]}
                  variant="dashboard"
                  nextDue={getNextDueAssignment(course)}
                />
              ))}
            </CourseDashboardGrid>
          </CourseDashboardSection>
        </>
      )}
    </PageContainer>
  );
}
