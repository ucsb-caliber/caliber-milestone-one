import React from 'react';
import { useAuth } from '../AuthContext';

export default function Auth() {
  const { signIn } = useAuth();
  const kickedOffRef = React.useRef(false);

  React.useEffect(() => {
    if (kickedOffRef.current) return;
    kickedOffRef.current = true;
    signIn();
  }, [signIn]);

  return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#4b5563' }}>
      Redirecting to sign in...
    </div>
  );
}
