import React, { useState, useEffect } from 'react';
import { localDb as db } from '../services/db';
import { exportToExcel } from '../utils/excelExporter';

const ActionIcon = ({ type }) => {
  const paths = {
    create: <path d="M12 5v14M5 12h14" />,
    update: <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />,
    login: (
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
    action: <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
    default: <circle cx="12" cy="12" r="3" />,
  };
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[type]}
    </svg>
  );
};

export default function AuditLogView() {
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditModuleFilter, setAuditModuleFilter] = useState('ALL');
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const setupIndex = async () => {
      try {
        await db.createIndex({ index: { fields: ['type', 'timestamp'] } });
      } catch (err) {
        console.warn('Index creation skipped or failed:', err.message);
      }
    };
    setupIndex();
  }, []);

  const fetchAuditLogs = async () => {
    try {
      const res = await db.allDocs({ include_docs: true });
      const logs = res.rows
        .map((row) => row.doc)
        .filter((doc) => doc && (doc.type === 'audit_log' || doc.docType === 'audit_log'))
        .sort((a, b) => {
          const dateA = new Date(a.timestamp || a.createdAt || 0).getTime();
          const dateB = new Date(b.timestamp || b.createdAt || 0).getTime();
          return dateB - dateA;
        });
      setAuditLogs(logs);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();

    const changes = db.changes({ live: true, since: 'now', include_docs: true });
    changes.on('change', (changeInfo) => {
      if (changeInfo.doc && (changeInfo.doc.type === 'audit_log' || changeInfo.doc.docType === 'audit_log')) {
        setAuditLogs((prev) => {
          if (prev.some(log => log._id === changeInfo.doc._id)) return prev;
          return [changeInfo.doc, ...prev];
        });
      }
    });
    return () => changes.cancel();
  }, []);

  const filteredAuditLogs = auditLogs.filter((log) => {
    const actionMatch = auditActionFilter === 'ALL' || (log.action && log.action.includes(auditActionFilter));
    const moduleMatch = auditModuleFilter === 'ALL' || (log.module && log.module.toLowerCase() === auditModuleFilter.toLowerCase());
    const searchText = auditSearch.toLowerCase();
    const userString = (log.user || log.actor?.username || '').toLowerCase();
    const detailsString = (log.details || '').toLowerCase();
    const recordIdString = (log.recordId || '').toLowerCase();
    const actionString = (log.action || '').toLowerCase();
    const moduleString = (log.module || '').toLowerCase();
    const searchMatch = !auditSearch || userString.includes(searchText) || detailsString.includes(searchText) || recordIdString.includes(searchText) || actionString.includes(searchText) || moduleString.includes(searchText);
    return actionMatch && moduleMatch && searchMatch;
  });

  const getActionMeta = (action = '') => {
    const act = action.toUpperCase();
    if (act.includes('CREATE')) return { bg: 'rgba(16, 185, 129, 0.15)', bClass: 'badge-success', badge: 'CREATE', icon: 'create' };
    if (act.includes('UPDATE')) return { bg: 'rgba(59, 130, 246, 0.15)', bClass: 'badge-info', badge: 'UPDATE', icon: 'update' };
    if (act.includes('LOGIN')) return { bg: 'rgba(139, 92, 246, 0.15)', bClass: 'badge-purple', badge: 'LOGIN', icon: 'login' };
    if (act.includes('SUBMIT') || act.includes('RESOLVE') || act.includes('RELEASE')) return { bg: 'rgba(245, 158, 11, 0.15)', bClass: 'badge-warning', badge: 'ACTION', icon: 'action' };
    return { bg: 'rgba(107, 114, 128, 0.15)', bClass: 'badge-secondary', badge: action, icon: 'default' };
  };

  return (
    <div className="screen active">
      <div className="tb" style={{ flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
        <div className="sb-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input placeholder="Search user, action, module..." value={auditSearch} onChange={(e) => setAuditSearch(e.target.value)} />
        </div>
        <select className="fc" style={{ width: '150px' }} value={auditModuleFilter} onChange={(e) => setAuditModuleFilter(e.target.value)}>
          <option value="ALL">All Modules</option>
          <option value="RESIDENTS">Residents</option>
          <option value="CERTIFICATES">Certificates</option>
          <option value="AID DISTRIBUTION">Aid Distribution</option>
          <option value="BLOTTER">Blotter</option>
          <option value="FEEDBACK">Feedback</option>
        </select>
        <select className="fc" style={{ width: '130px' }} value={auditActionFilter} onChange={(e) => setAuditActionFilter(e.target.value)}>
          <option value="ALL">All Actions</option>
          <option value="CREATE">CREATE</option>
          <option value="UPDATE">UPDATE</option>
          <option value="SUBMIT">SUBMIT</option>
          <option value="ARCHIVE">ARCHIVE</option>
          <option value="APPROVE">APPROVE</option>
          <option value="LOGIN">LOGIN</option>
          <option value="RELEASE">RELEASE</option>
          <option value="RESOLVE">RESOLVE</option>
        </select>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
          Showing <strong>{filteredAuditLogs.length}</strong> of <strong>{auditLogs.length}</strong> recent activity trails {filteredAuditLogs.length !== auditLogs.length && ' (filtered)'}
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {(auditSearch || auditModuleFilter !== 'ALL' || auditActionFilter !== 'ALL') && (
            <button className="btn btn-sm btn-g" onClick={() => { setAuditSearch(''); setAuditModuleFilter('ALL'); setAuditActionFilter('ALL'); }}>
              Reset
            </button>
          )}
          <button
            className="btn btn-sm btn-p"
            disabled={isExporting}
            onClick={async () => {
              setIsExporting(true);
              try {
                const res = await db.allDocs({ include_docs: true });
                const allLogs = res.rows
                  .map((row) => row.doc)
                  .filter((doc) => doc && (doc.type === 'audit_log' || doc.docType === 'audit_log'))
                  .sort((a, b) => new Date(b.timestamp || b.createdAt || 0).getTime() - new Date(a.timestamp || a.createdAt || 0).getTime());

                const exportData = allLogs.map(log => ({
                  'Timestamp': log.timestamp ? new Date(log.timestamp).toLocaleString('en-PH') : 'N/A',
                  'Action': log.action || 'N/A',
                  'Module': log.module || 'N/A',
                  'Record ID': log.recordId || 'N/A',
                  'User': log.user || (log.actor ? log.actor.username : 'System'),
                  'Details': log.details || 'N/A'
                }));
                exportToExcel(exportData, `BustracHub_AuditLog_${new Date().toISOString().split('T')[0]}.xlsx`, 'AuditLog');
              } catch (err) {
                console.error('Export failed:', err);
              showToast('error', 'Failed to export audit logs.');
              } finally {
                setIsExporting(false);
              }
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: isExporting ? 0.7 : 1 }}
          >
            {isExporting ? '⏳ Preparing Excel...' : '📊 Export All Logs'}
          </button>
        </div>
      </div>

      <div className="tw" style={{ maxHeight: '60vh' }}>
        {loading ? (
          <div className="al-row" style={{ justifyContent: 'center', color: 'var(--muted)', padding: '24px' }}>Loading audit trails...</div>
        ) : filteredAuditLogs.length === 0 ? (
          <div className="al-row" style={{ justifyContent: 'center', color: 'var(--muted)', padding: '24px' }}>No audit logs found.</div>
        ) : (
          filteredAuditLogs.map((log) => {
            const meta = getActionMeta(log.action);
            const userDisplay = log.user || (log.actor ? `${log.actor.username} (${log.actor.role})` : 'System');
            return (
              <div key={log._id} className="al-row">
                <div className="al-ico" style={{ background: meta.bg }}>
                  <ActionIcon type={meta.icon} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="al-a">
                    {log.action} {log.module ? ` — ${log.module}` : ''}
                    {log.recordId && (
                      <> {' · '} <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', opacity: 0.9 }}>{log.recordId}</span> </>
                    )}
                  </div>
                  <div className="al-d" style={{ wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: '1.4', marginTop: '4px', fontSize: '12px', color: 'var(--muted)' }}>
                    User: {userDisplay} {log.details ? ` · ${log.details}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span className={`badge ${meta.bClass}`} style={{ fontSize: '9px', marginBottom: '3px', display: 'inline-flex' }}>
                    {meta.badge}
                  </span>
                  <div className="al-t">
                    {log.timestamp ? new Date(log.timestamp).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
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