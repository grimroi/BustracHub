// src/components/BHS/HealthStation.jsx
// Thin tabbed container for the Barangay Health Station module.
// Manages only the activeTab state; all business logic lives in the tabs.
import React, { useState } from 'react';
import HealthRecordsTab from './HealthRecordsTab';
import InventoryTab from './InventoryTab';
import './HealthStation.css';

export default function HealthStation() {
  const [activeTab, setActiveTab] = useState('records'); // 'records' | 'inventory'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}>

      {/* Tabs */}
      <div className="bhs-tabs">
        <button
          type="button"
          className={`bhs-tab ${activeTab === 'records' ? 'bhs-tab--active' : ''}`}
          onClick={() => setActiveTab('records')}
        >
          Health Records
        </button>
        <button
          type="button"
          className={`bhs-tab ${activeTab === 'inventory' ? 'bhs-tab--active' : ''}`}
          onClick={() => setActiveTab('inventory')}
        >
          Inventory
        </button>
      </div>

      {activeTab === 'records' ? <HealthRecordsTab /> : <InventoryTab />}
    </div>
  );
}
