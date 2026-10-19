// Aid Distribution unified workspace: top tabs over Program / Encode / Logs views.
export default function AidDistributionModule({ activeTab, onTabChange, children }) {
  const TABS = [
    { id: 'programs', label: 'Active Programs', icon: '📋' },
    { id: 'encode', label: 'Encode Distribution', icon: '✍️' },
    { id: 'logs', label: 'Distribution Logs', icon: '📜' },
  ];
  return (
    <div className="aid-workspace">
      <div
        role="tablist"
        aria-label="Aid Distribution sections"
        style={{
          display: 'flex',
          gap: '6px',
          padding: '6px',
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          marginBottom: '20px',
          maxWidth: '720px',
        }}
      >
        {TABS.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(t.id)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 14px',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 700,
                background: active ? 'var(--primary)' : 'transparent',
                color: active ? '#fff' : 'var(--muted)',
                transition: 'all 0.18s ease',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: '15px' }}>
                {t.icon}
              </span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
      <div className="aid-tab-content">{children}</div>
    </div>
  );
}