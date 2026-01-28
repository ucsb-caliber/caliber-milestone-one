import React from 'react';
import { useAuth } from '../AuthContext.jsx';
import { loadProfilePrefs, saveProfilePrefs, getUserInitials } from '../profilePrefs.js';
import { getUserInfo } from '../api.js';

function getAccountStatus(user) {
  const supabaseRole = user?.role || 'unknown';
  const provider = user?.app_metadata?.provider || user?.app_metadata?.providers?.[0] || 'unknown';

  // These are project-specific; we just surface what we can detect.
  const isAdmin = Boolean(
    user?.app_metadata?.is_admin ??
      user?.app_metadata?.admin ??
      user?.user_metadata?.is_admin ??
      user?.user_metadata?.admin
  );

  const isInstructor = Boolean(
    user?.app_metadata?.is_instructor ??
      user?.app_metadata?.instructor ??
      user?.user_metadata?.is_instructor ??
      user?.user_metadata?.instructor
  );

  return { supabaseRole, provider, isAdmin, isInstructor };
}

function ProfileBadge({ prefs, size = 56 }) {
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

export default function Profile() {
  const { user } = useAuth();
  const [userInfo, setUserInfo] = React.useState(null);
  const [loadingUserInfo, setLoadingUserInfo] = React.useState(true);
  const [prefs, setPrefs] = React.useState(() => loadProfilePrefs(user));

  // Fetch user info from backend
  React.useEffect(() => {
    async function fetchUserInfo() {
      if (!user) {
        setLoadingUserInfo(false);
        return;
      }
      
      try {
        const info = await getUserInfo();
        setUserInfo(info);
        // Update prefs with userInfo-based initials
        setPrefs(loadProfilePrefs(user, info));
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

  const updatePrefs = (next) => {
    // If initials are cleared, reset to default
    if (!next.initials || !next.initials.trim()) {
      next = { ...next, initials: getUserInitials(user, userInfo) };
    }
    setPrefs(next);
    saveProfilePrefs(user, next);
  };

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
      <h2 style={{ marginTop: 0, color: '#111827' }}>Your Profile</h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '120px 1fr',
          gap: '1.5rem',
          padding: '1.25rem',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          background: 'white',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          <ProfileBadge prefs={prefs} />
        </div>

        <div>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              Email
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#111827' }}>
              {user.email}
            </div>
          </div>

          {/* Display backend user profile info */}
          {loadingUserInfo ? (
            <div style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Loading profile information...
            </div>
          ) : userInfo && (userInfo.first_name || userInfo.last_name) ? (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                Name
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#111827' }}>
                {[userInfo.first_name, userInfo.last_name].filter(Boolean).join(' ')}
              </div>
              {userInfo.teacher && (
                <div style={{ 
                  display: 'inline-block',
                  marginTop: '0.25rem',
                  padding: '0.25rem 0.5rem',
                  background: '#dbeafe',
                  color: '#1e40af',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600
                }}>
                  Teacher
                </div>
              )}
            </div>
          ) : null}

          <div>
            <div style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              Initials
            </div>
            <input
              value={prefs.initials}
              onChange={(e) => updatePrefs({ ...prefs, initials: e.target.value.slice(0, 2) })}
              placeholder={userInfo && userInfo.first_name && userInfo.last_name 
                ? `${userInfo.first_name[0]}${userInfo.last_name[0]}`.toUpperCase() 
                : ''}
              maxLength={2}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                textTransform: 'uppercase',
              }}
            />
          </div>

          <div style={{ marginTop: '1.25rem' }}>
            <div style={{ fontWeight: 800, marginBottom: '0.5rem', color: '#111827' }}>Role / Status</div>
            <div style={{ color: '#374151' }}>
              {userInfo ? (
                <>
                  <div>
                    <strong>Admin:</strong> {userInfo.admin ? 'Yes' : 'No'}
                  </div>
                  <div>
                    <strong>Teacher:</strong> {userInfo.teacher ? 'Yes' : 'No'}
                  </div>
                  <div style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '0.35rem' }}>
                    These flags are stored in the database and set during onboarding.
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <strong>Supabase role:</strong> {status.supabaseRole}
                  </div>
                  <div>
                    <strong>Auth provider:</strong> {status.provider}
                  </div>
                  <div>
                    <strong>Admin:</strong> {status.isAdmin ? 'Yes' : 'No / Unknown'}
                  </div>
                  <div>
                    <strong>Instructor:</strong> {status.isInstructor ? 'Yes' : 'No / Unknown'}
                  </div>
                  <div style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '0.35rem' }}>
                    Admin/instructor flags depend on what your Supabase project stores in metadata.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: '1.5rem',
          padding: '1.25rem',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          background: 'white',
        }}
      >
        <h3 style={{ marginTop: 0, color: '#111827' }}>Profile icon</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <div style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
              Shape
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {['circle', 'square', 'hex'].map((shape) => (
                <button
                  key={shape}
                  onClick={() => updatePrefs({ ...prefs, iconShape: shape })}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    border: prefs.iconShape === shape ? '2px solid #111827' : '1px solid #d1d5db',
                    background: prefs.iconShape === shape ? '#f3f4f6' : 'white',
                    cursor: 'pointer',
                    fontWeight: 700,
                    textTransform: 'capitalize',
                    color: '#111827',
                  }}
                >
                  {shape}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
              Color
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="color"
                value={prefs.color}
                onChange={(e) => updatePrefs({ ...prefs, color: e.target.value })}
                style={{ width: '44px', height: '36px', padding: 0, border: 'none', background: 'none' }}
                aria-label="Profile color"
              />
              {['#4f46e5', '#16a34a', '#dc2626', '#0ea5e9', '#f59e0b', '#111827'].map((c) => (
                <button
                  key={c}
                  onClick={() => updatePrefs({ ...prefs, color: c })}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: 9999,
                    border: prefs.color === c ? '2px solid #111827' : '1px solid #d1d5db',
                    background: c,
                    cursor: 'pointer',
                  }}
                  aria-label={`Set color ${c}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

