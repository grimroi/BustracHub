// src/components/screens/ResidentsScreen.jsx
import React from 'react';

const ResidentsScreen = React.memo(function ResidentsScreen({
  // Data
  residentsList,
  filteredResidents,
  sortedFilteredResidents,
  isResidentsLoading,
  viewMode,
  setViewMode,           // ✅ IDAGDAG
  role,

  // Filters
  searchTerm, setSearchTerm,
  purokFilter, setPurokFilter,
  genderFilter, setGenderFilter,
  residentSort,

  // Selection
  selectedResidents, setSelectedResidents,

  // Bulk actions
  showBulkDropdown, setShowBulkDropdown,

  // Handlers
  handleResidentSort,
  handleStartEditResident,
  handleArchiveResident,
  handleGenerateCredentials,
  setSelectedResidentId,
  setSelectedHouseholdId,
  setShowAddResidentModal,
  setEditingResidentId,
  setResidentForm,
  setHouseholdAssignmentMode,
  setHouseholdForm,

  // Helpers
  EMPTY_HOUSEHOLD,
  EMPTY_RESIDENT,
  showToast,
  nav,
  exportToExcel,

  // ✅ Services (para sa restore handler)
  db,
  createAuditLog,
  fetchResidents,
}) {
  return (
    <div className="screen active">
      {/* ── View Mode Tabs ── */}
      <div className="res-view-tabs">
        <button
          className={`btn ${viewMode === 'active' ? 'btn-p' : 'btn-g'}`}
          onClick={() => setViewMode('active')}
        >
          Active Residents
        </button>
        <button
          className={`btn ${viewMode === 'archived' ? 'btn-p' : 'btn-g'}`}
          onClick={() => setViewMode('archived')}
        >
          Archived
        </button>
      </div>

      {/* ── Search & Filter Bar ── */}
      <div className="res-filter-bar">
        <div className="res-filter-group">
          <div className="sb-box res-search-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              placeholder="Search by name, purok, Resident ID, or RBI ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="fc res-filter-select"
            value={purokFilter}
            onChange={(e) => setPurokFilter(e.target.value)}
          >
            <option value="All Puroks">All Puroks</option>
            <option value="Purok 1">Purok 1</option>
            <option value="Purok 2">Purok 2</option>
            <option value="Purok 3">Purok 3</option>
            <option value="Purok 4">Purok 4</option>
            <option value="Purok 5">Purok 5</option>
          </select>
          <select
            className="fc res-filter-select"
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
          >
            <option value="All Gender">All Gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="LGBTQ+">LGBTQ+</option>
            <option value="Non-binary">Non-binary</option>
            <option value="Transgender">Transgender</option>
            <option value="Prefer not to say">Prefer not to say</option>
          </select>
        </div>
        <button
          className="btn btn-p res-add-btn"
          onClick={() => {
            setEditingResidentId(null);
            setResidentForm(EMPTY_RESIDENT);
            setHouseholdAssignmentMode('existing');
            setHouseholdForm(EMPTY_HOUSEHOLD);
            setShowAddResidentModal(true);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add New Resident
        </button>
      </div>

      {/* ── Bulk Actions Bar ── */}
      {selectedResidents.length > 0 && (
        <div className="res-bulk-bar">
          <div className="res-bulk-info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
            <span>
              Selected: <strong>{selectedResidents.length}</strong>
              {selectedResidents.length === 1 ? ' resident' : ' residents'}
            </span>
          </div>
          <div className="res-bulk-actions">
            <button
              className="btn btn-p btn-sm res-bulk-toggle"
              onClick={() => setShowBulkDropdown(!showBulkDropdown)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                <path d="M12 2v2" /><path d="M12 18v2" />
                <path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" />
                <path d="M2 12h2" /><path d="M20 12h2" />
                <path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" />
              </svg>
              Bulk Actions
              <span className="res-bulk-arrow">{showBulkDropdown ? '▲' : '▼'}</span>
            </button>
            <button
              className="btn btn-g btn-sm"
              onClick={() => { setSelectedResidents([]); setShowBulkDropdown(false); }}
            >
              Cancel
            </button>

            {showBulkDropdown && (
              <div className="res-bulk-dropdown">
                <button className="bulk-menu-item" onClick={() => { nav('aid-encode'); setShowBulkDropdown(false); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </svg>
                  Encode to Aid Program
                </button>
                <button className="bulk-menu-item" onClick={() => { nav('cert-print'); setShowBulkDropdown(false); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" /><path d="M12 18v-6" /><path d="M9 15h6" />
                  </svg>
                  Prepare Bulk Certificates
                </button>
                <div className="section-divider" />
                <button
                  className="bulk-menu-item bulk-menu-export"
                  onClick={() => {
                    const selectedData = residentsList.filter((r) => selectedResidents.includes(r.id));
                    const csvHeaders = "Resident ID,RBI ID,Name,Purok,Age,Civil Status,Voter\n";
                    const csvRows = selectedData.map((r) =>
                      `"${r.id}","${r.rbiId || ''}","${r.name}","${r.purok}",${r.age},"${r.civilStatus}","${r.voter ? 'Yes' : 'No'}"`
                    ).join("\n");
                    const blob = new Blob([csvHeaders + csvRows], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `Bustrac_Selected_Residents_${new Date().toISOString().slice(0, 10)}.csv`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    setShowBulkDropdown(false);
                    setSelectedResidents([]);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <path d="M7 10l5 5 5-5" /><path d="M12 15v-6" />
                  </svg>
                  Export to CSV
                </button>
                <button
                  className="bulk-menu-item bulk-menu-excel"
                  onClick={() => {
                    const selectedData = residentsList.filter((r) => selectedResidents.includes(r.id));
                    const rows = selectedData.map((r) => ({
                      'Resident ID': r.id,
                      'RBI ID': r.rbiId || '',
                      'Name': r.name,
                      'Purok': r.purok,
                      'Age': r.age,
                      'Civil Status': r.civilStatus,
                      'Voter': r.voter ? 'Yes' : 'No',
                    }));
                    exportToExcel(rows, `Bustrac_Residents_${new Date().toISOString().slice(0, 10)}`);
                    setShowBulkDropdown(false);
                    setSelectedResidents([]);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <path d="M8 13h2v6H8z" /><path d="M12 15h2v4h-2z" /><path d="M16 11h2v8h-2z" />
                  </svg>
                  Export to Excel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Residents Table ── */}
      <div className="tw res-table-wrap">
        <table className="res-table">
          <thead>
            <tr>
              <th className="res-th-checkbox">
                <input
                  type="checkbox"
                  checked={
                    sortedFilteredResidents.length > 0 &&
                    sortedFilteredResidents.every((r) => selectedResidents.includes(r.id))
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      const allVisibleIds = sortedFilteredResidents.map((r) => r.id);
                      setSelectedResidents(allVisibleIds);
                      showToast(`Selected ${allVisibleIds.length} resident(s) on this page.`, 'success');
                    } else {
                      setSelectedResidents([]);
                      showToast('Selection cleared.', 'info');
                    }
                  }}
                />
              </th>
              <th className="res-th-sortable" onClick={() => handleResidentSort('id')}>
                Resident ID {residentSort.key === 'id' ? (residentSort.direction === 'asc' ? '▲' : '▼') : '↕'}
              </th>
              <th className="res-th-sortable" onClick={() => handleResidentSort('rbiId')}>
                RBI ID {residentSort.key === 'rbiId' ? (residentSort.direction === 'asc' ? '▲' : '▼') : '↕'}
              </th>
              <th className="res-th-sortable" onClick={() => handleResidentSort('name')}>
                Full Name {residentSort.key === 'name' ? (residentSort.direction === 'asc' ? '▲' : '▼') : '↕'}
              </th>
              <th className="res-th-sortable" onClick={() => handleResidentSort('purok')}>
                Purok {residentSort.key === 'purok' ? (residentSort.direction === 'asc' ? '▲' : '▼') : '↕'}
              </th>
              <th className="res-th-sortable" onClick={() => handleResidentSort('age')}>
                Age {residentSort.key === 'age' ? (residentSort.direction === 'asc' ? '▲' : '▼') : '↕'}
              </th>
              <th className="res-th-sortable" onClick={() => handleResidentSort('civilStatus')}>
                Civil Status {residentSort.key === 'civilStatus' ? (residentSort.direction === 'asc' ? '▲' : '▼') : '↕'}
              </th>
              <th className="res-th-sortable" onClick={() => handleResidentSort('voter')}>
                Voter {residentSort.key === 'voter' ? (residentSort.direction === 'asc' ? '▲' : '▼') : '↕'}
              </th>
              {role === 'admin' && <th>Household</th>}
              <th className="res-th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isResidentsLoading ? (
              <tr>
                <td colSpan={role === 'admin' ? 10 : 9} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <span className="spinner" style={{ width: '24px', height: '24px', borderWidth: '3px' }} />
                    <span>Loading resident records from local database...</span>
                  </div>
                </td>
              </tr>
            ) : sortedFilteredResidents.length === 0 ? (
              <tr>
                <td colSpan={role === 'admin' ? 10 : 9} className="res-empty-cell">
                  <div className="res-empty-state">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                    </svg>
                    <span>No residents found matching your search.</span>
                  </div>
                </td>
              </tr>
            ) : (
              sortedFilteredResidents.map((res) => {
                const isChecked = selectedResidents.includes(res.id);
                const initials = res.name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();

                return (
                  <tr key={res.id} className={isChecked ? 'row-selected' : ''}>
                    <td className="res-td-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedResidents([...selectedResidents, res.id]);
                          else setSelectedResidents(selectedResidents.filter((id) => id !== res.id));
                        }}
                      />
                    </td>
                    <td className="res-td-mono res-td-muted" style={{ maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={res.id}>
                      {res.id}
                    </td>
                    <td className="res-td-mono" style={{ maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={res.rbiId || 'N/A'}>
                      {res.rbiId || '—'}
                    </td>
                    <td>
                      <div className="res-name-cell">
                        <div className="res-avatar">
                          <span>{initials}</span>
                          {res.photoUrl && <img src={res.photoUrl} alt={res.name} onError={(e) => { e.target.style.visibility = 'hidden'; }} />}
                        </div>
                        <div className="res-name-info">
                          <strong className="res-name-text">{res.name}</strong>
                          {res.conflict && (
                            <span className="badge r res-conflict-badge" title="Data conflict detected">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M10.3 3.9 2.5 17a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                              </svg> Conflict
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td><span className={`badge ${res.purokClass}`}>{res.purok || 'N/A'}</span></td>
                    <td>{res.age || '—'}</td>
                    <td>{res.civilStatus || '—'}</td>
                    <td>
                      <span className={`badge ${res.voter ? 'g' : 'gr'}`}>{res.voter ? 'Yes' : 'No'}</span>
                    </td>
                    {role === 'admin' && (
                      <td className="res-td-mono">
                        {res.household ? (
                          <span className="badge res-household-badge" title={`View household ${res.household}`} onClick={() => { setSelectedHouseholdId(res.household); nav('view-household'); }} style={{ cursor: 'pointer' }}>
                            {res.household}
                          </span>
                        ) : <span className="res-td-muted">—</span>}
                      </td>
                    )}
                    <td>
                      <div className="res-actions">
                        {viewMode === 'active' && (
                          <>
                            <button className="btn btn-sm action-btn-view" onClick={() => { setSelectedResidentId(res.id); nav('view-resident'); }} title="View Profile">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
                            </button>
                            <button className="btn btn-sm action-btn-edit" onClick={() => handleStartEditResident(res)} title="Edit Details">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                            </button>
                            {!res.hasAccount && (
                              <button className="btn btn-sm res-btn-credentials" onClick={() => handleGenerateCredentials(res)} title="Generate Login Credentials">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
                              </button>
                            )}
                            {role === 'admin' && (
                              <button className="btn btn-sm action-btn-delete" onClick={() => handleArchiveResident(res.id, res.name)} title="Archive Resident">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></svg>
                              </button>
                            )}
                          </>
                        )}

                        {viewMode === 'archived' && role === 'admin' && (
                          <button
                            className="btn btn-sm res-btn-restore"
                            onClick={async () => {
                              const confirmRestore = window.confirm(`I-restore ba si ${res.name} sa Active Residents list?`);
                              if (!confirmRestore) return;
                              try {
                                const existingDoc = await db.get(res.id);
                                const restoredDoc = { ...existingDoc, isArchived: false, archivedAt: null, updatedAt: new Date().toISOString() };
                                await db.put(restoredDoc);
                                await createAuditLog({ action: 'RESTORE_RESIDENT', module: 'RESIDENTS', recordId: res.id, details: `Restored archived resident: ${res.name}` });
                                showToast(`${res.name} has been restored successfully.`, 'success');
                                fetchResidents();
                              } catch (err) {
                                console.error('Failed to restore:', err);
                                showToast('Failed to restore resident.', 'error');
                              }
                            }}
                            title="Restore Resident"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg> Restore
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default ResidentsScreen;