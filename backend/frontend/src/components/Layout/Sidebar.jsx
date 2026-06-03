import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Sidebar.css';

const NAV = [
  { to: '/', icon: '🏠', label: 'Home' },
  { to: '/library', icon: '🎵', label: 'Library' },
  { to: '/sync', icon: '🔄', label: 'Sync Sessions' },
];

const ADMIN_NAV = [
  { to: '/admin', icon: '⚙️', label: 'Admin' },
];

const Sidebar = () => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <span className="logo-icon">🎧</span>
        <span className="logo-text">SyncBeat</span>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        <p className="nav-section-label">Menu</p>
        {NAV.map(({ to, icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <p className="nav-section-label" style={{ marginTop: 24 }}>Admin</p>
            {ADMIN_NAV.map(({ to, icon, label }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <span className="nav-icon">{icon}</span>
                <span>{label}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* User */}
      <div className="sidebar-user">
        <div className="user-avatar">{user?.name?.[0]?.toUpperCase() || 'U'}</div>
        <div className="user-info">
          <p className="user-name">{user?.name}</p>
          <p className="user-role">{user?.role}</p>
        </div>
        <button className="logout-btn" onClick={handleLogout} title="Logout">⏻</button>
      </div>
    </aside>
  );
};

export default Sidebar;
