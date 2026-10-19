// src/components/screens/DashboardScreen.jsx
import React from 'react';
import './DashboardScreen.css';

const DashboardScreen = React.memo(function DashboardScreen({
  // Data
  role,
  residentsList,
  householdsList,
  programsList,
  programsLoaded,
  blotterList,
  feedbackList,
  conflictsList,
  pendingRequestsCount,
  pendingBlotterCount,
  activeFeedbackCount,
  totalResidents,
  totalHouseholds,
  totalVoters,
  p1Count, p2Count, p3Count, p4Count, p5Count,
  settledBlotterCount,
  cfaBlotterCount,
  activeBlotterCount,
  otherBlotterCount,
  openBlotterCount,
  activeDisasters = 0,
  bhsRecordsCount = 0,
  lowStockCount = 0,
  feedbackSummary = { complaint: 0, inquiry: 0, suggestion: 0 },

  // Sync
  syncState,
  pendingCount,
  lastSynced,

  // Audit
  recentAudit,
  recentAuditLoading,
  recentAuditError,

  // Trends
  residentTrend,
  householdTrend,
  voterTrend,
  certTrend,
  blotterTrend,
  feedbackTrend,

  // Navigation
  nav,
}) {
    // Open / pending cases only (Open, Under Mediation, Pending) — resolved,
    // settled and CFA cases are excluded. Uses the prop computed by the portal
    // from localDb; falls back to a local filter when the prop is undefined.
    const resolvedOpenBlotterCount = typeof openBlotterCount === 'number'
      ? openBlotterCount
      : blotterList.filter(
          (b) => b.status === 'Open' || b.status === 'Under Mediation' || b.status === 'Pending'
        ).length;

    // Breakdown buckets are mutually exclusive and exhaustive
    // (settled + CFA + active + dismissed/other), and the header total is
    // derived from the same rows so it can never disagree with the sum shown.
    const blotterOutcomeRows = [
      { label: 'Settled / Amicable', count: settledBlotterCount || 0, color: 'var(--green)', bg: 'var(--green-bg)' },
      { label: 'Referred to PNP (CFA)', count: cfaBlotterCount || 0, color: 'var(--red)', bg: 'var(--red-bg)' },
      { label: 'Active / Mediation', count: activeBlotterCount || 0, color: 'var(--amber)', bg: 'var(--amber-bg)' },
      ...((otherBlotterCount || 0) > 0
        ? [{ label: 'Dismissed / Other', count: otherBlotterCount, color: 'var(--muted)', bg: 'var(--surface2)' }]
        : []),
    ];
    const blotterOutcomeTotal = blotterOutcomeRows.reduce((sum, row) => sum + row.count, 0);
  return (
    <div className="screen active dashboard-screen" style={{ padding: '24px', width: '100%', boxSizing: 'border-box', maxWidth: '1400px', margin: '0 auto' }}> 
                        {/* ACTION REQUIRED BANNER (compact) */}
                        {pendingRequestsCount > 0 || activeFeedbackCount > 0 || resolvedOpenBlotterCount > 0 || (conflictsList.length > 0 && role === 'admin') ? (
                        <div className="ds-banner">
                            <span className="ds-banner-icon" aria-hidden="true">⚠️</span>
                            <div className="ds-banner-text">
                            {pendingRequestsCount + activeFeedbackCount + resolvedOpenBlotterCount + (role === 'admin' ? conflictsList.length : 0)} items need attention
                            </div>
                            <div className="ds-banner-badges">
                            {pendingRequestsCount > 0 && (
                                <button type="button" className="ds-badge ds-badge-accent" onClick={() => nav('cert-approve')}
                                aria-label={`Review ${pendingRequestsCount} pending certificate requests`}>
                                Certs · {pendingRequestsCount}
                                </button>
                            )}
                            {activeFeedbackCount > 0 && (
                                <button type="button" className="ds-badge ds-badge-teal" onClick={() => nav('feedback')}
                                aria-label={`Review ${activeFeedbackCount} unresolved feedback`}>
                                Unresolved Feedback · {activeFeedbackCount}
                                </button>
                            )}
                            {resolvedOpenBlotterCount > 0 && (
                                <button type="button" className="ds-badge ds-badge-red" onClick={() => nav('blotter-manage')}
                                aria-label={`Review ${resolvedOpenBlotterCount} open blotter cases`}>
                                Blotter · {resolvedOpenBlotterCount}
                                </button>
                            )}
                            {conflictsList.length > 0 && role === 'admin' && (
                                <button type="button" className="ds-badge ds-badge-amber" onClick={() => nav('conflicts')}
                                aria-label={`Review ${conflictsList.length} sync conflicts`}>
                                Conflicts · {conflictsList.length}
                                </button>
                            )}
                            </div>
                        </div>
                        ) : (
                        <div className="ds-caught-up">
                            <span aria-hidden="true">✓</span> All caught up — walang pending actions
                        </div>
                        )}
                      {/* QUICK ACTIONS GRID (Para hindi puro numbers, may mga button na agad) */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                          {[
                            { label: 'Add Resident', icon: '👤', color: 'var(--primary)', nav: 'add-resident' },
                            { label: 'Issue Certificate', icon: '📄', color: 'var(--green)', nav: 'cert-req' },
                            { label: 'Post Announcement', icon: '📢', color: 'var(--amber)', nav: 'announcements' },
                            { label: 'View Reports', icon: '📊', color: 'var(--teal)', nav: 'reports' }
                          ].map((action, i) => (
                            <button 
                              key={i} 
                              onClick={() => nav(action.nav)}
                              style={{ 
                                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', 
                                padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                                cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = action.color; }}
                              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                            >
                              <span style={{ fontSize: '24px' }}>{action.icon}</span>
                              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{action.label}</span>
                            </button>
                              ))}
                        </div>
                        {/* 1. TOP METRICS GRID */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                          {[
                            { label: 'Total Residents', value: totalResidents, sub: 'Registered', color: 'var(--text)', trend: residentTrend, goodWhenUp: true },
                            { label: 'Households', value: totalHouseholds, sub: 'Family units', color: 'var(--green)', trend: householdTrend, goodWhenUp: true },
                            { label: 'Reg. Voters', value: totalVoters, sub: `${totalResidents > 0 ? ((totalVoters / totalResidents) * 100).toFixed(0) : 0}% of total`, color: 'var(--amber)', trend: voterTrend, goodWhenUp: true },
                            { label: 'Pending Certs', value: pendingRequestsCount, sub: 'Awaiting approval', color: 'var(--accent)', trend: certTrend, goodWhenUp: false },
                            { label: 'Active Aid Programs', value: programsLoaded ? (programsList || []).filter((p) => (p.status || '').toLowerCase() === 'active').length : '…', sub: programsLoaded ? 'Ongoing programs' : 'Loading…', color: 'var(--teal)', goodWhenUp: null },
                            { label: 'Open Blotter', value: resolvedOpenBlotterCount, sub: 'Active cases', color: 'var(--red)', trend: blotterTrend, goodWhenUp: false },
                            { label: 'Active Disasters', value: activeDisasters, sub: 'Ongoing response', color: 'var(--amber)' },
                            { label: 'Health Records', value: bhsRecordsCount, sub: 'Active records', color: 'var(--teal)' },
                            { label: 'Low Stock Meds', value: lowStockCount, sub: 'Needs restock', color: 'var(--red)' },
                            ...(role === 'admin' ? [{ label: 'Sync Conflicts', value: conflictsList.length, sub: conflictsList.length > 0 ? 'Needs fix' : 'All synced', color: conflictsList.length > 0 ? 'var(--amber)' : 'var(--muted)' }] : []),
                            { label: 'Feedback Overview', value: feedbackList.length, sub: `${activeFeedbackCount} unresolved · ${feedbackList.length} total`, color: 'var(--teal)', trend: feedbackTrend, goodWhenUp: null }
                          ].map((stat, i) => (
                            <div key={i} className="ds-stat-card">
                              <span className="ds-stat-label">{stat.label}</span>
                              <span className="ds-stat-value" style={{ color: stat.color }}>{stat.value}</span>
                              {false && stat.trend && (
                                <span style={{ fontSize: '11px', fontWeight: 700, color: stat.trend.delta === 0 ? 'var(--muted)' : stat.goodWhenUp === null ? 'var(--teal-text)' : (stat.trend.delta > 0) === stat.goodWhenUp ? 'var(--green-text)' : 'var(--red-text)' }}>
                                  {stat.trend.delta > 0 ? '▲' : stat.trend.delta < 0 ? '▼' : '•'} {stat.trend.thisMonth} new this month (last mo: {stat.trend.lastMonth})
                                </span>
                              )}
                              <span className="ds-stat-sub">{stat.sub}</span>
                            </div>
                          ))}
                        </div>
                        
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                          
                          {/* Blotter Case Outcomes Visual Card */}
                          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                              <div>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>Blotter Case Outcomes</div>
                                <div style={{ fontSize: '11px', color: 'var(--hint)' }}>Settled vs Escalated (CFA) vs Pending</div>
                              </div>
                              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                                Total: {blotterOutcomeTotal}
                              </span>
                            </div>
    
                            {blotterOutcomeTotal === 0 ? (
                              <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '12px 0' }}>No blotter cases recorded.</div>
                            ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                              {blotterOutcomeRows.map((item) => {
                                const total = blotterOutcomeTotal || 1;
                                const pct = Math.round((item.count / total) * 100);
                                return (
                                  <div key={item.label}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                                      <span style={{ color: 'var(--text)' }}>{item.label}</span>
                                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{item.count} ({pct}%)</span>
                                    </div>
                                    <div className="ds-track">
                                      <div className="ds-track-fill" style={{ background: item.color, width: `${pct}%` }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            )}
                          </div>
     
                          {/* Feedback Reports Breakdown Visual Card */}
                          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                              <div>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>Feedback Submissions</div>
                                <div style={{ fontSize: '11px', color: 'var(--hint)' }}>Categorized by report type</div>
                              </div>
                              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                                Total: {feedbackList.length}
                              </span>
                            </div>
    
                            {feedbackList.length === 0 ? (
                              <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '12px 0' }}>No feedback submissions.</div>
                            ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '10px' }}>
                              {[
                                { label: 'Complaints', count: feedbackSummary.complaint, variant: 'red' },
                                { label: 'Inquiries', count: feedbackSummary.inquiry, variant: 'blue' },
                                { label: 'Suggestions', count: feedbackSummary.suggestion, variant: 'teal' }
                              ].map((fb, idx) => (
                                <div key={idx} className={`ds-fb-card ${fb.variant}`}>
                                  <div className="ds-fb-num">{fb.count}</div>
                                  <div className="ds-fb-label">{fb.label}</div>
                                </div>
                              ))}
                            </div>
                            )}
                          </div>
     
                        </div>
                        
                        {/* 3. BOTTOM ROW (Purok Population & System Status) */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
                          {/* Purok Population */}
                          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--accent-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>
                              </div>
                              <div>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>Population per Purok</div>
                                <div style={{ fontSize: '11px', color: 'var(--hint)' }}>Resident distribution</div>
                              </div>
                            </div>
                            {totalResidents === 0 ? (
                              <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '12px 0' }}>No resident records.</div>
                            ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              {[
                                { label: 'Purok 1', count: p1Count, color: 'var(--accent)' },
                                { label: 'Purok 2', count: p2Count, color: 'var(--teal)' },
                                { label: 'Purok 3', count: p3Count, color: 'var(--primary)' },
                                { label: 'Purok 4', count: p4Count, color: 'var(--red)' },
                                { label: 'Purok 5', count: p5Count, color: 'var(--amber)' }
                              ].map((purok) => {
                                const percentage = totalResidents > 0 ? Math.round((purok.count / totalResidents) * 100) : 0;
                                return (
                                  <div key={purok.label}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{purok.label}</span>
                                      <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>{purok.count} ({percentage}%)</span>
                                    </div>
                                    <div className="ds-track">
                                      <div className="ds-track-fill" style={{ background: purok.color, width: `${percentage}%` }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            )}
                          </div>
                        </div>
                      {/* Sync Status + Recent Audit */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px', marginTop: '20px' }}>
                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>Synchronization Status</div>
                          <div style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '6px' }}>State: <strong>{syncState || 'unknown'}</strong></div>
                          <div style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '6px' }}>Queued Sync Operations: <strong>{typeof pendingCount === 'number' ? pendingCount : 0}</strong></div>
                          <div style={{ fontSize: '12px', color: 'var(--text)' }}>Last Successful Sync: <strong>{lastSynced ? new Date(lastSynced).toLocaleString() : '—'}</strong></div>
                        </div>
                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>Recent Audit Activity</div>
                          {recentAuditLoading ? (
                            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Loading…</div>
                          ) : recentAuditError ? (
                            <div style={{ fontSize: '12px', color: 'var(--red)' }}>Failed to load audit activity.</div>
                          ) : (recentAudit || []).length === 0 ? (
                            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>No recent activity.</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {(recentAudit || []).slice(0, 5).map((log, i) => (
                                <div key={log._id || i} style={{ fontSize: '12px', color: 'var(--text)' }}>
                                  <strong>{log.action || 'Action'}</strong> — {log.module || 'Module'}{' '}
                                  <span style={{ color: 'var(--muted)' }}>({log.timestamp || log.createdAt ? new Date(log.timestamp || log.createdAt).toLocaleString() : '—'})</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      </div>
  );
});

export default DashboardScreen;