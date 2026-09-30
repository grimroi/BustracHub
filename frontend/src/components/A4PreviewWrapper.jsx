import React from 'react';

const A4PreviewWrapper = ({ children, isPrintMode = false }) => {
  return (
    <div style={{ 
      width: '100%', 
      maxHeight: 'calc(100vh - 160px)', 
      overflowY: 'auto', 
      backgroundColor: '#525659', 
      padding: '24px 0', 
      borderRadius: '8px', 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'flex-start', 
    }}>
      <div style={{ 
        width: '210mm', 
        minHeight: '297mm', 
        backgroundColor: '#ffffff', 
        color: '#000000', 
        boxShadow: isPrintMode ? 'none' : '0 10px 25px rgba(0,0,0,0.5)',
      }}>
        {children}
      </div>
    </div>
  );
};

export default A4PreviewWrapper;