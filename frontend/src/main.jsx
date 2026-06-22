import React from 'react'
import ReactDOM from 'react-dom/client'
import Auth from './pages/Auth.jsx'
import LoggedOut from './pages/LoggedOut.jsx'
import { AuthProvider, useAuth } from './AuthContext.jsx'
import { getUserInfo } from './api.js'
import { flushAnalytics, trackEvent } from './analytics.js'
import { AppChrome, AppMain, AppNavbar } from './components/CourseDashboardUI.jsx'
import "./index.css";

// Determine backend base URL from Vite env or default to localhost
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

const UploadPDF = React.lazy(() => import('./pages/UploadPDF.jsx'));
const QuestionBank = React.lazy(() => import('./pages/QuestionBank.jsx'));
const CreateQuestion = React.lazy(() => import('./pages/CreateQuestion.jsx'));
const EditQuestion = React.lazy(() => import('./pages/EditQuestion.jsx'));
const Profile = React.lazy(() => import('./pages/Profile.jsx'));
const Onboarding = React.lazy(() => import('./pages/Onboarding.jsx'));
const InstructorCoursesPage = React.lazy(() => import('./pages/InstructorCoursesPage.jsx'));
const CourseDashboard = React.lazy(() => import('./pages/CourseDashboard.jsx'));
const CreateEditAssignment = React.lazy(() => import('./pages/CreateEditAssignment.jsx'));
const AssignmentView = React.lazy(() => import('./pages/AssignmentView.jsx'));
const StudentCoursesPage = React.lazy(() => import('./pages/StudentCoursesPage.jsx'));
const StudentCourseDashboard = React.lazy(() => import('./pages/StudentCourseDashboard.jsx'));
const StudentAssignmentPage = React.lazy(() => import('./pages/StudentAssignmentPage.jsx'));
const GradeAssignmentPage = React.lazy(() => import('./pages/GradeAssignmentPage.jsx'));
const VerifyQuestions = React.lazy(() => import('./pages/VerifyQuestions.jsx'));
const Analytics = React.lazy(() => import('./pages/Analytics.jsx'));

function RouteLoading() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <p>Loading...</p>
    </div>
  );
}

const instructorExactRoutes = {
  'upload-pdf': UploadPDF,
  questions: QuestionBank,
  'create-question': CreateQuestion,
  'edit-question': EditQuestion,
  verify: VerifyQuestions,
  courses: InstructorCoursesPage,
  analytics: Analytics,
};

function routeComponentFor(page, isInstructorOrAdmin) {
  if (page === 'profile') return Profile;
  if (page === 'student-courses') return StudentCoursesPage;
  if (page.startsWith('student-course/')) {
    return page.includes('/assignment/') ? StudentAssignmentPage : StudentCourseDashboard;
  }

  if (!isInstructorOrAdmin) return null;
  if (instructorExactRoutes[page]) return instructorExactRoutes[page];
  if (page.startsWith('course/') && !page.includes('/assignment/')) return CourseDashboard;
  if (page.includes('/assignment/') && page.includes('/view')) return AssignmentView;
  if (page.includes('/assignment/') && page.includes('/grade/')) return GradeAssignmentPage;
  if (page.includes('/assignment/') && (page.includes('/edit') || page.includes('/new'))) return CreateEditAssignment;

  return null;
}

// Protected component that requires authentication
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return children;
}

function EmptyRouteFallback({ page, user }) {
  if (!user) {
    return <Auth />;
  }

  return (
    <div style={{
      maxWidth: 720,
      margin: '3rem auto',
      padding: '1.5rem',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      background: '#fff',
      color: '#1f2937'
    }}>
      <h2 style={{ marginTop: 0 }}>Caliber is loading this view</h2>
      <p style={{ color: '#6b7280', lineHeight: 1.5 }}>
        We could not open the requested route <code>#{page}</code> yet. Use the navigation above,
        or return to your courses.
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <a href="#student-courses" style={{ color: '#4f46e5', fontWeight: 700 }}>Student courses</a>
        <a href="#courses" style={{ color: '#4f46e5', fontWeight: 700 }}>Instructor courses</a>
      </div>
    </div>
  );
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Caliber render failed:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        maxWidth: 760,
        margin: '4rem auto',
        padding: '1.5rem',
        border: '1px solid #fecaca',
        borderRadius: 8,
        background: '#fff7f7',
        color: '#7f1d1d',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <h1 style={{ marginTop: 0 }}>Caliber could not open this view</h1>
        <p style={{ color: '#991b1b' }}>
          Try returning to the course list. The page will show more once the API finishes loading.
        </p>
        <a href="#student-courses" style={{ color: '#4f46e5', fontWeight: 700 }}>Go to courses</a>
      </div>
    );
  }
}

// Simple router using hash-based navigation
function App() {
  const normalizeHashRoute = (route) => {
    if (!route) return route;
    return route.replace(
      /(course\/\d+\/assignment\/\d+\/grade)\/[^/]+$/,
      '$1/:student'
    );
  };

  const getPageFromHash = () => {
  const qs = new URLSearchParams(window.location.search);
  if (qs.get('logged_out') === '1') {
    return 'logged-out';
  }
  const hash = window.location.hash.slice(1);
  return normalizeHashRoute(hash.split('?')[0] || 'courses');
  };

  const [page, setPage] = React.useState(getPageFromHash());
  const [userInfo, setUserInfo] = React.useState(null);
  const [checkingProfile, setCheckingProfile] = React.useState(true);
  const [profilePrefs, setProfilePrefs] = React.useState({
    iconShape: 'circle',
    color: '#4f46e5',
    initials: ''
  });


  const { user, loading, exitImpersonation, signOut } = useAuth();
  const isInstructorOrAdmin = Boolean(userInfo?.teacher || userInfo?.admin);
  const impersonation = user?.impersonation;
  const pageViewedAtRef = React.useRef(Date.now());
  const previousPageRef = React.useRef(page);

  // Check if user profile is complete and load preferences
  React.useEffect(() => {
    async function checkProfile() {
      if (user && !loading) {
        try {
          const info = await getUserInfo();
          setUserInfo(info);
          // Set profile preferences from backend
          setProfilePrefs({
            iconShape: info.icon_shape || 'circle',
            color: info.icon_color || '#4f46e5',
            initials: info.initials || getDefaultInitials(info)
          });
        } catch (error) {
          console.error('Error fetching user info:', error);
        } finally {
          setCheckingProfile(false);
        }
      } else {
        setCheckingProfile(false);
      }
    }

    checkProfile();
  }, [user, loading]);

  // Listen for profile preference updates
  React.useEffect(() => {
    const handlePreferencesUpdate = (event) => {
      setProfilePrefs(event.detail);
    };

    window.addEventListener('profilePreferencesUpdated', handlePreferencesUpdate);
    return () => window.removeEventListener('profilePreferencesUpdated', handlePreferencesUpdate);
  }, []);

  const getDefaultInitials = (info) => {
    if (info?.first_name && info?.last_name) {
      return `${info.first_name[0]}${info.last_name[0]}`.toUpperCase();
    }
    const email = user?.email || info?.email || '';
    const display = (email.split('@')[0] || '').trim();
    if (!display) return 'U';
    return display.slice(0, 2).toUpperCase();
  };

  React.useEffect(() => {
    const handleHashChange = () => {
      setPage(getPageFromHash());
    };
     window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  React.useEffect(() => {
    if (!user || loading || checkingProfile) return;
    const now = Date.now();
    const previousPage = previousPageRef.current;
    if (previousPage && previousPage !== page) {
      trackEvent('page_left', {
        route: previousPage,
        metadata: { duration_ms: now - pageViewedAtRef.current },
      });
      void flushAnalytics({ keepalive: true });
    }
    previousPageRef.current = page;
    pageViewedAtRef.current = now;
    trackEvent('page_viewed', { route: page });
  }, [page, user, loading, checkingProfile]);

  React.useEffect(() => {
    if (!user || loading || checkingProfile) return;
    const handleClick = (event) => {
      const target = event.target?.closest?.('button,a,input,select,textarea,[role="button"]');
      if (!target) return;
      trackEvent('tap', {
        metadata: { action: target.tagName },
      });
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [user, loading, checkingProfile]);

  React.useEffect(() => {
    if (!user || page !== 'logged-out') return;
    const url = new URL(window.location.href);
    url.searchParams.delete('logged_out');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    window.location.hash = 'student-courses';
  }, [user, page]);

  const handleLogoClick = () => {
    // Students land on courses; instructors/admins land on course dashboard
    window.location.hash = isInstructorOrAdmin ? 'courses' : 'student-courses';
    window.location.reload();
  };

  const handleOnboardingComplete = async () => {
    // Refresh user info after onboarding
    try {
      const info = await getUserInfo();
      setUserInfo(info);
    } catch (error) {
      console.error('Error fetching updated user info:', error);
    }
  };

  const needsOnboarding = user && userInfo && !userInfo.profile_complete;
  const RouteComponent = routeComponentFor(page, isInstructorOrAdmin);

  React.useEffect(() => {
    if (!user || loading || checkingProfile || !userInfo || needsOnboarding) return;
    if (isInstructorOrAdmin) return;

    const isAllowedStudentPage =
      page === 'profile' ||
      page === 'student-courses' ||
      page.startsWith('student-course/');

    if (!isAllowedStudentPage) {
      window.location.hash = 'student-courses';
    }
  }, [user, loading, checkingProfile, userInfo, needsOnboarding, isInstructorOrAdmin, page]);

  // Show loading state while checking profile
  if (user && checkingProfile) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <AppChrome>
      {user ? (
        <AppNavbar
          apiBase={API_BASE}
          onLogoClick={handleLogoClick}
          user={user}
          isInstructorOrAdmin={isInstructorOrAdmin}
          page={page}
          profilePrefs={profilePrefs}
          signOut={signOut}
        />
      ) : null}
      <AppMain style={!user && !loading ? { padding: 0 } : null}>
        {impersonation?.active && (
          <div className="caliber-impersonation-banner">
            <span>
              Viewing as <strong>{user?.first_name || user?.last_name || user?.email || user?.user_id || 'student'}</strong> (student) - you are {impersonation.impersonator_name}
            </span>
            <button type="button" onClick={exitImpersonation}>
              Exit impersonation
            </button>
          </div>
        )}
        <React.Suspense fallback={<RouteLoading />}>
          {!user && !loading ? (
            page === 'logged-out' ? <LoggedOut /> : <Auth />
          ) : needsOnboarding ? (
            <Onboarding onComplete={handleOnboardingComplete} />
          ) : page === 'logged-out' ? (
            null
          ) : RouteComponent ? (
            <ProtectedRoute>
              <RouteComponent />
            </ProtectedRoute>
          ) : (
            <EmptyRouteFallback page={page} user={user} />
          )}
        </React.Suspense>
      </AppMain>
    </AppChrome>
  );
}

function AppWrapper() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <AppWrapper />
    </AppErrorBoundary>
  </React.StrictMode>
)
