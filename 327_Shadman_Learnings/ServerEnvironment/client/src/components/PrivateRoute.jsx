import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Route guard component that redirects unauthenticated users to the login page.
 */
export function PrivateRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#0b0f19'
      }}>
        <div className="gradient-text animate-fade-in" style={{
          fontSize: '1.5rem',
          fontWeight: 600,
          fontFamily: 'Outfit, sans-serif'
        }}>
          Loading DriveHive...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default PrivateRoute;
