import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { localDb as db } from '../services/db';
import logo from '../assets/logo.png';

export default function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    fullName: '',
    email: '',
    contact: '',
    purok: 'Purok 1'
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (!formData.username || !formData.password || !formData.fullName) {
        showToast('error', 'Please fill in all required fields.');
        setIsLoading(false);
        return;
      }

      // SHA-256 hash of the password for standard offline/online authentication
      const encoder = new TextEncoder();
      const data = encoder.encode(formData.password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashedPassword = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const nowIso = new Date().toISOString();
      const cleanUsername = formData.username.trim().toLowerCase();
      const cleanFullName = formData.fullName.trim();

      const newResidentUser = {
        _id: `user_${cleanUsername}`, 
        type: 'user',
        docType: 'user',
        username: cleanUsername,
        passwordHash: hashedPassword,
        role: 'resident',
        fullName: cleanFullName,    
        residentId: `RES-${Date.now().toString().slice(-4)}`,
        email: formData.email.trim(),
        contact: formData.contact.trim(),
        purok: formData.purok,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      // 1. Save to local PouchDB (syncs to CouchDB cloud automatically when online)
      await db.put(newResidentUser);

      // 2. Also save to offline auth storage so the user can log in offline
      const existingOfflineAuth = JSON.parse(localStorage.getItem('bustrac_offline_auth') || '{}');
      existingOfflineAuth[cleanUsername] = {
        username: cleanUsername,
        passwordHash: hashedPassword,
        role: 'resident',
        user: newResidentUser
      };
      localStorage.setItem('bustrac_offline_auth', JSON.stringify(existingOfflineAuth));

     showToast('success', 'Account successfully created! You may now sign in.');
      navigate('/login');
    } catch (err) {
      console.error('Registration error:', err);
     showToast('error', `Registration failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page-root" style={{ display: 'flex', minHeight: '100vh', background: '#0f172a', color: '#f8fafc' }}>
      <div className="form-section" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
        <div className="form-container" style={{ width: '100%', maxWidth: '420px', background: '#1e293b', padding: '32px', borderRadius: '12px', border: '1px solid #334155' }}>

          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <img src={logo} alt="Logo" style={{ height: '48px', marginBottom: '8px' }} />
            <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Create Resident Account</h2>
            <p style={{ fontSize: '13px', color: '#94a3b8' }}>Register your details for Barangay Portal access</p>
          </div>

          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Full Name (e.g. Juan Reyes)</label>
              <input
                className="custom-input"
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                placeholder="Juan Reyes"
                required
                style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Username</label>
              <input
                className="custom-input"
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="juanreyes"
                required
                style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Password</label>
              <input
                className="custom-input"
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                required
                style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Contact Number</label>
                <input
                  className="custom-input"
                  type="text"
                  name="contact"
                  value={formData.contact}
                  onChange={handleChange}
                  placeholder="09171234567"
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Purok / Zone</label>
                <select
                  name="purok"
                  value={formData.purok}
                  onChange={handleChange}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff' }}
                >
                  <option value="Purok 1">Purok 1</option>
                  <option value="Purok 2">Purok 2</option>
                  <option value="Purok 3">Purok 3</option>
                  <option value="Purok 4">Purok 4</option>
                  <option value="Purok 5">Purok 5</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Email Address</label>
              <input
                className="custom-input"
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="juanreyes@gmail.com"
                style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff' }}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '12px',
                marginTop: '10px',
                borderRadius: '6px',
                background: '#3b82f6',
                color: '#fff',
                fontWeight: 'bold',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              {isLoading ? 'Creating Account...' : 'Register Account'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => navigate('/login')}
              style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}
            >
              ← Back to Sign In
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}