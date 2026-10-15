import { useEffect, useState } from 'react';
import { localDb as db } from '../../services/db';

export default function ResidentBDRRMC({ loggedInUser }) {
  const [alerts, setAlerts] = useState([]);
  const [relief, setRelief] = useState([]);
  const [centers, setCenters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await db.allDocs({ include_docs: true });
        const docs = res.rows.map(r => r.doc).filter(d => d && !d._deleted);
        
        // Active Disaster Alerts
        const activeAlerts = docs
          .filter(d => d.type === 'disaster_event' && d.status === 'Active' && d.isArchived !== true)
          .sort((a, b) => new Date(b.dateStarted || 0) - new Date(a.dateStarted || 0));
          
        // My Relief Records
        const residentId = loggedInUser?.residentId || loggedInUser?._id || '';
        const fullName = loggedInUser?.fullName || loggedInUser?.name || '';
        
        const myRelief = docs
          .filter(d => d.type === 'relief_distribution' && d.isArchived !== true && (
            (residentId && d.residentId === residentId) ||
            (fullName && d.residentName === fullName)
          ))
          .sort((a, b) => new Date(b.dateGiven || 0) - new Date(a.dateGiven || 0));

        // Available Evacuation Centers (open/full only, active only)
        const availableCenters = docs
          .filter(d => d.type === 'evacuation_center' && d.isArchived !== true && (d.status === 'Open' || d.status === 'Full'))
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        setAlerts(activeAlerts);
        setRelief(myRelief);
        setCenters(availableCenters);
      } catch (err) {
        console.error('Failed to load BDRRMC data:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [loggedInUser]);

  const severityColor = (sev) => {
    if (sev === 'Critical') return 'var(--red, #dc2626)';
    if (sev === 'High') return 'var(--amber, #b45309)';
    if (sev === 'Medium') return 'var(--accent, #3b6fd9)';
    return 'var(--green, #059669)';
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading disaster information...</div>;
  }

  return (
    <div className="screen active">
      <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Disaster Alerts & Relief Records</h2>
      
      <section style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Active Disaster Alerts</h3>
        {alerts.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', background: 'var(--surface2)', border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--muted)' }}>
            No active disaster alerts in your area.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {alerts.map(ev => (
              <div key={ev._id} style={{ padding: 16, background: 'var(--surface)', border: `1px solid ${severityColor(ev.severity)}`, borderRadius: 10, borderLeftWidth: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong style={{ fontSize: 15, color: 'var(--text)' }}>{ev.eventType}</strong>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 12, background: `${severityColor(ev.severity)}22`, color: severityColor(ev.severity) }}>
                    {ev.severity}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  <div style={{ marginBottom: 4 }}>📍 {ev.location}</div>
                  <div>📅 Started: {ev.dateStarted || 'Unknown'}</div>
                  {ev.description && <div style={{ marginTop: 8, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{ev.description}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>My Relief Records</h3>
        {relief.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', background: 'var(--surface2)', border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--muted)' }}>
            No relief distribution records found for your profile.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: 'var(--surface2)' }}>
                <tr>
                  {['Item', 'Quantity', 'Date Given', 'Notes'].map(h => (
                    <th key={h} scope="col" style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {relief.map(r => (
                  <tr key={r._id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text)', fontWeight: 600 }}>{r.reliefItem}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{r.quantity} {r.unit}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{r.dateGiven || '—'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{r.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Available Evacuation Centers</h3>
        {centers.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', background: 'var(--surface2)', border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--muted)' }}>
            No open evacuation centers available.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {centers.map(c => (
              <div key={c._id} style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong style={{ fontSize: 15, color: 'var(--text)' }}>{c.name}</strong>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 12, background: c.status === 'Full' ? 'rgba(220, 38, 38, 0.16)' : 'rgba(16, 185, 129, 0.16)', color: c.status === 'Full' ? 'var(--red, #dc2626)' : 'var(--green, #059669)' }}>{c.status}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  <div style={{ marginBottom: 4 }}>📍 {c.location || '—'}{c.purok ? ` (${c.purok})` : ''}</div>
                  <div style={{ marginBottom: 4 }}>👥 Occupancy: {Number(c.currentOccupants) || 0} / {Number(c.capacity) || 0}</div>
                  {(c.contactPerson || c.contactNumber) && (
                    <div>☎ {c.contactPerson || '—'}{c.contactNumber ? ` · ${c.contactNumber}` : ''}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}