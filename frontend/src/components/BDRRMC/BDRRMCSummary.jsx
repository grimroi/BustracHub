import { useEffect, useState } from 'react';
import { localDb as db } from '../../services/db';
import './BDRRMC.css';

const EMPTY_STATS = {
  activeDisasters: 0,
  affectedFamilies: 0,
  activeEvacuees: 0,
  reliefCount: 0,
};

export default function BDRRMCSummary({ onSwitchTab }) {
  const [stats, setStats] = useState(EMPTY_STATS);
  const [recentEvents, setRecentEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await db.allDocs({ include_docs: true });
      const docs = res.rows
        .map((r) => r.doc)
        .filter((d) => d && !d._deleted && d.isArchived !== true);

      const activeDisasters = docs.filter(
        (d) => d.type === 'disaster_event' && d.status === 'Active'
      ).length;

      const affectedFamilies = docs
        .filter((d) => d.type === 'disaster_event')
        .reduce((sum, d) => sum + (Number(d.affectedFamilies) || 0), 0);

      const activeEvacuees = docs
        .filter((d) => d.type === 'evacuation_center' && (d.status === 'Open' || d.status === 'Full'))
        .reduce((sum, d) => sum + (Number(d.currentOccupants) || 0), 0);

      const reliefCount = docs.filter((d) => d.type === 'relief_distribution').length;

      // Get recent disaster events (latest 5)
      const events = docs
        .filter((d) => d.type === 'disaster_event')
        .sort((a, b) => new Date(b.dateStarted || 0) - new Date(a.dateStarted || 0))
        .slice(0, 5);

      setStats({ activeDisasters, affectedFamilies, activeEvacuees, reliefCount });
      setRecentEvents(events);
    } catch (err) {
      console.error('Failed to load BDRRMC summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    let timer = null;
    const feed = db.changes({ since: 'now', live: true }).on('change', () => {
      clearTimeout(timer);
      timer = setTimeout(load, 400);
    });
    return () => {
      clearTimeout(timer);
      feed.cancel();
    };
  }, []);

  const cards = [
    { label: 'Active Disasters', value: stats.activeDisasters, accent: 'var(--red, #dc2626)' },
    { label: 'Total Affected Families', value: stats.affectedFamilies, accent: 'var(--amber, #b45309)' },
    { label: 'Active Evacuees', value: stats.activeEvacuees, accent: 'var(--accent, #3b6fd9)' },
    { label: 'Relief Distributions', value: stats.reliefCount, accent: 'var(--green, #059669)' },
  ];

  const statusBadgeClass = (status) => {
    if (status === 'Active') return 'bdrrmc-badge bdrrmc-badge--red';
    if (status === 'Monitoring') return 'bdrrmc-badge bdrrmc-badge--amber';
    if (status === 'Recovery') return 'bdrrmc-badge bdrrmc-badge--blue';
    return 'bdrrmc-badge bdrrmc-badge--green';
  };

  return (
    <div className="bdrrmc-tab-content">
      {/* Stat Cards */}
      <div className="bdrrmc-stats" aria-label="BDRRMC summary metrics">
        {cards.map((c) => {
          const tone = c.accent.includes('red') ? 'red' : c.accent.includes('amber') ? 'amber' : c.accent.includes('green') ? 'green' : 'blue';
          return (
            <div key={c.label} className={`bdrrmc-stat-card ${tone}`}>
              <div className="bdrrmc-stat-label">{c.label}</div>
              <div className="bdrrmc-stat-value">
                {loading ? '—' : c.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Disaster Events */}
      <div className="bdrrmc-section-header" style={{ marginTop: 8 }}>
        <div className="bdrrmc-section-title">
          Recent Disaster Events
          {!loading && <span className="bdrrmc-count-pill">{recentEvents.length}</span>}
        </div>
        {onSwitchTab && (
          <button className="btn btn-g btn-sm" onClick={() => onSwitchTab('events')}>
            View All
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: 12, padding: '20px 0' }}>Loading...</div>
      ) : recentEvents.length === 0 ? (
        <div className="bdrrmc-empty">
          <div className="bdrrmc-empty-icon">🚨</div>
          <div>No recent disaster events</div>
          <div style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>Newly recorded disaster events will appear here.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recentEvents.map((e) => (
            <div key={e._id} className="bdrrmc-event-row">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                  {e.eventType || 'Disaster Event'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {e.location || '—'} • {e.dateStarted ? new Date(e.dateStarted).toLocaleDateString() : '—'}
                </div>
              </div>
              <span className={statusBadgeClass(e.status)}>
                {e.status || 'Unknown'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}