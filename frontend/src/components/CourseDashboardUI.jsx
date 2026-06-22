import React from 'react';
import {
  BarChart3,
  Database,
  ExternalLink,
  GraduationCap,
  Home,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
} from 'lucide-react';

export const dashboardPalette = {
  ink: '#111517',
  inkSoft: '#28323b',
  navy: '#003660',
  navyMid: '#15385F',
  navyLight: '#E6EEF4',
  blue: '#047C91',
  teal: '#09847A',
  mint: '#DAE6E6',
  gold: '#FEBC11',
  goldDark: '#6B4B00',
  coral: '#EF5645',
  clay: '#DCD6CC',
  lightClay: '#F1EEEA',
  sandstone: '#EDEADF',
  mist: '#9CBEBE',
  surface: '#EEF0F2',
  surfaceWarm: '#F1EEEA',
  white: '#ffffff',
  border: '#DCE1E5',
  borderStrong: '#B8C4CC',
  text: '#3D4952',
  muted: '#66737D',
  subtle: '#F7F8F9',
  dangerBg: '#FFF1EF',
  dangerBorder: '#F3B5AD',
  dangerText: '#C43424',
};

const shadow = '0 1px 3px rgba(17, 21, 23, 0.08)';
const softShadow = '0 1px 2px rgba(17, 21, 23, 0.06)';

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
    alignItems: 'stretch',
  },
  sidebar: {
    width: '256px',
    position: 'sticky',
    top: 0,
    height: '100vh',
    background: dashboardPalette.navy,
    color: dashboardPalette.white,
    padding: '20px 0',
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid rgba(255,255,255,0.10)',
    overflowY: 'auto',
    flexShrink: 0,
  },
  brand: {
    padding: '0 18px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.10)',
  },
  brandTitle: {
    margin: 0,
    fontSize: '1.05rem',
    fontWeight: 800,
    letterSpacing: 0,
  },
  nav: {
    padding: '16px 10px',
    display: 'grid',
    gap: '6px',
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minHeight: '42px',
    padding: '0 12px',
    color: 'rgba(255, 255, 255, 0.72)',
    textDecoration: 'none',
    fontSize: '0.94rem',
    borderRadius: '8px',
    border: '1px solid transparent',
  },
  navLinkActive: {
    color: dashboardPalette.white,
    background: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(254, 188, 17, 0.38)',
    fontWeight: 750,
  },
  userBlock: {
    margin: 'auto 12px 0',
    padding: '12px',
    border: '1px solid rgba(255,255,255,0.16)',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.06)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  userAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    background: dashboardPalette.gold,
    color: dashboardPalette.ink,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.84rem',
    fontWeight: 800,
    flexShrink: 0,
  },
  userName: {
    margin: 0,
    fontSize: '0.94rem',
    fontWeight: 750,
  },
  userMeta: {
    margin: '2px 0 0',
    fontSize: '0.78rem',
    color: 'rgba(255, 255, 255, 0.64)',
    wordBreak: 'break-word',
  },
  main: {
    flex: '1 1 auto',
    minWidth: 0,
    padding: '32px',
  },
};

const contentStyles = {
  pageContainer: {
    width: '100%',
    maxWidth: '1080px',
    margin: '0 auto',
  },
  pageStack: {
    display: 'grid',
    gap: '20px',
  },
  surfaceCard: {
    background: dashboardPalette.white,
    border: `1px solid ${dashboardPalette.border}`,
    borderRadius: '8px',
    padding: '20px',
    boxShadow: softShadow,
  },
  surfaceLabel: {
    margin: '0 0 6px',
    fontSize: '0.78rem',
    fontWeight: 800,
    letterSpacing: 0,
    textTransform: 'none',
    color: dashboardPalette.muted,
  },
  mutedText: {
    margin: 0,
    color: dashboardPalette.muted,
    fontSize: '0.94rem',
    lineHeight: 1.55,
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  eyebrow: {
    margin: '0 0 6px',
    color: dashboardPalette.muted,
    fontSize: '0.82rem',
    fontWeight: 700,
    textTransform: 'none',
    letterSpacing: 0,
  },
  pageTitle: {
    margin: 0,
    fontSize: '1.75rem',
    fontWeight: 800,
    lineHeight: 1.18,
    color: dashboardPalette.navy,
    letterSpacing: 0,
  },
  pageSubtitle: {
    margin: '10px 0 0',
    fontSize: '1rem',
    color: dashboardPalette.muted,
    lineHeight: 1.55,
    maxWidth: '680px',
  },
  primaryButton: {
    minHeight: '42px',
    padding: '0 16px',
    border: `1px solid ${dashboardPalette.navy}`,
    borderRadius: '8px',
    background: dashboardPalette.navy,
    color: dashboardPalette.white,
    fontSize: '0.92rem',
    fontWeight: 750,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    boxShadow: 'none',
  },
  secondaryButton: {
    minHeight: '42px',
    padding: '0 16px',
    border: `1px solid ${dashboardPalette.border}`,
    borderRadius: '8px',
    background: dashboardPalette.white,
    color: dashboardPalette.text,
    fontSize: '0.92rem',
    fontWeight: 750,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  iconButton: {
    width: '42px',
    height: '42px',
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
    marginBottom: '20px',
    flexWrap: 'wrap',
    padding: '12px',
    background: dashboardPalette.white,
    border: `1px solid ${dashboardPalette.border}`,
    borderRadius: '8px',
    boxShadow: softShadow,
  },
  input: {
    flex: '1 1 280px',
    minWidth: '220px',
    height: '42px',
    padding: '0 14px',
    borderRadius: '8px',
    border: `1px solid ${dashboardPalette.border}`,
    background: dashboardPalette.white,
    color: dashboardPalette.text,
    fontSize: '0.95rem',
    outline: 'none',
  },
  select: {
    height: '42px',
    minWidth: '168px',
    padding: '0 34px 0 12px',
    borderRadius: '8px',
    border: `1px solid ${dashboardPalette.border}`,
    background: dashboardPalette.white,
    color: dashboardPalette.text,
    fontSize: '0.95rem',
    outline: 'none',
  },
  notice: {
    background: dashboardPalette.surfaceWarm,
    border: `1px solid ${dashboardPalette.clay}`,
    borderRadius: '8px',
    padding: '14px 16px',
    marginBottom: '24px',
    fontSize: '0.94rem',
    color: dashboardPalette.text,
    boxShadow: 'none',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
    gap: '14px',
    marginBottom: '24px',
  },
  statCard: {
    background: dashboardPalette.white,
    border: `1px solid ${dashboardPalette.border}`,
    borderRadius: '8px',
    padding: '16px',
    boxShadow: softShadow,
    position: 'relative',
    overflow: 'hidden',
  },
  statAccent: {
    position: 'absolute',
    inset: '0 auto 0 0',
    width: '4px',
    background: dashboardPalette.gold,
  },
  statValue: {
    margin: 0,
    fontSize: '1.6rem',
    fontWeight: 800,
    lineHeight: 1,
    color: dashboardPalette.ink,
  },
  statLabel: {
    margin: '8px 0 0',
    fontSize: '0.84rem',
    color: dashboardPalette.muted,
    fontWeight: 750,
  },
  section: {
    marginBottom: '28px',
  },
  sectionTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '0 0 14px',
  },
  sectionMarker: {
    width: '4px',
    height: '18px',
    borderRadius: '4px',
    background: dashboardPalette.gold,
    boxShadow: 'none',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 850,
    color: dashboardPalette.ink,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '16px',
  },
  emptyState: {
    background: dashboardPalette.white,
    border: `1px dashed ${dashboardPalette.borderStrong}`,
    borderRadius: '8px',
    padding: '34px',
    color: dashboardPalette.muted,
    boxShadow: 'none',
  },
  emptyTitle: {
    margin: '0 0 8px',
    fontSize: '1.12rem',
    fontWeight: 850,
    color: dashboardPalette.ink,
  },
  errorBanner: {
    marginBottom: '24px',
    background: dashboardPalette.dangerBg,
    border: `1px solid ${dashboardPalette.dangerBorder}`,
    borderRadius: '8px',
    color: dashboardPalette.dangerText,
    padding: '12px 14px',
    fontSize: '0.92rem',
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    boxShadow: '0 8px 20px rgba(173,31,45,0.08)',
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
    borderRight: '1px solid rgba(255,255,255,0.10)',
    width: '256px',
    height: '100vh',
    padding: '18px 0',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflowY: 'auto',
    boxShadow: 'none',
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
    fontSize: '1.18rem',
    fontWeight: 900,
    letterSpacing: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '10px',
  },
  brandMark: {
    width: '34px',
    height: '34px',
    borderRadius: '8px',
    background: dashboardPalette.gold,
    color: dashboardPalette.navy,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.98rem',
    fontWeight: 900,
    boxShadow: 'none',
  },
  appBrandRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '0 16px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.10)',
  },
  appCollapseButton: {
    width: '34px',
    height: '34px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.16)',
    background: 'rgba(255,255,255,0.08)',
    color: dashboardPalette.white,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  appDocsLink: {
    color: 'rgba(255, 255, 255, 0.76)',
    textDecoration: 'none',
    fontSize: '0.88rem',
    minHeight: '40px',
    padding: '0 12px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  appNavLinks: {
    marginTop: '16px',
    display: 'grid',
    gap: '6px',
    padding: '0 10px 16px',
  },
  appNavLink: {
    color: 'rgba(255, 255, 255, 0.74)',
    textDecoration: 'none',
    fontSize: '0.94rem',
    minHeight: '42px',
    padding: '0 12px',
    borderRadius: '8px',
    border: '1px solid transparent',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  appNavLinkActive: {
    color: dashboardPalette.white,
    background: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(254, 188, 17, 0.38)',
    fontWeight: 800,
  },
  appProfileLink: {
    color: 'rgba(255, 255, 255, 0.82)',
    textDecoration: 'none',
    fontSize: '0.9rem',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    border: '1px solid transparent',
    borderRadius: '8px',
    padding: '10px 12px',
  },
  appProfileText: {
    fontWeight: 700,
  },
  appAvatar: {
    width: 32,
    height: 32,
    color: dashboardPalette.white,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 850,
    fontSize: '0.78rem',
    flexShrink: 0,
  },
  appMain: {
    flex: 1,
    minWidth: 0,
    padding: '32px',
  },
  appFooter: {
    margin: 'auto 10px 0',
    padding: '12px',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.06)',
    display: 'grid',
    gap: '8px',
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
    fontSize: '0.92rem',
    fontWeight: 800,
  },
};

export function RefreshIcon(props) {
  return <RefreshCw size={16} aria-hidden="true" {...props} />;
}

export function getUserDisplayName(user) {
  const fullName = user?.user_metadata?.full_name;
  if (typeof fullName === 'string' && fullName.trim()) return fullName.trim();

  const firstName = user?.user_metadata?.first_name || user?.first_name;
  const lastName = user?.user_metadata?.last_name || user?.last_name;
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
                className="caliber-nav-link"
                style={{
                  ...shellStyles.navLink,
                  ...(link.active ? shellStyles.navLinkActive : null),
                }}
              >
                <Home size={16} aria-hidden="true" />
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

export function CourseDashboardHeader({ title, subtitle, action, eyebrow = 'Workspace' }) {
  return (
    <div style={contentStyles.headerRow}>
      <div>
        {eyebrow ? <p style={contentStyles.eyebrow}>{eyebrow}</p> : null}
        <h1 style={contentStyles.pageTitle}>{title}</h1>
        {subtitle ? <p style={contentStyles.pageSubtitle}>{subtitle}</p> : null}
      </div>
      {action || null}
    </div>
  );
}

export function CourseDashboardPrimaryButton({ children, style, disabled, ...props }) {
  return (
    <button
      type="button"
      className="caliber-button"
      disabled={disabled}
      style={{ ...contentStyles.primaryButton, ...(disabled ? { opacity: 0.55, cursor: 'not-allowed' } : null), ...style }}
      {...props}
    >
      {children}
    </button>
  );
}

export function CourseDashboardSecondaryButton({ children, style, disabled, ...props }) {
  return (
    <button
      type="button"
      className="caliber-button"
      disabled={disabled}
      style={{ ...contentStyles.secondaryButton, ...(disabled ? { opacity: 0.55, cursor: 'not-allowed' } : null), ...style }}
      {...props}
    >
      {children}
    </button>
  );
}

export function CourseDashboardBackButton({ children = 'Back', style, ...props }) {
  return (
    <button
      type="button"
      className="caliber-button"
      style={{ ...contentStyles.secondaryButton, fontWeight: 800, ...style }}
      {...props}
    >
      {children}
    </button>
  );
}

export function CourseDashboardIconButton({ children, style, disabled, ...props }) {
  return (
    <button
      type="button"
      className="caliber-icon-button"
      disabled={disabled}
      style={{ ...contentStyles.iconButton, ...(disabled ? { opacity: 0.55, cursor: 'not-allowed' } : null), ...style }}
      {...props}
    >
      {children}
    </button>
  );
}

export function CourseDashboardToolbar({ children }) {
  return <div className="caliber-toolbar" style={contentStyles.toolbar}>{children}</div>;
}

export function CourseDashboardInput({ style, ...props }) {
  return <input className="caliber-input" style={{ ...contentStyles.input, ...style }} {...props} />;
}

export function CourseDashboardSelect({ children, style, ...props }) {
  return (
    <select className="caliber-input" style={{ ...contentStyles.select, ...style }} {...props}>
      {children}
    </select>
  );
}

export function PageContainer({ children, maxWidth = '1080px' }) {
  return <div className="caliber-page-container" style={{ ...contentStyles.pageContainer, maxWidth }}>{children}</div>;
}

export function PageStack({ children }) {
  return <div style={contentStyles.pageStack}>{children}</div>;
}

export function SurfaceCard({ children, style }) {
  return <section className="caliber-surface-card" style={{ ...contentStyles.surfaceCard, ...style }}>{children}</section>;
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
    <div className="caliber-stat-card" style={contentStyles.statCard}>
      <span style={contentStyles.statAccent} aria-hidden="true" />
      <p style={{ ...contentStyles.statValue, ...(valueColor ? { color: valueColor } : null) }}>{value}</p>
      <p style={contentStyles.statLabel}>{label}</p>
    </div>
  );
}

export function CourseDashboardSection({ title, children }) {
  return (
    <section style={contentStyles.section}>
      <div style={contentStyles.sectionTitleRow}>
        <span style={contentStyles.sectionMarker} aria-hidden="true" />
        <h2 style={contentStyles.sectionTitle}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function CourseDashboardGrid({ children, style }) {
  return <div className="caliber-dashboard-grid" style={{ ...contentStyles.grid, ...style }}>{children}</div>;
}

export function CourseDashboardEmptyState({ title, children }) {
  return (
    <div style={contentStyles.emptyState}>
      <h2 style={contentStyles.emptyTitle}>{title}</h2>
      <p style={{ margin: 0, lineHeight: 1.55 }}>{children}</p>
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
            fontSize: '1rem',
            padding: 0,
            fontWeight: 800,
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
      label={children}
      style={{ ...contentStyles.loadingState, ...style }}
      spinnerStyle={{ width: '24px', height: '24px' }}
    />
  );
}

export function CourseDashboardSpinnerState({ style, spinnerStyle, label = 'Loading' }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '12px',
        padding: '24px 0',
        color: dashboardPalette.muted,
        ...style,
      }}
    >
      <span
        aria-label={label}
        role="status"
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          border: `3px solid ${dashboardPalette.mint}`,
          borderTopColor: dashboardPalette.teal,
          animation: 'caliber-spin 0.8s linear infinite',
          display: 'inline-block',
          ...spinnerStyle,
        }}
      />
      {label && label !== 'Loading' ? <span style={{ fontSize: '0.92rem', fontWeight: 700 }}>{label}</span> : null}
    </div>
  );
}

function AppNavLink({ href, active, children, icon: Icon }) {
  return (
    <a
      href={href}
      className="sidebar-nav-link caliber-nav-link"
      data-active={active ? 'true' : 'false'}
      style={{
        ...contentStyles.appNavLink,
        ...(active ? contentStyles.appNavLinkActive : null),
        outline: 'none',
        boxShadow: 'none',
      }}
    >
      {Icon ? <Icon size={17} aria-hidden="true" /> : null}
      <span>{children}</span>
    </a>
  );
}

export function AppChrome({ children }) {
  return <div className="caliber-app-frame" style={contentStyles.appFrame}>{children}</div>;
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
    page === 'analytics' ||
    page === 'instructor/analytics';
  const profileActive = page === 'profile';
  const homeHref = isInstructorOrAdmin ? '#courses' : '#student-courses';
  const navWidth = isCollapsed ? '72px' : '256px';
  const platformUrl = (import.meta.env.VITE_PORTAL_BASE_URL || window.location.origin || '').replace(/\/$/, '') || '/';

  return (
    <aside className="caliber-app-nav" style={{ ...contentStyles.appNav, width: navWidth }}>
      <div style={contentStyles.appNavInner}>
        <div
          style={{
            ...contentStyles.appBrandRow,
            ...(isCollapsed
              ? {
                  justifyContent: 'center',
                  gap: 0,
                  padding: '0 0 18px',
                }
              : null),
          }}
        >
          {!isCollapsed ? (
            <a href={homeHref} onClick={onLogoClick} style={contentStyles.appBrand}>
              <span style={contentStyles.brandMark}>
                C
              </span>
              Caliber
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setIsCollapsed((value) => !value)}
            className="caliber-icon-button"
            style={{
              ...contentStyles.appCollapseButton,
              ...(isCollapsed ? { margin: '0 auto' } : null),
            }}
            aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {!isCollapsed ? (
          <div style={contentStyles.appNavLinks}>
            {user ? (
              <>
                <AppNavLink href={platformUrl || '/'} active={false} icon={Home}>Platform</AppNavLink>
                {isInstructorOrAdmin ? <AppNavLink href="#courses" active={coursesActive} icon={Home}>Courses</AppNavLink> : null}
                {isInstructorOrAdmin ? <AppNavLink href="#questions" active={questionBankActive} icon={Database}>Question Bank</AppNavLink> : null}
                {isInstructorOrAdmin ? (
                  <AppNavLink href="#analytics" active={analyticsActive} icon={BarChart3}>
                    Analytics
                  </AppNavLink>
                ) : null}
                <AppNavLink href="#student-courses" active={studentViewActive} icon={GraduationCap}>
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
              className="sidebar-nav-link caliber-nav-link"
              data-active={profileActive ? 'true' : 'false'}
              style={{
                ...contentStyles.appProfileLink,
                ...(profileActive ? contentStyles.appNavLinkActive : null),
                outline: 'none',
                boxShadow: 'none',
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
              className="sidebar-nav-link caliber-nav-link"
              data-active="false"
              style={contentStyles.appDocsLink}
              title="API Docs"
            >
              <ExternalLink size={16} aria-hidden="true" />
              API Docs
            </a>
            <CourseDashboardSecondaryButton
              onClick={signOut}
              style={{
                justifyContent: 'center',
                borderColor: 'rgba(255, 255, 255, 0.18)',
                background: 'rgba(255,255,255,0.08)',
                color: dashboardPalette.white,
              }}
            >
              <LogOut size={16} aria-hidden="true" />
              Log out
            </CourseDashboardSecondaryButton>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export function AppMain({ children, style }) {
  return <main className="caliber-app-main" style={{ ...contentStyles.appMain, ...style }}>{children}</main>;
}
