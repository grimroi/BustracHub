import React from 'react';

/**
 * Reusable A4 Document Preview Wrapper.
 * Renders certificates or documents with a standard PDF viewer background
 * and proportional scaling.
 */
const A4PreviewWrapper = ({ children }) => {
  return (
    <div
      style={{
        width: '100%',
        maxHeight: 'calc(100vh - 160px)',
        overflowY: 'auto',
        backgroundColor: '#525659',
        padding: '24px 0',
        borderRadius: '8px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          width: '210mm',
          minHeight: '297mm',
          backgroundColor: '#ffffff',
          color: '#000000',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          transform: 'scale(0.85)',
          transformOrigin: 'top center',
          marginBottom: '-12%',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default A4PreviewWrapper;