import React, { useState } from 'react';
import { localDb as db } from '../services/db'; 

export default function BlotterForm({ onSuccess }) {
  const [complainant, setComplainant] = useState('');
  const [respondent, setRespondent] = useState('');
  const [incidentType, setIncidentType] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!complainant.trim() || !respondent.trim() || !incidentType.trim()) {
      return;
    }

    const doc = {
      _id: `blotter_${Date.now()}`,
      type: 'blotter',
      complainant,
      respondent,
      incidentType,
      createdAt: new Date().toISOString(),
    };

    await db.post(doc);
    if (onSuccess) onSuccess(doc);
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Blotter Form</h2>
      
      <label htmlFor="complainant">Complainant / Nagrereklamo</label>
      <input
        id="complainant"
        type="text"
        placeholder="Complainant"
        value={complainant}
        onChange={(e) => setComplainant(e.target.value)}
      />

      <label htmlFor="respondent">Respondent / Inirereklamo</label>
      <input
        id="respondent"
        type="text"
        placeholder="Respondent"
        value={respondent}
        onChange={(e) => setRespondent(e.target.value)}
      />

      <label htmlFor="incidentType">Incident Type / Uri ng Insidente</label>
      <input
        id="incidentType"
        type="text"
        placeholder="Incident Type"
        value={incidentType}
        onChange={(e) => setIncidentType(e.target.value)}
      />

      <button type="submit">Save / Submit / I-save</button>
    </form>
  );
}