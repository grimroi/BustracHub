// src/components/Layout/TopbarResident.jsx
import React from 'react';
import { ThemeToggle } from '../ThemeToggle';
import './Topbar.css';

const TopbarResident = React.memo(function TopbarResident({
  currentTitle,
  currentSubtitle,
  logout,
  onThemeToggle,
  theme,
}) {
  return (
    <header className="topbar">
      <div className="tb-left">
        <div className="tb-title">{currentTitle}</div>
        <div className="tb-sub">{currentSubtitle}</div>
      </div>

      <div className="tb-right">
        <ThemeToggle onClick={onThemeToggle} theme={theme} />
        <button className="btn btn-g btn-sm" onClick={logout} aria-label="Sign out">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Sign Out</span>
        </button>
      </div>
    </header>
  );
});

export default TopbarResident;