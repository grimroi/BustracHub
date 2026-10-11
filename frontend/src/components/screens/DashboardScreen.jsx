// src/components/screens/DashboardScreen.jsx
import React from 'react';

const DashboardScreen = React.memo(function DashboardScreen({
  // Data
  role,
  residentsList,
  householdsList,
  programsList,
  blotterList,
  feedbackList,
  conflictsList,
  
  // Computed counts
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
  feedbackSummary,
  
  // Trends
  residentTrend,
  householdTrend,
  voterTrend,
  certTrend,
  blotterTrend,
  feedbackTrend,
  
  // Sync
  syncState,
  
  // Navigation
  nav,
}) {
    const openBlotterCount = blotterList.filter(
  (b) => b.status === 'Open' || b.status === 'Under Mediation'
).length;
  return (
    <div className="screen active" style={{ padding: '24px', width: '100%', boxSizing: 'border-box', maxWidth: '1600px', margin: '0 auto' }}> 
                      {/* DASHBOARD SUMMARY HEADER (Consolidated view for quick decision-making) */}
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>
                            {role === 'admin' ? 'Barangay Overview' : 'Operations Overview'}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                            Consolidated key metrics, trends &amp; indicators • As of {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                          </div>
                        </div>
                        {/* ACTION REQUIRED BANNER (compact) */}
                        {pendingRequestsCount > 0 || activeFeedbackCount > 0 || openBlotterCount > 0 || (conflictsList.length > 0 && role === 'admin') ? (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 16px',
                            background: 'var(--amber-bg)',
                            border: '1px solid var(--amber-border)',
                            borderLeft: '3px solid var(--amber)',
                            borderRadius: 10, marginBottom: 16,
                        }}>
                            <span style={{ fontSize: 18 }}>⚠️</span>
                            <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--amber-text)' }}>
                            {pendingRequestsCount + activeFeedbackCount + openBlotterCount + (role === 'admin' ? conflictsList.length : 0)} items need attention
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                            {pendingRequestsCount > 0 && (
                                <button onClick={() => nav('cert-approve')}
                                style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                Certs · {pendingRequestsCount}
                                </button>
                            )}
                            {activeFeedbackCount > 0 && (
                                <button onClick={() => nav('feedback')}
                                style={{ background: 'var(--teal)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                Feedback · {activeFeedbackCount}
                                </button>
                            )}
                            {openBlotterCount > 0 && (
                                <button onClick={() => nav('blotter-manage')}
                                style={{ background: 'var(--red)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                Blotter · {openBlotterCount}
                                </button>
                            )}
                            {conflictsList.length > 0 && role === 'admin' && (
                                <button onClick={() => nav('conflicts')}
                                style={{ background: 'var(--amber)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                Conflicts · {conflictsList.length}
                                </button>
                            )}
                            </div>
                        </div>
                        ) : (
                        <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green-text)' }}>✓ All caught up — walang pending actions</span>
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
                            { label: 'Open Blotter', value: typeof blotterList !== 'undefined' ? blotterList.filter(b => b.status === 'Open' || b.status === 'Under Mediation').length : 0, sub: 'Active cases', color: 'var(--red)', trend: blotterTrend, goodWhenUp: false },
                            ...(role === 'admin' ? [{ label: 'Sync Conflicts', value: conflictsList.length, sub: conflictsList.length > 0 ? 'Needs fix' : 'All synced', color: conflictsList.length > 0 ? 'var(--amber)' : 'var(--muted)' }] : []),
                            { label: 'Feedback', value: activeFeedbackCount, sub: 'Submissions', color: 'var(--teal)', trend: feedbackTrend, goodWhenUp: null }
                          ].map((stat, i) => (
                            <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</span>
                              <span style={{ fontSize: '26px', fontWeight: 800, color: stat.color, lineHeight: 1.1 }}>{stat.value}</span>
                              {stat.trend && (
                                <span style={{ fontSize: '11px', fontWeight: 700, color: stat.trend.delta === 0 ? 'var(--muted)' : stat.goodWhenUp === null ? 'var(--teal-text)' : (stat.trend.delta > 0) === stat.goodWhenUp ? 'var(--green-text)' : 'var(--red-text)' }}>
                                  {stat.trend.delta > 0 ? '▲' : stat.trend.delta < 0 ? '▼' : '•'} {stat.trend.thisMonth} new this month (last mo: {stat.trend.lastMonth})
                                </span>
                              )}
                              <span style={{ fontSize: '11px', color: 'var(--hint)' }}>{stat.sub}</span>
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
                                Total: {blotterList.length}
                              </span>
                            </div>
    
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                              {[
                                { label: 'Settled / Amicable', count: settledBlotterCount, color: 'var(--green)', bg: 'var(--green-bg)' },
                                { label: 'Referred to PNP (CFA)', count: cfaBlotterCount, color: 'var(--red)', bg: 'var(--red-bg)' },
                                { label: 'Active / Mediation', count: activeBlotterCount, color: 'var(--amber)', bg: 'var(--amber-bg)' }
                              ].map((item) => {
                                const total = blotterList.length || 1;
                                const pct = Math.round((item.count / total) * 100);
                                return (
                                  <div key={item.label}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                                      <span style={{ color: 'var(--text)' }}>{item.label}</span>
                                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{item.count} ({pct}%)</span>
                                    </div>
                                    <div style={{ background: 'var(--surface2)', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
                                      <div style={{ background: item.color, height: '100%', width: `${pct}%`, transition: 'width 0.5s ease' }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
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
    
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '10px' }}>
                              {[
                                { label: 'Complaints', count: feedbackSummary.complaint, color: 'var(--red)', bg: 'rgba(239, 68, 68, 0.1)' },
                                { label: 'Inquiries', count: feedbackSummary.inquiry, color: 'var(--accent)', bg: 'rgba(59, 130, 246, 0.1)' },
                                { label: 'Suggestions', count: feedbackSummary.suggestion, color: 'var(--teal)', bg: 'rgba(20, 184, 166, 0.1)' }
                              ].map((fb, idx) => (
                                <div key={idx} style={{ background: fb.bg, border: `1px solid ${fb.color}`, borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                                  <div style={{ fontSize: '22px', fontWeight: 800, color: fb.color }}>{fb.count}</div>
                                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)', marginTop: '2px' }}>{fb.label}</div>
                                </div>
                              ))}
                            </div>
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
                                    <div style={{ background: 'var(--surface2)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                                      <div style={{ background: purok.color, height: '100%', width: `${percentage}%`, borderRadius: '4px', transition: 'width 0.6s ease' }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
  );
});

export default DashboardScreen;