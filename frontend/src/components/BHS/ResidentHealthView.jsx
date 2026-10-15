import React, { useEffect, useState } from 'react';
import { localDb as db } from '../../services/db';

const cardStyle = {
  padding: 16,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  marginBottom: 14,
};

const thStyle = { padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', background: 'var(--surface2)' };
const tdStyle = { padding: '8px 10px', fontSize: 13, color: 'var(--text)', borderTop: '1px solid var(--border)' };

export default function ResidentHealthView({ loggedInUser }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await db.allDocs({ include_docs: true });
        const residentId = loggedInUser?.residentId;
        const fullName = loggedInUser?.fullName || `${loggedInUser?.firstName || ''} ${loggedInUser?.lastName || ''}`.trim();
        const list = res.rows
          .map((r) => r.doc)
          .filter((d) => d && d.type === 'health_record' && !d._deleted)
          .filter((d) => (residentId && d.residentId === residentId) || (fullName && d.residentName === fullName))
          .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
        setRecords(list);
      } catch (err) {
        console.error('Failed to load health records:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [loggedInUser]);

  const immunizations = records.filter((r) => (r.recordType || r.type) === 'child');
const prenatal = records.filter((r) => (r.recordType || r.type) === 'mother');
const medicines = records.filter((r) => (r.recordType || r.type) === 'senior');

  const statBadge = (label, value, color) => (
    <div style={{ flex: '1 1 140px', padding: 12, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: `var(--${color})` }}>{value}</div>
    </div>
  );

  return (
    <div className="screen active">
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>My Health Records</h2>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--muted)' }}>Immunizations, prenatal care, and medicines received</p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        {statBadge('Immunizations', immunizations.length, 'accent')}
        {statBadge('Prenatal', prenatal.length, 'teal')}
        {statBadge('Medicines', medicines.length, 'green')}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading...</div>
      ) : (
        <>
          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Immunizations</h3>
            {immunizations.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>No immunization records yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Vaccine</th>
                      <th style={thStyle}>Dose</th>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Next Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {immunizations.map((r) => (
                      <tr key={r._id}>
                        <td style={tdStyle}>{r.vaccineType || '—'}</td>
                        <td style={tdStyle}>{r.doseNo ?? '—'}</td>
                        <td style={tdStyle}>{r.dateAdministered || '—'}</td>
                        <td style={tdStyle}>{r.nextDueDate || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Prenatal Check-ups</h3>
            {prenatal.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>No prenatal records yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>LMP</th>
                      <th style={thStyle}>EDD</th>
                      <th style={thStyle}>Weeks</th>
                      <th style={thStyle}>BP</th>
                      <th style={thStyle}>Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prenatal.map((r) => (
                      <tr key={r._id}>
                        <td style={tdStyle}>{r.lmp || '—'}</td>
                        <td style={tdStyle}>{r.edd || '—'}</td>
                        <td style={tdStyle}>{r.gestationalWeeks ?? '—'}</td>
                        <td style={tdStyle}>{r.bp || '—'}</td>
                        <td style={tdStyle}>{r.weight ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Senior Medicines</h3>
            {medicines.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>No medicine records yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Medicine</th>
                      <th style={thStyle}>Quantity</th>
                      <th style={thStyle}>Date Given</th>
                      <th style={thStyle}>Condition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medicines.map((r) => (
                      <tr key={r._id}>
                        <td style={tdStyle}>{r.medicineName || '—'}</td>
                        <td style={tdStyle}>{r.quantity ?? '—'}</td>
                        <td style={tdStyle}>{r.dateGiven || '—'}</td>
                        <td style={tdStyle}>{r.condition || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
} 