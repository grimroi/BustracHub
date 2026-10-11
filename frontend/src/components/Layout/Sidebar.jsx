// src/components/layout/Sidebar.jsx
import React from 'react';

const Sidebar = React.memo(function Sidebar({
  sidebarOpen,
  setSidebarOpen,
  isResidentsOpen,
  setIsResidentsOpen,
  isAidOpen,
  setIsAidOpen,
  screen,
  nav,
  role,
  displayName,
  initials,
  syncState,
  pendingRequestsCount,
  pendingBlotterCount,
  activeFeedbackCount,
  accountRequests,
  conflictsList,
  logo,
  logout,
}) {
  return (
    <aside 
              className={`sidebar ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`} 
              style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}
            >
              <div
                className="sb-logo"
                style={{ cursor: sidebarOpen ? 'default' : 'pointer', transition: 'cursor 0.2s ease', flexShrink: 0 }}
                onClick={() => { if (!sidebarOpen) setSidebarOpen(true); }}
              >
                <button 
                  type="button" 
                  className="sidebar-close-btn" 
                  onClick={(e) => { e.stopPropagation(); setSidebarOpen(!sidebarOpen); }} 
                  aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"} 
                  title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                  </svg>
                </button>
                <img src={logo} alt="Barangay Bustrac Official Seal" className="sb-logo-img" />
                <div>
                  <div className="sb-title">Bustrac Hub</div>
                  <div className="sb-sub">{role === 'admin' ? 'Administrator Portal' : 'Staff Portal'}</div>
                </div>
              </div>
              <nav className="sb-nav" style={{ flex: 1, overflowY: sidebarOpen ? 'auto' : 'hidden', paddingBottom: '16px' }}>
                {/* OVERVIEW */}
                <div className="sb-sec">Overview</div>
                <button 
                  className={`nav-btn${screen === 'dashboard' ? ' active' : ''}`} 
                  onClick={() => nav('dashboard')} 
                  title={!sidebarOpen ? "Dashboard" : ""}
                  data-tooltip="Dashboard"
                >
                  <span className="nav-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 3h8v8H3z" />
                      <path d="M3 13h6v8H3z" />
                      <path d="M13 3h8v6h-8z" />
                      <path d="M13 13h8v8h-8z" />
                    </svg>
                  </span>
                  <span className="nav-label">Dashboard</span>
                </button>
    {/*             
                <button 
                  className={`nav-btn${screen === 'barangay-map' ? ' active' : ''}`} 
                  onClick={() => nav('barangay-map')}
                  title={!sidebarOpen ? "Barangay Map" : ""}
                  data-tooltip="Barangay Map"
                >
                  <span className="nav-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="1 6 1 22 8 18 16 22 21 18 21 2 16 6 8 2 1 6" />
                      <line x1="8" y1="2" x2="8" y2="18" />
                      <line x1="16" y1="6" x2="16" y2="22" />
                    </svg>
                  </span>
                  <span className="nav-label">Barangay Map</span>
                </button> */}
    
                {/* RESIDENTS MANAGEMENT */}
                <div className="sb-sec">Residents Management</div>
                <div className="sb-nav-group">
                  <button 
                    type="button" 
                    className={`nav-btn toggle-parent ${['residents', 'households', 'add-resident'].includes(screen) ? 'active-parent' : ''}`} 
                    onClick={() => {
                      if (!sidebarOpen) {
                        setSidebarOpen(true);
                        setIsResidentsOpen(true);
                      } else {
                        setIsResidentsOpen(!isResidentsOpen);
                      }
                    }} 
                    aria-expanded={isResidentsOpen}
                    title={!sidebarOpen ? "Residents Profile" : ""}
                    data-tooltip="Residents Profile"
                  >
                    <span className="nav-ico">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </span>
                    <span className="nav-label" style={{ flex: 1, textAlign: 'left' }}>Residents Management</span>
                    <span className="submenu-arrow" style={{ transform: isResidentsOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
                  </button>
    
                  {isResidentsOpen && sidebarOpen && (
                    <div className="sb-submenu-zone" style={{ paddingLeft: '14px' }}>
                      <button className={`nav-btn sub-btn${screen === 'residents' ? ' active' : ''}`} onClick={() => nav('residents')}>
                        <span className="nav-ico">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <path d="M14 2v6h6" />
                            <path d="M12 18v-6" />
                            <path d="M9 15h6" />
                          </svg>
                        </span>
                       <span className="nav-label">Manage Residents</span>
                      </button>
                      
                      <button className={`nav-btn sub-btn${screen === 'households' ? ' active' : ''}`} onClick={() => nav('households')}>
                        <span className="nav-ico">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                            <path d="M9 22V12h6v10" />
                          </svg>
                        </span>
                        <span className="nav-label">Manage Households</span>
                      </button>
    
                      {/* <button className={`nav-btn sub-btn${screen === 'add-resident' ? ' active' : ''}`} onClick={() => nav('add-resident')}>
                        <span className="nav-ico">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </span>
                        <span className="nav-label">Add Resident</span>
                      </button> */}
                    </div>
                  )}
                </div>
    
                {/* CERTIFICATES */}
                <div className="sb-sec">Certificates</div>
                <button 
                  className={`nav-btn${['cert-req', 'brgy_clearance', 'business_clearance'].includes(screen) ? ' active' : ''}`} 
                  onClick={() => nav('cert-req')} 
                >
                  <span className="nav-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                      <path d="M12 18v-6" />
                      <path d="M9 15h6" />
                    </svg>
                  </span>
                  <span className="nav-label">Request & Approval</span>
                  {pendingRequestsCount > 0 && <span className="nb nb-amber">{pendingRequestsCount}</span>}
                </button>
    
                <button 
                  className={`nav-btn${screen === 'cert-print' ? ' active' : ''}`} 
                  onClick={() => nav('cert-print')}
                  title={!sidebarOpen ? "Issuance & Print" : ""}
                  data-tooltip="Issuance & Print"
                >
                  <span className="nav-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 17h2a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
                      <path d="M7 17h2a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H7" />
                      <path d="M12 7V5" />
                      <path d="M10 19h4" />
                      <path d="M7 9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                    </svg>
                  </span>
                  <span className="nav-label">Issuance & Print</span>
                </button>
    
                {/* AID DISTRIBUTION */}
                <div className="sb-sec">Aid Distribution</div>
                <div className="sb-nav-group">
                  <button 
                    type="button" 
                    className={`nav-btn toggle-parent ${['programs', 'aid-encode', 'aid-logs', 'add-beneficiary'].includes(screen) ? 'active-parent' : ''}`} 
                    onClick={() => {
                      if (!sidebarOpen) {
                        setSidebarOpen(true);
                        setIsAidOpen(true);
                      } else {
                        setIsAidOpen(!isAidOpen);
                      }
                    }} 
                    aria-expanded={isAidOpen}
                    title={!sidebarOpen ? "Aid Distribution" : ""}
                    data-tooltip="Aid Distribution"
                  >
                    <span className="nav-ico">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        <path d="M3.27 6.96L12 12.01l8.73-5.05" />
                        <path d="M12 22.08V12" />
                      </svg>
                    </span>
                    <span className="nav-label" style={{ flex: 1, textAlign: 'left' }}>Aid Distribution</span>
                    <span className="submenu-arrow" style={{ transform: isAidOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
                  </button>
    
                  {isAidOpen && sidebarOpen && (
                    <div className="sb-submenu-zone" style={{ paddingLeft: '14px' }}>
                      <button className={`nav-btn sub-btn${screen === 'programs' ? ' active' : ''}`} onClick={() => nav('programs')}>
                        <span className="nav-ico">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          </svg>
                        </span>
                        <span className="nav-label">Programs</span>
                      </button>
    
                      <button className={`nav-btn sub-btn${screen === 'aid-encode' ? ' active' : ''}`} onClick={() => nav('aid-encode')}>
                        <span className="nav-ico">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </span>
                        <span className="nav-label">Relief Distribution</span>
                      </button>
    
                      <button className={`nav-btn sub-btn${screen === 'aid-logs' ? ' active' : ''}`} onClick={() => nav('aid-logs')}>
                        <span className="nav-ico">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <path d="M14 2v6h6" />
                            <path d="M12 18v-6" />
                            <path d="M9 15h6" />
                          </svg>
                        </span>
                        <span className="nav-label">Distribution Logs</span>
                      </button>
    
                      
                    </div>
                  )}
                </div>
    
                {/* PEACE & ORDER / INCIDENTS */}
                <div className="sb-sec">Peace & Order</div>
                <button 
                  className={`nav-btn${screen === 'blotter-new' ? ' active' : ''}`} 
                  onClick={() => nav('blotter-new')}
                  title={!sidebarOpen ? "File Incident / Complaint" : ""}
                  data-tooltip="File Incident"
                >
                  <span className="nav-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                    </svg>
                  </span>
                  <span className="nav-label">File Incident / Complaint</span>
                </button>
    
                <button 
                  className={`nav-btn${screen === 'blotter-manage' ? ' active' : ''}`} 
                  onClick={() => nav('blotter-manage')}
                  title={!sidebarOpen ? "Manage Incident Cases" : ""}
                  data-tooltip="Manage Incidents"
                >
                  <span className="nav-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                      <path d="M12 18v-6" />
                      <path d="M9 15h6" />
                    </svg>
                  </span>
                  <span className="nav-label">Manage Blotter Records</span>
                  {pendingBlotterCount > 0 && <span className="nb nb-red">{pendingBlotterCount}</span>}
                </button>
                
                <button
                  className={`nav-btn${screen === 'blotter-detail' ? ' active' : ''}`}
                  onClick={() => nav('blotter-detail')}
                  title={!sidebarOpen ? "Summons & Hearings" : ""}
                  data-tooltip="Summons & Hearings"
                >
                  <span className="nav-ico">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                  </svg>
                  </span>
                  <span className="nav-label">Summons & Hearings</span>
                </button>
                
    
                {/* COMMUNITY */}
                <div className="sb-sec">Community</div>
                <button 
                  className={`nav-btn${screen === 'announcements' ? ' active' : ''}`} 
                  onClick={() => nav('announcements')}
                  title={!sidebarOpen ? "Announcements" : ""}
                  data-tooltip="Announcements"
                >
                  <span className="nav-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  </span>
                  <span className="nav-label">Announcements</span>
                </button>
    
                <button 
                  className={`nav-btn${screen === 'feedback' ? ' active' : ''}`} 
                  onClick={() => nav('feedback')}
                  title={!sidebarOpen ? "Feedback" : ""}
                  data-tooltip="Feedback"
                >
                  <span className="nav-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </span>
                  <span className="nav-label">Feedback</span>
                  {activeFeedbackCount > 0 && <span className="nb nb-red">{activeFeedbackCount}</span>}
                </button>
    
                
    
                {/* ADMIN-ONLY SECTION */}
                {role === 'admin' && (
                  <>
                    <div className="sb-sec">Admin & Governance</div>
                    
                    
    
                    <button 
                      className={`nav-btn${screen === 'conflicts' ? ' active' : ''}`} 
                      onClick={() => nav('conflicts')}
                      title={!sidebarOpen ? "Conflict Resolution" : ""}
                      data-tooltip="Conflict Resolution"
                    >
                      <span className="nav-ico">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <path d="M12 9v4" />
                          <path d="M12 17h.01" />
                        </svg>
                      </span>
                      <span className="nav-label">Conflict Resolution</span>
                      {conflictsList?.length > 0 && <span className="nb nb-red">{conflictsList.length}</span>}
                    </button>
    
                    <button 
                      className={`nav-btn${screen === 'audit' ? ' active' : ''}`} 
                      onClick={() => nav('audit')}
                      title={!sidebarOpen ? "Audit Log" : ""}
                      data-tooltip="Audit Log"
                    >
                      <span className="nav-ico">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />
                        </svg>
                      </span>
                      <span className="nav-label">Audit Log</span>
                    </button>
    
                    <button 
                      className={`nav-btn${screen === 'users' ? ' active' : ''}`} 
                      onClick={() => nav('users')}
                      title={!sidebarOpen ? "Manage Users" : ""}
                      data-tooltip="Manage Users"
                    >
                      <span className="nav-ico">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </span>
                      <span className="nav-label">Manage Users</span>
                      {accountRequests.length > 0 && <span className="nb nb-amber">{accountRequests.length}</span>}
                    </button>
                  </>
                )}
                 
                 <button
  className={`nav-btn${screen === 'events-manage' ? ' active' : ''}`}
  onClick={() => nav('events-manage')}
  title={!sidebarOpen ? "Events Management" : ""}
>
  <span className="nav-ico">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  </span>
  <span className="nav-label">Events Management</span>
</button>

                {/* REPORTS */}
                <div className="sb-sec">Reports</div>
                <button 
                  className={`nav-btn${screen === 'reports' ? ' active' : ''}`} 
                  onClick={() => nav('reports')}
                  title={!sidebarOpen ? "Generate Reports" : ""}
                  data-tooltip="Generate Reports"
                >
                  <span className="nav-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 3h18v18H3z" />
                      <path d="M3 9h18" />
                      <path d="M9 21V9" />
                    </svg>
                  </span>
                  <span className="nav-label">Generate Reports</span>
                </button>
              </nav>
    
              {/* 3. SIDEBAR FOOTER (USER PROFILE & SYNC STATUS) */}
              <div 
                className="sb-foot" 
                onClick={() => {
                  if (typeof setScreen === 'function') {
                    setScreen('profile');
                  } else if (typeof setShowUserMenu === 'function') {
                    setShowUserMenu(prev => !prev);
                  }
                }} 
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (typeof setScreen === 'function') setScreen('profile');
                  }
                }} 
                role="button" 
                tabIndex={0}
                title={!sidebarOpen ? displayName : ""}
              >
                <div className="sb-ava">{initials}</div>
                <div className="sb-info" style={{ flex: 1, minWidth: 0 }}>
                  <div className="sb-uname" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName}
                  </div>
                  <div className="sb-urole">
                    {role === 'admin' ? 'Administrator' : 'Staff'}
                  </div>
                </div>
                <div 
                  className="online-dot" 
                  title={
                    syncState === 'offline' ? 'Offline — changes saved locally' :
                    syncState === 'syncing' ? 'Connecting and syncing' : 
                    'Online — changes synced'
                  } 
                  style={{ 
                    background: syncState === 'offline' ? 'var(--red)' : syncState === 'syncing' ? 'var(--amber)' : 'var(--green)', 
                    boxShadow: syncState === 'offline' ? '0 0 0 2px var(--red-bg)' : syncState === 'syncing' ? '0 0 0 2px var(--amber-bg)' : '0 0 0 2px var(--green-bg)' 
                  }} 
                />
              </div>
            </aside>
  );
});

export default Sidebar;
