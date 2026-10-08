// src/components/AddUserModal.jsx
import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { createAuditLog } from '../utils/auditLog';
import { hashPassword } from './EditUserModal';

export default function AddUserModal({ isOpen, onClose, onSave, db, currentUser }) {
  const [formData, setFormData] = useState({
    fullName: '',
    username: '',
    role: 'Staff',
    purok: 'Purok 1',
    contact: '',
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleGeneratePassword = () => {
    const randomChars = Math.random().toString(36).slice(-6).toUpperCase();
    const generated = `Bustrac${randomChars}!`;
    setFormData((prev) => ({ ...prev, password: generated }));
    setShowPassword(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanFullName = formData.fullName.trim();
    const cleanUsername = formData.username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    const cleanPassword = formData.password.trim();

    if (!cleanFullName) {
      Swal.fire('Required Field', 'Please enter the user full name.', 'warning');
      return;
    }
    if (!cleanUsername || cleanUsername.length < 3) {
      Swal.fire('Invalid Username', 'Username must be at least 3 characters long and contain only letters, numbers, dots, or underscores.', 'warning');
      return;
    }
    if (!cleanPassword || cleanPassword.length < 6) {
      Swal.fire('Password Too Short', 'Password must be at least 6 characters long.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const userDocId = `user_${cleanUsername}`;
      // Check if user already exists
      try {
        const existing = await db.get(userDocId);
        if (existing) {
          Swal.fire('Username Taken', `Ang username na "${cleanUsername}" ay ginagamit na. Pumili ng ibang username.`, 'error');
          setIsSubmitting(false);
          return;
        }
      } catch (notFound) {
        // Doc doesn't exist, proceed
      }

      const passwordHash = await hashPassword(cleanPassword);
      const nowIso = new Date().toISOString();

      const newUserDoc = {
        _id: userDocId,
        type: 'user',
        docType: 'user',
        username: cleanUsername,
        passwordHash,
        role: formData.role,
        fullName: cleanFullName,
        name: cleanFullName,
        purok: formData.purok,
        contact: formData.contact.trim(),
        email: formData.email.trim(),
        status: 'Active',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await db.put(newUserDoc);

      // Offline auth cache
      try {
        const stored = JSON.parse(localStorage.getItem('bustrac_offline_auth') || '{}');
        stored[cleanUsername] = {
          username: cleanUsername,
          passwordHash,
          role: formData.role.toLowerCase(),
          user: {
            id: userDocId,
            username: cleanUsername,
            role: formData.role,
            fullName: cleanFullName,
            status: 'Active',
          },
        };
        localStorage.setItem('bustrac_offline_auth', JSON.stringify(stored));
      } catch (storageErr) {
        console.warn('Failed to update offline auth cache:', storageErr);
      }

      // Audit log
      try {
        await createAuditLog({
          action: 'CREATE_USER',
          module: 'USERS',
          recordId: userDocId,
          user: currentUser?.username || 'admin',
          details: `Created new user account @${cleanUsername} (${formData.role}, ${formData.purok})`,
        });
      } catch (auditErr) {
        console.warn('Audit log error:', auditErr);
      }

      await Swal.fire({
        icon: 'success',
        title: 'Account Created Successfully!',
        html: `
          <div style="text-align: left; background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; color: #0f172a;">
            <p style="margin: 0 0 10px 0; color: #64748b;">Narito ang credentials para sa bagong account:</p>
            <div style="margin-bottom: 8px;">
              <span style="font-size: 11px; color: #64748b;">Full Name:</span><br/>
              <strong>${cleanFullName}</strong>
            </div>
            <div style="margin-bottom: 8px;">
              <span style="font-size: 11px; color: #64748b;">Username:</span><br/>
              <code style="background: #e2e8f0; padding: 4px 8px; border-radius: 4px; font-weight: 600;">${cleanUsername}</code>
            </div>
            <div>
              <span style="font-size: 11px; color: #64748b;">Password:</span><br/>
              <code style="background: #e2e8f0; padding: 4px 8px; border-radius: 4px; font-weight: 600;">${cleanPassword}</code>
            </div>
          </div>
        `,
        confirmButtonText: 'Done',
        confirmButtonColor: '#3b82f6',
      });

      if (typeof onSave === 'function') {
        onSave(newUserDoc);
      }
      onClose();
    } catch (err) {
      console.error('Failed to create user:', err);
      Swal.fire('Error', `Failed to create user: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface, #1e293b)',
          border: '1px solid var(--border, #334155)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '520px',
          padding: '24px',
          color: 'var(--text, #f8fafc)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Add New User Account</h3>
            <span style={{ fontSize: '12px', color: 'var(--muted, #94a3b8)' }}>
              Create an administrative, staff, or resident portal account
            </span>
          </div>
          <button
            onClick={onClose}
            className="btn btn-g btn-sm"
            style={{ borderRadius: '50%', width: '32px', height: '32px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 600 }}>
              Full Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              className="fc"
              required
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder="e.g. Maria Clara De Los Santos"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 600 }}>
                Username <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                className="fc"
                required
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="e.g. mclara"
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 600 }}>Role</label>
              <select
                className="fc"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="Staff">Staff / Secretary</option>
                <option value="Admin">Admin</option>
                <option value="Resident">Resident</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 600 }}>Purok / Zone</label>
              <select
                className="fc"
                value={formData.purok}
                onChange={(e) => setFormData({ ...formData, purok: e.target.value })}
              >
                <option value="Purok 1">Purok 1</option>
                <option value="Purok 2">Purok 2</option>
                <option value="Purok 3">Purok 3</option>
                <option value="Purok 4">Purok 4</option>
                <option value="Purok 5">Purok 5</option>
                <option value="Purok 6">Purok 6</option>
                <option value="Purok 7">Purok 7</option>
                <option value="N/A">N/A</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 600 }}>Contact No.</label>
              <input
                className="fc"
                placeholder="09123456789"
                value={formData.contact}
                onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 600 }}>Email Address</label>
            <input
              type="email"
              className="fc"
              placeholder="user@bustrac.gov.ph"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div style={{ background: 'var(--surface2, #0f172a)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border, #334155)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600 }}>
                Initial Password <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  style={{ background: 'none', border: 'none', color: '#10b981', fontSize: '11px', cursor: 'pointer', padding: 0, fontWeight: 600 }}
                >
                  ⚡ Generate Secure
                </button>
                <span style={{ color: 'var(--border)' }}>|</span>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ background: 'none', border: 'none', color: 'var(--primary, #3b82f6)', fontSize: '11px', cursor: 'pointer', padding: 0 }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              className="fc"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Enter initial password (min 6 characters)..."
            />
            <span style={{ fontSize: '11px', color: 'var(--muted, #94a3b8)', marginTop: '4px', display: 'block' }}>
              Minimum 6 characters. Will be encrypted with SHA-256 before saving to database.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button type="button" className="btn btn-g" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-p" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
