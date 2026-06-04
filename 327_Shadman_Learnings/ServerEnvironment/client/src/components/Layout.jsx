import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  CloudLightning,
  LayoutDashboard,
  FolderOpen,
  Link2,
  LogOut,
  Menu,
  User,
  Brain,
} from 'lucide-react';

/**
 * Premium dashboard shell layout.
 * Provides sticky sidebar navigation, top header, user profile summary, and logout button.
 */
export function Layout({ children, title }) {
  const { user, logoutUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'File Browser', path: '/files', icon: FolderOpen },
    { name: 'Connected Accounts', path: '/accounts', icon: Link2 },
    { name: 'RAG Chat', path: '/rag', icon: Brain },
  ];

  const handleLogout = () => {
    logoutUser();
    navigate('/login');
  };

  return (
    <div className="layout-container">
      {/* Sidebar background overlay for mobile */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 40,
            transition: 'opacity 0.25s ease',
          }}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <CloudLightning color="#3b82f6" size={28} style={{ filter: 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.5))' }} />
          <span style={{ fontSize: '1.3rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.03em' }}>
            Drive<span className="gradient-text">Hive</span>
          </span>
        </div>

        <nav className="sidebar-nav">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
                onClick={() => setIsOpen(false)}
              >
                <Icon size={20} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', padding: '0 8px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              fontSize: '0.9rem',
              color: 'white',
              boxShadow: '0 4px 10px rgba(99, 102, 241, 0.3)',
            }}>
              {user?.username ? user.username[0].toUpperCase() : 'U'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#f8fafc',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {user?.username || 'User'}
              </span>
              <span style={{
                fontSize: '0.75rem',
                color: '#94a3b8',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {user?.email || 'user@example.com'}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="btn btn-secondary"
            style={{ width: '100%', padding: '10px 16px', fontSize: '0.85rem' }}
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-content">
        <header className="dashboard-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={() => setIsOpen(!isOpen)}
              style={{
                background: 'none',
                border: 'none',
                color: '#f8fafc',
                cursor: 'pointer',
                padding: '4px',
              }}
              className="mobile-menu-toggle"
            >
              <Menu size={24} />
            </button>
            <h2 style={{ fontSize: '1.4rem', margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>
              {title}
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={16} color="#94a3b8" />
            <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 500 }}>
              Connected to <strong style={{ color: '#f8fafc' }}>Local Node</strong>
            </span>
          </div>
        </header>

        <main style={{ flex: 1, padding: '32px 24px' }}>
          {children}
        </main>
      </div>

      <style>{`
        @media (min-width: 769px) {
          .mobile-menu-toggle {
            display: none !important;
          }
        }
        @media (max-width: 768px) {
          .mobile-menu-toggle {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}

export default Layout;
