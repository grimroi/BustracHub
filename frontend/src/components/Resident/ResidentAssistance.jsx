export default function ResidentAssistance({ myAssistance }) {
  const pendingCount = myAssistance.filter((a) =>
    ['pending', 'scheduled'].includes((a.status || '').toLowerCase())
  ).length;

  const completedCount = myAssistance.filter((a) =>
    ['released', 'completed'].includes((a.status || '').toLowerCase())
  ).length;

  return (
    <div className="screen active" style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}>
      {/* Page Header */}
      <div className="page-hdr" style={{ marginBottom: 16 }}>
        <div className="page-title">My Assistance</div>
        <div className="page-sub">Track your aid, relief, and beneficiary records</div>
      </div>

      {/* Stat Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {/* Total Received */}
        <div style={{ padding: '14px 10px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ color: 'var(--text)', fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
            {myAssistance.length}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 6 }}>
            Total Received
          </div>
        </div>

        {/* Pending / Scheduled */}
        <div style={{ padding: '14px 10px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ color: 'var(--amber)', fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
            {pendingCount}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 6 }}>
            Pending
          </div>
        </div>

        {/* Completed */}
        <div style={{ padding: '14px 10px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ color: '#10b981', fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
            {completedCount}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 6 }}>
            Completed
          </div>
        </div>
      </div>

      {/* Assistance History List */}
      <div className="card" style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
        <div style={{ marginBottom: 14, fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>Assistance History</div>

        {myAssistance.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '32px 20px', background: 'var(--surface2, rgba(255,255,255,0.02))',
            border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--muted)', marginTop: 8,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>No assistance records found</div>
            <div style={{ fontSize: 12, lineHeight: 1.5 }}>
              Records will appear here once the barangay admin encodes your aid distribution.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {myAssistance.map((item) => {
              const isCompleted = ['released', 'completed'].includes((item.status || '').toLowerCase());
              return (
                <div key={item._id || item.refNumber} style={{
                  background: 'var(--surface2, rgba(255,255,255,0.02))', padding: 14, borderRadius: 10, border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)', fontWeight: 700 }}>
                      {item.refNumber || item._id}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
                      padding: '2px 8px', borderRadius: 6,
                      color: isCompleted ? 'var(--green)' : 'var(--amber)',
                      background: isCompleted ? 'var(--green-bg)' : 'var(--amber-bg)',
                      border: `1px solid ${isCompleted ? 'var(--green-border)' : 'var(--amber-border)'}`,
                    }}>
                      {item.status || 'Pending'}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
                    {item.programName || item.program || item.aidType || 'Assistance Program'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.4 }}>
                    {item.description || item.details || item.notes || 'No additional details.'}
                  </div>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11,
                    color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 8,
                  }}>
                    <div>
                      Date:{" "}
                      <strong style={{ color: 'var(--text)', fontWeight: 600 }}>
                        {item.dateDistributed || item.date || item.timestamp
                          ? new Date(item.dateDistributed || item.date || item.timestamp).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric',
                            })
                          : 'N/A'}
                      </strong>
                    </div>
                    <div>
                      Amount/Item:{" "}
                      <strong style={{ color: 'var(--text)', fontWeight: 600 }}>
                        {item.amount || item.item || item.quantity || 'N/A'}
                      </strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
