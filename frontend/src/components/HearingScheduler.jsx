import { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import { forceSyncToRemote } from '../services/db';
import { createNotification } from '../services/notifications';
import { createAuditLog } from '../utils/auditLog';

const SESSION_TYPES = ['Mediation', 'Hearing', 'Arbitration', 'Clarificatory Hearing'];

const OUTCOME_OPTIONS = [
  { value: 'Ongoing Mediation', label: 'Ongoing Mediation (Patuloy na pag-uusap)', tone: 'warn' },
  { value: 'Amicable Settlement (Kasunduan)', label: 'Amicable Settlement / Kasunduan Reached', tone: 'ok' },
  { value: 'Repudiation of Settlement', label: 'Repudiation of Settlement (Binawi ang kasunduan)', tone: 'bad' },
  { value: 'Failure to Appear', label: 'Failure to Appear (Hindi sumipot)', tone: 'bad' },
  { value: 'Referred to Arbitration', label: 'Referred to Arbitration (Pangkatihan)', tone: 'warn' },
  { value: 'Dismissed / Withdrawn', label: 'Dismissed / Withdrawn (Binasura / Binawi)', tone: 'muted' },
];

const SETTLEMENT_OUTCOME = 'Amicable Settlement (Kasunduan)';
const FAILURE_OUTCOMES = ['Failure to Appear', 'Repudiation of Settlement'];
const CLOSED_STATUSES = ['Settled / Resolved', 'Settled', 'Resolved', 'Dismissed', 'Referred to PNP (CFA Issued)'];

const nowIso = () => new Date().toISOString();
const todayInput = () => new Date().toISOString().slice(0, 10);
const toKey = (date, time) => `${(date || '').slice(0, 10)}T${(time || '00:00').slice(0, 5)}`;

const readUserName = () => {
  try {
    const raw = localStorage.getItem('bustrac_user');
    const user = raw ? JSON.parse(raw) : null;
    return user?.fullName || user?.username || 'Barangay Staff';
  } catch {
    return 'Barangay Staff';
  }
};

const toneStyles = {
  ok: { background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.35)' },
  bad: { background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.35)' },
  warn: { background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.35)' },
  muted: { background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' },
  info: { background: 'rgba(79, 142, 247, 0.15)', color: 'var(--accent)', border: '1px solid rgba(79, 142, 247, 0.35)' },
};

const pill = (tone = 'muted', children) => (
  <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', ...toneStyles[tone] }}>
    {children}
  </span>
);

const sortHearings = (list) =>
  [...list].sort((a, b) => toKey(a.date, a.time).localeCompare(toKey(b.date, b.time)));

const outcomeMeta = (value) => OUTCOME_OPTIONS.find((o) => o.value === value) || null;

const statusTone = (status) => {
  if (status === 'Completed') return 'ok';
  if (status === 'Cancelled') return 'muted';
  if (status === 'No Show') return 'bad';
  return 'info';
};

export function HearingScheduler({ currentCase, db, setBlotterList, setSelectedBlotter, onPrintCFA, onNotificationCreated }) {
  const caseId = currentCase?._id || currentCase?.trackingNo || currentCase?.caseNo || currentCase?.id;
  const userName = useMemo(() => readUserName(), []);
  const complainantName = useMemo(() => {
    const c = currentCase?.complainant;
    if (!c) return currentCase?.complainantName || 'Complainant';
    if (typeof c === 'string') return c;
    return c.name || c.displayName || currentCase?.complainantName || 'Complainant';
  }, [currentCase]);
  const respondentName = useMemo(() => {
    const r = currentCase?.respondent;
    if (!r) return currentCase?.respondentName || 'Respondent';
    if (typeof r === 'string') return r;
    return r.name || r.displayName || currentCase?.respondentName || 'Respondent';
  }, [currentCase]);

  const [form, setForm] = useState({ date: todayInput(), time: '09:00', sessionType: 'Mediation' });
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [outcomeDraft, setOutcomeDraft] = useState(null);

  const hearings = useMemo(() => {
    const list = Array.isArray(currentCase?.hearings)
      ? currentCase.hearings
      : (Array.isArray(currentCase?.rawDoc?.hearings) ? currentCase.rawDoc.hearings : []);
    return sortHearings(list);
  }, [currentCase]);

  const isClosed = CLOSED_STATUSES.includes(currentCase?.status) || currentCase?.cfaIssued;
  const completed = hearings.filter((h) => h.status === 'Completed');
  const upcoming = hearings.filter((h) => h.status === 'Scheduled' && toKey(h.date, h.time) >= toKey(todayInput(), '00:00'));
  const mediationFailed = hearings.some((h) => FAILURE_OUTCOMES.includes(h.outcome))
    || Number(currentCase?.summonCount || 0) >= 3
    || (completed.length >= 3 && !hearings.some((h) => h.outcome === SETTLEMENT_OUTCOME));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!db || !caseId) return;
      try {
        const fresh = await db.get(caseId);
        if (cancelled) return;
        if (JSON.stringify(fresh.hearings || []) !== JSON.stringify(currentCase?.hearings || [])) {
          setSelectedBlotter?.(fresh);
          localStorage.setItem('active_blotter_data', JSON.stringify(fresh));
        }
      } catch {
        /* offline / not local yet - rely on in-memory state */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const showToast = (icon, title) => Swal.fire({ icon, title, timer: 2600, showConfirmButton: false, toast: true, position: 'top-end' });

  const persistCase = async (mutator, audit) => {
    if (!db) throw new Error('Local database is unavailable.');
    if (!caseId) throw new Error('This case has no valid ID yet.');
    const readLatest = async () => {
      try {
        return await db.get(caseId);
      } catch (err) {
        if (err?.status !== 404 && err?.name !== 'not_found') throw err;
        const all = await db.allDocs({ include_docs: true });
        const row = all.rows.find((r) => r.doc && (r.doc.trackingNo === caseId || r.doc.caseNo === caseId || r.doc.id === caseId));
        if (!row) throw new Error(`Case ${caseId} is not saved locally.`, { cause: err });
        return row.doc;
      }
    };

    let updated = mutator({ ...(await readLatest()) });
    let saved = false;
    let attempts = 0;
    let res;
    while (attempts < 3 && !saved) {
      try {
        res = await db.put(updated);
        saved = true;
      } catch (err) {
        if (err?.status === 409 || err?.name === 'conflict') {
          attempts += 1;
          updated = mutator({ ...(await readLatest()) });
        } else {
          throw err;
        }
      }
    }
    if (!saved) throw new Error('Could not resolve a conflicting edit. Please retry.');
    updated._rev = res.rev;

    setSelectedBlotter?.(updated);
    localStorage.setItem('active_blotter_data', JSON.stringify(updated));
    setBlotterList?.((prev) => prev.map((item) => (item._id === updated._id ? { ...item, ...updated } : item)));

    if (typeof forceSyncToRemote === 'function') {
      try { await forceSyncToRemote(); } catch { /* will retry on next sync cycle */ }
    }
    if (audit) {
      try {
        await createAuditLog({ action: audit.action, module: 'BLOTTER', recordId: updated._id, details: audit.details });
      } catch { /* audit is best-effort */ }
    }
    return updated;
  };

  const notifyAdmin = async (payload) => {
    try {
      await createNotification({ for: 'admin', link: 'blotter-manage', refId: caseId, ...payload });
      onNotificationCreated?.();
    } catch { /* notifications are best-effort and never block the write */ }
  };

  const pushHistory = (doc, entry) => {
    doc.history = Array.isArray(doc.history) ? doc.history : [];
    doc.history.push({ date: nowIso(), performedBy: userName, ...entry });
    return doc;
  };

  const validateWeekday = (dateStr) => {
    const day = new Date(`${dateStr}T00:00:00`).getDay();
    return day !== 0 && day !== 6;
  };

  const handleAddHearing = async () => {
    if (!form.date) {
      showToast('warning', 'Please choose a hearing date.');
      return;
    }
    if (!validateWeekday(form.date)) {
      showToast('warning', 'Ang Barangay Hall ay sarado tuwing Sabado at Linggo. Pumili ng Lunes–Biyernes.');
      return;
    }
    setSaving(true);
    try {
      const record = {
        id: `HRG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sessionType: form.sessionType || 'Mediation',
        date: form.date,
        time: form.time || '09:00',
        status: 'Scheduled',
        outcome: '',
        outcomeNotes: '',
        scheduledBy: userName,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      const updated = await persistCase((doc) => {
        const list = sortHearings([...(Array.isArray(doc.hearings) ? doc.hearings : []), record]);
        doc.hearings = list;
        const next = list.find((h) => h.status === 'Scheduled' && toKey(h.date, h.time) >= toKey(todayInput(), '00:00'));
        doc.nextHearingDate = next ? next.date : '';
        if (!doc.status || doc.status === 'Open' || doc.status === 'Pending') doc.status = 'Under Mediation';
        doc.updatedAt = nowIso();
        return pushHistory(doc, {
          action: 'SCHEDULE_HEARING',
          status: doc.status,
          scheduleDate: `${record.date}T${record.time}`,
          notes: `Scheduled ${record.sessionType} on ${record.date} ${record.time}.`,
        });
      }, { action: 'SCHEDULE_HEARING', details: `Scheduled ${record.sessionType} for ${caseId} on ${record.date} ${record.time}.` });
      await notifyAdmin({
        category: 'hearing',
        title: 'Hearing scheduled',
        body: `${complainantName} vs ${respondentName}: ${record.sessionType} set for ${new Date(`${record.date}T${record.time}`).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}.`,
      });
      showToast('success', `Hearing scheduled for ${updated.nextHearingDate || record.date}.`);
      setShowAdd(false);
      setForm({ date: todayInput(), time: '09:00', sessionType: 'Mediation' });
    } catch (err) {
      showToast('error', err.message || 'Failed to save the hearing.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveHearing = async (hearing) => {
    const confirmed = await Swal.fire({
      icon: 'warning',
      title: 'Remove this hearing?',
      text: `${hearing.sessionType} on ${hearing.date} ${hearing.time}`,
      showCancelButton: true,
      confirmButtonText: 'Remove',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
      focusCancel: true,
    });
    if (!confirmed.isConfirmed) return;
    setSaving(true);
    try {
      await persistCase((doc) => {
        const list = (Array.isArray(doc.hearings) ? doc.hearings : []).filter((h) => h.id !== hearing.id);
        doc.hearings = sortHearings(list);
        const next = doc.hearings.find((h) => h.status === 'Scheduled' && toKey(h.date, h.time) >= toKey(todayInput(), '00:00'));
        doc.nextHearingDate = next ? next.date : '';
        doc.updatedAt = nowIso();
        return pushHistory(doc, { action: 'REMOVE_HEARING', status: doc.status, notes: `Removed hearing ${hearing.id}.` });
      }, { action: 'REMOVE_HEARING', details: `Removed hearing ${hearing.id} for ${caseId}.` });
      await notifyAdmin({
        category: 'hearing',
        title: 'Hearing removed',
        body: `${complainantName} vs ${respondentName}: the ${hearing.sessionType} on ${hearing.date} was removed.`,
      });
      showToast('success', 'Hearing removed.');
    } catch (err) {
      showToast('error', err.message || 'Failed to remove the hearing.');
    } finally {
      setSaving(false);
    }
  };

  const openOutcome = (hearing) => {
    setOutcomeDraft({
      id: hearing.id,
      outcome: hearing.outcome || 'Ongoing Mediation',
      notes: hearing.outcomeNotes || '',
      nextDate: hearing.nextDate || '',
    });
  };

  const handleSaveOutcome = async () => {
    if (!outcomeDraft) return;
    if (!outcomeDraft.outcome) {
      showToast('warning', 'Pumili ng outcome ng session.');
      return;
    }
    setSaving(true);
    try {
      const settled = outcomeDraft.outcome === SETTLEMENT_OUTCOME;
      const updated = await persistCase((doc) => {
        doc.hearings = (Array.isArray(doc.hearings) ? doc.hearings : []).map((h) => (
          h.id === outcomeDraft.id
            ? {
              ...h,
              status: 'Completed',
              outcome: outcomeDraft.outcome,
              outcomeNotes: outcomeDraft.notes || '',
              nextDate: outcomeDraft.nextDate || '',
              recordedBy: userName,
              updatedAt: nowIso(),
            }
            : h
        ));
        if (settled) {
          doc.status = 'Settled / Resolved';
          doc.resolution = outcomeDraft.notes || 'Amicable Settlement / Kasunduan reached.';
          doc.agreement = {
            reachedAt: nowIso(),
            terms: outcomeDraft.notes || '',
            hearingId: outcomeDraft.id,
            recordedBy: userName,
          };
          doc.resolvedAt = nowIso();
          doc.nextHearingDate = '';
        } else {
          if (outcomeDraft.nextDate) doc.nextHearingDate = outcomeDraft.nextDate;
          if (!doc.status || doc.status === 'Open' || doc.status === 'Pending') doc.status = 'Under Mediation';
        }
        doc.updatedAt = nowIso();
        return pushHistory(doc, {
          action: settled ? 'RECORD_SETTLEMENT' : 'RECORD_HEARING_OUTCOME',
          status: doc.status,
          notes: `${outcomeDraft.outcome}${outcomeDraft.notes ? ` — ${outcomeDraft.notes}` : ''}`,
        });
      }, {
        action: settled ? 'RECORD_SETTLEMENT' : 'RECORD_HEARING_OUTCOME',
        details: `Hearing ${outcomeDraft.id} for ${caseId}: ${outcomeDraft.outcome}.`,
      });
      await notifyAdmin({
        category: settled ? 'settlement' : 'hearing',
        title: settled ? 'Amicable settlement recorded' : 'Hearing outcome recorded',
        body: `${complainantName} vs ${respondentName}: ${outcomeDraft.outcome}${outcomeDraft.notes ? ` — ${outcomeDraft.notes}` : ''}`,
      });
      showToast('success', settled ? 'Amicable settlement recorded.' : 'Session outcome saved.');
      setOutcomeDraft(null);
      if (settled && typeof onPrintCFA === 'function') {
        const printSettlement = await Swal.fire({
          icon: 'question',
          title: 'Print Certificate of Settlement?',
          text: 'Nais mo bang i-print ang Katibayan ng Kasunduan?',
          showCancelButton: true,
          confirmButtonText: 'Print',
          cancelButtonText: 'Later',
        });
        if (printSettlement.isConfirmed) onPrintCFA(updated);
      }
    } catch (err) {
      showToast('error', err.message || 'Failed to save the outcome.');
    } finally {
      setSaving(false);
    }
  };

  const handleIssueCFA = async () => {
    const confirmed = await Swal.fire({
      icon: 'warning',
      title: 'Issue Certificate to File Action?',
      html: 'Ang CFA ay inilalabas kapag nabigo ang mediation. Ang kaso ay ire-refer na sa PNP o korte.',
      showCancelButton: true,
      confirmButtonText: 'Issue CFA',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
      focusCancel: true,
    });
    if (!confirmed.isConfirmed) return;
    setSaving(true);
    try {
      const updated = await persistCase((doc) => {
        doc.cfaIssued = true;
        doc.cfaIssuedAt = nowIso();
        doc.status = 'Referred to PNP (CFA Issued)';
        doc.updatedAt = nowIso();
        return pushHistory(doc, { action: 'ISSUE_CFA', status: doc.status, notes: 'Certificate to File Action issued after failed mediation.' });
      }, { action: 'ISSUE_CFA', details: `Issued CFA for ${caseId}.` });
      await notifyAdmin({
        category: 'cfa',
        title: 'Certificate to File Action issued',
        body: `${complainantName} vs ${respondentName}: mediation failed — the case was referred to PNP / court.`,
      });
      showToast('success', 'CFA issued. Opening the print preview...');
      if (typeof onPrintCFA === 'function') onPrintCFA(updated);
    } catch (err) {
      showToast('error', err.message || 'Failed to issue the CFA.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: 'Total Sessions', value: hearings.length, tone: 'info' },
          { label: 'Completed', value: completed.length, tone: 'ok' },
          { label: 'Upcoming', value: upcoming.length, tone: 'warn' },
          { label: 'Summons', value: `${Number(currentCase?.summonCount || 0)} / 3`, tone: 'muted' },
        ].map((stat) => (
          <div key={stat.label} style={{ padding: 10, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>{stat.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
          Hearing &amp; Mediation Schedule
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', marginTop: 2 }}>
            Lupon Tagapamayapa sessions — saved offline and synced automatically.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-p"
          onClick={() => setShowAdd((open) => !open)}
          disabled={isClosed || saving}
          style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, opacity: isClosed ? 0.6 : 1, cursor: isClosed ? 'not-allowed' : 'pointer' }}
        >
          {showAdd ? 'Cancel' : '+ Add Hearing'}
        </button>
      </div>

      {/* Add hearing form */}
      {showAdd && !isClosed && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, padding: 14, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div className="fg">
            <label className="fl" style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Hearing Date</label>
            <input type="date" className="fc" value={form.date} min={todayInput()} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="fg">
            <label className="fl" style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Time</label>
            <input type="time" className="fc" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
          </div>
          <div className="fg">
            <label className="fl" style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Session Type</label>
            <select className="fc" value={form.sessionType} onChange={(e) => setForm((f) => ({ ...f, sessionType: e.target.value }))}>
              {SESSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="button" className="btn btn-p" onClick={handleAddHearing} disabled={saving} style={{ width: '100%', padding: '9px 12px', fontSize: 12, fontWeight: 700 }}>
              {saving ? 'Saving…' : 'Save Hearing'}
            </button>
          </div>
          <div style={{ gridColumn: '1 / -1', fontSize: 10, color: 'var(--muted)' }}>
            Weekdays only (Mon–Fri). Saves to PouchDB locally and syncs when online.
          </div>
        </div>
      )}

      {/* Hearings list */}
      {hearings.length === 0 ? (
        <div style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--muted)', fontSize: 12, background: 'var(--surface2)', borderRadius: 10, border: '1px dashed var(--border)' }}>
          No hearing sessions scheduled yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {hearings.map((hearing) => {
            return (
              <div key={hearing.id} style={{ padding: 14, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)', opacity: hearing.status === 'Cancelled' ? 0.7 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                      {hearing.sessionType} · {new Date(`${hearing.date}T${hearing.time}`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · {hearing.time}
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {pill(statusTone(hearing.status), hearing.status)}
                      {hearing.outcome && pill(outcomeMeta(hearing.outcome)?.tone || 'muted', hearing.outcome)}
                      {hearing.status === 'Scheduled' && toKey(hearing.date, hearing.time) < toKey(todayInput(), '00:00') && pill('bad', 'Past due')}
                    </div>
                    {hearing.outcomeNotes && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>{hearing.outcomeNotes}</div>
                    )}
                    {hearing.nextDate && (
                      <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 6 }}>Next session: {hearing.nextDate}</div>
                    )}
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
                      {hearing.scheduledBy ? `Scheduled by ${hearing.scheduledBy}` : ''}{hearing.recordedBy ? ` • Outcome by ${hearing.recordedBy}` : ''}
                    </div>
                  </div>
                  {!isClosed && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button type="button" className="btn" onClick={() => openOutcome(hearing)} disabled={saving} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>
                        {hearing.outcome ? 'Update Outcome' : 'Record Outcome'}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => handleRemoveHearing(hearing)}
                        disabled={saving}
                        aria-label={`Remove hearing on ${hearing.date}`}
                        style={{ padding: '6px 10px', fontSize: 12, fontWeight: 700, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CFA workflow */}
      <div style={{ padding: 14, borderRadius: 10, border: currentCase?.cfaIssued ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(239, 68, 68, 0.35)', background: currentCase?.cfaIssued ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
              Certificate to File Action (CFA)
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, maxWidth: 520 }}>
              {currentCase?.cfaIssued
                ? `CFA issued${currentCase?.cfaIssuedAt ? ` on ${new Date(currentCase.cfaIssuedAt).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}. Case referred to PNP / court.`
                : mediationFailed
                  ? 'Mediation appears to have failed. You may now issue the CFA to refer the case to PNP / court.'
                  : 'Inilalabas lamang kapag nabigo ang mediation (e.g. hindi sumipot o walang kasunduan).'}
            </div>
          </div>
          {currentCase?.cfaIssued ? (
            <button type="button" className="btn" onClick={() => onPrintCFA?.(currentCase)} style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>
              Reprint CFA
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={handleIssueCFA}
              disabled={saving || isClosed}
              style={{ padding: '9px 16px', fontSize: 12, fontWeight: 800, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: saving || isClosed ? 'not-allowed' : 'pointer', opacity: saving || isClosed ? 0.6 : 1 }}
            >
              {saving ? 'Processing…' : 'Issue CFA & Print'}
            </button>
          )}
        </div>
      </div>

      {/* Outcome modal */}
      {outcomeDraft && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 }}
          onClick={() => !saving && setOutcomeDraft(null)}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 460, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 22 }}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>Record Session Outcome</h3>
            <div className="fg" style={{ marginBottom: 14 }}>
              <label className="fl" style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Outcome / Kasunduan</label>
              <select
                className="fc"
                value={outcomeDraft.outcome}
                onChange={(e) => setOutcomeDraft((d) => ({ ...d, outcome: e.target.value }))}
                style={{ width: '100%' }}
              >
                {OUTCOME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="fg" style={{ marginBottom: 14 }}>
              <label className="fl" style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                {outcomeDraft.outcome === SETTLEMENT_OUTCOME ? 'Terms of Settlement (Kasunduan)' : 'Session Notes'}
              </label>
              <textarea
                className="fc"
                rows={4}
                value={outcomeDraft.notes}
                onChange={(e) => setOutcomeDraft((d) => ({ ...d, notes: e.target.value }))}
                placeholder={outcomeDraft.outcome === SETTLEMENT_OUTCOME ? 'Isulat ang napagkasunduan ng mga panig…' : 'Maikling tala sa naganap na session…'}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>
            {outcomeDraft.outcome !== SETTLEMENT_OUTCOME && (
              <div className="fg" style={{ marginBottom: 14 }}>
                <label className="fl" style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Next Hearing Date (optional)</label>
                <input
                  type="date"
                  className="fc"
                  value={outcomeDraft.nextDate}
                  min={todayInput()}
                  onChange={(e) => setOutcomeDraft((d) => ({ ...d, nextDate: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button type="button" className="btn" onClick={() => setOutcomeDraft(null)} disabled={saving} style={{ flex: 1, padding: 10, borderRadius: 8, background: 'var(--border)', color: 'var(--text)', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button" className="btn btn-p" onClick={handleSaveOutcome} disabled={saving} style={{ flex: 1, padding: 10, borderRadius: 8, fontWeight: 700 }}>
                {saving ? 'Saving…' : 'Save Outcome'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HearingScheduler;
