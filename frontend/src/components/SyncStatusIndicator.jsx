// src/components/SyncStatusIndicator.jsx
import React, { useState, useEffect } from 'react';
import { localDb } from '../services/db';
import '../styles/SyncStatusIndicator.css';

const SyncStatusIndicator = () => {
  const [statusText, setStatusText] = useState('Checking Connection...');
  const [statusClass, setStatusClass] = useState('sync-checking');

  useEffect(() => {
    let syncHandler;
    try {
      syncHandler = localDb.sync();
      if (syncHandler && typeof syncHandler.on === 'function') {
        syncHandler
          .on('active', () => {
            setStatusText('🔄 Connecting & Syncing changes to Central Cloud...');
            setStatusClass('sync-active');
          })
          .on('change', () => {
            setStatusText('🔄 Connecting & Syncing changes to Central Cloud...');
            setStatusClass('sync-active');
          })
          .on('paused', (err) => {
            if (err) {
              setStatusText('☁️ Working Offline (Saved to Local Device)');
              setStatusClass('sync-offline');
            } else {
              setStatusText('⚡ All changes synced to Cloud');
              setStatusClass('sync-success');
            }
          })
          .on('error', () => {
            setStatusText('☁️ Working Offline (Saved to Local Device)');
            setStatusClass('sync-offline');
          });
      }
    } catch (err) {
      setStatusText('☁️ Working Offline (Saved to Local Device)');
      setStatusClass('sync-offline');
    }

    return () => {
      if (syncHandler && typeof syncHandler.cancel === 'function') {
        syncHandler.cancel();
      }
    };
  }, []);

  return (
    <div className={`sync-status-container ${statusClass}`}>
      <span className="sync-status-text">{statusText}</span>
    </div>
  );
};

export default SyncStatusIndicator;