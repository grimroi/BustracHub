import { useState, useEffect } from 'react';
import { FaUser, FaPhone, FaEnvelope, FaMapMarkerAlt, FaIdCard, FaCalendarAlt, FaVenusMars, FaHeart, FaEdit, FaSave, FaTimes, FaSignOutAlt, FaSync } from 'react-icons/fa';

export default function ResidentProfile({
  residentProfile,
  loggedInUser,
  isOffline,
  lastSync,
  handleLogout,
  handleSaveProfileEdit,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Expanded editableProfile state with ALL fields
  const [editableProfile, setEditableProfile] = useState({
    firstName: '',
    lastName: '',
    contact: '',
    email: '',
    birthdate: '',
    gender: '',
    civilStatus: '',
    purok: '',
    address: '',
    emergencyContactName: '',
    emergencyContactNumber: '',
  });

  // Populate edit form when entering edit mode or when data changes
  useEffect(() => {
    const user = loggedInUser || {};
    const profile = residentProfile || {};
    setEditableProfile({
      firstName: user.firstName || profile.firstName || '',
      lastName: user.lastName || profile.lastName || '',
      contact: user.contact || profile.contact || profile.phone || '',
      email: user.email || profile.email || '',
      birthdate: user.birthdate || profile.birthdate || profile.dateOfBirth || '',
      gender: user.gender || profile.gender || '',
      civilStatus: user.civilStatus || profile.civilStatus || profile.civil_status || '',
      purok: user.purok || profile.purok || profile.zone || '',
      address: user.address || profile.address || profile.streetAddress || '',
      emergencyContactName: user.emergencyContactName || profile.emergencyContactPerson || profile.emergencyContactName || '',
      emergencyContactNumber: user.emergencyContactNumber || profile.emergencyContactNo || profile.emergencyContactNumber || '',
    });
  }, [loggedInUser, residentProfile, isEditing]);

  const handleProfileFieldChange = (field) => (e) => {
    setEditableProfile((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const calculateDisplayAge = (birthdate) => {
    if (!birthdate) return null;
    const birth = new Date(birthdate);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age >= 0 ? age : null;
  };

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return 'Not set';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const handleSave = async () => {
    // Validation
    if (!editableProfile.firstName.trim() || !editableProfile.lastName.trim()) {
      alert('First name and last name are required.');
      return;
    }

    const contact = editableProfile.contact.trim().replace(/\D/g, '');
    if (!contact || !/^09\d{9}$/.test(contact)) {
      alert('Please enter a valid 11-digit Philippine contact number (e.g. 09171234567).');
      return;
    }

    if (!editableProfile.birthdate) {
      alert('Birthdate is required.');
      return;
    }

    // Validate birthdate is not in the future
    const birthDate = new Date(editableProfile.birthdate);
    const today = new Date();
    if (birthDate > today) {
      alert('Birthdate cannot be in the future. Please enter a valid birthdate.');
      return;
    }

    const age = today.getFullYear() - birthDate.getFullYear();
    if (age < 0 || age > 120) {
      alert('Please enter a valid birthdate.');
      return;
    }

    if (!editableProfile.purok) {
      alert('Please select your Purok / Zone.');
      return;
    }

    if (!editableProfile.gender) {
      alert('Please select your gender.');
      return;
    }

    if (!editableProfile.civilStatus) {
      alert('Please select your civil status.');
      return;
    }

    if (editableProfile.emergencyContactNumber.trim()) {
      const emContact = editableProfile.emergencyContactNumber.trim().replace(/\D/g, '');
      if (!/^09\d{9}$/.test(emContact)) {
        alert('Please enter a valid 11-digit emergency contact number.');
        return;
      }
    }

    setIsSaving(true);
    try {
      await handleSaveProfileEdit(editableProfile);
      setSaveSuccess(true);
      setIsEditing(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert('Failed to save: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEditProfile = () => {
    const user = loggedInUser || {};
    const profile = residentProfile || {};
    setEditableProfile({
      firstName: user.firstName || profile.firstName || '',
      lastName: user.lastName || profile.lastName || '',
      contact: user.contact || profile.contact || profile.phone || '',
      email: user.email || profile.email || '',
      birthdate: user.birthdate || profile.birthdate || profile.dateOfBirth || '',
      gender: user.gender || profile.gender || '',
      civilStatus: user.civilStatus || profile.civilStatus || profile.civil_status || '',
      purok: user.purok || profile.purok || profile.zone || '',
      address: user.address || profile.address || profile.streetAddress || '',
      emergencyContactName: user.emergencyContactName || profile.emergencyContactPerson || profile.emergencyContactName || '',
      emergencyContactNumber: user.emergencyContactNumber || profile.emergencyContactNo || profile.emergencyContactNumber || '',
    });
    setIsEditing(false);
  };

  // Derived display values
  const user = loggedInUser || {};
  const profile = residentProfile || {};
  const fullName = user.fullName || profile.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Resident';
  const initials = fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const residentId = user.residentId || profile.residentId || profile._id || 'RES-XXXX';
  const birthdate = user.birthdate || profile.birthdate || profile.dateOfBirth || '';
  const age = user.age || profile.age || calculateDisplayAge(birthdate) || '-';
  const gender = user.gender || profile.gender || 'Not specified';
  const civilStatus = user.civilStatus || profile.civilStatus || profile.civil_status || 'Not specified';
  const contact = user.contact || profile.contact || profile.phone || 'Not set';
  const email = user.email || profile.email || 'Not set';
  const purok = user.purok || profile.purok || profile.zone || 'Not set';
  const address = user.address || profile.address || profile.streetAddress || 'Not set';
  const emergencyName = user.emergencyContactName || profile.emergencyContactPerson || profile.emergencyContactName || '—';
  const emergencyNumber = user.emergencyContactNumber || profile.emergencyContactNo || profile.emergencyContactNumber || '—';

  return (
    <div className="screen active" style={{ padding: '0 16px 24px' }}>
      {/* Header */}
      <div className="page-hdr" style={{ marginBottom: 20 }}>
        <div className="page-title">My Profile</div>
        <div className="page-sub">Manage your resident information</div>
      </div>

      {/* Success Message */}
      {saveSuccess && (
        <div style={{
          padding: '12px 16px',
          marginBottom: 16,
          borderRadius: 10,
          background: 'rgba(34,197,94,0.1)',
          border: '1px solid rgba(34,197,94,0.3)',
          color: '#22c55e',
          fontSize: 13,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Your information has been successfully updated!
        </div>
      )}

      {/* Profile Card */}
      <div className="card" style={{ padding: 24, marginBottom: 16, textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16 }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px', fontSize: 24, fontWeight: 800, color: '#fff'
        }}>
          {initials}
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{fullName}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <FaIdCard size={11} />
          {residentId}
        </div>
        <span className="badge b-blue" style={{ fontSize: 10, textTransform: 'uppercase' }}>Verified Resident</span>
      </div>

      {/* Personal Information */}
      <div className="card" style={{ padding: 18, marginBottom: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Personal Information
          </div>
          {!isEditing && (
            <button
              className="btn btn-sm"
              onClick={() => setIsEditing(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '5px 10px' }}
            >
              <FaEdit size={11} /> Edit
            </button>
          )}
        </div>

        {!isEditing ? (
          /* VIEW MODE */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 12px' }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                <FaUser size={10} /> Full Name
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fullName}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                <FaIdCard size={10} /> Resident ID
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{residentId}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                <FaCalendarAlt size={10} /> Birthdate
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{formatDisplayDate(birthdate)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                <FaUser size={10} /> Age
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{age} years old</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                <FaVenusMars size={10} /> Gender
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{gender}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                <FaHeart size={10} /> Civil Status
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{civilStatus}</div>
            </div>
          </div>
        ) : (
          /* EDIT MODE - Personal Information */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="fg">
                <label className="fl" style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>
                  First Name *
                </label>
                <input
                  className="fc"
                  type="text"
                  placeholder="Juan"
                  value={editableProfile.firstName}
                  onChange={handleProfileFieldChange('firstName')}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                />
              </div>
              <div className="fg">
                <label className="fl" style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>
                  Last Name *
                </label>
                <input
                  className="fc"
                  type="text"
                  placeholder="Reyes"
                  value={editableProfile.lastName}
                  onChange={handleProfileFieldChange('lastName')}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="fg">
                <label className="fl" style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>
                  <FaCalendarAlt style={{ marginRight: 4 }} size={11} /> Birthdate *
                </label>
                <input
                  className="fc"
                  type="date"
                  required
                  value={editableProfile.birthdate}
                  onChange={handleProfileFieldChange('birthdate')}
                  max={new Date().toISOString().split('T')[0]}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                />
                {editableProfile.birthdate && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    Age: {calculateDisplayAge(editableProfile.birthdate) || '-'} years old
                  </div>
                )}
              </div>
              <div className="fg">
                <label className="fl" style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>
                  <FaVenusMars style={{ marginRight: 4 }} size={11} /> Gender *
                </label>
                <select
                  className="fc"
                  value={editableProfile.gender}
                  onChange={handleProfileFieldChange('gender')}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="fg">
              <label className="fl" style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>
                <FaHeart style={{ marginRight: 4 }} size={11} /> Civil Status *
              </label>
              <select
                className="fc"
                value={editableProfile.civilStatus}
                onChange={handleProfileFieldChange('civilStatus')}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
              >
                <option value="">Select Civil Status</option>
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Widowed">Widowed</option>
                <option value="Separated">Separated</option>
                <option value="Divorced">Divorced</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Contact & Address */}
      <div className="card" style={{ padding: 18, marginBottom: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Contact & Location
        </div>

        {!isEditing ? (
          /* VIEW MODE */
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 12px' }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <FaPhone size={10} /> Contact
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{contact}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <FaEnvelope size={10} /> Email
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-all' }}>{email}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <FaMapMarkerAlt size={10} /> Purok
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{purok}</div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <FaMapMarkerAlt size={10} /> Address
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{address}</div>
              </div>
            </div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>Emergency Contact</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Name</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{emergencyName}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Number</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{emergencyNumber}</div>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* EDIT MODE - Contact & Address */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="fg">
                <label className="fl" style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>
                  <FaPhone style={{ marginRight: 4 }} size={11} /> Contact Number *
                </label>
                <input
                  className="fc"
                  type="text"
                  placeholder="09171234567"
                  value={editableProfile.contact}
                  onChange={handleProfileFieldChange('contact')}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                />
              </div>
              <div className="fg">
                <label className="fl" style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>
                  <FaEnvelope style={{ marginRight: 4 }} size={11} /> Email Address
                </label>
                <input
                  className="fc"
                  type="email"
                  placeholder="resident@email.com"
                  value={editableProfile.email}
                  onChange={handleProfileFieldChange('email')}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="fg">
                <label className="fl" style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>
                  <FaMapMarkerAlt style={{ marginRight: 4 }} size={11} /> Purok / Zone *
                </label>
                <select
                  className="fc"
                  value={editableProfile.purok}
                  onChange={handleProfileFieldChange('purok')}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                >
                  <option value="">Select Purok</option>
                  <option value="Purok 1">Purok 1</option>
                  <option value="Purok 2">Purok 2</option>
                  <option value="Purok 3">Purok 3</option>
                  <option value="Purok 4">Purok 4</option>
                  <option value="Purok 5">Purok 5</option>
                </select>
              </div>
              <div className="fg">
                <label className="fl" style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>
                  <FaMapMarkerAlt style={{ marginRight: 4 }} size={11} /> Street Address *
                </label>
                <input
                  className="fc"
                  type="text"
                  placeholder="House # / Street Name"
                  value={editableProfile.address}
                  onChange={handleProfileFieldChange('address')}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="fg">
                <label className="fl" style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>
                  Emergency Contact Person
                </label>
                <input
                  className="fc"
                  type="text"
                  placeholder="Full name"
                  value={editableProfile.emergencyContactName}
                  onChange={handleProfileFieldChange('emergencyContactName')}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                />
              </div>
              <div className="fg">
                <label className="fl" style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>
                  Emergency Contact Number
                </label>
                <input
                  className="fc"
                  type="text"
                  placeholder="09123456789"
                  value={editableProfile.emergencyContactNumber}
                  onChange={handleProfileFieldChange('emergencyContactNumber')}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--bg)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}>
              <strong>Important:</strong> Please ensure all information is accurate. Your name, birthdate, and address will be used for official barangay certificates and documents.
            </div>

            {/* Save/Cancel Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className="btn"
                onClick={handleCancelEditProfile}
                disabled={isSaving}
                style={{ padding: '10px', borderRadius: 8, background: 'var(--border)', color: 'var(--text)', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: isSaving ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <FaTimes /> Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleSave}
                disabled={isSaving}
                style={{ padding: '10px', borderRadius: 8, background: 'var(--primary, #3b82f6)', color: '#ffffff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: isSaving ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <FaSave /> {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sync Status */}
      <div className="card" style={{ padding: 14, marginBottom: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FaSync size={14} color="var(--muted)" />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                {isOffline ? 'Offline Mode' : 'Online'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                {lastSync ? `Last synced: ${lastSync.toLocaleTimeString()}` : 'Not yet synced'}
              </div>
            </div>
          </div>
          <span className={`badge ${isOffline ? 'b-amber' : 'b-green'}`} style={{ fontSize: 10 }}>
            {isOffline ? 'Offline' : 'Active'}
          </span>
        </div>
      </div>

      {/* Logout */}
      <button
        className="btn btn-full"
        onClick={handleLogout}
        style={{
          background: 'var(--red-bg, rgba(239,68,68,0.1))',
          color: 'var(--red, #ef4444)',
          border: '1px solid var(--red-border, rgba(239,68,68,0.3))',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <FaSignOutAlt /> Log Out
      </button>
    </div>
  );
}