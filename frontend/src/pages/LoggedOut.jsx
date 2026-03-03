import React from 'react';

export default function LoggedOut() {
  return (
    <div
      style={{
        maxWidth: '560px',
        margin: '3rem auto',
        padding: '2rem',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        background: '#fff',
        boxShadow: '0 12px 24px rgba(0,0,0,0.08)',
        textAlign: 'center',
      }}
    >
      <h2 style={{ marginTop: 0, color: '#111827' }}>You have successfully logged out of Caliber</h2>
      <p style={{ color: '#4b5563', marginBottom: '1.5rem' }}>
        Your session has ended. You can return to the UCSB Caliber homepage.
      </p>
      <a
        href="https://app.caliber.cs.ucsb.edu/"
        style={{
          display: 'inline-block',
          padding: '0.8rem 1.2rem',
          background: '#005cab',
          color: '#fff',
          textDecoration: 'none',
          borderRadius: '8px',
          fontWeight: 700,
        }}
      >
        Return to Homepage
      </a>
    </div>
  );
}
