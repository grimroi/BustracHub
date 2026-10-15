import { useEffect, useState } from 'react';
import { localDb as db } from '../../services/db';

const EMPTY_STATS = {
  activeDisasters: 0,
  affectedFamilies: 0,
  activeEvacuees: 0,
  reliefCount: 0,
};

export default function BDRRMCSummary() {
  const [stats, setStats] = useState(EMPTY_STATS);
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

      setStats({ activeDisasters, affectedFamilies, activeEvacuees, reliefCount });
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

  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 4 }}
      aria-label="BDRRMC summary metrics"
    >
      {cards.map((c) => (
        <div
          key={c.label}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: `3px solid ${c.accent}`, borderRadius: 10, padding: '14px 16px' }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{c.label}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginTop: 6 }}>
            {loading ? '—' : c.value}
          </div>
        </div>
      ))}
    </div>
  );
}
