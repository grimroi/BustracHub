import React, { useState, useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import { calculateAge } from "../../utils/residentUtils";
import { localDb } from '../../services/db';
import { generateRbiId } from '../../utils/generateRbiId';

const formLabelStyle = { color: 'var(--text)' };
const formFieldStyle = { backgroundColor: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' };

const SectionHeading = ({ number, children, inset = false }) => (
  <div
    style={{
      margin: '0 0 12px',
      paddingTop: inset ? 0 : '14px',
      borderTop: inset ? 'none' : '1px solid var(--border)',
      fontSize: '12px',
      fontWeight: 800,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: 'var(--muted)',
    }}
  >
    {number}. {children}
  </div>
);

export default forwardRef(function ResidentForm({
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
  householdForm = { head: '', address: '', purok: '', notes: '' },
  setHouseholdForm,
  canCreateHousehold = false,
  isSaving = false
}, ref) {
  const firstInputRef = useRef(null);

  // Expose focus method for modal Ctrl+S / autofocus
  useImperativeHandle(ref, () => ({
    focus: () => {
      if (firstInputRef.current) {
        firstInputRef.current.focus();
      }
    }
  }));
  
  // ═══ HOUSEHOLD FALLBACK: kung empty ang prop, kumuha mula sa localDb ═══
const [localHouseholds, setLocalHouseholds] = useState([]);

useEffect(() => {
  // Prop already has households — use it directly, never touch localDb.
  if (households.length > 0) return;
  let cancelled = false;
  (async () => {
    try {
      const res = await localDb.allDocs({ include_docs: true });
      const hhs = res.rows
        .map((r) => r.doc)
        .filter((d) => d && d.type === 'household' && !d._deleted && d.id)
        .map((d) => ({
          id: d.id,
          head: d.head || '',
          purok: d.purok || '',
          address: d.address || '',
          members: d.members || 0,
        }));
      if (!cancelled) {
        setLocalHouseholds(hhs);
        console.log('[ResidentForm] fallback loaded households:', hhs.length);
      }
    } catch (err) {
      console.warn('[ResidentForm] fallback fetch failed:', err?.message || err);
    }
  })();
  return () => { cancelled = true; };
  // Key on the length only, not the array reference: the parent may pass a
  // fresh array (e.g. a new `[]`) on every render, which would otherwise
  // trigger localDb.allDocs() repeatedly.
}, [households.length]);

const effectiveHouseholds = households.length > 0 ? households : localHouseholds;

  const isEditMode = !!editingResidentId;
  const todayDateStr = new Date().toISOString().split('T')[0]; // Max date para sa birthdate
  // Guard the Age display: an empty/invalid birthdate should read "Not set"
  // rather than "0", while a real birthdate (including a legitimate age of 0)
  // still shows its computed age.
  const hasValidBirthdate = !!residentForm.birthdate && !Number.isNaN(new Date(residentForm.birthdate).getTime());

  // Household availability: kapag walang existing households at pinapayagan ang
  // user na gumawa, awtomatikong lumipat sa "Create New Household" mode para
  // maisama ang household sa resident submission.
  const noHouseholdsAvailable = effectiveHouseholds.length === 0;
  const showHouseholdCreate = canCreateHousehold
    && (householdAssignmentMode === 'create' || (noHouseholdsAvailable && !isEditMode));

  useEffect(() => {
    if (!setHouseholdAssignmentMode) return;
    if (showHouseholdCreate && householdAssignmentMode !== 'create') {
      setHouseholdAssignmentMode('create');
    }
  }, [showHouseholdCreate, householdAssignmentMode, setHouseholdAssignmentMode]);

  // Auto-generate RBI ID kapag NEW record (hindi edit mode) at wala pang laman
  useEffect(() => {
    if (isEditMode || residentForm.rbiNo) return;
    let cancelled = false;
    (async () => {
      try {
        const rbiId = await generateRbiId(localDb);
        if (!cancelled) updateResidentField('rbiNo', rbiId);
      } catch (err) {
        console.warn('[ResidentForm] RBI ID generation failed:', err?.message || err);
      }
    })();
    return () => { cancelled = true; };
  }, [isEditMode]);

  const updateHouseholdMode = (mode) => {
    if (setHouseholdAssignmentMode) setHouseholdAssignmentMode(mode);
    if (mode === 'create' && setHouseholdForm) setHouseholdForm({ head: '', address: '', purok: '', notes: '' });
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
            <div style={{ borderRight: '1px solid var(--border)', paddingRight: '20px', alignSelf: 'flex-start', position: 'sticky', top: 0 }}>
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
            </div>

            {/* ═══ MAIN FORM CONTENT ═══ */}
            <div>
              <SectionHeading number="A">Profile</SectionHeading>

              {/* System IDs — immutable on edit */}
              <div className="fg" style={{ marginBottom: '16px' }}>
                <label className="fl" style={formLabelStyle}>
                  RESIDENT ID
                  {!isEditMode && (
                    <span style={{ color: 'var(--muted)', fontSize: '11px', fontWeight: 400, marginLeft: '4px' }}>
                      (Auto-generated on save)
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  className="fc"
                  readOnly
                  disabled={isSaving}
                  placeholder="—"
                  style={{ ...formFieldStyle, cursor: 'not-allowed', color: 'var(--muted)' }}
                  value={isEditMode ? editingResidentId : ''}
                />
              </div>

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

              {/* Barangay Official role */}
              <div className="fg" style={{ marginBottom: '16px' }}>
                <label className="fl">BARANGAY OFFICIAL?</label>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    color: 'var(--text)',
                    fontSize: '13px',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                  }}
                >
                  <input
                    type="checkbox"
                    disabled={isSaving}
                    checked={residentForm.isBarangayOfficial}
                    onChange={(e) => updateResidentField('isBarangayOfficial', e.target.checked)}
                  />
                  Mark this resident as a barangay official
                </label>
              </div>

              {/* Full Name Fields - AUTO-UPPERCASE APPLIED */}
              <SectionHeading number="B">Personal Information</SectionHeading>
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

              {/* Birthdate, Age, Birth Place */}
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
                      const calculatedAge = bdate ? calculateAge(bdate) : 0;
                      updateResidentField('birthdate', bdate);
                      updateResidentField('age', calculatedAge > 0 ? calculatedAge : 0);
                    }}
                  />
                </div>
                <div className="fg">
                  <label className="fl">AGE</label>
                  <input
                    type="number"
                    className="fc"
                    readOnly
                    value={hasValidBirthdate ? residentForm.age : ''}
                    placeholder="Not set"
                  />
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
              <SectionHeading number="C">Demographic Information</SectionHeading>
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
              <SectionHeading number="D">Residency &amp; Voting</SectionHeading>
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
                      disabled={isSaving || !residentForm.isRegisteredVoter}
                      value={residentForm.precinctNo}
                      onChange={(e) => updateResidentField('precinctNo', e.target.value)}
                      placeholder={residentForm.isRegisteredVoter ? '' : 'Requires registered voter'}
                      style={{ opacity: residentForm.isRegisteredVoter ? 1 : 0.55, cursor: residentForm.isRegisteredVoter ? 'text' : 'not-allowed' }}
                    />
                  </div>
                  <div className="fg">
                    <label className="fl">VOTING IN OTHER PLACE? (Indicate Place)</label>
                    <input
                      type="text"
                      className="fc"
                      disabled={isSaving || residentForm.isVotingLocally}
                      value={residentForm.votingOtherPlace}
                      onChange={(e) => updateResidentField('votingOtherPlace', e.target.value)}
                      placeholder={residentForm.isVotingLocally ? 'Not voting elsewhere' : ''}
                      style={{ opacity: residentForm.isVotingLocally ? 0.55 : 1, cursor: residentForm.isVotingLocally ? 'not-allowed' : 'text' }}
                    />
                  </div>
                </div>
              </div>

              {/* Address & Contact Info */}
              <SectionHeading number="E">Contact &amp; Address</SectionHeading>
              <div className="fg2" style={{ marginBottom: '16px' }}>
                <div className="fg">
                  <label className="fl">CONTACT NOS.</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    className="fc"
                    disabled={isSaving}
                    placeholder="09123456789"
                    maxLength={11}
                    pattern="09[0-9]{9}"
                    value={residentForm.contactNo || ''}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/\D/g, '').slice(0, 11);
                      updateResidentField('contactNo', cleaned);
                    }}
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
                <label className="fl">Address Outside the Barangay</label>
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
                {/* Section F lives in its own bordered box, so use the inset
                    variant to avoid a redundant rule inside the box. */}
                <SectionHeading number="F" inset>Household Information</SectionHeading>
                {canCreateHousehold && !noHouseholdsAvailable && (
                  <div role="group" aria-label="Household assignment method" style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                    <button
                      type="button"
                      disabled={isSaving}
                      className={`btn btn-sm ${!showHouseholdCreate ? 'btn-p' : 'btn-g'}`}
                      aria-pressed={!showHouseholdCreate}
                      onClick={() => updateHouseholdMode('existing')}
                    >
                      Select Existing
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      className={`btn btn-sm ${showHouseholdCreate ? 'btn-p' : 'btn-g'}`}
                      aria-pressed={showHouseholdCreate}
                      onClick={() => updateHouseholdMode('create')}
                    >
                      Create New Household
                    </button>
                  </div>
                )}

                {noHouseholdsAvailable && canCreateHousehold && (
                  <div
                    style={{
                      marginBottom: '14px',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      fontSize: '12px',
                      color: 'var(--muted)',
                    }}
                  >
                    No existing households found. A new household will be created automatically.
                  </div>
                )}

                {showHouseholdCreate ? (
                  <div>
                    <div className="fg">
                      <label className="fl" htmlFor="resident-household-head">Household Name / Head of Household *</label>
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
                    <div className="fg2" style={{ marginTop: '12px' }}>
                      <div className="fg">
                        <label className="fl" htmlFor="resident-household-purok">Purok / Zone *</label>
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
                      <div className="fg">
                        <label className="fl" htmlFor="resident-household-notes">Notes (Optional)</label>
                        <input
                          id="resident-household-notes"
                          className="fc"
                          disabled={isSaving}
                          value={householdForm.notes || ''}
                          onChange={(e) => setHouseholdForm((current) => ({ ...current, notes: e.target.value }))}
                          placeholder="Optional remarks about this household"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="fg">
                    <label className="fl" htmlFor="resident-household-select">Existing Household *</label>
                    <select
                      id="resident-household-select"
                      className="fc"
                      required
                      disabled={isSaving}
                      value={
                        residentForm.householdNo && residentForm.householdNo !== '—'
                          ? residentForm.householdNo
                          : ''
                      }
                      onChange={(e) => updateResidentField('householdNo', e.target.value)}
                      style={{ ...formFieldStyle, cursor: isSaving ? 'not-allowed' : 'pointer' }}
                    >
                      <option value="">— Select a household —</option>
                      {effectiveHouseholds.length === 0 ? (
  <option value="" disabled>No households available</option>
) : (
  effectiveHouseholds.map((household) => (
    <option key={household.id} value={household.id}>
      {household.id} — {household.head || 'Unnamed'}
      {household.purok ? ` (${household.purok})` : ''}
    </option>
  ))
)}
                    </select>
                    {effectiveHouseholds.length === 0 && (
  <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--muted)' }}>
    No households available. Create one via Household Management first.
  </div>
)}
                  </div>
                )}

                {/* STATUS BOX - ISA LANG */}
                <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '6px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--muted)' }}>
                  {showHouseholdCreate ? (
                    <>A new Household ID will be generated and linked to this resident when saved.</>
                  ) : residentForm.householdNo && residentForm.householdNo !== '—' ? (
                    <>Household <strong style={{ color: 'var(--text)' }}>{residentForm.householdNo}</strong> will be linked to this resident.</>
                  ) : (
                    <>Select an existing household to continue.</>
                  )}
                </div>
              </section>

              {/* Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
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
});