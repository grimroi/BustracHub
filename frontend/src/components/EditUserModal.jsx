// src/components/EditUserModal.jsx
import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { createAuditLog } from '../utils/auditLog';

export const hashPassword = async (password) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export default function EditUserModal({ user, onClose, onSave, db, currentUser }) {
  const [formData, setFormData] = useState({
    fullName: user.fullName || user.name || '',
    role: user.role || 'Resident',
    purok: user.purok || 'Purok 1',
    contact: user.contact || '',
    email: user.email || '',
    status: user.status || 'Active',
    newPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const username = user.username || user.uname || '';
  const userDocId = user._id?.startsWith('user_') ? user._id : `user_${username.toLowerCase()}`;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.fullName.trim()) {
      Swal.fire('Required Field', 'Please enter the user full name.', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      let existingDoc;
      try {
        existingDoc = await db.get(userDocId);
      } catch (notFound) {
        // Fallback search by username if ID differed
        try {
          const findRes = await db.find({
            selector: {
              $or: [{ username }, { uname: username }],
            },
          });
          if (findRes.docs && findRes.docs.length > 0) {
            existingDoc = findRes.docs[0];
          }
        } catch (findErr) {
          // Ignore
        }
      }

      const nowIso = new Date().toISOString();
      const updatedDoc = {
        ...(existingDoc || {}),
        _id: existingDoc?._id || userDocId,
        type: 'user',
        docType: 'user',
        username: username.toLowerCase(),
        fullName: formData.fullName.trim(),
        name: formData.fullName.trim(),
        role: formData.role,
        purok: formData.purok,
        contact: formData.contact.trim(),
        email: formData.email.trim(),
        status: formData.status,
        updatedAt: nowIso,
      };

      // Remove any plain-text password property
      delete updatedDoc.password;

      // Update password hash if a new password was provided
      if (formData.newPassword.trim()) {
        if (formData.newPassword.trim().length < 6) {
          Swal.fire('Password Too Short', 'Password must be at least 6 characters long.', 'warning');
          setIsSaving(false);
          return;
        }
        updatedDoc.passwordHash = await hashPassword(formData.newPassword.trim());
      }

      const saveRes = await db.put(updatedDoc);
      updatedDoc._rev = saveRes.rev;

      // Update offline auth cache
      try {
        const lowerUname = username.toLowerCase();
        const stored = JSON.parse(localStorage.getItem('bustrac_offline_auth') || '{}');
        stored[lowerUname] = {
          username: lowerUname,
          passwordHash: updatedDoc.passwordHash || stored[lowerUname]?.passwordHash,
          role: updatedDoc.role.toLowerCase(),
          user: {
            id: updatedDoc._id,
            username: lowerUname,
            role: updatedDoc.role,
            fullName: updatedDoc.fullName,
            status: updatedDoc.status,
          },
        };
        localStorage.setItem('bustrac_offline_auth', JSON.stringify(stored));
      } catch (storageErr) {
        console.warn('Failed to update offline auth storage:', storageErr);
      }

      // Audit log
      try {
        await createAuditLog({
          action: 'UPDATE_USER',
          module: 'USERS',
          recordId: updatedDoc._id,
          user: currentUser?.username || 'admin',
          details: `Updated user account details for @${username} (Role: ${updatedDoc.role}, Status: ${updatedDoc.status})`,
        });
      } catch (auditErr) {
        console.warn('Audit log error:', auditErr);
      }

      Swal.fire({
        icon: 'success',
        title: 'User Updated',
        text: `Account for ${updatedDoc.fullName} has been updated successfully.`,
        timer: 2000,
        showConfirmButton: false,
      });

      if (typeof onSave === 'function') {
        onSave(updatedDoc);
      }
      onClose();
    } catch (err) {
      console.error('Failed to update user:', err);
      Swal.fire('Error', `Failed to update user: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
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
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Edit User Account</h3>
            <span style={{ fontSize: '12px', color: 'var(--muted, #94a3b8)', fontFamily: 'var(--mono, monospace)' }}>
              @{username}
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

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 600 }}>
              Full Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              className="fc"
              required
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder="e.g. Juan Dela Cruz"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 600 }}>Role</label>
              <select
                className="fc"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="Admin">Admin</option>
                <option value="Staff">Staff</option>
                <option value="Resident">Resident</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 600 }}>Status</label>
              <select
                className="fc"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
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
              <label style={{ fontSize: '12px', fontWeight: 600 }}>Reset Password (Optional)</label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ background: 'none', border: 'none', color: 'var(--primary, #3b82f6)', fontSize: '11px', cursor: 'pointer', padding: 0 }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              className="fc"
              value={formData.newPassword}
              onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
              placeholder="Leave blank to keep existing password..."
            />
            <span style={{ fontSize: '11px', color: 'var(--muted, #94a3b8)', marginTop: '4px', display: 'block' }}>
              Minimum 6 characters. Automatically hashed with SHA-256 upon saving.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button type="button" className="btn btn-g" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-p" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}