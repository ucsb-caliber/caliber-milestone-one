import React, { useEffect, useMemo, useState } from 'react';
import { getCourses, getPinnedCourseIds, setCoursePinned } from '../api';
import CourseCard from '../components/CourseCard';
import { useAuth } from '../AuthContext';
import { formatPacificDateTime, parseScheduleDate } from '../utils/datetime';
import {
  CourseDashboardEmptyState,
  CourseDashboardErrorBanner,
  CourseDashboardGrid,
  CourseDashboardHeader,
  CourseDashboardIconButton,
  CourseDashboardInput,
  CourseDashboardSpinnerState,
  CourseDashboardNotice,
  CourseDashboardPrimaryButton,
  CourseDashboardSection,
  CourseDashboardSelect,
  CourseDashboardStatCard,
  CourseDashboardStatGrid,
  CourseDashboardToolbar,
  PageContainer,
  RefreshIcon,
  dashboardPalette,
} from '../components/CourseDashboardUI';

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

function formatDueDate(value) {
  return formatPacificDateTime(value, {
    kind: 'schedule',
    month: 'short',
    day: 'numeric',
    year: undefined,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: undefined,
  }) || 'No due date';
}

function itemTime(date) {
  return date instanceof Date ? date.getTime() : Number.POSITIVE_INFINITY;
}

export default function StudentCoursesPage({ isInstructorView = false }) {
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
      const code = (course.course_code || '').toLowerCase();
      return name.includes(search) || school.includes(search) || code.includes(search);
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

  const dashboardSummary = useMemo(() => {
    const now = Date.now();
    const weekFromNow = now + (7 * 24 * 60 * 60 * 1000);
    const flattenedAssignments = courses.flatMap((course) =>
      (course.assignments || []).map((assignment) => {
        const dueDate = parseScheduleDate(assignment.due_date_soft) || parseScheduleDate(assignment.due_date_hard);
        return {
          course,
          assignment,
          dueDate,
        };
      })
    );

    const scheduledAssignments = flattenedAssignments
      .filter((item) => item.dueDate)
      .sort((a, b) => itemTime(a.dueDate) - itemTime(b.dueDate));

    const dueThisWeek = scheduledAssignments.filter((item) => {
      const dueMs = itemTime(item.dueDate);
      return dueMs >= now && dueMs <= weekFromNow;
    });

    return {
      totalCourses: courses.length,
      totalAssignments: flattenedAssignments.length,
      dueThisWeek,
      nextDue: scheduledAssignments.find((item) => itemTime(item.dueDate) >= now) || null,
    };
  }, [courses]);

  useEffect(() => {
    if (user?.id) {
      loadCourses();
    }
  }, [user?.id]);

  return (
    <PageContainer maxWidth="1200px">
      <CourseDashboardHeader
        title="Dashboard"
        subtitle="View your courses and upcoming deadlines."
        action={
          <CourseDashboardPrimaryButton onClick={loadCourses}>
            <RefreshIcon />
            Refresh
          </CourseDashboardPrimaryButton>
        }
      />

      {error ? <CourseDashboardErrorBanner>{error}</CourseDashboardErrorBanner> : null}

      {!loading && dashboardSummary.dueThisWeek.length > 0 ? (
        <CourseDashboardNotice>
          <strong>
            {dashboardSummary.dueThisWeek.length} assignment{dashboardSummary.dueThisWeek.length === 1 ? '' : 's'} due this week.
          </strong>{' '}
          {dashboardSummary.nextDue ? (
            <span>
              Next up: {(dashboardSummary.nextDue.course.course_code || dashboardSummary.nextDue.course.course_name || 'Course')} {dashboardSummary.nextDue.assignment.title || 'Assignment'} due {formatDueDate(dashboardSummary.nextDue.dueDate)}.
            </span>
          ) : null}
        </CourseDashboardNotice>
      ) : null}

      <CourseDashboardStatGrid>
        <CourseDashboardStatCard value={dashboardSummary.totalCourses} label="Active courses" />
        <CourseDashboardStatCard value={dashboardSummary.dueThisWeek.length} label="Due this week" valueColor={dashboardPalette.goldDark} />
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
        <CourseDashboardIconButton onClick={loadCourses} title="Refresh courses" aria-label="Refresh courses">
          <RefreshIcon />
        </CourseDashboardIconButton>
      </CourseDashboardToolbar>

      {loading ? (
        <CourseDashboardSpinnerState style={{ padding: '12px 0' }} />
      ) : processedCourses.length === 0 ? (
        <CourseDashboardEmptyState title="No courses found">
          {searchQuery ? 'No courses match the current search.' : 'You are not enrolled in any courses yet.'}
        </CourseDashboardEmptyState>
      ) : (
        <>
          {pinnedCourses.length > 0 ? (
            <CourseDashboardSection title="Pinned courses">
              <CourseDashboardGrid>
                {pinnedCourses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    isPinned={true}
                    onPin={() => togglePin(course.id)}
                    isInstructor={false}
                    allUsers={[]}
                    variant="dashboard"
                    nextDue={getNextDueAssignment(course)}
                    onOpen={() => {
                      window.location.hash = `student-course/${course.id}`;
                    }}
                  />
                ))}
              </CourseDashboardGrid>
            </CourseDashboardSection>
          ) : null}

          <CourseDashboardSection title={pinnedCourses.length > 0 ? 'All courses' : 'Your courses'}>
            <CourseDashboardGrid>
              {otherCourses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  isPinned={false}
                  onPin={() => togglePin(course.id)}
                  isInstructor={false}
                  allUsers={[]}
                  variant="dashboard"
                  nextDue={getNextDueAssignment(course)}
                  onOpen={() => {
                    window.location.hash = `student-course/${course.id}`;
                  }}
                />
              ))}
            </CourseDashboardGrid>
          </CourseDashboardSection>
        </>
      )}
    </PageContainer>
  );
}
