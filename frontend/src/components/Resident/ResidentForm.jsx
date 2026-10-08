import React, { useState, useEffect } from 'react';

const formLabelStyle = { color: 'var(--text)' };
const formFieldStyle = { backgroundColor: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' };

export default function ResidentForm({
  residentForm,
  setResidentForm,
  editingResidentId,
  photoPreviewUrl,
  setPhotoPreviewUrl,
  handlePhotoChange,
  handleRemovePhoto,
  updateResidentField,
  submitAddResident,
  nav,
  setEditingResidentId,
  EMPTY_RESIDENT,
  onCancel,
  households = [],
  householdAssignmentMode = 'existing',
  setHouseholdAssignmentMode,
  householdForm,
  setHouseholdForm,
  canCreateHousehold = false,
  isSaving = false // 1. Naidagdag ang isSaving prop
}) {
  const [householdQuery, setHouseholdQuery] = useState('');
  const [isHouseholdSearchActive, setIsHouseholdSearchActive] = useState(false);
  const [showHouseholdOptions, setShowHouseholdOptions] = useState(false);

  const isEditMode = !!editingResidentId;
  const todayDateStr = new Date().toISOString().split('T')[0]; // Max date para sa birthdate

  // Auto-generate RBI ID kapag NEW record (hindi edit mode) at wala pang laman
  useEffect(() => {
    if (!isEditMode && !residentForm.rbiNo) {
      const year = new Date().getFullYear();
      const randomSuffix = Math.floor(100000 + Math.random() * 900000);
      updateResidentField('rbiNo', `RBI-${year}-${randomSuffix}`);
    }
  }, [isEditMode]);

  const selectedHousehold = households.find((household) => household.id === residentForm.householdNo);

  const householdSearchResults = households
    .filter((household) => {
      const query = householdQuery.trim().toLowerCase();
      if (!query) return true;
      return [household.id, household.head, household.purok, household.address]
        .some((value) => String(value || '').toLowerCase().includes(query));
    })
    .slice(0, 10);

  const updateHouseholdMode = (mode) => {
    setHouseholdAssignmentMode(mode);
    setHouseholdQuery('');
    setIsHouseholdSearchActive(false);
    setShowHouseholdOptions(false);
    if (mode === 'create') setHouseholdForm({ head: '', address: '', purok: '' });
  };

  return (
    <div className="screen active">
      <form onSubmit={submitAddResident}>
        <div style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}></div>

        {isEditMode && (
          <div className="fg">
            <label className="fl" style={formLabelStyle}>
              Resident Status
              <span style={{ color: 'var(--muted)', fontSize: '11px', fontWeight: 400, marginLeft: '4px' }}>
                (Update if Transferred Out or Deceased)
              </span>
            </label>
            <select
              className="fc"
              value={residentForm.status || 'Active'}
              onChange={(e) => updateResidentField('status', e.target.value)}
              style={{ ...formFieldStyle, cursor: 'pointer' }}
              disabled={isSaving}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive / Transferred Out</option>
              <option value="Deceased">Deceased</option>
            </select>
          </div>
        )}

        <div
          className="fp"
          style={{
            backdropFilter: 'blur(8px)',
            padding: '24px',
            borderRadius: '12px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '24px' }}>
            {/* ═══ LEFT SIDEBAR: PHOTO & BARANGAY STATUS ═══ */}
            <div style={{ borderRight: '1px solid var(--border)', paddingRight: '20px' }}>
              {/* Photo Preview Box */}
              <div
                style={{
                  width: '100%',
                  height: '180px',
                  border: '2px dashed var(--border)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px',
                  backgroundColor: 'var(--surface2)',
                  color: 'var(--text)',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                {residentForm.photoUrl || photoPreviewUrl ? (
                  <img
                    src={residentForm.photoUrl || photoPreviewUrl}
                    alt="Resident Preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      console.error('Image failed to load');
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (
                  <span style={{ color: 'var(--muted)', fontSize: '12px', textAlign: 'center', padding: '10px' }}>
                    Picture (.Jpg / .Png) <br /> (Max 500KB)
                  </span>
                )}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <input
                  type="file"
                  accept="image/*"
                  id="resident-photo-upload"
                  style={{ display: 'none' }}
                  onChange={handlePhotoChange}
                  disabled={isSaving}
                />
                <label
                  htmlFor="resident-photo-upload"
                  className="btn btn-g"
                  style={{
                    width: '100%',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    opacity: isSaving ? 0.6 : 1,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  {residentForm.photoUrl ? 'Change Photo' : 'Upload / Take Photo'}
                </label>

                {residentForm.photoUrl && (
                  <button
                    type="button"
                    className="btn btn-g btn-sm"
                    disabled={isSaving}
                    style={{
                      width: '100%',
                      marginTop: '8px',
                      color: 'var(--red, #ef4444)',
                      borderColor: 'rgba(239, 68, 68, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                    onClick={handleRemovePhoto}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                    Remove Photo
                  </button>
                )}
              </div>

              {/* Checkboxes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text)' }}>
                  <input
                    type="checkbox"
                    disabled={isSaving}
                    checked={residentForm.isBarangayOfficial}
                    onChange={(e) => updateResidentField('isBarangayOfficial', e.target.checked)}
                  />
                  Barangay Official
                </label>
              </div>
            </div>

            {/* ═══ MAIN FORM CONTENT ═══ */}
            <div>
              {/* Header / ID Info */}
              <div className="fg2" style={{ marginBottom: '16px' }}>
                <div className="fg">
                  <label className="fl" style={formLabelStyle}>
                    RBI ID NO.
                    {isEditMode && (
                      <span style={{ color: 'var(--muted)', fontSize: '11px', fontWeight: 400, marginLeft: '4px' }}>
                        (Immutable / Hindi Na Mababago)
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    className="fc"
                    required
                    disabled={isSaving}
                    placeholder="e.g., RBI-2026-000001"
                    style={{
                      ...formFieldStyle,
                      backgroundColor: isEditMode ? 'var(--surface2)' : 'var(--surface)',
                      cursor: isEditMode ? 'not-allowed' : 'text',
                      color: 'var(--text)',
                    }}
                    value={residentForm.rbiNo}
                    readOnly={isEditMode}
                    onChange={(e) => {
                      if (!isEditMode) {
                        // Auto-uppercase at tanggalin ang mga space/special characters para malinis
                        const cleanValue = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
                        updateResidentField('rbiNo', cleanValue);
                      }
                    }}
                  />
                </div>

                <div className="fg">
                  <label className="fl" style={formLabelStyle}>
                    PhilSys Card Number (PCN / PSN)
                    <span style={{ color: 'var(--muted)', fontSize: '11px', fontWeight: 400, marginLeft: '4px' }}>
                      (Optional, for DILG Interoperability)
                    </span>
                  </label>
                  <input
                    type="text"
                    className="fc"
                    disabled={isSaving}
                    placeholder="e.g. 1234-5678-9012-3456"
                    value={residentForm.philSysNo || ''}
                    onChange={(e) => updateResidentField('philSysNo', e.target.value)}
                  />
                </div>

                <div className="fg">
                  <label className="fl">FILE DATE UPDATED</label>
                  <input
                    type="date"
                    className="fc"
                    disabled={isSaving}
                    value={residentForm.fileDateUpdated}
                    onChange={(e) => updateResidentField('fileDateUpdated', e.target.value)}
                  />
                </div>
              </div>

              {/* Full Name Fields - AUTO-UPPERCASE APPLIED */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 120px 120px', gap: '10px', marginBottom: '16px' }}>
                <div className="fg">
                  <label className="fl">LAST NAME *</label>
                  <input
                    type="text"
                    className="fc"
                    required
                    disabled={isSaving}
                    value={residentForm.lastName}
                    onChange={(e) => updateResidentField('lastName', e.target.value.toUpperCase())}
                  />
                </div>
                <div className="fg">
                  <label className="fl">FIRST NAME *</label>
                  <input
                    type="text"
                    className="fc"
                    required
                    disabled={isSaving}
                    value={residentForm.firstName}
                    onChange={(e) => updateResidentField('firstName', e.target.value.toUpperCase())}
                  />
                </div>
                <div className="fg">
                  <label className="fl">MIDDLE NAME</label>
                  <input
                    type="text"
                    className="fc"
                    disabled={isSaving}
                    value={residentForm.middleName}
                    onChange={(e) => updateResidentField('middleName', e.target.value.toUpperCase())}
                  />
                </div>
                <div className="fg">
                  <label className="fl">SUFFIX</label>
                  <input
                    type="text"
                    className="fc"
                    disabled={isSaving}
                    placeholder="Jr / Sr / III"
                    value={residentForm.suffix}
                    onChange={(e) => updateResidentField('suffix', e.target.value.toUpperCase())}
                  />
                </div>
                <div className="fg">
                  <label className="fl">ALIAS</label>
                  <input
                    type="text"
                    className="fc"
                    disabled={isSaving}
                    value={residentForm.alias}
                    onChange={(e) => updateResidentField('alias', e.target.value.toUpperCase())}
                  />
                </div>
              </div>

              {/* Birthdate, Age, Birth Place - BIRTHDATE MAX VALIDATION APPLIED */}
              <div className="fg3" style={{ marginBottom: '16px' }}>
                <div className="fg">
                  <label className="fl">BIRTHDATE *</label>
                  <input
                    type="date"
                    className="fc"
                    required
                    disabled={isSaving}
                    max={todayDateStr}
                    value={residentForm.birthdate}
                    onChange={(e) => {
                      const bdate = e.target.value;
                      const calculatedAge = bdate ? Math.floor((new Date() - new Date(bdate)) / 31557600000) : 0;
                      updateResidentField('birthdate', bdate);
                      updateResidentField('age', calculatedAge > 0 ? calculatedAge : 0);
                    }}
                  />
                </div>
                <div className="fg">
                  <label className="fl">AGE</label>
                  <input type="number" className="fc" readOnly value={residentForm.age} />
                </div>
                <div className="fg">
                  <label className="fl">BIRTH PLACE</label>
                  <input
                    type="text"
                    className="fc"
                    disabled={isSaving}
                    value={residentForm.birthPlace}
                    onChange={(e) => updateResidentField('birthPlace', e.target.value)}
                  />
                </div>
              </div>

              {/* Sex / LGBTQIA+ */}
              <div className="fg2" style={{ marginBottom: '16px' }}>
                <div className="fg">
                  <label className="fl">SEX *</label>
                  <select
                    className="fc"
                    disabled={isSaving}
                    value={residentForm.sex}
                    onChange={(e) => updateResidentField('sex', e.target.value)}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div className="fg" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '20px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', color: 'var(--text)' }}>
                    <input
                      type="checkbox"
                      disabled={isSaving}
                      checked={residentForm.isLgbtqia}
                      onChange={(e) => updateResidentField('isLgbtqia', e.target.checked)}
                    />
                    LGBTQIA+
                  </label>
                  {residentForm.isLgbtqia && (
                    <input
                      type="text"
                      className="fc"
                      disabled={isSaving}
                      placeholder="If Yes, Pls. Specify..."
                      value={residentForm.lgbtqiaSpecification}
                      onChange={(e) => updateResidentField('lgbtqiaSpecification', e.target.value)}
                    />
                  )}
                </div>
              </div>

              {/* Civil Status, Citizenship */}
              <div className="fg2" style={{ marginBottom: '16px' }}>
                <div className="fg">
                  <label className="fl">CIVIL STATUS *</label>
                  <select
                    className="fc"
                    disabled={isSaving}
                    value={residentForm.civilStatus}
                    onChange={(e) => updateResidentField('civilStatus', e.target.value)}
                  >
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Widowed">Widowed</option>
                    <option value="Separated">Separated</option>
                    <option value="Divorced">Divorced</option>
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">CITIZENSHIP</label>
                  <input
                    type="text"
                    className="fc"
                    disabled={isSaving}
                    value={residentForm.citizenship}
                    onChange={(e) => updateResidentField('citizenship', e.target.value)}
                  />
                </div>
              </div>

              {/* Religion, Tribe */}
              <div className="fg2" style={{ marginBottom: '16px' }}>
                <div className="fg">
                  <label className="fl">RELIGION</label>
                  <input
                    type="text"
                    className="fc"
                    disabled={isSaving}
                    value={residentForm.religion}
                    onChange={(e) => updateResidentField('religion', e.target.value)}
                  />
                </div>
                <div className="fg">
                  <label className="fl">INDIGENOUS TRIBE</label>
                  <input
                    type="text"
                    className="fc"
                    disabled={isSaving}
                    value={residentForm.indigenousTribe}
                    onChange={(e) => updateResidentField('indigenousTribe', e.target.value)}
                  />
                </div>
              </div>

              {/* Physical Attributes */}
              <div className="fg3" style={{ marginBottom: '16px' }}>
                <div className="fg">
                  <label className="fl">WEIGHT (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="fc"
                    disabled={isSaving}
                    value={residentForm.weightKg}
                    onChange={(e) => updateResidentField('weightKg', e.target.value)}
                  />
                </div>
                <div className="fg">
                  <label className="fl">HEIGHT (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="fc"
                    disabled={isSaving}
                    value={residentForm.heightCm}
                    onChange={(e) => updateResidentField('heightCm', e.target.value)}
                  />
                </div>
                <div className="fg">
                  <label className="fl">BLOOD TYPE</label>
                  <select
                    className="fc"
                    disabled={isSaving}
                    value={residentForm.bloodType}
                    onChange={(e) => updateResidentField('bloodType', e.target.value)}
                  >
                    <option value="">-- Select --</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>
              </div>

              {/* Family Roles & Household Status */}
              <div
                style={{
                  display: 'flex',
                  gap: '16px',
                  flexWrap: 'wrap',
                  backgroundColor: 'var(--surface2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  padding: '12px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text)' }}>
                  <input
                    type="checkbox"
                    disabled={isSaving}
                    checked={residentForm.isHouseholdHead}
                    onChange={(e) => updateResidentField('isHouseholdHead', e.target.checked)}
                  />
                  Head of Household
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text)' }}>
                  <input
                    type="checkbox"
                    disabled={isSaving}
                    checked={residentForm.isFamilyHead}
                    onChange={(e) => updateResidentField('isFamilyHead', e.target.checked)}
                  />
                  Head of Family
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text)' }}>
                  <input
                    type="checkbox"
                    disabled={isSaving}
                    checked={residentForm.isSoloParent}
                    onChange={(e) => updateResidentField('isSoloParent', e.target.checked)}
                  />
                  Solo Parent
                </label>
              </div>

              {/* Relationship to Household Head */}
              <div className="fg" style={{ marginBottom: '16px' }}>
                <label className="fl">RELATIONSHIP TO HOUSEHOLD HEAD</label>
                <input
                  type="text"
                  className="fc"
                  disabled={isSaving}
                  placeholder="e.g. Spouse, Son, Daughter, Self"
                  value={residentForm.relationshipToHouseholdHead}
                  onChange={(e) => updateResidentField('relationshipToHouseholdHead', e.target.value)}
                />
              </div>

              {/* Residency Information */}
              <div
                style={{
                  backgroundColor: 'var(--surface2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  padding: '12px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text)' }}>
                    <input
                      type="checkbox"
                      disabled={isSaving}
                      checked={residentForm.isBarangayResident}
                      onChange={(e) => updateResidentField('isBarangayResident', e.target.checked)}
                    />
                    Resident of Barangay?
                  </label>
                </div>
                <div className="fg2">
                  <div className="fg">
                    <label className="fl">RESIDENT SINCE WHEN?</label>
                    <input
                      type="date"
                      className="fc"
                      disabled={isSaving}
                      max={todayDateStr}
                      value={residentForm.residentSince}
                      onChange={(e) => updateResidentField('residentSince', e.target.value)}
                    />
                  </div>
                  <div className="fg">
                    <label className="fl">STATUS OF RESIDENCY</label>
                    <select
                      className="fc"
                      disabled={isSaving}
                      value={residentForm.residencyStatus}
                      onChange={(e) => updateResidentField('residencyStatus', e.target.value)}
                    >
                      <option value="Permanent">Permanent</option>
                      <option value="Temporary">Temporary</option>
                      <option value="Transient">Transient</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Voter Registration Info */}
              <div
                style={{
                  backgroundColor: 'var(--surface2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  padding: '12px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text)' }}>
                    <input
                      type="checkbox"
                      disabled={isSaving}
                      checked={residentForm.isRegisteredVoter}
                      onChange={(e) => updateResidentField('isRegisteredVoter', e.target.checked)}
                    />
                    Registered Voter?
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text)' }}>
                    <input
                      type="checkbox"
                      disabled={isSaving}
                      checked={residentForm.isVotingLocally}
                      onChange={(e) => updateResidentField('isVotingLocally', e.target.checked)}
                    />
                    Voting Here?
                  </label>
                </div>
                <div className="fg2">
                  <div className="fg">
                    <label className="fl">PRECINCT NO.</label>
                    <input
                      type="text"
                      className="fc"
                      disabled={isSaving}
                      value={residentForm.precinctNo}
                      onChange={(e) => updateResidentField('precinctNo', e.target.value)}
                    />
                  </div>
                  <div className="fg">
                    <label className="fl">VOTING IN OTHER PLACE? (Indicate Place)</label>
                    <input
                      type="text"
                      className="fc"
                      disabled={isSaving}
                      value={residentForm.votingOtherPlace}
                      onChange={(e) => updateResidentField('votingOtherPlace', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Address & Contact Info */}
              <div className="fg2" style={{ marginBottom: '16px' }}>
                <div className="fg">
                  <label className="fl">CONTACT NOS.</label>
                  <input
                    type="text"
                    className="fc"
                    disabled={isSaving}
                    placeholder="09XX-XXX-XXXX"
                    value={residentForm.contactNo}
                    onChange={(e) => updateResidentField('contactNo', e.target.value)}
                  />
                </div>
                <div className="fg">
                  <label className="fl">EMAIL ADD</label>
                  <input
                    type="email"
                    className="fc"
                    disabled={isSaving}
                    value={residentForm.email}
                    onChange={(e) => updateResidentField('email', e.target.value)}
                  />
                </div>
              </div>

              <div className="fg" style={{ marginBottom: '16px' }}>
                <label className="fl">ST., LOT NO., SUBD., PUROK/ZONE</label>
                <input
                  type="text"
                  className="fc"
                  disabled={isSaving}
                  placeholder="Purok 3, Zone 1"
                  value={residentForm.purokZoneAddress}
                  onChange={(e) => updateResidentField('purokZoneAddress', e.target.value)}
                />
              </div>

              <div className="fg" style={{ marginBottom: '20px' }}>
                <label className="fl">ADDRESS OUTSIDE IN THIS BARANGAY</label>
                <input
                  type="text"
                  className="fc"
                  disabled={isSaving}
                  value={residentForm.addressOutsideBarangay}
                  onChange={(e) => updateResidentField('addressOutsideBarangay', e.target.value)}
                />
              </div>

              {/* Household Assignment Section */}
              <section style={{ marginBottom: '20px', padding: '16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>Household Information</h3>
                {canCreateHousehold && (
                  <div role="group" aria-label="Household assignment method" style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                    <button
                      type="button"
                      disabled={isSaving}
                      className={`btn btn-sm ${householdAssignmentMode === 'existing' ? 'btn-p' : 'btn-g'}`}
                      aria-pressed={householdAssignmentMode === 'existing'}
                      onClick={() => updateHouseholdMode('existing')}
                    >
                      Select Existing
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      className={`btn btn-sm ${householdAssignmentMode === 'create' ? 'btn-p' : 'btn-g'}`}
                      aria-pressed={householdAssignmentMode === 'create'}
                      onClick={() => updateHouseholdMode('create')}
                    >
                      Create New Household
                    </button>
                  </div>
                )}

                {householdAssignmentMode === 'create' && canCreateHousehold ? (
                  <div>
                    <div className="fg">
                      <label className="fl" htmlFor="resident-household-head">Head of Family *</label>
                      <input
                        id="resident-household-head"
                        className="fc"
                        required
                        disabled={isSaving}
                        value={householdForm.head}
                        onChange={(e) => setHouseholdForm((current) => ({ ...current, head: e.target.value.toUpperCase() }))}
                        placeholder="Lastname, Firstname Middle Initial"
                      />
                    </div>
                    <div className="fg" style={{ marginTop: '12px' }}>
                      <label className="fl" htmlFor="resident-household-address">Complete Address *</label>
                      <input
                        id="resident-household-address"
                        className="fc"
                        required
                        disabled={isSaving}
                        value={householdForm.address}
                        onChange={(e) => setHouseholdForm((current) => ({ ...current, address: e.target.value }))}
                        placeholder="House number, street, or zone"
                      />
                    </div>
                    <div className="fg" style={{ marginTop: '12px' }}>
                      <label className="fl" htmlFor="resident-household-purok">Purok *</label>
                      <select
                        id="resident-household-purok"
                        className="fc"
                        required
                        disabled={isSaving}
                        value={householdForm.purok}
                        onChange={(e) => setHouseholdForm((current) => ({ ...current, purok: e.target.value }))}
                      >
                        <option value="">Select Purok</option>
                        {[1, 2, 3, 4, 5, 6].map((purokNumber) => (
                          <option key={purokNumber} value={`Purok ${purokNumber}`}>Purok {purokNumber}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="fg">
                    <label className="fl" htmlFor="resident-household-search">Existing Household *</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        id="resident-household-search"
                        type="search"
                        className="fc"
                        role="combobox"
                        disabled={isSaving}
                        aria-autocomplete="list"
                        aria-expanded={showHouseholdOptions}
                        aria-controls="resident-household-options"
                        placeholder="Search by Household ID, head, Purok, or address..."
                        value={
                          isHouseholdSearchActive
                            ? householdQuery
                            : selectedHousehold
                            ? `${selectedHousehold.id} — ${selectedHousehold.head}`
                            : residentForm.householdNo && residentForm.householdNo !== '—'
                            ? `Unknown Household: ${residentForm.householdNo}`
                            : ''
                        }
                        onFocus={() => {
                          setHouseholdQuery('');
                          setIsHouseholdSearchActive(true);
                          setShowHouseholdOptions(true);
                        }}
                        onBlur={() => {
                          window.setTimeout(() => {
                            setShowHouseholdOptions(false);
                            setIsHouseholdSearchActive(false);
                            setHouseholdQuery('');
                          }, 120);
                        }}
                        onChange={(e) => {
                          setHouseholdQuery(e.target.value);
                          setIsHouseholdSearchActive(true);
                          setShowHouseholdOptions(true);
                        }}
                      />
                      {showHouseholdOptions && (
                        <div
                          id="resident-household-options"
                          role="listbox"
                          style={{
                            position: 'absolute',
                            top: 'calc(100% + 4px)',
                            left: 0,
                            right: 0,
                            zIndex: 100,
                            maxHeight: '240px',
                            overflowY: 'auto',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
                          }}
                        >
                          {householdSearchResults.length > 0 ? (
                            householdSearchResults.map((household) => (
                              <button
                                key={household.id}
                                type="button"
                                role="option"
                                aria-selected={residentForm.householdNo === household.id}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  updateResidentField('householdNo', household.id);
                                  setHouseholdQuery('');
                                  setIsHouseholdSearchActive(false);
                                  setShowHouseholdOptions(false);
                                }}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '10px 12px',
                                  textAlign: 'left',
                                  background: 'transparent',
                                  border: 'none',
                                  borderBottom: '1px solid var(--border)',
                                  color: 'var(--text)',
                                  cursor: 'pointer',
                                }}
                              >
                                <span style={{ display: 'block', fontSize: '13px', fontWeight: 700 }}>{household.head || 'Household'}</span>
                                <span style={{ display: 'block', marginTop: '3px', fontSize: '11px', color: 'var(--muted)' }}>
                                  {household.id} · {[household.purok, household.address].filter(Boolean).join(' · ')}
                                </span>
                              </button>
                            ))
                          ) : (
                            <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--muted)' }}>No matching households found.</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div
                  style={{
                    marginTop: '12px',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    fontSize: '12px',
                    color: 'var(--muted)',
                  }}
                >
                  {householdAssignmentMode === 'create' && canCreateHousehold ? (
                    <>A new Household ID will be generated and linked to this resident when saved.</>
                  ) : selectedHousehold ? (
                    <div style={{ display: 'grid', gap: '4px' }}>
                      <div><strong style={{ color: 'var(--text)' }}>Household ID:</strong> {selectedHousehold.id}</div>
                      <div><strong style={{ color: 'var(--text)' }}>Head of Family:</strong> {selectedHousehold.head || '—'}</div>
                      <div><strong style={{ color: 'var(--text)' }}>Purok / Address:</strong> {[selectedHousehold.purok, selectedHousehold.address].filter(Boolean).join(' · ') || '—'}</div>
                    </div>
                  ) : residentForm.householdNo && residentForm.householdNo !== '—' ? (
                    <>Household ID {residentForm.householdNo} is not in the loaded household registry. Select a valid household to save.</>
                  ) : (
                    <>Unassigned. Select an existing household to continue.</>
                  )}
                </div>
              </section>

              {/* ═══ Action Buttons - DITO NAKALAGAY ANG LOADING/SAVING STATE ═══ */}
              <div
                style={{
                  display: 'flex',
                  justify: 'flex-end',
                  gap: '12px',
                  marginTop: '24px',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <button
                  type="button"
                  className="btn btn-g"
                  disabled={isSaving}
                  onClick={() => {
                    if (typeof onCancel === 'function') {
                      onCancel();
                    } else {
                      nav('residents');
                    }
                  }}
                >
                  Cancel
                </button>

                <button type="submit" className="btn btn-p" disabled={isSaving}>
                  {isSaving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Save Resident Record'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}