import React from 'react';

export const dashboardPalette = {
  navy: '#003660',
  navyMid: '#00507a',
  navyLight: '#cce0f0',
  gold: '#FEBC11',
  goldDark: '#d9a00e',
  surface: '#f4f7fb',
  white: '#ffffff',
  border: '#dde6ef',
  text: '#0a1f35',
  muted: '#5a7590',
  dangerBg: '#fef2f2',
  dangerBorder: '#fecaca',
  dangerText: '#b91c1c',
};

const shellStyles = {
  page: {
    minHeight: '100vh',
    background: dashboardPalette.surface,
    color: dashboardPalette.text,
  },
  layout: {
    width: '100%',
    minHeight: '100vh',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'stretch',
  },
  sidebar: {
    width: '248px',
    position: 'sticky',
    top: 0,
    height: '100vh',
    background: dashboardPalette.navy,
    color: dashboardPalette.white,
    padding: '24px 0',
    display: 'flex',
    flexDirection: 'column',
    borderRight: `1px solid ${dashboardPalette.navyMid}`,
    overflowY: 'auto',
    flexShrink: 0,
  },
  brand: {
    padding: '0 20px 20px',
    borderBottom: `1px solid ${dashboardPalette.navyMid}`,
  },
  brandTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 600,
    letterSpacing: '0.01em',
  },
  nav: {
    padding: '16px 0',
  },
  navLink: {
    display: 'block',
    padding: '10px 20px',
    color: 'rgba(255, 255, 255, 0.7)',
    textDecoration: 'none',
    fontSize: '0.95rem',
    borderLeft: '3px solid transparent',
  },
  navLinkActive: {
    color: dashboardPalette.white,
    background: 'rgba(255, 255, 255, 0.08)',
    borderLeftColor: dashboardPalette.gold,
  },
  userBlock: {
    marginTop: 'auto',
    padding: '16px 20px 0',
    borderTop: `1px solid ${dashboardPalette.navyMid}`,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  userAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: '999px',
    background: dashboardPalette.gold,
    color: dashboardPalette.navy,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.85rem',
    fontWeight: 600,
    flexShrink: 0,
  },
  userName: {
    margin: 0,
    fontSize: '0.95rem',
    fontWeight: 500,
  },
  userMeta: {
    margin: '2px 0 0',
    fontSize: '0.8rem',
    color: 'rgba(255, 255, 255, 0.65)',
    wordBreak: 'break-word',
  },
  main: {
    flex: '1 1 720px',
    minWidth: 0,
    padding: '24px',
  },
};

const contentStyles = {
  pageContainer: {
    maxWidth: '960px',
    margin: '0 auto',
  },
  pageStack: {
    display: 'grid',
    gap: '24px',
  },
  surfaceCard: {
    background: dashboardPalette.white,
    border: `1px solid ${dashboardPalette.border}`,
    borderRadius: '8px',
    padding: '24px',
  },
  surfaceLabel: {
    margin: '0 0 6px',
    fontSize: '0.85rem',
    color: dashboardPalette.muted,
  },
  mutedText: {
    margin: 0,
    color: dashboardPalette.muted,
    fontSize: '0.92rem',
    lineHeight: 1.5,
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  pageTitle: {
    margin: 0,
    fontSize: '1.75rem',
    fontWeight: 600,
    lineHeight: 1.2,
    color: dashboardPalette.navy,
  },
  pageSubtitle: {
    margin: '8px 0 0',
    fontSize: '0.95rem',
    color: dashboardPalette.muted,
  },
  primaryButton: {
    height: '40px',
    padding: '0 14px',
    border: `1px solid ${dashboardPalette.navy}`,
    borderRadius: '8px',
    background: dashboardPalette.navy,
    color: dashboardPalette.white,
    fontSize: '0.9rem',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  secondaryButton: {
    height: '40px',
    padding: '0 14px',
    border: `1px solid ${dashboardPalette.border}`,
    borderRadius: '8px',
    background: dashboardPalette.white,
    color: dashboardPalette.text,
    fontSize: '0.9rem',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  iconButton: {
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    border: `1px solid ${dashboardPalette.border}`,
    background: dashboardPalette.white,
    color: dashboardPalette.navy,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbar: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  input: {
    flex: '1 1 300px',
    minWidth: '220px',
    height: '40px',
    padding: '0 12px',
    borderRadius: '8px',
    border: `1px solid ${dashboardPalette.border}`,
    background: dashboardPalette.white,
    color: dashboardPalette.text,
    fontSize: '0.95rem',
  },
  select: {
    height: '40px',
    minWidth: '168px',
    padding: '0 12px',
    borderRadius: '8px',
    border: `1px solid ${dashboardPalette.border}`,
    background: dashboardPalette.white,
    color: dashboardPalette.text,
    fontSize: '0.95rem',
  },
  notice: {
    background: '#fff9e6',
    border: `1px solid ${dashboardPalette.gold}`,
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '24px',
    fontSize: '0.92rem',
    color: dashboardPalette.text,
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  statCard: {
    background: dashboardPalette.white,
    border: `1px solid ${dashboardPalette.border}`,
    borderRadius: '8px',
    padding: '16px',
  },
  statValue: {
    margin: 0,
    fontSize: '1.5rem',
    fontWeight: 600,
    lineHeight: 1.2,
    color: dashboardPalette.navy,
  },
  statLabel: {
    margin: '6px 0 0',
    fontSize: '0.88rem',
    color: dashboardPalette.muted,
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    margin: '0 0 16px',
    fontSize: '1rem',
    fontWeight: 600,
    color: dashboardPalette.navy,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '16px',
  },
  emptyState: {
    background: dashboardPalette.white,
    border: `1px solid ${dashboardPalette.border}`,
    borderRadius: '8px',
    padding: '32px',
    color: dashboardPalette.muted,
  },
  emptyTitle: {
    margin: '0 0 8px',
    fontSize: '1rem',
    fontWeight: 600,
    color: dashboardPalette.navy,
  },
  errorBanner: {
    marginBottom: '24px',
    background: dashboardPalette.dangerBg,
    border: `1px solid ${dashboardPalette.dangerBorder}`,
    borderRadius: '8px',
    color: dashboardPalette.dangerText,
    padding: '12px 16px',
    fontSize: '0.92rem',
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  loadingState: {
    background: 'transparent',
    border: 'none',
    borderRadius: 0,
    padding: '24px 0',
    color: dashboardPalette.muted,
  },
  appFrame: {
    minHeight: '100vh',
    background: dashboardPalette.surface,
    color: dashboardPalette.text,
    display: 'flex',
    alignItems: 'stretch',
  },
  appNav: {
    position: 'sticky',
    top: 0,
    background: dashboardPalette.navy,
    color: dashboardPalette.white,
    borderRight: `1px solid ${dashboardPalette.navyMid}`,
    width: '248px',
    height: '100vh',
    padding: '24px 0',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflowY: 'auto',
  },
  appNavInner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    minHeight: '100%',
    flex: 1,
  },
  appBrand: {
    color: dashboardPalette.white,
    textDecoration: 'none',
    fontSize: '1rem',
    fontWeight: 600,
    letterSpacing: '0.01em',
    padding: 0,
  },
  appBrandRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '0 20px 20px',
    borderBottom: `1px solid ${dashboardPalette.navyMid}`,
  },
  appCollapseButton: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: `1px solid ${dashboardPalette.navyMid}`,
    background: 'transparent',
    color: dashboardPalette.white,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: '0.9rem',
    fontWeight: 700,
  },
  appDocsLink: {
    color: 'rgba(255, 255, 255, 0.8)',
    textDecoration: 'none',
    fontSize: '0.82rem',
    padding: '10px 20px',
    borderLeft: '3px solid transparent',
  },
  appNavLinks: {
    marginTop: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '4px',
    padding: '0 0 16px',
  },
  appNavLink: {
    color: 'rgba(255, 255, 255, 0.76)',
    textDecoration: 'none',
    fontSize: '0.92rem',
    padding: '10px 20px',
    borderLeft: '3px solid transparent',
  },
  appNavLinkActive: {
    color: dashboardPalette.white,
    background: 'rgba(255, 255, 255, 0.08)',
    borderLeftColor: dashboardPalette.gold,
    fontWeight: 600,
  },
  appProfileLink: {
    color: 'rgba(255, 255, 255, 0.82)',
    textDecoration: 'none',
    fontSize: '0.9rem',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderLeft: '3px solid transparent',
    padding: '10px 20px',
  },
  appProfileText: {
    fontWeight: 600,
  },
  appAvatar: {
    width: 28,
    height: 28,
    color: dashboardPalette.white,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: '0.78rem',
    flexShrink: 0,
  },
  appMain: {
    flex: 1,
    minWidth: 0,
    padding: '24px',
  },
  appFooter: {
    marginTop: 'auto',
    padding: '16px 20px 0',
    borderTop: `1px solid ${dashboardPalette.navyMid}`,
    display: 'grid',
    gap: '12px',
  },
  appUserSummary: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  appUserMeta: {
    minWidth: 0,
  },
  appUserName: {
    margin: 0,
    fontSize: '0.95rem',
    fontWeight: 600,
  },
};

export function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 2v6h-6"></path>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
      <path d="M3 22v-6h6"></path>
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
    </svg>
  );
}

export function getUserDisplayName(user) {
  const fullName = user?.user_metadata?.full_name;
  if (typeof fullName === 'string' && fullName.trim()) return fullName.trim();

  const firstName = user?.user_metadata?.first_name;
  const lastName = user?.user_metadata?.last_name;
  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }

  const email = user?.email || '';
  const localPart = email.split('@')[0] || '';
  const normalized = localPart.replace(/[._-]+/g, ' ').trim();
  if (!normalized) return 'User';
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getUserInitials(user) {
  const name = getUserDisplayName(user);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export function CourseDashboardShell({ user, navLinks, children }) {
  return (
    <div style={shellStyles.page}>
      <div style={shellStyles.layout}>
        <aside style={shellStyles.sidebar}>
          <div style={shellStyles.brand}>
            <h1 style={shellStyles.brandTitle}>Caliber</h1>
          </div>

          <nav style={shellStyles.nav} aria-label="Course navigation">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                style={{
                  ...shellStyles.navLink,
                  ...(link.active ? shellStyles.navLinkActive : null),
                }}
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div style={shellStyles.userBlock}>
            <div style={shellStyles.userAvatar}>{getUserInitials(user)}</div>
            <div>
              <p style={shellStyles.userName}>{getUserDisplayName(user)}</p>
              <p style={shellStyles.userMeta}>{user?.email || 'Signed in'}</p>
            </div>
          </div>
        </aside>

        <main style={shellStyles.main}>{children}</main>
      </div>
    </div>
  );
}

export function CourseDashboardHeader({ title, subtitle, action }) {
  return (
    <div style={contentStyles.headerRow}>
      <div>
        <h1 style={contentStyles.pageTitle}>{title}</h1>
        {subtitle ? <p style={contentStyles.pageSubtitle}>{subtitle}</p> : null}
      </div>
      {action || null}
    </div>
  );
}

export function CourseDashboardPrimaryButton({ children, style, ...props }) {
  return (
    <button type="button" style={{ ...contentStyles.primaryButton, ...style }} {...props}>
      {children}
    </button>
  );
}

export function CourseDashboardSecondaryButton({ children, style, ...props }) {
  return (
    <button type="button" style={{ ...contentStyles.secondaryButton, ...style }} {...props}>
      {children}
    </button>
  );
}

export function CourseDashboardBackButton({ children = 'Back', style, ...props }) {
  return (
    <button
      type="button"
      style={{ ...contentStyles.secondaryButton, fontWeight: 600, ...style }}
      {...props}
    >
      {children}
    </button>
  );
}

export function CourseDashboardIconButton({ children, style, ...props }) {
  return (
    <button type="button" style={{ ...contentStyles.iconButton, ...style }} {...props}>
      {children}
    </button>
  );
}

export function CourseDashboardToolbar({ children }) {
  return <div style={contentStyles.toolbar}>{children}</div>;
}

export function CourseDashboardInput({ style, ...props }) {
  return <input style={{ ...contentStyles.input, ...style }} {...props} />;
}

export function CourseDashboardSelect({ children, style, ...props }) {
  return (
    <select style={{ ...contentStyles.select, ...style }} {...props}>
      {children}
    </select>
  );
}

export function PageContainer({ children, maxWidth = '960px' }) {
  return <div style={{ ...contentStyles.pageContainer, maxWidth }}>{children}</div>;
}

export function PageStack({ children }) {
  return <div style={contentStyles.pageStack}>{children}</div>;
}

export function SurfaceCard({ children, style }) {
  return <section style={{ ...contentStyles.surfaceCard, ...style }}>{children}</section>;
}

export function SurfaceLabel({ children, style }) {
  return <p style={{ ...contentStyles.surfaceLabel, ...style }}>{children}</p>;
}

export function MutedText({ children, style }) {
  return <p style={{ ...contentStyles.mutedText, ...style }}>{children}</p>;
}

export function CourseDashboardNotice({ children }) {
  return <div style={contentStyles.notice}>{children}</div>;
}

export function CourseDashboardStatGrid({ children }) {
  return <div style={contentStyles.statsRow}>{children}</div>;
}

export function CourseDashboardStatCard({ value, label, valueColor }) {
  return (
    <div style={contentStyles.statCard}>
      <p style={{ ...contentStyles.statValue, ...(valueColor ? { color: valueColor } : null) }}>{value}</p>
      <p style={contentStyles.statLabel}>{label}</p>
    </div>
  );
}

export function CourseDashboardSection({ title, children }) {
  return (
    <section style={contentStyles.section}>
      <h2 style={contentStyles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

export function CourseDashboardGrid({ children, style }) {
  return <div style={{ ...contentStyles.grid, ...style }}>{children}</div>;
}

export function CourseDashboardEmptyState({ title, children }) {
  return (
    <div style={contentStyles.emptyState}>
      <h2 style={contentStyles.emptyTitle}>{title}</h2>
      <p style={{ margin: 0 }}>{children}</p>
    </div>
  );
}

export function CourseDashboardErrorBanner({ children, onDismiss }) {
  return (
    <div style={contentStyles.errorBanner}>
      <span>{children}</span>
      {typeof onDismiss === 'function' ? (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: '0.95rem',
            padding: 0,
          }}
          aria-label="Dismiss message"
        >
          x
        </button>
      ) : null}
    </div>
  );
}

export function CourseDashboardLoadingState({ children = 'Loading...', style }) {
  return (
    <CourseDashboardSpinnerState
      style={{ ...contentStyles.loadingState, ...style }}
      spinnerStyle={{ width: '24px', height: '24px' }}
    />
  );
}

export function CourseDashboardSpinnerState({ style, spinnerStyle }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '24px 0',
        ...style,
      }}
    >
      <span
        aria-label="Loading"
        role="status"
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          border: `2px solid ${dashboardPalette.navyLight}`,
          borderTopColor: dashboardPalette.navy,
          animation: 'caliber-spin 0.8s linear infinite',
          display: 'inline-block',
          ...spinnerStyle,
        }}
      />
    </div>
  );
}

function AppNavLink({ href, active, children }) {
  return (
    <a
      href={href}
      className="sidebar-nav-link"
      data-active={active ? 'true' : 'false'}
      style={{
        ...contentStyles.appNavLink,
        ...(active ? contentStyles.appNavLinkActive : null),
        outline: 'none',
        boxShadow: 'none',
      }}
    >
      {children}
    </a>
  );
}

export function AppChrome({ children }) {
  return <div style={contentStyles.appFrame}>{children}</div>;
}

export function AppNavbar({
  apiBase,
  onLogoClick,
  user,
  isInstructorOrAdmin,
  page,
  profilePrefs,
  signOut,
}) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const coursesActive =
    page === 'courses' ||
    page.startsWith('course/');
  const studentViewActive =
    page === 'student-courses' ||
    page.startsWith('student-course/');
  const questionBankActive =
    page === 'questions' ||
    page === 'create-question' ||
    page === 'edit-question' ||
    page === 'upload-pdf' ||
    page === 'verify';
  const analyticsActive =
    page === 'instructor/analytics' ||
    page === 'analytics';
  const profileActive = page === 'profile';
  const homeHref = isInstructorOrAdmin ? '#courses' : '#student-courses';
  const navWidth = isCollapsed ? '64px' : '248px';

  return (
    <aside style={{ ...contentStyles.appNav, width: navWidth }}>
      <div style={contentStyles.appNavInner}>
        <div
          style={{
            ...contentStyles.appBrandRow,
            ...(isCollapsed
              ? {
                  justifyContent: 'center',
                  gap: 0,
                  padding: '0 0 20px',
                }
              : null),
          }}
        >
          {!isCollapsed ? (
            <a href={homeHref} onClick={onLogoClick} style={contentStyles.appBrand}>
              Caliber
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setIsCollapsed((value) => !value)}
            style={{
              ...contentStyles.appCollapseButton,
              ...(isCollapsed ? { margin: '0 auto' } : null),
            }}
            aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            <span style={{ display: 'inline-block', transform: isCollapsed ? 'translateX(-2px)' : 'none' }}>
              {isCollapsed ? '›' : '‹'}
            </span>
          </button>
        </div>

        {!isCollapsed ? (
          <div style={contentStyles.appNavLinks}>
            {user ? (
              <>
                {isInstructorOrAdmin ? <AppNavLink href="#courses" active={coursesActive}>Courses</AppNavLink> : null}
                {isInstructorOrAdmin ? <AppNavLink href="#questions" active={questionBankActive}>Question Bank</AppNavLink> : null}
                {isInstructorOrAdmin ? (
                  <AppNavLink href="#instructor/analytics" active={analyticsActive}>
                    Analytics
                  </AppNavLink>
                ) : null}
                <AppNavLink href="#student-courses" active={studentViewActive}>
                  {isInstructorOrAdmin ? 'Student View' : 'Courses'}
                </AppNavLink>
              </>
            ) : null}
          </div>
        ) : null}
        {user && !isCollapsed ? (
          <div style={contentStyles.appFooter}>
            <a
              href="#profile"
              className="sidebar-nav-link"
              data-active={profileActive ? 'true' : 'false'}
              style={{
                ...contentStyles.appProfileLink,
                ...(profileActive ? contentStyles.appNavLinkActive : null),
                outline: 'none',
                boxShadow: 'none',
                margin: '0 -20px',
              }}
              title="View your profile"
            >
              <span
                style={{
                  ...contentStyles.appAvatar,
                  background: profilePrefs.color,
                  borderRadius: profilePrefs.iconShape === 'square' ? 8 : 9999,
                  ...(profilePrefs.iconShape === 'hex'
                    ? { clipPath: 'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0% 50%)' }
                    : {}),
                }}
              >
                {(profilePrefs.initials || '').toUpperCase()}
              </span>
              <div style={contentStyles.appUserMeta}>
                <p style={contentStyles.appUserName}>Profile</p>
              </div>
            </a>
            <a
              href={`${apiBase}/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="sidebar-nav-link"
              data-active="false"
              style={contentStyles.appDocsLink}
              title="API Docs"
            >
              API Docs
            </a>
            <CourseDashboardSecondaryButton
              onClick={signOut}
              style={{
                justifyContent: 'center',
                borderColor: 'rgba(255, 255, 255, 0.22)',
                background: 'transparent',
                color: dashboardPalette.white,
              }}
            >
              Log out
            </CourseDashboardSecondaryButton>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export function AppMain({ children, style }) {
  return <main style={{ ...contentStyles.appMain, ...style }}>{children}</main>;
}
