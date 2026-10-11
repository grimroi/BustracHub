import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { localDb as db } from '../services/db';
import { createAuditLog } from '../utils/auditLog';
import logo from '../assets/logo.png';
import './LogIn.css'; // ✅ CRITICAL: Import the CSS to get the exact same styling

export default function ResidentRegister() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    fullName: '',
    purok: '',
    contact: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (icon, title) => {
    Swal.fire({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
      icon,
      title,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const requestId = `REQ-${Date.now()}`;
      const newRequest = {
        _id: requestId,
        type: 'resident_account_request',
        fullName: formData.fullName.trim(),
        purok: formData.purok,
        contact: formData.contact.trim(),
        status: 'Pending Verification',
        requestedAt: new Date().toISOString(),
      };
      await db.put(newRequest);
      await createAuditLog({
        action: 'REQUEST_RESIDENT_ACCOUNT',
        module: 'PUBLIC_PORTAL',
        recordId: requestId,
        details: `New account request from ${formData.fullName} (${formData.purok})`,
      });
      showToast('success', 'Matagumpay na naipadala ang iyong request! Pakipag-ugnayan ang Barangay Hall para sa verification at pagkuha ng iyong credentials.');
      navigate('/');
    } catch (err) {
      console.error('Registration request failed:', err);
      showToast('error', 'Nagkaproblema sa pag-submit. Subukan muli.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page-root">
      {/* LEFT: HERO / BRANDING SECTION (Same as Login for consistency) */}
      <div className="hero-section">
        <div className="hero-glow-top" />
        <div className="hero-glow-bottom" />
        <div className="hero-brand">
          <img src={logo} alt="Barangay Logo" className="brand-logo" />
          <span className="brand-title">Bustrac Hub</span>
        </div>
        <div className="hero-content">
          <div className="hero-tag">Barangay Management Portal</div>
          <h1 className="hero-heading">Streamlined local governance, fully offline-ready.</h1>
          <p className="hero-description">
            Centralized resident profiling, certificate issuance, blotter logging, and aid distribution workspace built for uninterrupted barangay operations.
          </p>
          <div className="hero-features">
            <div>
              <div className="feature-title">Offline Sync</div>
              <div className="feature-sub">PouchDB/CouchDB core</div>
            </div>
            <div>
              <div className="feature-title">Encrypted</div>
              <div className="feature-sub">Local SHA-256 Auth</div>
            </div>
            <div>
              <div className="feature-title">Audit Ready</div>
              <div className="feature-sub">System Activity Logs</div>
            </div>
          </div>
        </div>
        <div className="hero-footer">© 2026 Barangay Bustrac. All rights reserved.</div>
      </div>

      {/* RIGHT: FORM SECTION */}
      <div className="form-section">
        <div className="form-container" style={{ maxWidth: '400px' }}>
          <div className="mobile-brand">
            <img src={logo} alt="Logo" className="brand-logo-sm" />
            <span className="brand-title-sm">Bustrac Hub</span>
          </div>
          
          <div className="form-header" style={{ textAlign: 'center' }}>
            <h2 className="form-title">Request Resident Account</h2>
            <p className="form-sub">
              Fill out this form. The Barangay Admin will verify your identity and generate your login credentials.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="input-group">
              <label className="input-label">Full Name (as per Barangay Record) *</label>
              <input
                className="custom-input"
                required
                placeholder="e.g. Juan Dela Cruz"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              />
            </div>

            <div className="input-group">
              <label className="input-label">Purok / Zone *</label>
              <select
                className="custom-input"
                required
                value={formData.purok}
                onChange={(e) => setFormData({ ...formData, purok: e.target.value })}
                style={{ cursor: 'pointer' }}
              >
                <option value="">Select Purok</option>
                <option value="Purok 1">Purok 1</option>
                <option value="Purok 2">Purok 2</option>
                <option value="Purok 3">Purok 3</option>
                <option value="Purok 4">Purok 4</option>
                <option value="Purok 5">Purok 5</option>
              </select>
            </div>

               <div className="input-group">
  <label className="input-label">Contact Number *</label>
  <input
    type="tel"
    inputMode="numeric"
    className="custom-input"
    required
    placeholder="e.g. 09123456789"
    maxLength={11}
    value={formData.contact}
    onChange={(e) => {
      const cleaned = e.target.value.replace(/\D/g, '').slice(0, 11);
      setFormData({ ...formData, contact: cleaned });
    }}
  />
</div>

            <button type="submit" className="submit-btn" disabled={isSubmitting} style={{ marginTop: '8px' }}>
              {isSubmitting ? (
                <>
                  <span className="spinner" /> Submitting Request...
                </>
              ) : (
                'Submit Account Request'
              )}
            </button>
          </form>

          <div className="form-footer">
            <button type="button" onClick={() => navigate('/')} className="back-btn">
              ← Back to Login
            </button>
            <p className="offline-notice">
              Works seamlessly without internet. Your data saves locally and automatically syncs when online.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}