import React, { useState, useEffect } from 'react';
import { localDb as db } from '../services/db';

export default function AuditLogView() {
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditModuleFilter, setAuditModuleFilter] = useState('ALL');
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');

  // Helper para sa Action Icons at Badges (Kaakibat ng iyong CSS/UI Theme)
  const getActionMeta = (action = '') => {
    const act = action.toUpperCase();
    if (act.includes('CREATE')) {
      return { bg: 'rgba(16, 185, 129, 0.15)', bClass: 'badge-success', badge: 'CREATE', ico: '➕' };
    }
    if (act.includes('UPDATE')) {
      return { bg: 'rgba(59, 130, 246, 0.15)', bClass: 'badge-info', badge: 'UPDATE', ico: '✏️' };
    }
    if (act.includes('LOGIN')) {
      return { bg: 'rgba(139, 92, 246, 0.15)', bClass: 'badge-purple', badge: 'LOGIN', ico: '🔑' };
    }
    if (act.includes('SUBMIT') || act.includes('RESOLVE')) {
      return { bg: 'rgba(245, 158, 11, 0.15)', bClass: 'badge-warning', badge: 'ACTION', ico: '📋' };
    }
    return { bg: 'rgba(107, 114, 128, 0.15)', bClass: 'badge-secondary', badge: action, ico: '⚙️' };
  };

  // 1. Fetch Logs mula sa PouchDB
  const fetchAuditLogs = async () => {
    try {
      const res = await db.allDocs({ include_docs: true });
      const logs = res.rows
        .map((row) => row.doc)
        .filter((doc) => doc && (doc.type === 'audit_log' || doc.docType === 'audit_log'))
        .sort((a, b) => new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt));
      setAuditLogs(logs);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();

    // 2. Real-time updates kapag may nadagdag na Audit Log (mula sa Admin o Resident)
    const changes = db.changes({
      live: true,
      since: 'now',
      include_docs: true,
    });

    changes.on('change', (changeInfo) => {
      if (changeInfo.doc && (changeInfo.doc.type === 'audit_log' || changeInfo.doc.docType === 'audit_log')) {
        fetchAuditLogs();
      }
    });

    return () => changes.cancel();
  }, []);

  // 3. Filter Logic
  const filteredAuditLogs = auditLogs.filter((log) => {
    const actionMatch = auditActionFilter === 'ALL' || (log.action && log.action.includes(auditActionFilter));
    const moduleMatch = auditModuleFilter === 'ALL' || (log.module && log.module.toLowerCase() === auditModuleFilter.toLowerCase());
    
    const searchText = auditSearch.toLowerCase();
    const userString = log.user || log.actor?.username || '';
    const detailsString = log.details || '';
    const recordIdString = log.recordId || '';
    const actionString = log.action || '';
    const moduleString = log.module || '';

    const searchMatch = !auditSearch || 
      userString.toLowerCase().includes(searchText) ||
      detailsString.toLowerCase().includes(searchText) ||
      recordIdString.toLowerCase().includes(searchText) ||
      actionString.toLowerCase().includes(searchText) ||
      moduleString.toLowerCase().includes(searchText);

    return actionMatch && moduleMatch && searchMatch;
  });

  return (
    <div className="screen active">
      {/* Controls & Search Toolbar */}
      <div className="tb" style={{ flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
        <div className="sb-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            placeholder="Search user, action, module..."
            value={auditSearch}
            onChange={(e) => setAuditSearch(e.target.value)}
          />
        </div>

        <select
          className="fc"
          style={{ width: '150px' }}
          value={auditModuleFilter}
          onChange={(e) => setAuditModuleFilter(e.target.value)}
        >
          <option value="ALL">All Modules</option>
          <option value="Residents">Residents</option>
          <option value="Certificates">Certificates</option>
          <option value="Aid Distribution">Aid Distribution</option>
          <option value="Blotter">Blotter</option>
          <option value="FEEDBACK">Feedback</option>
        </select>

        <select
          className="fc"
          style={{ width: '130px' }}
          value={auditActionFilter}
          onChange={(e) => setAuditActionFilter(e.target.value)}
        >
          <option value="ALL">All Actions</option>
          <option value="CREATE">CREATE</option>
          <option value="UPDATE">UPDATE</option>
          <option value="SUBMIT">SUBMIT</option>
          <option value="ARCHIVE">ARCHIVE</option>
          <option value="APPROVE">APPROVE</option>
          <option value="LOGIN">LOGIN</option>
          <option value="SYNC">SYNC</option>
          <option value="RESOLVE">RESOLVE</option>
        </select>
      </div>

      {/* Info Header & Reset Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
          Showing <strong>{filteredAuditLogs.length}</strong> of <strong>{auditLogs.length}</strong> activity trails
          {filteredAuditLogs.length !== auditLogs.length && ' (filtered)'}
        </span>
        {(auditSearch || auditModuleFilter !== 'ALL' || auditActionFilter !== 'ALL') && (
          <button
            className="btn btn-sm btn-g"
            onClick={() => {
              setAuditSearch('');
              setAuditModuleFilter('ALL');
              setAuditActionFilter('ALL');
            }}
          >
            Reset
          </button>
        )}
      </div>

      {/* Audit Logs Item List */}
      <div className="tw" style={{ maxHeight: '60vh' }}>
        {loading ? (
          <div className="al-row" style={{ justifyContent: 'center', color: 'var(--muted)', padding: '24px' }}>
            Loading audit trails...
          </div>
        ) : filteredAuditLogs.length === 0 ? (
          <div className="al-row" style={{ justifyContent: 'center', color: 'var(--muted)', padding: '24px' }}>
            No audit logs found.
          </div>
        ) : (
          filteredAuditLogs.map((log) => {
            const meta = getActionMeta(log.action);
            const userDisplay = log.user || (log.actor ? `${log.actor.username} (${log.actor.role})` : 'System');

            return (
              <div key={log._id} className="al-row">
                <div className="al-ico" style={{ background: meta.bg }}>
                  {meta.ico}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="al-a">
                    {log.action} {log.module ? ` — ${log.module}` : ''}
                    {log.recordId && (
                      <>
                        {' · '}
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', opacity: 0.9 }}>
                          {log.recordId}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="al-d">
                    User: {userDisplay} {log.details ? ` · ${log.details}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span className={`badge ${meta.bClass}`} style={{ fontSize: '9px', marginBottom: '3px', display: 'inline-flex' }}>
                    {meta.badge}
                  </span>
                  <div className="al-t">
                    {log.timestamp
                      ? new Date(log.timestamp).toLocaleString('en-PH', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })
                      : ''}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}