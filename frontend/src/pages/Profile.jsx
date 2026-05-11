import React from 'react';
import { useAuth } from '../AuthContext.jsx';
import { getUserInfo, updateUserPreferences, updateUserProfile } from '../api.js';
import {
  CourseDashboardHeader,
  CourseDashboardInput,
  CourseDashboardLoadingState,
  CourseDashboardSecondaryButton,
  MutedText,
  PageContainer,
  PageStack,
  SurfaceCard,
  SurfaceLabel,
  dashboardPalette,
} from '../components/CourseDashboardUI.jsx';

function getAccountStatus(user) {
  return {
    provider: user?.auth_provider || 'unknown',
  };
}

function ProfileBadge({ prefs, size = 64 }) {
  const baseStyle = {
    width: size,
    height: size,
    background: prefs.color,
    color: 'white',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    letterSpacing: '0.5px',
    userSelect: 'none',
  };

  const shapeStyle =
    prefs.iconShape === 'square'
      ? { borderRadius: 10 }
      : prefs.iconShape === 'hex'
        ? { clipPath: 'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0% 50%)' }
        : { borderRadius: 9999 };

  return <div style={{ ...baseStyle, ...shapeStyle }}>{(prefs.initials || '').toUpperCase()}</div>;
}

const profileGridStyle = {
  display: 'grid',
  gridTemplateColumns: '120px minmax(0, 1fr)',
  gap: '24px',
  alignItems: 'flex-start',
};

const fieldsGridStyle = {
  display: 'grid',
  gap: '16px',
};

export default function Profile() {
  const { user } = useAuth();
  const [userInfo, setUserInfo] = React.useState(null);
  const [loadingUserInfo, setLoadingUserInfo] = React.useState(true);
  const [prefs, setPrefs] = React.useState({
    iconShape: 'circle',
    color: '#4f46e5',
    initials: ''
  });
  const [schoolName, setSchoolName] = React.useState('');
  const [savingSchool, setSavingSchool] = React.useState(false);
  const [schoolMessage, setSchoolMessage] = React.useState('');

  React.useEffect(() => {
    async function fetchUserInfo() {
      if (!user) {
        setLoadingUserInfo(false);
        return;
      }

      try {
        const info = await getUserInfo();
        setUserInfo(info);
        setSchoolName(info.school_name || '');
        setPrefs({
          iconShape: info.icon_shape || 'circle',
          color: info.icon_color || '#4f46e5',
          initials: info.initials || getDefaultInitials(info)
        });
      } catch (error) {
        console.error('Error fetching user info:', error);
      } finally {
        setLoadingUserInfo(false);
      }
    }

    fetchUserInfo();
  }, [user]);

  if (!user) return null;

  const status = getAccountStatus(user);
  const loggedInEmail = user?.email || userInfo?.email || 'Unknown email';

  const getDefaultInitials = (info) => {
    if (info?.first_name && info?.last_name) {
      return `${info.first_name[0]}${info.last_name[0]}`.toUpperCase();
    }
    const email = user?.email || '';
    const display = (email.split('@')[0] || '').trim();
    if (!display) return 'U';
    return display.slice(0, 2).toUpperCase();
  };

  const updatePrefs = async (next) => {
    let resolvedNext = next;
    if (!resolvedNext.initials || !resolvedNext.initials.trim()) {
      resolvedNext = { ...resolvedNext, initials: getDefaultInitials(userInfo) };
    }

    setPrefs(resolvedNext);

    try {
      await updateUserPreferences({
        icon_shape: resolvedNext.iconShape,
        icon_color: resolvedNext.color,
        initials: resolvedNext.initials
      });

      window.dispatchEvent(new CustomEvent('profilePreferencesUpdated', {
        detail: resolvedNext
      }));
    } catch (error) {
      console.error('Error updating preferences:', error);
    }
  };

  const saveSchoolName = async () => {
    const nextSchool = schoolName.trim();
    if (!nextSchool) {
      setSchoolMessage('School cannot be empty.');
      return;
    }
    setSavingSchool(true);
    setSchoolMessage('');
    try {
      const updatedUser = await updateUserProfile({ school_name: nextSchool });
      setUserInfo(updatedUser);
      setSchoolName(updatedUser.school_name || nextSchool);
      setSchoolMessage('School updated.');
    } catch (error) {
      setSchoolMessage(error?.message || 'Failed to update school.');
    } finally {
      setSavingSchool(false);
    }
  };

  return (
    <PageContainer maxWidth="960px">
      <PageStack>
        <CourseDashboardHeader
          title="Profile"
          subtitle="Manage your account details and icon preferences."
        />

        <SurfaceCard>
          <div style={profileGridStyle}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <ProfileBadge prefs={prefs} />
            </div>

            <div style={fieldsGridStyle}>
              <div>
                <SurfaceLabel>Signed in as</SurfaceLabel>
                <div style={{ fontSize: '1.05rem', fontWeight: 600, color: dashboardPalette.navy }}>{loggedInEmail}</div>
              </div>

              {loadingUserInfo ? (
                <CourseDashboardLoadingState>Loading profile information...</CourseDashboardLoadingState>
              ) : userInfo && (userInfo.first_name || userInfo.last_name) ? (
                <div>
                  <SurfaceLabel>Name</SurfaceLabel>
                  <div style={{ fontSize: '1.05rem', fontWeight: 600, color: dashboardPalette.navy }}>
                    {[userInfo.first_name, userInfo.last_name].filter(Boolean).join(' ')}
                  </div>
                  {userInfo.teacher ? (
                    <div
                      style={{
                        display: 'inline-block',
                        marginTop: '8px',
                        padding: '4px 8px',
                        background: dashboardPalette.navyLight,
                        color: dashboardPalette.navy,
                        borderRadius: '6px',
                        border: `1px solid ${dashboardPalette.border}`,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      Teacher
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div>
                <SurfaceLabel>Home school</SurfaceLabel>
                <CourseDashboardInput
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  list="school-options"
                  placeholder="Enter your school"
                  style={{ width: '100%' }}
                />
                <datalist id="school-options">
                  <option value="UCSB" />
                  <option value="UCLA" />
                  <option value="UCB" />
                  <option value="UCI" />
                  <option value="UCSD" />
                  <option value="Cal Poly SLO" />
                </datalist>
                <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <CourseDashboardSecondaryButton onClick={saveSchoolName} disabled={savingSchool}>
                    {savingSchool ? 'Saving...' : 'Save school'}
                  </CourseDashboardSecondaryButton>
                  {schoolMessage ? (
                    <span style={{ fontSize: '0.85rem', color: schoolMessage.includes('updated') ? '#166534' : dashboardPalette.dangerText }}>
                      {schoolMessage}
                    </span>
                  ) : null}
                </div>
              </div>

              <div>
                <SurfaceLabel>Initials</SurfaceLabel>
                <CourseDashboardInput
                  value={prefs.initials}
                  onChange={(e) => updatePrefs({ ...prefs, initials: e.target.value.slice(0, 2) })}
                  placeholder={userInfo && userInfo.first_name && userInfo.last_name
                    ? `${userInfo.first_name[0]}${userInfo.last_name[0]}`.toUpperCase()
                    : ''}
                  maxLength={2}
                  style={{ width: '100%', textTransform: 'uppercase' }}
                />
              </div>

              <div>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: dashboardPalette.navy, marginBottom: '8px' }}>Role / status</div>
                {userInfo ? (
                  <>
                    <MutedText><strong>Admin:</strong> {userInfo.admin ? 'Yes' : 'No'}</MutedText>
                    <MutedText><strong>Teacher:</strong> {userInfo.teacher ? 'Yes' : 'No'}</MutedText>
                    <MutedText style={{ marginTop: '6px' }}>
                      These flags are stored in the database and set during onboarding.
                    </MutedText>
                  </>
                ) : (
                  <>
                    <MutedText><strong>Auth provider:</strong> {status.provider}</MutedText>
                    <MutedText style={{ marginTop: '6px' }}>
                      Role flags are loaded from the backend profile after authentication.
                    </MutedText>
                  </>
                )}
              </div>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: dashboardPalette.navy, marginBottom: '6px' }}>Profile icon</div>
            <MutedText>Choose the shape and color used throughout the app.</MutedText>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div>
              <SurfaceLabel>Shape</SurfaceLabel>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['circle', 'square', 'hex'].map((shape) => (
                  <CourseDashboardSecondaryButton
                    key={shape}
                    onClick={() => updatePrefs({ ...prefs, iconShape: shape })}
                    style={{
                      borderColor: prefs.iconShape === shape ? dashboardPalette.navy : dashboardPalette.border,
                      color: dashboardPalette.text,
                      background: prefs.iconShape === shape ? dashboardPalette.navyLight : dashboardPalette.white,
                      textTransform: 'capitalize',
                    }}
                  >
                    {shape}
                  </CourseDashboardSecondaryButton>
                ))}
              </div>
            </div>

            <div>
              <SurfaceLabel>Color</SurfaceLabel>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="color"
                  value={prefs.color}
                  onChange={(e) => updatePrefs({ ...prefs, color: e.target.value })}
                  style={{ width: '44px', height: '36px', padding: 0, border: 'none', background: 'none' }}
                  aria-label="Profile color"
                />
                {['#4f46e5', '#16a34a', '#dc2626', '#0ea5e9', '#f59e0b', '#111827'].map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => updatePrefs({ ...prefs, color })}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: 9999,
                      border: prefs.color === color ? `2px solid ${dashboardPalette.navy}` : `1px solid ${dashboardPalette.border}`,
                      background: color,
                      cursor: 'pointer',
                    }}
                    aria-label={`Set color ${color}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </SurfaceCard>
      </PageStack>
    </PageContainer>
  );
}
