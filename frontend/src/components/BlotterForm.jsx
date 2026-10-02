import React, { useState } from 'react';
import { localDb as db } from '../services/db';
import { createAuditLog } from '../utils/auditLog';

export default function BlotterForm({ onSuccess, onCancel }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    subject: '',
    incidentDate: new Date().toISOString().split('T')[0],
    location: '',
    respondent: '',
    details: ''
  });

  const updateForm = (field) => (e) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

    const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const newDoc = {
        _id: `blotter_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: 'blotter_report',
        docType: 'blotter',
        subject: formData.subject,
        incidentDate: formData.incidentDate,
        location: formData.location,
        respondent: formData.respondent,
        details: formData.details,
        status: 'Pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        synced: navigator.onLine,
        isSynced: navigator.onLine
      };

      await db.put(newDoc);

      // Optional: Audit Log
      try {
        await createAuditLog({
          action: 'CREATE_BLOTTER_REPORT',
          module: 'BLOTTER',
          recordId: newDoc._id,
          details: `Resident filed new blotter: ${formData.subject}`
        });
      } catch (err) {
        console.warn('Audit log failed:', err);
      }

      const isCurrentlyOffline = !navigator.onLine;

      if (onSuccess) {
        onSuccess(newDoc, isCurrentlyOffline);
      }

      setFormData({
        subject: '',
        incidentDate: new Date().toISOString().split('T')[0],
        location: '',
        respondent: '',
        details: ''
      });

    } catch (error) {
      console.error('Failed to save blotter:', error);
      alert(' Failed to submit report locally. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: 18 }}>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 16px 0', lineHeight: 1.5 }}>
        Report an incident or official concern. Your entry will be securely recorded and reviewed by authorized personnel.
      </p>
      
      <div className="fg" style={{ marginBottom: 12 }}>
        <label className="fl" htmlFor="blotter-subject">Incident Subject / Title *</label>
        <input 
          id="blotter-subject" 
          type="text" 
          className="fc" 
          placeholder="e.g. Property Dispute, Noise Complaint" 
          required 
          value={formData.subject} 
          onChange={updateForm('subject')} 
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
        <div className="fg" style={{ margin: 0 }}>
          <label className="fl" htmlFor="blotter-date">Incident Date</label>
          <input 
            id="blotter-date" 
            type="date" 
            className="fc" 
            value={formData.incidentDate} 
            onChange={updateForm('incidentDate')}
            max={new Date().toISOString().split('T')[0]} // 🔥 Prevents future dates
          />
        </div>
        <div className="fg" style={{ margin: 0 }}>
          <label className="fl" htmlFor="blotter-location">Location / Zone</label>
          <input 
            id="blotter-location" 
            type="text" 
            className="fc" 
            placeholder="e.g. Purok 3" 
            value={formData.location} 
            onChange={updateForm('location')} 
          />
        </div>
      </div>

      <div className="fg" style={{ marginBottom: 12 }}>
        <label className="fl" htmlFor="blotter-respondent">Respondent (if known)</label>
        <input 
          id="blotter-respondent" 
          type="text" 
          className="fc" 
          placeholder="Name of person involved" 
          value={formData.respondent} 
          onChange={updateForm('respondent')} 
        />
      </div>

      <div className="fg" style={{ marginBottom: 6 }}>
        <label className="fl" htmlFor="blotter-details">Incident Details *</label>
        <textarea 
          id="blotter-details" 
          className="fc" 
          rows="4" 
          placeholder="State details, persons involved, or immediate context..." 
          required 
          maxLength={500} 
          value={formData.details} 
          onChange={updateForm('details')} 
          style={{ resize: 'vertical' }} 
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: formData.details.length >= 450 ? 'var(--red, #ef4444)' : 'var(--muted)' }}>
            {formData.details.length}/500
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        {onCancel && (
          <button 
            type="button" 
            className="btn btn-g" 
            onClick={onCancel}
            style={{ flex: 1, padding: '12px', borderRadius: 10, fontWeight: 700 }}
          >
            Cancel
          </button>
        )}
        <button 
          type="submit" 
          className="btn btn-primary" 
          disabled={isSubmitting} 
          style={{ flex: 2, padding: '12px', borderRadius: 10, fontWeight: 700, opacity: isSubmitting ? 0.6 : 1 }}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Incident Report'}
        </button>
      </div>
    </form>
  );
}